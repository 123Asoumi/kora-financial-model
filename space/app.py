"""KORA — service fon : écouter (voix -> texte), traduire (fon <-> français), parler (texte -> voix).

Tourne sur un Space Hugging Face gratuit (CPU). L'application web KORA l'appelle avec @gradio/client.
"""
import re
import unicodedata

import gradio as gr
import librosa
import torch
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer, VitsModel, pipeline

torch.set_num_threads(2)

# 1. Oreille fon
oreille = pipeline("automatic-speech-recognition", model="Professor/mms-300m-fongbe", device=-1, chunk_length_s=20)

# 2. Traducteur fon <-> français (version affinée pour le fon, sinon NLLB de base)
for nom in ["nellaw/nllb-fongbe-french-translation", "facebook/nllb-200-distilled-600M"]:
    try:
        tok = AutoTokenizer.from_pretrained(nom, src_lang="fon_Latn")
        traducteur = AutoModelForSeq2SeqLM.from_pretrained(nom).eval()
        TRADUCTEUR = nom
        break
    except Exception as e:  # noqa: BLE001
        print("Traducteur indisponible :", nom, e)

# 3. Voix fon
voix_tok = AutoTokenizer.from_pretrained("facebook/mms-tts-fon")
voix = VitsModel.from_pretrained("facebook/mms-tts-fon").eval()


def _propre(t):
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", str(t))).strip()


def traduire(texte, sens="fon→français"):
    texte = _propre(texte)
    if not texte:
        return ""
    source, cible = ("fon_Latn", "fra_Latn") if sens.startswith("fon") else ("fra_Latn", "fon_Latn")
    tok.src_lang = source
    enc = tok(texte, return_tensors="pt", truncation=True, max_length=256)
    with torch.no_grad():
        sortie = traducteur.generate(**enc, forced_bos_token_id=tok.convert_tokens_to_ids(cible),
                                     max_new_tokens=200, num_beams=3)
    return tok.batch_decode(sortie, skip_special_tokens=True)[0]


def ecouter(audio):
    """Vocal (fichier) -> (texte fon, traduction française)."""
    if not audio:
        return "", ""
    son, _ = librosa.load(audio, sr=16000, mono=True)
    fon = _propre(oreille({"raw": son, "sampling_rate": 16000})["text"])
    return fon, traduire(fon, "fon→français") if fon else ""


def parler(texte_fon):
    """Texte fon -> voix (taux d'échantillonnage, signal)."""
    texte_fon = _propre(texte_fon)
    if not texte_fon:
        return None
    enc = voix_tok(texte_fon, return_tensors="pt")
    with torch.no_grad():
        signal = voix(**enc).waveform[0].numpy()
    return voix.config.sampling_rate, signal


with gr.Blocks(title="KORA — voix fon") as demo:
    gr.Markdown(f"# 🪕 KORA — voix fon\nTraducteur : `{TRADUCTEUR}`. Service utilisé par l'application KORA.")
    with gr.Tab("Écouter"):
        a = gr.Audio(type="filepath", sources=["microphone", "upload"], label="Vocal en fon")
        b = gr.Button("Transcrire et traduire", variant="primary")
        fon_txt, fr_txt = gr.Textbox(label="Texte fon"), gr.Textbox(label="Traduction française")
        b.click(ecouter, a, [fon_txt, fr_txt], api_name="ecouter")
    with gr.Tab("Traduire"):
        t = gr.Textbox(label="Texte")
        s = gr.Radio(["fon→français", "français→fon"], value="fon→français", label="Sens")
        b2 = gr.Button("Traduire", variant="primary")
        o = gr.Textbox(label="Traduction")
        b2.click(traduire, [t, s], o, api_name="traduire")
    with gr.Tab("Parler"):
        t3 = gr.Textbox(label="Texte en fon")
        b3 = gr.Button("Dire en fon", variant="primary")
        o3 = gr.Audio(label="Voix fon")
        b3.click(parler, t3, o3, api_name="parler")

demo.queue(max_size=16).launch()
