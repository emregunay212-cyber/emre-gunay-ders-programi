// Admin panel main controller.
// Single IIFE; section comments mark teachers, lessons, absences, analytics.
// All rendered content uses textContent / DOM nodes only — never innerHTML.

(function () {
  // ---------- Constants ----------
  const GUN_AD = ["Pazar","Pazartesi","Salı","Çarşamba","Perşembe","Cuma","Cumartesi"];
  const KADEME = [
    ["anaokulu","Anaokulu · 30 dk",30],
    ["ilkokul","İlkokul · 35 dk",35],
    ["ortaokul","Ortaokul · 35 dk",35],
    ["lise","Lise · 35 dk",35],
    ["toplanti","Toplantı",45],
    ["amazing","Amazing · 35 dk",35],
  ];
  const LABS = [["i","İlkokul Lab"],["O","Ortaokul Lab"],["L","Lise Lab"],["","Lab yok"]];

  // ---------- State ----------
  const state = {
    teachers: [],
    lessons: [],
    absences: [],
    activeTab: "teachers",
    selectedTeacherId: null,
    absenceDate: todayISO(),
  };

  // ---------- Utilities ----------
  function pad(n) { return String(n).padStart(2, "0"); }
  function parseHM(s) { const [h,m] = s.split(":").map(Number); return h*60+m; }
  function fmtHM(m) { return pad(Math.floor(m/60)) + ":" + pad(m%60); }
  function addMin(s, m) { return fmtHM(parseHM(s) + m); }

  function todayISO() {
    const d = new Date();
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(d);
    const y = parts.find(p=>p.type==="year").value;
    const mo = parts.find(p=>p.type==="month").value;
    const da = parts.find(p=>p.type==="day").value;
    return `${y}-${mo}-${da}`;
  }

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
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }

  function toast(msg, kind = "ok") {
    const host = document.getElementById("toast-host");
    const t = el("div", { className: "toast " + kind, text: msg });
    host.appendChild(t);
    setTimeout(() => { t.style.opacity = "0"; t.style.transform = "translateY(10px)"; }, 2600);
    setTimeout(() => t.remove(), 3000);
  }

  // ---------- API ----------
  async function api(method, path, body) {
    const opts = { method, credentials: "same-origin", headers: {} };
    if (body !== undefined) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(path, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || ("HTTP " + res.status));
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  async function checkAuth() {
    try {
      const r = await api("GET", "/api/auth/me");
      if (!r.admin) { location.replace("admin-login.html"); return false; }
      return true;
    } catch {
      location.replace("admin-login.html");
      return false;
    }
  }

  async function loadAll() {
    const data = await api("GET", "/api/schedules");
    state.teachers = data.teachers || [];
    state.lessons = data.lessons || [];
    state.absences = data.absences || [];
    if (state.teachers.length && !state.selectedTeacherId) {
      state.selectedTeacherId = state.teachers[0].id;
    }
  }

  // ---------- Modal ----------
  function openModal(contentBuilder) {
    const mb = document.getElementById("modal-backdrop");
    const m = document.getElementById("modal");
    clear(m);
    contentBuilder(m, () => closeModal());
    mb.classList.add("open");
    setTimeout(() => {
      const input = m.querySelector("input, select, textarea");
      if (input) input.focus();
    }, 30);
  }
  function closeModal() {
    document.getElementById("modal-backdrop").classList.remove("open");
  }
  document.getElementById("modal-backdrop").addEventListener("click", (e) => {
    if (e.target.id === "modal-backdrop") closeModal();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

  // ---------- Tabs ----------
  function switchTab(name) {
    state.activeTab = name;
    document.querySelectorAll(".tab").forEach(t => {
      t.classList.toggle("active", t.dataset.panel === name);
    });
    document.querySelectorAll(".panel").forEach(p => {
      p.classList.toggle("active", p.id === "panel-" + name);
    });
    const addBtnL = document.getElementById("btn-add-lesson");
    const addBtnT = document.getElementById("btn-add-teacher");
    if (addBtnL) addBtnL.style.display = name === "lessons" ? "" : "none";
    if (addBtnT) addBtnT.style.display = name === "teachers" ? "" : "none";
    if (name === "teachers") renderTeachers();
    if (name === "lessons") renderLessons();
    if (name === "absences") renderAbsences();
    if (name === "analytics") renderAnalytics();
  }
  document.querySelectorAll(".tab").forEach(t => {
    t.addEventListener("click", () => switchTab(t.dataset.panel));
  });
  document.getElementById("btn-add-teacher").addEventListener("click", () => openTeacherModal());
  document.getElementById("btn-add-lesson").addEventListener("click", () => openLessonModal());
  document.getElementById("logout-btn").addEventListener("click", async () => {
    try { await api("POST", "/api/auth/logout"); } catch {}
    location.replace("admin-login.html");
  });

  function updateCounts() {
    document.getElementById("cnt-t").textContent = state.teachers.length;
    document.getElementById("cnt-l").textContent = state.lessons.length;
    document.getElementById("cnt-a").textContent = state.absences.length;
  }

  // ========== TEACHERS ==========
  function renderTeachers() {
    const area = document.getElementById("teachers-area");
    clear(area);
    if (!state.teachers.length) {
      area.appendChild(el("div", { className: "day-empty-admin", text: "Öğretmen yok. Sağ üstten ekle." }));
      return;
    }
    const grid = el("div", { className: "teacher-grid" });
    for (const t of state.teachers) {
      const lessonCount = state.lessons.filter(l => l.teacherId === t.id).length;
      const card = el("div", { className: "teacher-card" });
      const head = el("div", { className: "teacher-card-head" });
      const nameBlock = el("div");
      nameBlock.appendChild(el("div", { className: "teacher-card-name", text: t.name }));
      nameBlock.appendChild(el("div", { className: "teacher-card-slug", text: "/" + t.slug + ".html" }));
      head.appendChild(nameBlock);
      card.appendChild(head);

      if (t.meta) card.appendChild(el("div", { className: "teacher-card-stats", text: t.meta }));

      const stats = el("div", { className: "teacher-card-stats" });
      const sp = el("span");
      sp.appendChild(el("strong", { text: String(lessonCount) }));
      sp.appendChild(document.createTextNode(" ders"));
      stats.appendChild(sp);
      card.appendChild(stats);

      const actions = el("div", { className: "teacher-card-actions" });
      actions.appendChild(el("button", {
        className: "btn btn-secondary btn-sm",
        text: "Düzenle",
        on: { click: () => openTeacherModal(t) },
      }));
      actions.appendChild(el("button", {
        className: "btn btn-danger btn-sm",
        text: "Sil",
        on: { click: () => deleteTeacher(t) },
      }));
      card.appendChild(actions);
      grid.appendChild(card);
    }
    area.appendChild(grid);
  }

  function openTeacherModal(teacher = null) {
    openModal((modal, close) => {
      const isEdit = !!teacher;
      modal.appendChild(el("button", { className: "modal-close", text: "×", on: { click: close } }));
      modal.appendChild(el("h3", { className: "modal-title", text: isEdit ? "Öğretmen düzenle" : "Yeni öğretmen" }));

      const form = el("form");

      const nameField = el("div", { className: "field" });
      nameField.appendChild(el("label", { text: "Ad Soyad", attrs: { for: "f-name" } }));
      const nameInput = el("input", { attrs: { id: "f-name", type: "text", required: "required" } });
      if (teacher) nameInput.value = teacher.name;
      nameField.appendChild(nameInput);

      const slugField = el("div", { className: "field" });
      slugField.appendChild(el("label", { text: "Slug (URL, a-z)", attrs: { for: "f-slug" } }));
      const slugInput = el("input", { attrs: { id: "f-slug", type: "text", pattern: "[a-z0-9-]+", required: "required" } });
      if (teacher) slugInput.value = teacher.slug;
      slugField.appendChild(slugInput);

      const metaField = el("div", { className: "field" });
      metaField.appendChild(el("label", { text: "Açıklama (opsiyonel)", attrs: { for: "f-meta" } }));
      const metaInput = el("input", { attrs: { id: "f-meta", type: "text", placeholder: "ör. İlkokul · Ortaokul" } });
      if (teacher && teacher.meta) metaInput.value = teacher.meta;
      metaField.appendChild(metaInput);

      form.appendChild(nameField);
      form.appendChild(slugField);
      form.appendChild(metaField);

      const errAlert = el("div", { className: "alert alert-err", style: "display:none" });
      form.appendChild(errAlert);

      const actions = el("div", { className: "form-actions" });
      actions.appendChild(el("button", { className: "btn btn-secondary", text: "İptal", attrs: { type: "button" }, on: { click: close } }));
      const submitBtn = el("button", { className: "btn btn-primary", text: isEdit ? "Kaydet" : "Oluştur", attrs: { type: "submit" } });
      actions.appendChild(submitBtn);
      form.appendChild(actions);

      if (!isEdit) {
        nameInput.addEventListener("input", () => {
          if (!slugInput.dataset.touched) slugInput.value = slugify(nameInput.value);
        });
        slugInput.addEventListener("input", () => { slugInput.dataset.touched = "1"; });
      }

      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        submitBtn.disabled = true;
        errAlert.style.display = "none";
        const payload = {
          name: nameInput.value.trim(),
          slug: slugInput.value.trim(),
          meta: metaInput.value.trim(),
        };
        try {
          if (isEdit) {
            const r = await api("PATCH", "/api/teachers/" + teacher.id, payload);
            const i = state.teachers.findIndex(x => x.id === teacher.id);
            if (i !== -1) state.teachers[i] = r.teacher;
            toast("Güncellendi", "ok");
          } else {
            const r = await api("POST", "/api/teachers", payload);
            state.teachers.push(r.teacher);
            toast("Eklendi", "ok");
          }
          updateCounts();
          renderTeachers();
          close();
        } catch (err) {
          errAlert.textContent = err.message || "Hata";
          errAlert.style.display = "block";
        } finally {
          submitBtn.disabled = false;
        }
      });
      modal.appendChild(form);
    });
  }

  async function deleteTeacher(t) {
    const lessonCount = state.lessons.filter(l => l.teacherId === t.id).length;
    const msg = lessonCount
      ? `${t.name} silinecek. Ayrıca bu öğretmene ait ${lessonCount} ders de silinecek.\nDevam edilsin mi?`
      : `${t.name} silinecek. Emin misin?`;
    if (!confirm(msg)) return;
    try {
      await api("DELETE", "/api/teachers/" + t.id);
      state.teachers = state.teachers.filter(x => x.id !== t.id);
      state.lessons = state.lessons.filter(l => l.teacherId !== t.id);
      if (state.selectedTeacherId === t.id) state.selectedTeacherId = state.teachers[0]?.id || null;
      updateCounts();
      renderTeachers();
      toast("Silindi", "ok");
    } catch (err) {
      toast(err.message || "Silinemedi", "err");
    }
  }

  function slugify(s) {
    return s.toLocaleLowerCase("tr-TR")
      .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s")
      .replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  // ========== LESSONS ==========
  function renderLessons() {
    const area = document.getElementById("lessons-area");
    clear(area);

    if (!state.teachers.length) {
      area.appendChild(el("div", { className: "day-empty-admin", text: "Önce bir öğretmen ekle." }));
      return;
    }

    const wrap = el("div", { className: "lessons-wrap" });

    const picker = el("div", { className: "teacher-picker" });
    for (const t of state.teachers) {
      const count = state.lessons.filter(l => l.teacherId === t.id).length;
      const btn = el("button", {
        className: "teacher-pick" + (t.id === state.selectedTeacherId ? " active" : ""),
        on: { click: () => { state.selectedTeacherId = t.id; renderLessons(); } },
      });
      btn.appendChild(document.createTextNode(t.name));
      btn.appendChild(el("small", { text: count + " ders" }));
      picker.appendChild(btn);
    }
    wrap.appendChild(picker);

    const days = el("div", { className: "lessons-days" });
    const selectedId = state.selectedTeacherId;
    for (let g = 1; g <= 5; g++) {
      const daySection = el("div", { className: "lessons-day" });
      const head = el("div", { className: "lessons-day-head" });
      head.appendChild(el("div", { className: "lessons-day-name", text: GUN_AD[g] }));
      const dayLessons = state.lessons
        .filter(l => l.teacherId === selectedId && l.gun === g)
        .sort((a, b) => parseHM(a.bas) - parseHM(b.bas));
      head.appendChild(el("div", { className: "lessons-day-meta", text: dayLessons.length + " ders" }));
      daySection.appendChild(head);

      if (!dayLessons.length) {
        daySection.appendChild(el("div", { className: "day-empty-admin", text: "Ders yok" }));
      } else {
        for (const l of dayLessons) daySection.appendChild(buildLessonRow(l));
      }
      days.appendChild(daySection);
    }
    wrap.appendChild(days);
    area.appendChild(wrap);
  }

  function buildLessonRow(l) {
    const row = el("div", { className: "lesson-row" });
    row.appendChild(el("div", { className: "time", text: l.bas + "–" + l.bit }));

    const adWrap = el("div", { className: "ad-wrap" });
    adWrap.appendChild(el("span", { className: "ad", text: l.ad }));
    const badges = el("span", { className: "badges" });
    badges.appendChild(el("span", { className: "badge-kademe k-" + l.kademe, text: l.kademe }));
    if (l.lab) badges.appendChild(el("span", { className: "badge-lab l-" + l.lab, text: l.lab + "-Lab" }));
    adWrap.appendChild(badges);
    row.appendChild(adWrap);

    const actions = el("div", { className: "actions" });
    actions.appendChild(el("button", {
      className: "btn btn-secondary btn-sm",
      text: "Düzenle",
      on: { click: () => openLessonModal(l) },
    }));
    actions.appendChild(el("button", {
      className: "btn btn-danger btn-sm",
      text: "Sil",
      on: { click: () => deleteLesson(l) },
    }));
    row.appendChild(actions);
    return row;
  }

  function openLessonModal(lesson = null) {
    if (!state.teachers.length) { toast("Önce öğretmen ekle", "err"); return; }
    openModal((modal, close) => {
      const isEdit = !!lesson;
      modal.appendChild(el("button", { className: "modal-close", text: "×", on: { click: close } }));
      modal.appendChild(el("h3", { className: "modal-title", text: isEdit ? "Dersi düzenle" : "Yeni ders" }));

      const form = el("form");

      const teacherField = el("div", { className: "field" });
      teacherField.appendChild(el("label", { text: "Öğretmen", attrs: { for: "f-teacher" } }));
      const teacherSel = el("select", { attrs: { id: "f-teacher", required: "required" } });
      for (const t of state.teachers) {
        const opt = el("option", { attrs: { value: t.id }, text: t.name });
        if ((lesson && lesson.teacherId === t.id) || (!lesson && state.selectedTeacherId === t.id)) opt.selected = true;
        teacherSel.appendChild(opt);
      }
      teacherField.appendChild(teacherSel);
      form.appendChild(teacherField);

      const gunField = el("div", { className: "field" });
      gunField.appendChild(el("label", { text: "Gün", attrs: { for: "f-gun" } }));
      const gunSel = el("select", { attrs: { id: "f-gun", required: "required" } });
      for (let g = 1; g <= 5; g++) {
        const opt = el("option", { attrs: { value: String(g) }, text: GUN_AD[g] });
        if (lesson && lesson.gun === g) opt.selected = true;
        gunSel.appendChild(opt);
      }
      gunField.appendChild(gunSel);
      form.appendChild(gunField);

      const row1 = el("div", { className: "field-row" });
      const kademeField = el("div", { className: "field" });
      kademeField.appendChild(el("label", { text: "Kademe", attrs: { for: "f-kademe" } }));
      const kademeSel = el("select", { attrs: { id: "f-kademe", required: "required" } });
      for (const [k, label] of KADEME) {
        const opt = el("option", { attrs: { value: k }, text: label });
        if (lesson && lesson.kademe === k) opt.selected = true;
        kademeSel.appendChild(opt);
      }
      kademeField.appendChild(kademeSel);
      row1.appendChild(kademeField);

      const labField = el("div", { className: "field" });
      labField.appendChild(el("label", { text: "Laboratuvar", attrs: { for: "f-lab" } }));
      const labSel = el("select", { attrs: { id: "f-lab" } });
      for (const [v, label] of LABS) {
        const opt = el("option", { attrs: { value: v }, text: label });
        if (lesson && (lesson.lab || "") === v) opt.selected = true;
        labSel.appendChild(opt);
      }
      labField.appendChild(labSel);
      row1.appendChild(labField);
      form.appendChild(row1);

      const adField = el("div", { className: "field" });
      adField.appendChild(el("label", { text: "Sınıf / Ders adı", attrs: { for: "f-ad" } }));
      const adInput = el("input", { attrs: { id: "f-ad", type: "text", required: "required", placeholder: "ör. 4/A, KAPLAN, Toplantı" } });
      if (lesson) adInput.value = lesson.ad;
      adField.appendChild(adInput);
      form.appendChild(adField);

      const row2 = el("div", { className: "field-row" });
      const basField = el("div", { className: "field" });
      basField.appendChild(el("label", { text: "Başlangıç", attrs: { for: "f-bas" } }));
      const basInput = el("input", { attrs: { id: "f-bas", type: "time", required: "required", step: "60" } });
      if (lesson) basInput.value = lesson.bas;
      basField.appendChild(basInput);
      row2.appendChild(basField);

      const bitField = el("div", { className: "field" });
      bitField.appendChild(el("label", { text: "Bitiş", attrs: { for: "f-bit" } }));
      const bitInput = el("input", { attrs: { id: "f-bit", type: "time", required: "required", step: "60" } });
      if (lesson) bitInput.value = lesson.bit;
      bitField.appendChild(bitInput);
      row2.appendChild(bitField);
      form.appendChild(row2);

      const autoRow = el("div", { className: "field", style: "flex-direction:row; align-items:center; gap:8px; margin-top:-8px;" });
      const autoCb = el("input", { attrs: { type: "checkbox", id: "f-auto" } });
      if (!isEdit) autoCb.checked = true;
      autoRow.appendChild(autoCb);
      autoRow.appendChild(el("label", {
        attrs: { for: "f-auto" },
        style: "font-family: var(--font-mono); font-size:10px; cursor:pointer; text-transform: none; letter-spacing: 0.04em;",
        text: "Başlangıç saatinden kademe süresine göre bitişi otomatik hesapla"
      }));
      form.appendChild(autoRow);

      function autocompleteBit() {
        if (!autoCb.checked || !basInput.value) return;
        const k = KADEME.find(x => x[0] === kademeSel.value);
        if (!k) return;
        bitInput.value = addMin(basInput.value, k[2]);
      }
      basInput.addEventListener("change", autocompleteBit);
      kademeSel.addEventListener("change", autocompleteBit);
      autoCb.addEventListener("change", autocompleteBit);

      const alerts = el("div");
      form.appendChild(alerts);

      const actions = el("div", { className: "form-actions" });
      actions.appendChild(el("button", { className: "btn btn-secondary", text: "İptal", attrs: { type: "button" }, on: { click: close } }));
      const submitBtn = el("button", { className: "btn btn-primary", text: isEdit ? "Kaydet" : "Oluştur", attrs: { type: "submit" } });
      actions.appendChild(submitBtn);
      form.appendChild(actions);

      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        submitBtn.disabled = true;
        clear(alerts);
        const payload = {
          teacherId: teacherSel.value,
          gun: Number(gunSel.value),
          bas: basInput.value,
          bit: bitInput.value,
          ad: adInput.value.trim(),
          lab: labSel.value,
          kademe: kademeSel.value,
        };
        try {
          let resp;
          if (isEdit) {
            resp = await api("PATCH", "/api/lessons/" + lesson.id, payload);
            const i = state.lessons.findIndex(x => x.id === lesson.id);
            if (i !== -1) state.lessons[i] = resp.lesson;
          } else {
            resp = await api("POST", "/api/lessons", payload);
            state.lessons.push(resp.lesson);
          }
          if (resp.conflicts && resp.conflicts.length) {
            const tById = Object.fromEntries(state.teachers.map(t => [t.id, t.name]));
            const txt = resp.conflicts
              .map(c => `${GUN_AD[c.gun]} ${c.bas}-${c.bit} ${c.ad} (${tById[c.teacherId] || "?"})`)
              .join(" · ");
            toast("Kaydedildi — çakışma: " + txt, "err");
          } else {
            toast("Kaydedildi", "ok");
          }
          updateCounts();
          renderLessons();
          close();
        } catch (err) {
          alerts.appendChild(el("div", { className: "alert alert-err", text: err.message || "Hata" }));
        } finally {
          submitBtn.disabled = false;
        }
      });
      modal.appendChild(form);
    });
  }

  async function deleteLesson(l) {
    if (!confirm(`${GUN_AD[l.gun]} ${l.bas} ${l.ad} dersi silinecek. Emin misin?`)) return;
    try {
      await api("DELETE", "/api/lessons/" + l.id);
      state.lessons = state.lessons.filter(x => x.id !== l.id);
      updateCounts();
      renderLessons();
      toast("Silindi", "ok");
    } catch (err) {
      toast(err.message || "Silinemedi", "err");
    }
  }

  // ========== ABSENCES (Phase 3) ==========
  function renderAbsences() {
    const area = document.getElementById("absences-area");
    clear(area);
    area.appendChild(el("div", { className: "alert alert-info", text: "Yoklama özelliği Phase 3'te aktifleşecek. Şimdilik sadece ders CRUD kullanılabilir." }));
  }

  // ========== ANALYTICS (Phase 3) ==========
  function renderAnalytics() {
    const area = document.getElementById("analytics-area");
    clear(area);
    area.appendChild(el("div", { className: "alert alert-info", text: "Analiz sekmesi Phase 3'te doldurulacak." }));
  }

  // ---------- Clock ----------
  function tickClock() {
    const d = new Date();
    const s = pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
    const el2 = document.getElementById("topbar-clock");
    if (el2) el2.textContent = s;
  }

  // ---------- Boot ----------
  (async function boot() {
    const ok = await checkAuth();
    if (!ok) return;
    document.getElementById("shell").style.display = "block";
    tickClock();
    setInterval(tickClock, 1000);
    // Hide add-lesson button until lessons tab active
    document.getElementById("btn-add-lesson").style.display = "none";
    try {
      await loadAll();
      document.getElementById("kvStatus").textContent = "bağlı · " + state.teachers.length + " öğretmen";
      updateCounts();
      renderTeachers();
    } catch (err) {
      document.getElementById("kvStatus").textContent = "KV hatası";
      const area = document.getElementById("teachers-area");
      clear(area);
      const alert = el("div", { className: "alert alert-err" });
      alert.appendChild(el("strong", { text: "Veri yüklenemedi. " }));
      alert.appendChild(document.createTextNode(err.message || "Vercel'de Redis ve env var'ları kontrol et."));
      area.appendChild(alert);
    }
  })();
})();
