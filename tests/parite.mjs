// Fait tourner le moteur de l'application (web/kora-engine.js) sur des messages lus en entrée.
// Utilisé par tests/test_parite_js_python.py : entrée JSON { "modele": chemin, "textes": [...] }
import { readFileSync } from "node:fs"
import { Kora, normaliser } from "../web/kora-engine.js"

const { modele, textes } = JSON.parse(readFileSync(0, "utf-8"))
const kora = new Kora(JSON.parse(readFileSync(modele, "utf-8")))
const sortie = textes.map((t) => {
    const r = kora.analyser(t)
    return { normalise: normaliser(t), probas: r.probas, niveau: r.niveau, signaux: kora.signauxTrouves(t).map((s) => s.nom) }
})
process.stdout.write(JSON.stringify(sortie))
