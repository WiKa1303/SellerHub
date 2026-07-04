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

  // ── Strategy Engine (Owner: intelligence) — 1 Briefing/Tag, PK=day = Kostenbremse ──
  await pool.query(`
    CREATE TABLE IF NOT EXISTS strategy_briefs (
      day        TEXT PRIMARY KEY,                  -- YYYY-MM-DD
      brief      TEXT NOT NULL,                     -- JSON: headline, situation, priorities, watchlist
      model      TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

  log.info('DB bereit (news_events, trend_topics, topic_daily, alerts, strategy_briefs)');
  return pool;
}

export function db() {
  if (!pool) throw new Error('initDb() zuerst aufrufen');
  return pool;
}
