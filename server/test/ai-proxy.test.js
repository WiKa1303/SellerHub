// ═══ KI-Proxy-Tests (Modul 2): Auth-Pflicht, Degradation, Roundtrips, Limits, Validierung ═══
//   node test/ai-proxy.test.js   (pg-mem — kein Postgres; Gemini-Upstream gemockt)
import { newDb } from 'pg-mem';
import { initDb, db, getUsage, incrementUsage, todayKey } from '../src/data/db.js';
import { buildApi } from '../src/api/routes.js';
import { config } from '../src/core/config.js';
import { aiProxyFetch, validateParts, proxyImage, MAX_PARTS_BYTES } from '../src/services/ai-proxy/index.js';

let pass = 0, fail = 0;
function t(name, cond, extra) {
  console.log((cond ? '✅' : '❌') + ' ' + name + (extra !== undefined ? ' → ' + extra : ''));
  cond ? pass++ : fail++;
}

// ── Mock: Gemini-Upstream (Antwort schaltbar, alle Aufrufe protokolliert) ──
let upstreamCalls = [];
let upstreamNext = null; // {ok, status, json}
aiProxyFetch(async (url, opts) => {
  upstreamCalls.push({ url, opts });
  const r = upstreamNext || { ok: true, status: 200, json: {} };
  return { ok: r.ok, status: r.status, json: async () => r.json };
});
const textResponse = (...texts) => ({ ok: true, status: 200,
  json: { candidates: [{ content: { parts: texts.map(x => ({ text: x })) } }] } });

// ── Setup: pg-mem + API + Testkonto (Modul 1) ──
const mem = newDb();
const { Pool } = mem.adapters.createPg();
await initDb(new Pool());
const app = buildApi();
const srv = app.listen(0);
const base = 'http://127.0.0.1:' + srv.address().port;

const post = (path, body, token) => fetch(base + path, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
  body: JSON.stringify(body),
});

config.registrationCode = 'einladung-test';
await post('/api/auth/register', { email: 'proxy@test.de', password: 'passwort1', inviteCode: 'einladung-test' });
const login = await (await post('/api/auth/login', { email: 'proxy@test.de', password: 'passwort1' })).json();
const token = login.token;
const userId = login.user.id;
t('Setup: Testkonto angelegt + eingeloggt', !!token && !!userId);

// Kleine Limits für deterministische 429-Tests (Muster: config-Override wie in anderen Suiten)
config.aiProxyTextPerDay = 5;
config.aiProxyImagePerDay = 2;

// ── 401: Bearer-Pflicht (Modul 1) ──
config.geminiApiKey = 'test-geheimer-key-123';
let r = await post('/api/ai/text', { prompt: 'Hallo' });
t('Text: ohne Token → 401', r.status === 401);
r = await post('/api/ai/image', { parts: [{ text: 'x' }] });
t('Bild: ohne Token → 401', r.status === 401);
t('401 erreicht den Upstream nie', upstreamCalls.length === 0);

// ── 503: ohne GEMINI_API_KEY (bewusster Degradations-Pfad) ──
config.geminiApiKey = '';
r = await post('/api/ai/text', { prompt: 'Hallo' }, token);
t('Text: ohne Server-Key → 503 (Client fällt auf eigenen Key/Fallback zurück)', r.status === 503, (await r.json()).error);
r = await post('/api/ai/image', { parts: [{ text: 'x' }] }, token);
t('Bild: ohne Server-Key → 503', r.status === 503);
t('503 zählt NICHT aufs Kontingent', (await getUsage(userId, todayKey())).text_calls === 0);

// ── Text-Roundtrip: Prompt → gemockter Upstream → {text} ──
config.geminiApiKey = 'test-geheimer-key-123';
upstreamNext = textResponse('Hallo', 'Welt');
r = await post('/api/ai/text', { prompt: 'Sag Hallo Welt' }, token);
const txt = await r.json();
t('Text-Roundtrip: 200 + {text} (Parts gejoint wie im Frontend)', r.status === 200 && txt.text === 'Hallo\nWelt', JSON.stringify(txt));
t('X-Quota-Remaining nach 1. Call = 4 (Limit 5)', r.headers.get('x-quota-remaining') === '4');
const call1 = upstreamCalls[upstreamCalls.length - 1];
t('Upstream: richtiges Modell + Key in der URL',
  call1.url.includes('gemini-2.5-flash:generateContent') && call1.url.includes('key=test-geheimer-key-123'));
