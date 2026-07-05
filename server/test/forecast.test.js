// ═══ Phase-5-Tests: Predictive Forecasting (Holt-Glättung + topic_forecast) ═══
//   node test/forecast.test.js   (pg-mem, KI gemockt — kein Postgres/API-Key nötig)
import { newDb } from 'pg-mem';
import { initDb, db, upsertTrendTopic, upsertTopicDaily, queryForecasts, recentAiCalls } from '../src/data/db.js';
import { aiClient } from '../src/core/ai-client.js';
import { holtForecast, runForecast, forecastState } from '../src/services/intelligence/forecast.js';
import { buildApi } from '../src/api/routes.js';

let pass = 0, fail = 0;
function t(name, cond, extra) {
  console.log((cond ? '✅' : '❌') + ' ' + name + (extra !== undefined ? ' → ' + extra : ''));
  cond ? pass++ : fail++;
}
const dayStr = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

// ── Mock: nur der optionale Interpretations-Call (Prognosen selbst sind deterministisch) ──
let hintCalls = 0;
aiClient({
  messages: {
    create: async (req) => {
      if (!String(req.system).includes('Prognose-Analyst')) throw new Error('unerwarteter Call: ' + String(req.system).slice(0, 40));
      hintCalls++;
      const payload = JSON.parse(req.messages[0].content);
      return {
        content: [{ type: 'text', text: JSON.stringify({ hint: 'Wichtigste Prognose: ' + payload[0].thema + ' — diese Woche prüfen.' }) }],
        usage: { input_tokens: 150, output_tokens: 60 }, model: 'claude-opus-4-8',
      };
    },
  },
});

// ── Unit: Holt-Glättung (pure Funktion) ──
// Klarer Aufwärtstrend: 14 Tage, linear steigend
const up = holtForecast([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
t('Aufwärtstrend → Richtung steigend', up.direction === 'steigend', up.direction + ' (Trend ' + up.trend.toFixed(2) + ')');
t('7 Prognosewerte, weiter steigend', up.forecasts.length === 7 && up.forecasts[6] > up.forecasts[0], up.forecasts.join(','));
t('Konfidenz solide bei 14 Datenpunkten', up.confidence >= 50, up.confidence);
t('reasoning erklärt das Verfahren (deutsch)', up.reasoning.includes('Holt-Glättung') && up.reasoning.includes('steigend'));

// Flache Serie: kein Trend
const flat = holtForecast([3, 3, 3, 3, 3, 3, 3, 3, 3, 3]);
t('Flache Serie → Richtung stabil', flat.direction === 'stabil', flat.direction);
t('Flache Serie: Fit-Fehler ~0, hohe Konfidenz', flat.mae < 0.01 && flat.confidence >= 60, `mae=${flat.mae.toFixed(2)} conf=${flat.confidence}`);
t('Prognose bleibt auf dem Niveau', Math.abs(flat.forecasts[0] - 3) < 0.5, flat.forecasts[0]);

// Abwärtstrend
const down = holtForecast([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
t('Abwärtstrend → Richtung fallend', down.direction === 'fallend');
t('Prognosewerte nie negativ', down.forecasts.every(v => v >= 0), down.forecasts.join(','));

// Zu wenig Daten: ehrlich niedrige Konfidenz
const sparse = holtForecast([1, 0, 1, 0]);
t('<7 Datenpunkte → Konfidenz ehrlich niedrig (≤35)', sparse.confidence <= 35, sparse.confidence);
t('<7 Datenpunkte: reasoning benennt die dünne Datenlage', sparse.reasoning.includes('Datenpunkte'));

// ── End-to-End: pg-mem + runForecast + Idempotenz + API ──
const mem = newDb();
const { Pool } = mem.adapters.createPg();
await initDb(new Pool());

// Aktives Topic mit klarer Aufwärts-Zeitreihe (14 Tage, 1..14 Erwähnungen)
await upsertTrendTopic({ id: 'gpsr-produktsicherheit', topicName: 'Gpsr Produktsicherheit', trendScore: 80,
  growthRate: 300, mentions7: 10, mentions30: 20, sourceCount: 2, spike: true, riskOrOpportunity: 'risiko',
  summary: 's', recommendedAction: 'a', itemIds: [] });
for (let i = 13; i >= 0; i--) await upsertTopicDaily('gpsr-produktsicherheit', dayStr(i), 14 - i);

// Dünnes Topic: nur 2 Datenpunkte
await upsertTrendTopic({ id: 'duenn-thema', topicName: 'Duenn Thema', trendScore: 30, growthRate: 0,
  mentions7: 2, mentions30: 2, sourceCount: 1, spike: false, riskOrOpportunity: 'neutral',
  summary: null, recommendedAction: null, itemIds: [] });
await upsertTopicDaily('duenn-thema', dayStr(3), 1);
await upsertTopicDaily('duenn-thema', dayStr(1), 1);

const r1 = await runForecast();
t('Lauf: beide aktiven Topics prognostiziert', r1.topics === 2, JSON.stringify(r1));
const n1 = Number((await db().query(`SELECT count(*) AS n FROM topic_forecast`)).rows[0].n);
t('7 Zeilen je Topic in topic_forecast', n1 === 14, n1);

// Idempotenz: Doppellauf erzeugt keine Dubletten (PK + ON CONFLICT UPDATE)
const r2 = await runForecast();
const n2 = Number((await db().query(`SELECT count(*) AS n FROM topic_forecast`)).rows[0].n);
t('Idempotent: Doppellauf erzeugt keine Dubletten', r2.topics === 2 && n2 === 14, n2);

const items = await queryForecasts({ limit: 10 });
const gpsr = items.find(i => i.topic === 'gpsr-produktsicherheit');
const duenn = items.find(i => i.topic === 'duenn-thema');
t('GPSR: steigend mit solider Konfidenz', gpsr && gpsr.direction === 'steigend' && gpsr.confidence >= 50,
  gpsr && `${gpsr.direction}/${gpsr.confidence}`);
t('Dünnes Topic: niedrige Konfidenz (≤35)', duenn && duenn.confidence <= 35, duenn && duenn.confidence);
t('Je Topic 7 Prognose-Tage mit Werten', items.every(i => i.days.length === 7 && i.days.every(d => d.predicted >= 0)));
t('Sortierung: verlässlichste Prognose zuerst', items[0].topic === 'gpsr-produktsicherheit');

// Optionaler KI-Hinweis: 1 gebatchter Call je Lauf, Telemetrie über die Prompt-Registry
t('KI-Hinweis gesetzt (1 Call je Lauf)', hintCalls === 2 && String(forecastState.note).includes('Gpsr'), forecastState.note);
const callKeys = (await recentAiCalls(10)).map(c => c.prompt_key);
t('ai_calls protokolliert forecast_interpretation', callKeys.includes('forecast_interpretation'), callKeys.join(','));

// ── API ──
const app = buildApi();
const srv = app.listen(0);
const base = 'http://127.0.0.1:' + srv.address().port;
const api = await (await fetch(base + '/api/forecast')).json();
t('GET /api/forecast: Richtung/Konfidenz/reasoning je Topic', api.count === 2
  && api.items.every(i => i.direction && Number.isFinite(i.confidence) && i.reasoning && i.days.length === 7));
t('GET /api/forecast: meta mit computed_at + hint', !!api.meta.computed_at && String(api.meta.hint).includes('Prognose'));
const health = await (await fetch(base + '/api/health')).json();
t('Health zeigt forecast-Modul', health.modules.forecast && health.modules.forecast.topics === 2);
srv.close();

console.log(`\n${pass} bestanden, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);
