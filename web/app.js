import { Kora } from "./kora-engine.js"
import { SPACE_FON } from "./config.js"
import {
    STATUTS, PH, ETAPES_URGENCE, PUCES_EXPEDITEUR, PUCES_PREMIER, PUCES_REPONDRE, PUCES_SUITE, toutesLesPhrases,
} from "./phrases.js"

const $ = (id) => document.getElementById(id)
const app = $("app")
const fil = $("fil")
const saisie = $("saisie")
const mascotte = $("mascotte")

let kora = null
let fonHumain = {} // traductions humaines : phrase française → phrase en fon (fon.json)
let langue = "fr"
let attente = null // question en cours : { type: "expediteur" | "nom" | "repondre" | "premier" }
let dernier = null // dernier message analysé : { texte, original, ctx, r, niveau1 }

const BULLES = { arnaque: "Eh!! Eyon l'arnaque c'est pas bien", suspect: "Méfie-toi…", sur: "Ça a l'air normal." }
const COULEURS = { arnaque: "var(--alerte)", suspect: "var(--mefiance)", sur: "var(--sur)" }
const TESSERACT = "https://cdn.jsdelivr.net/npm/tesseract.js@6/dist/tesseract.esm.min.js"
const GRADIO = "https://cdn.jsdelivr.net/npm/@gradio/client@2.8.0/+esm"

const EXEMPLES = [
    ["Un « agent MTN » me demande un code", "Bjr c'est l'agent MTN, j'ai fait une erreur sur ton compte, envoie moi le code que tu vas recevoir stp"],
    ["On m'a envoyé de l'argent « par erreur »", "Bsr, j'ai envoyé 20000 sur ton numéro par erreur c'était pour ma mère malade, renvoie moi stp 🙏"],
    ["Un prêt rapide sans garantie", "Prêt rapide sans garantie : recevez 300 000 F en 10 minutes sur votre MoMo. Payez d'abord 7 500 F de frais de dossier au 01 66 00 00 00."],
    ["J'ai gagné au tirage Moov ?", "Félicitations ! Votre numéro a gagné 500 000 FCFA au tirage Moov. Pour retirer, envoyez 5 000 FCFA de frais au 01 97 12 34 56."],
    ["Mon compte serait bloqué", "Moov Money : votre compte a été bloqué pour activité suspecte. Cliquez sur moov-securite.top pour le réactiver."],
    ["Un SMS de dépôt : vrai ou faux ?", "Vous avez reçu 25 000 FCFA de DOSSOU Koffi (01 97 00 00 00). Nouveau solde : 31 500 FCFA. ID transaction : 7A3F9C21B0."],
]

const echapper = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c])
const calme = () => matchMedia("(prefers-reduced-motion: reduce)").matches
const pause = (ms) => new Promise((ok) => setTimeout(ok, calme() ? 0 : ms))
const tactile = () => matchMedia("(pointer: coarse)").matches
const modeFon = () => langue === "fon"
function el(tag, classe) { const e = document.createElement(tag); if (classe) e.className = classe; return e }
function memoire(cle, valeur) {
    try { if (valeur === undefined) return localStorage.getItem(cle); localStorage.setItem(cle, valeur) } catch (_) { return null }
}

/* ================= mascotte (en bas à gauche de chaque écran) ================= */
let mascottePrete = false
let messageEnAttente = null
let effacerBulle = 0
const bulle = $("perso-bulle")
mascotte.addEventListener("load", () => { mascottePrete = true; if (messageEnAttente) envoyerMascotte(messageEnAttente) })
function envoyerMascotte(message) {
    if (!mascottePrete) { messageEnAttente = message; return }
    try { mascotte.contentWindow.postMessage({ kora: message }, "*") } catch (_) {}
}
function piloter({ emotion, bulle: texte, gratter } = {}) {
    // l'émotion va à la mascotte 3D ; la bulle est dessinée par la page, à côté d'elle
    envoyerMascotte({ emotion, gratter, bulle: "" })
    if (texte === undefined) return
    clearTimeout(effacerBulle)
    if (!texte) { bulle.classList.add("cachee"); return }
    bulle.textContent = texte
    bulle.classList.remove("cachee")
    if (document.body.classList.contains("s-chat"))
        effacerBulle = setTimeout(() => bulle.classList.add("cachee"), 4500)
}
function ecran(nom) {
    document.body.classList.remove("s-splash", "s-onb", "s-chat")
    document.body.classList.add(nom)
    // en discussion, la mascotte devient une bulle ronde : on cadre son visage
    envoyerMascotte({ cadre: nom === "s-chat" ? "tete" : "corps" })
    if (nom === "s-chat") placerTete()
    else fermerMenu()
}

