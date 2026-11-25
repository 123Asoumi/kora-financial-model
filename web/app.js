import { BULLES_VERDICT, creerBulles } from "./bulles.js"
import { Kora } from "./kora-engine.js"
import { SPACE_FON } from "./config.js"
import { estAppli, etatBulle, demarrerBulle, arreterBulle, ecouterAppli } from "./natif.js"
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
let historique = [] // la discussion libre avec l'assistant, en français : [{ role, content }]

const BULLES = BULLES_VERDICT
const COULEURS = { arnaque: "var(--alerte)", suspect: "var(--mefiance)", sur: "var(--sur)" }
// Lecture du texte des captures : Tesseract embarqué dans l'appli (vendor/tesseract), marche sans internet
const TESSERACT = "./vendor/tesseract/tesseract.esm.min.js"
const DOSSIER_TESSERACT = new URL("vendor/tesseract/", location.href).href
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
const calme = () => document.body.classList.contains("calme") || matchMedia("(prefers-reduced-motion: reduce)").matches
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
const bulles = creerBulles($("perso-bulle"))  // bulles de texte : voir bulles.js (désactivées pour l'instant)
mascotte.addEventListener("load", () => { mascottePrete = true; if (messageEnAttente) envoyerMascotte(messageEnAttente) })
function envoyerMascotte(message) {
    if (!mascottePrete) { messageEnAttente = message; return }
    try { mascotte.contentWindow.postMessage({ kora: message }, "*") } catch (_) {}
}
function piloter({ emotion, bulle: texte, gratter } = {}) {
    // l'émotion va à la mascotte 3D ; le texte va aux bulles (bulles.js), éteintes pour l'instant
    envoyerMascotte({ emotion, gratter, bulle: "" })
    bulles.dire(texte, { enDiscussion: document.body.classList.contains("s-chat") })
}
function ecran(nom) {
    document.body.classList.remove("s-splash", "s-onb", "s-chat")
    document.body.classList.add(nom)
    if (nom !== "s-chat") fermerMenu()
}

/* ================= le menu de la mascotte (la toucher l'ouvre) ================= */
$("poignee").addEventListener("click", () => basculerMenu())
function basculerMenu() {
    const ouvert = document.body.classList.toggle("menu-ouvert")
    $("poignee").setAttribute("aria-expanded", String(ouvert))
    if (ouvert) { bulles.cacher(); envoyerMascotte({ emotion: "surpris" }); $("menu-bulle").querySelector("button:not([hidden])")?.focus() }
}
function fermerMenu() {
    document.body.classList.remove("menu-ouvert")
    $("poignee")?.setAttribute("aria-expanded", "false")
}
document.addEventListener("pointerdown", (e) => {
    if (document.body.classList.contains("menu-ouvert") && !e.target.closest("#menu-bulle, #poignee")) fermerMenu()
})
document.addEventListener("keydown", (e) => { if (e.key === "Escape") fermerMenu() })
if (navigator.mediaDevices?.getDisplayMedia && !matchMedia("(pointer: coarse)").matches && !estAppli)
    $("menu-bulle").querySelector('[data-m="ecran"]').hidden = false
if (estAppli) {
    $("menu-bulle").querySelector('[data-m="flottante"]').hidden = false
    $("r-bulle-bloc").hidden = false
    $("telecharger").hidden = true
}
$("menu-bulle").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-m]")
    if (!b) return
    fermerMenu()
    const action = b.dataset.m
    if (action === "capture") $("fichier").click()
    else if (action === "ecran") partagerEcran()
    else if (action === "ecrire") saisie.focus()
    else if (action === "astuce") expliquerPartage()
    else if (action === "flottante") activerBulle()
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
    ecouterAppli({
        surImage: (fichier, etiquette) => { if (!document.body.classList.contains("s-chat")) entrerDiscussion(); lireImage(fichier, etiquette) },
        surTexte: (texte) => { if (!document.body.classList.contains("s-chat")) entrerDiscussion(); analyserMessage(texte) },
    })
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
const DELAI_TRADUCTION = 25000 // au-delà, on considère que le service ne répond pas
const DELAI_ASSISTANT = 60000
// Le service en ligne (Space Hugging Face) peut refuser (quota GPU gratuit dépassé) ou ne jamais répondre :
// on ne laisse jamais l'utilisateur attendre sans fin.
function avecDelai(promesse, ms) {
    let minuterie
    const delai = new Promise((_, non) => { minuterie = setTimeout(() => non(new Error("délai dépassé")), ms) })
    return Promise.race([promesse, delai]).finally(() => clearTimeout(minuterie))
}
async function appelerService(route, donnees, ms) {
    try {
        if (!SPACE_FON) throw new Error("fon désactivé")
        if (!clientFon) {
            const { Client } = await import(GRADIO)
            clientFon = await Client.connect(SPACE_FON)
        }
        return await avecDelai(clientFon.predict(route, donnees), ms)
    } catch (e) {
        clientFon = null // au prochain essai, on se reconnecte
        dernierePanne = Date.now()
        throw e
    }
}
let dernierePanne = 0
/** Traduit en fon les phrases d'une réponse, sans jamais retarder le verdict : au plus 8 s,
 *  et pas du tout si le service vient d'échouer (la réponse s'affiche alors en français). */
