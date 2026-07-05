// ═══ SYNC-SERVICE: Daten-Sync je Konto (KONZEPT-Konten-Sync.md, Modul 1) ═══
// Key-Value-Spiegel der localStorage-Keys. Konfliktmodell: Optimistic Locking auf
// Key-Ebene (baseVersion) — konfliktfreie Keys werden angewendet, Konflikt-Keys
// werden NICHT geschrieben und mit dem Server-Stand zurückgemeldet (der Client
// übernimmt sie sichtbar, last-write-wins laut Konzept).
import { listUserData, upsertUserData, userDataTotalSize, userDataSizes } from '../../data/db.js';

// Größenlimits laut Konzept — ehrliche Fehler (413), kein stilles Abschneiden.
export const MAX_VALUE_BYTES = 512 * 1024;        // je Wert
export const MAX_TOTAL_BYTES = 10 * 1024 * 1024;  // Summe je User
const MAX_KEY_LENGTH = 200;

/** Alle Sync-Einträge eines Users. */
export async function listSyncData(userId) {
  return listUserData(userId);
}

/**
 * Batch-Upsert: {items:[{key, value, baseVersion}]}.
 * @returns {status, error?} bei Ablehnung (400/413) ·
 *          {status:409, conflicts, applied} bei Versions-Konflikt (inkl. Server-Stand) ·
 *          {status:200, items:[{key, version}]} bei Erfolg.
 */
export async function applySyncBatch(userId, items) {
  if (!Array.isArray(items) || items.length === 0) {
    return { status: 400, error: 'items (nicht-leeres Array) erforderlich' };
  }
  // Validieren + Größe je Wert in JS messen (Bytes des serialisierten JSON)
  const sized = [];
  const seen = new Set();
  for (const it of items) {
    if (!it || typeof it.key !== 'string' || !it.key.trim() || it.key.length > MAX_KEY_LENGTH) {
      return { status: 400, error: `Jedes Item braucht einen key (String, max. ${MAX_KEY_LENGTH} Zeichen)` };
    }
    if (seen.has(it.key)) return { status: 400, error: `Key "${it.key}" kommt mehrfach im Batch vor` };
    seen.add(it.key);
    if (it.value === undefined) return { status: 400, error: `Item "${it.key}": value fehlt` };
    if (it.baseVersion !== undefined && !Number.isInteger(it.baseVersion)) {
      return { status: 400, error: `Item "${it.key}": baseVersion muss eine ganze Zahl sein` };
    }
    const json = JSON.stringify(it.value);
    const size = Buffer.byteLength(json, 'utf8');
    if (size > MAX_VALUE_BYTES) {
      return { status: 413, error: `Wert für "${it.key}" überschreitet das Limit von 512 KB` };
    }
    sized.push({ key: it.key, json, size, baseVersion: it.baseVersion ?? 0 });
  }

  // Summenlimit: Bestand − ersetzte Keys + neue Größen (VOR dem Schreiben geprüft)
  const [total, perKey] = await Promise.all([userDataTotalSize(userId), userDataSizes(userId)]);
  const oldSize = Object.fromEntries(perKey.map(r => [r.key, r.size_bytes]));
  let newTotal = total;
  for (const it of sized) newTotal += it.size - (oldSize[it.key] || 0);
  if (newTotal > MAX_TOTAL_BYTES) {
    return { status: 413, error: 'Speicherlimit von 10 MB je Konto überschritten' };
  }

  // Upsert je Key — Konflikte sammeln statt abbrechen (Key-Ebene ist die Merge-Einheit)
  const applied = [];
  const conflicts = [];
  for (const it of sized) {
    const r = await upsertUserData(userId, it.key, it.json, it.baseVersion, it.size);
    if (r.conflict) conflicts.push(r.server);
    else applied.push({ key: it.key, version: r.version });
  }
  if (conflicts.length) {
    return { status: 409, error: 'Versions-Konflikt — Server-Stand beiliegend', conflicts, applied };
  }
  return { status: 200, items: applied };
}
