// ═══ Repository: Strategy Engine (strategy_briefs) ═══
import { db } from '../schema.js';

export async function saveStrategyBrief(day, brief, model) {
  await db().query(
    `INSERT INTO strategy_briefs (day, brief, model) VALUES ($1,$2,$3)
     ON CONFLICT (day) DO UPDATE SET brief=$2, model=$3`,
    [day, JSON.stringify(brief), model]);
}

export async function getStrategyBrief(day) {
  const r = await db().query(`SELECT * FROM strategy_briefs WHERE day = $1`, [day]);
  return r.rows[0] ? { ...r.rows[0], brief: JSON.parse(r.rows[0].brief) } : null;
}

export async function latestStrategyBrief() {
  const r = await db().query(`SELECT * FROM strategy_briefs ORDER BY day DESC LIMIT 1`);
  return r.rows[0] ? { ...r.rows[0], brief: JSON.parse(r.rows[0].brief) } : null;
}
