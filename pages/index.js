// "/admin" — protected admin panel. Shows a login form if the admin isn't
// logged in yet, otherwise shows the complete client/chat/message dashboard.
import { useState, useEffect } from "react";
import {
  ShieldCheck,
  Search,
  Users,
  MessageSquare,
  FileText,
  LogOut,
  RefreshCw,
  X,
} from "lucide-react";
import { isAdminRequest } from "../../lib/adminSession";
import { formatFileSize } from "../../lib/fileValidation";

export async function getServerSideProps({ req }) {
  return { props: { loggedIn: isAdminRequest(req) } };
}

export default function AdminPage({ loggedIn }) {
  return loggedIn ? <AdminDashboard /> : <AdminLogin />;
}

function AdminLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Login failed.");
        setLoading(false);
        return;
      }

      window.location.href = "/admin";
    } catch (error) {
      setError("Could not connect to the server.");
      setLoading(false);
    }
  }

  return (
    <div className="page-center">
      <div className="card">
        <div className="brand">
          <ShieldCheck size={24} color="#16a34a" />
          <span>Admin Login</span>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="username">Admin Username</label>
            <input
              id="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="password">Admin Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>

          {error && <p className="error-text">{error}</p>}

          <button className="btn btn-block" disabled={loading}>
            {loading ? "Logging in..." : "Log In"}
          </button>
        </form>
      </div>
    </div>
  );
}

