// ═══ REST-API (readonly + Admin-Trigger) ═══
import express from 'express';
import { queryNews, queryEvents, saveFeedback, queryTrends, queryAlerts, topicHistory, latestStrategyBrief, queryForecasts } from '../data/db.js';
import { runCrawl, crawlState } from '../services/crawler/run.js';
import { aiEnabled } from '../core/ai-client.js';
import { AI_MODULES, moduleState, runIntelligencePipeline } from '../services/intelligence/registry.js';
import { parseProfile, rankForProfile } from '../services/feed/profile.js';
import { SOURCES } from '../data/sources.js';
import { config } from '../core/config.js';
import { log } from '../core/logger.js';
import { renderInternal } from './internal.js';
import { registerUser, loginUser, logoutSession, changePassword, authMiddleware } from '../services/auth/index.js';
import { listSyncData, applySyncBatch } from '../services/sync/index.js';
import { proxyText, proxyImage } from '../services/ai-proxy/index.js';
import { importProduct, proxyImage as proxyImportImage } from '../services/import/index.js';

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
  // Authorization für Konten/Sync (Bearer-Token), PUT für den Batch-Upsert des Syncs.
  app.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Headers', 'Content-Type, X-Api-Key, X-Tenant-Id, Authorization');
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    // Kontingent-Header des KI-Proxys muss im Browser lesbar sein (CORS versteckt ihn sonst)
    res.set('Access-Control-Expose-Headers', 'X-Quota-Remaining');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  // Multi-Tenant-Seam: Tenant wird HIER aufgelöst (heute immer 'public').
  // Bei Accounts (v2): Auth-Token → tenant_id, und req.tenantId wandert als
  // Filter in die data/-Repositories. Siehe ARCHITEKTUR.md → Multi-Tenancy.
  app.use((req, res, next) => { req.tenantId = req.get('X-Tenant-Id') || 'public'; next(); });
  // Lese-Antworten 5 min cachebar → CDN/Proxy entkoppelt die Last
  app.use((req, res, next) => { if (req.method === 'GET') res.set('Cache-Control', 'public, max-age=300'); next(); });

  // GET /internal – interne Debug-Oberfläche (read-only, s. api/internal.js)
  app.get('/internal', renderInternal);

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

  // GET /api/forecast – Phase 5: Top-N 7-Tage-Prognosen (Richtung/Konfidenz/reasoning je Topic)
  app.get('/api/forecast', async (req, res) => {
    try {
      const items = await queryForecasts({ limit: Math.min(20, parseInt(req.query.limit || '10', 10)) });
      res.json({
        items, count: items.length,
        meta: {
          computed_at: moduleState('forecast').lastRun,
          horizon_days: 7,
          hint: moduleState('forecast').note || null, // optionaler KI-Seller-Hinweis (null ohne Key)
        },
      });
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

  // ═══ Konten & Daten-Sync (KONZEPT-Konten-Sync.md, Modul 1) ═══
  // Nur Delegation an services/auth + services/sync; erwartbare Fehler kommen als
  // {status, error} aus dem Service, alles Unerwartete über fail() (keine Interna-Leaks).
  // Antworten mit Kontodaten sind privat → Cache-Control no-store (überschreibt den GET-Default).

  // POST /api/auth/register – {email, password, displayName, inviteCode}
  app.post('/api/auth/register', express.json(), async (req, res) => {
    try {
      const r = await registerUser(req.body || {});
      if (r.error) return res.status(r.status).json({ error: r.error });
      res.status(201).json({ user: r.user });
    } catch (e) { fail(res, e); }
  });

  // POST /api/auth/login – {email, password} → {token, user}
  app.post('/api/auth/login', express.json(), async (req, res) => {
    try {
      const r = await loginUser(req.body || {});
      if (r.error) return res.status(r.status).json({ error: r.error });
      res.json({ token: r.token, user: r.user });
    } catch (e) { fail(res, e); }
  });

  // POST /api/auth/logout (Bearer) – Session serverseitig widerrufen
  app.post('/api/auth/logout', authMiddleware, async (req, res) => {
    try {
      await logoutSession(req.sessionTokenHash);
      res.json({ ok: true });
    } catch (e) { fail(res, e); }
  });

  // GET /api/auth/me (Bearer) – eigenes Konto
  app.get('/api/auth/me', authMiddleware, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ user: req.user });
  });

  // POST /api/auth/change-password (Bearer) – {currentPassword, newPassword}
  app.post('/api/auth/change-password', authMiddleware, express.json(), async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body || {};
      const r = await changePassword(req.user, currentPassword, newPassword);
      if (r.error) return res.status(r.status).json({ error: r.error });
      res.json({ ok: true });
    } catch (e) { fail(res, e); }
  });

  // GET /api/sync (Bearer) – alle {key, value, updated_at, version} des Users
  app.get('/api/sync', authMiddleware, async (req, res) => {
    try {
      res.set('Cache-Control', 'no-store');
      const items = await listSyncData(req.user.id);
      res.json({ items, count: items.length });
    } catch (e) { fail(res, e); }
  });

  // PUT /api/sync (Bearer) – Batch-Upsert {items:[{key, value, baseVersion}]}
  // 409 = Versions-Konflikt (Server-Stand der Konflikt-Keys beiliegend) · 413 = Größenlimit.
  // Body-Limit 12 MB: über dem 10-MB-Kontolimit, damit der 413 aus UNSERER Prüfung kommt
  // (ehrliche deutsche Fehlermeldung statt generischem Parser-Abbruch).
  app.put('/api/sync', authMiddleware, express.json({ limit: '12mb' }), async (req, res) => {
    try {
      res.set('Cache-Control', 'no-store');
      const r = await applySyncBatch(req.user.id, (req.body || {}).items);
      if (r.error && r.status !== 409) return res.status(r.status).json({ error: r.error });
      if (r.status === 409) return res.status(409).json({ error: r.error, conflicts: r.conflicts, applied: r.applied });
      res.json({ ok: true, items: r.items });
    } catch (e) { fail(res, e); }
  });

  // ═══ KI-Proxy (KONZEPT-KI-Proxy.md, Modul 2) ═══
  // Nur Delegation an services/ai-proxy; erwartbare Fehler kommen als {status, error}
  // aus dem Service (400/413/429/502/503), alles Unerwartete über fail().
  // X-Quota-Remaining bei jedem gezählten Call (auch 429/502 — Konzept: „bei jedem Call").

  function sendAiResult(res, r, payload) {
    res.set('Cache-Control', 'no-store');
    if (r.remaining !== undefined) res.set('X-Quota-Remaining', String(r.remaining));
    if (r.error) return res.status(r.status).json({ error: r.error });
    res.json(payload(r));
  }

  // POST /api/ai/text (Bearer) – {prompt} → {text}
  app.post('/api/ai/text', authMiddleware, express.json(), async (req, res) => {
    try {
      const r = await proxyText({ prompt: (req.body || {}).prompt, userId: req.user.id });
      sendAiResult(res, r, x => ({ text: x.text }));
    } catch (e) { fail(res, e); }
  });

  // POST /api/ai/image (Bearer) – {parts, generationConfig?} → {mimeType, dataBase64}
  // Body-Limit 25 MB NUR hier (Produktfotos inline als Base64) — nicht global.
  // Parser-Limit knapp über dem 25-MB-parts-Limit des Services, damit der 413 aus
  // UNSERER Prüfung kommt (ehrliche deutsche Meldung statt Parser-Abbruch — Muster /api/sync).
  app.post('/api/ai/image', authMiddleware, express.json({ limit: '26mb' }), async (req, res) => {
    try {
      const { parts, generationConfig } = req.body || {};
      const r = await proxyImage({ parts, generationConfig, userId: req.user.id });
      sendAiResult(res, r, x => ({ mimeType: x.mimeType, dataBase64: x.dataBase64 }));
    } catch (e) { fail(res, e); }
  });

  // ═══ Amazon-Import (KONZEPT-Import-Listing.md, Modul 3) ═══
  // Nur Delegation an services/import; erwartbare Fehler kommen als {status, error}
  // aus dem Service (400/403/429/502), alles Unerwartete über fail().

  // POST /api/import/amazon (Bearer) – {urlOrAsin, marketplace?='de'} → geparstes Produkt
  app.post('/api/import/amazon', authMiddleware, express.json(), async (req, res) => {
    try {
      const { urlOrAsin, marketplace } = req.body || {};
      const r = await importProduct({ urlOrAsin, ...(marketplace !== undefined ? { marketplace } : {}), userId: req.user.id });
      res.set('Cache-Control', 'no-store');
      if (r.error) return res.status(r.status).json({ error: r.error });
      const { status, ...payload } = r;
      res.json(payload);
    } catch (e) { fail(res, e); }
  });

  // GET /api/import/amazon-image?url=… (Bearer) – Bild-Durchreiche (Whitelist, max. 8 MB).
  // Erfolg streamt die Bytes mit Original-Content-Type; 1 h privat cachebar (Bildstudio
  // lädt dasselbe Bild mehrfach — Browser-Cache statt erneuter Durchreiche).
  app.get('/api/import/amazon-image', authMiddleware, async (req, res) => {
    try {
      const r = await proxyImportImage(req.query.url);
      if (r.error) {
        res.set('Cache-Control', 'no-store');
        return res.status(r.status).json({ error: r.error });
      }
      res.set('Cache-Control', 'private, max-age=3600');
      res.type(r.contentType).send(r.buffer);
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
