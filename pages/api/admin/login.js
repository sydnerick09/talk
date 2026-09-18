// POST /api/admin/login
// Very simple admin login: compares against ADMIN_USERNAME / ADMIN_PASSWORD
// in .env.local. No database row for "admin" — this keeps the admin
// account completely separate from regular users.
import { setAdminSessionCookie } from "../../../lib/adminSession";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { username, password } = req.body || {};

  const validUsername = process.env.ADMIN_USERNAME;
  const validPassword = process.env.ADMIN_PASSWORD;

  if (
    !username ||
    !password ||
    username !== validUsername ||
    password !== validPassword
  ) {
    return res.status(401).json({ error: "Invalid admin credentials." });
  }

  setAdminSessionCookie(res);
  return res.status(200).json({ success: true });
}
