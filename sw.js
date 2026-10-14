/*
  Service worker: guarda la app en el aparato para que abra sin conexión.
  Tus datos no pasan por acá: los guarda y sincroniza Firestore por su cuenta.

  - Archivos de la app: primero la red (así ves siempre la última versión) y,
    si no hay conexión o tarda más de 3 segundos, la copia guardada.
  - Firebase (gstatic) y las fuentes: la copia guardada primero, porque esas
    direcciones llevan la versión adentro y nunca cambian.
  - Todo lo demás (la base, el inicio de sesión) pasa directo.

  Al cambiar la lista de archivos, subí VERSION para que se renueve la copia.
*/

var VERSION = 'v6';
var SHELL = 'mis-habitos-shell-' + VERSION;
var LIBS = 'mis-habitos-libs-v1';
var FILES = [
  './', './index.html', './styles.css', './app.js', './movimiento.js', './pintar.js', './store.js', './datos.js', './fechas.js',
  './firebase-config.js', './manifest.webmanifest',
  './icons/favicon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './icons/badge-96.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(SHELL).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== SHELL && k !== LIBS; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function networkFirst(request) {
  return caches.open(SHELL).then(function (cache) {
    var network = fetch(request).then(function (res) {
      if (res.ok) cache.put(request, res.clone());
      return res;
    });
    var timeout = new Promise(function (resolve) { setTimeout(resolve, 3000); });
    var fallback = function () {
      return cache.match(request, { ignoreSearch: true }).then(function (hit) {
        if (hit) return hit;
        if (request.mode === 'navigate') return cache.match('./index.html');
        return network;
      });
    };
    return Promise.race([network, timeout.then(function () { return null; })])
      .then(function (res) { return res || fallback(); }, fallback);
  });
}

function cacheFirst(request) {
  return caches.open(LIBS).then(function (cache) {
    return cache.match(request).then(function (hit) {
      return hit || fetch(request).then(function (res) {
        if (res.ok || res.type === 'opaque') cache.put(request, res.clone());
        return res;
      });
    });
  });
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(req));
  } else if (
    (url.hostname === 'www.gstatic.com' && url.pathname.indexOf('/firebasejs/') === 0) ||
    url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com'
  ) {
    event.respondWith(cacheFirst(req));
  }
});

/*
  Recordatorio diario. El aviso lo manda recordatorio/enviar.mjs (GitHub
  Actions) por Firebase Cloud Messaging, como mensaje de datos:
  { title, body }. Acá se muestra, y al tocarlo se abre la app.
*/
self.addEventListener('push', function (event) {
  var p = {};
  try { p = event.data ? event.data.json() : {}; } catch (e) { p = {}; }
  var d = p.data || p.notification || p;
  event.waitUntil(self.registration.showNotification(d.title || 'Mis hábitos', {
    body: d.body || 'Acordate de marcar tus hábitos de hoy.',
    icon: 'icons/icon-192.png',
    badge: 'icons/badge-96.png',
    tag: 'recordatorio',
    renotify: true,
    data: { url: './' }
  }));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      if ('focus' in list[i]) return list[i].focus();
    }
    return self.clients.openWindow('./');
  }));
});
