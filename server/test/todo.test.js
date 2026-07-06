// ═══ To-Do-Modul-Tests: Listen, Rollen, Aufgaben, Checklisten, Tags, Kommentare,
//     Anhänge, Erinnerungen, Activity, Filter, Bulk, Delta, Papierkorb, Wiederholung ═══
//   node test/todo.test.js
import { newDb } from 'pg-mem';
import { initDb } from '../src/data/db.js';
import { buildApi } from '../src/api/routes.js';
import { config } from '../src/core/config.js';
import { fireDueReminders, sanitizeHtml } from '../src/services/todo/index.js';
import { subscribe, publish } from '../src/services/todo/hub.js';

let pass = 0, fail = 0;
function t(name, cond, extra) {
  console.log((cond ? '✅' : '❌') + ' ' + name + (extra !== undefined ? ' → ' + extra : ''));
  cond ? pass++ : fail++;
}

// ── HTML-Sanitizer (kein DB-Bedarf) ──
t('Sanitizer: <script> wird entfernt', sanitizeHtml('<p>Hi<script>alert(1)</script></p>') === '<p>Hi</p>' || !sanitizeHtml('<p>Hi<script>alert(1)</script></p>').includes('<script>'));
t('Sanitizer: onclick-Attribut fällt weg', !sanitizeHtml('<b onclick="x()">fett</b>').includes('onclick'));
t('Sanitizer: javascript:-Link wird entschärft', !sanitizeHtml('<a href="javascript:alert(1)">x</a>').includes('javascript:'));
t('Sanitizer: https-Link bleibt (mit rel=noopener)', sanitizeHtml('<a href="https://amzsellerhub.de">x</a>').includes('href="https://amzsellerhub.de"'));
t('Sanitizer: erlaubte Formatierung bleibt', sanitizeHtml('<ul><li><strong>a</strong></li></ul>') === '<ul><li><strong>a</strong></li></ul>');

// ── API auf pg-mem booten ──
const mem = newDb();
const { Pool } = mem.adapters.createPg();
await initDb(new Pool());
const app = buildApi();
const srv = app.listen(0);
const base = 'http://127.0.0.1:' + srv.address().port;

const req = (method) => (path, body, token) => fetch(base + path, {
  method,
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
  ...(body !== undefined && body !== null ? { body: JSON.stringify(body) } : {}),
});
const post = req('POST'), put = req('PUT'), del = req('DELETE');
const get = (path, token) => fetch(base + path, { headers: token ? { Authorization: 'Bearer ' + token } : {} });

// ── Zwei Konten anlegen (Anna = Besitzerin, Ben = Gast) ──
config.registrationCode = 'test-code';
await post('/api/auth/register', { email: 'anna@test.de', password: 'passwort1', displayName: 'Anna', inviteCode: 'test-code' });
await post('/api/auth/register', { email: 'ben@test.de', password: 'passwort1', displayName: 'Ben', inviteCode: 'test-code' });
const anna = (await (await post('/api/auth/login', { email: 'anna@test.de', password: 'passwort1' })).json()).token;
const ben = (await (await post('/api/auth/login', { email: 'ben@test.de', password: 'passwort1' })).json()).token;
const benId = (await (await get('/api/auth/me', ben)).json()).user.id;
t('Setup: zwei Konten mit Token', !!anna && !!ben);

// ── Bootstrap: Eingang wird automatisch angelegt ──
let r = await get('/api/todo/bootstrap', anna);
let boot = await r.json();
t('Bootstrap: 200 + Eingang angelegt', r.status === 200 && !!boot.inboxId);
t('Bootstrap: Eingang ist einzige Liste, Rolle owner', boot.lists.length === 1 && boot.lists[0].role === 'owner' && boot.lists[0].isInbox === true);
r = await get('/api/todo/bootstrap', anna);
t('Bootstrap: idempotent (kein zweiter Eingang)', (await r.json()).lists.length === 1);
t('Bootstrap: ohne Token → 401', (await get('/api/todo/bootstrap')).status === 401);
const inboxId = boot.inboxId;

