// Consolidated push endpoint.
//   GET  /api/push?action=vapid-key        → public VAPID key
//   POST /api/push?action=subscribe        → add subscription to a teacher
//   POST /api/push?action=unsubscribe      → remove a subscription
//   POST /api/push?action=check            → is this endpoint registered for this teacher?
//   POST /api/push?action=reset-all        → admin: clear all subscriptions (cleanup)
import { loadAll, saveTeachers } from "./_lib/seed.js";
import { getVapidPublicKey } from "./_lib/notify.js";
import { requireAdmin } from "./_lib/auth.js";
import { readJsonBody, methodNotAllowed, badRequest, serverError } from "./_lib/util.js";

export default async function handler(req, res) {
  try {
    const action = (req.query && req.query.action) || "";
    if (req.method === "GET" && action === "vapid-key") {
      const key = getVapidPublicKey();
      if (!key) return res.status(503).json({ error: "VAPID_PUBLIC_KEY env var tanımlı değil" });
      res.setHeader("Cache-Control", "public, s-maxage=3600");
      return res.status(200).json({ publicKey: key });
    }
    if (req.method === "POST" && action === "subscribe") {
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

      // One endpoint = one teacher. If another teacher previously subscribed
      // with this same browser/device, claim the endpoint for the new teacher
      // so notifications don't leak across accounts on the same device.
      for (let i = 0; i < teachers.length; i++) {
        if (i === idx) continue;
        if (!Array.isArray(teachers[i].pushSubscriptions)) continue;
        teachers[i].pushSubscriptions = teachers[i].pushSubscriptions.filter(
          s => s.endpoint !== sub.endpoint
        );
      }

      if (!Array.isArray(teachers[idx].pushSubscriptions)) teachers[idx].pushSubscriptions = [];
      const existing = teachers[idx].pushSubscriptions.findIndex(s => s.endpoint === sub.endpoint);
      const clean = { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } };
      if (existing >= 0) teachers[idx].pushSubscriptions[existing] = clean;
      else teachers[idx].pushSubscriptions.push(clean);
      await saveTeachers(teachers);
      return res.status(200).json({ ok: true, count: teachers[idx].pushSubscriptions.length });
    }
    if (req.method === "POST" && action === "check") {
      // Reports whether THIS endpoint is registered for THIS teacher's
      // slug on the server. Used by the UI to render "Bildirim açık"
      // only when both browser and server agree; otherwise the button
      // shows "Bildirim aç" (no silent resync that could steal the
      // endpoint from another teacher).
      const body = await readJsonBody(req);
      const slug = typeof body.teacherSlug === "string" ? body.teacherSlug : "";
      const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
      if (!slug || !endpoint) return badRequest(res, "teacherSlug ve endpoint gerekli");
      const { teachers } = await loadAll();
      const t = teachers.find(x => x.slug === slug);
      if (!t) return res.status(404).json({ error: "Öğretmen bulunamadı" });
      const subscribed = Array.isArray(t.pushSubscriptions)
        && t.pushSubscriptions.some(s => s.endpoint === endpoint);
      return res.status(200).json({ subscribed });
    }
    if (req.method === "POST" && action === "reset-all") {
      if (!(await requireAdmin(req, res))) return;
      const { teachers } = await loadAll();
      let cleared = 0;
      for (const t of teachers) {
        if (Array.isArray(t.pushSubscriptions) && t.pushSubscriptions.length > 0) {
          cleared += t.pushSubscriptions.length;
          t.pushSubscriptions = [];
        }
      }
      await saveTeachers(teachers);
      return res.status(200).json({ ok: true, cleared });
    }
    if (req.method === "POST" && action === "unsubscribe") {
      const body = await readJsonBody(req);
      const slug = typeof body.teacherSlug === "string" ? body.teacherSlug : "";
      const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
      if (!slug || !endpoint) return badRequest(res, "teacherSlug ve endpoint gerekli");
      const { teachers } = await loadAll();
      const idx = teachers.findIndex(t => t.slug === slug);
      if (idx === -1) return res.status(404).json({ error: "Öğretmen bulunamadı" });
      if (!Array.isArray(teachers[idx].pushSubscriptions)) teachers[idx].pushSubscriptions = [];
      teachers[idx].pushSubscriptions = teachers[idx].pushSubscriptions.filter(s => s.endpoint !== endpoint);
      await saveTeachers(teachers);
      return res.status(200).json({ ok: true, count: teachers[idx].pushSubscriptions.length });
    }
    return methodNotAllowed(res, "GET, POST");
  } catch (err) {
    return serverError(res, err);
  }
}
