# Journal des versions de KORA-lite

Une seule version pour tout le projet : celle de `package.json`. L'application web, l'application Android, le modèle (`web/kora_lite.json`) et le cache hors ligne portent le même numéro. `tests/test_version_unique.py` vérifie qu'aucun fichier n'a été oublié.

Pour publier une nouvelle version : changer le numéro dans `package.json`, `web/kora_lite.json`, `web/sw.js` et `web/index.html` (le test indique ce qui manque), ajouter une section ici, puis lancer le workflow GitHub **« Publier une version »**. Il crée la version GitHub avec l'APK Android signée.

## [1.0.3] — 2026-11-25

### Fon écrit sans accents
- **Régression de la 1.0.1 corrigée** : en mode fon, seuls les messages reconnus comme du fon (surtout grâce aux lettres ɛ ɔ ɖ) étaient traduits. Le fon écrit sans ces lettres (« me nyi agent MTN, so code e a na mo do »), très courant sur les claviers de téléphone, était analysé comme du français : KORA répondait « Je n'ai pas bien compris ».
- Désormais, en mode fon, **tout message est traduit, sauf s'il est clairement en français** (au moins deux petits mots français, plus que de mots fon, aucune lettre fon) : un SMS d'arnaque en français collé tel quel reste analysé directement dans le téléphone.

## [1.0.2] — 2026-11-25

### Clavier fon
- En mode fon, une rangée de touches apparaît au-dessus de la barre de saisie : les lettres **ɛ ɔ ɖ Ɛ Ɔ Ɖ** et les trois tons du fon (**haut á, bas à, montant ǎ**). Un ton se pose sur la lettre juste avant le curseur : `ɛ` puis `ǎ` donne `ɛ̌`. Les claviers de téléphone n'ont souvent pas ces lettres.

### Rappel
- Les lettres fon remplacées par `≡` (capture d'un téléphone sous la version 1.0.0) sont corrigées depuis la 1.0.1 par la police embarquée Noto Fon.

## [1.0.1] — 2026-11-25

Corrections après le premier essai de l'application sur un vrai téléphone.

### Lecture des captures d'écran
- **Elle ne marchait pas du tout** : l'application cherchait `createWorker` dans le fichier de Tesseract, qui ne l'exporte que sous `default` (erreur « La lecture de l'image a échoué »). Corrigé.
- Tesseract (programme, moteur et dictionnaire français) est maintenant **embarqué** dans l'application (`web/vendor/tesseract`, 8,5 Mo) : la lecture marche **sans internet**, y compris la première fois dans l'appli Android.
- En cas d'échec, la cause technique s'affiche en petit, pour pouvoir la diagnostiquer.

### Lettres fon
- La police du thème (Plus Jakarta Sans) n'a pas les lettres fon `ɛ ɔ ɖ` ni `ǎ` : avec leurs tons (`ɛ̌`, `ɛ́`, `ɔ́`), elles pouvaient disparaître. Une police de secours, sous-ensemble de **Noto Sans** (licence OFL, `web/polices`, 87 Ko), est embarquée et prend le relais.
- Un message écrit avec `ε` (epsilon grec, fréquent sur les claviers de téléphone) est reconnu comme du fon.

### Quand le service en ligne (Space Hugging Face) refuse ou ne répond pas
- **Plus d'attente sans fin** : 25 s au plus pour une traduction, 60 s pour l'assistant ; la traduction en fon d'un verdict ne le retarde jamais plus de 8 s.
- Messages honnêtes : « le service est saturé (trop de demandes aujourd'hui) » quand le quota GPU gratuit est dépassé, « met trop de temps à répondre » sinon. L'application rappelle que la vérification, elle, marche toujours dans le téléphone.
- En mode fon, **un message écrit en français est analysé directement**, sans passer par le service ; s'il est en fon et que la traduction échoue, KORA reste en français et propose d'écrire le message en français.

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