// ── Ordner + Listen ──
r = await post('/api/todo/folders', { name: 'Arbeit' }, anna);
const folder = (await r.json()).folder;
t('Ordner anlegen → 201', r.status === 201 && folder.name === 'Arbeit');
r = await post('/api/todo/lists', { name: 'Projekt X', folderId: folder.id, color: '#d97706', icon: '🚀' }, anna);
const list = (await r.json()).list;
t('Liste anlegen → 201', r.status === 201 && list.name === 'Projekt X');
r = await put(`/api/todo/lists/${list.id}`, { name: 'Projekt Xy' }, anna);
t('Liste umbenennen (owner) → 200', r.status === 200);
t('Liste anlegen ohne Namen → 400', (await post('/api/todo/lists', { name: ' ' }, anna)).status === 400);
t('Eingang löschen → 400', (await del(`/api/todo/lists/${inboxId}`, null, anna)).status === 400);

// ── Mitglieder & Rollen ──
t('Fremde Liste: Ben sieht keine Mitglieder → 404', (await get(`/api/todo/lists/${list.id}/members`, ben)).status === 404);
r = await post(`/api/todo/lists/${list.id}/members`, { email: 'ben@test.de', role: 'commenter' }, anna);
t('Einladen per E-Mail → 201', r.status === 201, JSON.stringify((await r.json()).member || ''));
t('Doppelt einladen → 409', (await post(`/api/todo/lists/${list.id}/members`, { email: 'ben@test.de', role: 'editor' }, anna)).status === 409);
t('Unbekannte E-Mail → 404', (await post(`/api/todo/lists/${list.id}/members`, { email: 'nix@test.de', role: 'viewer' }, anna)).status === 404);
t('Eingang teilen → 400', (await post(`/api/todo/lists/${inboxId}/members`, { email: 'ben@test.de', role: 'viewer' }, anna)).status === 400);
r = await get('/api/todo/bootstrap', ben);
boot = await r.json();
t('Geteilte Liste taucht bei Ben auf (Rolle commenter)', boot.lists.some(l => l.id === list.id && l.role === 'commenter'));
t('Ben (commenter) darf Liste nicht umbenennen → 403', (await put(`/api/todo/lists/${list.id}`, { name: 'Hack' }, ben)).status === 403);

// ── Aufgaben: CRUD + Rechte ──
r = await post('/api/todo/tasks', { listId: list.id, title: '  Erste Aufgabe  ', priority: 'hoch', dueDate: '2026-07-10', description: '<p>Hallo<script>x</script></p>' }, anna);
const task1 = (await r.json()).task;
t('Task anlegen → 201, Titel getrimmt', r.status === 201 && task1.title === 'Erste Aufgabe');
t('Task: Priorität übernommen', task1.priority === 'hoch');
t('Task: Beschreibung sanitisiert', !String(task1.description).includes('script'));
t('Task ohne Titel → 400', (await post('/api/todo/tasks', { listId: list.id, title: '' }, anna)).status === 400);
t('Task mit kaputtem Datum → 400', (await post('/api/todo/tasks', { listId: list.id, title: 'x', dueDate: '10.07.2026' }, anna)).status === 400);
t('Task mit ungültiger Priorität → 400', (await post('/api/todo/tasks', { listId: list.id, title: 'x', priority: 'mega' }, anna)).status === 400);
t('Ben (commenter) darf keine Task anlegen → 403', (await post('/api/todo/tasks', { listId: list.id, title: 'Bens Task' }, ben)).status === 403);

r = await put(`/api/todo/tasks/${task1.id}`, { title: 'Erste Aufgabe v2', starred: true, status: 'in_arbeit' }, anna);
const upd = (await r.json()).task;
t('Task bearbeiten → 200 (Titel, Stern, Status)', r.status === 200 && upd.title === 'Erste Aufgabe v2' && upd.starred === true && upd.status === 'in_arbeit');
t('Zuweisung an Nicht-Mitglied → 400', (await put(`/api/todo/tasks/${task1.id}`, { assignedTo: '00000000-0000-0000-0000-000000000000' }, anna)).status === 400);
r = await put(`/api/todo/tasks/${task1.id}`, { assignedTo: benId }, anna);
t('Zuweisung an Mitglied Ben → 200', r.status === 200);

// ── Subtasks ──
r = await post('/api/todo/tasks', { listId: list.id, title: 'Unteraufgabe', parentId: task1.id }, anna);
const sub = (await r.json()).task;
t('Subtask anlegen → 201', r.status === 201 && sub.parentId === task1.id);
t('Subtask von Subtask → 400', (await post('/api/todo/tasks', { listId: list.id, title: 'x', parentId: sub.id })).status === 401 ? (await post('/api/todo/tasks', { listId: list.id, title: 'x', parentId: sub.id }, anna)).status === 400 : false);

