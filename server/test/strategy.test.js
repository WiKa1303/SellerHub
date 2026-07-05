// ═══ Plattform-Tests: AI-Modul-Registry + Strategy Engine ═══
//   node test/strategy.test.js   (ohne API-Key: Claude wird gemockt)
import { newDb } from 'pg-mem';
import { initDb, insertItem, saveAiResult, getStrategyBrief, latestStrategyBrief } from '../src/data/db.js';
import { aiClient } from '../src/services/intelligence/analyze.js';
import { AI_MODULES, runIntelligencePipeline } from '../src/services/intelligence/registry.js';
import { fallbackBrief, updateStrategyBrief } from '../src/services/intelligence/strategy.js';
import { buildApi } from '../src/api/routes.js';
import { recentAiCalls } from '../src/data/db.js';

let pass = 0, fail = 0;
function t(name, cond, extra) {
  console.log((cond ? '✅' : '❌') + ' ' + name + (extra !== undefined ? ' → ' + extra : ''));
  cond ? pass++ : fail++;
}
const daysAgo = n => new Date(Date.now() - n * 864e5).toISOString();

// ── Mock: unterscheidet Interpretations- und Strategie-Calls am System-Prompt ──
let strategyCalls = 0, strategyFails = 0;
aiClient({
  messages: {
    create: async (req) => {
      const sys = String(req.system);
      if (sys.includes('Chefstratege')) {
        strategyCalls++;
        if (strategyFails > 0) { strategyFails--; throw new Error('simulierter Ausfall'); }
        return { content: [{ type: 'text', text: JSON.stringify({
          headline: 'GPSR-Frist dominiert die Woche — zuerst Konformität sichern.',
          situation: 'Regulatorik zieht an, sonst ruhig.',
          priorities: [{ title: 'GPSR-Check', why: 'Frist mit Sperr-Risiko.', action: 'Top-10-ASINs prüfen.', type: 'risiko', urgency: 'hoch' }],
          watchlist: ['Kaufland Expansion'],
        }) }], usage: { input_tokens: 900, output_tokens: 300 }, model: 'claude-opus-4-8' };
      }
      if (sys.includes('Prognose-Analyst')) {
        return { content: [{ type: 'text', text: JSON.stringify({ hint: 'Wichtigste Prognose: GPSR steigt weiter — Konformität diese Woche prüfen.' }) }],
          usage: { input_tokens: 150, output_tokens: 60 }, model: 'claude-opus-4-8' };
      }
      if (sys.includes('Marktanalyst')) {
        const payload = JSON.parse(req.messages[0].content);
        return { content: [{ type: 'text', text: JSON.stringify({ topics: payload.map(p => ({
          id: p.id, summary: 'Lage zu ' + p.thema, recommended_action: 'Schritt für ' + p.thema,
          risk_or_opportunity: /kaufland/i.test(p.thema) ? 'chance' : 'risiko' })) }) }],
          usage: { input_tokens: 400, output_tokens: 200 }, model: 'claude-opus-4-8' };
      }
      throw new Error('unerwarteter Analyse-Call (Items sind vor-analysiert)');
    },
  },
});

// ── Registry-Vertrag ──
t('Registry: 6 Kernmodule in korrekter Reihenfolge (forecast nach trends, dispatch nach alerts)',
  AI_MODULES.map(m => m.id).join(',') === 'relevance,trends,forecast,alerts,strategy,dispatch');
t('Registry: jedes Modul hat run() + state', AI_MODULES.every(m => typeof m.run === 'function' && m.state && m.description));

// ── Setup: pg-mem + vor-analysierte Items (relevance-Modul findet nichts Offenes) ──
const mem = newDb();
const { Pool } = mem.adapters.createPg();
await initDb(new Pool());
let seq = 0;
async function seed(topic, { age = 1, source = 'Wortfilter.de', score = 85, cat = 'recht', urg = 'hoch', imp = 'high', opp = 'risiko' } = {}) {
  const id = 'it-' + (++seq);
  await insertItem({ id, title: topic + ' Meldung ' + seq, titleNorm: topic + ' ' + seq, summary: 's',
    url: 'https://x.de/' + id, source, publishDate: daysAgo(age), country: 'DE', type: 'news', relevanceScore: 50, eventStart: null });
  await saveAiResult(id, { relevance_score: score, category: cat, urgency: urg, impact: imp, reasoning: 'r',
    summary: ['Kernpunkt zu ' + topic], topic, opportunity: opp, affected: 'alle FBA-Seller' }, 'claude-opus-4-8', { input: 800, output: 200 });
}
await seed('gpsr-produktsicherheit', { age: 1 });
await seed('gpsr-produktsicherheit', { age: 2, source: 'shopanbieter.de' });
await seed('gpsr-produktsicherheit', { age: 4 });
await seed('kaufland-expansion', { age: 2, cat: 'trends', urg: 'niedrig', opp: 'chance', score: 64, source: 't3n' });
await seed('kaufland-expansion', { age: 5, cat: 'trends', urg: 'niedrig', opp: 'chance', score: 60 });