/* ================= la bulle façon Messenger ================= */
const TAILLE = 64
let pos = null // { x: distance au bord gauche, y: distance au bas de l'écran }
try { pos = JSON.parse(memoire("kora-bulle") || "null") } catch (_) { pos = null }
const borne = (v, a, b) => Math.min(b, Math.max(a, v))
function placerTete(coller = false) {
    if (!pos) pos = { x: innerWidth - TAILLE - 8, y: 150 }
    pos.y = borne(pos.y, 96, innerHeight - TAILLE - 80)
    pos.x = borne(pos.x, 6, innerWidth - TAILLE - 6)
    if (coller) pos.x = pos.x + TAILLE / 2 < innerWidth / 2 ? 8 : innerWidth - TAILLE - 8
    const droite = pos.x + TAILLE / 2 >= innerWidth / 2
    document.body.classList.toggle("cote-droit", droite)
    document.body.classList.toggle("cote-gauche", !droite)
    document.body.style.setProperty("--bx", `${pos.x}px`)
    document.body.style.setProperty("--by", `${pos.y}px`)
}
{
    const poignee = $("poignee")
    let geste = null
    poignee.addEventListener("pointerdown", (e) => {
        geste = { x0: e.clientX, y0: e.clientY, x: pos.x, y: pos.y, bouge: false }
        poignee.setPointerCapture(e.pointerId)
    })
    poignee.addEventListener("pointermove", (e) => {
        if (!geste) return
        const dx = e.clientX - geste.x0
        const dy = e.clientY - geste.y0
        if (!geste.bouge && Math.hypot(dx, dy) > 6) { geste.bouge = true; document.body.classList.add("glisse"); fermerMenu() }
        if (geste.bouge) { pos.x = geste.x + dx; pos.y = geste.y - dy; placerTete() }
    })
    const fin = () => {
        if (!geste) return
        const bouge = geste.bouge
        geste = null
        document.body.classList.remove("glisse")
        if (bouge) { placerTete(true); memoire("kora-bulle", JSON.stringify(pos)); envoyerMascotte({ emotion: "joyeux", gratter: true }) }
        else basculerMenu()
    }
    poignee.addEventListener("pointerup", fin)
    poignee.addEventListener("pointercancel", fin)
    addEventListener("resize", () => { if (document.body.classList.contains("s-chat")) placerTete(true) })
}
function basculerMenu() {
    const ouvert = document.body.classList.toggle("menu-ouvert")
    $("poignee").setAttribute("aria-expanded", String(ouvert))
    if (ouvert) { clearTimeout(effacerBulle); envoyerMascotte({ emotion: "surpris" }); $("menu-bulle").querySelector("button:not([hidden])")?.focus() }
}
function fermerMenu() {
    document.body.classList.remove("menu-ouvert")
    $("poignee")?.setAttribute("aria-expanded", "false")
}
document.addEventListener("pointerdown", (e) => {
    if (document.body.classList.contains("menu-ouvert") && !e.target.closest("#menu-bulle, #poignee")) fermerMenu()
})
document.addEventListener("keydown", (e) => { if (e.key === "Escape") fermerMenu() })
if (navigator.mediaDevices?.getDisplayMedia && !matchMedia("(pointer: coarse)").matches)
    $("menu-bulle").querySelector('[data-m="ecran"]').hidden = false
$("menu-bulle").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-m]")
    if (!b) return
    fermerMenu()
    const action = b.dataset.m
    if (action === "capture") $("fichier").click()
    else if (action === "ecran") partagerEcran()
    else if (action === "ecrire") saisie.focus()
    else if (action === "astuce") expliquerPartage()
})
piloter({ emotion: "joyeux", bulle: "Je me prépare…" })

/* ================= chargement ================= */
const debut = performance.now()
let progres = 0
const barre = $("barre")
const minuteur = setInterval(() => { progres += (92 - progres) * 0.09; barre.style.width = `${progres}%` }, 90)

const pret = fetch("kora_lite.json")
    .then((r) => { if (!r.ok) throw new Error(); return r.json() })
    .then((m) => (kora = new Kora(m)))
    .catch(() => null)
fetch("fon.json").then((r) => r.json()).then((j) => {
    for (const [fr, fon] of Object.entries(j.phrases || {})) if (fon && fon.trim()) fonHumain[fr] = fon.trim()
}).catch(() => {})

pret.then(async () => {
    clearInterval(minuteur)
    if (!kora) {
        barre.style.width = "100%"
        $("splash-etat").innerHTML = `Le modèle KORA n'a pas pu être chargé. Vérifie ta connexion.<br><button class="principal" type="button" onclick="location.reload()">Réessayer</button>`
        return
    }
    barre.style.width = "100%"
    $("splash-etat").textContent = "Prêt."
    await new Promise((ok) => setTimeout(ok, Math.max(250, 1500 - (performance.now() - debut))))
    $("splash").classList.add("fini")
    const partage = new URLSearchParams(location.search).has("partage")
    if (memoire("kora-onb") || partage) { entrerDiscussion(); if (partage) recevoirPartage() }
    else { ecran("s-onb"); montrerEtape(0) }
})

/* ================= onboarding ================= */
const EMOTIONS_ONB = [["surpris", "Une arnaque ?"], ["joyeux", "Écris comme tu veux !"], ["amoureux", "Ton message reste chez toi."]]
const etapesOnb = [...document.querySelectorAll(".onb-etape")]
let etapeOnb = 0
let etatAvantOnb = null