// ── Checkliste ──
r = await post(`/api/todo/tasks/${task1.id}/checklist`, { title: 'Punkt 1' }, anna);
const check1 = (await r.json()).item;
t('Checklisten-Punkt anlegen → 201', r.status === 201);
await post(`/api/todo/tasks/${task1.id}/checklist`, { title: 'Punkt 2', position: 2 }, anna);
r = await put(`/api/todo/checklist/${check1.id}`, { done: true }, anna);
t('Checklisten-Punkt abhaken → 200', r.status === 200);

// ── Tags ──
r = await post('/api/todo/tags', { name: 'Dringend', color: '#dc2626' }, anna);
const tag = (await r.json()).tag;
t('Tag anlegen → 201', r.status === 201);
t('Tag doppelt (case-insensitiv) → 409', (await post('/api/todo/tags', { name: 'dringend' }, anna)).status === 409);
t('Tag an Task hängen → 200', (await post(`/api/todo/tasks/${task1.id}/tags/${tag.id}`, null, anna)).status === 200);

// ── Detail-Ansicht bündelt alles ──
r = await get(`/api/todo/tasks/${task1.id}`, anna);
const detail = await r.json();
t('Detail: Subtasks + Checkliste + Tags enthalten',
  detail.subtasks.length === 1 && detail.checklist.length === 2 && detail.task.tags.length === 1,
  `sub=${detail.subtasks.length} check=${detail.checklist.length} tags=${detail.task.tags.length}`);
t('Detail: myRole = owner', detail.myRole === 'owner');
t('Detail: Checklisten-Fortschritt in Task-DTO', detail.task.checklist.done === 1 && detail.task.checklist.total === 2);

// ── Kommentare (commenter darf, viewer nicht; nur eigene editierbar) ──
r = await post(`/api/todo/tasks/${task1.id}/comments`, { body: 'Guter Punkt!' }, ben);
const comment = (await r.json()).comment;
t('Ben (commenter) darf kommentieren → 201', r.status === 201);
t('Anna darf Bens Kommentar nicht bearbeiten → 404', (await put(`/api/todo/comments/${comment.id}`, { body: 'geändert' }, anna)).status === 404);
t('Ben bearbeitet eigenen Kommentar → 200', (await put(`/api/todo/comments/${comment.id}`, { body: 'Sehr guter Punkt!' }, ben)).status === 200);
await put(`/api/todo/lists/${list.id}/members/${benId}`, { role: 'viewer' }, anna);
t('Ben (jetzt viewer) darf NICHT mehr kommentieren → 403', (await post(`/api/todo/tasks/${task1.id}/comments`, { body: 'x' }, ben)).status === 403);
await put(`/api/todo/lists/${list.id}/members/${benId}`, { role: 'editor' }, anna);

// ── Anhänge ──
const smallFile = Buffer.from('Hallo SellerHub!').toString('base64');
r = await post(`/api/todo/tasks/${task1.id}/attachments`, { filename: 'notiz.txt', mime: 'text/plain', dataBase64: smallFile }, anna);
const att = (await r.json()).attachment;
t('Anhang hochladen → 201', r.status === 201 && att.filename === 'notiz.txt');
r = await get(`/api/todo/attachments/${att.id}`, anna);
t('Anhang herunterladen → 200 + Inhalt stimmt', r.status === 200 && (await r.text()) === 'Hallo SellerHub!');
const bigFile = Buffer.alloc(5 * 1024 * 1024 + 100, 65).toString('base64');
t('Anhang > 5 MB → 413', (await post(`/api/todo/tasks/${task1.id}/attachments`, { filename: 'gross.bin', mime: 'application/octet-stream', dataBase64: bigFile }, anna)).status === 413);

// ── Erinnerungen + Worker-Feuerung ──
r = await post(`/api/todo/tasks/${task1.id}/reminders`, { remindAt: new Date(Date.now() - 60000).toISOString() }, anna);
t('Erinnerung anlegen → 201', r.status === 201);
const sseGot = [];
const fakeRes = { write: (s) => sseGot.push(s) };
const unsub = subscribe((await (await get('/api/auth/me', anna)).json()).user.id, fakeRes);
const fired = await fireDueReminders();
t('Worker feuert fällige Erinnerung (genau 1)', fired === 1);
t('SSE: Reminder-Event kam an', sseGot.some(s => s.includes('"type":"reminder"')));
t('Worker: zweiter Lauf feuert nichts (fired_at gesetzt)', (await fireDueReminders()) === 0);
r = await get('/api/todo/notifications?unread=true', anna);
const notifs = await r.json();
t('Notification wurde angelegt', notifs.items.some(n => n.type === 'reminder'));
await post('/api/todo/notifications/read', null, anna);
r = await get('/api/todo/notifications?unread=true', anna);
t('Notifications als gelesen markiert', (await r.json()).items.length === 0);
unsub();

