import { Kora } from "./kora-engine.js"
import { SPACE_FON } from "./config.js"

const $ = (id) => document.getElementById(id)
const app = $("app")
const fil = $("fil")
const saisie = $("saisie")
const mascotte = $("mascotte")

let kora = null
let fonHumain = { titres: {}, conseils: {} }
let langue = "fr"
let attente = null // question en cours : { type: "expediteur" | "nom" | "repondre" | "premier" }
let dernier = null // dernier message analysé : { texte, original, ctx, r, niveau1, enFon }

const STATUTS = { arnaque: "Arnaque probable", suspect: "Message suspect", sur: "Pas de signe d'arnaque" }
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
}
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
fetch("fon.json").then((r) => r.json()).then((j) => (fonHumain = j)).catch(() => {})

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
    if (memoire("kora-onb")) entrerDiscussion()
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
    // balayage horizontal
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
function dire(corps, texte, classe = "") {
    const p = el("p", `texte ${classe}`.trim())
    p.textContent = texte
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
function puces(corps, liste, choisir) {
    retirerPuces()
    const zone = el("div", "puces")
    zone.id = "puces-actives"
    for (const [label, valeur] of liste) {
        const b = el("button")
        b.type = "button"
        b.textContent = label
        b.addEventListener("click", () => { retirerPuces(); choisir(valeur, label) })
        zone.append(b)
    }
    corps.append(zone)
    defiler()
}
function retirerPuces() {
    const z = $("puces-actives")
    if (z) { z.classList.add("fini"); z.removeAttribute("id") }
}

/* ================= service fon (traduction) ================= */
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
    return r.data[0]
}

/* ================= carte de verdict ================= */
function carteVerdict(corps, r, { enFon = false, maj = false } = {}) {
    const pct = Math.round(r.risque * 100)
    const pctTexte = Math.round(r.risqueTexte * 100)
    const art = el("article", "verdict")
    art.style.setProperty("--c", COULEURS[r.niveau])
    const probas = kora.cat.map((c) =>
        `<div class="proba"><span>${echapper(kora.m.regles.noms[c])}</span><i><b style="width:${(r.probas[c] * 100).toFixed(1)}%"></b></i><span>${Math.round(r.probas[c] * 100)} %</span></div>`).join("")
    art.innerHTML = `
      <span class="statut">${STATUTS[r.niveau]} · ${pct} %</span>
      <h2>${r.niveau === "sur" ? "Ça ressemble à un message normal" : echapper(r.type)}</h2>
      <div class="jauge" role="img" aria-label="Risque estimé : ${pct} %"><span></span><span></span><span></span><div class="curseur"></div></div>
      <div class="jauge-legende"><span>Normal</span><span>Arnaque</span></div>
      ${maj && pct !== pctTexte ? `<p class="deux-risques">Le texte seul : ${pctTexte} %. Avec ce que tu m'as dit de l'expéditeur : ${pct} %.</p>` : ""}
      ${r.raisons.length ? `<h3>Pourquoi</h3><ul>${r.raisons.map((x) => `<li>${echapper(x)}</li>`).join("")}</ul>` : ""}
      ${r.indices.length ? `<h3>Qui l'envoie</h3><ul class="indices">${r.indices.map((x) => `<li><span aria-hidden="true">${x.sens === "danger" ? "⚠️" : "✅"}</span><span>${echapper(x.texte)}</span></li>`).join("")}</ul>` : ""}
      <p class="conseil"><b>Que faire :</b> ${echapper(r.conseil)}</p>
      <div class="fon-bloc" hidden></div>
      <div class="actions">
        ${SPACE_FON ? `<button type="button" data-a="fon">Voir en fon</button>` : ""}
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
    if (enFon) afficherFon(r, art.querySelector(".fon-bloc"), boutonFon)
    defiler()
    return art
}

