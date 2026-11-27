// KORA-lite pour Windows : la même appli que sur le téléphone (le dossier web/), dans une fenêtre,
// plus la bulle KORA : la mascotte flotte par-dessus les autres programmes ; on la touche dans WhatsApp Web,
// dans un mail ou dans un SMS affiché à l'écran, elle capture l'écran et KORA dit si le message est une arnaque.
const { app, BrowserWindow, Menu, Notification, Tray, desktopCapturer, ipcMain, nativeImage, protocol, screen, session, shell } = require("electron")
const fs = require("fs")
const path = require("path")
const { Readable } = require("stream")
const { aimanter, cheminSur, typeMime } = require("./outils")

const SCHEMA = "kora"
const ORIGINE = `${SCHEMA}://app`
const DOSSIER_WEB = app.isPackaged ? path.join(process.resourcesPath, "web") : path.join(__dirname, "..", "web")
const BULLE = { width: 84, height: 174 } // la mascotte détourée fait 174 × 360 : on la montre à moitié

protocol.registerSchemesAsPrivileged([
    { scheme: SCHEMA, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
])

let fenetre = null // la fenêtre de KORA
let fenetreBulle = null // la bulle flottante
let icone = null // l'icône de la zone de notification, présente tant que la bulle est active
let quitter = false
let pagePrete = false
let enAttente = [] // captures faites avant que la page soit prête à les recevoir
let captureEnCours = false
let departBulle = null

const pause = (ms) => new Promise((ok) => setTimeout(ok, ms))
const image = (nom) => nativeImage.createFromPath(path.join(__dirname, "assets", nom))

/* ---------- la page : le dossier web/ servi sous kora://app/ (fetch, WebAssembly et modules y marchent) ---------- */
function servirLaPage() {
    protocol.handle(SCHEMA, (requete) => {
        const url = new URL(requete.url)
        const fichier = url.host === "app" ? cheminSur(DOSSIER_WEB, url.pathname) : null
        if (!fichier) return new Response("Introuvable", { status: 404 })
        let stat
        try { stat = fs.statSync(fichier) } catch (_) { return new Response("Introuvable", { status: 404 }) }
        if (!stat.isFile()) return new Response("Introuvable", { status: 404 })
        return new Response(Readable.toWeb(fs.createReadStream(fichier)), {
            headers: { "Content-Type": typeMime(fichier), "Content-Length": String(stat.size), "Cache-Control": "no-cache" },
        })
    })
}

function deLaPage(evenement) {
    return !!fenetre && evenement.sender === fenetre.webContents && String(evenement.senderFrame?.url || "").startsWith(ORIGINE + "/")
}

function creerFenetre() {
    fenetre = new BrowserWindow({
        width: 460, height: 820, minWidth: 360, minHeight: 560,
        title: "KORA-lite", icon: image("icone.png"), backgroundColor: "#ffffff", autoHideMenuBar: true,
        webPreferences: { preload: path.join(__dirname, "preload-kora.js"), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
    })
    fenetre.webContents.setWindowOpenHandler(({ url }) => {
        if (/^https?:\/\//i.test(url)) shell.openExternal(url)
        return { action: "deny" }
    })
    fenetre.webContents.on("will-navigate", (e, url) => {
        if (url.startsWith(ORIGINE + "/")) return
        e.preventDefault()
        if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    })
    fenetre.webContents.on("did-start-loading", () => { pagePrete = false })
    // tant que la bulle veille, fermer la fenêtre la range seulement : la bulle reste là
    fenetre.on("close", (e) => {
        if (!quitter && fenetreBulle) { e.preventDefault(); fenetre.hide() }
    })
    fenetre.on("closed", () => { fenetre = null })
    for (const evt of ["focus", "blur", "show", "hide", "minimize", "restore"]) fenetre.on(evt, majBulle)
    fenetre.loadURL(`${ORIGINE}/index.html`)
    if (!app.isPackaged) fenetre.webContents.on("before-input-event", (_e, i) => { if (i.key === "F12") fenetre.webContents.toggleDevTools() })
}

function montrerKora() {
    if (!fenetre) creerFenetre()
    if (fenetre.isMinimized()) fenetre.restore()
    fenetre.show()
    fenetre.focus()
}

/* ---------- la bulle ---------- */
// Comme sur Android : quand KORA est ouvert, la bulle se cache ; quand on est dans une autre fenêtre, elle flotte.
function majBulle() {
    if (!fenetreBulle || fenetreBulle.isDestroyed()) return
    const koraAuPremierPlan = !!fenetre && fenetre.isVisible() && !fenetre.isMinimized() && fenetre.isFocused()
    if (koraAuPremierPlan || captureEnCours) fenetreBulle.hide()
    else fenetreBulle.showInactive()
}

function demarrerBulle() {
    if (fenetreBulle) return
    const zone = screen.getPrimaryDisplay().workArea
    fenetreBulle = new BrowserWindow({
        ...BULLE, x: zone.x + zone.width - BULLE.width, y: zone.y + Math.round(zone.height / 2 - BULLE.height / 2),
        frame: false, transparent: true, hasShadow: false, resizable: false, movable: true, maximizable: false, minimizable: false,
        fullscreenable: false, skipTaskbar: true, focusable: false, alwaysOnTop: true, show: false, title: "Bulle KORA",
        webPreferences: { preload: path.join(__dirname, "preload-bulle.js"), contextIsolation: true, sandbox: true, nodeIntegration: false },
    })
    fenetreBulle.setAlwaysOnTop(true, "screen-saver")
    fenetreBulle.setVisibleOnAllWorkspaces?.(true)
    fenetreBulle.webContents.setWindowOpenHandler(() => ({ action: "deny" }))
    fenetreBulle.webContents.on("will-navigate", (e) => e.preventDefault())
    fenetreBulle.on("closed", () => { fenetreBulle = null })
    fenetreBulle.loadFile(path.join(__dirname, "bulle.html"))
    fenetreBulle.once("ready-to-show", majBulle)

    icone = new Tray(image("tray.png").resize({ width: 16, height: 16 }))
    icone.setToolTip("KORA veille sur tes messages")
    icone.on("click", () => capturer())
    icone.setContextMenu(menuBulle())
}

function arreterBulle() {
    if (icone) { icone.destroy(); icone = null }
    if (fenetreBulle) { const b = fenetreBulle; fenetreBulle = null; b.destroy() }
    if (fenetre && !fenetre.isVisible()) fenetre.show() // plus de bulle : la fenêtre rangée revient
}

function menuBulle() {
    return Menu.buildFromTemplate([
        { label: "Vérifier l'écran", click: () => capturer() },
        { label: "Ouvrir KORA", click: montrerKora },
        { type: "separator" },
        { label: "Arrêter la bulle", click: arreterBulle },
        { label: "Quitter KORA", click: () => app.quit() },
    ])
}

async function capturer() {
    if (captureEnCours || !fenetreBulle) return
    captureEnCours = true
    try {
        const b = fenetreBulle.getBounds()
        const ecran = screen.getDisplayNearestPoint({ x: b.x + Math.round(b.width / 2), y: b.y + Math.round(b.height / 2) })
        fenetreBulle.hide()
        await pause(200) // le temps que la bulle et le menu disparaissent de l'écran
        const echelle = ecran.scaleFactor || 1
        const sources = await desktopCapturer.getSources({
            types: ["screen"],
            thumbnailSize: { width: Math.min(Math.round(ecran.size.width * echelle), 3840), height: Math.min(Math.round(ecran.size.height * echelle), 2160) },
        })
        const source = sources.find((s) => s.display_id === String(ecran.id)) || sources[0]
        if (!source || source.thumbnail.isEmpty()) throw new Error("capture vide")
        const capture = { png: source.thumbnail.toPNG(), etiquette: "Ce que la bulle a vu sur ton écran" }
        montrerKora()
        if (pagePrete && fenetre) fenetre.webContents.send("capture", capture)
        else enAttente.push(capture)
    } catch (_) {
        new Notification({ title: "KORA", body: "Je n'ai pas pu capturer l'écran. Réessaie dans un instant." }).show()
    } finally {
        captureEnCours = false
        majBulle()
    }
}

ipcMain.on("bulle:debut", (e) => { if (e.sender === fenetreBulle?.webContents) departBulle = fenetreBulle.getBounds() })
ipcMain.on("bulle:deplacer", (e, dx, dy) => {
    if (e.sender !== fenetreBulle?.webContents || !departBulle || !Number.isFinite(dx) || !Number.isFinite(dy)) return
    fenetreBulle.setBounds({ x: Math.round(departBulle.x + dx), y: Math.round(departBulle.y + dy), width: BULLE.width, height: BULLE.height })
})
ipcMain.on("bulle:lacher", (e) => {
    if (e.sender !== fenetreBulle?.webContents) return
    const b = fenetreBulle.getBounds()
    const { x, y } = aimanter(b, screen.getDisplayMatching(b).workArea)
    fenetreBulle.setBounds({ x, y, width: BULLE.width, height: BULLE.height })
})
ipcMain.on("bulle:toucher", (e) => { if (e.sender === fenetreBulle?.webContents) capturer() })
ipcMain.on("bulle:menu", (e) => { if (e.sender === fenetreBulle?.webContents) menuBulle().popup() })

ipcMain.handle("bulle:etat", (e) => (deLaPage(e) ? { superposition: true, active: !!fenetreBulle } : { superposition: false, active: false }))
ipcMain.handle("bulle:demarrer", (e) => { if (!deLaPage(e)) return "ERREUR"; demarrerBulle(); majBulle(); return "ok" })
ipcMain.handle("bulle:arreter", (e) => { if (deLaPage(e)) arreterBulle() })
ipcMain.on("page:prete", (e) => {
    if (!deLaPage(e)) return
    pagePrete = true
    for (const c of enAttente.splice(0)) fenetre.webContents.send("capture", c)
})

/* ---------- démarrage ---------- */
if (!app.requestSingleInstanceLock()) {
    app.quit()
} else {
    app.on("second-instance", montrerKora)
    app.on("before-quit", () => { quitter = true })
    app.on("window-all-closed", () => { if (!fenetreBulle) app.quit() })
    app.whenReady().then(() => {
        app.setAppUserModelId("bj.kora.lite")
        Menu.setApplicationMenu(null)
        servirLaPage()
        // seul le micro est permis (dictée, suivi d'appel), et seulement pour la page de KORA
        const deKora = (url) => String(url || "").startsWith(ORIGINE + "/")
        session.defaultSession.setPermissionRequestHandler((_wc, permission, rappel, details) =>
            rappel(deKora(details.requestingUrl) && (permission === "media" || permission === "clipboard-sanitized-write")))
        session.defaultSession.setPermissionCheckHandler((_wc, permission, origine) =>
            deKora(origine) && (permission === "media" || permission === "clipboard-sanitized-write"))
        creerFenetre()
        app.on("activate", () => { if (!fenetre) creerFenetre() })
    })
}
