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

  async function subscribe() {
    const slug = teacherSlug();
    if (!slug) return { ok: false, error: "no-slug" };
    if (!isPushSupported()) return { ok: false, error: "not-supported" };
    let browserSub = null;
    let step = "init";
    try {
      step = "register-sw";
      await navigator.serviceWorker.register("/sw.js");
      step = "sw-ready";
      const reg = await navigator.serviceWorker.ready;
      step = "permission";
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return { ok: false, error: "denied" };
      step = "vapid";
      const vapid = await getVapidKey();
      if (!vapid) return { ok: false, error: "no-vapid" };
      const appServerKey = urlBase64ToUint8Array(vapid);

      // Clear any stale subscription. Browsers throw "Registration failed"
      // when an existing subscription was created with a different
      // applicationServerKey (VAPID rotation, prior deploy, etc.).
      step = "unsubscribe-old";
      try {
        const existing = await reg.pushManager.getSubscription();
        if (existing) {
          await existing.unsubscribe();
          // Some Android Chrome builds need a brief pause before the push
          // service considers the previous registration gone.
          await wait(300);
        }
      } catch {}

      // Subscribe, with one retry on transient push-service errors.
      step = "subscribe";
      try {
        browserSub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: appServerKey,
        });
      } catch (firstErr) {
        step = "subscribe-retry";
        await wait(1200);
        // Make sure nothing was left behind by the failed attempt
        try {
          const leftover = await reg.pushManager.getSubscription();
          if (leftover) { await leftover.unsubscribe(); await wait(300); }
        } catch {}
        browserSub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: appServerKey,
        });
      }

      step = "server-save";
      const subJson = browserSub.toJSON();
      const res = await fetch("/api/push?action=subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacherSlug: slug, subscription: subJson }),
      });
      if (!res.ok) {
        // Server did not persist the subscription. Roll back the browser
        // subscription so the UI doesn't show "Bildirim açık" while the
        // server thinks this teacher has no sub (silent push failures).
        try { await browserSub.unsubscribe(); } catch {}
        let serverMsg = "server-error";
        try { const j = await res.json(); if (j && j.error) serverMsg = j.error; } catch {}
        return { ok: false, error: serverMsg };
      }
      return { ok: true, subscription: browserSub };
    } catch (err) {
      if (browserSub) { try { await browserSub.unsubscribe(); } catch {} }
      const msg = (err && err.message) ? err.message : String(err);
      console.error("Subscribe error at step:", step, err);
      return { ok: false, error: "[" + step + "] " + msg };
    }
  }

  async function unsubscribe() {
    const slug = teacherSlug();
    try {
      const sub = await currentSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await fetch("/api/push?action=unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teacherSlug: slug, endpoint }),
        }).catch(() => {});
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err && err.message || err) };
    }
  }

  // Check with the server whether THIS browser's subscription endpoint is
  // registered for THIS teacher's slug. Returns true only when the current
  // page's teacher actually owns this endpoint on the server — prevents
  // the button from showing "Bildirim açık" on a page the user never
  // subscribed for (e.g. admin visiting halil.html after subscribing as
  // emre would otherwise wrongly display "açık" here).
  async function isRegisteredForCurrentTeacher(sub) {
    const slug = teacherSlug();
    if (!slug || !sub) return false;
    try {
      const r = await fetch("/api/push?action=check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacherSlug: slug, endpoint: sub.endpoint }),
      });
      if (!r.ok) return false;
      const j = await r.json();
      return !!j.subscribed;
    } catch { return false; }
  }

  async function renderSubscribeButton() {
    const host = document.querySelector("header.top");
    if (!host) return;

    // Avoid duplicating
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

    const permission = Notification.permission;
    const sub = await currentSubscription().catch(() => null);

    if (permission === "denied") {
      btn.textContent = "🔕 Tarayıcı izin vermedi";
      btn.disabled = true;
      btn.classList.remove("on"); btn.classList.add("disabled");
      return;
    }

    btn.disabled = false;
    btn.classList.remove("disabled");

    // A browser subscription alone isn't enough — it must also be
    // registered for THIS teacher on the server. Otherwise we'd show
    // "açık" on a page the user never subscribed for.
    const registeredHere = sub ? await isRegisteredForCurrentTeacher(sub) : false;

    if (sub && registeredHere) {
      btn.textContent = "🔔 Bildirim açık";
      btn.classList.add("on");
      btn.onclick = async () => {
        btn.disabled = true; btn.textContent = "…";
        await unsubscribe();
        await renderSubscribeButton();
      };
    } else {
      btn.textContent = "🔔 Bildirim aç";
      btn.classList.remove("on");
      btn.onclick = async () => {
        btn.disabled = true; btn.textContent = "…";
        const r = await subscribe();
        if (!r.ok) {
          alert("Bildirim açılamadı: " + r.error);
        }
        await renderSubscribeButton();
      };
    }
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
