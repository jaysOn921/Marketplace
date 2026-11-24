/* global self, caches */
// TZed service worker: makes the site installable, opens fast on slow data, shows a page when
// offline, and receives phone notifications. Plain JavaScript, served as-is from /sw.js.
//
// What is kept on the phone:
//   - the app's own files (/assets/…, icons): they never change once built;
//   - the last copy of the app shell (/), so the app opens with no signal;
//   - recently viewed public listings, search results and photos, for a short while.
// Never kept: anything about the signed-in person (account, orders, messages, cart…). The page
// also clears the listing cache on sign-out (lib/pwa.ts), as phones are often shared.

const VERSION = 'v1';
const STATIC = `tzed-static-${VERSION}`;
const SHELL = `tzed-shell-${VERSION}`;
const PUBLIC = 'tzed-public'; // listings and photos; same name across versions, cleared on sign-out
const KEEP = new Set([STATIC, SHELL, PUBLIC]);

/** Public, read-only API answers worth keeping for offline reading. */
const PUBLIC_API =
  /^\/api\/v1\/(listings\/\d+|listings\/by-ids|search|categories|countries|rates|shops\/[^/?]+(\/reviews)?)(\?|$)/;
const MAX_PUBLIC = 80;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC)
      .then((c) => c.addAll(['/offline.html', '/icons/icon-192.png', '/manifest.webmanifest'])),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (!KEEP.has(key)) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

// The page asks for this when someone taps "Reload" on the new-version notice.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - max))) await cache.delete(key);
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) (await caches.open(cacheName)).put(request, response.clone());
  return response;
}

async function networkFirst(request, cacheName, max) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      await cache.put(request, response.clone());
      if (max) void trim(cacheName, max);
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Pages: always the network, so a new release shows at once; offline, the saved app shell
  // (which then shows saved listings), or the offline page.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response.ok && response.headers.get('content-type')?.includes('text/html')) {
            (await caches.open(SHELL)).put('/', response.clone());
          }
          return response;
        } catch {
          return (await caches.match('/')) ?? (await caches.match('/offline.html'));
        }
      })(),
    );
    return;
  }

  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(cacheFirst(request, STATIC));
  } else if (url.pathname.startsWith('/uploads/')) {
    event.respondWith(networkFirst(request, PUBLIC, MAX_PUBLIC * 3));
  } else if (PUBLIC_API.test(url.pathname + url.search)) {
    event.respondWith(networkFirst(request, PUBLIC, MAX_PUBLIC));
  }
  // Everything else (the person's own data, sign-in…) goes straight to the network.
});

// ─── Phone notifications ─────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: event.data?.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'TZed', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/maskable-192.png',
      tag: data.tag,
      renotify: Boolean(data.tag),
      data: { link: data.link || '/notifications' },
      lang: data.lang,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = new URL(event.notification.data?.link || '/', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        return open.navigate(link);
      }
      return self.clients.openWindow(link);
    })(),
  );
});
