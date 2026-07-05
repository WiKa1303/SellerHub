// ═══ Repository: Predictive Forecasting (topic_forecast) ═══
// Owner: intelligence (Phase 5). Datumsgrenzen kommen aus JS (pg-mem-Kompatibilität),
// Idempotenz per PK (topic_slug, forecast_date) + ON CONFLICT UPDATE.
import { db } from '../schema.js';

/** Einen Prognose-Tag upserten — wiederholter Lauf überschreibt, dupliziert nie. */
export async function upsertTopicForecast({ slug, date, predicted, direction, confidence, reasoning }) {
  await db().query(
    `INSERT INTO topic_forecast (topic_slug, forecast_date, predicted, direction, confidence, reasoning, computed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (topic_slug, forecast_date) DO UPDATE SET
       predicted=$3, direction=$4, confidence=$5, reasoning=$6, computed_at=$7`,
    [slug, date, predicted, direction, confidence, reasoning || null, new Date().toISOString()]);
}

/**
 * Top-N Forecasts, je Topic gruppiert (nur zukünftige Tage; „heute" ist Ist, nicht Prognose).
 * Sortierung: Konfidenz zuerst, dann prognostiziertes Volumen — die verlässlichste
 * und größte Bewegung steht oben.
 * @returns {Array<{topic, topic_name, direction, confidence, reasoning, days:[{day,predicted}]}>}
 */
export async function queryForecasts({ limit = 10 } = {}) {
  const today = new Date().toISOString().slice(0, 10); // Datumsgrenze aus JS, kein SQL-interval
  const r = await db().query(
    `SELECT f.topic_slug, f.forecast_date, f.predicted, f.direction, f.confidence, f.reasoning,
            f.computed_at, t.topic_name
     FROM topic_forecast f LEFT JOIN trend_topics t ON t.id = f.topic_slug
     WHERE f.forecast_date > $1
     ORDER BY f.topic_slug ASC, f.forecast_date ASC`, [today]);
  const byTopic = new Map();
  for (const row of r.rows) {
    if (!byTopic.has(row.topic_slug)) {
      byTopic.set(row.topic_slug, {
        topic: row.topic_slug, topic_name: row.topic_name || row.topic_slug,
        direction: row.direction, confidence: row.confidence, reasoning: row.reasoning,
        computed_at: row.computed_at, days: [], total: 0,
      });
    }
    const f = byTopic.get(row.topic_slug);
    f.days.push({ day: row.forecast_date, predicted: row.predicted });
    f.total = Math.round((f.total + row.predicted) * 100) / 100;
  }
  return [...byTopic.values()]
    .sort((a, b) => b.confidence - a.confidence || b.total - a.total)
    .slice(0, limit);
}
