// Admin panel — user-friendly version with:
//   · live stats header (teachers, lessons, absences, conflicts)
//   · search + day filter in lessons panel
//   · custom confirm() modal (no native dialogs)
//   · command palette (Ctrl/Cmd+K)
//   · illustrated empty states + clear CTAs
//   · keyboard shortcuts (/ to focus search, Esc to close)
// All rendered content uses textContent / DOM nodes — never innerHTML for dynamic data.

(function () {
  // ---------- Constants ----------
  const GUN_AD = ["Pazar","Pazartesi","Salı","Çarşamba","Perşembe","Cuma","Cumartesi"];
  const GUN_KISA = ["Paz","Pzt","Sal","Çar","Per","Cum","Cmt"];
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
    lessonFilter: { q: "", gun: "" },
  };

  const IS_MAC = /mac|iphone|ipad/i.test(navigator.userAgent);

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
  function todayGun() {
    const d = new Date();
    return (d.getDay() >= 1 && d.getDay() <= 5) ? d.getDay() : null;
  }
  function initials(name) {
    return (name || "?").split(/\s+/).map(p => p[0] || "").join("").slice(0, 2).toUpperCase();
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

  // Build an inline SVG element from raw markup (trusted, static).
  // This helper avoids innerHTML by parsing via a template — but the sources are constants.
  const ICONS = {
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
    trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    coffee: '<path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/>',
    chart: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    close: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
    alert: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
    search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    refresh: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  };
  function icon(name, size = 16) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("width", String(size));
    svg.setAttribute("height", String(size));
    // Parse raw path markup once via template element to avoid innerHTML on live nodes.
    const tpl = document.createElement("template");
    tpl.innerHTML = "<svg xmlns='" + ns + "'>" + ICONS[name] + "</svg>";
    const src = tpl.content.firstChild;
    if (src) {
      while (src.firstChild) svg.appendChild(src.firstChild);
    }
    return svg;
  }

  function toast(msg, kind = "ok", duration = 2800) {
    const host = document.getElementById("toast-host");
    const iconName = kind === "ok" ? "check" : (kind === "warn" ? "alert" : "alert");
    const t = el("div", { className: "toast " + kind });
    t.appendChild(icon(iconName, 16));
    t.appendChild(el("span", { text: msg }));
    host.appendChild(t);
    setTimeout(() => { t.style.opacity = "0"; t.style.transform = "translateX(10px)"; }, duration - 300);
    setTimeout(() => t.remove(), duration);
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
      const r = await api("GET", "/api/auth?action=me");
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
      const input = m.querySelector("input:not([type='checkbox']), select, textarea");
      if (input) input.focus();
    }, 60);
  }
  function closeModal() {
    document.getElementById("modal-backdrop").classList.remove("open");
  }
  document.getElementById("modal-backdrop").addEventListener("click", (e) => {
    if (e.target.id === "modal-backdrop") closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeModal();
      closeCmd();
    }
  });

  // Custom confirm dialog. Returns Promise<boolean>.
  function confirmDialog({ title, body, confirmText = "Evet", cancelText = "İptal", danger = false, list = null } = {}) {
    return new Promise((resolve) => {
      openModal((modal, close) => {
        const head = el("div", { className: "modal-head" });
        head.appendChild(el("h3", { className: "modal-title", text: title || "Emin misin?" }));
        const closeBtn = el("button", { className: "modal-close", attrs: { "aria-label": "Kapat" }, on: { click: () => { close(); resolve(false); } } });
        closeBtn.appendChild(icon("close", 14));
        head.appendChild(closeBtn);
        modal.appendChild(head);

        const b = el("div", { className: "confirm-body" });
        if (typeof body === "string") b.appendChild(document.createTextNode(body));
        else if (body) b.appendChild(body);
        if (list && list.length) {
          const lst = el("div", { className: "confirm-list" });
          for (const line of list) lst.appendChild(el("div", { text: "• " + line }));
          b.appendChild(lst);
        }
        modal.appendChild(b);

        const actions = el("div", { className: "form-actions" });
        actions.appendChild(el("button", { className: "btn btn-secondary", text: cancelText, attrs: { type: "button" }, on: { click: () => { close(); resolve(false); } } }));
        const okBtn = el("button", { className: "btn " + (danger ? "btn-danger" : "btn-primary"), text: confirmText, attrs: { type: "button" }, on: { click: () => { close(); resolve(true); } } });
        actions.appendChild(okBtn);
        modal.appendChild(actions);

        setTimeout(() => okBtn.focus(), 80);
      });
    });
  }

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
    const ok = await confirmDialog({
      title: "Çıkış yap",
      body: "Admin oturumunu kapatmak istiyor musun?",
      confirmText: "Çıkış yap",
      cancelText: "Vazgeç",
    });
    if (!ok) return;
    try { await api("POST", "/api/auth?action=logout"); } catch {}
    location.replace("admin-login.html");
  });

  // Stats strip + tab counts
  function updateStats() {
    document.getElementById("cnt-t").textContent = state.teachers.length;
    document.getElementById("cnt-l").textContent = state.lessons.length;
    document.getElementById("cnt-a").textContent = state.absences.length;

    document.getElementById("sv-t").textContent = state.teachers.length;
    document.getElementById("sv-l").textContent = state.lessons.length;
    document.getElementById("sv-a").textContent = state.absences.length;

    // Today's absences
    const todayAbs = state.absences.filter(a => a.date === todayISO()).length;
    const aSub = document.getElementById("sv-a-sub");
    aSub.textContent = todayAbs ? (todayAbs + " bugün") : "Bugün yok";

    const cList = findAllConflictsClient(state.lessons);
    const sv = document.getElementById("sv-c");
    sv.textContent = cList.length;
    sv.classList.remove("accent","warn","err");
    sv.classList.add(cList.length ? "err" : "accent");
    document.getElementById("sv-c-sub").textContent = cList.length ? "⚠ bakılmalı" : "✓ temiz";
  }

  // ========== TEACHERS ==========
  function renderTeachers() {
    const area = document.getElementById("teachers-area");
    clear(area);
    if (!state.teachers.length) {
      area.appendChild(buildEmptyState({
        iconName: "users",
        title: "Henüz öğretmen yok",
        sub: "İlk öğretmeni ekleyerek başla. Ekledikten sonra derslerini tanımlayabilirsin.",
        ctaText: "İlk öğretmeni ekle",
        onCta: () => openTeacherModal(),
      }));
      return;
    }
    const grid = el("div", { className: "teacher-grid" });
    for (const t of state.teachers) {
      const lessonCount = state.lessons.filter(l => l.teacherId === t.id).length;
      const totalMin = state.lessons
        .filter(l => l.teacherId === t.id)
        .reduce((s,l) => s + (parseHM(l.bit) - parseHM(l.bas)), 0);
      const card = el("div", { className: "teacher-card" });

      const head = el("div", { className: "teacher-card-head" });
      head.appendChild(el("div", { className: "teacher-avatar", text: initials(t.name) }));
      const nameBlock = el("div", { style: "min-width:0; flex:1;" });
      nameBlock.appendChild(el("div", { className: "teacher-card-name", text: t.name }));
      const slugLink = el("a", {
        attrs: { href: "/" + t.slug + ".html", target: "_blank", rel: "noopener" },
        text: "/" + t.slug + ".html",
      });
      const slugWrap = el("div", { className: "teacher-card-slug" });
      slugWrap.appendChild(slugLink);
      nameBlock.appendChild(slugWrap);
      head.appendChild(nameBlock);
      card.appendChild(head);

      if (t.meta) card.appendChild(el("div", { className: "teacher-card-meta", text: t.meta }));

      const stats = el("div", { className: "teacher-card-meta" });
      const k1 = el("span", { className: "k" });
      k1.appendChild(el("strong", { text: String(lessonCount) }));
      k1.appendChild(document.createTextNode(" ders"));
      stats.appendChild(k1);
      const k2 = el("span", { className: "k" });
      k2.appendChild(el("strong", { text: (Math.round(totalMin/60*10)/10) + "" }));
      k2.appendChild(document.createTextNode(" sa/hafta"));
      stats.appendChild(k2);
      card.appendChild(stats);

      const actions = el("div", { className: "teacher-card-actions" });
      const editBtn = el("button", { className: "btn btn-secondary btn-sm", on: { click: () => openTeacherModal(t) } });
      editBtn.appendChild(icon("edit", 12));
      editBtn.appendChild(el("span", { text: "Düzenle" }));
      actions.appendChild(editBtn);
      const delBtn = el("button", { className: "btn btn-danger btn-sm", on: { click: () => deleteTeacher(t) } });
      delBtn.appendChild(icon("trash", 12));
      delBtn.appendChild(el("span", { text: "Sil" }));
      actions.appendChild(delBtn);
      card.appendChild(actions);

      grid.appendChild(card);
    }
    area.appendChild(grid);
  }

  function openTeacherModal(teacher = null) {
    openModal((modal, close) => {
      const isEdit = !!teacher;
      const head = el("div", { className: "modal-head" });
      const titleBlock = el("div");
      titleBlock.appendChild(el("h3", { className: "modal-title", text: isEdit ? "Öğretmen düzenle" : "Yeni öğretmen" }));
      titleBlock.appendChild(el("small", { text: isEdit ? "Bilgileri güncelle" : "Yeni bir öğretmen ekle" }));
      // re-arrange: we placed small inside title already via CSS
      head.appendChild(titleBlock);
      const closeBtn = el("button", { className: "modal-close", attrs: { "aria-label": "Kapat" }, on: { click: close } });
      closeBtn.appendChild(icon("close", 14));
      head.appendChild(closeBtn);
      modal.appendChild(head);

      const form = el("form");

      const nameField = el("div", { className: "field" });
      nameField.appendChild(el("label", { text: "Ad Soyad", attrs: { for: "f-name" } }));
      const nameInput = el("input", { attrs: { id: "f-name", type: "text", required: "required", placeholder: "Emre Günay" } });
      if (teacher) nameInput.value = teacher.name;
      nameField.appendChild(nameInput);
      form.appendChild(nameField);

      const slugField = el("div", { className: "field" });
      slugField.appendChild(el("label", { text: "Sayfa adresi (slug)", attrs: { for: "f-slug" } }));
      const slugInput = el("input", { attrs: { id: "f-slug", type: "text", pattern: "[a-z0-9-]+", required: "required", placeholder: "emre" } });
      if (teacher) slugInput.value = teacher.slug;
      slugField.appendChild(slugInput);
      slugField.appendChild(el("div", { className: "field-hint", text: "Örn: emre → /emre.html" }));
      form.appendChild(slugField);

      const metaField = el("div", { className: "field" });
      metaField.appendChild(el("label", { text: "Açıklama (opsiyonel)", attrs: { for: "f-meta" } }));
      const metaInput = el("input", { attrs: { id: "f-meta", type: "text", placeholder: "İlkokul · Ortaokul" } });
      if (teacher && teacher.meta) metaInput.value = teacher.meta;
      metaField.appendChild(metaInput);
      form.appendChild(metaField);

      const emailField = el("div", { className: "field" });
      emailField.appendChild(el("label", { text: "E-posta (bildirim için)", attrs: { for: "f-email" } }));
      const emailInput = el("input", { attrs: { id: "f-email", type: "email", placeholder: "ornek@balikesir.bilnet.k12.tr", autocomplete: "off" } });
      if (teacher && teacher.email) emailInput.value = teacher.email;
      emailField.appendChild(emailInput);
      emailField.appendChild(el("div", { className: "field-hint", text: "Ders devri bildirimleri bu adrese gider" }));
      form.appendChild(emailField);

      if (isEdit) {
        const subCount = (teacher.pushSubscriptions || []).length;
        const infoField = el("div", { className: "field-hint", style: "margin-top:-8px; margin-bottom:14px;" });
        infoField.textContent = "📱 Bildirim cihazı: " + subCount + " adet (telefondan sayfasına girip bildirim aç)";
        form.appendChild(infoField);
      }

      const errAlert = el("div", { className: "alert alert-err", style: "display:none" });
      errAlert.appendChild(icon("alert", 16));
      const errText = el("span");
      errAlert.appendChild(errText);
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
          email: emailInput.value.trim(),
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
          updateStats();
          renderTeachers();
          close();
        } catch (err) {
          errText.textContent = err.message || "Hata";
          errAlert.style.display = "flex";
        } finally {
          submitBtn.disabled = false;
        }
      });
      modal.appendChild(form);
    });
  }

  async function deleteTeacher(t) {
    const lessonCount = state.lessons.filter(l => l.teacherId === t.id).length;
    const body = el("div");
    body.appendChild(document.createTextNode(t.name + " silinecek."));
    if (lessonCount) {
      body.appendChild(el("br"));
      body.appendChild(el("br"));
      const b = el("strong");
      b.appendChild(document.createTextNode("Bu öğretmene ait " + lessonCount + " ders de silinecek."));
      body.appendChild(b);
      body.appendChild(document.createTextNode(" Bu işlem geri alınamaz."));
    }
    const ok = await confirmDialog({
      title: "Öğretmeni sil",
      body,
      confirmText: "Evet, sil",
      danger: true,
    });
    if (!ok) return;
    try {
      await api("DELETE", "/api/teachers/" + t.id);
      state.teachers = state.teachers.filter(x => x.id !== t.id);
      state.lessons = state.lessons.filter(l => l.teacherId !== t.id);
      if (state.selectedTeacherId === t.id) state.selectedTeacherId = state.teachers[0]?.id || null;
      updateStats();
      renderTeachers();
      toast(t.name + " silindi", "ok");
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
    const toolbar = document.getElementById("lessons-toolbar");
    clear(area);

    if (!state.teachers.length) {
      toolbar.style.display = "none";
      area.appendChild(buildEmptyState({
        iconName: "users",
        title: "Önce bir öğretmen ekle",
        sub: "Ders ekleyebilmek için en az bir öğretmen gerekli. Öğretmenler sekmesine geç.",
        ctaText: "Öğretmenler sekmesi",
        onCta: () => switchTab("teachers"),
      }));
      return;
    }

    toolbar.style.display = "";
    const wrap = el("div", { className: "lessons-wrap" });

    // Picker
    const picker = el("div", { className: "teacher-picker" });
    for (const t of state.teachers) {
      const count = state.lessons.filter(l => l.teacherId === t.id).length;
      const btn = el("button", {
        className: "teacher-pick" + (t.id === state.selectedTeacherId ? " active" : ""),
        on: { click: () => { state.selectedTeacherId = t.id; renderLessons(); } },
      });
      btn.appendChild(el("span", { className: "teacher-pick-name", text: t.name }));
      btn.appendChild(el("span", { className: "teacher-pick-count", text: String(count) }));
      picker.appendChild(btn);
    }
    wrap.appendChild(picker);

    // Days
    const days = el("div", { className: "lessons-days" });
    const selectedId = state.selectedTeacherId;
    const tGun = todayGun();
    const filter = state.lessonFilter;
    const q = filter.q.trim().toLocaleLowerCase("tr-TR");

    const allTeacherLessons = state.lessons.filter(l => l.teacherId === selectedId);
    const filteredTotal = allTeacherLessons.filter(l =>
      (!filter.gun || String(l.gun) === filter.gun) &&
      (!q || l.ad.toLocaleLowerCase("tr-TR").includes(q) || (l.kademe || "").includes(q))
    ).length;

    if (!allTeacherLessons.length) {
      days.appendChild(buildEmptyState({
        iconName: "calendar",
        title: "Bu öğretmenin dersi yok",
        sub: "Sağ üstten 'Yeni ders' butonu ile ilk dersi ekle.",
        ctaText: "Yeni ders ekle",
        onCta: () => openLessonModal(),
      }));
    } else if (!filteredTotal) {
      days.appendChild(el("div", { className: "empty-state" }, (() => {
        const wrap2 = el("div");
        const illu = el("div", { className: "empty-illu" });
        illu.appendChild(icon("search", 24));
        wrap2.appendChild(illu);
        wrap2.appendChild(el("div", { className: "empty-title", text: "Eşleşen ders yok" }));
        wrap2.appendChild(el("div", { className: "empty-sub", text: "Arama veya filtreyi değiştir." }));
        return wrap2;
      })()));
    } else {
      for (let g = 1; g <= 5; g++) {
        if (filter.gun && String(g) !== filter.gun) continue;
        const daySection = el("div", { className: "lessons-day" });
        const head = el("div", { className: "lessons-day-head" });
        const dayName = el("div", { className: "lessons-day-name" + (g === tGun ? " today" : ""), text: GUN_AD[g] });
        head.appendChild(dayName);

        const dayLessons = allTeacherLessons
          .filter(l => l.gun === g)
          .filter(l => !q || l.ad.toLocaleLowerCase("tr-TR").includes(q) || (l.kademe || "").includes(q))
          .sort((a, b) => parseHM(a.bas) - parseHM(b.bas));

        head.appendChild(el("div", { className: "lessons-day-meta", text: dayLessons.length + " ders" }));
        daySection.appendChild(head);

        if (!dayLessons.length) {
          daySection.appendChild(el("div", { className: "day-empty-admin", text: q || filter.gun ? "Filtre ile eşleşme yok" : "Ders yok" }));
        } else {
          for (const l of dayLessons) daySection.appendChild(buildLessonRow(l));
        }
        days.appendChild(daySection);
      }
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
    const edit = el("button", {
      className: "btn btn-secondary btn-icon btn-sm",
      attrs: { title: "Düzenle", "aria-label": "Düzenle" },
      on: { click: () => openLessonModal(l) },
    });
    edit.appendChild(icon("edit", 13));
    actions.appendChild(edit);
    const del = el("button", {
      className: "btn btn-danger btn-icon btn-sm",
      attrs: { title: "Sil", "aria-label": "Sil" },
      on: { click: () => deleteLesson(l) },
    });
    del.appendChild(icon("trash", 13));
    actions.appendChild(del);
    row.appendChild(actions);
    return row;
  }

  function openLessonModal(lesson = null) {
    if (!state.teachers.length) { toast("Önce öğretmen ekle", "warn"); return; }
    openModal((modal, close) => {
      const isEdit = !!lesson;
      const head = el("div", { className: "modal-head" });
      const titleBlock = el("div");
      titleBlock.appendChild(el("h3", { className: "modal-title", text: isEdit ? "Dersi düzenle" : "Yeni ders" }));
      head.appendChild(titleBlock);
      const closeBtn = el("button", { className: "modal-close", attrs: { "aria-label": "Kapat" }, on: { click: close } });
      closeBtn.appendChild(icon("close", 14));
      head.appendChild(closeBtn);
      modal.appendChild(head);

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

      const row0 = el("div", { className: "field-row" });
      const gunField = el("div", { className: "field" });
      gunField.appendChild(el("label", { text: "Gün", attrs: { for: "f-gun" } }));
      const gunSel = el("select", { attrs: { id: "f-gun", required: "required" } });
      for (let g = 1; g <= 5; g++) {
        const opt = el("option", { attrs: { value: String(g) }, text: GUN_AD[g] });
        if (lesson && lesson.gun === g) opt.selected = true;
        gunSel.appendChild(opt);
      }
      gunField.appendChild(gunSel);
      row0.appendChild(gunField);

      const kademeField = el("div", { className: "field" });
      kademeField.appendChild(el("label", { text: "Kademe", attrs: { for: "f-kademe" } }));
      const kademeSel = el("select", { attrs: { id: "f-kademe", required: "required" } });
      for (const [k, label] of KADEME) {
        const opt = el("option", { attrs: { value: k }, text: label });
        if (lesson && lesson.kademe === k) opt.selected = true;
        kademeSel.appendChild(opt);
      }
      kademeField.appendChild(kademeSel);
      row0.appendChild(kademeField);
      form.appendChild(row0);

      const labField = el("div", { className: "field" });
      labField.appendChild(el("label", { text: "Laboratuvar", attrs: { for: "f-lab" } }));
      const labSel = el("select", { attrs: { id: "f-lab" } });
      for (const [v, label] of LABS) {
        const opt = el("option", { attrs: { value: v }, text: label });
        if (lesson && (lesson.lab || "") === v) opt.selected = true;
        labSel.appendChild(opt);
      }
      labField.appendChild(labSel);
      form.appendChild(labField);

      const adField = el("div", { className: "field" });
      adField.appendChild(el("label", { text: "Sınıf / Ders adı", attrs: { for: "f-ad" } }));
      const adInput = el("input", { attrs: { id: "f-ad", type: "text", required: "required", placeholder: "4/A, KAPLAN, Toplantı…" } });
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

      const autoRow = el("label", { className: "checkbox-row" });
      const autoCb = el("input", { attrs: { type: "checkbox", id: "f-auto" } });
      if (!isEdit) autoCb.checked = true;
      autoRow.appendChild(autoCb);
      autoRow.appendChild(el("span", { text: "Başlangıç saatinden kademe süresine göre bitişi otomatik hesapla" }));
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
              .map(c => `${GUN_KISA[c.gun]} ${c.bas}-${c.bit} ${c.ad} (${tById[c.teacherId] || "?"})`)
              .join(" · ");
            toast("Kaydedildi — çakışma: " + txt, "warn", 4500);
          } else {
            toast("Kaydedildi", "ok");
          }
          updateStats();
          renderLessons();
          close();
        } catch (err) {
          const a = el("div", { className: "alert alert-err" });
          a.appendChild(icon("alert", 16));
          a.appendChild(el("span", { text: err.message || "Hata" }));
          alerts.appendChild(a);
        } finally {
          submitBtn.disabled = false;
        }
      });
      modal.appendChild(form);
    });
  }

  async function deleteLesson(l) {
    const body = el("div");
    const teacher = state.teachers.find(t => t.id === l.teacherId);
    body.appendChild(el("strong", { text: (teacher ? teacher.name + ": " : "") + GUN_AD[l.gun] + " " + l.bas + " – " + l.ad }));
    body.appendChild(el("br"));
    body.appendChild(document.createTextNode("Bu ders silinecek. İşlem geri alınamaz."));
    const ok = await confirmDialog({
      title: "Dersi sil",
      body,
      confirmText: "Evet, sil",
      danger: true,
    });
    if (!ok) return;
    try {
      await api("DELETE", "/api/lessons/" + l.id);
      state.lessons = state.lessons.filter(x => x.id !== l.id);
      updateStats();
      renderLessons();
      toast("Silindi", "ok");
    } catch (err) {
      toast(err.message || "Silinemedi", "err");
    }
  }

  // Lesson filter wiring
  const searchInput = document.getElementById("lesson-search");
  const searchBox = document.getElementById("lessons-search-box");
  const searchClear = document.getElementById("lesson-search-clear");
  searchInput.addEventListener("input", () => {
    state.lessonFilter.q = searchInput.value;
    searchBox.classList.toggle("has-value", !!searchInput.value);
    if (state.activeTab === "lessons") renderLessons();
  });
  searchClear.addEventListener("click", () => {
    searchInput.value = "";
    state.lessonFilter.q = "";
    searchBox.classList.remove("has-value");
    searchInput.focus();
    if (state.activeTab === "lessons") renderLessons();
  });
  document.querySelectorAll("#day-pills .pill").forEach(p => {
    p.addEventListener("click", () => {
      document.querySelectorAll("#day-pills .pill").forEach(x => x.classList.toggle("active", x === p));
      state.lessonFilter.gun = p.dataset.gun;
      if (state.activeTab === "lessons") renderLessons();
    });
  });
  // "/" shortcut focuses search when in lessons tab
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && state.activeTab === "lessons" && document.activeElement !== searchInput) {
      const isInput = document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
      if (!isInput) {
        e.preventDefault();
        searchInput.focus();
        searchInput.select();
      }
    }
  });

  // ========== ABSENCES ==========
  function buildStatusBadge(ov) {
    if (!ov || ov.action !== "transfer") return null;
    const status = ov.status || "pending";
    const STATUSES = {
      pending:  { label: "BEKLİYOR",  cls: "pending" },
      approved: { label: "ONAYLANDI", cls: "approved" },
      rejected: { label: "REDDEDİLDİ", cls: "rejected" },
      auto:     { label: "—",          cls: "auto" },
    };
    const s = STATUSES[status] || STATUSES.pending;
    const b = el("span", { className: "status-badge s-" + s.cls, text: s.label });
    return b;
  }

  const pendingAbsences = new Map();

  function isoWeekdayProgGun(isoDate) {
    const dow = new Date(isoDate + "T00:00:00").getDay();
    return (dow >= 1 && dow <= 5) ? dow : null;
  }
  function availableSubstitutes(targetLesson, teacherId, lessons, absences, date) {
    const gun = targetLesson.gun;
    const basA = parseHM(targetLesson.bas), bitA = parseHM(targetLesson.bit);
    const absentThatDay = new Set((absences || []).filter(a => a.date === date).map(a => a.teacherId));
    return state.teachers.filter(t => {
      if (t.id === teacherId) return false;
      if (absentThatDay.has(t.id)) return false;
      const busy = lessons.some(l =>
        l.teacherId === t.id && l.gun === gun
        && parseHM(l.bas) < bitA && basA < parseHM(l.bit)
      );
      return !busy;
    });
  }

  function renderAbsences() {
    const area = document.getElementById("absences-area");
    clear(area);

    // Controls
    const controls = el("div", { className: "absence-controls" });
    const dateField = el("div", { className: "field" });
    dateField.appendChild(el("label", { text: "Tarih", attrs: { for: "abs-date" } }));
    const dateInput = el("input", { attrs: { id: "abs-date", type: "date" } });
    dateInput.value = state.absenceDate;
    dateInput.addEventListener("change", () => {
      state.absenceDate = dateInput.value || todayISO();
      pendingAbsences.clear();
      renderAbsences();
    });
    dateField.appendChild(dateInput);
    controls.appendChild(dateField);

    const dowInfo = el("div", { style: "font-family: var(--font-mono); font-size:11px; color: var(--muted); letter-spacing:0.14em; text-transform:uppercase;" });
    const gun = isoWeekdayProgGun(state.absenceDate);
    dowInfo.textContent = gun ? GUN_AD[gun] : "Hafta sonu";
    controls.appendChild(dowInfo);

    const todayBtn = el("button", { className: "btn btn-secondary btn-sm", text: "Bugün" });
    todayBtn.addEventListener("click", () => {
      state.absenceDate = todayISO();
      pendingAbsences.clear();
      renderAbsences();
    });
    controls.appendChild(todayBtn);
    area.appendChild(controls);

    if (!gun) {
      area.appendChild(el("div", { className: "alert alert-info" }, (() => {
        const w = el("span");
        w.appendChild(icon("info", 16));
        return w;
      })(), el("span", { text: "Seçilen tarih hafta sonu. Yoklama gerekmiyor." })));
    } else if (!state.teachers.length) {
      area.appendChild(buildEmptyState({
        iconName: "users",
        title: "Önce öğretmen ekle",
        sub: "Yoklama almadan önce öğretmen ve ders verisi olmalı.",
      }));
    } else {
      for (const t of state.teachers) {
        area.appendChild(buildAbsenceTeacherRow(t, gun));
      }
    }

    // Active absences
    area.appendChild(el("h3", { className: "panel-title", style: "margin-top: 28px; font-size: 16px;", text: "Kayıtlı Yoklamalar" }));
    if (!state.absences.length) {
      area.appendChild(el("div", { className: "day-empty-admin", text: "Kayıtlı yoklama yok" }));
    } else {
      const tById = Object.fromEntries(state.teachers.map(t => [t.id, t.name]));
      const lById = Object.fromEntries(state.lessons.map(l => [l.id, l]));
      const sorted = [...state.absences].sort((a, b) => (b.date > a.date ? 1 : -1));
      for (const ab of sorted) {
        const card = el("div", { className: "active-absence-card" });
        const head = el("div", { className: "active-absence-head" });
        head.appendChild(el("div", { className: "active-absence-name", text: tById[ab.teacherId] || "?" }));
        head.appendChild(el("div", { className: "active-absence-date", text: ab.date }));
        card.appendChild(head);

        const list = el("div", { className: "active-absence-list" });
        let pendingOverdue = 0;
        for (const ov of (ab.lessonOverrides || [])) {
          const l = lById[ov.lessonId];
          const prefix = l ? `${l.bas}–${l.bit} ${l.ad}` : ov.lessonId;
          const line = el("div", { className: "line " + (ov.action === "cancel" ? "cancel" : (ov.status || "pending")) });
          if (ov.action === "cancel") {
            line.textContent = "• " + prefix + " → İPTAL";
            list.appendChild(line);
          } else {
            line.appendChild(document.createTextNode("• " + prefix + " → " + (tById[ov.substituteTeacherId] || "?") + " "));
            const badge = buildStatusBadge(ov);
            if (badge) line.appendChild(badge);
            list.appendChild(line);
            if (ov.status === "pending" && ov.notifiedAt) {
              const elapsed = Date.now() - new Date(ov.notifiedAt).getTime();
              if (elapsed > 30 * 60 * 1000) pendingOverdue++;
            }
          }
        }
        if (pendingOverdue > 0) {
          const warn = el("div", { style: "margin-top:8px; padding:6px 10px; background: rgba(251,146,60,0.12); border: 1px solid rgba(251,146,60,0.35); border-radius:6px; color:#fed7aa; font-family: var(--font-mono); font-size:11px; letter-spacing: 0.06em;", text: "⚠ " + pendingOverdue + " onay 30 dk'yı geçti — admin'e bildirim gitti" });
          list.appendChild(warn);
        }
        if (ab.note) list.appendChild(el("div", { style: "margin-top:6px; font-style:italic;", text: "Not: " + ab.note }));
        card.appendChild(list);

        const actions = el("div", { className: "active-absence-actions" });
        actions.appendChild(el("button", {
          className: "btn btn-danger btn-sm",
          text: "Yoklamayı iptal et",
          on: { click: () => deleteAbsence(ab) },
        }));
        card.appendChild(actions);
        area.appendChild(card);
      }
    }
  }

  function buildAbsenceTeacherRow(t, gun) {
    const pending = pendingAbsences.get(t.id) || { active: false, overrides: new Map() };
    const container = el("div");

    const row = el("div", { className: "absence-teacher-row" + (pending.active ? " absent" : "") });
    const left = el("div", { className: "left" });
    left.appendChild(el("div", { className: "t-avatar", text: initials(t.name) }));
    const names = el("div");
    names.appendChild(el("div", { style: "font-weight:700; font-size:14px;", text: t.name }));
    const dayLessons = state.lessons.filter(l => l.teacherId === t.id && l.gun === gun).sort((a,b) => parseHM(a.bas) - parseHM(b.bas));
    names.appendChild(el("div", { style: "font-family: var(--font-mono); font-size:11px; color: var(--muted); margin-top:3px; letter-spacing:0.04em;", text: dayLessons.length + " ders" }));
    left.appendChild(names);
    row.appendChild(left);

    const right = el("div", { style: "display:flex; align-items:center; gap:12px;" });
    right.appendChild(el("span", {
      style: "font-family: var(--font-mono); font-size:11px; letter-spacing: 0.12em; text-transform: uppercase; color: " + (pending.active ? "var(--err)" : "var(--muted)"),
      text: pending.active ? "YOK" : "Var",
    }));
    const sw = el("div", { className: "switch" + (pending.active ? " on" : ""), attrs: { role: "switch", "aria-checked": pending.active ? "true" : "false" } });
    sw.addEventListener("click", () => {
      if (!pending.active) {
        pendingAbsences.set(t.id, { active: true, overrides: new Map() });
      } else {
        pendingAbsences.delete(t.id);
      }
      renderAbsences();
    });
    right.appendChild(sw);
    row.appendChild(right);
    container.appendChild(row);

    if (pending.active) {
      if (!dayLessons.length) {
        container.appendChild(el("div", { className: "day-empty-admin", text: "Bu gün hiç dersi yok — yoklama kaydı gerekmez" }));
      } else {
        for (const lesson of dayLessons) {
          container.appendChild(buildAbsenceLessonRow(t, lesson, pending));
        }
        const actions = el("div", { className: "absence-pending-actions" });
        actions.appendChild(el("button", {
          className: "btn btn-secondary btn-sm",
          text: "Vazgeç",
          on: { click: () => { pendingAbsences.delete(t.id); renderAbsences(); } },
        }));
        actions.appendChild(el("button", {
          className: "btn btn-primary btn-sm",
          text: "Kaydet",
          on: { click: () => submitAbsence(t, dayLessons) },
        }));
        container.appendChild(actions);
      }
    }
    return container;
  }

  function buildAbsenceLessonRow(teacher, lesson, pending) {
    const row = el("div", { className: "absence-lesson" });

    const info = el("div", { className: "lesson-info" });
    info.appendChild(el("div", { className: "lesson-title", text: lesson.ad }));
    const meta = el("div", { className: "lesson-meta" });
    meta.appendChild(el("span", { text: lesson.bas + "–" + lesson.bit }));
    if (lesson.lab) meta.appendChild(el("span", { text: lesson.lab + "-Lab" }));
    meta.appendChild(el("span", { text: lesson.kademe }));
    info.appendChild(meta);
    row.appendChild(info);

    const subs = availableSubstitutes(lesson, teacher.id, state.lessons, state.absences, state.absenceDate);
    const sel = el("select");
    sel.appendChild(el("option", { attrs: { value: "cancel" }, text: "İptal (ders yok)" }));
    for (const t of subs) {
      sel.appendChild(el("option", { attrs: { value: "transfer:" + t.id }, text: "→ " + t.name }));
    }
    const current = pending.overrides.get(lesson.id);
    function applyMode() {
      const v = sel.value;
      if (v === "cancel") row.dataset.mode = "cancel";
      else row.dataset.mode = "transfer";
    }
    if (current) {
      sel.value = current.action === "transfer" ? "transfer:" + current.substituteTeacherId : "cancel";
    } else if (subs.length) {
      sel.value = "transfer:" + subs[0].id;
      pending.overrides.set(lesson.id, { action: "transfer", substituteTeacherId: subs[0].id });
    } else {
      sel.value = "cancel";
      pending.overrides.set(lesson.id, { action: "cancel" });
    }
    applyMode();
    sel.addEventListener("change", () => {
      const v = sel.value;
      if (v === "cancel") pending.overrides.set(lesson.id, { action: "cancel" });
      else pending.overrides.set(lesson.id, { action: "transfer", substituteTeacherId: v.slice("transfer:".length) });
      applyMode();
    });
    row.appendChild(sel);
    return row;
  }

  async function submitAbsence(teacher, dayLessons) {
    const pending = pendingAbsences.get(teacher.id);
    if (!pending) return;
    const overrides = dayLessons.map(l => {
      const ov = pending.overrides.get(l.id);
      return ov ? { lessonId: l.id, ...ov } : { lessonId: l.id, action: "cancel" };
    });
    try {
      const r = await api("POST", "/api/absences", {
        date: state.absenceDate,
        teacherId: teacher.id,
        lessonOverrides: overrides,
        note: "",
      });
      state.absences.push(r.absence);
      pendingAbsences.delete(teacher.id);
      updateStats();
      renderAbsences();
      // Bust the public page cache so substitute teachers see the update instantly
      try { localStorage.removeItem("bt.schedules.cache.v2"); } catch {}
      toast("Yoklama kaydedildi", "ok");
    } catch (err) {
      toast(err.message || "Kaydedilemedi", "err");
    }
  }

  async function deleteAbsence(ab) {
    const ok = await confirmDialog({
      title: "Yoklamayı sil",
      body: "Bu yoklama kaydı silinsin mi? Devredilen dersler de geri alınacak.",
      confirmText: "Evet, sil",
      danger: true,
    });
    if (!ok) return;
    try {
      await api("DELETE", "/api/absences/" + ab.id);
      state.absences = state.absences.filter(x => x.id !== ab.id);
      updateStats();
      renderAbsences();
      try { localStorage.removeItem("bt.schedules.cache.v2"); } catch {}
      toast("Silindi", "ok");
    } catch (err) {
      toast(err.message || "Silinemedi", "err");
    }
  }

  // ========== ANALYTICS ==========
  function renderAnalytics() {
    const area = document.getElementById("analytics-area");
    clear(area);

    const stats = el("div", { className: "stats-grid" });
    stats.appendChild(buildStat("Toplam ders", String(state.lessons.length), "haftalık"));
    stats.appendChild(buildStat("Öğretmen", String(state.teachers.length), ""));
    const totalMin = state.lessons.reduce((s, l) => s + (parseHM(l.bit) - parseHM(l.bas)), 0);
    stats.appendChild(buildStat("Toplam süre", Math.round(totalMin / 60) + " saat", Math.round(totalMin) + " dk"));
    const conflicts = findAllConflictsClient(state.lessons);
    stats.appendChild(buildStat("Çakışma", String(conflicts.length), conflicts.length ? "⚠ inceleyin" : "✓ temiz", conflicts.length ? "err" : "ok"));
    area.appendChild(stats);

    // Lab utilization
    const labCard = el("div", { className: "stat-card" });
    labCard.appendChild(el("div", { className: "stat-label", text: "Lab doluluğu (haftalık)" }));
    const util = el("div", { className: "lab-util" });
    const LABS2 = [["i","İlkokul Lab"],["O","Ortaokul Lab"],["L","Lise Lab"]];
    const WEEK_MIN = 5 * 8 * 60;
    for (const [k, name] of LABS2) {
      const mins = state.lessons.filter(l => l.lab === k).reduce((s, l) => s + (parseHM(l.bit) - parseHM(l.bas)), 0);
      const pct = Math.min(100, Math.round((mins / WEEK_MIN) * 100));
      const row = el("div", { className: "lab-util-row" });
      row.appendChild(el("span", { text: name }));
      const bar = el("div", { className: "lab-util-bar" });
      bar.appendChild(el("span", { className: "pct-" + k, style: "width:" + pct + "%;" }));
      row.appendChild(bar);
      row.appendChild(el("span", { text: pct + "% · " + Math.round(mins/60) + "sa" }));
      util.appendChild(row);
    }
    labCard.appendChild(util);
    area.appendChild(labCard);

    // Teachers table
    const teacherCard = el("div", { className: "stat-card", style: "margin-top:12px;" });
    teacherCard.appendChild(el("div", { className: "stat-label", text: "Öğretmen başına yük" }));
    const tlist = el("div", { className: "lab-util" });
    const sorted = [...state.teachers].sort((a,b) => {
      const am = state.lessons.filter(l => l.teacherId === a.id).reduce((s,l) => s + (parseHM(l.bit) - parseHM(l.bas)), 0);
      const bm = state.lessons.filter(l => l.teacherId === b.id).reduce((s,l) => s + (parseHM(l.bit) - parseHM(l.bas)), 0);
      return bm - am;
    });
    for (const t of sorted) {
      const ls = state.lessons.filter(l => l.teacherId === t.id);
      const m = ls.reduce((s, l) => s + (parseHM(l.bit) - parseHM(l.bas)), 0);
      const r = el("div", { className: "lab-util-row" });
      r.appendChild(el("span", { text: t.name }));
      r.appendChild(el("span", { text: ls.length + " ders" }));
      r.appendChild(el("span", { text: Math.round(m / 60 * 10) / 10 + " sa" }));
      tlist.appendChild(r);
    }
    teacherCard.appendChild(tlist);
    area.appendChild(teacherCard);

    if (conflicts.length) {
      const cCard = el("div", { className: "stat-card", style: "margin-top:12px; border-color: var(--err);" });
      cCard.appendChild(el("div", { className: "stat-label", style: "color: var(--err)", text: "Çakışmalar" }));
      const tById = Object.fromEntries(state.teachers.map(t => [t.id, t.name]));
      for (const { a, b } of conflicts) {
        const row = el("div", { style: "padding:8px 0; border-top: 1px solid var(--line-soft); font-size:12px;" });
        row.appendChild(el("div", { style: "font-weight: 600;", text: GUN_AD[a.gun] + " " + a.bas + "-" + a.bit + " · " + a.lab + "-Lab" }));
        row.appendChild(el("div", { style: "color: var(--muted); font-family: var(--font-mono); font-size: 11px; margin-top:3px;", text: `${a.ad} (${tById[a.teacherId]}) ↔ ${b.ad} (${tById[b.teacherId]})` }));
        cCard.appendChild(row);
      }
      area.appendChild(cCard);
    }
  }

  function buildStat(label, value, sub, subClass) {
    const c = el("div", { className: "stat-card" });
    c.appendChild(el("div", { className: "stat-label", text: label }));
    c.appendChild(el("div", { className: "stat-value", text: value }));
    if (sub) c.appendChild(el("div", { className: "stat-sub" + (subClass ? " " + subClass : ""), text: sub }));
    return c;
  }

  function findAllConflictsClient(lessons) {
    const out = [];
    const seen = new Set();
    for (let i = 0; i < lessons.length; i++) {
      for (let j = i + 1; j < lessons.length; j++) {
        const a = lessons[i], b = lessons[j];
        if (!a.lab || !b.lab) continue;
        if (a.lab !== b.lab) continue;
        if (a.teacherId === b.teacherId) continue;
        if (a.gun !== b.gun) continue;
        if (parseHM(a.bas) < parseHM(b.bit) && parseHM(b.bas) < parseHM(a.bit)) {
          const key = [a.id, b.id].sort().join("|");
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({ a, b });
        }
      }
    }
    return out;
  }

  // ---------- Empty state ----------
  function buildEmptyState({ iconName, title, sub, ctaText, onCta }) {
    const wrap = el("div", { className: "empty-state" });
    const illu = el("div", { className: "empty-illu" });
    illu.appendChild(icon(iconName || "info", 24));
    wrap.appendChild(illu);
    wrap.appendChild(el("div", { className: "empty-title", text: title }));
    if (sub) wrap.appendChild(el("div", { className: "empty-sub", text: sub }));
    if (ctaText && onCta) {
      const btn = el("button", { className: "btn btn-primary", on: { click: onCta } });
      btn.appendChild(icon("plus", 14));
      btn.appendChild(el("span", { text: ctaText }));
      wrap.appendChild(btn);
    }
    return wrap;
  }

  // ---------- Command Palette ----------
  const cmdPalette = document.getElementById("cmd-palette");
  const cmdInput = document.getElementById("cmd-input");
  const cmdList = document.getElementById("cmd-list");
  let cmdHl = 0;

  const commands = [
    { id: "tab-teachers",  name: "Öğretmenler sekmesine git", sub: "Tab", iconName: "users",    act: () => switchTab("teachers") },
    { id: "tab-lessons",   name: "Dersler sekmesine git",     sub: "Tab", iconName: "calendar", act: () => switchTab("lessons") },
    { id: "tab-absences",  name: "Yoklama sekmesine git",     sub: "Tab", iconName: "coffee",   act: () => switchTab("absences") },
    { id: "tab-analytics", name: "Analiz sekmesine git",      sub: "Tab", iconName: "chart",    act: () => switchTab("analytics") },
    { id: "new-teacher",   name: "Yeni öğretmen ekle",        sub: "Aksiyon", iconName: "plus", act: () => { switchTab("teachers"); openTeacherModal(); } },
    { id: "new-lesson",    name: "Yeni ders ekle",            sub: "Aksiyon", iconName: "plus", act: () => { switchTab("lessons"); openLessonModal(); } },
    { id: "refresh",       name: "Verileri yenile",           sub: "Aksiyon", iconName: "refresh", act: () => refreshAll() },
    { id: "visit-site",    name: "Ana siteye git",            sub: "Bağlantı", iconName: "info", act: () => location.href = "index.html" },
  ];

  function openCmd() {
    cmdPalette.classList.add("open");
    cmdInput.value = "";
    cmdHl = 0;
    renderCmdList("");
    setTimeout(() => cmdInput.focus(), 50);
  }
  function closeCmd() { cmdPalette.classList.remove("open"); }
  function renderCmdList(q) {
    clear(cmdList);
    const qq = q.trim().toLocaleLowerCase("tr-TR");
    const filtered = commands.filter(c => !qq || c.name.toLocaleLowerCase("tr-TR").includes(qq));
    if (!filtered.length) {
      cmdList.appendChild(el("div", { className: "cmd-empty", text: "Eşleşen komut yok" }));
      return;
    }
    filtered.forEach((cmd, idx) => {
      const btn = el("button", {
        className: "cmd-item" + (idx === cmdHl ? " hl" : ""),
        on: { click: () => { closeCmd(); cmd.act(); } },
      });
      const ic = el("span", { className: "cmd-icon" });
      ic.appendChild(icon(cmd.iconName, 14));
      btn.appendChild(ic);
      btn.appendChild(el("span", { className: "cmd-name", text: cmd.name }));
      btn.appendChild(el("span", { className: "cmd-sub", text: cmd.sub }));
      cmdList.appendChild(btn);
    });
  }
  cmdInput.addEventListener("input", () => { cmdHl = 0; renderCmdList(cmdInput.value); });
  cmdInput.addEventListener("keydown", (e) => {
    const items = cmdList.querySelectorAll(".cmd-item");
    if (e.key === "ArrowDown") { e.preventDefault(); cmdHl = Math.min(cmdHl + 1, items.length - 1); renderCmdList(cmdInput.value); }
    else if (e.key === "ArrowUp") { e.preventDefault(); cmdHl = Math.max(cmdHl - 1, 0); renderCmdList(cmdInput.value); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const item = items[cmdHl];
      if (item) item.click();
    }
  });
  cmdPalette.addEventListener("click", (e) => { if (e.target === cmdPalette) closeCmd(); });
  document.getElementById("cmd-btn").addEventListener("click", openCmd);
  document.getElementById("cmd-kbd").textContent = IS_MAC ? "⌘K" : "Ctrl+K";
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      openCmd();
    }
  });

  // ---------- Clock + data refresh ----------
  function tickClock() {
    const d = new Date();
    const s = pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
    const el2 = document.getElementById("topbar-clock");
    if (el2) el2.textContent = s;
  }

  async function refreshAll() {
    try {
      await loadAll();
      setKvStatus("ok", "bağlı · " + state.teachers.length + " öğretmen");
      updateStats();
      if (state.activeTab === "teachers") renderTeachers();
      if (state.activeTab === "lessons") renderLessons();
      if (state.activeTab === "absences") renderAbsences();
      if (state.activeTab === "analytics") renderAnalytics();
      toast("Güncel veri", "ok", 1600);
    } catch (err) {
      setKvStatus("err", "bağlantı hatası");
      toast(err.message || "Yüklenemedi", "err");
    }
  }

  function setKvStatus(kind, msg) {
    const s = document.getElementById("kvStatus");
    s.classList.remove("ok", "err");
    s.classList.add(kind);
    const span = s.querySelector("span:not(.status-dot)");
    if (span) span.textContent = msg;
    else {
      clear(s);
      s.appendChild(el("span", { className: "status-dot" }));
      s.appendChild(el("span", { text: msg }));
    }
  }

  // ---------- Boot ----------
  (async function boot() {
    const ok = await checkAuth();
    if (!ok) return;
    document.getElementById("shell").style.display = "block";
    tickClock();
    setInterval(tickClock, 1000);
    document.getElementById("btn-add-lesson").style.display = "none";
    try {
      await loadAll();
      setKvStatus("ok", "bağlı · " + state.teachers.length + " öğretmen");
      updateStats();
      renderTeachers();
      // Trigger 30-min timeout check on admin panel load (replaces Vercel cron on Hobby plan)
      fetch("/api/cron/check-pending", { credentials: "same-origin" })
        .then(r => r.ok ? r.json() : null)
        .then(j => { if (j && j.escalated > 0) console.log("Escalated " + j.escalated + " pending approvals"); })
        .catch(() => {});
    } catch (err) {
      setKvStatus("err", "KV hatası");
      const area = document.getElementById("teachers-area");
      clear(area);
      const alert = el("div", { className: "alert alert-err" });
      alert.appendChild(icon("alert", 16));
      const txt = el("span");
      const strong = el("strong", { text: "Veri yüklenemedi. " });
      txt.appendChild(strong);
      txt.appendChild(document.createTextNode(err.message || "Vercel'de Redis ve env var'ları kontrol et."));
      alert.appendChild(txt);
      area.appendChild(alert);
    }
  })();
})();
