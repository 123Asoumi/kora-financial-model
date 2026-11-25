"""
Prépare les jeux de données externes de KORA-lite.

    pip install pandas pyarrow huggingface_hub kagglehub
    python data/externes/preparer.py            # vrais messages + sondage (ce qui sert à l'entraînement)
    python data/externes/preparer.py --tout     # + conversations en anglais (pour lite/comparer_sources.py)

Ce que fait chaque source, et pourquoi (mesuré par lite/comparer_sources.py) :

| Source | Contenu | Utilisation |
|---|---|---|
| kadian-arch/stop-arnaque-237 (CC-BY-4.0) | 267 VRAIS messages du Cameroun (MTN, Orange), arnaques et messages normaux, français et anglais | entraînement (poids 5) ET test sur de vrais messages -> data/externes/stop_arnaque_237.csv |
| menaattia/phone-scam-dataset | 4 000 conversations téléphoniques en anglais | non retenu : fait baisser la détection sur les vrais messages |
| teeconnie/scam-and-non-scam-call-conversation-dataset (Kaggle) | 800 conversations en anglais | non retenu, même raison |
| togbemismadjisosthne/mobile-money-phone-scam-survey-dataset (Kaggle) | sondage de 800 personnes (Ngaoundéré) | pas de messages : chiffres de contexte -> resultats/sondage_mobile_money.json |
| electricsheepafrica/africa-mobile-money-fraud-dataset | 10 000 transactions (tableau, synthétique) | non retenu : pas de texte, KORA lit des messages |
| JaimeMaLangue/JML-fon-speech-v1 (CC-BY-SA-4.0) | enregistrements audio en fon | reconnaissance vocale fon : notebooks 3 et 5 |

Les textes dont la licence n'est pas publiée (menaattia, teeconnie, sondage) ne sont pas recopiés dans le
dépôt : ils sont téléchargés dans data/externes/brut/ (ignoré par git).
"""
import json
import os
import re
import sys

import pandas as pd

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.dirname(os.path.dirname(ICI))
BRUT = os.path.join(ICI, "brut")
sys.path.insert(0, RACINE)
from kora_lib import normaliser  # noqa: E402

os.environ.setdefault("HF_HUB_DISABLE_XET", "1")  # téléchargement HTTP classique, plus simple derrière un proxy

# Types d'arnaque de stop-arnaque-237 -> les 5 catégories de KORA (le premier type reconnu l'emporte)
TYPES_VERS_KORA = [
    ("demande_code", {"credential_request", "fake_agent_support", "sim_swap"}),
    ("faux_depot", {"wrong_number_reversal", "deposit_withdrawal_trap", "family_emergency", "hacked_account_money"}),
    ("compte_bloque", {"account_blocked", "phishing_link"}),
    ("faux_gain", {"fake_prize_promo", "advance_fee", "loan_scam", "investment_ponzi_crypto", "fake_job",
                   "fake_concours_admission", "fake_scholarship_visa", "fake_document", "fake_seller_delivery",
                   "romance", "threat_extortion", "official_impersonation", "fake_social_profile"}),
]

# Pour les conversations anglaises (sans type d'arnaque) : des mots-clés
MOTS_ANGLAIS = [
    ("demande_code", r"\b(otp|pin|password|passcode|verification code|security code|login|credentials?|card (number|details)|cvv|ssn)\b"),
    ("faux_depot", r"\b(by mistake|wrong(ly)? (sent|transferred|number)|overpa(id|yment)|send (it|the money) back|accidentally (sent|transferred))\b"),
    ("compte_bloque", r"\b(suspend|block|lock|deactivat|frozen|freeze|unauthori[sz]ed|compromised|verify your account|link)\w*"),
]


def categorie_stop_arnaque(label, types):
    if label == "not_scam":
        return "legitime"
    for categorie, ensemble in TYPES_VERS_KORA:
        if ensemble & set(types):
            return categorie
    return "faux_gain"


def categorie_anglaise(arnaque, texte):
    if not arnaque:
        return "legitime"
    t = texte.lower()
    return next((c for c, rx in MOTS_ANGLAIS if re.search(rx, t)), "faux_gain")


def groupe(texte):
    """Les messages de même formulation restent ensemble (jamais l'un en entraînement et l'autre en test)."""
    return "vrai_" + normaliser(texte)[:40]


