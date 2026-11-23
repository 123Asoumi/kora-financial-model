# 🧩 Les modèles open source de KORA : lequel pour quoi ?

KORA assemble **trois briques**. Pour chacune, voici le modèle choisi, les alternatives open source, et pourquoi. Toutes les licences ont été vérifiées sur Hugging Face le 23/11/2026.

> **Rappel** : un modèle « de base » (pré-entraîné), c'est un modèle qui sait déjà quelque chose (une langue, des sons). On le **spécialise** avec nos données : c'est le *fine-tuning*. On ne part jamais de zéro.

---

## 1. Le cerveau : lire un message et dire si c'est une arnaque

Tâche : **classification de texte** (un message → une des 5 catégories). Notebook 2, réglage `MODELE_BASE`.

| Modèle | Taille | Connaît le fon ? | Licence | Verdict |
|---|---|---|---|---|
| **[Davlan/afro-xlmr-large-76L](https://huggingface.co/Davlan/afro-xlmr-large-76L)** ⭐ | 560 M | ✅ oui (76 langues africaines + français) | MIT ✅ | **Choix principal** : le seul modèle sérieux qui connaît le fon et le français, utilisable commercialement |
| [Davlan/afro-xlmr-base](https://huggingface.co/Davlan/afro-xlmr-base) | 278 M | ❌ (17 langues, dont yoruba et français) | MIT ✅ | Plus rapide et plus stable ; bon plan B si le large plante |
| [xlm-roberta-base](https://huggingface.co/FacebookAI/xlm-roberta-base) | 278 M | ❌ | MIT ✅ | La référence mondiale multilingue ; plan B universel |
| [UBC-NLP/serengeti](https://huggingface.co/UBC-NLP/serengeti) | ~280 M | ✅ oui (517 langues africaines) | ⚠️ licence non indiquée sur la page : à vérifier avant tout usage | Alternative intéressante pour comparer |
| [masakhane/afroxlmr-large-ner-masakhaner-1.0_2.0](https://huggingface.co/masakhane/afroxlmr-large-ner-masakhaner-1.0_2.0) | 560 M | ✅ (entraîné pour la reconnaissance de noms, fon inclus) | AFL-3.0 | Pas pour la classification, mais utile pour repérer des noms et montants plus tard |

**Pourquoi pas ChatGPT, Llama ou Qwen (les modèles génératifs) ?** Ils sont beaucoup plus gros (des milliards de paramètres) et parlent mal le fon. Ils répondent aussi différemment d'une fois à l'autre, alors qu'un classifieur donne une probabilité stable et mesurable, et peut tourner chez un opérateur sans envoyer les messages ailleurs.

💡 **Pour aller plus loin** : entraînez deux modèles (afro-xlmr-large-76L puis xlm-roberta-base) et comparez-les dans le tableau de résultats. Montrer au jury qu'un modèle qui connaît le fon fait mieux, c'est un argument fort.

---

## 2. L'oreille fon : transformer un vocal en texte

Tâche : **reconnaissance vocale** (ASR). Notebooks 3 et 5.

| Modèle | Taille | Fon ? | Licence | Verdict |
|---|---|---|---|---|
| **[Professor/mms-300m-fongbe](https://huggingface.co/Professor/mms-300m-fongbe)** ⭐ | 315 M | ✅ spécialisé fon, avec les tons | CC-BY-NC ❌ | **Pour la démo** : le meilleur disponible (9,48 % d'erreurs annoncés sur ALFFA) |
| [facebook/mms-1b-all](https://huggingface.co/facebook/mms-1b-all) | 965 M | ✅ parmi 1 100+ langues (module fon) | CC-BY-NC ❌ | Plus gros, généraliste ; à comparer si vous avez le temps |
| **[facebook/wav2vec2-xls-r-300m](https://huggingface.co/facebook/wav2vec2-xls-r-300m)** ⭐ | 300 M | ❌ (n'a jamais entendu le fon) | **Apache 2.0 ✅** | **Pour le produit** : base de « notre propre oreille », entraînée sur J'aime Ma Langue (notebook 5, option B) |
| [facebook/mms-300m](https://huggingface.co/facebook/mms-300m) | 300 M | sons de 1 400 langues | CC-BY-NC ❌ | La base du modèle de Professor ; même limite de licence |

**Les données pour l'oreille :** [JaimeMaLangue/JML-fon-speech-v1](https://huggingface.co/datasets/JaimeMaLangue/JML-fon-speech-v1) contient des centaines de milliers d'enregistrements en fon faits au téléphone, transcrits avec les tons et validés par des linguistes. Licence **CC-BY-SA-4.0** : usage commercial autorisé en citant J'aime Ma Langue. Le kit s'en sert :
- **notebook 3** pour **mesurer** l'oreille sur des voix de téléphone ;
- **notebook 5** pour **entraîner** l'oreille (option A : adapter `mms-300m-fongbe` ; option B : créer la vôtre à partir de XLS-R).

---

## 3. L'oreille française

| Modèle | Licence | Verdict |
|---|---|---|
| **[openai/whisper-small](https://huggingface.co/openai/whisper-small)** ⭐ | MIT ✅ | Bon compromis vitesse et qualité sur le GPU T4 |
| openai/whisper-large-v3 | MIT ✅ | Meilleur mais plus lent ; utile si les vocaux sont très bruités |

---

## 4. Le traducteur (pour fabriquer des brouillons en fon)

| Modèle | Licence | Verdict |
|---|---|---|
| **[facebook/nllb-200-distilled-600M](https://huggingface.co/facebook/nllb-200-distilled-600M)** ⭐ | CC-BY-NC ❌ | Connaît le fon (`fon_Latn`) ; qualité moyenne. Il sert uniquement à fabriquer les brouillons d'entraînement (notebook 1) |

---

## 🎯 Le résumé à donner au jury

| Brique | Démo (challenge) | Produit (commercial) |
|---|---|---|
| Cerveau | AfroXLMR-large-76L affiné (MIT) | identique ✅ |
| Oreille fon | mms-300m-fongbe (non commercial) | **notre oreille** XLS-R entraînée sur J'aime Ma Langue ✅ |
| Oreille française | Whisper small (MIT) | identique ✅ |
| Données fon | brouillons NLLB + traductions humaines | traductions humaines uniquement ✅ |

> « Chaque brique de KORA a une version utilisable commercialement. Pour la démo, on prend les meilleurs modèles de recherche ; pour le produit, on a déjà le chemin : nos propres poids, entraînés sur la base vocale nationale du Bénin. »
