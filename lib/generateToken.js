// Generates a secure, hard-to-guess random string for chat links.
// Uses Node's crypto module (cryptographically secure randomness),
// NOT Math.random(), and NOT a simple counter/sequential id.
import crypto from "crypto";

export function generateChatToken(length = 12) {
  // Base62-ish alphabet (no confusing look-alike characters like 0/O, 1/l)
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.randomBytes(length);
  let token = "";
  for (let i = 0; i < length; i++) {
    token += alphabet[bytes[i] % alphabet.length];
  }
  return token;
}
