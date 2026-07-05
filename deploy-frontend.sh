#!/bin/bash
# ═══ SellerHub-Frontend auf den Webspace laden (amzsellerhub.de, netcup) ═══
# Lädt NUR die App-Dateien hoch: index.html + css/ + js/
# (nicht: backups/, server/, *.md, .claude/, node_modules/, .git/)
#
# Nutzung:
#   ./deploy-frontend.sh          (Defaults: a2fa9.netcup.net, hosting120520, amzsellerhub.de/httpdocs)
# Optional:
#   WEBSPACE_DIR=…   Zielverzeichnis überschreiben (Standard: amzsellerhub.de/httpdocs)
#
# Die Zugangsdaten stehen im netcup CCP unter Webhosting → Zugangsdaten (SSH/SFTP).
# Passwort wird interaktiv abgefragt (SSH-Key geht natürlich auch).
set -euo pipefail

HOST="${WEBSPACE_HOST:-a2fa9.netcup.net}"
USER="${WEBSPACE_USER:-hosting120520}"
DIR="${WEBSPACE_DIR:-amzsellerhub.de/httpdocs}"
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
