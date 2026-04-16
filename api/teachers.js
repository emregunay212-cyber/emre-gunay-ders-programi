// GET  → list (public, cached)
// POST → create (admin)
import { loadAll, saveTeachers, nextId } from "./_lib/seed.js";
import { requireAdmin } from "./_lib/auth.js";
import { readJsonBody, methodNotAllowed, badRequest, serverError, validateTeacher } from "./_lib/util.js";

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const { teachers } = await loadAll();
      res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
      return res.status(200).json({ teachers });
    }
    if (req.method === "POST") {
      if (!(await requireAdmin(req, res))) return;
      const body = await readJsonBody(req);
      const { teachers } = await loadAll();
      const { errs, out } = validateTeacher(body, teachers);
      if (errs.length) return badRequest(res, errs.join(" · "));
      const teacher = {
        id: await nextId("t"),
        name: out.name,
        slug: out.slug,
        meta: out.meta || "",
        email: out.email || "",
        pushSubscriptions: [],
      };
      const next = [...teachers, teacher];
      await saveTeachers(next);
      return res.status(201).json({ teacher });
    }
    return methodNotAllowed(res, "GET, POST");
  } catch (err) {
    return serverError(res, err);
  }
}
