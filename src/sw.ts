/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// ── Réception d'une push notification ────────────────────────────────────
self.addEventListener('push', (event) => {
  let data: any = { title: 'Drocsid', body: 'Nouveau message' };
  try {
    if (event.data) data = event.data.json();
  } catch (e) {}

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Si une instance de l'application est ouverte et au premier plan, 
      // le NotificationManager de l'application gèrera la notification via Supabase Realtime.
      for (const client of clientList) {
        if (client.focused) {
          return;
        }
      }

      return self.registration.showNotification(data.title || 'Drocsid', {
        body: data.body || '...',
        icon: data.icon || '/logo-192.png',
        badge: '/logo-192.png',
        tag: 'drocsid-dm',
        // @ts-ignore - renotify is supported by most browsers but maybe missing in type definitions
        renotify: true,
        data: { url: data.url },
      });
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