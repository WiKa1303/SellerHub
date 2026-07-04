// ═══ Ein Crawl-Lauf: Quellen → Items → Filter → Score → Dedupe → DB ═══
import { SOURCES } from '../sources.js';
import { config } from '../config.js';
import { fetchFeed } from './rss.js';
import { canonicalUrl, cleanSummary, normalizeTitle, parseDate, detectKind, extractEventDate } from './normalize.js';
import { scoreItem } from '../scoring.js';
import { urlHash, isDuplicateTitle } from '../dedupe.js';
import { insertItem, recentTitleNorms } from '../db.js';
import { log } from '../logger.js';

/** Letzter Lauf für /api/health (im Speicher – MVP reicht das). */
export const crawlState = { lastRun: null, lastStats: null, running: false };

export async function runCrawl() {
  if (crawlState.running) { log.warn('Crawl übersprungen – läuft bereits'); return crawlState.lastStats; }
  crawlState.running = true;
  const started = Date.now();
  const stats = {};
  try {
    const cutoff = new Date(Date.now() - config.maxAgeDays * 864e5);
    // Titel-Gedächtnis für Ebene-2-Dedupe – innerhalb des Laufs fortgeschrieben,
    // damit auch zwei Quellen IM SELBEN Lauf nicht doppelt landen.
    const known = await recentTitleNorms(7);

    for (const src of SOURCES) {
      const s = { fetched: 0, kept: 0, dupes: 0, old: 0, lowScore: 0, error: null };
      stats[src.id] = s;
      try {
        if (src.type !== 'rss') { s.error = 'Typ noch nicht implementiert'; continue; }
        const raw = await fetchFeed(src.url);
        s.fetched = raw.length;

        for (const r of raw) {
          if (!r.title || !r.link) continue;
          const publishDate = parseDate(r.pubDate);
          if (!publishDate) continue;                     // Spec: nur Artikel MIT Datum
          if (publishDate < cutoff) { s.old++; continue; } // Spec: nur letzte 30 Tage

          const url = canonicalUrl(r.link);
          const summary = cleanSummary(r.summary);
          const titleNorm = normalizeTitle(r.title);
          const { score, kw } = scoreItem({ title: r.title, summary, publishDate, sourceWeight: src.weight });
          // Gate: ohne ein einziges Themen-Keyword ist es kein Seller-Thema (fängt Generalisten-Feeds wie t3n)
          if (kw === 0 || score < config.scoreThreshold) { s.lowScore++; continue; }
          if (isDuplicateTitle(titleNorm, known)) { s.dupes++; continue; }

          const kind = src.kindHint === 'event' ? 'event' : detectKind(r.title, summary);
          const inserted = await insertItem({
            id: urlHash(url),
            title: r.title.slice(0, 300),
            titleNorm,
            summary,
            url,
            source: src.name,
            publishDate: publishDate.toISOString(),
            country: src.region || 'DE',
            type: kind,
            relevanceScore: score,
            eventStart: kind === 'event' ? extractEventDate(`${r.title} ${summary}`)?.toISOString() : null,
          });
          if (inserted) { s.kept++; known.push(titleNorm); } else { s.dupes++; }
        }
      } catch (e) {
        s.error = e.message;
        log.warn(`Quelle ${src.id} fehlgeschlagen: ${e.message}`);
      }
    }
    crawlState.lastRun = new Date().toISOString();
    crawlState.lastStats = stats;
    const total = Object.values(stats).reduce((a, s) => a + s.kept, 0);
    log.info(`Crawl fertig in ${Math.round((Date.now() - started) / 1000)}s – ${total} neue Items`, JSON.stringify(stats));
    return stats;
  } finally {
    crawlState.running = false;
  }
}
