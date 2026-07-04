// ═══ Phase-3-Tests: KI-Analyse + Queue + Personalisierung ═══
// Läuft OHNE echten API-Key: der Anthropic-Client wird gemockt (aiClient-Override).
//   node test/ai.test.js
import { newDb } from 'pg-mem';
import { initDb, insertItem, pendingAiItems, queryNews } from '../src/db.js';
import { aiClient, analyzeItem } from '../src/ai/analyze.js';
import { drainQueue, aiState } from '../src/ai/queue.js';
import { parseProfile, personalizedScore, rankForProfile } from '../src/profile.js';
import { buildApi } from '../src/api.js';
import { config } from '../src/config.js';

let pass = 0, fail = 0;
function t(name, cond, extra) {
  console.log((cond ? '✅' : '❌') + ' ' + name + (extra !== undefined ? ' → ' + extra : ''));
  cond ? pass++ : fail++;
}

// ── Mock-Client: liefert je nach Inhalt unterschiedliche, realistische Analysen ──
let apiCalls = 0, failNextCalls = 0;
const mockClient = {
  messages: {
    create: async (req) => {
      apiCalls++;
      if (failNextCalls > 0) { failNextCalls--; throw new Error('simulierter API-Fehler (529)'); }
      const text = req.messages[0].content;
      let analysis;
      if (/GPSR|Frist|Gebühr/i.test(text)) {
        analysis = { relevance_score: 88, category: 'recht', urgency: 'hoch', impact: 'high',
          reasoning: 'Gesetzliche Frist mit direktem Handlungsbedarf für FBA-Seller.',
          summary: ['Prüfe bis zur Frist alle betroffenen Listings.', 'Dokumentiere die Produktsicherheits-Angaben.', 'Kläre offene Fälle mit deinem Steuerberater.'] };
      } else if (/PPC|Werbe/i.test(text)) {
        analysis = { relevance_score: 62, category: 'ppc', urgency: 'mittel', impact: 'medium',
          reasoning: 'Betrifft Werbekosten, aber ohne Frist.',
          summary: ['Beobachte deine ACOS-Entwicklung.', 'Teste die neue Gebotsstrategie in einer Kampagne.', 'Kein sofortiger Handlungsbedarf.'] };
      } else {
        analysis = { relevance_score: 18, category: 'sonstiges', urgency: 'niedrig', impact: 'low',
          reasoning: 'Kein FBA-Bezug erkennbar.', summary: ['Für FBA-Seller ohne praktische Bedeutung.'] };
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(analysis) }],
        usage: { input_tokens: 820, output_tokens: 210 },
        model: 'claude-opus-4-8', stop_reason: 'end_turn',
      };
    },
  },
};
aiClient(mockClient); // Override aktivieren → aiEnabled() = true

// ── Setup: pg-mem + Test-Items ──
const mem = newDb();
const { Pool } = mem.adapters.createPg();
await initDb(new Pool());

const now = new Date().toISOString();
const mk = (id, title, extra = {}) => ({
  id, title, titleNorm: title.toLowerCase(), summary: 'Anriss zu: ' + title,
  url: 'https://example.de/' + id, source: 'Testquelle', publishDate: now,
  country: 'DE', type: 'news', relevanceScore: 40, eventStart: null, ...extra,
});
await insertItem(mk('item-recht', 'GPSR-Frist: neue Gebühr für Produktsicherheit ab 13.12.'));
await insertItem(mk('item-ppc', 'Amazon ändert PPC-Gebotsstrategien für Werbekampagnen'));
await insertItem(mk('item-egal', 'Neues Rezept für Apfelkuchen im Herbst'));

// ── 1) analyzeItem: Struktur + Nachschärfung ──
const one = await analyzeItem({ id: 'x', title: 'GPSR Frist', summary: 's', source: 'q', publish_date: now });
t('analyzeItem liefert Spec-Struktur', one.analysis.relevance_score === 88 && one.analysis.category === 'recht'
  && one.analysis.urgency === 'hoch' && one.analysis.impact === 'high'
  && typeof one.analysis.reasoning === 'string' && Array.isArray(one.analysis.summary));
t('analyzeItem meldet Token-Verbrauch', one.usage.input === 820 && one.usage.output === 210);

