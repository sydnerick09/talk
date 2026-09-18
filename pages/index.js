// The homepage ("/") is the LOGIN page.
import { useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { getUserIdFromRequest } from "../lib/session";

// If the user is already logged in, skip straight to the chat dashboard.
export async function getServerSideProps({ req }) {
  const userId = getUserIdFromRequest(req);
  if (userId) {
    return { redirect: { destination: "/chat", permanent: false } };
  }
  return { props: {} };
}

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/login", {
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

      // If they arrived via a chat link, send them back to it after login.
      const returnTo = router.query.returnTo;
      router.push(typeof returnTo === "string" ? returnTo : "/chat");
    } catch (err) {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="page-center">
      <div className="card">
        <div className="brand">
          <MessageCircle size={24} color="#16a34a" />
          <span>Simple Chat</span>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          {error && <p className="error-text">{error}</p>}

          <button type="submit" className="btn btn-block" disabled={loading}>
            {loading ? "Logging in..." : "Log In"}
          </button>
        </form>

        <p className="helper-text">
          Don&apos;t have an account?{" "}
          <Link
            href={{
              pathname: "/register",
              query: router.query.returnTo
                ? { returnTo: router.query.returnTo }
                : {},
            }}
          >
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}
