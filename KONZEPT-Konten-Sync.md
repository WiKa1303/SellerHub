# Konzept: Konten + Daten-Sync (SaaS-Fundament, Modul 1)

Stand 5.7.2026 · Ziel: Echte Benutzerkonten auf dem Railway-Backend + automatischer
Daten-Sync zwischen Geräten. Ersetzt mittelfristig den clientseitigen `WikaAuth`-Login
und den Export/Import-Tanz. Eintrittskarte für SaaS (Fahrplan Phase 4).

## Leitplanken

1. **Offline bleibt heilig.** Die App funktioniert weiterhin komplett ohne Konto
   (file:// und gehostet). Cloud-Konto ist in v1 ein **Opt-in obendrauf** —
   der lokale WikaAuth-Login bleibt vorerst unangetastet.
2. **Keine neuen npm-Dependencies.** Passwort-Hashing mit Node-Bordmitteln
   (`crypto.scrypt`), Session-Tokens als Zufallswerte (kein JWT nötig).
3. **Konventionen des Radars gelten** (server/CLAUDE.md): Deutsch, Degradation,
   Idempotenz, pg-mem-Tests, SQL nur in data/repos.

## Datenmodell (Postgres)

| Tabelle | Spalten (Kern) | Zweck |
|---|---|---|
| `users` | id uuid PK, email UNIQUE (lowercase), password_hash (scrypt: salt$hash), display_name, role ('user'/'admin'), created_at, last_login_at | Konten |
| `sessions` | token_hash PK (sha256 des Tokens), user_id FK, created_at, expires_at, last_seen_at | opake, widerrufbare Sessions (30 Tage, gleitend) |
| `user_data` | user_id FK + key text (PK zusammen), value jsonb, updated_at, version int | Key-Value-Sync-Speicher (Spiegel der localStorage-Keys) |

Klartext-Token verlässt nie die DB (nur sha256-Hash gespeichert). Passwort-Regeln: min. 8 Zeichen.

## API (unter /api/auth und /api/sync)

- `POST /api/auth/register` {email, password, displayName} — nur mit gültigem
  `inviteCode` (ENV `REGISTRATION_CODE`; leer = Registrierung geschlossen).
- `POST /api/auth/login` {email, password} → {token, user}. Rate-Limit: max. 10
  Fehlversuche/15 min je E-Mail (in-memory, fail-soft).
- `POST /api/auth/logout` (Bearer) — Session löschen.
- `GET /api/auth/me` (Bearer) → user.
- `POST /api/auth/change-password` (Bearer).
- `GET /api/sync` (Bearer) → alle {key, value, updated_at, version} des Users.
- `PUT /api/sync` (Bearer) {items:[{key, value, baseVersion}]} — Upsert je Key;
  `baseVersion` ≠ aktuelle Version → 409 mit Server-Stand (Konflikt meldet der Client).
- Auth via `Authorization: Bearer <token>` (localStorage im Client; CORS-Header ergänzen).
- Größenlimits: value ≤ 512 KB, Summe je User ≤ 10 MB (ehrliche Fehler, kein Abschneiden).

## Frontend (v1: js/sync.js, Opt-in)

1. Neues Modul `js/sync.js` (IIFE, Präfix `sy…`): Login/Registrieren-Dialog
   („☁️ Cloud-Konto" im Header/Einstellungen), Token in localStorage `sy_token`.
2. **Pull bei Start/Login:** Server-Keys mit lokalen mergen — pro Key gewinnt der
   neuere `updated_at`-Stand (Client führt dafür `sy_meta` mit Zeitstempeln je Key).
3. **Push automatisch:** Data-Layer-Schreibpfad (D.save/persist) bekommt einen Hook →
   geänderte Keys werden gesammelt und debounced (3 s) per PUT gesynct.
4. **Konflikt (409):** Server-Stand übernehmen, Toast „Neuerer Stand von anderem
   Gerät übernommen" — last-write-wins, aber sichtbar.
5. Statusanzeige: ☁️-Icon (grau = aus, grün = synchron, orange = ausstehend, rot = Fehler).
6. Erste Anmeldung auf neuem Gerät = automatische Daten-Migration (Pull). Export/Import bleibt als Backup-Weg bestehen.

## Nicht in v1 (bewusst)

- WikaAuth-Ablösung, Basic-Auth-Entfernung (erst wenn Cloud-Login sich bewährt)
- E-Mail-Versand (Passwort-Reset macht der Admin per Skript), Teams/Sharing, Billing
- Feld-Level-Merge (Key-Ebene reicht für die App-Struktur)

## Umsetzungs-Reihenfolge

1. Backend: Schema + Repos + Auth-Service + Routen + Tests (pg-mem)
2. Frontend: sync.js + UI + Data-Layer-Hook + Playwright-Check
3. Deploy + Ende-zu-Ende-Test mit echtem Konto + REGISTRATION_CODE auf Railway
