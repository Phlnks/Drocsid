/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope;

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// ── Réception d'une push notification ────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || '/logo-192.png',
      badge: '/logo-192.png',
      tag: 'drocsid-dm',          // Regroupe les notifs du même type
      renotify: true,             // Vibre même si tag identique
      data: { url: data.url },
    })
  );
});

// ── Clic sur la notification → ouvrir l'app ───────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Si l'app est déjà ouverte → focus + navigation
        for (const client of clientList) {
          if (client.url.startsWith(self.location.origin) && 'focus' in client) {
            client.focus();
            // @ts-ignore
            client.navigate(targetUrl);
            return;
          }
        }
        // Sinon ouvrir l'app
        return self.clients.openWindow(targetUrl);
      })
  );
});