// GET /api/admin/data
// Returns the admin dashboard data without relying on Supabase's nested
// relationship syntax. This keeps the panel working even when an existing
// database has differently named foreign-key constraints.
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

  // Load the base tables independently. The service-role client is used here,
  // so the admin panel can always see the complete conversation history.
  const [usersResult, chatsResult, membersResult] = await Promise.all([
    supabaseAdmin
      .from("users")
      .select("id, name, username, created_at, last_active")
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("chats")
      .select("id, chat_token, created_at, last_activity, created_by")
      .order("last_activity", { ascending: false }),
    supabaseAdmin
      .from("chat_members")
      .select("chat_id, user_id"),
  ]);

  // Supabase projects commonly cap a single REST response at 1,000 rows.
  // Fetch message pages so older client messages are not silently hidden
  // from the administrator.
  const allMessages = [];
  const MESSAGE_PAGE_SIZE = 1000;
  let messageFrom = 0;

  while (true) {
    const { data: page, error: pageError } = await supabaseAdmin
      .from("messages")
      .select(
        "id, chat_id, sender_id, message, file_name, file_type, file_size, file_url, created_at"
      )
      .order("created_at", { ascending: false })
      .range(messageFrom, messageFrom + MESSAGE_PAGE_SIZE - 1);

    if (pageError) {
      console.error("Admin messages error:", pageError);
      return res.status(500).json({
        error: "Could not load admin messages.",
        detail:
          process.env.NODE_ENV === "development"
            ? pageError.message
            : undefined,
      });
    }

    allMessages.push(...(page || []));

    if (!page || page.length < MESSAGE_PAGE_SIZE) {
      break;
    }

    messageFrom += MESSAGE_PAGE_SIZE;
  }

  const messagesResult = { data: allMessages, error: null };

  const firstError =
    usersResult.error ||
    chatsResult.error ||
    membersResult.error ||
    messagesResult.error;

  if (firstError) {
    console.error("Admin data error:", firstError);
    return res.status(500).json({
      error: "Could not load admin data.",
      detail: process.env.NODE_ENV === "development" ? firstError.message : undefined,
    });
  }

  const users = usersResult.data || [];
  const chats = chatsResult.data || [];
  const members = membersResult.data || [];
  const messages = messagesResult.data || [];

  const usersById = new Map(users.map((user) => [user.id, user]));
  const chatsById = new Map(chats.map((chat) => [chat.id, chat]));

  const participantsByChat = new Map();
  for (const member of members) {
    const user = usersById.get(member.user_id);
    if (!user) continue;

    const list = participantsByChat.get(member.chat_id) || [];
    list.push({
      id: user.id,
      name: user.name,
      username: user.username,
    });
    participantsByChat.set(member.chat_id, list);
  }

  const shapedUsers = search
    ? users.filter(
        (user) =>
          String(user.name || "").toLowerCase().includes(search) ||
          String(user.username || "").toLowerCase().includes(search)
      )
    : users;

  const shapedChats = chats
    .map((chat) => ({
      id: chat.id,
      chatToken: chat.chat_token,
      createdAt: chat.created_at,
      lastActivity: chat.last_activity,
      participants: participantsByChat.get(chat.id) || [],
    }))
    .filter((chat) => {
      if (!search) return true;

      return (
        String(chat.chatToken || "").toLowerCase().includes(search) ||
        chat.participants.some(
          (participant) =>
            String(participant.name || "").toLowerCase().includes(search) ||
            String(participant.username || "").toLowerCase().includes(search)
        )
      );
    });

  // Keep the complete message history available to the admin UI.
  // The search box filters registered clients and conversation rows, but it
  // must not remove older messages from an opened conversation.
  const shapedMessages = messages.map((message) => {
    const sender = usersById.get(message.sender_id);
    const chat = chatsById.get(message.chat_id);

    return {
      id: message.id,
      chatId: message.chat_id,
      message: message.message,
      fileName: message.file_name,
      fileType: message.file_type,
      fileSize: message.file_size,
      fileUrl: message.file_url,
      createdAt: message.created_at,
      chatToken: chat?.chat_token || "Unknown chat",
      senderName: sender?.name || "Unknown user",
      senderUsername: sender?.username || "unknown",
    };
  });

  return res.status(200).json({
    users: shapedUsers,
    chats: shapedChats,
    messages: shapedMessages,
  });
}