async function enFonSiPossible(phrases) {
    if (Date.now() - dernierePanne < 120000) return
    try { await avecDelai(enFon(phrases), 8000) } catch (_) { dernierePanne = Date.now() }
}
async function serviceFon() { // gardé pour le préchauffage : se connecter sans attendre une réponse
    if (!SPACE_FON) throw new Error("fon désactivé")
    if (!clientFon) { const { Client } = await import(GRADIO); clientFon = await Client.connect(SPACE_FON) }
    return clientFon
}
/** Une phrase honnête sur la panne, selon l'erreur reçue. */
function panneService(e) {
    const m = String(e?.message || e)
    if (/quota|runs limit|exceeded|too many/i.test(m)) return "le service en ligne de KORA est saturé (trop de demandes aujourd'hui)"
    if (/délai/i.test(m)) return "le service en ligne de KORA met trop de temps à répondre"
    return "le service en ligne de KORA ne répond pas pour le moment"
}
async function traduire(texte, sens) {
    const r = await appelerService("/traduire", { texte, sens }, DELAI_TRADUCTION)
    return String(r.data[0] ?? "")
}

// L'assistant de KORA (modèle de langage dans le Space) : il répond aux questions, à partir du verdict.
async function demanderAssistant(question) {
    const r = await appelerService("/discuter",
        { question, contexte: contexteVerdict(), historique: JSON.stringify(historique.slice(-8)) }, DELAI_ASSISTANT)
    return String(r.data[0] ?? "").trim()
}
function contexteVerdict() {
    if (!dernier) return ""
    const { r, ctx } = dernier
    const qui = [ctx.expediteur && `expéditeur : ${ctx.expediteur}`, ctx.canal && `reçu par : ${ctx.canal}`,
        ctx.repondre && `on peut répondre : ${ctx.repondre}`, ctx.premier && `premier contact : ${ctx.premier}`].filter(Boolean).join(", ")
    return [
        `Message reçu : « ${dernier.texte.slice(0, 600)} »`,
        `Verdict du modèle KORA : ${STATUTS[r.niveau]} (risque ${Math.round(r.risque * 100)} %), type : ${r.niveau === "sur" ? "message normal" : r.type}.`,
        r.raisons.length ? `Raisons : ${r.raisons.join(" ")}` : "",
        r.indices.length ? `Sur l'expéditeur : ${r.indices.map((x) => x.texte).join(" ")}` : "",
        qui ? `Ce que l'utilisateur a dit de l'expéditeur : ${qui}.` : "",
        `Conseil donné : ${r.conseil}`,
    ].filter(Boolean).join("\n")
}
// Une question posée à KORA, plutôt qu'un message reçu à vérifier
const DEBUT_QUESTION = /^(est[- ]ce|comment|pourquoi|que |qu'|quoi|qui |quand|combien|o[uù] |peux|puis|dois|je peux|je dois|j'ai|on m'a|il m'a|elle m'a|mon |ma |mes |c'est quoi|c'est normal|tu |toi|aide|explique|dis[- ]moi|si |et si|comment savoir|qu'est)/i
// ce qui ressemble à un message reçu (numéro, montant, lien, long texte) est d'abord vérifié
const RESSEMBLE_SMS = /\d[\d\s.]{6,}\d|\d+\s?(f|fcfa|francs?)\b|https?:|www\.|\.(top|xyz|site|online|click|link|info|com|bj)\b|f[ée]licitations|vous avez (re[çc]u|gagn)/i
function estQuestion(fr) {
    const t = fr.trim()
    if (!(t.endsWith("?") || DEBUT_QUESTION.test(t))) return false
    return t.length <= 220 && !RESSEMBLE_SMS.test(t)
}
async function converser(fr) {
    const corps = msgKora()
    const tape = reflechir(corps)
    piloter({ emotion: "surpris", bulle: "Je réfléchis…" })
    etat("Réfléchit…")
    const patience = setTimeout(() => dire(corps, "Je réfléchis… La première fois, ça peut prendre jusqu'à une minute.", { classe: "doux", traduire: false }), 7000)
    let reponse = ""
    let panne = ""
    try {
        reponse = await demanderAssistant(fr)
        if (modeFon() && reponse) await enFonSiPossible([reponse])
    } catch (e) {
        reponse = ""
        panne = panneService(e)
    }
    clearTimeout(patience)
    corps.querySelectorAll(".texte.doux").forEach((n) => n.remove())
    tape.remove()
    etat(dernier ? ETATS[dernier.r.niveau] : "Prêt à vérifier", dernier ? dernier.r.niveau : "pret")
    if (!reponse) {
        dire(corps, `Je ne peux pas répondre à ta question : ${panne || "le service en ligne de KORA ne répond pas"}. Réessaie plus tard. La vérification des messages, elle, marche toujours : elle se fait dans ton téléphone.`, { traduire: false })
        piloter({ emotion: "triste", bulle: "" })
        return
    }
    historique.push({ role: "user", content: fr }, { role: "assistant", content: reponse })
    dire(corps, reponse)
    piloter({ emotion: "content", bulle: "" })
    if (attente) return redemander(true)
    if (dernier) suite(corps)
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
const LETTRES_FON = /[ɛɔɖƐƆƉε]/ // ε (epsilon grec) : beaucoup de claviers de téléphone l'utilisent pour écrire ɛ
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
    $("clavier-fon").hidden = !modeFon()
}

