"""
kora_lib.py — la boîte à outils partagée de KORA-0.01
======================================================

Ce fichier est importé par les 4 notebooks. Il contient tout ce qui doit être
IDENTIQUE à l'entraînement et pendant la démo :

  1. les catégories (les "étiquettes" que le modèle apprend à prédire) ;
  2. normaliser()  : le nettoyage du texte, appliqué AVANT le modèle ;
  3. SIGNAUX       : des règles simples qui repèrent les indices d'arnaque ;
  4. expliquer()   : transforme la prédiction du modèle en message clair
                     pour l'utilisateur (verdict, raisons, conseil, émotion de la mascotte).

Pourquoi les explications sont des règles et pas une IA générative ?
-> Une IA générative peut inventer une raison fausse. Une règle, on sait
   exactement pourquoi elle s'est déclenchée : c'est vérifiable et honnête.
   Le modèle décide ("est-ce une arnaque ?"), les règles expliquent ("pourquoi").
"""

import re
import unicodedata

# ---------------------------------------------------------------------------
# 1. Les catégories
# ---------------------------------------------------------------------------
# L'ordre compte : le modèle prédit un numéro (0, 1, 2...) et on retrouve le nom ici.
CATEGORIES = ["legitime", "demande_code", "faux_depot", "faux_gain", "compte_bloque"]

NOMS = {
    "legitime": "Message normal",
    "demande_code": "Demande de code secret (faux agent)",
    "faux_depot": "Faux dépôt / renvoi d'argent",
    "faux_gain": "Faux gain / fausse offre de crédit",
    "compte_bloque": "Faux blocage de compte / lien piégé",
}

CONSEILS = {
    "legitime": "Ce message ressemble à un message normal. Reste quand même vigilant : "
                "ne partage jamais ton code secret.",
    "demande_code": "Ne donne JAMAIS ton code secret, ton code PIN ou un code reçu par SMS. "
                    "Aucun agent de MTN, Moov ou Celtiis ne te le demandera. Raccroche et appelle "
                    "le service client officiel.",
    "faux_depot": "Ne renvoie pas d'argent. Vérifie ton VRAI solde en composant le code officiel "
                  "de ton opérateur. Un SMS peut être faux, ton solde ne ment pas.",
    "faux_gain": "On ne paie jamais de frais pour recevoir un gain ou un prêt. Si tu n'as joué à rien, "
                 "tu n'as rien gagné ; un vrai prêt se signe en agence, sans frais envoyés par Mobile Money. "
                 "N'envoie pas d'argent et ne clique pas.",
    "compte_bloque": "Ne clique pas sur le lien et n'envoie aucun document. Pour vérifier ton compte, "
                     "passe par l'application officielle ou une agence de ton opérateur.",
}

# ---------------------------------------------------------------------------
# 2. Normalisation du texte
# ---------------------------------------------------------------------------
_URL = re.compile(r"(https?://\S+|www\.\S+|\b[\w-]+\.(?:xyz|top|site|online|info|link|click|com|net|org|bj)\b\S*)", re.I)
_TEL = re.compile(r"\+?\d[\d .-]{7,}\d")


def enlever_tons(texte: str) -> str:
    """Retire les accents et les tons (á, à, ǎ, é...) mais garde les lettres fon ɖ, ɛ, ɔ.

    Pourquoi : la transcription de la voix en fon (modèle MMS) écrit les tons,
    alors que les gens écrivent leurs SMS sans. En les retirant partout,
    les deux sources se ressemblent pour le modèle.
    """
    decompose = unicodedata.normalize("NFD", texte)
    sans_marques = "".join(c for c in decompose if unicodedata.category(c) != "Mn")
    return unicodedata.normalize("NFC", sans_marques)


def normaliser(texte: str) -> str:
    """Nettoyage appliqué à TOUS les textes, à l'entraînement comme en démo.

    - minuscules, tons/accents retirés
    - les liens deviennent le mot "lien", les numéros de téléphone "numtel"
      (le modèle doit apprendre la FORME de l'arnaque, pas des numéros précis)
    - espaces multiples réduits
    """
    t = str(texte)
    t = _URL.sub(" lien ", t)
    t = _TEL.sub(" numtel ", t)
    t = enlever_tons(t).lower()
    t = re.sub(r"\s+", " ", t).strip()
    return t