function montrerEtape(i) {
    etapeOnb = i
    $("onb-piste").style.transform = `translateX(${-i * 100}%)`
    etapesOnb.forEach((e, k) => e.toggleAttribute("inert", k !== i))
    document.querySelectorAll("#points i").forEach((p, k) => p.classList.toggle("on", k === i))
    $("onb-suivant").textContent = i === etapesOnb.length - 1 ? "Commencer" : "Suivant"
    piloter({ emotion: EMOTIONS_ONB[i][0], bulle: EMOTIONS_ONB[i][1] })
}
function finirOnboarding() {
    memoire("kora-onb", "1")
    if (etatAvantOnb === "actif") { app.classList.remove("onb"); app.classList.add("actif"); etatAvantOnb = null; ecran("s-chat"); piloter({ emotion: "content", bulle: "" }); return }
    entrerDiscussion()
}
function revoirOnboarding() {
    fermerApropos()
    etatAvantOnb = app.classList.contains("actif") ? "actif" : "vide"
    app.classList.remove("vide", "actif")
    app.classList.add("onb")
    ecran("s-onb")
    montrerEtape(0)
}
$("onb-suivant").addEventListener("click", () => (etapeOnb < etapesOnb.length - 1 ? montrerEtape(etapeOnb + 1) : finirOnboarding()))
$("onb-passer").addEventListener("click", finirOnboarding)
{
    let x0 = null
    const fenetre = $("onb-fenetre")
    fenetre.addEventListener("pointerdown", (e) => { x0 = e.clientX })
    fenetre.addEventListener("pointerup", (e) => {
        if (x0 === null) return
        const dx = e.clientX - x0
        x0 = null
        if (dx < -50 && etapeOnb < etapesOnb.length - 1) montrerEtape(etapeOnb + 1)
        if (dx > 50 && etapeOnb > 0) montrerEtape(etapeOnb - 1)
    })
}
function entrerDiscussion() {
    ecran("s-chat")
    app.classList.remove("onb")
    if (!app.classList.contains("actif")) app.classList.add("vide")
    piloter({ emotion: "content", bulle: "Montre-moi le message !" })
    if (!tactile()) setTimeout(() => saisie.focus(), 450)
}

/* ================= service fon : traduction ================= */
let clientFon = null
async function serviceFon() {
    if (!SPACE_FON) throw new Error("fon désactivé")
    if (clientFon) return clientFon
    const { Client } = await import(GRADIO)
    clientFon = await Client.connect(SPACE_FON)
    return clientFon
}
async function traduire(texte, sens) {
    const c = await serviceFon()
    const r = await c.predict("/traduire", { texte, sens })
    return String(r.data[0] ?? "")
}

// Phrases de KORA en fon : traduction humaine (fon.json) d'abord, sinon automatique, gardée en mémoire.
const cacheFon = new Map()
const fonDe = (fr) => fonHumain[fr] || cacheFon.get(fr) || null
async function enFon(phrases) {
    const manque = [...new Set(phrases.filter((p) => p && !fonDe(p)))]
    for (let i = 0; i < manque.length; i += 14) {
        const lot = manque.slice(i, i + 14)
        const lignes = (await traduire(lot.join("\n"), "français→fon")).split("\n")
        lot.forEach((p, k) => { const f = (lignes[k] || "").trim(); if (f) cacheFon.set(p, f) })
    }
    return phrases.map(fonDe)
}
let prechauffage = null
function prechaufferFon() {
    // traduit d'avance toutes les phrases de KORA, en tâche de fond
    if (!prechauffage && kora) prechauffage = enFon(toutesLesPhrases(kora.m.regles)).catch(() => { prechauffage = null })
    return prechauffage
}

