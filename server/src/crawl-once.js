// Einmaliger Crawl-Lauf ohne Server (für externe Scheduler wie Railway Cron / GitHub Actions):
//   npm run crawl
import { initDb } from './db.js';
import { runCrawl } from './crawler/run.js';

await initDb();
const stats = await runCrawl();
console.log(JSON.stringify(stats, null, 2));
process.exit(0);
