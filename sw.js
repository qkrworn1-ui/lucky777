const CACHE_NAME = 'lucky777-pwa-v2026.10.09.1401';

function getBasePath() {
  try {
    return self.registration.scope || '/lucky777/';
  } catch(e) {
    return '/lucky777/';
  }
}

const BASE_PATH = getBasePath();
const ASSETS_TO_CACHE = [
  BASE_PATH,
  `${BASE_PATH}index.html`,
  `${BASE_PATH}styles.css`,
  `${BASE_PATH}app_v2.js`,
  `${BASE_PATH}manifest.json`,
  `${BASE_PATH}icons/icon-192.png`,
  `${BASE_PATH}icons/icon-512.png`,
  `${BASE_PATH}icons/apple-touch-icon.png`,
  `${BASE_PATH}icons/favicon.png`
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => console.warn('PWA Pre-cache skipped:', err));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // Only handle GET requests
  if (e.request.method !== 'GET') return;

  // Bypass Firestore, Kakao, External APIs
  const url = e.request.url;
  if (url.includes('version.json') || url.includes('firestore') || url.includes('kakao') || url.includes('googleapis') || url.includes('dhlottery') || url.includes('gstatic.com') || url.includes('cloudflare.com') || url.includes('jsdelivr.net') || url.includes('unpkg.com')) {
    return;
  }

  // For HTML documents / page navigation: ALWAYS fetch fresh from network first!
  const isHtmlNavigation = e.request.mode === 'navigate' || (e.request.headers.get('accept') && e.request.headers.get('accept').includes('text/html'));
  if (isHtmlNavigation) {
    e.respondWith(
      fetch(e.request, { cache: 'no-cache' })
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const resClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, resClone));
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(e.request).then((cachedResponse) => {
            return cachedResponse || caches.match(`${BASE_PATH}index.html`) || caches.match(BASE_PATH);
          });
        })
    );
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const resClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, resClone);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(e.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          if (e.request.headers.get('accept') && e.request.headers.get('accept').includes('text/html')) {
            return caches.match(`${BASE_PATH}index.html`) || caches.match(BASE_PATH);
          }
        });
      })
  );
});

// ============================================================================
// 🔔 Web Push & Background Notification Listeners (Myeongri & Draw Alert)
// ============================================================================

self.addEventListener('push', (event) => {
  let data = {
    title: '🌿 [운도실력]',
    body: '회원님을 위한 새로운 맞춤 리포트가 도착했습니다.',
    icon: `${BASE_PATH}icons/icon-192.png`,
    badge: `${BASE_PATH}icons/favicon.png`,
    tag: 'lucky777-alert',
    data: { url: `${BASE_PATH}?tab=tab-confirmed` }
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      data = Object.assign(data, parsed);
    } catch (e) {
      data.body = event.data.text();
    }
  }

  // Ensure absolute or relative paths with BASE_PATH
  if (data.icon && !data.icon.startsWith('http') && !data.icon.startsWith(BASE_PATH)) {
    data.icon = BASE_PATH + data.icon.replace(/^\//, '');
  }
  if (data.badge && !data.badge.startsWith('http') && !data.badge.startsWith(BASE_PATH)) {
    data.badge = BASE_PATH + data.badge.replace(/^\//, '');
  }

  const options = {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    tag: data.tag || 'lucky777-alert',
    vibrate: [100, 50, 100],
    data: data.data || { url: `${BASE_PATH}?tab=tab-confirmed` },
    actions: [
      { action: 'open', title: '확인하기' },
      { action: 'close', title: '닫기' }
    ]
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title, options),
      (typeof self.navigator !== 'undefined' && 'setAppBadge' in self.navigator)
        ? self.navigator.setAppBadge(1).catch(() => {})
        : Promise.resolve()
    ])
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'close') return;

  let targetUrl = `${BASE_PATH}`;
  if (event.notification.data && event.notification.data.url) {
    targetUrl = event.notification.data.url;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a window is already open, navigate and focus
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          if ('navigate' in client) {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
