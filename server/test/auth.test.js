// ═══ Konten & Daten-Sync-Tests (Modul 1): Register, Login, Sessions, Sync, Limits ═══
//   node test/auth.test.js
import { newDb } from 'pg-mem';
import { initDb, db, createSession, findValidSession } from '../src/data/db.js';
import { buildApi } from '../src/api/routes.js';
import { config } from '../src/core/config.js';
import { hashPassword, verifyPassword, sha256, _resetLoginLimiter } from '../src/services/auth/index.js';

let pass = 0, fail = 0;
function t(name, cond, extra) {
  console.log((cond ? '✅' : '❌') + ' ' + name + (extra !== undefined ? ' → ' + extra : ''));
  cond ? pass++ : fail++;
}

// ── scrypt-Roundtrip (kein DB-Bedarf) ──
const stored = await hashPassword('geheim-passwort');
t('scrypt: Format salt$hash (hex)', /^[0-9a-f]{32}\$[0-9a-f]{128}$/.test(stored), stored.slice(0, 20) + '…');
t('scrypt: richtiges Passwort verifiziert', await verifyPassword('geheim-passwort', stored) === true);
t('scrypt: falsches Passwort abgelehnt', await verifyPassword('falsch', stored) === false);
t('scrypt: kaputter Hash abgelehnt (kein Crash)', await verifyPassword('x', 'kein-dollar') === false);
t('scrypt: zwei Hashes desselben Passworts unterscheiden sich (Salt)',
  await hashPassword('geheim-passwort') !== stored);

// ── API auf pg-mem booten ──
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
const put = (path, body, token) => fetch(base + path, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
  body: JSON.stringify(body),
});
const get = (path, token) => fetch(base + path, {
  headers: token ? { Authorization: 'Bearer ' + token } : {},
});

// ── Registrierung: Einladungscode-Pflicht ──
config.registrationCode = ''; // ENV leer = Registrierung geschlossen
let r = await post('/api/auth/register', { email: 'a@test.de', password: 'passwort1', inviteCode: 'egal' });
t('Register: ohne REGISTRATION_CODE → 403 (Registrierung geschlossen)', r.status === 403, (await r.json()).error);

config.registrationCode = 'einladung-123';
r = await post('/api/auth/register', { email: 'a@test.de', password: 'passwort1', inviteCode: 'falscher-code' });
t('Register: falscher inviteCode → 403', r.status === 403);

r = await post('/api/auth/register', { email: '  Anna@Test.DE ', password: 'passwort1', displayName: 'Anna', inviteCode: 'einladung-123' });
const reg = await r.json();
t('Register: mit Code → 201 + User', r.status === 201 && reg.user && reg.user.displayName === 'Anna', JSON.stringify(reg.user || reg));
t('Register: E-Mail wird normalisiert (lowercase, getrimmt)', reg.user && reg.user.email === 'anna@test.de');

r = await post('/api/auth/register', { email: 'anna@test.de', password: 'passwort2', inviteCode: 'einladung-123' });
t('Register: doppelte E-Mail → 409', r.status === 409);
r = await post('/api/auth/register', { email: 'kurz@test.de', password: 'kurz', inviteCode: 'einladung-123' });
t('Register: Passwort < 8 Zeichen → 400', r.status === 400);

// ── Login ──
r = await post('/api/auth/login', { email: 'anna@test.de', password: 'falsches-pw' });
t('Login: falsches Passwort → 401', r.status === 401);
r = await post('/api/auth/login', { email: 'gibtsnicht@test.de', password: 'passwort1' });
t('Login: unbekannte E-Mail → 401 (gleiche Antwort, kein User-Enumeration)', r.status === 401);

r = await post('/api/auth/login', { email: 'Anna@test.de', password: 'passwort1' });
const login = await r.json();
t('Login: korrekt → 200 mit Token + User', r.status === 200 && !!login.token && login.user.email === 'anna@test.de');
t('Login: Token = 64 Hex-Zeichen (randomBytes 32)', /^[0-9a-f]{64}$/.test(login.token || ''));
const dbTokens = (await db().query(`SELECT token_hash FROM sessions`)).rows.map(x => x.token_hash);
t('DB speichert NUR sha256(token), nie den Klartext',
  dbTokens.includes(sha256(login.token)) && !dbTokens.includes(login.token));
const token = login.token;

// ── /api/auth/me ──
r = await get('/api/auth/me');
t('me: ohne Token → 401', r.status === 401);
r = await get('/api/auth/me', 'deadbeef'.repeat(8));
t('me: unbekannter Token → 401', r.status === 401);
r = await get('/api/auth/me', token);
const me = await r.json();
t('me: mit Token → 200 + eigener User', r.status === 200 && me.user.email === 'anna@test.de' && me.user.role === 'user');
t('me: Antwort ist privat (Cache-Control no-store)', r.headers.get('cache-control') === 'no-store');

// ── CORS-Preflight für den Sync (Authorization muss erlaubt sein) ──
r = await fetch(base + '/api/sync', { method: 'OPTIONS' });
t('OPTIONS-Preflight → 204, Authorization in Allow-Headers',
  r.status === 204 && (r.headers.get('access-control-allow-headers') || '').includes('Authorization'));
t('OPTIONS-Preflight erlaubt PUT', (r.headers.get('access-control-allow-methods') || '').includes('PUT'));

