// ═══ Konfiguration: alles Justierbare an EINEM Ort ═══
export const config = {
  port: parseInt(process.env.PORT || '8787', 10),
  databaseUrl: process.env.DATABASE_URL || '',
  // 2× täglich (6:00 + 15:00) – News sind kein Echtzeit-Problem
  crawlCron: process.env.CRAWL_CRON || '0 6,15 * * *',
  crawlOnBoot: process.env.CRAWL_ON_BOOT !== 'false',
  scoreThreshold: parseInt(process.env.SCORE_THRESHOLD || '25', 10),
  maxAgeDays: parseInt(process.env.MAX_AGE_DAYS || '30', 10),
  adminKey: process.env.ADMIN_KEY || '',
  userAgent: 'SellerHub-Radar/0.1 (+https://github.com/WiKa1303/SellerHub)',
  fetchTimeoutMs: 15000,
};

// ═══ FBA-Keyword-Lexikon (3 Gewichtsstufen) ═══
// hoch = kostet Geld, wenn man es verpasst · mittel = Tagesgeschäft · kontext = Themenumfeld
export const KEYWORDS = {
  high: [
    'gebühr', 'rate card', 'gpsr', 'produktsicherheit', 'verpackungsgesetz', 'verpackg',
    'oss', 'umsatzsteuer', 'mehrwertsteuer', 'zoll', 'sperrung', 'gesperrt', 'abmahnung',
    'frist', 'pflicht', 'gesetz', 'verordnung', 'haftung', 'kontosperr', 'auszahlung',
  ],
  mid: [
    'fba', 'fulfillment', 'buy box', 'buybox', 'listing', 'rezension', 'bewertung',
    'ppc', 'werbekosten', 'prime', 'lagergebühr', 'retoure', 'private label',
    'seller central', 'markenanmeldung', 'a+', 'brand registry',
  ],
  ctx: [
    'amazon', 'marktplatz', 'marketplace', 'e-commerce', 'ecommerce', 'onlinehandel',
    'händler', 'seller', 'versandhandel', 'otto', 'ebay', 'kaufland', 'temu', 'shein',
  ],
};

// Fristen-/Handlungs-Muster → Impact-Boost (+10)
export const IMPACT_PATTERN = /(frist|stichtag|ab dem \d|müssen bis|verpflichtend|inkrafttreten|tritt in kraft|verboten|abmahn|deadline)/i;

// Event-Erkennung (kind = 'event')
export const EVENT_PATTERN = /(konferenz|kongress|messe|event|stammtisch|meetup|networking|seminar|webinar|workshop|summit|barcamp|treffen|ticket)/i;
