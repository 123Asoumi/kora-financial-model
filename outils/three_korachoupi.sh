#!/usr/bin/env bash
# Refait web/vendor/three/three-korachoupi.min.js : three.js réduit aux pièces dont Korachoupi se sert
# (les « t.Xxx » de web/mascotte/korachoupi.html, plus RoomEnvironment), minifié.
# À relancer si on change de version de three ou si la mascotte utilise une nouvelle pièce.
# Prérequis : npm install --no-save three@0.187.0 ; esbuild est téléchargé par npx.
set -euo pipefail
cd "$(dirname "$0")/.."
noms=$(grep -o '\bt\.[A-Za-z_][A-Za-z0-9_]*' web/mascotte/korachoupi.html | sort -u | sed 's/^t\.//' | paste -sd, -)
entree=$(mktemp --suffix=.mjs)
cat > "$entree" <<FIN
export { $noms } from "$PWD/node_modules/three/build/three.module.js"
export { RoomEnvironment } from "$PWD/node_modules/three/examples/jsm/environments/RoomEnvironment.js"
FIN
NODE_PATH="$PWD/node_modules" npx --yes esbuild@0.25.0 "$entree" --bundle --format=esm --minify --legal-comments=eof \
  --target=es2020 --alias:three="$PWD/node_modules/three/build/three.module.js" --outfile=web/vendor/three/three-korachoupi.min.js
rm -f "$entree"
