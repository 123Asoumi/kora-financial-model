// Toutes les phrases que KORA peut dire. En mode fon, elles sont traduites d'un seul coup
// par le service fon, ou remplacées par une traduction humaine écrite dans fon.json.
import { INDICES } from "./kora-engine.js"

export const STATUTS = { arnaque: "Arnaque probable", suspect: "Message suspect", sur: "Pas de signe d'arnaque" }

export const PH = {
    normal: "Ça ressemble à un message normal",
    qExpediteurSur: "Pour en être sûr : qui t'a envoyé ce message ?",
    qExpediteur: "Pour savoir si c'est le vrai opérateur ou quelqu'un qui prend son nom : qui t'a envoyé ce message ?",
    qNom: "Quel nom s'affiche comme expéditeur ?",
    qRepondre: "Peux-tu répondre à ce message ? Les vrais SMS automatiques des opérateurs ne permettent pas de répondre.",
    qPremier: "C'est la première fois que cette personne t'écrit ?",
    nsp: "D'accord. Dans le doute, garde ce réflexe : ne donne jamais ton code secret, et vérifie auprès du service client officiel avant d'envoyer de l'argent.",
    change: "Avec ce que tu m'as dit, mon avis change :",
    confirme: "Avec ce que tu m'as dit, je confirme :",
    urgence: "Pas de panique, on agit vite :",
    aucun: "Je n'ai trouvé aucun signe d'arnaque : pas de demande de code, pas d'argent à renvoyer, pas de lien piégé. Reste prudent quand même.",
    merci: "Avec plaisir. Souviens-toi : ton code secret, c'est la clé de ta maison. Tu ne le donnes à personne. Envoie-moi un autre message quand tu veux.",
    salut: "Bonjour ! Colle-moi le message qui te paraît louche (SMS, WhatsApp ou capture d'écran). Je te dis si c'est une arnaque.",
    fonActif: "Je vois que tu écris en fon : je te réponds en fon.",
    pasCompris: "Je n'ai pas bien compris. Touche une des réponses ci-dessous, ou écris-la autrement.",
}

export const ETAPES_URGENCE = [
    "Appelle tout de suite le service client officiel de ton opérateur (le numéro est sur son site ou sur ta puce) et demande de bloquer la transaction.",
    "Change ton code secret Mobile Money.",
    "Garde les captures et le numéro de l'escroc, puis porte plainte au commissariat ou auprès de la police chargée de la cybercriminalité.",
    "Préviens tes proches : l'escroc peut les contacter en utilisant ton nom.",
]

export const PUCES_EXPEDITEUR = [
    ["Un nom (MTN, MobileMoney…)", "nom"],
    ["Un numéro de téléphone", "numero"],
    ["Sur WhatsApp", "whatsapp"],
    ["Un proche", "proche"],
    ["Je ne sais pas", "nsp"],
]
export const PUCES_PREMIER = [["Oui, la première fois", "oui"], ["Non, je la connais", "non"], ["Je ne sais pas", ""]]
export const PUCES_REPONDRE = [["Oui, je peux répondre", "oui"], ["Non", "non"], ["Je ne sais pas", ""]]
export const PUCES_SUITE = [["J'ai déjà payé ou donné le code", "urgence"], ["Pourquoi ?", "pourquoi"], ["Que faire ?", "faire"]]

// Liste complète, pour la traduction d'avance et pour fon.json
export function toutesLesPhrases(regles) {
    const noms = Object.values(regles.noms)
    const liste = [
        ...Object.values(STATUTS), PH.normal, ...Object.values(PH), ...ETAPES_URGENCE,
        ...[PUCES_EXPEDITEUR, PUCES_PREMIER, PUCES_REPONDRE, PUCES_SUITE].flat().map(([label]) => label),
        ...noms, ...Object.values(regles.conseils), ...regles.signaux.map((s) => s[2]),
        ...Object.values(INDICES),
        ...Object.keys(regles.noms).filter((k) => k !== "legitime").flatMap((k) => [
            `Le modèle reconnaît le schéma : ${regles.noms[k].toLowerCase()}.`,
            `Le texte ressemble à : ${regles.noms[k].toLowerCase()}.`,
        ]),
    ]
    return [...new Set(liste)]
}
