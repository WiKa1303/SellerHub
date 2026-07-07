// ═══ PPC-COCKPIT (Keyword-Center-Tabs 🎯 Planer + 🔍 Audit + Cerebro-Paste) ═══
// Umsetzung von KONZEPT-PPC-Keywords.md: Kampagnen planen BEVOR Geld fließt,
// laufende Kampagnen auditieren NACHDEM Geld geflossen ist — deterministische
// Formeln, jede Zahl nachrechenbar (ⓘ). Kein Ads-API, kein Scraping.
// Läuft NACH app.js (nutzt: D, save, toast, esc, parseCSV, decisionMarge, wtip-Muster).
'use strict';

// ─── Tab-Umschaltung: erweitert die app.js-Version um planer/audit (spätere Definition gewinnt) ───
function switchKwTab(tab){
  ['tracking','cleaner','scribbles','planer','audit'].forEach(function(t){
    var pane=document.getElementById('kwTab-'+t);
    if(pane)pane.style.display=(t===tab)?'block':'none';
  });
  document.querySelectorAll('.kwTab').forEach(function(btn){
    var active=btn.getAttribute('data-kwtab')===tab;
    btn.style.background=active?'var(--s1)':'transparent';
    btn.style.border=active?'1.5px solid var(--ac)':'1.5px solid transparent';
    btn.style.borderBottom=active?'1.5px solid var(--s1)':'1.5px solid transparent';
    btn.style.color=active?'var(--ac)':'var(--tx2)';
    btn.style.fontWeight=active?'700':'600';
  });
  if(tab==='planer')ppcRenderPlaner();
  if(tab==='audit')ppcRenderAudit();
}

// ─── Quellen: Produkte + GO-Kandidaten in einem Select ('p:<idx>' | 'c:<id>') ───
function ppcSources(){
  var out=[];
  (D.products||[]).forEach(function(p,i){out.push({id:'p:'+i,name:p.name||('Produkt '+(i+1)),obj:p});});
  ((D.research&&D.research.candidates)||[]).forEach(function(c){
    if(!out.some(function(o){return o.name===c.name}))out.push({id:'c:'+c.id,name:c.name+' (Kandidat)',obj:c});
  });
  return out;
}
function ppcResolve(sel){
  if(!sel)return null;
  if(sel.slice(0,2)==='p:')return (D.products||[])[parseInt(sel.slice(2))]||null;
  var id=sel.slice(2);
  return ((D.research&&D.research.candidates)||[]).find(function(c){return String(c.id)===id})||null;
}
function ppcFillSelect(elId,keep){
  var el=document.getElementById(elId);if(!el)return;
  var cur=keep?el.value:'';
  el.innerHTML='<option value="">— Produkt/Kandidat wählen —</option>'+ppcSources().map(function(s){
    return '<option value="'+esc(s.id)+'"'+(s.id===cur?' selected':'')+'>'+esc(s.name)+'</option>';
  }).join('');
}
// Marge robust ermitteln: decisionMarge deckt manuell/auto/geschätzt ab
function ppcMarge(obj){
  var m=decisionMarge(obj||{});
  return {pct:m.val,src:m.src};
}

// ═══════════ Modul A: Cerebro/Magnet-Paste → Keyword-Tracker ═══════════
var ppcCerebroState={rows:[],cols:null};

function ppcCerebroOpen(){
  var mo=document.getElementById('ppcCerebroModal');if(mo)mo.classList.add('show');
  ppcFillSelect('ppcCerebroProd',true);
  var inp=document.getElementById('ppcCerebroInput');if(inp){inp.value='';setTimeout(function(){inp.focus();},60);}
  var res=document.getElementById('ppcCerebroResult');if(res)res.innerHTML='';
}
function ppcCerebroClose(){var mo=document.getElementById('ppcCerebroModal');if(mo)mo.classList.remove('show');}

