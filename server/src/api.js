// ═══ REST-API (readonly + Admin-Trigger) ═══
import express from 'express';
import { queryNews, queryEvents, saveFeedback } from './db.js';
import { runCrawl, crawlState } from './crawler/run.js';
import { drainQueue, aiState } from './ai/queue.js';
import { aiEnabled } from './ai/analyze.js';
import { parseProfile, rankForProfile } from './profile.js';
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

  // GET /api/news – neueste News; mit Profil-Parametern (seller_type, revenue, markets, interests) personalisiert.
  // Personalisierte Antworten sind privat → kein Shared-Cache (Cache-Control wird überschrieben).
  app.get('/api/news', async (req, res) => {
    try {
      const profile = parseProfile(req.query);
      const limit = Math.min(100, parseInt(req.query.limit || '20', 10));
      const rows = await queryNews({
        limit: profile.isEmpty ? limit : Math.min(100, limit * 3), // mehr Kandidaten fürs Re-Ranking
        country: req.query.country || null,
        minScore: parseInt(req.query.minScore || '0', 10),
        maxAgeDays: config.maxAgeDays,
      });
      if (profile.isEmpty) return res.json({ items: rows, count: rows.length, personalized: false });
      res.set('Cache-Control', 'private, max-age=60');
      const ranked = rankForProfile(rows, profile).slice(0, limit);
      res.json({ items: ranked, count: ranked.length, personalized: true });
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

  // GET /api/dashboard-feed – kombiniert & priorisiert fürs Login-Widget.
  // Mit Profil-Parametern: individuell re-ranked (KI-Score + Profil-Match + Dringlichkeits-/Impact-Boost).
  app.get('/api/dashboard-feed', async (req, res) => {
    try {
      const profile = parseProfile(req.query);
      let newsRaw = await queryNews({ limit: 40, maxAgeDays: 7 });
      if (!profile.isEmpty) {
        res.set('Cache-Control', 'private, max-age=60');
        newsRaw = rankForProfile(newsRaw, profile);
      }
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
          personalized: !profile.isEmpty,
          ai: aiEnabled() ? { lastRun: aiState.lastRun, analyzed: aiState.analyzed } : null,
          sources: SOURCES.map(s => ({ id: s.id, name: s.name, region: s.region })),
        },
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/feedback – 👍/👎 zu einem Item ({id, vote: 1|-1}); Basis für Eval-/Fine-Tuning-Daten
  app.post('/api/feedback', express.json(), async (req, res) => {
    try {
      const { id, vote } = req.body || {};
      if (!id || ![1, -1].includes(vote)) return res.status(400).json({ error: 'id und vote (1|-1) erforderlich' });
      const ok = await saveFeedback(String(id), vote);
      res.status(ok ? 200 : 404).json({ ok });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/health – Monitoring: Crawler + KI-Layer (Token-Verbrauch = Kostenkontrolle)
  app.get('/api/health', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({
      ok: true,
      crawler: { lastRun: crawlState.lastRun, running: crawlState.running, stats: crawlState.lastStats },
      ai: { enabled: aiEnabled(), model: config.aiModel, ...aiState },
    });
  });

  // POST /api/admin/crawl – manueller Trigger (mit ADMIN_KEY geschützt); stößt danach die KI-Queue an
  app.post('/api/admin/crawl', async (req, res) => {
    if (!config.adminKey || req.get('X-Api-Key') !== config.adminKey) return res.status(401).json({ error: 'unauthorized' });
    const stats = await runCrawl();
    drainQueue().catch(() => {}); // async, blockiert die Antwort nicht
    res.json({ ok: true, stats });
  });

  return app;
}
