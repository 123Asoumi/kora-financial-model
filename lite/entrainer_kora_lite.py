"""
Entraîne KORA-lite et l'exporte pour l'application web (web/kora_lite.json).

    python data/externes/preparer.py      # une fois : télécharge les vrais messages (stop-arnaque-237)
    python lite/entrainer_kora_lite.py    # données : data/kora_fr.csv + data/externes/stop_arnaque_237.csv
    python lite/entrainer_kora_lite.py data/kora_fr.csv data/kora_fon_brouillon.csv   # autres fichiers

Les vrais messages comptent POIDS_VRAIS_MESSAGES fois plus que les messages synthétiques : ils sont
peu nombreux (267 contre 5 342) mais ressemblent à ce que les gens reçoivent vraiment.

Étapes :
  1. validation croisée groupée (5 plis) : une même phrase à trous, ou une même formulation réelle,
     n'est jamais à la fois en entraînement et en test. Les métriques sont données SÉPARÉMENT pour
     les messages synthétiques et pour les vrais messages (le vrai juge) ;
  2. comparaison avec la référence simple (les règles seules) ;
  3. entraînement final sur toutes les données et export JSON (lu par web/kora-engine.js).
"""
import json
import os
import sys
import time

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import f1_score, roc_auc_score
from sklearn.model_selection import GroupKFold
from sklearn.pipeline import make_pipeline

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RACINE)
import kora_lib  # noqa: E402
from kora_lib import CATEGORIES, normaliser  # noqa: E402

POIDS_VRAIS_MESSAGES = 5  # choisi par lite/comparer_sources.py
SEUILS_TESTES = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8]

VRAIS = os.path.join(RACINE, "data", "externes", "stop_arnaque_237.csv")
fichiers = sys.argv[1:] or [os.path.join(RACINE, "data", "kora_fr.csv")] + ([VRAIS] if os.path.exists(VRAIS) else [])
if not sys.argv[1:] and not os.path.exists(VRAIS):
    print("⚠️  data/externes/stop_arnaque_237.csv absent : lance d'abord python data/externes/preparer.py")
df = pd.concat([pd.read_csv(f) for f in fichiers], ignore_index=True)
df = df.dropna(subset=["texte"]).reset_index(drop=True)
if "modele_id" not in df:
    df["modele_id"] = df.index.astype(str)
if "source" not in df:
    df["source"] = "synthetique"
df["source"] = df["source"].fillna("synthetique")
df["langue"] = df.get("langue", pd.Series("fr", index=df.index)).fillna("fr")
df["vrai"] = df["source"] != "synthetique"
df["poids"] = np.where(df["vrai"], float(POIDS_VRAIS_MESSAGES), 1.0)
df["x"] = df["texte"].map(normaliser)
ID = {c: i for i, c in enumerate(CATEGORIES)}
df["y"] = df["categorie"].map(ID)
print(f"{len(df)} messages ({int(df['vrai'].sum())} vrais) · {df['modele_id'].nunique()} groupes · fichiers : "
      f"{[os.path.relpath(os.path.abspath(f), RACINE) for f in fichiers]}")


def nouveau_modele():
    return make_pipeline(
        TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 5), min_df=2, sublinear_tf=True),
        LogisticRegression(max_iter=4000, C=1, class_weight="balanced"),
    )


def entrainer(d):
    return nouveau_modele().fit(d["x"], d["y"], logisticregression__sample_weight=d["poids"].values)


def mesurer(masque, risque, P):
    """Détection et fausses alertes, pour les messages choisis par le masque."""
    a = (df["y"] != ID["legitime"]).values[masque]
    r = risque[masque]
    m = {
        "messages": int(masque.sum()),
        "arnaques": int(a.sum()),
        "auc_arnaque_vs_normal": round(float(roc_auc_score(a, r)), 4),
        "f1_macro_5_categories": round(float(f1_score(df["y"].values[masque], P[masque].argmax(1), average="macro")), 4),
        "par_seuil": {str(s): {"detection": round(float((r[a] >= s).mean()), 4),
                               "fausses_alertes": round(float((r[~a] >= s).mean()), 4)} for s in SEUILS_TESTES},
    }
    return m


