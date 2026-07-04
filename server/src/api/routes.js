// ═══ REST-API (readonly + Admin-Trigger) ═══
import express from 'express';
import { queryNews, queryEvents, saveFeedback, queryTrends, queryAlerts, topicHistory, latestStrategyBrief } from '../data/db.js';
import { runCrawl, crawlState } from '../services/crawler/run.js';
import { aiEnabled } from '../core/ai-client.js';
import { AI_MODULES, moduleState, runIntelligencePipeline } from '../services/intelligence/registry.js';
import { parseProfile, rankForProfile } from '../services/feed/profile.js';
import { SOURCES } from '../data/sources.js';
import { config } from '../core/config.js';
import { log } from '../core/logger.js';

// ═══ Error-Handling-Standard ═══
// Interna (SQL-/Stack-Details) gehören ins Log, NIE in die HTTP-Antwort.
// Erwartbare Fehler (400/404) antworten explizit in den Routen; alles andere → fail().
let reqSeq = 0;
function fail(res, e) {
  const ref = 'e' + Date.now().toString(36) + '-' + (++reqSeq);
  log.error(`API-Fehler [${ref}]:`, e.stack || e.message);
  res.status(500).json({ error: 'Interner Fehler', ref });
}

export function buildApi() {
  const app = express();
  app.disable('x-powered-by');

  // CORS: Inhalte sind öffentlich, das SellerHub-Frontend (file:// oder eigene Domain) darf lesen.
  app.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Headers', 'Content-Type, X-Api-Key, X-Tenant-Id');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  // Multi-Tenant-Seam: Tenant wird HIER aufgelöst (heute immer 'public').
  // Bei Accounts (v2): Auth-Token → tenant_id, und req.tenantId wandert als
  // Filter in die data/-Repositories. Siehe ARCHITEKTUR.md → Multi-Tenancy.
  app.use((req, res, next) => { req.tenantId = req.get('X-Tenant-Id') || 'public'; next(); });
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
    } catch (e) { fail(res, e); }
  });

  // GET /api/events – kommende Events (Kalender-Sortierung)
  app.get('/api/events', async (req, res) => {
    try {
      const rows = await queryEvents({
        limit: Math.min(100, parseInt(req.query.limit || '20', 10)),
        days: parseInt(req.query.days || '180', 10),
      });
      res.json({ items: rows, count: rows.length });
    } catch (e) { fail(res, e); }
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
          ai: aiEnabled() ? { lastRun: moduleState('relevance').lastRun, analyzed: moduleState('relevance').analyzed } : null,
          sources: SOURCES.map(s => ({ id: s.id, name: s.name, region: s.region })),
        },
      });
    } catch (e) { fail(res, e); }
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
    } catch (e) { fail(res, e); }
  });

  // GET /api/trends/:id/history – Tages-Zeitreihe (Sparkline / Forecasting-Datensatz)
  app.get('/api/trends/:id/history', async (req, res) => {
    try {
      res.json({ topic: req.params.id, days: await topicHistory(req.params.id, 30) });
    } catch (e) { fail(res, e); }
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
    } catch (e) { fail(res, e); }
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
      const brief = await latestStrategyBrief();
      res.json({
        rising_trends: rising,
        top_risks: risks,
        opportunities: chances,
        alerts: { critical, important },
        strategy: brief ? { day: brief.day, ...brief.brief } : null,
        meta: {
          computed_at: moduleState('trends').lastRun,
          window: { short_days: 7, long_days: 30 },
          topics_total: moduleState('trends').topics, spikes: moduleState('trends').spikes,
        },
      });
    } catch (e) { fail(res, e); }
  });

  // POST /api/feedback – 👍/👎 zu einem Item ({id, vote: 1|-1}); Basis für Eval-/Fine-Tuning-Daten
  app.post('/api/feedback', express.json(), async (req, res) => {
    try {
      const { id, vote } = req.body || {};
      if (!id || ![1, -1].includes(vote)) return res.status(400).json({ error: 'id und vote (1|-1) erforderlich' });
      const ok = await saveFeedback(String(id), vote, req.tenantId);
      res.status(ok ? 200 : 404).json({ ok });
    } catch (e) { fail(res, e); }
  });

  // GET /api/strategy/brief – Strategy Engine: das aktuelle Tages-Briefing
  app.get('/api/strategy/brief', async (req, res) => {
    try {
      const b = await latestStrategyBrief();
      if (!b) return res.status(404).json({ error: 'noch kein Briefing erstellt' });
      res.json({ day: b.day, model: b.model, created_at: b.created_at, ...b.brief });
    } catch (e) { fail(res, e); }
  });

  // GET /api/health – Monitoring: alle Intelligence-Module aus der Registry
  app.get('/api/health', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const modules = Object.fromEntries(AI_MODULES.map(m => [m.id, m.state]));
    res.json({
      ok: true,
      crawler: { lastRun: crawlState.lastRun, running: crawlState.running, stats: crawlState.lastStats },
      ai: { enabled: aiEnabled(), model: config.aiModel },
      modules,
    });
  });

  // POST /api/admin/crawl – manueller Trigger (ADMIN_KEY); danach die komplette Intelligence-Pipeline (async)
  app.post('/api/admin/crawl', async (req, res) => {
    if (!config.adminKey || req.get('X-Api-Key') !== config.adminKey) return res.status(401).json({ error: 'unauthorized' });
    const stats = await runCrawl();
    runIntelligencePipeline().catch(() => {});
    res.json({ ok: true, stats });
  });

  return app;
}
