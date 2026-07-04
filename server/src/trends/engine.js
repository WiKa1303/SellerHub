// ═══ Trend Detection Engine (Phase 4) ═══
// Deterministisch + erklärbar: Zeitreihe (7 vs. 30 Tage), Spike-Detection,
// Trend-Score aus Wachstum/Volumen/Relevanz/Impact/Quellenvielfalt.
// Nur die SPRACHE (Zusammenfassung + Handlungsempfehlung) kommt von der KI —
// und nur für die Top-Themen (Kostenbremse).
import { analyzedItemsSince, upsertTrendTopic, upsertTopicDaily } from '../db.js';
import { buildClusters, topicLabel } from './topics.js';
import { interpretTopics } from './interpret.js';
import { log } from '../logger.js';

export const trendState = { lastRun: null, topics: 0, spikes: 0, running: false };

const SHORT_D = 7, LONG_D = 30;
const INTERPRET_TOP_N = 8; // KI-Interpretation nur für die Top-N-Themen je Lauf

/** Kennzahlen für ein Cluster berechnen — pure Funktion, einzeln testbar. */
export function computeMetrics(cluster, now = Date.now()) {
  const shortSince = now - SHORT_D * 864e5;
  const items = cluster.items;
  const m7 = items.filter(i => new Date(i.publish_date).getTime() >= shortSince).length;
  const m30 = items.length;
  const prior23 = m30 - m7;

  // Wachstum: beobachtete 7-Tage-Erwähnungen vs. Erwartung aus der 23-Tage-Basis.
  // Neues Thema (keine Basis, aber ≥2 Erwähnungen) = per Definition +300 % („neu aufgetaucht").
  const expected7 = prior23 * (SHORT_D / (LONG_D - SHORT_D));
  let growthRate;
  if (prior23 === 0) growthRate = m7 >= 2 ? 300 : 0;
  else growthRate = ((m7 - expected7) / Math.max(expected7, 0.3)) * 100;
  growthRate = Math.round(Math.max(-100, Math.min(999, growthRate)));

  // Spike: deutlich über Erwartung UND absolut genug Substanz (1→2 ist kein Spike)
  const spike = m7 >= 3 && m7 >= 2 * Math.max(expected7, 0.5);

  const sources = new Set(items.map(i => i.source));
  const avgScore = items.reduce((a, i) => a + (i.ai_score ?? 0), 0) / m30;
  const impactShare = items.reduce((a, i) => a + (i.ai_impact === 'high' ? 1 : i.ai_impact === 'medium' ? 0.5 : 0), 0) / m30;

  // Trend-Score 0–100, jede Komponente erklärbar:
  //   Wachstum 0–35 · Volumen 0–15 · Relevanz 0–25 · Impact 0–15 · Quellenvielfalt 0–10
  const pts = {
    growth: Math.round(Math.min(1, Math.max(0, growthRate) / 300) * 35),
    volume: Math.min(15, m7 * 3),
    relevance: Math.round((avgScore / 100) * 25),
    impact: Math.round(impactShare * 15),
    diversity: Math.min(10, (sources.size - 1) * 5),
  };
  const trendScore = Math.max(0, Math.min(100, Object.values(pts).reduce((a, b) => a + b, 0)));

  // Risiko oder Chance: Mehrheitsvotum der Artikel-Analysen, Kategorie als Tie-Breaker
  const votes = { chance: 0, risiko: 0, neutral: 0 };
  items.forEach(i => votes[i.ai_opportunity || 'neutral']++);
  let roo = 'neutral';
  if (votes.risiko > votes.chance) roo = 'risiko';
  else if (votes.chance > votes.risiko) roo = 'chance';
  else {
    const cats = new Set(items.map(i => i.ai_category));
    if (cats.has('recht') || cats.has('steuern')) roo = 'risiko';
    else if (cats.has('trends') || cats.has('produktrecherche')) roo = 'chance';
  }

  return { m7, m30, growthRate, spike, sourceCount: sources.size, avgScore: Math.round(avgScore), pts, trendScore, riskOrOpportunity: roo };
}

/** Tages-Buckets (YYYY-MM-DD → Erwähnungen) für Sparkline + Forecasting-Datensatz. */
export function dailyBuckets(items) {
  const map = {};
  for (const it of items) {
    const day = new Date(it.publish_date).toISOString().slice(0, 10);
    map[day] = (map[day] || 0) + 1;
  }
  return map;
}

/** Ein kompletter Engine-Lauf: Items → Cluster → Metriken → KI-Interpretation → DB. */
export async function runTrendEngine() {
  if (trendState.running) return { skipped: 'läuft bereits' };
  trendState.running = true;
  try {
    const items = await analyzedItemsSince(LONG_D);
    const clusters = buildClusters(items).filter(c => c.items.length >= 2); // 1 Artikel ≠ Trend
    const topics = clusters.map(c => {
      const metrics = computeMetrics(c);
      return {
        id: c.id, topicName: topicLabel(c.id), items: c.items, ...metrics,
        itemIds: c.items
          .sort((a, b) => (b.ai_score ?? 0) - (a.ai_score ?? 0))
          .slice(0, 5).map(i => i.id),
      };
    }).sort((a, b) => b.trendScore - a.trendScore);

    // Business Impact Interpretation Layer: KI-Sprache nur für die Top-Themen
    const interpreted = await interpretTopics(topics.slice(0, INTERPRET_TOP_N));

    for (const t of topics) {
      const extra = interpreted[t.id] || {};
      await upsertTrendTopic({
        id: t.id, topicName: t.topicName, trendScore: t.trendScore, growthRate: t.growthRate,
        mentions7: t.m7, mentions30: t.m30, sourceCount: t.sourceCount, spike: t.spike,
        riskOrOpportunity: extra.risk_or_opportunity || t.riskOrOpportunity,
        summary: extra.summary || null, recommendedAction: extra.recommended_action || null,
        itemIds: t.itemIds,
      });
      const buckets = dailyBuckets(t.items);
      for (const [day, mentions] of Object.entries(buckets)) await upsertTopicDaily(t.id, day, mentions);
    }

    trendState.lastRun = new Date().toISOString();
    trendState.topics = topics.length;
    trendState.spikes = topics.filter(t => t.spike).length;
    log.info(`Trend-Engine: ${topics.length} Themen (${trendState.spikes} Spikes) aus ${items.length} Artikeln`);
    return { topics: topics.length, spikes: trendState.spikes };
  } finally {
    trendState.running = false;
  }
}
