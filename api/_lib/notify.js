// Notification helpers: Web Push (web-push) + Email (Resend).
// Both degrade gracefully — if API keys are missing, they log and return false.

import webpush from "web-push";
import { Resend } from "resend";

// ---------- Web Push ----------
let vapidConfigured = false;
function ensureVapid() {
  if (vapidConfigured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";
  if (!pub || !priv) return false;
  try {
    webpush.setVapidDetails(subject, pub, priv);
    vapidConfigured = true;
    return true;
  } catch (e) {
    console.error("VAPID config error:", e);
    return false;
  }
}

export function getVapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || "";
}

// Send to a single subscription. Returns { ok, gone } where gone=true means
// subscription is no longer valid (410/404) — caller should remove it.
export async function sendPushOne(subscription, payload) {
  if (!ensureVapid()) return { ok: false, gone: false, error: "no-vapid" };
  try {
    const body = typeof payload === "string" ? payload : JSON.stringify(payload);
    await webpush.sendNotification(subscription, body);
    return { ok: true, gone: false };
  } catch (err) {
    const code = err && err.statusCode;
    const gone = code === 404 || code === 410;
    if (!gone) console.error("Push error:", code, err && err.body);
    return { ok: false, gone, error: "http-" + (code || "?") };
  }
}

// Send to all subscriptions of a teacher; returns { sent, failed, goneEndpoints[] }.
export async function sendPushToTeacher(teacher, payload) {
  const subs = (teacher && teacher.pushSubscriptions) || [];
  let sent = 0, failed = 0;
  const gone = [];
  for (const sub of subs) {
    const r = await sendPushOne(sub, payload);
    if (r.ok) sent++;
    else {
      failed++;
      if (r.gone) gone.push(sub.endpoint);
    }
  }
  return { sent, failed, gone };
}

// ---------- Email (Resend) ----------
let _resend = null;
function getResend() {
  if (_resend) return _resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  _resend = new Resend(key);
  return _resend;
}

export async function sendEmail({ to, subject, html, text }) {
  const client = getResend();
  if (!client) return { ok: false, error: "no-api-key" };
  if (!to) return { ok: false, error: "no-recipient" };
  const from = process.env.FROM_EMAIL || "BT Ders Programı <onboarding@resend.dev>";
  try {
    const { data, error } = await client.emails.send({ from, to, subject, html, text });
    if (error) {
      console.error("Resend error:", error);
      return { ok: false, error: String(error.message || error) };
    }
    return { ok: true, id: data && data.id };
  } catch (err) {
    console.error("Email send error:", err);
    return { ok: false, error: String(err && err.message || err) };
  }
}

// ---------- Convenience: remove gone subscriptions from a teacher record ----------
export function pruneGoneSubscriptions(teacher, goneEndpoints) {
  if (!teacher || !Array.isArray(teacher.pushSubscriptions)) return teacher;
  if (!goneEndpoints || !goneEndpoints.length) return teacher;
  const goneSet = new Set(goneEndpoints);
  teacher.pushSubscriptions = teacher.pushSubscriptions.filter(s => !goneSet.has(s.endpoint));
  return teacher;
}
