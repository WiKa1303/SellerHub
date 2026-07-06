// ═══ Phase-4-Tests: Trend-Engine, Spike-Detection, Alerts, Market Intelligence ═══
//   node test/trends.test.js   (ohne API-Key: Interpretations-Layer wird gemockt)
import { newDb } from 'pg-mem';
import { initDb, insertItem, saveAiResult, queryTrends, queryAlerts, topicHistory } from '../src/data/db.js';
import { aiClient } from '../src/services/intelligence/analyze.js';
import { buildClusters, fallbackTopic } from '../src/services/intelligence/topics.js';
import { computeMetrics, dailyBuckets, runTrendEngine } from '../src/services/intelligence/engine.js';
import { runForecast } from '../src/services/intelligence/forecast.js';
import { classifyAlert, generateAlerts } from '../src/services/alerts/rules.js';
import { buildApi } from '../src/api/routes.js';

let pass = 0, fail = 0;
function t(name, cond, extra) {
  console.log((cond ? '✅' : '❌') + ' ' + name + (extra !== undefined ? ' → ' + extra : ''));
  cond ? pass++ : fail++;
}
const daysAgo = n => new Date(Date.now() - n * 864e5).toISOString();

// ── Mock: Business Impact Interpretation Layer ──
aiClient({
  messages: {
    create: async (req) => {
      if (!String(req.system).includes('Marktanalyst')) throw new Error('unerwarteter Analyse-Call');
      const payload = JSON.parse(req.messages[0].content);
      return {
        content: [{ type: 'text', text: JSON.stringify({ topics: payload.map(p => ({
          id: p.id, summary: 'KI-Marktlage zu ' + p.thema + '.',
          recommended_action: 'Konkreter Schritt für ' + p.thema + '.',
          risk_or_opportunity: /kaufland/i.test(p.thema) ? 'chance' : 'risiko',
        })) }) }],
        usage: { input_tokens: 500, output_tokens: 300 }, model: 'claude-opus-4-8',
      };
    },
  },
});

// ── Unit: Clustering (Slug-Merge via Trigram) ──
const mk = (topic, extra = {}) => ({ ai_topic: topic, ai_score: 80, ai_impact: 'high', ai_category: 'recht',
  ai_opportunity: 'risiko', source: 'Q1', publish_date: daysAgo(1), title: 't', ...extra });
const clusters = buildClusters([
  mk('fba-gebuehren'), mk('amazon-fba-gebuehren'), mk('amazon-fba-gebuehren'),
  mk('ppc-strategien'), mk('sonstiges'),
]);
t('Cluster: ähnliche Slugs verschmolzen (fba-gebuehren ⊂ amazon-fba-gebuehren)',
  clusters.length === 2 && clusters.find(c => c.items.length === 3), clusters.map(c => c.id + ':' + c.items.length).join(' '));
t('Cluster: "sonstiges" wird ignoriert', !clusters.find(c => c.id === 'sonstiges'));

// ── Unit: Metriken / Spike / Trend-Score ──
// 3 Erwähnungen in 7 Tagen, 1 alte (Tag 25), 3 Quellen, Ø-Score 88, alles high impact
const cl = { id: 'gpsr', items: [
  mk('gpsr', { publish_date: daysAgo(1), source: 'Q1', ai_score: 88 }),
  mk('gpsr', { publish_date: daysAgo(3), source: 'Q2', ai_score: 88 }),
  mk('gpsr', { publish_date: daysAgo(6), source: 'Q3', ai_score: 88 }),
  mk('gpsr', { publish_date: daysAgo(25), source: 'Q1', ai_score: 88 }),
]};
const m = computeMetrics(cl);
t('Metriken: 7d/30d-Fenster korrekt', m.m7 === 3 && m.m30 === 4);
t('Wachstum: deutlich positiv (Basis 1 Alt-Artikel)', m.growthRate > 500, m.growthRate + ' %');
t('Spike erkannt (3 ≥ 2×Erwartung)', m.spike === true);
t('Quellenvielfalt zählt (3 Quellen → volle Diversitätspunkte)', m.pts.diversity === 10);
t('Trend-Score im Rahmen 0–100 und hoch', m.trendScore >= 80 && m.trendScore <= 100, m.trendScore + ' | ' + JSON.stringify(m.pts));
t('risk_or_opportunity aus Mehrheitsvotum', m.riskOrOpportunity === 'risiko');
// Gegenprobe: stabiles Thema ohne Anstieg = kein Spike, niedriger Score
const flat = { id: 'flat', items: Array.from({ length: 8 }, (_, i) =>
  mk('flat', { publish_date: daysAgo(i * 4 + 1), source: 'Q1', ai_score: 30, ai_impact: 'low', ai_opportunity: 'neutral', ai_category: 'trends' })) };
const mf = computeMetrics(flat);
t('Kein Spike bei gleichmäßigem Verlauf', mf.spike === false, 'growth ' + mf.growthRate + ' %');
t('Neues Thema ohne Basis = +300 % Konvention', computeMetrics({ id: 'neu', items: [mk('neu'), mk('neu')] }).growthRate === 300);
t('dailyBuckets aggregiert je Tag', Object.values(dailyBuckets(cl.items)).reduce((a, b) => a + b, 0) === 4);

