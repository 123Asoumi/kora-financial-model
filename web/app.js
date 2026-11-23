import { Kora } from "./kora-engine.js"
import { SPACE_FON } from "./config.js"

const $ = (id) => document.getElementById(id)
const fil = $("fil")
const mascotte = $("mascotte")
let kora = null
let fonHumain = { titres: {}, conseils: {} }

const COULEURS = { arnaque: "var(--alerte)", suspect: "var(--mefiance)", sur: "var(--sur)" }
const TITRES = { arnaque: "Arnaque probable", suspect: "Message suspect", sur: "Pas de signe d'arnaque" }
const BULLES = { arnaque: "Eh!! Eyon l'arnaque c'est pas bien", suspect: "Méfie-toi…", sur: "Ça a l'air normal." }

const EXEMPLES = [
    ["Faux agent", "Bjr c'est l'agent MTN, j'ai fait une erreur sur ton compte, envoie moi le code que tu vas recevoir stp"],
    ["Faux dépôt", "Bsr, j'ai envoyé 20000 sur ton numéro par erreur c'était pour ma mère malade, renvoie moi stp 🙏"],
    ["Faux prêt", "Prêt rapide sans garantie : recevez 300 000 F en 10 minutes sur votre MoMo. Payez d'abord 7 500 F de frais de dossier au 01 66 00 00 00."],
    ["Faux gain", "Félicitations ! Votre numéro a gagné 500 000 FCFA au tirage Moov. Pour retirer, envoyez 5 000 FCFA de frais au 01 97 12 34 56."],
    ["Compte bloqué", "Moov Money : votre compte a été bloqué pour activité suspecte. Cliquez sur moov-securite.top pour le réactiver."],
    ["Vrai SMS", "Vous avez reçu 25 000 FCFA de DOSSOU Koffi (01 97 00 00 00). Nouveau solde : 31 500 FCFA. ID transaction : 7A3F9C21B0."],
    ["Code officiel", "Votre code de confirmation MTN MoMo est 482913. Ne le communiquez à personne, même à un agent MTN."],
]

const echapper = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c])
const calme = () => matchMedia("(prefers-reduced-motion: reduce)").matches

/* ---------- mascotte ---------- */
function piloter(message) {
    try { mascotte.contentWindow.postMessage({ kora: message }, "*") } catch (_) {}
}
mascotte.addEventListener("load", () => piloter({ emotion: "content", bulle: "Montre-moi le message !" }))

/* ---------- chargement ---------- */
const pret = fetch("kora_lite.json")
    .then((r) => { if (!r.ok) throw new Error(); return r.json() })
    .then((m) => (kora = new Kora(m)))
    .catch(() => fil.insertAdjacentHTML("beforeend", `<p class="vide">Le modèle KORA n'a pas pu être chargé. Vérifie ta connexion et recharge la page.</p>`))
fetch("fon.json").then((r) => r.json()).then((j) => (fonHumain = j)).catch(() => {})

/* ---------- service fon (Hugging Face Space) ---------- */
let clientFon = null
async function serviceFon() {
    if (!SPACE_FON) throw new Error("Le fon n'est pas activé (config.js).")
    if (clientFon) return clientFon
    const { Client } = await import("https://cdn.jsdelivr.net/npm/@gradio/client@2.8.0/+esm")
    clientFon = await Client.connect(SPACE_FON)
    return clientFon
}
async function appelerFon(route, donnees) {
    const c = await serviceFon()
    const r = await c.predict(route, donnees)
    return r.data
}
function etatService(texte, ok) {
    const el = $("service-fon")
    el.hidden = false
    el.innerHTML = `Service fon : <b class="${ok ? "ok" : "ko"}">${echapper(texte)}</b>`
}

/* ---------- affichage d'une analyse ---------- */
function bulleAttente(texte) {
    const p = document.createElement("p")
    p.className = "attente"
    p.textContent = texte
    fil.append(p)
    return p
}