// ── SSE-Hub direkt: publish erreicht nur Abonnenten ──
const got2 = [];
const unsub2 = subscribe('user-x', { write: (s) => got2.push(s) });
publish(['user-x', 'user-y'], { type: 'test' });
t('Hub: Abonnent bekommt Event', got2.length === 1);
unsub2();
publish(['user-x'], { type: 'test2' });
t('Hub: nach Abmeldung kein Event mehr', got2.length === 1);

// ── Smart-List-Abfragen: heute fällig, markiert, zugewiesen, Suche ──
await post('/api/todo/tasks', { listId: inboxId, title: 'Inbox-Task heute', dueDate: new Date().toISOString().slice(0, 10) }, anna);
r = await get(`/api/todo/tasks?dueTo=${new Date().toISOString().slice(0, 10)}&hasDue=true&completed=false`, anna);
t('Smart-List „Heute": fällige Task gefunden', (await r.json()).tasks.some(x => x.title === 'Inbox-Task heute'));
r = await get('/api/todo/tasks?starred=true', anna);
t('Smart-List „Markiert": Stern-Task gefunden', (await r.json()).tasks.some(x => x.id === task1.id));
r = await get('/api/todo/tasks?assigned=me', ben);
t('Smart-List „Mir zugewiesen" (Ben)', (await r.json()).tasks.some(x => x.id === task1.id));
r = await get('/api/todo/tasks?search=erste', anna);
t('Suche (case-insensitiv, Teilstring)', (await r.json()).tasks.some(x => x.id === task1.id));
r = await get(`/api/todo/tasks?tag=${tag.id}`, anna);
t('Filter nach Tag', (await r.json()).tasks.some(x => x.id === task1.id));
r = await get('/api/todo/tasks?priority=hoch', anna);
t('Filter nach Priorität', (await r.json()).tasks.some(x => x.id === task1.id));

// ── Delta-Sync (since) ──
const cutoff = new Date(Date.now() + 5000).toISOString(); // nach allem Bisherigen
await new Promise(res => setTimeout(res, 10));
r = await get(`/api/todo/tasks?since=${encodeURIComponent(cutoff)}`, anna);
t('Delta: nichts neuer als cutoff', (await r.json()).tasks.length === 0);

// ── Bulk-Aktionen ──
const t2 = (await (await post('/api/todo/tasks', { listId: list.id, title: 'Bulk A' }, anna)).json()).task;
const t3 = (await (await post('/api/todo/tasks', { listId: list.id, title: 'Bulk B' }, anna)).json()).task;
r = await post('/api/todo/tasks/bulk', { ids: [t2.id, t3.id], action: 'complete' }, anna);
let bulk = await r.json();
t('Bulk complete: beide ok', bulk.ok.length === 2 && bulk.failed.length === 0);
r = await post('/api/todo/tasks/bulk', { ids: [t2.id, t3.id], action: 'patch', patch: { priority: 'niedrig' } }, anna);
bulk = await r.json();
t('Bulk patch: beide ok', bulk.ok.length === 2);
t('Bulk ohne ids → 400', (await post('/api/todo/tasks/bulk', { action: 'complete' }, anna)).status === 400);

// ── Papierkorb: löschen → restore → endgültig ──
r = await del(`/api/todo/tasks/${t2.id}`, null, anna);
t('Task löschen (soft) → 200', r.status === 200);
r = await get(`/api/todo/tasks?listId=${list.id}&completed=true`, anna);
t('Gelöschte Task nicht mehr in der Liste', !(await r.json()).tasks.some(x => x.id === t2.id));
r = await get(`/api/todo/tasks?listId=${list.id}&trash=true`, anna);
t('Papierkorb zeigt gelöschte Task', (await r.json()).tasks.some(x => x.id === t2.id));
r = await post(`/api/todo/tasks/${t2.id}/restore`, null, anna);
t('Restore → 200', r.status === 200);
r = await del(`/api/todo/tasks/${t3.id}`, null, anna);
r = await del(`/api/todo/tasks/${t3.id}/purge`, null, anna);
t('Endgültig löschen → 200', r.status === 200);
t('Endgültig gelöschte Task → 404', (await get(`/api/todo/tasks/${t3.id}`, anna)).status === 404);

