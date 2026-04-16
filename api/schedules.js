import { loadAll } from "./_lib/seed.js";
import { methodNotAllowed, serverError } from "./_lib/util.js";
import { todayStr, applyCurrentAndFutureAbsences } from "./_lib/substitute.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, "GET");
  try {
    const { teachers, lessons, absences } = await loadAll();
    const today = todayStr();
    const effective = applyCurrentAndFutureAbsences(lessons, absences, today);

    // Short cache — admin edits propagate within seconds.
    res.setHeader("Cache-Control", "public, s-maxage=15, stale-while-revalidate=60");
    res.status(200).json({
      teachers,
      lessons: effective,
      absences,
      today,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return serverError(res, err);
  }
}
