// POST /api/admin/logout
import { clearAdminSessionCookie } from "../../../lib/adminSession";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  clearAdminSessionCookie(res);
  return res.status(200).json({ success: true });
}
