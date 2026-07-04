// ═══ REST-API (readonly + Admin-Trigger) ═══
import express from 'express';
import { queryNews, queryEvents, saveFeedback, queryTrends, queryAlerts, topicHistory } from './db.js';
import { runCrawl, crawlState } from './crawler/run.js';
import { drainQueue, aiState } from './ai/queue.js';
import { aiEnabled } from './ai/analyze.js';
import { runTrendEngine, trendState } from './trends/engine.js';
import { generateAlerts, alertState } from './alerts.js';
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
      // Automatische Dashboard-Priorisierung (Phase 4): Critical-Alerts werden gepinnt
      const criticalAlerts = await queryAlerts({ level: 'critical', days: 7, limit: 2 });
      res.json({
        news, events,
        critical_alerts: criticalAlerts,
        meta: {
          lastCrawl: crawlState.lastRun,
          personalized: !profile.isEmpty,
          ai: aiEnabled() ? { lastRun: aiState.lastRun, analyzed: aiState.analyzed } : null,
          sources: SOURCES.map(s => ({ id: s.id, name: s.name, region: s.region })),
        },
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ═══ Phase 4: Market Intelligence ═══

  // GET /api/trends – Trend-Themen (Filter: minScore, risk_or_opportunity, limit)
  app.get('/api/trends', async (req, res) => {
    try {
      const rows = await queryTrends({
        limit: Math.min(50, parseInt(req.query.limit || '10', 10)),
        minScore: parseInt(req.query.minScore || '0', 10),
        riskOrOpportunity: ['risiko', 'chance', 'neutral'].includes(req.query.type) ? req.query.type : null,
      });
      res.json({ items: rows, count: rows.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/trends/:id/history – Tages-Zeitreihe (Sparkline / Forecasting-Datensatz)
  app.get('/api/trends/:id/history', async (req, res) => {
    try {
      res.json({ topic: req.params.id, days: await topicHistory(req.params.id, 30) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/alerts – Risiko-/Chancen-Alerts (level=critical|important|info)
  app.get('/api/alerts', async (req, res) => {
    try {
      const rows = await queryAlerts({
        level: ['critical', 'important', 'info'].includes(req.query.level) ? req.query.level : null,
        days: parseInt(req.query.days || '7', 10),
        limit: Math.min(100, parseInt(req.query.limit || '20', 10)),
      });
      res.json({ items: rows, count: rows.length });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // GET /api/market-intelligence – das komplette Dashboard-Modul in EINEM Call
  app.get('/api/market-intelligence', async (req, res) => {
    try {
      const [all, risks, chances, critical, important] = await Promise.all([
        queryTrends({ limit: 5, minScore: 20 }),
        queryTrends({ limit: 3, riskOrOpportunity: 'risiko' }),
        queryTrends({ limit: 3, riskOrOpportunity: 'chance' }),
        queryAlerts({ level: 'critical', days: 7, limit: 5 }),
        queryAlerts({ level: 'important', days: 7, limit: 5 }),
      ]);
      // Sparkline (30 Tages-Werte) je Top-Trend anhängen
      const rising = await Promise.all(all.map(async t => ({
        ...t, sparkline: (await topicHistory(t.id, 30)).map(d => d.mentions),
      })));
      res.json({
        rising_trends: rising,
        top_risks: risks,
        opportunities: chances,
        alerts: { critical, important },
        meta: {
          computed_at: trendState.lastRun,
          window: { short_days: 7, long_days: 30 },
          topics_total: trendState.topics, spikes: trendState.spikes,
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
      trends: trendState,
      alerts: alertState,
    });
  });

  // POST /api/admin/crawl – manueller Trigger (ADMIN_KEY); danach KI-Queue → Trends → Alerts (async)
  app.post('/api/admin/crawl', async (req, res) => {
    if (!config.adminKey || req.get('X-Api-Key') !== config.adminKey) return res.status(401).json({ error: 'unauthorized' });
    const stats = await runCrawl();
    drainQueue().then(() => Promise.all([runTrendEngine(), generateAlerts()])).catch(() => {});
    res.json({ ok: true, stats });
  });

  return app;
}
