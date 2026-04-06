// Service Worker for Web Push Notifications
// Handles push events and notification clicks

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = {
      title: "AlKhayr Class",
      body: event.data.text(),
      url: "/teacher/attendance",
    };
  }

  const options = {
    body: data.body || "You have a new notification",
    icon: "/logo-akademi.png",
    badge: "/logo-akademi.png",
    tag: data.tag || "attendance-reminder",
    renotify: true,
    data: {
      url: data.url || "/teacher/attendance",
    },
  };

  event.waitUntil(self.registration.showNotification(data.title || "AlKhayr Class", options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/teacher/attendance";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if available
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      // Open new window if no existing one
      return clients.openWindow(url);
    })
  );
});
