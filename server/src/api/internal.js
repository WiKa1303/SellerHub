// ═══ /internal — interne Debug-Oberfläche (reine Sichtbarmachung) ═══
// Read-only, server-gerendertes HTML, kein Auth (interner Prototyp — NICHT öffentlich deployen
// ohne Schutz; Hinweis im Seitenkopf). Keine neue Business-Logik: nur Lese-Queries
// + Wiederverwendung bestehender Repository-/Service-Funktionen.
import { db, queryTrends, queryAlerts, queryNews } from '../data/db.js';
import { parseProfile, rankForProfile } from '../services/feed/profile.js';
import { crawlState } from '../services/crawler/run.js';
import { AI_MODULES } from '../services/intelligence/registry.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = n => Number(n ?? 0).toLocaleString('de-DE');
const dt = v => v ? new Date(v).toLocaleString('de-DE') : '—';

// Profil-Presets fürs Feed-Ranking (das Ranking ist profil-, nicht tenant-basiert)
const PROFILES = {
  '': { label: 'ohne Profil (unpersonalisiert)', q: {} },
  pl: { label: 'Private Label · Recherche+PPC · DE', q: { seller_type: 'private_label', interests: 'produktrecherche,ppc', markets: 'DE' } },
  ws: { label: 'Wholesale · Logistik+Steuern · DE,EU', q: { seller_type: 'wholesale', interests: 'logistik,steuern', markets: 'DE,EU' } },
  arb: { label: 'Arbitrage · Recht+Steuern · DE,AT', q: { seller_type: 'arbitrage', interests: 'recht,steuern', markets: 'DE,AT' } },
};

