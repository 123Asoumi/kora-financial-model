// Pont vers l'appli Android de KORA (Capacitor) et vers l'appli de bureau Windows (Electron, dossier desktop/).
// Dans un navigateur, rien de tout ça n'est actif.
//
// La bulle KORA : la mascotte flotte par-dessus les autres applis. Quand on la touche, elle
// capture l'écran et ouvre KORA, qui lit le message sur la capture (Tesseract, dans l'appareil).
import { Capacitor, registerPlugin } from "./vendor/capacitor-core.js"

export const estBureau = !!globalThis.koraBureau // l'appli Windows : desktop/preload-kora.js
export const estAndroid = Capacitor.isNativePlatform()
export const estAppli = estAndroid || estBureau
const Bulle = estAndroid ? registerPlugin("BulleKora") : null

export const LIEN_APPLI = "https://github.com/123Asoumi/kora-financial-model/releases/latest"

export async function etatBulle() {
    if (estBureau) try { return await globalThis.koraBureau.etatBulle() } catch (_) { return { superposition: false, active: false } }
    if (!Bulle) return { superposition: false, active: false }
    try { return await Bulle.etat() } catch (_) { return { superposition: false, active: false } }
}

/** Lance la bulle. Renvoie "ok", ou le code d'erreur ("SUPERPOSITION", "CAPTURE", …). */
export async function demarrerBulle() {
    if (estBureau) try { return await globalThis.koraBureau.demarrerBulle() } catch (e) { return e?.code || "ERREUR" }
    if (!Bulle) return "INDISPONIBLE"
    try { await Bulle.demarrer(); return "ok" } catch (e) { return e?.code || "ERREUR" }
}

export async function arreterBulle() {
    if (estBureau) { try { await globalThis.koraBureau.arreterBulle() } catch (_) {} return }
    if (Bulle) try { await Bulle.arreter() } catch (_) {}
}

/**
 * surImage(fichier, etiquette) : une capture faite par la bulle, ou une image partagée à KORA.
 * surTexte(texte) : du texte partagé à KORA depuis une autre appli.
 * surAppel() : « Suivre un appel » choisi sur la bulle.
 */
export function ecouterAppli({ surImage, surTexte, surAppel }) {
    if (estBureau) {
        globalThis.koraBureau.surCapture(({ png, etiquette }) => surImage(new File([png], "capture.png", { type: "image/png" }), etiquette))
        return
    }
    if (!Bulle) return
    Bulle.addListener("appel", () => surAppel?.())
    Bulle.addListener("capture", async ({ chemin, etiquette }) => {
        try {
            const reponse = await fetch(Capacitor.convertFileSrc(chemin))
            const image = await reponse.blob()
            surImage(new File([image], "capture.png", { type: image.type.startsWith("image/") ? image.type : "image/png" }), etiquette)
        } catch (_) {}
    })
    Bulle.addListener("texte", ({ texte }) => surTexte(texte))
}

// La voix de KORA dans l'appli : voix française et dictée française du téléphone (VoixKoraPlugin).
// Le moteur web d'Android n'a ni speechSynthesis ni reconnaissance vocale.
export const VoixNative = estAndroid ? registerPlugin("VoixKora") : null

// Mises à jour de l'appli Android (installée hors Play Store) : au démarrage, KORA regarde la dernière
// version publiée sur GitHub. S'il y en a une plus récente, il propose de la télécharger et d'ouvrir
// l'installateur d'Android (même clé de signature, donc les données sont gardées).
const MiseAJour = estAndroid ? registerPlugin("MiseAJour") : null
const API_VERSIONS = "https://api.github.com/repos/123Asoumi/kora-financial-model/releases/latest"

export function plusRecente(a, b) { // "1.0.10" > "1.0.9"
    const x = String(a).replace(/^v/, "").split(".").map(Number), y = String(b).replace(/^v/, "").split(".").map(Number)
    for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0)
    return false
}

/** La dernière version publiée si elle est plus récente que celle installée, sinon null. */
export async function chercherMiseAJour() {
    if (!MiseAJour) return null
    const { version } = await MiseAJour.version()
    const r = await fetch(API_VERSIONS, { headers: { Accept: "application/vnd.github+json" }, cache: "no-store" })
    if (!r.ok) throw new Error(`GitHub ${r.status}`)
    const v = await r.json()
    const apk = (v.assets || []).find((a) => a.name.endsWith(".apk"))
    if (!apk || !plusRecente(v.tag_name, version)) return { aJour: true, version }
    const sha256 = (apk.digest || "").replace(/^sha256:/, "") || (String(v.body || "").match(/SHA-256 de l'APK : `([0-9a-f]{64})`/) || [])[1] || ""
    return { aJour: false, version, nouvelle: v.tag_name.replace(/^v/, ""), url: apk.browser_download_url, sha256, taille: apk.size, notes: v.body || "" }
}

export async function installerMiseAJour(maj, surProgres) {
    const ecoute = await MiseAJour.addListener("progres", ({ pourcent }) => surProgres?.(pourcent))
    try { await MiseAJour.installer({ url: maj.url, sha256: maj.sha256 }) } finally { ecoute.remove() }
}

/** Un appel (téléphone ou WhatsApp) est-il en cours ? { enCours, haut } ou null hors de l'appli Android. */
export async function etatAppel() {
    if (!VoixNative) return null
    try { return await VoixNative.etatAppel() } catch (_) { return null }
}
