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

/** Lesbarer Themen-Name aus dem Slug („amazon-fba-gebuehren" → „Amazon FBA Gebühren"). */
export function topicLabel(slug) {
  return slug.split('-').map(w => w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w.toUpperCase()).join(' ');
}
