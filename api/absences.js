// GET → list absences (admin), POST → create absence record (admin)
import { loadAll, saveAbsences, nextId } from "./_lib/seed.js";
import { requireAdmin } from "./_lib/auth.js";
import { readJsonBody, methodNotAllowed, badRequest, serverError } from "./_lib/util.js";

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
        out.lessonOverrides.push({ lessonId: ov.lessonId, action: "cancel" });
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
        });
      } else {
        errs.push("Geçersiz action (cancel/transfer): " + ov.lessonId);
      }
    }
  }
  return { errs, out };
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

      const absence = {
        id: await nextId("a"),
        date: out.date,
        teacherId: out.teacherId,
        lessonOverrides: out.lessonOverrides,
        note: out.note,
        createdAt: new Date().toISOString(),
      };
      const next = [...absences, absence];
      await saveAbsences(next);
      return res.status(201).json({ absence });
    }
    return methodNotAllowed(res, "GET, POST");
  } catch (err) {
    return serverError(res, err);
  }
}
