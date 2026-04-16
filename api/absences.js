// GET → list absences (admin), POST → create absence record (admin)
// POST triggers: approval tokens + push + email for each transfer override.
import { loadAll, saveAbsences, saveTeachers, nextId } from "./_lib/seed.js";
import { requireAdmin } from "./_lib/auth.js";
import { readJsonBody, methodNotAllowed, badRequest, serverError } from "./_lib/util.js";
import { signApprovalToken } from "./_lib/approval.js";
import { sendPushToTeacher, sendEmail, pruneGoneSubscriptions } from "./_lib/notify.js";

const GUN_AD = ["Pazar","Pazartesi","Salı","Çarşamba","Perşembe","Cuma","Cumartesi"];
const AY_AD  = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];

function fmtDateTR(iso) {
  const d = new Date(iso + "T12:00:00Z");
  return d.getUTCDate() + " " + AY_AD[d.getUTCMonth()] + " " + GUN_AD[d.getUTCDay()];
}

function validateAbsence(input, teachers, lessons) {
  const errs = [];
  const out = {};
  if (!input || typeof input !== "object") return { errs: ["Invalid payload"] };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) errs.push("date YYYY-MM-DD olmalı");
  else out.date = input.date;

  if (typeof input.teacherId !== "string" || !teachers.find(t => t.id === input.teacherId)) {
    errs.push("Geçersiz teacherId");
  } else out.teacherId = input.teacherId;

  out.note = typeof input.note === "string" ? input.note.trim() : "";

  if (!Array.isArray(input.lessonOverrides)) {
    errs.push("lessonOverrides array olmalı");
  } else {
    out.lessonOverrides = [];
    for (const ov of input.lessonOverrides) {
      if (!ov || typeof ov !== "object") continue;
      const lesson = lessons.find(l => l.id === ov.lessonId);
      if (!lesson) { errs.push("Ders bulunamadı: " + ov.lessonId); continue; }
      if (lesson.teacherId !== out.teacherId) {
        errs.push("Ders başka öğretmene ait: " + ov.lessonId);
        continue;
      }
      if (ov.action === "cancel") {
        out.lessonOverrides.push({ lessonId: ov.lessonId, action: "cancel", status: "auto" });
      } else if (ov.action === "transfer") {
        if (!teachers.find(t => t.id === ov.substituteTeacherId)) {
          errs.push("Yedek öğretmen geçersiz: " + ov.substituteTeacherId);
          continue;
        }
        if (ov.substituteTeacherId === out.teacherId) {
          errs.push("Yedek aynı öğretmen olamaz");
          continue;
        }
        out.lessonOverrides.push({
          lessonId: ov.lessonId,
          action: "transfer",
          substituteTeacherId: ov.substituteTeacherId,
          status: "pending",
          notifiedAt: null,
          approvalToken: null,
        });
      } else {
        errs.push("Geçersiz action (cancel/transfer): " + ov.lessonId);
      }
    }
  }
  return { errs, out };
}

