// ═══ HTML-Listenseiten laden + parsen → Roh-Items (Schwester von rss.js) ═══
//
// Bewusst dependency-frei (Regex/String-basiert, KEIN cheerio/jsdom):
// Wir brauchen keine DOM-Treue, sondern nur Titel/Link/Datum aus überschaubaren,
// statischen Listenseiten — dafür reicht Start-Marker-Split + Anker-Extraktion.
// JS-gerenderte Seiten sind hier AUSSER Scope (siehe README: Playwright erst,
// wenn eine Kernquelle es wirklich braucht).
//
// ── Konfigurations-Schema: `selector_json` je Quelle in data/sources.js ──
//
//   selector_json: {
//     item:    '<div class="newsitem"', // PFLICHT. Start-Marker als einfacher String
//                                       // (kein Regex!). Die Seite wird an jedem
//                                       // Vorkommen gesplittet; jedes Fragment bis
//                                       // zum nächsten Marker = 1 Artikel-Kandidat.
//     title:   { tag: 'h2' },           // optional. Text des ersten <h2>…</h2> im
//                                       // Fragment. Default: der Text des Link-Ankers.
//     link:    { attr: 'href' },        // rein dokumentarisch — der Link ist IMMER
//                                       // das erste <a href> mit nicht-leerem Text
//                                       // (bzw. das erste <a href> überhaupt, wenn
//                                       // `title.tag` gesetzt ist). Relative Links
//                                       // werden gegen die Quellen-URL absolut gemacht.
//     summary: { tag: 'p' },            // optional. Text des ersten <p>…</p>. Default: ''.
//     date:    'auto',                  // Default 'auto', Reihenfolge:
//                                       //   1) <time datetime="…">
//                                       //   2) deutsches Datum im Text (03.07.2026 / 3.7.2026)
//                                       //   3) ISO-Datum im Text (2026-07-03)
//                                       // Ohne Fund bleibt pubDate leer → run.js verwirft
//                                       // das Item (Spec: nur Artikel MIT Datum).
//     maxItems: 50,                     // optional. Obergrenze je Lauf (Quellen-Schonung).
//   }
//
// Rückgabe-Kontrakt identisch zu rss.js: [{ title, link, summary, pubDate }].
import { config } from '../../core/config.js';

const MAX_ITEMS_DEFAULT = 50;
const MAX_CHUNK_CHARS = 20000; // Schutz gegen entartete Fragmente (Marker nur 1× auf riesiger Seite)

// ── HTML-Entities: die im deutschen Web üblichen benannten + alle numerischen ──
const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß',
  bdquo: '„', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', sbquo: '‚',
  ndash: '–', mdash: '—', hellip: '…', euro: '€', sect: '§', laquo: '«', raquo: '»',
};

function decodeEntities(s) {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => { const c = parseInt(h, 16); return c > 0 && c <= 0x10ffff ? String.fromCodePoint(c) : m; })
    .replace(/&#(\d+);/g, (m, d) => { const c = +d; return c > 0 && c <= 0x10ffff ? String.fromCodePoint(c) : m; })
    .replace(/&([a-zA-Z]+);/g, (m, n) => NAMED_ENTITIES[n] ?? m);
}

/** Tags raus, Entities auflösen, Whitespace glätten. */
function stripTags(html) {
  return decodeEntities(String(html).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/** Text des ersten <tag>…</tag> im Fragment ('' wenn nicht vorhanden). */
function firstTagText(chunk, tag) {
  const safe = String(tag).replace(/[^a-z0-9]/gi, ''); // Tag-Name härten (kommt aus Konfiguration)
  if (!safe) return '';
  const m = chunk.match(new RegExp(`<${safe}[^>]*>([\\s\\S]*?)</${safe}>`, 'i'));
  return m ? stripTags(m[1]) : '';
}

/** Alle <a href>-Anker eines Fragments: [{href, text}] (unbrauchbare hrefs gefiltert). */
function extractAnchors(chunk) {
  const out = [];
  const re = /<a\s[^>]*?href\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(chunk))) {
    const href = (m[1] ?? m[2] ?? '').trim();
    if (!href || href.startsWith('#') || /^(javascript|mailto|tel):/i.test(href)) continue;
    out.push({ href, text: stripTags(m[3]) });
  }
  return out;
}

