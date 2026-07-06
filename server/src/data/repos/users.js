// ═══ Repository: Konten (users) — KONZEPT-Konten-Sync.md, Modul 1 ═══
// Owner: services/auth. E-Mail liegt IMMER lowercase in der DB (der Service normalisiert,
// das Repo verlässt sich darauf — eine Wahrheit, ein Ort).
import { db } from '../schema.js';

const USER_COLS = `id, email, password_hash, display_name, role, created_at, last_login_at`;

/** Konto anlegen. Wirft bei doppelter E-Mail (unique_violation 23505) — der Service fängt das. */
export async function createUser({ id, email, passwordHash, displayName, role = 'user' }) {
  await db().query(
    `INSERT INTO users (id, email, password_hash, display_name, role)
     VALUES ($1,$2,$3,$4,$5)`,
    [id, email, passwordHash, displayName || null, role]);
  const r = await db().query(`SELECT ${USER_COLS} FROM users WHERE id = $1`, [id]);
  return r.rows[0];
}

export async function findByEmail(email) {
  const r = await db().query(`SELECT ${USER_COLS} FROM users WHERE email = $1`, [email]);
  return r.rows[0] || null;
}

export async function updateLastLogin(id) {
  await db().query(`UPDATE users SET last_login_at = $2 WHERE id = $1`,
    [id, new Date().toISOString()]);
}

export async function updatePassword(id, passwordHash) {
  await db().query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [id, passwordHash]);
}

// ── Nutzer-Admin (Modul 4) ──

export async function findById(id) {
  const r = await db().query(`SELECT ${USER_COLS} FROM users WHERE id = $1`, [id]);
  return r.rows[0] || null;
}

/** Alle Konten, neueste zuerst — password_hash bleibt im Repo (Service gibt publicUser raus). */
export async function listUsers() {
  const r = await db().query(`SELECT ${USER_COLS} FROM users ORDER BY created_at DESC`);
  return r.rows;
}

/** Rolle setzen ('user' | 'admin' — der Service validiert). Liefert true bei Treffer. */
export async function updateRole(id, role) {
  const r = await db().query(`UPDATE users SET role = $2 WHERE id = $1`, [id, role]);
  return (r.rowCount || 0) > 0;
}
