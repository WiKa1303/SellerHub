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
# Auth: SSH-Key (seit 7.7.2026 installiert, ~/.ssh/id_ed25519) — läuft ohne Passwort.
# Upload per tar-über-SSH: auf dem netcup-Webspace gibt es KEIN rsync.
# Gelöschte lokale Dateien bleiben auf dem Server liegen (tar löscht nichts) — bei Bedarf per ssh aufräumen.
set -euo pipefail

HOST="${WEBSPACE_HOST:-a2fa9.netcup.net}"
USER="${WEBSPACE_USER:-hosting120520}"
DIR="${WEBSPACE_DIR:-amzsellerhub.de/httpdocs}"
SRC="$(cd "$(dirname "$0")" && pwd)"

echo "→ Lade Frontend nach $USER@$HOST:$DIR …"
tar czf - -C "$SRC" --exclude '.DS_Store' index.html css js \
  | ssh "$USER@$HOST" "cd '$DIR' && tar xzf -"

echo "✓ Fertig. Test: https://amzsellerhub.de aufrufen (ggf. Cache leeren)."
echo "  Hinweis: App-Daten (localStorage) hängen an der Domain — einmalig per Export/Import migrieren."
