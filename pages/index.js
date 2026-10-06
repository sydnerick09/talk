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
import { isAdminRequest } from "../lib/adminSession";
import { formatFileSize } from "../lib/fileValidation";

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
  const [loadError, setLoadError] = useState("");
  const [selectedChatId, setSelectedChatId] = useState(null);

  async function loadData(searchTerm = "") {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch(
      `/api/admin/data${searchTerm ? `?search=${encodeURIComponent(searchTerm)}` : ""}`
    );
      const json = await res.json();
      if (!res.ok) {
        setLoadError(json.error || "Could not load admin data.");
      } else {
        setData(json);
      }
    } catch (error) {
      console.error("Admin data request failed:", error);
      setLoadError("Could not connect to the admin data service.");
    } finally {
      setLoading(false);
    }
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

      {!loading && loadError && (
        <div className="card" style={{ marginBottom: 24 }}>
          <p className="error-text">{loadError}</p>
          <button className="btn" onClick={() => loadData(search)}>Try Again</button>
        </div>
      )}

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
                {data.users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name}</td>
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
                  <tr key={c.id} onClick={() => setSelectedChatId(c.id)} style={{ cursor: "pointer" }}>
                    <td>{c.chatToken}</td>
                    <td>{c.participants.map((participant) => participant.name).join(", ") || "—"}</td>
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
              <MessageSquare size={18} color="#16a34a" /> Conversation Viewer
            </h2>

            {data.chats.length === 0 ? (
              <p className="empty-state">No conversations available.</p>
            ) : (
              <>
                <div className="field" style={{ maxWidth: 620 }}>
                  <label htmlFor="conversation-select">Select a conversation</label>
                  <select
                    id="conversation-select"
                    value={selectedChatId || ""}
                    onChange={(e) => setSelectedChatId(e.target.value || null)}
                  >
                    <option value="">Choose a conversation...</option>
                    {data.chats.map((chat) => (
                      <option key={chat.id} value={chat.id}>
                        {chat.participants.map((p) => p.name).join(", ") || "Unknown users"} — {chat.chatToken}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedChatId && (
                  <div className="messages-area" style={{ maxHeight: 500, marginTop: 16 }}>
                    {data.messages.filter((message) => message.chatId === selectedChatId).length === 0 ? (
                      <p className="empty-state">No messages have been sent in this conversation.</p>
                    ) : (
                      data.messages
                        .filter((message) => message.chatId === selectedChatId)
                        .slice()
                        .reverse()
                        .map((message) => (
                          <div key={message.id} className="card" style={{ marginBottom: 10 }}>
                            <strong>{message.senderName}</strong>
                            <span style={{ marginLeft: 8, opacity: 0.65 }}>@{message.senderUsername}</span>
                            <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>
                              {message.message || "[File attachment]"}
                            </div>
                            {message.fileName && (
                              <div style={{ marginTop: 6 }}>
                                <a href={message.fileUrl} target="_blank" rel="noopener noreferrer">
                                  {message.fileName} ({formatFileSize(message.fileSize || 0)})
                                </a>
                              </div>
                            )}
                            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.65 }}>
                              {new Date(message.createdAt).toLocaleString()}
                            </div>
                          </div>
                        ))
                    )}
                  </div>
                )}
              </>
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
