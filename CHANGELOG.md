# Journal des versions de KORA-lite

Une seule version pour tout le projet : celle de `package.json`. L'application web, l'application Android, le modèle (`web/kora_lite.json`) et le cache hors ligne portent le même numéro. `tests/test_version_unique.py` vérifie qu'aucun fichier n'a été oublié.

Pour publier une nouvelle version : changer le numéro dans `package.json`, `web/kora_lite.json`, `web/sw.js` et `web/index.html` (le test indique ce qui manque), ajouter une section ici, puis envoyer sur `main`. Le workflow GitHub **« Publier une version »** se lance tout seul et crée la version GitHub avec l'APK Android signée. Les téléphones la proposent ensuite à la mise à jour.

## [1.0.13] — 2026-11-26

### La discussion répond toujours
- **Avant**, une question sur deux recevait « Je ne peux pas répondre à ta question : le service en ligne de KORA ne répond pas ». L'assistant en ligne (Qwen3-4B) tourne sur le GPU gratuit de Hugging Face, dont le quota par personne est vite épuisé : mesuré, 5 appels sur 5 refusés (« You have exceeded your ZeroGPU runs limit »).
- **Maintenant**, quand l'assistant ne répond pas, KORA répond avec **une base de réponses écrites et vérifiées à la main** (`web/reponses.js`), dans le téléphone, même sans internet. Elle couvre : déjà victime (les gestes d'urgence), faux dépôt, faux agent, proche piraté sur WhatsApp, liens, prêts, faux gains, codes, solde, et comment utiliser l'appel, la bulle, le fon et les données. Pour une question imprévue, KORA rappelle les deux règles d'or.
- Après un refus pour quota, KORA ne réessaie pas l'assistant en ligne pendant 10 minutes : la réponse est immédiate.
- Un petit modèle de secours sur processeur a été testé puis écarté : il donnait des conseils dangereux (« vous pouvez envoyer la somme à l'opérateur »).

## [1.0.12] — 2026-11-26

### Korachoupi en double
- **Bug corrigé** : l'image d'attente de Korachoupi (ajoutée en 1.0.7) restait affichée sous la mascotte 3D, et on voyait deux Korachoupi superposés. Korachoupi envoie un signal « prêt » à son premier rendu, mais ce signal pouvait partir avant que la page l'écoute. La page vérifie maintenant elle-même si la 3D est affichée, et retire l'image d'attente au plus tard après 15 s.

## [1.0.11] — 2026-11-26

### Discuter n'est plus analyser
- **Avant**, tout message tapé qui n'était ni une salutation ni une question partait en analyse : « merci » ou « je veux acheter un téléphone » recevaient un verdict d'arnaque.
- **Maintenant, dans le chat, KORA discute.** Les petites phrases (« merci », « ça va ? », « qui es-tu ? », « ok ») ont une réponse immédiate, même sans internet ; le reste va à l'assistant.
- **L'analyse se fait** :
  - sur une **capture** (bulle, bouton ou partage d'image) ;
  - sur un **appel suivi** ;
  - quand on la demande : « Vérifier un message » ou « Écrire ou coller ». La barre affiche alors « Colle le message à vérifier… » et le message suivant est analysé ;
  - quand on partage un texte vers KORA depuis une autre appli, et pour les exemples d'arnaques.
- **Un SMS collé dans le chat** (montant, lien, « vous avez reçu »…) n'est plus analysé d'office : KORA demande « Tu veux que je le vérifie ? », avec deux boutons : « Oui, vérifie-le » ou « Non, on discute ».
- Le texte d'aide de la barre devient « Écris à KORA… ».

## [1.0.10] — 2026-11-26

### La voix française marche partout
- **Panne corrigée** : le bouton 🔊 ne disait rien sur certains téléphones. KORA essaie maintenant dans l'ordre :
  1. la voix du téléphone. Le plugin attend que le moteur de voix soit prêt, et essaie les voix françaises de France, générique, du Canada et de Belgique ;
  2. la voix française du navigateur, avec une pause après « couper », car Chrome se tait parfois sinon ;
  3. sinon, une **voix française de secours** du service en ligne (`facebook/mms-tts-fra`, route `/parler_fr`, environ 2 s par phrase).
- Testé sur un navigateur sans aucune voix française : KORA lit la réponse avec la voix de secours, et la bouche de Korachoupi suit le volume.

### Korachoupi réagit de nouveau
- **Bug de la 1.0.7 corrigé** : depuis qu'il se charge vite, Korachoupi pouvait finir de charger avant la page. Celle-ci croyait qu'il n'était jamais prêt et gardait ses messages : la bouche ne bougeait pas et les émotions du verdict n'arrivaient pas. La page vérifie maintenant aussi s'il est déjà chargé, et écoute son signal « prêt ».

### Repris de Dan
- **Accueil par le prénom** : « Bonjour, Augustino 👋 » (« Bonsoir » le soir). Le prénom se choisit dans Profil et reste sur le téléphone.
- **Barre latérale sur grand écran** (à partir de 1 100 px de large) : la marque, le bouton « Nouvelle vérification », la navigation et une carte « Un coup de main ? ». Sur téléphone, la barre du bas ne change pas.

## [1.0.9] — 2026-11-26

### KORA suit un appel
- **La bulle propose deux choix** quand on la touche : « Capture de l'écran » (comme avant) ou **« Suivre un appel »**. Le choix « Suivre un appel » est aussi dans le menu de la mascotte.
- **Pendant l'appel**, on le met en haut-parleur et on garde KORA ouvert. KORA écoute avec le micro du téléphone, sans annulation d'écho, qui effacerait la voix de l'autre personne. Il affiche la durée et le volume, et rappelle de mettre le haut-parleur s'il ne l'est pas.
- **À la fin de l'appel, KORA s'arrête tout seul** : l'appli voit quand l'appel (téléphone ou WhatsApp) se termine. On peut aussi toucher « L'appel est fini ».
- **Transcription** par le service en ligne : route `/transcrire_appel`, sur processeur, environ 0,7 fois la durée de l'appel, 4 minutes au plus.
  - En français : `openai/whisper-small`.
  - En fon : `Professor/mms-300m-fongbe` puis traduction.
  - L'appel est envoyé en WAV 8 kHz μ-law, la qualité d'une ligne téléphonique : environ 1,4 Mo pour 3 minutes.
- **Questions de contexte** :
  - qui a appelé (numéro inconnu, quelqu'un qui se dit agent, un proche) ;
  - ce qui a été demandé (code ou PIN, argent, renvoyer un dépôt, lien ou appli) ;
  - si un SMS est arrivé pendant l'appel, avec sa capture, lue dans le téléphone.
- **Verdict** : KORA-lite analyse la transcription et les réponses, avec les règles propres aux appels (« un opérateur ne t'appelle jamais pour te demander un code »). KORA pose ses questions et dit son verdict à voix haute.
- **Si KORA n'entend rien** (certains téléphones coupent le micro des autres applis pendant un appel), il demande de raconter l'appel, à l'écrit ou au micro, puis pose les mêmes questions.
- **Testé dans un navigateur**, avec un faux micro qui joue un faux appel de « l'agent MTN » (22 s, voix de synthèse) : transcription en 18 s, puis « Arnaque probable · 100 % ». Le cas silencieux est testé aussi.
- **Pas encore essayé sur un vrai téléphone pendant un vrai appel.** KORA-lite a été entraîné sur des SMS : sur des transcriptions d'appels, il s'appuie surtout sur les mots-clés et sur les réponses aux questions.

## [1.0.8] — 2026-11-26

### Barre de message
- Sur l'accueil, la barre de message prend toute la largeur : Korachoupi est déjà dans la carte d'accroche. En pleine discussion, il reste posé à gauche de la barre.

## [1.0.7] — 2026-11-26

### Korachoupi se charge vite
- **three.js embarqué et allégé** : avant, la mascotte téléchargeait three.js depuis internet (jsDelivr) à chaque ouverture, soit 2 Mo non minifiés. Elle utilise maintenant `web/vendor/three/three-korachoupi.min.js` : seules les pièces dont Korachoupi se sert, minifiées (594 Ko, 149 Ko compressés). Le fichier se refait avec `outils/three_korachoupi.sh`.
- **Plus d'attente de la police Google** dans l'appli : la police Rubik ne se charge que sur la page de la mascotte seule.
- **Image d'attente** : tant que la 3D n'est pas prête, une image de Korachoupi (12 Ko) tient sa place, puis s'efface au premier rendu.
- Mesuré sur une 3G lente simulée (1,6 Mbit/s), avec compression comme sur Vercel : la 3D s'affiche en moins de 1,5 s, contre environ 9 s avant. Dans l'appli Android, tout est dans le téléphone : la mascotte marche aussi sans internet.

## [1.0.6] — 2026-11-26

### Accueil allégé
- Retrait des rubriques « Tes dernières vérifications » et « Ou essaie un exemple » de la page d'accueil. L'historique reste dans le menu (Historique), et les exemples d'arnaques dans « Arnaques courantes ».

## [1.0.5] — 2026-11-25

### Mises à jour automatiques
- **L'appli Android se met à jour** : à chaque ouverture, elle regarde la dernière version publiée. S'il y en a une plus récente, un bandeau propose **« Mettre à jour »**. L'appli télécharge l'APK (avec la progression), vérifie son empreinte SHA-256 et ouvre l'installateur d'Android. L'historique et les réglages sont gardés.
- **Paramètres → Mises à jour** : affiche la version installée et permet de chercher une mise à jour à la main.
- Android demande toujours de confirmer l'installation (c'est obligatoire hors Play Store). La première fois, il faut autoriser KORA-lite à installer des applis.
- **La publication est automatique** : un nouveau numéro de version envoyé sur `main` crée tout seul la version GitHub avec l'APK signée. Il n'y a plus besoin de lancer le workflow à la main, et un numéro déjà publié ne provoque plus d'erreur.
- Les notes de version donnent l'empreinte SHA-256 de l'APK.
- **À faire une seule fois** : installer la 1.0.5 à la main sur les téléphones qui ont la 1.0.4. Les versions suivantes seront proposées par l'appli.

## [1.0.4] — 2026-11-25

### KORA parle et écoute
- **KORA lit ses réponses à voix haute** : un bouton haut-parleur sous chaque réponse, et le réglage « KORA parle » pour tout lire automatiquement. Quand on lui parle au micro, il répond toujours à voix haute.
- **En français** : la voix du téléphone (synthèse vocale Android, via le plugin `VoixKora` de l'appli), ou celle du navigateur.
- **En fon** : la voix fon du service en ligne (modèle MMS de Meta, `facebook/mms-tts-fon`, sur processeur : environ 2 s par phrase). Si elle ne répond pas, KORA lit en français.
- **Bouton micro** dans la barre de saisie :
  - en français : la dictée du téléphone ; le texte s'affiche pendant qu'on parle, puis KORA analyse ;
  - en fon : on enregistre un vocal (20 s au plus). L'oreille fon du service (`Professor/mms-300m-fongbe`, sur processeur) le transcrit, il est traduit en français, puis analysé comme un message écrit. Le vocal est converti en WAV 16 kHz dans le téléphone avant l'envoi.
- **Korachoupi parle** : sa bouche s'ouvre et se ferme pendant que KORA parle. En fon, elle suit le volume réel de la voix.
- Service en ligne : nouvelles routes `/parler` et `/ecouter`.
- Testé de bout en bout dans un navigateur, avec un faux micro qui joue un vocal fon : transcription, traduction, verdict, puis réponse dite en fon.
- Pas encore essayé sur un vrai téléphone. Le fon reconnu et prononcé par ces modèles automatiques n'est pas validé par des locuteurs.

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
