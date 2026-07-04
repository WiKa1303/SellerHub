// ═══ RSS/Atom laden + parsen → Roh-Items ═══
import { XMLParser } from 'fast-xml-parser';
import { config } from '../../core/config.js';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

async function fetchText(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), config.fetchTimeoutMs);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': config.userAgent, 'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml' },
      redirect: 'follow',
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally { clearTimeout(t); }
}

function asArray(x) { return x == null ? [] : Array.isArray(x) ? x : [x]; }
function text(x) { return typeof x === 'object' && x !== null ? (x['#text'] ?? '') : (x ?? ''); }

/** Lädt einen Feed und liefert Roh-Items: {title, link, summary, pubDate}. RSS 2.0 und Atom. */
export async function fetchFeed(url) {
  const xml = await fetchText(url);
  const doc = parser.parse(xml);

  // RSS 2.0: rss.channel.item[]
  const rssItems = asArray(doc?.rss?.channel?.item);
  if (rssItems.length) {
    return rssItems.map(it => ({
      title: String(text(it.title)).trim(),
      link: String(text(it.link)).trim(),
      summary: String(text(it.description) || text(it['content:encoded']) || '').trim(),
      pubDate: text(it.pubDate) || text(it['dc:date']) || '',
    }));
  }
  // Atom: feed.entry[]
  const atomItems = asArray(doc?.feed?.entry);
  if (atomItems.length) {
    return atomItems.map(it => {
      const links = asArray(it.link);
      const alt = links.find(l => l['@_rel'] === 'alternate') || links[0] || {};
      return {
        title: String(text(it.title)).trim(),
        link: String(alt['@_href'] || text(it.link)).trim(),
        summary: String(text(it.summary) || text(it.content) || '').trim(),
        pubDate: text(it.published) || text(it.updated) || '',
      };
    });
  }
  throw new Error('Kein RSS/Atom-Format erkannt');
}