# ---------------------------------------------------------------------------
# 3. Les signaux d'arnaque (règles explicables)
# ---------------------------------------------------------------------------
# Chaque signal = (nom, expression régulière, phrase d'explication).
# Ils s'appliquent au texte normalisé (minuscules, sans accents).
SIGNAUX = [
    ("code",
     r"(envoi|envoy|donne|communiqu|transmet|renvoi|dis[- ]moi|tape|saisi|entre[rz]?|compose).{0,40}"
     r"(code|pin|otp|mot de passe|secret)|(code|pin|otp).{0,25}(recu|reçu|que tu vas recevoir|qui va arriver)",
     "On te demande un code secret ou un code reçu par SMS."),
    ("renvoi",
     r"(renvo|retourne|rembourse|restitue).{0,40}(argent|montant|somme|fonds|difference|f\b|fcfa|ca)|par erreur|erreur de (transfert|depot|envoi)|transaction erronee|trompe de numero",
     "On te demande de renvoyer de l'argent « reçu par erreur »."),
    ("frais",
     r"(frais|payer|paie[sz]?|envoye[rz]?|depose[rz]?).{0,40}(pour (retirer|recevoir|debloquer|valider|activer)|d'inscription|de dossier|de retrait)|"
     r"pour (retirer|recevoir|debloquer|valider|activer|la livraison).{0,60}(frais|payer|paie[sz]?|envoye[rz]?)|frais d'(activation|inscription|dossier)",
     "On te demande de payer des frais pour recevoir quelque chose."),
    ("gain",
     r"(felicitation|gagn|gagnant|loterie|tirage|lot |cadeau|bonus|promo|jackpot|x2|x3|double)",
     "On te promet un gain, un bonus ou un cadeau."),
    ("credit",
     r"(pret|credit|microfinance|financement).{0,60}(sans (garantie|justificatif|interet)|approuve|accorde|disponible|rapide|urgent)|"
     r"(pret|credit).{0,60}(frais|assurance|timbre|activation)",
     "On te propose un prêt trop facile, ou qui demande de payer avant de recevoir."),
    ("blocage",
     r"(bloqu|suspendu|suspension|desactiv|ferme|cloture|expir).{0,40}(compte|sim|carte|numero|momo|money)|"
     r"(compte|sim|carte|numero).{0,40}(bloqu|suspendu|desactiv|ferme|cloture|expir)",
     "On te menace de bloquer ton compte ou ta SIM."),
    ("lien",
     r"\blien\b|cliqu|telecharg|installe",
     "Le message contient un lien ou te demande d'installer une application."),
    ("urgence",
     r"urgent|immediatement|tout de suite|vite|dans les \d+ ?h|sous \d+ ?h|dernier delai|avant ce soir|maintenant|sinon",
     "Le message te met la pression pour agir vite."),
    ("identite",
     r"(piece d'identite|cni|carte d'identite|photo de (ta|votre) (carte|piece)|selfie|date de naissance)",
     "On te demande tes papiers ou tes informations personnelles."),
    ("faux_agent",
     r"(service client|agent|conseiller|technicien|responsable).{0,30}(mtn|moov|celtiis|momo|money|banque)|"
     r"(mtn|moov|celtiis).{0,20}(service|agent)",
     "La personne se présente comme un agent de l'opérateur ou de la banque."),
]
_SIGNAUX_COMPILES = [(n, re.compile(rx), e) for n, rx, e in SIGNAUX]

# Indices de PROTECTION : typiques des vrais messages officiels (on ne les affiche pas,
# mais le modèle hybride s'en sert pour éviter les fausses alertes).
PROTECTIONS = [
    ("ne_partage_pas", r"ne (le |la |les |l'|la lui |le lui )?(communiquez|partagez|donnez|transmettez|divulguez|communique|partage|donne)|"
                       r"ne .{0,25}jamais|jamais votre code|a personne|ignorez ce message|ne vous demandera jamais"),
    ("aucun_frais", r"aucun(s)? frais|sans frais|gratuit(ement)? en agence|signature en agence"),
    ("format_officiel", r"(nouveau solde|solde disponible|solde principal|id transaction|trx id|ref(erence)? \w|reference \w)"),
    ("relation_proche", r"\b(maman|papa|mon fils|ma fille|tonton|tata|cherie|bebe|frangin)\b"),
]
_PROTECTIONS_COMPILES = [(n, re.compile(rx)) for n, rx in PROTECTIONS]
NOMS_TRAITS = [n for n, _, _ in SIGNAUX] + [n for n, _ in PROTECTIONS]


def traits(texte: str):
    """Vecteur 0/1 : chaque signal d'arnaque puis chaque indice de protection (pour le modèle hybride)."""
    t = normaliser(texte)
    return [1.0 if rx.search(t) else 0.0 for _, rx, _ in _SIGNAUX_COMPILES] + \
           [1.0 if rx.search(t) else 0.0 for _, rx in _PROTECTIONS_COMPILES]


def detecter_signaux(texte: str):
    """Renvoie la liste des signaux trouvés dans le texte : [(nom, explication), ...]."""
    t = normaliser(texte)
    return [(n, e) for n, rx, e in _SIGNAUX_COMPILES if rx.search(t)]


# ---------------------------------------------------------------------------
# 4. Expliquer la décision
# ---------------------------------------------------------------------------
SEUIL_ARNAQUE = 0.70   # au-dessus : "Arnaque probable" (choisi par validation croisée : ~3 % de fausses alertes)
SEUIL_SUSPECT = 0.50   # entre les deux : "Suspect" (on monte à ~97 % des arnaques signalées)


def expliquer(texte: str, probas: dict) -> dict:
    """Transforme les probabilités du modèle en réponse claire.

    probas : {"legitime": 0.05, "demande_code": 0.90, ...} (la somme fait 1)

    Le "risque" = 1 - probabilité que le message soit légitime.
    """
    risque = 1.0 - float(probas.get("legitime", 0.0))
    categorie_arnaque = max((c for c in CATEGORIES if c != "legitime"), key=lambda c: probas.get(c, 0.0))
    signaux = detecter_signaux(texte)

    if risque >= SEUIL_ARNAQUE:
        niveau, titre, emotion = "arnaque", "⛔ Arnaque probable", "fache"
    elif risque >= SEUIL_SUSPECT:
        niveau, titre, emotion = "suspect", "⚠️ Message suspect", "surpris"
    else:
        niveau, titre, emotion = "sur", "✅ Pas de signe d'arnaque", "content"

    categorie = categorie_arnaque if niveau != "sur" else "legitime"
    raisons = [e for _, e in signaux] if niveau != "sur" else []
    if niveau != "sur" and not raisons:
        raisons = [f"Le modèle reconnaît le schéma : {NOMS[categorie_arnaque].lower()}."]

    return {
        "niveau": niveau,
        "titre": titre,
        "risque": round(risque, 3),
        "categorie": categorie,
        "type": NOMS[categorie],
        "raisons": raisons,
        "conseil": CONSEILS[categorie],
        "emotion": emotion,
    }