function AdminDashboard() {
  const [data, setData] = useState({
    users: [],
    chats: [],
    messages: [],
  });
  const [search, setSearch] = useState("");
  const [selectedChatId, setSelectedChatId] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [selectedMedia, setSelectedMedia] = useState(null);

  async function loadData(searchTerm = "", showLoading = true) {
    if (showLoading) setLoading(true);
    else setRefreshing(true);

    setLoadError("");

    try {
      const query = searchTerm
        ? `?search=${encodeURIComponent(searchTerm)}`
        : "";

      const res = await fetch(`/api/admin/data${query}`, {
        cache: "no-store",
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Could not load admin data.");
      }

      setData(json);
    } catch (error) {
      console.error("Admin data load error:", error);
      setLoadError(error.message || "Could not load admin data.");
    } finally {
      if (showLoading) setLoading(false);
      else setRefreshing(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => loadData(search), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Automatically pick up new client messages/media while the admin panel
  // remains open. This avoids needing to reload the whole browser page.
  useEffect(() => {
    const timer = setInterval(() => {
      loadData(search, false);
    }, 5000);

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.href = "/admin";
  }

  const selectedChat = data.chats.find(
    (chat) => chat.id === selectedChatId
  );

  const selectedMessages = data.messages
    .filter((message) => message.chatId === selectedChatId)
    .slice()
    .reverse();

  return (
    <div className="admin-page">
      <div className="admin-header">
        <div className="brand">
          <ShieldCheck size={22} color="#16a34a" />
          <span>Admin Panel</span>
        </div>

        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button
            className="btn-icon"
            onClick={() => loadData(search, false)}
            disabled={refreshing}
            title="Refresh chats and messages"
            aria-label="Refresh chats and messages"
          >
            <RefreshCw
              size={19}
              className={refreshing ? "admin-refresh-spin" : ""}
            />
          </button>

          <button
            className="btn-icon"
            onClick={handleLogout}
            title="Log out"
            aria-label="Log out"
          >
            <LogOut size={20} />
          </button>
        </div>
      </div>

      <div className="admin-search-wrap" style={{ marginBottom: 24 }}>
        <Search size={16} />
        <input
          className="admin-search"
          placeholder="Search users, chats or messages..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {loadError && (
        <div className="card" style={{ marginBottom: 20 }}>
          <p className="error-text">{loadError}</p>
          <button className="btn" onClick={() => loadData(search)}>
            Try Again
          </button>
        </div>
      )}

      {loading && <p className="empty-state">Loading...</p>}

      {!loading && !loadError && (
        <>
          <section className="admin-section">
            <h2>
              <Users size={18} color="#16a34a" /> Registered Clients (
              {data.users.length})
            </h2>

            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Username</th>
                  <th>Registered</th>
                  <th>Last Active</th>
                </tr>
              </thead>

              <tbody>
                {data.users.map((user) => (
                  <tr key={user.id}>
                    <td>{user.name}</td>
                    <td>@{user.username}</td>
                    <td>{new Date(user.created_at).toLocaleString()}</td>
                    <td>{new Date(user.last_active).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {data.users.length === 0 && (
              <p className="empty-state">No users found.</p>
            )}
          </section>

          <section className="admin-section">
            <h2>
              <MessageSquare size={18} color="#16a34a" /> Conversations (
              {data.chats.length})
            </h2>

            <table>
              <thead>
                <tr>
                  <th>Chat ID</th>
                  <th>Participants</th>
                  <th>Created</th>
                  <th>Last Activity</th>
                </tr>
              </thead>

              <tbody>
                {data.chats.map((chat) => (
                  <tr
                    key={chat.id}
                    onClick={() => setSelectedChatId(chat.id)}
                    style={{ cursor: "pointer" }}
                  >
                    <td>{chat.chatToken}</td>
                    <td>
                      {chat.participants
                        .map(
                          (participant) =>
                            `${participant.name} (@${participant.username})`
                        )
                        .join(", ") || "—"}
                    </td>
                    <td>{new Date(chat.createdAt).toLocaleString()}</td>
                    <td>{new Date(chat.lastActivity).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {data.chats.length === 0 && (
              <p className="empty-state">No conversations found.</p>
            )}
          </section>

          <section className="admin-section">
            <h2>
              <MessageSquare size={18} color="#16a34a" /> Conversation Viewer
            </h2>

            <div className="field" style={{ maxWidth: 720 }}>
              <label htmlFor="conversation-select">
                Select a client conversation
              </label>

              <select
                id="conversation-select"
                value={selectedChatId}
                onChange={(event) =>
                  setSelectedChatId(event.target.value)
                }
              >
                <option value="">Choose a conversation...</option>

                {data.chats.map((chat) => (
                  <option key={chat.id} value={chat.id}>
                    {chat.participants.map((p) => p.name).join(", ") ||
                      "Unknown users"}{" "}
                    — {chat.chatToken}
                  </option>
                ))}
              </select>
            </div>

            {!selectedChatId && (
              <p className="empty-state">
                Select a conversation to see every message and attachment.
              </p>
            )}

            {selectedChatId && selectedMessages.length === 0 && (
              <p className="empty-state">
                No messages have been sent in this conversation.
              </p>
            )}

            {selectedChatId && selectedMessages.length > 0 && (
              <div className="admin-conversation-viewer">
                <div className="admin-conversation-meta">
                  {selectedChat?.participants
                    .map(
                      (participant) =>
                        `${participant.name} (@${participant.username})`
                    )
                    .join(" ↔ ")}
                </div>

                {selectedMessages.map((message) => (
                  <div key={message.id} className="admin-message-card">
                    <div className="admin-message-heading">
                      <strong>{message.senderName}</strong>
                      <span>@{message.senderUsername}</span>
                    </div>

                    {message.message && (
                      <div className="admin-message-text">
                        {message.message}
                      </div>
                    )}

                    {message.fileName && message.fileUrl && (
                      <div className="admin-message-attachment">
                        {message.fileType?.startsWith("image/") ? (
                          <button
                            type="button"
                            className="admin-media-button"
                            onClick={() =>
                              setSelectedMedia({
                                url: message.fileUrl,
                                name: message.fileName,
                              })
                            }
                          >
                            <img
                              src={message.fileUrl}
                              alt={message.fileName}
                              className="admin-media-preview"
                            />
                          </button>
                        ) : (
                          <a
                            href={message.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="admin-file-link"
                          >
                            📎 {message.fileName}
                          </a>
                        )}

                        <div className="admin-file-meta">
                          {message.fileName} ·{" "}
                          {formatFileSize(message.fileSize || 0)}
                        </div>
                      </div>
                    )}

                    <div className="admin-message-date">
                      {new Date(message.createdAt).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="admin-section">
            <h2>
              <FileText size={18} color="#16a34a" /> All Messages (
              {data.messages.length})
            </h2>

            <table>
              <thead>
                <tr>
                  <th>Sender</th>
                  <th>Chat</th>
                  <th>Message</th>
                  <th>Attached File</th>
                  <th>Date</th>
                </tr>
              </thead>

              <tbody>
                {data.messages.map((message) => (
                  <tr
                    key={message.id}
                    onClick={() => setSelectedChatId(message.chatId)}
                    style={{ cursor: "pointer" }}
                  >
                    <td>
                      {message.senderName} (@{message.senderUsername})
                    </td>
                    <td>{message.chatToken}</td>
                    <td>{message.message || "—"}</td>
                    <td>
                      {message.fileName && message.fileUrl ? (
                        message.fileType?.startsWith("image/") ? (
                          <button
                            type="button"
                            className="admin-inline-image-button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedMedia({
                                url: message.fileUrl,
                                name: message.fileName,
                              });
                            }}
                          >
                            <img
                              src={message.fileUrl}
                              alt={message.fileName}
                              className="admin-table-thumb"
                            />
                          </button>
                        ) : (
                          <a
                            href={message.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(event) => event.stopPropagation()}
                          >
                            {message.fileName} (
                            {formatFileSize(message.fileSize || 0)})
                          </a>
                        )
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{new Date(message.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {data.messages.length === 0 && (
              <p className="empty-state">No messages found.</p>
            )}
          </section>
        </>
      )}

      {selectedMedia && (
        <div
          className="admin-media-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => setSelectedMedia(null)}
        >
          <button
            className="btn-icon admin-media-close"
            type="button"
            onClick={() => setSelectedMedia(null)}
            title="Close media"
            aria-label="Close media"
          >
            <X size={22} />
          </button>

          <img
            src={selectedMedia.url}
            alt={selectedMedia.name}
            className="admin-media-large"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
