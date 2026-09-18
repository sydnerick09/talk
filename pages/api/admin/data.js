// GET /api/admin/data
// Returns everything the admin dashboard needs: users, chats (with
// participants), and messages. Supports a simple ?search= query that
// filters users and chats by name/username.
//
// Passwords / password hashes are NEVER included in this response.
import { isAdminRequest } from "../../../lib/adminSession";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!isAdminRequest(req)) {
    return res.status(401).json({ error: "Admin login required." });
  }

  const search = (req.query.search || "").toString().trim().toLowerCase();

  // --- Users (never select password_hash) ---
  let usersQuery = supabaseAdmin
    .from("users")
    .select("id, name, username, created_at, last_active")
    .order("created_at", { ascending: false });

  if (search) {
    usersQuery = usersQuery.or(
      `name.ilike.%${search}%,username.ilike.%${search}%`
    );
  }

  const { data: users, error: usersError } = await usersQuery;

  // --- Chats + their members' names/usernames ---
  const { data: chats, error: chatsError } = await supabaseAdmin
    .from("chats")
    .select(
      "id, chat_token, created_at, last_activity, chat_members(user_id, users(name, username))"
    )
    .order("created_at", { ascending: false });

  // --- Messages, with sender name and which chat they belong to ---
  const { data: messages, error: messagesError } = await supabaseAdmin
    .from("messages")
    .select(
      "id, message, file_name, file_type, file_size, file_url, created_at, chat_id, chats(chat_token), users!messages_sender_id_fkey(name, username)"
    )
    .order("created_at", { ascending: false })
    .limit(500);

  if (usersError || chatsError || messagesError) {
    console.error(usersError || chatsError || messagesError);
    return res.status(500).json({ error: "Could not load admin data." });
  }

  // Reshape chats to a simpler participants list for the frontend.
  const shapedChats = (chats || []).map((c) => ({
    id: c.id,
    chatToken: c.chat_token,
    createdAt: c.created_at,
    lastActivity: c.last_activity,
    participants: (c.chat_members || []).map((m) => m.users?.name).filter(Boolean),
  }));

  let filteredChats = shapedChats;
  if (search) {
    filteredChats = shapedChats.filter(
      (c) =>
        c.chatToken.toLowerCase().includes(search) ||
        c.participants.some((p) => p.toLowerCase().includes(search))
    );
  }

  const shapedMessages = (messages || []).map((m) => ({
    id: m.id,
    message: m.message,
    fileName: m.file_name,
    fileType: m.file_type,
    fileSize: m.file_size,
    fileUrl: m.file_url,
    createdAt: m.created_at,
    chatToken: m.chats?.chat_token,
    senderName: m.users?.name,
    senderUsername: m.users?.username,
  }));

  return res.status(200).json({
    users: users || [],
    chats: filteredChats,
    messages: shapedMessages,
  });
}
