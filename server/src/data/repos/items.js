// ═══ Repository: Artikel & Events (news_events) ═══
// Owner: crawler (Insert/Dedupe) + intelligence (KI-Felder) + feed (Queries)
import { db } from '../schema.js';

export const ITEM_COLS = `id, title, summary, url, source, publish_date, country, type, relevance_score,
  ai_score, ai_category, ai_urgency, ai_impact, ai_reasoning, ai_summary, ai_analyzed_at, ai_feedback,
  ai_topic, ai_opportunity, ai_affected`;

/** ai_summary (JSON-Text) → Array; von allen Repos genutzt, die Item-Zeilen liefern. */
export function parseAiSummary(row) {
  if (row.ai_summary) { try { row.ai_summary = JSON.parse(row.ai_summary); } catch { row.ai_summary = null; } }
  return row;
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
  // Effektiver Score = KI-Score, wenn analysiert — sonst Keyword-Score
  let where = `type = 'news' AND publish_date >= $1 AND COALESCE(ai_score, relevance_score) >= $2`;
  if (country) { params.push(country); where += ` AND country = $${params.length}`; }
  params.push(limit);
  const r = await db().query(
    `SELECT ${ITEM_COLS} FROM news_events WHERE ${where}
     ORDER BY COALESCE(ai_score, relevance_score) DESC, publish_date DESC LIMIT $${params.length}`, params);
  return r.rows.map(parseAiSummary);
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

// ── KI-Queue-Zugriffe (DB = Warteschlange, crash-sicher) ──

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
