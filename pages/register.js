// "/register" — create a new account with Name, Username, Password only.
import { useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { getUserIdFromRequest } from "../lib/session";

export async function getServerSideProps({ req }) {
  const userId = getUserIdFromRequest(req);
  if (userId) {
    return { redirect: { destination: "/chat", permanent: false } };
  }
  return { props: {} };
}

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, username, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Registration failed.");
        setLoading(false);
        return;
      }

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
            <label htmlFor="name">Name</label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

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
              autoComplete="new-password"
              required
            />
          </div>

          {error && <p className="error-text">{error}</p>}

          <button type="submit" className="btn btn-block" disabled={loading}>
            {loading ? "Creating account..." : "Register"}
          </button>
        </form>

        <p className="helper-text">
          Already have an account?{" "}
          <Link
            href={{
              pathname: "/",
              query: router.query.returnTo
                ? { returnTo: router.query.returnTo }
                : {},
            }}
          >
            Log In
          </Link>
        </p>
      </div>
    </div>
  );
}
