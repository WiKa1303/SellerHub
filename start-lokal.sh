#!/bin/bash
# SellerHub lokal ansehen: Website (/) + App (/app/) — bis amzsellerhub.de erreichbar ist.
cd "$(dirname "$0")"
open "http://localhost:5173/" 2>/dev/null &
exec node lokaler-server.mjs
