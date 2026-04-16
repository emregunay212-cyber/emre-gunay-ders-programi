// Conflict detection: same lab, overlapping time, different teachers.

export function parseHM(s) { const [h, m] = s.split(":").map(Number); return h * 60 + m; }

export function overlaps(a, b) {
  return a.gun === b.gun && parseHM(a.bas) < parseHM(b.bit) && parseHM(b.bas) < parseHM(a.bit);
}

export function findConflictsFor(newLesson, allLessons, ignoreId = null) {
  if (!newLesson.lab) return []; // lab'sız dersler (ör. toplantı) çakışma sayılmaz
  const conflicts = [];
  for (const l of allLessons) {
    if (l.id === ignoreId) continue;
    if (l.lab !== newLesson.lab) continue;
    if (l.teacherId === newLesson.teacherId) continue;
    if (overlaps(l, newLesson)) conflicts.push(l);
  }
  return conflicts;
}

export function findAllConflicts(allLessons) {
  const out = [];
  const seen = new Set();
  for (let i = 0; i < allLessons.length; i++) {
    for (let j = i + 1; j < allLessons.length; j++) {
      const a = allLessons[i], b = allLessons[j];
      if (!a.lab || !b.lab) continue;
      if (a.lab !== b.lab) continue;
      if (a.teacherId === b.teacherId) continue;
      if (overlaps(a, b)) {
        const key = [a.id, b.id].sort().join("|");
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ a, b });
      }
    }
  }
  return out;
}
