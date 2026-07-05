// ═══ Predictive Forecasting (Phase 5) ═══
// 7-Tage-Prognose je aktivem Topic aus der topic_daily-Zeitreihe (letzte 30 Tage).
// Verfahren: exponentielle Glättung mit Trend (Holt, doppelte Glättung) — bewusst
// DETERMINISTISCH und ohne LLM: gleiche Zeitreihe = gleiche Prognose, jede Zahl
// nachrechenbar (Erklärbarkeit). Konfidenz ist ehrlich: wenig Datenpunkte oder
// großer Fit-Fehler drücken sie sichtbar nach unten.
// OPTIONAL obendrauf (nur mit ANTHROPIC_API_KEY): 1 gebatchter LLM-Call, der die
// Top-5-Prognosen als Seller-Hinweis interpretiert — fail-soft, Prognosen unberührt.
import { queryTrends, topicHistory, upsertTopicForecast, logAiCall } from '../../data/db.js';
import { aiClient } from '../../core/ai-client.js';
import { PROMPTS } from '../../core/prompt-registry.js';
import { log } from '../../core/logger.js';

const PROMPT = PROMPTS.forecast_interpretation; // Template/Version/Modell zentral in der Registry

export const forecastState = { lastRun: null, topics: 0, note: null };

// ── Verfahrens-Konstanten (keine Magie — bewusst gewählte Startwerte) ──
// ALPHA: Gewicht der jüngsten Beobachtung im Niveau. 0.5 = reaktionsschnell genug für
//   News-Zeitreihen (Themen leben Tage, nicht Monate), aber nicht Tagesrauschen-hörig.
// BETA: Gewicht der jüngsten Niveau-Änderung im Trend. 0.3 = Trend folgt echten
//   Bewegungen, ein einzelner Ausreißer-Tag kippt ihn nicht.
const ALPHA = 0.5;
const BETA = 0.3;
const HISTORY_DAYS = 30;        // Eingabe-Fenster (topic_daily)
const HORIZON_DAYS = 7;         // Prognose-Horizont
const FORECAST_MAX_TOPICS = 20; // Kostenbremse: max. Topics je Lauf (Arbeit bleibt begrenzt)
const HINT_TOP_N = 5;           // LLM-Hinweis nur für die Top-5 (1 gebatchter Call)
const MIN_POINTS_HONEST = 7;    // unter 7 Datenpunkten: Konfidenz hart gedeckelt
const LOW_CONF_CAP = 35;        // … auf maximal diesen Wert (ehrlich niedrig)
const TREND_EPS = 0.1;          // |geglätteter Trend| ≤ 0.1 Erwähnungen/Tag = „stabil"

const HINT_SCHEMA = {
  type: 'object',
  properties: { hint: { type: 'string' } },
  required: ['hint'],
  additionalProperties: false,
};

/**
 * Holt-Glättung (doppelt exponentiell) über eine Tages-Zeitreihe — pure Funktion, testbar.
 * @param {number[]} series Erwähnungen je Tag (chronologisch, ≥ 2 Werte)
 * @returns {{forecasts:number[], direction:string, confidence:number, trend:number, mae:number, dataPoints:number, reasoning:string}}
 */