// Spalten flexibel erkennen (H10 exportiert je nach Tool/Sprache unterschiedlich)
function ppcKwCols(headers){
  function find(res){for(var i=0;i<headers.length;i++){var h=String(headers[i]).toLowerCase();for(var j=0;j<res.length;j++)if(res[j].test(h))return i;}return -1;}
  return {
    kw:  find([/keyword phrase/,/^keyword/,/suchbegriff/,/^phrase/]),
    vol: find([/search volume/,/suchvolumen/,/^volume/,/sv$/]),
    cpc: find([/suggested bid/,/empfohlenes gebot/,/\bcpc\b/,/gebot/,/\bbid\b/]),
    comp:find([/competing/,/wettbewerb/,/konkurrenz/]),
  };
}
var ppcNum=function(v){if(v==null)return null;var n=parseFloat(String(v).replace(/[€$\s]/g,'').replace(/\.(?=\d{3})/g,'').replace(',','.'));return isNaN(n)?null:n;};

function ppcCerebroAnalyze(){
  var inp=document.getElementById('ppcCerebroInput'),res=document.getElementById('ppcCerebroResult');
  if(!inp||!res)return;
  if(!inp.value.trim())return toast('Bitte erst die Cerebro-/Magnet-Tabelle einfügen');
  try{
    var parsed=parseCSV(inp.value);
    if(!parsed.headers.length||!parsed.rows.length)throw new Error('Keine Tabelle erkannt — bitte inklusive Kopfzeile kopieren');
    var cols=ppcKwCols(parsed.headers);
    if(cols.kw<0)throw new Error('Keine Keyword-Spalte gefunden (erwartet: „Keyword Phrase" o. ä.)');
    var H=parsed.headers; // parseCSV liefert Zeilen als Objekte mit Header-Schlüsseln
    var rows=parsed.rows.map(function(r){
      return {keyword:String(r[H[cols.kw]]||'').trim(),volume:cols.vol>-1?Math.round(ppcNum(r[H[cols.vol]])||0):0,
              cpc:cols.cpc>-1?ppcNum(r[H[cols.cpc]]):null,comp:cols.comp>-1?ppcNum(r[H[cols.comp]]):null};
    }).filter(function(r){return r.keyword&&r.keyword.length>1});
    if(!rows.length)throw new Error('Keine Keyword-Zeilen gefunden');
    rows.sort(function(a,b){return b.volume-a.volume});
    ppcCerebroState={rows:rows,cols:cols};
    res.innerHTML=
      '<div class="help-box gold" style="margin:12px 0 8px"><div class="help-icon">✅</div><div class="help-body">'
      +'<div class="help-title">'+rows.length+' Keywords erkannt</div>'
      +'<div class="help-text">Spalten: Keyword'+(cols.vol>-1?' · Suchvolumen':'')+(cols.cpc>-1?' · CPC-Schätzung':'')+(cols.comp>-1?' · Wettbewerber':'')
      +'<br>Top 3: '+rows.slice(0,3).map(function(r){return '<b>'+esc(r.keyword)+'</b>'+(r.volume?' ('+r.volume.toLocaleString('de-DE')+')':'')}).join(' · ')+'</div></div></div>'
      +'<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;font-size:12px">'
      +'Suchvolumen ≥ <input type="number" id="ppcCerebroMinVol" value="400" style="width:70px;padding:6px 8px;border:1px solid var(--bd2);border-radius:8px"> '
      +'· max. <input type="number" id="ppcCerebroMax" value="50" style="width:60px;padding:6px 8px;border:1px solid var(--bd2);border-radius:8px"> Keywords (nach Volumen)'
      +'<button class="btn btn-p btn-sm" onclick="ppcCerebroApply()">➕ In Keyword-Tracker übernehmen</button></div>';
  }catch(err){res.innerHTML='<div style="background:var(--rdd);border:1px solid var(--rd);border-radius:8px;padding:10px 14px;font-size:12px;color:var(--rd);margin-top:10px">⚠️ '+esc(err.message||String(err))+'</div>';}
}