// Repérer un message écrit en fon : lettres propres au fon, ou plusieurs mots fon sans mots français
const LETTRES_FON = /[ɛɔɖƐƆƉ]/
const MOTS_FON = /(?:^|[\s,.!?])(akw[eɛ]|gb[eɛ]|ny[eɛ]|xw[eé]|hwenu|w[eɛ]|ɖ[oò]|n[uǔú]|b[oɔ]|kp[oɔ]n|w[aá]|y[iì]|mi|ji|ganj[eɛ]|towe|nɔ|nyi)(?=$|[\s,.!?])/gi
const MOTS_FR = /(?:^|[\s,.!?'])(le|la|les|de|des|du|et|est|vous|tu|je|un|une|pour|sur|votre|ton|mon|pas|que|qui|avec|ce|à|en)(?=$|[\s,.!?])/gi
function estFon(t) {
    if (LETTRES_FON.test(t)) return true
    return (t.match(MOTS_FON) || []).length >= 3 && (t.match(MOTS_FR) || []).length <= 1
}

function majLangue() {
    $("langue-txt").textContent = modeFon() ? "FON" : "FR"
    $("langue").setAttribute("aria-pressed", String(modeFon()))
    $("langue").title = modeFon() ? "Écrire en français" : "Écrire en fon"
    saisie.placeholder = modeFon() ? "Message en fon…" : "Message reçu…"
}
function activerFon() {
    langue = "fon"
    majLangue()
    serviceFon().then(prechaufferFon).catch(() => {})
}
$("langue").addEventListener("click", () => {
    if (modeFon()) { langue = "fr"; majLangue(); piloter({ emotion: "content", bulle: "On parle français." }) }
    else { activerFon(); piloter({ emotion: "joyeux", bulle: "On parle fon !" }) }
    saisie.focus()
})

/* ================= fil de discussion ================= */
function passerActif() {
    if (app.classList.contains("actif")) return
    app.classList.remove("vide")
    app.classList.add("actif")
    $("accueil").hidden = true
}
function defiler() {
    requestAnimationFrame(() => fil.scrollTo({ top: fil.scrollHeight, behavior: calme() ? "auto" : "smooth" }))
}
function msgMoi(texte, { image, petit } = {}) {
    passerActif()
    const d = el("div", "msg-moi")
    if (image) { const img = el("img"); img.src = image; img.alt = "Capture d'écran envoyée"; d.append(img) }
    if (texte) d.append(document.createTextNode(texte))
    if (petit) { const s = el("span", "petit"); s.textContent = petit; d.append(s) }
    fil.append(d)
    defiler()
    return d
}
function msgKora() {
    passerActif()
    const d = el("div", "msg-kora")
    d.innerHTML = `<div class="corps"></div>`
    fil.append(d)
    defiler()
    return d.querySelector(".corps")
}
// Écrit une phrase de KORA. En mode fon : le fon en grand, le français en petit dessous.
function bilingue(noeud, texte, traduire = true) {
    if (!modeFon() || !traduire) { noeud.textContent = texte; return }
    noeud.innerHTML = `<span class="fon"></span><span class="fr"></span>`
    noeud.querySelector(".fr").textContent = texte
    const zone = noeud.querySelector(".fon")
    const deja = fonDe(texte)
    if (deja) { zone.textContent = deja; return }
    zone.textContent = "…"
    enFon([texte]).then(([f]) => { if (f) zone.textContent = f; else zone.remove() }).catch(() => zone.remove())
}
function dire(corps, texte, { classe = "", traduire = true } = {}) {
    const p = el("p", `texte ${classe}`.trim())
    bilingue(p, texte, traduire)
    corps.append(p)
    defiler()
    return p
}
function reflechir(corps) {
    const t = el("div", "tape")
    t.setAttribute("role", "status")
    t.setAttribute("aria-label", "KORA réfléchit")
    t.innerHTML = "<i></i><i></i><i></i>"
    corps.append(t)
    defiler()
    return t
}
// Réponses rapides. Le choix reçoit (valeur, libellé affiché, libellé français).
function puces(corps, liste, choisir) {
    retirerPuces()
    const zone = el("div", "puces")
    zone.id = "puces-actives"
    for (const [label, valeur] of liste) {
        const b = el("button")
        b.type = "button"
        const affiche = (modeFon() && fonDe(label)) || label
        b.textContent = affiche
        if (affiche !== label) b.title = label
        b.addEventListener("click", () => { retirerPuces(); choisir(valeur, affiche, label) })
        zone.append(b)
    }
    corps.append(zone)
    defiler()
}
function retirerPuces() {
    const z = $("puces-actives")
    if (z) { z.classList.add("fini"); z.removeAttribute("id") }
}

/* ================= carte de verdict ================= */
function phrasesCarte(r) {
    return [STATUTS[r.niveau], r.niveau === "sur" ? PH.normal : r.type, ...r.raisons, ...r.indices.map((x) => x.texte), r.conseil]
}
function carteVerdict(corps, r, { maj = false } = {}) {
    const pct = Math.round(r.risque * 100)
    const pctTexte = Math.round(r.risqueTexte * 100)
    const art = el("article", "verdict")
    art.style.setProperty("--c", COULEURS[r.niveau])
    const probas = kora.cat.map((c) =>
        `<div class="proba"><span>${echapper(kora.m.regles.noms[c])}</span><i><b style="width:${(r.probas[c] * 100).toFixed(1)}%"></b></i><span>${Math.round(r.probas[c] * 100)} %</span></div>`).join("")
    art.innerHTML = `
      <span class="statut">${STATUTS[r.niveau]} · ${pct} %</span>
      <h2>${echapper(r.niveau === "sur" ? PH.normal : r.type)}</h2>
      <div class="fon-bloc" hidden></div>
      <div class="jauge" role="img" aria-label="Risque estimé : ${pct} %"><span></span><span></span><span></span><div class="curseur"></div></div>
      <div class="jauge-legende"><span>Normal</span><span>Arnaque</span></div>
      ${maj && pct !== pctTexte ? `<p class="deux-risques">Le texte seul : ${pctTexte} %. Avec ce que tu m'as dit de l'expéditeur : ${pct} %.</p>` : ""}
      ${r.raisons.length ? `<h3>Pourquoi</h3><ul>${r.raisons.map((x) => `<li>${echapper(x)}</li>`).join("")}</ul>` : ""}
      ${r.indices.length ? `<h3>Qui l'envoie</h3><ul class="indices">${r.indices.map((x) => `<li><span aria-hidden="true">${x.sens === "danger" ? "⚠️" : "✅"}</span><span>${echapper(x.texte)}</span></li>`).join("")}</ul>` : ""}
      <p class="conseil"><b>Que faire :</b> ${echapper(r.conseil)}</p>
      <div class="actions">
        ${SPACE_FON && !modeFon() ? `<button type="button" data-a="fon">Voir en fon</button>` : ""}
        ${r.niveau === "sur" ? "" : `<button type="button" class="discret" data-a="partager">Prévenir un proche</button>`}
      </div>
      <details class="curieux"><summary>Comment KORA a décidé</summary>
        <p>Probabilités calculées par le modèle KORA-lite, sur ton téléphone :</p>${probas}
        <p>À partir de ${Math.round(kora.m.seuils.suspect * 100)} % de risque, le message est jugé suspect ; à partir de ${Math.round(kora.m.seuils.arnaque * 100)} %, c'est une arnaque probable.</p>
      </details>`
    corps.append(art)
    requestAnimationFrame(() => requestAnimationFrame(() => art.style.setProperty("--risque", Math.min(99, Math.max(1, pct)))))

    const boutonFon = art.querySelector('[data-a="fon"]')
    boutonFon?.addEventListener("click", () => afficherFon(r, art.querySelector(".fon-bloc"), boutonFon))
    art.querySelector('[data-a="partager"]')?.addEventListener("click", async (e) => {
        const source = dernier?.original || dernier?.texte || ""
        const msg = `⚠️ KORA a analysé ce message : ${STATUTS[r.niveau]} (risque ${pct} %).\n« ${source.slice(0, 160)} »\nConseil : ${r.conseil}\nVérifie toi aussi : ${location.origin}`
        try {
            if (navigator.share) await navigator.share({ title: "Alerte KORA", text: msg })
            else { await navigator.clipboard.writeText(msg); e.currentTarget.textContent = "Alerte copiée" }
        } catch (_) {}
    })
    // en mode fon, le verdict est d'abord dit en fon, en haut de la carte
    if (modeFon()) afficherFon(r, art.querySelector(".fon-bloc"))
    defiler()
    return art
}
async function afficherFon(r, zone, bouton) {
    if (zone.dataset.fait) { zone.hidden = false; return }
    zone.hidden = false
    zone.innerHTML = `<b>Fɔngbe</b>Traduction en fon… (la première fois, jusqu'à une minute)`
    if (bouton) bouton.disabled = true
    try {
        const lignes = (await enFon(phrasesCarte(r))).filter(Boolean)
        if (!lignes.length) throw new Error("vide")
        zone.innerHTML = `<b>Fɔngbe</b>${lignes.map((l) => `<p>${echapper(l)}</p>`).join("")}`
        zone.dataset.fait = "1"
        if (bouton) bouton.remove()
        defiler()
    } catch (_) {
        zone.innerHTML = `<b>Fɔngbe</b>Le service fon ne répond pas pour le moment. Réessaie dans une minute.`
        if (bouton) bouton.disabled = false
    }
}

/* ================= analyse d'un nouveau message ================= */
async function analyserMessage(texte, { deja = false, original = null } = {}) {
    attente = null
    retirerPuces()
    if (!deja) msgMoi(texte)
    const corps = msgKora()
    const tape = reflechir(corps)
    piloter({ emotion: "surpris", bulle: "Je regarde…" })

    const ctx = { expediteur: "", canal: "", repondre: "", premier: "" }
    const r = kora.analyserComplet(texte, ctx)
    dernier = { texte, original, ctx, r, niveau1: r.niveau }
    const question = r.niveau === "sur" ? PH.qExpediteurSur : PH.qExpediteur
    // en mode fon, on traduit tout le tour d'un seul coup avant de répondre
    if (modeFon()) await enFon([...phrasesCarte(r), question, ...PUCES_EXPEDITEUR.map(([l]) => l)]).catch(() => {})
    else await pause(650)
    tape.remove()

    carteVerdict(corps, r)
    piloter({ emotion: r.emotion, bulle: BULLES[r.niveau], gratter: r.niveau === "sur" })
    await pause(400)
    dire(corps, question)
    attente = { type: "expediteur" }
    puces(corps, PUCES_EXPEDITEUR, (v, affiche, fr) => { msgMoi(affiche); choisirExpediteur(v, fr) })
}

/* ================= questions sur l'expéditeur ================= */
const OPERATEUR = /mobile ?money|momo|mtn|moov|celtiis|wave|flooz|banque|ecobank|orabank|\bboa\b|\buba\b|nsia|coris/

function deviner(t) {
    if (/sais pas|aucune id[ée]e|je ne sais/.test(t)) return "nsp"
    if (/(ne|n')\s*(le|la|l'|les)?\s*connais (pas|point)|connais pas|inconnu|jamais vu|premi[eè]re fois/.test(t)) return "inconnu"
    if (/proche|\bami\b|amie|famille|fr[eè]re|s[oœ]eur|maman|papa|m[eè]re|p[eè]re|cousin|tante|oncle|coll[eè]gue|mon mari|ma femme|je (le|la) connais/.test(t)) return "proche"
    if (/whats ?app|\bwa\b/.test(t)) return "whatsapp"
    if ((t.match(/\d/g) || []).length >= 7 || /num[ée]ro/.test(t)) return "numero"
    if (t.length <= 40 && (/\bnom\b/.test(t) || OPERATEUR.test(t))) return "nom"
    if (t.length <= 40 && /appel/.test(t)) return "appel"
    return null
}
function ouiNon(t) {
    if (/sais pas|je ne sais|peut-[êe]tre/.test(t)) return ""
    if (/premi[eè]re/.test(t)) return "oui"
    if (/\b(non|nan|no|jamais|connais)\b/.test(t)) return "non"
    if (/\b(oui|ouais|yes|bien s[uû]r|exact|en effet)\b/.test(t)) return "oui"
    return null
}
async function nouveauTour(phrases = []) {
    const corps = msgKora()
    const tape = reflechir(corps)
    if (modeFon() && phrases.length) await enFon(phrases).catch(() => {})
    else await pause(400)
    tape.remove()
    return corps
}

async function choisirExpediteur(choix, texte) {
    const ctx = dernier.ctx
    if (choix === "nsp") {
        attente = null
        const corps = await nouveauTour([PH.nsp, ...PUCES_SUITE.map(([l]) => l)])
        dire(corps, PH.nsp)
        return suite(corps)
    }
    if (choix === "proche") { ctx.premier = "non"; return reAnalyser() }
    if (choix === "inconnu") { ctx.premier = "oui"; return reAnalyser() }
    if (choix === "appel") { ctx.canal = "appel"; ctx.repondre = "oui"; return reAnalyser() }
    if (choix === "numero") {
        const numero = (texte.match(/\+?\d[\d\s.-]{6,}\d/) || [])[0]
        ctx.expediteur = numero ? numero.trim() : "+229 01 00 00 00 00"
        ctx.canal = ctx.canal || "sms"
        return reAnalyser()
    }
    if (choix === "whatsapp") {
        ctx.canal = "whatsapp"
        ctx.repondre = "oui"
        attente = { type: "premier" }
        const corps = await nouveauTour([PH.qPremier, ...PUCES_PREMIER.map(([l]) => l)])
        dire(corps, PH.qPremier)
        return puces(corps, PUCES_PREMIER, (v, affiche) => { msgMoi(affiche); finirQuestion("premier", v) })
    }
    if (choix === "nom") {
        const nom = /^(un nom|nom)\b/i.test(texte.trim()) ? "" : texte.trim()
        if (nom) return demanderReponse(nom)
        attente = { type: "nom" }
        const corps = await nouveauTour([PH.qNom])
        dire(corps, PH.qNom)
        return puces(corps, [["MobileMoney", "MobileMoney"], ["MTN MoMo", "MTN MoMo"], ["Moov Money", "Moov Money"], ["Celtiis Cash", "Celtiis Cash"]],
            (v) => { msgMoi(v); demanderReponse(v) })
    }
}
async function demanderReponse(nom) {
    dernier.ctx.expediteur = nom
    dernier.ctx.canal = dernier.ctx.canal || "sms"
    attente = { type: "repondre" }
    const corps = await nouveauTour([PH.qRepondre, ...PUCES_REPONDRE.map(([l]) => l)])
    dire(corps, PH.qRepondre)
    puces(corps, PUCES_REPONDRE, (v, affiche) => { msgMoi(affiche); finirQuestion("repondre", v) })
}
async function redemander() {
    const listes = {
        expediteur: [PUCES_EXPEDITEUR, (v, affiche, fr) => { msgMoi(affiche); choisirExpediteur(v, fr) }],
        repondre: [PUCES_REPONDRE, (v, affiche) => { msgMoi(affiche); finirQuestion("repondre", v) }],
        premier: [PUCES_PREMIER, (v, affiche) => { msgMoi(affiche); finirQuestion("premier", v) }],
    }
    const [liste, choisir] = listes[attente.type] || listes.expediteur
    const corps = await nouveauTour([PH.pasCompris])
    piloter({ emotion: "surpris", bulle: "Hein ?" })
    dire(corps, PH.pasCompris)
    puces(corps, liste, choisir)
}
function finirQuestion(champ, valeur) {
    dernier.ctx[champ] = valeur
    reAnalyser()
}
async function reAnalyser() {
    attente = null
    const r = kora.analyserComplet(dernier.texte, dernier.ctx)
    const intro = r.niveau !== dernier.niveau1 ? PH.change : PH.confirme
    dernier.r = r
    const corps = await nouveauTour([intro, ...phrasesCarte(r), ...PUCES_SUITE.map(([l]) => l)])
    dire(corps, intro)
    carteVerdict(corps, r, { maj: true })
    piloter({ emotion: r.emotion, bulle: BULLES[r.niveau], gratter: r.niveau === "sur" })
    await pause(300)
    suite(corps)
}

/* ================= questions de suivi ================= */
function suite(corps) {
    const liste = [...PUCES_SUITE]
    if (SPACE_FON && !modeFon()) liste.push(["En fon", "fon"])
    puces(corps, liste, (v, affiche) => { msgMoi(affiche); repondreIntention(v) })
}
function lireIntention(t) {
    if (/(d[ée]j[àa]|j'ai) ?(pay|envoy|donn|transf|tap)|trop tard|donn[ée] (le|mon) code|j'ai pay/.test(t)) return "urgence"
    if (/pourquoi|comment tu sais|explique|c'est quoi le probl/.test(t)) return "pourquoi"
    if (/que faire|quoi faire|je fais quoi|conseil|aide[- ]moi/.test(t)) return "faire"
    if (/en fon|fɔngbe|fongbe|traduis|traduction/.test(t)) return "fon"
    if (/^(merci|ok|okay|d'accord|super|cool|top|parfait|c'est bon)\b/.test(t)) return "merci"
    return null
}
async function repondreIntention(type) {
    const r = dernier.r
    const raisons = [...r.raisons, ...r.indices.map((x) => x.texte)]
    const aDire = {
        urgence: [PH.urgence, ...ETAPES_URGENCE],
        pourquoi: raisons.length ? raisons : [PH.aucun],
        faire: [r.conseil],
        merci: [PH.merci],
        fon: [],
    }[type]
    const corps = await nouveauTour([...aDire, ...PUCES_SUITE.map(([l]) => l)])
    if (type === "urgence") {
        piloter({ emotion: "triste", bulle: "On agit vite." })
        dire(corps, PH.urgence)
        const ol = el("ol", "etapes")
        for (const etape of ETAPES_URGENCE) { const li = el("li"); bilingue(li, etape); ol.append(li) }
        corps.append(ol)
        defiler()
    } else if (type === "fon") {
        const bloc = el("div", "fon-bloc")
        corps.append(bloc)
        await afficherFon(r, bloc)
    } else if (type === "merci") {
        piloter({ emotion: "joyeux", bulle: "Avec plaisir !", gratter: true })
        dire(corps, PH.merci)
        return
    } else {
        for (const phrase of aDire) dire(corps, phrase)
    }
    suite(corps)
}

/* ================= envoi depuis la barre ================= */
async function envoyer(brut) {
    const texte = brut.trim()
    if (!texte) return
    saisie.value = ""
    ajusterSaisie()
    await pret
    if (!kora) return
    retirerPuces()

    // un message écrit en fon passe en mode fon tout seul
    let annonceFon = false
    if (!modeFon() && SPACE_FON && estFon(texte)) { activerFon(); annonceFon = true }

    // en mode fon : on montre le message, puis on le traduit en français pour le comprendre
    let fr = texte
    let affiche = false
    if (modeFon()) {
        const bulleMoi = msgMoi(texte, { petit: "Fɔngbe" })
        affiche = true
        const corps = msgKora()
        if (annonceFon) dire(corps, PH.fonActif, { traduire: false })
        const tape = reflechir(corps)
        piloter({ emotion: "surpris", bulle: "Je traduis le fon…" })
        try {
            fr = await traduire(texte, "fon→français")
        } catch (_) {
            tape.remove()
            dire(corps, "Le service fon ne répond pas pour le moment (il se réveille parfois en une minute). Réessaie, ou écris en français.", { traduire: false })
            piloter({ emotion: "triste", bulle: "" })
            return
        }
        tape.remove()
        if (!corps.children.length) corps.closest(".msg-kora").remove()
        const trad = el("span", "petit")
        trad.textContent = `Traduction : ${fr}`
        bulleMoi.append(trad)
        defiler()
    }
    const moi = () => { if (!affiche) msgMoi(texte) }
    const t = fr.toLowerCase()

    // 1. réponse à une question de KORA
    if (attente && dernier) {
        if (attente.type === "expediteur") {
            const choix = deviner(t)
            if (choix) { moi(); return choisirExpediteur(choix, fr) }
        } else if (attente.type === "nom" && fr.length <= 40) {
            moi(); return demanderReponse(fr)
        } else if (attente.type === "repondre" || attente.type === "premier") {
            const v = ouiNon(t)
            if (v !== null) { moi(); return finirQuestion(attente.type, v) }
        }
        // une réponse courte que KORA ne comprend pas : il repose sa question au lieu d'analyser
        if (fr.length < 40 && !lireIntention(t)) { moi(); return redemander() }
    }
    // 2. question de suivi sur le dernier message
    if (dernier && fr.length < 70) {
        const intention = lireIntention(t)
        if (intention) { attente = null; moi(); return repondreIntention(intention) }
    }
    // 3. salutation
    if (fr.length < 25 && /^(bonjour|bonsoir|salut|hello|coucou|bjr|bsr|slt|yo)\b/.test(t)) {
        moi()
        const corps = await nouveauTour([PH.salut])
        dire(corps, PH.salut)
        piloter({ emotion: "joyeux", bulle: "Bonjour !" })
        return
    }
    // 4. nouveau message à vérifier
    analyserMessage(fr, { deja: affiche, original: affiche ? texte : null })
}

function ajusterSaisie() {
    saisie.style.height = "auto"
    saisie.style.height = `${Math.min(saisie.scrollHeight, 168)}px`
    $("envoyer").disabled = !saisie.value.trim()
}
saisie.addEventListener("input", ajusterSaisie)
saisie.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing && !tactile()) { e.preventDefault(); envoyer(saisie.value) }
})
$("formulaire").addEventListener("submit", (e) => { e.preventDefault(); envoyer(saisie.value) })

// exemples
for (const [titre, texte] of EXEMPLES) {
    const b = el("button")
    b.type = "button"
    b.innerHTML = `<b>${echapper(titre)}</b><span>${echapper(texte)}</span>`
    b.addEventListener("click", async () => { await pret; if (kora) analyserMessage(texte) })
    $("suggestions").append(b)
}

// nouvelle conversation
$("nouveau").addEventListener("click", () => {
    attente = null
    dernier = null
    for (const n of [...fil.children]) if (n.id !== "accueil") n.remove()
    $("accueil").hidden = false
    app.classList.remove("actif")
    app.classList.add("vide")
    piloter({ emotion: "content", bulle: "Montre-moi le message !" })
})

/* ================= capture d'écran ================= */
let ocr = null
async function lireImage(fichier, etiquette = "Capture d'écran") {
    if (!fichier || !fichier.type.startsWith("image/")) return
    await pret
    if (!kora) return
    retirerPuces()
    attente = null
    msgMoi("", { image: URL.createObjectURL(fichier), petit: etiquette })
    const corps = msgKora()
    const etat = dire(corps, "Je lis la capture…", { classe: "doux", traduire: false })
    const tape = reflechir(corps)
    piloter({ emotion: "surpris", bulle: "Je lis la capture…" })
    try {
        if (!ocr) {
            etat.textContent = "Je prépare le lecteur de texte (la première fois, quelques secondes)…"
            const { createWorker } = await import(TESSERACT)
            ocr = await createWorker("fra", 1, {
                logger: (m) => { if (m.status === "recognizing text") etat.textContent = `Je lis la capture… ${Math.round(m.progress * 100)} %` },
            })
        }
        const { data } = await ocr.recognize(fichier)
        const texte = data.text.replace(/\n{2,}/g, "\n").trim()
        tape.remove()
        if (texte.length < 8) {
            etat.textContent = "Je ne trouve pas de texte lisible sur cette image. Essaie une capture plus nette (zoome sur le message), ou copie le message ici."
            piloter({ emotion: "triste", bulle: "" })
            return
        }
        etat.textContent = `J'ai lu : « ${texte.length > 240 ? `${texte.slice(0, 240)}…` : texte} »`
        analyserMessage(texte, { deja: true })
    } catch (_) {
        tape.remove()
        etat.textContent = "La lecture de l'image a échoué. Vérifie ta connexion, ou copie le message ici."
        piloter({ emotion: "triste", bulle: "" })
    }
}
$("joindre").addEventListener("click", () => $("fichier").click())
$("fichier").addEventListener("change", (e) => { lireImage(e.target.files[0]); e.target.value = "" })
document.addEventListener("paste", (e) => {
    const img = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"))
    if (img) { e.preventDefault(); lireImage(img.getAsFile()) }
})

/* ================= partager son écran (ordinateur) ================= */
async function partagerEcran() {
    let flux
    try { flux = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false }) } catch (_) { return }
    try {
        const video = el("video")
        video.muted = true
        video.srcObject = flux
        await video.play()
        await new Promise((ok) => setTimeout(ok, 500))
        const toile = el("canvas")
        toile.width = video.videoWidth
        toile.height = video.videoHeight
        toile.getContext("2d").drawImage(video, 0, 0)
        const image = await new Promise((ok) => toile.toBlob(ok, "image/png"))
        if (image) lireImage(new File([image], "ecran.png", { type: "image/png" }), "Ce que tu m'as montré de ton écran")
    } finally {
        flux.getTracks().forEach((piste) => piste.stop())
    }
}

