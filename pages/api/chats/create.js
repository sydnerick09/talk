
// POST /api/chats/create
// Creates a new chat with a secure random link and makes the creator its
// first member.

import { getUserIdFromRequest } from "../../../lib/session";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { generateChatToken } from "../../../lib/generateToken";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  const userId = getUserIdFromRequest(req);

  if (!userId) {
    return res.status(401).json({
      error: "Please log in first.",
    });
  }

  // Generate a token and make sure it isn't already used.
  let chatToken;

  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateChatToken(12);

    const { data: existing, error: checkError } = await supabaseAdmin
      .from("chats")
      .select("id")
      .eq("chat_token", candidate)
      .maybeSingle();

    if (checkError) {
      console.error("Chat token check error:", checkError);

      return res.status(500).json({
        error: "Could not check chat link. Try again.",
      });
    }

    if (!existing) {
      chatToken = candidate;
      break;
    }
  }

  if (!chatToken) {
    return res.status(500).json({
      error: "Could not generate a chat link. Try again.",
    });
  }

  // Create the chat using the basic columns.
  const { data: chat, error } = await supabaseAdmin
    .from("chats")
    .insert({
      chat_token: chatToken,
      created_by: userId,
    })
    .select("id, chat_token")
    .single();

  if (error) {
    console.error("Create chat error:", error);

    return res.status(500).json({
      error: "Could not create chat.",
    });
  }

  // The creator automatically becomes a member of their own chat.
  const { error: memberError } = await supabaseAdmin
    .from("chat_members")
    .insert({
      chat_id: chat.id,
      user_id: userId,
    });

  if (memberError) {
    console.error("Add chat member error:", memberError);

    return res.status(500).json({
      error: "Chat was created, but the member could not be added.",
    });
  }

  return res.status(200).json({
    chatToken: chat.chat_token,
  });
}

