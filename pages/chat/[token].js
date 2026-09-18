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
  const [pendingFile, setPendingFile] = useState(null); // { file, previewUrl }
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);

  const otherParticipants = participants.filter((p) => p.id !== me.id);
  const headerName =
    otherParticipants.map((p) => p.name).join(", ") || "Waiting for someone to join...";

  // --- Realtime: listen for new messages in this chat and add them live ---
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
            // Avoid duplicates if we already added it optimistically.
            if (prev.some((m) => m.id === payload.new.id)) return prev;
            return [...prev, payload.new];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatId]);

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

      // Show it immediately (realtime will also deliver it, but the
      // dedupe check in the effect above prevents a duplicate).
      setMessages((prev) => [...prev, data.message]);
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
        <div className="title">{headerName}</div>
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

      <div className="composer">
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: "none" }}
          onChange={handleFileChoose}
          accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,.xls,.xlsx,.txt"
        />
        <button
          className="btn-icon"
          onClick={() => fileInputRef.current.click()}
          title="Attach a file"
        >
          <Paperclip size={20} />
        </button>
        <input
          type="text"
          placeholder="Type a message..."
          value={text}
          onChange={(e) => setText(e.target.value)}
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
