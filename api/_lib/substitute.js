// Apply absence overrides to the lesson list.
//
// Two modes:
//  1) applyAbsencesForDate(lessons, absences, "YYYY-MM-DD")
//     → returns lessons with overrides for that exact date applied (used for kiosk).
//
//  2) applyCurrentAndFutureAbsences(lessons, absences, todayStr)
//     → returns the recurring weekly program, PLUS any one-off substitute lessons
//       for today-or-future dates (added as new entries with a `date` field).
//     → absent teacher's own cancellation/transfer is also marked with `date`
//       so the UI can hide them once the date has passed.
//     This is what the weekly teacher pages use so a "tomorrow's transfer"
//     shows up on the substitute teacher's weekly view immediately.

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

// JS day (0=Sun..6=Sat) → prog gun (1=Mon..5=Fri) or null
export function isoToProgGun(dateStr) {
  // Parse as UTC noon to avoid timezone-bound day shifts
  const d = new Date(dateStr + "T12:00:00Z");
  const dow = d.getUTCDay();
  return (dow >= 1 && dow <= 5) ? dow : null;
}

// Apply all current+future absences to the weekly program.
// For each absence on date >= todayStr:
//   - cancel  → mark original lesson with `hiddenOn: date`
//   - transfer → mark original with `hiddenOn: date`, and add a NEW lesson entry
//                for the substitute teacher with `onlyOn: date`, `substitute: true`.
// Lessons carry `hiddenOn` / `onlyOn` so the client knows these are one-off.
export function applyCurrentAndFutureAbsences(lessons, absences, todayStr) {
  const base = lessons.map(l => ({ ...l }));
  const added = [];
  const relevant = (absences || []).filter(a => a.date >= todayStr);
  if (!relevant.length) return base;

  const byId = new Map(base.map(l => [l.id, l]));

  for (const ab of relevant) {
    for (const ov of (ab.lessonOverrides || [])) {
      const l = byId.get(ov.lessonId);
      if (!l) continue;

      // Mark the original lesson as hidden on that specific date
      if (!Array.isArray(l.hiddenOn)) l.hiddenOn = [];
      l.hiddenOn.push(ab.date);

      if (ov.action === "transfer" && ov.substituteTeacherId) {
        added.push({
          ...l,
          id: l.id + "@" + ab.date,
          teacherId: ov.substituteTeacherId,
          substitute: true,
          originalTeacherId: ab.teacherId,
          absenceId: ab.id,
          onlyOn: ab.date,
          hiddenOn: undefined, // substitute copy is NOT hidden
        });
      }
    }
  }
  return base.concat(added);
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
