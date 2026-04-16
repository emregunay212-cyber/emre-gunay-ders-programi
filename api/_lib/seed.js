import { kvGet, kvSet, kvIncr } from "./kv.js";
import { SEED_TEACHERS, SEED_LESSONS, SCHEMA_VERSION } from "./seedData.js";

// Ensure KV has initial data. Idempotent — safe to call on every cold start.
export async function ensureSeeded() {
  const done = await kvGet("seed:done");
  if (done) return { seeded: false };

  const teachers = SEED_TEACHERS.map(t => ({ ...t }));
  const slugToId = Object.fromEntries(teachers.map(t => [t.slug, t.id]));

  let nextSerial = 1;
  const lessons = SEED_LESSONS.map(l => ({
    id: "l_" + String(nextSerial++).padStart(4, "0"),
    teacherId: slugToId[l.teacherSlug],
    gun: l.gun,
    bas: l.bas,
    bit: l.bit,
    ad: l.ad,
    lab: l.lab || "",
    kademe: l.kademe,
  }));

  await kvSet("teachers", teachers);
  await kvSet("lessons", lessons);
  await kvSet("absences", []);
  await kvSet("version", SCHEMA_VERSION);
  // Seed the lesson counter above the highest ID so future adds don't clash.
  await kvSet("counter:l", nextSerial - 1);
  await kvSet("counter:t", teachers.length);
  await kvSet("counter:a", 0);
  await kvSet("seed:done", true);

  return { seeded: true, teachers: teachers.length, lessons: lessons.length };
}

// Read current state (auto-seeds on first read).
export async function loadAll() {
  await ensureSeeded();
  const [teachers, lessons, absences] = await Promise.all([
    kvGet("teachers"),
    kvGet("lessons"),
    kvGet("absences"),
  ]);
  return {
    teachers: teachers || [],
    lessons: lessons || [],
    absences: absences || [],
  };
}

export async function saveTeachers(teachers) { return kvSet("teachers", teachers); }
export async function saveLessons(lessons) { return kvSet("lessons", lessons); }
export async function saveAbsences(absences) { return kvSet("absences", absences); }

// Monotonic counter; returns new ID string.
export async function nextId(prefix) {
  const n = await kvIncr("counter:" + prefix);
  return prefix + "_" + String(n).padStart(4, "0");
}
