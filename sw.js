/* RFL Catalog service worker — v2.0.0
   HTML / products.json: network-first (notun data age asbe)
   Chobi: cache-first (durbol net-eo khulbe)
   Purono cache auto-mu-che jabe. */
var CACHE = "rfl-catalog-v2";
var CORE = ["./", "index.html", "products.json", "categories.json"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(CORE); }).catch(function () {}));
  self.skipWaiting();
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }));
  self.clients.claim();
});

self.addEventListener("fetch", function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  var isData = url.pathname.endsWith("products.json") || url.pathname.endsWith("index.html") || url.pathname === "/" || url.pathname.endsWith("/");
  if (isData) {
    e.respondWith(fetch(e.request).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copy); }).catch(function () {});
      return res;
    }).catch(function () { return caches.match(e.request); }));
  } else {
    e.respondWith(caches.match(e.request).then(function (hit) {
      if (hit) return hit;
      return fetch(e.request).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); }).catch(function () {});
        return res;
      });
    }));
  }
});
