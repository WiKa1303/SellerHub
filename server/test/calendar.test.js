// ═══ Kalender-Sync-Tests: ICS-Parser, Feed-Verwaltung, SSRF-Schutz, Events-API,
//     Lazy-Sync-TTL, ICS-Export der Aufgaben (Google-Abo-Gegenrichtung) ═══
//   node test/calendar.test.js
import { newDb } from 'pg-mem';
import { initDb } from '../src/data/db.js';
import { buildApi } from '../src/api/routes.js';
import { config } from '../src/core/config.js';
import { parseIcs, tasksToIcs } from '../src/services/calendar/ics.js';
import { setCalendarFetch } from '../src/services/calendar/index.js';

let pass = 0, fail = 0;
function t(name, cond, extra) {
  console.log((cond ? '✅' : '❌') + ' ' + name + (extra !== undefined ? ' → ' + extra : ''));
  cond ? pass++ : fail++;
}

// ── Termine relativ zu heute, damit das Parser-Fenster (−60/+400 Tage) nie veraltet ──
const day = (offset) => {
  const d = new Date(Date.now() + offset * 86400000);
  return d.toISOString().slice(0, 10);
};
const compact = (s) => s.replace(/-/g, '');
const inSevenDays = day(7), inEightDays = day(8), inTenDays = day(10);

// ═══ 1) ICS-Parser (ohne DB) ═══