// ── Sync-Roundtrip: PUT → GET ──
r = await get('/api/sync');
t('Sync: ohne Token → 401', r.status === 401);
r = await put('/api/sync', { items: [{ key: 'sh_products', value: { list: [1, 2, 3] }, baseVersion: 0 }] }, token);
const putRes = await r.json();
t('Sync PUT: neuer Key → 200, version 1', r.status === 200 && putRes.items[0].version === 1, JSON.stringify(putRes));
r = await get('/api/sync', token);
const list = await r.json();
t('Sync GET: Roundtrip liefert Wert + Metadaten zurück',
  r.status === 200 && list.count === 1 && list.items[0].key === 'sh_products'
  && JSON.stringify(list.items[0].value) === JSON.stringify({ list: [1, 2, 3] })
  && list.items[0].version === 1 && !!list.items[0].updated_at, JSON.stringify(list.items));

// ── Versions-Konflikt ──
r = await put('/api/sync', { items: [{ key: 'sh_products', value: { list: [9] }, baseVersion: 1 }] }, token);
t('Sync PUT: passende baseVersion → version 2', r.status === 200 && (await r.json()).items[0].version === 2);
r = await put('/api/sync', { items: [{ key: 'sh_products', value: { list: [0] }, baseVersion: 1 }] }, token);
const conf = await r.json();
t('Sync PUT: veraltete baseVersion → 409', r.status === 409);
t('409 enthält Server-Stand des Konflikt-Keys (key, value, version, updated_at)',
  conf.conflicts && conf.conflicts[0].key === 'sh_products' && conf.conflicts[0].version === 2
  && JSON.stringify(conf.conflicts[0].value) === JSON.stringify({ list: [9] }) && !!conf.conflicts[0].updated_at,
  JSON.stringify(conf.conflicts));
r = await get('/api/sync', token);
t('Konflikt-Key wurde NICHT überschrieben (Server behält version 2)',
  JSON.stringify((await r.json()).items[0].value) === JSON.stringify({ list: [9] }));

// ── Größenlimits (ehrliche 413) ──
r = await put('/api/sync', { items: [{ key: 'zu_gross', value: 'x'.repeat(513 * 1024), baseVersion: 0 }] }, token);
t('Sync PUT: Einzelwert > 512 KB → 413', r.status === 413, (await r.json()).error);
const big = 'y'.repeat(500 * 1024);
const many = Array.from({ length: 21 }, (_, i) => ({ key: 'gross_' + i, value: big, baseVersion: 0 }));
r = await put('/api/sync', { items: many }, token);
t('Sync PUT: Summe > 10 MB → 413', r.status === 413, (await r.json()).error);
r = await put('/api/sync', { items: 'kein-array' }, token);
t('Sync PUT: kaputter Body → 400', r.status === 400);

// ── Passwort ändern ──
r = await post('/api/auth/change-password', { currentPassword: 'falsch', newPassword: 'neues-passwort' }, token);
t('change-password: falsches aktuelles Passwort → 401', r.status === 401);
r = await post('/api/auth/change-password', { currentPassword: 'passwort1', newPassword: 'neues-passwort' }, token);
t('change-password: korrekt → 200', r.status === 200);
_resetLoginLimiter(); // Fehlversuche von oben nicht mitzählen
r = await post('/api/auth/login', { email: 'anna@test.de', password: 'passwort1' });
t('change-password: altes Passwort gilt nicht mehr', r.status === 401);
r = await post('/api/auth/login', { email: 'anna@test.de', password: 'neues-passwort' });
t('change-password: neues Passwort funktioniert', r.status === 200);

// ── Logout invalidiert den Token ──
r = await post('/api/auth/logout', {}, token);
t('Logout: mit Token → 200', r.status === 200);
r = await get('/api/auth/me', token);
t('Logout: Token danach ungültig (me → 401)', r.status === 401);

// ── Abgelaufene Session (Repo-Ebene, Ablauf-Check mit JS-Datum) ──
const userId = (await db().query(`SELECT id FROM users LIMIT 1`)).rows[0].id;
await createSession({ tokenHash: sha256('abgelaufen'), userId, expiresAt: new Date(Date.now() - 1000) });
t('findValidSession: abgelaufene Session → null',
  await findValidSession(sha256('abgelaufen'), new Date()) === null);

// ── Login-Rate-Limit: max. 10 Fehlversuche / 15 min je E-Mail ──
_resetLoginLimiter();
await post('/api/auth/register', { email: 'limit@test.de', password: 'passwort1', inviteCode: 'einladung-123' });
let last = null;
for (let i = 0; i < 10; i++) last = await post('/api/auth/login', { email: 'limit@test.de', password: 'falsch' });
t('Rate-Limit: 10. Fehlversuch antwortet noch 401', last.status === 401);
r = await post('/api/auth/login', { email: 'limit@test.de', password: 'passwort1' });
t('Rate-Limit: 11. Versuch → 429 (auch mit korrektem Passwort)', r.status === 429, (await r.json()).error);
_resetLoginLimiter();
r = await post('/api/auth/login', { email: 'limit@test.de', password: 'passwort1' });
t('Rate-Limit: nach Fenster-Reset wieder Login möglich', r.status === 200);

// ── /internal zeigt die Konten-Sektion (read-only) ──
r = await fetch(base + '/internal');
const ihtml = await r.text();
t('/internal: Sektion „Konten & Sync" mit Zählern', r.status === 200 && ihtml.includes('Konten &amp; Sync')
  && ihtml.includes('aktive Sessions') && ihtml.includes('Sync-Keys'));

srv.close();

console.log(`\n${pass} bestanden, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);
