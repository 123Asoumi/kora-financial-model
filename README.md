# KORA-0.01 — le bouclier anti-arnaque Mobile Money

**GPU Challenge 2026 · Epitech Bénin × UDU Technologies × Alliance Fintech UEMOA · cas d'usage n°7 : détection des arnaques financières numériques**

KORA vérifie un **SMS**, un **message WhatsApp**, une **capture d'écran** ou un **message vocal** (français, fon), dit s'il s'agit d'une arnaque, **explique pourquoi** et donne **le bon réflexe**, avant que la personne ne paie.

🔗 **Application** : https://kora-0-01.vercel.app : l'analyse tourne dans le téléphone, aucun message n'est envoyé à un serveur.

---

## Ce qui est livré

| Livrable | Où |
|---|---|
| Prototype utilisable | `web/` : application déployée sur Vercel (KORA-lite dans le navigateur, lecture de captures d'écran, vocal français et fon, lecture à voix haute, installable et hors ligne) |
| Prototype GPU | `notebooks/` : 5 notebooks Colab (données, cerveau AfroXLMR, reconnaissance vocale fon, démo, entraînement de la reconnaissance vocale fon sur J'aime Ma Langue) |
| Résultats et comparaison avec une référence | `resultats/` et ci-dessous |
| Reproductibilité | `python lite/entrainer_kora_lite.py` recalcule les métriques et le modèle de l'application en ~2 min sur CPU |

## Architecture

```
SMS / message (FR, fon) ───────────────────────────────────────────────┐
Capture d'écran → lecture du texte (Tesseract, dans le navigateur) ─────┤
Vocal français  → reconnaissance vocale (navigateur / Whisper) ─────────┼→ cerveau KORA → risque + catégorie → explication + conseil
Vocal fon       → reconnaissance vocale fon (mms-300m-fongbe, adaptée ──┘     │                                + mascotte qui réagit
                   sur J'aime Ma Langue au notebook 5)                       │
                                                         KORA-lite (téléphone)  ou  KORA AfroXLMR (GPU)
```

- **5 catégories** : message normal, demande de code secret (faux agent), faux dépôt et renvoi d'argent, faux gain et **fausse offre de crédit**, faux blocage de compte et lien piégé.
- **Explications vérifiables** : la décision vient du modèle ; les raisons affichées viennent de règles transparentes (`kora_lib.SIGNAUX`). Elles n'inventent jamais de raison.
- **Deux tailles de modèle** :
  - **KORA-lite** : n-grammes de caractères et régression logistique, 566 Ko, **tourne hors ligne dans le téléphone** ;
  - **KORA AfroXLMR** : `Davlan/afro-xlmr-large-76L` affiné sur GPU (connaît le fon et le français).

## Résultats

### Données
5 100 messages générés à partir de **136 modèles de messages** inspirés d'arnaques réelles au Bénin, avec des variations réalistes (abréviations, fautes, absence d'accents, emojis) et des **messages légitimes pièges** (vrais SMS de code, « félicitations pour ton diplôme », tirage de la tontine…). Brouillons fon par traduction automatique, test fon par traductions humaines, vrais messages de terrain uniquement en test.

**Découpage sans fuite** : par modèle de message (une même phrase à trous n'est jamais à la fois en entraînement et en test) et, pour la voix, **par locuteur**.

### KORA-lite, validation croisée groupée (5 plis)

| Seuil de risque | Arnaques détectées | Fausses alertes |
|---|---|---|
| ≥ 50 % (« suspect ») | **98,3 %** | 14,1 % |
| ≥ 70 % (« arnaque probable ») | **85,0 %** | **3,5 %** |

AUC arnaque / normal : **0,986** (5 342 messages, données à jour avec les vraies promos d'opérateur). **À détection presque égale (85 % contre 87 %), KORA-lite fait 6 fois moins de fausses alertes que les règles seules (3,5 % contre 20,8 %).** Détails : `resultats/kora_lite_validation_croisee.json`.

### Comparaison avec la référence simple et avec le modèle GPU
| Modèle | Détection | Fausses alertes | Source |
|---|---|---|---|
| Référence simple : règles seules (au moins 1 signal) | 87,0 % | 20,8 % | `kora_lib.SIGNAUX` |
| Référence simple : règles seules (au moins 2 signaux) | 46,4 % | 1,8 % | idem |
| KORA-lite (TF-IDF, CPU), seuils 0,5 / 0,7 | 98,3 % / 85,0 % | 14,1 % / 3,5 % | ci-dessus |
| KORA AfroXLMR (GPU) | *résultat de l'exécution Colab* | | `resultats/metriques_cerveau.csv` |
| Reconnaissance vocale fon, WER sur voix de téléphone (J'aime Ma Langue) | *résultat Colab* | | `resultats/oreille_fon_*.json` |

### Limites
- Données d'entraînement **synthétiques** : les formulations d'un même type se ressemblent, donc les scores sont **optimistes**. Le vrai juge, ce sont les **vrais messages** récoltés.
- KORA analyse le **contenu** : un faux SMS identique au vrai ne se distingue que par l'**expéditeur**, ce qui demande une intégration opérateur (pilote).
- Le fon écrit repose en partie sur des traductions automatiques. La reconnaissance vocale fon de la démo est sous licence non commerciale (voir `MODELES.md` pour la version commerciale).
- KORA est une **aide à la vigilance**, pas une garantie.

## Le fon : écouter, comprendre, parler

Le dossier `space/` contient un **Space Hugging Face** (gratuit, CPU) que l'application appelle pour le fon :
vocal fon → texte fon (`mms-300m-fongbe`) → traduction française (`nllb-fongbe-french-translation`) → analyse par KORA ;
et dans l'autre sens, le conseil de KORA lu **en fon** (`mms-tts-fon`). Les messages en fon passent par ce service ; les messages en français restent sur le téléphone.

## Reproduire

```bash
pip install scikit-learn pandas numpy
python lite/entrainer_kora_lite.py            # métriques + web/kora_lite.json
cd web && python -m http.server 8000          # application sur http://localhost:8000
```
Partie GPU : ouvrir les notebooks dans Google Colab (GPU T4), dans l'ordre 01 → 02 → 03 → 05 → 04.

## Licences des briques
`afro-xlmr-large-76L` (MIT), `whisper-small` (MIT), `wav2vec2-xls-r-300m` (Apache 2.0), J'aime Ma Langue (CC-BY-SA-4.0), `mms-300m-fongbe` et NLLB-200 (CC-BY-NC, démo uniquement), Tesseract.js (Apache 2.0), three.js (MIT). Détails : `MODELES.md`.

## Équipe
Équipe KORA : 2 développeurs, 2 profils finance.
