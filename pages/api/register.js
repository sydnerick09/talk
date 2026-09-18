// POST /api/register
// Creates a new user account. Only name, username, and password are
// accepted — nothing else, as requested in the project spec.
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { setSessionCookie } from "../../lib/session";

const SALT_ROUNDS = 12; // a strong, appropriate bcrypt work factor

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { name, username, password } = req.body || {};

  // --- Basic input validation ---
  if (!name || !username || !password) {
    return res
      .status(400)
      .json({ error: "Name, username, and password are all required." });
  }

  const cleanName = String(name).trim();
  const cleanUsername = String(username).trim().toLowerCase();

  if (cleanName.length < 1 || cleanName.length > 60) {
    return res.status(400).json({ error: "Name looks invalid." });
  }

  if (!/^[a-z0-9_.]{3,20}$/.test(cleanUsername)) {
    return res.status(400).json({
      error:
        "Username must be 3-20 characters and can only contain letters, numbers, dots, and underscores.",
    });
  }

  if (String(password).length < 6) {
    return res
      .status(400)
      .json({ error: "Password must be at least 6 characters." });
  }

  // --- Check the username isn't already taken ---
  const { data: existing } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("username", cleanUsername)
    .maybeSingle();

  if (existing) {
    return res.status(409).json({ error: "That username is already taken." });
  }

  // --- Hash the password. We NEVER store plain-text passwords. ---
  const passwordHash = await bcrypt.hash(String(password), SALT_ROUNDS);

  const { data: user, error } = await supabaseAdmin
    .from("users")
    .insert({
      name: cleanName,
      username: cleanUsername,
      password_hash: passwordHash,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Register error:", error);
    return res.status(500).json({ error: "Could not create account." });
  }

  // Log the new user in right away.
  setSessionCookie(res, user.id);

  return res.status(200).json({ success: true });
}
