// Fetches live schedule from /api/schedules/today and replaces the global
// window.SCHEDULE (for teacher pages) and window.ALL_SCHEDULES (for labs/kiosk).
// Falls back silently to the hardcoded data-*.js values on any error.
//
// app.js and labs.js read these globals on each tick, so replacing them is
// enough — no re-render plumbing needed.
//
// Refresh strategy:
//  · localStorage cache for 30s (fast page loads)
//  · Background fetch on every page load
//  · Auto-refresh every 2 minutes while page is open
//  · Refresh when tab becomes visible (user returns)
//  · Refresh when browser comes back online

(function () {
  const CACHE_KEY = "bt.schedules.cache.v2";
  const CACHE_TTL = 30 * 1000;           // 30 seconds — admin edits propagate quickly
  const REFRESH_INTERVAL = 2 * 60 * 1000; // 2 minutes background refresh

  function readCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || Date.now() - obj.at > CACHE_TTL) return null;
      return obj.data;
    } catch { return null; }
  }
  function writeCache(data) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data })); } catch {}
  }

  function mapLesson(l) {
    return {
      gun: l.gun, bas: l.bas, bit: l.bit,
      ad: l.ad, lab: l.lab || "", kademe: l.kademe,
      substitute: !!l.substitute,
      originalTeacherId: l.originalTeacherId || null,
      onlyOn: l.onlyOn || null,      // substitute lesson valid only on this date
      hiddenOn: l.hiddenOn || null,  // original lesson hidden on these dates
    };
  }

  function buildScheduleForSlug(api, slug) {
    const t = (api.teachers || []).find(x => x.slug === slug);
    if (!t) return null;
    const program = (api.lessons || [])
      .filter(l => l.teacherId === t.id)
      .map(mapLesson);
    return { slug: t.slug, teacher: t.name, program };
  }

  function buildAllSchedules(api) {
    return (api.teachers || []).map(t => ({
      slug: t.slug,
      teacher: t.name,
      program: (api.lessons || [])
        .filter(l => l.teacherId === t.id)
        .map(mapLesson),
    }));
  }

  function applyApiData(api) {
    // Teacher page path: replace window.SCHEDULE with same-slug data
    if (window.SCHEDULE && window.SCHEDULE.slug) {
      const next = buildScheduleForSlug(api, window.SCHEDULE.slug);
      if (next) window.SCHEDULE = next;
    }
    // Labs/kiosk path: replace window.ALL_SCHEDULES entirely
    if (Array.isArray(window.ALL_SCHEDULES)) {
      window.ALL_SCHEDULES.length = 0;
      for (const s of buildAllSchedules(api)) window.ALL_SCHEDULES.push(s);
    }
    // Notify anyone interested
    window.dispatchEvent(new CustomEvent("schedule:updated", { detail: api }));
  }

  async function fetchToday() {
    try {
      const r = await fetch("/api/schedules/today", { credentials: "same-origin", cache: "no-store" });
      if (!r.ok) return null;
      return await r.json();
    } catch { return null; }
  }

  async function refresh() {
    const data = await fetchToday();
    if (!data) return false;
    writeCache(data);
    applyApiData(data);
    return true;
  }

  // Initial: apply cached data instantly (if fresh), then refresh in background.
  const cached = readCache();
  if (cached) applyApiData(cached);
  refresh();

  // Periodic background refresh
  setInterval(refresh, REFRESH_INTERVAL);

  // Refresh when tab becomes visible again
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refresh();
  });

  // Refresh when browser comes back online
  window.addEventListener("online", refresh);
})();