function ppcCerebroApply(){
  var sel=document.getElementById('ppcCerebroProd').value;
  if(!sel||sel.slice(0,2)!=='p:')return toast('Bitte ein Produkt wählen (Tracking hängt am Produkt)');
  var pi=parseInt(sel.slice(2));
  var minVol=parseInt((document.getElementById('ppcCerebroMinVol')||{}).value)||0;
  var max=parseInt((document.getElementById('ppcCerebroMax')||{}).value)||50;
  var have={};(D.keywords||[]).forEach(function(k){if(k.prodIdx===pi)have[k.keyword.toLowerCase()]=1;});
  var take=ppcCerebroState.rows.filter(function(r){return r.volume>=minVol&&!have[r.keyword.toLowerCase()]}).slice(0,max);
  take.forEach(function(r){
    D.keywords.push({prodIdx:pi,keyword:r.keyword,volume:r.volume||0,
      wettbewerb:r.comp!=null?(r.comp>=1000?'Hoch':r.comp>=300?'Mittel':'Niedrig'):'',
      relevanz:r.volume>=3000?'Hoch':r.volume>=800?'Mittel':'Niedrig',
      imListing:false,notiz:'',cpc:r.cpc,quelle:'cerebro',importedAt:new Date().toISOString()});
  });
  save();ppcCerebroClose();
  toast('✅ '+take.length+' Keywords übernommen'+(ppcCerebroState.rows.length-take.length>0?' ('+(ppcCerebroState.rows.length-take.length)+' gefiltert/Dubletten)':''));
  if(typeof renderKW==='function')renderKW();
  ppcRenderPlaner();
}

