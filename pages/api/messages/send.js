// POST /api/messages/send
// Saves a new message (text and/or file info) to a chat. The client then
// sees it appear instantly via Supabase Realtime (it's listening for new
// rows on the messages table).
import { getUserIdFromRequest } from "../../../lib/session";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const userId = getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({ error: "Please log in first." });
  }

  const {
    chatToken,
    message,
    fileUrl,
    fileName,
    fileType,
    fileSize,
  } = req.body || {};

  if (!chatToken) {
    return res.status(400).json({ error: "Missing chat." });
  }

  const hasText = message && String(message).trim().length > 0;
  const hasFile = Boolean(fileUrl);

  if (!hasText && !hasFile) {
    return res.status(400).json({ error: "Message can't be empty." });
  }

  // Look up the chat by its token.
  const { data: chat } = await supabaseAdmin
    .from("chats")
    .select("id")
    .eq("chat_token", chatToken)
    .maybeSingle();

  if (!chat) {
    return res.status(404).json({ error: "Chat not found." });
  }

  // Security check: make sure this user is actually a member of the chat
  // before letting them post into it.
  const { data: membership } = await supabaseAdmin
    .from("chat_members")
    .select("id")
    .eq("chat_id", chat.id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!membership) {
    return res.status(403).json({ error: "You are not part of this chat." });
  }

  const { data: newMessage, error } = await supabaseAdmin
    .from("messages")
    .insert({
      chat_id: chat.id,
      sender_id: userId,
      message: hasText ? String(message).trim() : null,
      file_url: fileUrl || null,
      file_name: fileName || null,
      file_type: fileType || null,
      file_size: fileSize || null,
    })
    .select()
    .single();

  if (error) {
    console.error("Send message error:", error);
    return res.status(500).json({ error: "Could not send message." });
  }

  // Keep the chat's "last activity" fresh for the dashboard / admin panel.
  await supabaseAdmin
    .from("chats")
    .update({ last_activity: new Date().toISOString() })
    .eq("id", chat.id);

  return res.status(200).json({ message: newMessage });
}