/* ================= le clavier fon : lettres et tons absents de la plupart des claviers ================= */
// Les tons sont des accents « combinants » : ils se posent sur la lettre juste avant le curseur (ɛ + ǎ → ɛ̌).
$("clavier-fon").addEventListener("pointerdown", (e) => { if (e.target.closest("button")) e.preventDefault() }) // garde le clavier ouvert
$("clavier-fon").addEventListener("click", (e) => {
    const b = e.target.closest("button")
    if (!b) return
    const ajout = b.dataset.car || b.dataset.ton
    const debut = saisie.selectionStart ?? saisie.value.length
    const fin = saisie.selectionEnd ?? debut
    if (b.dataset.ton && debut === 0) return // pas de lettre où poser le ton
    saisie.setRangeText(ajout, debut, fin, "end")
    saisie.focus()
    saisie.dispatchEvent(new Event("input", { bubbles: true })) // active le bouton Envoyer, ajuste la hauteur
})
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
/* ================= l'état de KORA et ce qu'il est en train de faire ================= */
const ETATS = { arnaque: "Arnaque repérée", suspect: "Message suspect", sur: "Message normal" }
function etat(texte, ton = "travail") {
    $("etat").dataset.ton = ton
    $("etat-txt").textContent = texte
}
// Montre les étapes une à une, puis les replie en une ligne qu'on peut rouvrir.
function travail(corps, etapes) {
    const ol = el("ol", "travail")
    ol.setAttribute("aria-label", "Ce que fait KORA")
    const lis = etapes.map((t) => { const li = el("li"); li.textContent = t; ol.append(li); return li })
    corps.append(ol)
    defiler()
    let i = -1
    const debut = performance.now()
    const avancer = () => {
        if (i >= 0 && lis[i]) { lis[i].classList.remove("encours"); lis[i].classList.add("fait") }
        i += 1
        if (lis[i]) { lis[i].classList.add("encours"); etat(`${lis[i].textContent}…`) }
    }
    avancer()
    return {
        avancer,
        async jusquauBout(ms = 220) { while (i < lis.length - 1) { await pause(ms); avancer() } },
        finir() {
            while (i < lis.length) avancer()
            const duree = ((performance.now() - debut) / 1000).toFixed(1).replace(".", ",")
            const d = el("details", "resume-travail")
            d.innerHTML = `<summary>Vérifié en ${duree} s · ${lis.length} étapes</summary>`
            d.append(ol)
            corps.prepend(d)
        },
        retirer() { ol.remove() },
    }
}

