"""
Entraîne KORA-lite et l'exporte pour l'application web (web/kora_lite.json).

    python lite/entrainer_kora_lite.py                      # données par défaut : data/kora_fr.csv
    python lite/entrainer_kora_lite.py data/kora_fr.csv data/kora_fon_brouillon.csv

Étapes :
  1. validation croisée groupée (5 plis, par phrase à trous) -> métriques honnêtes ;
  2. choix des seuils "suspect" / "arnaque" ;
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

fichiers = sys.argv[1:] or [os.path.join(RACINE, "data", "kora_fr.csv")]
df = pd.concat([pd.read_csv(f) for f in fichiers], ignore_index=True)
df = df.dropna(subset=["texte"]).reset_index(drop=True)
if "modele_id" not in df:
    df["modele_id"] = df.index.astype(str)
df["x"] = df["texte"].map(normaliser)
ID = {c: i for i, c in enumerate(CATEGORIES)}
df["y"] = df["categorie"].map(ID)
print(f"{len(df)} messages · {df['modele_id'].nunique()} modèles de phrases · fichiers : {fichiers}")


def nouveau_modele():
    return make_pipeline(
        TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 5), min_df=2, sublinear_tf=True),
        LogisticRegression(max_iter=4000, C=1, class_weight="balanced"),
    )


# 1. Validation croisée groupée : chaque phrase à trous est soit en entraînement, soit en test
P = np.zeros((len(df), len(CATEGORIES)))
for tr, te in GroupKFold(n_splits=5).split(df, df["y"], groups=df["modele_id"]):
    P[te] = nouveau_modele().fit(df["x"].iloc[tr], df["y"].iloc[tr]).predict_proba(df["x"].iloc[te])
arnaque = (df["y"] != ID["legitime"]).values
risque = 1 - P[:, ID["legitime"]]
metriques = {
    "auc_arnaque_vs_normal": round(float(roc_auc_score(arnaque, risque)), 4),
    "f1_macro_5_categories": round(float(f1_score(df["y"], P.argmax(1), average="macro")), 4),
    "par_seuil": {},
}
for s in [0.3, 0.4, 0.5, 0.6, 0.7, 0.8]:
    metriques["par_seuil"][str(s)] = {
        "detection": round(float((risque[arnaque] >= s).mean()), 4),
        "fausses_alertes": round(float((risque[~arnaque] >= s).mean()), 4),
    }
print(json.dumps(metriques, indent=2, ensure_ascii=False))

# Référence simple : les règles seules (kora_lib.SIGNAUX), sans modèle
nb_signaux = df["texte"].map(lambda t: len(kora_lib.detecter_signaux(t))).values
reference_regles = {
    ("au_moins_1_signal" if k == 1 else f"au_moins_{k}_signaux"): {
        "detection": round(float((nb_signaux[arnaque] >= k).mean()), 4),
        "fausses_alertes": round(float((nb_signaux[~arnaque] >= k).mean()), 4),
    } for k in (1, 2)
}
print("Référence règles seules :", json.dumps(reference_regles, ensure_ascii=False))

# 2. Seuils (réglés dans kora_lib)
seuils = {"arnaque": kora_lib.SEUIL_ARNAQUE, "suspect": kora_lib.SEUIL_SUSPECT}

# 3. Modèle final sur toutes les données, puis export
final = nouveau_modele().fit(df["x"], df["y"])
vec, clf = final.named_steps["tfidfvectorizer"], final.named_steps["logisticregression"]
inv = {i: t for t, i in vec.vocabulary_.items()}
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
    "entrainement": {"messages": int(len(df)), "modeles_de_phrases": int(df["modele_id"].nunique()),
                     "validation_croisee": metriques},
}
sortie_web = os.path.join(RACINE, "web", "kora_lite.json")
os.makedirs(os.path.dirname(sortie_web), exist_ok=True)
with open(sortie_web, "w", encoding="utf-8") as f:
    json.dump(modele, f, ensure_ascii=False, separators=(",", ":"))
os.makedirs(os.path.join(RACINE, "resultats"), exist_ok=True)
with open(os.path.join(RACINE, "resultats", "kora_lite_validation_croisee.json"), "w", encoding="utf-8") as f:
    json.dump({"donnees": [os.path.relpath(os.path.abspath(f), RACINE) for f in fichiers], "messages": int(len(df)), **metriques, "reference_regles_seules": reference_regles, "seuils": seuils}, f, ensure_ascii=False, indent=2)
print(f"✅ {sortie_web} ({os.path.getsize(sortie_web) // 1024} Ko)")
