// Lab availability: solid-color cards for free slots ≥30 min.
// All data is hardcoded from data-*.js — no user input is rendered.

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
  const MIN_SLOT  = 30;
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

  function el(tag, opts) {
    const e = document.createElement(tag);
    if (opts) {
      if (opts.className) e.className = opts.className;
      if (opts.text != null) e.textContent = opts.text;
      if (opts.style) e.setAttribute("style", opts.style);
      if (opts.title) e.setAttribute("title", opts.title);
      if (opts.aria) for (const k in opts.aria) e.setAttribute("aria-" + k, opts.aria[k]);
    }
    return e;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  // ----- Data -----
  function pad2(n) { return String(n).padStart(2, "0"); }
  function isoDateForProgGun(now, gun) {
    const today = now.getDay();
    const todayGun = today === 0 ? 7 : today;
    const target = new Date(now);
    target.setDate(target.getDate() + (gun - todayGun));
    return target.getFullYear() + "-" + pad2(target.getMonth() + 1) + "-" + pad2(target.getDate());
  }
  function collectIntervals(labKey, gun) {
    const out = [];
    const now = new Date();
    const gunDate = isoDateForProgGun(now, gun);
    for (const sch of (window.ALL_SCHEDULES || [])) {
      for (const p of sch.program) {
        if (p.lab !== labKey || p.gun !== gun) continue;
        // One-off substitute copies: only count on their matching date
        if (p.onlyOn && p.onlyOn !== gunDate) continue;
        // Originals hidden on this date (cancel/transfer)
        if (Array.isArray(p.hiddenOn) && p.hiddenOn.includes(gunDate)) continue;
        out.push({ bas: parseHM(p.bas), bit: parseHM(p.bit) });
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
  function daySlots(labKey, gun) {
    return gaps(merge(collectIntervals(labKey, gun))).filter(g => (g.bit - g.bas) >= MIN_SLOT);
  }
  function weekFreeMin(labKey) {
    let t = 0;
    for (let g = 1; g <= 5; g++) for (const s of daySlots(labKey, g)) t += (s.bit - s.bas);
    return t;
  }
  function weekSlotCount(labKey) {
    let n = 0;
    for (let g = 1; g <= 5; g++) n += daySlots(labKey, g).length;
    return n;
  }

  // ----- Render -----
  function renderTitle(labKey) {
    const bar = document.getElementById("lab-title");
    clear(bar);
    const lab = LABS.find(l => l.key === labKey);

    const h2 = el("h2");
    h2.appendChild(el("span", { className: "caret", text: "▸" }));
    h2.appendChild(document.createTextNode(lab.name + " Lab"));
    bar.appendChild(h2);

    const sum = el("div", { className: "summary" });
    sum.appendChild(el("strong", { text: fmtDur(weekFreeMin(labKey)) + " boş" }));
    sum.appendChild(document.createTextNode(weekSlotCount(labKey) + " slot · haftalık"));
    bar.appendChild(sum);
  }

  function renderDay(labKey, gun, todayGun, nowM) {
    const slots = daySlots(labKey, gun);
    const isToday = gun === todayGun;
    const section = el("section", {
      className: "day" + (isToday ? " today" : ""),
      style: "animation-delay: " + (80 + (gun - 1) * 50) + "ms;",
    });

    const head = el("div", { className: "day-head" });
    head.appendChild(el("h3", { className: "day-name", text: GUN_AD[gun] }));
    if (slots.length) {
      const total = slots.reduce((s, x) => s + (x.bit - x.bas), 0);
      head.appendChild(el("div", { className: "day-meta", text: slots.length + " slot · " + fmtDur(total) + " boş" }));
    }
    section.appendChild(head);

    if (!slots.length) {
      const empty = el("div", { className: "day-empty" });
      empty.appendChild(el("div", { className: "big", text: "Tamamen dolu" }));
      empty.appendChild(el("div", { className: "sub", text: "30 dk+ boşluk yok" }));
      section.appendChild(empty);
      return section;
    }

    const grid = el("div", { className: "slots" });
    slots.forEach((s, i) => {
      const dur = s.bit - s.bas;
      const past = isToday && nowM >= s.bit;
      const card = el("div", {
        className: "slot" + (past ? " past" : ""),
        style: "animation-delay: " + (140 + i * 60) + "ms;",
        title: fmtHM(s.bas) + " – " + fmtHM(s.bit) + " · " + fmtDur(dur) + " boş",
      });

      const top = el("div", { className: "slot-top" });
      top.appendChild(el("span", { className: "slot-tag", text: "BOŞ" }));
      top.appendChild(el("span", { className: "slot-index", text: pad(i + 1) }));
      card.appendChild(top);

      const time = el("div", { className: "slot-time" });
      time.appendChild(document.createTextNode(fmtHM(s.bas)));
      time.appendChild(el("span", { className: "arrow", text: "→" }));
      time.appendChild(document.createTextNode(fmtHM(s.bit)));
      card.appendChild(time);

      const bot = el("div", { className: "slot-bottom" });
      bot.appendChild(el("span", { className: "slot-dur", text: fmtDur(dur) }));
      card.appendChild(bot);

      grid.appendChild(card);
    });
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
      if (sub) sub.textContent = fmtDur(weekFreeMin(k)) + " boş";
    });

    renderTitle(labKey);

    const d = new Date();
    const todayGun = (d.getDay() >= 1 && d.getDay() <= 5) ? d.getDay() : null;
    const nowM = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;

    const days = document.getElementById("days");
    clear(days);
    for (let g = 1; g <= 5; g++) days.appendChild(renderDay(labKey, g, todayGun, nowM));
  }

  function tickClock() {
    const d = new Date();
    const c = document.getElementById("clock");
    const dt = document.getElementById("date");
    if (c) c.textContent = fmtClock(d);
    if (dt) dt.textContent = fmtDate(d);
  }
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
