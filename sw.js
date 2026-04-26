// ─── SatsFlow Service Worker ─────────────────────────────────────────────────
// Versión del caché — cambia este número para forzar actualización
const CACHE_VERSION = 'Satsfow2-v81';
const CACHE_API     = 'Satsfow2-api-v1';
const CACHE_ASSETS  = [
  './',
  './index.html',
  './manifest.json',
  './style.css',
  // Leaflet (mapa de Cajeros) — necessari per funcionar offline
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

// APIs que aprofiten cache stale-while-revalidate (TTL 60s).
// Si l'app demana el mateix endpoint dues vegades en menys d'1 minut,
// la segona crida es serveix instantàniament des de la cache.
const SWR_API_PATTERNS = [
  /api\.binance\.com\/api\/v3\/klines/,
  /api\.binance\.com\/api\/v3\/ticker/,
  /mempool\.space\/api\/v1\/(fees|blocks|mining)/,
  /api\.blockchain\.info\/charts/
];
const SWR_TTL_MS = 60000;

// ─── Install: pre-cache shell ─────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(CACHE_ASSETS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

// ─── Activate: limpia cachés viejos ──────────────────────────────────────────
self.addEventListener('activate', (event) => {
  const VALID = new Set([CACHE_VERSION, CACHE_API]);
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => !VALID.has(k)).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Helper: SWR per APIs amb TTL. Retorna promesa amb la resposta.
async function swrFetch(request) {
  const cache = await caches.open(CACHE_API);
  const cached = await cache.match(request);
  // Si tenim cache fresca (<TTL), la retornem i fem revalidate en background
  if (cached) {
    const cachedAt = parseInt(cached.headers.get('x-sw-cached-at') || '0', 10);
    const fresh = (Date.now() - cachedAt) < SWR_TTL_MS;
    if (fresh) {
      // Revalidate silenciós en background per al següent cop
      fetch(request).then(r => {
        if (r.ok) {
          const headers = new Headers(r.headers);
          headers.set('x-sw-cached-at', String(Date.now()));
          r.clone().blob().then(b => cache.put(request, new Response(b, { status: r.status, headers })));
        }
      }).catch(() => {});
      return cached;
    }
  }
  // Sense cache fresca: anar a xarxa, guardar i retornar
  try {
    const r = await fetch(request);
    if (r.ok) {
      const headers = new Headers(r.headers);
      headers.set('x-sw-cached-at', String(Date.now()));
      const blob = await r.clone().blob();
      cache.put(request, new Response(blob, { status: r.status, headers }));
    }
    return r;
  } catch (e) {
    // Xarxa caiguda: tornem el que tenim a cache encara que sigui stale
    if (cached) return cached;
    return new Response('', { status: 503, statusText: 'Offline' });
  }
}

// ─── Fetch: Network-first con fallback a caché ────────────────────────────────
self.addEventListener('fetch', (event) => {
  // Solo interceptamos GET; dejamos pasar el resto
  if (event.request.method !== 'GET') return;

  const url = event.request.url;

  // APIs amb SWR (TTL 60s) — accelera canvis de tab i estalvia ample de banda
  if (SWR_API_PATTERNS.some(rx => rx.test(url))) {
    event.respondWith(swrFetch(event.request));
    return;
  }

  // Altres APIs externes (coingecko, etc): siempre red sense cachejar
  if (url.includes('coingecko.com') || url.includes('mempool.space')) {
    event.respondWith(fetch(event.request).catch(() => new Response('', { status: 503 })));
    return;
  }

  // App shell: network-first, caché como fallback
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const clone = response.clone();
        caches.open(CACHE_VERSION).then(cache => cache.put(event.request, clone));
        return response;
      })
      // Si la xarxa falla, intentar la caché. Si tampoc hi és (cache miss),
      // retornar 503 explícit — event.respondWith(undefined) causa errors de xarxa
      // que poden deixar l'app shell sense carregar (pantalla en blanc).
      .catch(() => caches.match(event.request)
        .then(r => r || new Response('', {status:503, statusText:'Offline'})))
  );
});

// ─── Push: recibe notificaciones del servidor (o de periodSync) ───────────────
self.addEventListener('push', (event) => {
  let data = { title: '₿ SatsFlow', body: 'Actualización de precio', icon: '/icon-192.png' };
  try { data = { ...data, ...event.data.json() }; } catch (e) {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:    data.body,
      icon:    data.icon || './icon-192.png',
      badge:   './icon-96.png',
      vibrate: [200, 100, 200],
      data:    { url: data.url || '/' },
      actions: [{ action: 'open', title: 'Ver precio' }]
    })
  );
});