export async function renderInternal(req, res) {
  try {
    const profKey = Object.hasOwn(PROFILES, req.query.profil) ? req.query.profil : '';
    const tenant = String(req.query.tenant || '');

    // ── SYSTEM (Zähler direkt aus der DB; Crawl-Zeit aus dem Laufzeit-State) ──
    const [cItems, cAnalyzed, cAlerts, tenants] = await Promise.all([
      db().query(`SELECT count(*) AS n FROM news_events`),
      db().query(`SELECT count(*) AS n FROM news_events WHERE ai_analyzed_at IS NOT NULL`),
      db().query(`SELECT count(*) AS n FROM alerts`, []),
      db().query(`SELECT DISTINCT tenant_id FROM feedback ORDER BY tenant_id`),
    ]);

    // ── INTELLIGENCE: letzte 20 analysierte Artikel ──
    const analyzed = (await db().query(
      `SELECT title, source, ai_score, ai_impact, ai_urgency, ai_reasoning, ai_category, ai_analyzed_at
       FROM news_events WHERE ai_analyzed_at IS NOT NULL
       ORDER BY ai_analyzed_at DESC LIMIT 20`)).rows;

    // ── TRENDS / ALERTS über bestehende Repos ──
    const trends = await queryTrends({ limit: 10, maxAgeDays: 30 });
    const alerts = await queryAlerts({ days: 30, limit: 20 });

    // ── FEED: bestehendes Ranking wiederverwenden; Tenant-Votes nur markieren ──
    const profile = parseProfile(PROFILES[profKey].q);
    let feed = await queryNews({ limit: 30, maxAgeDays: 30 });
    if (!profile.isEmpty) feed = rankForProfile(feed, profile);
    feed = feed.slice(0, 15);
    const votes = tenant
      ? Object.fromEntries((await db().query(`SELECT item_id, vote FROM feedback WHERE tenant_id = $1`, [tenant])).rows.map(r => [r.item_id, r.vote]))
      : {};

    const modRows = AI_MODULES.map(m =>
      `<tr><td><b>${esc(m.id)}</b></td><td>${esc(m.description)}</td><td class="mono">${esc(JSON.stringify(m.state))}</td></tr>`).join('');

    const lvlColor = { critical: '#c5221f', important: '#b26a00', info: '#1a73e8' };
    const html = `<!doctype html><html lang="de"><head><meta charset="utf-8">
<title>SellerHub /internal</title>
<style>
  body{font-family:ui-sans-serif,system-ui,sans-serif;margin:0;background:#f4f6f9;color:#1a2233;font-size:14px}
  header{background:#151c2c;color:#fff;padding:12px 24px;display:flex;gap:14px;align-items:baseline}
  header .warn{color:#fbb040;font-size:12px}
  main{max-width:1200px;margin:0 auto;padding:20px 24px}
  h2{font-size:14px;text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid #d8dee6;padding-bottom:6px;margin:28px 0 10px}
  table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e3e8ef;border-radius:8px}
  th{background:#eef1f6;text-align:left;padding:6px 10px;font-size:11px;text-transform:uppercase;letter-spacing:.5px}
  td{padding:6px 10px;border-top:1px solid #eef1f6;vertical-align:top}
  .mono{font-family:ui-monospace,monospace;font-size:11.5px;color:#4d5568}
  .kpi{display:inline-block;background:#fff;border:1px solid #e3e8ef;border-radius:8px;padding:8px 16px;margin:0 8px 8px 0}
  .kpi b{font-size:20px;display:block}
  .pill{border-radius:9px;padding:1px 8px;font-size:11px;font-weight:700;color:#fff;display:inline-block}
  .muted{color:#7b8395;font-size:12px}
  form{margin:8px 0}select{padding:5px 8px;margin-right:10px}
</style></head><body>
<header><b>SellerHub /internal</b><span class="muted">Read-only-Debug — keine Aktionen möglich</span>
<span class="warn">⚠️ ohne Auth — nur für den internen Prototyp, nicht öffentlich betreiben</span></header><main>

<h2>System</h2>
<div class="kpi"><b>${dt(crawlState.lastRun)}</b>letzter Crawl</div>
<div class="kpi"><b>${num(cItems.rows[0].n)}</b>Artikel gesamt</div>
<div class="kpi"><b>${num(cAnalyzed.rows[0].n)}</b>davon KI-analysiert</div>
<div class="kpi"><b>${num(cAlerts.rows[0].n)}</b>Alerts</div>
<table><tr><th>Intelligence-Modul</th><th>Beschreibung</th><th>Laufzeit-State</th></tr>${modRows}</table>

<h2>Intelligence — letzte ${analyzed.length} analysierte Artikel</h2>
<table><tr><th>Analysiert</th><th>Artikel</th><th>Score</th><th>Impact</th><th>Urgency</th><th>Reasoning</th></tr>
${analyzed.map(a => `<tr><td class="mono">${dt(a.ai_analyzed_at)}</td>
  <td><b>${esc(a.title)}</b><br><span class="muted">${esc(a.source)} · ${esc(a.ai_category)}</span></td>
  <td><b>${a.ai_score}</b></td><td>${esc(a.ai_impact)}</td>
  <td>${a.ai_urgency === 'hoch' ? '<b style="color:#c5221f">hoch</b>' : esc(a.ai_urgency)}</td>
  <td class="muted">${esc(a.ai_reasoning)}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">noch keine Analysen (KI-Key gesetzt? Pipeline gelaufen?)</td></tr>'}
</table>

<h2>Trends — Top trend_topics</h2>
<table><tr><th>Thema</th><th>trend_score</th><th>growth_rate</th><th>7T/30T</th><th>Spike</th><th>Einstufung</th><th>Empfohlene Aktion</th></tr>
${trends.map(t => `<tr><td><b>${esc(t.topic_name)}</b></td><td><b>${t.trend_score}</b></td>
  <td>${t.growth_rate >= 0 ? '+' : ''}${t.growth_rate} %</td><td>${t.mentions_7d}/${t.mentions_30d}</td>
  <td>${t.spike ? '🔥' : ''}</td><td>${esc(t.risk_or_opportunity)}</td>
  <td class="muted">${esc(t.recommended_action || '—')}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">keine Trends (braucht ≥2 analysierte Artikel je Thema)</td></tr>'}
</table>

<h2>Alerts</h2>
<table><tr><th>Level</th><th>risk_type</th><th>Titel</th><th>created_at</th><th>zugestellt</th></tr>
${alerts.map(a => `<tr><td><span class="pill" style="background:${lvlColor[a.alert_level] || '#7b8395'}">${esc(a.alert_level)}</span></td>
  <td>${esc(a.risk_type)}</td><td>${esc(a.title)}</td><td class="mono">${dt(a.created_at)}</td>
  <td class="muted">${a.delivered_at ? dt(a.delivered_at) : 'offen (Push-Queue)'}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">keine Alerts</td></tr>'}
</table>

<h2>Personalisierter Feed</h2>
<form method="get" action="/internal">
  <label>Profil (steuert das Ranking):
    <select name="profil" onchange="this.form.submit()">
      ${Object.entries(PROFILES).map(([k, p]) => `<option value="${k}"${k === profKey ? ' selected' : ''}>${esc(p.label)}</option>`).join('')}
    </select></label>
  <label>tenant_id (markiert dessen 👍/👎-Votes):
    <select name="tenant" onchange="this.form.submit()">
      <option value="">—</option>
      ${tenants.rows.map(t => `<option value="${esc(t.tenant_id)}"${t.tenant_id === tenant ? ' selected' : ''}>${esc(t.tenant_id)}</option>`).join('')}
    </select></label>
  <noscript><button>Anzeigen</button></noscript>
</form>
<p class="muted">Hinweis: Das Ranking ist <b>profil-basiert</b> (Profil liegt beim Client, DSGVO); tenant_id steuert heute ausschließlich Feedback-Votes.</p>
<table><tr><th>#</th><th>Score${profile.isEmpty ? '' : ' (personalisiert)'}</th><th>Artikel</th><th>Warum</th>${tenant ? '<th>Vote</th>' : ''}</tr>
${feed.map((n, i) => `<tr><td>${i + 1}</td>
  <td><b>${profile.isEmpty ? (n.ai_score ?? n.relevance_score) : n.personalized_score}</b></td>
  <td><b>${esc(n.title)}</b><br><span class="muted">${esc(n.source)} · ${esc(n.ai_category || '—')} · ${dt(n.publish_date)}</span></td>
  <td class="muted">${esc((n.why || []).join(' · ') || '—')}</td>
  ${tenant ? `<td>${votes[n.id] === 1 ? '👍' : votes[n.id] === -1 ? '👎' : ''}</td>` : ''}</tr>`).join('') || `<tr><td colspan="5" class="muted">keine Artikel</td></tr>`}
</table>
<p class="muted">Stand: ${dt(new Date())} · Alle Anzeigen read-only.</p>
</main></body></html>`;

    res.set('Cache-Control', 'no-store').type('html').send(html);
  } catch (e) {
    res.status(500).type('html').send('<pre>Interner Fehler — Details im Server-Log</pre>');
  }
}
