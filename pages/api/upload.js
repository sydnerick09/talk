// POST /api/upload
// Handles file uploads (images + documents) for chat messages.
//
// To keep things simple (no extra parsing libraries needed), the browser
// sends the file as a base64 string inside a normal JSON request. The
// server decodes it, validates it again (never trust the browser!), and
// uploads it to Supabase Storage.
import { getUserIdFromRequest } from "../../lib/session";
import { supabaseAdmin } from "../../lib/supabaseAdmin";
import {
  MAX_FILE_SIZE_BYTES,
  isAllowedFileType,
} from "../../lib/fileValidation";

// Base64 text is ~33% bigger than the raw file, so allow a bit of headroom
// above the 5MB file limit for the JSON request body itself.
export const config = {
  api: {
    bodyParser: {
      sizeLimit: "8mb",
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const userId = getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({ error: "Please log in first." });
  }

  const { chatToken, fileName, fileType, fileBase64 } = req.body || {};

  if (!chatToken || !fileName || !fileType || !fileBase64) {
    return res.status(400).json({ error: "Missing file information." });
  }

  // Confirm the user belongs to this chat before accepting the upload.
  const { data: chat } = await supabaseAdmin
    .from("chats")
    .select("id")
    .eq("chat_token", chatToken)
    .maybeSingle();

  if (!chat) {
    return res.status(404).json({ error: "Chat not found." });
  }

  const { data: membership } = await supabaseAdmin
    .from("chat_members")
    .select("id")
    .eq("chat_id", chat.id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!membership) {
    return res.status(403).json({ error: "You are not part of this chat." });
  }

  // --- Validate file type ---
  if (!isAllowedFileType(fileType)) {
    return res.status(400).json({ error: "That file type isn't allowed." });
  }

  // --- Decode and validate file size (server-side is the real check) ---
  const base64Data = fileBase64.includes(",")
    ? fileBase64.split(",")[1] // strip "data:...;base64," prefix if present
    : fileBase64;
  const fileBuffer = Buffer.from(base64Data, "base64");

  if (fileBuffer.length > MAX_FILE_SIZE_BYTES) {
    return res.status(400).json({ error: "File must be 5 MB or smaller." });
  }

  // Build a random, collision-safe path so files can't overwrite each other
  // or be guessed.
  const safeName = String(fileName).replace(/[^a-zA-Z0-9_.-]/g, "_");
  const storagePath = `${chat.id}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}-${safeName}`;

  const bucket = process.env.NEXT_PUBLIC_STORAGE_BUCKET || "chat-files";

  const { error: uploadError } = await supabaseAdmin.storage
    .from(bucket)
    .upload(storagePath, fileBuffer, {
      contentType: fileType,
      upsert: false,
    });

  if (uploadError) {
    console.error("Upload error:", uploadError);
    return res.status(500).json({ error: "Could not upload file." });
  }

  const { data: publicUrlData } = supabaseAdmin.storage
    .from(bucket)
    .getPublicUrl(storagePath);

  return res.status(200).json({
    fileUrl: publicUrlData.publicUrl,
    fileName: String(fileName),
    fileType,
    fileSize: fileBuffer.length,
  });
}
