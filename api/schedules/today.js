import { loadAll } from "../_lib/seed.js";
import { methodNotAllowed, serverError } from "../_lib/util.js";
import { applyAbsencesForDate, todayStr } from "../_lib/substitute.js";

// Returns effective lessons for a target date (default: today),
// i.e. with cancellations removed and transfers rewritten.
// Query param `?date=YYYY-MM-DD` optional.
export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, "GET");
  try {
    const { teachers, lessons, absences } = await loadAll();
    const date = (req.query && req.query.date) || todayStr();
    const effective = applyAbsencesForDate(lessons, absences, date);
    // Short cache — admin edits should propagate within seconds.
    res.setHeader("Cache-Control", "public, s-maxage=15, stale-while-revalidate=60");
    res.status(200).json({
      date,
      teachers,
      lessons: effective,
      absences: (absences || []).filter(a => a.date === date),
    });
  } catch (err) {
    return serverError(res, err);
  }
}
