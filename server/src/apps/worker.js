// ═══ APP: WORKER — hier (und NUR hier) läuft die AI-Verarbeitung ═══
// Cron → Crawl → Intelligence-Pipeline (Registry-Reihenfolge). Die DB-als-Queue
// macht jeden Lauf wiederaufnehmbar; ein Kill mitten im Lauf verliert nichts.
//   Standalone:  npm run start:worker   (Skalierungs-Stufe 2)
//   Kombi-Modus: npm start              (index.js startet API + Worker in einem Prozess)
import { pathToFileURL } from 'node:url';
import cron from 'node-cron';
import { config, validateConfig } from '../core/config.js';
import { initDb } from '../data/db.js';
import { runCrawl } from '../services/crawler/run.js';
import { runIntelligencePipeline } from '../services/intelligence/registry.js';
import { aiEnabled } from '../core/ai-client.js';
import { log } from '../core/logger.js';

/** Ein kompletter Verarbeitungslauf. Fehler einzelner Stufen sind isoliert. */
export async function crawlAndAnalyze() {
  await runCrawl();
  const results = await runIntelligencePipeline();
  log.info('Intelligence-Pipeline:', JSON.stringify(results));
}

export function startWorker() {
  cron.schedule(config.crawlCron, () => {
    crawlAndAnalyze().catch(e => log.error('Verarbeitungslauf fehlgeschlagen:', e.message));
  });
  log.info(`Worker geplant: "${config.crawlCron}" · KI: ${aiEnabled() ? config.aiModel : 'AUS (Degradations-Modus)'}`);
  if (config.crawlOnBoot) {
    crawlAndAnalyze().catch(e => log.error('Boot-Lauf fehlgeschlagen:', e.message));
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  validateConfig().forEach(w => log.warn(w));
  await initDb();
  startWorker();
  for (const sig of ['SIGTERM', 'SIGINT']) {
    process.on(sig, () => {
      log.info(`${sig} empfangen — Worker stoppt (offene Arbeit wird beim nächsten Lauf fortgesetzt)`);
      process.exit(0);
    });
  }
}
