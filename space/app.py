"""KORA — service fon : traduction fon ⇄ français, pour un Space Hugging Face ZeroGPU (gratuit).

Deux modèles, chacun dans le sens où il est bon :
- français → fon : nellaw/nllb-fongbe-french-translation, affiné uniquement dans ce sens ;
- fon → français : facebook/nllb-200-distilled-1.3B, qui connaît le fon (le modèle de nellaw
  n'a jamais appris ce sens-là).

Le texte peut contenir plusieurs lignes : chaque ligne est traduite séparément, toutes en un seul
passage sur le GPU. L'application KORA s'en sert pour traduire toutes ses phrases d'un coup.
"""
import re
import unicodedata

import gradio as gr
import spaces
import torch
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer


def charger(noms, langue_source):
    for nom in noms:
        try:
            tok = AutoTokenizer.from_pretrained(nom, src_lang=langue_source)
            modele = AutoModelForSeq2SeqLM.from_pretrained(nom, torch_dtype=torch.float16).eval()
            print("Chargé :", nom)
            return nom, tok, modele
        except Exception as e:  # noqa: BLE001
            print("Indisponible :", nom, e)
    raise RuntimeError(f"Aucun modèle disponible parmi {noms}")


NOM_VERS_FON, TOK_VERS_FON, MODELE_VERS_FON = charger(
    ["nellaw/nllb-fongbe-french-translation", "facebook/nllb-200-distilled-600M"], "fra_Latn")
NOM_VERS_FR, TOK_VERS_FR, MODELE_VERS_FR = charger(
    ["facebook/nllb-200-distilled-1.3B", "facebook/nllb-200-distilled-600M"], "fon_Latn")


def _propre(t):
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", str(t))).strip()


@spaces.GPU(duration=40)
def _generer(lignes, vers_fon):
    tok, modele = (TOK_VERS_FON, MODELE_VERS_FON) if vers_fon else (TOK_VERS_FR, MODELE_VERS_FR)
    source, cible = ("fra_Latn", "fon_Latn") if vers_fon else ("fon_Latn", "fra_Latn")
    if torch.cuda.is_available():
        dev, modele = "cuda", modele.to("cuda")
    else:  # secours sans GPU : le demi-flottant ne tourne pas bien sur processeur
        dev, modele = "cpu", modele.float()
    tok.src_lang = source
    enc = tok(lignes, return_tensors="pt", padding=True, truncation=True, max_length=200).to(dev)
    with torch.no_grad():
        sortie = modele.generate(**enc, forced_bos_token_id=tok.convert_tokens_to_ids(cible),
                                 max_new_tokens=160, num_beams=3)
    return tok.batch_decode(sortie, skip_special_tokens=True)


def traduire(texte, sens="fon→français"):
    """Traduit chaque ligne du texte. Seule route utilisée par l'appli (api_name="traduire")."""
    lignes = [_propre(ligne) for ligne in str(texte or "").split("\n")]
    a_traduire = [ligne for ligne in lignes if ligne]
    if not a_traduire:
        return ""
    traductions = iter(_generer(a_traduire, vers_fon=not sens.startswith("fon")))
    return "\n".join(next(traductions) if ligne else "" for ligne in lignes)


with gr.Blocks(title="KORA — traduction fon") as demo:
    gr.Markdown(f"# 🪕 KORA — traduction fon\n"
                f"Français → fon : `{NOM_VERS_FON}` · fon → français : `{NOM_VERS_FR}`.\n"
                f"Service utilisé par l'application KORA. Une phrase par ligne.")
    t = gr.Textbox(label="Texte", lines=3)
    s = gr.Radio(["fon→français", "français→fon"], value="fon→français", label="Sens")
    b = gr.Button("Traduire", variant="primary")
    o = gr.Textbox(label="Traduction", lines=3)
    b.click(traduire, [t, s], o, api_name="traduire")

demo.queue(max_size=16).launch()
