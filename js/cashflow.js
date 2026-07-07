// ═══ CASHFLOW-PLANER (Seite „Betrieb → Cashflow") ═══
// Der FBA-Engpass ist selten die Marge, sondern die Liquidität: Anzahlung an den
// Lieferanten, Rest bei Verschiffung, Amazon zahlt Wochen später aus, USt läuft auf.
// Deterministischer 6-Monats-Zeitstrahl aus eigenen Posten — KEINE Prognose-KI.
// Läuft NACH app.js (nutzt: D, save, toast, esc, gmPrompt, ppcSources aus ppc.js).
'use strict';

function cfData(){
  if(!D.cashflow||typeof D.cashflow!=='object')D.cashflow={startSaldo:0,events:[]};
  if(!Array.isArray(D.cashflow.events))D.cashflow.events=[];
  return D.cashflow;
}
var cfId=function(){return 'cf'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);};
var cfEur=function(n){return (n<0?'−':'')+Math.abs(Math.round(n)).toLocaleString('de-DE')+' €'};
var cfYmd=function(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
// UTC-basiert: lokale Mitternachts-/Sommerzeit-Kanten können sonst an Monatsgrenzen ±1 Tag kippen
var cfAddDays=function(ymd,n){var p=ymd.split('-');var d=new Date(Date.UTC(+p[0],+p[1]-1,+p[2]));d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
var CF_KAT={bestellung:'🏭',fracht:'🚢',ppc:'📣',amazon:'🟠',ust:'🏛️',sonst:'📌'};

function renderCashflow(){
  var host=document.getElementById('cfBody');if(!host)return;
  var cf=cfData();
  var events=cf.events.filter(function(e){return !e.done}).slice().sort(function(a,b){return a.datum<b.datum?-1:1});

  // ── Projektion: laufender Saldo + Monats-Aggregation über 6 Monate ──
  var saldo=cf.startSaldo||0;
  var min={saldo:saldo,datum:'heute'};
  var months={};
  var horizon=new Date();horizon.setMonth(horizon.getMonth()+6);
  events.forEach(function(e){
    if(new Date(e.datum)>horizon)return;
    saldo+=(e.typ==='ein'?1:-1)*e.betrag;
    if(saldo<min.saldo)min={saldo:saldo,datum:e.datum,label:e.label};
    var mk=e.datum.slice(0,7);
    var m=months[mk]||(months[mk]={ein:0,aus:0,end:0});
    m[e.typ==='ein'?'ein':'aus']+=e.betrag;m.end=saldo;
  });
  var endSaldo=saldo;

  var mkeys=Object.keys(months).sort();
  var mrows=mkeys.map(function(mk){
    var m=months[mk];
    var name=new Date(mk+'-01T12:00:00').toLocaleDateString('de-DE',{month:'long',year:'2-digit'});
    return '<tr'+(m.end<0?' style="background:var(--rdd)"':'')+'><td style="font-weight:600">'+esc(name)+'</td>'
      +'<td class="nc" style="color:var(--gn)">+'+cfEur(m.ein)+'</td>'
      +'<td class="nc" style="color:var(--rd)">−'+cfEur(m.aus)+'</td>'
      +'<td class="nc" style="font-weight:700;'+(m.end<0?'color:var(--rd)':'')+'">'+cfEur(m.end)+'</td></tr>';
  }).join('');

  var warn=min.saldo<0
    ?'<div class="help-box" style="border-color:var(--rd);background:linear-gradient(135deg,var(--rdd),var(--s2))"><div class="help-icon">🚨</div><div class="help-body"><div class="help-title">Liquiditäts-Engpass: '+cfEur(min.saldo)+'</div><div class="help-text">Tiefpunkt am <b>'+esc(min.datum)+'</b>'+(min.label?' (nach „'+esc(min.label)+'")':'')+'. Optionen: Bestellung schieben, Menge senken, Anzahlung neu verhandeln oder Auszahlungs-Turnus prüfen.</div></div></div>'
    :(events.length?'<div class="help-box green"><div class="help-icon">✅</div><div class="help-body"><div class="help-title">Kein Engpass in Sicht</div><div class="help-text">Tiefster Kontostand im Zeitraum: <b>'+cfEur(min.saldo)+'</b>'+(min.datum!=='heute'?' am '+esc(min.datum):'')+'.</div></div></div>':'');

  // ── Posten-Liste ──
  var list=events.map(function(e){
    return '<tr><td>'+(CF_KAT[e.kategorie]||'📌')+'</td><td style="font-weight:600">'+esc(e.label)+(e.serie?' <span style="font-size:10px;color:var(--tx3)">(Serie)</span>':'')+'</td>'
      +'<td class="nc">'+esc(e.datum.split('-').reverse().join('.'))+'</td>'
      +'<td class="nc" style="font-weight:700;color:'+(e.typ==='ein'?'var(--gn)':'var(--rd)')+'">'+(e.typ==='ein'?'+':'−')+cfEur(e.betrag)+'</td>'
      +'<td><div class="row-act">'
      +'<button title="Erledigt (Geld ist geflossen — Posten verlässt die Vorschau, Kontostand oben anpassen)" onclick="cfDone(\''+e.id+'\')">✓</button>'
      +(e.serie?'<button title="Ganze Serie löschen" onclick="cfDelSerie(\''+esc(e.serie)+'\')">🗑×</button>':'')
      +'<button class="del" title="Löschen" onclick="cfDel(\''+e.id+'\')">🗑️</button>'
      +'</div></td></tr>';
  }).join('');

  var plansOffen=cfPpcPlans().length;
  host.innerHTML=
    '<div class="card"><h3>💶 Kontostand & Posten</h3>'
    +'<div class="toolbar" style="margin-bottom:8px">'
    +'<span style="font-size:12.5px;color:var(--tx2)">Kontostand heute:</span>'
    +'<input class="fsel" type="number" step="100" value="'+(cf.startSaldo||0)+'" style="width:120px" onchange="cfSetSaldo(this.value)"> €'
    +'<div style="flex:1"></div>'
    +'<button class="btn btn-sm" onclick="cfAddBestellung()">🏭 Bestellung planen</button>'
    +'<button class="btn btn-sm" onclick="cfAddAmazon()">🟠 Amazon-Auszahlungen</button>'
    +(plansOffen?'<button class="btn btn-sm" onclick="cfImportPpc()" title="Gespeicherte PPC-Pläne aus dem PPC-Planer als monatliche Ausgaben übernehmen">📣 PPC-Pläne übernehmen ('+plansOffen+')</button>':'')
    +'<button class="btn btn-p btn-sm" onclick="cfAddPosten()">＋ Posten</button>'
    +'</div>'
    +(events.length
      ?'<table><thead><tr><th></th><th>Posten</th><th class="nc">Datum</th><th class="nc">Betrag</th><th></th></tr></thead><tbody>'+list+'</tbody></table>'
      :'<div class="empty" style="padding:26px"><div class="eico">💶</div><h3>Noch keine Posten</h3>Starte mit „🏭 Bestellung planen" — der Assistent legt Anzahlung, Restzahlung und Fracht automatisch mit den richtigen Terminen an.</div>')
    +'</div>'
    +warn
    +(mkeys.length?'<div class="card"><h3>📆 6-Monats-Vorschau <span class="wika-help" data-tooltip="Reine Addition deiner Posten in Datums-Reihenfolge — keine Schätzung, keine KI.&#10;Erledigte Posten (✓) zählen nicht mehr: dann den echten Kontostand oben nachführen.&#10;Faustregel Amazon: Auszahlung ~alle 14 Tage, abzüglich Reserve.">ⓘ</span></h3>'
      +'<table><thead><tr><th>Monat</th><th class="nc">Eingänge</th><th class="nc">Ausgänge</th><th class="nc">Saldo Ende</th></tr></thead><tbody>'+mrows+'</tbody></table>'
      +'<div style="font-size:12px;color:var(--tx2);margin-top:8px">Saldo nach 6 Monaten: <b style="color:'+(endSaldo<0?'var(--rd)':'var(--gn)')+'">'+cfEur(endSaldo)+'</b> · USt nicht vergessen: Rückstellung ≈ 19 % der Brutto-Umsätze abzüglich Vorsteuer.</div></div>':'');
}

function cfSetSaldo(v){cfData().startSaldo=parseFloat(v)||0;save();renderCashflow();}
function cfDel(id){var cf=cfData();cf.events=cf.events.filter(function(e){return e.id!==id});save();renderCashflow();}
function cfDelSerie(s){var cf=cfData();cf.events=cf.events.filter(function(e){return e.serie!==s});save();renderCashflow();toast('Serie gelöscht');}
function cfDone(id){var e=cfData().events.find(function(x){return x.id===id});if(e){e.done=true;save();renderCashflow();toast('✓ Erledigt — Kontostand oben ggf. anpassen');}}

// ── Assistent: Bestellung → Anzahlung + Restzahlung + Fracht (richtige Termine) ──
function cfAddBestellung(){
  gmPrompt('🏭 Bestellung planen',[
    {l:'Bezeichnung *',id:'cfL'},{l:'Bestellwert gesamt €*',id:'cfW',t:'number'},
    {l:'Anzahlung %',id:'cfA',t:'number'},{l:'Produktionszeit (Tage)',id:'cfP',t:'number'},
    {l:'Frachtkosten €',id:'cfF',t:'number'},{l:'Frachtdauer (Tage)',id:'cfFd',t:'number'},
    {l:'Bestelldatum',id:'cfD',t:'date'},
  ],function(){
    var L=document.getElementById('cfL').value.trim()||'Bestellung';
    var W=parseFloat(document.getElementById('cfW').value)||0;
    var A=parseFloat(document.getElementById('cfA').value);if(isNaN(A))A=30;
    var P=parseInt(document.getElementById('cfP').value)||30;
    var F=parseFloat(document.getElementById('cfF').value)||0;
    var Fd=parseInt(document.getElementById('cfFd').value)||35;
    var D0=document.getElementById('cfD').value||cfYmd(new Date());
    if(W<=0)return toast('Bestellwert fehlt');
    var cf=cfData();
    cf.events.push({id:cfId(),typ:'aus',label:L+' — Anzahlung '+A+' %',datum:D0,betrag:W*A/100,kategorie:'bestellung'});
    if(A<100)cf.events.push({id:cfId(),typ:'aus',label:L+' — Restzahlung bei Verschiffung',datum:cfAddDays(D0,P),betrag:W*(100-A)/100,kategorie:'bestellung'});
    if(F>0)cf.events.push({id:cfId(),typ:'aus',label:L+' — Fracht/Zoll',datum:cfAddDays(D0,P+Fd),betrag:F,kategorie:'fracht'});
    save();renderCashflow();toast('✅ Bestellung mit '+(A<100?(F>0?3:2):(F>0?2:1))+' Zahlungsterminen angelegt');
  });
  // Defaults setzen (gmPrompt kennt keine Vorbelegung)
  document.getElementById('cfA').value=30;document.getElementById('cfP').value=30;
  document.getElementById('cfFd').value=35;document.getElementById('cfD').value=cfYmd(new Date());
}

// ── Amazon-Auszahlungen als 14-Tage-Serie ──
function cfAddAmazon(){
  gmPrompt('🟠 Amazon-Auszahlungen (14-tägig)',[
    {l:'Betrag je Auszahlung €*',id:'cfAb',t:'number'},
    {l:'Nächste Auszahlung am',id:'cfAd',t:'date'},
    {l:'Monate in die Zukunft',id:'cfAm',t:'number'},
  ],function(){
    var B=parseFloat(document.getElementById('cfAb').value)||0;
    var D0=document.getElementById('cfAd').value||cfYmd(new Date());
    var M=Math.min(12,parseInt(document.getElementById('cfAm').value)||6);
    if(B<=0)return toast('Betrag fehlt');
    var cf=cfData(),serie='amz'+Date.now().toString(36);
    var d=D0,ende=cfAddDays(cfYmd(new Date()),M*30);
    var n=0;
    while(d<=ende&&n<30){cf.events.push({id:cfId(),typ:'ein',label:'Amazon-Auszahlung',datum:d,betrag:B,kategorie:'amazon',serie:serie});d=cfAddDays(d,14);n++;}
    save();renderCashflow();toast('✅ '+n+' Auszahlungen eingeplant (Serie)');
  });
  document.getElementById('cfAd').value=cfYmd(new Date());document.getElementById('cfAm').value=6;
}

// ── Einzelposten ──
function cfAddPosten(){
  gmPrompt('＋ Posten',[
    {l:'Bezeichnung *',id:'cfL'},{l:'Betrag €*',id:'cfW',t:'number'},
    {l:'Richtung',id:'cfT',tag:'select',opts:['Ausgabe','Einnahme']},
    {l:'Kategorie',id:'cfK',tag:'select',opts:['sonst','bestellung','fracht','ppc','ust','amazon']},
    {l:'Datum',id:'cfD',t:'date'},
  ],function(){
    var W=parseFloat(document.getElementById('cfW').value)||0;if(W<=0)return toast('Betrag fehlt');
    cfData().events.push({id:cfId(),typ:document.getElementById('cfT').value==='Einnahme'?'ein':'aus',
      label:document.getElementById('cfL').value.trim()||'Posten',datum:document.getElementById('cfD').value||cfYmd(new Date()),
      betrag:W,kategorie:document.getElementById('cfK').value});
    save();renderCashflow();
  });
  document.getElementById('cfD').value=cfYmd(new Date());
}

// ── Synergie: gespeicherte PPC-Pläne (ppc.js) als monatliche Ausgaben übernehmen ──
function cfPpcPlans(){
  if(typeof ppcSources!=='function')return [];
  var done={};cfData().events.forEach(function(e){if(e.ppcRef)done[e.ppcRef]=1;});
  return ppcSources().filter(function(s){return s.obj.ppcPlan&&s.obj.ppcPlan.tagesbudget>0&&!done[s.id]});
}
function cfImportPpc(){
  var cf=cfData(),n=0;
  cfPpcPlans().forEach(function(s){
    var p=s.obj.ppcPlan,monate=p.monate||2;
    for(var i=0;i<monate;i++){
      cf.events.push({id:cfId(),typ:'aus',label:'PPC — '+s.name,datum:cfAddDays(cfYmd(new Date()),14+i*30),
        betrag:p.tagesbudget*30,kategorie:'ppc',ppcRef:s.id});n++;
    }
  });
  save();renderCashflow();toast('✅ '+n+' PPC-Monatsposten übernommen');
}
