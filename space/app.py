"""KORA — service du Space Hugging Face (ZeroGPU, gratuit).

Deux routes, utilisées par l'application KORA (https://kora-0-01.vercel.app) :

- /traduire (texte, sens) : fon ⇄ français, une phrase par ligne. Sur PROCESSEUR : aucun quota GPU,
    le service reste disponible même quand le GPU gratuit (ZeroGPU) est saturé. Modèles quantifiés
    en int8 (plus rapides sur processeur) et cache des phrases déjà traduites (les phrases de KORA
    reviennent pour tous les utilisateurs).
    français → fon : nellaw/nllb-fongbe-french-translation (affiné uniquement dans ce sens)
    fon → français : facebook/nllb-200-distilled-1.3B (le modèle de nellaw ne sait pas faire ce sens)
- /discuter (question, contexte, historique) : l'assistant de KORA répond aux questions de
    l'utilisateur (Qwen3-4B-Instruct, Apache 2.0). Le verdict « arnaque ou pas » vient toujours
    du modèle KORA-lite, sur le téléphone : l'assistant l'explique, il ne le remplace pas.
"""
import json
import os
import re
import time
import unicodedata
from collections import OrderedDict

import gradio as gr
import spaces
import torch
from transformers import AutoModelForCausalLM, AutoModelForSeq2SeqLM, AutoTokenizer

# L'assistant (Qwen) : sur ZeroGPU, on le place sur « cuda » dès le chargement ; la plateforme le met
# réellement sur le GPU au moment de chaque appel décoré par @spaces.GPU.
APPAREIL = "cuda" if torch.cuda.is_available() else "cpu"
PRECISION = torch.bfloat16 if APPAREIL == "cuda" else torch.float32

# Les traducteurs : toujours sur PROCESSEUR (pas de @spaces.GPU, donc pas de quota).
QUANTIFIER = os.environ.get("KORA_QUANTIFIER", "1") == "1"   # int8 dynamique : 2 à 3 fois plus rapide sur processeur
FAISCEAUX = int(os.environ.get("KORA_FAISCEAUX", "2"))       # recherche en faisceau : 1 = le plus rapide
torch.set_num_threads(max(1, os.cpu_count() or 1))


def charger_traducteur(noms, langue_source):
    for nom in noms:
        try:
            tok = AutoTokenizer.from_pretrained(nom, src_lang=langue_source)  # sens fixe : rien à changer ensuite
            modele = AutoModelForSeq2SeqLM.from_pretrained(nom, torch_dtype=torch.float32).eval()  # processeur
            if QUANTIFIER:
                modele = torch.quantization.quantize_dynamic(modele, {torch.nn.Linear}, dtype=torch.qint8)
            print("Chargé sur processeur :", nom, "(int8)" if QUANTIFIER else "(fp32)")
            return nom, tok, modele
        except Exception as e:  # noqa: BLE001
            print("Indisponible :", nom, e)
    raise RuntimeError(f"Aucun traducteur disponible parmi {noms}")


NOM_VERS_FON, TOK_VERS_FON, MODELE_VERS_FON = charger_traducteur(
    ["nellaw/nllb-fongbe-french-translation", "facebook/nllb-200-distilled-600M"], "fra_Latn")
NOM_VERS_FR, TOK_VERS_FR, MODELE_VERS_FR = charger_traducteur(
    ["facebook/nllb-200-distilled-1.3B", "facebook/nllb-200-distilled-600M"], "fon_Latn")

NOM_ASSISTANT = "Qwen/Qwen3-4B-Instruct-2507"
TOK_ASSISTANT = AutoTokenizer.from_pretrained(NOM_ASSISTANT)
ASSISTANT = AutoModelForCausalLM.from_pretrained(NOM_ASSISTANT, torch_dtype=PRECISION).to(APPAREIL).eval()


def _propre(t):
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", str(t))).strip()


# ---------------------------------------------------------------- traduction (processeur)
CACHE = OrderedDict()  # (sens, phrase) → traduction ; les phrases de KORA reviennent pour tout le monde
TAILLE_CACHE = 5000


def _traduire_lot(lignes, vers_fon):
    """Traduit sur processeur, sans GPU : n'entame jamais le quota ZeroGPU."""
    tok, modele, cible = ((TOK_VERS_FON, MODELE_VERS_FON, "fon_Latn") if vers_fon
                          else (TOK_VERS_FR, MODELE_VERS_FR, "fra_Latn"))
    enc = tok(lignes, return_tensors="pt", padding=True, truncation=True, max_length=200)
    with torch.inference_mode():
        sortie = modele.generate(**enc, forced_bos_token_id=tok.convert_tokens_to_ids(cible),
                                 max_new_tokens=128, num_beams=FAISCEAUX)
    return tok.batch_decode(sortie, skip_special_tokens=True)


