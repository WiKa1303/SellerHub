// Einmaliger Lauf ohne Server: Crawl + komplette Intelligence-Pipeline.
// Für externe Scheduler (Railway Cron / GitHub Actions) und den Worker-Split
// (Skalierungs-Stufe 2): API-Prozess bleibt schlank, dieser Prozess arbeitet.
//   npm run crawl
import { initDb } from './data/db.js';
import { runCrawl } from './services/crawler/run.js';
import { runIntelligencePipeline } from './services/intelligence/registry.js';

await initDb();
const crawl = await runCrawl();
const intelligence = await runIntelligencePipeline();
console.log(JSON.stringify({ crawl, intelligence }, null, 2));
process.exit(0);
