// Simple session handling for the USER login system, using a signed JWT
// stored in an httpOnly cookie. httpOnly means client-side JavaScript can
// never read the cookie, which protects it from being stolen via XSS.
import jwt from "jsonwebtoken";
import { serialize, parse } from "cookie";

const SESSION_COOKIE_NAME = "chat_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days, in seconds

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not set in your .env.local file");
  }
  return secret;
}

// Create a signed token for a given user id and set it as a cookie on the
// response. Call this right after a successful register/login.
export function setSessionCookie(res, userId) {
  const token = jwt.sign({ userId }, getSecret(), {
    expiresIn: SESSION_MAX_AGE,
  });

  const cookie = serialize(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });

  res.setHeader("Set-Cookie", cookie);
}

// Remove the session cookie (logout).
export function clearSessionCookie(res) {
  const cookie = serialize(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  res.setHeader("Set-Cookie", cookie);
}

// Read the logged-in user's id from the request's cookies.
// Returns null if there is no valid session.
export function getUserIdFromRequest(req) {
  const cookies = req.headers.cookie ? parse(req.headers.cookie) : {};
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) return null;

  try {
    const payload = jwt.verify(token, getSecret());
    return payload.userId;
  } catch (err) {
    // Invalid or expired token
    return null;
  }
}
