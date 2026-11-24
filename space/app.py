"""KORA — service fon : traduction fon ⇄ français.

Tourne sur un Space Hugging Face gratuit (CPU). L'application web KORA l'appelle
avec @gradio/client pour analyser un message écrit en fon et répondre en fon.
"""
import re
import unicodedata

import gradio as gr
import torch
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

torch.set_num_threads(2)

# Traducteur fon ⇄ français : version affinée pour le fon, sinon NLLB de base.
TRADUCTEUR = None
for nom in ["nellaw/nllb-fongbe-french-translation", "facebook/nllb-200-distilled-600M"]:
    try:
        tok = AutoTokenizer.from_pretrained(nom, src_lang="fon_Latn")
        traducteur = AutoModelForSeq2SeqLM.from_pretrained(nom).eval()
        TRADUCTEUR = nom
        break
    except Exception as e:  # noqa: BLE001
        print("Traducteur indisponible :", nom, e)


def _propre(t):
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", str(t))).strip()


def traduire(texte, sens="fon→français"):
    """Traduit un texte dans un sens ou dans l'autre. C'est la seule route utilisée par l'appli."""
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


with gr.Blocks(title="KORA — traduction fon") as demo:
    gr.Markdown(f"# 🪕 KORA — traduction fon\nTraducteur : `{TRADUCTEUR}`. Service utilisé par l'application KORA.")
    t = gr.Textbox(label="Texte", lines=2)
    s = gr.Radio(["fon→français", "français→fon"], value="fon→français", label="Sens")
    b = gr.Button("Traduire", variant="primary")
    o = gr.Textbox(label="Traduction")
    b.click(traduire, [t, s], o, api_name="traduire")

demo.queue(max_size=16).launch()
