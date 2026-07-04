// ═══ Smoke-Test: kompletter Durchlauf ohne echtes Postgres (pg-mem) ═══
// Crawlt die ECHTEN Feeds → speichert → fragt die API ab. Netzwerk erforderlich.
//   npm test
import { newDb } from 'pg-mem';
import { initDb } from '../src/db.js';
import { runCrawl } from '../src/crawler/run.js';
import { buildApi } from '../src/api.js';
import { scoreItem } from '../src/scoring.js';
import { urlHash, titleSimilarity, isDuplicateTitle } from '../src/dedupe.js';
import { canonicalUrl, normalizeTitle, extractEventDate, cleanSummary } from '../src/crawler/normalize.js';

let pass = 0, fail = 0;
function t(name, cond, extra) {
  console.log((cond ? '✅' : '❌') + ' ' + name + (extra !== undefined ? ' → ' + extra : ''));
  cond ? pass++ : fail++;
}

// ── Unit: Normalisierung ──
t('canonicalUrl entfernt UTM', canonicalUrl('http://Example.de/a/?utm_source=x&id=7#top') === 'https://example.de/a/?id=7');
t('normalizeTitle (Umlaute, Stoppwörter)', normalizeTitle('Die neue Gebühren-Änderung für Händler!') === 'gebuehren aenderung haendler');
t('cleanSummary kürzt auf 300', cleanSummary('<p>' + 'x'.repeat(500) + '</p>').length <= 300);
const ev = extractEventDate('merchantday am 12.09.2026 in Hannover', new Date('2026-07-04'));
t('extractEventDate 12.09.2026', ev && ev.toISOString().startsWith('2026-09-12'), ev && ev.toISOString());
const ev2 = extractEventDate('Stammtisch am 15.03.', new Date('2026-07-04'));
t('extractEventDate ohne Jahr → nächstes Jahr', ev2 && ev2.toISOString().startsWith('2027-03-15'), ev2 && ev2.toISOString());
t('extractEventDate ignoriert Vergangenheit', extractEventDate('Rückblick: Messe vom 01.02.2020', new Date('2026-07-04')) === null);

// ── Unit: Scoring ──
const hot = scoreItem({ title: 'Amazon erhöht FBA-Gebühren: neue Frist ab dem 1.9.', summary: 'Händler müssen bis 1.9. reagieren', publishDate: new Date().toISOString(), sourceWeight: 3 });
t('Score: heiße Meldung ≥ 80', hot.score >= 80, hot.score);
const cold = scoreItem({ title: 'Neues Rezept für Apfelkuchen', summary: 'Backen im Herbst', publishDate: new Date(Date.now() - 20 * 864e5).toISOString(), sourceWeight: 1 });
t('Score: irrelevante Meldung < 25', cold.score < 25, cold.score);
t('Score: nie > 100', scoreItem({ title: Object.values({ a: 'gebühr gpsr oss zoll frist pflicht gesetz fba prime amazon marktplatz' }).join(' '), summary: 'abmahnung verordnung haftung sperrung', publishDate: new Date().toISOString(), sourceWeight: 3 }).score <= 100);

// ── Unit: Dedupe ──
t('urlHash stabil', urlHash('https://a.de/x') === urlHash('https://a.de/x') && urlHash('https://a.de/x').length === 64);
t('titleSimilarity: identisch = 1', titleSimilarity('amazon gebuehren steigen', 'amazon gebuehren steigen') === 1);
t('titleSimilarity: ähnlich > 0.85', titleSimilarity(normalizeTitle('Amazon erhöht die FBA-Gebühren 2026'), normalizeTitle('Amazon erhöht FBA-Gebühren 2026!')) > 0.85);
t('titleSimilarity: verschieden < 0.5', titleSimilarity('amazon gebuehren', 'ebay plus programm startet') < 0.5);
t('isDuplicateTitle', isDuplicateTitle('amazon fba gebuehren 2026', ['amazon fba gebuehren 2026'], 0.85) === true);

// ── End-to-End: pg-mem + echte Feeds + API ──
const mem = newDb();
const { Pool } = mem.adapters.createPg();
await initDb(new Pool());

const stats = await runCrawl();
const kept = Object.values(stats).reduce((a, s) => a + s.kept, 0);
const errs = Object.entries(stats).filter(([, s]) => s.error).map(([id, s]) => id + ':' + s.error);
console.log('   Crawl-Statistik:', JSON.stringify(stats));
t('Crawl: mindestens 1 Quelle liefert Items', kept > 0, kept + ' gespeichert' + (errs.length ? ' · Fehler: ' + errs.join(', ') : ''));

const app = buildApi();
const srv = app.listen(0);
const base = 'http://127.0.0.1:' + srv.address().port;

const news = await (await fetch(base + '/api/news?limit=5')).json();
t('GET /api/news liefert Items mit Pflichtfeldern', news.items.length > 0 && news.items.every(i => i.title && i.url && i.publish_date && i.relevance_score >= 25), news.items.length + ' Items');
t('GET /api/news sortiert nach Score absteigend', news.items.every((x, i, a) => i === 0 || a[i - 1].relevance_score >= x.relevance_score));

const events = await (await fetch(base + '/api/events')).json();
t('GET /api/events antwortet strukturiert', Array.isArray(events.items), events.items.length + ' Events (0 ist ok – RSS-Quellen sind newslastig)');

const dash = await (await fetch(base + '/api/dashboard-feed')).json();
t('GET /api/dashboard-feed: ≤5 News, ≤3 Events, Meta', Array.isArray(dash.news) && dash.news.length <= 5 && Array.isArray(dash.events) && dash.events.length <= 3 && dash.meta.lastCrawl, dash.news.length + ' News / ' + dash.events.length + ' Events');
const bySource = {};
dash.news.forEach(n => bySource[n.source] = (bySource[n.source] || 0) + 1);
t('Dashboard: max. 2 pro Quelle', Object.values(bySource).every(c => c <= 2), JSON.stringify(bySource));

const health = await (await fetch(base + '/api/health')).json();
t('GET /api/health', health.ok === true && !!health.crawler.lastRun && health.ai.enabled === false);

// Dubletten-Probe: zweiter Crawl darf (fast) nichts Neues einfügen
const stats2 = await runCrawl();
const kept2 = Object.values(stats2).reduce((a, s) => a + s.kept, 0);
t('Re-Crawl: Dubletten werden verworfen', kept2 <= Math.max(1, Math.round(kept * 0.05)), kept2 + ' neue bei 2. Lauf');

srv.close();
console.log(`\n${pass} bestanden, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);
