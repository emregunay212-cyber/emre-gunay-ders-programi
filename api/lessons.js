// POST → add a lesson (admin)
import { loadAll, saveLessons, nextId } from "./_lib/seed.js";
import { requireAdmin } from "./_lib/auth.js";
import { readJsonBody, methodNotAllowed, badRequest, serverError, validateLesson } from "./_lib/util.js";
import { findConflictsFor } from "./_lib/conflicts.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return methodNotAllowed(res, "POST");
    if (!(await requireAdmin(req, res))) return;

    const body = await readJsonBody(req);
    const { errs, out } = validateLesson(body);
    if (errs.length) return badRequest(res, errs.join(" · "));

    const { teachers, lessons } = await loadAll();
    if (!teachers.find(t => t.id === out.teacherId)) return badRequest(res, "Öğretmen bulunamadı");

    const lesson = {
      id: await nextId("l"),
      teacherId: out.teacherId,
      gun: out.gun,
      bas: out.bas,
      bit: out.bit,
      ad: out.ad,
      lab: out.lab,
      kademe: out.kademe,
    };

    const conflicts = findConflictsFor(lesson, lessons);
    // Do not block; return 201 with conflict info for UI to warn.
    const next = [...lessons, lesson];
    await saveLessons(next);
    return res.status(201).json({ lesson, conflicts });
  } catch (err) {
    return serverError(res, err);
  }
}