export function holtForecast(series, horizon = HORIZON_DAYS) {
  let level = series[0];
  let trend = 0;
  let absErr = 0, errN = 0;
  for (let i = 1; i < series.length; i++) {
    // 1-Schritt-Prognose VOR dem Update = Fit-Fehler (misst, wie gut das Modell die Serie trifft)
    absErr += Math.abs(series[i] - (level + trend));
    errN++;
    const prevLevel = level;
    level = ALPHA * series[i] + (1 - ALPHA) * (level + trend);
    trend = BETA * (level - prevLevel) + (1 - BETA) * trend;
  }
  const mae = errN ? absErr / errN : 0;

  // Prognose: Niveau + h × Trend, nie negativ (Erwähnungen < 0 gibt es nicht)
  const forecasts = [];
  for (let h = 1; h <= horizon; h++) {
    forecasts.push(Math.max(0, Math.round((level + h * trend) * 100) / 100));
  }

  const direction = trend > TREND_EPS ? 'steigend' : trend < -TREND_EPS ? 'fallend' : 'stabil';

  // Konfidenz = Datengrundlage × Fit-Qualität, beide 0–1:
  //   dataFactor: 14 Tage mit Erwähnungen = volle Grundlage (linear darunter)
  //   errFactor:  Fit-Fehler relativ zum Serien-Mittel — je größer, desto unsicherer
  const dataPoints = series.filter(v => v > 0).length;
  const mean = series.reduce((a, b) => a + b, 0) / series.length;
  const dataFactor = Math.min(1, dataPoints / 14);
  const errFactor = 1 / (1 + mae / Math.max(mean, 0.5));
  let confidence = Math.round(100 * dataFactor * errFactor);
  if (dataPoints < MIN_POINTS_HONEST) confidence = Math.min(confidence, LOW_CONF_CAP);

  const reasoning = `Holt-Glättung (α=${ALPHA}, β=${BETA}) über ${series.length} Tage`
    + ` (${dataPoints} Tage mit Erwähnungen): geglätteter Trend ${trend >= 0 ? '+' : ''}${trend.toFixed(2)}/Tag → ${direction};`
    + ` mittlerer Fit-Fehler ${mae.toFixed(2)}.`
    + (dataPoints < MIN_POINTS_HONEST
      ? ` Nur ${dataPoints} Datenpunkte — Konfidenz bewusst auf max. ${LOW_CONF_CAP} gedeckelt.`
      : ' Datengrundlage ausreichend.');

  return { forecasts, direction, confidence, trend, mae, dataPoints, reasoning };
}

/** Läuft in der Pipeline NACH trends (braucht frische topic_daily-Zeitreihen). */
export async function runForecast() {
  forecastState.lastRun = new Date().toISOString();

  // Aktive Topics = in den letzten 7 Tagen von der Trend-Engine aktualisiert
  const topics = await queryTrends({ limit: FORECAST_MAX_TOPICS, maxAgeDays: 7 });
  if (!topics.length) {
    forecastState.topics = 0;
    return { skipped: 'keine aktiven Topics (Trend-Engine zuerst)' };
  }

  const results = [];
  for (const t of topics) {
    const series = (await topicHistory(t.id, HISTORY_DAYS)).map(d => d.mentions);
    // Führende Null-Tage abschneiden: das Topic existierte davor schlicht nicht —
    // sie würden Niveau/Trend künstlich drücken.
    const first = series.findIndex(v => v > 0);
    if (first < 0 || series.length - first < 2) continue; // ohne 2 Werte keine Glättung
    const f = holtForecast(series.slice(first));

    for (let h = 1; h <= HORIZON_DAYS; h++) {
      const date = new Date(Date.now() + h * 864e5).toISOString().slice(0, 10); // Datumsgrenze aus JS
      await upsertTopicForecast({
        slug: t.id, date, predicted: f.forecasts[h - 1],
        direction: f.direction, confidence: f.confidence, reasoning: f.reasoning,
      });
    }
    results.push({ id: t.id, name: t.topic_name, direction: f.direction, confidence: f.confidence, next7: f.forecasts });
    log.info(`Forecast ${t.id}: ${f.direction} (Konfidenz ${f.confidence}, Trend ${f.trend.toFixed(2)}/Tag)`);
  }

  forecastState.topics = results.length;
  forecastState.note = await interpretForecasts(results
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, HINT_TOP_N));
  log.info(`Forecast-Modul: ${results.length} Topics prognostiziert (${HORIZON_DAYS} Tage Horizont)`);
  return { topics: results.length };
}

/** Optionaler LLM-Hinweis zu den Top-Prognosen — ohne Key: sauberer Skip (Degradation). */
async function interpretForecasts(top) {
  const client = aiClient();
  if (!client || !top.length) return null;
  try {
    const payload = top.map(t => ({
      thema: t.name, richtung: t.direction, konfidenz: t.confidence,
      prognose_naechste_7_tage: t.next7,
    }));
    const response = await client.messages.create({
      model: PROMPT.model,
      max_tokens: PROMPT.maxTokens,
      system: PROMPT.template,
      output_config: { effort: PROMPT.effort, format: { type: 'json_schema', schema: HINT_SCHEMA } },
      messages: [{ role: 'user', content: JSON.stringify(payload) }],
    });
    await logAiCall(PROMPT, response, top.map(t => t.id).join(',')); // Telemetrie (fail-soft)
    return JSON.parse(response.content.find(b => b.type === 'text')?.text).hint || null;
  } catch (e) {
    log.warn('Forecast-Hinweis per KI fehlgeschlagen (deterministische Prognosen unberührt): ' + e.message);
    return null;
  }
}
