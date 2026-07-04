// ═══ Business Impact Interpretation Layer (Phase 4, Teil 2) ═══
// Beantwortet pro Trend-Thema: Was heißt das für Seller? Wer ist betroffen?
// Wie dringend? Monetäre Chance oder Risiko? → summary + recommended_action.
// Kostendesign: EIN Call für bis zu 8 Themen (Array-Output), nicht 8 Calls.
// Ohne API-Key: deterministischer Fallback aus den vorhandenen Artikel-Analysen.
import { aiClient } from '../../core/ai-client.js';
import { config } from '../../core/config.js';
import { log } from '../../core/logger.js';

const SYSTEM_PROMPT = `Du bist Marktanalyst für Amazon-FBA-Seller im DACH-Raum.
Du bekommst Trend-Themen mit Kennzahlen und Beleg-Artikeln. Interpretiere jedes Thema unternehmerisch:

- summary: 2 Sätze. Satz 1: Was passiert gerade (die Marktbewegung, nicht die Einzelmeldung).
  Satz 2: Wer ist betroffen und was steht monetär auf dem Spiel (Chance ODER Risiko, konkret).
- recommended_action: GENAU EIN konkreter nächster Schritt, den ein Seller diese Woche tun kann.
  Kein "beobachten Sie die Lage" — sondern z.B. "Prüfe deine Top-10-ASINs auf GPSR-Konformität und dokumentiere die Nachweise."
- risk_or_opportunity: risiko | chance | neutral (monetäre Gesamtwirkung für den typischen Seller).

Schreibe direkt, per Du, ohne Floskeln.`;

const INTERPRET_SCHEMA = {
  type: 'object',
  properties: {
    topics: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          summary: { type: 'string' },
          recommended_action: { type: 'string' },
          risk_or_opportunity: { type: 'string', enum: ['risiko', 'chance', 'neutral'] },
        },
        required: ['id', 'summary', 'recommended_action', 'risk_or_opportunity'],
        additionalProperties: false,
      },
    },
  },
  required: ['topics'],
  additionalProperties: false,
};

// Fallback-Aktionen je Kategorie (wenn keine KI verfügbar): generisch, aber ehrlich brauchbar
const FALLBACK_ACTION = {
  recht: 'Prüfe deine Listings auf Konformität mit der Änderung und dokumentiere die Nachweise.',
  steuern: 'Kläre mit deinem Steuerberater, ob deine Konstellation betroffen ist.',
  logistik: 'Rechne die Änderung im Gebühren-Rechner auf deine Top-Produkte um.',
  ppc: 'Prüfe deine Kampagnen-Einstellungen und teste die Änderung mit kleinem Budget.',
  produktrecherche: 'Prüfe im Seller-Radar, ob deine Nischen-Kandidaten betroffen sind.',
  events: 'Prüfe Termin und Ticketpreise, wenn das Event für dein Netzwerk relevant ist.',
  trends: 'Beobachte die Kategorie 2 Wochen und prüfe dann eine Recherche im Produkt-Radar.',
};

/** @returns {Object<string,{summary,recommended_action,risk_or_opportunity}>} je Topic-Id */
export async function interpretTopics(topics) {
  if (!topics.length) return {};
  const client = aiClient();

  if (!client) return fallbackInterpretation(topics);

  try {
    const payload = topics.map(t => ({
      id: t.id, thema: t.topicName,
      kennzahlen: `${t.m7} Erwähnungen in 7 Tagen (30 Tage: ${t.m30}), Wachstum ${t.growthRate}%, ${t.sourceCount} Quellen${t.spike ? ', SPIKE' : ''}`,
      artikel: t.items.slice(0, 4).map(i => ({ titel: i.title, kernpunkt: (i.ai_summary || [])[0] || '', betroffen: i.ai_affected || '' })),
    }));
    const response = await client.messages.create({
      model: config.aiModel,
      max_tokens: 2500,
      system: SYSTEM_PROMPT,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: INTERPRET_SCHEMA } },
      messages: [{ role: 'user', content: JSON.stringify(payload) }],
    });
    const text = response.content.find(b => b.type === 'text')?.text;
    const parsed = JSON.parse(text);
    const out = {};
    for (const t of parsed.topics) out[t.id] = t;
    log.info(`Impact-Interpretation: ${parsed.topics.length} Themen, ${response.usage.input_tokens}/${response.usage.output_tokens} Tokens`);
    return out;
  } catch (e) {
    log.warn('Impact-Interpretation fehlgeschlagen, nutze Fallback: ' + e.message);
    return fallbackInterpretation(topics);
  }
}

function fallbackInterpretation(topics) {
  const out = {};
  for (const t of topics) {
    const top = t.items[0] || {};
    const bullet = (top.ai_summary || [])[0];
    out[t.id] = {
      summary: `${t.topicName}: ${t.m7} Meldungen in 7 Tagen (${t.growthRate >= 0 ? '+' : ''}${t.growthRate} %). ${bullet || ''}`.trim(),
      recommended_action: FALLBACK_ACTION[top.ai_category] || 'Lies die verlinkten Artikel und prüfe die Auswirkung auf dein Sortiment.',
      risk_or_opportunity: t.riskOrOpportunity,
    };
  }
  return out;
}
