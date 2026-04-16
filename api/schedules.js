import { loadAll } from "./_lib/seed.js";
import { methodNotAllowed, serverError } from "./_lib/util.js";
import { todayStr } from "./_lib/substitute.js";

// Returns RAW schedule data (no absence overrides applied).
// Admin panel uses this; conflict detection should operate on the unmodified set.
// Public pages fetch /api/schedules/today which applies absence overrides.
export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, "GET");
  try {
    const { teachers, lessons, absences } = await loadAll();
    res.setHeader("Cache-Control", "public, s-maxage=15, stale-while-revalidate=60");
    res.status(200).json({
      teachers,
      lessons,
      absences,
      today: todayStr(),
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return serverError(res, err);
  }
}
