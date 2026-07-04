// ═══ Kombi-Einstieg (MVP-Betriebsmodus): API + Worker in EINEM Prozess ═══
// Für die 100k-Stufe werden die Apps getrennt deployt (npm run start:api /
// start:worker) — gleicher Code, nur andere Einstiegspunkte. S. ARCHITEKTUR.md.
import { validateConfig } from './core/config.js';
import { initDb } from './data/db.js';
import { startApi } from './apps/api.js';
import { startWorker } from './apps/worker.js';
import { log } from './core/logger.js';

async function main() {
  validateConfig().forEach(w => log.warn(w));
  await initDb();
  startApi();
  startWorker();
}

main().catch(e => { log.error(e); process.exit(1); });
