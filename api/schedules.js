import { loadAll } from "./_lib/seed.js";
import { methodNotAllowed, serverError } from "./_lib/util.js";
import { todayStr } from "./_lib/substitute.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, "GET");
  try {
    const { teachers, lessons, absences } = await loadAll();
    // CDN cache for 60s — admin edits propagate within a minute.
    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
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
