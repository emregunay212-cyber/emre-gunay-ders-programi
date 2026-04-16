// POST /api/approve { token, decision: "approve"|"reject" }
// Validates JWT, updates the lessonOverride's status, returns success.
// Also GET with ?token=... returns the lesson + teacher info for display.

import { loadAll, saveAbsences } from "./_lib/seed.js";
import { verifyApprovalToken } from "./_lib/approval.js";
import { readJsonBody, methodNotAllowed, badRequest, serverError } from "./_lib/util.js";
import { sendPushToTeacher, sendEmail } from "./_lib/notify.js";

const GUN_AD = ["Pazar","Pazartesi","Salı","Çarşamba","Perşembe","Cuma","Cumartesi"];
const AY_AD  = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];
function fmtDateTR(iso) {
  const d = new Date(iso + "T12:00:00Z");
  return d.getUTCDate() + " " + AY_AD[d.getUTCMonth()] + " " + GUN_AD[d.getUTCDay()];
}

function findContext(data, token) {
  const { absences, teachers, lessons } = data;
  const absence = absences.find(a => a.id === token.absenceId);
  if (!absence) return null;
  const ov = absence.lessonOverrides.find(o => o.lessonId === token.lessonId && o.action === "transfer");
  if (!ov) return null;
  const lesson = lessons.find(l => l.id === token.lessonId);
  const absent = teachers.find(t => t.id === absence.teacherId);
  const sub = teachers.find(t => t.id === ov.substituteTeacherId);
  return { absence, override: ov, lesson, absent, sub };
}

async function notifyAdminOfResponse({ ctx, decision, teachers }) {
  const adminSlug = process.env.ADMIN_TEACHER_SLUG || "emre";
  const admin = teachers.find(t => t.slug === adminSlug);
  if (!admin) return;
  const dateTR = fmtDateTR(ctx.absence.date);
  const verb = decision === "approve" ? "ONAYLADI" : "REDDETTİ";
  const title = `${ctx.sub.name} ${verb.toLowerCase()} · ders devri`;
  const body = `${dateTR} ${ctx.lesson.bas} ${ctx.lesson.ad} (${ctx.absent.name} → ${ctx.sub.name})`;
  const appUrl = process.env.APP_URL || "";
  const adminUrl = appUrl + "/admin.html";

  await sendPushToTeacher(admin, {
    title, body, url: adminUrl,
    tag: "response-" + ctx.override.lessonId + "-" + ctx.absence.date,
  }).catch(() => {});

  if (admin.email) {
    const html = `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;background:#0a0b12;color:#f0f2f7;padding:20px;">
  <div style="max-width:460px;margin:0 auto;background:#14161f;border:1px solid #262a38;border-radius:14px;padding:26px;">
    <div style="font-family:ui-monospace,monospace;font-size:10px;letter-spacing:0.24em;text-transform:uppercase;color:${decision === "approve" ? "#34d399" : "#f87171"};font-weight:700;margin-bottom:8px;">Ders Devri ${verb}</div>
    <p style="color:#f0f2f7;font-size:14px;line-height:1.6;margin:0 0 12px;">${ctx.sub.name} hoca, ${ctx.absent.name} hocanın ${dateTR} ${ctx.lesson.bas}-${ctx.lesson.bit} <strong>${ctx.lesson.ad}</strong> dersini <strong>${verb.toLowerCase()}</strong>.</p>
    ${decision === "reject" ? `<p style="color:#f87171;font-size:13px;margin:12px 0;">Lütfen admin panelinden yeni bir yedek atayın veya dersi iptal edin.</p>` : ``}
    <a href="${adminUrl}" style="display:inline-block;background:#fbbf24;color:#1a1205;font-weight:700;padding:10px 18px;border-radius:8px;text-decoration:none;margin-top:8px;">Admin Panel →</a>
  </div>
</body></html>`;
    await sendEmail({ to: admin.email, subject: title, html, text: body + "\n\n" + adminUrl }).catch(() => {});
  }
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const token = req.query && req.query.token;
      const payload = await verifyApprovalToken(token);
      if (!payload) return res.status(400).json({ error: "Geçersiz veya süresi dolmuş bağlantı" });
      const data = await loadAll();
      const ctx = findContext(data, payload);
      if (!ctx) return res.status(404).json({ error: "Devir kaydı bulunamadı" });
      return res.status(200).json({
        absence: { id: ctx.absence.id, date: ctx.absence.date },
        lesson: { id: ctx.lesson.id, ad: ctx.lesson.ad, bas: ctx.lesson.bas, bit: ctx.lesson.bit, gun: ctx.lesson.gun, lab: ctx.lesson.lab, kademe: ctx.lesson.kademe },
        absent: { name: ctx.absent.name, slug: ctx.absent.slug },
        substitute: { name: ctx.sub.name, slug: ctx.sub.slug },
        status: ctx.override.status,
        respondedAt: ctx.override.respondedAt || null,
      });
    }

    if (req.method === "POST") {
      const body = await readJsonBody(req);
      const token = body.token || (req.query && req.query.token);
      const decision = body.decision;
      if (!["approve", "reject"].includes(decision)) return badRequest(res, "decision approve veya reject olmalı");
      const payload = await verifyApprovalToken(token);
      if (!payload) return res.status(400).json({ error: "Geçersiz veya süresi dolmuş bağlantı" });
      const data = await loadAll();
      const ctx = findContext(data, payload);
      if (!ctx) return res.status(404).json({ error: "Devir kaydı bulunamadı" });

      if (ctx.override.status !== "pending") {
        // already decided — return current state, don't error out
        return res.status(200).json({
          ok: true,
          already: true,
          status: ctx.override.status,
          respondedAt: ctx.override.respondedAt,
        });
      }

      ctx.override.status = decision === "approve" ? "approved" : "rejected";
      ctx.override.respondedAt = new Date().toISOString();
      await saveAbsences(data.absences);

      // Notify admin of response (best effort)
      notifyAdminOfResponse({ ctx, decision, teachers: data.teachers }).catch(() => {});

      return res.status(200).json({ ok: true, status: ctx.override.status });
    }

    return methodNotAllowed(res, "GET, POST");
  } catch (err) {
    return serverError(res, err);
  }
}
