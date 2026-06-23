const CACHE_NAME = 'favorite-vault-v1';
const CORE_ASSETS = ['/', '/manifest.webmanifest', '/icons/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  if (event.request.method === 'POST' && requestUrl.pathname === '/share-target') {
    event.respondWith(handleShareTarget(event.request));
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/')));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request);
    }),
  );
});

async function handleShareTarget(request) {
  const formData = await request.formData();
  const title = String(formData.get('title') || '');
  const text = String(formData.get('text') || '');
  const url = String(formData.get('url') || '');
  const bestUrl = url || extractFirstUrl(text) || text;

  const params = new URLSearchParams();
  if (bestUrl) params.set('shareUrl', bestUrl);
  if (title) params.set('shareTitle', title);
  if (text) params.set('shareText', text);

  return Response.redirect(`/?${params.toString()}`, 303);
}

function extractFirstUrl(text) {
  const match = text.match(/https?:\/\/[^\s)]+/i);
  return match?.[0] || '';
}
