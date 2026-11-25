---
title: KORA — traduction fon
emoji: 🪕
colorFrom: yellow
colorTo: gray
sdk: gradio
sdk_version: 5.49.1
app_file: app.py
python_version: "3.12"
pinned: false
license: cc-by-nc-4.0
short_description: Traduction fon et discussion pour l'anti-arnaque KORA
---

# KORA — service fon et discussion

Service utilisé par l'application KORA (https://kora-0-01.vercel.app).

- `/traduire` (texte, sens) : une phrase par ligne. **Sur processeur**, sans quota GPU : la traduction reste
  disponible même quand le GPU gratuit (ZeroGPU) est saturé. Cache des phrases déjà
  traduites. Réglages : variables `KORA_QUANTIFIER` (0 par défaut, 1 = int8 plus rapide) et `KORA_FAISCEAUX` (2 par défaut).
  - français → fon : `nellaw/nllb-fongbe-french-translation` (affiné pour ce sens uniquement)
  - fon → français : `facebook/nllb-200-distilled-1.3B`
- `/discuter` (question, contexte, historique) : l'assistant de KORA (`Qwen/Qwen3-4B-Instruct-2507`, Apache 2.0)
  répond aux questions, sur GPU (ZeroGPU). Le verdict « arnaque ou pas » vient toujours du modèle KORA-lite, sur le téléphone.

L'entraînement de l'oreille fon sur les données **J'aime Ma Langue** est dans le dépôt GitHub (notebooks 3 et 5).

Licences : traducteurs CC-BY-NC-4.0 (démonstration, non commercial) ; Qwen3 Apache 2.0.
