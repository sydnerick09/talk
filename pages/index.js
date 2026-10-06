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
  const [selectedChatId, setSelectedChatId] = useState(null);

  async function loadData(searchTerm = "") {
    setLoading(true);

    try {
      const res = await fetch(
        `/api/admin/data${
          searchTerm
            ? `?search=${encodeURIComponent(searchTerm)}`
            : ""
        }`
      );

      if (res.ok) {
        const json = await res.json();
        setData(json);

        // Keep the open conversation if it still exists after a search.
        if (
          selectedChatId &&
          !(json.chats || []).some(
            (chat) => chat.id === selectedChatId
          )
        ) {
          setSelectedChatId(null);
        }
      }
    } catch (error) {
      console.error("Load admin data error:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => loadData(search), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.href = "/admin";
  }

  const selectedChat =
    data.chats.find((chat) => chat.id === selectedChatId) || null;

  const selectedMessages = selectedChat
    ? data.messages
        .filter((message) => message.chatId === selectedChat.id)
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() -
            new Date(b.createdAt).getTime()
        )
    : [];

  function participantNames(chat) {
    if (!chat?.participants?.length) return "—";

    return chat.participants
      .map(
        (participant) =>
          `${participant.name || "Unknown"}${
            participant.username
              ? ` (@${participant.username})`
              : ""
          }`
      )
      .join(", ");
  }

  function openConversation(chatId) {
    setSelectedChatId(chatId);
  }

  function closeConversation() {
    setSelectedChatId(null);
  }

  return (
    <div className="admin-page">
      <div className="admin-header">
        <div className="brand">
          <ShieldCheck size={22} color="#16a34a" />
          <span>Admin Panel</span>
        </div>

        <button
          className="btn-icon"
          onClick={handleLogout}
          title="Log out"
        >
          <LogOut size={20} />
        </button>
      </div>

      <div
        className="admin-search-wrap"
        style={{ marginBottom: 24 }}
      >
        <Search size={16} />
        <input
          className="admin-search"
          placeholder="Search users or conversations..."
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
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td>@{u.username}</td>
                    <td>
                      {u.created_at
                        ? new Date(u.created_at).toLocaleString()
                        : "—"}
                    </td>
                    <td>
                      {u.last_active
                        ? new Date(u.last_active).toLocaleString()
                        : "—"}
                    </td>
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

            <p
              style={{
                margin: "0 0 14px",
                color: "#64748b",
                fontSize: 14,
              }}
            >
              Click any conversation to open the complete communication
              between its participants. Text messages and sent media are
              shown inside the conversation.
            </p>

            <table>
              <thead>
                <tr>
                  <th>Conversation</th>
                  <th>Participants</th>
                  <th>Messages</th>
                  <th>Created</th>
                  <th>Last Activity</th>
                </tr>
              </thead>

              <tbody>
                {data.chats.map((c) => {
                  const messageCount = data.messages.filter(
                    (message) => message.chatId === c.id
                  ).length;

                  return (
                    <tr
                      key={c.id}
                      onClick={() => openConversation(c.id)}
                      style={{
                        cursor: "pointer",
                        background:
                          selectedChatId === c.id
                            ? "#f0fdf4"
                            : undefined,
                      }}
                      title="Click to view this conversation"
                    >
                      <td>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openConversation(c.id);
                          }}
                          style={{
                            border: 0,
                            background: "transparent",
                            padding: 0,
                            cursor: "pointer",
                            color: "#166534",
                            fontWeight: 700,
                          }}
                        >
                          {c.chatToken}
                        </button>
                      </td>

                      <td>{participantNames(c)}</td>

                      <td>{messageCount}</td>

                      <td>
                        {c.createdAt
                          ? new Date(c.createdAt).toLocaleString()
                          : "—"}
                      </td>

                      <td>
                        {c.lastActivity
                          ? new Date(c.lastActivity).toLocaleString()
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {data.chats.length === 0 && (
              <p className="empty-state">
                No conversations found.
              </p>
            )}
          </section>

          {selectedChat && (
            <section
              className="admin-section"
              style={{
                border: "2px solid #16a34a",
                borderRadius: 12,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 16,
                  padding: "16px 18px",
                  background: "#f0fdf4",
                  borderBottom: "1px solid #bbf7d0",
                }}
              >
                <div>
                  <h2 style={{ marginBottom: 5 }}>
                    <MessageSquare size={18} color="#16a34a" />{" "}
                    Conversation
                  </h2>

                  <div
                    style={{
                      color: "#475569",
                      fontSize: 14,
                    }}
                  >
                    {participantNames(selectedChat)}
                  </div>
                </div>

                <button
                  type="button"
                  className="btn"
                  onClick={closeConversation}
                >
                  Close
                </button>
              </div>

              <div
                style={{
                  padding: 18,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  maxHeight: 650,
                  overflowY: "auto",
                  background: "#f8fafc",
                }}
              >
                {selectedMessages.length === 0 ? (
                  <div className="empty-state">
                    <p>No messages have been sent in this conversation.</p>
                  </div>
                ) : (
                  selectedMessages.map((m) => (
                    <div
                      key={m.id}
                      style={{
                        background: "#fff",
                        border: "1px solid #e2e8f0",
                        borderRadius: 12,
                        padding: 14,
                        boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 12,
                          marginBottom: 7,
                          flexWrap: "wrap",
                        }}
                      >
                        <strong>
                          {m.senderName}
                          {m.senderUsername
                            ? ` (@${m.senderUsername})`
                            : ""}
                        </strong>

                        <span
                          style={{
                            color: "#64748b",
                            fontSize: 12,
                          }}
                        >
                          {m.createdAt
                            ? new Date(
                                m.createdAt
                              ).toLocaleString()
                            : "—"}
                        </span>
                      </div>

                      {m.message && (
                        <div
                          style={{
                            color: "#1e293b",
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                            lineHeight: 1.55,
                          }}
                        >
                          {m.message}
                        </div>
                      )}

                      {m.fileUrl && (
                        <div
                          style={{
                            marginTop: m.message ? 10 : 0,
                            padding: 10,
                            borderRadius: 8,
                            background: "#f1f5f9",
                          }}
                        >
                          <FileText
                            size={16}
                            style={{
                              verticalAlign: "middle",
                              marginRight: 7,
                            }}
                          />

                          <a
                            href={m.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              color: "#166534",
                              fontWeight: 600,
                            }}
                          >
                            {m.fileName || "Open attachment"}
                          </a>

                          {m.fileSize ? (
                            <span
                              style={{
                                marginLeft: 8,
                                color: "#64748b",
                                fontSize: 12,
                              }}
                            >
                              ({formatFileSize(m.fileSize)})
                            </span>
                          ) : null}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </section>
          )}

          <section className="admin-section">
            <h2>
              <FileText size={18} color="#16a34a" /> All Messages (
              {data.messages.length})
            </h2>

            <table>
              <thead>
                <tr>
                  <th>Sender</th>
                  <th>Conversation</th>
                  <th>Message</th>
                  <th>Attached File</th>
                  <th>Date</th>
                </tr>
              </thead>

              <tbody>
                {data.messages.map((m) => (
                  <tr
                    key={m.id}
                    onClick={() => openConversation(m.chatId)}
                    style={{
                      cursor: m.chatId ? "pointer" : "default",
                    }}
                    title={
                      m.chatId
                        ? "Click to open this conversation"
                        : undefined
                    }
                  >
                    <td>
                      {m.senderName} (@{m.senderUsername})
                    </td>

                    <td>{m.chatToken}</td>

                    <td
                      style={{
                        maxWidth: 420,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {m.message || "—"}
                    </td>

                    <td>
                      {m.fileName ? (
                        <a
                          href={m.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(event) =>
                            event.stopPropagation()
                          }
                        >
                          {m.fileName} (
                          {formatFileSize(m.fileSize || 0)})
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>

                    <td>
                      {m.createdAt
                        ? new Date(m.createdAt).toLocaleString()
                        : "—"}
                    </td>
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
