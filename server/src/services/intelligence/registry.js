// ═══ AI-Modul-Registry — DER Erweiterungspunkt der Plattform ═══
// Jedes Intelligence-Modul registriert sich hier mit {id, description, run}.
// Die Pipeline führt die Module IN REIHENFOLGE aus (relevance muss vor trends/
// alerts laufen); ein Fehler in einem Modul stoppt die anderen NICHT.
//
// ── Neues AI-Modul hinzufügen (Checkliste, s. auch server/CLAUDE.md) ──
// 1. Datei unter services/intelligence/<modul>.js: exportiert async run() + <modul>State
// 2. Degradations-Pfad: ohne ANTHROPIC_API_KEY muss run() sinnvoll degradieren (Fallback/Skip)
// 3. Kostenbremse: eigene Obergrenze je Lauf (Vorbild: AI_MAX_PER_RUN, 1-Call-Batching)
// 4. Hier registrieren (Position = Ausführungsreihenfolge)
// 5. State in api/routes.js /api/health einhängen · Tests mit aiClient(mock) + pg-mem
import { drainQueue, aiState } from './queue.js';
import { runTrendEngine, trendState } from './engine.js';
import { generateAlerts, alertState } from '../alerts/rules.js';
import { updateStrategyBrief, strategyState } from './strategy.js';
import { log } from '../../core/logger.js';

export const AI_MODULES = [
  { id: 'relevance', description: 'Relevanz, Impact, Kategorie, Topic je Artikel (Claude, structured output)', run: drainQueue, state: aiState },
  { id: 'trends',    description: 'Opportunity Radar: Topic-Cluster, Zeitreihen, Spikes, Trend-Scores',        run: runTrendEngine, state: trendState },
  { id: 'alerts',    description: 'Risk Shield: deterministisches Alert-Regelwerk (critical/important/info)',  run: generateAlerts, state: alertState },
  { id: 'strategy',  description: 'Strategy Engine: tägliches Strategie-Briefing aus der Gesamtlage',          run: updateStrategyBrief, state: strategyState },
];

/** Laufzeit-Zustand eines Moduls (für /api/health & Meta-Felder) — einziger Weg für die API-Schicht. */
export function moduleState(id) {
  return AI_MODULES.find(m => m.id === id)?.state || {};
}

/** Führt alle Module sequenziell aus; Fehler werden isoliert und gemeldet. */
export async function runIntelligencePipeline() {
  const results = {};
  for (const m of AI_MODULES) {
    try {
      results[m.id] = await m.run();
    } catch (e) {
      results[m.id] = { error: e.message };
      log.error(`Intelligence-Modul „${m.id}" fehlgeschlagen (Pipeline läuft weiter):`, e.message);
    }
  }
  return results;
}
