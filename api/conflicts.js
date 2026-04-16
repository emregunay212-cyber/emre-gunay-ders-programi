import { loadAll } from "./_lib/seed.js";
import { findAllConflicts } from "./_lib/conflicts.js";
import { methodNotAllowed, serverError } from "./_lib/util.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, "GET");
  try {
    const { teachers, lessons } = await loadAll();
    const pairs = findAllConflicts(lessons);
    const tById = Object.fromEntries(teachers.map(t => [t.id, t.name]));
    const conflicts = pairs.map(({ a, b }) => ({
      a: { ...a, teacher: tById[a.teacherId] },
      b: { ...b, teacher: tById[b.teacherId] },
    }));
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ conflicts });
  } catch (err) {
    return serverError(res, err);
  }
}
