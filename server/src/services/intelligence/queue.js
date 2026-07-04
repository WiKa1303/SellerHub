// ═══ KI-Analyse-Queue (Phase 3) ═══
// Design: Die DATENBANK ist die Warteschlange (ai_analyzed_at IS NULL = offen).
// → crash-sicher ohne Redis: nach Neustart macht der Worker einfach weiter.
// → BullMQ/Redis wird erst nötig, wenn mehrere Worker-PROZESSE das Backlog teilen
//   (die Schnittstelle drainQueue() bleibt dann identisch, nur der Dispatcher wechselt).
// Async by design: der Crawler blockiert NIE auf die KI — Items sind sofort mit
// Keyword-Score sichtbar, der KI-Score ersetzt ihn, sobald er fertig ist.
import { config } from '../../core/config.js';
import { analyzeItem, aiEnabled } from './analyze.js';
import { pendingAiItems, saveAiResult, saveAiFailure } from '../../data/db.js';
import { log } from '../../core/logger.js';

/** Laufzeit-Statistik für /api/health (Logging von KI-Entscheidungen: DB + diese Zähler) */
export const aiState = {
  running: false,
  lastRun: null,
  analyzed: 0, failed: 0,
  tokensIn: 0, tokensOut: 0,
};

/**
 * Arbeitet das Backlog ab: bis zu aiMaxPerRun Items, aiConcurrency parallel.
 * Retry-Semantik: SDK retried 429/5xx intern (Backoff); wirft er trotzdem, zählt
 * ai_attempts hoch — ab aiMaxAttempts bleibt das Item dauerhaft beim Keyword-Score
 * (Kostenbremse gegen endloses Wieder-Anfassen kaputter Items).
 */
export async function drainQueue() {
  if (!aiEnabled()) return { skipped: 'KI nicht konfiguriert' };
  if (aiState.running) return { skipped: 'läuft bereits' };
  aiState.running = true;
  const started = Date.now();
  let analyzed = 0, failed = 0;
  try {
    const items = await pendingAiItems(config.aiMaxPerRun, config.aiMaxAttempts);
    if (!items.length) return { analyzed: 0, failed: 0 };
    log.info(`KI-Queue: ${items.length} Items zu analysieren`);

    // simpler Concurrency-Pool (keine Extra-Dependency)
    let idx = 0;
    async function worker() {
      while (idx < items.length) {
        const item = items[idx++];
        try {
          const { analysis, usage, model } = await analyzeItem(item);
          await saveAiResult(item.id, analysis, model, usage);
          aiState.tokensIn += usage.input; aiState.tokensOut += usage.output;
          analyzed++;
          // Entscheidungs-Log: nachvollziehbar, was die KI warum entschieden hat
          log.info(`KI [${item.id.slice(0, 8)}] score=${analysis.relevance_score} cat=${analysis.category} urg=${analysis.urgency} imp=${analysis.impact} tokens=${usage.input}/${usage.output} — ${item.title.slice(0, 60)}`);
        } catch (e) {
          failed++;
          await saveAiFailure(item.id, e.message).catch(() => {});
          log.warn(`KI-Analyse fehlgeschlagen [${item.id.slice(0, 8)}] (Versuch wird gezählt): ${e.message}`);
        }
      }
    }
    await Promise.all(Array.from({ length: Math.max(1, config.aiConcurrency) }, worker));
    return { analyzed, failed };
  } finally {
    aiState.running = false;
    aiState.lastRun = new Date().toISOString();
    aiState.analyzed += analyzed; aiState.failed += failed;
    if (analyzed || failed) log.info(`KI-Queue fertig in ${Math.round((Date.now() - started) / 1000)}s — ${analyzed} analysiert, ${failed} fehlgeschlagen`);
  }
}
