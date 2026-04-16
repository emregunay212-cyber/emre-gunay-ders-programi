// Push subscribe toggle for a teacher page.
// Adds a small "🔔 Bildirim aç" button to the header and handles the full
// SW register → permission → subscribe flow.
// Expects window.SCHEDULE.slug to be set (already done by data-*.js).
// Also renders a "pending approval" card when the backend reports a pending
// transfer for this teacher via the normal /api/schedules/today response.

(function () {
  function teacherSlug() {
    return (window.SCHEDULE && window.SCHEDULE.slug) || null;
  }

  const GUN_AD = ["Pazar","Pazartesi","Salı","Çarşamba","Perşembe","Cuma","Cumartesi"];
  const AY_AD  = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];
  function fmtDateTR(iso) {
    const d = new Date(iso + "T12:00:00Z");
    return d.getUTCDate() + " " + AY_AD[d.getUTCMonth()] + " " + GUN_AD[d.getUTCDay()];
  }

  function el(tag, opts, ...children) {
    const e = document.createElement(tag);
    if (opts) {
      if (opts.className) e.className = opts.className;
      if (opts.text != null) e.textContent = opts.text;
      if (opts.attrs) for (const k in opts.attrs) e.setAttribute(k, opts.attrs[k]);
      if (opts.on) for (const k in opts.on) e.addEventListener(k, opts.on[k]);
    }
    for (const c of children) { if (c == null) continue; if (typeof c === "string") e.appendChild(document.createTextNode(c)); else e.appendChild(c); }
    return e;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }

  // -------------- Subscribe button --------------
  function isPushSupported() {
    return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
    return outputArray;
  }

  async function getVapidKey() {
    try {
      const r = await fetch("/api/push?action=vapid-key");
      if (!r.ok) return null;
      const j = await r.json();
      return j.publicKey || null;
    } catch { return null; }
  }

  async function currentSubscription() {
    const reg = await navigator.serviceWorker.ready;
    return await reg.pushManager.getSubscription();
  }

  function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

  // Creates (or reuses) a browser push subscription. Does NOT register
  // it with the server — the caller does that via setSubscriptionSlugs
  // after the user picks teachers in the modal.
  async function ensureBrowserSubscription() {
    if (!isPushSupported()) return { ok: false, error: "not-supported" };
    let step = "init";
    try {
      step = "register-sw";
      await navigator.serviceWorker.register("/sw.js");
      step = "sw-ready";
      const reg = await navigator.serviceWorker.ready;

      // Fast path — existing subscription.
      const existing = await reg.pushManager.getSubscription();
      if (existing) return { ok: true, subscription: existing };

      step = "permission";
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return { ok: false, error: "denied" };
      step = "vapid";
      const vapid = await getVapidKey();
      if (!vapid) return { ok: false, error: "no-vapid" };
      const appServerKey = urlBase64ToUint8Array(vapid);

      step = "subscribe";
      let browserSub;
      try {
        browserSub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: appServerKey,
        });
      } catch (firstErr) {
        step = "subscribe-retry";
        await wait(1200);
        try {
          const leftover = await reg.pushManager.getSubscription();
          if (leftover) { await leftover.unsubscribe(); await wait(300); }
        } catch {}
        browserSub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: appServerKey,
        });
      }
      return { ok: true, subscription: browserSub };
    } catch (err) {
      const msg = (err && err.message) ? err.message : String(err);
      console.error("Subscribe error at step:", step, err);
      return { ok: false, error: "[" + step + "] " + msg };
    }
  }

  async function fetchAllTeachers() {
    try {
      const r = await fetch("/api/schedules?mode=today", { credentials: "same-origin", cache: "no-store" });
      if (!r.ok) return [];
      const j = await r.json();
      return j.teachers || [];
    } catch { return []; }
  }

  async function fetchCurrentSlugs(endpoint) {
    if (!endpoint) return [];
    try {
      const r = await fetch("/api/push?action=list-slugs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint }),
      });
      if (!r.ok) return [];
      const j = await r.json();
      return j.slugs || [];
    } catch { return []; }
  }

  async function setSubscriptionSlugs(subscription, slugs) {
    try {
      const r = await fetch("/api/push?action=set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          teacherSlugs: slugs,
        }),
      });
      return r.ok;
    } catch { return false; }
  }

  function ensurePushModalStyles() {
    if (document.getElementById("push-modal-styles")) return;
    const style = document.createElement("style");
    style.id = "push-modal-styles";
    style.textContent = `
.push-modal-backdrop {
  position: fixed; inset: 0; z-index: 2000;
  background: rgba(0,0,0,0.7); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  padding: 16px;
}
.push-modal {
  background: #14161f; border: 1px solid #262a38; border-radius: 14px;
  padding: 22px; width: 100%; max-width: 420px;
  color: #f0f2f7; font-family: system-ui, -apple-system, sans-serif;
  box-shadow: 0 24px 60px rgba(0,0,0,0.6);
}
.push-modal-title {
  font-size: 17px; font-weight: 700; letter-spacing: -0.01em;
  margin-bottom: 6px;
}
.push-modal-sub {
  font-size: 12px; color: #868ca3; margin-bottom: 16px;
}
.push-modal-list {
  display: flex; flex-direction: column; gap: 6px;
  max-height: 50vh; overflow-y: auto; margin-bottom: 18px;
}
.push-modal-row {
  display: flex; align-items: center; gap: 12px;
  padding: 11px 12px; border-radius: 10px;
  background: #1b1d28; border: 1px solid #262a38;
  cursor: pointer; transition: background 0.15s, border-color 0.15s;
}
.push-modal-row:hover { background: #20232f; border-color: #353a4c; }
.push-modal-row input[type=checkbox] {
  width: 18px; height: 18px; accent-color: #fbbf24; cursor: pointer;
}
.push-modal-row.checked { background: rgba(251,191,36,0.08); border-color: rgba(251,191,36,0.4); }
.push-modal-name { font-size: 14px; font-weight: 600; }
.push-modal-actions {
  display: flex; gap: 10px; justify-content: flex-end;
}
.push-modal-btn {
  padding: 9px 16px; border-radius: 8px; border: none;
  font-size: 13px; font-weight: 700; cursor: pointer;
  font-family: inherit;
}
.push-modal-btn.primary { background: #fbbf24; color: #1a1205; }
.push-modal-btn.primary:disabled { opacity: 0.6; cursor: default; }
.push-modal-btn.secondary {
  background: transparent; color: #868ca3; border: 1px solid #353a4c;
}
.push-modal-clear {
  background: transparent; color: #f87171; border: none;
  font-size: 12px; cursor: pointer; margin-right: auto;
  padding: 8px 0;
}
`;
    document.head.appendChild(style);
  }

  async function openSelectionModal() {
    // Make sure we have a browser subscription before showing the list
    const ensured = await ensureBrowserSubscription();
    if (!ensured.ok) {
      alert("Bildirim açılamadı: " + ensured.error);
      return;
    }
    const sub = ensured.subscription;

    const [teachers, currentSlugs] = await Promise.all([
      fetchAllTeachers(),
      fetchCurrentSlugs(sub.endpoint),
    ]);
    const checkedSet = new Set(currentSlugs);
    // First-time flow: preselect the teacher of the page we're on
    if (checkedSet.size === 0) {
      const mySlug = teacherSlug();
      if (mySlug) checkedSet.add(mySlug);
    }

    ensurePushModalStyles();

    const backdrop = el("div", { className: "push-modal-backdrop" });
    const modal = el("div", { className: "push-modal" });
    modal.appendChild(el("div", { className: "push-modal-title", text: "Kimin bildirimlerini alacaksın?" }));
    modal.appendChild(el("div", {
      className: "push-modal-sub",
      text: "Seçtiğin öğretmen(ler)in bildirimleri bu cihaza düşer. Seçim istediğin zaman değiştirilebilir.",
    }));

    const list = el("div", { className: "push-modal-list" });
    const selections = new Map();
    for (const t of teachers) {
      const row = el("label", { className: "push-modal-row" + (checkedSet.has(t.slug) ? " checked" : "") });
      const cb = el("input", { attrs: { type: "checkbox" } });
      cb.checked = checkedSet.has(t.slug);
      selections.set(t.slug, cb.checked);
      cb.addEventListener("change", () => {
        selections.set(t.slug, cb.checked);
        if (cb.checked) row.classList.add("checked");
        else row.classList.remove("checked");
      });
      row.appendChild(cb);
      row.appendChild(el("span", { className: "push-modal-name", text: t.name }));
      list.appendChild(row);
    }
    modal.appendChild(list);

    const actions = el("div", { className: "push-modal-actions" });
    const clearBtn = el("button", { className: "push-modal-clear", text: "Tümünü kapat" });
    const cancelBtn = el("button", { className: "push-modal-btn secondary", text: "İptal" });
    const saveBtn = el("button", { className: "push-modal-btn primary", text: "Kaydet" });

    function close() {
      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
    }

    clearBtn.addEventListener("click", () => {
      for (const [slug] of selections) selections.set(slug, false);
      for (const r of list.querySelectorAll(".push-modal-row")) {
        r.classList.remove("checked");
        const cb = r.querySelector("input");
        if (cb) cb.checked = false;
      }
    });
    cancelBtn.addEventListener("click", close);
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
    saveBtn.addEventListener("click", async () => {
      saveBtn.disabled = true; saveBtn.textContent = "Kaydediliyor…";
      const picked = [];
      for (const [slug, checked] of selections) if (checked) picked.push(slug);
      const ok = await setSubscriptionSlugs(sub, picked);
      if (!ok) {
        saveBtn.disabled = false; saveBtn.textContent = "Kaydet";
        alert("Kayıt yapılamadı, tekrar deneyin.");
        return;
      }
      if (picked.length === 0) {
        // No teachers selected — release browser sub too
        try { await sub.unsubscribe(); } catch {}
      }
      close();
      renderSubscribeButton();
    });

    actions.appendChild(clearBtn);
    actions.appendChild(cancelBtn);
    actions.appendChild(saveBtn);
    modal.appendChild(actions);
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
  }

  async function renderSubscribeButton() {
    const host = document.querySelector("header.top");
    if (!host) return;

    let btn = document.getElementById("push-toggle");
    if (!btn) {
      btn = el("button", { attrs: { id: "push-toggle", type: "button" }, className: "push-toggle" });
      host.appendChild(btn);
    }

    if (!isPushSupported()) {
      btn.textContent = "🔕 Bildirim desteklenmiyor";
      btn.disabled = true;
      btn.classList.add("disabled");
      return;
    }
    if (Notification.permission === "denied") {
      btn.textContent = "🔕 Tarayıcı izin vermedi";
      btn.disabled = true;
      btn.classList.remove("on"); btn.classList.add("disabled");
      return;
    }

    btn.disabled = false;
    btn.classList.remove("disabled");

    const sub = await currentSubscription().catch(() => null);
    const slugs = sub ? await fetchCurrentSlugs(sub.endpoint) : [];

    if (slugs.length > 0) {
      btn.textContent = slugs.length === 1
        ? "🔔 Bildirim: 1 öğretmen"
        : "🔔 Bildirim: " + slugs.length + " öğretmen";
      btn.classList.add("on");
      btn.title = "Değiştirmek için tıkla";
    } else {
      btn.textContent = "🔔 Bildirim aç";
      btn.classList.remove("on");
      btn.title = "Öğretmen seç ve bildirimleri aç";
    }
    btn.onclick = openSelectionModal;
  }

  // -------------- Pending approval card --------------
  // Query /api/schedules/today, find absences where THIS teacher is the substitute
  // on a pending transfer. Render a card above the schedule.

  async function fetchPendingForMe() {
    const slug = teacherSlug();
    if (!slug) return [];
    try {
      const res = await fetch("/api/schedules?mode=today", { credentials: "same-origin", cache: "no-store" });
      if (!res.ok) return [];
      const data = await res.json();
      const me = (data.teachers || []).find(t => t.slug === slug);
      if (!me) return [];
      const tById = Object.fromEntries((data.teachers || []).map(t => [t.id, t]));
      const lById = Object.fromEntries((data.lessons || []).map(l => [l.id, l]));
      // Defensive dedupe: same (lessonId, absenceDate) should render only once
      // even if backend briefly returns duplicate absence records (eventual
      // consistency, legacy data, etc.).
      const seen = new Set();
      const out = [];
      for (const ab of (data.absences || [])) {
        for (const ov of (ab.lessonOverrides || [])) {
          if (ov.action !== "transfer") continue;
          if (ov.status !== "pending") continue;
          if (ov.substituteTeacherId !== me.id) continue;
          const lesson = lById[ov.lessonId];
          const absent = tById[ab.teacherId];
          if (!lesson || !absent) continue;
          const key = ov.lessonId + "|" + ab.date;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({ absence: ab, override: ov, lesson, absent });
        }
      }
      return out;
    } catch { return []; }
  }

  async function renderPendingCards() {
    const host = document.querySelector(".wrap");
    if (!host) return;
    let container = document.getElementById("pending-approvals");
    if (!container) {
      container = el("div", { attrs: { id: "pending-approvals" } });
      // Insert after header.top
      const header = host.querySelector("header.top");
      if (header && header.nextSibling) host.insertBefore(container, header.nextSibling);
      else host.insertBefore(container, host.firstChild);
    }
    clear(container);

    const items = await fetchPendingForMe();
    if (!items.length) return;

    for (const item of items) {
      const card = el("div", { className: "pending-card" });
      const head = el("div", { className: "pending-head" });
      head.appendChild(el("span", { className: "pending-icon", text: "🔔" }));
      head.appendChild(el("span", { className: "pending-title", text: "Onay bekleniyor" }));
      card.appendChild(head);

      const body = el("div", { className: "pending-body" });
      const dateTR = fmtDateTR(item.absence.date);
      body.appendChild(el("div", { className: "pending-when", text: dateTR + " · " + item.lesson.bas + " – " + item.lesson.bit }));
      body.appendChild(el("div", { className: "pending-what", text: item.lesson.ad }));
      body.appendChild(el("div", { className: "pending-who", text: item.absent.name + " hoca gelmiyor — dersi sana devrediliyor" }));
      card.appendChild(body);

      const btnRow = el("div", { className: "pending-actions" });
      const approveUrl = "/onay.html?token=" + encodeURIComponent(item.override.approvalToken || "");
      const approveBtn = el("a", {
        className: "pending-btn approve",
        attrs: { href: approveUrl + "&d=approve" },
        text: "✓ Onayla",
      });
      const rejectBtn = el("a", {
        className: "pending-btn reject",
        attrs: { href: approveUrl + "&d=reject" },
        text: "✗ Reddet",
      });
      btnRow.appendChild(approveBtn);
      btnRow.appendChild(rejectBtn);
      card.appendChild(btnRow);

      container.appendChild(card);
    }
  }

  // Register SW early so push events work, but don't subscribe until user taps.
  function registerSWIfSupported() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }

  document.addEventListener("DOMContentLoaded", () => {
    registerSWIfSupported();
    renderSubscribeButton();
    renderPendingCards();
    // Refresh pending on schedule:updated
    window.addEventListener("schedule:updated", renderPendingCards);
    // Periodic refresh
    setInterval(renderPendingCards, 60 * 1000);
  });
})();