// ─── Notification click: abre / enfoca la app ─────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(self.registration.scope);
    })
  );
});

// ─── Periodic Background Sync: comprueba precio cada ~15 min ─────────────────
// (requiere permisos "periodic-background-sync" — Chrome Android lo soporta)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'price-check') {
    event.waitUntil(checkPriceAndNotify());
  }
});

// ─── Message: la app puede pedir comprobaciones manuales ─────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'CHECK_ALERTS') {
    checkPriceAndNotifyWithAlerts(event.data.alerts);
  }
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ─── Lógica de comprobación de precio ────────────────────────────────────────
async function checkPriceAndNotify() {
  try {
    const [usdRes, eurRes] = await Promise.allSettled([
      fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT'),
      fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCEUR'),
    ]);
    const usd = usdRes.status === 'fulfilled' && usdRes.value.ok
      ? parseFloat((await usdRes.value.json())?.price) : NaN;
    if (!usd) return;

    let eur = null;
    if (eurRes.status === 'fulfilled' && eurRes.value.ok) {
      try { eur = parseFloat((await eurRes.value.json())?.price) || null; } catch {}
    }

    // Recupera alertas guardadas en IndexedDB / cache
    const alertsRaw = await getStoredAlerts();
    await checkPriceAndNotifyWithAlerts(alertsRaw, usd, eur);

    // Guarda el último precio conocido
    await storeLastPrice(usd);
  } catch (e) {
    console.error('[SW] checkPriceAndNotify error:', e);
  }
}

async function checkPriceAndNotifyWithAlerts(alerts = [], currentPriceUsd = null, currentPriceEur = null) {
  if (!currentPriceUsd) {
    try {
      const res  = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
      const json = await res.json();
      currentPriceUsd = parseFloat(json?.price);
    } catch { return; }
  }
  if (!currentPriceEur) {
    try {
      const res  = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCEUR');
      const json = await res.json();
      currentPriceEur = parseFloat(json?.price) || null;
    } catch {}
  }

  for (const alert of alerts) {
    if (alert.triggered) continue;
    const price     = alert.currency === 'usd' ? currentPriceUsd : (currentPriceEur ?? currentPriceUsd * 0.92);
    const triggered = alert.condition === 'above' ? price >= alert.targetPrice : price <= alert.targetPrice;

    if (triggered) {
      const symbol = alert.currency === 'usd' ? '$' : '€';
      await self.registration.showNotification('⚡ Alerta SatsFlow activada', {
        body:    `Bitcoin ha ${alert.condition === 'above' ? 'subido sobre' : 'bajado de'} ${symbol}${alert.targetPrice.toLocaleString()} — Precio actual: $${currentPriceUsd.toLocaleString()}`,
        icon:    './icon-192.png',
        badge:   './icon-96.png',
        vibrate: [300, 100, 300, 100, 300],
        tag:     `alert-${alert.id}`,
        renotify: true,
        silent:  false,
        data:    { alertId: alert.id }
      });

      // Marca alerta como disparada en storage
      await markAlertTriggered(alert.id);
    }
  }
}

// ─── IndexedDB helpers ────────────────────────────────────────────────────────
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('satsflow', 2);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('alerts'))      db.createObjectStore('alerts',      { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta'))        db.createObjectStore('meta',        { keyPath: 'key' });
      if (!db.objectStoreNames.contains('predictions')) db.createObjectStore('predictions', { keyPath: 'date' });
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

async function getStoredAlerts() {
  try {
    const db    = await openDB();
    const tx    = db.transaction('alerts', 'readonly');
    const store = tx.objectStore('alerts');
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror   = () => resolve([]);
    });
  } catch { return []; }
}

async function markAlertTriggered(id) {
  try {
    const db    = await openDB();
    const tx    = db.transaction('alerts', 'readwrite');
    const store = tx.objectStore('alerts');
    return new Promise((resolve) => {
      const req = store.get(id);
      req.onsuccess = () => {
        const alert = req.result;
        if (alert) { alert.triggered = true; store.put(alert); }
        resolve();
      };
      req.onerror = () => resolve();
    });
  } catch {}
}

async function storeLastPrice(usd) {
  try {
    const db    = await openDB();
    const tx    = db.transaction('meta', 'readwrite');
    tx.objectStore('meta').put({ key: 'lastPrice', value: usd, ts: Date.now() });
  } catch {}
}
