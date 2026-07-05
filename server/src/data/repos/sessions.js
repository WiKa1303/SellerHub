// ═══ Repository: Sessions (sessions) — opake Tokens, 30 Tage gleitend ═══
// Owner: services/auth. In der DB liegt NUR sha256(token) — nie der Klartext.
// pg-mem-Konvention: alle Zeitvergleiche mit JS-Datum als Parameter (kein SQL-interval).
import { db } from '../schema.js';

export async function createSession({ tokenHash, userId, expiresAt }) {
  await db().query(
    `INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1,$2,$3)`,
    [tokenHash, userId, expiresAt.toISOString()]);
}

/** Gültige Session inkl. Nutzer laden — oder null (abgelaufen/unbekannt). `now` kommt aus JS. */
export async function findValidSession(tokenHash, now) {
  const r = await db().query(
    `SELECT s.token_hash, s.user_id, s.expires_at, s.last_seen_at,
            u.email, u.display_name, u.role
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > $2`,
    [tokenHash, now.toISOString()]);
  return r.rows[0] || null;
}

/** Gleitendes Ablaufdatum: jede authentifizierte Nutzung verlängert die Session. */
export async function touchSession(tokenHash, lastSeenAt, expiresAt) {
  await db().query(
    `UPDATE sessions SET last_seen_at = $2, expires_at = $3 WHERE token_hash = $1`,
    [tokenHash, lastSeenAt.toISOString(), expiresAt.toISOString()]);
}

/** Session widerrufen (Logout). */
export async function deleteSession(tokenHash) {
  await db().query(`DELETE FROM sessions WHERE token_hash = $1`, [tokenHash]);
}

/** Anzahl aktiver (nicht abgelaufener) Sessions — read-only für /internal. */
export async function countActiveSessions(now) {
  const r = await db().query(`SELECT count(*) AS n FROM sessions WHERE expires_at > $1`,
    [now.toISOString()]);
  return parseInt(r.rows[0].n, 10);
}
