// Kiosk — editorial lab board. Mobile-first with swipeable carousel,
// desktop grid, circular countdown, "imminent next" highlighting.
// All rendered content via textContent / DOM methods — never innerHTML.

(function () {
  const GUN_AD = ["Pazar","Pazartesi","Salı","Çarşamba","Perşembe","Cuma","Cumartesi"];
  const AY_AD  = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];
  const LABS = [
    { key: "i", name: "İlkokul", full: "İlkokul Laboratuvarı" },
    { key: "O", name: "Ortaokul", full: "Ortaokul Laboratuvarı" },
    { key: "L", name: "Lise", full: "Lise Laboratuvarı" },
  ];

  const NS = "http://www.w3.org/2000/svg";
  const FETCH_ERR_GRACE = 3;          // ignore first N errors before offline banner
  const FRESH_BLIP_MS = 800;

  let apiData = null;
  let teacherById = {};
  let errCount = 0;

  function pad(n) { return String(n).padStart(2, "0"); }
  function parseHM(s) { const [h,m] = s.split(":").map(Number); return h*60+m; }
  function fmtClock(d) { return pad(d.getHours()) + ":" + pad(d.getMinutes()); }
  function fmtDate(d) { return GUN_AD[d.getDay()] + " · " + d.getDate() + " " + AY_AD[d.getMonth()]; }
  function nowMin(d) { return d.getHours()*60 + d.getMinutes() + d.getSeconds()/60; }
  function todayGun(d) { return (d.getDay() >= 1 && d.getDay() <= 5) ? d.getDay() : null; }

  function el(tag, opts, ...children) {
    const e = document.createElement(tag);
    if (opts) {
      if (opts.className) e.className = opts.className;
      if (opts.text != null) e.textContent = opts.text;
      if (opts.style) e.setAttribute("style", opts.style);
      if (opts.title) e.setAttribute("title", opts.title);
      if (opts.attrs) for (const k in opts.attrs) e.setAttribute(k, opts.attrs[k]);
      if (opts.on) for (const k in opts.on) e.addEventListener(k, opts.on[k]);
    }
    for (const c of children) {
      if (c == null) continue;
      if (typeof c === "string") e.appendChild(document.createTextNode(c));
      else e.appendChild(c);
    }
    return e;
  }
  function svgEl(name, attrs) {
    const e = document.createElementNS(NS, name);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }

  // Short teacher name (last word often the surname in TR)
  function shortTeacher(name) {
    if (!name) return "";
    const parts = name.split(/\s+/);
    // Last word, but if it's short (initial), take last two
    if (parts.length > 1 && parts[parts.length - 1].length <= 2) {
      return parts.slice(-2).join(" ");
    }
    return parts[parts.length - 1];
  }

  // ----- Data -----
  async function fetchData() {
    try {
      const r = await fetch("/api/schedules/today", { credentials: "same-origin", cache: "no-store" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const data = await r.json();
      teacherById = Object.fromEntries((data.teachers || []).map(t => [t.id, t]));
      errCount = 0;
      setOffline(false);
      return data;
    } catch (err) {
      errCount++;
      if (errCount > FETCH_ERR_GRACE) setOffline(true);
      return null;
    }
  }

  function setOffline(isOff) {
    const b = document.getElementById("offline-banner");
    if (!b) return;
    b.classList.toggle("show", isOff);
    if (isOff) b.textContent = "Bağlantı sorunu — en son alınan veri gösteriliyor";
  }

  function labLessons(labKey, gun) {
    if (!apiData) return [];
    const today = apiData.date;
    return (apiData.lessons || [])
      .filter(l => l.lab === labKey && l.gun === gun)
      .filter(l => {
        if (l.onlyOn && l.onlyOn !== today) return false;
        if (Array.isArray(l.hiddenOn) && l.hiddenOn.includes(today)) return false;
        return true;
      })
      .sort((a, b) => parseHM(a.bas) - parseHM(b.bas));
  }

  // ----- Countdown ring -----
  function buildCountdown(col, value, unit) {
    const wrap = el("div", { className: "countdown", attrs: { "aria-hidden": "true" } });
    const size = 110;
    const r = 46;
    const c = 2 * Math.PI * r;
    const svg = svgEl("svg", { viewBox: "0 0 " + size + " " + size });
    svg.appendChild(svgEl("circle", { class: "track", cx: size/2, cy: size/2, r }));
    const bar = svgEl("circle", { class: "bar", cx: size/2, cy: size/2, r, "stroke-dasharray": String(c), "stroke-dashoffset": String(c) });
    svg.appendChild(bar);
    wrap.appendChild(svg);
    // Label
    const lbl = el("div", { className: "label" });
    lbl.appendChild(el("div", { className: "val", text: value }));
    lbl.appendChild(el("div", { className: "unit", text: unit }));
    wrap.appendChild(lbl);
    return { node: wrap, bar, circumference: c };
  }
  function setCountdownPct(ring, pct) {
    const offset = ring.circumference * (1 - pct);
    ring.bar.setAttribute("stroke-dashoffset", String(offset));
  }

  // ----- Render lab column -----
  function renderLabCol(lab) {
    const col = el("div", { className: "lab-col", attrs: { "data-lab": lab.key } });

    const now = new Date();
    const gun = todayGun(now);
    const m = nowMin(now);
    const lessons = gun ? labLessons(lab.key, gun) : [];

    const current = lessons.find(l => parseHM(l.bas) <= m && m < parseHM(l.bit));
    const future = lessons.filter(l => parseHM(l.bas) > m);
    const nextLesson = future[0] || null;

    // Head
    const head = el("div", { className: "lab-head" });
    const id = el("div", { className: "lab-id" });
    id.appendChild(el("div", { className: "lab-letter", text: lab.key }));
    const nameBlock = el("div", { className: "lab-name" });
    nameBlock.appendChild(document.createTextNode(lab.name));
    nameBlock.appendChild(el("small", { text: "Laboratuvar" }));
    id.appendChild(nameBlock);
    head.appendChild(id);

    const status = el("div", { className: "lab-status " + (current ? "live" : "") });
    status.appendChild(el("span", { className: "dot" }));
    if (current) status.appendChild(el("span", { text: "Canlı" }));
    else if (!gun) status.appendChild(el("span", { text: "Hafta sonu" }));
    else if (!lessons.length) status.appendChild(el("span", { text: "Boş gün" }));
    else if (m < parseHM(lessons[0].bas)) status.appendChild(el("span", { text: "Bekliyor" }));
    else if (nextLesson) status.appendChild(el("span", { text: "Teneffüs" }));
    else status.appendChild(el("span", { text: "Tamamlandı" }));
    head.appendChild(status);
    col.appendChild(head);

    // NOW box
    if (current) {
      col.appendChild(buildNowCurrent(current, m, lab));
    } else {
      col.appendChild(buildNowEmpty(gun, lessons, nextLesson, m));
    }

    // Upcoming list
    col.appendChild(buildUpcoming(future, m, lab.key));

    return col;
  }

  function buildNowCurrent(lesson, m, lab) {
    const box = el("div", { className: "now live" });
    const info = el("div", { className: "now-info" });
    info.appendChild(el("div", { className: "now-eyebrow", text: "Şu anki ders" }));
    info.appendChild(el("div", { className: "now-class", text: lesson.ad }));

    const meta = el("div", { className: "now-meta" });
    meta.appendChild(el("span", { className: "time", text: lesson.bas + " – " + lesson.bit }));
    const teacher = teacherById[lesson.teacherId];
    if (teacher) {
      meta.appendChild(el("span", { className: "dot-sep", text: "·" }));
      meta.appendChild(el("span", { className: "teacher", text: teacher.name }));
    }
    if (lesson.substitute) {
      meta.appendChild(el("span", { className: "sub-tag", text: "↪ Yerine" }));
    }
    info.appendChild(meta);
    box.appendChild(info);

    // Circular countdown
    const bas = parseHM(lesson.bas), bit = parseHM(lesson.bit);
    const remaining = Math.max(0, bit - m);
    const total = bit - bas;
    const pct = 1 - Math.min(1, remaining / total); // fills as time passes
    const ring = buildCountdown("current", String(Math.max(0, Math.ceil(remaining))), "dk kaldı");
    box.appendChild(ring.node);
    setTimeout(() => setCountdownPct(ring, pct), 30);

    return box;
  }

  function buildNowEmpty(gun, lessons, nextLesson, m) {
    const box = el("div", { className: "now empty" });
    const info = el("div", { className: "now-info" });

    let label = "Şu an";
    let headline = "Ders yok";
    let metaText = "";

    if (!gun) {
      label = "Bugün";
      headline = "Hafta sonu";
      metaText = "Pazartesi 09:00 · okul başlıyor";
    } else if (!lessons.length) {
      label = "Bugün";
      headline = "Bu lab bugün kapalı";
      metaText = "Planlı ders yok";
    } else if (m < parseHM(lessons[0].bas)) {
      label = "Günün ilk dersi";
      headline = lessons[0].ad;
      const diff = Math.ceil(parseHM(lessons[0].bas) - m);
      metaText = lessons[0].bas + " · " + diff + " dk sonra";
    } else if (!nextLesson) {
      label = "Bugün";
      headline = "Dersler bitti";
      metaText = "Lab artık boş";
    } else {
      label = "Teneffüs";
      headline = nextLesson.ad;
      const diff = Math.ceil(parseHM(nextLesson.bas) - m);
      metaText = nextLesson.bas + " · " + diff + " dk sonra";
    }

    info.appendChild(el("div", { className: "now-eyebrow", text: label }));
    info.appendChild(el("div", { className: "now-class", text: headline }));
    if (metaText) {
      const meta = el("div", { className: "now-meta" });
      meta.appendChild(el("span", { className: "time", text: metaText }));
      if (nextLesson && teacherById[nextLesson.teacherId]) {
        meta.appendChild(el("span", { className: "dot-sep", text: "·" }));
        meta.appendChild(el("span", { className: "teacher", text: teacherById[nextLesson.teacherId].name }));
      }
      if (nextLesson && nextLesson.substitute) {
        meta.appendChild(el("span", { className: "sub-tag", text: "↪ Yerine" }));
      }
      info.appendChild(meta);
    }
    box.appendChild(info);
    return box;
  }

  function buildUpcoming(future, m, labKey) {
    const wrap = el("div", { className: "upcoming" });
    wrap.appendChild(el("div", { className: "upcoming-label", text: "Sıradaki" }));

    if (!future.length) {
      wrap.appendChild(el("div", { className: "upcoming-empty", text: "Sıradaki ders yok" }));
      return wrap;
    }

    const list = el("div", { className: "upcoming-list" });
    const top = future.slice(0, 4);
    top.forEach((l, i) => {
      const imminent = i === 0 && parseHM(l.bas) - m <= 15; // "yaklaşan" vurgusu
      const row = el("div", { className: "up-row" + (l.substitute ? " sub" : "") + (imminent ? " imminent" : "") });
      row.appendChild(el("span", { className: "t", text: l.bas }));
      row.appendChild(el("span", { className: "n", text: l.ad }));
      const t = teacherById[l.teacherId];
      row.appendChild(el("span", { className: "ta", text: t ? shortTeacher(t.name) : "" }));
      list.appendChild(row);
    });
    wrap.appendChild(list);
    return wrap;
  }

  // ----- Main render -----
  function render() {
    const now = new Date();
    document.getElementById("kiosk-clock").textContent = fmtClock(now);
    document.getElementById("kiosk-date").textContent = fmtDate(now);

    const board = document.getElementById("labs-board");
    clear(board);
    for (const lab of LABS) board.appendChild(renderLabCol(lab));

    setupCarouselNav();
  }

  // ----- Mobile carousel nav dots -----
  function setupCarouselNav() {
    const board = document.getElementById("labs-board");
    const navDots = document.querySelectorAll(".nav-dot");

    // Update active dot based on scroll position (mobile only)
    const updateActive = () => {
      if (window.innerWidth > 900) {
        navDots.forEach(d => d.classList.remove("active"));
        return;
      }
      const cols = board.querySelectorAll(".lab-col");
      if (!cols.length) return;
      const boardRect = board.getBoundingClientRect();
      const centerX = boardRect.left + boardRect.width / 2;
      let closestIdx = 0, closestDist = Infinity;
      cols.forEach((c, i) => {
        const r = c.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const d = Math.abs(cx - centerX);
        if (d < closestDist) { closestDist = d; closestIdx = i; }
      });
      navDots.forEach((d, i) => d.classList.toggle("active", i === closestIdx));
    };
    board.addEventListener("scroll", updateActive, { passive: true });
    window.addEventListener("resize", updateActive);
    updateActive();

    // Click dot to scroll
    navDots.forEach((dot, i) => {
      dot.onclick = () => {
        const cols = board.querySelectorAll(".lab-col");
        const target = cols[i];
        if (!target) return;
        const scrollLeft = target.offsetLeft - (board.clientWidth - target.clientWidth) / 2;
        board.scrollTo({ left: scrollLeft, behavior: "smooth" });
      };
    });
  }

  // ----- Refresh handling -----
  async function refresh() {
    const btn = document.getElementById("refresh-btn");
    btn.classList.add("spinning");
    const data = await fetchData();
    btn.classList.remove("spinning");
    if (data) {
      apiData = data;
      flashFresh();
      render();
    }
  }
  function flashFresh() {
    const ind = document.getElementById("refresh-ind");
    ind.classList.remove("fresh");
    void ind.offsetWidth;
    ind.classList.add("fresh");
    setTimeout(() => ind.classList.remove("fresh"), FRESH_BLIP_MS);
  }

  // ----- Init -----
  async function init() {
    document.getElementById("refresh-btn").addEventListener("click", refresh);

    await refresh();
    // Clock + countdown ring + "imminent" recalc every second
    setInterval(render, 1000);
    // Re-fetch every 30s
    setInterval(refresh, 30 * 1000);
    // Refresh when tab becomes visible
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") refresh();
    });
    window.addEventListener("online", () => { setOffline(false); refresh(); });
    window.addEventListener("offline", () => setOffline(true));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
