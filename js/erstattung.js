// ═══ FBA-ERSTATTUNGS-CHECK (Seite „Betrieb → Erstattungen") ═══
// Amazon verliert/beschädigt Lagerware und erstattet vieles nur auf Antrag.
// Abgleich zweier Seller-Central-Berichte — KOMPLETT im Browser, nichts geht an Server:
//   1. Bestandsanpassungen (Berichte → Auftragsabwicklung → „Anpassungen des Bestands")
//   2. Erstattungen (Berichte → Auftragsabwicklung → „Erstattungen")
// Ergebnis: je SKU die offene Differenz (Verluste − Gefunden − bereits erstattet)
// mit Wert-Schätzung, Frist-Ampel (60-Tage-Fenster) und fertigem Fall-Text.
// Läuft NACH app.js (nutzt: D, save, toast, esc, parseCSV, gmPrompt-Umfeld).
'use strict';

// Anpassungsgrund-Codes des Berichts (relevant für Erstattungen)
var ER_CODES={M:'verloren',K:'verloren',E:'beschädigt',D:'beschädigt',F:'gefunden'};

function erFindCol(headers,res){
  for(var i=0;i<headers.length;i++){var h=String(headers[i]).toLowerCase();for(var j=0;j<res.length;j++)if(res[j].test(h))return headers[i];}
  return null;
}
var erNum=function(v){var n=parseFloat(String(v==null?'':v).replace(/[€$\s]/g,'').replace(/\.(?=\d{3})/g,'').replace(',','.'));return isNaN(n)?0:n;};

function erAnalyze(){
  var res=document.getElementById('erResult');if(!res)return;
  function fail(msg){res.innerHTML='<div style="background:var(--rdd);border:1px solid var(--rd);border-radius:8px;padding:10px 14px;font-size:12px;color:var(--rd);margin-top:10px">⚠️ '+msg+'</div>';}
  var rawA=(document.getElementById('erAdjInput')||{}).value||'';
  if(!rawA.trim())return toast('Bitte zuerst den Bestandsanpassungs-Bericht einfügen');
  if(!Array.isArray(D.products))D.products=[]; // Guard: frische Installation ohne Produktliste

  try{
    // ── 1. Bestandsanpassungen ──
    var pa=parseCSV(rawA);
    if(!pa.headers.length||!pa.rows.length)return fail('Anpassungs-Bericht: keine Tabelle erkannt — bitte inklusive Kopfzeile einfügen.');
    var cSku=erFindCol(pa.headers,[/händler-sku/,/merchant-sku/,/\bmsku\b/,/^sku$/,/\bsku\b/]);
    var cFn =erFindCol(pa.headers,[/fnsku/]);
    var cRes=erFindCol(pa.headers,[/anpassungsgrund/,/^reason$/,/grund/,/reason/]);
    var cQty=erFindCol(pa.headers,[/menge/,/quantity/]);
    var cDat=erFindCol(pa.headers,[/datum/,/^date$/,/date/]);
    var cNam=erFindCol(pa.headers,[/produktname/,/product-name/,/titel/,/title/]);
    if(!cRes||!cQty||(!cSku&&!cFn))return fail('Anpassungs-Bericht: Spalten nicht erkannt (erwartet SKU/FNSKU, Anpassungsgrund, Menge). Gefunden: '+esc(pa.headers.slice(0,8).join(' | ')));

    var bySku={};
    pa.rows.forEach(function(r){
      var code=String(r[cRes]||'').trim().toUpperCase();
      var art=ER_CODES[code];if(!art)return; // andere Codes (Transfers etc.) ignorieren
      var key=String((cSku&&r[cSku])||(cFn&&r[cFn])||'').trim();if(!key)return;
      var q=erNum(r[cQty]);
      var e=bySku[key]||(bySku[key]={sku:key,name:cNam?String(r[cNam]||'').slice(0,80):'',verloren:0,beschaedigt:0,gefunden:0,erstattet:0,letztes:''});
      if(art==='gefunden')e.gefunden+=Math.abs(q);
      else{
        e[art==='verloren'?'verloren':'beschaedigt']+=Math.abs(q);
        var d=cDat?String(r[cDat]||'').slice(0,10):'';
        if(d>e.letztes)e.letztes=d;
      }
    });

    // ── 2. Erstattungen (optional) ──
    var rawR=(document.getElementById('erReimInput')||{}).value||'';
    if(rawR.trim()){
      var pr=parseCSV(rawR);
      var rSku=erFindCol(pr.headers,[/händler-sku/,/merchant-sku/,/^sku$/,/\bsku\b/]);
      var rQty=erFindCol(pr.headers,[/erstattete.*menge/,/quantity.*reimbursed/,/menge/,/quantity/]);
      if(rSku&&rQty)pr.rows.forEach(function(r){
        var key=String(r[rSku]||'').trim();if(!key||!bySku[key])return;
        bySku[key].erstattet+=Math.abs(erNum(r[rQty]));
      });
    }

    // ── 3. Offene Fälle + Wert-Schätzung (VK − FBA-Gebühren aus der Produktliste) ──
    var faelle=Object.values(bySku).map(function(e){
      e.offen=e.verloren+e.beschaedigt-e.gefunden-e.erstattet;
      var p=(D.products||[]).find(function(x){return (x.sku&&x.sku===e.sku)||(x.asin&&x.asin===e.sku)||(x.name&&e.name&&e.name.indexOf(x.name)>-1)});
      e.wertStk=p&&p.verkaufspreis>0?Math.max(0,(p.verkaufspreis||0)-(p.fbaGebuehren||0)):null;
      e.wert=e.wertStk!=null?e.offen*e.wertStk:null;
      // Frist: FC-Verlust-Fälle müssen binnen 60 Tagen ab Anpassung eingereicht werden
      if(e.letztes){
        var frist=new Date(e.letztes+'T12:00:00');frist.setDate(frist.getDate()+60);
        var rest=Math.ceil((frist-new Date())/86400000);
        e.frist=rest<0?'⛔ evtl. verfristet':rest<=14?'⚠️ noch '+rest+' Tage':'✓ noch '+rest+' Tage';
        e.fristAlt=rest<0;
      }else{e.frist='—';}
      return e;
    }).filter(function(e){return e.offen>0}).sort(function(a,b){return (b.wert||0)-(a.wert||0)});

    var sumWert=faelle.reduce(function(s,e){return s+(e.wert||0)},0);
    var sumStk=faelle.reduce(function(s,e){return s+e.offen},0);
    window._erFaelle=faelle;

    if(!faelle.length){
      res.innerHTML='<div class="help-box green" style="margin-top:14px"><div class="help-icon">✅</div><div class="help-body"><div class="help-title">Keine offenen Fälle</div><div class="help-text">Alle Verluste/Beschädigungen sind durch Funde oder Erstattungen ausgeglichen — Amazon hat sauber gearbeitet.</div></div></div>';
      return;
    }
    var eur=function(n){return n==null?'—':n.toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2})+' €'};
    res.innerHTML=
      '<div class="help-box gold" style="margin:14px 0"><div class="help-icon">💸</div><div class="help-body">'
      +'<div class="help-title">'+faelle.length+' Kandidat'+(faelle.length===1?'':'en')+' — '+sumStk+' Stück offen'+(sumWert>0?', geschätzt '+eur(sumWert):'')+'</div>'
      +'<div class="help-text">Schätzwert = Stück × (VK − FBA-Gebühren) aus deiner Produktliste. Prüfe jeden Fall in Seller Central unter <b>Bestand → Bestandsanpassungen</b>, bevor du ihn einreichst (Hilfe → Support kontaktieren → FBA → Bestandsanpassung). Fälle sind i. d. R. nur <b>60 Tage</b> ab Anpassungsdatum einreichbar.</div></div></div>'
      +'<div class="card"><table><thead><tr><th>SKU</th><th>Produkt</th><th class="nc">Verloren</th><th class="nc">Beschädigt</th><th class="nc">Gefunden</th><th class="nc">Erstattet</th><th class="nc">Offen</th><th class="nc">Schätzwert</th><th>Frist</th><th></th></tr></thead><tbody>'
      +faelle.map(function(e,i){
        return '<tr'+(e.fristAlt?' style="opacity:.6"':'')+'><td style="font-weight:600">'+esc(e.sku)+'</td><td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+esc(e.name)+'">'+esc(e.name||'—')+'</td>'
          +'<td class="nc">'+e.verloren+'</td><td class="nc">'+e.beschaedigt+'</td><td class="nc">'+e.gefunden+'</td><td class="nc">'+e.erstattet+'</td>'
          +'<td class="nc" style="font-weight:700;color:var(--ac-text)">'+e.offen+'</td><td class="nc">'+eur(e.wert)+'</td>'
          +'<td style="font-size:11px;white-space:nowrap">'+e.frist+'</td>'
          +'<td><button class="btn btn-sm" onclick="erCopyCase('+i+')" title="Vorformulierten Fall-Text für den Seller Support kopieren">📋 Fall-Text</button></td></tr>';
      }).join('')
      +'</tbody></table></div>';
  }catch(err){fail(esc(err.message||String(err)));}
}

