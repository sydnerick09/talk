
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import {
  ArrowLeft,
  Send,
  Paperclip,
  Image as ImageIcon,
  X,
  MessageCircle,
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
import { generateChatToken } from "../../lib/generateToken";

async function makePrivateChat(sharedToken, ownerId, visitorId) {
  const { data: existingMemberships, error: membershipError } =
    await supabaseAdmin
      .from("chat_members")
      .select("chat_id, chats(id, chat_token, created_by)")
      .eq("user_id", visitorId);

  if (membershipError) {
    console.error("Find private chat error:", membershipError);
  }

  const existing = (existingMemberships || []).find((row) => {
    const chat = row.chats;

    return (
      chat &&
      chat.created_by === ownerId &&
      chat.chat_token &&
      chat.chat_token !== sharedToken
    );
  });

  if (existing) {
    return existing.chats;
  }

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

  if (!chatToken) {
    throw new Error("Could not create private conversation.");
  }

  const { data: privateChat, error: chatError } = await supabaseAdmin
    .from("chats")
    .insert({
      chat_token: chatToken,
      created_by: ownerId,
    })
    .select("id, chat_token, created_by")
    .single();

  if (chatError) {
    console.error("Create private chat error:", chatError);
    throw chatError;
  }

  const { error: memberError } = await supabaseAdmin
    .from("chat_members")
    .insert([
      {
        chat_id: privateChat.id,
        user_id: ownerId,
      },
      {
        chat_id: privateChat.id,
        user_id: visitorId,
      },
    ]);

  if (memberError) {
    console.error("Add private chat members error:", memberError);
    throw memberError;
  }

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

  if (!me) {
    return {
      redirect: {
        destination: "/",
        permanent: false,
      },
    };
  }

  const { data: inbox, error: inboxError } = await supabaseAdmin
    .from("chats")
    .select("id, chat_token, created_by")
    .eq("chat_token", params.token)
    .maybeSingle();

  if (inboxError) {
    console.error("Find shared chat error:", inboxError);

    return {
      notFound: true,
    };
  }

  if (!inbox) {
    return {
      notFound: true,
    };
  }

  if (inbox.created_by === userId && !query.conversation) {
    const { data: memberRows } = await supabaseAdmin
      .from("chat_members")
      .select(
        "chat_id, chats(id, chat_token, created_at, last_activity, created_by)"
      )
      .eq("user_id", userId);

    const conversations = [];

    for (const row of memberRows || []) {
      const chat = row.chats;

      if (!chat || chat.id === inbox.id) continue;

      const { data: members } = await supabaseAdmin
        .from("chat_members")
        .select("user_id, users(id, name, username)")
        .eq("chat_id", chat.id);

      const other = (members || [])
        .map((member) => member.users)
        .find((user) => user && user.id !== userId);

      if (!other) continue;

      conversations.push({
        id: chat.id,
        chatToken: chat.chat_token,
        createdAt: chat.created_at,
        lastActivity: chat.last_activity,
        other,
      });
    }

    conversations.sort((a, b) => {
      const aTime = a.lastActivity
        ? new Date(a.lastActivity).getTime()
        : 0;

      const bTime = b.lastActivity
        ? new Date(b.lastActivity).getTime()
        : 0;

      return bTime - aTime;
    });

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
    const { data: requested, error: requestedError } =
      await supabaseAdmin
        .from("chats")
        .select("id, chat_token, created_by")
        .eq("chat_token", String(query.conversation))
        .maybeSingle();

    if (requestedError || !requested) {
      return {
        notFound: true,
      };
    }

    const { data: membership } = await supabaseAdmin
      .from("chat_members")
      .select("id")
      .eq("chat_id", requested.id)
      .eq("user_id", userId)
      .maybeSingle();

    if (!membership) {
      return {
        notFound: true,
      };
    }

    chat = requested;
  } else {
    if (inbox.created_by === userId) {
      return {
        notFound: true,
      };
    }

    try {
      chat = await makePrivateChat(
        params.token,
        inbox.created_by,
        userId
      );
    } catch (error) {
      console.error("Private chat creation error:", error);

      return {
        notFound: true,
      };
    }
  }

  const { data: memberRows } = await supabaseAdmin
    .from("chat_members")
    .select("users(id, name, username)")
    .eq("chat_id", chat.id);

  const participants = (memberRows || [])
    .map((row) => row.users)
    .filter(Boolean);

  const { data: messages, error: messagesError } = await supabaseAdmin
    .from("messages")
    .select("*")
    .eq("chat_id", chat.id)
    .order("created_at", { ascending: true })
    .limit(200);

  if (messagesError) {
    console.error("Load messages error:", messagesError);
  }

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
  if (props.mode === "inbox") {
    return <SharedInbox {...props} />;
  }

  return <PrivateConversation {...props} />;
}

function SharedInbox({ me, sharedToken, conversations }) {
  const router = useRouter();

  return (
    <div className="chat-page">
      <div className="chat-header">
        <button
          className="btn-icon"
          onClick={() => router.push("/chat")}
          title="Back"
        >
          <ArrowLeft size={20} />
        </button>

        <div className="avatar">
          <MessageCircle size={18} />
        </div>

        <div className="chat-header-info">
          <div className="title">Your Shared Inbox</div>

          <div className="presence-status offline">
            Private conversations
          </div>
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
                router.push(
                  `/chat/${sharedToken}?conversation=${conversation.chatToken}`
                )
              }
            >
              <div className="avatar">
                {(conversation.other?.name || "?")
                  .charAt(0)
                  .toUpperCase()}
              </div>

              <div className="info">
                <div className="title">
                  {conversation.other?.name || "Private chat"}
                </div>

                <div className="meta">
                  @{conversation.other?.username || "user"}

                  {conversation.lastActivity
                    ? ` • ${new Date(
                        conversation.lastActivity
                      ).toLocaleString()}`
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

function PrivateConversation({
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

  const otherParticipants = participants.filter(
    (person) => person.id !== me.id
  );

  const otherPerson = otherParticipants[0];

  const headerName = otherPerson?.name || "Chat";

  const otherOnline = otherPerson
    ? Boolean(onlineUsers[otherPerson.id])
    : false;

  const typingNames = otherParticipants
    .filter((person) => typingUserIds[person.id])
    .map((person) => person.name)
    .join(", ");

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
          setMessages((previous) =>
            previous.some(
              (message) => message.id === payload.new.id
            )
              ? previous
              : [...previous, payload.new]
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

        setTypingUserIds((previous) => ({
          ...previous,
          [payload.user_id]: Boolean(payload.typing),
        }));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            user_id: me.id,
          });
        }
      });

    presenceChannelRef.current = channel;

    return () => {
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
      }

      supabase.removeChannel(channel);
      presenceChannelRef.current = null;
    };
  }, [chatId, me.id]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop =
        scrollRef.current.scrollHeight;
    }
  }, [messages]);

  function getSenderName(senderId) {
    if (senderId === me.id) {
      return me.name;
    }

    return (
      participants.find((person) => person.id === senderId)?.name ||
      "Someone"
    );
  }

  function broadcastTyping(typing) {
    const channel = presenceChannelRef.current;

    if (!channel) return;

    channel.send({
      type: "broadcast",
      event: "typing",
      payload: {
        user_id: me.id,
        typing,
      },
    });
  }

  function handleTextChange(event) {
    const value = event.target.value;

    setText(value);

    if (!value.trim()) {
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
      }

      broadcastTyping(false);
      return;
    }

    broadcastTyping(true);

    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
    }

    typingTimerRef.current = setTimeout(() => {
      broadcastTyping(false);
    }, 1200);
  }

  const emojis = [
    "😀",
    "😃",
    "😄",
    "😁",
    "😆",
    "😅",
    "😂",
    "🤣",
    "😊",
    "😇",
    "🙂",
    "🙃",
    "😉",
    "😌",
    "😍",
    "🥰",
    "😘",
    "😗",
    "😎",
    "🤩",
    "🤔",
    "😐",
    "😴",
    "😭",
    "😡",
    "😱",
    "👍",
    "👎",
    "👏",
    "🙏",
    "❤️",
    "🔥",
    "🎉",
    "💯",
    "🙌",
    "💔",
    "✨",
    "✅",
    "❌",
  ];

  function addEmoji(emoji) {
    setText((current) => `${current}${emoji}`);

    setShowEmojiPicker(false);

    requestAnimationFrame(() => {
      composerInputRef.current?.focus();
    });
  }

  function handleFileChoose(event) {
    const file = event.target.files[0];

    event.target.value = "";

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
    if (sending || (!text.trim() && !pendingFile)) {
      return;
    }

    setSending(true);
    setError("");

    try {
      let filePayload = {};

      if (pendingFile) {
        const base64 = await readFileAsBase64(
          pendingFile.file
        );

        const uploadRes = await fetch("/api/upload", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            chatToken,
            fileName: pendingFile.file.name,
            fileType: pendingFile.file.type,
            fileBase64: base64,
          }),
        });

        const uploadData = await uploadRes.json();

        if (!uploadRes.ok) {
          setError(
            uploadData.error || "Upload failed."
          );
          return;
        }

        filePayload = uploadData;
      }

      const response = await fetch(
        "/api/messages/send",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            chatToken,
            message: text.trim(),
            ...filePayload,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(
          data.error || "Could not send message."
        );
        return;
      }

      setMessages((previous) =>
        previous.some(
          (message) => message.id === data.message.id
        )
          ? previous
          : [...previous, data.message]
      );

      broadcastTyping(false);

      setText("");
      setPendingFile(null);
    } catch (sendError) {
      console.error("Send message error:", sendError);
      setError("Something went wrong.");
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();

      broadcastTyping(false);

      handleSend();
    }
  }

  return (
    <div className="chat-page">
      <div className="chat-header">
        <button
          className="btn-icon"
          onClick={() =>
            router.push(`/chat/${router.query.token}`)
          }
          title="Back"
        >
          <ArrowLeft size={20} />
        </button>

        <div className="avatar">
          {headerName.charAt(0).toUpperCase()}
        </div>

        <div className="chat-header-info">
          <div className="title">{headerName}</div>

          <div
            className={`presence-status ${
              otherOnline ? "online" : "offline"
            }`}
          >
            {otherOnline ? "Online" : "Offline"}
          </div>

          {typingNames && (
            <div className="typing-status">
              {typingNames} is typing...
            </div>
          )}
        </div>
      </div>

      <div className="messages-area" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="empty-state">
            <p>No messages yet. Say hello 👋</p>
          </div>
        )}

        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            isMe={message.sender_id === me.id}
            senderName={getSenderName(message.sender_id)}
          />
        ))}
      </div>

      {pendingFile && (
        <div className="upload-preview">
          {pendingFile.previewUrl ? (
            <ImageIcon size={16} />
          ) : (
            <Paperclip size={16} />
          )}

          <span>
            {pendingFile.file.name} (
            {formatFileSize(pendingFile.file.size)})
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

      {error && (
        <p
          className="error-text"
          style={{ padding: "0 12px" }}
        >
          {error}
        </p>
      )}

      {showEmojiPicker && (
        <div className="emoji-picker">
          {emojis.map((emoji, index) => (
            <button
              key={`${emoji}-${index}`}
              type="button"
              className="emoji-btn"
              onMouseDown={(event) =>
                event.preventDefault()
              }
              onClick={() => addEmoji(emoji)}
              aria-label={`Insert ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* COMPOSER
          Attachment = OUTSIDE typing box
          Emoji = INSIDE typing box
          Send = OUTSIDE typing box
      */}
      <div className="composer">
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: "none" }}
          onChange={handleFileChoose}
          accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,.xls,.xlsx,.txt"
        />

        {/* Attachment button stays OUTSIDE */}
        <button
          className="btn-icon attachment-btn"
          type="button"
          onClick={() =>
            fileInputRef.current?.click()
          }
          title="Attach a file"
          aria-label="Attach a file"
        >
          <Paperclip size={20} />
        </button>

        {/* Typing box */}
        <div className="composer-input-wrap">
          {/* Emoji button is INSIDE the typing box */}
          <button
            className="btn-icon emoji-toggle"
            type="button"
            onMouseDown={(event) =>
              event.preventDefault()
            }
            onClick={() =>
              setShowEmojiPicker((open) => !open)
            }
            title="Emoji"
            aria-label="Emoji"
          >
            😊
          </button>

          <input
            ref={composerInputRef}
            type="text"
            placeholder="Type a message..."
            value={text}
            onChange={handleTextChange}
            onBlur={() => broadcastTyping(false)}
            onKeyDown={handleKeyDown}
          />
        </div>

        {/* Send button stays OUTSIDE */}
        <button
          className="send-btn"
          onClick={handleSend}
          disabled={
            sending ||
            (!text.trim() && !pendingFile)
          }
          title="Send"
          aria-label="Send"
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}