async function afficherFon(r, zone, bouton) {
    if (zone.dataset.fait) { zone.hidden = false; return }
    zone.hidden = false
    zone.innerHTML = `<b>Fɔngbe</b>Traduction en fon… (la première fois, jusqu'à une minute)`
    if (bouton) bouton.disabled = true
    try {
        const titre = fonHumain.titres?.[r.niveau]
        const conseil = fonHumain.conseils?.[r.categorie]
        const fon = titre && conseil
            ? `${titre}. ${conseil}`
            : await traduire([STATUTS[r.niveau], ...(r.raisons || []), `Que faire : ${r.conseil}`].join(" "), "français→fon")
        zone.innerHTML = `<b>Fɔngbe</b>${echapper(fon)}`
        zone.dataset.fait = "1"
        defiler()
    } catch (_) {
        zone.innerHTML = `<b>Fɔngbe</b>Le service fon ne répond pas pour le moment. Réessaie dans une minute.`
        if (bouton) bouton.disabled = false
    }
}

/* ================= analyse d'un nouveau message ================= */
const QUESTION_EXPEDITEUR = [
    ["Un nom (MTN, MobileMoney…)", "nom"],
    ["Un numéro de téléphone", "numero"],
    ["Sur WhatsApp", "whatsapp"],
    ["Un proche", "proche"],
    ["Je ne sais pas", "nsp"],
]

async function analyserMessage(texte, { deja = false, francais = false } = {}) {
    attente = null
    retirerPuces()
    const enFonSaisi = langue === "fon" && !francais
    if (!deja) msgMoi(texte, { petit: enFonSaisi ? "Fɔngbe" : "" })
    const corps = msgKora()
    const tape = reflechir(corps)
    piloter({ emotion: "surpris", bulle: "Je regarde…" })

    let fr = texte
    let original = null
    if (enFonSaisi) {
        try { fr = await traduire(texte, "fon→français"); original = texte }
        catch (_) {
            tape.remove()
            dire(corps, "Le service fon ne répond pas pour le moment (il se réveille parfois en une minute). Réessaie, ou écris le message en français.")
            piloter({ emotion: "triste", bulle: "" })
            return
        }
    }
    await pause(650)
    tape.remove()

    const ctx = { expediteur: "", canal: "", repondre: "", premier: "" }
    const r = kora.analyserComplet(fr, ctx)
    dernier = { texte: fr, original, ctx, r, niveau1: r.niveau }
    if (original) dire(corps, `J'ai compris : « ${fr} »`, "traduit")
    carteVerdict(corps, r, { enFon: Boolean(original) })
    piloter({ emotion: r.emotion, bulle: BULLES[r.niveau], gratter: r.niveau === "sur" })

    await pause(450)
    dire(corps, r.niveau === "sur"
        ? "Pour en être sûr : qui t'a envoyé ce message ?"
        : "Pour savoir si c'est le vrai opérateur ou quelqu'un qui prend son nom : qui t'a envoyé ce message ?")
    attente = { type: "expediteur" }
    puces(corps, QUESTION_EXPEDITEUR, (v, label) => { msgMoi(label); choisirExpediteur(v, label) })
}

/* ================= questions sur l'expéditeur ================= */
const OPERATEUR = /mobile ?money|momo|mtn|moov|celtiis|wave|flooz|banque|ecobank|orabank|\bboa\b|\buba\b|nsia|coris/

function deviner(t) {
    if (/sais pas|aucune id[ée]e|je ne sais/.test(t)) return "nsp"
    if (/proche|\bami\b|amie|famille|fr[eè]re|s[oœ]eur|maman|papa|cousin|tante|oncle|coll[eè]gue|mon mari|ma femme|je (le|la) connais/.test(t)) return "proche"
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
    if (/\b(oui|ouais|yes|bien s[uû]r|exact)\b/.test(t)) return "oui"
    return null
}

