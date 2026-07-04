// ═══ Datenbank: pg-Pool + Auto-Migration ═══
// MVP-Entscheidung: id = SHA-256 der kanonischen URL (Primärschlüssel = Dublettenschutz Ebene 1).
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

  // ═══ Phase 3: KI-Analyse-Spalten (idempotente Migration) ═══
  // ai_summary = JSON-Array der Bulletpoints · ai_tokens_* = Kosten-Logging je Item
  // ai_feedback = 👍/👎 vom Nutzer (+1/-1) → späterer Trainings-/Eval-Datensatz
  for (const col of [
    `ai_score INTEGER`, `ai_category TEXT`, `ai_urgency TEXT`, `ai_impact TEXT`,
    `ai_reasoning TEXT`, `ai_summary TEXT`, `ai_model TEXT`,
    `ai_tokens_in INTEGER`, `ai_tokens_out INTEGER`,
    `ai_analyzed_at TIMESTAMPTZ`, `ai_attempts INTEGER DEFAULT 0`, `ai_error TEXT`,
    `ai_feedback INTEGER`,
    // Phase 4: Trend-/Opportunity-Felder aus der Analyse
    `ai_topic TEXT`, `ai_opportunity TEXT`, `ai_affected TEXT`,
  ]) {
    await pool.query(`ALTER TABLE news_events ADD COLUMN IF NOT EXISTS ${col}`);
  }

  // ═══ Phase 4: Trend-Engine + Alerts ═══
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
  // Tages-Zeitreihe je Topic = Grundlage für Sparklines HEUTE und Forecasting in Phase 5
  await pool.query(`
    CREATE TABLE IF NOT EXISTS topic_daily (
      topic_id TEXT NOT NULL,
      day      TEXT NOT NULL,                        -- YYYY-MM-DD
      mentions INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (topic_id, day)
    )`);
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
  // Strategy Engine: 1 Briefing pro Tag, in der DB gecacht (= max. 1 LLM-Call/Tag)
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

// ═══ Strategy-Briefings ═══
export async function saveStrategyBrief(day, brief, model) {
  await db().query(
    `INSERT INTO strategy_briefs (day, brief, model) VALUES ($1,$2,$3)
     ON CONFLICT (day) DO UPDATE SET brief=$2, model=$3`,
    [day, JSON.stringify(brief), model]);
}

export async function getStrategyBrief(day) {
  const r = await db().query(`SELECT * FROM strategy_briefs WHERE day = $1`, [day]);
  return r.rows[0] ? { ...r.rows[0], brief: JSON.parse(r.rows[0].brief) } : null;
}

