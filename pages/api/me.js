// GET /api/me — returns the currently logged-in user's basic info.
// Used by pages to know who's logged in without ever sending the password
// hash to the browser.
import { getUserIdFromRequest } from "../../lib/session";
import { supabaseAdmin } from "../../lib/supabaseAdmin";

export default async function handler(req, res) {
  const userId = getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({ error: "Not logged in" });
  }

  const { data: user, error } = await supabaseAdmin
    .from("users")
    .select("id, name, username")
    .eq("id", userId)
    .maybeSingle();

  if (error || !user) {
    return res.status(401).json({ error: "Not logged in" });
  }

  return res.status(200).json({ user });
}
