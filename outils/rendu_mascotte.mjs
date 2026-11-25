// Fait une image de la mascotte 3D sur fond transparent (outils/mascotte_detouree.png),
// utilisée comme bulle flottante de l'appli Android.
//
//   npm install --no-save three@0.187.0     (la version importée par web/mascotte.html)
//   node outils/rendu_mascotte.mjs [chemin/vers/playwright]
//   python outils/ressources_android.py
//
// three.js est servi depuis node_modules au lieu du CDN : le rendu marche même hors ligne.
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..")
const { chromium } = await import(process.argv[2] || "playwright")
const navigateur = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] })
const page = await navigateur.newPage({ viewport: { width: 420, height: 420 }, deviceScaleFactor: 2 })
await page.route("**/*", (requete) => {
    const url = new URL(requete.request().url())
    if (url.hostname === "cdn.jsdelivr.net" && url.pathname.includes("/three@")) {
        const fichier = join(RACINE, "node_modules", "three", url.pathname.split(/\/three@[^/]+\//)[1])
        if (existsSync(fichier)) return requete.fulfill({ body: readFileSync(fichier), contentType: "application/javascript" })
    }
    if (url.hostname.startsWith("fonts.")) return requete.fulfill({ body: "", contentType: "text/css" })
    return requete.continue()
})
await page.goto(pathToFileURL(join(RACINE, "web", "mascotte.html")).href + "?embed&fond=transparent")
await page.waitForTimeout(4000) // la mascotte arrive et se pose
await page.screenshot({ path: join(RACINE, "outils", "mascotte_detouree.png"), omitBackground: true })
await navigateur.close()
console.log("outils/mascotte_detouree.png")
