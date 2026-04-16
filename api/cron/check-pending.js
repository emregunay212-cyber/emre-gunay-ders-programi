// Vercel Cron endpoint — runs every 5 minutes.
// Scans all absences for PENDING transfer overrides whose notifiedAt is older
// than 30 minutes and haven't been escalated yet. For each, sends admin a push
// + email and marks adminEscalatedAt so it isn't re-sent.
//
// Vercel auto-sends a header `x-vercel-cron: 1` for cron invocations; we also
// accept an Authorization: Bearer CRON_SECRET for manual testing.

import { loadAll, saveAbsences } from "../_lib/seed.js";
import { sendPushToTeacher, sendEmail } from "../_lib/notify.js";

const TIMEOUT_MIN = 30;
const GUN_AD = ["Pazar","Pazartesi","Salı","Çarşamba","Perşembe","Cuma","Cumartesi"];
const AY_AD  = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];
function fmtDateTR(iso) {
  const d = new Date(iso + "T12:00:00Z");
  return d.getUTCDate() + " " + AY_AD[d.getUTCMonth()] + " " + GUN_AD[d.getUTCDay()];
}

async function isAuthed(req) {
  // Vercel cron invocation
  if (req.headers["x-vercel-cron"]) return true;
  // Optional shared secret for external cron services / manual testing
  const auth = req.headers.authorization || "";
  const secret = process.env.CRON_SECRET;
  if (secret && auth === "Bearer " + secret) return true;
  // Admin session: the admin panel calls this on load as a poor-man's cron
  // (Hobby plan limits us to 1 cron/day; delegating to admin panel is fine).
  try {
    const { getSessionFromReq } = await import("../_lib/auth.js");
    const session = await getSessionFromReq(req);
    if (session && session.role === "admin") return true;
  } catch {}
  return false;
}

export default async function handler(req, res) {
  if (!(await isAuthed(req))) return res.status(401).json({ error: "Unauthorized" });

  try {
    const data = await loadAll();
    const { teachers, lessons, absences } = data;
    const adminSlug = process.env.ADMIN_TEACHER_SLUG || "emre";
    const admin = teachers.find(t => t.slug === adminSlug);
    if (!admin) return res.status(200).json({ ok: true, escalated: 0, reason: "admin teacher not found" });

    const appUrl = process.env.APP_URL || "";
    const adminUrl = appUrl + "/admin.html";
    const now = Date.now();
    const escalated = [];
    let mutated = false;

    for (const ab of absences) {
      for (const ov of (ab.lessonOverrides || [])) {
        if (ov.action !== "transfer") continue;
        if (ov.status !== "pending") continue;
        if (ov.adminEscalatedAt) continue;
        if (!ov.notifiedAt) continue;
        const notifiedMs = new Date(ov.notifiedAt).getTime();
        if (isNaN(notifiedMs)) continue;
        if (now - notifiedMs < TIMEOUT_MIN * 60 * 1000) continue;

        // Escalate
        const lesson = lessons.find(l => l.id === ov.lessonId);
        const substitute = teachers.find(t => t.id === ov.substituteTeacherId);
        const absent = teachers.find(t => t.id === ab.teacherId);
        if (!lesson || !substitute || !absent) continue;

        const dateTR = fmtDateTR(ab.date);
        const title = "⚠ Onay 30 dk içinde gelmedi";
        const body = `${substitute.name} hoca, ${absent.name} hocanın ${dateTR} ${lesson.bas} ${lesson.ad} dersini henüz onaylamadı.`;

        // Admin push
        await sendPushToTeacher(admin, {
          title, body, url: adminUrl,
          requireInteraction: true,
          tag: "escalation-" + ov.lessonId + "-" + ab.date,
        }).catch(() => {});

        // Admin email
        if (admin.email) {
          const html = `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;background:#0a0b12;color:#f0f2f7;padding:20px;">
  <div style="max-width:460px;margin:0 auto;background:#14161f;border:1px solid #262a38;border-radius:14px;padding:26px;">
    <div style="font-family:ui-monospace,monospace;font-size:10px;letter-spacing:0.24em;text-transform:uppercase;color:#fb923c;font-weight:700;margin-bottom:8px;">Onay Bekleniyor · 30 dk aşıldı</div>
    <p style="color:#f0f2f7;font-size:14px;line-height:1.6;margin:0 0 12px;"><strong>${substitute.name}</strong> hoca, <strong>${absent.name}</strong> hocanın <strong>${dateTR} ${lesson.bas}-${lesson.bit} ${lesson.ad}</strong> dersini henüz onaylamadı.</p>
    <p style="color:#868ca3;font-size:13px;margin:12px 0;">Lütfen admin panelinden başka bir yedek ata veya dersi iptal et.</p>
    <a href="${adminUrl}" style="display:inline-block;background:#fbbf24;color:#1a1205;font-weight:700;padding:10px 18px;border-radius:8px;text-decoration:none;margin-top:8px;">Admin Panel →</a>
  </div>
</body></html>`;
          await sendEmail({ to: admin.email, subject: title, html, text: body + "\n\n" + adminUrl }).catch(() => {});
        }

        ov.adminEscalatedAt = new Date().toISOString();
        escalated.push({ absenceId: ab.id, lessonId: ov.lessonId, substitute: substitute.name });
        mutated = true;
      }
    }

    if (mutated) await saveAbsences(absences);

    return res.status(200).json({ ok: true, escalated: escalated.length, items: escalated });
  } catch (err) {
    console.error("cron check-pending error:", err);
    return res.status(500).json({ error: "cron-failed" });
  }
}
