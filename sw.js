// Service Worker: receives Web Push notifications and opens URLs on click.
// Scope: root. No offline caching yet — keep it minimal.

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    if (event.data) payload = event.data.json();
  } catch {
    payload = { title: "Bildirim", body: event.data ? event.data.text() : "" };
  }
  const title = payload.title || "Bildirim";
  const options = {
    body: payload.body || "",
    icon: payload.icon || "/icon-192.png",
    badge: payload.badge || "/icon-192.png",
    data: {
      url: payload.url || "/",
      token: payload.token || null, // approval token — SW uses for /api/approve
      tag: payload.tag || null,
    },
    tag: payload.tag || undefined,
    requireInteraction: !!payload.requireInteraction,
    actions: payload.actions || undefined,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const action = event.action; // "approve" | "reject" | ""

  // In-place approval: substitute tapped Onayla/Reddet directly on the push.
  // No page opens — SW fetches /api/approve and shows a confirmation toast.
  if ((action === "approve" || action === "reject") && data.token) {
    event.waitUntil((async () => {
      try {
        const res = await fetch("/api/approve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: data.token, decision: action }),
        });
        const json = await res.json().catch(() => ({}));
        const serverStatus = json && json.status; // "approved" | "rejected" | "pending"
        const already = !!(json && json.already);

        // Confirmation must tell the user (a) which button they tapped and
        // (b) what the server actually did. Mismatches expose visual
        // ordering bugs on devices where the two action buttons appear
        // in reverse order.
        const youTapped = action === "approve" ? "ONAYLA" : "REDDET";

        let title, body;
        if (!res.ok) {
          title = "İşlem başarısız";
          body = `Sen: ${youTapped} butonu · Uygulamayı açıp tekrar deneyin.`;
        } else if (already && serverStatus === "approved") {
          title = "Zaten onaylanmıştı";
          body = `Sen: ${youTapped} butonu · Bu ders devri daha önce onaylanmıştı.`;
        } else if (already && serverStatus === "rejected") {
          title = "Zaten reddedilmişti";
          body = `Sen: ${youTapped} butonu · Bu ders devri daha önce reddedilmişti.`;
        } else if (serverStatus === "approved") {
          title = "✓ Ders devri onaylandı";
          body = `Sen: ${youTapped} butonu · Bilgi admin'e iletildi.`;
        } else if (serverStatus === "rejected") {
          title = "✗ Ders devri reddedildi";
          body = `Sen: ${youTapped} butonu · Bilgi admin'e iletildi.`;
        } else {
          title = "İşlem tamamlandı";
          body = `Sen: ${youTapped} butonu · Durumu uygulamadan kontrol edin.`;
        }

        await self.registration.showNotification(title, {
          body,
          icon: "/icon-192.png",
          badge: "/icon-192.png",
          tag: "approval-result-" + (data.tag || Date.now()),
        });
      } catch {
        await self.registration.showNotification("Bağlantı hatası", {
          body: "İşlem yapılamadı. Uygulamayı açın.",
          icon: "/icon-192.png",
          badge: "/icon-192.png",
          tag: "approval-error",
        });
      }
    })());
    return;
  }

  // Body tap (no action) or fallback — open/focus the target URL.
  const url = data.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.endsWith(url) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
