// Lab availability: tabbed UI with visual timeline for each day.
// All data is hardcoded from data-*.js files — no user input is rendered.

(function () {
  const GUN_AD = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
  const GUN_KISA = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
  const AY_AD = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];

  const LABS = [
    { key: "i", short: "İ", name: "İlkokul", fullName: "İlkokul Laboratuvarı" },
    { key: "O", short: "O", name: "Ortaokul", fullName: "Ortaokul Laboratuvarı" },
    { key: "L", short: "L", name: "Lise",     fullName: "Lise Laboratuvarı" },
  ];

  const DAY_START = 9 * 60;    // 09:00
  const DAY_END   = 17 * 60;   // 17:00
  const SPAN      = DAY_END - DAY_START;
  const MIN_GAP   = 10;        // dk — altını gösterme
  const LABEL_MIN = 28;        // dk — bu ve üzerinde saat etiketi yaz

  const STORAGE_KEY = "labs.selected";

  function pad(n) { return String(n).padStart(2, "0"); }
  function parseHM(s) { const [h, m] = s.split(":").map(Number); return h * 60 + m; }
  function fmtHM(m) { return pad(Math.floor(m / 60)) + ":" + pad(m % 60); }
  function fmtDur(m) {
    if (m < 60) return m + " dk";
    const h = Math.floor(m / 60), r = m % 60;
    return r ? (h + "sa " + r + "dk") : (h + "sa");
  }
  function fmtClock(d) { return pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds()); }
  function fmtDate(d) { return GUN_AD[d.getDay()] + " · " + d.getDate() + " " + AY_AD[d.getMonth()]; }
  function pct(m) { return ((m - DAY_START) / SPAN) * 100; }
  function clampPct(v) { return Math.max(0, Math.min(100, v)); }

  function el(tag, opts) {
    const e = document.createElement(tag);
    if (opts) {
      if (opts.className) e.className = opts.className;
      if (opts.text != null) e.textContent = opts.text;
      if (opts.style) e.setAttribute("style", opts.style);
      if (opts.title) e.setAttribute("title", opts.title);
      if (opts.href) e.setAttribute("href", opts.href);
      if (opts.aria) for (const k in opts.aria) e.setAttribute("aria-" + k, opts.aria[k]);
      if (opts.data) for (const k in opts.data) e.setAttribute("data-" + k, opts.data[k]);
    }
    return e;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  // ----- Aggregation -----
  function collectLessons(labKey, gun) {
    const out = [];
    for (const sch of (window.ALL_SCHEDULES || [])) {
      for (const p of sch.program) {
        if (p.lab === labKey && p.gun === gun) {
          out.push({
            bas: parseHM(p.bas),
            bit: parseHM(p.bit),
            ad: p.ad,
            teacher: sch.teacher,
          });
        }
      }
    }
    out.sort((a, b) => a.bas - b.bas || a.bit - b.bit);
    return out;
  }
  function mergeIntervals(intervals) {
    if (!intervals.length) return [];
    const merged = [{ bas: intervals[0].bas, bit: intervals[0].bit }];
    for (let i = 1; i < intervals.length; i++) {
      const cur = intervals[i];
      const last = merged[merged.length - 1];
      if (cur.bas <= last.bit) last.bit = Math.max(last.bit, cur.bit);
      else merged.push({ bas: cur.bas, bit: cur.bit });
    }
    return merged;
  }
  function buildSegments(lessons, merged) {
    const segs = [];
    let cursor = DAY_START;
    for (const iv of merged) {
      if (iv.bas > DAY_END) break;
      if (iv.bas > cursor) {
        segs.push({ type: "free", bas: cursor, bit: Math.min(iv.bas, DAY_END) });
      }
      const busyStart = Math.max(iv.bas, cursor);
      const busyEnd = Math.min(iv.bit, DAY_END);
      if (busyEnd > busyStart) {
        const local = lessons.filter(l => l.bas < busyEnd && l.bit > busyStart);
        segs.push({ type: "busy", bas: busyStart, bit: busyEnd, lessons: local });
      }
      cursor = Math.max(cursor, iv.bit);
      if (cursor >= DAY_END) break;
    }
    if (cursor < DAY_END) segs.push({ type: "free", bas: cursor, bit: DAY_END });
    return segs;
  }

  function dayData(labKey, gun) {
    const lessons = collectLessons(labKey, gun);
    const merged = mergeIntervals(lessons);
    const segs = buildSegments(lessons, merged);
    let freeMin = 0;
    for (const s of segs) if (s.type === "free" && (s.bit - s.bas) >= MIN_GAP) freeMin += (s.bit - s.bas);
    return { lessons, merged, segs, freeMin };
  }

  function labWeekFreeMin(labKey) {
    let total = 0;
    for (let g = 1; g <= 5; g++) total += dayData(labKey, g).freeMin;
    return total;
  }
  function weekBusyMin(labKey) {
    let total = 0;
    for (let g = 1; g <= 5; g++) {
      for (const m of dayData(labKey, g).merged) total += (m.bit - m.bas);
    }
    return total;
  }

  // ----- Rendering -----
  function renderRuler(container) {
    clear(container);
    const track = el("div", { className: "ruler-track" });
    for (let h = 9; h <= 17; h++) {
      const left = ((h * 60 - DAY_START) / SPAN) * 100;
      const tick = el("div", { className: "ruler-tick", style: "left: " + left + "%;" });
      tick.appendChild(el("div", { className: "tick-line" }));
      tick.appendChild(el("div", { className: "tick-label", text: pad(h) }));
      track.appendChild(tick);
    }
    container.appendChild(el("div", { className: "ruler-spacer", text: "Gün" }));
    container.appendChild(track);
    container.appendChild(el("div", { className: "ruler-right-spacer", text: "Boş" }));
  }

  function renderDayRow(labKey, gun, todayGun, nowM) {
    const row = el("div", {
      className: "t-day" + (gun === todayGun ? " today" : ""),
      style: "animation-delay: " + (gun * 60) + "ms;"
    });

    // Day label (left)
    const lbl = el("div", { className: "t-day-label" });
    lbl.appendChild(document.createTextNode(GUN_KISA[gun]));
    lbl.appendChild(el("small", { text: GUN_AD[gun].slice(0, 4) + "." }));
    row.appendChild(lbl);

    // Track
    const track = el("div", { className: "t-day-track" });
    const data = dayData(labKey, gun);
    const hasAnyFree = data.segs.some(s => s.type === "free" && (s.bit - s.bas) >= MIN_GAP);

    for (const s of data.segs) {
      const left = clampPct(pct(s.bas));
      const width = Math.max(0.4, clampPct(pct(s.bit)) - left);
      if (s.type === "busy") {
        const lessonsLabel = s.lessons
          .map(l => fmtHM(l.bas) + "–" + fmtHM(l.bit) + " " + l.ad + " · " + l.teacher)
          .join("\n");
        const seg = el("div", {
          className: "t-seg busy",
          style: "left:" + left + "%; width:" + width + "%;",
          title: "Dolu: " + fmtHM(s.bas) + "–" + fmtHM(s.bit) + "\n" + lessonsLabel,
        });
        track.appendChild(seg);
      } else {
        const dur = s.bit - s.bas;
        if (dur < MIN_GAP) continue;
        const seg = el("div", {
          className: "t-seg free",
          style: "left:" + left + "%; width:" + width + "%;",
          title: "Boş: " + fmtHM(s.bas) + "–" + fmtHM(s.bit) + " (" + fmtDur(dur) + ")",
        });
        // Text inside if wide enough
        if (dur >= LABEL_MIN) {
          seg.appendChild(el("span", { className: "seg-label", text: fmtHM(s.bas) + "–" + fmtHM(s.bit) }));
          if (dur >= 50) seg.appendChild(el("span", { className: "seg-dur", text: fmtDur(dur) }));
        }
        track.appendChild(seg);
      }
    }

    // NOW indicator (only today, within window)
    if (gun === todayGun && nowM >= DAY_START && nowM <= DAY_END) {
      const now = el("div", {
        className: "t-now",
        style: "left:" + clampPct(pct(nowM)) + "%;",
        title: "Şu an " + fmtHM(Math.floor(nowM)),
      });
      track.appendChild(now);
    }

    row.appendChild(track);

    // Total free (right)
    const total = el("div", { className: "t-day-total" });
    if (!hasAnyFree) {
      total.appendChild(el("strong", { text: "Dolu" }));
      total.appendChild(el("span", { className: "done-badge", text: "Tümü kapalı" }));
      row.classList.add("full");
    } else {
      total.appendChild(el("strong", { text: fmtDur(data.freeMin) }));
      total.appendChild(el("span", { className: "done-badge", text: "boş" }));
    }
    row.appendChild(total);
    return row;
  }

  function renderLabPanel(labKey) {
    const page = document.getElementById("page");
    page.setAttribute("data-lab", labKey);

    // Update tabs active state + their free-time subtitle
    const tabsEl = document.querySelectorAll(".lab-tab");
    tabsEl.forEach(t => {
      const k = t.getAttribute("data-lab");
      t.classList.toggle("active", k === labKey);
      const free = labWeekFreeMin(k);
      const sub = t.querySelector(".tab-free");
      if (sub) sub.textContent = fmtDur(free) + " boş / hafta";
    });

    // Banner
    const banner = document.getElementById("lab-banner");
    clear(banner);
    const lab = LABS.find(l => l.key === labKey);
    banner.appendChild(el("div", { className: "eyebrow", text: lab.key + "-Lab" }));

    const h2 = el("h2");
    h2.appendChild(document.createTextNode(lab.name + " "));
    const em = el("em", { text: "Laboratuvarı" });
    h2.appendChild(em);
    banner.appendChild(h2);

    const stats = el("div", { className: "stats" });
    const freeStat = el("div");
    freeStat.appendChild(document.createTextNode("Haftalık boş"));
    freeStat.appendChild(el("strong", { className: "free-big", text: fmtDur(labWeekFreeMin(labKey)) }));
    const busyStat = el("div");
    busyStat.appendChild(document.createTextNode("Haftalık dolu"));
    busyStat.appendChild(el("strong", { text: fmtDur(weekBusyMin(labKey)) }));
    const hoursStat = el("div");
    hoursStat.appendChild(document.createTextNode("Zaman aralığı"));
    hoursStat.appendChild(el("strong", { text: "09:00 – 17:00" }));
    stats.appendChild(freeStat);
    stats.appendChild(busyStat);
    stats.appendChild(hoursStat);
    banner.appendChild(stats);

    // Ruler
    const ruler = document.getElementById("timeline-ruler");
    renderRuler(ruler);

    // Timeline days
    const d = new Date();
    const todayGun = (d.getDay() >= 1 && d.getDay() <= 5) ? d.getDay() : null;
    const nowM = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;

    const days = document.getElementById("timeline-days");
    clear(days);
    for (let g = 1; g <= 5; g++) {
      days.appendChild(renderDayRow(labKey, g, todayGun, nowM));
    }
  }

  // ----- Clock tick (fast) -----
  function tickClock() {
    const d = new Date();
    const clockEl = document.getElementById("clock");
    const dateEl = document.getElementById("date");
    if (clockEl) clockEl.textContent = fmtClock(d);
    if (dateEl) dateEl.textContent = fmtDate(d);
  }

  // Refresh NOW marker position (slow)
  function tickNow() {
    const page = document.getElementById("page");
    const current = page.getAttribute("data-lab");
    if (current) renderLabPanel(current);
  }

  // ----- Init -----
  function init() {
    // Tab click handlers
    document.querySelectorAll(".lab-tab").forEach(tab => {
      tab.addEventListener("click", () => {
        const k = tab.getAttribute("data-lab");
        try { localStorage.setItem(STORAGE_KEY, k); } catch (e) {}
        renderLabPanel(k);
      });
    });

    // Pick initial lab: saved or today's kademe-hint, else "i"
    let initial = "i";
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && LABS.find(l => l.key === saved)) initial = saved;
    } catch (e) {}

    renderLabPanel(initial);
    tickClock();
    setInterval(tickClock, 1000);
    setInterval(tickNow, 30 * 1000); // refresh now-marker twice a minute
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