async function notifySubstitute({ absence, override, absentTeacher, substitute, lesson }) {
  const appUrl = process.env.APP_URL || "";
  const approvalUrl = (appUrl || "") + "/onay.html?token=" + encodeURIComponent(override.approvalToken);
  const dateTR = fmtDateTR(absence.date);
  const subject = `Ders devri onayı · ${dateTR}`;

  // ---- Push
  const pushPayload = {
    title: "Ders devri · Onay bekleniyor",
    body: `${dateTR} · ${lesson.bas} ${lesson.ad} dersi ${absentTeacher.name} hocadan sana devrediliyor.`,
    url: approvalUrl,
    token: override.approvalToken, // SW calls /api/approve directly on action click
    requireInteraction: true,
    tag: "approval-" + override.lessonId + "-" + absence.date,
    // Order matters: some Android/Chrome builds render action buttons
    // in reverse visual order relative to the array, which has caused
    // users to reliably tap "Onayla" and receive event.action="reject".
    // Putting reject first trades nothing (user reads the title, not
    // the position) and heals devices with that mapping quirk.
    actions: [
      { action: "reject",  title: "✗ REDDET" },
      { action: "approve", title: "✓ ONAYLA" },
    ],
  };
  const pushResult = await sendPushToTeacher(substitute, pushPayload).catch(() => ({ sent: 0, failed: 0, gone: [] }));

  // ---- Email
  let emailResult = { ok: false, error: "no-email" };
  if (substitute.email) {
    const html = `
<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;background:#0a0b12;color:#f0f2f7;margin:0;padding:20px;">
  <div style="max-width:480px;margin:0 auto;background:#14161f;border:1px solid #262a38;border-radius:14px;padding:28px;">
    <div style="font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:0.24em;text-transform:uppercase;color:#fbbf24;font-weight:700;margin-bottom:8px;">Ders Devri · Onay Bekleniyor</div>
    <h1 style="font-size:22px;font-weight:800;margin:0 0 14px;letter-spacing:-0.02em;">Selam ${substitute.name.split(' ')[0]},</h1>
    <p style="color:#868ca3;font-size:14px;line-height:1.6;margin:0 0 18px;">
      <strong style="color:#f0f2f7;">${absentTeacher.name}</strong> hoca ${dateTR} günü gelemiyor.
      <br/>
      <strong style="color:#f0f2f7;">${lesson.bas}–${lesson.bit} · ${lesson.ad}</strong> dersi sana devrediliyor.
    </p>
    <p style="color:#868ca3;font-size:13px;margin:0 0 22px;">Lütfen <strong style="color:#fbbf24;">30 dakika içinde</strong> onayla veya reddet. Cevap vermezsen admin'e bildirim iletilecek.</p>
    <div style="text-align:center;margin:22px 0;">
      <a href="${approvalUrl}&d=approve" style="display:inline-block;background:#fbbf24;color:#1a1205;font-weight:700;padding:12px 22px;border-radius:8px;text-decoration:none;margin-right:8px;">✓ Onayla</a>
      <a href="${approvalUrl}&d=reject"  style="display:inline-block;background:transparent;color:#f87171;border:1px solid #f87171;font-weight:700;padding:12px 22px;border-radius:8px;text-decoration:none;">✗ Reddet</a>
    </div>
    <p style="color:#4f5567;font-size:11px;text-align:center;margin:0;font-family:ui-monospace,Menlo,monospace;letter-spacing:0.12em;text-transform:uppercase;">Bilnet Balıkesir · BT</p>
  </div>
</body></html>`.trim();
    const text = `${absentTeacher.name} hoca ${dateTR} günü gelemiyor. ${lesson.bas}-${lesson.bit} ${lesson.ad} dersi sana devrediliyor.\n\nOnayla: ${approvalUrl}&d=approve\nReddet: ${approvalUrl}&d=reject\n\n30 dk içinde yanıtla.`;
    emailResult = await sendEmail({ to: substitute.email, subject, html, text }).catch(err => ({ ok: false, error: String(err) }));
  }

  return { pushResult, emailResult };
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      if (!(await requireAdmin(req, res))) return;
      const { absences } = await loadAll();
      return res.status(200).json({ absences });
    }
    if (req.method === "POST") {
      if (!(await requireAdmin(req, res))) return;
      const body = await readJsonBody(req);
      const { teachers, lessons, absences } = await loadAll();
      const { errs, out } = validateAbsence(body, teachers, lessons);
      if (errs.length) return badRequest(res, errs.join(" · "));

      // Idempotency: if an absence already exists for (teacherId, date), upsert it.
      // This prevents duplicate records when admin double-clicks "Kaydet" or retries
      // after a slow network. Admin can also re-save the same day to edit it.
      const existingIdx = absences.findIndex(
        a => a.teacherId === out.teacherId && a.date === out.date
      );
      const isUpdate = existingIdx >= 0;
      const absenceId = isUpdate ? absences[existingIdx].id : await nextId("a");
      const absence = {
        id: absenceId,
        date: out.date,
        teacherId: out.teacherId,
        lessonOverrides: [],
        note: out.note,
        createdAt: isUpdate ? absences[existingIdx].createdAt : new Date().toISOString(),
        updatedAt: isUpdate ? new Date().toISOString() : undefined,
      };

      // Sign tokens for each transfer first (need absenceId)
      for (const ov of out.lessonOverrides) {
        if (ov.action === "transfer") {
          ov.approvalToken = await signApprovalToken({
            absenceId,
            lessonId: ov.lessonId,
            sub: ov.substituteTeacherId,
          });
        }
        absence.lessonOverrides.push(ov);
      }

      const nextAbsences = isUpdate
        ? absences.map((a, i) => (i === existingIdx ? absence : a))
        : [...absences, absence];
      await saveAbsences(nextAbsences);

      // Fire notifications (best-effort, don't fail the request on errors)
      const absentTeacher = teachers.find(t => t.id === out.teacherId);
      const notifySummary = [];
      let teachersMutated = false;

      for (const ov of absence.lessonOverrides) {
        if (ov.action !== "transfer") continue;
        const substitute = teachers.find(t => t.id === ov.substituteTeacherId);
        const lesson = lessons.find(l => l.id === ov.lessonId);
        if (!substitute || !lesson) continue;

        const r = await notifySubstitute({ absence, override: ov, absentTeacher, substitute, lesson });
        ov.notifiedAt = new Date().toISOString();
        notifySummary.push({
          lessonId: ov.lessonId,
          substituteName: substitute.name,
          pushSent: r.pushResult.sent,
          pushFailed: r.pushResult.failed,
          emailOk: r.emailResult.ok,
          emailError: r.emailResult.error,
        });

        // Remove gone subs
        if (r.pushResult.gone && r.pushResult.gone.length) {
          pruneGoneSubscriptions(substitute, r.pushResult.gone);
          teachersMutated = true;
        }
      }

      // Persist absences again with notifiedAt timestamps
      await saveAbsences(nextAbsences);
      if (teachersMutated) await saveTeachers(teachers);

      return res.status(201).json({ absence, notify: notifySummary });
    }
    return methodNotAllowed(res, "GET, POST");
  } catch (err) {
    return serverError(res, err);
  }
}
