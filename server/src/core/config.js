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

  // ═══ KI-Analyse (Phase 3) ═══
  // Ohne ANTHROPIC_API_KEY läuft alles weiter mit Keyword-Scoring (bewusster Degradations-Pfad).
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  aiModel: process.env.AI_MODEL || 'claude-opus-4-8',
  // Kostenbremse 1: max. KI-Analysen pro Crawl-Lauf (Rest bleibt in der DB-Warteschlange)
  aiMaxPerRun: parseInt(process.env.AI_MAX_PER_RUN || '60', 10),
  // Kostenbremse 2: max. Analyse-Versuche pro Item, danach dauerhaft Keyword-Score
  aiMaxAttempts: parseInt(process.env.AI_MAX_ATTEMPTS || '3', 10),
  aiConcurrency: parseInt(process.env.AI_CONCURRENCY || '2', 10),

  // ═══ Push-Zustellung (Phase 5) ═══
  // Beide Kanäle optional & fail-soft: ohne Konfiguration überspringt der Dispatcher
  // sauber (Alerts bleiben in der Queue sichtbar). Beide gleichzeitig sind erlaubt.
  pushWebhookUrl: process.env.PUSH_WEBHOOK_URL || '',   // generischer JSON-POST
  pushNtfyTopic: process.env.PUSH_NTFY_TOPIC || '',     // https://ntfy.sh/<topic> (kontofrei)
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

// Off-Topic-Begriffe: klar seller-fremde Themen (Karriere-/Lifestyle-Rauschen aus
// Generalisten-Quellen wie t3n). Jeder Treffer zieht Keyword-Punkte ab — Artikel ohne
// starke Seller-Keywords fallen damit unters Gate. Bewusst eng gehalten, damit keine
// echten Händler-Themen verloren gehen.
export const KEYWORDS_NEGATIVE = [
  'karriere', 'gehalt', 'bewerbung', 'burnout', 'midlife', 'psycholog',
  'achtsamkeit', 'dating', 'horoskop', 'krankmeldung', 'work-life',
];

// Fristen-/Handlungs-Muster → Impact-Boost (+10)
// \bfrist statt frist: „Befristung" (Arbeitsrecht) darf den Boost nicht auslösen.
export const IMPACT_PATTERN = /(\bfrist|stichtag|ab dem \d|müssen bis|verpflichtend|inkrafttreten|tritt in kraft|verboten|abmahn|deadline)/i;

// Event-Erkennung (kind = 'event')
export const EVENT_PATTERN = /(konferenz|kongress|messe|event|stammtisch|meetup|networking|seminar|webinar|workshop|summit|barcamp|treffen|ticket)/i;

/**
 * Environment-Validation: fail-fast beim Boot mit ALLEN Problemen auf einmal
 * (statt eines kryptischen Fehlers irgendwo zur Laufzeit). Wird von den
 * apps/-Einstiegspunkten aufgerufen — Tests umgehen sie bewusst (pg-mem).
 * @returns {string[]} Warnungen (kein Abbruch)
 */
export function validateConfig() {
  const problems = [];
  if (!config.databaseUrl) problems.push('DATABASE_URL fehlt');
  else if (!/^postgres(ql)?:\/\//.test(config.databaseUrl)) problems.push('DATABASE_URL muss mit postgres:// beginnen');
  for (const [k, v] of Object.entries({ PORT: config.port, SCORE_THRESHOLD: config.scoreThreshold,
    MAX_AGE_DAYS: config.maxAgeDays, AI_MAX_PER_RUN: config.aiMaxPerRun,
    AI_MAX_ATTEMPTS: config.aiMaxAttempts, AI_CONCURRENCY: config.aiConcurrency })) {
    if (!Number.isFinite(v) || v <= 0) problems.push(`${k} muss eine positive Zahl sein (ist: ${v})`);
  }
  if (config.crawlCron.trim().split(/\s+/).length !== 5) problems.push(`CRAWL_CRON sieht nicht nach Cron-Syntax aus: "${config.crawlCron}"`);
  if (config.pushWebhookUrl && !/^https?:\/\//.test(config.pushWebhookUrl)) problems.push(`PUSH_WEBHOOK_URL muss mit http(s):// beginnen (ist: "${config.pushWebhookUrl}")`);
  if (problems.length) throw new Error('Ungültige Konfiguration:\n  - ' + problems.join('\n  - '));
  const warnings = [];
  if (!config.adminKey) warnings.push('ADMIN_KEY leer — POST /api/admin/crawl ist deaktiviert');
  if (!config.anthropicApiKey) warnings.push('ANTHROPIC_API_KEY fehlt — Intelligence-Module laufen im Degradations-Modus (Keyword-Scoring)');
  if (!config.pushWebhookUrl && !config.pushNtfyTopic) warnings.push('PUSH_WEBHOOK_URL/PUSH_NTFY_TOPIC leer — Push-Zustellung inaktiv (Alerts bleiben in der Queue sichtbar)');
  return warnings;
}
