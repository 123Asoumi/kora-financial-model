// Pont vers l'appli Android de KORA (Capacitor). Dans un navigateur, rien de tout ça n'est actif.
//
// La bulle KORA : la mascotte flotte par-dessus les autres applis. Quand on la touche, elle
// capture l'écran et ouvre KORA, qui lit le message sur la capture (Tesseract, dans le téléphone).
import { Capacitor, registerPlugin } from "./vendor/capacitor-core.js"

export const estAppli = Capacitor.isNativePlatform()
const Bulle = estAppli ? registerPlugin("BulleKora") : null

export const LIEN_APPLI = "https://github.com/123Asoumi/kora-financial-model/releases/latest"

export async function etatBulle() {
    if (!Bulle) return { superposition: false, active: false }
    try { return await Bulle.etat() } catch (_) { return { superposition: false, active: false } }
}

/** Lance la bulle. Renvoie "ok", ou le code d'erreur ("SUPERPOSITION", "CAPTURE", …). */
export async function demarrerBulle() {
    if (!Bulle) return "INDISPONIBLE"
    try { await Bulle.demarrer(); return "ok" } catch (e) { return e?.code || "ERREUR" }
}

export async function arreterBulle() {
    if (Bulle) try { await Bulle.arreter() } catch (_) {}
}

/**
 * surImage(fichier, etiquette) : une capture faite par la bulle, ou une image partagée à KORA.
 * surTexte(texte) : du texte partagé à KORA depuis une autre appli.
 */
export function ecouterAppli({ surImage, surTexte }) {
    if (!Bulle) return
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
export const VoixNative = estAppli ? registerPlugin("VoixKora") : null
