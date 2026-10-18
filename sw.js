const CACHE_NAME = 'lucky777-pwa-v2026.10.18.1816';

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

function savePushToIndexedDB(item) {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open('lucky777_notifications_db', 1);
      req.onupgradeneeded = (ev) => {
        const db = ev.target.result;
        if (!db.objectStoreNames.contains('inbox')) {
          db.createObjectStore('inbox', { keyPath: 'id' });
        }
      };
      req.onsuccess = (ev) => {
        try {
          const db = ev.target.result;
          const tx = db.transaction('inbox', 'readwrite');
          tx.objectStore('inbox').put(item);
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
        } catch (e) {
          resolve(false);
        }
      };
      req.onerror = () => resolve(false);
    } catch (e) {
      resolve(false);
    }
  });
}

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

  const notifTag = data.tag || 'lucky777-alert';
  let deterministicId = data.id;
  if (!deterministicId) {
    if (notifTag.startsWith('admin-msg-')) deterministicId = notifTag;
    else if (notifTag.startsWith('lotto-result-')) deterministicId = notifTag.replace('lotto-result-', 'draw-result-');
    else if (notifTag.startsWith('myeongri-')) deterministicId = notifTag;
    else deterministicId = `push-${notifTag}`;
  }

  const options = {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    tag: notifTag,
    vibrate: [100, 50, 100],
    data: Object.assign({}, data.data || {}, {
      url: (data.data && data.data.url) || `${BASE_PATH}?tab=tab-confirmed`,
      id: deterministicId,
      tag: notifTag
    }),
    actions: [
      { action: 'open', title: '확인하기' },
      { action: 'close', title: '닫기' }
    ]
  };

  const inboxItem = {
    id: deterministicId,
    category: (notifTag && notifTag.includes('myeongri')) ? 'myeongri' : (data.category || 'system'),
    badge: (notifTag && notifTag.includes('myeongri')) ? '🔮 사주 길일·길시' : (data.badgeText || '🔔 스마트 알림'),
    title: data.title,
    body: data.body,
    createdAt: new Date().toISOString(),
    unread: true,
    actionUrl: (data.data && data.data.url) ? data.data.url : `${BASE_PATH}?tab=tab-generator`
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title, options),
      savePushToIndexedDB(inboxItem),
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        clientList.forEach((client) => {
          try {
            client.postMessage({ type: 'LUCKY777_PUSH_RECEIVED', notification: inboxItem });
          } catch (e) {}
        });
      }).catch(() => {}),
      (typeof self.navigator !== 'undefined' && 'setAppBadge' in self.navigator)
        ? self.navigator.setAppBadge(1).catch(() => {})
        : Promise.resolve()
    ])
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'close') return;

  const notifId = (event.notification.data && event.notification.data.id) || event.notification.tag || '';
  let targetUrl = `${BASE_PATH}`;
  if (event.notification.data && event.notification.data.url) {
    targetUrl = event.notification.data.url;
  }
  if (notifId && !targetUrl.includes('notif_read=')) {
    const delim = targetUrl.includes('?') ? '&' : '?';
    targetUrl = `${targetUrl}${delim}notif_read=${encodeURIComponent(notifId)}`;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // 1) 열려 있는 모든 창에 해당 알림 읽음 처리 postMessage 전파
      clientList.forEach((client) => {
        try {
          client.postMessage({
            type: 'LUCKY777_NOTIFICATION_CLICKED',
            id: notifId,
            tag: event.notification.tag
          });
        } catch (e) {}
      });

      // 2) 이미 열려 있는 창이 있으면 포커스 및 네비게이션
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          if ('navigate' in client) {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      // 3) 없으면 새 창 오픈
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
