// ═══ Dubletten-Erkennung ═══
// Ebene 1: SHA-256 der kanonischen URL (= Primärschlüssel, fängt Re-Crawls).
// Ebene 2: Trigram-Ähnlichkeit normalisierter Titel gegen die letzten 7 Tage
//          (fängt dieselbe Story von verschiedenen Quellen).
import { createHash } from 'node:crypto';

export function urlHash(canonicalUrl) {
  return createHash('sha256').update(canonicalUrl).digest('hex');
}

function trigrams(s) {
  const t = new Set();
  const p = `  ${s} `;
  for (let i = 0; i < p.length - 2; i++) t.add(p.slice(i, i + 3));
  return t;
}

export function titleSimilarity(a, b) {
  if (!a || !b) return 0;
  const ta = trigrams(a), tb = trigrams(b);
  let inter = 0;
  for (const x of ta) if (tb.has(x)) inter++;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union; // Jaccard 0–1
}

/** true, wenn der normalisierte Titel einem der jüngsten Titel zu ≥ threshold ähnelt. */
export function isDuplicateTitle(titleNorm, recentNorms, threshold = 0.85) {
  for (const r of recentNorms) {
    if (titleSimilarity(titleNorm, r) >= threshold) return true;
  }
  return false;
}
