---
title: KORA — voix fon
emoji: 🪕
colorFrom: yellow
colorTo: gray
sdk: gradio
sdk_version: 5.49.1
app_file: app.py
pinned: false
license: cc-by-nc-4.0
short_description: Écouter, traduire et parler le fon pour l'anti-arnaque KORA
---

# KORA — voix fon

Service utilisé par l'application KORA (https://kora-0-01.vercel.app) :

- `/ecouter` : vocal en fon → texte fon (`Professor/mms-300m-fongbe`) → traduction française (`nellaw/nllb-fongbe-french-translation`)
- `/traduire` : fon ⇄ français
- `/parler` : texte fon → voix (`facebook/mms-tts-fon`)

Licences : modèles CC-BY-NC-4.0 (usage de démonstration, non commercial).
