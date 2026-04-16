import { loadAll } from "../_lib/seed.js";
import { methodNotAllowed, serverError } from "../_lib/util.js";
import { applyCurrentAndFutureAbsences, todayStr } from "../_lib/substitute.js";

// Returns the weekly program enriched with current + future absence overrides.
// Each lesson may carry:
//   - hiddenOn: [date, ...]  → original teacher's lesson that's cancelled/transferred on those dates
//   - onlyOn: "YYYY-MM-DD"   → a substitute lesson that ONLY exists on that single date
//   - substitute: true       → this is a one-time transfer
// Clients filter by current date/time to decide visibility.
export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, "GET");
  try {
    const { teachers, lessons, absences } = await loadAll();
    const today = (req.query && req.query.date) || todayStr();
    const effective = applyCurrentAndFutureAbsences(lessons, absences, today);
    res.setHeader("Cache-Control", "public, s-maxage=15, stale-while-revalidate=60");
    res.status(200).json({
      date: today,
      teachers,
      lessons: effective,
      absences,
    });
  } catch (err) {
    return serverError(res, err);
  }
}
