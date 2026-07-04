// ═══ Risk Monitoring System (Phase 4, Teil 3) ═══
// Deterministische Alert-Regeln über den KI-Analysefeldern. Bewusst KEINE
// KI-Entscheidung: Ein Alert muss reproduzierbar und begründbar sein.
// Push-Vorbereitung (Phase 5): alerts.delivered_at IS NULL = Zustell-Queue.
import { itemsWithoutAlertCheck, insertAlert } from '../../data/db.js';
import { log } from '../../core/logger.js';

export const alertState = { lastRun: null, created: 0 };

/**
 * Regelwerk → Alert-Level oder null. Reihenfolge = Priorität.
 *   critical:  Gesetz/Steuer + hohe Dringlichkeit + hoher Impact (Spec-Regel)
 *              ODER konto-/geldkritische Meldung (score ≥ 85, dringend, high impact)
 *   important: dringend + spürbarer Impact, oder hoher Impact bei hoher Relevanz
 *   info:      relevante Chance mit hohem Impact (Opportunity-Hinweis, kein Alarm)
 */
export function classifyAlert(item) {
  const legal = item.ai_category === 'recht' || item.ai_category === 'steuern';
  const urgent = item.ai_urgency === 'hoch';
  const high = item.ai_impact === 'high';
  const medium = item.ai_impact === 'medium';

  if (legal && urgent && high) return { level: 'critical', riskType: item.ai_category };
  if (urgent && high && (item.ai_score ?? 0) >= 85) return { level: 'critical', riskType: item.ai_category || 'sonstiges' };
  if (urgent && (high || medium)) return { level: 'important', riskType: item.ai_category || 'sonstiges' };
  if (high && (item.ai_score ?? 0) >= 70) return { level: 'important', riskType: item.ai_category || 'sonstiges' };
  if (item.ai_opportunity === 'chance' && high && (item.ai_score ?? 0) >= 60) return { level: 'info', riskType: 'chance' };
  return null;
}

/** Prüft alle frisch analysierten Items und legt Alerts an (idempotent je Artikel). */
export async function generateAlerts() {
  const items = await itemsWithoutAlertCheck(200);
  let created = 0;
  for (const item of items) {
    const rule = classifyAlert(item);
    if (!rule) continue;
    const isNew = await insertAlert(item.id, rule.level, rule.riskType, item.title);
    if (isNew) {
      created++;
      log.info(`ALERT [${rule.level.toUpperCase()}] ${rule.riskType}: ${item.title.slice(0, 70)}`);
    }
  }
  alertState.lastRun = new Date().toISOString();
  alertState.created += created;
  if (created) log.info(`Alert-Generator: ${created} neue Alerts`);
  return { created, checked: items.length };
}
