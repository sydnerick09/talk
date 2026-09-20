// A shared link is an inbox link. Each visitor gets a separate private
// conversation with the link owner, while the owner sees a private chat list.
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import { ArrowLeft, Send, Paperclip, Image as ImageIcon, X, MessageCircle } from "lucide-react";
import { getUserIdFromRequest } from "../../lib/session";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { supabase } from "../../lib/supabaseClient";
import MessageBubble from "../../components/MessageBubble";
import { MAX_FILE_SIZE_BYTES, isAllowedFileType, formatFileSize } from "../../lib/fileValidation";
import { generateChatToken } from "../../lib/generateToken";

async function makePrivateChat(sharedToken, ownerId, visitorId) {
  const { data: existingMemberships } = await supabaseAdmin
    .from("chat_members")
    .select("chat_id, chats!inner(id, chat_token, shared_token, is_inbox)")
    .eq("user_id", visitorId)
    .eq("chats.shared_token", sharedToken)
    .eq("chats.is_inbox", false);

  const existing = (existingMemberships || []).find((row) => row.chats);
  if (existing) return existing.chats;

  let chatToken = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateChatToken(12);
    const { data: taken } = await supabaseAdmin
      .from("chats")
      .select("id")
      .eq("chat_token", candidate)
      .maybeSingle();
    if (!taken) {
      chatToken = candidate;
      break;
    }
  }

  if (!chatToken) throw new Error("Could not create private conversation.");

  const { data: privateChat, error: chatError } = await supabaseAdmin
    .from("chats")
    .insert({
      chat_token: chatToken,
      shared_token: sharedToken,
      is_inbox: false,
      created_by: ownerId,
    })
    .select("id, chat_token, shared_token, is_inbox")
    .single();

  if (chatError) throw chatError;

  const { error: memberError } = await supabaseAdmin
    .from("chat_members")
    .insert([
      { chat_id: privateChat.id, user_id: ownerId },
      { chat_id: privateChat.id, user_id: visitorId },
    ]);

  if (memberError) throw memberError;
  return privateChat;
}

export async function getServerSideProps({ req, params, query }) {
  const userId = getUserIdFromRequest(req);
  if (!userId) {
    return {
      redirect: {
        destination: `/?returnTo=/chat/${params.token}`,
        permanent: false,
      },
    };
  }

  const { data: me } = await supabaseAdmin
    .from("users")
    .select("id, name, username")
    .eq("id", userId)
    .maybeSingle();

  if (!me) return { redirect: { destination: "/", permanent: false } };

  const { data: inbox } = await supabaseAdmin
    .from("chats")
    .select("id, chat_token, shared_token, created_by, is_inbox")
    .eq("chat_token", params.token)
    .eq("is_inbox", true)
    .maybeSingle();

  if (!inbox) return { notFound: true };

  // The owner opening the shared link sees separate private conversations.
  if (inbox.created_by === userId && !query.conversation) {
    const { data: privateChats } = await supabaseAdmin
      .from("chats")
      .select(
        "id, chat_token, created_at, last_activity, chat_members(user_id, users(id, name, username))"
      )
      .eq("shared_token", params.token)
      .eq("is_inbox", false)
      .order("last_activity", { ascending: false });

    const conversations = (privateChats || []).map((chat) => ({
      id: chat.id,
      chatToken: chat.chat_token,
      createdAt: chat.created_at,
      lastActivity: chat.last_activity,
      other: (chat.chat_members || [])
        .map((m) => m.users)
        .find((u) => u && u.id !== userId) || null,
    }));

    return {
      props: {
        me,
        mode: "inbox",
        sharedToken: inbox.chat_token,
        conversations,
      },
    };
  }

  let chat = null;

  if (query.conversation) {
    const { data: requested } = await supabaseAdmin
      .from("chats")
      .select("id, chat_token, shared_token, created_by, is_inbox")
      .eq("chat_token", String(query.conversation))
      .eq("shared_token", params.token)
      .eq("is_inbox", false)
      .maybeSingle();

    if (!requested) return { notFound: true };

    const { data: membership } = await supabaseAdmin
      .from("chat_members")
      .select("id")
      .eq("chat_id", requested.id)
      .eq("user_id", userId)
      .maybeSingle();

    if (!membership) return { notFound: true };
    chat = requested;
  } else {
    // A visitor gets exactly one private conversation for this shared link.
    if (inbox.created_by === userId) {
      return { notFound: true };
    }
    chat = await makePrivateChat(params.token, inbox.created_by, userId);
  }

  const { data: memberRows } = await supabaseAdmin
    .from("chat_members")
    .select("users(id, name, username)")
    .eq("chat_id", chat.id);

  const participants = (memberRows || []).map((r) => r.users).filter(Boolean);

  const { data: messages } = await supabaseAdmin
    .from("messages")
    .select("*")
    .eq("chat_id", chat.id)
    .order("created_at", { ascending: true })
    .limit(200);

  return {
    props: {
      me,
      mode: "conversation",
      sharedToken: params.token,
      chatToken: chat.chat_token,
      chatId: chat.id,
      participants,
      initialMessages: messages || [],
    },
  };
}