def stop_arnaque_237():
    from huggingface_hub import hf_hub_download
    parties = []
    for split in ("train", "test"):
        chemin = hf_hub_download("kadian-arch/stop-arnaque-237", f"data/{split}.parquet", repo_type="dataset",
                                 local_dir=os.path.join(BRUT, "stop-arnaque-237"))
        parties.append(pd.read_parquet(chemin))
    df = pd.concat(parties, ignore_index=True)
    sortie = pd.DataFrame({
        "texte": df["text"],
        "categorie": [categorie_stop_arnaque(l, t) for l, t in zip(df["label"], df["scam_types"])],
        "modele_id": df["text"].map(groupe),
        "split": df["split"],
        "langue": df["language"],
        "source": "stop_arnaque_237",
        "id_source": df["id"],
        "types_source": df["scam_types"].map(lambda t: "|".join(t)),
        "canal": df["channel"],
    })
    fichier = os.path.join(ICI, "stop_arnaque_237.csv")
    sortie.to_csv(fichier, index=False)
    print(f"{fichier} : {len(sortie)} vrais messages", sortie["categorie"].value_counts().to_dict())


def conversations_anglaises():
    from huggingface_hub import hf_hub_download
    import kagglehub
    lignes = []
    for f in ("train_dataset.csv", "test_dataset.csv"):
        chemin = hf_hub_download("menaattia/phone-scam-dataset", f, repo_type="dataset",
                                 local_dir=os.path.join(BRUT, "menaattia"))
        for texte, label in pd.read_csv(chemin)[["dialogue", "label"]].itertuples(index=False):
            lignes.append((texte, categorie_anglaise(label == 1, texte), "menaattia_phone_scam"))
    dossier = kagglehub.dataset_download("teeconnie/scam-and-non-scam-call-conversation-dataset")
    for f, arnaque in (("English_Scam.txt", True), ("English_NonScam.txt", False)):
        with open(os.path.join(dossier, f), encoding="utf-8", errors="replace") as fichier:
            brut = fichier.read()
        for morceau in re.split(r"\n\s*\n|\n\s*\d+\.\s", "\n" + brut):
            morceau = re.sub(r"^\s*\d+\.\s*", "", morceau).strip()
            if len(morceau) > 30:
                lignes.append((morceau, categorie_anglaise(arnaque, morceau), "teeconnie_calls"))
    df = pd.DataFrame(lignes, columns=["texte", "categorie", "source"])
    df["modele_id"] = [f"{s}_{i}" for i, s in enumerate(df["source"])]
    df["langue"] = "en"
    os.makedirs(BRUT, exist_ok=True)
    fichier = os.path.join(BRUT, "conversations_anglaises.csv")
    df.to_csv(fichier, index=False)
    print(f"{fichier} : {len(df)} conversations", df["categorie"].value_counts().to_dict())


def sondage():
    import kagglehub
    dossier = kagglehub.dataset_download("togbemismadjisosthne/mobile-money-phone-scam-survey-dataset")
    chemin = next(os.path.join(r, f) for r, _, fs in os.walk(dossier) for f in fs if f.endswith("_fr.csv"))
    df = pd.read_csv(chemin)
    df.columns = [c.strip() for c in df.columns]
    victimes = df["Avez-vous déjà été victime d’une arnaque ?"].str.strip()
    methodes = df["Comment l’arnaque s’est-elle produite ?"].dropna().str.split(r",\s*(?=[A-ZÉ])")
    resume = {
        "source": "Kaggle : togbemismadjisosthne/mobile-money-phone-scam-survey-dataset",
        "lieu": "Ngaoundéré (Cameroun) et environs",
        "personnes": int(len(df)),
        "deja_victimes": int((victimes == "Oui").sum()),
        "part_deja_victimes": round(float((victimes == "Oui").mean()), 3),
        "savent_detecter": round(float((df["Savez-vous comment détecter une tentative d’arnaque ?"].str.strip() == "Oui").mean()), 3),
        "veulent_etre_formees": round(float((df["Aimeriez-vous être mieux formé(e) sur ce sujet ?"].str.strip() == "Oui").mean()), 3),
        "comment_chez_les_victimes": methodes.explode().str.strip().value_counts().head(6).to_dict(),
    }
    fichier = os.path.join(RACINE, "resultats", "sondage_mobile_money.json")
    with open(fichier, "w", encoding="utf-8") as f:
        json.dump(resume, f, ensure_ascii=False, indent=2)
    print(f"{fichier} :", json.dumps(resume, ensure_ascii=False))


if __name__ == "__main__":
    stop_arnaque_237()
    sondage()
    if "--tout" in sys.argv:
        conversations_anglaises()
