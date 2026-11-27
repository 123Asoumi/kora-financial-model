// Petites fonctions sans Electron : le chemin d'un fichier de la page, son type, et où poser la bulle.
const path = require("path")

const TYPES = {
    ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json",
    ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".ico": "image/x-icon",
    ".wasm": "application/wasm", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf",
    ".txt": "text/plain; charset=utf-8", ".traineddata": "application/octet-stream", ".gz": "application/gzip", ".glb": "model/gltf-binary",
}

function typeMime(fichier) {
    return TYPES[path.extname(fichier).toLowerCase()] || "application/octet-stream"
}

/** Le fichier de `racine` demandé par un chemin d'URL, ou null s'il sort du dossier. */
function cheminSur(racine, urlChemin) {
    let decode
    try { decode = decodeURIComponent(urlChemin) } catch (_) { return null }
    if (decode.includes("\0")) return null
    const relatif = decode === "/" || decode === "" ? "index.html" : decode.replace(/^\/+/, "")
    const complet = path.resolve(racine, relatif)
    const base = path.resolve(racine)
    return complet === base || complet.startsWith(base + path.sep) ? complet : null
}

/** La bulle se colle au bord gauche ou droit de la zone de travail, selon son centre. Garde sa hauteur dans la zone. */
function aimanter(bulle, zone) {
    const centre = bulle.x + bulle.width / 2
    const x = centre < zone.x + zone.width / 2 ? zone.x : zone.x + zone.width - bulle.width
    const y = Math.min(Math.max(bulle.y, zone.y), zone.y + zone.height - bulle.height)
    return { x: Math.round(x), y: Math.round(y) }
}

module.exports = { typeMime, cheminSur, aimanter }