t('Upstream-Body: {contents:[{parts:[{text:prompt}]}]}',
  JSON.parse(call1.opts.body).contents[0].parts[0].text === 'Sag Hallo Welt');
t('Upstream-Call hat Abort-Signal (Timeout)', !!call1.opts.signal);

// ── Zähler-Idempotenz + sinkende Quota ──
upstreamNext = textResponse('Nochmal');
r = await post('/api/ai/text', { prompt: 'Nochmal' }, token);
t('X-Quota-Remaining sinkt (2. Call = 3)', r.headers.get('x-quota-remaining') === '3');
const usage2 = await getUsage(userId, todayKey());
t('Zähler-Idempotenz: 2 Calls → text_calls = 2 (1 Zeile je Nutzer+Tag)', usage2.text_calls === 2 && usage2.image_calls === 0,
  JSON.stringify(usage2));
t('DB hält genau EINE ai_usage-Zeile', (await db().query(`SELECT count(*) AS n FROM ai_usage`)).rows[0].n == 1);

// ── 502: Upstream-Fehler wird durchgereicht — OHNE Key-Leak, zählt trotzdem ──
upstreamNext = { ok: false, status: 400, json: { error: { message:
  'API key not valid: https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=test-geheimer-key-123' } } };
r = await post('/api/ai/text', { prompt: 'kaputt' }, token);
const err502 = await r.json();
t('Upstream-Fehler → 502 mit Meldung', r.status === 502 && String(err502.error).includes('API key not valid'), err502.error);
t('502-Meldung enthält NIE den Key (maskiert)', !JSON.stringify(err502).includes('test-geheimer-key-123'));
t('Fehlgeschlagener Upstream zählt trotzdem (Schutz vor Retry-Stürmen)', (await getUsage(userId, todayKey())).text_calls === 3);
t('502 trägt X-Quota-Remaining', r.headers.get('x-quota-remaining') === '2');

// ── 400: leerer Prompt (zählt nicht) ──
r = await post('/api/ai/text', { prompt: '   ' }, token);
t('Text: leerer prompt → 400', r.status === 400);
t('400 zählt nicht aufs Kontingent', (await getUsage(userId, todayKey())).text_calls === 3);

// ── 429: Tageslimit Text (Limit 5) ──
upstreamNext = textResponse('ok');
await post('/api/ai/text', { prompt: 'vier' }, token);
r = await post('/api/ai/text', { prompt: 'fünf' }, token);
t('5. Call geht noch durch (Limit 5), Quota = 0', r.status === 200 && r.headers.get('x-quota-remaining') === '0');
const before = upstreamCalls.length;
r = await post('/api/ai/text', { prompt: 'sechs' }, token);
const lim = await r.json();
t('6. Call → 429 mit Limit + „morgen wieder"', r.status === 429 && lim.error.includes('5') && lim.error.includes('morgen wieder'), lim.error);
t('429 wird VOR dem Upstream geprüft (kein Upstream-Call)', upstreamCalls.length === before);
t('429 trägt X-Quota-Remaining: 0', r.headers.get('x-quota-remaining') === '0');

// ── parts-Validierung (kaputte Strukturen → 400, ohne Upstream/Zählung) ──
t('validateParts: kein Array', validateParts('kein-array') !== null);
t('validateParts: leeres Array', validateParts([]) !== null);
t('validateParts: fremdes Feld', validateParts([{ text: 'ok', extra: 1 }]) !== null);
t('validateParts: inlineData ohne mimeType', validateParts([{ inlineData: { data: 'AAA' } }]) !== null);
t('validateParts: inlineData mit Fremdfeld', validateParts([{ inlineData: { mimeType: 'image/png', data: 'A', x: 1 } }]) !== null);
t('validateParts: gültige Mischung ok', validateParts([{ text: 'p' }, { inlineData: { mimeType: 'image/png', data: 'AAA' } }]) === null);
r = await post('/api/ai/image', { parts: { nicht: 'array' } }, token);
t('Bild: parts kein Array → 400', r.status === 400, (await r.json()).error);
r = await post('/api/ai/image', { parts: [{ text: 'p' }], generationConfig: 'kaputt' }, token);
t('Bild: generationConfig kein Objekt → 400', r.status === 400);
t('400er zählen nicht aufs Bild-Kontingent', (await getUsage(userId, todayKey())).image_calls === 0);

