// POST /api/push/unsubscribe  { teacherSlug, endpoint }
import { loadAll, saveTeachers } from "../_lib/seed.js";
import { readJsonBody, methodNotAllowed, badRequest, serverError } from "../_lib/util.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, "POST");
  try {
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
  } catch (err) {
    return serverError(res, err);
  }
}
