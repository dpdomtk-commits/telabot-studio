// CASHBOT Service Worker — Notificações Push em Segundo Plano & PWA
const CACHE_NAME = "cashbot-cache-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Evento de Notificação Push (mesmo com o app fechado ou tela bloqueada)
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "💸 Venda Aprovada!";
  const options = {
    body: data.body || "Você recebeu um novo pagamento no CASHBOT!",
    icon: data.icon || "/cashbot-icon-192.png",
    badge: data.badge || "/cashbot-badge-72.png",
    vibrate: data.vibrate || [200, 100, 200],
    sound: "/sounds/cash-register.mp3",
    tag: data.tag || `sale-${Date.now()}`,
    renotify: true,
    data: {
      url: data.data?.url || "/app/payments",
      ...data.data,
    },
    actions: [
      { action: "open", title: "Ver Vendas" },
      { action: "close", title: "Fechar" },
    ],
  };

  // Avisa abas abertas para tocarem o som da caixa registradora se estiverem em primeiro plano
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
        clients.forEach((client) => {
          client.postMessage({
            type: "PUSH_SALE_RECEIVED",
            payload: { title, ...options },
          });
        });
      }),
    ])
  );
});

// Suporte para disparar notificações locais via postMessage
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "TRIGGER_LOCAL_NOTIFICATION") {
    const { title, ...options } = event.data.payload || {};
    self.registration.showNotification(title || "💸 CASHBOT", {
      icon: "/cashbot-icon-192.png",
      badge: "/cashbot-badge-72.png",
      vibrate: [200, 100, 200],
      sound: "/sounds/cash-register.mp3",
      ...options,
    });
  }
});

// Clique na notificação abre o app
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  if (event.action === "close") return;

  const targetUrl = event.notification.data?.url || "/app";

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
    })
  );
});
