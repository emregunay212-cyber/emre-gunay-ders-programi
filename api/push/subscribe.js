// POST /api/push/subscribe  { teacherSlug, subscription }
// Stores a browser push subscription on a teacher record.
// Anyone can subscribe to any teacher by design (small trusted school team).

import { loadAll, saveTeachers } from "../_lib/seed.js";
import { readJsonBody, methodNotAllowed, badRequest, serverError } from "../_lib/util.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, "POST");
  try {
    const body = await readJsonBody(req);
    const slug = typeof body.teacherSlug === "string" ? body.teacherSlug : "";
    const sub = body.subscription;
    if (!slug) return badRequest(res, "teacherSlug gerekli");
    if (!sub || typeof sub !== "object" || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
      return badRequest(res, "Geçersiz subscription");
    }

    const { teachers } = await loadAll();
    const idx = teachers.findIndex(t => t.slug === slug);
    if (idx === -1) return res.status(404).json({ error: "Öğretmen bulunamadı" });

    if (!Array.isArray(teachers[idx].pushSubscriptions)) teachers[idx].pushSubscriptions = [];
    const existing = teachers[idx].pushSubscriptions.findIndex(s => s.endpoint === sub.endpoint);
    const clean = { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } };
    if (existing >= 0) teachers[idx].pushSubscriptions[existing] = clean;
    else teachers[idx].pushSubscriptions.push(clean);

    await saveTeachers(teachers);
    return res.status(200).json({ ok: true, count: teachers[idx].pushSubscriptions.length });
  } catch (err) {
    return serverError(res, err);
  }
}