// ═══════════ Modul B: Launch-PPC-Planer (deterministisch) ═══════════
function ppcRenderPlaner(){
  var host=document.getElementById('ppcPlanerBody');if(!host)return;
  ppcFillSelect('ppcPlanProd',true);
  var sel=(document.getElementById('ppcPlanProd')||{}).value;
  var obj=ppcResolve(sel);
  if(!obj){host.innerHTML='<div class="empty"><div class="eico">🎯</div><h3>Produkt wählen</h3>Wähle oben ein Produkt oder einen Kandidaten — der Planer rechnet mit dessen VK und Marge.</div>';return;}

  var vk=obj.vk!=null?obj.vk:(obj.preis!=null?obj.preis:null);
  var m=ppcMarge(obj);
  if(vk==null||m.pct==null){host.innerHTML='<div class="empty"><div class="eico">⚠️</div><h3>VK/Marge fehlen</h3>Für den Planer brauche ich Verkaufspreis und Marge — beides pflegst du am Produkt bzw. in der Kalkulation.</div>';return;}

  var cvr=(parseFloat((document.getElementById('ppcCvr')||{}).value)||10)/100;
  var budget=parseFloat((document.getElementById('ppcBudget')||{}).value)||25;
  var fLaunch=1.3,fProfit=0.7;
  var breakEven=m.pct, zielLaunch=Math.round(breakEven*fLaunch), zielProfit=Math.round(breakEven*fProfit);
  var margeEur=vk*m.pct/100;

  // Keywords des Produkts (nur bei echten Produkten getrackt)
  var pi=sel.slice(0,2)==='p:'?parseInt(sel.slice(2)):-1;
  var kws=(D.keywords||[]).filter(function(k){return k.prodIdx===pi}).slice().sort(function(a,b){return (b.volume||0)-(a.volume||0)}).slice(0,20);

  function maxBid(factor){return margeEur*cvr*factor;}
  var rows=kws.map(function(k){
    var mb=maxBid(fLaunch);
    var cpc=k.cpc!=null?k.cpc:mb;
    var klicks=cpc>0?Math.floor(budget/cpc):0;
    return '<tr><td style="font-weight:600">'+esc(k.keyword)+'</td>'
      +'<td class="nc">'+(k.volume?k.volume.toLocaleString('de-DE'):'—')+'</td>'
      +'<td class="nc">'+(k.cpc!=null?k.cpc.toFixed(2)+' €':'—')+'</td>'
      +'<td class="nc" style="font-weight:700;color:var(--ac)">'+mb.toFixed(2)+' €</td>'
      +'<td class="nc">~'+klicks+'</td></tr>';
  }).join('');

  var eurFmt=function(n){return Math.round(n).toLocaleString('de-DE')+' €'};
  host.innerHTML=
    '<div class="card" style="margin-bottom:14px"><h3>⚖️ Deine Zahlen <span class="wika-help" data-tooltip="Break-even-ACOS = Netto-Marge in %: Ab diesem Werbekostenanteil ist der Gewinn aufgebraucht.&#10;Ziel-ACOS Launch = Break-even × 1,3 (Launch darf bewusst etwas kosten).&#10;Ziel-ACOS Profit = Break-even × 0,7 (nachhaltiger Betrieb).">ⓘ</span></h3>'
    +'<div class="cg">'
    +'<div class="ci"><span class="cl">VK</span><span class="cv">'+vk.toFixed(2)+' €</span></div>'
    +'<div class="ci"><span class="cl">Netto-Marge ('+esc(m.src)+')</span><span class="cv">'+m.pct+' %</span></div>'
    +'<div class="ci"><span class="cl">Break-even-ACOS</span><span class="cv">'+Math.round(breakEven)+' %</span></div>'
    +'<div class="ci"><span class="cl">Ziel Launch / Profit</span><span class="cv">'+zielLaunch+' % / '+zielProfit+' %</span></div>'
    +'</div></div>'

    +'<div class="card" style="margin-bottom:14px"><h3>🎯 Gebots-Plan (Top-'+kws.length+' Keywords) <span class="wika-help" data-tooltip="Max-Gebot = Marge je Verkauf (€) × angenommene Conversion-Rate × Launch-Faktor 1,3.&#10;Beispiel: '+margeEur.toFixed(2).replace('.',',')+' € Marge × '+(cvr*100)+' % CVR × 1,3 = '+maxBid(fLaunch).toFixed(2).replace('.',',')+' €.&#10;Klicks/Tag = Tagesbudget ÷ CPC-Schätzung (bzw. Max-Gebot, wenn kein CPC importiert).">ⓘ</span></h3>'
    +'<div style="display:flex;gap:14px;flex-wrap:wrap;align-items:center;font-size:12px;margin-bottom:12px">'
    +'Angenommene CVR <input type="number" id="ppcCvr" value="'+(cvr*100)+'" min="1" max="40" style="width:60px;padding:6px 8px;border:1px solid var(--bd2);border-radius:8px" onchange="ppcRenderPlaner()"> %'
    +' · Tagesbudget <input type="number" id="ppcBudget" value="'+budget+'" min="1" style="width:70px;padding:6px 8px;border:1px solid var(--bd2);border-radius:8px" onchange="ppcRenderPlaner()"> €'
    +'</div>'
    +(kws.length?'<table><thead><tr><th>Keyword</th><th class="nc">Volumen</th><th class="nc">CPC-Schätzung</th><th class="nc">Max-Gebot</th><th class="nc">Klicks/Tag</th></tr></thead><tbody>'+rows+'</tbody></table>'
      :'<div class="empty" style="padding:24px"><div class="eico">🔑</div>Keine Keywords getrackt — importiere sie oben rechts per „📋 Cerebro einfügen" (Tab Keyword-Tracking) oder lege sie dort manuell an.</div>')
    +'</div>'

    +'<div class="card"><h3>🧭 Kampagnen-Struktur & Budget</h3>'
    +'<div class="fg" style="margin-bottom:12px">'
    +'<div class="scen"><div class="st">1× Auto (Discovery)</div><div class="sr"><span>Budget</span><span>'+eurFmt(budget*0.4)+'/Tag (40 %)</span></div><div class="sr"><span>Zweck</span><span>Suchbegriffe entdecken</span></div></div>'
    +'<div class="scen"><div class="st">1× Exact (Top 5)</div><div class="sr"><span>Budget</span><span>'+eurFmt(budget*0.4)+'/Tag (40 %)</span></div><div class="sr"><span>Keywords</span><span>'+esc(kws.slice(0,5).map(function(k){return k.keyword}).join(', ')||'—')+'</span></div></div>'
    +'<div class="scen"><div class="st">1× Broad (Rest)</div><div class="sr"><span>Budget</span><span>'+eurFmt(budget*0.2)+'/Tag (20 %)</span></div><div class="sr"><span>Zweck</span><span>Reichweite/Varianten</span></div></div>'
    +'</div>'
    +'<div style="font-size:13px;color:var(--tx2)">Erwartete PPC-Ausgaben: <b>~'+eurFmt(budget*30)+'/Monat</b> · Anlaufphase 2 Monate ≈ <b>'+eurFmt(budget*60)+'</b></div>'
    +'<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">'
    +'<button class="btn btn-p btn-sm" onclick="ppcPlanSave()">💾 Plan speichern (fließt in Kapitalbedarf der Scorecard)</button>'
    +(obj.ppcPlan?'<span style="font-size:11px;color:var(--gn)">✓ Gespeichert: '+obj.ppcPlan.tagesbudget+' €/Tag × '+(obj.ppcPlan.monate||2)+' Monate</span>':'')
    +'</div></div>';
}

