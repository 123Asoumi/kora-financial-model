# L'application Android de KORA-lite

L'application Android est l'application web de `web/`, emballée avec **Capacitor**. Elle ajoute deux choses que le navigateur ne permet pas :

1. **La bulle KORA** : la mascotte elle-même, détourée et sans cercle autour, flotte par-dessus les autres applis, comme les bulles de Messenger. On la touche dans WhatsApp ou dans ses SMS : elle capture l'écran et ouvre KORA, qui lit le message et dit si c'est une arnaque.
2. **Partager → KORA-lite** depuis n'importe quelle appli (capture d'écran ou texte sélectionné).

L'analyse reste dans le téléphone, comme dans l'application web.

## Installer l'application

1. Sur le téléphone, ouvrir la page des versions : https://github.com/123Asoumi/kora-financial-model/releases/latest
2. Télécharger `KORA-lite-<version>.apk`.
3. Ouvrir le fichier. Android demande d'autoriser l'installation d'applications depuis le navigateur ou le gestionnaire de fichiers : accepter pour cette fois.

Android 7.0 ou plus récent.

## Utiliser la bulle

1. Toucher la mascotte (en bas de l'écran de discussion), puis **« Bulle sur les autres applis »**. On peut aussi passer par **Paramètres → Bulle KORA**.
2. Android demande deux autorisations :
   - **« Afficher par-dessus les autres applis »** : activer l'interrupteur pour KORA-lite, puis revenir ;
   - **la capture d'écran** : choisir **« Tout l'écran »**, puis « Démarrer ».
3. La bulle apparaît. Aller dans la messagerie, ouvrir le message louche et **toucher la bulle** : elle se cache, capture l'écran et ouvre KORA avec le verdict.
4. **Déplacer** la bulle : la faire glisser, elle se colle au bord. **Fermer** : la glisser sur la croix en bas de l'écran, ou toucher « Arrêter la bulle » dans la notification « KORA veille sur tes messages ».

Pendant que la bulle est active, Android affiche l'icône de capture d'écran dans la barre d'état : c'est normal. KORA ne garde que les dernières captures, dans son propre dossier, et ne les envoie nulle part. Quand KORA est ouvert, la bulle se cache.

## Comment c'est fait

| Fichier | Rôle |
|---|---|
| `capacitor.config.json` | Identifiant `bj.kora.lite`, nom « KORA-lite », dossier web `web/` |
| `android/app/src/main/java/bj/kora/lite/BulleService.java` | La bulle : fenêtre par-dessus les autres applis, déplacement, aimantation au bord, croix de fermeture, capture de l'écran (MediaProjection) |
| `android/app/src/main/java/bj/kora/lite/BulleKoraPlugin.java` | Le pont avec la page : autorisations, démarrage et arrêt de la bulle, envoi des captures et des partages à la page |
| `web/natif.js` | Le même pont, côté page. Dans un navigateur, il ne fait rien |
| `web/vendor/capacitor-core.js` | `@capacitor/core` (licence MIT), copié tel quel car l'application web n'utilise pas d'outil de compilation |
| `outils/rendu_mascotte.mjs` | Fait un rendu de la mascotte 3D (Korachoupi, `web/mascotte/korachoupi.html`) sur fond transparent : `outils/mascotte_detouree.png` |
| `outils/ressources_android.py` | Fabrique l'icône et l'écran de démarrage (à partir de `web/icone-512.png`) et la bulle (la mascotte détourée, sans son ombre) |

## Compiler

Il faut Node.js 22, Java 21 et le SDK Android (plateforme 36).

```bash
npm ci
npx cap sync android           # copie web/ dans l'application Android
cd android && ./gradlew assembleDebug
```

L'APK de test se trouve dans `android/app/build/outputs/apk/debug/app-debug.apk`. Elle est signée avec une clé de débogage : elle s'installe, mais on ne peut pas la mettre à jour avec la version officielle (il faut d'abord la désinstaller).

Après chaque modification de `web/`, relancer `npx cap sync android`.

À chaque pull request, GitHub compile aussi cette APK de test : onglet **Actions**, puis le dernier passage de « Tests et APK de test », rubrique **Artifacts**.

## Version et signature

**Une seule version pour tout le projet** : celle de `package.json`. L'application Android la lit directement (`versionName` 1.0.0, `versionCode` 10000). Voir `CHANGELOG.md` pour publier une nouvelle version.

Android n'installe que des applications **signées**, et n'accepte une mise à jour que si elle est signée avec **la même clé**. Cette clé ne doit jamais être dans le dépôt.

### Créer la clé (une seule fois, sur son ordinateur)

```bash
keytool -genkeypair -v -keystore kora-lite.jks -alias kora-lite -keyalg RSA -keysize 4096 -validity 10000
```

⚠️ Garder `kora-lite.jks` et ses mots de passe en lieu sûr, avec une sauvegarde. **Si la clé est perdue, on ne peut plus jamais mettre à jour l'application chez les utilisateurs** : il faudrait publier une nouvelle application.

### Donner la clé à GitHub

Dans le dépôt : **Settings → Secrets and variables → Actions → New repository secret**, ajouter :

| Secret | Valeur |
|---|---|
| `KORA_KEYSTORE_BASE64` | le contenu de `kora-lite.jks` en base 64 : `base64 -w0 kora-lite.jks` (Linux) ou `base64 -i kora-lite.jks` (macOS) |
| `KORA_KEYSTORE_MOT_DE_PASSE` | le mot de passe du fichier |
| `KORA_CLE_ALIAS` | `kora-lite` |
| `KORA_CLE_MOT_DE_PASSE` | le mot de passe de la clé (souvent le même) |

### Publier

**Automatique** : il suffit de changer le numéro de version (voir `CHANGELOG.md`) et d'envoyer sur `main`. Le workflow « Publier une version » se lance tout seul : si ce numéro n'a pas encore été publié, il lance les tests, compile l'APK, la signe, vérifie la signature et crée la version GitHub `v<version>` avec l'APK et son empreinte SHA-256. Si le numéro est déjà publié, il ne fait rien. On peut aussi le lancer à la main (onglet **Actions → « Publier une version » → Run workflow**).

### Mise à jour sur les téléphones

Depuis la 1.0.5, l'appli regarde à chaque ouverture (au plus toutes les 3 heures quand elle est à jour) la dernière version publiée sur GitHub. S'il y en a une plus récente, un bandeau propose **« Mettre à jour »** : l'appli télécharge l'APK, vérifie son empreinte SHA-256, puis ouvre l'installateur d'Android. On peut aussi chercher une mise à jour dans **Paramètres → Mises à jour**.

- La première fois, Android demande d'**autoriser KORA-lite à installer des applis** : il ouvre le réglage, puis on touche encore « Mettre à jour ».
- Android demande toujours de **confirmer** la mise à jour : une appli installée hors Play Store ne peut pas se mettre à jour en silence. Seul le Play Store le permet.
- La mise à jour garde l'historique et les réglages, car elle est signée avec la même clé.
- Les téléphones en 1.0.4 ou avant doivent installer la 1.0.5 **une fois à la main**, car ces versions ne savent pas encore se mettre à jour.

### Une seule clé pour toutes les versions

L'**empreinte SHA-256 du certificat** est publique (ce n'est pas un secret). On peut la lire sur son ordinateur avec `keytool -list -v -keystore kora-lite.jks -alias kora-lite` (ligne « SHA256: »), ou dans le workflow à la première publication (avertissement jaune, et à la fin des notes de version). La copier dans `android/empreinte-cle.txt` et l'envoyer sur `main`. À partir de là, le workflow **refuse** toute APK signée avec une autre clé : chaque mise à jour est garantie signée par la même clé, donc installable par-dessus la précédente.

Pour signer sur son ordinateur, créer `android/keystore.properties` (ignoré par git) :

```properties
KORA_KEYSTORE=/chemin/vers/kora-lite.jks
KORA_KEYSTORE_MOT_DE_PASSE=...
KORA_CLE_ALIAS=kora-lite
KORA_CLE_MOT_DE_PASSE=...
```

puis `cd android && ./gradlew assembleRelease`.

## Limites

- La bulle demande deux autorisations sensibles. Android 14 et plus redemande la capture d'écran à chaque nouvelle activation de la bulle.
- Si l'utilisateur choisit « Une seule appli » au lieu de « Tout l'écran », la bulle ne voit que cette appli.
- Certaines applis (banques, contenus protégés) interdisent les captures : l'image est alors noire, et KORA dit qu'il ne trouve pas de texte.
- La lecture du texte (Tesseract) se télécharge à la première utilisation : il faut une connexion la première fois.
- L'APK n'est pas publiée sur le Play Store. Pour y aller, il faudra justifier l'usage de la capture d'écran et de l'affichage par-dessus les autres applis auprès de Google.