function afficher(texteAnalyse, { source, original, ctx } = {}) {
    if (!kora) return null
    $("vide")?.remove()
    const contexte = ctx || lireContexte()
    const r = kora.analyserComplet(texteAnalyse, contexte)
    const pct = Math.round(r.risque * 100)
    const pctTexte = Math.round(r.risqueTexte * 100)
    const aContexte = r.indices.length > 0 || Object.values(contexte).some(Boolean)

    const moi = document.createElement("div")
    moi.className = "bulle-moi"
    moi.innerHTML = (source ? `<span class="source">${echapper(source)}</span>` : "") +
        echapper(original || texteAnalyse) +
        (original ? `<span class="traduction">Traduction : ${echapper(texteAnalyse)}</span>` : "")

    const rep = document.createElement("article")
    rep.className = "reponse"
    rep.style.setProperty("--c", COULEURS[r.niveau])
    const probas = kora.cat.map((c) =>
        `<div class="proba"><span>${echapper(kora.m.regles.noms[c])}</span><i><b style="width:${(r.probas[c] * 100).toFixed(1)}%"></b></i><span>${Math.round(r.probas[c] * 100)} %</span></div>`).join("")
    rep.innerHTML = `
      <h2>${TITRES[r.niveau]}</h2>
      <p class="type">${r.niveau === "sur" ? "Ça ressemble à un message normal." : echapper(r.type)}</p>
      <div class="jauge" role="img" aria-label="Risque estimé : ${pct} %"><span></span><span></span><span></span><div class="curseur"></div></div>
      <div class="jauge-legende"><span>Normal</span><span>Risque estimé : <b>${pct} %</b></span><span>Arnaque</span></div>
      ${aContexte && pct !== pctTexte ? `<p class="deux-risques">Le texte seul : ${pctTexte} %. Avec ce que tu sais de l'expéditeur : ${pct} %.</p>` : ""}
      ${r.raisons.length ? `<h3>Pourquoi ?</h3><ul>${r.raisons.map((x) => `<li>${echapper(x)}</li>`).join("")}</ul>` : ""}
      ${r.indices.length ? `<h3>Qui l'envoie ?</h3><ul class="indices">${r.indices.map((x) => `<li><span aria-hidden="true">${x.sens === "danger" ? "⚠️" : "✅"}</span><span>${echapper(x.texte)}</span></li>`).join("")}</ul>` : ""}
      ${aContexte ? "" : `<p class="indice-sans">Astuce : dis à KORA qui t'a écrit (le nom ou le numéro, SMS ou WhatsApp) pour savoir si c'est le vrai opérateur ou quelqu'un qui prend son nom.</p>`}
      <p class="conseil"><b>Que faire :</b> ${echapper(r.conseil)}</p>
      <div class="actions">
        <button type="button" data-action="ecouter-fr">🔊 Écouter</button>
        ${SPACE_FON ? `<button type="button" class="discret" data-action="ecouter-fon">🔊 En fon</button>` : ""}
        ${r.niveau === "sur" ? "" : `<button type="button" class="discret" data-action="partager">Prévenir un proche</button>`}
        <button type="button" class="discret" data-action="nouveau">Vérifier un autre message</button>
      </div>
      <details class="curieux"><summary>Comment KORA a décidé</summary>
        <p>Probabilités calculées par le modèle KORA-lite, directement sur ton appareil :</p>${probas}
        <p>À partir de ${Math.round(kora.m.seuils.suspect * 100)} % de risque, le message est jugé suspect ; à partir de ${Math.round(kora.m.seuils.arnaque * 100)} %, c'est une arnaque probable.</p>
      </details>`
    fil.append(moi, rep)

    requestAnimationFrame(() => requestAnimationFrame(() => rep.style.setProperty("--risque", Math.min(99, Math.max(1, pct)))))
    piloter({ emotion: r.emotion, bulle: BULLES[r.niveau], gratter: r.niveau === "sur" })
    moi.scrollIntoView({ behavior: calme() ? "auto" : "smooth", block: "start" })

    const phraseFr = phraseVerdict(r)
    rep.querySelector('[data-action="ecouter-fr"]').addEventListener("click", () => lireFrancais(phraseFr))
    rep.querySelector('[data-action="ecouter-fon"]')?.addEventListener("click", (e) => lireFon(r, e.currentTarget))
    rep.querySelector('[data-action="partager"]')?.addEventListener("click", async (e) => {
        const msg = `⚠️ KORA a analysé ce message : ${TITRES[r.niveau]} (risque ${pct} %).\n« ${(original || texteAnalyse).slice(0, 160)} »\nConseil : ${r.conseil}\nVérifie toi aussi : ${location.origin}`
        try {
            if (navigator.share) await navigator.share({ title: "Alerte KORA", text: msg })
            else { await navigator.clipboard.writeText(msg); e.currentTarget.textContent = "Alerte copiée" }
        } catch (_) {}
    })
    rep.querySelector('[data-action="nouveau"]').addEventListener("click", () => {
        choisirOnglet("t-texte")
        $("message").value = ""
        $("message").focus()
        piloter({ emotion: "content", bulle: "Montre-moi le message !" })
    })
    return r
}
function phraseVerdict(r) {
    const danger = r.indices.filter((x) => x.sens === "danger").map((x) => x.texte).join(" ")
    return `${TITRES[r.niveau]}, risque ${Math.round(r.risque * 100)} pour cent. ${r.niveau === "sur" ? "" : r.raisons.join(" ")} ${danger} ${r.conseil}`
}

/* ---------- lecture à voix haute ---------- */
function lireFrancais(texte) {
    if (!("speechSynthesis" in window)) return
    speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(texte)
    u.lang = "fr-FR"
    u.rate = 0.95
    const fr = speechSynthesis.getVoices().find((v) => v.lang.startsWith("fr"))
    if (fr) u.voice = fr
    speechSynthesis.speak(u)
}
async function lireFon(r, bouton) {
    const avant = bouton.textContent
    bouton.disabled = true
    bouton.textContent = "Préparation…"
    try {
        // traduction humaine si l'équipe l'a fournie (fon.json), sinon traduction automatique
        let fon = [fonHumain.titres?.[r.niveau], fonHumain.conseils?.[r.categorie]].filter(Boolean).join(". ")
        if (!fon) {
            const [t] = await appelerFon("/traduire", { texte: `${TITRES[r.niveau]}. ${r.conseil}`, sens: "français→fon" })
            fon = t
        }
        const [audio] = await appelerFon("/parler", { texte_fon: fon })
        if (audio?.url) await new Audio(audio.url).play()
        bouton.textContent = avant
    } catch (_) {
        bouton.textContent = "Fon indisponible"
    }
    bouton.disabled = false
}

/* ---------- onglets et langue ---------- */
const onglets = ["t-texte", "t-image", "t-voix"]
function choisirOnglet(id) {
    for (const o of onglets) {
        const actif = o === id
        $(o).setAttribute("aria-selected", String(actif))
        $($(o).getAttribute("aria-controls")).hidden = !actif
    }
}
for (const o of onglets) $(o).addEventListener("click", () => choisirOnglet(o))

let langueTexte = "fr"
function bascule(selecteur, attr, valeur) {
    document.querySelectorAll(selecteur).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset[attr] === valeur)))
}
document.querySelectorAll("[data-langue]").forEach((b) => b.addEventListener("click", () => {
    langueTexte = b.dataset.langue
    bascule("[data-langue]", "langue", langueTexte)
    $("message").placeholder = langueTexte === "fon" ? "Colle ici le message en fon…" : "Colle ici le SMS ou le message WhatsApp reçu…"
}))
/* ---------- qui t'a écrit ? ---------- */
const contexte = { canal: "", repondre: "", premier: "" }
function fixerContexte(champ, v) {
    contexte[champ] = v
    document.querySelectorAll(`.choix[data-champ="${champ}"] button`).forEach((b) =>
        b.setAttribute("aria-pressed", String(v !== "" && b.dataset.v === v)))
}
document.querySelectorAll(".choix").forEach((groupe) => groupe.querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => {
        const champ = groupe.dataset.champ
        fixerContexte(champ, contexte[champ] === b.dataset.v ? "" : b.dataset.v)
    })))
function lireContexte() {
    return { expediteur: $("expediteur").value.trim(), ...contexte }
}

/* ---------- texte ---------- */
async function verifierTexte() {
    const texte = $("message").value.trim()
    if (!texte) {
        $("message").focus()
        piloter({ emotion: "surpris", bulle: "Colle d'abord un message !" })
        return
    }
    await pret
    if (langueTexte === "fr") return afficher(texte, { source: "Message collé" })
    const attente = bulleAttente("KORA traduit le message en fon…")
    $("verifier").disabled = true
    try {
        const [fr] = await appelerFon("/traduire", { texte, sens: "fon→français" })
        attente.remove()
        afficher(fr, { source: "Message en fon", original: texte })
    } catch (_) {
        attente.textContent = "Le service fon ne répond pas pour le moment. Réessaie dans une minute, ou colle la version française."
    }
    $("verifier").disabled = false
}
$("verifier").addEventListener("click", verifierTexte)
$("message").addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) verifierTexte() })
$("coller").addEventListener("click", async () => {
    try { $("message").value = await navigator.clipboard.readText() } catch (_) {
        $("message").placeholder = "Appui long dans cette zone, puis « Coller »."
    }
    $("message").focus()
})
for (const [nom, texte] of EXEMPLES) {
    const b = document.createElement("button")
    b.type = "button"
    b.textContent = nom
    b.addEventListener("click", async () => {
        $("message").value = texte
        await pret
        afficher(texte, { source: `Exemple : ${nom}` })
    })
    $("exemples").append(b)
}

/* ---------- capture d'écran (lecture du texte dans le navigateur) ---------- */
let ocr = null
async function lireImage(fichier) {
    if (!fichier || !fichier.type.startsWith("image/")) return
    $("depot-texte").innerHTML = `<img src="${URL.createObjectURL(fichier)}" alt="Capture choisie">`
    const etat = $("etat-image")
    piloter({ emotion: "surpris", bulle: "Je lis la capture…" })
    try {
        if (!ocr) {
            etat.textContent = "Préparation du lecteur de texte (la première fois, quelques secondes)…"
            const { createWorker } = await import("https://cdn.jsdelivr.net/npm/tesseract.js@6/dist/tesseract.esm.min.js")
            ocr = await createWorker("fra", 1, {
                logger: (m) => { if (m.status === "recognizing text") etat.textContent = `Lecture du texte… ${Math.round(m.progress * 100)} %` },
            })
        }
        etat.textContent = "Lecture du texte…"
        const { data } = await ocr.recognize(fichier)
        const texte = data.text.replace(/\n{2,}/g, "\n").trim()
        if (texte.length < 8) {
            etat.textContent = "Je ne trouve pas de texte lisible. Essaie une capture plus nette (zoome sur le message), ou copie le message dans l'onglet Message."
            piloter({ emotion: "triste", bulle: "Je n'arrive pas à lire…" })
            return
        }
        etat.textContent = "Texte lu. S'il y a des erreurs, corrige-le dans l'onglet Message."
        $("message").value = texte
        await pret
        afficher(texte, { source: "Texte lu sur la capture" })
    } catch (_) {
        etat.textContent = "La lecture de l'image a échoué. Vérifie ta connexion, ou copie le message dans l'onglet Message."
        piloter({ emotion: "triste", bulle: "Je n'arrive pas à lire…" })
    }
}
$("fichier").addEventListener("change", (e) => lireImage(e.target.files[0]))
const depot = $("depot")
depot.addEventListener("dragover", (e) => { e.preventDefault(); depot.classList.add("survol") })
depot.addEventListener("dragleave", () => depot.classList.remove("survol"))
depot.addEventListener("drop", (e) => { e.preventDefault(); depot.classList.remove("survol"); lireImage(e.dataTransfer.files[0]) })
document.addEventListener("paste", (e) => {
    const img = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"))
    if (img) { choisirOnglet("t-image"); lireImage(img.getAsFile()) }
})

/* ---------- discuter avec KORA (à l'oral, en français ou en fon) ---------- */
// KORA mène la conversation : elle demande le message, puis qui l'a envoyé,
// puis donne son verdict à voix haute et répond aux questions qui suivent.
const Reco = window.SpeechRecognition || window.webkitSpeechRecognition
let langueVoix = "fr"
let ecoute = null
let enregistreur = null
let etape = null // null = pas commencé
let conv = { message: "", original: "", ctx: {}, verdict: null }
const cacheFon = new Map()

const OUI = /\b(oui|ouais|ouai|yes|bien s[uû]r|exact|c'est [çc]a|[eɛ]+n)\b/i
const NON = /\b(non|nan|no|jamais|pas du tout|a+o|ǎo)\b/i
const NSP = /(sais pas|sait pas|aucune id[ée]e|peut-[êe]tre|je ne sais)/i

const ETAPES = {
    message: {
        q: "Bonjour, je suis KORA. Lis-moi le message que tu as reçu, ou raconte-moi ce qu'on te demande.",
        rapides: [],
    },
    expediteur: {
        q: "Qui te l'a envoyé ? Dis-moi le nom affiché, ou s'il vient d'un numéro de téléphone.",
        rapides: ["Un numéro de téléphone", "MobileMoney", "MTN", "Moov", "Un proche", "Je ne sais pas"],
    },
    canal: {
        q: "Tu l'as reçu par SMS, sur WhatsApp, ou c'était un appel ?",
        rapides: ["SMS", "WhatsApp", "Appel", "Autre"],
    },
    repondre: {
        q: "Est-ce que tu peux répondre à ce message ?",
        rapides: ["Oui", "Non", "Je ne sais pas"],
    },
    premier: {
        q: "C'est la première fois que cette personne te contacte ?",
        rapides: ["Oui, la première fois", "Non, je la connais", "Je ne sais pas"],
    },
    suite: {
        q: "Tu as une autre question ? Tu peux dire : j'ai déjà payé, pourquoi, que faire, ou recommencer.",
        rapides: ["J'ai déjà payé ou donné le code", "Pourquoi ?", "Que faire ?", "Recommencer"],
    },
}

const URGENCE = "Pas de panique, agis vite. Un : appelle tout de suite le service client officiel de ton opérateur, avec le numéro écrit sur son site ou au dos de ta carte SIM, et demande de bloquer la transaction et ton compte. Deux : change ton code PIN. Trois : garde les captures et le numéro de l'escroc, puis porte plainte au commissariat ou auprès de la police chargée de la cybercriminalité. Quatre : préviens tes proches, l'escroc peut les contacter avec ton nom."

function etatVoix(t) { $("etat-voix").textContent = t }
function microActif(actif) {
    $("micro").classList.toggle("ecoute", actif)
    $("micro").setAttribute("aria-label", actif ? "Terminer et envoyer ma réponse" : "Parler à KORA")
}

function dire(texte) {
    $("vide")?.remove()
    const b = document.createElement("div")
    b.className = "bulle-kora"
    b.innerHTML = `<b>KORA</b>${echapper(texte)}`
    fil.append(b)
    b.scrollIntoView({ behavior: calme() ? "auto" : "smooth", block: "nearest" })
    return parler(texte)
}
function moiDit(texte, traduction) {
    const b = document.createElement("div")
    b.className = "bulle-moi"
    b.innerHTML = echapper(texte) + (traduction && traduction !== texte ? `<span class="traduction">Traduction : ${echapper(traduction)}</span>` : "")
    fil.append(b)
}

// Parle, puis rend la main (la promesse se résout quand KORA a fini de parler)
function parler(texte) {
    if (langueVoix === "fon") return parlerFon(texte)
    return new Promise((fin) => {
        if (!("speechSynthesis" in window)) return fin()
        speechSynthesis.cancel()
        const u = new SpeechSynthesisUtterance(texte)
        u.lang = "fr-FR"
        u.rate = 1
        const fr = speechSynthesis.getVoices().find((v) => v.lang.startsWith("fr"))
        if (fr) u.voice = fr
        u.onend = u.onerror = () => fin()
        speechSynthesis.speak(u)
        setTimeout(fin, 400 + texte.length * 90) // filet de sécurité si onend ne vient jamais
    })
}
async function parlerFon(texte) {
    try {
        let fon = cacheFon.get(texte) || fonHumain.questions?.[texte]
        if (!fon) [fon] = await appelerFon("/traduire", { texte, sens: "français→fon" })
        cacheFon.set(texte, fon)
        const [audio] = await appelerFon("/parler", { texte_fon: fon })
        if (!audio?.url) return
        await new Promise((fin) => { const a = new Audio(audio.url); a.onended = a.onerror = fin; a.play().catch(fin) })
    } catch (_) {
        etatService("la voix en fon ne répond pas, KORA écrit en français", false)
    }
}

function proposer(liste) {
    const zone = $("rapides")
    zone.innerHTML = ""
    for (const t of liste) {
        const b = document.createElement("button")
        b.type = "button"
        b.textContent = t
        b.addEventListener("click", () => repondre(t))
        zone.append(b)
    }
}

async function poser(nom) {
    etape = nom
    proposer(ETAPES[nom].rapides)
    piloter({ emotion: "content", bulle: nom === "message" ? "Je t'écoute !" : "Dis-moi…" })
    await dire(ETAPES[nom].q)
    if (etape === nom) ecouter()
}

function nouvelleConv() {
    conv = { message: "", original: "", ctx: { expediteur: "", canal: "", repondre: "", premier: "" }, verdict: null }
}
async function demarrer() {
    nouvelleConv()
    await pret
    poser("message")
}

const SUIVANTE = { message: "expediteur", expediteur: "canal", canal: "repondre", repondre: "premier", premier: null }
function ouiNon(t) { return NSP.test(t) ? "" : NON.test(t) ? "non" : OUI.test(t) ? "oui" : null }

async function repondre(texte, traduction) {
    const t = String(traduction || texte).trim()
    if (!t || !etape) return
    arreterEcoute()
    moiDit(texte, traduction)
    const c = conv.ctx
    switch (etape) {
        case "message":
            conv.message = t
            conv.original = traduction ? texte : ""
            break
        case "expediteur":
            if (/num[ée]ro|inconnu|\d{6,}/i.test(t) && !/proche|ami|famille|fr[eè]re|s[oœ]eur|maman|papa/i.test(t))
                c.expediteur = (t.match(/[\d\s+]{7,}/) || ["01 00 00 00 00"])[0].trim()
            else if (/proche|ami|famille|fr[eè]re|s[oœ]eur|maman|papa|cousin|tante|oncle|coll[eè]gue/i.test(t)) { c.expediteur = ""; c.premier = "non" }
            else if (!NSP.test(t)) c.expediteur = t
            $("expediteur").value = c.expediteur
            break
        case "canal": {
            const v = /whats|wa\b/i.test(t) ? "whatsapp" : /appel|t[ée]l[ée]phon|appel[ée]/i.test(t) ? "appel" : /sms|message|texto/i.test(t) ? "sms" : /autre|facebook|messenger|telegram|mail/i.test(t) ? "autre" : ""
            c.canal = v
            fixerContexte("canal", v)
            if (v === "appel") c.repondre = "oui" // on peut toujours parler à quelqu'un qui appelle
            break
        }
        case "repondre": {
            const v = ouiNon(t)
            if (v === null) return redemander()
            c.repondre = v
            fixerContexte("repondre", v)
            break
        }
        case "premier": {
            const v = /premi[eè]re/i.test(t) ? "oui" : /connai/i.test(t) ? "non" : ouiNon(t)
            if (v === null) return redemander()
            c.premier = v
            fixerContexte("premier", v)
            break
        }
        case "suite":
            return questionSuite(t)
    }
    // on passe les questions déjà réglées (par ex. « un proche » répond déjà à « première fois ? »)
    let prochaine = SUIVANTE[etape]
    while (prochaine && c[prochaine] && prochaine !== "expediteur") prochaine = SUIVANTE[prochaine]
    if (prochaine) return poser(prochaine)
    return conclure()
}

function redemander() {
    piloter({ emotion: "surpris", bulle: "Hein ?" })
    dire("Je n'ai pas bien compris. Réponds par oui, par non, ou je ne sais pas.").then(() => etape && ecouter())
}

async function conclure() {
    etape = "verdict"
    proposer([])
    const r = afficher(conv.message, { source: "Ce que tu m'as dit", original: conv.original, ctx: conv.ctx })
    conv.verdict = r
    if (!r) return
    await parler(phraseVerdict(r))
    poser("suite")
}

async function questionSuite(t) {
    const r = conv.verdict
    if (/recommenc|autre message|nouveau/i.test(t)) return demarrer()
    let rep
    if (/pay[ée]|donn[ée]|envoy[ée]|transf[ée]r|trop tard|d[ée]j[aà]/i.test(t)) {
        piloter({ emotion: "triste", bulle: "On agit vite." })
        rep = URGENCE
    } else if (/pourquoi|comment tu sais|explique/i.test(t)) {
        const tout = [...(r?.raisons || []), ...(r?.indices || []).map((x) => x.texte)]
        rep = tout.length ? tout.join(" ") : "Je n'ai trouvé aucun signe d'arnaque : pas de demande de code, pas d'argent à envoyer, pas de lien, et l'expéditeur a l'air normal. Reste quand même prudent."
    } else if (/quoi faire|que faire|je fais quoi|conseil|aide/i.test(t)) {
        rep = r?.conseil || "Ne donne jamais ton code, et vérifie toujours auprès du service client officiel."
    } else if (/merci|au revoir|c'est bon|ok|d'accord/i.test(t)) {
        piloter({ emotion: "content", bulle: "À bientôt !", gratter: true })
        etape = null
        proposer(["Recommencer"])
        $("rapides").firstChild.onclick = () => demarrer()
        return dire("Avec plaisir. Souviens-toi : ton code, c'est comme la clé de ta maison, tu ne le donnes à personne.")
    } else {
        rep = "Je ne sais pas encore répondre à ça. Dis : j'ai déjà payé, pourquoi, que faire, ou recommencer."
    }
    await dire(rep)
    if (etape === "suite") ecouter()
}

/* --- écoute --- */
function arreterEcoute() {
    if (ecoute) { ecoute.onend = null; try { ecoute.abort() } catch (_) {} ecoute = null; microActif(false) }
}
function ecouter() {
    if (langueVoix === "fon") { etatVoix("Appuie sur le micro pour répondre en fon, ou touche une réponse ci-dessous."); return }
    if (!Reco) { etatVoix("Ton navigateur ne comprend pas la voix : touche une réponse ou écris-la ci-dessous."); return }
    arreterEcoute()
    let final = ""
    ecoute = new Reco()
    ecoute.lang = "fr-FR"
    ecoute.interimResults = true
    ecoute.continuous = etape === "message" // le message peut être long
    ecoute.onstart = () => { microActif(true); etatVoix(etape === "message" ? "J'écoute… Appuie sur le micro quand tu as fini." : "J'écoute…") }
    ecoute.onresult = (ev) => {
        let provisoire = ""
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
            if (ev.results[i].isFinal) final += ev.results[i][0].transcript + " "
            else provisoire += ev.results[i][0].transcript
        }
        etatVoix((final + provisoire).trim() || "J'écoute…")
    }
    ecoute.onerror = (ev) => {
        if (ev.error === "not-allowed") etatVoix("Le micro est bloqué. Autorise-le dans les réglages du navigateur, ou écris ta réponse.")
        else if (ev.error === "no-speech") etatVoix("Je n'ai rien entendu. Appuie sur le micro pour réessayer.")
    }
    ecoute.onend = () => {
        microActif(false)
        ecoute = null
        const texte = final.trim()
        if (texte) repondre(texte)
    }
    try { ecoute.start() } catch (_) {}
}

// Fon : enregistrement, puis le service fon transcrit et traduit
async function enregistrerFon() {
    if (enregistreur) { enregistreur.stop(); return }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { etatVoix("Ton navigateur ne permet pas d'enregistrer. Touche une réponse ou écris-la."); return }
    let flux
    try { flux = await navigator.mediaDevices.getUserMedia({ audio: true }) } catch (_) {
        etatVoix("Le micro est bloqué. Autorise-le dans les réglages du navigateur, ou écris ta réponse.")
        return
    }
    serviceFon().catch(() => {})
    const morceaux = []
    enregistreur = new MediaRecorder(flux)
    enregistreur.ondataavailable = (e) => e.data.size && morceaux.push(e.data)
    enregistreur.onstart = () => { microActif(true); etatVoix("J'enregistre… Parle en fon, puis appuie à nouveau.") }
    enregistreur.onstop = async () => {
        microActif(false)
        flux.getTracks().forEach((t) => t.stop())
        enregistreur = null
        const blob = new Blob(morceaux, { type: morceaux[0]?.type || "audio/webm" })
        if (blob.size < 2000) { etatVoix("C'est trop court. Réessaie."); return }
        $("micro").disabled = true
        etatVoix("KORA écoute ta réponse en fon (10 à 30 secondes)…")
        try {
            const { handle_file } = await import("https://cdn.jsdelivr.net/npm/@gradio/client@2.8.0/+esm")
            const [fon, fr] = await appelerFon("/ecouter", { audio: handle_file(blob) })
            if (!fon) etatVoix("Je n'ai rien compris. Parle plus près du téléphone et réessaie.")
            else { etatVoix(""); repondre(fon, fr || fon) }
        } catch (_) {
            etatVoix("Le service fon ne répond pas pour le moment. Touche une réponse ou écris-la.")
        }
        $("micro").disabled = false
    }
    enregistreur.start()
}

$("micro").addEventListener("click", () => {
    if (!etape) return demarrer()
    if (langueVoix === "fon") return enregistrerFon()
    if (ecoute) { ecoute.stop(); return } // fin de la réponse : onend l'envoie
    speechSynthesis?.cancel?.()
    ecouter()
})
$("saisie").addEventListener("submit", (e) => {
    e.preventDefault()
    const t = $("saisie-texte").value.trim()
    if (!t) return
    $("saisie-texte").value = ""
    if (!etape) { nouvelleConv(); etape = "message" }
    repondre(t)
})
document.querySelectorAll("[data-voix]").forEach((b) => b.addEventListener("click", () => {
    langueVoix = b.dataset.voix
    bascule("[data-voix]", "voix", langueVoix)
    arreterEcoute()
    if (langueVoix === "fon") {
        etatService("connexion…", true)
        serviceFon().then(() => etatService("prêt", true)).catch(() => etatService("indisponible pour le moment (il se réveille parfois en 1 à 2 minutes)", false))
        etatVoix("KORA te parle en fon. Appuie sur le micro pour répondre, ou touche une réponse.")
    } else {
        $("service-fon").hidden = true
        etatVoix("Appuie sur le micro pour commencer : KORA te pose quelques questions, à l'oral.")
    }
}))

/* ---------- application installable et hors ligne ---------- */
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {})
let invitation = null
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); invitation = e; $("installer").classList.add("visible") })
$("installer").addEventListener("click", async () => {
    if (!invitation) return
    invitation.prompt()
    await invitation.userChoice
    invitation = null
    $("installer").classList.remove("visible")
})
