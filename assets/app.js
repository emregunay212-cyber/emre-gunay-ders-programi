// Shared schedule rendering. Expects window.SCHEDULE = { teacher: "...", program: [...] }
// Each program entry: { gun: 1-5, bas: "HH:MM", bit: "HH:MM", ad, lab: "i"|"O"|"L"|"", kademe }
// All data is hardcoded constants — no user input is rendered.

(function () {
  const GUN_AD = ["Pazar","Pazartesi","Salı","Çarşamba","Perşembe","Cuma","Cumartesi"];
  const AY_AD  = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];

  const KADEME_AD = {
    anaokulu: "Anaokulu",
    ilkokul:  "İlkokul",
    ortaokul: "Ortaokul",
    lise:     "Lise",
    toplanti: "Toplantı",
    amazing:  "Amazing",
  };

  const LAB_AD = {
    "i": "İlkokul Lab",
    "O": "Ortaokul Lab",
    "L": "Lise Lab",
  };

  function jsDayToProgGun(d) { return (d >= 1 && d <= 5) ? d : null; }
  function parseHM(str) { const [h, m] = str.split(":").map(Number); return h * 60 + m; }
  function pad(n) { return String(n).padStart(2, "0"); }
  function formatClock(d) { return pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds()); }
  function formatDate(d) { return GUN_AD[d.getDay()] + ", " + d.getDate() + " " + AY_AD[d.getMonth()]; }
  function nowMinutes(d) { return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60; }

  // Substitute lessons are one-time transfers from an absent teacher.
  // Once their end time passes, remove them from view entirely (not just "done").
  function filterExpiredSubstitutes(prog, d) {
    const todayG = jsDayToProgGun(d.getDay());
    const m = nowMinutes(d);
    return prog.filter(p => {
      if (!p.substitute) return true;
      if (p.gun !== todayG) return true; // defensive
      return parseHM(p.bit) > m;          // still ongoing or upcoming
    });
  }

  function findCurrent(d, prog) {
    const g = jsDayToProgGun(d.getDay());
    if (!g) return null;
    const m = nowMinutes(d);
    return prog.find(p => p.gun === g && parseHM(p.bas) <= m && m < parseHM(p.bit)) || null;
  }

  function findNext(d, prog) {
    const g = jsDayToProgGun(d.getDay());
    const m = nowMinutes(d);
    if (g) {
      const todayNext = prog
        .filter(p => p.gun === g && parseHM(p.bas) > m)
        .sort((a, b) => parseHM(a.bas) - parseHM(b.bas))[0];
      if (todayNext) return { ders: todayNext, ayniGun: true };
    }
    const today = d.getDay();
    for (let i = 1; i <= 7; i++) {
      const checkDay = (today + i) % 7;
      if (checkDay < 1 || checkDay > 5) continue;
      const dersler = prog
        .filter(p => p.gun === checkDay)
        .sort((a, b) => parseHM(a.bas) - parseHM(b.bas));
      if (dersler.length) {
        return { ders: dersler[0], ayniGun: false, dayDiff: i };
      }
    }
    return null;
  }

  function progressPct(p, d) {
    const bas = parseHM(p.bas), bit = parseHM(p.bit);
    return Math.max(0, Math.min(100, ((nowMinutes(d) - bas) / (bit - bas)) * 100));
  }
  function kalanDk(p, d) { return Math.max(0, Math.ceil(parseHM(p.bit) - nowMinutes(d))); }
  function dkSonra(p, d) { return Math.max(0, Math.ceil(parseHM(p.bas) - nowMinutes(d))); }

  // Safe DOM helpers
  function el(tag, opts) {
    const e = document.createElement(tag);
    if (opts) {
      if (opts.className) e.className = opts.className;
      if (opts.text != null) e.textContent = opts.text;
      if (opts.style) e.setAttribute("style", opts.style);
      if (opts.title) e.setAttribute("title", opts.title);
      if (opts.href) e.setAttribute("href", opts.href);
    }
    return e;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function makeKademeBadge(kademe) {
    return el("span", { className: "badge k-" + kademe, text: KADEME_AD[kademe] || kademe });
  }
  function makeLabBadge(lab) {
    if (!lab) return null;
    return el("span", { className: "lab-badge", text: lab + "-Lab", title: LAB_AD[lab] || "" });
  }

  function renderNow(d, prog) {
    const area = document.getElementById("now-area");
    clear(area);
    const cur = findCurrent(d, prog);
    const g = jsDayToProgGun(d.getDay());

    if (!cur) {
      let msg;
      if (!g) msg = "Hafta sonu — bugün ders yok";
      else {
        const m = nowMinutes(d);
        const todayDersler = prog.filter(p => p.gun === g)
          .sort((a, b) => parseHM(a.bas) - parseHM(b.bas));
        if (!todayDersler.length) msg = "Bugün ders yok";
        else if (m < parseHM(todayDersler[0].bas)) msg = "Günün ilk dersi henüz başlamadı";
        else if (m >= parseHM(todayDersler[todayDersler.length - 1].bit)) msg = "Bugün için tüm dersler tamamlandı";
        else msg = "Şu an teneffüs · ders arası";
      }
      area.appendChild(el("div", { className: "card empty", text: msg }));
      return;
    }

    const card = el("div", { className: "card" });
    card.appendChild(el("div", { className: "label", text: "Şu anki ders" }));

    const baslik = el("div", { className: "ders-baslik" });
    baslik.appendChild(el("span", { className: "ders-ad", text: cur.ad }));
    baslik.appendChild(makeKademeBadge(cur.kademe));
    const lb = makeLabBadge(cur.lab);
    if (lb) baslik.appendChild(lb);
    if (cur.substitute) baslik.appendChild(el("span", { className: "sub-badge", text: "Yerine" }));
    card.appendChild(baslik);
    if (cur.substitute) card.appendChild(el("div", { className: "sub-origin", text: "Bu ders bugün sana devredildi" }));

    const meta = el("div", { className: "meta" });
    const left = el("span");
    left.appendChild(el("strong", { text: cur.bas }));
    left.appendChild(document.createTextNode(" – "));
    left.appendChild(el("strong", { text: cur.bit }));
    meta.appendChild(left);
    meta.appendChild(el("span", { text: kalanDk(cur, d) + " dk kaldı" }));
    card.appendChild(meta);

    const prog2 = el("div", { className: "progress k-" + cur.kademe, style: "color: var(--" + cur.kademe + ");" });
    prog2.appendChild(el("span", { style: "width: " + progressPct(cur, d).toFixed(1) + "%;" }));
    card.appendChild(prog2);

    area.appendChild(card);
  }

  function renderNext(d, prog) {
    const area = document.getElementById("next-area");
    clear(area);
    const nx = findNext(d, prog);
    if (!nx) return;
    const { ders, ayniGun, dayDiff } = nx;

    let whenText;
    if (ayniGun) {
      const dk = dkSonra(ders, d);
      whenText = dk < 60 ? (ders.bas + " · " + dk + " dk sonra") : ("Bugün " + ders.bas);
    } else {
      whenText = GUN_AD[ders.gun] + " " + ders.bas + (dayDiff === 1 ? " · yarın" : "");
    }

    const card = el("div", { className: "card" });
    card.appendChild(el("div", { className: "label", text: "Sonraki ders" }));

    const row = el("div", { className: "next-row" });
    const info = el("div", { className: "next-info" });
    const name = el("div", { className: "next-name" });
    name.appendChild(el("span", { text: ders.ad }));
    name.appendChild(makeKademeBadge(ders.kademe));
    const lb = makeLabBadge(ders.lab);
    if (lb) name.appendChild(lb);
    if (ders.substitute) name.appendChild(el("span", { className: "sub-badge", text: "Yerine" }));
    info.appendChild(name);
    info.appendChild(el("div", { className: "next-when", text: whenText }));
    row.appendChild(info);
    card.appendChild(row);

    area.appendChild(card);
  }

  function renderWeekly(d, prog) {
    const wrap = document.getElementById("weekly");
    clear(wrap);
    const todayG = jsDayToProgGun(d.getDay());
    const m = nowMinutes(d);
    const cur = findCurrent(d, prog);

    for (let g = 1; g <= 5; g++) {
      const dersler = prog
        .filter(p => p.gun === g)
        .sort((a, b) => parseHM(a.bas) - parseHM(b.bas));
      const isToday = g === todayG;
      const day = el("div", { className: "day" + (isToday ? " today" : "") });
      day.appendChild(el("div", { className: "day-name", text: GUN_AD[g] + (isToday ? " · bugün" : "") }));

      if (!dersler.length) {
        day.appendChild(el("div", { className: "day-empty", text: "Ders yok" }));
      } else {
        const chips = el("div", { className: "chips" });
        for (const p of dersler) {
          let cls = "chip k-" + p.kademe;
          if (isToday) {
            if (cur && cur === p) cls += " now";
            else if (parseHM(p.bit) <= m) cls += " done";
          }
          const titleParts = [p.bas + "–" + p.bit];
          if (p.lab) titleParts.push(LAB_AD[p.lab] || "");
          if (p.substitute) titleParts.push("Devir");
          const chip = el("span", { className: cls + (p.substitute ? " substitute" : ""), style: "color: var(--" + p.kademe + ");", title: titleParts.join(" · ") });
          chip.appendChild(el("span", { className: "t", text: p.bas }));
          chip.appendChild(document.createTextNode(p.ad));
          if (p.lab) chip.appendChild(el("span", { className: "lb", text: p.lab }));
          if (p.substitute) chip.appendChild(el("span", { className: "lb", text: "↪", style: "background: #fb7185; color: #1c0710;" }));
          chips.appendChild(chip);
        }
        day.appendChild(chips);
      }
      wrap.appendChild(day);
    }
  }

  function tick() {
    const d = new Date();
    const data = window.SCHEDULE;
    if (!data) return;
    document.getElementById("clock").textContent = formatClock(d);
    document.getElementById("date").textContent = formatDate(d);
    const teacherEl = document.getElementById("teacher-name");
    if (teacherEl && !teacherEl.textContent) teacherEl.textContent = data.teacher;
    // Hide substitute (one-time) lessons once their end time passes
    const prog = filterExpiredSubstitutes(data.program || [], d);
    renderNow(d, prog);
    renderNext(d, prog);
    renderWeekly(d, prog);
  }

  document.addEventListener("DOMContentLoaded", function () {
    tick();
    setInterval(tick, 1000);
  });
})();
