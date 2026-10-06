// "/admin" — protected admin panel. Shows a login form if the admin isn't
// logged in yet, otherwise shows the dashboard.
import { useState, useEffect } from "react";
import {
  ShieldCheck,
  Search,
  Users,
  MessageSquare,
  FileText,
  LogOut,
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

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
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
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Admin Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
  const [data, setData] = useState({ users: [], chats: [], messages: [] });
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState(null);

  async function loadData(searchTerm = "") {
    setLoading(true);
    const res = await fetch(
      `/api/admin/data${searchTerm ? `?search=${encodeURIComponent(searchTerm)}` : ""}`
    );
    if (res.ok) {
      const json = await res.json();
      setData(json);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, []);

  // Simple debounce on search
  useEffect(() => {
    const t = setTimeout(() => loadData(search), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.href = "/admin";
  }

  // The admin API already returns the complete conversation history. Build the
  // selected client's view locally so clicking a registered client never
  // requires the search box. We include every message in conversations that
  // the client belongs to, not only messages sent by that client.
  const selectedClientChats = selectedUser
    ? data.chats.filter((chat) =>
        chat.participants.some((participant) => participant.id === selectedUser.id)
      )
    : [];

  const selectedClientChatIds = new Set(selectedClientChats.map((chat) => chat.id));
  const selectedClientMessages = selectedUser
    ? data.messages
        .filter((message) => selectedClientChatIds.has(message.chatId))
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    : [];

  return (
    <div className="admin-page">
      <div className="admin-header">
        <div className="brand">
          <ShieldCheck size={22} color="#16a34a" />
          <span>Admin Panel</span>
        </div>
        <button className="btn-icon" onClick={handleLogout} title="Log out">
          <LogOut size={20} />
        </button>
      </div>

      <div className="admin-search-wrap" style={{ marginBottom: 24 }}>
        <Search size={16} />
        <input
          className="admin-search"
          placeholder="Search users or chats..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading && <p className="empty-state">Loading...</p>}

      {!loading && (
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
                {data.users.map((u) => (
                  <tr
                    key={u.id}
                    onClick={() => setSelectedUser(u)}
                    style={{ cursor: "pointer" }}
                    title={`View conversations for ${u.name || u.username}`}
                  >
                    <td>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedUser(u);
                        }}
                        style={{
                          border: 0,
                          background: "transparent",
                          padding: 0,
                          margin: 0,
                          font: "inherit",
                          fontWeight: 600,
                          cursor: "pointer",
                          color: "inherit",
                          textAlign: "left",
                        }}
                      >
                        {u.name}
                      </button>
                    </td>
                    <td>@{u.username}</td>
                    <td>{new Date(u.created_at).toLocaleString()}</td>
                    <td>{new Date(u.last_active).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.users.length === 0 && (
              <p className="empty-state">No users found.</p>
            )}
          </section>

          {selectedUser && (
            <section className="admin-section" style={{ marginBottom: 24 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 16,
                  marginBottom: 16,
                }}
              >
                <div>
                  <h2 style={{ marginBottom: 4 }}>
                    <MessageSquare size={18} color="#16a34a" /> {selectedUser.name || selectedUser.username}'s Conversations
                  </h2>
                  <div style={{ color: "#64748b", fontSize: 14 }}>
                    @{selectedUser.username} · {selectedClientChats.length} conversation{selectedClientChats.length === 1 ? "" : "s"}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-icon"
                  onClick={() => setSelectedUser(null)}
                  title="Close conversation view"
                  aria-label="Close conversation view"
                >
                  ×
                </button>
              </div>

              {selectedClientChats.length === 0 ? (
                <p className="empty-state">This client has no conversations yet.</p>
              ) : (
                <div style={{ display: "grid", gap: 18 }}>
                  {selectedClientChats.map((chat) => {
                    const chatMessages = selectedClientMessages.filter((message) => message.chatId === chat.id);
                    return (
                      <div
                        key={chat.id}
                        style={{
                          border: "1px solid #e2e8f0",
                          borderRadius: 12,
                          overflow: "hidden",
                          background: "#fff",
                        }}
                      >
                        <div
                          style={{
                            padding: "12px 14px",
                            borderBottom: "1px solid #e2e8f0",
                            background: "#f8fafc",
                          }}
                        >
                          <strong>{chat.participants.map((p) => p.name || `@${p.username}`).join(" ↔ ") || chat.chatToken}</strong>
                          <div style={{ color: "#64748b", fontSize: 12, marginTop: 4 }}>
                            Chat ID: {chat.chatToken} · {chatMessages.length} message{chatMessages.length === 1 ? "" : "s"}
                          </div>
                        </div>

                        <div style={{ padding: 14, display: "grid", gap: 10 }}>
                          {chatMessages.length === 0 ? (
                            <p className="empty-state">No messages in this conversation.</p>
                          ) : (
                            chatMessages.map((message) => (
                              <div
                                key={message.id}
                                style={{
                                  padding: "10px 12px",
                                  borderRadius: 10,
                                  background: message.senderUsername === selectedUser.username ? "#f0fdf4" : "#f8fafc",
                                  border: "1px solid #e2e8f0",
                                }}
                              >
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 5 }}>
                                  <strong style={{ fontSize: 13 }}>
                                    {message.senderName} (@{message.senderUsername})
                                  </strong>
                                  <span style={{ color: "#64748b", fontSize: 12, whiteSpace: "nowrap" }}>
                                    {new Date(message.createdAt).toLocaleString()}
                                  </span>
                                </div>
                                {message.message && (
                                  <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                                    {message.message}
                                  </div>
                                )}
                                {message.fileName && (
                                  <div style={{ marginTop: message.message ? 8 : 0 }}>
                                    <a href={message.fileUrl} target="_blank" rel="noopener noreferrer">
                                      📎 {message.fileName} ({formatFileSize(message.fileSize || 0)})
                                    </a>
                                  </div>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

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
                {data.chats.map((c) => (
                  <tr key={c.id}>
                    <td>{c.chatToken}</td>
                    <td>{c.participants.join(", ") || "—"}</td>
                    <td>{new Date(c.createdAt).toLocaleString()}</td>
                    <td>{new Date(c.lastActivity).toLocaleString()}</td>
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
              <FileText size={18} color="#16a34a" /> Messages (
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
                {data.messages.map((m) => (
                  <tr key={m.id}>
                    <td>{m.senderName} (@{m.senderUsername})</td>
                    <td>{m.chatToken}</td>
                    <td>{m.message || "—"}</td>
                    <td>
                      {m.fileName ? (
                        <a href={m.fileUrl} target="_blank" rel="noopener noreferrer">
                          {m.fileName} ({formatFileSize(m.fileSize || 0)})
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{new Date(m.createdAt).toLocaleString()}</td>
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
    </div>
  );
}
