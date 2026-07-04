// ═══ Seller-Profil + personalisiertes Ranking (Phase 3) ═══
// DSGVO-Entscheidung: Das Profil wird NICHT serverseitig gespeichert — der Client
// (SellerHub-App, localStorage) schickt es als Query-Parameter mit. Keine Accounts,
// keine Personendaten in der DB. Bei späteren Accounts (v2) wandert exakt dieses
// Schema in eine seller_profiles-Tabelle; die Ranking-Funktion bleibt unverändert.

export const PROFILE_SCHEMA = {
  seller_type: ['private_label', 'wholesale', 'arbitrage'],
  revenue: ['starter', 'sechsstellig', 'siebenstellig'],
  markets: ['DE', 'AT', 'CH', 'EU', 'INTL'],
  interests: ['recht', 'ppc', 'produktrecherche', 'logistik', 'steuern', 'events', 'trends'],
};

/** Query-Parameter → validiertes Profil (unbekannte Werte werden still verworfen). */
export function parseProfile(q = {}) {
  const csv = v => String(v || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const p = {
    sellerType: PROFILE_SCHEMA.seller_type.includes(String(q.seller_type || '').toLowerCase()) ? String(q.seller_type).toLowerCase() : null,
    revenue: PROFILE_SCHEMA.revenue.includes(String(q.revenue || '').toLowerCase()) ? String(q.revenue).toLowerCase() : null,
    markets: csv(q.markets).map(m => m.toUpperCase()).filter(m => PROFILE_SCHEMA.markets.includes(m)),
    interests: csv(q.interests).filter(i => PROFILE_SCHEMA.interests.includes(i)),
  };
  p.isEmpty = !p.sellerType && !p.revenue && !p.markets.length && !p.interests.length;
  return p;
}

// Welche Kategorien für welchen Seller-Typ überdurchschnittlich zählen.
// Beispiel: Arbitrage-Seller trifft eine Policy-/Konto-Änderung härter als PPC-News.
const TYPE_AFFINITY = {
  private_label: { produktrecherche: 8, ppc: 6, trends: 4 },
  wholesale: { logistik: 8, steuern: 5, recht: 4 },
  arbitrage: { recht: 8, steuern: 6, logistik: 4 },
};
// Kleine Konten trifft Kapitalbindung/Gebühren relativ härter; große eher Recht/Steuern-Komplexität
const REVENUE_AFFINITY = {
  starter: { produktrecherche: 4, trends: 3 },
  sechsstellig: { ppc: 4, logistik: 3 },
  siebenstellig: { recht: 4, steuern: 4, logistik: 3 },
};

/**
 * Personalisierter Score = KI-Basis + Profil-Matching + Dringlichkeits-/Impact-Boosts.
 * Deterministisch + erklärbar: reasons[] beantwortet „Warum sehe ich das?" —
 * gleiche Ehrlichkeits-Philosophie wie die Daten-Konfidenz im SellerHub-Scorecard.
 * @param {object} item  Zeile aus news_events (inkl. ai_*-Feldern, falls analysiert)
 * @param {object} profile  aus parseProfile()
 * @returns {{score:number, reasons:string[]}}
 */
export function personalizedScore(item, profile) {
  // Basis: KI-Score, wenn vorhanden — sonst Keyword-Score (ehrlicher Fallback)
  const base = item.ai_score != null ? item.ai_score : item.relevance_score;
  let score = base;
  const reasons = [item.ai_score != null ? `KI-Relevanz ${item.ai_score}` : `Keyword-Relevanz ${item.relevance_score}`];

  // Dringlichkeit & Impact (aus der KI-Analyse) — unabhängig vom Profil
  if (item.ai_urgency === 'hoch') { score += 10; reasons.push('dringend'); }
  else if (item.ai_urgency === 'mittel') { score += 4; }
  if (item.ai_impact === 'high') { score += 10; reasons.push('hoher Business-Impact'); }
  else if (item.ai_impact === 'medium') { score += 4; }

  if (profile && !profile.isEmpty) {
    const cat = item.ai_category || null;
    if (cat && profile.interests.includes(cat)) { score += 12; reasons.push(`passt zu deinem Interesse „${cat}"`); }
    if (cat && profile.sellerType && TYPE_AFFINITY[profile.sellerType]?.[cat]) {
      score += TYPE_AFFINITY[profile.sellerType][cat];
      reasons.push(`relevant für ${profile.sellerType.replace('_', ' ')}`);
    }
    if (cat && profile.revenue && REVENUE_AFFINITY[profile.revenue]?.[cat]) score += REVENUE_AFFINITY[profile.revenue][cat];
    if (profile.markets.length && item.country && profile.markets.includes(item.country)) { score += 5; reasons.push(`Fokusmarkt ${item.country}`); }
  }

  return { score: Math.max(0, Math.min(140, Math.round(score))), reasons };
}

/** Kandidaten personalisiert sortieren; hängt personalized_score + why an jedes Item. */
export function rankForProfile(items, profile) {
  return items
    .map(it => { const { score, reasons } = personalizedScore(it, profile); return { ...it, personalized_score: score, why: reasons }; })
    .sort((a, b) => b.personalized_score - a.personalized_score || new Date(b.publish_date) - new Date(a.publish_date));
}