export async function latestStrategyBrief() {
  const r = await db().query(`SELECT * FROM strategy_briefs ORDER BY day DESC LIMIT 1`);
  return r.rows[0] ? { ...r.rows[0], brief: JSON.parse(r.rows[0].brief) } : null;
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

const ITEM_COLS = `id, title, summary, url, source, publish_date, country, type, relevance_score,
  ai_score, ai_category, ai_urgency, ai_impact, ai_reasoning, ai_summary, ai_analyzed_at, ai_feedback,
  ai_topic, ai_opportunity, ai_affected`;

export async function queryNews({ limit = 20, country = null, minScore = 0, maxAgeDays = 30 }) {
  const since = new Date(Date.now() - maxAgeDays * 864e5).toISOString();
  const params = [since, minScore];
  // Effektiver Score = KI-Score, wenn analysiert — sonst Keyword-Score
  let where = `type = 'news' AND publish_date >= $1 AND COALESCE(ai_score, relevance_score) >= $2`;
  if (country) { params.push(country); where += ` AND country = $${params.length}`; }
  params.push(limit);
  const r = await db().query(
    `SELECT ${ITEM_COLS} FROM news_events WHERE ${where}
     ORDER BY COALESCE(ai_score, relevance_score) DESC, publish_date DESC LIMIT $${params.length}`, params);
  return r.rows.map(parseAiSummary);
}

function parseAiSummary(row) {
  if (row.ai_summary) { try { row.ai_summary = JSON.parse(row.ai_summary); } catch { row.ai_summary = null; } }
  return row;
}

// ═══ Phase 3: KI-Queue-Zugriffe (DB = Warteschlange, crash-sicher) ═══

/** Unanalysierte Items der letzten 30 Tage, älteste Fehlversuche zuletzt. */
export async function pendingAiItems(limit, maxAttempts) {
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const r = await db().query(
    `SELECT id, title, summary, source, publish_date FROM news_events
     WHERE ai_analyzed_at IS NULL AND ai_attempts < $1 AND created_at >= $2
     ORDER BY ai_attempts ASC, relevance_score DESC LIMIT $3`,
    [maxAttempts, since, limit]);
  return r.rows;
}

export async function saveAiResult(id, a, model, usage) {
  await db().query(
    `UPDATE news_events SET ai_score=$2, ai_category=$3, ai_urgency=$4, ai_impact=$5,
       ai_reasoning=$6, ai_summary=$7, ai_model=$8, ai_tokens_in=$9, ai_tokens_out=$10,
       ai_analyzed_at=$11, ai_topic=$12, ai_opportunity=$13, ai_affected=$14, ai_error=NULL
     WHERE id=$1`,
    [id, a.relevance_score, a.category, a.urgency, a.impact, a.reasoning,
     JSON.stringify(a.summary), model, usage.input, usage.output, new Date().toISOString(),
     a.topic || null, a.opportunity || null, a.affected || null]);
}

// ═══ Phase 4: Trend-Engine + Alerts ═══

/** Analysierte Items der letzten N Tage (Input der Trend-Engine). */
export async function analyzedItemsSince(days = 30) {
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const r = await db().query(
    `SELECT id, title, url, source, publish_date, country, ai_score, ai_category, ai_urgency,
            ai_impact, ai_topic, ai_opportunity, ai_summary
     FROM news_events
     WHERE ai_analyzed_at IS NOT NULL AND ai_topic IS NOT NULL AND publish_date >= $1`, [since]);
  return r.rows.map(parseAiSummary);
}

export async function upsertTrendTopic(t) {
  const now = new Date().toISOString();
  await db().query(
    `INSERT INTO trend_topics (id, topic_name, trend_score, growth_rate, mentions_7d, mentions_30d,
       source_count, spike, risk_or_opportunity, summary, recommended_action, item_ids, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)
     ON CONFLICT (id) DO UPDATE SET topic_name=$2, trend_score=$3, growth_rate=$4, mentions_7d=$5,
       mentions_30d=$6, source_count=$7, spike=$8, risk_or_opportunity=$9,
       summary=COALESCE($10, trend_topics.summary),
       recommended_action=COALESCE($11, trend_topics.recommended_action),
       item_ids=$12, updated_at=$13`,
    [t.id, t.topicName, t.trendScore, t.growthRate, t.mentions7, t.mentions30,
     t.sourceCount, t.spike ? 1 : 0, t.riskOrOpportunity, t.summary || null,
     t.recommendedAction || null, JSON.stringify(t.itemIds), now]);
}

export async function upsertTopicDaily(topicId, day, mentions) {
  await db().query(
    `INSERT INTO topic_daily (topic_id, day, mentions) VALUES ($1,$2,$3)
     ON CONFLICT (topic_id, day) DO UPDATE SET mentions=$3`, [topicId, day, mentions]);
}

export async function queryTrends({ limit = 10, minScore = 0, riskOrOpportunity = null, maxAgeDays = 7 }) {
  const since = new Date(Date.now() - maxAgeDays * 864e5).toISOString();
  const params = [minScore, since];
  let where = `trend_score >= $1 AND updated_at >= $2`;
  if (riskOrOpportunity) { params.push(riskOrOpportunity); where += ` AND risk_or_opportunity = $${params.length}`; }
  params.push(limit);
  const r = await db().query(
    `SELECT * FROM trend_topics WHERE ${where} ORDER BY trend_score DESC, growth_rate DESC LIMIT $${params.length}`, params);
  return r.rows.map(row => { try { row.item_ids = JSON.parse(row.item_ids || '[]'); } catch { row.item_ids = []; } return row; });
}

export async function topicHistory(topicId, days = 30) {
  const r = await db().query(`SELECT day, mentions FROM topic_daily WHERE topic_id = $1 ORDER BY day ASC`, [topicId]);
  const map = Object.fromEntries(r.rows.map(x => [x.day, x.mentions]));
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    out.push({ day: d, mentions: map[d] || 0 });
  }
  return out;
}

