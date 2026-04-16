// Consolidated schedule endpoint.
//   GET /api/schedules              → raw data (no absence filtering, for admin)
//   GET /api/schedules?mode=today   → with absence overrides applied, public
import { loadAll } from "./_lib/seed.js";
import { methodNotAllowed, serverError } from "./_lib/util.js";
import { todayStr, applyCurrentAndFutureAbsences } from "./_lib/substitute.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, "GET");
  try {
    const mode = (req.query && req.query.mode) || "";
    const { teachers, lessons, absences } = await loadAll();
    const today = todayStr();

    if (mode === "today") {
      const date = (req.query && req.query.date) || today;
      const effective = applyCurrentAndFutureAbsences(lessons, absences, date);
      res.setHeader("Cache-Control", "public, s-maxage=15, stale-while-revalidate=60");
      return res.status(200).json({
        date,
        teachers,
        lessons: effective,
        absences,
      });
    }

    // Default: raw view (admin panel, conflict detection)
    res.setHeader("Cache-Control", "public, s-maxage=15, stale-while-revalidate=60");
    return res.status(200).json({
      teachers,
      lessons,
      absences,
      today,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return serverError(res, err);
  }
}
