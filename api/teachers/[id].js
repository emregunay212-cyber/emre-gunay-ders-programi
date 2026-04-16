// PATCH → update / DELETE → remove
import { loadAll, saveTeachers, saveLessons } from "../_lib/seed.js";
import { requireAdmin } from "../_lib/auth.js";
import { readJsonBody, methodNotAllowed, badRequest, serverError, validateTeacher } from "../_lib/util.js";

export default async function handler(req, res) {
  try {
    const id = req.query.id;
    if (!id) return badRequest(res, "id gerekli");
    if (!(await requireAdmin(req, res))) return;

    const { teachers, lessons } = await loadAll();
    const idx = teachers.findIndex(t => t.id === id);
    if (idx === -1) return res.status(404).json({ error: "Öğretmen bulunamadı" });

    if (req.method === "PATCH") {
      const body = await readJsonBody(req);
      const merged = { ...teachers[idx], ...body, id };
      const { errs, out } = validateTeacher(merged, teachers);
      if (errs.length) return badRequest(res, errs.join(" · "));
      teachers[idx] = { ...teachers[idx], name: out.name, slug: out.slug, meta: out.meta ?? teachers[idx].meta };
      await saveTeachers(teachers);
      return res.status(200).json({ teacher: teachers[idx] });
    }

    if (req.method === "DELETE") {
      const removed = teachers[idx];
      teachers.splice(idx, 1);
      const filteredLessons = lessons.filter(l => l.teacherId !== id);
      await saveTeachers(teachers);
      if (filteredLessons.length !== lessons.length) await saveLessons(filteredLessons);
      return res.status(200).json({ ok: true, removed: removed.name, removedLessons: lessons.length - filteredLessons.length });
    }

    return methodNotAllowed(res, "PATCH, DELETE");
  } catch (err) {
    return serverError(res, err);
  }
}
