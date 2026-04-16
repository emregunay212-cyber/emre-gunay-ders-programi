// Apply absence overrides to lesson list for a given date (YYYY-MM-DD).
// For each lesson affected by an absence record on that date:
//  - action "cancel" → lesson is removed
//  - action "transfer" → lesson's teacherId is rewritten to substituteTeacherId,
//    and marked { substitute: true, originalTeacherId }
//
// Returned lessons retain all original fields + optional substitute metadata.

export function applyAbsencesForDate(lessons, absences, dateStr) {
  if (!Array.isArray(absences) || !absences.length) return lessons.map(l => ({ ...l }));
  const todays = absences.filter(a => a.date === dateStr);
  if (!todays.length) return lessons.map(l => ({ ...l }));

  // Build override map: lessonId → { action, substituteTeacherId, absenceId }
  const overrides = new Map();
  for (const ab of todays) {
    for (const ov of (ab.lessonOverrides || [])) {
      overrides.set(ov.lessonId, {
        action: ov.action,
        substituteTeacherId: ov.substituteTeacherId,
        absentTeacherId: ab.teacherId,
        absenceId: ab.id,
      });
    }
  }

  const out = [];
  for (const l of lessons) {
    const ov = overrides.get(l.id);
    if (!ov) { out.push({ ...l }); continue; }
    if (ov.action === "cancel") continue;
    if (ov.action === "transfer" && ov.substituteTeacherId) {
      out.push({
        ...l,
        teacherId: ov.substituteTeacherId,
        substitute: true,
        originalTeacherId: ov.absentTeacherId,
        absenceId: ov.absenceId,
      });
    } else {
      // Unknown action → keep as-is (fail safe)
      out.push({ ...l });
    }
  }
  return out;
}

export function todayStr(tz = "Europe/Istanbul") {
  // Server is UTC on Vercel; produce Istanbul date
  const d = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(d);
  const y = parts.find(p => p.type === "year").value;
  const m = parts.find(p => p.type === "month").value;
  const day = parts.find(p => p.type === "day").value;
  return `${y}-${m}-${day}`;
}