/* ================= partager depuis une autre appli (Android, appli installée) ================= */
async function expliquerPartage() {
    const corps = await nouveauTour()
    dire(corps, "Sur Android, installe KORA (bouton ⓘ en haut, puis « Installer l'appli »). Ensuite, depuis n'importe quelle appli : fais une capture d'écran du message, ou sélectionne son texte, appuie sur « Partager », puis choisis KORA. J'analyse tout de suite.", { traduire: false })
    piloter({ emotion: "joyeux", bulle: "Partage-moi tes messages !" })
}
async function recevoirPartage() {
    // le service worker a rangé ce qui a été partagé à KORA depuis une autre appli
    if (!new URLSearchParams(location.search).has("partage") || !("caches" in window)) return false
    history.replaceState(null, "", location.pathname)
    try {
        const boite = await caches.open("kora-partage")
        const image = await boite.match("image")
        const texte = await boite.match("texte")
        await boite.delete("image")
        await boite.delete("texte")
        if (image) {
            const blob = await image.blob()
            lireImage(new File([blob], "partage.png", { type: blob.type || "image/png" }), "Partagé depuis une autre appli")
            return true
        }
        if (texte) {
            const contenu = (await texte.text()).trim()
            if (contenu) { analyserMessage(contenu); return true }
        }
    } catch (_) {}
    return false
}

/* ================= à propos ================= */
function ouvrirApropos() { $("voile").hidden = false; $("fermer").focus() }
function fermerApropos() { $("voile").hidden = true }
$("apropos-btn").addEventListener("click", ouvrirApropos)
$("fermer").addEventListener("click", () => { fermerApropos(); $("apropos-btn").focus() })
$("voile").addEventListener("click", (e) => { if (e.target === $("voile")) fermerApropos() })
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("voile").hidden) fermerApropos() })
$("revoir").addEventListener("click", revoirOnboarding)

/* ================= application installable et hors ligne ================= */
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {})
let invitation = null
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); invitation = e; $("installer").hidden = false })
$("installer").addEventListener("click", async () => {
    if (!invitation) return
    invitation.prompt()
    await invitation.userChoice
    invitation = null
    $("installer").hidden = true
})
