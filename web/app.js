import { Kora } from "./kora-engine.js"

const $ = (id) => document.getElementById(id)
const fil = $("fil")
const mascotte = $("mascotte")
let kora = null

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

/* ---------- mascotte ---------- */
function piloter(message) {
    try { mascotte.contentWindow.postMessage({ kora: message }, "*") } catch (_) {}
}
mascotte.addEventListener("load", () => piloter({ emotion: "content", bulle: "Montre-moi le message !" }))

/* ---------- chargement du modèle ---------- */
const pret = fetch("kora_lite.json")
    .then((r) => {
        if (!r.ok) throw new Error("modèle introuvable")
        return r.json()
    })
    .then((m) => (kora = new Kora(m)))
    .catch(() => {
        fil.insertAdjacentHTML("beforeend", `<p class="vide">Le modèle KORA n'a pas pu être chargé. Vérifie ta connexion et recharge la page.</p>`)
    })

/* ---------- affichage d'une analyse ---------- */
const echapper = (t) => t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c])

function afficher(texte, source) {
    if (!kora) return
    $("vide")?.remove()
    const r = kora.analyser(texte)
    const pct = Math.round(r.risque * 100)

    const moi = document.createElement("div")
    moi.className = "bulle-moi"
    moi.innerHTML = (source ? `<span class="source">${echapper(source)}</span>` : "") + echapper(texte)

    const rep = document.createElement("article")
    rep.className = "reponse"
    rep.style.setProperty("--c", COULEURS[r.niveau])
    const probas = kora.cat
        .map((c) => `<div class="proba"><span>${echapper(kora.m.regles.noms[c])}</span><i><b style="width:${(r.probas[c] * 100).toFixed(1)}%"></b></i><span>${Math.round(r.probas[c] * 100)} %</span></div>`)
        .join("")
    rep.innerHTML = `
      <h2>${TITRES[r.niveau]}</h2>
      <p class="type">${r.niveau === "sur" ? "Ça ressemble à un message normal." : echapper(r.type)}</p>
      <div class="jauge" role="img" aria-label="Risque estimé : ${pct} %"><span></span><span></span><span></span><div class="curseur"></div></div>
      <div class="jauge-legende"><span>Normal</span><span>Risque estimé : <b>${pct} %</b></span><span>Arnaque</span></div>
      ${r.raisons.length ? `<h3>Pourquoi ?</h3><ul>${r.raisons.map((x) => `<li>${echapper(x)}</li>`).join("")}</ul>` : ""}
      <p class="conseil"><b>Que faire :</b> ${echapper(r.conseil)}</p>
      <div class="actions">
        ${r.niveau === "sur" ? "" : `<button type="button" data-action="partager">Prévenir un proche</button>`}
        <button type="button" class="discret" data-action="nouveau">Vérifier un autre message</button>
      </div>
      <details class="curieux"><summary>Comment KORA a décidé</summary>
        <p>Probabilités calculées par le modèle KORA-lite, directement sur ton appareil :</p>${probas}
        <p>Seuils : à partir de ${Math.round(kora.m.seuils.suspect * 100)} % le message est jugé suspect, à partir de ${Math.round(kora.m.seuils.arnaque * 100)} % c'est une arnaque probable.</p>
      </details>`
    fil.append(moi, rep)

    // le seul moment animé : la jauge se place, la mascotte réagit
    requestAnimationFrame(() => requestAnimationFrame(() => rep.style.setProperty("--risque", Math.min(99, Math.max(1, pct)))))
    piloter({ emotion: r.emotion, bulle: BULLES[r.niveau], gratter: r.niveau === "sur" })
    moi.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" })

    rep.querySelector('[data-action="partager"]')?.addEventListener("click", async () => {
        const msg = `⚠️ KORA a analysé ce message : ${TITRES[r.niveau]} (risque ${pct} %).\n« ${texte.slice(0, 160)} »\nConseil : ${r.conseil}\nVérifie toi aussi : ${location.origin}`
        try {
            if (navigator.share) await navigator.share({ title: "Alerte KORA", text: msg })
            else {
                await navigator.clipboard.writeText(msg)
                rep.querySelector('[data-action="partager"]').textContent = "Alerte copiée"
            }
        } catch (_) {}
    })
    rep.querySelector('[data-action="nouveau"]').addEventListener("click", () => {
        choisirOnglet("t-texte")
        $("message").value = ""
        $("message").focus()
        piloter({ emotion: "content", bulle: "Montre-moi le message !" })
    })
}

/* ---------- onglets ---------- */
const onglets = ["t-texte", "t-image", "t-voix"]
function choisirOnglet(id) {
    for (const o of onglets) {
        const actif = o === id
        $(o).setAttribute("aria-selected", String(actif))
        $($(o).getAttribute("aria-controls")).hidden = !actif
    }
}
for (const o of onglets) $(o).addEventListener("click", () => choisirOnglet(o))

