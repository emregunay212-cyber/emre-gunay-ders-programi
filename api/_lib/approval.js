// Approval tokens — short-lived JWTs for "accept/reject lesson transfer" links.
// Different from admin session — these are single-purpose and can be opened by
// whoever receives the email/push (teacher usually, but anyone with the link).

import { SignJWT, jwtVerify } from "jose";

const ALG = "HS256";
const DEFAULT_TTL = "72h"; // link valid 3 days even though escalation is at 30 min

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    const err = new Error("JWT_SECRET_MISSING");
    err.code = "JWT_SECRET_MISSING";
    throw err;
  }
  return new TextEncoder().encode(secret);
}

// payload: { absenceId, lessonId, sub: substituteTeacherId, purpose: "approve" }
export async function signApprovalToken(payload, ttl = DEFAULT_TTL) {
  const jwt = await new SignJWT({ ...payload, purpose: "approve" })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(ttl)
    .sign(getSecret());
  return jwt;
}

export async function verifyApprovalToken(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (payload.purpose !== "approve") return null;
    return payload;
  } catch {
    return null;
  }
}
