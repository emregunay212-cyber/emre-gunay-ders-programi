// Simple session auth using JWT in httpOnly cookie.
// Single admin password stored as env var.

import { SignJWT, jwtVerify } from "jose";

const COOKIE_NAME = "admin_session";
const TTL_HOURS = 12;

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    const err = new Error("JWT_SECRET_MISSING");
    err.code = "JWT_SECRET_MISSING";
    throw err;
  }
  return new TextEncoder().encode(secret);
}

export function getAdminPassword() {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw || pw.length < 4) {
    const err = new Error("ADMIN_PASSWORD_MISSING");
    err.code = "ADMIN_PASSWORD_MISSING";
    throw err;
  }
  return pw;
}

export async function issueSession() {
  const secret = getSecret();
  const jwt = await new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(TTL_HOURS + "h")
    .sign(secret);
  return jwt;
}

export async function verifySession(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload;
  } catch {
    return null;
  }
}

// ----- Cookie helpers for Vercel serverless (Node) handlers -----
export function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(/;\s*/)) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = decodeURIComponent(part.slice(0, idx).trim());
    const v = decodeURIComponent(part.slice(idx + 1).trim());
    out[k] = v;
  }
  return out;
}

export function buildCookie(token, { clear = false } = {}) {
  const maxAge = clear ? 0 : TTL_HOURS * 3600;
  const expires = clear ? "Expires=Thu, 01 Jan 1970 00:00:00 GMT;" : "";
  return [
    `${COOKIE_NAME}=${clear ? "" : token}`,
    `Path=/`,
    `HttpOnly`,
    `SameSite=Lax`,
    `Max-Age=${maxAge}`,
    `Secure`,
    expires,
  ].filter(Boolean).join("; ");
}

// Checks request for valid admin session. Returns payload or null.
export async function getSessionFromReq(req) {
  const cookies = parseCookies(req.headers.cookie || req.headers.Cookie);
  return await verifySession(cookies[COOKIE_NAME]);
}

// Middleware-like guard for admin-only routes.
// Returns true if OK; otherwise sends 401 and returns false.
export async function requireAdmin(req, res) {
  const session = await getSessionFromReq(req);
  if (!session || session.role !== "admin") {
    res.status(401).json({ error: "Yetkisiz" });
    return false;
  }
  return true;
}

export { COOKIE_NAME };
