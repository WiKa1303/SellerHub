// ═══ Repository: AI-Call-Telemetrie (ai_calls) ═══
// Fail-soft by design: Sichtbarkeits-Schicht darf NIE die Analyse brechen —
// deshalb fängt logAiCall alle Fehler und loggt sie nur.
import { db } from '../schema.js';
import { log } from '../../core/logger.js';

let seq = 0;

/** Nach jedem LLM-Call aufrufen: speichert Prompt-Version + Token-Verbrauch. */
export async function logAiCall(prompt, response, ref = null) {
  try {
    await db().query(
      `INSERT INTO ai_calls (id, prompt_key, prompt_version, model, temperature, tokens_in, tokens_out, ref)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      ['call_' + Date.now().toString(36) + '_' + (++seq),
       prompt.key, prompt.version, response.model || prompt.model, prompt.temperature,
       response.usage?.input_tokens ?? null, response.usage?.output_tokens ?? null,
       ref ? String(ref).slice(0, 200) : null]);
  } catch (e) {
    log.warn('AI-Call-Telemetrie fehlgeschlagen (Analyse unbeeinträchtigt):', e.message);
  }
}

export async function recentAiCalls(limit = 20) {
  const r = await db().query(
    `SELECT * FROM ai_calls ORDER BY created_at DESC, id DESC LIMIT $1`, [limit]);
  return r.rows;
}

/** Aggregat je Prompt: Calls + Token-Summen (Kostenkontrolle je Prompt-Version). */
export async function aiCallStats() {
  const r = await db().query(
    `SELECT prompt_key, prompt_version, count(*) AS calls,
            sum(tokens_in) AS tokens_in, sum(tokens_out) AS tokens_out
     FROM ai_calls GROUP BY prompt_key, prompt_version
     ORDER BY prompt_key, prompt_version DESC`);
  return r.rows;
}
