// Les réponses de KORA quand l'assistant en ligne ne répond pas (quota du GPU gratuit épuisé, pas d'internet…).
// Écrites et vérifiées à la main : jamais un conseil inventé. La première règle qui reconnaît la question gagne.
// Chaque réponse finit par un geste concret. Les conseils suivent ceux de la carte de verdict et d'ETAPES_URGENCE.

const R = [
    // déjà victime : agir tout de suite
    [/(d[ée]j[àa]|j'ai) (donn[ée]|envoy[ée]|pay[ée]|transf[ée]r[ée]|valid[ée])|on m'a (vol[ée]|arnaqu)|je me suis fait (avoir|arnaquer)|j'ai [ée]t[ée] (arnaqu|vol)|perdu mon argent/i,
        "Agis vite. 1) Appelle tout de suite le service client officiel de ton opérateur pour bloquer la transaction. 2) Change ton code secret. 3) Garde les captures et le numéro de l'escroc, puis porte plainte au commissariat. 4) Préviens tes proches : l'escroc peut utiliser ton nom."],
    // le faux dépôt
    [/(d[ée]p[ôo]t|envoy[ée]|transf[ée]r[ée]).{0,30}(par )?erreur|renvoy|rembours|trompé de num[ée]ro/i,
        "C'est le piège du faux dépôt. Ne renvoie rien. Vérifie d'abord ton vrai solde avec le code de ton opérateur (pas avec le SMS). Si l'argent n'y est pas, c'est une arnaque. S'il est vraiment arrivé, c'est l'opérateur qui annule la transaction, pas toi."],
    // le faux agent, le faux service client
    [/(faux|vrai) agent|agent (mtn|moov|celtiis)|service client|reconna[îi]tre|se fait passer|compte (bloqu|suspendu)|d[ée]bloquer/i,
        "Un vrai agent ne te demande jamais ton code secret, ton PIN ou un code reçu par SMS, ni de l'argent pour débloquer ton compte. Il ne te presse pas. Au moindre doute : raccroche et appelle toi-même le service client officiel de ton opérateur."],
    // le compte WhatsApp d'un proche
    [/whatsapp|un (ami|proche|parent)|mon (fr[èe]re|cousin|oncle)|ma (s[œo]eur|tante|m[èe]re)|pirat/i,
        "Si un proche te demande de l'argent ou un code en urgence sur WhatsApp, appelle-le sur son numéro habituel avant tout : son compte a peut-être été piraté. Et ne donne jamais un code à 6 chiffres reçu par SMS : c'est la clé de ton propre WhatsApp."],
    // liens et applis
    [/lien|cliquer|clique|site|t[ée]l[ée]charg|installer|appli(cation)? (inconnue|bizarre)/i,
        "Ne clique pas et n'installe rien. Les opérateurs n'envoient pas de lien pour débloquer un compte ou toucher un gain. Un lien peut voler tes accès. Pour vérifier, envoie-moi une capture du message."],
    // prêt avec frais
    [/pr[êe]t|cr[ée]dit|emprunt|frais de dossier/i,
        "Un vrai prêt ne demande jamais de payer des frais avant de recevoir l'argent. Si on te demande de payer d'abord, c'est une arnaque."],
    // faux gain
    [/gagn|gain|tirage|loterie|promo(tion)?|cadeau|bonus/i,
        "Si tu dois payer, ou donner un code, pour recevoir un gain, c'est une arnaque. Les vraies promotions ne demandent ni code ni frais."],
    // le code en général
    [/\b(code|pin|mot de passe|otp)\b/i,
        "Ton code secret, ton PIN et les codes reçus par SMS ne se donnent à personne : ni à un agent, ni à un proche, ni à moi. Personne de sérieux ne te les demandera."],
    // le solde
    [/solde|v[ée]rifier (mon|si)|argent (est|bien) arriv/i,
        "Pour connaître ton vrai solde, compose le code de ton opérateur ou ouvre son appli officielle. Ne te fie jamais à un SMS envoyé depuis un numéro ordinaire."],
    // les fonctions de KORA
    [/appel|t[ée]l[ée]phone (sonne|appelle)|suivre|[ée]couter/i,
        "Pendant un appel suspect, mets le haut-parleur, touche la bulle KORA, puis « Suivre un appel ». À la fin, je te dis si c'est une arnaque. Tu trouves aussi « Suivre un appel » dans le menu de la mascotte."],
    [/capture|bulle|[ée]cran|image|photo/i,
        "Touche la bulle KORA sur n'importe quelle appli, puis « Capture de l'écran » : je lis le message et je te dis si c'est une arnaque. Dans l'appli, le bouton image de la barre de message marche aussi."],
    [/donn[ée]es|confidentiel|vie priv[ée]e|espion|s[ée]curit[ée]/i,
        "Les messages en français sont analysés dans ton téléphone. Le fon, les appels et la discussion passent par notre service en ligne, sans compte et sans ton nom. Ton historique reste sur ton téléphone : tu peux l'effacer dans Paramètres."],
    [/\bfon\b|fɔngbe|fongbe|ma langue/i,
        "Touche « FR » en haut pour passer en fon : tu peux m'écrire ou me parler en fon, et je te réponds en fon."],
]

const PAR_DEFAUT = "Je n'ai pas de réponse précise à ça pour le moment. Retiens les deux règles d'or : ne donne jamais ton code, et vérifie toujours auprès du service client officiel. Si quelque chose te paraît louche, envoie-moi une capture ou suis l'appel avec moi."

/** Une réponse sûre à une question, sans internet. */
export function reponseLocale(question) {
    const t = String(question || "")
    for (const [motif, reponse] of R) if (motif.test(t)) return reponse
    return PAR_DEFAUT
}
