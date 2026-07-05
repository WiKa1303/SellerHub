// ═══ Plattform-Härtungs-Tests: Env-Validation, Logging, Mandanten-Feedback, Error-Standard ═══
//   node test/platform.test.js
import { execSync } from 'node:child_process';
import { newDb } from 'pg-mem';
import { initDb, db, insertItem, saveFeedback } from '../src/data/db.js';
import { buildApi } from '../src/api/routes.js';

let pass = 0, fail = 0;
function t(name, cond, extra) {
  console.log((cond ? '✅' : '❌') + ' ' + name + (extra !== undefined ? ' → ' + extra : ''));
  cond ? pass++ : fail++;
}
const runNode = (code, env = {}) =>
  execSync(`node --input-type=module -e "${code.replace(/"/g, '\\"')}"`, {
    env: { ...process.env, ...env }, cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8',
  }).trim();

// ── Environment-Validation (in Kind-Prozessen, um ENV sauber zu variieren) ──
const v = (env) => runNode(`import('./src/core/config.js').then(m => { try { const w = m.validateConfig(); console.log('OK:' + w.length); } catch (e) { console.log('ERR:' + e.message.split('\\n')[0]); } });`, env);
t('validateConfig: fehlende DATABASE_URL → Abbruch', v({ DATABASE_URL: '' }).startsWith('ERR:Ungültige Konfiguration'));
t('validateConfig: kaputte Zahl → Abbruch', v({ DATABASE_URL: 'postgres://x/y', AI_MAX_PER_RUN: 'quatsch' }).startsWith('ERR:'));
t('validateConfig: kaputtes Cron-Muster → Abbruch', v({ DATABASE_URL: 'postgres://x/y', CRAWL_CRON: 'jeden morgen' }).startsWith('ERR:'));
const okOut = v({ DATABASE_URL: 'postgres://x/y', ADMIN_KEY: '', ANTHROPIC_API_KEY: '', PUSH_WEBHOOK_URL: '', PUSH_NTFY_TOPIC: '', REGISTRATION_CODE: '', GEMINI_API_KEY: '' });
t('validateConfig: valide Config → Warnungen statt Abbruch (ADMIN_KEY, KI-Key, Push, Registrierung, Gemini-Key)', okOut === 'OK:5', okOut);
t('validateConfig: kaputte PUSH_WEBHOOK_URL → Abbruch', v({ DATABASE_URL: 'postgres://x/y', PUSH_WEBHOOK_URL: 'ftp://falsch' }).startsWith('ERR:'));

// ── Logging-Strategie: JSON-Modus für Aggregatoren ──
const line = runNode(`import('./src/core/logger.js').then(m => m.log.info('Hallo', { a: 1 }));`, { LOG_FORMAT: 'json' });
let parsed = null; try { parsed = JSON.parse(line); } catch {}
t('LOG_FORMAT=json → valide JSON-Zeile mit ts/level/msg', parsed && parsed.level === 'info' && parsed.msg.includes('Hallo') && !!parsed.ts, line.slice(0, 80));
const pretty = runNode(`import('./src/core/logger.js').then(m => m.log.warn('Klartext'));`);
t('Default-Modus bleibt menschenlesbar', pretty.includes('WARN') && pretty.includes('Klartext'));

// ── Mandanten-Feedback: getrennte Votes, kein Überschreiben zwischen Tenants ──
const mem = newDb();
const { Pool } = mem.adapters.createPg();
await initDb(new Pool());
await insertItem({ id: 'art-1', title: 'T', titleNorm: 't', summary: 's', url: 'https://x.de/1',
  source: 'Q', publishDate: new Date().toISOString(), country: 'DE', type: 'news', relevanceScore: 50, eventStart: null });
t('saveFeedback: unbekanntes Item → false (API antwortet 404)', await saveFeedback('gibts-nicht', 1, 'public') === false);
await saveFeedback('art-1', 1, 'tenant-a');
await saveFeedback('art-1', -1, 'tenant-b');
await saveFeedback('art-1', -1, 'tenant-a'); // Umstimmen: Upsert statt Duplikat
const rows = (await db().query(`SELECT tenant_id, vote FROM feedback ORDER BY tenant_id`)).rows;
t('Feedback je Tenant getrennt (2 Zeilen, kein Überschreiben)', rows.length === 2 && rows[0].tenant_id === 'tenant-a' && rows[1].vote === -1, JSON.stringify(rows));
t('Upsert: Tenant kann Vote ändern', rows[0].vote === -1);

// ── API: X-Tenant-Id fließt bis in die Tabelle; 500er leaken keine Interna ──
const app = buildApi();
const srv = app.listen(0);
const base = 'http://127.0.0.1:' + srv.address().port;
await fetch(base + '/api/feedback', { method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': 'kunde-42' },
  body: JSON.stringify({ id: 'art-1', vote: 1 }) });
const t42 = (await db().query(`SELECT vote FROM feedback WHERE tenant_id = 'kunde-42'`)).rows;
t('X-Tenant-Id → tenant_id in der feedback-Tabelle', t42.length === 1 && t42[0].vote === 1);
// ── /internal: Debug-Oberfläche rendert (auch mit Minimal-Daten) ──
const internal = await fetch(base + '/internal');
const ihtml = await internal.text();
t('/internal antwortet 200 mit allen Sektionen', internal.status === 200
  && ihtml.includes('System') && ihtml.includes('Intelligence') && ihtml.includes('Trends')
  && ihtml.includes('Alerts') && ihtml.includes('Personalisierter Feed'));
t('/internal zeigt Prompt-Registry mit Versionen', ihtml.includes('Prompts — Registry') && ihtml.includes('relevance_analysis') && ihtml.includes('strategy_brief'));
t('/internal ist read-only (kein POST-Formular)', !ihtml.includes('method="post"'));
const internalProf = await fetch(base + '/internal?profil=arb&tenant=kunde-42');
t('/internal mit Profil+Tenant rendert', internalProf.status === 200 && (await internalProf.text()).includes('kunde-42'));

srv.close();

console.log(`\n${pass} bestanden, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);
