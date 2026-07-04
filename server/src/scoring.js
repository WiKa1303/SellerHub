// ═══ Relevanz-Score 0–100: deterministisch und erklärbar ═══
//   Quellen-Gewicht (0–30) + Keywords (0–40) + Aktualität (0–20) + Fristen-Boost (0–10)
import { KEYWORDS, IMPACT_PATTERN } from './config.js';

/** @returns {{score:number, reasons:string[]}} score 0–100 + „Warum sehe ich das?" */
export function scoreItem({ title, summary, publishDate, sourceWeight }) {
  const text = `${title} ${summary}`.toLowerCase();
  const reasons = [];

  // 1) Quelle (0–30)
  const src = Math.min(30, Math.round((sourceWeight || 1) * 10));

  // 2) Keywords (0–40) – jeder Begriff zählt nur einmal
  let kw = 0;
  const hits = [];
  for (const k of KEYWORDS.high) if (text.includes(k)) { kw += 15; hits.push(k); }
  for (const k of KEYWORDS.mid) if (text.includes(k)) { kw += 8; hits.push(k); }
  for (const k of KEYWORDS.ctx) if (text.includes(k)) { kw += 3; hits.push(k); }
  kw = Math.min(40, kw);
  if (hits.length) reasons.push('Stichworte: ' + hits.slice(0, 5).join(', '));

  // 3) Aktualität (0–20), Halbwertszeit 72 h
  const ageH = Math.max(0, (Date.now() - new Date(publishDate).getTime()) / 36e5);
  const rec = Math.round(20 * Math.pow(0.5, ageH / 72));

  // 4) Fristen-/Handlungs-Boost (0/10) – Meldungen, deren Verpassen Geld kostet
  const impact = IMPACT_PATTERN.test(text) ? 10 : 0;
  if (impact) reasons.push('Frist/Pflicht erkannt');

  const score = Math.max(0, Math.min(100, src + kw + rec + impact));
  // kw wird separat zurückgegeben: 0 Keyword-Treffer = thematisch irrelevant,
  // egal wie frisch/vertrauenswürdig – der Crawler verwirft solche Items (Gate).
  return { score, kw, reasons };
}
