"""
Test de parité : l'application (web/kora-engine.js) donne-t-elle EXACTEMENT les mêmes
résultats que Python (kora_lib + scikit-learn) ?

Le moteur JS refait à la main le nettoyage du texte, le TF-IDF par n-grammes de caractères
et la régression logistique. Une petite différence (un accent, une regex, un arrondi)
passerait inaperçue dans l'appli : ce test la détecte.

    pip install scikit-learn pandas numpy pytest
    python -m pytest tests/          # nécessite Node.js (v20 ou plus)

Côté Python, on reconstruit un vrai TfidfVectorizer + LogisticRegression de scikit-learn
à partir de web/kora_lite.json (les mêmes poids que l'appli), puis on compare sur
des messages du jeu de données et sur des cas pièges.
"""
import json
import os
import shutil
import subprocess
import sys

import numpy as np
import pandas as pd
import pytest
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RACINE)
import kora_lib  # noqa: E402

MODELE = os.path.join(RACINE, "web", "kora_lite.json")
TOLERANCE = 1e-6  # écart maximal accepté sur une probabilité

# Cas pièges : accents, tons et lettres fon, liens, numéros, emojis, majuscules, espaces bizarres
PIEGES = [
    "",
    "   ",
    "Bonjour maman, tu vas bien ?",
    "Ɖɔ nu mi ! Akwɛ ɖé wá ? Mǐ ná sɔ́ akwɛ̌ ɔ.",
    "VOUS AVEZ REÇU 25 000 FCFA DE KOFFI (01 97 12 34 56). NOUVEAU SOLDE : 40 000 FCFA.",
    "Félicitations 🎉🎁 ! Vous avez gagné 500.000F. Cliquez ici : https://mtn-bonus.xyz/gain?id=42",
    "Ton compte MoMo sera bloqué sous 24h. Va sur www.moov-securite.top pour le débloquer",
    "Agent MTN : dis-moi le code que tu vas recevoir, c'est urgent !!!",
    "Prêt rapide sans garantie, frais de dossier 5000F à envoyer au +229 61 23 45 67",
    "Je me suis trompé de numéro, renvoie-moi les 10.000 stp",
    "Ton code de vérification est 482913. Ne le communiquez à personne.",
    "tab\tet\nretour   à   la   ligne",
    "été (accents décomposés) et été (accents composés)",
    "x" * 300,
    "mtn.bj moov.com celtiis.net exemple.org",
]


def _messages():
    df = pd.read_csv(os.path.join(RACINE, "data", "kora_fr.csv"))
    # tous les modèles de phrases représentés, puis un échantillon fixe
    un_par_modele = df.groupby("modele_id").head(1)
    echantillon = df.sample(n=200, random_state=0)
    return PIEGES + list(pd.concat([un_par_modele, echantillon])["texte"].astype(str))


def _modele_sklearn(m):
    """Reconstruit le pipeline scikit-learn exact à partir du JSON exporté pour l'appli."""
    grammes = list(m["features"])
    vec = TfidfVectorizer(analyzer="char_wb", ngram_range=tuple(m["ngram"]), sublinear_tf=m["sublinear_tf"],
                          vocabulary={g: i for i, g in enumerate(grammes)})
    vec.fit(["a"])  # obligatoire avant de fixer les poids idf
    vec.idf_ = np.array([m["features"][g][0] for g in grammes])
    clf = LogisticRegression()
    clf.classes_ = np.arange(len(m["categories"]))
    clf.coef_ = np.array([m["features"][g][1:] for g in grammes]).T
    clf.intercept_ = np.array(m["intercept"])
    return vec, clf


@pytest.fixture(scope="module")
def resultats():
    if not shutil.which("node"):
        pytest.skip("Node.js n'est pas installé")
    with open(MODELE, encoding="utf-8") as f:
        m = json.load(f)
    textes = _messages()
    entree = json.dumps({"modele": MODELE, "textes": textes})
    js = json.loads(subprocess.run(["node", os.path.join(RACINE, "tests", "parite.mjs")], input=entree,
                                   capture_output=True, text=True, check=True, encoding="utf-8").stdout)
    vec, clf = _modele_sklearn(m)
    py = clf.predict_proba(vec.transform([kora_lib.normaliser(t) for t in textes]))
    return m, textes, js, py


def test_meme_nettoyage(resultats):
    _, textes, js, _ = resultats
    ecarts = [(t, r["normalise"], kora_lib.normaliser(t)) for t, r in zip(textes, js)
              if r["normalise"] != kora_lib.normaliser(t)]
    assert not ecarts, f"{len(ecarts)} textes nettoyés différemment, ex. (texte, JS, Python) : {ecarts[:3]}"


def test_memes_probabilites(resultats):
    m, textes, js, py = resultats
    pj = np.array([[r["probas"][c] for c in m["categories"]] for r in js])
    ecart = np.abs(pj - py).max(axis=1)
    pire = int(ecart.argmax())
    assert ecart.max() < TOLERANCE, f"écart max {ecart.max():.2e} sur : {textes[pire]!r}"


def test_memes_verdicts(resultats):
    m, textes, js, py = resultats
    s = m["seuils"]
    attendu = ["arnaque" if r >= s["arnaque"] else "suspect" if r >= s["suspect"] else "sur" for r in 1 - py[:, 0]]
    differents = [(t, r["niveau"], a) for t, r, a in zip(textes, js, attendu) if r["niveau"] != a]
    assert not differents, f"{len(differents)} verdicts différents, ex. : {differents[:3]}"


def test_memes_signaux(resultats):
    _, textes, js, _ = resultats
    differents = [(t, r["signaux"], [n for n, _ in kora_lib.detecter_signaux(t)]) for t, r in zip(textes, js)
                  if r["signaux"] != [n for n, _ in kora_lib.detecter_signaux(t)]]
    assert not differents, f"{len(differents)} textes avec des signaux différents, ex. : {differents[:3]}"


def test_modele_a_jour_avec_kora_lib():
    """Les règles, noms, conseils et seuils embarqués dans l'appli sont ceux de kora_lib."""
    with open(MODELE, encoding="utf-8") as f:
        m = json.load(f)
    assert m["categories"] == kora_lib.CATEGORIES
    assert m["regles"]["signaux"] == [list(s) for s in kora_lib.SIGNAUX]
    assert m["regles"]["noms"] == kora_lib.NOMS
    assert m["regles"]["conseils"] == kora_lib.CONSEILS
    assert m["seuils"] == {"arnaque": kora_lib.SEUIL_ARNAQUE, "suspect": kora_lib.SEUIL_SUSPECT}
