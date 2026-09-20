// "/chat/[token]" — a single conversation. Whoever opens this link while
// logged in automatically becomes a member of the chat (that's how sharing
// the link works — see README "How chat links work").
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import {
  ArrowLeft,
  Send,
  Paperclip,
  Image as ImageIcon,
  X,
} from "lucide-react";
import { getUserIdFromRequest } from "../../lib/session";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { supabase } from "../../lib/supabaseClient";
import MessageBubble from "../../components/MessageBubble";
import {
  MAX_FILE_SIZE_BYTES,
  isAllowedFileType,
  formatFileSize,
} from "../../lib/fileValidation";

export async function getServerSideProps({ req, params }) {
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

  if (!me) {
    return { redirect: { destination: "/", permanent: false } };
  }

  const { data: chat } = await supabaseAdmin
    .from("chats")
    .select("id, chat_token")
    .eq("chat_token", params.token)
    .maybeSingle();

  if (!chat) {
    return { notFound: true };
  }

  // Auto-join: if this is the first time this user opens the link, add
  // them as a member. (See "5. Joining a Chat" in the project spec.)
  const { data: existingMembership } = await supabaseAdmin
    .from("chat_members")
    .select("id")
    .eq("chat_id", chat.id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!existingMembership) {
    await supabaseAdmin
      .from("chat_members")
      .insert({ chat_id: chat.id, user_id: userId });
  }

  // Get all participants (for the header) and recent messages.
  const { data: memberRows } = await supabaseAdmin
    .from("chat_members")
    .select("users(id, name)")
    .eq("chat_id", chat.id);

  const participants = (memberRows || [])
    .map((r) => r.users)
    .filter(Boolean);

  const { data: messages } = await supabaseAdmin
    .from("messages")
    .select("*")
    .eq("chat_id", chat.id)
    .order("created_at", { ascending: true })
    .limit(200);

  return {
    props: {
      me,
      chatToken: chat.chat_token,
      chatId: chat.id,
      participants,
      initialMessages: messages || [],
    },
  };
}

