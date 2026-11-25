"""
Quelles données font vraiment progresser KORA-lite ? On le mesure sur de VRAIS messages.

    python data/externes/preparer.py --tout
    python lite/comparer_sources.py          # -> resultats/comparaison_sources.json

Protocole : validation croisée groupée (5 plis) sur les 267 vrais messages de stop-arnaque-237.
Chaque vrai message est prédit par un modèle qui ne l'a jamais vu (ni lui, ni une formulation identique).
Les autres sources sont toujours dans l'entraînement.
"""
import json
import os
import sys

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import GroupKFold
from sklearn.pipeline import make_pipeline

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RACINE)
from kora_lib import CATEGORIES, normaliser  # noqa: E402

ID = {c: i for i, c in enumerate(CATEGORIES)}
SYNTH = pd.read_csv(os.path.join(RACINE, "data", "kora_fr.csv"))[["texte", "categorie"]]
VRAIS = pd.read_csv(os.path.join(RACINE, "data", "externes", "stop_arnaque_237.csv"))
ANGLAIS_CSV = os.path.join(RACINE, "data", "externes", "brut", "conversations_anglaises.csv")
ANGLAIS = pd.read_csv(ANGLAIS_CSV)[["texte", "categorie"]] if os.path.exists(ANGLAIS_CSV) else None


def evaluer(avec_vrais, avec_anglais, poids_vrais=1):
    risque = np.zeros(len(VRAIS))
    for tr, te in GroupKFold(5).split(VRAIS, groups=VRAIS["modele_id"]):
        parts = [SYNTH.assign(poids=1.0)]
        if avec_vrais:
            parts.append(VRAIS.iloc[tr][["texte", "categorie"]].assign(poids=float(poids_vrais)))
        if avec_anglais:
            parts.append(ANGLAIS.assign(poids=1.0))
        d = pd.concat(parts)
        m = make_pipeline(TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 5), min_df=2, sublinear_tf=True),
                          LogisticRegression(max_iter=4000, C=1, class_weight="balanced"))
        m.fit(d["texte"].map(normaliser), d["categorie"].map(ID), logisticregression__sample_weight=d["poids"].values)
        risque[te] = 1 - m.predict_proba(VRAIS.iloc[te]["texte"].map(normaliser))[:, ID["legitime"]]
    resultat = {}
    for nom, k in (("tous", np.ones(len(VRAIS), bool)), ("fr", (VRAIS["langue"] == "fr").values),
                   ("en", (VRAIS["langue"] == "en").values)):
        a, r = (VRAIS["categorie"] != "legitime").values[k], risque[k]
        resultat[nom] = {"messages": int(k.sum()), "auc": round(float(roc_auc_score(a, r)), 3),
                         **{f"seuil_{s}": {"detection": round(float((r[a] >= s).mean()), 3),
                                           "fausses_alertes": round(float((r[~a] >= s).mean()), 3)} for s in (0.5, 0.7)}}
    return resultat


essais = {
    "1_synthetique_seul (ancien KORA-lite)": (False, False, 1),
    "2_plus_vrais_messages": (True, False, 1),
    "3_plus_vrais_messages_poids_5 (retenu)": (True, False, 5),
    "4_plus_vrais_messages_poids_10": (True, False, 10),
}
if ANGLAIS is not None:
    essais["5_plus_vrais_messages_et_conversations_anglaises"] = (True, True, 1)
    essais["6_plus_conversations_anglaises_seules"] = (False, True, 1)
else:
    print("(conversations anglaises absentes : python data/externes/preparer.py --tout)")

resultats = {}
for nom, (v, a, p) in essais.items():
    resultats[nom] = evaluer(v, a, p)
    t = resultats[nom]
    print(f"{nom:52s} AUC tous {t['tous']['auc']:.3f} · fr {t['fr']['auc']:.3f} · en {t['en']['auc']:.3f}")
with open(os.path.join(RACINE, "resultats", "comparaison_sources.json"), "w", encoding="utf-8") as f:
    json.dump({"protocole": "validation croisée groupée (5 plis) sur les 267 vrais messages de stop-arnaque-237",
               "essais": resultats}, f, ensure_ascii=False, indent=2)
print("✅ resultats/comparaison_sources.json")
