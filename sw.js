// Guarda a app no iPhone para abrir sem internet. Mudar VERSAO sempre que se muda um ficheiro.
const VERSAO = "tami-v1";
const FICHEIROS = ["./", "index.html", "style.css", "app.js", "manifest.webmanifest",
  "icones/logo.svg", "icones/apple-touch-icon.png", "icones/icon-192.png", "icones/icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSAO).then(c => c.addAll(FICHEIROS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// rede primeiro (para apanhar versões novas), cache se não houver internet
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(fetch(e.request).then(r => {
    const copia = r.clone();
    caches.open(VERSAO).then(c => c.put(e.request, copia));
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
