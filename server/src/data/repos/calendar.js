// ═══ REPO: Kalender-Sync (calendar_*-Tabellen) ═══
// EINZIGE SQL-Stelle des Kalender-Moduls. Validierung/Fetch passiert im Service
// (services/calendar/) — hier nur Queries. pg-mem-Konventionen: IDs/Zeitstempel
// aus JS, keine SQL-Datums-Arithmetik, nur einfache Features.
import { db } from '../schema.js';

// ═══ Feeds (abonnierte externe Kalender) ═══

export async function insertCalendarFeed(f) {
  await db().query(
    `INSERT INTO calendar_feeds (id, user_id, url, name, color) VALUES ($1,$2,$3,$4,$5)`,
    [f.id, f.userId, f.url, f.name, f.color || null]);
}

export async function listCalendarFeeds(userId) {
  const r = await db().query(
    `SELECT id, url, name, color, last_sync, last_error, created_at
       FROM calendar_feeds WHERE user_id = $1 ORDER BY created_at`, [userId]);
  return r.rows;
}

export async function getCalendarFeed(id, userId) {
  const r = await db().query(
    `SELECT id, user_id, url, name, color, last_sync, last_error
       FROM calendar_feeds WHERE id = $1 AND user_id = $2`, [id, userId]);
  return r.rows[0] || null;
}

export async function deleteCalendarFeed(id, userId) {
  const r = await db().query(
    `DELETE FROM calendar_feeds WHERE id = $1 AND user_id = $2`, [id, userId]);
  return r.rowCount === 1;
}

export async function countCalendarFeeds(userId) {
  const r = await db().query(
    `SELECT COUNT(*)::int AS n FROM calendar_feeds WHERE user_id = $1`, [userId]);
  return r.rows[0].n;
}

// Sync-Ergebnis vermerken: ok → Zeitstempel setzen, Fehler-Text löschen (und umgekehrt).
export async function markCalendarFeedSync(id, { ok, error, now }) {
  await db().query(
    `UPDATE calendar_feeds SET last_sync = $2, last_error = $3 WHERE id = $1`,
    [id, ok ? now : null, ok ? null : String(error || 'Unbekannter Fehler').slice(0, 300)]);
}

// ═══ Events (Cache je Feed, bei jedem Sync ersetzt) ═══

export async function replaceCalendarEvents(feedId, events) {
  await db().query(`DELETE FROM calendar_events WHERE feed_id = $1`, [feedId]);
  // Dubletten (gleiche uid) vorab entfernen, dann Batch-Insert in Blöcken:
  // 500 Events = 501 Einzelqueries wären unnötige Roundtrips zur Managed-DB.
  const seen = new Set();
  const rows = events.filter(e => !seen.has(e.uid) && seen.add(e.uid));
  const CHUNK = 100;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const params = [];
    const values = chunk.map((e, j) => {
      params.push(feedId, e.uid, e.title, e.location || null, e.startDay, e.endDay,
        e.startTs || null, e.endTs || null, !!e.allDay);
      const o = j * 9;
      return `($${o + 1},$${o + 2},$${o + 3},$${o + 4},$${o + 5},$${o + 6},$${o + 7},$${o + 8},$${o + 9})`;
    }).join(',');
    await db().query(
      `INSERT INTO calendar_events (feed_id, uid, title, location, start_day, end_day, start_ts, end_ts, all_day)
       VALUES ${values}`, params);
  }
}

// Termine aller Feeds eines Nutzers im Fenster [fromDay, toDay] (inklusive; 'YYYY-MM-DD').
export async function queryCalendarEvents(userId, fromDay, toDay) {
  const r = await db().query(
    `SELECT e.feed_id, e.uid, e.title, e.location, e.start_day, e.end_day,
            e.start_ts, e.end_ts, e.all_day, f.name AS feed_name, f.color AS feed_color
       FROM calendar_events e
       JOIN calendar_feeds f ON f.id = e.feed_id
      WHERE f.user_id = $1 AND e.start_day <= $3 AND e.end_day >= $2
      ORDER BY e.start_day, e.start_ts`, [userId, fromDay, toDay]);
  return r.rows;
}

// ═══ Export-Token (SellerHub-Aufgaben → Google-Abo) ═══

export async function getCalendarExportToken(userId) {
  const r = await db().query(
    `SELECT export_token FROM calendar_settings WHERE user_id = $1`, [userId]);
  return r.rows[0] ? r.rows[0].export_token : null;
}

export async function insertCalendarExportToken(userId, token) {
  await db().query(
    `INSERT INTO calendar_settings (user_id, export_token) VALUES ($1,$2)
     ON CONFLICT (user_id) DO NOTHING`, [userId, token]);
}

export async function userIdByExportToken(token) {
  const r = await db().query(
    `SELECT user_id FROM calendar_settings WHERE export_token = $1`, [token]);
  return r.rows[0] ? r.rows[0].user_id : null;
}

// Offene Aufgaben MIT Fälligkeit für den ICS-Export (alle Listen, in denen der
// Nutzer Mitglied ist — gleiche Sichtbarkeit wie im To-Do-Modul).
export async function queryTasksForIcsExport(userId, limit = 500) {
  const r = await db().query(
    `SELECT t.id, t.title, t.due_date, t.due_time, l.name AS list_name
       FROM todo_tasks t
       JOIN todo_list_members m ON m.list_id = t.list_id AND m.user_id = $1
       JOIN todo_lists l ON l.id = t.list_id
      WHERE t.completed = false AND t.deleted_at IS NULL AND t.due_date IS NOT NULL
      ORDER BY t.due_date LIMIT $2`, [userId, limit]);
  return r.rows;
}