// ── Unit: Alert-Regeln ──
t('Critical: Gesetz + dringend + high Impact', classifyAlert({ ai_category: 'recht', ai_urgency: 'hoch', ai_impact: 'high', ai_score: 70 })?.level === 'critical');
t('Critical: konto-kritisch auch ohne Gesetz (score ≥ 85)', classifyAlert({ ai_category: 'logistik', ai_urgency: 'hoch', ai_impact: 'high', ai_score: 90 })?.level === 'critical');
t('Important: dringend + medium Impact', classifyAlert({ ai_category: 'ppc', ai_urgency: 'hoch', ai_impact: 'medium', ai_score: 60 })?.level === 'important');
t('Info: Chance mit hohem Impact', classifyAlert({ ai_category: 'trends', ai_urgency: 'niedrig', ai_impact: 'high', ai_score: 65, ai_opportunity: 'chance' })?.level === 'info' && classifyAlert({ ai_category: 'trends', ai_urgency: 'niedrig', ai_impact: 'high', ai_score: 65, ai_opportunity: 'chance' })?.riskType === 'chance');
t('Kein Alert bei Hintergrundrauschen', classifyAlert({ ai_category: 'trends', ai_urgency: 'niedrig', ai_impact: 'low', ai_score: 40 }) === null);

// ── End-to-End: DB + Engine + API ──
const mem = newDb();
const { Pool } = mem.adapters.createPg();
await initDb(new Pool());

let seq = 0;
async function seed(topic, { age = 1, source = 'Wortfilter.de', score = 80, cat = 'recht', urg = 'hoch', imp = 'high', opp = 'risiko' } = {}) {
  const id = 'it-' + (++seq);
  await insertItem({ id, title: topic + ' Meldung ' + seq, titleNorm: topic + ' ' + seq, summary: 's',
    url: 'https://x.de/' + id, source, publishDate: daysAgo(age), country: 'DE', type: 'news', relevanceScore: 50, eventStart: null });
  await saveAiResult(id, { relevance_score: score, category: cat, urgency: urg, impact: imp,
    reasoning: 'r', summary: ['Erster Kernpunkt zu ' + topic + '.'], topic, opportunity: opp, affected: 'alle FBA-Seller' },
    'claude-opus-4-8', { input: 800, output: 200 });
  return id;
}
// Spike-Thema: 3 frische Meldungen aus 2 Quellen + 1 alte
await seed('gpsr-produktsicherheit', { age: 1, source: 'Wortfilter.de' });
await seed('gpsr-produktsicherheit', { age: 2, source: 'shopanbieter.de' });
await seed('gpsr-produktsicherheit', { age: 5, source: 'Wortfilter.de' });
await seed('gpsr-produktsicherheit', { age: 22 });
// Chancen-Thema (2 frische Meldungen, Kategorie trends)
await seed('kaufland-expansion', { age: 2, cat: 'trends', urg: 'niedrig', imp: 'high', opp: 'chance', score: 66, source: 'Exciting Commerce' });
await seed('kaufland-expansion', { age: 4, cat: 'trends', urg: 'niedrig', imp: 'high', opp: 'chance', score: 62, source: 't3n' });
// Einzelmeldung → darf kein Trend werden
await seed('einzelfall-thema', { age: 3, urg: 'niedrig', imp: 'low', score: 40, opp: 'neutral', cat: 'trends' });

const er = await runTrendEngine();
t('Engine: 2 Trends (Einzelmeldung gefiltert)', er.topics === 2 && er.spikes >= 1, JSON.stringify(er));
const trends = await queryTrends({ limit: 10 });
const gpsr = trends.find(x => x.id === 'gpsr-produktsicherheit');
t('trend_topics befüllt (Score, Wachstum, Spike, Quellen)', gpsr && gpsr.trend_score > 50 && gpsr.growth_rate > 100 && gpsr.spike === 1 && gpsr.source_count === 2,
  gpsr && `score=${gpsr.trend_score} growth=${gpsr.growth_rate}% spike=${gpsr.spike}`);
t('KI-Interpretation gespeichert (summary + Aktion)', gpsr.summary.includes('KI-Marktlage') && gpsr.recommended_action.includes('Konkreter Schritt'));
t('Beleg-Artikel verknüpft (item_ids)', gpsr.item_ids.length === 4);
const hist = await topicHistory('gpsr-produktsicherheit', 30);
t('Zeitreihe: 30 Tages-Buckets mit 4 Erwähnungen', hist.length === 30 && hist.reduce((a, d) => a + d.mentions, 0) === 4);

const ar = await generateAlerts();
t('Alerts generiert (critical für GPSR-Meldungen)', ar.created >= 3, JSON.stringify(ar));
const critical = await queryAlerts({ level: 'critical' });
t('Critical-Alerts abrufbar mit Artikel-Join', critical.length >= 3 && !!critical[0].url && critical[0].delivered_at === null);
const ar2 = await generateAlerts();
t('Alert-Generator idempotent', ar2.created === 0);

