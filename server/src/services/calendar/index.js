// ═══ KALENDER-SERVICE: Google-Kalender-Sync via iCal/ICS (Modul „Kalender") ═══
// Geschäftslogik + URL-Validierung. Erwartbare Fehler kommen als {status, error}
// zurück (Muster wie services/todo); Routen delegieren nur.
//
// Sync-Modell (bewusst ohne OAuth — funktioniert mit Googles „Privatadresse im
// iCal-Format" sofort und ohne Google-Cloud-Projekt):
//  Google → SellerHub: Feed-URL wird abonniert; Events werden lazy beim Abruf
//    aktualisiert (Cache SYNC_TTL_MIN), Fehler landen sichtbar in last_error.
//  SellerHub → Google: /api/calendar/export/<token>/todo.ics liefert offene
//    Aufgaben mit Fälligkeit als ICS; in Google als „Per URL hinzufügen" abonnieren.
import crypto from 'node:crypto';
import dns from 'node:dns';
import {
  insertCalendarFeed, listCalendarFeeds, getCalendarFeed, deleteCalendarFeed,
  countCalendarFeeds, markCalendarFeedSync, replaceCalendarEvents, queryCalendarEvents,
  getCalendarExportToken, insertCalendarExportToken, userIdByExportToken,
  queryTasksForIcsExport,
} from '../../data/db.js';
import { parseIcs, tasksToIcs } from './ics.js';
import { log } from '../../core/logger.js';

const uuid = () => crypto.randomUUID();
const err = (status, error) => ({ status, error });

// Kostenbremsen / Schutz
const MAX_FEEDS_PER_USER = 5;
const SYNC_TTL_MIN = 10;              // Feed gilt so lange als frisch
const FETCH_TIMEOUT_MS = 15000;
const MAX_ICS_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 3;

// Für Tests austauschbarer Fetcher (Muster: aiClient-Override in den Suiten)
let fetchImpl = (...args) => globalThis.fetch(...args);
export function setCalendarFetch(fn) { fetchImpl = fn || ((...a) => globalThis.fetch(...a)); }

// ── SSRF-Schutz: nur https, keine internen/lokalen Ziele ──
// (Der Server hängt bei Railway im selben Netz wie die DB — interne Ziele tabu.)
// Zweistufig: (1) syntaktische Prüfung der URL/des Hostnamens, (2) DNS-Auflösung
// mit Prüfung ALLER zurückgegebenen Adressen — vor jedem Abruf, auch je Redirect
// (schließt DNS-Rebinding und numerische IP-Tricks wie 2130706433 / 0177.0.0.1).

// Kanonische IPv4 (keine führenden Nullen → kein Oktal-Trick); alles andere
// Numerische fällt in den DNS-Namen-Zweig und braucht dort einen Buchstaben.
const V4_STRICT = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

function privateV4(ip) {
  const p = String(ip).split('.').map(Number);
  if (p.length !== 4 || p.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true; // unparsebar → ablehnen
  const [a, b] = p;
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) // CGNAT 100.64/10
    || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function privateV6(ip) {
  const s = String(ip).toLowerCase();
  if (s === '::' || s === '::1') return true;
  if (/^fe[89ab]/.test(s)) return true;        // Link-local fe80::/10
  if (s.startsWith('fc') || s.startsWith('fd')) return true; // ULA fc00::/7
  const m = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);        // v4-mapped
  if (m) return privateV4(m[1]);
  return false;
}

function validateFeedUrl(raw) {
  let u;
  try { u = new URL(String(raw).trim()); } catch (e) { return 'Keine gültige URL'; }
  if (u.protocol !== 'https:') return 'Nur https://-Adressen sind erlaubt';
  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return 'Interne Adressen sind nicht erlaubt';
  if (host.includes(':') || host.includes('[')) return 'Interne Adressen sind nicht erlaubt'; // IPv6-Literale pauschal ablehnen
  if (V4_STRICT.test(host)) return privateV4(host) ? 'Interne Adressen sind nicht erlaubt' : null;
  // DNS-Name: nur [a-z0-9.-] und mindestens ein Buchstabe — verwirft Dezimal-/Hex-/Oktal-IPs
  if (!/^[a-z0-9.-]+$/.test(host) || !/[a-z]/.test(host)) return 'Keine gültige Kalender-Adresse';
  return null;
}

// Für Tests austauschbarer DNS-Resolver (Muster: setCalendarFetch)
let lookupImpl = (host) => dns.promises.lookup(host, { all: true, verbatim: true });
export function setCalendarDnsLookup(fn) { lookupImpl = fn || ((host) => dns.promises.lookup(host, { all: true, verbatim: true })); }

// DNS auflösen und JEDE Adresse prüfen (Rebinding-Schutz). Rest-Risiko TOCTOU
// (Record flippt zwischen Lookup und Connect) ist bewusst akzeptiert — dafür
// müsste der Angreifer die TTL im Millisekunden-Fenster drehen.
async function assertPublicHost(url) {
  const host = new URL(url).hostname.toLowerCase();
  if (V4_STRICT.test(host)) return; // Literal-IP wurde schon syntaktisch geprüft
  let addrs;
  try { addrs = await lookupImpl(host); } catch (e) { throw new Error('Kalender-Adresse nicht auflösbar'); }
  if (!addrs || !addrs.length) throw new Error('Kalender-Adresse nicht auflösbar');
  for (const a of addrs) {
    const bad = a.family === 6 ? privateV6(a.address) : privateV4(a.address);
    if (bad) throw new Error('Interne Adressen sind nicht erlaubt');
  }
}

