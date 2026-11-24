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

Service utilisé par l'application KORA (https://kora-0-01.vercel.app) pour analyser un
message écrit **en fon** et **répondre en fon**.

- `/traduire` : fon ⇄ français (`nellaw/nllb-fongbe-french-translation`, sinon `facebook/nllb-200-distilled-600M`)

L'entraînement de l'oreille fon (reconnaissance vocale) sur les données
**J'aime Ma Langue** reste dans le dépôt GitHub (notebooks 3 et 5) comme travail GPU.

Licences : modèle de traduction CC-BY-NC-4.0 (usage de démonstration, non commercial).
