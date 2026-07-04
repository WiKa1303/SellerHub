// ═══ REST-API (readonly + Admin-Trigger) ═══
import express from 'express';
import { queryNews, queryEvents } from './db.js';
import { runCrawl, crawlState } from './crawler/run.js';
import { SOURCES } from './sources.js';
import { config } from './config.js';

export function buildApi() {
  const app = express();
  app.disable('x-powered-by');

  // CORS: Inhalte sind öffentlich, das SellerHub-Frontend (file:// oder eigene Domain) darf lesen.
  app.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Headers', 'Content-Type, X-Api-Key');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  // Lese-Antworten 5 min cachebar → CDN/Proxy entkoppelt die Last
  app.use((req, res, next) => { if (req.method === 'GET') res.set('Cache-Control', 'public, max-age=300'); next(); });

  // GET /api/news – neueste News, sortiert nach Relevanz + Datum
  app.get('/api/news', async (req, res) => {
    try {
      const rows = await queryNews({
        limit: Math.min(100, parseInt(req.query.limit || '20', 10)),
        country: req.query.country || null,
        minScore: parseInt(req.query.minScore || '0', 10),
        maxAgeDays: config.maxAgeDays,
      });
      res.json({ items: rows, count: rows.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/events – kommende Events (Kalender-Sortierung)
  app.get('/api/events', async (req, res) => {
    try {
      const rows = await queryEvents({
        limit: Math.min(100, parseInt(req.query.limit || '20', 10)),
        days: parseInt(req.query.days || '180', 10),
      });
      res.json({ items: rows, count: rows.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/dashboard-feed – kombiniert & priorisiert fürs Login-Widget
  app.get('/api/dashboard-feed', async (req, res) => {
    try {
      const newsRaw = await queryNews({ limit: 30, maxAgeDays: 7 });
      // Diversität: max. 2 Items pro Quelle, dann Top 5 – kippt nie in „5× dieselbe Story"
      const perSource = {};
      const news = [];
      for (const n of newsRaw) {
        perSource[n.source] = (perSource[n.source] || 0) + 1;
        if (perSource[n.source] <= 2) news.push(n);
        if (news.length >= 5) break;
      }
      const events = (await queryEvents({ limit: 3, days: 180 })).slice(0, 3);
      res.json({
        news, events,
        meta: {
          lastCrawl: crawlState.lastRun,
          sources: SOURCES.map(s => ({ id: s.id, name: s.name, region: s.region })),
        },
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/health – Monitoring: läuft der Crawler, welche Quelle klemmt?
  app.get('/api/health', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, lastRun: crawlState.lastRun, running: crawlState.running, stats: crawlState.lastStats });
  });

  // POST /api/admin/crawl – manueller Trigger (mit ADMIN_KEY geschützt)
  app.post('/api/admin/crawl', async (req, res) => {
    if (!config.adminKey || req.get('X-Api-Key') !== config.adminKey) return res.status(401).json({ error: 'unauthorized' });
    const stats = await runCrawl();
    res.json({ ok: true, stats });
  });

  return app;
}