// API-Ebene
const app = buildApi();
const srv = app.listen(0);
const base = 'http://127.0.0.1:' + srv.address().port;
const mi = await (await fetch(base + '/api/market-intelligence')).json();
t('Market Intelligence: Struktur komplett', Array.isArray(mi.rising_trends) && Array.isArray(mi.top_risks)
  && Array.isArray(mi.opportunities) && mi.alerts.critical.length >= 3 && !!mi.meta.computed_at,
  `${mi.rising_trends.length} Trends, ${mi.top_risks.length} Risiken, ${mi.opportunities.length} Chancen`);
t('Sparkline je Trend (30 Werte)', mi.rising_trends[0].sparkline.length === 30);
t('Chancen-Thema in opportunities', mi.opportunities.some(x => x.id === 'kaufland-expansion'));
const dash = await (await fetch(base + '/api/dashboard-feed')).json();
t('Dashboard-Priorisierung: Critical-Alerts gepinnt', Array.isArray(dash.critical_alerts) && dash.critical_alerts.length >= 1);
const alertsApi = await (await fetch(base + '/api/alerts?level=critical')).json();
t('GET /api/alerts filtert nach Level', alertsApi.items.every(a => a.alert_level === 'critical'));
const health = await (await fetch(base + '/api/health')).json();
t('Health zeigt Trend-/Alert-Status', health.modules.trends.topics === 2 && health.modules.alerts.created >= 3);

// ── Degradations-Pfad: Keyword-Topic-Fallback ohne KI-Analyse (Modul-Konvention!) ──
t('fallbackTopic: FBA-Gebühren erkannt (Kompositum)',
  fallbackTopic('Amazon kündigt neue Gebührenerhöhung an') === 'fba-gebuehren');
t('fallbackTopic: Recht/Abmahnung erkannt',
  fallbackTopic('Neues Urteil: Abmahnwelle im Onlinehandel') === 'recht-abmahnung');
t('fallbackTopic: „ki" nur als ganzes Wort (keine Kisten/Kinder)',
  fallbackTopic('Kisten und Kinderspielzeug im Vergleich') === null);
t('fallbackTopic: KI als Wort erkannt',
  fallbackTopic('Wie KI den Onlinehandel verändert') === 'ki-ecommerce');
t('fallbackTopic: Off-Topic → null',
  fallbackTopic('Horoskop für die kommende Woche') === null);
t('fallbackTopic: Priorität spezifisch vor generisch (GPSR vor Recht)',
  fallbackTopic('GPSR: neue Pflichten und Fristen per Gesetz') === 'produktsicherheit-gpsr');

// Rohe (nicht-analysierte) Items → Fallback-Topic → Trend + Zeitreihe + Forecast
async function seedRaw(title, age, source) {
  const id = 'raw-' + (++seq);
  await insertItem({ id, title, titleNorm: title.toLowerCase() + ' ' + seq, summary: '',
    url: 'https://x.de/' + id, source, publishDate: daysAgo(age), country: 'DE', type: 'news', relevanceScore: 55, eventStart: null });
}
await seedRaw('Amazon kündigt neue FBA-Gebühren an', 1, 'Wortfilter.de');
await seedRaw('FBA-Gebühren steigen: Was Händler jetzt wissen müssen', 2, 'shopanbieter.de');
await seedRaw('Analyse: Gebührenerhöhung trifft Private-Label-Seller', 4, 'Wortfilter.de');
const er2 = await runTrendEngine();
t('Fallback: Engine clustert Keyword-Topics ohne KI', er2.topics >= 3, JSON.stringify(er2));
const trends2 = await queryTrends({ limit: 10 });
const fb = trends2.find(x => x.id === 'fba-gebuehren');
t('Fallback: Trend „FBA-Gebühren" mit kuratiertem Namen', !!fb && fb.topic_name === 'FBA-Gebühren', fb && fb.topic_name);
const hist2 = await topicHistory('fba-gebuehren', 30);
t('Fallback: Zeitreihe gefüllt (3 Erwähnungen)', hist2.reduce((a, d) => a + d.mentions, 0) === 3);

// Komplette Kette bis zur API: Forecast rechnet auf der Fallback-Zeitreihe
await runForecast();
const fapi = await (await fetch(base + '/api/forecast')).json();
t('Fallback-Kette: /api/forecast liefert Prognosen', fapi.count >= 1 && fapi.items.some(i => i.topic === 'fba-gebuehren'),
  fapi.count + ' Topics prognostiziert');
const ffb = fapi.items.find(i => i.topic === 'fba-gebuehren');
t('Forecast: 7 Prognosetage + ehrliche Konfidenz (wenig Datenpunkte → gedeckelt)',
  !!ffb && ffb.days.length === 7 && ffb.confidence <= 35, ffb && ('conf=' + ffb.confidence));

srv.close();
console.log(`\n${pass} bestanden, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);
