// Service worker : KORA fonctionne hors ligne une fois ouverte une première fois.
const CACHE = "kora-1.0.10" // la version de package.json : à changer à chaque nouvelle version
const PARTAGE = "kora-partage"
const LOCAL = ["./", "index.html", "app.js", "kora-engine.js", "phrases.js", "bulles.js", "config.js", "theme.css", "polices/noto-fon-400.woff2", "polices/noto-fon-700.woff2", "natif.js", "voix.js", "vendor/capacitor-core.js", "kora_lite.json", "fon.json", "mascotte/korachoupi.html", "mascotte/korachoupi-apercu.webp", "vendor/three/three-korachoupi.min.js", "manifest.webmanifest", "icone-192.png", "icone-512.png"]
self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(LOCAL)).then(() => self.skipWaiting())))
self.addEventListener("activate", (e) => e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k !== PARTAGE).map((k) => caches.delete(k)))).then(() => self.clients.claim())))
self.addEventListener("fetch", (e) => {
    const url = new URL(e.request.url)
    // « Partager → KORA » depuis une autre appli : on range l'image ou le texte, puis on ouvre KORA
    if (e.request.method === "POST" && url.origin === location.origin && url.pathname.endsWith("/partage")) {
        e.respondWith((async () => {
            try {
                const donnees = await e.request.formData()
                const boite = await caches.open(PARTAGE)
                const image = donnees.get("image")
                const texte = ["title", "text", "url"].map((k) => donnees.get(k)).filter(Boolean).join("\n")
                if (image && image.size) await boite.put("image", new Response(image, { headers: { "Content-Type": image.type || "image/png" } }))
                else if (texte) await boite.put("texte", new Response(texte))
            } catch (_) {}
            return Response.redirect(new URL("./?partage=1", self.registration.scope).href, 303)
        })())
        return
    }
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
