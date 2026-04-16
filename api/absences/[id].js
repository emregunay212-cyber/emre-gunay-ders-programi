// DELETE → cancel an absence record
import { loadAll, saveAbsences } from "../_lib/seed.js";
import { requireAdmin } from "../_lib/auth.js";
import { methodNotAllowed, badRequest, serverError } from "../_lib/util.js";

export default async function handler(req, res) {
  try {
    const id = req.query.id;
    if (!id) return badRequest(res, "id gerekli");
    if (!(await requireAdmin(req, res))) return;
    if (req.method !== "DELETE") return methodNotAllowed(res, "DELETE");

    const { absences } = await loadAll();
    const next = absences.filter(a => a.id !== id);
    if (next.length === absences.length) return res.status(404).json({ error: "Yoklama bulunamadı" });
    await saveAbsences(next);
    return res.status(200).json({ ok: true });
  } catch (err) {
    return serverError(res, err);
  }
}
