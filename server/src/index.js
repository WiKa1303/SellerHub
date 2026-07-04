// ═══ Einstieg: DB + API + Cron in EINEM Prozess (MVP) ═══
import cron from 'node-cron';
import { config } from './config.js';
import { initDb } from './db.js';
import { buildApi } from './api.js';
import { runCrawl } from './crawler/run.js';
import { drainQueue } from './ai/queue.js';
import { aiEnabled } from './ai/analyze.js';
import { runTrendEngine } from './trends/engine.js';
import { generateAlerts } from './alerts.js';
import { log } from './logger.js';

// Pipeline je Lauf: Crawl → KI-Analyse → Trend-Engine + Alerts.
// Alles NACH dem Crawl ist Hintergrundverarbeitung (blockiert nie den Feed):
// Items sind sofort mit Keyword-Score sichtbar, KI/Trends/Alerts kommen asynchron dazu.
async function crawlAndAnalyze() {
  await runCrawl();
  await drainQueue();
  await Promise.all([
    runTrendEngine().catch(e => log.error('Trend-Engine:', e.message)),
    generateAlerts().catch(e => log.error('Alert-Generator:', e.message)),
  ]);
}

async function main() {
  if (!config.databaseUrl) {
    log.error('DATABASE_URL fehlt (.env.example ansehen)');
    process.exit(1);
  }
  await initDb();

  const app = buildApi();
  app.listen(config.port, () => log.info(`API läuft auf Port ${config.port}`));

  // Scheduling: node-cron im selben Prozess. 2× täglich reicht – News sind kein Echtzeit-Problem.
  cron.schedule(config.crawlCron, () => {
    crawlAndAnalyze().catch(e => log.error('Crawl-/KI-Lauf fehlgeschlagen:', e.message));
  });
  log.info(`Crawler geplant: "${config.crawlCron}" · KI-Analyse: ${aiEnabled() ? config.aiModel : 'AUS (kein ANTHROPIC_API_KEY)'}`);

  // Beim Start einmal crawlen (frische Daten nach Deploy; abschaltbar via CRAWL_ON_BOOT=false)
  if (config.crawlOnBoot) {
    crawlAndAnalyze().catch(e => log.error('Boot-Crawl fehlgeschlagen:', e.message));
  }
}

main().catch(e => { log.error(e); process.exit(1); });
