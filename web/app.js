import { Kora } from "./kora-engine.js"
import { SPACE_FON } from "./config.js"

const $ = (id) => document.getElementById(id)
const fil = $("fil")
const mascotte = $("mascotte")
let kora = null
let fonHumain = { titres: {}, conseils: {} }

const COULEURS = { arnaque: "var(--alerte)", suspect: "var(--mefiance)", sur: "var(--sur)" }
const TITRES = { arnaque: "Arnaque probable", suspect: "Message suspect", sur: "Pas de signe d'arnaque" }
const BULLES = { arnaque: "Arnaque ! Ne donne rien.", suspect: "Méfie-toi…", sur: "Ça a l'air normal." }

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

function afficher(texteAnalyse, { source, original } = {}) {
    if (!kora) return
    $("vide")?.remove()
    const r = kora.analyser(texteAnalyse)
    const pct = Math.round(r.risque * 100)

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
      ${r.raisons.length ? `<h3>Pourquoi ?</h3><ul>${r.raisons.map((x) => `<li>${echapper(x)}</li>`).join("")}</ul>` : ""}
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

    const phraseFr = `${TITRES[r.niveau]}. ${r.niveau === "sur" ? "" : r.raisons.join(" ")} ${r.conseil}`
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
let langueVoix = "fr"
function bascule(selecteur, attr, valeur) {
    document.querySelectorAll(selecteur).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset[attr] === valeur)))
}
document.querySelectorAll("[data-langue]").forEach((b) => b.addEventListener("click", () => {
    langueTexte = b.dataset.langue
    bascule("[data-langue]", "langue", langueTexte)
    $("message").placeholder = langueTexte === "fon" ? "Colle ici le message en fon…" : "Colle ici le SMS ou le message WhatsApp reçu…"
}))
document.querySelectorAll("[data-voix]").forEach((b) => b.addEventListener("click", () => {
    langueVoix = b.dataset.voix
    bascule("[data-voix]", "voix", langueVoix)
    $("etat-voix").textContent = langueVoix === "fon"
        ? "Appuie, puis parle en fon (ou fais écouter l'appel en haut-parleur). Appuie à nouveau pour terminer."
        : "Appuie, puis lis le message à voix haute ou fais écouter l'appel en haut-parleur. Appuie à nouveau pour terminer."
    if (langueVoix === "fon") {
        etatService("connexion…", true)
        serviceFon().then(() => etatService("prêt", true)).catch(() => etatService("indisponible pour le moment (il se réveille parfois en 1 à 2 minutes)", false))
    } else $("service-fon").hidden = true
}))

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

/* ---------- vocal ---------- */
const Reco = window.SpeechRecognition || window.webkitSpeechRecognition
let ecoute = null
let enregistreur = null

function microActif(actif) {
    $("micro").classList.toggle("ecoute", actif)
    $("micro").setAttribute("aria-label", actif ? "Terminer l'enregistrement" : "Commencer l'enregistrement")
}

$("micro").addEventListener("click", () => (langueVoix === "fon" ? vocalFon() : vocalFrancais()))

// Français : reconnaissance vocale du navigateur
function vocalFrancais() {
    const etat = $("etat-voix")
    if (!Reco) {
        etat.textContent = "Ton navigateur ne propose pas la reconnaissance vocale en français. Essaie avec Chrome, ou utilise le micro du clavier dans l'onglet Message."
        return
    }
    if (ecoute) { ecoute.stop(); return }
    let final = ""
    ecoute = new Reco()
    ecoute.lang = "fr-FR"
    ecoute.interimResults = true
    ecoute.continuous = true
    ecoute.onstart = () => { microActif(true); etat.textContent = "J'écoute… Appuie à nouveau pour terminer."; piloter({ emotion: "surpris", bulle: "J'écoute…" }) }
    ecoute.onresult = (ev) => {
        let provisoire = ""
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
            if (ev.results[i].isFinal) final += ev.results[i][0].transcript + " "
            else provisoire += ev.results[i][0].transcript
        }
        etat.textContent = (final + provisoire).trim() || "J'écoute…"
    }
    ecoute.onerror = (ev) => {
        etat.textContent = ev.error === "not-allowed" ? "Le micro est bloqué. Autorise-le dans les réglages du navigateur, puis réessaie." : "L'écoute s'est interrompue. Réessaie."
    }
    ecoute.onend = async () => {
        microActif(false)
        ecoute = null
        const texte = final.trim()
        if (texte) { $("message").value = texte; await pret; afficher(texte, { source: "Vocal en français" }); etat.textContent = "Appuie pour vérifier un autre vocal." }
    }
    ecoute.start()
}

// Fon : on enregistre, puis le service fon écoute et traduit
async function vocalFon() {
    const etat = $("etat-voix")
    if (enregistreur) { enregistreur.stop(); return }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
        etat.textContent = "Ton navigateur ne permet pas d'enregistrer un vocal. Essaie avec Chrome."
        return
    }
    let flux
    try { flux = await navigator.mediaDevices.getUserMedia({ audio: true }) } catch (_) {
        etat.textContent = "Le micro est bloqué. Autorise-le dans les réglages du navigateur, puis réessaie."
        return
    }
    serviceFon().catch(() => {}) // on réveille le service pendant l'enregistrement
    const morceaux = []
    enregistreur = new MediaRecorder(flux)
    enregistreur.ondataavailable = (e) => e.data.size && morceaux.push(e.data)
    enregistreur.onstart = () => { microActif(true); etat.textContent = "J'enregistre… Parle en fon, puis appuie à nouveau."; piloter({ emotion: "surpris", bulle: "J'écoute…" }) }
    enregistreur.onstop = async () => {
        microActif(false)
        flux.getTracks().forEach((t) => t.stop())
        enregistreur = null
        const blob = new Blob(morceaux, { type: morceaux[0]?.type || "audio/webm" })
        if (blob.size < 2000) { etat.textContent = "L'enregistrement est trop court. Réessaie."; return }
        $("micro").disabled = true
        const attente = bulleAttente("KORA écoute le vocal en fon (10 à 30 secondes)…")
        try {
            const { handle_file } = await import("https://cdn.jsdelivr.net/npm/@gradio/client@2.8.0/+esm")
            const [fon, fr] = await appelerFon("/ecouter", { audio: handle_file(blob) })
            attente.remove()
            if (!fon) { etat.textContent = "Je n'ai rien compris. Parle plus près du téléphone et réessaie."; return }
            await pret
            afficher(fr || fon, { source: "Vocal en fon", original: fon })
            etat.textContent = "Appuie pour vérifier un autre vocal."
        } catch (_) {
            attente.textContent = "Le service fon ne répond pas pour le moment. Réessaie dans une minute."
        }
        $("micro").disabled = false
    }
    enregistreur.start()
}

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