export default function ChatConversationPage(props) {
  if (props.mode === "inbox") return <SharedInbox {...props} />;
  return <PrivateConversation {...props} />;
}

function SharedInbox({ me, sharedToken, conversations }) {
  const router = useRouter();

  return (
    <div className="chat-page">
      <div className="chat-header">
        <button className="btn-icon" onClick={() => router.push("/chat")} title="Back">
          <ArrowLeft size={20} />
        </button>
        <div className="avatar"><MessageCircle size={18} /></div>
        <div className="chat-header-info">
          <div className="title">Your Shared Inbox</div>
          <div className="presence-status offline">Private conversations</div>
        </div>
      </div>

      <div className="messages-area shared-inbox-list">
        {conversations.length === 0 ? (
          <div className="empty-state">
            <p>No one has messaged you through this link yet.</p>
          </div>
        ) : (
          conversations.map((conversation) => (
            <button
              key={conversation.id}
              className="shared-conversation-item"
              onClick={() =>
                router.push(`/chat/${sharedToken}?conversation=${conversation.chatToken}`)
              }
            >
              <div className="avatar">
                {(conversation.other?.name || "?").charAt(0).toUpperCase()}
              </div>
              <div className="info">
                <div className="title">{conversation.other?.name || "Private chat"}</div>
                <div className="meta">
                  @{conversation.other?.username || "user"}
                  {conversation.lastActivity
                    ? ` • ${new Date(conversation.lastActivity).toLocaleString()}`
                    : ""}
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function PrivateConversation({ me, chatToken, chatId, participants, initialMessages }) {
  const router = useRouter();
  const [messages, setMessages] = useState(initialMessages);
  const [text, setText] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [onlineUsers, setOnlineUsers] = useState({});
  const [typingUserIds, setTypingUserIds] = useState({});
  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimerRef = useRef(null);
  const presenceChannelRef = useRef(null);
  const composerInputRef = useRef(null);

  const otherParticipants = participants.filter((p) => p.id !== me.id);
  const otherPerson = otherParticipants[0];
  const headerName = otherPerson?.name || "Chat";
  const otherOnline = otherPerson ? Boolean(onlineUsers[otherPerson.id]) : false;
  const typingNames = otherParticipants.filter((p) => typingUserIds[p.id]).map((p) => p.name).join(", ");

  useEffect(() => {
    const channel = supabase
      .channel(`chat-${chatId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `chat_id=eq.${chatId}`,
        },
        (payload) => {
          setMessages((prev) =>
            prev.some((m) => m.id === payload.new.id) ? prev : [...prev, payload.new]
          );
        }
      )
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        setOnlineUsers(
          Object.keys(state).reduce((online, userId) => {
            online[userId] = true;
            return online;
          }, {})
        );
      })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (!payload || payload.user_id === me.id) return;
        setTypingUserIds((prev) => ({ ...prev, [payload.user_id]: Boolean(payload.typing) }));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") await channel.track({ user_id: me.id });
      });

    presenceChannelRef.current = channel;
    return () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      supabase.removeChannel(channel);
      presenceChannelRef.current = null;
    };
  }, [chatId, me.id]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  function getSenderName(senderId) {
    if (senderId === me.id) return me.name;
    return participants.find((p) => p.id === senderId)?.name || "Someone";
  }

  function broadcastTyping(typing) {
    const channel = presenceChannelRef.current;
    if (!channel) return;
    channel.send({ type: "broadcast", event: "typing", payload: { user_id: me.id, typing } });
  }

  function handleTextChange(e) {
    const value = e.target.value;
    setText(value);
    if (!value.trim()) {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      broadcastTyping(false);
      return;
    }
    broadcastTyping(true);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => broadcastTyping(false), 1200);
  }

  const emojis = [
    "😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "😇", "🙂", "🙃",
    "😉", "😌", "😍", "🥰", "😘", "😗", "😎", "🤩", "🤔", "😐", "😴", "😭",
    "😡", "😱", "👍", "👎", "👏", "🙏", "❤️", "🔥", "🎉", "💯", "🙌", "💔", "✨", "✅", "❌",
  ];

  function addEmoji(emoji) {
    setText((current) => `${current}${emoji}`);
    setShowEmojiPicker(false);
    requestAnimationFrame(() => composerInputRef.current?.focus());
  }

  function handleFileChoose(e) {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    if (!isAllowedFileType(file.type)) return setError("That file type isn't supported.");
    if (file.size > MAX_FILE_SIZE_BYTES) return setError("File must be 5 MB or smaller.");
    setPendingFile({ file, previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null });
  }

  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function handleSend() {
    if (sending || (!text.trim() && !pendingFile)) return;
    setSending(true);
    setError("");
    try {
      let filePayload = {};
      if (pendingFile) {
        const base64 = await readFileAsBase64(pendingFile.file);
        const uploadRes = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chatToken,
            fileName: pendingFile.file.name,
            fileType: pendingFile.file.type,
            fileBase64: base64,
          }),
        });
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok) return setError(uploadData.error || "Upload failed.");
        filePayload = uploadData;
      }

      const res = await fetch("/api/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatToken, message: text.trim(), ...filePayload }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error || "Could not send message.");

      setMessages((prev) => (prev.some((m) => m.id === data.message.id) ? prev : [...prev, data.message]));
      broadcastTyping(false);
      setText("");
      setPendingFile(null);
    } catch (err) {
      setError("Something went wrong.");
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      broadcastTyping(false);
      handleSend();
    }
  }

  return (
    <div className="chat-page">
      <div className="chat-header">
        <button className="btn-icon" onClick={() => router.push(`/chat/${router.query.token}`)} title="Back">
          <ArrowLeft size={20} />
        </button>
        <div className="avatar">{headerName.charAt(0).toUpperCase()}</div>
        <div className="chat-header-info">
          <div className="title">{headerName}</div>
          <div className={`presence-status ${otherOnline ? "online" : "offline"}`}>
            {otherOnline ? "Online" : "Offline"}
          </div>
          {typingNames && <div className="typing-status">{typingNames} is typing...</div>}
        </div>
      </div>

      <div className="messages-area" ref={scrollRef}>
        {messages.length === 0 && <div className="empty-state"><p>No messages yet. Say hello 👋</p></div>}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} isMe={m.sender_id === me.id} senderName={getSenderName(m.sender_id)} />
        ))}
      </div>

      {pendingFile && (
        <div className="upload-preview">
          {pendingFile.previewUrl ? <ImageIcon size={16} color="#16a34a" /> : <Paperclip size={16} color="#16a34a" />}
          <span>{pendingFile.file.name} ({formatFileSize(pendingFile.file.size)})</span>
          <button className="btn-icon" onClick={() => setPendingFile(null)} title="Remove file"><X size={16} /></button>
        </div>
      )}

      {error && <p className="error-text" style={{ padding: "0 12px" }}>{error}</p>}

      {showEmojiPicker && (
        <div className="emoji-picker">
          {emojis.map((emoji, index) => (
            <button key={`${emoji}-${index}`} type="button" className="emoji-btn" onMouseDown={(e) => e.preventDefault()} onClick={() => addEmoji(emoji)} aria-label={`Insert ${emoji}`}>
              {emoji}
            </button>
          ))}
        </div>
      )}

      <div className="composer">
        <input type="file" ref={fileInputRef} style={{ display: "none" }} onChange={handleFileChoose} accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,.xls,.xlsx,.txt" />
        <button className="btn-icon emoji-toggle" type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setShowEmojiPicker((open) => !open)} title="Emoji" aria-label="Emoji">😊</button>
        <button className="btn-icon" type="button" onClick={() => fileInputRef.current?.click()} title="Attach a file"><Paperclip size={20} /></button>
        <input ref={composerInputRef} type="text" placeholder="Type a message..." value={text} onChange={handleTextChange} onBlur={() => broadcastTyping(false)} onKeyDown={handleKeyDown} />
        <button className="send-btn" onClick={handleSend} disabled={sending || (!text.trim() && !pendingFile)} title="Send"><Send size={18} /></button>
      </div>
    </div>
  );
}