async function choisirExpediteur(choix, texte) {
    const ctx = dernier.ctx
    const corps = msgKora()
    const tape = reflechir(corps)
    await pause(400)
    tape.remove()
    if (choix === "nsp") {
        attente = null
        dire(corps, "D'accord. Dans le doute, garde ce réflexe : ne donne jamais ton code secret, et vérifie auprès du service client officiel avant d'envoyer de l'argent.")
        return suite(corps)
    }
    if (choix === "proche") { ctx.premier = "non"; return reAnalyser(corps) }
    if (choix === "appel") { ctx.canal = "appel"; ctx.repondre = "oui"; return reAnalyser(corps) }
    if (choix === "numero") {
        const tape2 = (texte.match(/\+?\d[\d\s.-]{6,}\d/) || [])[0]
        ctx.expediteur = tape2 ? tape2.trim() : "+229 01 00 00 00 00"
        ctx.canal = ctx.canal || "sms"
        return reAnalyser(corps)
    }
    if (choix === "whatsapp") {
        ctx.canal = "whatsapp"
        ctx.repondre = "oui"
        attente = { type: "premier" }
        dire(corps, "C'est la première fois que cette personne t'écrit ?")
        return puces(corps, [["Oui, la première fois", "oui"], ["Non, je la connais", "non"], ["Je ne sais pas", ""]], (v, l) => { msgMoi(l); finirQuestion("premier", v) })
    }
    if (choix === "nom") {
        const nom = /^(un nom|nom)\b/i.test(texte.trim()) ? "" : texte.trim()
        if (nom) return demanderReponse(corps, nom)
        attente = { type: "nom" }
        dire(corps, "Quel nom s'affiche comme expéditeur ?")
        return puces(corps, [["MobileMoney", "MobileMoney"], ["MTN MoMo", "MTN MoMo"], ["Moov Money", "Moov Money"], ["Celtiis Cash", "Celtiis Cash"]], (v) => { msgMoi(v); choisirNom(v) })
    }
}
async function choisirNom(nom) {
    const corps = msgKora()
    const tape = reflechir(corps)
    await pause(350)
    tape.remove()
    demanderReponse(corps, nom)
}
function demanderReponse(corps, nom) {
    dernier.ctx.expediteur = nom
    dernier.ctx.canal = dernier.ctx.canal || "sms"
    attente = { type: "repondre" }
    dire(corps, "Peux-tu répondre à ce message ? Les vrais SMS automatiques des opérateurs ne permettent pas de répondre.")
    puces(corps, [["Oui, je peux répondre", "oui"], ["Non", "non"], ["Je ne sais pas", ""]], (v, l) => { msgMoi(l); finirQuestion("repondre", v) })
}
async function finirQuestion(champ, valeur) {
    dernier.ctx[champ] = valeur
    const corps = msgKora()
    reflechir(corps)
    reAnalyser(corps)
}
async function reAnalyser(corps) {
    attente = null
    const tape = corps.querySelector(".tape") || reflechir(corps)
    await pause(500)
    tape.remove()
    const r = kora.analyserComplet(dernier.texte, dernier.ctx)
    const change = r.niveau !== dernier.niveau1
    dernier.r = r
    dire(corps, change ? "Avec ce que tu m'as dit, mon avis change :" : "Avec ce que tu m'as dit, je confirme :")
    carteVerdict(corps, r, { maj: true })
    piloter({ emotion: r.emotion, bulle: BULLES[r.niveau], gratter: r.niveau === "sur" })
    await pause(300)
    suite(corps)
}

