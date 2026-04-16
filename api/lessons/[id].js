// PATCH → edit / DELETE → remove a lesson (admin)
import { loadAll, saveLessons } from "../_lib/seed.js";
import { requireAdmin } from "../_lib/auth.js";
import { readJsonBody, methodNotAllowed, badRequest, serverError, validateLesson } from "../_lib/util.js";
import { findConflictsFor } from "../_lib/conflicts.js";

export default async function handler(req, res) {
  try {
    const id = req.query.id;
    if (!id) return badRequest(res, "id gerekli");
    if (!(await requireAdmin(req, res))) return;

    const { teachers, lessons } = await loadAll();
    const idx = lessons.findIndex(l => l.id === id);
    if (idx === -1) return res.status(404).json({ error: "Ders bulunamadı" });

    if (req.method === "PATCH") {
      const body = await readJsonBody(req);
      const merged = { ...lessons[idx], ...body };
      const { errs, out } = validateLesson(merged);
      if (errs.length) return badRequest(res, errs.join(" · "));
      if (!teachers.find(t => t.id === out.teacherId)) return badRequest(res, "Öğretmen bulunamadı");

      const updated = { ...lessons[idx], ...out };
      lessons[idx] = updated;
      const conflicts = findConflictsFor(updated, lessons, updated.id);
      await saveLessons(lessons);
      return res.status(200).json({ lesson: updated, conflicts });
    }

    if (req.method === "DELETE") {
      lessons.splice(idx, 1);
      await saveLessons(lessons);
      return res.status(200).json({ ok: true });
    }

    return methodNotAllowed(res, "PATCH, DELETE");
  } catch (err) {
    return serverError(res, err);
  }
}