/* ================= historique (reste sur le téléphone) ================= */
const CLE_HISTO = "kora-historique"
function lireHisto() { try { return JSON.parse(memoire(CLE_HISTO) || "[]") } catch (_) { return [] } }
function noterHisto(texte, r) {
    if (!reglages.histo) return
    const liste = lireHisto()
    liste.unshift({ t: Date.now(), niveau: r.niveau, pct: Math.round(r.risque * 100), extrait: texte.slice(0, 600) })
    memoire(CLE_HISTO, JSON.stringify(liste.slice(0, 30)))
}
function afficherHisto() {
    const ol = $("histo")
    ol.innerHTML = ""
    const liste = lireHisto()
    if (!liste.length) { ol.innerHTML = `<li class="histo-vide">Pas encore de vérification. Envoie un message à KORA.</li>`; return }
    const quand = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    for (const h of liste) {
        const li = el("li")
        li.innerHTML = `<span class="statut" style="--c:${COULEURS[h.niveau]}">${STATUTS[h.niveau]} · ${h.pct} %</span><q>${echapper(h.extrait)}</q><time>${quand.format(h.t)}</time>`
        ol.append(li)
    }
}
$("fermer-histo").addEventListener("click", () => fermerFeuille($("voile-histo")))
$("vider-histo").addEventListener("click", () => { memoire(CLE_HISTO, "[]"); afficherHisto(); majReprendre(); toast("Historique effacé") })

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
      <p class="conseil"><b>Que faire :</b> ${echapper(r.conseil)}</p>
      ${r.raisons.length ? `<h3>Pourquoi</h3><ul>${r.raisons.map((x) => `<li>${echapper(x)}</li>`).join("")}</ul>` : ""}
      ${r.indices.length ? `<h3>Qui l'envoie</h3><ul class="indices">${r.indices.map((x) => `<li><span aria-hidden="true">${x.sens === "danger" ? "⚠️" : "✅"}</span><span>${echapper(x.texte)}</span></li>`).join("")}</ul>` : ""}
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
    } catch (e) {
        zone.innerHTML = `<b>Fɔngbe</b>Pas de traduction en fon : ${echapper(panneService(e))}. Réessaie plus tard.`
        if (bouton) bouton.disabled = false
    }
}

