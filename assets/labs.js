// Lab availability: tabbed UI showing free slots ≥30 min as prominent cards per day.
// All data is hardcoded from data-*.js files — no user input is rendered.

(function () {
  const GUN_AD = ["Pazar","Pazartesi","Salı","Çarşamba","Perşembe","Cuma","Cumartesi"];
  const AY_AD  = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];

  const LABS = [
    { key: "i", name: "İlkokul" },
    { key: "O", name: "Ortaokul" },
    { key: "L", name: "Lise" },
  ];

  const DAY_START = 9 * 60;       // 09:00
  const DAY_END   = 17 * 60;      // 17:00
  const MIN_SLOT  = 30;           // sadece ≥30dk boşluklar gösterilir
  const STORAGE_KEY = "labs.selected";

  function pad(n) { return String(n).padStart(2, "0"); }
  function parseHM(s) { const [h, m] = s.split(":").map(Number); return h * 60 + m; }
  function fmtHM(m) { return pad(Math.floor(m / 60)) + ":" + pad(m % 60); }
  function fmtDur(m) {
    if (m < 60) return m + " dakika";
    const h = Math.floor(m / 60), r = m % 60;
    if (!r) return h === 1 ? "1 saat" : (h + " saat");
    return (h === 1 ? "1 saat " : (h + " saat ")) + r + " dakika";
  }
  function fmtDurShort(m) {
    if (m < 60) return m + " dk";
    const h = Math.floor(m / 60), r = m % 60;
    return r ? (h + "sa " + r + "dk") : (h + "sa");
  }
  function fmtClock(d) { return pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds()); }
  function fmtDate(d) { return GUN_AD[d.getDay()] + " · " + d.getDate() + " " + AY_AD[d.getMonth()]; }

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
  function collectIntervals(labKey, gun) {
    const out = [];
    for (const sch of (window.ALL_SCHEDULES || [])) {
      for (const p of sch.program) {
        if (p.lab === labKey && p.gun === gun) {
          out.push({ bas: parseHM(p.bas), bit: parseHM(p.bit) });
        }
      }
    }
    out.sort((a, b) => a.bas - b.bas || a.bit - b.bit);
    return out;
  }
  function merge(iv) {
    if (!iv.length) return [];
    const m = [{ bas: iv[0].bas, bit: iv[0].bit }];
    for (let i = 1; i < iv.length; i++) {
      const c = iv[i], last = m[m.length - 1];
      if (c.bas <= last.bit) last.bit = Math.max(last.bit, c.bit);
      else m.push({ bas: c.bas, bit: c.bit });
    }
    return m;
  }
  function gaps(merged) {
    const out = [];
    let cursor = DAY_START;
    for (const iv of merged) {
      if (iv.bas > cursor) out.push({ bas: cursor, bit: Math.min(iv.bas, DAY_END) });
      cursor = Math.max(cursor, iv.bit);
      if (cursor >= DAY_END) break;
    }
    if (cursor < DAY_END) out.push({ bas: cursor, bit: DAY_END });
    return out;
  }
  function dayFreeSlots(labKey, gun) {
    const merged = merge(collectIntervals(labKey, gun));
    return gaps(merged).filter(g => (g.bit - g.bas) >= MIN_SLOT);
  }
  function weekFreeMin(labKey) {
    let total = 0;
    for (let g = 1; g <= 5; g++) {
      for (const s of dayFreeSlots(labKey, g)) total += (s.bit - s.bas);
    }
    return total;
  }
  function weekSlotCount(labKey) {
    let n = 0;
    for (let g = 1; g <= 5; g++) n += dayFreeSlots(labKey, g).length;
    return n;
  }

  // ----- Rendering -----
  function renderHero(labKey) {
    const banner = document.getElementById("lab-hero");
    clear(banner);
    const lab = LABS.find(l => l.key === labKey);

    const left = el("div");
    left.appendChild(el("div", { className: "eyebrow", text: lab.key + "-Lab · Boş Zamanlar" }));
    const h2 = el("h2");
    h2.appendChild(document.createTextNode(lab.name));
    h2.appendChild(el("em", { text: "Laboratuvarı" }));
    left.appendChild(h2);
    banner.appendChild(left);

    const stats = el("div", { className: "lab-hero-stats" });
    stats.appendChild(el("span", { className: "big", text: fmtDurShort(weekFreeMin(labKey)) }));
    stats.appendChild(document.createTextNode("haftalık boş · " + weekSlotCount(labKey) + " slot"));
    banner.appendChild(stats);
  }

  function renderDay(labKey, gun, todayGun, nowM) {
    const slots = dayFreeSlots(labKey, gun);
    const isToday = gun === todayGun;
    const section = el("section", { className: "day" + (isToday ? " today" : "") });

    const head = el("div", { className: "day-head" });
    head.appendChild(el("div", { className: "day-name", text: GUN_AD[gun] }));

    if (slots.length) {
      const totalMin = slots.reduce((s, x) => s + (x.bit - x.bas), 0);
      const meta = el("div", { className: "day-meta" });
      meta.appendChild(document.createTextNode(slots.length + " slot"));
      meta.appendChild(el("strong", { text: fmtDurShort(totalMin) + " boş" }));
      head.appendChild(meta);
    }
    section.appendChild(head);

    if (!slots.length) {
      const empty = el("div", { className: "day-empty" });
      const msg = el("div");
      msg.appendChild(el("span", { className: "msg", text: "Tamamen dolu" }));
      empty.appendChild(msg);
      empty.appendChild(el("span", { className: "sub", text: "30 dk+ boşluk yok" }));
      section.appendChild(empty);
      return section;
    }

    const grid = el("div", { className: "slots" });
    let idx = 0;
    for (const s of slots) {
      const dur = s.bit - s.bas;
      const past = isToday && nowM >= s.bit;
      const card = el("div", {
        className: "slot" + (past ? " past" : ""),
        style: "animation-delay: " + (80 + idx * 60) + "ms;",
        title: fmtHM(s.bas) + " – " + fmtHM(s.bit) + " (" + fmtDur(dur) + ")",
      });

      const time = el("div", { className: "slot-time" });
      time.appendChild(document.createTextNode(fmtHM(s.bas)));
      time.appendChild(el("span", { className: "arrow", text: " → " }));
      time.appendChild(document.createTextNode(fmtHM(s.bit)));
      card.appendChild(time);

      card.appendChild(el("span", { className: "slot-dur", text: fmtDur(dur) }));
      grid.appendChild(card);
      idx++;
    }
    section.appendChild(grid);
    return section;
  }

  function renderLab(labKey) {
    const page = document.getElementById("page");
    page.setAttribute("data-lab", labKey);

    document.querySelectorAll(".lab-tab").forEach(t => {
      const k = t.getAttribute("data-lab");
      t.classList.toggle("active", k === labKey);
      const sub = t.querySelector(".tab-free");
      if (sub) sub.textContent = fmtDurShort(weekFreeMin(k)) + " / hafta";
    });

    renderHero(labKey);

    const d = new Date();
    const todayGun = (d.getDay() >= 1 && d.getDay() <= 5) ? d.getDay() : null;
    const nowM = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;

    const days = document.getElementById("days");
    clear(days);
    for (let g = 1; g <= 5; g++) {
      days.appendChild(renderDay(labKey, g, todayGun, nowM));
    }
  }

  function tickClock() {
    const d = new Date();
    const c = document.getElementById("clock");
    const dt = document.getElementById("date");
    if (c) c.textContent = fmtClock(d);
    if (dt) dt.textContent = fmtDate(d);
  }

  // Re-render current lab periodically so "past" slots update
  function tickPanel() {
    const page = document.getElementById("page");
    const k = page.getAttribute("data-lab");
    if (k) renderLab(k);
  }

  function init() {
    document.querySelectorAll(".lab-tab").forEach(tab => {
      tab.addEventListener("click", () => {
        const k = tab.getAttribute("data-lab");
        try { localStorage.setItem(STORAGE_KEY, k); } catch (e) {}
        renderLab(k);
      });
    });

    let initial = "i";
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && LABS.find(l => l.key === saved)) initial = saved;
    } catch (e) {}

    renderLab(initial);
    tickClock();
    setInterval(tickClock, 1000);
    setInterval(tickPanel, 60 * 1000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