const SAMPLE_ICS = [
  'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Test//DE',
  // Einzeltermin mit Uhrzeit (UTC)
  'BEGIN:VEVENT', 'UID:ev-utc', 'SUMMARY:Meeting mit Lieferant',
  'DTSTART:' + compact(inSevenDays) + 'T100000Z', 'DTEND:' + compact(inSevenDays) + 'T110000Z',
  'LOCATION:Büro Berlin', 'END:VEVENT',
  // Ganztags (DTEND exklusiv → 1 Tag)
  'BEGIN:VEVENT', 'UID:ev-allday', 'SUMMARY:Messe-Tag',
  'DTSTART;VALUE=DATE:' + compact(inEightDays), 'DTEND;VALUE=DATE:' + compact(day(9)), 'END:VEVENT',
  // Wandzeit mit TZID (Berlin)
  'BEGIN:VEVENT', 'UID:ev-tzid', 'SUMMARY:Zahnarzt',
  'DTSTART;TZID=Europe/Berlin:' + compact(inTenDays) + 'T090000',
  'DTEND;TZID=Europe/Berlin:' + compact(inTenDays) + 'T093000', 'END:VEVENT',
  // Wöchentliche Wiederholung, 3×
  'BEGIN:VEVENT', 'UID:ev-weekly', 'SUMMARY:Jour fixe',
  'DTSTART:' + compact(inSevenDays) + 'T140000Z', 'DTEND:' + compact(inSevenDays) + 'T143000Z',
  'RRULE:FREQ=WEEKLY;COUNT=3', 'END:VEVENT',
  // Abgesagt → muss verschwinden
  'BEGIN:VEVENT', 'UID:ev-cancel', 'SUMMARY:Abgesagt', 'STATUS:CANCELLED',
  'DTSTART:' + compact(inSevenDays) + 'T120000Z', 'END:VEVENT',
  // Escaping: Komma + Zeilenumbruch in SUMMARY
  'BEGIN:VEVENT', 'UID:ev-esc', 'SUMMARY:Inventur\\, Lager\\nHalle 2',
  'DTSTART;VALUE=DATE:' + compact(inTenDays), 'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

{
  const evs = parseIcs(SAMPLE_ICS);
  const by = Object.fromEntries(evs.map(e => [e.uid.split('@')[0], e]));
  t('Parser: UTC-Termin mit Tag & Zeit', by['ev-utc'] && by['ev-utc'].startDay === inSevenDays && !by['ev-utc'].allDay);
  t('Parser: Ort wird übernommen', by['ev-utc'] && by['ev-utc'].location === 'Büro Berlin');
  t('Parser: Ganztags-Termin (DTEND exklusiv)', by['ev-allday'] && by['ev-allday'].allDay && by['ev-allday'].startDay === inEightDays && by['ev-allday'].endDay === inEightDays);
  t('Parser: TZID-Wandzeit wird nach UTC gewandelt', by['ev-tzid'] && by['ev-tzid'].startTs && by['ev-tzid'].startDay === inTenDays,
    by['ev-tzid'] && by['ev-tzid'].startTs);
  t('Parser: RRULE WEEKLY;COUNT=3 → 3 Instanzen', evs.filter(e => e.uid.startsWith('ev-weekly')).length === 3);
  t('Parser: RRULE-Instanzen im Wochenabstand', (() => {
    const w = evs.filter(e => e.uid.startsWith('ev-weekly')).map(e => e.startDay).sort();
    return w[1] === day(14) && w[2] === day(21);
  })());
  t('Parser: CANCELLED wird übersprungen', !evs.some(e => e.uid.startsWith('ev-cancel')));
  t('Parser: Escaping (Komma/Umbruch) aufgelöst', by['ev-esc'] && by['ev-esc'].title === 'Inventur, Lager\nHalle 2');
  t('Parser: kaputter Input → leer statt Absturz', parseIcs('kein kalender').length === 0);
}

// ── EXDATE: eine Instanz der Serie fällt aus ──
{
  const ics = ['BEGIN:VCALENDAR',
    'BEGIN:VEVENT', 'UID:ex1', 'SUMMARY:Serie',
    'DTSTART:' + compact(inSevenDays) + 'T080000Z',
    'RRULE:FREQ=DAILY;COUNT=3',
    'EXDATE:' + compact(inEightDays) + 'T080000Z',
    'END:VEVENT', 'END:VCALENDAR'].join('\n');
  const evs = parseIcs(ics);
  t('Parser: EXDATE entfernt genau eine Instanz', evs.length === 2 && !evs.some(e => e.startDay === inEightDays));
}

// ═══ 2) ICS-Export (Aufgaben → Google) ═══
{
  const ics = tasksToIcs([
    { id: 'abc', title: 'Muster bestellen, dringend', due_date: inSevenDays, due_time: null, list_name: 'Einkauf' },
    { id: 'def', title: 'Call Lieferant', due_date: inSevenDays, due_time: '14:30', list_name: 'Einkauf' },
  ]);
  t('Export: gültiger VCALENDAR-Rahmen', ics.startsWith('BEGIN:VCALENDAR') && ics.trim().endsWith('END:VCALENDAR'));
  t('Export: Ganztags-Aufgabe als VALUE=DATE', ics.includes('DTSTART;VALUE=DATE:' + compact(inSevenDays)));
  t('Export: Uhrzeit-Aufgabe mit Berlin-TZID', ics.includes('DTSTART;TZID=Europe/Berlin:' + compact(inSevenDays) + 'T143000'));
  t('Export: Komma im Titel escaped', ics.includes('Muster bestellen\\, dringend'));
  t('Export: stabile UID je Aufgabe', ics.includes('UID:task-abc@amzsellerhub.de'));
}

// ═══ 3) API auf pg-mem (Fetch gemockt) ═══
const mem = newDb();
const { Pool } = mem.adapters.createPg();
await initDb(new Pool());
const app = buildApi();
const srv = app.listen(0);
const base = 'http://127.0.0.1:' + srv.address().port;

const post = (path, body, token) => fetch(base + path, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
const del = (path, token) => fetch(base + path, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
const get = (path, token) => fetch(base + path, { headers: token ? { Authorization: 'Bearer ' + token } : {} });

config.registrationCode = 'test-code';
await post('/api/auth/register', { email: 'kal@test.de', password: 'passwort1', displayName: 'Kal', inviteCode: 'test-code' });
const tok = (await (await post('/api/auth/login', { email: 'kal@test.de', password: 'passwort1' })).json()).token;
t('Setup: Konto mit Token', !!tok);

// Gemockter Google-Server: zählt Abrufe, liefert SAMPLE_ICS
let fetchCount = 0;
setCalendarFetch(async (url) => {
  fetchCount++;
  if (String(url).includes('kaputt')) return new Response('nicht gefunden', { status: 404 });
  return new Response(SAMPLE_ICS, { status: 200, headers: { 'Content-Type': 'text/calendar' } });
});

// ── SSRF-Schutz ──
t('Feeds: http:// wird abgelehnt', (await post('/api/calendar/feeds', { url: 'http://calendar.google.com/x.ics' }, tok)).status === 400);
t('Feeds: localhost wird abgelehnt', (await post('/api/calendar/feeds', { url: 'https://localhost/x.ics' }, tok)).status === 400);
t('Feeds: interne IP wird abgelehnt', (await post('/api/calendar/feeds', { url: 'https://192.168.1.1/x.ics' }, tok)).status === 400);
t('Feeds: ohne Login 401', (await post('/api/calendar/feeds', { url: 'https://calendar.google.com/x.ics' })).status === 401);

// ── Feed anlegen + Erst-Sync ──
const addRes = await post('/api/calendar/feeds', { url: 'https://calendar.google.com/calendar/ical/GEHEIM/basic.ics', name: 'Privat', color: '#2563eb' }, tok);
const added = await addRes.json();
t('Feeds: Anlegen liefert 201 + Erst-Sync ok', addRes.status === 201 && added.firstSync && added.firstSync.ok === true, JSON.stringify(added.firstSync));
t('Feeds: URL wird nur maskiert zurückgegeben (Geheimnis!)', !JSON.stringify(added).includes('GEHEIM'));
const feedId = added.feed.id;

// ── Events im Fenster ──
{
  const r = await (await get('/api/calendar/events?from=' + day(0) + '&to=' + day(30), tok)).json();
  t('Events: Termine im Monatsfenster', Array.isArray(r.events) && r.events.some(e => e.title === 'Meeting mit Lieferant'), (r.events || []).length + ' Termine');
  t('Events: Feed-Farbe/-Name hängen dran', r.events.every(e => e.color && e.feedName === 'Privat'));
  t('Events: Serientermin expandiert', r.events.filter(e => e.title === 'Jour fixe').length >= 2);
}

// ── Lazy-Sync-TTL: frischer Feed wird NICHT erneut geholt ──
{
  const before = fetchCount;
  await get('/api/calendar/events?from=' + day(0) + '&to=' + day(30), tok);
  t('TTL: frischer Feed wird nicht erneut abgerufen', fetchCount === before, fetchCount + ' Abrufe');
  const r = await (await post('/api/calendar/feeds/' + feedId + '/sync', null, tok)).json();
  t('Sync-Button: erzwingt neuen Abruf', fetchCount === before + 1 && r.sync && r.sync.ok === true);
}

// ── Fehlerhafter Feed: sichtbarer last_error, kein Absturz ──
{
  const r = await (await post('/api/calendar/feeds', { url: 'https://example.com/kaputt.ics', name: 'Defekt' }, tok)).json();
  t('Fehler-Feed: Erst-Sync meldet Fehler', r.firstSync && r.firstSync.ok === false);
  const list = await (await get('/api/calendar/feeds', tok)).json();
  const def = list.feeds.find(f => f.name === 'Defekt');
  t('Fehler-Feed: lastError sichtbar in Feed-Liste', def && !!def.lastError, def && def.lastError);
  await del('/api/calendar/feeds/' + def.id, tok);
}

// ── Export: Abo-Link + öffentlicher ICS-Abruf ──
{
  // Aufgabe mit Fälligkeit anlegen (Inbox aus dem To-Do-Bootstrap)
  const boot = await (await get('/api/todo/bootstrap', tok)).json();
  const inbox = boot.lists.find(l => l.isInbox);
  await post('/api/todo/tasks', { listId: inbox.id, title: 'Zolltarif prüfen', dueDate: inSevenDays }, tok);

  const info = await (await get('/api/calendar/export', tok)).json();
  t('Export: Token + Pfad kommen', !!info.token && info.path.includes(info.token));
  const info2 = await (await get('/api/calendar/export', tok)).json();
  t('Export: Token ist stabil (kein Rotieren je Abruf)', info2.token === info.token);

  const icsRes = await get(info.path); // ohne Auth — Google kann keine Header setzen
  const icsText = await icsRes.text();
  t('Export: ICS ohne Login abrufbar (text/calendar)', icsRes.status === 200 && (icsRes.headers.get('content-type') || '').includes('text/calendar'));
  t('Export: offene Aufgabe mit Fälligkeit enthalten', icsText.includes('Zolltarif prüfen'));
  t('Export: falscher Token → 404', (await get('/api/calendar/export/falscher-token-123456/todo.ics')).status === 404);
}

// ── Feed-Limit (max. 5) ──
{
  for (let i = 0; i < 4; i++) await post('/api/calendar/feeds', { url: 'https://calendar.google.com/ical/n' + i + '/basic.ics', name: 'N' + i }, tok);
  const r = await post('/api/calendar/feeds', { url: 'https://calendar.google.com/ical/n99/basic.ics' }, tok);
  t('Limit: 6. Feed wird abgelehnt', r.status === 400);
}

// ── Feed löschen entfernt auch Termine ──
{
  await del('/api/calendar/feeds/' + feedId, tok);
  const r = await (await get('/api/calendar/events?from=' + day(0) + '&to=' + day(30), tok)).json();
  t('Löschen: Termine des Feeds verschwinden', !r.events.some(e => e.feedId === feedId));
  t('Löschen: fremde/unbekannte ID → 404', (await del('/api/calendar/feeds/' + feedId, tok)).status === 404);
}

setCalendarFetch(null);
srv.close();
console.log(`\nKalender: ${pass} bestanden, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);
