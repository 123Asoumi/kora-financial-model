/* =====================================================================
   BULLES DE TEXTE DE LA MASCOTTE — mises de côté, prêtes à être réutilisées
   ---------------------------------------------------------------------
   La bulle s'affiche à côté de la mascotte (élément #perso-bulle de
   index.html, styles dans la section « bulles de la mascotte »).
   Pour les remettre : passer BULLES_ACTIVES à true. Rien d'autre à changer :
   chaque appel à piloter({ bulle: "…" }) dans app.js garde déjà son texte.
   ===================================================================== */

export const BULLES_ACTIVES = false

// ce que dit la mascotte après un verdict
export const BULLES_VERDICT = {
    arnaque: "Eh!! Eyon l'arnaque c'est pas bien",
    suspect: "Méfie-toi…",
    sur: "Ça a l'air normal.",
}

// dans la discussion, la bulle disparaît seule après ce délai
const DUREE_EN_DISCUSSION = 4500

export function creerBulles(noeud) {
    let minuterie = 0
    if (BULLES_ACTIVES) document.body.classList.add("bulles-actives")
    const cacher = () => { clearTimeout(minuterie); noeud.classList.add("cachee") }
    return {
        cacher,
        // texte vide : on cache la bulle ; texte undefined : on ne touche à rien
        dire(texte, { enDiscussion = false } = {}) {
            if (!BULLES_ACTIVES || texte === undefined) return
            clearTimeout(minuterie)
            if (!texte) { noeud.classList.add("cachee"); return }
            noeud.textContent = texte
            noeud.classList.remove("cachee")
            if (enDiscussion) minuterie = setTimeout(() => noeud.classList.add("cachee"), DUREE_EN_DISCUSSION)
        },
    }
}