// ── Pipeline: alle Module laufen, Fehler isoliert ──
const results = await runIntelligencePipeline();
t('Pipeline führt alle 6 Module aus', Object.keys(results).join(',') === 'relevance,trends,forecast,alerts,strategy,dispatch', JSON.stringify(results));
t('Strategy: Briefing erzeugt (KI-Pfad)', results.strategy.generated === true && strategyCalls === 1);
const today = new Date().toISOString().slice(0, 10);
const saved = await getStrategyBrief(today);
t('Briefing in DB gecacht', saved && saved.brief.headline.includes('GPSR') && saved.brief.priorities.length === 1);
const again = await updateStrategyBrief();
t('Kostenbremse: max. 1 Briefing/Tag (2. Lauf übersprungen)', again.skipped && strategyCalls === 1, JSON.stringify(again));

// ── Prompt-Telemetrie: Interpretation + Strategie als eigene Keys protokolliert ──
const keys = (await recentAiCalls(20)).map(c => c.prompt_key);
t('ai_calls enthält trend_impact_interpretation + strategy_brief', keys.includes('trend_impact_interpretation') && keys.includes('strategy_brief'), keys.join(','));

// ── Fallback ohne KI: deterministisch + ehrlich ──
const fb = fallbackBrief(
  [{ topic_name: 'Gpsr Produktsicherheit', trend_score: 84, growth_rate: 500, risk_or_opportunity: 'risiko', recommended_action: 'ASINs prüfen.', spike: 1 },
   { topic_name: 'Ruhiges Thema', trend_score: 20, growth_rate: 0, risk_or_opportunity: 'neutral' }],
  [{ title: 'GPSR-Alert', risk_type: 'recht', ai_affected: 'alle FBA-Seller' }],
  [{ topic_name: 'Kaufland Expansion', trend_score: 40, recommended_action: 'Listing testen.' }]);
t('Fallback: max. 3 Prioritäten, Critical zuerst', fb.priorities.length === 3 && fb.priorities[0].type === 'risiko' && fb.priorities[0].urgency === 'hoch');
t('Fallback: Watchlist ohne Dubletten zu Prioritäten', !fb.watchlist.includes('Gpsr Produktsicherheit') || !fb.priorities.some(p => p.title === 'Gpsr Produktsicherheit'));

// ── KI-Ausfall → Fallback-Briefing statt gar keins ──
// (neuer Tag simuliert: Briefing von heute löschen)
await (await import('../src/data/db.js')).db().query(`DELETE FROM strategy_briefs`);
strategyFails = 1;
const r2 = await updateStrategyBrief();
const b2 = await latestStrategyBrief();
t('KI-Ausfall: deterministisches Fallback-Briefing gespeichert', r2.generated === true && b2.model === 'deterministisch', b2.model);

// ── API ──
const app = buildApi();
const srv = app.listen(0);
const base = 'http://127.0.0.1:' + srv.address().port;
const brief = await (await fetch(base + '/api/strategy/brief')).json();
t('GET /api/strategy/brief liefert Briefing-Struktur', !!brief.headline && Array.isArray(brief.priorities) && Array.isArray(brief.watchlist));
const mi = await (await fetch(base + '/api/market-intelligence')).json();
t('Market Intelligence enthält Strategy-Briefing', mi.strategy && !!mi.strategy.headline);
const health = await (await fetch(base + '/api/health')).json();
t('Health listet alle Registry-Module', Object.keys(health.modules).join(',') === 'relevance,trends,forecast,alerts,strategy,dispatch');
srv.close();

console.log(`\n${pass} bestanden, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);