function ppcPlanSave(){
  var sel=(document.getElementById('ppcPlanProd')||{}).value;
  var obj=ppcResolve(sel);if(!obj)return toast('Erst Produkt wählen');
  var budget=parseFloat((document.getElementById('ppcBudget')||{}).value)||25;
  obj.ppcPlan={tagesbudget:budget,monate:2,createdAt:new Date().toISOString()};
  save();toast('✅ PPC-Plan gespeichert — Kapitalbedarf ('+Math.round(budget*60).toLocaleString('de-DE')+' € Anlauf) fließt in die Scorecard');
  ppcRenderPlaner();
}

// ═══════════ Modul C: Suchbegriffs-Audit (echte Kampagnendaten) ═══════════
// Bericht: Seller Central → Werbeberichte → Sponsored Products → Suchbegriff.
// Bleibt komplett im Browser — nichts davon geht an unseren Server.
var ppcAuditState={rows:[]};

function ppcAuditCols(headers){
  function find(res){for(var i=0;i<headers.length;i++){var h=String(headers[i]).toLowerCase();for(var j=0;j<res.length;j++)if(res[j].test(h))return i;}return -1;}
  return {
    term: find([/kundensuchbegriff/,/customer search term/,/suchbegriff/,/search term/]),
    clicks:find([/klicks/,/clicks/]),
    spend:find([/ausgaben/,/spend/,/kosten/,/cost/]),
    sales:find([/umsatz/,/sales/,/verkäufe.*€/,/total sales/]),
    orders:find([/bestellungen/,/orders/,/einheiten/,/units/]),
    imp:  find([/impressionen/,/impressions/]),
  };
}

function ppcRenderAudit(){
  ppcFillSelect('ppcAuditProd',true);
  // Ergebnis bleibt stehen, bis neu analysiert wird
}

function ppcAuditFile(e){
  var f=e.target.files[0];if(!f)return;
  var r=new FileReader();
  r.onerror=function(){toast('⚠️ Datei konnte nicht gelesen werden');};
  r.onload=function(ev){var inp=document.getElementById('ppcAuditInput');if(inp){inp.value=ev.target.result;ppcAuditAnalyze();}};
  r.readAsText(f,'UTF-8');
  e.target.value='';
}

