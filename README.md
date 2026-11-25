# KORA-lite — le bouclier anti-arnaque Mobile Money

**Version 1.0.0** · [journal des versions](CHANGELOG.md)

**GPU Challenge 2026 · Epitech Bénin × UDU Technologies × Alliance Fintech UEMOA · cas d'usage n°7 : détection des arnaques financières numériques**

KORA vérifie un **SMS**, un **message WhatsApp** ou une **capture d'écran** (en français ou en fon). Il dit s'il s'agit d'une arnaque, **explique pourquoi** et donne **le bon réflexe**, avant que la personne ne paie.

🔗 **Application web** : https://kora-0-01.vercel.app. L'analyse se fait dans le téléphone : un message en français ne quitte jamais l'appareil.

📱 **Application Android** : [télécharger l'APK](https://github.com/123Asoumi/kora-financial-model/releases/latest). Elle ajoute la **bulle KORA**, qui flotte par-dessus les autres applis comme les bulles de Messenger : on la touche dans WhatsApp ou dans ses SMS, elle capture l'écran et KORA dit si le message est une arnaque. Voir [ANDROID.md](ANDROID.md).

---

## Ce qui est livré

| Livrable | Où |
|---|---|
| Prototype utilisable | `web/` : application en ligne sur Vercel (voir ci-dessous) |
| Application Android | `android/` : la même application emballée avec Capacitor, avec la bulle flottante et le partage vers KORA ; APK signée publiée par `.github/workflows/publier.yml` ([ANDROID.md](ANDROID.md)) |
| Service fon et assistant | `space/` : Space Hugging Face (ZeroGPU) pour la traduction fon ⇄ français et la discussion avec KORA |
| Prototype GPU | `notebooks/` : 5 notebooks Colab (données, cerveau AfroXLMR, reconnaissance vocale fon, démo vocale, entraînement de la reconnaissance vocale fon sur J'aime Ma Langue) |
| Résultats et comparaison avec une référence | `resultats/` et ci-dessous |
| Reproductibilité | `python data/externes/preparer.py` puis `python lite/entrainer_kora_lite.py` recalculent les métriques et le modèle de l'application en moins d'une minute sur CPU |
| Tests | `python -m pytest tests/` vérifie que l'application donne exactement les mêmes résultats que Python, et que la version est la même partout |

## L'application (`web/`)

- **Discussion façon messagerie** : on colle un message, KORA répond par une carte de verdict (arnaque probable, suspect, normal), les raisons et le bon réflexe.
- **Contexte de l'expéditeur** : KORA pose quelques questions (nom officiel ou numéro ordinaire, SMS ou WhatsApp, peut-on répondre, premier contact) et ajuste son avis. Chaque indice est affiché.
- **Captures d'écran** : lecture du texte dans le téléphone (Tesseract.js), y compris via « Partager → KORA » depuis une autre appli.
- **Fon écrit** : si l'utilisateur écrit en fon, le message est traduit en français pour l'analyse, puis KORA répond en fon (service `space/`). Traductions humaines possibles dans `web/fon.json`.
- **Assistant** : on peut poser des questions libres (« j'ai déjà payé, je fais quoi ? »). L'assistant (Qwen3, open source) explique le verdict de KORA-lite, il ne le remplace jamais.
- **Et aussi** : « J'ai déjà payé » (étapes d'urgence), catalogue des arnaques courantes, conseil du jour, historique gardé sur le téléphone, texte plus grand, moins d'animations, **Korachoupi**, la mascotte 3D qui réagit (`web/mascotte/korachoupi.html`), installable et utilisable hors ligne.

## Architecture

```
SMS / message en français ─────────────────────────────────┐
Capture d'écran → lecture du texte (Tesseract, téléphone) ──┼→ KORA-lite (téléphone) → risque + catégorie
Message en fon  → traduction en français (Space) ───────────┘        │
                                                                     ├→ contexte de l'expéditeur (règles)
                                                                     ├→ raisons (règles kora_lib.SIGNAUX) + conseil
                                                                     └→ réponse en fon (Space) · questions libres (assistant Qwen3, Space)
```

- **5 catégories** : message normal, demande de code secret (faux agent), faux dépôt et renvoi d'argent, faux gain et **fausse offre de crédit**, faux blocage de compte et lien piégé.
- **Explications vérifiables** : la décision vient du modèle ; les raisons affichées viennent de règles transparentes (`kora_lib.SIGNAUX`). Elles n'inventent jamais de raison.
- **Deux tailles de modèle** :
  - **KORA-lite** : n-grammes de caractères et régression logistique, 964 Ko, **tourne hors ligne dans le téléphone**. C'est le modèle de l'application ;
  - **KORA AfroXLMR** : `Davlan/afro-xlmr-large-76L` affiné sur GPU (connaît le fon et le français), dans les notebooks.
- **Vocal** : la reconnaissance vocale (français avec Whisper, fon avec `mms-300m-fongbe`) se trouve dans la démo GPU (notebooks 3, 4 et 5). Elle n'est pas dans l'application web.

## Résultats

### Données
- **5 342 messages synthétiques** générés à partir de **142 modèles de messages** inspirés d'arnaques réelles au Bénin (2 034 normaux, 3 308 arnaques), avec des variations réalistes (abréviations, fautes, absence d'accents, emojis) et des **messages légitimes pièges** (vrais SMS de code, « félicitations pour ton diplôme », tirage de la tontine, vraies promos d'opérateur…).
- **267 vrais messages** de [stop-arnaque-237](https://huggingface.co/datasets/kadian-arch/stop-arnaque-237) (Cameroun, CC-BY-4.0 : Kum, D. A., 2026) : de vraies arnaques à côté des vrais SMS MTN et Orange qu'elles imitent, en français (81) et en anglais (181). Ils comptent **5 fois** plus que les messages synthétiques à l'entraînement. Préparation : `python data/externes/preparer.py`.

**Découpage sans fuite** : par modèle de message pour le synthétique, par formulation pour les vrais messages (deux messages presque identiques ne sont jamais l'un en entraînement et l'autre en test) et, pour la voix, **par locuteur**.

### KORA-lite, validation croisée groupée (5 plis)

**Sur les vrais messages** (le vrai juge : chaque message est prédit par un modèle qui ne l'a jamais vu) :

| Seuil de risque | Arnaques détectées | Fausses alertes |
|---|---|---|
| ≥ 50 % (« suspect ») | **89,7 %** | 6,1 % |
| ≥ 70 % (« arnaque probable ») | **71,3 %** | **1,1 %** |

AUC arnaque / normal : **0,964** (français seul : 0,944 ; anglais seul : 0,934).

Sur les messages synthétiques : 98,5 % détectées pour 12,8 % de fausses alertes au seuil 50 %, 86,6 % pour 3,2 % au seuil 70 % ; AUC 0,988.

**Sur les vrais messages, KORA-lite repère 3 fois plus d'arnaques que les règles seules (89,7 % contre 31,0 %) avec 3,5 fois moins de fausses alertes (6,1 % contre 21,7 %).** Détails : `resultats/kora_lite_validation_croisee.json`.

### Quelles données font progresser KORA ?

Mesuré sur les 267 vrais messages (`python lite/comparer_sources.py`, détails dans `resultats/comparaison_sources.json`) :

| Données d'entraînement | AUC, vrais messages | dont français |
|---|---|---|
| Synthétique seul (KORA-lite avant ce changement) | 0,728 | 0,651 |
| + vrais messages | 0,947 | 0,873 |
| **+ vrais messages, poids 5 (retenu)** | **0,967** | **0,944** |
| + vrais messages + 4 800 conversations téléphoniques en anglais (menaattia, teeconnie) | 0,875 | 0,857 |
| + conversations en anglais seules | 0,520 | 0,599 |

**Leçon** : sur de vrais messages, l'ancien modèle n'entraîné que sur du synthétique était bien plus faible que ne le laissaient croire ses scores (0,73 au lieu de 0,99). Quelques centaines de vrais messages valent mieux que des milliers de conversations d'un autre genre : les conversations en anglais font **baisser** la détection, elles ne sont donc pas utilisées. Les transactions d'electricsheepafrica ne contiennent pas de texte, et le corpus J'aime Ma Langue est de l'audio (reconnaissance vocale, notebooks 3 et 5).

### Le terrain : un sondage de 800 personnes

Le sondage [Mobile Money Phone Scam Survey](https://www.kaggle.com/datasets/togbemismadjisosthne/mobile-money-phone-scam-survey-dataset) (Ngaoundéré, Cameroun) confirme les cibles de KORA : **39 % des personnes interrogées ont déjà été victimes** d'une arnaque Mobile Money, le plus souvent par un **faux agent au téléphone** (200 cas) ou un **faux message de retrait ou de dépôt** (154 cas). 46 % ne savent pas reconnaître une tentative d'arnaque, et 88 % veulent être mieux formés. Détails : `resultats/sondage_mobile_money.json`.

### L'oreille fon, mesurée sur de vraies voix béninoises

`python lite/evaluer_oreille_fon.py` (même protocole que le notebook 3) : le modèle `Professor/mms-300m-fongbe`, **sans adaptation**, transcrit 300 enregistrements de J'aime Ma Langue (40 minutes, 91 voix, enregistrées au téléphone). Il se trompe sur **un mot sur deux** (WER 53,7 %) et sur **un caractère sur cinq** (CER 20,1 %), sans compter les tons, qu'il n'écrit presque jamais. C'est loin des 9,48 % annoncés sur ALFFA, un corpus enregistré en studio : sur des voix de téléphone, l'oreille fon n'est pas encore assez fiable pour juger un vocal. C'est ce que doit améliorer l'entraînement sur J'aime Ma Langue (notebook 5, GPU), **pas encore lancé**. L'oreille fon n'est pas dans l'application.

### Comparaison avec la référence simple et avec le modèle GPU
| Modèle | Détection | Fausses alertes | Source |
|---|---|---|---|
| Référence simple : règles seules (au moins 1 signal), vrais messages | 31,0 % | 21,7 % | `kora_lib.SIGNAUX` |
| Référence simple : règles seules (au moins 1 signal), synthétique | 87,0 % | 20,8 % | idem |
| KORA-lite, vrais messages, seuil 50 % / 70 % | 89,7 % / 71,3 % | 6,1 % / 1,1 % | ci-dessus |
| KORA AfroXLMR (GPU) | *à compléter après l'exécution Colab* | | `resultats/metriques_cerveau.csv` |
| Reconnaissance vocale fon (`mms-300m-fongbe`), 300 enregistrements J'aime Ma Langue, 91 voix | WER **53,7 %**, CER 20,1 % (sans les tons) | | `resultats/oreille_fon_metriques.json` |

Tous les chiffres KORA-lite et « règles seules » sont recalculés par `python lite/entrainer_kora_lite.py`.

### Limites
- Les **vrais messages** viennent du **Cameroun** et sont peu nombreux (267, dont 81 en français et 22 messages normaux en français) : les chiffres en français ont une marge d'erreur importante. Il faut maintenant des **vrais messages du Bénin**, en français et en fon (`data/vrais_messages_MODELE.csv` donne le format).
- Les règles d'explication (`kora_lib.SIGNAUX`) sont écrites pour le français : sur un message en anglais, le modèle détecte l'arnaque mais les raisons affichées peuvent manquer.
- KORA analyse le **contenu** : un faux SMS identique au vrai ne se distingue que par l'**expéditeur**. Les questions sur l'expéditeur aident, mais une vraie vérification demande une intégration opérateur (pilote).
- Le fon passe par une **traduction automatique** de qualité moyenne, sous licence non commerciale (démonstration). `web/fon.json` permet d'y substituer des traductions humaines.
- L'assistant de discussion est une IA générative : il peut se tromper. Il n'a pas la main sur le verdict.
- KORA est une **aide à la vigilance**, pas une garantie.

## Le fon : comprendre et répondre

Le dossier `space/` contient un **Space Hugging Face** (ZeroGPU, gratuit) que l'application appelle :
- `/traduire` : fon → français (`facebook/nllb-200-distilled-1.3B`) pour analyser un message écrit en fon, et français → fon (`nellaw/nllb-fongbe-french-translation`) pour que KORA réponde en fon ;
- `/discuter` : l'assistant KORA (`Qwen/Qwen3-4B-Instruct-2507`) répond aux questions en s'appuyant sur le verdict calculé dans le téléphone.

Seuls les messages en fon et les questions à l'assistant passent par ce service ; les messages en français restent sur le téléphone.

## Reproduire

```bash
pip install scikit-learn pandas numpy pyarrow pytest huggingface_hub kagglehub
python data/externes/preparer.py              # vrais messages (stop-arnaque-237) + sondage
python lite/entrainer_kora_lite.py            # métriques + web/kora_lite.json
python lite/comparer_sources.py               # facultatif : quelles données aident (après preparer.py --tout)
python -m pytest tests/                       # parité application / Python (nécessite Node.js 20+)
cd web && python -m http.server 8000          # application sur http://localhost:8000
```
Application Android : voir [ANDROID.md](ANDROID.md).

Partie GPU : ouvrir les notebooks dans Google Colab (GPU T4), dans l'ordre 01 → 02 → 03 → 05 → 04.

## Licences des briques
`afro-xlmr-large-76L` (MIT), `whisper-small` (MIT), `wav2vec2-xls-r-300m` (Apache 2.0), `Qwen3-4B-Instruct-2507` (Apache 2.0), J'aime Ma Langue (CC-BY-SA-4.0), stop-arnaque-237 (CC-BY-4.0), `mms-300m-fongbe`, NLLB-200 et `nllb-fongbe-french-translation` (CC-BY-NC, démonstration uniquement), Tesseract.js (Apache 2.0), three.js (MIT), Capacitor (MIT). Détails : `MODELES.md`.

## Équipe
Équipe KORA : 2 développeurs, 2 profils finance.
