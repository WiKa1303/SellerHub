// ═══ Einstieg: DB + API + Cron in EINEM Prozess (MVP) ═══
import cron from 'node-cron';
import { config } from './core/config.js';
import { initDb } from './data/db.js';
import { buildApi } from './api/routes.js';
import { runCrawl } from './services/crawler/run.js';
import { aiEnabled } from './services/intelligence/analyze.js';
import { runIntelligencePipeline } from './services/intelligence/registry.js';
import { log } from './core/logger.js';

// Pipeline je Lauf: Crawl → Intelligence-Module (Registry-Reihenfolge:
// relevance → trends → alerts → strategy). Alles NACH dem Crawl ist
// Hintergrundverarbeitung und blockiert nie den Feed — Items sind sofort mit
// Keyword-Score sichtbar, KI/Trends/Alerts/Briefing kommen asynchron dazu.
async function crawlAndAnalyze() {
  await runCrawl();
  const results = await runIntelligencePipeline();
  log.info('Intelligence-Pipeline:', JSON.stringify(results));
}

async function main() {
  if (!config.databaseUrl) {
    log.error('DATABASE_URL fehlt (.env.example ansehen)');
    process.exit(1);
  }
  await initDb();

  const app = buildApi();
  const server = app.listen(config.port, () => log.info(`API läuft auf Port ${config.port}`));

  // Graceful Shutdown: Deploy/Restart killt keine offenen Requests. Eine evtl.
  // laufende Pipeline darf abbrechen — die DB-als-Queue macht den Lauf wiederaufnehmbar
  // (offene Items bleiben ai_analyzed_at IS NULL und werden beim nächsten Lauf geholt).
  for (const sig of ['SIGTERM', 'SIGINT']) {
    process.on(sig, () => {
      log.info(`${sig} empfangen — fahre herunter (offene Pipeline-Arbeit wird beim nächsten Lauf fortgesetzt)`);
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 8000).unref(); // Fallback, falls Verbindungen hängen
    });
  }

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
