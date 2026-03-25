self.addEventListener("push", (event) => {
  let title = "New message";
  let body = "";
  let url = "/";
  let conversationId = undefined;

  if (event.data) {
    try {
      const data = event.data.json();
      title = data.title ?? title;
      body = data.body ?? body;
      url = data.data?.url ?? url;
      conversationId = data.data?.conversationId;
    } catch {}
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      data: { url, conversationId },
      vibrate: [200, 100, 200],
      requireInteraction: false,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        return clients.openWindow(url);
      })
  );
});
