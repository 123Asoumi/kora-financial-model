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
