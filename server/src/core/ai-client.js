// ═══ INFRASTRUCTURE: Anthropic-Client (eine Instanz für alle Intelligence-Module) ═══
// Hier liegt NUR die Client-Fabrik — Prompts/Schemas gehören in die Fachmodule.
// clientOverride ermöglicht Tests ohne echten API-Key (aiClient(mock)).
import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';

let _client = null;

/** Lazy-Init; SDK-Retries übernehmen 429/5xx mit exponentiellem Backoff. */
export function aiClient(clientOverride) {
  if (clientOverride) { _client = clientOverride; return _client; }
  if (!_client) {
    if (!config.anthropicApiKey) return null;
    _client = new Anthropic({ apiKey: config.anthropicApiKey, maxRetries: 3, timeout: 60000 });
  }
  return _client;
}

/** Degradations-Pfad-Schalter: ohne Key laufen alle Module deterministisch weiter. */
export function aiEnabled() { return !!(config.anthropicApiKey || _client); }
