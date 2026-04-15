// Lab availability: aggregates all schedules, computes free/occupied slots per lab per day.

(function () {
  const GUN_AD = ["Pazar","Pazartesi","Salı","Çarşamba","Perşembe","Cuma","Cumartesi"];
  const AY_AD  = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];

  const LABS = [
    { key: "i", name: "İlkokul Laboratuvarı", kademe: "ilkokul" },
    { key: "O", name: "Ortaokul Laboratuvarı", kademe: "ortaokul" },
    { key: "L", name: "Lise Laboratuvarı", kademe: "lise" },
  ];

  // Operating window (minutes since midnight)
  const DAY_START = 9 * 60;       // 09:00
  const DAY_END   = 17 * 60;      // 17:00
  const MIN_GAP   = 10;           // 10 dk altı boşlukları gösterme

  function pad(n) { return String(n).padStart(2, "0"); }
  function parseHM(s) { const [h, m] = s.split(":").map(Number); return h * 60 + m; }
  function fmtHM(m) { return pad(Math.floor(m / 60)) + ":" + pad(m % 60); }
  function fmtDur(m) {
    if (m < 60) return m + " dk";
    const h = Math.floor(m / 60), r = m % 60;
    return r ? (h + " sa " + r + " dk") : (h + " sa");
  }
  function fmtClock(d) { return pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds()); }
  function fmtDate(d) { return GUN_AD[d.getDay()] + ", " + d.getDate() + " " + AY_AD[d.getMonth()]; }

  function collectLessons(labKey, gun) {
    const out = [];
    const all = window.ALL_SCHEDULES || [];
    for (const sch of all) {
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

  function computeGaps(merged, dayStart, dayEnd) {
    const gaps = [];
    let cursor = dayStart;
    for (const iv of merged) {
      if (iv.bas > cursor) gaps.push({ bas: cursor, bit: Math.min(iv.bas, dayEnd) });
      cursor = Math.max(cursor, iv.bit);
      if (cursor >= dayEnd) break;
    }
    if (cursor < dayEnd) gaps.push({ bas: cursor, bit: dayEnd });
    return gaps.filter(g => g.bit - g.bas >= MIN_GAP);
  }

  // Safe DOM helpers
  function el(tag, opts) {
    const e = document.createElement(tag);
    if (opts) {
      if (opts.className) e.className = opts.className;
      if (opts.text != null) e.textContent = opts.text;
      if (opts.style) e.setAttribute("style", opts.style);
      if (opts.title) e.setAttribute("title", opts.title);
    }
    return e;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function render() {
    const d = new Date();
    document.getElementById("clock").textContent = fmtClock(d);
    document.getElementById("date").textContent = fmtDate(d);

    const wrap = document.getElementById("labs-area");
    clear(wrap);

    const todayGun = (d.getDay() >= 1 && d.getDay() <= 5) ? d.getDay() : null;

    for (const lab of LABS) {
      const section = el("div", { className: "card" });
      const title = el("div", { className: "lab-title" });
      title.appendChild(el("span", { className: "badge k-" + lab.kademe, text: lab.key + "-Lab" }));
      title.appendChild(el("span", { className: "lab-title-text", text: lab.name }));
      section.appendChild(title);

      for (let g = 1; g <= 5; g++) {
        const lessons = collectLessons(lab.key, g);
        const merged = mergeIntervals(lessons);
        const gaps = computeGaps(merged, DAY_START, DAY_END);
        const isToday = g === todayGun;

        const dayRow = el("div", { className: "lab-day" + (isToday ? " today" : "") });
        dayRow.appendChild(el("div", { className: "lab-day-name", text: GUN_AD[g] + (isToday ? " · bugün" : "") }));

        if (!gaps.length) {
          dayRow.appendChild(el("div", { className: "lab-day-empty", text: "Tamamen dolu" }));
        } else {
          // Also show total free minutes
          const totalFree = gaps.reduce((s, g2) => s + (g2.bit - g2.bas), 0);
          dayRow.appendChild(el("div", { className: "lab-day-total", text: "Toplam boş: " + fmtDur(totalFree) }));

          const chips = el("div", { className: "chips" });
          for (const gap of gaps) {
            const dur = gap.bit - gap.bas;
            const chip = el("span", { className: "chip free-chip", title: fmtDur(dur) });
            chip.appendChild(el("span", { className: "t", text: fmtHM(gap.bas) + " – " + fmtHM(gap.bit) }));
            chip.appendChild(document.createTextNode(fmtDur(dur)));
            chips.appendChild(chip);
          }
          dayRow.appendChild(chips);
        }

        section.appendChild(dayRow);
      }
      wrap.appendChild(section);
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    render();
    setInterval(render, 1000);
  });
})();
