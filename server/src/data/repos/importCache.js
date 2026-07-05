// ═══ Repository: Amazon-Import-Cache (import_cache) — KONZEPT-Import-Listing.md, Modul 3 ═══
// Owner: services/import. 1 Zeile je ASIN+Marktplatz (PK), Upsert per ON CONFLICT.
// Die Frische-Grenze (24 h) kommt als JS-Datum aus dem Service — pg-mem-Konvention:
// keine SQL-Datums-Arithmetik (kein now() - interval in Queries).
import { db } from '../schema.js';

/**
 * Cache-Treffer holen, falls frischer als `freshSince` (JS-Datum).
 * @returns {{data:object, fetched_at:Date}|null}
 */
export async function getCached(asin, marketplace, freshSince) {
  const r = await db().query(
    `SELECT data, fetched_at FROM import_cache
     WHERE asin = $1 AND marketplace = $2 AND fetched_at > $3`,
    [asin, marketplace, freshSince]);
  if (!r.rows[0]) return null;
  const row = r.rows[0];
  // pg liefert jsonb als Objekt; falls ein Treiber Strings liefert, defensiv parsen
  return { data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data, fetched_at: row.fetched_at };
}

/** Upsert eines geparsten Produkts (idempotent: erneuter Import überschreibt die Zeile). */
export async function saveCache(asin, marketplace, data) {
  await db().query(
    `INSERT INTO import_cache (asin, marketplace, data, fetched_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (asin, marketplace) DO UPDATE SET data = $3, fetched_at = $4`,
    [asin, marketplace, JSON.stringify(data), new Date()]);
}

/** Anzahl gecachter Produkte (für /internal). */
export async function importCacheCount() {
  const r = await db().query(`SELECT count(*) AS n FROM import_cache`);
  return parseInt(r.rows[0].n, 10);
}
