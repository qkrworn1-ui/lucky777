const CACHE_NAME = 'lucky777-pwa-v667';

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
  if (url.includes('firestore') || url.includes('kakao') || url.includes('googleapis') || url.includes('dhlottery') || url.includes('gstatic.com') || url.includes('cloudflare.com') || url.includes('jsdelivr.net') || url.includes('unpkg.com')) {
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