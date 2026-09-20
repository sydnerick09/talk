// "/chat" — dashboard shown after login. Lets the user start a new chat
// and see the chats they're already part of.
import { useState } from "react";
import { useRouter } from "next/router";
import {
  MessageCircle,
  Plus,
  Copy,
  Check,
  LogOut,
  Users,
  Bell,
  Settings,
  UserCircle,
} from "lucide-react";
import { getUserIdFromRequest } from "../../lib/session";
import { supabaseAdmin } from "../../lib/supabaseAdmin";

export async function getServerSideProps({ req }) {
  const userId = getUserIdFromRequest(req);
  if (!userId) {
    return { redirect: { destination: "/", permanent: false } };
  }

  const { data: user } = await supabaseAdmin
    .from("users")
    .select("id, name, username")
    .eq("id", userId)
    .maybeSingle();

  if (!user) {
    return { redirect: { destination: "/", permanent: false } };
  }

  // Find every chat this user belongs to, along with the other
  // participant(s), so the dashboard can show a friendly chat list.
  const { data: memberships } = await supabaseAdmin
    .from("chat_members")
    .select(
      "chat_id, chats(id, chat_token, last_activity, is_inbox, chat_members(user_id, users(name)))"
    )
    .eq("user_id", userId);

  const chats = (memberships || [])
    .map((m) => m.chats)
    .filter((c) => c && !c.is_inbox)
    .map((c) => {
      const others = (c.chat_members || [])
        .map((cm) => cm.users?.name)
        .filter((name) => name); // includes self; fine for a simple label
      return {
        id: c.id,
        chatToken: c.chat_token,
        lastActivity: c.last_activity,
        participantNames: others,
      };
    })
    .sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));

  return { props: { user, chats } };
}

export default function ChatDashboard({ user, chats }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [newLink, setNewLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  async function handleCreateChat() {
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/chats/create", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not create chat.");
        setCreating(false);
        return;
      }
      const link = `${window.location.origin}/chat/${data.chatToken}`;
      setNewLink(link);
    } catch (err) {
      setError("Something went wrong.");
    }
    setCreating(false);
  }

  function handleCopy() {
    navigator.clipboard.writeText(newLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleLogout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/");
  }

  return (
    <div>
      <div className="topbar">
        <div className="brand">
          <MessageCircle size={22} color="#16a34a" />
          <span>Simple Chat</span>
        </div>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <button className="btn-icon" title="Notifications">
            <Bell size={20} />
          </button>
          <button className="btn-icon" title="Settings">
            <Settings size={20} />
          </button>
          <button className="btn-icon" title="Your profile">
            <UserCircle size={20} />
          </button>
          <button className="btn-icon" onClick={handleLogout} title="Log out">
            <LogOut size={20} />
          </button>
        </div>
      </div>

      <div className="dashboard">
        <h1>Hi, {user.name} 👋</h1>
        <p className="subtitle">@{user.username}</p>

        <button
          className="btn"
          onClick={handleCreateChat}
          disabled={creating}
        >
          <Plus size={18} />
          {creating ? "Creating..." : "Create New Chat"}
        </button>

        {error && <p className="error-text">{error}</p>}

        {newLink && (
          <div className="chat-link-box">
            <div className="label">Your Chat Link</div>
            <div className="chat-link-row">
              <code>{newLink}</code>
              <button className="btn-icon" onClick={handleCopy} title="Copy Link">
                {copied ? <Check size={18} /> : <Copy size={18} />}
              </button>
            </div>
          </div>
        )}

        <h2 style={{ fontSize: 16, marginTop: 32, marginBottom: 12 }}>
          Your Chats
        </h2>

        {chats.length === 0 && (
          <div className="empty-state">
            <Users size={32} />
            <p>No chats yet. Create one above and share the link!</p>
          </div>
        )}

        {chats.map((chat) => (
          <div
            key={chat.id}
            className="chat-list-item"
            onClick={() => router.push(`/chat/${chat.chatToken}`)}
          >
            <div className="avatar">
              <MessageCircle size={18} />
            </div>
            <div className="info">
              <div className="title">
                {chat.participantNames.filter((n) => n !== user.name).join(", ") ||
                  "Just you (share the link!)"}
              </div>
              <div className="meta">
                Last activity: {new Date(chat.lastActivity).toLocaleString()}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
