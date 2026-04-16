// Kiosk: fullscreen lab board for hallway/office display.
// Shows all 3 labs' current + next lessons side by side; refreshes every 30s.

(function () {
  const GUN_AD = ["Pazar","Pazartesi","Salı","Çarşamba","Perşembe","Cuma","Cumartesi"];
  const AY_AD  = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];
  const LABS = [
    { key: "i", name: "İlkokul" },
    { key: "O", name: "Ortaokul" },
    { key: "L", name: "Lise" },
  ];

  let apiData = null;
  let teacherById = {};

  function pad(n) { return String(n).padStart(2, "0"); }
  function parseHM(s) { const [h, m] = s.split(":").map(Number); return h * 60 + m; }
  function fmtHM(m) { return pad(Math.floor(m / 60)) + ":" + pad(m % 60); }
  function fmtClock(d) { return pad(d.getHours()) + ":" + pad(d.getMinutes()); }
  function fmtDate(d) { return GUN_AD[d.getDay()] + ", " + d.getDate() + " " + AY_AD[d.getMonth()]; }
  function nowMin(d) { return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60; }
  function todayGun(d) { return (d.getDay() >= 1 && d.getDay() <= 5) ? d.getDay() : null; }

  function el(tag, opts, ...children) {
    const e = document.createElement(tag);
    if (opts) {
      if (opts.className) e.className = opts.className;
      if (opts.text != null) e.textContent = opts.text;
      if (opts.style) e.setAttribute("style", opts.style);
      if (opts.title) e.setAttribute("title", opts.title);
      if (opts.attrs) for (const k in opts.attrs) e.setAttribute(k, opts.attrs[k]);
    }
    for (const c of children) {
      if (c == null) continue;
      if (typeof c === "string") e.appendChild(document.createTextNode(c));
      else e.appendChild(c);
    }
    return e;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }

  async function fetchData() {
    try {
      const r = await fetch("/api/schedules/today", { credentials: "same-origin" });
      if (!r.ok) return null;
      const data = await r.json();
      teacherById = Object.fromEntries((data.teachers || []).map(t => [t.id, t]));
      return data;
    } catch { return null; }
  }

  function labLessons(labKey, gun) {
    if (!apiData) return [];
    const today = apiData.date; // YYYY-MM-DD from server
    return (apiData.lessons || [])
      .filter(l => l.lab === labKey && l.gun === gun)
      .filter(l => {
        if (l.onlyOn && l.onlyOn !== today) return false;
        if (Array.isArray(l.hiddenOn) && l.hiddenOn.includes(today)) return false;
        return true;
      })
      .sort((a, b) => parseHM(a.bas) - parseHM(b.bas));
  }

  function renderLabCol(lab) {
    const col = el("div", { className: "lab-col", attrs: { "data-lab": lab.key } });

    const now = new Date();
    const gun = todayGun(now);
    const m = nowMin(now);
    const lessons = gun ? labLessons(lab.key, gun) : [];

    // Find current + upcoming
    const current = lessons.find(l => parseHM(l.bas) <= m && m < parseHM(l.bit));
    const upcoming = lessons.filter(l => parseHM(l.bas) > m).slice(0, 5);

    // Head
    const head = el("div", { className: "lab-head" });
    const name = el("div", { className: "lab-name" });
    name.appendChild(el("span", { className: "letter", text: lab.key }));
    name.appendChild(document.createTextNode(" " + lab.name));
    head.appendChild(name);
    const status = el("div", { className: "lab-status " + (current ? "live" : "") });
    status.appendChild(el("span", { className: "dot" }));
    status.appendChild(document.createTextNode(current ? "Ders var" : (upcoming.length ? "Boş" : "Günlük bitti")));
    head.appendChild(status);
    col.appendChild(head);

    // Now box
    if (current) {
      const box = el("div", { className: "now-box" });
      box.appendChild(el("div", { className: "now-label", text: "Şu Anda" }));
      box.appendChild(el("div", { className: "now-class", text: current.ad }));

      const teacher = teacherById[current.teacherId];
      const metaParts = [current.bas + " – " + current.bit];
      if (teacher) metaParts.push(teacher.name);
      if (current.substitute) metaParts.push("↪ Yerine");
      const meta = el("div", { className: "now-meta" });
      meta.appendChild(document.createTextNode(metaParts.join(" · ")));
      box.appendChild(meta);

      const bas = parseHM(current.bas), bit = parseHM(current.bit);
      const pct = Math.max(0, Math.min(100, ((m - bas) / (bit - bas)) * 100));
      const prog = el("div", { className: "now-progress" });
      prog.appendChild(el("span", { style: "width:" + pct.toFixed(1) + "%;" }));
      box.appendChild(prog);
      col.appendChild(box);
    } else if (!gun) {
      col.appendChild(el("div", { className: "now-box empty", text: "Hafta sonu" }));
    } else if (!lessons.length) {
      col.appendChild(el("div", { className: "now-box empty", text: "Bugün ders yok" }));
    } else if (upcoming.length) {
      col.appendChild(el("div", { className: "now-box empty", text: "Şu an teneffüs" }));
    } else {
      col.appendChild(el("div", { className: "now-box empty", text: "Bugünkü dersler bitti" }));
    }

    // Upcoming
    const up = el("div", { className: "lab-upcoming" });
    up.appendChild(el("div", { className: "upcoming-label", text: upcoming.length ? "Sıradaki Dersler" : "Sıradaki ders yok" }));
    const list = el("div", { className: "upcoming-list" });
    for (const l of upcoming) {
      const row = el("div", { className: "up-row" + (l.substitute ? " sub" : "") });
      row.appendChild(el("span", { className: "t", text: l.bas }));
      row.appendChild(el("span", { className: "n", text: l.ad }));
      const teacher = teacherById[l.teacherId];
      row.appendChild(el("span", { className: "ta", text: teacher ? teacher.name.split(" ").slice(-1)[0] : "" }));
      list.appendChild(row);
    }
    up.appendChild(list);
    col.appendChild(up);

    return col;
  }

  function render() {
    const now = new Date();
    document.getElementById("kiosk-clock").textContent = fmtClock(now);
    document.getElementById("kiosk-date").textContent = fmtDate(now);

    const board = document.getElementById("labs-board");
    clear(board);
    for (const lab of LABS) board.appendChild(renderLabCol(lab));
  }

  async function refresh() {
    const data = await fetchData();
    if (data) apiData = data;
    render();
  }

  async function init() {
    await refresh();
    setInterval(render, 1000);          // clock + progress tick
    setInterval(refresh, 30 * 1000);    // refetch every 30s
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