/** Datum im Fragment finden → ISO-String ('' wenn keins; run.js verwirft dann). */
function extractDate(chunk) {
  // 1) <time datetime="…"> ist die verlässlichste Angabe
  const t = chunk.match(/<time[^>]*\bdatetime\s*=\s*["']([^"']+)["']/i);
  if (t) return t[1].trim();
  const text = stripTags(chunk);
  // 2) deutsches Datum: 03.07.2026 oder 3.7.2026 → als ISO zurück (new Date('03.07.2026')
  //    würde in V8 sonst als US-Format MM.DD. fehlinterpretiert!)
  const de = text.match(/\b(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})\b/);
  if (de) {
    const day = +de[1], mon = +de[2];
    if (day >= 1 && day <= 31 && mon >= 1 && mon <= 12) {
      return `${de[3]}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  // 3) ISO-Datum direkt im Text
  const iso = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  return iso ? iso[1] : '';
}

/**
 * Reiner Parser (ohne Netz, direkt testbar): HTML-Listenseite → Roh-Items.
 * Wirft bei fehlendem/nicht gefundenem Item-Marker einen verständlichen Fehler —
 * run.js fängt das je Quelle ab (fail-soft, landet in der Statistik).
 * @param {string} html      Seiteninhalt
 * @param {object} selector  selector_json der Quelle (Schema siehe Dateikopf)
 * @param {string} baseUrl   Quellen-URL — Basis für relative Links
 * @returns {{title:string, link:string, summary:string, pubDate:string}[]}
 */
export function parseHtmlList(html, selector = {}, baseUrl = '') {
  const marker = selector.item;
  if (!marker || typeof marker !== 'string') throw new Error('selector_json.item fehlt (Start-Marker für den Item-Split)');
  const parts = String(html).split(marker);
  if (parts.length < 2) throw new Error(`Item-Marker "${marker}" nicht gefunden – Seitenstruktur geändert?`);

  const max = Number.isFinite(selector.maxItems) && selector.maxItems > 0 ? selector.maxItems : MAX_ITEMS_DEFAULT;
  const items = [];
  for (const raw of parts.slice(1)) {
    if (items.length >= max) break;
    const chunk = raw.slice(0, MAX_CHUNK_CHARS);
    const anchors = extractAnchors(chunk);

    let link, title;
    if (selector.title?.tag) {
      title = firstTagText(chunk, selector.title.tag);
      link = anchors[0]?.href ?? '';
    } else {
      // Default-Heuristik: erster Anker MIT Text ist der Artikel-Link, sein Text der Titel
      const a = anchors.find(a => a.text);
      link = a?.href ?? '';
      title = a?.text ?? '';
    }
    if (!link || !title) continue; // kein Artikel (z. B. reines Bild-Fragment) → still überspringen

    // Relative Links absolut machen; kaputte URLs disqualifizieren das Item
    try { link = new URL(link, baseUrl || undefined).toString(); } catch { continue; }

    items.push({
      title,
      link,
      summary: selector.summary?.tag ? firstTagText(chunk, selector.summary.tag) : '',
      pubDate: extractDate(chunk),
    });
  }
  return items;
}

// ── Netz-Teil (Spiegel von rss.js/fetchText, nur mit HTML-Accept) ──
async function fetchText(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), config.fetchTimeoutMs);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': config.userAgent, 'Accept': 'text/html,application/xhtml+xml' },
      redirect: 'follow',
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally { clearTimeout(t); }
}

/** Lädt eine HTML-Listenseite und liefert Roh-Items wie rss.js/fetchFeed. */
export async function fetchHtmlList(url, selectorJson) {
  const html = await fetchText(url);
  return parseHtmlList(html, selectorJson, url);
}
