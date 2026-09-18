// Very simple session handling for the ADMIN panel, kept separate from user
// sessions on purpose so an admin login is never confused with a regular
// user login. Admin credentials live in .env.local (ADMIN_USERNAME /
// ADMIN_PASSWORD) — there's no admin row in the database.
import jwt from "jsonwebtoken";
import { serialize, parse } from "cookie";

const ADMIN_COOKIE_NAME = "chat_admin_session";
const ADMIN_MAX_AGE = 60 * 60 * 8; // 8 hours

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not set in your .env.local file");
  }
  return secret;
}

export function setAdminSessionCookie(res) {
  const token = jwt.sign({ admin: true }, getSecret(), {
    expiresIn: ADMIN_MAX_AGE,
  });

  const cookie = serialize(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ADMIN_MAX_AGE,
  });

  res.setHeader("Set-Cookie", cookie);
}

export function clearAdminSessionCookie(res) {
  const cookie = serialize(ADMIN_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  res.setHeader("Set-Cookie", cookie);
}

export function isAdminRequest(req) {
  const cookies = req.headers.cookie ? parse(req.headers.cookie) : {};
  const token = cookies[ADMIN_COOKIE_NAME];
  if (!token) return false;

  try {
    const payload = jwt.verify(token, getSecret());
    return payload.admin === true;
  } catch (err) {
    return false;
  }
}
