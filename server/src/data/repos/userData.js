// ═══ Repository: Daten-Sync (user_data) — Key-Value-Spiegel der localStorage-Keys ═══
// Owner: services/sync. Optimistic Locking über `version`: der Client schickt seine
// baseVersion mit; stimmt sie nicht mit dem Server-Stand überein, gibt upsertUserData
// die Konfliktinfo (Server-Stand) zurück, ohne zu schreiben.
import { db } from '../schema.js';

/** Alle Sync-Einträge eines Users ({key, value, updated_at, version}). */
export async function listUserData(userId) {
  const r = await db().query(
    `SELECT key, value, updated_at, version FROM user_data WHERE user_id = $1 ORDER BY key`,
    [userId]);
  return r.rows;
}

/**
 * Upsert eines Keys mit Versions-Check (Optimistic Locking).
 * @param {string} jsonValue bereits serialisiertes JSON (der Service misst daran die Größe)
 * @returns {{conflict:false, version:number}} bei Erfolg,
 *          {{conflict:true, server:{key,value,version,updated_at}}} bei Versions-Konflikt.
 */
export async function upsertUserData(userId, key, jsonValue, baseVersion, sizeBytes) {
  const now = new Date().toISOString();
  const cur = await db().query(
    `SELECT value, version, updated_at FROM user_data WHERE user_id = $1 AND key = $2`,
    [userId, key]);

  if (cur.rows[0]) {
    const row = cur.rows[0];
    if ((baseVersion ?? 0) !== row.version) {
      return { conflict: true, server: { key, value: row.value, version: row.version, updated_at: row.updated_at } };
    }
    const next = row.version + 1;
    await db().query(
      `UPDATE user_data SET value = $3, version = $4, size_bytes = $5, updated_at = $6
       WHERE user_id = $1 AND key = $2`,
      [userId, key, jsonValue, next, sizeBytes, now]);
    return { conflict: false, version: next };
  }

  try {
    await db().query(
      `INSERT INTO user_data (user_id, key, value, version, size_bytes, updated_at)
       VALUES ($1,$2,$3,1,$4,$5)`,
      [userId, key, jsonValue, sizeBytes, now]);
    return { conflict: false, version: 1 };
  } catch (e) {
    if (e.code !== '23505') throw e; // Rennen zweier Geräte: PK-Kollision → als Konflikt melden
    const fresh = await db().query(
      `SELECT value, version, updated_at FROM user_data WHERE user_id = $1 AND key = $2`,
      [userId, key]);
    const row = fresh.rows[0];
    return { conflict: true, server: { key, value: row.value, version: row.version, updated_at: row.updated_at } };
  }
}

/** Größensumme aller Werte eines Users in Bytes (Limit-Prüfung: Summe ≤ 10 MB). */
export async function userDataTotalSize(userId) {
  const r = await db().query(
    `SELECT COALESCE(SUM(size_bytes), 0) AS total FROM user_data WHERE user_id = $1`,
    [userId]);
  return parseInt(r.rows[0].total, 10);
}

/** Größe je Key ([{key, size_bytes}]) — für die Limit-Rechnung bei ersetzten Keys. */
export async function userDataSizes(userId) {
  const r = await db().query(
    `SELECT key, size_bytes FROM user_data WHERE user_id = $1`, [userId]);
  return r.rows;
}