// ── Bulk im Papierkorb: markierte endgültig löschen ──
const tp1 = (await (await post('/api/todo/tasks', { listId: list.id, title: 'Trash A' }, anna)).json()).task;
const tp2 = (await (await post('/api/todo/tasks', { listId: list.id, title: 'Trash B' }, anna)).json()).task;
await post('/api/todo/tasks/bulk', { ids: [tp1.id, tp2.id], action: 'delete' }, anna);
r = await post('/api/todo/tasks/bulk', { ids: [tp1.id, tp2.id], action: 'purge' }, anna);
bulk = await r.json();
t('Bulk purge im Papierkorb: beide ok', bulk.ok.length === 2 && bulk.failed.length === 0, JSON.stringify(bulk));
t('Bulk purge: Tasks unwiderruflich weg', (await get(`/api/todo/tasks/${tp1.id}`, anna)).status === 404 && (await get(`/api/todo/tasks/${tp2.id}`, anna)).status === 404);
r = await get(`/api/todo/tasks?listId=${list.id}&trash=true`, anna);
t('Bulk purge: Papierkorb enthält sie nicht mehr', !(await r.json()).tasks.some(x => x.id === tp1.id || x.id === tp2.id));

// ── Wiederholung: Erledigen erzeugt nächste Instanz ──
r = await post('/api/todo/tasks', { listId: list.id, title: 'Wöchentlicher Report', dueDate: '2026-07-06', repeatRule: { mode: 'fixed', every: 1, unit: 'week' } }, anna);
const rep = (await r.json()).task;
r = await put(`/api/todo/tasks/${rep.id}`, { completed: true }, anna);
const repDone = await r.json();
t('Wiederholung: spawnedTaskId gesetzt', !!repDone.spawnedTaskId);
r = await get(`/api/todo/tasks/${repDone.spawnedTaskId}`, anna);
const spawned = await r.json();
t('Wiederholung: neue Instanz +7 Tage', spawned.task.dueDate === '2026-07-13', spawned.task.dueDate);
t('Wiederholung: neue Instanz offen', spawned.task.completed === false);

// ── Listen-Wechsel (move) ──
r = await put(`/api/todo/tasks/${task1.id}`, { listId: inboxId }, anna);
t('Task in andere Liste verschieben → 200', r.status === 200 && (await r.json()).task.listId === inboxId);
r = await get(`/api/todo/tasks/${sub.id}`, anna);
t('Subtask wandert mit', (await r.json()).task.listId === inboxId);

// ── Activity-Log ──
r = await get(`/api/todo/activity?list=${list.id}`, anna);
const act = await r.json();
t('Activity: Einträge vorhanden (created/completed/…)', r.status === 200 && act.items.length >= 3, act.items.length);
t('Activity: Verfasser aufgelöst', act.items.every(a => !!a.by));

// ── Gespeicherte Filter ──
r = await post('/api/todo/filters', { name: 'Hohe Prio offen', filter: { priority: 'hoch', completed: false } }, anna);
const sf = (await r.json()).filter;
t('Filter speichern → 201', r.status === 201);
r = await get('/api/todo/bootstrap', anna);
t('Filter im Bootstrap enthalten', (await r.json()).savedFilters.some(f => f.id === sf.id));
t('Filter löschen → 200', (await del(`/api/todo/filters/${sf.id}`, null, anna)).status === 200);

// ── Mitglied entfernen / Liste löschen ──
t('Ben verlässt die Liste selbst → 200', (await del(`/api/todo/lists/${list.id}/members/${benId}`, null, ben)).status === 200);
r = await get('/api/todo/bootstrap', ben);
t('Liste ist bei Ben weg', !(await r.json()).lists.some(l => l.id === list.id));
t('Liste löschen (owner) → 200', (await del(`/api/todo/lists/${list.id}`, null, anna)).status === 200);
r = await get('/api/todo/bootstrap', anna);
t('Gelöschte Liste weg, Eingang bleibt', (await r.json()).lists.every(l => l.id !== list.id));
t('Ordner löschen → 200', (await del(`/api/todo/folders/${folder.id}`, null, anna)).status === 200);

srv.close();
console.log(`\n${pass} bestanden, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);
