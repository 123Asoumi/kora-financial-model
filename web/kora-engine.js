// KORA-lite — moteur d'analyse 100 % dans le navigateur (aucun message n'est envoyé à un serveur).
// Reproduit exactement kora_lib.normaliser + TfidfVectorizer(char_wb, 2-5, sublinear_tf) + régression logistique.

const URL_RE = /(https?:\/\/\S+|www\.\S+|(?<![\p{L}\p{N}_])[\p{L}\p{N}_-]+\.(?:xyz|top|site|online|info|link|click|com|net|org|bj)(?![\p{L}\p{N}_])\S*)/giu
const TEL_RE = /\+?\d[\d .-]{7,}\d/g

export function enleverTons(t) {
    return t.normalize("NFD").replace(/\p{Mn}/gu, "").normalize("NFC")
}

export function normaliser(texte) {
    let t = String(texte)
    t = t.replace(URL_RE, " lien ")
    t = t.replace(TEL_RE, " numtel ")
    t = enleverTons(t).toLowerCase()
    return t.replace(/\s+/g, " ").trim()
}

function ngrammes(texte, nmin, nmax) {
    const out = []
    for (const mot of texte.replace(/\s\s+/g, " ").split(/\s+/).filter(Boolean)) {
        const w = " " + mot + " "
        const chars = Array.from(w)
        const L = chars.length
        for (let n = nmin; n <= nmax; n++) {
            let offset = 0
            out.push(chars.slice(offset, offset + n).join(""))
            while (offset + n < L) {
                offset++
                out.push(chars.slice(offset, offset + n).join(""))
            }
            if (offset === 0) break
        }
    }
    return out
}

export class Kora {
    constructor(modele) {
        this.m = modele
        this.cat = modele.categories
        this.signaux = modele.regles.signaux.map(([nom, rx, explication]) => ({ nom, rx: new RegExp(rx), explication }))
    }

    probas(texte) {
        const m = this.m
        const x = normaliser(texte)
        const tf = new Map()
        for (const g of ngrammes(x, m.ngram[0], m.ngram[1])) {
            if (g in m.features) tf.set(g, (tf.get(g) || 0) + 1)
        }
        const scores = m.intercept.slice()
        let norme = 0
        const poids = []
        for (const [g, c] of tf) {
            const f = m.features[g]
            const v = (m.sublinear_tf ? 1 + Math.log(c) : c) * f[0]
            poids.push([f, v])
            norme += v * v
        }
        norme = Math.sqrt(norme) || 1
        for (const [f, v] of poids) {
            for (let k = 0; k < scores.length; k++) scores[k] += (v / norme) * f[k + 1]
        }
        const max = Math.max(...scores)
        const e = scores.map((s) => Math.exp(s - max))
        const somme = e.reduce((a, b) => a + b, 0)
        const p = {}
        this.cat.forEach((c, i) => (p[c] = e[i] / somme))
        return p
    }

    signauxTrouves(texte) {
        const t = normaliser(texte)
        return this.signaux.filter((s) => s.rx.test(t))
    }

    analyser(texte) {
        const p = this.probas(texte)
        const { noms, conseils } = this.m.regles
        const risque = 1 - p.legitime
        const arnaques = this.cat.filter((c) => c !== "legitime")
        const categorieArnaque = arnaques.reduce((a, b) => (p[a] >= p[b] ? a : b))
        let niveau = "sur"
        if (risque >= this.m.seuils.arnaque) niveau = "arnaque"
        else if (risque >= this.m.seuils.suspect) niveau = "suspect"
        const categorie = niveau === "sur" ? "legitime" : categorieArnaque
        let raisons = niveau === "sur" ? [] : this.signauxTrouves(texte).map((s) => s.explication)
        if (niveau !== "sur" && raisons.length === 0) raisons = [`Le modèle reconnaît le schéma : ${noms[categorieArnaque].toLowerCase()}.`]
        return {
            niveau,
            risque,
            categorie,
            type: noms[categorie],
            raisons,
            conseil: conseils[categorie],
            emotion: { arnaque: "fache", suspect: "surpris", sur: "content" }[niveau],
            probas: p,
        }
    }
}

// ---------------------------------------------------------------------------
// Couche 2 : le CONTEXTE de l'expéditeur.
// Le même texte peut être vrai ou faux selon qui l'envoie. Ces règles sont
// transparentes : chaque indice est affiché à l'utilisateur.
// ---------------------------------------------------------------------------
export const INDICES = {
    transaction_numero: "Ce message imite un SMS de transaction, mais il vient d'un numéro ordinaire. Les vrais SMS de dépôt viennent de l'expéditeur officiel (un nom comme « MobileMoney »), jamais d'un numéro.",
    operateur_numero: "La personne se présente comme un opérateur ou une banque, mais écrit depuis un numéro de téléphone ordinaire.",
    appel: "Un opérateur ne t'appelle jamais pour te demander un code, ton PIN ou de l'argent.",
    whatsapp: "Un opérateur ne te demande jamais un code ou de l'argent sur WhatsApp. N'importe qui peut prendre le nom « MTN » ou « Moov » sur WhatsApp.",
    repondre: "Tu peux répondre à ce message : les vrais SMS automatiques des opérateurs ne permettent pas de répondre.",
    premier: "C'est la première fois que cette personne te contacte, et elle te demande quelque chose.",
    faux_nom: "L'expéditeur ressemble à un expéditeur officiel, mais un vrai opérateur ne t'envoie pas de lien et ne te demande jamais ton code. Les faux noms d'expéditeur existent.",
    officiel: "Il vient d'un expéditeur officiel (un nom, et tu ne peux pas y répondre) : c'est typique d'un vrai SMS d'opérateur.",
    proche: "Tu connais déjà cette personne. Attention quand même : un compte d'un proche peut être piraté. S'il te demande de l'argent en urgence, appelle-le pour vérifier.",
}

