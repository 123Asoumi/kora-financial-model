// Enregistre tournage.html (la vraie appli KORA pilotée + titres animés) en vidéo SANS SON.
// Le micro est simulé par Chrome : il joue appel-demo.wav (un faux « agent MTN », voix de synthèse).
// La transcription de l'appel passe par le vrai service en ligne (Space Hugging Face).
//
// Usage (depuis la racine du dépôt, un serveur web doit servir le dépôt sur le port 8777) :
//   python3 -m http.server 8777 &
//   PLAYWRIGHT=playwright node pitch/video/enregistrer.mjs   → pitch/video/kora-demo.mp4
import { execFileSync } from "node:child_process"
import { mkdtempSync, readdirSync, existsSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const { chromium } = await import(process.env.PLAYWRIGHT || "playwright")
const ici = path.dirname(new URL(import.meta.url).pathname)
const dossier = mkdtempSync(path.join(tmpdir(), "kora-video-"))
const b = await chromium.launch({
    proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: "localhost,127.0.0.1" } : undefined,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required",
        "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", `--use-file-for-fake-audio-capture=${ici}/appel-demo.wav`],
})
const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, permissions: ["microphone"], serviceWorkers: "block",
    recordVideo: { dir: dossier, size: { width: 1920, height: 1080 } } })
await ctx.addInitScript(() => { try { localStorage.setItem("kora-onb", "1") } catch (_) {} })
// le client du service en ligne vient d'un CDN : on peut le servir depuis une copie locale (GRADIO_LOCAL)
if (process.env.GRADIO_LOCAL) await ctx.route("**/@gradio/client@*/**", (r) => r.fulfill({ body: readFileSync(process.env.GRADIO_LOCAL), contentType: "application/javascript", headers: { "access-control-allow-origin": "*" } }))
const p = await ctx.newPage()
p.on("pageerror", (e) => console.log("erreur :", e.message))
const t0 = Date.now()
await p.goto("http://localhost:8777/pitch/video/tournage.html")
await p.waitForFunction(() => window.__pret === true, null, { timeout: 120000 })
const debut = (Date.now() - t0) / 1000
p.evaluate(() => window.__run())
await p.waitForFunction(() => window.__fini === true, null, { timeout: 240000, polling: 500 })
const fin = (Date.now() - t0) / 1000
const marques = Object.fromEntries(await p.evaluate(() => window.__marks))
await ctx.close(); await b.close()
const webm = readdirSync(dossier).find((f) => f.endsWith(".webm"))
const sortie = path.join(ici, "kora-demo.mp4")
// -an : aucune piste audio dans la vidéo
// l'attente de la transcription (service en ligne) est accélérée ×6 : la page l'indique à l'écran
const a = (marques.accel_debut - marques.debut) / 1000, z = (marques.accel_fin - marques.debut) / 1000
const filtre = `[0:v]trim=0:${a},setpts=PTS-STARTPTS[v1];[0:v]trim=${a}:${z},setpts=(PTS-STARTPTS)/6[v2];` +
    `[0:v]trim=${z},setpts=PTS-STARTPTS[v3];[v1][v2][v3]concat=n=3:v=1:a=0[v]`
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(debut), "-to", String(fin), "-i", path.join(dossier, webm),
    "-filter_complex", filtre, "-map", "[v]", "-an", "-r", "30", "-c:v", "libx264", "-preset", "slow", "-crf", "22", "-pix_fmt", "yuv420p", "-movflags", "+faststart", sortie])
console.log(`vidéo : ${sortie} (tournée en ${(fin - debut).toFixed(1)} s, transcription ${(z - a).toFixed(1)} s accélérée ×6, sans son)`)
