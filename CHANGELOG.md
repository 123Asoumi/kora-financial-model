# Journal des versions de KORA-lite

Une seule version pour tout le projet : celle de `package.json`. L'application web, l'application Android, le modèle (`web/kora_lite.json`) et le cache hors ligne portent le même numéro. `tests/test_version_unique.py` vérifie qu'aucun fichier n'a été oublié.

Pour publier une nouvelle version : changer le numéro dans `package.json`, `web/kora_lite.json`, `web/sw.js` et `web/index.html` (le test indique ce qui manque), ajouter une section ici, puis lancer le workflow GitHub **« Publier une version »**. Il crée la version GitHub avec l'APK Android signée.

## [1.0.0] — 2026-11-25

Première version publiée. Elle rassemble tout le travail fait depuis le prototype « KORA-0.01 » (23 au 25 novembre 2026).

### Nom
- Le projet et son modèle s'appellent **KORA-lite** (au lieu de KORA-0.01), en raison de sa légèreté : moins d'1 Mo, l'analyse se fait dans le téléphone.
- Le gros modèle de la partie GPU s'appelle **KORA AfroXLMR**.

### Application Android (nouveau)
- Application Android construite avec **Capacitor** à partir de l'application web (`android/`), téléchargeable sous forme d'APK signée.
- **Bulle KORA** : la mascotte elle-même (détourée, sans cercle autour) flotte par-dessus les autres applis, comme les bulles de Messenger. On la déplace du doigt, elle se colle au bord, on la glisse sur la croix pour la fermer. Quand on la touche, elle capture l'écran et ouvre KORA, qui lit le message (OCR dans le téléphone) et dit s'il s'agit d'une arnaque.
- **Partager → KORA-lite** depuis n'importe quelle appli (capture d'écran ou texte).
- Icône, écran de démarrage et bulle faits à partir de la mascotte (`outils/rendu_mascotte.mjs`, `outils/ressources_android.py`).
- **Une seule clé de signature** pour toutes les versions : le workflow de publication refuse une APK signée avec une autre clé (`android/empreinte-cle.txt`).

### Analyse
- KORA-lite : n-grammes de caractères et régression logistique, 5 catégories d'arnaques (964 Ko).
- **Vrais messages** : 267 messages réels de stop-arnaque-237 (Cameroun, CC-BY-4.0) ajoutés à l'entraînement avec un poids de 5, à côté des 5 342 messages synthétiques (`data/externes/preparer.py`).
- **Évaluation sur de vrais messages**, jamais vus à l'entraînement : AUC 0,964 (contre 0,728 pour le modèle entraîné sur le synthétique seul) ; 89,7 % des arnaques signalées pour 6,1 % de fausses alertes (seuil 50 %), 71,3 % pour 1,1 % (seuil 70 %) ; 3 fois plus d'arnaques repérées que les règles seules.
- Comparaison des sources (`lite/comparer_sources.py`) : les conversations téléphoniques en anglais (menaattia, teeconnie) font baisser la détection sur les vrais messages, elles ne sont pas utilisées ; les transactions d'electricsheepafrica n'ont pas de texte.
- Sondage de 800 personnes (Ngaoundéré) : 39 % déjà victimes, surtout de faux agents et de faux messages de dépôt (`resultats/sondage_mobile_money.json`).
- Raisons affichées par des règles vérifiables (`kora_lib.SIGNAUX`), jamais inventées.
- Contexte de l'expéditeur : nom officiel ou numéro ordinaire, SMS, WhatsApp ou appel, possibilité de répondre, premier contact.
- Données : ajout de vraies promos d'opérateur dans les messages légitimes, pour éviter les fausses alertes.

### Application web
- Interface de discussion : carte de verdict, étapes visibles, état de KORA, cartes d'idées, historique sur le téléphone.
- Menu, catalogue des arnaques courantes, paramètres (langue, texte plus grand, moins d'animations, historique), conseil du jour.
- **Korachoupi**, la mascotte 3D qui réagit au verdict, rangée dans `web/mascotte/korachoupi.html` avec son code lisible ; menu de la mascotte façon bulle de discussion.
- Lecture des captures d'écran (Tesseract.js), « Partager → KORA » quand l'appli web est installée, fonctionnement hors ligne.
- Fon écrit : KORA comprend un message en fon et répond en fon (service `space/`). Le vocal fon a été retiré de l'application ; il reste dans les notebooks GPU.
- Discussion libre : un assistant open source (Qwen3) explique le verdict, sans jamais le remplacer.

### Partie GPU (notebooks)
- 5 notebooks Colab : données, cerveau AfroXLMR, reconnaissance vocale fon, démo, entraînement de la reconnaissance vocale fon sur J'aime Ma Langue.
- Entraînement d'AfroXLMR qui tient sur le GPU T4 gratuit (AdamW 8 bits).
- Space Hugging Face compatible ZeroGPU.

### Qualité
- `tests/` : l'application (JavaScript) donne exactement les mêmes nettoyages, probabilités, verdicts et signaux que Python (scikit-learn), y compris sur les vrais messages, et la version est la même partout.
- README à jour avec les vrais chiffres ; résultats sans chemin propre à une machine.
