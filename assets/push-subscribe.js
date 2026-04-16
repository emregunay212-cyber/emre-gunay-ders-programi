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
      const r = await fetch("/api/push/vapid-key");
      if (!r.ok) return null;
      const j = await r.json();
      return j.publicKey || null;
    } catch { return null; }
  }

  async function currentSubscription() {
    const reg = await navigator.serviceWorker.ready;
    return await reg.pushManager.getSubscription();
  }

  async function subscribe() {
    const slug = teacherSlug();
    if (!slug) return { ok: false, error: "no-slug" };
    if (!isPushSupported()) return { ok: false, error: "not-supported" };
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return { ok: false, error: "denied" };
      const vapid = await getVapidKey();
      if (!vapid) return { ok: false, error: "no-vapid" };
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid),
      });
      const subJson = sub.toJSON();
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacherSlug: slug, subscription: subJson }),
      });
      if (!res.ok) return { ok: false, error: "server-error" };
      return { ok: true, subscription: sub };
    } catch (err) {
      console.error("Subscribe error:", err);
      return { ok: false, error: String(err && err.message || err) };
    }
  }

  async function unsubscribe() {
    const slug = teacherSlug();
    try {
      const sub = await currentSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await fetch("/api/push/unsubscribe", {
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
    if (sub) {
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
      const res = await fetch("/api/schedules/today", { credentials: "same-origin", cache: "no-store" });
      if (!res.ok) return [];
      const data = await res.json();
      const me = (data.teachers || []).find(t => t.slug === slug);
      if (!me) return [];
      const tById = Object.fromEntries((data.teachers || []).map(t => [t.id, t]));
      const lById = Object.fromEntries((data.lessons || []).map(l => [l.id, l]));
      const out = [];
      for (const ab of (data.absences || [])) {
        for (const ov of (ab.lessonOverrides || [])) {
          if (ov.action !== "transfer") continue;
          if (ov.status !== "pending") continue;
          if (ov.substituteTeacherId !== me.id) continue;
          const lesson = lById[ov.lessonId];
          const absent = tById[ab.teacherId];
          if (!lesson || !absent) continue;
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
