# Site de présentation de KORA

Une page statique, sans outil de construction : `index.html` (styles et scripts inclus), l'image de la mascotte (`korachoupi.webp`) et l'icône (`icone.png`).

- **Voir le site** : ouvrir `site/index.html` dans un navigateur.
- **Le publier** : déployer le dossier `site/` tel quel (par exemple un projet Vercel dont le dossier racine est `site`).
- **Liens à adapter** : le bouton « Navigateur » pointe vers `https://kora-0-01.vercel.app` ; les boutons Android et Windows vers la dernière version GitHub (`/releases/latest`). Remplacer ces adresses dans `index.html` si le site a son propre domaine.
- **Contenu** : tout vient du projet (README, journal des versions, exemples de l'appli). Aucun avis ni chiffre d'usage n'est inventé : les chiffres de la carte sombre (modèle de 964 Ko, 5 types de messages, 2 langues, 3 écrans) sont ceux du dépôt.
- **Mascotte** : la vraie mascotte 3D de l'appli, non modifiée (`site/mascotte/korachoupi.html` et `site/vendor/three/`, copies exactes de `web/mascotte/` et `web/vendor/three/`). Elle ne se charge que lorsqu'elle est à l'écran (une ou deux à la fois), puis est pilotée par message : elle cligne, s'interroge, joue une note et change d'humeur selon l'endroit de la page (fâchée sur une arnaque, joyeuse sur un vrai SMS). Avec « réduire les animations » ou « économie de données », l'image fixe reste affichée (`korachoupi.webp`). Si l'appli change la mascotte, recopier ces deux fichiers.
- **Direction artistique** : celle de l'appli (`web/theme.css`). Fond lavande `#F6F3FF`, violet `#5B2FD6`, crème `#FFD9AE` et orange `#FF8A2B` du bois de la kora ; cartes colorées à gros arrondis (violet, vert, orange, rouge) ; bulles de message et pastilles d'état avec un point (rouge = arnaque, vert = normal) ; cordes orange qui vibrent, comme à l'écran de chargement ; Plus Jakarta Sans en gras ; icônes en trait. Un seul thème clair, comme l'appli.
