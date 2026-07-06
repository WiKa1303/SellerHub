// ═══ Topic-Clustering (Phase 4) ═══
// Strategie: Die Phase-3-Analyse vergibt pro Artikel bereits einen normalisierten
// Themen-Slug (ai_topic) — das Clustering ist damit im Kern ein GROUP BY (O(n),
// skaliert trivial auf 50k+). Was bleibt, ist das MERGEN fast identischer Slugs
// („fba-gebuehren" vs „amazon-fba-gebuehren"): Trigram-Cosine auf den wenigen
// hundert Slugs statt Embeddings auf zehntausenden Artikeln.
// Upgrade-Pfad ab echter Themen-Unschärfe/Volumen: Embeddings (z.B. Voyage) +
// pgvector + Agglomeration — die Schnittstelle buildClusters(items) bleibt gleich.
import { titleSimilarity } from '../../core/dedupe.js';

const MERGE_THRESHOLD = 0.55; // Slug-Ähnlichkeit, ab der zwei Topics dasselbe Thema sind

/** Gruppiert analysierte Items zu Themen-Clustern; ähnliche Slugs werden verschmolzen. */
export function buildClusters(items) {
  // 1) exaktes Gruppieren nach Slug
  const bySlug = new Map();
  for (const it of items) {
    const slug = it.ai_topic;
    if (!slug || slug === 'sonstiges') continue;
    if (!bySlug.has(slug)) bySlug.set(slug, []);
    bySlug.get(slug).push(it);
  }

  // 2) ähnliche Slugs verschmelzen — größtes Cluster gewinnt als kanonischer Name
  const slugs = [...bySlug.keys()].sort((a, b) => bySlug.get(b).length - bySlug.get(a).length);
  const canonical = new Map(); // slug → kanonischer Slug
  for (const slug of slugs) {
    if (canonical.has(slug)) continue;
    canonical.set(slug, slug);
    for (const other of slugs) {
      if (canonical.has(other)) continue;
      if (titleSimilarity(slug.replace(/-/g, ' '), other.replace(/-/g, ' ')) >= MERGE_THRESHOLD) {
        canonical.set(other, slug);
      }
    }
  }

  const clusters = new Map();
  for (const [slug, list] of bySlug) {
    const canon = canonical.get(slug);
    if (!clusters.has(canon)) clusters.set(canon, { id: canon, items: [] });
    clusters.get(canon).items.push(...list);
  }
  return [...clusters.values()];
}

// ═══ Degradations-Pfad: deterministisches Keyword-Topic ohne KI ═══
// Ohne ANTHROPIC_API_KEY analysiert die Queue nichts → kein ai_topic → die ganze
// Kette Trends → topic_daily → Forecast bliebe leer. Dieser Fallback ordnet Items
// einer festen FBA-Taxonomie zu (Wortlisten nah an KEYWORDS aus core/config.js).
// Reihenfolge = Priorität (spezifisch vor generisch); erster Treffer gewinnt —
// deterministisch und erklärbar. Sobald die KI läuft, hat ihr ai_topic Vorrang.
const FALLBACK_TOPICS = [
  { slug: 'produktsicherheit-gpsr', name: 'Produktsicherheit / GPSR', words: ['gpsr', 'produktsicherheit', 'ce-kennzeich', 'verpackungsgesetz', 'verpackg'] },
  { slug: 'fba-gebuehren',      name: 'FBA-Gebühren',          words: ['gebühr', 'rate card', 'provision', 'auszahlung'] },
  { slug: 'konto-sperrung',     name: 'Konto-Sperrungen',      words: ['sperrung', 'gesperrt', 'kontosperr', 'suspend'] },
  { slug: 'steuern-oss',        name: 'Steuern / OSS',         words: ['umsatzsteuer', 'mehrwertsteuer', 'steuerpflicht', 'steuererkl'], exact: ['oss'] },
  { slug: 'zoll-import',        name: 'Zoll & Import',         words: ['zoll', 'einfuhr', 'importabgabe'] },
  { slug: 'recht-abmahnung',    name: 'Recht & Abmahnungen',   words: ['abmahnung', 'urteil', 'verordnung', 'gesetz', 'haftung', 'rechtsprechung', 'dsgvo', 'wettbewerbsrecht'] },
  { slug: 'ppc-werbung',        name: 'PPC & Werbung',         words: ['werbekosten', 'sponsored', 'anzeigenkosten', 'werbeanzeigen'], exact: ['ppc', 'acos'] },
  { slug: 'buy-box',            name: 'Buy Box',               words: ['buy box', 'buybox'] },
  { slug: 'bewertungen',        name: 'Bewertungen & Reviews', words: ['rezension', 'bewertung', 'review', 'produkttest'] },
  { slug: 'marke-brand',        name: 'Marke & Brand Registry',words: ['markenanmeldung', 'brand registry', 'private label', 'markenrecht'] },
  { slug: 'ki-ecommerce',       name: 'KI im E-Commerce',      words: ['künstliche intelligenz', 'chatgpt', 'claude', 'automatisierung', 'ki-tool', 'ki-agent'], exact: ['ki', 'ai'] },
  { slug: 'fba-logistik',       name: 'FBA & Logistik',        words: ['fulfillment', 'lagerbestand', 'lagergebühr', 'retoure', 'logistik', 'versandkosten'], exact: ['fba', 'prime'] },
  { slug: 'marktplaetze',       name: 'Marktplätze',           words: ['kaufland', 'tiktok shop'], exact: ['otto', 'temu', 'shein', 'ebay'] },
];
// Wortanfang-Matching wie in crawler/scoring.js (deutsche Komposita: „gebühr" trifft
// „Gebührenerhöhung"); kurze/mehrdeutige Begriffe (ki, ai, oss …) nur als ganzes Wort.
const esc = (k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const FALLBACK_RE = FALLBACK_TOPICS.map((t) => ({
  slug: t.slug,
  res: [
    ...(t.words || []).map((k) => new RegExp('\\b' + esc(k), 'i')),
    ...(t.exact || []).map((k) => new RegExp('\\b' + esc(k) + '\\b', 'i')),
  ],
}));
const FALLBACK_NAME = Object.fromEntries(FALLBACK_TOPICS.map((t) => [t.slug, t.name]));

/** Deterministisches Topic für nicht-analysierte Items — oder null (kein Seller-Thema). */
export function fallbackTopic(title, summary) {
  const text = `${title || ''} ${summary || ''}`;
  for (const t of FALLBACK_RE) {
    if (t.res.some((re) => re.test(text))) return t.slug;
  }
  return null;
}

/** Lesbarer Themen-Name aus dem Slug („amazon-fba-gebuehren" → „Amazon FBA Gebühren"). */
export function topicLabel(slug) {
  if (FALLBACK_NAME[slug]) return FALLBACK_NAME[slug]; // Fallback-Taxonomie hat kuratierte Namen
  return slug.split('-').map(w => w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w.toUpperCase()).join(' ');
}
