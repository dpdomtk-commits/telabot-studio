// CASHBOT Service Worker — Notificações Push em Tempo Real (iOS WebKit & Android PWA)
const CACHE_NAME = "cashbot-cache-v2";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

async function showCompatibleNotification(title, rawOptions) {
  const safeOptions = {
    body: rawOptions.body || "Você recebeu um novo pagamento no CASHBOT!",
    icon: rawOptions.icon || "/cashbot-icon-192.png",
    badge: rawOptions.badge || "/cashbot-badge-72.png",
    tag: rawOptions.tag || `sale-${Date.now()}`,
    data: {
      url: rawOptions.data?.url || "/app/payments",
      ...(rawOptions.data || {}),
    },
  };

  try {
    await self.registration.showNotification(title, safeOptions);
  } catch {
    await self.registration.showNotification(title, { body: safeOptions.body, tag: safeOptions.tag });
  }
}

// Evento de Notificação Push (mesmo com o app em segundo plano ou tela bloqueada no iPhone)
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "💸 Venda Aprovada!";

  event.waitUntil(
    Promise.all([
      showCompatibleNotification(title, data),
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
        clients.forEach((client) => {
          client.postMessage({
            type: "PUSH_SALE_RECEIVED",
            payload: { title, body: data.body || "", tag: data.tag || "" },
          });
        });
      }),
    ]),
  );
});

// Suporte para disparar notificações locais via postMessage
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "TRIGGER_LOCAL_NOTIFICATION") {
    const { title, ...options } = event.data.payload || {};
    event.waitUntil(showCompatibleNotification(title || "💸 CASHBOT", options));
  }
});

// Clique na notificação abre o app direto na tela de vendas
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "close") return;

  const targetUrl = event.notification.data?.url || "/app/payments";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes("/app") && "focus" in client) {
          if ("navigate" in client && targetUrl) {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    }),
  );
});
