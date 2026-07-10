#!/bin/bash
# ═══ AMZ SellerHub auf den Webspace laden (amzsellerhub.de, netcup) ═══
# Ziel-Layout:  Website (website/*) → httpdocs/          (amzsellerhub.de)
#               App (index.html+css/+js/) → httpdocs/app/ (amzsellerhub.de/app/)
# (nicht hochgeladen: backups/, server/, *.md, .claude/, node_modules/, .git/)
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

# Sicherheit: kein Dev-only-Script (impeccable-live → localhost:8400) in die Produktion.
# Ein lokaler Prozess auf dem Loopback-Port könnte sonst beliebiges JS einschleusen.
if grep -qE 'impeccable-live-start|localhost:8400/live\.js' "$SRC/index.html"; then
  echo "✗ Abbruch: index.html enthält den impeccable-live Dev-Script-Block (localhost:8400)." >&2
  echo "  Entferne den <!-- impeccable-live-start --> … <!-- impeccable-live-end --> Block vor dem Deploy." >&2
  exit 1
fi

echo "→ 1/2 Website nach $USER@$HOST:$DIR …"
tar czf - -C "$SRC/website" --exclude '.DS_Store' --exclude 'README.md' . \
  | ssh "$USER@$HOST" "cd '$DIR' && tar xzf -"

echo "→ 2/2 App nach $USER@$HOST:$DIR/app …"
tar czf - -C "$SRC" --exclude '.DS_Store' index.html css js \
  | ssh "$USER@$HOST" "mkdir -p '$DIR/app' && cd '$DIR/app' && tar xzf -"

echo "✓ Fertig. Test: https://amzsellerhub.de (Website) + https://amzsellerhub.de/app/ (App)."
echo "  Hinweis: App-Daten (localStorage) hängen an der Domain — einmalig per Export/Import migrieren."
