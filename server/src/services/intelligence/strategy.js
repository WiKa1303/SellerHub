// ═══ Strategy Engine (Kernmodul 3) ═══
// Verdichtet die Gesamtlage (Trends + Alerts + Chancen) zu EINEM täglichen
// Strategie-Briefing: Lage, Top-3-Prioritäten mit konkretem nächsten Schritt,
// Watchlist. Das ist die „Kontrollzentrum"-Antwort auf: Was mache ich HEUTE zuerst?
// Kostendesign: max. 1 LLM-Call pro Tag (Briefing wird in der DB gecacht).
// Ohne API-Key: deterministisches Briefing aus Alerts + Trend-Empfehlungen.
import { aiClient } from './analyze.js';
import { queryTrends, queryAlerts, getStrategyBrief, saveStrategyBrief } from '../../data/db.js';
import { config } from '../../core/config.js';
import { log } from '../../core/logger.js';

export const strategyState = { lastRun: null, generated: 0 };

const SYSTEM_PROMPT = `Du bist Chefstratege eines Amazon-FBA-Sellers im DACH-Raum.
Du bekommst die aktuelle Marktlage (Trend-Themen, kritische Alerts, Chancen) und verdichtest sie
zu einem täglichen Strategie-Briefing. Regeln:

- headline: 1 Satz — die wichtigste Erkenntnis des Tages, konkret, kein Floskel-Deutsch.
- situation: 2-3 Sätze Gesamtlage. Was bewegt sich, was bleibt ruhig.
- priorities: MAXIMAL 3, nach Wichtigkeit sortiert. Jede Priorität:
  - title: kurz · why: 1 Satz Begründung (monetär gedacht)
  - action: EIN konkreter Schritt für diese Woche (kein "beobachten")
  - type: risiko | chance · urgency: hoch | mittel | niedrig
- watchlist: 0-4 Themen, die man im Blick behalten sollte (nur Namen).
Schreibe per Du. Wenn die Lage ruhig ist, sag das ehrlich — erfinde keine Dringlichkeit.`;

const BRIEF_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string' },
    situation: { type: 'string' },
    priorities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' }, why: { type: 'string' }, action: { type: 'string' },
          type: { type: 'string', enum: ['risiko', 'chance'] },
          urgency: { type: 'string', enum: ['hoch', 'mittel', 'niedrig'] },
        },
        required: ['title', 'why', 'action', 'type', 'urgency'],
        additionalProperties: false,
      },
    },
    watchlist: { type: 'array', items: { type: 'string' } },
  },
  required: ['headline', 'situation', 'priorities', 'watchlist'],
  additionalProperties: false,
};

/** Läuft in der Intelligence-Pipeline NACH Trends+Alerts; 1 Briefing pro Tag. */
export async function updateStrategyBrief() {
  const today = new Date().toISOString().slice(0, 10);
  strategyState.lastRun = new Date().toISOString();
  if (await getStrategyBrief(today)) return { skipped: 'Briefing für heute existiert' };

  const [trends, critical, chances] = await Promise.all([
    queryTrends({ limit: 6, minScore: 10 }),
    queryAlerts({ level: 'critical', days: 7, limit: 5 }),
    queryTrends({ limit: 3, riskOrOpportunity: 'chance' }),
  ]);
  if (!trends.length && !critical.length) return { skipped: 'zu dünne Datenlage' };

  let brief, model = 'deterministisch';
  const client = aiClient();
  if (client) {
    try {
      const payload = {
        trend_themen: trends.map(t => ({ thema: t.topic_name, score: t.trend_score, wachstum: t.growth_rate + '%', einordnung: t.risk_or_opportunity, zusammenfassung: t.summary, empfohlene_aktion: t.recommended_action })),
        kritische_alerts: critical.map(a => ({ titel: a.title, typ: a.risk_type, betroffen: a.ai_affected })),
        chancen: chances.map(c => ({ thema: c.topic_name, zusammenfassung: c.summary })),
      };
      const response = await client.messages.create({
        model: config.aiModel,
        max_tokens: 1800,
        system: SYSTEM_PROMPT,
        output_config: { effort: 'low', format: { type: 'json_schema', schema: BRIEF_SCHEMA } },
        messages: [{ role: 'user', content: JSON.stringify(payload) }],
      });
      brief = JSON.parse(response.content.find(b => b.type === 'text')?.text);
      brief.priorities = (brief.priorities || []).slice(0, 3);
      model = response.model;
    } catch (e) {
      log.warn('Strategy-Briefing per KI fehlgeschlagen, nutze Fallback: ' + e.message);
    }
  }
  if (!brief) brief = fallbackBrief(trends, critical, chances);

  await saveStrategyBrief(today, brief, model);
  strategyState.generated++;
  log.info(`Strategy-Briefing ${today} erstellt (${model}): ${brief.headline.slice(0, 80)}`);
  return { generated: true, day: today };
}

/** Deterministisches Briefing ohne KI — ehrlich, aus den vorhandenen Bausteinen. */
export function fallbackBrief(trends, critical, chances) {
  const priorities = [];
  if (critical[0]) priorities.push({
    title: critical[0].title.slice(0, 90), why: `Kritischer ${critical[0].risk_type}-Alert — betrifft ${critical[0].ai_affected || 'FBA-Seller'}.`,
    action: 'Lies die Meldung und prüfe noch diese Woche, ob dein Sortiment betroffen ist.',
    type: 'risiko', urgency: 'hoch',
  });
  const risk = trends.find(t => t.risk_or_opportunity === 'risiko' && t.recommended_action);
  if (risk && priorities.length < 3) priorities.push({
    title: risk.topic_name, why: `Trend-Score ${risk.trend_score}, ${risk.growth_rate >= 0 ? '+' : ''}${risk.growth_rate} % Wachstum.`,
    action: risk.recommended_action, type: 'risiko',
    urgency: risk.spike ? 'hoch' : 'mittel',
  });
  const chance = chances[0];
  if (chance && priorities.length < 3) priorities.push({
    title: chance.topic_name, why: `Als Chance eingestuft (Score ${chance.trend_score}).`,
    action: chance.recommended_action || 'Prüfe die verlinkten Artikel auf konkrete Ansatzpunkte.',
    type: 'chance', urgency: 'mittel',
  });
  const used = new Set(priorities.map(p => p.title));
  return {
    headline: critical.length
      ? `${critical.length} kritische${critical.length === 1 ? 'r' : ''} Alert${critical.length === 1 ? '' : 's'} offen — zuerst prüfen.`
      : trends[0] ? `Stärkste Bewegung: ${trends[0].topic_name} (Score ${trends[0].trend_score}).` : 'Ruhige Marktlage.',
    situation: `${trends.length} aktive Trend-Themen, ${critical.length} kritische Alerts, ${chances.length} erkannte Chancen in den letzten 7 Tagen.`,
    priorities,
    watchlist: trends.filter(t => !used.has(t.topic_name)).slice(0, 4).map(t => t.topic_name),
  };
}
