// Absence override model — status-aware.
//
// lessonOverride.status:
//   "pending"  — transfer waiting for substitute's approval
//   "approved" — substitute accepted → applied to schedules
//   "rejected" — substitute declined → neither side shows the change
//   "auto"     — cancellations (always applied without approval)
//
// Original lesson is NEVER deleted; transfer only adds:
//   - transferredOn: [{date, to}] marker (for passive UI on original's page)
//   - a fresh onlyOn: date copy retargeted to substitute (rendered as "↪ Yerine")
//
// For PENDING transfers:
//   - original stays normal (not passive) because nothing's confirmed yet
//   - substitute does NOT see it in their regular schedule (only the pending
//     approval card renders it separately)
// For REJECTED: same as pending from a schedule perspective — admin must reassign.

export function applyAbsencesForDate(lessons, absences, dateStr) {
  if (!Array.isArray(absences) || !absences.length) return lessons.map(l => ({ ...l }));
  const todays = absences.filter(a => a.date === dateStr);
  if (!todays.length) return lessons.map(l => ({ ...l }));

  const overrides = new Map();
  for (const ab of todays) {
    for (const ov of (ab.lessonOverrides || [])) {
      overrides.set(ov.lessonId, {
        action: ov.action,
        status: ov.status || (ov.action === "cancel" ? "auto" : "pending"),
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
    if (ov.action === "transfer" && ov.status === "approved" && ov.substituteTeacherId) {
      out.push({
        ...l,
        teacherId: ov.substituteTeacherId,
        substitute: true,
        originalTeacherId: ov.absentTeacherId,
        absenceId: ov.absenceId,
      });
    } else {
      // pending/rejected → keep original unchanged (no transfer applied)
      out.push({ ...l });
    }
  }
  return out;
}

export function applyCurrentAndFutureAbsences(lessons, absences, todayStrVal) {
  const base = lessons.map(l => ({ ...l }));
  const added = [];
  const relevant = (absences || []).filter(a => a.date >= todayStrVal);
  if (!relevant.length) return base;

  const byId = new Map(base.map(l => [l.id, l]));

  for (const ab of relevant) {
    for (const ov of (ab.lessonOverrides || [])) {
      const status = ov.status || (ov.action === "cancel" ? "auto" : "pending");
      const l = byId.get(ov.lessonId);
      if (!l) continue;

      if (ov.action === "cancel") {
        if (!Array.isArray(l.cancelledOn)) l.cancelledOn = [];
        l.cancelledOn.push(ab.date);
        continue;
      }

      // Transfer: only apply markers/copies if APPROVED.
      if (status !== "approved" || !ov.substituteTeacherId) continue;

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