// ── ICS holen (Timeout, Größenlimit, Redirects einzeln re-validiert) ──
async function fetchIcs(url) {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const bad = validateFeedUrl(current);
    if (bad) throw new Error(bad);
    await assertPublicHost(current); // DNS-Rebinding-Schutz — je Hop
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    let res;
    try {
      res = await fetchImpl(current, {
        redirect: 'manual', signal: ctrl.signal,
        headers: { 'User-Agent': 'SellerHub-Kalender/1.0 (+https://amzsellerhub.de)', Accept: 'text/calendar, text/plain, */*' },
      });
    } finally { clearTimeout(timer); }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) throw new Error('Weiterleitung ohne Ziel');
      current = new URL(loc, current).toString();
      continue;
    }
    if (!res.ok) throw new Error('Kalender-Server antwortet mit HTTP ' + res.status);
    const text = await res.text();
    if (text.length > MAX_ICS_BYTES) throw new Error('Kalender-Datei zu groß (max. 5 MB)');
    if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error('Antwort ist kein iCal-Kalender (BEGIN:VCALENDAR fehlt)');
    return text;
  }
  throw new Error('Zu viele Weiterleitungen');
}

// ── Einen Feed synchronisieren (fail-soft: Fehler landet in last_error) ──
async function syncFeed(feed) {
  try {
    const text = await fetchIcs(feed.url);
    const events = parseIcs(text);
    await replaceCalendarEvents(feed.id, events);
    await markCalendarFeedSync(feed.id, { ok: true, now: new Date() });
    return { ok: true, count: events.length };
  } catch (e) {
    // URL ist ein Geheimnis → nie mitloggen
    log.warn(`Kalender-Sync fehlgeschlagen (Feed ${feed.id}): ${e.message}`);
    await markCalendarFeedSync(feed.id, { ok: false, error: e.message });
    return { ok: false, error: e.message };
  }
}

const feedDto = f => ({
  id: f.id, name: f.name, color: f.color || '#2563eb',
  lastSync: f.last_sync || null, lastError: f.last_error || null,
  // URL nur maskiert zurückgeben (Geheimnis; reicht zum Wiedererkennen)
  urlHint: String(f.url).replace(/^https:\/\/([^/]+).*$/, '$1') + '/…',
});

// ═══ Feeds verwalten ═══

export async function feeds(user) {
  return { feeds: (await listCalendarFeeds(user.id)).map(feedDto) };
}

export async function addFeed(user, { url, name, color } = {}) {
  const bad = validateFeedUrl(url);
  if (bad) return err(400, bad);
  try { await assertPublicHost(String(url).trim()); } catch (e) { return err(400, e.message); }
  if (await countCalendarFeeds(user.id) >= MAX_FEEDS_PER_USER)
    return err(400, `Maximal ${MAX_FEEDS_PER_USER} Kalender möglich`);
  // Google-Komfort: webcal:// hat der Validator schon abgelehnt; hier nichts umschreiben.
  const feed = {
    id: uuid(), userId: user.id, url: String(url).trim(),
    name: String(name || 'Google Kalender').slice(0, 120),
    color: /^#[0-9a-fA-F]{6}$/.test(color || '') ? color : null,
  };
  await insertCalendarFeed(feed);
  // Erst-Sync sofort — meldet kaputte URLs direkt an den Nutzer zurück
  const r = await syncFeed({ id: feed.id, url: feed.url });
  const row = await getCalendarFeed(feed.id, user.id);
  return { feed: feedDto(row), firstSync: r };
}

export async function removeFeed(user, feedId) {
  const ok = await deleteCalendarFeed(feedId, user.id);
  return ok ? { ok: true } : err(404, 'Kalender nicht gefunden');
}

export async function syncFeedNow(user, feedId) {
  const feed = await getCalendarFeed(feedId, user.id);
  if (!feed) return err(404, 'Kalender nicht gefunden');
  const r = await syncFeed(feed);
  const row = await getCalendarFeed(feedId, user.id);
  return { feed: feedDto(row), sync: r };
}

// ═══ Termine abfragen (lazy Re-Sync abgelaufener Feeds) ═══

export async function events(user, { from, to } = {}) {
  const dayRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dayRe.test(from || '') || !dayRe.test(to || '')) return err(400, 'from/to als YYYY-MM-DD angeben');
  const all = await listCalendarFeeds(user.id);
  const cutoff = Date.now() - SYNC_TTL_MIN * 60000;
  for (const f of all) {
    const stale = !f.last_sync || new Date(f.last_sync).getTime() < cutoff;
    if (stale) await syncFeed(f);
  }
  const rows = await queryCalendarEvents(user.id, from, to);
  const fresh = await listCalendarFeeds(user.id);
  return {
    events: rows.map(r => ({
      feedId: r.feed_id, uid: r.uid, title: r.title, location: r.location || null,
      startDay: r.start_day, endDay: r.end_day, startTs: r.start_ts || null, endTs: r.end_ts || null,
      allDay: !!r.all_day, feedName: r.feed_name, color: r.feed_color || '#2563eb',
    })),
    feeds: fresh.map(feedDto),
  };
}

// ═══ Export-Token + ICS-Feed der Aufgaben ═══

export async function exportInfo(user) {
  let token = await getCalendarExportToken(user.id);
  if (!token) {
    token = crypto.randomBytes(24).toString('base64url');
    await insertCalendarExportToken(user.id, token);
    token = await getCalendarExportToken(user.id); // Race-sicher (ON CONFLICT DO NOTHING)
  }
  return { token, path: `/api/calendar/export/${token}/todo.ics` };
}

export async function exportIcsByToken(token) {
  if (!token || String(token).length < 16) return err(404, 'Unbekannter Kalender');
  const userId = await userIdByExportToken(String(token));
  if (!userId) return err(404, 'Unbekannter Kalender');
  const tasks = await queryTasksForIcsExport(userId);
  return { ics: tasksToIcs(tasks) };
}
