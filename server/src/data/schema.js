// ═══ DATA LAYER: Pool + Schema (Auto-Migration, idempotent) ═══
// Alle DDL an EINEM Ort. Repositories (Queries) liegen je Domäne in repos/.
import pg from 'pg';
import { config } from '../core/config.js';
import { log } from '../core/logger.js';

let pool = null;

/** Pool initialisieren. poolOverride erlaubt Tests mit pg-mem (ohne echtes Postgres). */
export async function initDb(poolOverride) {
  pool = poolOverride || new pg.Pool({
    connectionString: config.databaseUrl,
    // Managed-Postgres (Railway/Render/Neon) verlangt meist SSL:
    ssl: config.databaseUrl.includes('localhost') || config.databaseUrl.includes('127.0.0.1')
      ? false : { rejectUnauthorized: false },
    max: 5,
  });

  // ── Artikel/Events (Owner: crawler + intelligence) ──
  // MVP-Entscheidung: id = SHA-256 der kanonischen URL (PK = Dublettenschutz Ebene 1).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS news_events (
      id              TEXT PRIMARY KEY,
      title           TEXT NOT NULL,
      title_norm      TEXT NOT NULL,
      summary         TEXT,
      url             TEXT NOT NULL,
      source          TEXT NOT NULL,
      publish_date    TIMESTAMPTZ NOT NULL,
      country         TEXT NOT NULL DEFAULT 'DE',
      type            TEXT NOT NULL DEFAULT 'news',
      relevance_score INTEGER NOT NULL DEFAULT 0,
      event_start     TIMESTAMPTZ,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ne_feed ON news_events (type, relevance_score DESC, publish_date DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ne_created ON news_events (created_at)`);

  // KI-Analyse-Spalten (Phase 3/4). ai_summary = JSON-Array · ai_tokens_* = Kosten-Logging
  // ai_feedback = 👍/👎 (+1/-1) → Trainings-/Eval-Datensatz · ai_topic/opportunity/affected = Trend-Input
  for (const col of [
    `ai_score INTEGER`, `ai_category TEXT`, `ai_urgency TEXT`, `ai_impact TEXT`,
    `ai_reasoning TEXT`, `ai_summary TEXT`, `ai_model TEXT`,
    `ai_tokens_in INTEGER`, `ai_tokens_out INTEGER`,
    `ai_analyzed_at TIMESTAMPTZ`, `ai_attempts INTEGER DEFAULT 0`, `ai_error TEXT`,
    `ai_feedback INTEGER`,
    `ai_topic TEXT`, `ai_opportunity TEXT`, `ai_affected TEXT`,
  ]) {
    await pool.query(`ALTER TABLE news_events ADD COLUMN IF NOT EXISTS ${col}`);
  }

  // ── Trend-Engine (Owner: intelligence) ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS trend_topics (
      id                  TEXT PRIMARY KEY,          -- kanonischer Themen-Slug
      topic_name          TEXT NOT NULL,
      trend_score         INTEGER NOT NULL DEFAULT 0,
      growth_rate         REAL NOT NULL DEFAULT 0,   -- % (7-Tage vs. erwartet aus 30-Tage-Basis)
      mentions_7d         INTEGER NOT NULL DEFAULT 0,
      mentions_30d        INTEGER NOT NULL DEFAULT 0,
      source_count        INTEGER NOT NULL DEFAULT 0,
      spike               INTEGER NOT NULL DEFAULT 0,
      risk_or_opportunity TEXT NOT NULL DEFAULT 'neutral',
      summary             TEXT,
      recommended_action  TEXT,
      item_ids            TEXT,                      -- JSON-Array der Beleg-Artikel
      created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  // Tages-Zeitreihe je Topic = Sparklines heute, Forecasting-Datensatz (Phase 5)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS topic_daily (
      topic_id TEXT NOT NULL,
      day      TEXT NOT NULL,                        -- YYYY-MM-DD
      mentions INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (topic_id, day)
    )`);

  // ── Risk Shield / Alert System (Owner: alerts) ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS alerts (
      id           TEXT PRIMARY KEY,                 -- = article_id (max. 1 Alert je Artikel)
      article_id   TEXT NOT NULL,
      alert_level  TEXT NOT NULL,                    -- info | important | critical
      risk_type    TEXT NOT NULL,                    -- recht/steuern/… oder 'chance'
      title        TEXT NOT NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      delivered_at TIMESTAMPTZ                       -- NULL = noch nicht gepusht (Phase 5)
    )`);

  // Push-Zustellung (Phase 5): attempts = Fehlversuchs-Zähler des Dispatchers,
  // delivery_note = Vermerk (z. B. „aufgegeben nach N Fehlversuchen") — additive Migration.
  for (const col of [`attempts INTEGER DEFAULT 0`, `delivery_note TEXT`]) {
    await pool.query(`ALTER TABLE alerts ADD COLUMN IF NOT EXISTS ${col}`);
  }

  // ── Predictive Forecasting (Owner: intelligence, Phase 5) ──
  // 7-Tage-Prognose je Topic aus der topic_daily-Zeitreihe (Holt-Glättung, deterministisch).
  // PK topic_slug+forecast_date = Idempotenz: wiederholter Lauf überschreibt statt dupliziert.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS topic_forecast (
      topic_slug    TEXT NOT NULL,
      forecast_date TEXT NOT NULL,                   -- YYYY-MM-DD (prognostizierter Tag)
      predicted     REAL NOT NULL,                   -- erwartete Erwähnungen an diesem Tag
      direction     TEXT NOT NULL,                   -- steigend | fallend | stabil
      confidence    INTEGER NOT NULL,                -- 0–100 (Datenpunkte + Fit-Fehler, ehrlich)
      reasoning     TEXT,                            -- deutsche Begründung (Erklärbarkeit)
      computed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (topic_slug, forecast_date)
    )`);

  // ── Strategy Engine (Owner: intelligence) — 1 Briefing/Tag, PK=day = Kostenbremse ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS strategy_briefs (
      day        TEXT PRIMARY KEY,                  -- YYYY-MM-DD
      brief      TEXT NOT NULL,                     -- JSON: headline, situation, priorities, watchlist
      model      TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

  // ── Feedback (Owner: application) — ERSTE mandantenfähige Tabelle ──
  // Nutzerdaten gehören getrennt von den global geteilten Marktdaten.
  // tenant_id='public' bis Accounts kommen; PK verhindert Vote-Überschreiben zwischen Nutzern.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS feedback (
      tenant_id  TEXT NOT NULL DEFAULT 'public',
      item_id    TEXT NOT NULL,
      vote       INTEGER NOT NULL,                  -- +1 / -1
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (tenant_id, item_id)
    )`);

  // ── Konten & Daten-Sync (Owner: auth/sync — KONZEPT-Konten-Sync.md, Modul 1) ──
  // users: Konten. id wird in JS erzeugt (crypto.randomUUID) — kein gen_random_uuid()
  // nötig (pg-mem-kompatibel). email liegt IMMER lowercase in der DB.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            UUID PRIMARY KEY,
      email         TEXT NOT NULL UNIQUE,             -- lowercase (Service normalisiert)
      password_hash TEXT NOT NULL,                    -- scrypt: salt$hash (hex)
      display_name  TEXT,
      role          TEXT NOT NULL DEFAULT 'user',     -- 'user' | 'admin'
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_login_at TIMESTAMPTZ
    )`);

  // sessions: opake, widerrufbare Tokens (30 Tage, gleitend). In der DB liegt NUR
  // der sha256-Hash — der Klartext-Token existiert ausschließlich beim Client.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash   TEXT PRIMARY KEY,                  -- sha256(token) hex
      user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at   TIMESTAMPTZ NOT NULL,
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id)`);

  // user_data: Key-Value-Sync-Speicher (Spiegel der localStorage-Keys der App).
  // size_bytes wird in JS berechnet und mitgeschrieben — Größenlimits per einfacher
  // SUM-Query prüfbar, ohne SQL-Funktionen auf jsonb (pg-mem-kompatibel).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_data (
      user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      key        TEXT NOT NULL,
      value      JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      version    INTEGER NOT NULL DEFAULT 1,          -- Optimistic Locking (baseVersion-Check)
      size_bytes INTEGER NOT NULL DEFAULT 0,          -- Bytes von JSON.stringify(value)
      PRIMARY KEY (user_id, key)
    )`);

  // ── AI-Call-Telemetrie (Owner: intelligence) — Prompt-Versionierung & Kosten je Call ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_calls (
      id             TEXT PRIMARY KEY,               -- call_<ts>_<seq>
      prompt_key     TEXT NOT NULL,
      prompt_version INTEGER NOT NULL,
      model          TEXT NOT NULL,                  -- tatsächliches Modell aus der API-Antwort
      temperature    REAL,                           -- null auf Opus 4.7+ (Sampling-Parameter entfernt)
      tokens_in      INTEGER, tokens_out INTEGER,
      ref            TEXT,                           -- Bezug: Artikel-Id / Topic-Liste / Briefing-Tag
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

  log.info('DB bereit (news_events, trend_topics, topic_daily, topic_forecast, alerts, strategy_briefs, feedback, users, sessions, user_data, ai_calls)');
  return pool;
}

export function db() {
  if (!pool) throw new Error('initDb() zuerst aufrufen');
  return pool;
}