# 1. Validation croisée groupée
P = np.zeros((len(df), len(CATEGORIES)))
for tr, te in GroupKFold(n_splits=5).split(df, df["y"], groups=df["modele_id"]):
    P[te] = entrainer(df.iloc[tr]).predict_proba(df["x"].iloc[te])
risque = 1 - P[:, ID["legitime"]]
synth = (~df["vrai"]).values
metriques = {"synthetiques": mesurer(synth, risque, P)}
if df["vrai"].any():
    vrais = df["vrai"].values
    metriques["vrais_messages"] = mesurer(vrais, risque, P)
    for langue in ("fr", "en"):
        k = vrais & (df["langue"] == langue).values
        if k.sum() >= 20 and len(set(df["y"].values[k] != ID["legitime"])) == 2:
            metriques[f"vrais_messages_{langue}"] = mesurer(k, risque, P)
print(json.dumps({k: {kk: v[kk] for kk in ("messages", "auc_arnaque_vs_normal")} | {"0.5": v["par_seuil"]["0.5"], "0.7": v["par_seuil"]["0.7"]}
                  for k, v in metriques.items()}, indent=1, ensure_ascii=False))

# 2. Référence simple : les règles seules (kora_lib.SIGNAUX), sans modèle
nb_signaux = df["texte"].map(lambda t: len(kora_lib.detecter_signaux(t))).values
arnaque = (df["y"] != ID["legitime"]).values


def regles(masque):
    a, n = arnaque[masque], nb_signaux[masque]
    return {("au_moins_1_signal" if k == 1 else f"au_moins_{k}_signaux"): {
        "detection": round(float((n[a] >= k).mean()), 4),
        "fausses_alertes": round(float((n[~a] >= k).mean()), 4)} for k in (1, 2)}


reference_regles = {"synthetiques": regles(synth)}
if df["vrai"].any():
    reference_regles["vrais_messages"] = regles(df["vrai"].values)
print("Référence règles seules :", json.dumps(reference_regles, ensure_ascii=False))

seuils = {"arnaque": kora_lib.SEUIL_ARNAQUE, "suspect": kora_lib.SEUIL_SUSPECT}

# 3. Modèle final sur toutes les données, puis export
final = entrainer(df)
vec, clf = final.named_steps["tfidfvectorizer"], final.named_steps["logisticregression"]
inv = {i: t for t, i in vec.vocabulary_.items()}
donnees = [os.path.relpath(os.path.abspath(f), RACINE) for f in fichiers]
modele = {
    "nom": "KORA-lite",
    "version": json.load(open(os.path.join(RACINE, "package.json"), encoding="utf-8"))["version"],  # une seule version pour tout KORA-lite
    "date": time.strftime("%Y-%m-%d"),
    "categories": CATEGORIES,
    "ngram": [2, 5],
    "sublinear_tf": True,
    "seuils": seuils,
    "intercept": [round(float(b), 5) for b in clf.intercept_],
    "features": {inv[i]: [round(float(vec.idf_[i]), 4)] + [round(float(w), 4) for w in clf.coef_[:, i]]
                 for i in range(len(inv))},
    "regles": {"signaux": [[n, rx, e] for n, rx, e in kora_lib.SIGNAUX], "noms": kora_lib.NOMS,
               "conseils": kora_lib.CONSEILS},
    "entrainement": {"messages": int(len(df)), "vrais_messages": int(df["vrai"].sum()),
                     "poids_vrais_messages": POIDS_VRAIS_MESSAGES, "donnees": donnees,
                     "validation_croisee": metriques},
}
sortie_web = os.path.join(RACINE, "web", "kora_lite.json")
os.makedirs(os.path.dirname(sortie_web), exist_ok=True)
with open(sortie_web, "w", encoding="utf-8") as f:
    json.dump(modele, f, ensure_ascii=False, separators=(",", ":"))
os.makedirs(os.path.join(RACINE, "resultats"), exist_ok=True)
with open(os.path.join(RACINE, "resultats", "kora_lite_validation_croisee.json"), "w", encoding="utf-8") as f:
    json.dump({"donnees": donnees, "messages": int(len(df)), "poids_vrais_messages": POIDS_VRAIS_MESSAGES,
               **metriques, "reference_regles_seules": reference_regles, "seuils": seuils},
              f, ensure_ascii=False, indent=2)
print(f"✅ {sortie_web} ({os.path.getsize(sortie_web) // 1024} Ko)")