// Vorformulierter Support-Fall (DE) — der Seller passt nur noch Details an
function erCopyCase(i){
  var e=(window._erFaelle||[])[i];if(!e)return;
  var txt='Betreff: FBA-Erstattung — Bestandsanpassung ohne Ausgleich (SKU '+e.sku+')\n\n'
    +'Hallo,\n\nlaut meinem Bericht „Anpassungen des Bestands" wurden für die SKU '+e.sku
    +(e.name?' ('+e.name+')':'')+' insgesamt '+e.verloren+' Einheit(en) als verloren und '+e.beschaedigt
    +' als beschädigt verbucht'+(e.letztes?' (letzte Anpassung: '+e.letztes+')':'')+'. '
    +'Dem stehen '+e.gefunden+' wiedergefundene und '+e.erstattet+' erstattete Einheit(en) gegenüber.\n\n'
    +'Damit sind '+e.offen+' Einheit(en) weder wiedereingebucht noch erstattet. '
    +'Bitte prüft den Vorgang und erstattet die offenen Einheiten gemäß FBA-Richtlinie zu verlorenem und beschädigtem Lagerbestand.\n\n'
    +'Vielen Dank und freundliche Grüße';
  function fallback(){try{var ta=document.createElement('textarea');ta.value=txt;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();toast('📋 Fall-Text kopiert');}catch(e2){toast('⚠️ Kopieren nicht möglich');}}
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(txt).then(function(){toast('📋 Fall-Text kopiert — in Seller Central einfügen');},fallback);
  else fallback();
}

function erFile(e,targetId){
  var f=e.target.files[0];if(!f)return;
  var r=new FileReader();
  r.onerror=function(){toast('⚠️ Datei konnte nicht gelesen werden');};
  r.onload=function(ev){var inp=document.getElementById(targetId);if(inp){inp.value=ev.target.result;}};
  r.readAsText(f,'UTF-8');
  e.target.value='';
}
