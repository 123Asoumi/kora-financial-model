---
title: KORA — traduction fon
emoji: 🪕
colorFrom: yellow
colorTo: gray
sdk: gradio
sdk_version: 5.49.1
app_file: app.py
pinned: false
license: cc-by-nc-4.0
short_description: Traduction fon ⇄ français pour l'anti-arnaque KORA
---

# KORA — traduction fon

Service utilisé par l'application KORA (https://kora-0-01.vercel.app) pour comprendre un
message écrit **en fon** et **répondre en fon**.

- `/traduire` (texte, sens) : une phrase par ligne, toutes traduites en un seul passage sur le GPU.
  - français → fon : `nellaw/nllb-fongbe-french-translation` (affiné pour ce sens uniquement)
  - fon → français : `facebook/nllb-200-distilled-1.3B` (le modèle de nellaw ne sait pas faire ce sens)

L'entraînement de l'oreille fon (reconnaissance vocale) sur les données **J'aime Ma Langue**
reste dans le dépôt GitHub (notebooks 3 et 5).

Licences : modèles de traduction CC-BY-NC-4.0 (usage de démonstration, non commercial).
