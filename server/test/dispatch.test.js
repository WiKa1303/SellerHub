// ═══ Phase-5-Tests: Alert-Dispatcher (Push-Zustellung, fetch gemockt) ═══
//   node test/dispatch.test.js   (pg-mem — kein Postgres, kein Netz nötig)
import { newDb } from 'pg-mem';
import { initDb, db, insertItem, insertAlert, pendingAlerts } from '../src/data/db.js';
import { dispatchAlerts, dispatchFetch, dispatchState, DISPATCH_MAX_PER_RUN, DISPATCH_MAX_ATTEMPTS } from '../src/services/alerts/dispatch.js';
import { config } from '../src/core/config.js';
import { buildApi } from '../src/api/routes.js';

let pass = 0, fail = 0;
function t(name, cond, extra) {
  console.log((cond ? '✅' : '❌') + ' ' + name + (extra !== undefined ? ' → ' + extra : ''));
  cond ? pass++ : fail++;
}

// ── Mock: fetch (Erfolg/Fehler schaltbar, alle Aufrufe protokolliert) ──
let calls = [];
let failMode = false;
dispatchFetch(async (url, opts) => {
  calls.push({ url, opts });
  return failMode ? { ok: false, status: 500 } : { ok: true, status: 200 };
});

// ── Setup: pg-mem + Alert-Queue säen ──
const mem = newDb();
const { Pool } = mem.adapters.createPg();
await initDb(new Pool());

let seq = 0;
async function seedAlert(level = 'critical') {
  const id = 'al-' + (++seq);
  await insertItem({ id, title: 'Alert-Meldung ' + seq, titleNorm: 'alert ' + seq, summary: 's',
    url: 'https://x.de/' + id, source: 'Wortfilter.de', publishDate: new Date().toISOString(),
    country: 'DE', type: 'news', relevanceScore: 50, eventStart: null });
  await insertAlert(id, level, 'recht', 'Alert-Meldung ' + seq);
  return id;
}

// ── Fall 1: kein Kanal konfiguriert → sauberer Skip, Queue bleibt stehen ──
config.pushWebhookUrl = '';
config.pushNtfyTopic = '';
for (let i = 0; i < 3; i++) await seedAlert();
const r0 = await dispatchAlerts();
t('Ohne Konfiguration: Skip (Degradation)', !!r0.skipped && calls.length === 0, JSON.stringify(r0));
t('Queue bleibt unangetastet', (await pendingAlerts(50)).length === 3);

// ── Fall 2: Webhook-Erfolg → delivered_at gesetzt, Payload-Kontrakt stimmt ──
config.pushWebhookUrl = 'https://example.test/hook';
const r1 = await dispatchAlerts();
t('Erfolg: alle 3 zugestellt', r1.delivered === 3 && r1.failed === 0, JSON.stringify(r1));
t('Queue leer (delivered_at nur bei Erfolg gesetzt — hier Erfolg)', (await pendingAlerts(50)).length === 0);
const payload = JSON.parse(calls[0].opts.body);
t('Webhook-Payload: {title, severity, url, published_at, source}',
  payload.title.startsWith('Alert-Meldung') && payload.severity === 'critical'
  && payload.url.startsWith('https://x.de/') && !!payload.published_at && payload.source === 'Wortfilter.de',
  JSON.stringify(payload));
t('Webhook: JSON-POST an die konfigurierte URL', calls[0].url === 'https://example.test/hook' && calls[0].opts.method === 'POST');

// ── Fall 3: Fehler → Queue bleibt stehen, attempts steigt (automatischer Retry) ──
const failId = await seedAlert('important');
failMode = true;
calls = [];
const r2 = await dispatchAlerts();
t('Fehler: nichts zugestellt', r2.delivered === 0 && r2.failed === 1, JSON.stringify(r2));
const row = (await db().query(`SELECT attempts, delivered_at FROM alerts WHERE id = $1`, [failId])).rows[0];
t('attempts hochgezählt, delivered_at bleibt NULL', row.attempts === 1 && row.delivered_at === null, 'attempts=' + row.attempts);
t('Alert bleibt in der Queue (Retry im nächsten Lauf)', (await pendingAlerts(50)).some(a => a.id === failId));

// ── Fall 4: nach N Fehlversuchen wird mit Vermerk aufgegeben (Queue-Hygiene) ──
for (let i = 1; i < DISPATCH_MAX_ATTEMPTS; i++) await dispatchAlerts(); // attempts → N
const r3 = await dispatchAlerts(); // N erreicht → Aufgeben statt weiterer Versuch
const given = (await db().query(`SELECT attempts, delivered_at, delivery_note FROM alerts WHERE id = $1`, [failId])).rows[0];
t(`Nach ${DISPATCH_MAX_ATTEMPTS} Fehlversuchen aufgegeben (delivered_at + Vermerk)`,
  r3.givenUp === 1 && given.delivered_at !== null && String(given.delivery_note).includes('aufgegeben'),
  given.delivery_note);
t('Queue wächst nicht ewig (aufgegebener Alert raus)', (await pendingAlerts(50)).length === 0);

// ── Fall 5: ntfy-Kanal (Title-Header + Body, kontofrei) ──
failMode = false;
config.pushWebhookUrl = '';
config.pushNtfyTopic = 'sellerhub-test-topic';
const ntfyId = await seedAlert('critical');
calls = [];
const r4 = await dispatchAlerts();
t('ntfy: zugestellt', r4.delivered === 1);
t('ntfy: POST an https://ntfy.sh/<topic> mit Title-Header + Priority',
  calls[0].url === 'https://ntfy.sh/sellerhub-test-topic' && calls[0].opts.headers.Title.includes('critical')
  && calls[0].opts.headers.Priority === 'urgent' && calls[0].opts.body.includes('https://x.de/' + ntfyId),
  calls[0].url);

// ── Fall 6: Cap pro Lauf greift (Rest bleibt für den nächsten Lauf) ──
config.pushWebhookUrl = 'https://example.test/hook';
config.pushNtfyTopic = '';
for (let i = 0; i < DISPATCH_MAX_PER_RUN + 5; i++) await seedAlert('info');
const r5 = await dispatchAlerts();
t(`Cap: max. ${DISPATCH_MAX_PER_RUN} Zustellungen pro Lauf`, r5.delivered === DISPATCH_MAX_PER_RUN, JSON.stringify(r5));
t('Rest bleibt in der Queue', (await pendingAlerts(50)).length === 5);

// ── Sichtbarkeit: dispatchState in /api/health ──
const app = buildApi();
const srv = app.listen(0);
const base = 'http://127.0.0.1:' + srv.address().port;
const health = await (await fetch(base + '/api/health')).json();
t('Health zeigt dispatch-Modul (delivered/failed/givenUp/channels)',
  health.modules.dispatch && health.modules.dispatch.delivered >= DISPATCH_MAX_PER_RUN + 4
  && health.modules.dispatch.givenUp === 1 && Array.isArray(health.modules.dispatch.channels),
  JSON.stringify(health.modules.dispatch));
t('dispatchState.lastRun gesetzt', !!dispatchState.lastRun);
srv.close();

console.log(`\n${pass} bestanden, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);