/* ================= analyse d'un nouveau message ================= */
async function analyserMessage(texte, { deja = false, original = null } = {}) {
    attente = null
    retirerPuces()
    if (!deja) msgMoi(texte)
    const corps = msgKora()
    const etapes = ["Je lis le message", "Je cherche les signes d'arnaque", "Je prépare ma réponse"]
    if (modeFon()) etapes.push("Je traduis en fon")
    const suivi = travail(corps, etapes)
    piloter({ emotion: "surpris", bulle: "Je regarde…" })

    const ctx = { expediteur: "", canal: "", repondre: "", premier: "" }
    const r = kora.analyserComplet(texte, ctx)
    dernier = { texte, original, ctx, r, niveau1: r.niveau }
    noterHisto(original || texte, r)
    majReprendre()
    const question = r.niveau === "sur" ? PH.qExpediteurSur : PH.qExpediteur
    await suivi.jusquauBout(modeFon() ? 160 : 230)
    // en mode fon, on traduit tout le tour d'un seul coup avant de répondre
    if (modeFon()) await enFonSiPossible([...phrasesCarte(r), question, ...PUCES_EXPEDITEUR.map(([l]) => l)])
    else await pause(200)
    suivi.finir()

    carteVerdict(corps, r)
    etat(ETATS[r.niveau], r.niveau)
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
    if (modeFon() && phrases.length) await enFonSiPossible(phrases)
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
async function redemander(silencieux = false) {
    const listes = {
        expediteur: [PUCES_EXPEDITEUR, (v, affiche, fr) => { msgMoi(affiche); choisirExpediteur(v, fr) }],
        repondre: [PUCES_REPONDRE, (v, affiche) => { msgMoi(affiche); finirQuestion("repondre", v) }],
        premier: [PUCES_PREMIER, (v, affiche) => { msgMoi(affiche); finirQuestion("premier", v) }],
    }
    const [liste, choisir] = listes[attente.type] || listes.expediteur
    if (silencieux) { puces(fil.lastElementChild.querySelector(".corps") || msgKora(), liste, choisir); return }
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
    etat(ETATS[r.niveau], r.niveau)
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
    // en mode fon, seul un message écrit EN FON passe par la traduction : un message en français
    // est analysé directement dans le téléphone, même si le service en ligne est en panne
    if (modeFon() && estFon(texte)) {
        const bulleMoi = msgMoi(texte, { petit: "Fɔngbe" })
        affiche = true
        const corps = msgKora()
        const tape = reflechir(corps)
        piloter({ emotion: "surpris", bulle: "Je traduis le fon…" })
        etat("Traduit le fon…")
        try {
            fr = await traduire(texte, "fon→français")
        } catch (e) {
            tape.remove()
            dire(corps, `Je n'arrive pas à traduire ce message en fon : ${panneService(e)}. Écris-le en français (ou colle le SMS tel quel), je le vérifie tout de suite dans ton téléphone.`, { traduire: false })
            if (annonceFon) { langue = "fr"; majLangue() } // on n'a pas pu passer en fon : on reste en français
            etat("Prêt à vérifier", "pret")
            piloter({ emotion: "triste", bulle: "" })
            return
        }
        tape.remove()
        if (annonceFon) dire(corps, PH.fonActif, { traduire: false })
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
        // une vraie question passe avant tout : « … sur WhatsApp, il peut encore me nuire ? » n'est pas une réponse
        if (SPACE_FON && fr.length > 20 && estQuestion(fr)) { moi(); return converser(fr) }
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
        const libre = SPACE_FON && fr.length > 25 && (intention === "pourquoi" || intention === "faire")
        if (intention && !libre) { attente = null; moi(); return repondreIntention(intention) }
    }
    // 3. salutation
    if (fr.length < 25 && /^(bonjour|bonsoir|salut|hello|coucou|bjr|bsr|slt|yo)\b/.test(t)) {
        moi()
        const corps = await nouveauTour([PH.salut])
        dire(corps, PH.salut)
        piloter({ emotion: "joyeux", bulle: "Bonjour !" })
        return
    }
    // 4. une question posée à KORA : l'assistant répond librement
    if (SPACE_FON && estQuestion(fr)) { moi(); return converser(fr) }
    // 5. sinon, c'est un message reçu à vérifier
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

// idées : un point de départ au lieu d'une page blanche
const IC = {
    sms: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 9h8M8 13h5"/></svg>',
    capture: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="9" cy="9" r="1.8"/><path d="m21 15-4.5-4.5L6 21"/></svg>',
    urgence: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 2 20h20Z"/><path d="M12 10v4M12 17v.5"/></svg>',
    question: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><path d="M9.5 9.2a2.6 2.6 0 0 1 5 .9c0 1.8-2.5 2.3-2.5 4M12 17.2v.3"/></svg>',
}
const IDEES = [
    ["sms", "Vérifier un message", "Colle le SMS ou le message WhatsApp", () => { saisie.focus() }],
    ["capture", "Envoyer une capture", "KORA lit le texte de l'image", () => $("fichier").click()],
    ["urgence", "J'ai déjà payé", "Les gestes à faire tout de suite", () => urgenceDirecte()],
    ["question", "Reconnaître un faux agent", "Les signes qui ne trompent pas", () => envoyer("Comment reconnaître un faux agent Mobile Money ?")],
]
for (const [ic, titre, sous, action] of IDEES) {
    const b = el("button")
    b.type = "button"
    b.innerHTML = `<span class="ic">${IC[ic]}</span><b>${echapper(titre)}</b><small>${echapper(sous)}</small>`
    b.addEventListener("click", async () => { await pret; if (kora) action() })
    $("idees").append(b)
}
async function urgenceDirecte() {
    retirerPuces()
    attente = null
    msgMoi("J'ai déjà payé ou donné mon code")
    const corps = await nouveauTour([PH.urgence, ...ETAPES_URGENCE])
    piloter({ emotion: "triste", bulle: "On agit vite." })
    etat("Urgence : on agit vite", "arnaque")
    dire(corps, PH.urgence)
    const ol = el("ol", "etapes")
    for (const e of ETAPES_URGENCE) { const li = el("li"); bilingue(li, e); ol.append(li) }
    corps.append(ol)
    defiler()
}

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
    historique = []
    for (const n of [...fil.children]) if (n.id !== "accueil") n.remove()
    $("accueil").hidden = false
    app.classList.remove("actif")
    app.classList.add("vide")
    piloter({ emotion: "content", bulle: "Montre-moi le message !" })
    etat("Prêt à vérifier", "pret")
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
    const ligne = dire(corps, "Je lis la capture…", { classe: "doux", traduire: false })
    const tape = reflechir(corps)
    piloter({ emotion: "surpris", bulle: "Je lis la capture…" })
    etat("Lit la capture…")
    try {
        if (!ocr) {
            ligne.textContent = "Je prépare le lecteur de texte (la première fois, quelques secondes)…"
            const module = await import(TESSERACT)
            const { createWorker } = module.default || module // tesseract.js v6 n'exporte que « default »
            ocr = await createWorker("fra", 1, {
                workerPath: DOSSIER_TESSERACT + "worker.min.js",
                corePath: DOSSIER_TESSERACT,           // le moteur LSTM, avec ou sans SIMD selon le téléphone
                langPath: DOSSIER_TESSERACT + "lang",  // fra.traineddata (4.0.0_best_int)
                gzip: false, // fichier non compressé : Android décompresse et renomme les .gz dans l'APK
                workerBlobURL: false,
                logger: (m) => { if (m.status === "recognizing text") ligne.textContent = `Je lis la capture… ${Math.round(m.progress * 100)} %` },
            })
        }
        const { data } = await ocr.recognize(fichier)
        const texte = data.text.replace(/\n{2,}/g, "\n").trim()
        tape.remove()
        if (texte.length < 8) {
            ligne.textContent = "Je ne trouve pas de texte lisible sur cette image. Essaie une capture plus nette (zoome sur le message), ou copie le message ici."
            piloter({ emotion: "triste", bulle: "" })
            etat("Prêt à vérifier", "pret")
            return
        }
        ligne.textContent = `J'ai lu : « ${texte.length > 240 ? `${texte.slice(0, 240)}…` : texte} »`
        analyserMessage(texte, { deja: true })
    } catch (e) {
        console.error("Lecture de la capture :", e)
        ocr = null // on repartira de zéro au prochain essai
        tape.remove()
        ligne.textContent = "La lecture de l'image a échoué. Réessaie, ou copie le message ici."
        const detail = el("small", "detail-erreur")
        detail.textContent = `Détail technique : ${String(e?.message || e).slice(0, 160)}`
        ligne.after(detail)
        piloter({ emotion: "triste", bulle: "" })
            etat("Prêt à vérifier", "pret")
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

/* ================= la bulle KORA sur les autres applis (appli Android) ================= */
async function activerBulle() {
    const corps = await nouveauTour()
    if ((await etatBulle()).active) {
        dire(corps, "La bulle est déjà active. Va dans ta messagerie, ouvre le message qui te paraît louche et touche la bulle : je vérifie ce qui est à l'écran.", { traduire: false })
        return true
    }
    dire(corps, "Je vais te demander deux autorisations : m'afficher par-dessus les autres applis, puis voir ton écran (choisis « Tout l'écran »). Je ne regarde l'écran que quand tu touches la bulle, et la capture reste dans ton téléphone.", { traduire: false })
    const r = await demarrerBulle()
    const MOTS = {
        ok: "La bulle est prête ! Va dans ta messagerie, ouvre le message qui te paraît louche, puis touche la bulle KORA : je lis l'écran et je te dis si c'est une arnaque. Pour la fermer, glisse-la sur la croix en bas de l'écran.",
        SUPERPOSITION: "Sans l'autorisation « Afficher par-dessus les autres applis », la bulle ne peut pas s'afficher. Tu peux réessayer quand tu veux depuis le menu de la mascotte.",
        CAPTURE: "Sans l'autorisation de voir l'écran, la bulle ne peut pas lire tes messages. Tu peux réessayer quand tu veux depuis le menu de la mascotte.",
    }
    dire(corps, MOTS[r] || "La bulle n'a pas pu démarrer. Réessaie dans un instant.", { traduire: false })
    piloter({ emotion: r === "ok" ? "joyeux" : "triste" })
    return r === "ok"
}

/* ================= partager depuis une autre appli (Android, appli installée) ================= */
async function expliquerPartage() {
    const corps = await nouveauTour()
    if (estAppli) {
        dire(corps, "Depuis n'importe quelle appli : fais une capture d'écran du message, ou sélectionne son texte, appuie sur « Partager », puis choisis KORA-lite. Encore plus simple : active la bulle KORA (menu de la mascotte), elle flotte sur tes autres applis et vérifie l'écran quand tu la touches.", { traduire: false })
        piloter({ emotion: "joyeux", bulle: "Partage-moi tes messages !" })
        return
    }
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

/* ================= menu, feuilles et paramètres (structure reprise de Dan) ================= */
const CLE_REGLAGES = "kora-reglages"
const REGLAGES_DEFAUT = { grand: false, calme: false, histo: true }
const reglages = (() => { try { return { ...REGLAGES_DEFAUT, ...JSON.parse(memoire(CLE_REGLAGES) || "{}") } } catch (_) { return { ...REGLAGES_DEFAUT } } })()
function sauverReglages() { memoire(CLE_REGLAGES, JSON.stringify(reglages)) }
function appliquerReglages() {
    document.body.classList.toggle("grand", reglages.grand)
    document.body.classList.toggle("calme", reglages.calme)
    majReprendre()
}
let finToast = 0
function toast(texte) {
    const t = $("toast")
    t.textContent = texte
    t.hidden = false
    clearTimeout(finToast)
    finToast = setTimeout(() => { t.hidden = true }, 2600)
}

// le menu
function ouvrirTiroir() {
    $("tiroir").hidden = false
    $("voile-tiroir").hidden = false
    $("menu-btn").setAttribute("aria-expanded", "true")
    fermerMenu()
    $("fermer-tiroir").focus()
}
function fermerTiroir() {
    $("tiroir").hidden = true
    $("voile-tiroir").hidden = true
    $("menu-btn").setAttribute("aria-expanded", "false")
}
$("menu-btn").addEventListener("click", ouvrirTiroir)
$("fermer-tiroir").addEventListener("click", () => { fermerTiroir(); $("menu-btn").focus() })
$("voile-tiroir").addEventListener("click", fermerTiroir)

// les feuilles (historique, arnaques, paramètres, à propos)
function ouvrirFeuille(voile) { voile.hidden = false; voile.querySelector("[data-fermer], .icone-btn")?.focus() }
function fermerFeuille(voile) { voile.hidden = true }
for (const voile of document.querySelectorAll(".voile")) {
    voile.addEventListener("click", (e) => { if (e.target === voile) fermerFeuille(voile) })
    voile.querySelector("[data-fermer]")?.addEventListener("click", () => { fermerFeuille(voile); $("menu-btn").focus() })
}
document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return
    document.querySelectorAll(".voile:not([hidden])").forEach(fermerFeuille)
    if (!$("tiroir").hidden) fermerTiroir()
})

const ALLER = {
    accueil: () => { fil.scrollTo({ top: 0, behavior: calme() ? "auto" : "smooth" }); majNav("accueil") },
    nouveau: () => { $("nouveau").click(); saisie.focus() },
    discussion: () => saisie.focus(),
    historique: () => { afficherHisto(); ouvrirFeuille($("voile-histo")) },
    arnaques: () => ouvrirFeuille($("voile-arnaques")),
    reglages: () => { remplirReglages(); ouvrirFeuille($("voile-reglages")) },
    apropos: () => ouvrirApropos(),
}
function majNav(cle) {
    document.querySelectorAll("#nav-bas button").forEach((b) => b.toggleAttribute("aria-current", b.dataset.nav === cle))
    document.querySelectorAll("#nav-bas button[aria-current]").forEach((b) => b.setAttribute("aria-current", "page"))
}
// la mascotte s'efface quand on fait défiler l'accueil (elle est posée sur la carte d'accroche)
fil.addEventListener("scroll", () => document.body.classList.toggle("fil-defile", fil.scrollTop > 40), { passive: true })
$("hero-capture").addEventListener("click", () => $("fichier").click())
document.querySelectorAll("[data-nav]").forEach((b) => b.addEventListener("click", () => { fermerTiroir(); ALLER[b.dataset.nav]() }))

// les arnaques courantes
const CATALOGUE = [
    ["Le faux agent", "Il se dit agent MTN ou Moov et te demande un code reçu par SMS.", 0],
    ["L'argent « envoyé par erreur »", "On te demande de renvoyer une somme qui n'est jamais arrivée.", 1],
    ["Le prêt rapide", "Un crédit sans garantie… à condition de payer des frais d'abord.", 2],
    ["Le faux gain", "Tu aurais gagné à un tirage : il faut payer pour retirer.", 3],
    ["Le compte « bloqué »", "Un lien pour « réactiver » ton compte, qui vole tes accès.", 4],
    ["Le faux SMS de dépôt", "Un message imite un vrai dépôt, mais vient d'un numéro ordinaire.", 5],
]
for (const [titre, desc, i] of CATALOGUE) {
    const b = el("button")
    b.type = "button"
    b.innerHTML = `<b>${echapper(titre)}</b><span>${echapper(desc)}</span><em>Voir KORA l'analyser</em>`
    b.addEventListener("click", async () => { fermerFeuille($("voile-arnaques")); await pret; if (kora) analyserMessage(EXEMPLES[i][1]) })
    $("catalogue").append(b)
}

// paramètres
function remplirReglages() {
    document.querySelector(`input[name="r-langue"][value="${modeFon() ? "fon" : "fr"}"]`).checked = true
    $("r-grand").checked = reglages.grand
    $("r-calme").checked = reglages.calme
    $("r-histo").checked = reglages.histo
    if (estAppli) etatBulle().then((e) => { $("r-bulle").checked = e.active })
    $("r-effacer").textContent = "Effacer mes données"
    delete $("r-effacer").dataset.confirmer
}
document.querySelectorAll('input[name="r-langue"]').forEach((r) => r.addEventListener("change", () => {
    if (r.value === "fon" && !modeFon()) { activerFon(); toast("KORA te répond en fon") }
    if (r.value === "fr" && modeFon()) { langue = "fr"; majLangue(); toast("KORA te répond en français") }
}))
$("r-grand").addEventListener("change", (e) => { reglages.grand = e.target.checked; sauverReglages(); appliquerReglages(); toast(reglages.grand ? "Texte agrandi" : "Taille normale") })
$("r-calme").addEventListener("change", (e) => { reglages.calme = e.target.checked; sauverReglages(); appliquerReglages(); toast(reglages.calme ? "Animations réduites" : "Animations activées") })
$("r-histo").addEventListener("change", (e) => {
    reglages.histo = e.target.checked
    if (!reglages.histo) memoire(CLE_HISTO, "[]")
    sauverReglages(); appliquerReglages()
    toast(reglages.histo ? "Historique activé" : "Historique désactivé et effacé")
})
$("r-bulle").addEventListener("change", async (e) => {
    if (!e.target.checked) { await arreterBulle(); toast("Bulle arrêtée"); return }
    fermerFeuille($("voile-reglages"))
    e.target.checked = await activerBulle()
})
$("r-revoir").addEventListener("click", () => { fermerFeuille($("voile-reglages")); revoirOnboarding() })
$("r-effacer").addEventListener("click", (e) => {
    const b = e.currentTarget
    if (!b.dataset.confirmer) { b.dataset.confirmer = "1"; b.textContent = "Toucher encore pour confirmer"; return }
    memoire(CLE_HISTO, "[]")
    Object.assign(reglages, REGLAGES_DEFAUT)
    sauverReglages(); appliquerReglages(); remplirReglages()
    toast("Tes données sont effacées")
})

// accueil : reprendre là où tu en étais
function majReprendre() {
    const liste = reglages.histo ? lireHisto().slice(0, 2) : []
    $("reprendre").hidden = !liste.length
    const ol = $("reprendre-liste")
    ol.innerHTML = ""
    for (const h of liste) {
        const li = el("li")
        li.tabIndex = 0
        li.setAttribute("role", "button")
        li.innerHTML = `<span class="statut" style="--c:${COULEURS[h.niveau]}">${STATUTS[h.niveau]} · ${h.pct} %</span><q>${echapper(h.extrait)}</q>`
        const relancer = async () => { await pret; if (kora) analyserMessage(h.extrait) }
        li.addEventListener("click", relancer)
        li.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); relancer() } })
        ol.append(li)
    }
}
// le conseil du jour
const CONSEILS = [
    ["Aucun agent ne te demandera ton code.", "Ni MTN, ni Moov, ni Celtiis. Un code secret ne se donne jamais, même à quelqu'un qui connaît ton nom."],
    ["Vérifie ton solde, pas le SMS.", "Un faux SMS de dépôt peut imiter un vrai. Compose le code USSD de ton opérateur pour voir ton vrai solde."],
    ["Un vrai prêt ne demande pas de frais d'avance.", "Payer pour recevoir un crédit, c'est le signe d'une arnaque."],
    ["Les opérateurs écrivent sous leur nom.", "Un message officiel vient de « MobileMoney » ou « MoovMoney », pas d'un numéro ordinaire en 01."],
    ["L'urgence est un piège.", "« Vite », « tout de suite », « dernier délai » : l'escroc veut t'empêcher de réfléchir. Prends le temps de vérifier."],
    ["Un lien pour débloquer ton compte ? N'y va pas.", "Ton opérateur ne t'enverra jamais vers un site en .top ou .xyz pour réactiver ton compte."],
    ["Tu t'es fait avoir ? Agis vite.", "Appelle le service client officiel de ton opérateur pour bloquer la transaction, puis change ton code."],
]
{
    const jour = Math.floor(Date.now() / 86400000)
    const [titre, texte] = CONSEILS[jour % CONSEILS.length]
    $("conseil-jour").innerHTML = `<span class="ampoule" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2V17h6v-.3c0-.8.4-1.5 1-2A7 7 0 0 0 12 2Z"/></svg></span><b>${echapper(titre)}</b><p>${echapper(texte)}</p><small>Le conseil de KORA</small>`
}
appliquerReglages()

/* ================= à propos ================= */
function ouvrirApropos() { $("voile").hidden = false; $("fermer").focus() }
function fermerApropos() { $("voile").hidden = true }
$("fermer").addEventListener("click", () => { fermerApropos(); $("menu-btn").focus() })
$("voile").addEventListener("click", (e) => { if (e.target === $("voile")) fermerApropos() })
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("voile").hidden) fermerApropos() })
$("revoir").addEventListener("click", revoirOnboarding)

/* ================= application installable et hors ligne ================= */
if ("serviceWorker" in navigator && !estAppli) navigator.serviceWorker.register("sw.js").catch(() => {})
let invitation = null
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); invitation = e; $("installer").hidden = false })
$("installer").addEventListener("click", async () => {
    if (!invitation) return
    invitation.prompt()
    await invitation.userChoice
    invitation = null
    $("installer").hidden = true
})
