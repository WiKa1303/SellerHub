// ═══ Datenbank: pg-Pool + Auto-Migration ═══
// MVP-Entscheidung: id = SHA-256 der kanonischen URL (Primärschlüssel = Dublettenschutz Ebene 1).
import pg from 'pg';
import { config } from './config.js';
import { log } from './logger.js';

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
  log.info('DB bereit (news_events)');
  return pool;
}

export function db() {
  if (!pool) throw new Error('initDb() zuerst aufrufen');
  return pool;
}

/** Item einfügen; gibt true zurück wenn neu (Dublette per PK still verworfen). */
export async function insertItem(it) {
  const r = await db().query(
    `INSERT INTO news_events (id, title, title_norm, summary, url, source, publish_date, country, type, relevance_score, event_start)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (id) DO NOTHING`,
    [it.id, it.title, it.titleNorm, it.summary, it.url, it.source, it.publishDate,
     it.country, it.type, it.relevanceScore, it.eventStart || null]
  );
  return r.rowCount === 1;
}

/** Titel-Normalformen der letzten N Tage (für Dubletten-Ebene 2). */
export async function recentTitleNorms(days = 7) {
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const r = await db().query(`SELECT title_norm FROM news_events WHERE created_at >= $1`, [since]);
  return r.rows.map(x => x.title_norm);
}

export async function queryNews({ limit = 20, country = null, minScore = 0, maxAgeDays = 30 }) {
  const since = new Date(Date.now() - maxAgeDays * 864e5).toISOString();
  const params = [since, minScore];
  let where = `type = 'news' AND publish_date >= $1 AND relevance_score >= $2`;
  if (country) { params.push(country); where += ` AND country = $${params.length}`; }
  params.push(limit);
  const r = await db().query(
    `SELECT id, title, summary, url, source, publish_date, country, type, relevance_score
     FROM news_events WHERE ${where}
     ORDER BY relevance_score DESC, publish_date DESC LIMIT $${params.length}`, params);
  return r.rows;
}

export async function queryEvents({ limit = 20, days = 180 }) {
  const now = new Date().toISOString();
  const horizon = new Date(Date.now() + days * 864e5).toISOString();
  // Kommende Events zuerst (Kalender zählt); Events ohne erkanntes Datum danach, nach Relevanz.
  const r = await db().query(
    `SELECT id, title, summary, url, source, publish_date, country, type, relevance_score, event_start
     FROM news_events
     WHERE type = 'event' AND (event_start IS NULL OR (event_start >= $1 AND event_start <= $2))
     ORDER BY COALESCE(event_start, '9999-01-01') ASC, relevance_score DESC LIMIT $3`,
    [now, horizon, limit]);
  return r.rows;
}
