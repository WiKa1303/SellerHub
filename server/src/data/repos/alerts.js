// ═══ Repository: Risk Shield / Alert System (alerts) ═══
import { db } from '../schema.js';
import { parseAiSummary } from './items.js';

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
