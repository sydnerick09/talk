// POST /api/login
// Verifies a username + password against the stored bcrypt hash.
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { setSessionCookie } from "../../lib/session";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { username, password } = req.body || {};

  if (!username || !password) {
    return res
      .status(400)
      .json({ error: "Username and password are required." });
  }

  const cleanUsername = String(username).trim().toLowerCase();

  const { data: user, error } = await supabaseAdmin
    .from("users")
    .select("id, password_hash")
    .eq("username", cleanUsername)
    .maybeSingle();

  // Use the same generic error whether the username doesn't exist or the
  // password is wrong, so we don't reveal which usernames are registered.
  if (error || !user) {
    return res.status(401).json({ error: "Invalid username or password." });
  }

  const passwordMatches = await bcrypt.compare(
    String(password),
    user.password_hash
  );

  if (!passwordMatches) {
    return res.status(401).json({ error: "Invalid username or password." });
  }

  // Update last_active so the admin panel shows accurate activity.
  await supabaseAdmin
    .from("users")
    .update({ last_active: new Date().toISOString() })
    .eq("id", user.id);

  setSessionCookie(res, user.id);

  return res.status(200).json({ success: true });
}
