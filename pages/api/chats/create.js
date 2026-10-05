// POST /api/chats/create
// Creates a new shared chat link and makes the creator its first member.

import { getUserIdFromRequest } from "../../../lib/session";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { generateChatToken } from "../../../lib/generateToken";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const userId = getUserIdFromRequest(req);

  if (!userId) {
    return res.status(401).json({ error: "Please log in first." });
  }

  let chat = null;
  let lastError = null;

  // Generate and insert the token atomically. The old code checked first and
  // inserted later, which still allowed a rare duplicate-token race.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const chatToken = generateChatToken(12);

    const { data, error } = await supabaseAdmin
      .from("chats")
      .insert({
        chat_token: chatToken,
        shared_token: chatToken,
        is_inbox: true,
        created_by: userId,
      })
      .select("id, chat_token")
      .single();

    if (!error) {
      chat = data;
      break;
    }

    lastError = error;

    // A unique-token collision is safe to retry with another token.
    if (error.code !== "23505") {
      break;
    }
  }

  if (!chat) {
    console.error("Create chat error:", lastError);
    return res.status(500).json({
      error: "Could not create chat. Please try again.",
    });
  }

  // The creator automatically becomes a member of their own shared inbox.
  const { error: memberError } = await supabaseAdmin
    .from("chat_members")
    .insert({
      chat_id: chat.id,
      user_id: userId,
    });

  if (memberError) {
    console.error("Add chat member error:", memberError);

    // Do not leave an unusable chat behind if membership creation fails.
    await supabaseAdmin.from("chats").delete().eq("id", chat.id);

    return res.status(500).json({
      error: "Chat could not be completed. Please try again.",
    });
  }

  return res.status(200).json({
    chatToken: chat.chat_token,
  });
}