/** Alert anlegen (idempotent: 1 Alert je Artikel). true = neu erzeugt. */
export async function insertAlert(articleId, level, riskType, title) {
  const r = await db().query(
    `INSERT INTO alerts (id, article_id, alert_level, risk_type, title)
     VALUES ($1,$1,$2,$3,$4) ON CONFLICT (id) DO NOTHING`,
    [articleId, level, riskType, String(title).slice(0, 300)]);
  return r.rowCount === 1;
}

export async function queryAlerts({ level = null, days = 7, limit = 20, undeliveredOnly = false }) {
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const params = [since];
  let where = `a.created_at >= $1`;
  if (level) { params.push(level); where += ` AND a.alert_level = $${params.length}`; }
  if (undeliveredOnly) where += ` AND a.delivered_at IS NULL`;
  params.push(limit);
  const r = await db().query(
    `SELECT a.id, a.alert_level, a.risk_type, a.title, a.created_at, a.delivered_at,
            n.url, n.source, n.ai_urgency, n.ai_impact, n.ai_affected, n.ai_summary, n.publish_date
     FROM alerts a JOIN news_events n ON n.id = a.article_id
     WHERE ${where}
     ORDER BY CASE a.alert_level WHEN 'critical' THEN 0 WHEN 'important' THEN 1 ELSE 2 END, a.created_at DESC
     LIMIT $${params.length}`, params);
  return r.rows.map(parseAiSummary);
}

/** Items mit KI-Analyse ohne Alert (Generator-Queue). Zeitfenster 7 Tage begrenzt
 *  den Scan — nicht qualifizierende Items werden so nicht ewig neu angefasst. */
export async function itemsWithoutAlertCheck(limit = 200) {
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  const r = await db().query(
    `SELECT n.id, n.title, n.ai_score, n.ai_category, n.ai_urgency, n.ai_impact, n.ai_opportunity
     FROM news_events n LEFT JOIN alerts a ON a.id = n.id
     WHERE n.ai_analyzed_at IS NOT NULL AND a.id IS NULL AND n.ai_analyzed_at >= $1
     ORDER BY n.ai_analyzed_at DESC LIMIT $2`, [since, limit]);
  return r.rows;
}

export async function saveAiFailure(id, message) {
  await db().query(
    `UPDATE news_events SET ai_attempts = ai_attempts + 1, ai_error = $2 WHERE id = $1`,
    [id, String(message).slice(0, 500)]);
}

/** 👍/👎 vom Nutzer — Grundlage für spätere Eval-/Fine-Tuning-Datensätze. */
export async function saveFeedback(id, vote) {
  const r = await db().query(`UPDATE news_events SET ai_feedback = $2 WHERE id = $1`, [id, vote]);
  return r.rowCount === 1;
}

export async function queryEvents({ limit = 20, days = 180 }) {
  const now = new Date().toISOString();
  const horizon = new Date(Date.now() + days * 864e5).toISOString();
  // Kommende Events zuerst (Kalender zählt); Events ohne erkanntes Datum danach, nach Relevanz.
  const r = await db().query(
    `SELECT ${ITEM_COLS}, event_start FROM news_events
     WHERE type = 'event' AND (event_start IS NULL OR (event_start >= $1 AND event_start <= $2))
     ORDER BY COALESCE(event_start, '9999-01-01') ASC, relevance_score DESC LIMIT $3`,
    [now, horizon, limit]);
  return r.rows.map(parseAiSummary);
}
