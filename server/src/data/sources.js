// ═══ Seed-Quellen: Konfigurationsdaten, kein Code ═══
// Neue Quelle = neuer Eintrag. weight 0.5–3.0 = redaktionelles Vertrauen/FBA-Nähe.
// Alle RSS-URLs am 4.7.2026 real verifiziert (HTTP 200 + gültiges XML).
// HTML-Quellen: type:'html' + selector_json (Schema: services/crawler/html.js, Dateikopf).
export const SOURCES = [
  { id: 'wortfilter',    name: 'Wortfilter.de',     type: 'rss', url: 'https://www.wortfilter.de/feed/',        region: 'DE',   weight: 3.0, kindHint: 'news' },
  { id: 'aboutamazon',   name: 'About Amazon DE',   type: 'rss', url: 'https://www.aboutamazon.de/news/rss',    region: 'DE',   weight: 2.5, kindHint: 'news' },
  { id: 'shopanbieter',  name: 'shopanbieter.de',   type: 'rss', url: 'https://www.shopanbieter.de/feed',       region: 'DE',   weight: 2.0, kindHint: 'news' },
  { id: 'excitingcom',   name: 'Exciting Commerce', type: 'rss', url: 'https://excitingcommerce.de/feed/',      region: 'DE',   weight: 1.5, kindHint: 'news' },
  { id: 't3n',           name: 't3n',               type: 'rss', url: 'https://t3n.de/rss.xml',                 region: 'DE',   weight: 1.0, kindHint: 'news' },
  // IT-Recht Kanzlei: /news.html ist tot (404), News.php hat keine Datumsangaben —
  // das Newsarchiv liefert Datum + Titel + Link statisch (verifiziert 5.7.2026, HTTP 200,
  // <div class="newsitem"> mit <span class="date">TT.MM.JJJJ</span> + Artikel-Anker).
  { id: 'itrecht',       name: 'IT-Recht Kanzlei',  type: 'html', url: 'https://www.it-recht-kanzlei.de/Newsarchiv.php', region: 'DE', weight: 3.0, kindHint: 'news',
    selector_json: { item: '<div class="newsitem">', maxItems: 40 } },
  // ── Weitere HTML-Kandidaten (geprüft 5.7.2026, derzeit NICHT nutzbar): ──
  // { id: 'merchantday', name: 'merchantday',      type: 'html', url: 'https://www.merchantday.de/', region: 'DE', weight: 2.5, kindHint: 'event' },   // HTTP 521 (Origin down)
  // { id: 'sellercentral', name: 'Amazon Seller-News', type: 'html', url: '…', region: 'DE', weight: 3.0, kindHint: 'news' },                            // nur JS-gerendert/Login
];