def traduire(texte, sens="fon→français"):
    """Traduit chaque ligne du texte, dans le sens demandé (les lignes déjà vues viennent du cache)."""
    vers_fon = not sens.startswith("fon")
    lignes = [_propre(ligne) for ligne in str(texte or "").split("\n")]
    manquantes = list(dict.fromkeys(l for l in lignes if l and (vers_fon, l) not in CACHE))
    if manquantes:
        debut = time.time()
        for ligne, trad in zip(manquantes, _traduire_lot(manquantes, vers_fon)):
            CACHE[(vers_fon, ligne)] = trad
            if len(CACHE) > TAILLE_CACHE:
                CACHE.popitem(last=False)
        print(f"traduit {len(manquantes)} ligne(s) {'fr→fon' if vers_fon else 'fon→fr'} en {time.time() - debut:.1f} s")
    return "\n".join(CACHE.get((vers_fon, l), "") if l else "" for l in lignes)


# ---------------------------------------------------------------- discussion
CONSIGNES = """Tu es KORA, l'assistant anti-arnaque Mobile Money au Bénin (MTN MoMo, Moov Money, Celtiis Cash).
Tu parles à des personnes qui ne sont pas expertes : tutoiement, phrases courtes, mots simples, en français.
Règles :
- Réponds en 4 phrases au maximum.
- Le verdict sur le message vient du modèle KORA (dans le contexte ci-dessous). Ne le contredis pas et ne l'invente pas. Si tu n'es pas sûr, dis-le.
- Ne demande jamais de code secret, de code PIN ni de mot de passe. Rappelle qu'aucun agent n'en demande.
- N'invente aucun numéro de téléphone, aucun lien, aucun chiffre. Pour joindre l'opérateur : le numéro officiel, écrit sur son site ou sur la puce.
- Si la personne a déjà payé ou donné un code : appeler tout de suite le service client officiel pour bloquer, changer son code secret, porter plainte (commissariat ou police chargée de la cybercriminalité), prévenir ses proches.
- Si la question n'a rien à voir avec l'argent mobile, la sécurité ou les arnaques, dis gentiment que tu aides seulement pour ça."""


@spaces.GPU(duration=30)
def _generer_reponse(messages):
    texte = TOK_ASSISTANT.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    enc = TOK_ASSISTANT(texte, return_tensors="pt").to(ASSISTANT.device)
    with torch.no_grad():
        sortie = ASSISTANT.generate(**enc, max_new_tokens=220, do_sample=True, temperature=0.4, top_p=0.9,
                                    repetition_penalty=1.05)
    return TOK_ASSISTANT.decode(sortie[0, enc["input_ids"].shape[1]:], skip_special_tokens=True).strip()


def discuter(question, contexte="", historique="[]"):
    """Répond à une question de l'utilisateur. historique : JSON [{"role": "user"|"assistant", "content": "…"}]."""
    question = _propre(question)
    if not question:
        return ""
    try:
        passe = json.loads(historique or "[]")
    except (TypeError, ValueError):
        passe = []
    passe = [{"role": m["role"], "content": str(m["content"])[:800]} for m in passe
             if isinstance(m, dict) and m.get("role") in ("user", "assistant") and m.get("content")][-8:]
    systeme = CONSIGNES
    if _propre(contexte):
        systeme += "\n\nContexte (message analysé par le modèle KORA) :\n" + str(contexte)[:1500]
    messages = [{"role": "system", "content": systeme}, *passe, {"role": "user", "content": question[:800]}]
    return _generer_reponse(messages)


# ---------------------------------------------------------------- interface
with gr.Blocks(title="KORA — service fon et discussion") as demo:
    gr.Markdown(f"# 🪕 KORA — service fon et discussion\n"
                f"Français → fon : `{NOM_VERS_FON}` · fon → français : `{NOM_VERS_FR}` (sur processeur, sans quota) · "
                f"assistant : `{NOM_ASSISTANT}` (GPU).")
    with gr.Tab("Traduire"):
        t = gr.Textbox(label="Texte (une phrase par ligne)", lines=3)
        s = gr.Radio(["fon→français", "français→fon"], value="fon→français", label="Sens")
        o = gr.Textbox(label="Traduction", lines=3)
        gr.Button("Traduire", variant="primary").click(traduire, [t, s], o, api_name="traduire", concurrency_limit=2)
    with gr.Tab("Discuter"):
        q = gr.Textbox(label="Question", lines=2)
        c = gr.Textbox(label="Contexte (verdict de KORA)", lines=3)
        h = gr.Textbox(label="Historique (JSON)", value="[]")
        r = gr.Textbox(label="Réponse de KORA", lines=4)
        gr.Button("Demander à KORA", variant="primary").click(discuter, [q, c, h], r, api_name="discuter")

demo.queue(max_size=16).launch()
