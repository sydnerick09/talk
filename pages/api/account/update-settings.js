// POST /api/account/update-settings
// Lets the signed-in client securely change their username and/or password.
import bcrypt from "bcryptjs";
import { getUserIdFromRequest } from "../../../lib/session";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

const SALT_ROUNDS = 12;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const userId = getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({ error: "Please log in first." });
  }

  const {
    currentPassword,
    username,
    newPassword,
  } = req.body || {};

  if (!currentPassword) {
    return res.status(400).json({ error: "Enter your current password." });
  }

  const wantsUsername = username !== undefined && String(username).trim() !== "";
  const wantsPassword = newPassword !== undefined && String(newPassword) !== "";

  if (!wantsUsername && !wantsPassword) {
    return res.status(400).json({ error: "Make a username or password change first." });
  }

  const { data: user, error: userError } = await supabaseAdmin
    .from("users")
    .select("id, username, password_hash")
    .eq("id", userId)
    .maybeSingle();

  if (userError || !user) {
    return res.status(401).json({ error: "Your account could not be found." });
  }

  const passwordMatches = await bcrypt.compare(
    String(currentPassword),
    user.password_hash
  );

  if (!passwordMatches) {
    return res.status(400).json({ error: "Your current password is incorrect." });
  }

  const updates = {};

  if (wantsUsername) {
    const cleanUsername = String(username).trim().toLowerCase();

    if (!/^[a-z0-9_.]{3,20}$/.test(cleanUsername)) {
      return res.status(400).json({
        error:
          "Username must be 3-20 characters and can only contain letters, numbers, dots, and underscores.",
      });
    }

    if (cleanUsername !== user.username) {
      const { data: existing } = await supabaseAdmin
        .from("users")
        .select("id")
        .eq("username", cleanUsername)
        .neq("id", userId)
        .maybeSingle();

      if (existing) {
        return res.status(409).json({ error: "That username is already taken." });
      }

      updates.username = cleanUsername;
    }
  }

  if (wantsPassword) {
    const cleanPassword = String(newPassword);

    if (cleanPassword.length < 6) {
      return res.status(400).json({
        error: "New password must be at least 6 characters.",
      });
    }

    updates.password_hash = await bcrypt.hash(cleanPassword, SALT_ROUNDS);
  }

  if (Object.keys(updates).length === 0) {
    return res.status(200).json({
      success: true,
      message: "No changes were needed.",
      user: { username: user.username },
    });
  }

  const { data: updatedUser, error: updateError } = await supabaseAdmin
    .from("users")
    .update({
      ...updates,
      last_active: new Date().toISOString(),
    })
    .eq("id", userId)
    .select("id, name, username")
    .single();

  if (updateError) {
    console.error("Update account settings error:", updateError);
    return res.status(500).json({ error: "Could not update your account." });
  }

  return res.status(200).json({
    success: true,
    message: "Account settings updated successfully.",
    user: updatedUser,
  });
}
