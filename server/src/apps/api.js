// ═══ APP: API — schlanker HTTP-Prozess, KEIN Cron, KEINE AI-Verarbeitung ═══
// Ausnahme (dokumentiert): POST /api/admin/crawl ist ein manueller Override,
// der Crawl+Pipeline im aufnehmenden Prozess ausführt.
//   Standalone:  npm run start:api   (Skalierungs-Stufe 2: getrennt vom Worker)
//   Kombi-Modus: npm start           (index.js startet API + Worker in einem Prozess)
import { pathToFileURL } from 'node:url';
import { config, validateConfig } from '../core/config.js';
import { initDb } from '../data/db.js';
import { buildApi } from '../api/routes.js';
import { log } from '../core/logger.js';

export function startApi() {
  const server = buildApi().listen(config.port, () => log.info(`API läuft auf Port ${config.port}`));
  // Graceful Shutdown: offene Requests zu Ende bedienen; 8s-Fallback gegen hängende Verbindungen
  for (const sig of ['SIGTERM', 'SIGINT']) {
    process.on(sig, () => {
      log.info(`${sig} empfangen — API fährt herunter`);
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 8000).unref();
    });
  }
  return server;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  validateConfig().forEach(w => log.warn(w));
  await initDb();
  startApi();
}
