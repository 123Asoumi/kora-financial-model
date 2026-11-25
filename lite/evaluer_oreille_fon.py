"""
Évaluation de l'oreille fon (même protocole que notebooks/03_oreille_fon.ipynb, sans Colab).

    pip install torch transformers soundfile jiwer pandas huggingface_hub requests
    python lite/evaluer_oreille_fon.py            # 300 enregistrements, comme le notebook 3

Le modèle Professor/mms-300m-fongbe transcrit les N premiers enregistrements de la première archive
du corpus J'aime Ma Langue (JaimeMaLangue/JML-fon-speech-v1, voix de téléphone, transcriptions
validées par des linguistes). On mesure le taux d'erreur par mot (WER) et par caractère (CER),
avec et sans les tons. Marche sur processeur (plus lent qu'un GPU, même résultat).

Sorties : resultats/oreille_fon_metriques.json et resultats/oreille_fon_details.csv
"""
import json
import os

os.environ.setdefault("HF_HUB_DISABLE_XET", "1")  # avant d'importer huggingface_hub : téléchargement HTTP classique
import re
import sys
import tarfile
import time
import unicodedata

import jiwer
import pandas as pd
import requests
import soundfile as sf
import torch
from huggingface_hub import hf_hub_download
from transformers import pipeline

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RACINE)
from kora_lib import enlever_tons  # noqa: E402

MODELE = "Professor/mms-300m-fongbe"
DEPOT = "JaimeMaLangue/JML-fon-speech-v1"
N_AUDIOS = int(sys.argv[1]) if len(sys.argv) > 1 else 300
DOSSIER_AUDIO = os.path.join(RACINE, "jml")  # ignoré par git (.gitignore : jml*/)
os.makedirs(DOSSIER_AUDIO, exist_ok=True)

# 1. Le modèle (cellule 4 du notebook)
appareil = 0 if torch.cuda.is_available() else -1
asr_fon = pipeline("automatic-speech-recognition", model=MODELE, device=appareil, chunk_length_s=20)
print("✅ Modèle chargé sur", "GPU" if appareil == 0 else f"processeur ({torch.get_num_threads()} cœurs)", flush=True)

# 2. Les enregistrements J'aime Ma Langue (cellule 6)
transcriptions = pd.read_csv(hf_hub_download(DEPOT, "transcribed.csv", repo_type="dataset"))
print(f"{len(transcriptions):,} enregistrements transcrits dans le corpus", flush=True)
url = f"https://huggingface.co/datasets/{DEPOT}/resolve/main/audio_transcribed_000.tar"
recuperes = {}
with requests.get(url, stream=True, timeout=60) as r:
    r.raise_for_status()
    r.raw.decode_content = True
    with tarfile.open(fileobj=r.raw, mode="r|") as archive:
        for membre in archive:
            if membre.isfile() and membre.name.endswith(".wav"):
                chemin = os.path.join(DOSSIER_AUDIO, os.path.basename(membre.name))
                with open(chemin, "wb") as f:
                    f.write(archive.extractfile(membre).read())
                recuperes[membre.name] = chemin
                if len(recuperes) >= N_AUDIOS:
                    break
echantillon = transcriptions[transcriptions["audio_path"].isin(recuperes)].copy()
echantillon["fichier"] = echantillon["audio_path"].map(recuperes)
print(f"✅ {len(echantillon)} enregistrements · {echantillon['duration'].sum() / 60:.1f} minutes · "
      f"{echantillon['speaker_id'].nunique()} voix différentes", flush=True)


# 3. Transcrire et mesurer (cellule 9)
def nettoyer(texte, garder_tons=True):
    t = unicodedata.normalize("NFC", str(texte)).lower()
    # le modèle écrit « ε » (epsilon grec, U+03B5) là où JML écrit « ɛ » (lettre fon, U+025B) :
    # même son, autre caractère. On les unifie, sinon chaque mot avec ɛ compte comme une erreur.
    t = t.replace("ε", "ɛ")
    t = re.sub(r"[\"“”«»,.;:!?()\[\]…\-–]", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t if garder_tons else enlever_tons(t)


audios = [sf.read(f)[0] for f in echantillon["fichier"]]
debut = time.time()
sorties = []
for i in range(0, len(audios), 8):
    sorties += asr_fon([{"raw": a, "sampling_rate": 16000} for a in audios[i:i + 8]], batch_size=8)
    print(f"  {len(sorties)}/{len(audios)} transcrits ({time.time() - debut:.0f} s)", flush=True)
duree_calcul = time.time() - debut
echantillon["prediction"] = [s["text"] for s in sorties]

refs, hyps = echantillon["transcription"].tolist(), echantillon["prediction"].tolist()
mesures = {
    "n_enregistrements": len(echantillon),
    "voix": int(echantillon["speaker_id"].nunique()),
    "minutes_audio": round(echantillon["duration"].sum() / 60, 1),
    "WER_avec_tons": jiwer.wer([nettoyer(t) for t in refs], [nettoyer(t) for t in hyps]),
    "CER_avec_tons": jiwer.cer([nettoyer(t) for t in refs], [nettoyer(t) for t in hyps]),
    "WER_sans_tons": jiwer.wer([nettoyer(t, False) for t in refs], [nettoyer(t, False) for t in hyps]),
    "CER_sans_tons": jiwer.cer([nettoyer(t, False) for t in refs], [nettoyer(t, False) for t in hyps]),
    "secondes_calcul_par_seconde_audio": duree_calcul / echantillon["duration"].sum(),
    "materiel": "GPU" if appareil == 0 else "processeur",
}
for k, v in mesures.items():
    print(f"{k:38s} {v:.1%}" if k.startswith(("WER", "CER")) else f"{k:38s} {v}", flush=True)

# 4. Les meilleurs et les pires exemples (cellule 11), puis sauvegarde (cellule 12)
echantillon["wer"] = [jiwer.wer(nettoyer(r, False), nettoyer(h, False)) for r, h in zip(refs, hyps)]
pd.set_option("display.max_colwidth", 110)
print("\n✅ Les mieux transcrits\n", echantillon.nsmallest(3, "wer")[["transcription", "prediction", "wer"]].to_string())
print("\n❌ Les plus difficiles\n", echantillon.nlargest(3, "wer")[["transcription", "prediction", "wer"]].to_string())
os.makedirs(os.path.join(RACINE, "resultats"), exist_ok=True)
echantillon[["id", "speaker_id", "duration", "transcription", "prediction", "wer"]].to_csv(
    os.path.join(RACINE, "resultats", "oreille_fon_details.csv"), index=False)
with open(os.path.join(RACINE, "resultats", "oreille_fon_metriques.json"), "w", encoding="utf-8") as f:
    json.dump({"modele": MODELE, "corpus": DEPOT, "archive": "audio_transcribed_000.tar (premiers enregistrements)",
               **{k: (round(v, 4) if isinstance(v, float) else v) for k, v in mesures.items()}},
              f, ensure_ascii=False, indent=2)
print("\n💾 resultats/oreille_fon_metriques.json et resultats/oreille_fon_details.csv", flush=True)