function ppcAuditAnalyze(){
  var inp=document.getElementById('ppcAuditInput'),res=document.getElementById('ppcAuditResult');
  if(!inp||!res)return;
  function fail(msg){res.innerHTML='<div style="background:var(--rdd);border:1px solid var(--rd);border-radius:8px;padding:10px 14px;font-size:12px;color:var(--rd);margin-top:10px">⚠️ '+msg+'</div>';}
  if(!inp.value.trim())return toast('Bitte erst den Suchbegriffs-Bericht einfügen (CSV oder Tabelle)');
  try{
    var parsed=parseCSV(inp.value);
    if(!parsed.headers.length||!parsed.rows.length)return fail('Keine Tabelle erkannt — bitte inklusive Kopfzeile einfügen (CSV-Export aus Seller Central → Werbeberichte → Suchbegriff).');
    var c=ppcAuditCols(parsed.headers);
    if(c.term<0||c.spend<0)return fail('Spalten nicht erkannt — erwartet mindestens „Kundensuchbegriff" und „Ausgaben". Gefunden: '+esc(parsed.headers.slice(0,8).join(' | ')));
    // Je Suchbegriff aggregieren (Bericht hat oft mehrere Zeilen je Begriff über Kampagnen)
    var H=parsed.headers; // parseCSV liefert Zeilen als Objekte mit Header-Schlüsseln
    var agg={};
    parsed.rows.forEach(function(rw){
      var t=String(rw[H[c.term]]||'').trim().toLowerCase();if(!t)return;
      var a=agg[t]||(agg[t]={term:t,clicks:0,spend:0,sales:0,orders:0});
      a.clicks+=ppcNum(rw[H[c.clicks]])||0;a.spend+=ppcNum(rw[H[c.spend]])||0;
      a.sales+=c.sales>-1?(ppcNum(rw[H[c.sales]])||0):0;a.orders+=c.orders>-1?(ppcNum(rw[H[c.orders]])||0):0;
    });
    var rows=Object.values(agg);
    ppcAuditState.rows=rows;

    // Break-even: aus gewähltem Produkt oder manueller Marge
    var obj=ppcResolve((document.getElementById('ppcAuditProd')||{}).value);
    var manual=parseFloat((document.getElementById('ppcAuditMarge')||{}).value);
    var be=obj?(ppcMarge(obj).pct):(isNaN(manual)?null:manual);
    if(be==null)be=25; // konservativer Default, wird ausgewiesen
    var beSrc=obj?('Marge von „'+(obj.name||'')+'"'):(isNaN(manual)?'Standard-Annahme 25 %':'manuell');
    var profitZiel=be*0.7;

    var verbrenner=rows.filter(function(r){return r.clicks>=5&&r.orders===0&&r.spend>0}).sort(function(a,b){return b.spend-a.spend});
    var teuer=rows.filter(function(r){return r.orders>0&&r.sales>0&&(r.spend/r.sales*100)>be}).sort(function(a,b){return (b.spend/b.sales)-(a.spend/a.sales)});
    var gewinner=rows.filter(function(r){return r.orders>=2&&r.sales>0&&(r.spend/r.sales*100)<profitZiel}).sort(function(a,b){return b.sales-a.sales});
    var sparPotenzial=verbrenner.reduce(function(s,r){return s+r.spend},0)
      +teuer.reduce(function(s,r){return s+Math.max(0,r.spend-r.sales*be/100)},0);

    var eur=function(n){return n.toFixed(2).replace('.',',')+' €'};
    var acos=function(r){return r.sales>0?Math.round(r.spend/r.sales*100)+' %':'—'};
    function block(title,color,list,cols){
      if(!list.length)return '';
      return '<div class="card" style="margin-bottom:12px;border-left:4px solid '+color+'"><h3>'+title+' ('+list.length+')</h3>'
        +'<table><thead><tr><th>Suchbegriff</th><th class="nc">Klicks</th><th class="nc">Ausgaben</th><th class="nc">Verkäufe</th><th class="nc">ACOS</th><th>Empfehlung</th></tr></thead><tbody>'
        +list.slice(0,15).map(function(r){return '<tr><td style="font-weight:600">'+esc(r.term)+'</td><td class="nc">'+Math.round(r.clicks)+'</td><td class="nc">'+eur(r.spend)+'</td><td class="nc">'+(r.orders?Math.round(r.orders)+' ('+eur(r.sales)+')':'0')+'</td><td class="nc">'+acos(r)+'</td><td style="font-size:12px">'+cols(r)+'</td></tr>'}).join('')
        +'</tbody></table>'+(list.length>15?'<div style="font-size:11px;color:var(--tx3);margin-top:6px">… und '+(list.length-15)+' weitere</div>':'')+'</div>';
    }

    res.innerHTML=
      '<div class="help-box gold" style="margin:14px 0"><div class="help-icon">💡</div><div class="help-body">'
      +'<div class="help-title">Audit: '+rows.length+' Suchbegriffe · Break-even-ACOS '+Math.round(be)+' % ('+esc(beSrc)+')</div>'
      +'<div class="help-text">Identifiziertes Einsparpotenzial: <b>'+eur(sparPotenzial)+'</b> im Berichtszeitraum (Geldverbrenner komplett + Überzahlung über Break-even).</div></div></div>'
      +block('🔥 Geldverbrenner — Kosten ohne einen einzigen Verkauf (≥ 5 Klicks)','var(--rd)',verbrenner,function(){return '→ als negatives Keyword setzen'})
      +(verbrenner.length?'<div style="margin:-4px 0 12px"><button class="btn btn-sm" onclick="ppcCopyNegatives()">📋 Negativ-Liste kopieren ('+verbrenner.length+')</button> <span style="font-size:11px;color:var(--tx3)">→ Seller Central: Kampagne → Negative Keywords → „exakt" einfügen</span></div>':'')
      +block('📉 Über Break-even — ACOS frisst die Marge','var(--or)',teuer,function(r){return '→ Gebot −30 % oder pausieren'})
      +block('🏆 Gewinner — profitabel (ACOS < '+Math.round(profitZiel)+' %, ≥ 2 Verkäufe)','var(--gn)',gewinner,function(){return '→ in Exact-Kampagne übernehmen, Gebot +10 %'})
      +(!verbrenner.length&&!teuer.length&&!gewinner.length?'<div class="empty"><div class="eico">✨</div><h3>Nichts Auffälliges</h3>Keine Geldverbrenner, nichts über Break-even — sauber unterwegs.</div>':'');
  }catch(err){fail(esc(err.message||String(err)));}
}

function ppcCopyNegatives(){
  var list=ppcAuditState.rows.filter(function(r){return r.clicks>=5&&r.orders===0&&r.spend>0})
    .sort(function(a,b){return b.spend-a.spend}).map(function(r){return r.term}).join('\n');
  function fallback(){try{var ta=document.createElement('textarea');ta.value=list;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();toast('📋 Negativ-Keywords kopiert');}catch(e2){toast('⚠️ Kopieren nicht möglich');}}
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(list).then(function(){toast('📋 '+list.split('\n').length+' Negativ-Keywords kopiert');},fallback);
  else fallback();
}

// Planer/Audit-Selects initial füllen, sobald die Seite besucht wird (go() ruft renderKW)
(function(){
  var _renderKW=window.renderKW;
  if(typeof _renderKW==='function'){
    window.renderKW=function(){_renderKW.apply(this,arguments);ppcFillSelect('ppcPlanProd',true);ppcFillSelect('ppcAuditProd',true);};
  }
})();
