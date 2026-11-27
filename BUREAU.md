# KORA-lite pour Windows

Le dossier `desktop/` emballe la même application que sur le téléphone (le dossier `web/`) dans une fenêtre Windows avec Electron, et lui ajoute la **bulle KORA** : la mascotte flotte par-dessus les autres fenêtres. On clique dessus dans WhatsApp Web, un mail ou un SMS affiché à l'écran : elle capture l'écran et KORA dit si le message est une arnaque.

## Installer

1. Télécharger `KORA-lite-<version>-Windows.exe` sur la [dernière version](https://github.com/123Asoumi/kora-financial-model/releases/latest) et le lancer (pas besoin d'être administrateur).
2. L'installateur n'est pas encore signé : Windows SmartScreen affiche « Windows a protégé votre PC ». Cliquer sur **Informations complémentaires**, puis **Exécuter quand même**. L'empreinte SHA-256 est dans les notes de la version.

## Utiliser la bulle

1. Cliquer sur la mascotte, puis **« Bulle sur les autres applis »** (ou **Paramètres → Bulle KORA**).
2. La bulle apparaît dès qu'on quitte la fenêtre de KORA (ou qu'on la réduit) : quand KORA est au premier plan, elle se cache.
3. Afficher le message louche, puis **cliquer sur la bulle** : elle se cache une fraction de seconde, capture l'écran sur lequel elle se trouve, et KORA s'ouvre avec le verdict.
4. **Déplacer** : la glisser, elle se colle au bord gauche ou droit. **Menu** : clic droit sur la bulle ou sur l'icône de la zone de notification (« Vérifier l'écran », « Ouvrir KORA », « Arrêter la bulle », « Quitter KORA »).

Fermer la fenêtre de KORA tant que la bulle est active range seulement la fenêtre : la bulle reste. La capture n'est pas enregistrée dans un fichier et n'est envoyée nulle part : elle passe directement de la bulle à la page de KORA, qui la lit dans l'ordinateur (OCR Tesseract).

Pas de « Suivre un appel » dans l'appli Windows pour l'instant.

## Fichiers

| Fichier | Rôle |
|---|---|
| `desktop/main.js` | Processus principal : fenêtre de KORA, bulle (fenêtre transparente toujours au premier plan, non focalisable), capture d'écran (`desktopCapturer`), icône de la zone de notification, protocole `kora://app/` qui sert le dossier `web/` |
| `desktop/preload-kora.js` | Le pont vers la page de KORA : état, démarrage et arrêt de la bulle, réception des captures (`window.koraBureau`) |
| `desktop/preload-bulle.js`, `desktop/bulle.html` | La bulle : appui court = vérifier, glisser = déplacer, clic droit = menu |
| `desktop/outils.js` | Chemin sûr des fichiers de la page, types MIME, aimantation au bord (testés dans `desktop/tests/`) |
| `desktop/assets/` | La mascotte détourée (la même que la bulle Android), icône de l'appli et de la zone de notification |
| `web/natif.js` | Côté page : `estBureau` et les mêmes fonctions de bulle que sur Android |

La page n'a aucun accès à Node.js (isolation de contexte et bac à sable). Elle ne peut parler à l'appli que par `window.koraBureau`, et l'appli vérifie d'où vient chaque message. Seul le micro est autorisé.

## Développer

```bash
cd desktop
npm install
npm test        # tests de outils.js
npm start       # lance l'appli (lit ../web directement)
npm run dist    # installateur dans desktop/dist/ (à lancer sous Windows)
```

L'installateur est fabriqué par GitHub, sur Windows : `.github/workflows/bureau.yml` à chaque changement de `desktop/` ou `web/` (fichier téléchargeable dans l'onglet Actions), et `.github/workflows/publier.yml` l'attache à la version GitHub en même temps que l'APK.

## Limites

- Pas de signature de code : SmartScreen avertit au premier lancement. Un certificat de signature de code règlerait cela.
- Pas de mise à jour intégrée : pour une nouvelle version, relancer le nouvel installateur (les données et réglages sont gardés).
- La dictée du navigateur n'existe pas dans Electron : l'appli utilise l'enregistrement du micro et la reconnaissance de KORA.
- Seul Windows est construit. Le code marche aussi sous macOS et Linux (la capture d'écran demande une autorisation sur macOS), mais rien n'est publié pour eux.
