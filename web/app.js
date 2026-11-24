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

/* ---------- service fon : traduction (Hugging Face Space) ---------- */
let clientFon = null
async function serviceFon() {
    if (!SPACE_FON) throw new Error("Le fon n'est pas activé (config.js).")
    if (clientFon) return clientFon
    const { Client } = await import("https://cdn.jsdelivr.net/npm/@gradio/client@2.8.0/+esm")
    clientFon = await Client.connect(SPACE_FON)
    return clientFon
}
async function traduire(texte, sens) {
    const c = await serviceFon()
    const r = await c.predict("/traduire", { texte, sens })
    return r.data[0]
}

/* ---------- affichage d'une analyse ---------- */
function bulleAttente(texte) {
    const p = document.createElement("p")
    p.className = "attente"
    p.textContent = texte
    fil.append(p)
    return p
}

function afficher(texteAnalyse, { source, original, ctx, enFon } = {}) {
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
      <div class="rep-fon" hidden></div>
      <div class="actions">
        ${SPACE_FON ? `<button type="button" data-action="fon">Voir la réponse en fon</button>` : ""}
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

    rep.querySelector('[data-action="fon"]')?.addEventListener("click", (e) => montrerFon(r, rep, e.currentTarget))
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

    // Si le message d'origine était en fon, on affiche aussi la réponse en fon tout de suite.
    if (enFon) montrerFon(r, rep, rep.querySelector('[data-action="fon"]'))
    return r
}

/* ---------- réponse en fon (texte) ---------- */
async function montrerFon(r, rep, bouton) {
    const zone = rep.querySelector(".rep-fon")
    if (zone.dataset.fait) { zone.hidden = false; return }
    if (bouton) { bouton.disabled = true; bouton.textContent = "Traduction en fon…" }
    try {
        // Traduction humaine si l'équipe l'a fournie (fon.json), sinon traduction automatique du Space.
        const titre = fonHumain.titres?.[r.niveau]
        const conseil = fonHumain.conseils?.[r.categorie]
        let fon
        if (titre && conseil) {
            fon = `${titre}. ${conseil}`
        } else {
            const frParts = [TITRES[r.niveau], ...(r.raisons || []), `Que faire : ${r.conseil}`].join(" ")
            fon = await traduire(frParts, "français→fon")
        }
        zone.innerHTML = `<h3>Fɔngbe</h3><p>${echapper(fon)}</p>`
        zone.dataset.fait = "1"
        zone.hidden = false
        if (bouton) { bouton.textContent = "Réponse en fon affichée"; bouton.disabled = true }
    } catch (_) {
        if (bouton) { bouton.disabled = false; bouton.textContent = "Fon indisponible (réessaie)" }
    }
}

/* ---------- onglets ---------- */
const onglets = ["t-texte", "t-image"]
function choisirOnglet(id) {
    for (const o of onglets) {
        const actif = o === id
        $(o).setAttribute("aria-selected", String(actif))
        $($(o).getAttribute("aria-controls")).hidden = !actif
    }
}
for (const o of onglets) $(o).addEventListener("click", () => choisirOnglet(o))

/* ---------- langue du message (texte) ---------- */
let langueTexte = "fr"
document.querySelectorAll("[data-langue]").forEach((b) => b.addEventListener("click", () => {
    langueTexte = b.dataset.langue
    document.querySelectorAll("[data-langue]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.langue === langueTexte)))
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
        const fr = await traduire(texte, "fon→français")
        attente.remove()
        afficher(fr, { source: "Message en fon", original: texte, enFon: true })
    } catch (_) {
        attente.textContent = "Le service fon ne répond pas pour le moment (il se réveille parfois en 1 à 2 minutes). Réessaie, ou colle la version française."
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
        langueTexte = "fr"
        document.querySelectorAll("[data-langue]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.langue === "fr")))
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
