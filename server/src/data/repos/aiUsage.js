// ═══ Repository: Tages-Kontingente (ai_usage) — KI-Proxy (Modul 2) + Amazon-Import (Modul 3) ═══
// Owner: services/ai-proxy + services/import. 1 Zeile je Nutzer und Tag (PK user_id+day),
// Increment idempotent per ON CONFLICT UPDATE. Datumsgrenzen kommen als YYYY-MM-DD aus JS
// (pg-mem-Konvention: keine SQL-Datums-Arithmetik wie CURRENT_DATE/interval).
import { db } from '../schema.js';

// Zähler-Arten → Spalten (generisch: neue Kontingente = 1 Eintrag hier + additive Spalte)
const USAGE_COLS = { text: 'text_calls', image: 'image_calls', import: 'import_calls' };
const EMPTY_USAGE = { text_calls: 0, image_calls: 0, import_calls: 0 };

/** Heutiger Tag als YYYY-MM-DD in Server-Lokalzeit (TZ=Europe/Berlin empfohlen, s. .env.example). */
export function todayKey(d = new Date()) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/**
 * Zähler-Increment (art: 'text' | 'image' | 'import') mit Rückgabe der NEUEN Zähler.
 * Upsert + Select statt RETURNING-on-conflict — pg-mem-kompatibel und genauso idempotent.
 * @returns {{text_calls:number, image_calls:number, import_calls:number}}
 */
export async function incrementUsage(userId, day, art) {
  const col = USAGE_COLS[art] || USAGE_COLS.text;
  await db().query(
    `INSERT INTO ai_usage (user_id, day, text_calls, image_calls, import_calls)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, day) DO UPDATE SET ${col} = ai_usage.${col} + 1`,
    [userId, day, col === 'text_calls' ? 1 : 0, col === 'image_calls' ? 1 : 0, col === 'import_calls' ? 1 : 0]);
  return getUsage(userId, day);
}

/** Zählerstand eines Nutzers für einen Tag (alles 0, wenn noch keine Zeile existiert). */
export async function getUsage(userId, day) {
  const r = await db().query(
    `SELECT text_calls, image_calls, import_calls FROM ai_usage WHERE user_id = $1 AND day = $2`,
    [userId, day]);
  // import_calls kann bei Alt-Zeilen aus der Zeit vor der additiven Migration NULL sein
  return r.rows[0] ? { ...r.rows[0], import_calls: r.rows[0].import_calls ?? 0 } : { ...EMPTY_USAGE };
}

/** Heutige Nutzung je Nutzer (für /internal): [{email, text_calls, image_calls, import_calls}]. */
export async function usageToday(day = todayKey()) {
  const r = await db().query(
    `SELECT u.email, a.text_calls, a.image_calls, a.import_calls
     FROM ai_usage a JOIN users u ON u.id = a.user_id
     WHERE a.day = $1 ORDER BY u.email`,
    [day]);
  return r.rows;
}
