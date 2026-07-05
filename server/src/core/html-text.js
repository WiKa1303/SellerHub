// ═══ CORE: HTML-Text-Utilities (Entities dekodieren, Tags strippen) ═══
// Kein Domänenwissen — von allen Schichten nutzbar (ARCHITEKTUR.md → CORE).
// Historie: lag ursprünglich in services/crawler/html.js; hierher gezogen, damit
// services/import dieselbe Dekodierung nutzen kann, OHNE dass Services direkt
// miteinander reden (Service-Grenzen-Regel).

// ── HTML-Entities: die im deutschen Web üblichen benannten + alle numerischen ──
const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß',
  bdquo: '„', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', sbquo: '‚',
  ndash: '–', mdash: '—', hellip: '…', euro: '€', sect: '§', laquo: '«', raquo: '»',
};

export function decodeEntities(s) {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => { const c = parseInt(h, 16); return c > 0 && c <= 0x10ffff ? String.fromCodePoint(c) : m; })
    .replace(/&#(\d+);/g, (m, d) => { const c = +d; return c > 0 && c <= 0x10ffff ? String.fromCodePoint(c) : m; })
    .replace(/&([a-zA-Z]+);/g, (m, n) => NAMED_ENTITIES[n] ?? m);
}

/** Tags raus, Entities auflösen, Whitespace glätten. */
export function stripTags(html) {
  return decodeEntities(String(html).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}
