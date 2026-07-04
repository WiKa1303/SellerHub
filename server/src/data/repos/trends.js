// ═══ Repository: Trend-Engine (trend_topics, topic_daily) ═══
import { db } from '../schema.js';
import { parseAiSummary } from './items.js';

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