// ── 2) Queue: analysiert Backlog, speichert in DB ──
const q1 = await drainQueue();
t('Queue analysiert alle 3 Items', q1.analyzed === 3 && q1.failed === 0, JSON.stringify(q1));
t('Queue-Statistik für /health', aiState.analyzed === 3 && aiState.tokensIn === 820 * 3);
const newsAfter = await queryNews({ limit: 10 });
const recht = newsAfter.find(n => n.id === 'item-recht');
t('KI-Felder in DB gespeichert', recht.ai_score === 88 && recht.ai_category === 'recht' && recht.ai_urgency === 'hoch');
t('ai_summary als Array deserialisiert', Array.isArray(recht.ai_summary) && recht.ai_summary.length === 3);
t('Sortierung nutzt KI-Score (recht zuerst)', newsAfter[0].id === 'item-recht');
t('Irrelevantes Item fällt unter Default-Schwelle', !(await queryNews({ limit: 10, minScore: 25 })).some(n => n.id === 'item-egal'));

// ── 3) Retry/Kostenbremse: Fehler zählen hoch, nach maxAttempts endgültig raus ──
await insertItem(mk('item-fail', 'Amazon Gebühr Test-Fehlerfall'));
failNextCalls = 99; // Mock wirft ab jetzt
for (let i = 0; i < config.aiMaxAttempts; i++) await drainQueue();
failNextCalls = 0;
const pendingAfter = await pendingAiItems(50, config.aiMaxAttempts);
t('Nach ' + config.aiMaxAttempts + ' Fehlversuchen dauerhaft raus (Keyword-Score bleibt)', !pendingAfter.some(i => i.id === 'item-fail'));

// ── 4) Profil & Ranking ──
const prof = parseProfile({ seller_type: 'arbitrage', revenue: 'starter', markets: 'DE,AT', interests: 'recht,steuern,quatsch' });
t('parseProfile validiert (unbekanntes Interesse verworfen)', prof.sellerType === 'arbitrage' && prof.interests.length === 2 && prof.markets.join(',') === 'DE,AT');
const psA = personalizedScore(recht, prof);
// 88 (KI) +10 (urgency hoch) +10 (impact high) +12 (Interesse recht) +8 (arbitrage×recht) +5 (Markt DE) = 133
t('personalizedScore: alle Boosts korrekt', psA.score === 133, psA.score + ' | ' + psA.reasons.join(' · '));
t('„Warum sehe ich das?" erklärt Boosts', psA.reasons.some(r => r.includes('Interesse')) && psA.reasons.some(r => r.includes('dringend')));
const noAi = personalizedScore({ relevance_score: 40, ai_score: null }, prof);
t('Fallback auf Keyword-Score ohne KI-Analyse', noAi.score === 40 && noAi.reasons[0].includes('Keyword'));
// Interesse dreht die Reihenfolge: ppc-Fan sieht PPC vor Recht? 62+4+4+12+0=82 vs 88+20=108 → nein. Teste mit reinem Interessen-Gap:
const itemX = { id: 'x', ai_score: 60, ai_category: 'trends', ai_urgency: 'niedrig', ai_impact: 'low', relevance_score: 0, publish_date: now, country: 'DE' };
const itemY = { id: 'y', ai_score: 55, ai_category: 'ppc', ai_urgency: 'niedrig', ai_impact: 'low', relevance_score: 0, publish_date: now, country: 'DE' };
const ranked = rankForProfile([itemX, itemY], parseProfile({ interests: 'ppc', seller_type: 'private_label' }));
t('Interessen-Match dreht Reihenfolge (55er PPC vor 60er Trend)', ranked[0].id === 'y', ranked.map(r => r.id + ':' + r.personalized_score).join(' '));

// ── 5) API: personalisierter Feed + Feedback ──
const app = buildApi();
const srv = app.listen(0);
const base = 'http://127.0.0.1:' + srv.address().port;

const plain = await (await fetch(base + '/api/dashboard-feed')).json();
t('Dashboard ohne Profil: personalized=false', plain.meta.personalized === false && plain.meta.ai !== null);
const pers = await (await fetch(base + '/api/dashboard-feed?seller_type=arbitrage&interests=recht&markets=DE')).json();
t('Dashboard mit Profil: personalized=true + why[]', pers.meta.personalized === true && Array.isArray(pers.news[0].why) && pers.news[0].personalized_score > 0);
t('Personalisiert: Recht-Item auf Platz 1', pers.news[0].id === 'item-recht', pers.news[0].personalized_score);
const fb = await (await fetch(base + '/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'item-recht', vote: 1 }) })).json();
t('POST /api/feedback speichert 👍', fb.ok === true);
const fbBad = await fetch(base + '/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'x', vote: 5 }) });
t('Feedback validiert vote', fbBad.status === 400);
const health = await (await fetch(base + '/api/health')).json();
t('Health zeigt KI-Status + Token-Verbrauch', health.ai.enabled === true && health.ai.tokensIn > 0);

srv.close();
console.log(`\n${pass} bestanden, ${fail} fehlgeschlagen · ${apiCalls} Mock-API-Calls`);
process.exit(fail ? 1 : 0);