// ── 413: parts über 25 MB (Service-Prüfung, direkt — HTTP-Parser würde vorher greifen) ──
const fat = await proxyImage({ parts: [{ inlineData: { mimeType: 'image/png', data: 'A'.repeat(MAX_PARTS_BYTES) } }], userId });
t('Bild: parts > 25 MB → 413', fat.status === 413, fat.error);

// ── Bild-Roundtrip: parts → gemockter Upstream → {mimeType, dataBase64} ──
upstreamNext = { ok: true, status: 200, json: { candidates: [{ content: { parts: [
  { text: 'hier dein bild' },
  { inlineData: { mimeType: 'image/png', data: 'QkFTRTY0LUJJTEQ=' } },
] } }] } };
r = await post('/api/ai/image', {
  parts: [{ text: 'Hero-Shot' }, { inlineData: { mimeType: 'image/jpeg', data: 'Zm90bw==' } }],
  generationConfig: { imageConfig: { aspectRatio: '1:1' } },
}, token);
const img = await r.json();
t('Bild-Roundtrip: 200 + {mimeType, dataBase64}', r.status === 200 && img.mimeType === 'image/png' && img.dataBase64 === 'QkFTRTY0LUJJTEQ=', JSON.stringify(img));
t('Bild: X-Quota-Remaining = 1 (Limit 2)', r.headers.get('x-quota-remaining') === '1');
const imgCall = upstreamCalls[upstreamCalls.length - 1];
const imgBody = JSON.parse(imgCall.opts.body);
t('Upstream: Bild-Modell gemini-2.5-flash-image', imgCall.url.includes('gemini-2.5-flash-image:generateContent'));
t('Upstream: parts 1:1 durchgereicht', imgBody.contents[0].parts[1].inlineData.data === 'Zm90bw==');
t('Upstream: responseModalities IMAGE erzwungen + generationConfig gemerged',
  JSON.stringify(imgBody.generationConfig.responseModalities) === '["IMAGE"]'
  && imgBody.generationConfig.imageConfig.aspectRatio === '1:1', JSON.stringify(imgBody.generationConfig));

// ── 429: Tageslimit Bild (Limit 2) ──
await post('/api/ai/image', { parts: [{ text: 'zwei' }] }, token);
r = await post('/api/ai/image', { parts: [{ text: 'drei' }] }, token);
t('Bild: 3. Call → 429 (Bild-Limit getrennt vom Text-Limit)', r.status === 429, (await r.json()).error);
t('Bild-Zähler: image_calls = 2', (await getUsage(userId, todayKey())).image_calls === 2);

// ── incrementUsage: Rückgabe der NEUEN Zähler (Repo-Kontrakt) ──
const inc = await incrementUsage(userId, '2000-01-01', 'image');
t('incrementUsage gibt neue Zähler zurück (frischer Tag: 0/1)', inc.text_calls === 0 && inc.image_calls === 1, JSON.stringify(inc));

// ── /internal: Sektion „KI-Proxy" (Key ja/nein, Limits, heutige Nutzung je Nutzer) ──
r = await fetch(base + '/internal');
const ihtml = await r.text();
t('/internal: Sektion „KI-Proxy" mit Limits + Nutzung', r.status === 200 && ihtml.includes('KI-Proxy (Modul 2)')
  && ihtml.includes('proxy@test.de') && ihtml.includes('Text-Limit/Tag'));
t('/internal leakt den Key nicht', !ihtml.includes('test-geheimer-key-123'));

srv.close();

console.log(`\n${pass} bestanden, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);
