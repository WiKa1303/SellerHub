#!/bin/bash
# ═══ SellerHub-Frontend auf den Webspace laden (amzsellerhub.de, netcup) ═══
# Lädt NUR die App-Dateien hoch: index.html + css/ + js/
# (nicht: backups/, server/, *.md, .claude/, node_modules/, .git/)
#
# Nutzung:
#   WEBSPACE_HOST=hostingXXXXXX.netcup.net WEBSPACE_USER=hostingXXXXXX ./deploy-frontend.sh
# Optional:
#   WEBSPACE_DIR=httpdocs   Zielverzeichnis auf dem Server (Standard: httpdocs)
#
# Die Zugangsdaten stehen im netcup CCP unter Webhosting → Zugangsdaten (SSH/SFTP).
# Passwort wird interaktiv abgefragt (SSH-Key geht natürlich auch).
set -euo pipefail

HOST="${WEBSPACE_HOST:?WEBSPACE_HOST fehlt (z. B. hostingXXXXXX.netcup.net)}"
USER="${WEBSPACE_USER:?WEBSPACE_USER fehlt (z. B. hostingXXXXXX)}"
DIR="${WEBSPACE_DIR:-httpdocs}"
SRC="$(cd "$(dirname "$0")" && pwd)"

echo "→ Lade Frontend nach $USER@$HOST:$DIR …"
rsync -avz --delete \
  --include='index.html' \
  --include='css/***' \
  --include='js/***' \
  --exclude='*' \
  "$SRC/" "$USER@$HOST:$DIR/"

echo "✓ Fertig. Test: https://amzsellerhub.de aufrufen (ggf. Cache leeren)."
echo "  Hinweis: App-Daten (localStorage) hängen an der Domain — einmalig per Export/Import migrieren."
