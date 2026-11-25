# KORA-lite — le bouclier anti-arnaque Mobile Money

**GPU Challenge 2026 · Epitech Bénin × UDU Technologies × Alliance Fintech UEMOA · cas d'usage n°7 : détection des arnaques financières numériques**

KORA vérifie un **SMS**, un **message WhatsApp** ou une **capture d'écran** (en français ou en fon). Il dit s'il s'agit d'une arnaque, **explique pourquoi** et donne **le bon réflexe**, avant que la personne ne paie.

🔗 **Application** : https://kora-0-01.vercel.app. L'analyse se fait dans le téléphone : un message en français ne quitte jamais l'appareil.

---

## Ce qui est livré

| Livrable | Où |
|---|---|
| Prototype utilisable | `web/` : application en ligne sur Vercel (voir ci-dessous) |
| Service fon et assistant | `space/` : Space Hugging Face (ZeroGPU) pour la traduction fon ⇄ français et la discussion avec KORA |
| Prototype GPU | `notebooks/` : 5 notebooks Colab (données, cerveau AfroXLMR, reconnaissance vocale fon, démo vocale, entraînement de la reconnaissance vocale fon sur J'aime Ma Langue) |
| Résultats et comparaison avec une référence | `resultats/` et ci-dessous |
| Reproductibilité | `python lite/entrainer_kora_lite.py` recalcule les métriques et le modèle de l'application en moins d'une minute sur CPU |
| Tests | `python -m pytest tests/` vérifie que l'application donne exactement les mêmes résultats que Python |

## L'application (`web/`)

- **Discussion façon messagerie** : on colle un message, KORA répond par une carte de verdict (arnaque probable, suspect, normal), les raisons et le bon réflexe.
- **Contexte de l'expéditeur** : KORA pose quelques questions (nom officiel ou numéro ordinaire, SMS ou WhatsApp, peut-on répondre, premier contact) et ajuste son avis. Chaque indice est affiché.
- **Captures d'écran** : lecture du texte dans le téléphone (Tesseract.js), y compris via « Partager → KORA » depuis une autre appli.
- **Fon écrit** : si l'utilisateur écrit en fon, le message est traduit en français pour l'analyse, puis KORA répond en fon (service `space/`). Traductions humaines possibles dans `web/fon.json`.
- **Assistant** : on peut poser des questions libres (« j'ai déjà payé, je fais quoi ? »). L'assistant (Qwen3, open source) explique le verdict de KORA-lite, il ne le remplace jamais.
- **Et aussi** : « J'ai déjà payé » (étapes d'urgence), catalogue des arnaques courantes, conseil du jour, historique gardé sur le téléphone, texte plus grand, moins d'animations, mascotte 3D qui réagit, installable et utilisable hors ligne.

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
  - **KORA-lite** : n-grammes de caractères et régression logistique, 570 Ko, **tourne hors ligne dans le téléphone**. C'est le modèle de l'application ;
  - **KORA AfroXLMR** : `Davlan/afro-xlmr-large-76L` affiné sur GPU (connaît le fon et le français), dans les notebooks.
- **Vocal** : la reconnaissance vocale (français avec Whisper, fon avec `mms-300m-fongbe`) se trouve dans la démo GPU (notebooks 3, 4 et 5). Elle n'est pas dans l'application web.

## Résultats

### Données
**5 342 messages** générés à partir de **142 modèles de messages** inspirés d'arnaques réelles au Bénin (2 034 messages normaux, 3 308 arnaques), avec des variations réalistes (abréviations, fautes, absence d'accents, emojis) et des **messages légitimes pièges** (vrais SMS de code, « félicitations pour ton diplôme », tirage de la tontine, vraies promos d'opérateur…).

**Découpage sans fuite** : par modèle de message (une même phrase à trous n'est jamais à la fois en entraînement et en test) et, pour la voix, **par locuteur**.

### KORA-lite, validation croisée groupée (5 plis)

| Seuil de risque | Arnaques détectées | Fausses alertes |
|---|---|---|
| ≥ 50 % (« suspect ») | **98,3 %** | 14,1 % |
| ≥ 70 % (« arnaque probable ») | **85,0 %** | **3,5 %** |

AUC arnaque / normal : **0,986** · F1 macro sur les 5 catégories : **0,876**.

**À détection comparable (85 % contre 87 %), KORA-lite fait environ 6 fois moins de fausses alertes que les règles seules (3,5 % contre 20,8 %).** Détails : `resultats/kora_lite_validation_croisee.json`.

### Comparaison avec la référence simple et avec le modèle GPU
| Modèle | Détection | Fausses alertes | Source |
|---|---|---|---|
| Référence simple : règles seules (au moins 1 signal) | 87,0 % | 20,8 % | `kora_lib.SIGNAUX` |
| Référence simple : règles seules (au moins 2 signaux) | 46,4 % | 1,8 % | idem |
| KORA-lite (TF-IDF, CPU), seuil 50 % / 70 % | 98,3 % / 85,0 % | 14,1 % / 3,5 % | ci-dessus |
| KORA AfroXLMR (GPU) | *à compléter après l'exécution Colab* | | `resultats/metriques_cerveau.csv` |
| Reconnaissance vocale fon, WER sur voix de téléphone (J'aime Ma Langue) | *à compléter après l'exécution Colab* | | `resultats/oreille_fon_*.json` |

Tous les chiffres KORA-lite et « règles seules » sont recalculés par `python lite/entrainer_kora_lite.py`.

### Limites
- Données d'entraînement **synthétiques** et uniquement en français : les formulations d'un même type se ressemblent, donc les scores sont **optimistes**. Le vrai juge, ce sont les **vrais messages** récoltés (`data/vrais_messages_MODELE.csv` donne le format).
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
pip install scikit-learn pandas numpy pytest
python lite/entrainer_kora_lite.py            # métriques + web/kora_lite.json
python -m pytest tests/                       # parité application / Python (nécessite Node.js 20+)
cd web && python -m http.server 8000          # application sur http://localhost:8000
```
Partie GPU : ouvrir les notebooks dans Google Colab (GPU T4), dans l'ordre 01 → 02 → 03 → 05 → 04.

## Licences des briques
`afro-xlmr-large-76L` (MIT), `whisper-small` (MIT), `wav2vec2-xls-r-300m` (Apache 2.0), `Qwen3-4B-Instruct-2507` (Apache 2.0), J'aime Ma Langue (CC-BY-SA-4.0), `mms-300m-fongbe`, NLLB-200 et `nllb-fongbe-french-translation` (CC-BY-NC, démonstration uniquement), Tesseract.js (Apache 2.0), three.js (MIT). Détails : `MODELES.md`.

## Équipe
Équipe KORA : 2 développeurs, 2 profils finance.
