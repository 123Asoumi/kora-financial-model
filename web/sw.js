// Service worker : KORA fonctionne hors ligne une fois ouverte une première fois.
const CACHE = "kora-v2"
const LOCAL = ["./", "index.html", "app.js", "kora-engine.js", "config.js", "kora_lite.json", "fon.json", "mascotte.html", "manifest.webmanifest", "icone-192.png", "icone-512.png"]
self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(LOCAL)).then(() => self.skipWaiting())))
self.addEventListener("activate", (e) => e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())))
self.addEventListener("fetch", (e) => {
    const url = new URL(e.request.url)
    if (e.request.method !== "GET") return
    // le service fon (Hugging Face) n'est jamais mis en cache
    if (url.hostname.endsWith("hf.space") || url.hostname.endsWith("huggingface.co")) return
    const memoriser = url.origin === location.origin || /cdn\.jsdelivr\.net|fonts\.(googleapis|gstatic)\.com|tessdata/.test(url.hostname + url.pathname)
    if (!memoriser) return
    // réseau d'abord (pour avoir la dernière version), cache si hors ligne
    e.respondWith(fetch(e.request).then((r) => {
        if (r.ok || r.type === "opaque") {
            const copie = r.clone()
            caches.open(CACHE).then((c) => c.put(e.request, copie))
        }
        return r
    }).catch(() => caches.match(e.request)))
})
