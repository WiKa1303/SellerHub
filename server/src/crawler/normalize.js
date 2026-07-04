// ═══ Normalisierung: URL-Kanonisierung, Text, Datum, Event-Erkennung ═══
import { EVENT_PATTERN } from '../config.js';

const TRACKING_PARAMS = /^(utm_|fbclid|gclid|mc_cid|mc_eid|ref$|source$)/i;

/** URL kanonisieren: Tracking-Parameter raus, https, kein Trailing-Slash, Host lowercase. */
export function canonicalUrl(raw) {
  try {
    const u = new URL(raw);
    u.protocol = 'https:';
    u.hostname = u.hostname.toLowerCase();
    u.hash = '';
    for (const k of [...u.searchParams.keys()]) if (TRACKING_PARAMS.test(k)) u.searchParams.delete(k);
    let s = u.toString();
    if (s.endsWith('/')) s = s.slice(0, -1);
    return s;
  } catch { return String(raw).trim(); }
}

/** HTML-Tags raus, Whitespace glätten, auf 300 Zeichen kürzen (Leistungsschutzrecht). */
export function cleanSummary(html) {
  const t = String(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#\d+;|&\w+;/g, ' ')
    .replace(/\s+/g, ' ').trim();
  return t.length > 300 ? t.slice(0, 297) + '…' : t;
}

// Achtung: Vergleich passiert NACH Umlaut-Ersetzung → 'fuer' statt 'für'
const STOPWORDS = new Set(['der','die','das','den','dem','des','ein','eine','einer','und','oder','fuer','mit','von','im','in','am','an','auf','bei','zu','zur','zum','ist','sind','wird','werden','so','nach','neue','neuer','neues','ab','als','auch','jetzt','mehr','wie']);

/** Titel-Normalform für Ähnlichkeitsvergleich (Dubletten-Ebene 2). */
export function normalizeTitle(title) {
  return String(title).toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/).filter(w => w && !STOPWORDS.has(w))
    .join(' ');
}

/** Veröffentlichungsdatum parsen; null wenn unbrauchbar (Item wird dann verworfen – Spec: nur mit Datum). */
export function parseDate(s) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

const MONTHS = { januar:1, februar:2, märz:3, maerz:3, april:4, mai:5, juni:6, juli:7, august:8, september:9, oktober:10, november:11, dezember:12 };

/** Deutsche Datumsangabe im Text finden (12.09.2026 · 12.9. · 12. September 2026) → künftiges Event-Datum. */
export function extractEventDate(text, ref = new Date()) {
  const s = String(text);
  const candidates = [];
  let m;
  const num = /(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4}|\d{2})?/g;
  while ((m = num.exec(s))) {
    const day = +m[1], mon = +m[2];
    let year = m[3] ? +m[3] : ref.getFullYear();
    if (year < 100) year += 2000;
    candidates.push({ day, mon, year, hadYear: !!m[3] });
  }
  const word = new RegExp(`(\\d{1,2})\\.\\s?(${Object.keys(MONTHS).join('|')})\\s?(\\d{4})?`, 'gi');
  while ((m = word.exec(s))) {
    candidates.push({ day: +m[1], mon: MONTHS[m[2].toLowerCase()], year: m[3] ? +m[3] : ref.getFullYear(), hadYear: !!m[3] });
  }
  for (const c of candidates) {
    if (c.day < 1 || c.day > 31 || c.mon < 1 || c.mon > 12) continue;
    let d = new Date(Date.UTC(c.year, c.mon - 1, c.day));
    // Ohne Jahresangabe: wenn schon vorbei, meint es nächstes Jahr
    if (!c.hadYear && d < ref) d = new Date(Date.UTC(c.year + 1, c.mon - 1, c.day));
    const days = (d - ref) / 864e5;
    if (days >= 0 && days <= 400) return d; // plausibles künftiges Event
  }
  return null;
}

/** News oder Event? Keyword-Muster auf Titel+Anriss. */
export function detectKind(title, summary) {
  return EVENT_PATTERN.test(`${title} ${summary}`) ? 'event' : 'news';
}
