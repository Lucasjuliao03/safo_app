/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { clientsClaim } from 'workbox-core';

declare let self: ServiceWorkerGlobalScope;

clientsClaim();

// Permite acionar o update pelo frontend
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ═══════════════════════════════════════════════════════ //
//  PRECACHING (injetado pelo VitePWA no build)           //
// ═══════════════════════════════════════════════════════ //
precacheAndRoute(self.__WB_MANIFEST);

// ═══════════════════════════════════════════════════════ //
//  RUNTIME CACHING                                       //
// ═══════════════════════════════════════════════════════ //

// Removido o cache agressivo para rotas do Supabase
// Não cacheamos chamadas de API, Auth, e Perfil para garantir dados reais.

// Google Fonts — Cache First
registerRoute(
  ({ url }) => url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'google-fonts-cache',
    plugins: [
      new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
);

// ═══════════════════════════════════════════════════════ //
//  PUSH EVENT — Recebe notificação do servidor           //
// ═══════════════════════════════════════════════════════ //
self.addEventListener('push', (event: PushEvent) => {
  if (!event.data) return;

  let payload: { title: string; body: string; icon?: string; badge?: string; url?: string; tag?: string };

  try {
    payload = event.data.json();
  } catch {
    payload = {
      title: 'SAFO',
      body: event.data.text(),
    };
  }

  const options: NotificationOptions = {
    body: payload.body,
    icon: payload.icon || '/app.png',
    badge: payload.badge || '/app.png',
    tag: payload.tag || 'safo-push-' + Date.now(),
    data: {
      url: payload.url || '/',
    },
    // @ts-expect-error: TS DOM lib missing vibrate in NotificationOptions
    vibrate: [100, 50, 100],
    requireInteraction: false,
  };

  event.waitUntil(
    self.registration.showNotification(payload.title, options)
  );
});

// ═══════════════════════════════════════════════════════ //
//  NOTIFICATION CLICK — Abre/foca a aplicação            //
// ═══════════════════════════════════════════════════════ //
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Se já há uma aba aberta, foca nela e navega
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          client.postMessage({
            type: 'NOTIFICATION_CLICK',
            url: targetUrl,
          });
          return;
        }
      }
      // Senão, abre nova aba
      return self.clients.openWindow(targetUrl);
    })
  );
});

// ═══════════════════════════════════════════════════════ //
//  PUSH SUBSCRIPTION CHANGE — Re-subscribe automático    //
// ═══════════════════════════════════════════════════════ //
self.addEventListener('pushsubscriptionchange', (event: any) => {
  // Notifica o frontend que precisa re-subscribe
  self.clients.matchAll().then((clients) => {
    clients.forEach((client) => {
      client.postMessage({ type: 'PUSH_SUBSCRIPTION_EXPIRED' });
    });
  });
});