export default function ChatConversationPage({
  me,
  chatToken,
  chatId,
  participants,
  initialMessages,
}) {
  const router = useRouter();
  const [messages, setMessages] = useState(initialMessages);
  const [text, setText] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [pendingFile, setPendingFile] = useState(null); // { file, previewUrl }
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
  const headerName =
    otherParticipants.map((p) => p.name).join(", ") || "Chat";
  const typingNames = otherParticipants
    .filter((p) => typingUserIds[p.id])
    .map((p) => p.name)
    .join(", ");
  const otherOnline = otherParticipants.some((p) => onlineUsers[p.id]);

  // --- Realtime: messages, online/offline status, and typing ---
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
          setMessages((prev) => {
            if (prev.some((m) => m.id === payload.new.id)) return prev;
            return [...prev, payload.new];
          });
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

        setTypingUserIds((prev) => ({
          ...prev,
          [payload.user_id]: Boolean(payload.typing),
        }));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ user_id: me.id });
        }
      });

    presenceChannelRef.current = channel;

    return () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      supabase.removeChannel(channel);
      presenceChannelRef.current = null;
    };
  }, [chatId, me.id]);

  // --- Auto-scroll to the latest message ---
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  function getSenderName(senderId) {
    if (senderId === me.id) return me.name;
    const p = participants.find((p) => p.id === senderId);
    return p ? p.name : "Someone";
  }

  function broadcastTyping(typing) {
    const channel = presenceChannelRef.current;
    if (!channel) return;

    channel.send({
      type: "broadcast",
      event: "typing",
      payload: { user_id: me.id, typing },
    });
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
    typingTimerRef.current = setTimeout(() => {
      broadcastTyping(false);
    }, 1200);
  }

  const emojis = [
    "😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣",
    "😊", "😇", "🙂", "🙃", "😉", "😌", "😍", "🥰",
    "😘", "😗", "😎", "🤩", "🤔", "😐", "😴", "😭",
    "😡", "😱", "👍", "👎", "👏", "🙏", "❤️", "🔥",
    "🎉", "💯", "😂", "🙌", "💔", "✨", "✅", "❌"
  ];

  function addEmoji(emoji) {
    setText((current) => `${current}${emoji}`);
    setShowEmojiPicker(false);
    requestAnimationFrame(() => composerInputRef.current?.focus());
  }

  function handleComposerBlur() {
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    broadcastTyping(false);
  }

  function handleFileChoose(e) {
    const file = e.target.files[0];
    e.target.value = ""; // allow choosing the same file again later
    if (!file) return;

    setError("");

    if (!isAllowedFileType(file.type)) {
      setError("That file type isn't supported.");
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError("File must be 5 MB or smaller.");
      return;
    }

    setPendingFile({
      file,
      previewUrl: file.type.startsWith("image/")
        ? URL.createObjectURL(file)
        : null,
    });
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
    if (sending) return;
    if (!text.trim() && !pendingFile) return;

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
        if (!uploadRes.ok) {
          setError(uploadData.error || "Upload failed.");
          setSending(false);
          return;
        }
        filePayload = {
          fileUrl: uploadData.fileUrl,
          fileName: uploadData.fileName,
          fileType: uploadData.fileType,
          fileSize: uploadData.fileSize,
        };
      }

      const res = await fetch("/api/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatToken,
          message: text.trim(),
          ...filePayload,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Could not send message.");
        setSending(false);
        return;
      }

      // Show it immediately, but never add the same message twice if
      // Supabase Realtime already delivered it.
      setMessages((prev) => {
        if (prev.some((m) => m.id === data.message.id)) return prev;
        return [...prev, data.message];
      });
      broadcastTyping(false);
      setText("");
      setPendingFile(null);
    } catch (err) {
      setError("Something went wrong.");
    }
    setSending(false);
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleComposerBlur();
      handleSend();
    }
  }

  return (
    <div className="chat-page">
      <div className="chat-header">
        <button className="btn-icon" onClick={() => router.push("/chat")}>
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
        {messages.length === 0 && (
          <div className="empty-state">
            <p>No messages yet. Say hello 👋</p>
          </div>
        )}
        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            isMe={m.sender_id === me.id}
            senderName={getSenderName(m.sender_id)}
          />
        ))}
      </div>

      {pendingFile && (
        <div className="upload-preview">
          {pendingFile.previewUrl ? (
            <ImageIcon size={16} color="#16a34a" />
          ) : (
            <Paperclip size={16} color="#16a34a" />
          )}
          <span>
            {pendingFile.file.name} ({formatFileSize(pendingFile.file.size)})
          </span>
          <button
            className="btn-icon"
            onClick={() => setPendingFile(null)}
            title="Remove file"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {error && <p className="error-text" style={{ padding: "0 12px" }}>{error}</p>}

      {showEmojiPicker && (
        <div className="emoji-picker">
          {emojis.map((emoji, index) => (
            <button
              key={`${emoji}-${index}`}
              type="button"
              className="emoji-btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => addEmoji(emoji)}
              aria-label={`Insert ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      <div className="composer">
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: "none" }}
          onChange={handleFileChoose}
          accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,.xls,.xlsx,.txt"
        />
        <button
          className="btn-icon emoji-toggle"
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setShowEmojiPicker((open) => !open)}
          title="Emoji"
          aria-label="Emoji"
        >
          😊
        </button>
        <button
          className="btn-icon"
          type="button"
          onClick={() => fileInputRef.current.click()}
          title="Attach a file"
        >
          <Paperclip size={20} />
        </button>
        <input
          ref={composerInputRef}
          type="text"
          placeholder="Type a message..."
          value={text}
          onChange={handleTextChange}
          onBlur={handleComposerBlur}
          onKeyDown={handleKeyDown}
        />
        <button
          className="send-btn"
          onClick={handleSend}
          disabled={sending || (!text.trim() && !pendingFile)}
          title="Send"
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}
