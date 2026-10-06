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
  X,
  KeyRound,
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
  const [showSettings, setShowSettings] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [settingsMessage, setSettingsMessage] = useState("");
  const [settings, setSettings] = useState({
    currentPassword: "",
    username: user.username || "",
    newPassword: "",
    confirmPassword: "",
  });

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

  function openSettings() {
    setSettings({
      currentPassword: "",
      username: user.username || "",
      newPassword: "",
      confirmPassword: "",
    });
    setSettingsError("");
    setSettingsMessage("");
    setShowSettings(true);
  }

  function closeSettings() {
    if (settingsLoading) return;
    setShowSettings(false);
    setSettingsError("");
    setSettingsMessage("");
  }

  async function handleSettingsSubmit(event) {
    event.preventDefault();
    setSettingsError("");
    setSettingsMessage("");

    const usernameChanged =
      settings.username.trim().toLowerCase() !==
      String(user.username || "").toLowerCase();

    if (!usernameChanged && !settings.newPassword) {
      setSettingsError("Change your username or enter a new password.");
      return;
    }

    if (settings.newPassword !== settings.confirmPassword) {
      setSettingsError("The new passwords do not match.");
      return;
    }

    if (settings.newPassword && settings.newPassword.length < 6) {
      setSettingsError("New password must be at least 6 characters.");
      return;
    }

    if (!settings.currentPassword) {
      setSettingsError("Enter your current password to continue.");
      return;
    }

    setSettingsLoading(true);

    try {
      const response = await fetch("/api/account/update-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: settings.currentPassword,
          username: usernameChanged ? settings.username : undefined,
          newPassword: settings.newPassword || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setSettingsError(data.error || "Could not update your settings.");
        return;
      }

      setSettingsMessage(data.message || "Settings updated successfully.");

      if (data.user?.username) {
        setSettings((current) => ({
          ...current,
          username: data.user.username,
          currentPassword: "",
          newPassword: "",
          confirmPassword: "",
        }));
      }

      // Refresh the dashboard so the new username is immediately displayed.
      if (data.user?.username) {
        router.replace(router.asPath);
      }
    } catch (err) {
      setSettingsError("Something went wrong while saving your settings.");
    } finally {
      setSettingsLoading(false);
    }
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
          <button
            className="btn-icon"
            onClick={openSettings}
            title="Settings"
            aria-label="Settings"
          >
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

      {showSettings && (
        <div className="settings-overlay" role="dialog" aria-modal="true">
          <div className="settings-modal">
            <div className="settings-modal-header">
              <div>
                <div className="settings-title">
                  <KeyRound size={19} />
                  Account Settings
                </div>
                <p className="settings-subtitle">
                  Change your username or password securely.
                </p>
              </div>
              <button
                className="btn-icon"
                type="button"
                onClick={closeSettings}
                disabled={settingsLoading}
                title="Close settings"
                aria-label="Close settings"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSettingsSubmit}>
              <label className="settings-label" htmlFor="settings-username">
                Username
              </label>
              <input
                id="settings-username"
                className="settings-input"
                value={settings.username}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    username: event.target.value,
                  }))
                }
                autoComplete="username"
                maxLength={20}
              />

              <label className="settings-label" htmlFor="settings-current-password">
                Current password
              </label>
              <input
                id="settings-current-password"
                className="settings-input"
                type="password"
                value={settings.currentPassword}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    currentPassword: event.target.value,
                  }))
                }
                autoComplete="current-password"
                placeholder="Required to save changes"
              />

              <label className="settings-label" htmlFor="settings-new-password">
                New password
              </label>
              <input
                id="settings-new-password"
                className="settings-input"
                type="password"
                value={settings.newPassword}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    newPassword: event.target.value,
                  }))
                }
                autoComplete="new-password"
                placeholder="Leave blank to keep your password"
              />

              <label className="settings-label" htmlFor="settings-confirm-password">
                Confirm new password
              </label>
              <input
                id="settings-confirm-password"
                className="settings-input"
                type="password"
                value={settings.confirmPassword}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    confirmPassword: event.target.value,
                  }))
                }
                autoComplete="new-password"
                placeholder="Repeat the new password"
              />

              {settingsError && (
                <p className="error-text settings-feedback">{settingsError}</p>
              )}
              {settingsMessage && (
                <p className="success-text settings-feedback">{settingsMessage}</p>
              )}

              <div className="settings-actions">
                <button
                  className="btn secondary-btn"
                  type="button"
                  onClick={closeSettings}
                  disabled={settingsLoading}
                >
                  Cancel
                </button>
                <button className="btn" type="submit" disabled={settingsLoading}>
                  {settingsLoading ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