/* ---------- texte ---------- */
async function verifierTexte() {
    const texte = $("message").value.trim()
    if (!texte) {
        $("message").focus()
        piloter({ emotion: "surpris", bulle: "Colle d'abord un message !" })
        return
    }
    await pret
    afficher(texte, "Message collé")
}
$("verifier").addEventListener("click", verifierTexte)
$("message").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) verifierTexte()
})
$("coller").addEventListener("click", async () => {
    try {
        $("message").value = await navigator.clipboard.readText()
        $("message").focus()
    } catch (_) {
        $("message").focus()
        $("message").placeholder = "Appui long dans cette zone, puis « Coller »."
    }
})
for (const [nom, texte] of EXEMPLES) {
    const b = document.createElement("button")
    b.type = "button"
    b.textContent = nom
    b.addEventListener("click", async () => {
        $("message").value = texte
        await pret
        afficher(texte, `Exemple : ${nom}`)
    })
    $("exemples").append(b)
}

/* ---------- capture d'écran (OCR dans le navigateur) ---------- */
let ocr = null
async function lireImage(fichier) {
    if (!fichier || !fichier.type.startsWith("image/")) return
    const url = URL.createObjectURL(fichier)
    $("depot-texte").innerHTML = `<img src="${url}" alt="Capture choisie">`
    const etat = $("etat-image")
    piloter({ emotion: "surpris", bulle: "Je lis la capture…" })
    try {
        if (!ocr) {
            etat.textContent = "Chargement du lecteur de texte (une seule fois, quelques secondes)…"
            const { createWorker } = await import("https://cdn.jsdelivr.net/npm/tesseract.js@6/dist/tesseract.esm.min.js")
            ocr = await createWorker("fra", 1, {
                logger: (m) => {
                    if (m.status === "recognizing text") etat.textContent = `Lecture du texte… ${Math.round(m.progress * 100)} %`
                },
            })
        }
        etat.textContent = "Lecture du texte…"
        const { data } = await ocr.recognize(fichier)
        const texte = data.text.replace(/\n{2,}/g, "\n").trim()
        if (!texte) {
            etat.textContent = "Aucun texte trouvé sur cette image. Essaie une capture plus nette, ou copie le message dans l'onglet Message."
            piloter({ emotion: "triste", bulle: "Je n'arrive pas à lire…" })
            return
        }
        etat.textContent = "Texte lu. Tu peux le corriger dans l'onglet Message si besoin."
        $("message").value = texte
        await pret
        afficher(texte, "Texte lu sur la capture")
    } catch (e) {
        etat.textContent = "La lecture de l'image a échoué. Vérifie ta connexion, ou copie le message dans l'onglet Message."
        piloter({ emotion: "triste", bulle: "Je n'arrive pas à lire…" })
    }
}
$("fichier").addEventListener("change", (e) => lireImage(e.target.files[0]))
const depot = $("depot")
depot.addEventListener("dragover", (e) => {
    e.preventDefault()
    depot.classList.add("survol")
})
depot.addEventListener("dragleave", () => depot.classList.remove("survol"))
depot.addEventListener("drop", (e) => {
    e.preventDefault()
    depot.classList.remove("survol")
    lireImage(e.dataTransfer.files[0])
})
document.addEventListener("paste", (e) => {
    const img = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"))
    if (img) {
        choisirOnglet("t-image")
        lireImage(img.getAsFile())
    }
})

/* ---------- voix (reconnaissance vocale du navigateur, français) ---------- */
const Reco = window.SpeechRecognition || window.webkitSpeechRecognition
let ecoute = null
$("micro").addEventListener("click", () => {
    const etat = $("etat-voix")
    if (!Reco) {
        etat.textContent = "Ton navigateur ne propose pas la reconnaissance vocale. Essaie avec Chrome, ou dicte le message avec le micro du clavier dans l'onglet Message."
        return
    }
    if (ecoute) {
        ecoute.stop()
        return
    }
    let final = ""
    ecoute = new Reco()
    ecoute.lang = "fr-FR"
    ecoute.interimResults = true
    ecoute.continuous = true
    ecoute.onstart = () => {
        $("micro").classList.add("ecoute")
        $("micro").setAttribute("aria-label", "Arrêter l'écoute")
        etat.textContent = "J'écoute… Appuie à nouveau pour terminer."
        piloter({ emotion: "surpris", bulle: "J'écoute…" })
    }
    ecoute.onresult = (ev) => {
        let provisoire = ""
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
            if (ev.results[i].isFinal) final += ev.results[i][0].transcript + " "
            else provisoire += ev.results[i][0].transcript
        }
        etat.textContent = (final + provisoire).trim() || "J'écoute…"
    }
    ecoute.onerror = (ev) => {
        etat.textContent = ev.error === "not-allowed"
            ? "Le micro est bloqué. Autorise-le dans les réglages du navigateur, puis réessaie."
            : "L'écoute s'est interrompue. Réessaie."
    }
    ecoute.onend = async () => {
        $("micro").classList.remove("ecoute")
        $("micro").setAttribute("aria-label", "Commencer l'écoute")
        ecoute = null
        const texte = final.trim()
        if (texte) {
            $("message").value = texte
            await pret
            afficher(texte, "Message entendu")
            etat.textContent = "Appuie pour vérifier un autre message."
        }
    }
    ecoute.start()
})
