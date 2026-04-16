// Absence override model.
//
// We NEVER delete the original lesson from its owner's schedule. When an
// absence transfer happens, we:
//  1) Mark the original lesson with `transferredOn: [{ date, to }]` so the
//     original teacher's weekly view shows it as "pasif · devredildi" on that
//     specific date, and returns to normal automatically afterward.
//  2) Add a fresh substitute-copy lesson with `onlyOn: date`, `substitute: true`,
//     retargeted to the substitute teacher, which appears only on that date.
//
// For cancellations: `cancelledOn: [date, ...]` on the original only (no copy added).
//
// All original metadata is untouched — absence tracking is additive only.

export function applyAbsencesForDate(lessons, absences, dateStr) {
  if (!Array.isArray(absences) || !absences.length) return lessons.map(l => ({ ...l }));
  const todays = absences.filter(a => a.date === dateStr);
  if (!todays.length) return lessons.map(l => ({ ...l }));

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
      out.push({ ...l });
    }
  }
  return out;
}

// Apply all TODAY-or-FUTURE absences to the weekly program.
// Originals stay in the list (with passive markers); substitutes are added as
// new entries tied to a specific date.
export function applyCurrentAndFutureAbsences(lessons, absences, todayStrVal) {
  const base = lessons.map(l => ({ ...l }));
  const added = [];
  const relevant = (absences || []).filter(a => a.date >= todayStrVal);
  if (!relevant.length) return base;

  const byId = new Map(base.map(l => [l.id, l]));

  for (const ab of relevant) {
    for (const ov of (ab.lessonOverrides || [])) {
      const l = byId.get(ov.lessonId);
      if (!l) continue;

      if (ov.action === "cancel") {
        if (!Array.isArray(l.cancelledOn)) l.cancelledOn = [];
        l.cancelledOn.push(ab.date);
      } else if (ov.action === "transfer" && ov.substituteTeacherId) {
        if (!Array.isArray(l.transferredOn)) l.transferredOn = [];
        l.transferredOn.push({ date: ab.date, to: ov.substituteTeacherId });

        added.push({
          ...l,
          id: l.id + "@" + ab.date,
          teacherId: ov.substituteTeacherId,
          substitute: true,
          originalTeacherId: ab.teacherId,
          absenceId: ab.id,
          onlyOn: ab.date,
          cancelledOn: undefined,
          transferredOn: undefined,
        });
      }
    }
  }
  return base.concat(added);
}

export function todayStr(tz = "Europe/Istanbul") {
  const d = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(d);
  const y = parts.find(p => p.type === "year").value;
  const m = parts.find(p => p.type === "month").value;
  const day = parts.find(p => p.type === "day").value;
  return `${y}-${m}-${day}`;
}