const OPERATEURS = /(mtn|momo|mobile ?money|moov|flooz|celtiis|wave|ecobank|\bboa\b|orabank|\buba\b|nsia|coris|banque|service client)/i
const FORMAT_TRANSACTION = /(vous avez|tu as) re[çc]u|transfert re[çc]u|d[ée]p[ôo]t (de|effectu)|nouveau solde|solde (actuel|disponible)/i
const DEMANDE = /(code|pin|otp|mot de passe)|(envoie|envoyez|renvoie|renvoyez|retourne|payez|paye|d[ée]pose)/i

export function typeExpediteur(exp) {
    const e = String(exp || "").trim()
    if (!e) return "inconnu"
    const chiffres = (e.match(/\d/g) || []).length
    if (/^\+?[\d\s.-]+$/.test(e) && chiffres >= 7) return "numero"
    if (/^\d{2,6}$/.test(e)) return "court"
    return "nom"
}

/**
 * ctx = { expediteur, canal: "sms"|"whatsapp"|"appel"|"autre"|"", repondre: "oui"|"non"|"", premier: "oui"|"non"|"" }
 * Renvoie { risque, indices: [{texte, sens: "danger"|"rassure"}], details }
 */
export function analyserContexte(texte, risqueTexte, ctx = {}) {
    const t = String(texte || "")
    const type = typeExpediteur(ctx.expediteur)
    const nomOperateur = type === "nom" && OPERATEURS.test(ctx.expediteur)
    const seDitOperateur = OPERATEURS.test(t) || nomOperateur
    const formatTransaction = FORMAT_TRANSACTION.test(t)
    const demande = DEMANDE.test(t)
    const canal = ctx.canal || ""
    const indices = []
    let survie = 1 - risqueTexte // probabilité "pas arnaque", qu'on réduit à chaque indice de danger
    const danger = (poids, texteIndice) => { survie *= 1 - poids; indices.push({ texte: texteIndice, sens: "danger" }) }

    if (type === "numero" && formatTransaction)
        danger(0.75, INDICES.transaction_numero)
    else if (type === "numero" && seDitOperateur)
        danger(0.6, INDICES.operateur_numero)
    if ((canal === "whatsapp" || canal === "appel") && seDitOperateur && demande)
        danger(0.55, canal === "appel"
            ? INDICES.appel
            : INDICES.whatsapp)
    if (ctx.repondre === "oui" && (formatTransaction || nomOperateur))
        danger(0.4, INDICES.repondre)
    if (ctx.premier === "oui" && (demande || risqueTexte >= 0.3))
        danger(0.3, INDICES.premier)

    let risque = 1 - survie
    const aucunDanger = indices.length === 0
    if (aucunDanger && type === "nom" && nomOperateur && canal === "sms" && ctx.repondre === "non") {
        if (/\blien\b|https?:|www\.|\.(xyz|top|site|online|click|link)\b|code|pin/i.test(t) && risqueTexte >= 0.5)
            indices.push({ texte: INDICES.faux_nom, sens: "danger" })
        else {
            risque *= 0.4
            indices.push({ texte: INDICES.officiel, sens: "rassure" })
        }
    } else if (aucunDanger && ctx.premier === "non" && !seDitOperateur) {
        risque *= 0.8
        indices.push({ texte: INDICES.proche, sens: "rassure" })
    }
    return { risque: Math.min(0.999, Math.max(0.001, risque)), indices, type }
}

// Verdict complet : texte + contexte
Kora.prototype.analyserComplet = function (texte, ctx) {
    const r = this.analyser(texte)
    const aContexte = ctx && (ctx.expediteur || ctx.canal || ctx.repondre || ctx.premier)
    if (!aContexte) return { ...r, risqueTexte: r.risque, indices: [] }
    const c = analyserContexte(texte, r.risque, ctx)
    const s = this.m.seuils
    const niveau = c.risque >= s.arnaque ? "arnaque" : c.risque >= s.suspect ? "suspect" : "sur"
    let categorie = r.categorie
    if (niveau !== "sur" && categorie === "legitime") {
        const arnaques = this.cat.filter((k) => k !== "legitime")
        categorie = FORMAT_TRANSACTION.test(texte) ? "faux_depot" : arnaques.reduce((a, b) => (r.probas[a] >= r.probas[b] ? a : b))
    }
    if (niveau === "sur") categorie = "legitime"
    const { noms, conseils } = this.m.regles
    return {
        ...r, niveau, categorie, type: noms[categorie], conseil: conseils[categorie],
        emotion: { arnaque: "fache", suspect: "surpris", sur: "content" }[niveau],
        risque: c.risque, risqueTexte: r.risque, indices: c.indices,
        raisons: niveau === "sur" ? [] : (r.raisons.length ? r.raisons : [`Le texte ressemble à : ${noms[categorie].toLowerCase()}.`]),
    }
}
