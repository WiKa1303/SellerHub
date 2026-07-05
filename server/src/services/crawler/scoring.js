// ═══ Relevanz-Score 0–100: deterministisch und erklärbar ═══
//   Quellen-Gewicht (0–30) + Keywords (0–40) + Aktualität (0–20) + Fristen-Boost (0–10)
import { KEYWORDS, KEYWORDS_NEGATIVE, IMPACT_PATTERN } from '../../core/config.js';

// Keywords matchen am WORTANFANG (\b…), nicht als Substring: „frist" soll
// „Fristverlängerung" treffen, aber nicht „Befristung" — deutsche Komposita
// dürfen das Keyword fortsetzen, nicht davor kleben. Einmal vorkompiliert.
const kwRe = (k) => new RegExp('\\b' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
const RE = {
  high: KEYWORDS.high.map((k) => [k, kwRe(k)]),
  mid: KEYWORDS.mid.map((k) => [k, kwRe(k)]),
  ctx: KEYWORDS.ctx.map((k) => [k, kwRe(k)]),
  negative: KEYWORDS_NEGATIVE.map((k) => [k, kwRe(k)]),
};

/** @returns {{score:number, reasons:string[]}} score 0–100 + „Warum sehe ich das?" */
export function scoreItem({ title, summary, publishDate, sourceWeight }) {
  const text = `${title} ${summary}`.toLowerCase();
  const reasons = [];

  // 1) Quelle (0–30)
  const src = Math.min(30, Math.round((sourceWeight || 1) * 10));

  // 2) Keywords (0–40) – jeder Begriff zählt nur einmal
  let kw = 0;
  const hits = [];
  for (const [k, re] of RE.high) if (re.test(text)) { kw += 15; hits.push(k); }
  for (const [k, re] of RE.mid) if (re.test(text)) { kw += 8; hits.push(k); }
  for (const [k, re] of RE.ctx) if (re.test(text)) { kw += 3; hits.push(k); }
  kw = Math.min(40, kw);
  if (hits.length) reasons.push('Stichworte: ' + hits.slice(0, 5).join(', '));

  // 2b) Off-Topic-Malus: seller-fremde Begriffe (Karriere/Lifestyle) drücken die
  // Keyword-Punkte — fällt kw dadurch auf 0, greift das Gate und das Item fliegt.
  const negHits = [];
  for (const [k, re] of RE.negative) if (re.test(text)) negHits.push(k);
  if (negHits.length) {
    kw = Math.max(0, kw - 15 * negHits.length);
    reasons.push('Off-Topic: ' + negHits.slice(0, 3).join(', '));
  }

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