/* ================= questions de suivi ================= */
function suite(corps) {
    const liste = [["J'ai déjà payé ou donné le code", "urgence"], ["Pourquoi ?", "pourquoi"], ["Que faire ?", "faire"]]
    if (SPACE_FON) liste.push(["En fon", "fon"])
    puces(corps, liste, (v, l) => { msgMoi(l); repondreIntention(v) })
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
    const corps = msgKora()
    const tape = reflechir(corps)
    await pause(450)
    tape.remove()
    if (type === "urgence") {
        piloter({ emotion: "triste", bulle: "On agit vite." })
        dire(corps, "Pas de panique, on agit vite :")
        const ol = el("ol", "etapes")
        for (const etape of [
            "Appelle tout de suite le service client officiel de ton opérateur (le numéro est sur son site ou sur ta puce) et demande de bloquer la transaction.",
            "Change ton code secret Mobile Money.",
            "Garde les captures et le numéro de l'escroc, puis porte plainte au commissariat ou auprès de la police chargée de la cybercriminalité.",
            "Préviens tes proches : l'escroc peut les contacter en utilisant ton nom.",
        ]) { const li = el("li"); li.textContent = etape; ol.append(li) }
        corps.append(ol)
        defiler()
    } else if (type === "pourquoi") {
        const tout = [...r.raisons, ...r.indices.map((x) => x.texte)]
        dire(corps, tout.length ? tout.join(" ") : "Je n'ai trouvé aucun signe d'arnaque : pas de demande de code, pas d'argent à renvoyer, pas de lien piégé. Reste prudent quand même.")
    } else if (type === "faire") {
        dire(corps, r.conseil)
    } else if (type === "fon") {
        const bloc = el("div", "fon-bloc")
        corps.append(bloc)
        await afficherFon(r, bloc)
    } else if (type === "merci") {
        piloter({ emotion: "joyeux", bulle: "Avec plaisir !", gratter: true })
        dire(corps, "Avec plaisir. Souviens-toi : ton code secret, c'est la clé de ta maison. Tu ne le donnes à personne. Envoie-moi un autre message quand tu veux.")
        return
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
    const t = texte.toLowerCase()

    // 1. réponse à une question de KORA
    if (attente && dernier) {
        if (attente.type === "expediteur") {
            const choix = deviner(t)
            if (choix) { msgMoi(texte); return choisirExpediteur(choix, texte) }
        } else if (attente.type === "nom" && texte.length <= 40) {
            msgMoi(texte); return choisirNom(texte)
        } else if (attente.type === "repondre" || attente.type === "premier") {
            const v = ouiNon(t)
            if (v !== null) { msgMoi(texte); return finirQuestion(attente.type, v) }
        }
    }
    // 2. question de suivi sur le dernier message
    if (dernier && texte.length < 70) {
        const intention = lireIntention(t)
        if (intention) { attente = null; msgMoi(texte); return repondreIntention(intention) }
    }
    // 3. salutation
    if (texte.length < 25 && /^(bonjour|bonsoir|salut|hello|coucou|bjr|bsr|slt|yo)\b/.test(t)) {
        msgMoi(texte)
        const corps = msgKora()
        const tape = reflechir(corps)
        await pause(450)
        tape.remove()
        dire(corps, "Bonjour ! Colle-moi le message qui te paraît louche (SMS, WhatsApp ou capture d'écran). Je te dis si c'est une arnaque.")
        piloter({ emotion: "joyeux", bulle: "Bonjour !" })
        return
    }
    // 4. nouveau message à vérifier
    analyserMessage(texte)
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

// langue du message
$("langue").addEventListener("click", () => {
    langue = langue === "fr" ? "fon" : "fr"
    const b = $("langue")
    $("langue-txt").textContent = langue === "fon" ? "FON" : "FR"
    b.setAttribute("aria-pressed", String(langue === "fon"))
    b.title = langue === "fon" ? "Écrire en français" : "Écrire en fon"
    saisie.placeholder = langue === "fon" ? "Message en fon…" : "Message reçu…"
    if (langue === "fon") {
        serviceFon().catch(() => {}) // réveille le service de traduction pendant que la personne écrit
        piloter({ emotion: "joyeux", bulle: "On parle fon !" })
    }
    saisie.focus()
})

// exemples
for (const [titre, texte] of EXEMPLES) {
    const b = el("button")
    b.type = "button"
    b.innerHTML = `<b>${echapper(titre)}</b><span>${echapper(texte)}</span>`
    b.addEventListener("click", async () => { await pret; if (kora) analyserMessage(texte, { francais: true }) })
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
async function lireImage(fichier) {
    if (!fichier || !fichier.type.startsWith("image/")) return
    await pret
    if (!kora) return
    retirerPuces()
    attente = null
    msgMoi("", { image: URL.createObjectURL(fichier), petit: "Capture d'écran" })
    const corps = msgKora()
    const etat = dire(corps, "Je lis la capture…", "doux")
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
        analyserMessage(texte, { deja: true, francais: true })
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
