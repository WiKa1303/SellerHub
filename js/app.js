// ═══════════════ VERSION ═══════════════
// Increment this on every meaningful change/bugfix/feature
var WIKA_VERSION='3.6.0';
var WIKA_BUILD_DATE='2026-05-03';
var WIKA_NAME='AMZ SellerHub';
var WIKA_TAGLINE='Smarte Werkzeuge für E-Commerce-Profis';

// ═══════════════ DATA LAYER ═══════════════
var D={products:[],competitors:[],keywords:[],reviews:[],suppliers:[],launches:[],ideen:[],sellerImports:[],aiListings:[],salesData:{},coachingProgress:{},researchCandidates:[],researchWorkflows:{}};
var SK='wika_v2';
var editIdx=-1;
var editIdeeIdx=-1;
var selectedIdeen=[];
var selectedProds=[];
var pSort={f:'datum',d:'desc'};
var iSort={f:'datum',d:'desc'};

function load(){try{
  // migrate v1
  var o=localStorage.getItem('wika_produktrecherche');
  if(o&&!localStorage.getItem(SK)){var p=JSON.parse(o);D.products=p;localStorage.setItem(SK,JSON.stringify(D));}
  var r=localStorage.getItem(SK);if(r)D=JSON.parse(r);
  // ensure arrays
  ['products','competitors','keywords','reviews','suppliers','launches','ideen','sellerImports','aiListings'].forEach(function(k){if(!D[k])D[k]=[];});
  if(!D.salesData||typeof D.salesData!=='object')D.salesData={};
  if(!D.coachingProgress||typeof D.coachingProgress!=='object')D.coachingProgress={};
  // Unified pipeline status migration (idempotent)
  if(typeof migratePipelineStatus==='function')migratePipelineStatus();
}catch(e){}}

// ─── Robustes Speichern: Debounce + Quota-Schutz ───
var _saveTimer=null;
var _saveQuotaWarned=false;
function _doSave(){
  try{
    localStorage.setItem(SK,JSON.stringify(D));
    var el=document.getElementById('lastSaved');
    if(el)el.textContent='Gespeichert '+new Date().toLocaleTimeString('de-DE');
    _saveQuotaWarned=false;
    if(typeof SHBackup!=='undefined')SHBackup.snapshotIfDue(); // Auto-Backup: 1 Snapshot/Tag (billig dank Tages-Flag)
  }catch(e){
    // QuotaExceededError (Speicher voll) oder anderer Schreibfehler
    var isQuota=e&&(e.name==='QuotaExceededError'||e.code===22||e.code===1014);
    var el=document.getElementById('lastSaved');
    if(el)el.textContent=isQuota?'⚠️ Speicher voll!':'⚠️ Speichern fehlgeschlagen';
    if(el)el.style.color='var(--rd)';
    if(isQuota && !_saveQuotaWarned){
      _saveQuotaWarned=true;
      if(typeof toast==='function')toast('⚠️ Speicher voll! Bitte ein Backup exportieren und alte Daten löschen.');
      // Einmalige ausführliche Warnung
      setTimeout(function(){
        alert('AMZ SellerHub konnte nicht speichern: Der lokale Browser-Speicher ist voll.\n\nSo löst du das:\n1. Exportiere ein Backup (Dashboard → Daten exportieren)\n2. Lösche nicht mehr benötigte Daten (alte Produkte, Ideen, erledigte Aufgaben)\n\nDeine zuletzt gemachten Änderungen sind möglicherweise NICHT gespeichert.');
      },300);
    }
  }
}
// Debounced: bündelt schnelle Folge-Aufrufe (z.B. Tippen), schreibt nach 300ms Ruhe
function save(){
  if(_saveTimer)clearTimeout(_saveTimer);
  _saveTimer=setTimeout(function(){_saveTimer=null;_doSave();},300);
}
// Sofort speichern (für kritische Momente: Export, Logout, Seitenwechsel)
function saveNow(){
  if(_saveTimer){clearTimeout(_saveTimer);_saveTimer=null;}
  _doSave();
}
// Sicherheitsnetz: beim Schließen/Verlassen ausstehende Änderungen sofort schreiben
window.addEventListener('beforeunload',function(){
  if(_saveTimer){clearTimeout(_saveTimer);_saveTimer=null;_doSave();}
});

// ─── Auto-Backup (Phase 1.3): tägliche Snapshots in IndexedDB ───
// Schützt vor Fehlbedienung/kaputten Daten/vollem localStorage. Getrennter Speicher (IndexedDB),
// aber gleiche Browser-Origin → gegen Browser-Datenlöschung hilft NUR der Datei-Export (Erinnerung s. Dashboard).
var SHBackup=(function(){
  var DBN='sellerhub_backups',STORE='snapshots',KEEP=10;
  function openDb(cb){
    try{
      var rq=indexedDB.open(DBN,1);
      rq.onupgradeneeded=function(){rq.result.createObjectStore(STORE,{keyPath:'id'});};
      rq.onsuccess=function(){cb(rq.result);};
      rq.onerror=function(){cb(null);};
    }catch(e){cb(null);}
  }
  function hasData(){
    return !!((D.products&&D.products.length)||(D.ideen&&D.ideen.length)||(D.research&&D.research.candidates&&D.research.candidates.length)||(D.research&&D.research.shortlist&&D.research.shortlist.length));
  }
  // Ein Snapshot pro Tag (Tages-Flag in localStorage vermeidet IndexedDB-Zugriff bei jedem save)
  function snapshotIfDue(){
    if(!hasData())return;
    var today=new Date().toISOString().slice(0,10);
    try{if(localStorage.getItem('wika_lastSnapshotDay')===today)return;}catch(e){}
    var raw;try{raw=localStorage.getItem(SK);}catch(e){}
    if(!raw)raw=JSON.stringify(D);
    writeSnap(today,raw,function(ok){
      if(ok){try{localStorage.setItem('wika_lastSnapshotDay',today);}catch(e){}}
    });
  }
  function writeSnap(id,raw,cb){
    openDb(function(db){
      if(!db){if(cb)cb(false);return;}
      try{
        var tx=db.transaction(STORE,'readwrite'),st=tx.objectStore(STORE);
        st.put({id:id,ts:new Date().toISOString(),bytes:raw.length,data:raw});
        var kq=st.getAllKeys();
        kq.onsuccess=function(){
          var keys=(kq.result||[]).slice().sort();
          while(keys.length>KEEP){st.delete(keys.shift());}
        };
        tx.oncomplete=function(){db.close();if(cb)cb(true);};
        tx.onerror=function(){db.close();if(cb)cb(false);};
      }catch(e){if(cb)cb(false);}
    });
  }
  function list(cb){
    openDb(function(db){
      if(!db){cb([]);return;}
      try{
        var rq=db.transaction(STORE,'readonly').objectStore(STORE).getAll();
        rq.onsuccess=function(){var a=rq.result||[];a.sort(function(x,y){return x.id<y.id?1:-1});db.close();cb(a);};
        rq.onerror=function(){db.close();cb([]);};
      }catch(e){cb([]);}
    });
  }
  function get(id,cb){
    openDb(function(db){
      if(!db){cb(null);return;}
      try{
        var rq=db.transaction(STORE,'readonly').objectStore(STORE).get(id);
        rq.onsuccess=function(){db.close();cb(rq.result||null);};
        rq.onerror=function(){db.close();cb(null);};
      }catch(e){cb(null);}
    });
  }
  function restore(id){
    get(id,function(snap){
      if(!snap){toast('Snapshot nicht gefunden');return;}
      if(!confirm('Daten-Stand vom '+id+' wiederherstellen?\n\nDer AKTUELLE Stand wird überschrieben (wird vorher als Sicherheits-Snapshot gesichert). Die App lädt danach neu.'))return;
      var cur;try{cur=localStorage.getItem(SK);}catch(e){}
      var fin=function(){
        try{localStorage.setItem(SK,snap.data);localStorage.removeItem('wika_lastSnapshotDay');}catch(e){alert('Wiederherstellen fehlgeschlagen: '+e.message);return;}
        location.reload();
      };
      if(cur)writeSnap(new Date().toISOString().slice(0,10)+'_vor-restore',cur,fin);else fin();
    });
  }
  function download(id){
    get(id,function(snap){
      if(!snap){toast('Snapshot nicht gefunden');return;}
      var blob=new Blob([snap.data],{type:'application/json'});
      var url=URL.createObjectURL(blob);
      var a=document.createElement('a');
      a.href=url;a.download='sellerhub-snapshot-'+id+'.json';
      document.body.appendChild(a);a.click();
      setTimeout(function(){document.body.removeChild(a);URL.revokeObjectURL(url);},100);
    });
  }
  return {snapshotIfDue:snapshotIfDue,list:list,restore:restore,download:download};
})();
// Beim App-Start (nach load): Tages-Snapshot anlegen, falls heute noch keiner existiert
setTimeout(function(){try{SHBackup.snapshotIfDue();}catch(e){}},2500);

// Export all wika data for migration to portable version
function wikaExportAll(){
  if(typeof saveNow==='function')saveNow(); // ausstehende Änderungen sofort schreiben
  var dump={
    __wika_meta:{version:1,savedAt:new Date().toISOString(),app:'SellerHub'},
    localStorage:{}
  };
  for(var i=0;i<localStorage.length;i++){
    var k=localStorage.key(i);
    if(k.indexOf('wika_')===0||k.indexOf('wika-')===0){
      dump.localStorage[k]=localStorage.getItem(k);
    }
  }
  var blob=new Blob([JSON.stringify(dump,null,2)],{type:'application/json'});
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a');
  a.href=url;
  a.download='sellerhub-data.json';
  document.body.appendChild(a);
  a.click();
  setTimeout(function(){document.body.removeChild(a);URL.revokeObjectURL(url);},100);
  try{localStorage.setItem('wika_lastExport',new Date().toISOString());}catch(e){}
  if(typeof renderBackupHint==='function')renderBackupHint();
  if(window.toast)toast('✅ Daten exportiert: sellerhub-data.json');
}

function wikaImportAll(){
  var input=document.createElement('input');
  input.type='file';
  input.accept='.json,application/json';
  input.onchange=function(e){
    var file=e.target.files[0];
    if(!file)return;
    var reader=new FileReader();
    reader.onload=function(ev){
      try{
        var data=JSON.parse(ev.target.result);
        if(!data.localStorage){alert('Datei ist kein gültiges AMZ SellerHub-Format.');return;}
        if(!confirm('Alle aktuellen Daten überschreiben mit Inhalt aus "'+file.name+'"?'))return;
        // Clear old wika keys
        var rm=[];
        for(var i=0;i<localStorage.length;i++){
          var k=localStorage.key(i);
          if(k.indexOf('wika_')===0||k.indexOf('wika-')===0)rm.push(k);
        }
        rm.forEach(function(k){localStorage.removeItem(k);});
        Object.keys(data.localStorage).forEach(function(k){
          try{localStorage.setItem(k,data.localStorage[k]);}catch(e){}
        });
        alert('Import erfolgreich. Anwendung wird neu geladen.');
        location.reload();
      }catch(err){alert('Fehler: '+err.message);}
    };
    reader.readAsText(file);
  };
  input.click();
}

// ─── Backup-Center: Snapshots ansehen/wiederherstellen + Export-Erinnerung ───
function backupOpen(){
  var old=document.getElementById('backupModal');if(old)old.remove();
  var ov=document.createElement('div');
  ov.id='backupModal';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99997;display:flex;align-items:center;justify-content:center;padding:20px';
  ov.onclick=function(e){if(e.target===ov)ov.remove();};
  var last=null;try{last=localStorage.getItem('wika_lastExport');}catch(e){}
  var lastTxt=last?new Date(last).toLocaleDateString('de-DE')+' '+new Date(last).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})+' Uhr':'noch nie';
  ov.innerHTML='<div style="background:var(--s1);border-radius:14px;max-width:620px;width:100%;max-height:90vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.5)">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid var(--bd)"><h2 style="margin:0;font-size:17px">🛟 Backups</h2><button onclick="document.getElementById(\'backupModal\').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--tx2)">✕</button></div>'+
    '<div style="padding:18px 20px">'+
      '<div style="font-size:12px;color:var(--tx2);line-height:1.6;margin-bottom:12px">AMZ SellerHub sichert deine Daten <b>automatisch 1× täglich</b> als Snapshot im Browser (letzte 10 Tage). Snapshots schützen vor Fehlbedienung und kaputten Daten – <b>nicht</b> vor dem Löschen der Browser-Daten. Dagegen hilft nur der <b>Datei-Export</b> (letzter: <b>'+lastTxt+'</b>).</div>'+
      '<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap"><button class="btn btn-p btn-sm" onclick="wikaExportAll();document.getElementById(\'backupModal\').remove()">⬇ Jetzt als Datei exportieren</button><button class="btn btn-sm" onclick="wikaImportAll()">⬆ Datei importieren</button></div>'+
      '<div style="font-weight:700;font-size:13px;color:var(--tx);margin-bottom:8px">Automatische Snapshots</div>'+
      '<div id="backupList" style="display:flex;flex-direction:column;gap:6px"><div style="font-size:12px;color:var(--tx3)">Lade …</div></div>'+
    '</div>'+
  '</div>';
  document.body.appendChild(ov);
  SHBackup.list(function(snaps){
    var el=document.getElementById('backupList');if(!el)return;
    if(!snaps.length){el.innerHTML='<div style="font-size:12px;color:var(--tx3)">Noch keine Snapshots – der erste wird automatisch angelegt, sobald Daten vorhanden sind.</div>';return;}
    el.innerHTML=snaps.map(function(s){
      var kb=Math.max(1,Math.round((s.bytes||0)/1024));
      var n={p:0,i:0,k:0};
      try{var d=JSON.parse(s.data);n.p=(d.products||[]).length;n.i=(d.ideen||[]).length;n.k=(d.research&&d.research.candidates||[]).length;}catch(e){}
      return '<div style="display:flex;align-items:center;gap:10px;background:var(--s2);border:1px solid var(--bd);border-radius:8px;padding:8px 12px">'+
        '<div style="flex:1;min-width:0"><div style="font-weight:700;font-size:12.5px;color:var(--tx)">📅 '+esc(s.id)+'</div><div style="font-size:10.5px;color:var(--tx3)">'+n.p+' Produkte · '+n.i+' Ideen · '+n.k+' Kandidaten · '+kb+' KB</div></div>'+
        '<button class="btn btn-sm" onclick="SHBackup.download(\''+esc(s.id)+'\')" title="Als JSON-Datei herunterladen" style="font-size:10.5px">⬇</button>'+
        '<button class="btn btn-sm" onclick="SHBackup.restore(\''+esc(s.id)+'\')" title="Diesen Stand wiederherstellen" style="font-size:10.5px;background:var(--acd);color:var(--ac);border:1px solid var(--ac);font-weight:700">↩ Wiederherstellen</button>'+
      '</div>';
    }).join('');
  });
}

// Dashboard-Hinweis: Datei-Export älter als 7 Tage (oder nie) → Erinnerung
function renderBackupHint(){
  var el=document.getElementById('dashBackupHint');if(!el)return;
  var hasData=!!((D.products&&D.products.length)||(D.ideen&&D.ideen.length)||(D.research&&D.research.candidates&&D.research.candidates.length));
  var last=null;try{last=localStorage.getItem('wika_lastExport');}catch(e){}
  var days=last?Math.floor((Date.now()-new Date(last).getTime())/864e5):null;
  if(!hasData||(days!==null&&days<7)){el.innerHTML='';return;}
  el.innerHTML='<div style="background:var(--acd);border:1px solid var(--ac);border-radius:10px;padding:10px 14px;margin-bottom:14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">'+
    '<div style="flex:1;min-width:200px;font-size:12.5px;color:var(--tx)">🛟 <b>Backup-Erinnerung:</b> '+(days===null?'Deine Daten wurden noch nie als Datei gesichert':'Letzte Datei-Sicherung vor '+days+' Tagen')+'. Browser-Speicher kann verloren gehen – 1 Klick genügt.</div>'+
    '<button class="btn btn-p btn-sm" onclick="wikaExportAll()" style="font-size:11px">⬇ Jetzt sichern</button>'+
    '<button class="btn btn-sm" onclick="backupOpen()" style="font-size:11px">🛟 Backups</button>'+
  '</div>';
}

// ─── Seller-Radar-Widget (MVP): Top-News + Events aus dem Radar-Backend ───
// Standard-API = Live-Backend auf Railway; überschreibbar (z. B. lokales Backend) via:
//   localStorage.setItem('wika_radar_api','https://<radar-api>')  (s. server/README.md)
var RADAR_API_DEFAULT='https://radar-production-388a.up.railway.app';
function radarApi(){try{return (localStorage.getItem('wika_radar_api')||RADAR_API_DEFAULT).replace(/\/+$/,'');}catch(e){return RADAR_API_DEFAULT;}}
function radarRelTime(iso){
  var ms=Date.now()-new Date(iso).getTime();
  var h=Math.round(ms/36e5);
  if(h<1)return 'gerade eben';if(h<24)return 'vor '+h+' Std.';
  var d=Math.round(h/24);return d===1?'gestern':'vor '+d+' Tagen';
}
// Seller-Profil (Phase 3): bleibt lokal im Browser, wird als Query-Parameter mitgeschickt.
//   localStorage.setItem('wika_radar_profile', JSON.stringify({seller_type:'private_label',revenue:'starter',markets:['DE'],interests:['ppc','recht']}))
function radarProfileParams(){
  try{
    var p=JSON.parse(localStorage.getItem('wika_radar_profile')||'null');
    if(!p)return '';
    var q=[];
    if(p.seller_type)q.push('seller_type='+encodeURIComponent(p.seller_type));
    if(p.revenue)q.push('revenue='+encodeURIComponent(p.revenue));
    if(p.markets&&p.markets.length)q.push('markets='+encodeURIComponent(p.markets.join(',')));
    if(p.interests&&p.interests.length)q.push('interests='+encodeURIComponent(p.interests.join(',')));
    return q.length?'?'+q.join('&'):'';
  }catch(e){return '';}
}
function renderRadarWidget(){
  var el=document.getElementById('dashRadar');if(!el)return;
  var api=radarApi();
  if(!api){el.innerHTML='';return;}
  var cached=null;try{cached=JSON.parse(localStorage.getItem('wika_radar_cache')||'null');}catch(e){}
  if(cached)el.innerHTML=radarWidgetHtml(cached); // sofort malen (Login-Moment), dann frisch laden
  Promise.all([
    fetch(api+'/api/dashboard-feed'+radarProfileParams()).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();}),
    fetch(api+'/api/market-intelligence').then(function(r){return r.ok?r.json():null;}).catch(function(){return null;}),
    fetch(api+'/api/forecast?limit=3').then(function(r){return r.ok?r.json():null;}).catch(function(){return null;})
  ]).then(function(res){
    var d=res[0];d.mi=res[1];d.fc=res[2];
    try{localStorage.setItem('wika_radar_cache',JSON.stringify(d));}catch(e){}
    el.innerHTML=radarWidgetHtml(d);
  }).catch(function(){
    if(!cached)el.innerHTML='<div style="background:var(--s1);border:1px dashed var(--bd2);border-radius:12px;padding:10px 16px;margin-bottom:14px;font-size:12px;color:var(--tx3)">📡 Seller-Radar: API nicht erreichbar ('+esc(api)+')</div>';
  });
}
// Kategorie-Chip-Farben (KI-Kategorien aus Phase 3)
var RADAR_CAT={recht:['rd','⚖️ Recht'],steuern:['rd','💶 Steuern'],ppc:['bl','📣 PPC'],produktrecherche:['pu','🔎 Recherche'],logistik:['cy','🚚 Logistik'],events:['ac','📅 Event'],trends:['gn','📈 Trend'],sonstiges:['tx3','·']};
function radarWidgetHtml(d){
  var h='<div style="background:var(--s1);border:1px solid var(--bd);border-radius:16px;padding:16px 20px;margin-bottom:18px">';
  h+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:6px"><h3 style="margin:0;font-size:15px">📡 Seller-Radar <span style="font-size:11px;color:var(--tx3);font-weight:400">News &amp; Events für FBA-Seller (DACH)</span></h3>'+(d.meta&&d.meta.lastCrawl?'<span style="font-size:10.5px;color:var(--tx3)">Stand: '+radarRelTime(d.meta.lastCrawl)+'</span>':'')+'</div>';
  // ── Critical-Alerts (Phase 4): gepinnt, genau wie im Konzept-Mockup der Pflicht-Slot ──
  if(d.critical_alerts&&d.critical_alerts.length){
    d.critical_alerts.slice(0,2).forEach(function(a){
      h+='<a href="'+esc(a.url)+'" target="_blank" rel="noopener" style="display:block;text-decoration:none;background:var(--rdd);border:1.5px solid var(--rd);border-radius:10px;padding:9px 13px;margin-bottom:8px">'+
        '<div style="font-size:12.5px;font-weight:700;color:var(--rd)">🚨 CRITICAL · '+esc((a.risk_type||'').toUpperCase())+' <span style="font-weight:400;color:var(--tx3);font-size:10.5px">· '+radarRelTime(a.publish_date||a.created_at)+'</span></div>'+
        '<div style="font-size:12.5px;color:var(--tx);margin-top:2px">'+esc(a.title)+(a.ai_affected?' <span style="color:var(--tx3);font-size:11px">— betrifft: '+esc(a.ai_affected)+'</span>':'')+'</div></a>';
    });
  }
  // ── Strategy Engine: Tages-Briefing (Headline + Top-Priorität) ──
  if(d.mi&&d.mi.strategy&&d.mi.strategy.headline){
    var st=d.mi.strategy;var p0=(st.priorities&&st.priorities[0])||null;
    h+='<div style="background:linear-gradient(135deg,var(--pud),var(--s2));border:1px solid var(--pu);border-radius:10px;padding:10px 14px;margin-bottom:12px">'+
      '<div style="font-size:11px;font-weight:700;color:var(--pu);text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px">🧭 Strategie-Briefing · '+esc(st.day||'')+'</div>'+
      '<div style="font-size:13px;font-weight:700;color:var(--tx);line-height:1.4">'+esc(st.headline)+'</div>'+
      (p0?'<div style="font-size:11.5px;color:var(--tx2);margin-top:4px">1. Priorität ('+(p0.type==='chance'?'✦ Chance':'⚠ Risiko')+'): <b>'+esc(p0.title)+'</b> → '+esc(p0.action)+'</div>':'')+
    '</div>';
  }
  // ── Market Intelligence (Phase 4): Top-Trends mit Handlungsempfehlung ──
  if(d.mi&&d.mi.rising_trends&&d.mi.rising_trends.length){
    h+='<div style="background:var(--s2);border:1px solid var(--bd);border-radius:10px;padding:10px 14px;margin-bottom:12px">';
    h+='<div style="font-size:11px;font-weight:700;color:var(--tx2);text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px">📊 Markt-Radar · steigende Themen</div>';
    d.mi.rising_trends.slice(0,3).forEach(function(tr){
      var rooCol=tr.risk_or_opportunity==='risiko'?'rd':tr.risk_or_opportunity==='chance'?'gn':'tx3';
      h+='<div style="padding:5px 0;border-top:1px solid var(--bd)">'+
        '<div style="font-size:12px;font-weight:700;color:var(--tx)">'+(tr.spike?'🔥 ':'')+esc(tr.topic_name)+
          ' <span style="color:var(--'+rooCol+');font-size:10.5px">'+(tr.risk_or_opportunity==='risiko'?'⚠ Risiko':tr.risk_or_opportunity==='chance'?'✦ Chance':'')+'</span>'+
          ' <span style="color:var(--tx3);font-size:10.5px;font-weight:400">· Score '+tr.trend_score+' · '+(tr.growth_rate>=0?'+':'')+tr.growth_rate+' % · '+tr.mentions_7d+'× in 7 T.</span></div>'+
        (tr.recommended_action?'<div style="font-size:11px;color:var(--tx2);margin-top:1px">→ '+esc(tr.recommended_action)+'</div>':'')+
      '</div>';
    });
    h+='</div>';
  }
  // ── Trend-Prognose (Phase 5): Holt-Forecast über die Themen-Zeitreihen; erscheint erst, wenn genug Tage gesammelt sind ──
  if(d.fc&&d.fc.items&&d.fc.items.length){
    var FC_DIR={steigend:['gn','↗ steigend'],fallend:['rd','↘ fallend'],stabil:['tx3','→ stabil']};
    h+='<div style="background:var(--s2);border:1px solid var(--bd);border-radius:10px;padding:10px 14px;margin-bottom:12px">';
    h+='<div style="font-size:11px;font-weight:700;color:var(--tx2);text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px">📈 Trend-Prognose · nächste 7 Tage</div>';
    d.fc.items.slice(0,3).forEach(function(f){
      var dir=FC_DIR[f.direction]||FC_DIR.stabil;
      h+='<div style="padding:5px 0;border-top:1px solid var(--bd)" title="'+esc(f.reasoning||'')+'">'+
        '<span style="font-size:12px;font-weight:700;color:var(--tx)">'+esc(f.topic_name)+'</span> '+
        '<span style="color:var(--'+dir[0]+');font-size:11px;font-weight:700">'+dir[1]+'</span>'+
        '<span style="color:var(--tx3);font-size:10.5px"> · Konfidenz '+(f.confidence!=null?f.confidence:'–')+' %</span>'+
      '</div>';
    });
    if(d.fc.meta&&d.fc.meta.hint)h+='<div style="font-size:11px;color:var(--tx2);margin-top:5px">🤖 '+esc(d.fc.meta.hint)+'</div>';
    h+='</div>';
  }
  h+='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px">';
  // News-Spalte
  h+='<div><div style="font-size:11px;font-weight:700;color:var(--tx2);text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px">📰 Top-News</div>';
  if(d.news&&d.news.length){
    d.news.forEach(function(n){
      var cat=n.ai_category&&RADAR_CAT[n.ai_category]?RADAR_CAT[n.ai_category]:null;
      var score=n.ai_score!=null?n.ai_score:n.relevance_score;
      var why=(n.why&&n.why.length)?' title="Warum: '+esc(n.why.join(' · '))+'"':' title="Relevanz-Score 0–100"';
      h+='<a href="'+esc(n.url)+'" target="_blank" rel="noopener" style="display:block;text-decoration:none;padding:7px 0;border-bottom:1px solid var(--bd)">'+
        '<div style="font-size:12.5px;font-weight:600;color:var(--tx);line-height:1.4">'+(n.ai_urgency==='hoch'?'<span style="color:var(--rd)" title="dringend">⚠️ </span>':'')+esc(n.title)+'</div>'+
        (n.ai_summary&&n.ai_summary.length?'<div style="font-size:11px;color:var(--tx2);margin-top:2px;line-height:1.45">→ '+esc(n.ai_summary[0])+'</div>':'')+
        '<div style="font-size:10.5px;color:var(--tx3);margin-top:2px">'+
          (cat?'<span style="background:var(--'+cat[0]+(cat[0]==='tx3'?'':'d')+');color:var(--'+cat[0]+');border-radius:7px;padding:1px 7px;font-weight:700;margin-right:5px">'+cat[1]+'</span>':'')+
          esc(n.source)+' · '+radarRelTime(n.publish_date)+' · <span'+why+'>'+(n.ai_score!=null?'🤖':'🔥')+' '+score+'</span></div></a>';
    });
  }else h+='<div style="font-size:12px;color:var(--tx3)">Noch keine News – der Crawler läuft 2× täglich.</div>';
  h+='</div>';
  // Events-Spalte
  h+='<div><div style="font-size:11px;font-weight:700;color:var(--tx2);text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px">📅 Events</div>';
  if(d.events&&d.events.length){
    d.events.forEach(function(ev){
      h+='<a href="'+esc(ev.url)+'" target="_blank" rel="noopener" style="display:block;text-decoration:none;padding:7px 0;border-bottom:1px solid var(--bd)">'+
        '<div style="font-size:12.5px;font-weight:600;color:var(--tx);line-height:1.4">'+esc(ev.title)+'</div>'+
        '<div style="font-size:10.5px;color:var(--tx3);margin-top:2px">'+(ev.event_start?new Date(ev.event_start).toLocaleDateString('de-DE')+' · ':'')+esc(ev.source)+'</div></a>';
    });
  }else h+='<div style="font-size:12px;color:var(--tx3)">Keine kommenden Events erkannt.</div>';
  h+='</div></div></div>';
  return h;
}

// ═══════════════ NAVIGATION ═══════════════
function go(name){
  // If leaving detail view with unsaved changes, save them silently
  var leavingDetail=document.getElementById('p-detail').classList.contains('active')&&name!=='detail';
  if(leavingDetail&&detailDirty){
    save();
    setDetailSaved();
  }
  // Admin guard: only admins can access the admin page
  if(name==='admin'){
    var u=window.WikaAuth?window.WikaAuth.currentUser():null;
    if(!u||u.role!=='admin'){
      if(window.toast)toast('🚫 Kein Zugriff auf den Admin-Bereich');
      name='dashboard';
    }
  }
  document.querySelectorAll('.page').forEach(function(p){p.classList.remove('active')});
  var page=document.getElementById('p-'+name);
  if(page)page.classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(function(b){b.classList.remove('active')});
  // For detail view, highlight the produkte sidebar entry
  // Übersicht-Seite entfernt → auf Konkurrenz-Tabelle umleiten
  if(name==='findung')name='research';
  var sidebarKey=name==='detail'?'produkte':(['ideen','research','auswahl'].indexOf(name)>-1?'pipeline':name);
  var btns=document.querySelectorAll('.nav-btn');
  for(var i=0;i<btns.length;i++){if(btns[i].getAttribute('onclick')==="go('"+sidebarKey+"')")btns[i].classList.add('active');}
  // Nav-Gruppen (Accordion): Gruppe der aktiven Seite öffnen, übrige schließen
  var navGroupMap={findung:'recherche',pipeline:'recherche',ideen:'recherche',research:'recherche',auswahl:'recherche',nischen:'recherche',gebuehren:'recherche',kalkulation:'recherche',helium:'recherche',produkte:'betrieb',detail:'betrieb',keywords:'betrieb',keywordclean:'betrieb',listing:'betrieb',inhalt:'betrieb',launch:'betrieb',lager:'betrieb',sourcing:'betrieb',tasks:'mehr',coaching:'mehr',admin:'admin'};
  var activeGrp=navGroupMap[sidebarKey]||navGroupMap[name];
  document.querySelectorAll('.nav-group').forEach(function(g){
    var on=g.id==='navgrp-'+activeGrp;
    g.classList.toggle('open',on);
    g.classList.toggle('has-active',on);
  });
  if(typeof refreshNavGroupBadges==='function')refreshNavGroupBadges();
  document.querySelector('.sidebar').classList.remove('open');
  // refresh
  if(name==='dashboard')renderDash();
  if(name==='news'&&typeof renderNewsPage==='function')renderNewsPage();
  if(name==='findung')renderFindungHub();
  if(name==='ideen')renderIdeen();
  if(name==='research')renderResearch();
  if(name==='auswahl')renderAuswahl();
  if(name==='coaching')renderCoaching();
  if(name==='tasks')renderTasks();
  if(name==='nischen')renderNischen();
  if(name==='pipeline'&&typeof renderPipeline==='function')renderPipeline();
  if(name==='listing')renderListing();
  if(name==='keywords'){if(typeof renderKW==='function')renderKW();if(typeof renderKeywordClean==='function')renderKeywordClean();}
  if(name==='keywordclean'){go('keywords');switchKwTab('cleaner');return;}
  if(name==='admin'&&typeof adminRenderUsers==='function')adminRenderUsers();
  if(name==='keywords'||name==='sourcing'||name==='launch')fillProdSelects();
  if(name==='gebuehren'){switchCalcTab(calcActiveTab||'full');if(typeof fbaPopulateSelects==='function'){fbaPopulateSelects();fbaTogglePpc();fbaCalc();}if(typeof qCalc==='function')qCalc();}
  if(name==='kalkulation'){go('gebuehren');switchCalcTab('quick');return;}
  // Sub-Navigation entfernt – alle Produktfindungs-Punkte stehen links in der Sidebar.
  // Falls noch eine alte Sub-Nav-Leiste im DOM hängt (z.B. aus früherer Sitzung), entfernen:
  var _sn=document.querySelector('#p-'+name+' .findung-subnav');if(_sn&&_sn.parentNode)_sn.parentNode.removeChild(_sn);
  // Restore default title when leaving detail view
  if(name!=='detail')document.title=WIKA_NAME+' v'+WIKA_VERSION;
}

// ── Seiten-Navigation: Gruppen auf-/zuklappen (Accordion) ──
function toggleNavGroup(id){
  var g=document.getElementById('navgrp-'+id);
  if(!g)return;
  var open=g.classList.contains('open');
  document.querySelectorAll('.nav-group').forEach(function(x){if(x!==g)x.classList.remove('open');});
  g.classList.toggle('open',!open);
}
window.toggleNavGroup=toggleNavGroup;

// Punkt am Gruppenkopf zeigen, wenn eine eingeklappte Gruppe ungelesene Badges hat
function refreshNavGroupBadges(){
  document.querySelectorAll('.nav-group').forEach(function(g){
    var hb=g.querySelector('.grp-badge');if(!hb)return;
    var any=false;
    g.querySelectorAll('.nav-group-body [id$="Badge"]').forEach(function(b){
      if(b.style.display!=='none' && (b.textContent||'').trim()!=='')any=true;
    });
    hb.style.display=any?'':'none';
  });
}
window.refreshNavGroupBadges=refreshNavGroupBadges;

// ═══════════════════════════════════════════════════════════════
// PRODUKTRECHERCHE – Arbeitsbereich (4 Tabs)
// Master-Tabelle | Workflow-Tracker | Score-Matrix | Prompt-Bibliothek
// ═══════════════════════════════════════════════════════════════

// ─── STATE ───
var researchSelectedCandidate=null; // id of candidate viewed in workflow/score tabs

// ─── PROMPT LIBRARY (alle Prompts aus dem Guide) ───
var RESEARCH_PROMPTS=[
  // ═════════ Phase 1: Ideenfindung & Filterung (Schritte 1-5) ═════════
  {id:'p_felder',phase:'recherche',phaseLabel:'🔍 Recherche-Phase',step:1,tool:'claude',title:'Produktfelder vorschlagen lassen',text:'Du bist mein Amazon-FBA-Strategieberater für den deutschen Markt.\n\nIch möchte Produkte im Bereich Bad, Fliesen, Sanitär, Heimwerker und Renovierung finden.\n\nErstelle mir 10 sinnvolle Produktfelder für Amazon FBA Deutschland. Berücksichtige:\n- stabile Nachfrage\n- kleine bis mittelgroße Produkte\n- geringe Haftungsrisiken\n- wenig technische Komplexität\n- gute Differenzierungsmöglichkeiten\n- Produkte, die Kunden bei Renovierung, Montage, Ordnung, Reinigung oder Reparatur helfen\n\nGib mir pro Produktfeld:\n1. Beschreibung\n2. typische Kundenprobleme\n3. mögliche Produktarten\n4. Risiken\n5. Empfehlung: hoch, mittel oder niedrig'},
  {id:'p_ideen',phase:'recherche',phaseLabel:'🔍 Recherche-Phase',step:2,tool:'perplexity',title:'Produktideen mit Problembezug finden',text:'Finde konkrete Amazon-FBA-Produktideen für Deutschland in den Bereichen Bad, Fliesen, Sanitär, Heimwerker und Renovierung.\n\nFokus:\n- kleine bis mittelgroße Produkte\n- Verkaufspreis 15 bis 50 Euro\n- geringe technische Komplexität\n- keine Elektronik\n- keine Kosmetik\n- keine Lebensmittel\n- geeignet für Private Label\n- mit Verbesserungspotenzial gegenüber bestehenden Produkten\n\nErstelle eine Tabelle mit:\nProduktidee, Kundenproblem, Zielgruppe, Suchbegriffe, mögliche Differenzierung, Risiko'},
  {id:'p_probleme',phase:'recherche',phaseLabel:'🔍 Recherche-Phase',step:2,tool:'perplexity',title:'Probleme als Ideenquelle',text:'Welche wiederkehrenden Probleme haben Heimwerker, Mieter, Badrenovierer, Fliesenleger und Hausbesitzer beim Renovieren, Montieren, Reinigen oder Reparieren?\n\nLeite daraus konkrete physische Produktideen ab, die sich für Amazon FBA Deutschland eignen.'},
  {id:'p_filter',phase:'recherche',phaseLabel:'🔍 Recherche-Phase',step:4,tool:'claude',title:'Ideen kritisch bewerten lassen',text:'Du bist mein kritischer Amazon-FBA-Produktanalyst für Deutschland.\n\nBewerte die folgenden Produktideen für Amazon FBA.\n\nKriterien:\n- Nachfragepotenzial\n- Wettbewerb\n- Marge\n- Differenzierung\n- Logistik\n- rechtliches Risiko\n- Retourenrisiko\n- Komplexität\n- Eignung für Private Label\n\nGib jeder Idee einen Score von 1 bis 10.\nMarkiere jede Idee als:\n- Ablehnen\n- weiter recherchieren\n- sehr interessant\n\nSei kritisch und erkläre kurz, warum.\n\nHier sind die Ideen:\n[Produktideen einfügen]'},

  // ═════════ Phase 2: Analyse (Schritte 6-10) ═════════
  {id:'p_keywords',phase:'analyse',phaseLabel:'📊 Analyse-Phase',step:8,tool:'gemini',title:'Cerebro-Keywords clustern',text:'Analysiere diese Helium-10-Cerebro-Keyworddaten für Amazon.de.\n\nAufgabe:\n1. Entferne irrelevante Keywords.\n2. Gruppiere die Keywords nach Kaufintention.\n3. Erstelle Cluster:\n   - Hauptkeywords\n   - Longtail-Keywords\n   - Problem-Keywords\n   - Material-Keywords\n   - Anwendungs-Keywords\n   - Zubehör-Keywords\n4. Bewerte jedes Cluster nach Nachfrage, Relevanz und Konkurrenz.\n5. Zeige mir, welche Keywords für Titel, Bullet Points, Backend-Keywords und PPC geeignet sind.\n\nDaten:\n[Keyworddaten einfügen]'},
  {id:'p_keyw_strat',phase:'analyse',phaseLabel:'📊 Analyse-Phase',step:9,tool:'claude',title:'Keyword-Strategie finalisieren',text:'Hier ist eine Liste potenzieller Amazon-Keywords für mein Produkt.\n\nBitte bewerte:\n- Welche Keywords zeigen echte Kaufabsicht?\n- Welche Keywords sind für PPC gefährlich oder zu allgemein?\n- Welche Keywords zeigen eine klare Nische?\n- Welche Keywords sollten in Titel, Bullet Points, Beschreibung und Backend?\n\nProdukt:\n[Produkt beschreiben]\n\nKeywords:\n[Keywords einfügen]'},
  {id:'p_saison',phase:'analyse',phaseLabel:'📊 Analyse-Phase',step:10,tool:'claude',title:'Saisonalitäts-Risiko bewerten',text:'Ich habe die Saisonalität für dieses Produkt geprüft.\n\nErgebnis:\n[Trendster-Beobachtungen einfügen]\n\nBewerte, ob das Produkt für Amazon FBA geeignet ist.\n\nBerücksichtige:\n- Lagerbestandsrisiko\n- Cashflow\n- PPC-Planung\n- saisonale Nachfrage\n- Risiko eines kurzfristigen Hypes'},

  // ═════════ Phase 3: Validierung (Schritte 11-15) ═════════
  {id:'p_reviews',phase:'validierung',phaseLabel:'⚖️ Validierungs-Phase',step:11,tool:'gemini',title:'Wettbewerber-Reviews analysieren',text:'Analysiere diese Amazon-Kundenrezensionen.\n\nErstelle eine strukturierte Auswertung mit:\n1. häufigste Beschwerden\n2. Qualitätsprobleme\n3. fehlende Funktionen\n4. Probleme mit Material, Größe, Montage, Kleber, Verpackung oder Anleitung\n5. positive Kaufgründe\n6. wiederkehrende Begriffe der Kunden\n7. konkrete Produktverbesserungen\n8. mögliche Bundle-Ideen\n9. Risiken, die ich vermeiden muss\n\nErstelle zusätzlich eine Tabelle:\nProblem, Häufigkeit, Schweregrad, mögliche Lösung, geschätzte Wirkung auf Bewertung\n\nRezensionen:\n[Rezensionen einfügen]'},
  {id:'p_diff',phase:'validierung',phaseLabel:'⚖️ Validierungs-Phase',step:11,tool:'claude',title:'Differenzierungs-Konzept entwickeln',text:'Basierend auf dieser Review-Analyse:\n[Analyse einfügen]\n\nEntwickle ein besseres Private-Label-Produktkonzept.\n\nBitte liefere:\n1. Produktverbesserungen\n2. Bundle-Idee\n3. Materialempfehlung\n4. Verpackungsidee\n5. deutsche Anleitungsidee\n6. Hauptversprechen für das Listing\n7. Risiken bei der Umsetzung\n8. klare Positionierung gegenüber der Konkurrenz'},
  {id:'p_listing',phase:'validierung',phaseLabel:'⚖️ Validierungs-Phase',step:12,tool:'claude',title:'Listings analysieren',text:'Analysiere diese Wettbewerber-Listings für Amazon.de.\n\nProdukt:\n[Produkt]\n\nWettbewerber:\n[Titel, Bullet Points, Bilderbeschreibung, Preis, Bewertungen einfügen]\n\nBewerte:\n1. Was machen die Wettbewerber gut?\n2. Wo sind die Listings schwach?\n3. Welche Bilder fehlen?\n4. Welche Einwände werden nicht beantwortet?\n5. Welche Keywords fehlen wahrscheinlich?\n6. Wie könnte mein Listing besser positioniert werden?\n7. Welche Hauptbotschaft sollte mein Produkt haben?'},
  {id:'p_marge',phase:'validierung',phaseLabel:'⚖️ Validierungs-Phase',step:13,tool:'claude',title:'Kalkulation kritisch prüfen',text:'Bewerte diese Amazon-FBA-Kalkulation kritisch.\n\nProdukt:\n[Produkt]\n\nZahlen:\n- Verkaufspreis:\n- Einkaufspreis:\n- Versand:\n- Zoll:\n- Verpackung:\n- FBA-Gebühr:\n- Amazon Referral Fee:\n- erwartete PPC-Kosten:\n- Retourenquote:\n- Gewinn pro Einheit:\n- Netto-Marge:\n\nAufgabe:\n1. Ist das Produkt wirtschaftlich interessant?\n2. Welche Kosten fehlen möglicherweise?\n3. Ab welchem Einkaufspreis wird das Produkt uninteressant?\n4. Welcher Verkaufspreis wäre ideal?\n5. Wie hoch darf mein PPC maximal sein?\n6. Entscheidung: ablehnen, weiter verhandeln oder Muster bestellen?'},
  {id:'p_liefer',phase:'validierung',phaseLabel:'⚖️ Validierungs-Phase',step:14,tool:'perplexity',title:'Lieferanten-Recherche',text:'Finde mögliche Lieferanten, Hersteller oder Großhändler für folgendes Produkt:\n[Produkt]\n\nMärkte:\n- China\n- Türkei\n- Polen\n- Deutschland\n- EU\n\nBitte prüfe:\n- typische Materialien\n- mögliche Qualitätsunterschiede\n- übliche MOQ\n- Zertifizierungen oder rechtliche Anforderungen\n- Risiken bei Import nach Deutschland\n- Möglichkeiten für Private Label\n- sinnvolle Fragen an Lieferanten'},
  {id:'p_supplier',phase:'validierung',phaseLabel:'⚖️ Validierungs-Phase',step:14,tool:'',title:'Standard-Anfrage an Lieferanten (Englisch)',text:'Hello,\n\nI am interested in private label production for [product].\n\nPlease answer:\n1. What is your MOQ?\n2. What is the unit price for 500, 1,000 and 2,000 units?\n3. Can you customize material, color, packaging or logo?\n4. Can you provide samples?\n5. What certifications or test reports do you have?\n6. What is the production time?\n7. What is the packing size and weight per unit?\n8. Can you improve the product based on our requirements?\n9. Do you already supply Amazon sellers in Europe?\n10. Can you provide DDP shipping to Germany?\n\nBest regards'},
  {id:'p_recht',phase:'validierung',phaseLabel:'⚖️ Validierungs-Phase',step:15,tool:'perplexity',title:'Rechtliche Anforderungen recherchieren',text:'Welche rechtlichen, sicherheitsbezogenen und regulatorischen Anforderungen können für dieses Produkt in Deutschland und der EU gelten?\n\nProdukt:\n[Produkt]\n\nBitte berücksichtige Deutschland und EU.\nFokus auf:\n- Produktsicherheit\n- Kennzeichnung\n- CE, REACH, RoHS falls relevant\n- Verpackungsgesetz\n- Haftungsrisiken\n- typische Fehler von Amazon-FBA-Sellern'},
  {id:'p_risiko',phase:'validierung',phaseLabel:'⚖️ Validierungs-Phase',step:15,tool:'claude',title:'Risikoanalyse zusammenfassen',text:'Bewerte die Risiken dieses Produkts für Amazon FBA Deutschland.\n\nProdukt:\n[Produkt]\n\nBekannte Informationen:\n[Material, Nutzung, Zielgruppe, Lieferant, Zertifikate einfügen]\n\nErstelle eine Risikoanalyse:\n1. rechtliches Risiko\n2. Sicherheitsrisiko\n3. Qualitätsrisiko\n4. Retourenrisiko\n5. Bewertungsrisiko\n6. Risiko durch falsche Kundenerwartung\n7. Empfehlung: ablehnen, prüfen lassen oder weiterverfolgen'},

  // ═════════ Phase 4: Entscheidung (Schritte 16-20) ═════════
  {id:'p_score',phase:'entscheidung',phaseLabel:'🎯 Entscheidungs-Phase',step:16,tool:'gemini',title:'Score-Matrix erstellen',text:'Erstelle eine gewichtete Entscheidungs-Matrix für diese Amazon-FBA-Produktideen.\n\nBewertungskriterien:\n- Nachfrage: 20 Prozent\n- Wettbewerb: 20 Prozent\n- Marge: 20 Prozent\n- Differenzierung: 15 Prozent\n- Logistik: 10 Prozent\n- Risiko: 10 Prozent\n- Lieferantenverfügbarkeit: 5 Prozent\n\nBewerte jedes Produkt von 1 bis 10 je Kriterium.\nBerechne einen Gesamtscore von 1 bis 100.\n\nGib zusätzlich:\n- Top 5 Produkte\n- größte Risiken\n- beste schnelle Tests\n- klare Entscheidung: ablehnen, weiter recherchieren oder Muster bestellen\n\nDaten:\n[Tabelle einfügen]'},
  {id:'p_final',phase:'entscheidung',phaseLabel:'🎯 Entscheidungs-Phase',step:17,tool:'claude',title:'Finale Investment-Entscheidung',text:'Du bist mein kritischer Amazon-FBA-Investment-Partner.\n\nHier sind meine Top-Produktkandidaten mit Daten:\n[Top-Produkte und Score-Matrix einfügen]\n\nBitte mache eine harte finale Prüfung.\n\nBewerte:\n1. Welches Produkt sieht gut aus, ist aber wahrscheinlich riskant?\n2. Welches Produkt hat das beste Verhältnis aus Nachfrage, Marge und Risiko?\n3. Welches Produkt eignet sich am besten für einen ersten Test?\n4. Welche Annahmen muss ich noch validieren?\n5. Was könnte ich übersehen haben?\n6. Welche Entscheidung würdest du treffen, wenn dein eigenes Geld auf dem Spiel steht?\n\nGib mir eine klare Rangliste und eine finale Empfehlung:\n- ablehnen\n- weiter prüfen\n- Muster bestellen'},
  {id:'p_test',phase:'entscheidung',phaseLabel:'🎯 Entscheidungs-Phase',step:18,tool:'claude',title:'Test-Checkliste für Muster',text:'Erstelle mir eine Test-Checkliste für Muster dieses Produkts:\n[Produkt]\n\nBerücksichtige:\n- Materialqualität\n- Verarbeitung\n- Funktion\n- Montage\n- Verpackung\n- Kundenerwartungen\n- mögliche negative Rezensionen\n- Vergleich mit Wettbewerbern\n- Verbesserungen vor Massenproduktion\n\nGib mir eine Tabelle mit Testpunkt, Bewertung 1 bis 5, Beobachtung und Entscheidung.'},
  {id:'p_konzept',phase:'entscheidung',phaseLabel:'🎯 Entscheidungs-Phase',step:19,tool:'claude',title:'Finales Produktkonzept',text:'Entwickle mein finales Amazon-Produktkonzept.\n\nProdukt:\n[Produkt]\n\nZielgruppe:\n[Zielgruppe]\n\nKonkurrenzprobleme:\n[Review-Probleme]\n\nMeine Verbesserungen:\n[Verbesserungen]\n\nBitte erstelle:\n1. Produktpositionierung\n2. Hauptnutzen\n3. Bundle-Struktur\n4. Material- und Qualitätsanforderungen\n5. Verpackungsanforderungen\n6. deutsche Anleitung\n7. Garantie- oder Serviceversprechen\n8. Listing-Winkel\n9. Bildkonzept\n10. Differenzierung gegenüber Top 5 Wettbewerbern'},
  {id:'p_launch',phase:'entscheidung',phaseLabel:'🎯 Entscheidungs-Phase',step:20,tool:'claude',title:'Launch-Plan erstellen',text:'Erstelle einen Amazon.de-Launch-Plan für dieses Produkt.\n\nProdukt:\n[Produkt]\n\nKeywords:\n[Keywordliste]\n\nKonkurrenz:\n[Top Wettbewerber]\n\nMarge:\n[Kalkulation]\n\nBitte erstelle:\n1. Launch-Ziel für die ersten 30 Tage\n2. PPC-Struktur\n3. Keyword-Prioritäten\n4. Preisstrategie\n5. Coupon-Strategie\n6. Bilder- und Listing-Anforderungen\n7. Bewertungsstrategie innerhalb der Amazon-Regeln\n8. Lagerbestandsempfehlung\n9. Risiken in den ersten 90 Tagen\n10. klare To-do-Liste vor Bestellung'},
  {id:'p_gonogo',phase:'entscheidung',phaseLabel:'🎯 Entscheidungs-Phase',step:20,tool:'claude',title:'FINAL: Go/No-Go-Entscheidung',text:'Das ist meine finale Produktentscheidung für Amazon FBA Deutschland.\n\nProdukt:\n[Produkt]\n\nMarktdaten:\n[Helium-10-Daten]\n\nKeywords:\n[Keyworddaten]\n\nKonkurrenz:\n[Konkurrenzanalyse]\n\nReviews:\n[Review-Analyse]\n\nMarge:\n[Kalkulation]\n\nLieferant:\n[Lieferantendaten]\n\nRisiken:\n[Risikoanalyse]\n\nBitte entscheide kritisch:\n1. Soll ich dieses Produkt bestellen?\n2. Wenn ja, mit welcher ersten Menge?\n3. Welche Bedingungen muss der Lieferant erfüllen?\n4. Welche Risiken muss ich vorher lösen?\n5. Welche Mindestmarge brauche ich?\n6. Welche 5 Gründe sprechen dafür?\n7. Welche 5 Gründe sprechen dagegen?\n8. Finale Entscheidung: Go, No-Go oder nur kleiner Test.'}
];

// ─── WORKFLOW-SCHRITTE (20 Schritte aus dem Guide) ───
var RESEARCH_WORKFLOW_STEPS=[
  {num:1,phase:'Recherche',title:'Produktfelder definieren',tool:'Claude Pro',goal:'3-5 klare Produktbereiche, in denen du suchst',promptId:'p_felder',lessonId:'rp_3'},
  {num:2,phase:'Recherche',title:'Produktideen sammeln',tool:'Perplexity Pro',goal:'50-100 Rohideen aus echten Kundenproblemen',promptId:'p_ideen',lessonId:'rp_3'},
  {num:3,phase:'Recherche',title:'Master-Tabelle anlegen',tool:'AMZ SellerHub',goal:'Zentrale Ablage – schon erledigt durch diesen Bereich',promptId:null,lessonId:'rp_3'},
  {num:4,phase:'Recherche',title:'Erste Filterung mit Claude',tool:'Claude Pro',goal:'Reduktion auf 10-20 ernsthafte Kandidaten',promptId:'p_filter',lessonId:'rp_3'},
  {num:5,phase:'Recherche',title:'Amazon-Nische mit Black Box suchen',tool:'Helium 10 Black Box',goal:'10-20 konkrete Amazon-Produkte mit Daten',promptId:null,lessonId:'rp_3'},
  {num:6,phase:'Analyse',title:'Konkurrenz mit Xray analysieren',tool:'Helium 10 Xray',goal:'Einschätzung, ob Nische angreifbar ist',promptId:null,lessonId:'rp_4'},
  {num:7,phase:'Analyse',title:'Keywords mit Cerebro analysieren',tool:'Helium 10 Cerebro',goal:'Verstehe, über welche Begriffe verkauft wird',promptId:null,lessonId:'rp_4'},
  {num:8,phase:'Analyse',title:'Keywords mit Gemini clustern',tool:'Gemini Pro',goal:'Strukturierte Keyword-Strategie',promptId:'p_keywords',lessonId:'rp_4'},
  {num:9,phase:'Analyse',title:'Neue Keywords mit Magnet finden',tool:'Helium 10 Magnet',goal:'Long-Tails, die Cerebro übersehen hat',promptId:'p_keyw_strat',lessonId:'rp_4'},
  {num:10,phase:'Analyse',title:'Saisonalität mit Trendster prüfen',tool:'Helium 10 Trendster',goal:'Ganzjährige vs. saisonale Nachfrage verstehen',promptId:'p_saison',lessonId:'rp_4'},
  {num:11,phase:'Validierung',title:'Reviews der Konkurrenz auswerten',tool:'Gemini Pro',goal:'Schwächen der Konkurrenz identifizieren',promptId:'p_reviews',lessonId:'rp_5'},
  {num:12,phase:'Validierung',title:'Listing-Qualität prüfen',tool:'Claude Pro',goal:'Marketing-Vorteile finden',promptId:'p_listing',lessonId:'rp_5'},
  {num:13,phase:'Validierung',title:'Marge prüfen',tool:'Helium 10 Profit Calc + Claude',goal:'Wirtschaftliche Machbarkeit bestätigen',promptId:'p_marge',lessonId:'rp_5'},
  {num:14,phase:'Validierung',title:'Lieferanten recherchieren',tool:'Perplexity + Alibaba',goal:'3+ mögliche Lieferanten mit Preisen',promptId:'p_liefer',lessonId:'rp_5'},
  {num:15,phase:'Validierung',title:'Rechtliche Risiken prüfen',tool:'Perplexity + Claude',goal:'Keine Abmahnungen, keine Haftungsfallen',promptId:'p_recht',lessonId:'rp_5'},
  {num:16,phase:'Entscheidung',title:'Score-Matrix erstellen',tool:'Gemini Pro (oder AMZ SellerHub)',goal:'Objektive gewichtete Endbewertung',promptId:'p_score',lessonId:'rp_6'},
  {num:17,phase:'Entscheidung',title:'Finale kritische Entscheidung',tool:'Claude Pro Max',goal:'Top-1-3-Kandidaten zur Musterbestellung',promptId:'p_final',lessonId:'rp_6'},
  {num:18,phase:'Entscheidung',title:'Muster bestellen und testen',tool:'3+ Lieferanten',goal:'Qualität live prüfen vor Massenbestellung',promptId:'p_test',lessonId:'rp_6'},
  {num:19,phase:'Entscheidung',title:'Produktkonzept finalisieren',tool:'Claude Pro Max',goal:'Briefing für Lieferant, Designer, Listing',promptId:'p_konzept',lessonId:'rp_6'},
  {num:20,phase:'Entscheidung',title:'Launch-Plan + finale Go/No-Go',tool:'Claude Pro Max',goal:'Bestellentscheidung mit allen Daten',promptId:'p_launch',lessonId:'rp_6'}
];

// ─── STATUS-KONFIG ───
// ═══════════════════════════════════════════════════════════════
// UNIFIED PIPELINE STATUS (gilt für Ideen, Recherche, Produkte)
// Die Pipeline-Stufen folgen dem realen FBA-Workflow:
//
//   IDEE → RECHERCHE → KANDIDAT → MUSTER → AKTIV / ABGELEHNT
//
// Jeder Bereich (Ideen / Recherche / Produktliste) nutzt eine
// Teilmenge dieser Status, aber die Bedeutung ist überall gleich.
// ═══════════════════════════════════════════════════════════════
var PIPELINE_STATUS={
  'idee':         {label:'Idee',          color:'tx3', bg:'s3',  icon:'💡', desc:'Frische Idee, noch nicht bewertet'},
  'recherche':    {label:'In Recherche',  color:'pu',  bg:'pud', icon:'🔍', desc:'Aktive Marktrecherche läuft'},
  'kandidat':     {label:'Kandidat',      color:'ac',  bg:'acd', icon:'⭐', desc:'Vielversprechend, weiter prüfen'},
  'muster':       {label:'Muster bestellt',color:'cy', bg:'cyd', icon:'📦', desc:'Muster bestellt oder getestet'},
  'aktiv':        {label:'Aktiv',         color:'gn',  bg:'gnd', icon:'🚀', desc:'Im Verkauf auf Amazon'},
  'abgelehnt':    {label:'Abgelehnt',     color:'rd',  bg:'rdd', icon:'❌', desc:'Aussortiert'}
};

// Reihenfolge der Pipeline-Stufen (für Kanban-Spalten und Sortierung)
var PIPELINE_ORDER=['idee','recherche','kandidat','muster','aktiv','abgelehnt'];

// Welche Status gehören zu welchem Bereich? (Sub-Navigation Defaults)
var PIPELINE_BY_AREA={
  ideen:        ['idee','abgelehnt'],
  recherche:    ['recherche','kandidat','muster','abgelehnt'],
  produkte:     ['aktiv','abgelehnt']
};

// Migrations-Mapping von alten String-Status auf neue Pipeline-Keys
var PIPELINE_LEGACY_MAP={
  // Ideen-Pool old → new
  'neu':'idee', 'Neu':'idee',
  'Zu prüfen':'recherche', 'Zu pruefen':'recherche', 'zu prüfen':'recherche',
  'Hohes Potenzial':'kandidat', 'hohes potenzial':'kandidat',
  'recherchiert':'recherche', 'Recherchiert':'recherche', 'in Recherche':'recherche',
  'Verworfen':'abgelehnt', 'verworfen':'abgelehnt',
  'rejected':'abgelehnt', 'abgelehnt':'abgelehnt', 'Abgelehnt':'abgelehnt',
  // Recherche old → new
  'Recherche':'recherche',
  'Weiter prüfen':'kandidat', 'Weiter pruefen':'kandidat',
  'Muster bestellt':'muster',
  // Produkte old → new
  'aktiv':'aktiv', 'Aktiv':'aktiv',
  'planung':'kandidat', 'Planung':'kandidat',
  'pausiert':'abgelehnt', 'Pausiert':'abgelehnt',
  'archiviert':'abgelehnt', 'Archiviert':'abgelehnt',
  // Fallback
  '':'idee', null:'idee', undefined:'idee'
};

// Normalisiert einen beliebigen Status-String auf einen Pipeline-Key
function normalizeStatus(s){
  if(!s)return 'idee';
  if(PIPELINE_STATUS[s])return s; // Already normalized
  if(PIPELINE_LEGACY_MAP[s])return PIPELINE_LEGACY_MAP[s];
  return 'idee'; // Safe default
}

// Migration: nur Items mit komplett unbekanntem/leerem Status auf 'idee' setzen.
// Bestehende sinnvolle Status (auch Legacy) bleiben unangetastet — normalizeStatus
// übernimmt das Mapping bei Anzeige in Pipeline-Komponenten zur Laufzeit.
function migratePipelineStatus(){
  if(localStorage.getItem('wika_pipeline_migrated_v2')==='1')return;
  var changed=0;
  if(D.research && D.research.candidates){
    D.research.candidates.forEach(function(c){
      // Wandle die alten 5-Status der Recherche fest auf Pipeline-Keys, weil
      // dieser Bereich neu ist und keine fremde UI gefährdet wird.
      if(c.status && !PIPELINE_STATUS[c.status]){
        c.status=normalizeStatus(c.status);
        changed++;
      }
    });
  }
  // Ideen-Pool und Produktliste: KEINE automatische Migration, weil
  // diese Bereiche ihre eigenen Status-Strings für Filter & Anzeigen verwenden.
  // normalizeStatus(...) wird bei Pipeline-Anzeige zur Laufzeit aufgerufen.
  if(changed>0)save();
  localStorage.setItem('wika_pipeline_migrated_v2','1');
  console.log('[AMZ SellerHub] Pipeline-Status v2: '+changed+' Items migriert');
}

// Status-Badge-Generator (für alle Bereiche)
function pipelineBadge(statusKey,size){
  var s=normalizeStatus(statusKey);
  var cfg=PIPELINE_STATUS[s];
  size=size||'normal'; // 'small'|'normal'|'large'
  var sizes={
    small:{pad:'2px 7px',fs:'10px'},
    normal:{pad:'3px 10px',fs:'11px'},
    large:{pad:'5px 14px',fs:'13px'}
  };
  var sz=sizes[size];
  return '<span style="display:inline-block;padding:'+sz.pad+';background:var(--'+cfg.bg+');color:var(--'+cfg.color+');border:1px solid var(--'+cfg.color+');border-radius:10px;font-size:'+sz.fs+';font-weight:600;white-space:nowrap">'+cfg.icon+' '+cfg.label+'</span>';
}

// Status-Dropdown-Optionen für ein bestimmtes Item
function pipelineStatusOptions(currentKey,allowed){
  var cur=normalizeStatus(currentKey);
  var keys=allowed||PIPELINE_ORDER;
  return keys.map(function(k){
    var cfg=PIPELINE_STATUS[k];
    return '<option value="'+k+'"'+(cur===k?' selected':'')+'>'+cfg.icon+' '+cfg.label+'</option>';
  }).join('');
}

// ─── ALT: research-spezifische Status-Config bleibt für Rückwärtskompatibilität ───
var RESEARCH_STATUS_CONFIG={
  'Neu':{color:'tx3',bg:'s3',label:'Neu'},
  'Recherche':{color:'pu',bg:'pud',label:'In Recherche'},
  'Weiter prüfen':{color:'ac',bg:'acd',label:'Weiter prüfen'},
  'Muster bestellt':{color:'gn',bg:'gnd',label:'Muster bestellt'},
  'Abgelehnt':{color:'rd',bg:'rdd',label:'Abgelehnt'}
};

// ─── SCORE-MATRIX GEWICHTUNG ───
// ═══ ENTSCHEIDUNGS-SCORECARD (ein kanonisches Bewertungssystem) ═══
var DECISION_DIMS=[
  {key:'nachfrage', label:'Nachfrage',         weight:25, desc:'Monatsumsatz Top-Seller, Suchvolumen'},
  {key:'wettbewerb',label:'Wettbewerb',        weight:25, desc:'⌀ Reviews Top-10 (niedrig = gut), Marken-Dominanz'},
  {key:'wirtschaft',label:'Wirtschaftlichkeit',weight:20, desc:'Netto-Marge nach FBA + PPC, ROI, Preisband'},
  {key:'differenz', label:'Differenzierung',   weight:15, desc:'Lösbare Schwächen der Konkurrenz (Review-Mining)'},
  {key:'risiko',    label:'Risiko / Logistik', weight:10, desc:'Gewicht/Größe, Saisonalität, Recht/IP/Gating'},
  {key:'kapital',   label:'Kapitalbedarf',     weight:5,  desc:'Startbudget (Menge × EK + PPC-Anlauf)'}
];
// Alt-Kompatibilität (falls noch irgendwo referenziert)
var RESEARCH_SCORE_CRITERIA=DECISION_DIMS;

// Effektive Netto-Marge: manuell eingetragen hat Vorrang, sonst live aus VK − EK − FBA
// (Kalkulation speist die Wirtschaftlichkeit direkt — kein Abtippen aus dem Gebühren-Center).
function decisionMarge(c){
  if(c.nettoMarge!=null)return {val:c.nettoMarge,src:'manuell'};
  if(c.vk!=null&&c.vk>0&&c.ek!=null&&c.ek>0&&c.fbaGebuehren!=null){
    return {val:Math.round((c.vk-c.ek-c.fbaGebuehren)/c.vk*1000)/10,src:'auto'};
  }
  return {val:null,src:null};
}
// Auto-Schätzung einer Dimension aus den Kandidatendaten → {val:0-10|null, reason}
function decisionAuto(c,key){
  if(key==='nachfrage'){
    if(c.top10Umsatz!=null&&c.top10Umsatz>0){var u=c.top10Umsatz;var v=u>=30000?10:u>=20000?9:u>=12000?8:u>=8000?7:u>=5000?6:u>=3000?4:2;return {val:v,reason:'Top-Umsatz '+Math.round(u).toLocaleString('de-DE')+' €/M'};}
    return {val:null,reason:'Kein Umsatz-/Nachfragewert erfasst'};
  }
  if(key==='wettbewerb'){
    if(c.avgReviews!=null){var r=c.avgReviews;var v=r<100?10:r<300?8:r<600?6:r<1000?4:r<2000?2:1;return {val:v,reason:'⌀ '+Math.round(r).toLocaleString('de-DE')+' Reviews Top-10'};}
    return {val:null,reason:'Keine ⌀-Review-Zahl erfasst'};
  }
  if(key==='wirtschaft'){
    var mm=decisionMarge(c);
    if(mm.val!=null){var m=mm.val;var v=m>=35?10:m>=30?8:m>=25?6:m>=20?4:m>=15?2:1;return {val:v,reason:'Netto-Marge '+m+' %'+(mm.src==='auto'?' (auto: VK − EK − FBA)':'')};}
    return {val:null,reason:'Keine Marge – VK, EK + FBA-Geb. eintragen (oder Marge direkt)'};
  }
  if(key==='differenz'){
    var t=(c.differenzierung||'').trim();if(t.length>40)return {val:8,reason:'Differenzierung beschrieben'};if(t.length>5)return {val:5,reason:'Ansatz vorhanden'};return {val:null,reason:'Noch offen – via Review-Mining (Schritt 3)'};
  }
  if(key==='risiko'){
    if(c.risiko){var v=c.risiko==='niedrig'?9:c.risiko==='mittel'?6:3;return {val:v,reason:'Risiko: '+c.risiko};}
    return {val:null,reason:'Risiko nicht eingestuft'};
  }
  if(key==='kapital'){
    if(c.ek!=null&&c.ek>0){
      var menge=(c.startMenge!=null&&c.startMenge>0)?c.startMenge:500;
      var inv=c.ek*menge;
      var v=inv<2000?9:inv<4000?7:inv<7000?5:inv<12000?3:1;
      return {val:v,reason:'~'+Math.round(inv).toLocaleString('de-DE')+' € Startbudget ('+menge+' Stk × EK)'};
    }
    return {val:null,reason:'Kein EK für Startbudget'};
  }
  return {val:null,reason:''};
}
// Effektiver Wert: manuelle Übersteuerung (c.score2) hat Vorrang, sonst Auto
function decisionEff(c,key){
  var ov=c.score2&&c.score2[key];
  if(typeof ov==='number'&&ov>0)return ov;
  return decisionAuto(c,key).val; // kann null sein (nicht bewertet)
}
// Einmalige Migration alter scoreMatrix-Werte (7 Krit.) ins neue Modell
function decisionMigrate(c){
  if(c.score2)return;
  c.score2={};
  var sm=c.scoreMatrix;
  if(sm&&Object.keys(sm).length){
    if(sm.nachfrage)c.score2.nachfrage=sm.nachfrage;
    if(sm.wettbewerb)c.score2.wettbewerb=sm.wettbewerb;
    if(sm.marge)c.score2.wirtschaft=sm.marge;
    if(sm.differenzierung)c.score2.differenz=sm.differenzierung;
    var lo=sm.logistik||0,ri=sm.risiko||0,n=(sm.logistik?1:0)+(sm.risiko?1:0);
    if(n)c.score2.risiko=Math.round((lo+ri)/n);
  }
}
// ═══ COMPLIANCE-CHECK (Deutschland): Pflichten je Produkt aus Kategorie + Name ═══
// Der Burggraben gegenüber US-Tools: deutsche/EU-Pflichten automatisch erkennen.
// Regeltabelle statt KI — deterministisch, erklärbar, offline. KEINE Rechtsberatung:
// die Liste ist eine Arbeits-Checkliste, der Hinweis dazu steht in der UI.
var COMPLIANCE_BASE=[
  {k:'gpsr', t:'GPSR: verantwortliche Person in der EU + Anschrift auf Produkt/Verpackung', hard:true, info:'EU-Produktsicherheitsverordnung (gilt seit 13.12.2024): EU-Verantwortlicher, technische Unterlagen, Rückverfolgbarkeit. Amazon prüft das Feld im Listing.'},
  {k:'lucid', t:'VerpackG: LUCID-Registrierung + Verpackung bei dualem System lizenzieren', hard:true, info:'VOR dem ersten Verkauf Pflicht — Amazon gleicht die LUCID-Nummer ab und sperrt sonst.'},
  {k:'kennz', t:'Herstellerkennzeichnung: Name/Anschrift (Importeur), Modell-/Chargennummer', hard:false, info:'Auf Produkt oder Verpackung, dauerhaft lesbar.'},
  {k:'reach', t:'REACH: SVHC-Freiheit vom Lieferanten schriftlich bestätigen lassen', hard:false, info:'Besonders bei Kunststoff, Beschichtungen, Farben relevant.'}
];
var COMPLIANCE_RULES=[
  {id:'elektro', label:'⚡ Elektronik / Elektrogeräte', match:/elektro|electronic|usb|akku|batter|\bled\b|lampe|leucht|ladeger|kopfhörer|lautsprecher|kamera|drohne|smart[- ]?(home|watch)|funk|bluetooth|wifi/i, catMatch:/elektro|electronic|computer|beleuchtung|foto/i, items:[
    {k:'ce_lvd', t:'CE-Kennzeichnung + EU-Konformitätserklärung (LVD/EMV)', hard:true, info:'Prüfberichte vom Lieferanten anfordern und selbst aufbewahren.'},
    {k:'weee', t:'ElektroG: WEEE-Registrierung bei stiftung ear VOR dem Verkauf', hard:true, info:'Amazon sperrt Elektro-Angebote ohne gültige WEEE-Nr. Registrierung dauert Wochen — früh starten!'},
    {k:'rohs', t:'RoHS-Konformität bestätigen lassen', hard:false},
    {k:'battg', t:'Bei Batterie/Akku: BattG-Registrierung + Kennzeichnung', hard:false, info:'Auch wenn die Batterie nur beiliegt.'},
    {k:'red', t:'Bei Funk (Bluetooth/WLAN): RED-Richtlinie in der Konformitätserklärung', hard:false}
  ]},
  {id:'spielzeug', label:'🧸 Spielzeug / Kinderprodukte', match:/spielzeug|\btoy\b|kinder|\bbaby\b|kleinkind|puppe|bauklötze|puzzle/i, catMatch:/spielzeug|toys|baby/i, items:[
    {k:'en71', t:'Spielzeugrichtlinie: EN-71-Prüfbericht + CE-Kennzeichnung', hard:true, info:'Prüfbericht MUSS auf deine Produktversion ausgestellt sein — nicht auf ein „ähnliches" Produkt des Lieferanten.'},
    {k:'warn', t:'Deutsche Warnhinweise + Altersangabe auf Produkt/Verpackung', hard:true},
    {k:'baby_norm', t:'Bei Babyartikeln: zutreffende Spezialnorm klären (z. B. EN 1400 Schnuller, EN 16890 Matratzen)', hard:false}
  ]},
  {id:'textil', label:'👕 Textilien / Fashion', match:/shirt|hose|jacke|textil|socke|mütze|schal|bekleidung|kleid|pullover|leggings|handschuh|bettwäsche|handtuch/i, catMatch:/fashion|bekleidung|textil/i, items:[
    {k:'texkenn', t:'Textilkennzeichnung: Faserzusammensetzung deutsch, fest am Produkt', hard:true, info:'„100 % Baumwolle" statt „100% cotton" — häufigster Abmahngrund bei Textilien.'},
    {k:'oeko', t:'Schadstoffprüfung (AZO-Farbstoffe / OEKO-TEX) beim Lieferanten anfragen', hard:false}
  ]},
  {id:'lfgb', label:'🍽️ Lebensmittelkontakt (Küche/Trinkflaschen …)', match:/küche|kitchen|besteck|teller|tasse|becher|flasche|lunchbox|brotdose|trinkflasche|schneidebrett|topf|pfanne|vorratsdose|strohhalm|kaffee|teekanne/i, catMatch:/küche|kitchen/i, items:[
    {k:'lfgb', t:'LFGB-Prüfbericht für Lebensmittelkontakt (Glas-Gabel-Symbol)', hard:true, info:'Der Standard-China-Bericht ist oft nur FDA (USA) — für DE ausdrücklich LFGB verlangen.'},
    {k:'lfgb_decl', t:'Konformitätserklärung EU 1935/2004 vom Lieferanten', hard:false}
  ]},
  {id:'kosmetik', label:'🧴 Kosmetik / Körperpflege', match:/kosmetik|creme|serum|shampoo|seife|lotion|\bbeauty\b|make-?up|nagel|wimpern/i, catMatch:/kosmetik|beauty|drogerie/i, items:[
    {k:'cpnp', t:'CPNP-Notifizierung + verantwortliche Person (EU-Kosmetikverordnung)', hard:true, info:'Ohne CPNP-Meldung ist der Verkauf illegal — Aufwand und Kosten VOR der Produktentscheidung klären!'},
    {k:'inci', t:'INCI-Liste + Sicherheitsbewertung (CPSR) vorhanden', hard:true}
  ]}
];
/** Pflichten-Profil eines Kandidaten/Produkts: Basis + erkannte Kategorie-Gruppen. */
function complianceFor(c){
  var text=((c.name||'')+' '+(c.kategorie||'')+' '+(c.hauptkeyword||''));
  var cat=(c.kategorie||'');
  var groups=[{id:'basis',label:'📋 Grundpflichten (jedes Produkt)',items:COMPLIANCE_BASE}];
  COMPLIANCE_RULES.forEach(function(r){
    if(r.match.test(text)||r.catMatch.test(cat))groups.push(r);
  });
  var total=0,hard=0,done=0,hardOpen=0,st=(c.compliance||{});
  groups.forEach(function(g){g.items.forEach(function(i){
    total++;if(st[i.k])done++;
    if(i.hard){hard++;if(!st[i.k])hardOpen++;}
  });});
  return {groups:groups,total:total,done:done,hard:hard,hardOpen:hardOpen,special:groups.length>1};
}
function complianceToggle(candId,key,on){
  researchInit();
  var c=D.research.candidates.find(function(x){return x.id===candId;});if(!c)return;
  c.compliance=c.compliance||{};
  if(on)c.compliance[key]=true;else delete c.compliance[key];
  c.updatedAt=new Date().toISOString();save();
  var cnt=document.getElementById('compCount_'+candId);
  if(cnt){var cf=complianceFor(c);cnt.textContent=cf.done+' / '+cf.total+' erledigt';}
}
window.complianceToggle=complianceToggle;
/** Checklisten-HTML für den Kandidaten-Editor / das Dossier (readOnly = ohne Checkboxen). */
function complianceHtml(c,readOnly){
  var cf=complianceFor(c);
  var st=c.compliance||{};
  var h='';
  cf.groups.forEach(function(g){
    h+='<div style="font-size:11px;font-weight:800;color:var(--tx2);margin:10px 0 4px">'+g.label+'</div>';
    g.items.forEach(function(i){
      var ok=!!st[i.k];
      h+='<label style="display:flex;gap:8px;align-items:flex-start;padding:5px 0;font-size:12px;color:var(--tx);cursor:'+(readOnly?'default':'pointer')+'"'+(i.info?' title="'+esc(i.info)+'"':'')+'>'+
        (readOnly
          ?'<span style="flex-shrink:0">'+(ok?'✅':'⬜️')+'</span>'
          :'<input type="checkbox" '+(ok?'checked':'')+' onchange="complianceToggle(\''+c.id+'\',\''+i.k+'\',this.checked)" style="width:15px;height:15px;accent-color:var(--gn);flex-shrink:0;cursor:pointer;margin-top:1px">')+
        '<span style="'+(ok?'color:var(--tx3);text-decoration:line-through':'')+'">'+(i.hard?'<b style="color:var(--rd)">●</b> ':'')+esc(i.t)+(i.info&&!readOnly?' <span style="color:var(--tx3)">ⓘ</span>':'')+'</span>'+
      '</label>';
    });
  });
  h+='<div style="font-size:10px;color:var(--tx3);margin-top:8px">● = kritisch (Verkaufs-/Sperr-Risiko) · Automatisch erkannt aus Kategorie + Produktname · Checkliste, keine Rechtsberatung.</div>';
  return h;
}

// ═══ SOURCING-BRÜCKE: professionelle Lieferanten-Anfrage (EN) aus dem Kandidaten ═══
// Deterministisches Template (keine KI nötig): Specs aus USPs/Differenzierung,
// Menge aus startMenge, Zertifikate aus dem Compliance-Profil. 1 Klick → kopieren → Alibaba.
var SOURCING_CERTS={ce_lvd:'CE (LVD/EMC) declaration of conformity + test reports',rohs:'RoHS test report',battg:'Battery safety documentation (UN38.3 if lithium)',red:'RED declaration (Bluetooth/WiFi radio)',en71:'EN 71 (part 1–3) test report issued for THIS product',lfgb:'LFGB food-contact test report (German standard — FDA is NOT sufficient)',lfgb_decl:'EU 1935/2004 declaration of conformity',oeko:'OEKO-TEX certificate or AZO-free dye test report',cpnp:'Full ingredient documentation for EU CPNP notification',inci:'INCI list + safety assessment (CPSR) documentation',reach:'REACH SVHC compliance statement',gpsr:'Technical documentation for EU GPSR compliance'};
function sourcingInquiryText(c){
  var u=(window.WikaAuth&&WikaAuth.currentUser&&WikaAuth.currentUser())||null;
  var qty=(c.startMenge&&c.startMenge>0)?c.startMenge:500;
  var specs=[];
  ((c.beat&&c.beat.usps)||c.compUsps||[]).slice(0,5).forEach(function(s){specs.push('- '+s);});
  ((c.reviewMining&&c.reviewMining.diffIdeas)||[]).slice(0,4).forEach(function(s){specs.push('- IMPROVEMENT (vs. competitors): '+s);});
  if(c.differenzierung&&!specs.length)specs.push('- '+c.differenzierung);
  var certs=[];var cf=complianceFor(c);var seen={};
  cf.groups.forEach(function(g){g.items.forEach(function(i){var t=SOURCING_CERTS[i.k];if(t&&!seen[t]){seen[t]=1;certs.push('- '+t);}});});
  var lines=[];
  lines.push('Subject: Product inquiry — '+(c.name||'product')+' ('+qty+' units, Germany)');
  lines.push('');
  lines.push('Hello,');
  lines.push('');
  lines.push('we are an Amazon seller from Germany and are looking for a reliable manufacturer for the following product:');
  lines.push('');
  lines.push('PRODUCT');
  lines.push('- Product: '+(c.name||'—'));
  if(c.compAsin)lines.push('- Reference (similar specification): https://www.amazon.de/dp/'+c.compAsin);
  if(c.kategorie)lines.push('- Category: '+c.kategorie);
  if(c.gewicht)lines.push('- Approx. weight: '+c.gewicht+' kg');
  if(specs.length){lines.push('');lines.push('REQUIRED SPECIFICATIONS');specs.forEach(function(s){lines.push(s);});}
  lines.push('');
  lines.push('ORDER DETAILS');
  lines.push('- First order: '+qty+' units (trial order — monthly reorders if quality convinces)');
  lines.push(c.ek!=null&&c.ek>0?'- Target unit price: around EUR '+c.ek.toFixed(2)+' — please quote your best EXW and FOB price':'- Please quote your best EXW and FOB price');
  lines.push('- Destination: Germany (please also quote DDP if available)');
  if(certs.length){
    lines.push('');
    lines.push('CERTIFICATES / COMPLIANCE (mandatory for the German market)');
    certs.forEach(function(s){lines.push(s);});
    lines.push('Please confirm exactly which of these documents you can provide FOR THIS PRODUCT.');
  }
  lines.push('');
  lines.push('QUESTIONS');
  lines.push('1. MOQ and price tiers for '+qty+' / '+(qty*2)+' / '+(qty*6)+' units?');
  lines.push('2. Production lead time after order confirmation?');
  lines.push('3. Sample: cost incl. express shipping to Germany (DHL/FedEx) and production time?');
  lines.push('4. Custom logo/branding on product and packaging — from which quantity, at what cost?');
  lines.push('5. Payment terms (e.g. 30/70 T/T)? Trade Assurance accepted?');
  lines.push('');
  lines.push('Please include unit weight, carton dimensions and units per carton in your quotation.');
  lines.push('');
  lines.push('Best regards');
  lines.push(u?u.username:'');
  return lines.join('\n');
}
function sourcingOpen(candId){
  researchInit();
  var c=D.research.candidates.find(function(x){return x.id===candId;})
      ||(D.research.shortlist||[]).find(function(x){return x.id===candId;});
  if(!c){toast('Eintrag nicht gefunden');return;}
  var old=document.getElementById('sourcingModal');if(old)old.remove();
  var ov=document.createElement('div');
  ov.id='sourcingModal';
  ov.style.cssText='position:fixed;inset:0;background:rgba(15,23,41,.55);display:flex;align-items:center;justify-content:center;z-index:99999;padding:24px;backdrop-filter:blur(2px)';
  ov.onclick=function(e){if(e.target===ov)ov.remove();};
  ov.innerHTML='<div style="background:var(--s1);border:1px solid var(--bd);border-radius:16px;width:min(680px,100%);max-height:86vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.35)">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid var(--bd)">'+
      '<div><div style="font-weight:800;font-size:16px;color:var(--tx)">🏭 Lieferanten-Anfrage (Alibaba &amp; Co.)</div>'+
      '<div style="font-size:11.5px;color:var(--tx2);margin-top:2px">Fertige englische Anfrage aus deinen Kandidaten-Daten — Zertifikate aus dem Compliance-Check inklusive. Vor dem Senden anpassen!</div></div>'+
      '<button onclick="document.getElementById(\'sourcingModal\').remove()" style="background:none;border:none;font-size:22px;color:var(--tx2);cursor:pointer">✕</button></div>'+
    '<textarea id="sourcingText" style="flex:1;min-height:380px;margin:14px 20px;background:var(--s2);border:1px solid var(--bd);border-radius:10px;padding:12px 14px;font-family:\'SF Mono\',Menlo,monospace;font-size:12px;color:var(--tx);resize:vertical;line-height:1.55"></textarea>'+
    '<div style="display:flex;gap:8px;justify-content:flex-end;padding:0 20px 16px">'+
      '<button class="btn" onclick="document.getElementById(\'sourcingModal\').remove()">Schließen</button>'+
      '<button class="btn btn-p" onclick="var t=document.getElementById(\'sourcingText\');t.select();navigator.clipboard.writeText(t.value).then(function(){toast(\'📋 Anfrage kopiert — auf Alibaba einfügen\')});">📋 Kopieren</button>'+
    '</div></div>';
  document.body.appendChild(ov);
  document.getElementById('sourcingText').value=sourcingInquiryText(c);
}
window.sourcingOpen=sourcingOpen;

// Rote/gelbe Flags
function decisionRedFlags(c){
  var f=[];
  if(c.vk!=null&&c.vk>0&&c.vk<15)f.push({hard:true,t:'Preis < 15 € → Margenfalle',s:'Preis <15 €'});
  if(c.avgReviews!=null&&c.avgReviews>2000)f.push({hard:true,t:'⌀ Reviews Top-10 > 2.000 → hohe Einstiegsbarriere',s:'>2.000 Rev.'});
  var _fm=decisionMarge(c);
  if(_fm.val!=null&&_fm.val<15)f.push({hard:true,t:'Netto-Marge < 15 % → unwirtschaftlich'+(_fm.src==='auto'?' (auto berechnet)':''),s:'Marge <15 %'});
  // Monopol-Risiko: eine Marke dominiert die Top-Plätze (Daten aus Xray-Paste/Nischen-Scan)
  var _ns=c.nischenScan;
  if(_ns&&_ns.domBrand&&_ns.count>0&&_ns.domCount>0){
    var _share=Math.round(_ns.domCount/_ns.count*100);
    var _brand=String(_ns.domBrand).replace(/[<>"'&]/g,'').substring(0,40);
    if(_share>60)f.push({hard:true,t:'Marke „'+_brand+'" hält '+_share+' % der Top-Plätze → Monopol-Risiko',s:'Monopol '+_share+' %'});
    else if(_share>=40)f.push({hard:false,t:'Marken-Dominanz: „'+_brand+'" hält '+_share+' % der Top-Plätze',s:'Marke '+_share+' %'});
  }
  if(c.ipRisiko==='ja')f.push({hard:true,t:'Marken-/Patent-/IP-Risiko → Abmahn-/Sperrgefahr',s:'IP-Risiko'});
  if(c.risiko==='hoch')f.push({hard:true,t:'Hohes Risiko (Recht/Haftung/Retouren)',s:'Hohes Risiko'});
  if(c.gewicht!=null&&c.gewicht>5)f.push({hard:true,t:'Gewicht > 5 kg → Sperrgut/hohe FBA-Kosten, Marge in Gefahr',s:'>5 kg'});
  else if(c.gewicht!=null&&c.gewicht>2)f.push({hard:false,t:'Gewicht > 2 kg → höhere FBA-/Versandkosten',s:'>2 kg'});
  if(c.gating==='ja')f.push({hard:false,t:'Amazon-Gating → Kategorie-Freischaltung nötig (Zeit/Nachweise)',s:'Gating'});
  if(c.saisonal==='ja')f.push({hard:false,t:'Saisonal → schwankender Umsatz, Kapital zeitweise gebunden',s:'Saisonal'});
  if(c.ppcRisiko==='hoch')f.push({hard:false,t:'Hohes PPC-Risiko',s:'PPC hoch'});
  // Compliance: Spezial-Kategorie (Elektro/Spielzeug/Textil/LFGB/Kosmetik) mit
  // ungeprüften kritischen DE-Pflichten → weiches Signal Richtung Checkliste
  var _cf=complianceFor(c);
  if(_cf.special&&_cf.hardOpen>0)f.push({hard:false,t:_cf.hardOpen+' kritische DE-Pflicht(en) ungeprüft — Compliance-Check im ✏️-Editor',s:'🧾 '+_cf.hardOpen+' Pflichten'});
  return f;
}
// Gesamturteil
function decisionVerdict(c){
  var score=researchCalcScore(c);
  var flags=decisionRedFlags(c);
  var hard=flags.filter(function(x){return x.hard;}).length;
  var weakest=null,rated=0;
  DECISION_DIMS.forEach(function(d){var v=decisionEff(c,d.key);if(typeof v==='number'){rated++;if(!weakest||v<weakest.val)weakest={label:d.label,val:v};}});
  var verdict,label,color;
  if(score===0){verdict='offen';label='UNBEWERTET';color='tx3';}
  else if(score>=70&&hard===0){verdict='go';label='GO';color='gn';}
  else if(score<50||(hard>0&&score<60)){verdict='nogo';label='NO-GO';color='rd';}
  else{verdict='pruefen';label='PRÜFEN';color='ac';}
  return {score:score,verdict:verdict,label:label,color:color,flags:flags,hard:hard,weakest:weakest,rated:rated,total:DECISION_DIMS.length};
}
// Daten-Konfidenz: worauf beruht das Urteil? Pro Dimension: echte Daten (Auto) / manuell geschätzt / offen
function decisionConfidence(c){
  var data=0,manual=0,dims=[];
  DECISION_DIMS.forEach(function(d){
    var ov=c.score2&&c.score2[d.key];
    var isManual=typeof ov==='number'&&ov>0;
    var src=isManual?'manual':(decisionAuto(c,d.key).val!=null?'data':'none');
    if(src==='data')data++;else if(src==='manual')manual++;
    dims.push({label:d.label,src:src});
  });
  var total=DECISION_DIMS.length;
  return {data:data,manual:manual,open:total-data-manual,total:total,
    level:data>=4?'hoch':data>=2?'mittel':'niedrig',
    color:data>=4?'gn':data>=2?'ac':'rd',dims:dims};
}

// ═══════════════════════════════════════════════════════════════
// CORE FUNCTIONS
// ═══════════════════════════════════════════════════════════════

function researchInit(){
  if(!D.research)D.research={candidates:[],workflowState:{}};
  if(!D.research.candidates)D.research.candidates=[];
  if(!D.research.workflowState)D.research.workflowState={};
  if(!D.research.shortlist)D.research.shortlist=[];
}

// ─────────────── PRODUKTE (engere Auswahl & Entscheidung) ───────────────
var AUSWAHL_DECISION={
  pruefen:{label:'🔍 In Prüfung', color:'pu', bg:'pud'},
  muster: {label:'📦 Muster bestellt', color:'gn', bg:'gnd'},
  abgelehnt:{label:'❌ Abgelehnt', color:'rd', bg:'rdd'}
};
function auswahlUpdateBadge(){
  researchInit();
  var b=document.getElementById('auswahlBadge');if(!b)return;
  var n=D.research.shortlist.filter(function(x){return x.decision!=='abgelehnt';}).length;
  if(n>0){b.style.display='inline-block';b.textContent=n;}else{b.style.display='none';}
}
function researchPromoteToProduct(candId,opts){
  var stay=opts&&opts.stay;
  researchInit();
  var c=D.research.candidates.find(function(x){return x.id===candId;});
  if(!c){toast('Kandidat nicht gefunden');return;}
  var exists=D.research.shortlist.find(function(s){return s.sourceCandidateId===candId;});
  if(exists){toast('„'+esc(c.name||'')+'" ist schon in der Engeren Wahl');auswahlUpdateBadge();if(!stay)go('auswahl');return;}
  var item={
    id:'prod_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),
    sourceCandidateId:candId,
    name:c.name||'Produkt',
    kategorie:c.kategorie||'',
    vk:(c.vk!=null?c.vk:null),
    avgReviews:(c.avgReviews!=null?c.avgReviews:null),
    ek:(c.ek!=null?c.ek:null),
    fbaGebuehren:(c.fbaGebuehren!=null?c.fbaGebuehren:null),
    gewicht:(c.gewicht!=null?c.gewicht:null),
    bsr:(c.bsr!=null?c.bsr:null),
    wettbewerber:(c.wettbewerber!=null?c.wettbewerber:null),
    score:researchCalcScore(c),
    compAsin:c.compAsin||'',
    compImages:(c.compImages||[]).slice(0,9),
    compUsps:((c.beat&&c.beat.usps&&c.beat.usps.length)?c.beat.usps:(c.compUsps||[])).slice(0,6),
    hasBeat:!!c.beat,
    decision:'pruefen',
    notes:'',
    createdAt:new Date().toISOString(),
    updatedAt:new Date().toISOString()
  };
  D.research.shortlist.unshift(item);
  if(normalizeStatus(c.status)==='recherche'){c.status='kandidat';c.updatedAt=new Date().toISOString();}
  save();researchRenderTable();researchUpdateBadge();auswahlUpdateBadge();
  toast('★ „'+esc(c.name||'')+'" zu Engerer Wahl übernommen');
  if(!stay)go('auswahl');
}
function auswahlSetDecision(id,dec){
  researchInit();
  var it=D.research.shortlist.find(function(x){return x.id===id;});if(!it)return;
  it.decision=dec;it.updatedAt=new Date().toISOString();
  save();renderAuswahl();auswahlUpdateBadge();
}
function auswahlSaveNote(id,val){
  researchInit();
  var it=D.research.shortlist.find(function(x){return x.id===id;});if(!it)return;
  it.notes=val;it.updatedAt=new Date().toISOString();save();
}
function auswahlDelete(id){
  researchInit();
  var it=D.research.shortlist.find(function(x){return x.id===id;});if(!it)return;
  if(!confirm('„'+(it.name||'')+'" aus der Engeren Wahl entfernen?'))return;
  D.research.shortlist=D.research.shortlist.filter(function(x){return x.id!==id;});
  save();renderAuswahl();auswahlUpdateBadge();toast('Entfernt');
}
function auswahlOrderSample(id){
  researchInit();
  var it=D.research.shortlist.find(function(x){return x.id===id;});if(!it)return;
  if(it.movedToProducts){toast('Schon in der Produktliste');go('produkte');return;}
  var p={
    name:it.name||'Produkt', kategorie:it.kategorie||'', status:'Bestellt',
    asin:it.compAsin||'', einkaufspreis:(it.ek!=null?it.ek:0), verkaufspreis:(it.vk!=null?it.vk:0),
    fbaGebuehren:(it.fbaGebuehren!=null?it.fbaGebuehren:0), versand:0, zoll:0, sonstigeKosten:0, gewicht:(it.gewicht!=null?Math.round(it.gewicht*1000):0), masse:'',
    bsr:(it.bsr!=null?it.bsr:0), bewertungenZahl:(it.avgReviews!=null?it.avgReviews:0), wettbewerber:(it.wettbewerber!=null?it.wettbewerber:0), bewertung:0,
    bild:(it.compImages&&it.compImages[0])||'',
    quelle:'Produktfindung', suchvolumen:0,
    notizen:(it.notes?it.notes+' · ':'')+'Aus Produktfindung übernommen (Muster bestellt)'+(it.compAsin?' · Konkurrenz-ASIN '+it.compAsin:''),
    datum:new Date().toLocaleDateString('de-DE')
  };
  D.products.push(p);
  it.decision='muster';it.movedToProducts=true;it.updatedAt=new Date().toISOString();
  save();
  if(typeof renderProds==='function')renderProds();
  renderAuswahl();auswahlUpdateBadge();
  toast('📦 „'+esc(it.name||'')+'" → Muster bestellt & in Produktliste übernommen');
}
function auswahlAddToProduktliste(id){
  researchInit();
  var it=D.research.shortlist.find(function(x){return x.id===id;});if(!it)return;
  if(it.movedToProducts){toast('Schon in der Produktliste');go('produkte');return;}
  var p={
    name:it.name||'Produkt', kategorie:it.kategorie||'', status:'Recherche',
    asin:it.compAsin||'', einkaufspreis:(it.ek!=null?it.ek:0), verkaufspreis:(it.vk!=null?it.vk:0),
    fbaGebuehren:(it.fbaGebuehren!=null?it.fbaGebuehren:0), versand:0, zoll:0, sonstigeKosten:0, gewicht:(it.gewicht!=null?Math.round(it.gewicht*1000):0), masse:'',
    bsr:(it.bsr!=null?it.bsr:0), bewertungenZahl:(it.avgReviews!=null?it.avgReviews:0), wettbewerber:(it.wettbewerber!=null?it.wettbewerber:0), bewertung:0,
    bild:(it.compImages&&it.compImages[0])||'',
    quelle:'Produktfindung', suchvolumen:0,
    notizen:(it.notes?it.notes+' · ':'')+'Aus Engerer Wahl übernommen'+(it.compAsin?' · Konkurrenz-ASIN '+it.compAsin:''),
    datum:new Date().toLocaleDateString('de-DE')
  };
  D.products.push(p);
  it.movedToProducts=true;it.updatedAt=new Date().toISOString();
  save();
  if(typeof renderProds==='function')renderProds();
  renderAuswahl();auswahlUpdateBadge();
  toast('➕ „'+esc(it.name||'')+'" zur Produktliste hinzugefügt');
}
// ── Mehrfachauswahl Engere Wahl: markieren (auch „alle") + Sammel-Entfernen ──
var auswahlSel={};
function auswahlToggleSel(id,on){if(on)auswahlSel[id]=1;else delete auswahlSel[id];renderAuswahl();}
function auswahlSelAll(on){
  auswahlSel={};
  if(on)(D.research.shortlist||[]).forEach(function(x){auswahlSel[x.id]=1;});
  renderAuswahl();
}
function auswahlDeleteSelected(){
  var ids=Object.keys(auswahlSel);if(!ids.length)return;
  if(!confirm(ids.length+' markierte Produkte aus der Engeren Wahl entfernen?\n\nDie zugehörigen Kandidaten in der Konkurrenz-Tabelle bleiben erhalten.'))return;
  var sel=auswahlSel;
  D.research.shortlist=D.research.shortlist.filter(function(x){return !sel[x.id];});
  auswahlSel={};
  save();renderAuswahl();auswahlUpdateBadge();
  if(document.getElementById('pipelineBoard')&&typeof renderPipeline==='function')renderPipeline();
  toast('🗑 '+ids.length+' Produkte entfernt');
}
window.auswahlToggleSel=auswahlToggleSel;window.auswahlSelAll=auswahlSelAll;window.auswahlDeleteSelected=auswahlDeleteSelected;

function auswahlStatCard(label,val,color){
  return '<div style="background:var(--s1);border:1px solid var(--bd);border-radius:10px;padding:10px 16px;min-width:120px"><div style="font-size:11px;color:var(--tx2)">'+label+'</div><div style="font-size:22px;font-weight:800;color:var(--'+color+')">'+val+'</div></div>';
}
function renderAuswahl(){
  researchInit();
  auswahlUpdateBadge();
  var list=D.research.shortlist;
  var stats=document.getElementById('auswahlStats');
  if(stats){
    var cnt={total:list.length,pruefen:0,muster:0,abgelehnt:0};
    list.forEach(function(x){if(cnt.hasOwnProperty(x.decision))cnt[x.decision]++;});
    stats.innerHTML=auswahlStatCard('Gesamt',cnt.total,'tx')+auswahlStatCard('🔍 In Prüfung',cnt.pruefen,'pu')+auswahlStatCard('📦 Muster bestellt',cnt.muster,'gn')+auswahlStatCard('❌ Abgelehnt',cnt.abgelehnt,'rd');
  }
  var box=document.getElementById('auswahlList');if(!box)return;
  if(!list.length){
    box.innerHTML='<div style="padding:50px 30px;text-align:center;color:var(--tx2);background:var(--s1);border:1px solid var(--bd);border-radius:12px"><div style="font-size:48px;margin-bottom:14px">⭐</div><div style="font-weight:700;color:var(--tx);font-size:16px;margin-bottom:6px">Noch keine Produkte in der engeren Wahl</div><div style="font-size:13px;margin-bottom:18px">Geh in die <b>⚔️ Konkurrenz-Tabelle</b> und übernimm vielversprechende Produkte mit „★ Produkt".</div><button class="btn btn-p" onclick="go(\'research\')">⚔️ Zur Konkurrenz-Tabelle</button></div>';
    return;
  }
  // Auswahl-Leiste über den Karten
  var aSelCount=Object.keys(auswahlSel).filter(function(id){return list.some(function(x){return x.id===id;});}).length;
  var html='<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px;'+(aSelCount?'background:var(--acd);border:1.5px solid var(--ac);border-radius:10px;padding:9px 14px':'padding:2px')+'">'+
    '<label style="display:inline-flex;align-items:center;gap:7px;font-size:12.5px;color:var(--tx2);cursor:pointer;font-weight:600"><input type="checkbox" onchange="auswahlSelAll(this.checked)" '+(aSelCount>0&&aSelCount===list.length?'checked':'')+' style="width:15px;height:15px;accent-color:var(--ac);cursor:pointer">Alle markieren</label>'+
    (aSelCount?'<b style="font-size:13px;color:var(--ac)">'+aSelCount+' markiert</b>'+
      '<button class="btn btn-sm" onclick="auswahlDeleteSelected()" style="background:var(--rd);color:#fff;border:none;font-weight:700;font-size:12px">🗑 Markierte entfernen</button>'+
      '<button class="btn btn-sm" onclick="auswahlSelAll(false)" style="font-size:12px">Auswahl aufheben</button>':'')+
  '</div>';
  html+='<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:16px">';
  list.forEach(function(it){
    var d=AUSWAHL_DECISION[it.decision]||AUSWAHL_DECISION.pruefen;
    var sc=it.score||0; var scc=sc>=70?'gn':sc>=50?'ac':sc>0?'rd':'tx3';
    var imgs=(it.compImages||[]).slice(0,5).map(function(u){return '<img src="'+esc(u)+'" class="pzoom" style="width:46px;height:46px;object-fit:cover;border-radius:6px;border:1px solid var(--bd)" loading="lazy">';}).join('');
    var usps=(it.compUsps||[]).slice(0,4).map(function(u){return '<li>'+esc(u)+'</li>';}).join('');
    html+='<div style="background:var(--s1);border:1.5px solid '+(auswahlSel[it.id]?'var(--ac)':(it.decision==='abgelehnt'?'var(--bd)':'var(--'+d.color+')'))+';border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:10px'+(it.decision==='abgelehnt'?';opacity:.6':'')+'">';
    html+='<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px"><div style="display:flex;gap:8px;align-items:flex-start;flex:1;min-width:0"><input type="checkbox" onchange="auswahlToggleSel(\''+it.id+'\',this.checked)" '+(auswahlSel[it.id]?'checked':'')+' style="width:15px;height:15px;accent-color:var(--ac);cursor:pointer;flex-shrink:0;margin-top:2px" title="Markieren"><div style="font-weight:700;color:var(--tx);font-size:14px;line-height:1.3">'+esc(it.name||'')+'</div></div><span style="flex-shrink:0;display:inline-block;padding:3px 9px;background:var(--'+scc+'d);color:var(--'+scc+');border-radius:10px;font-weight:700;font-size:12px">'+(sc>0?sc:'—')+'</span></div>';
    html+='<div style="display:flex;gap:8px;flex-wrap:wrap;font-size:11.5px;color:var(--tx2)">'+(it.kategorie?'<span>🏷️ '+esc(it.kategorie)+'</span>':'')+(it.vk!=null?'<span>💶 '+esc(String(it.vk))+' €</span>':'')+(it.avgReviews!=null?'<span>⭐ '+esc(String(it.avgReviews))+' Rev.</span>':'')+(it.hasBeat?'<span style="color:var(--gn);font-weight:700">✨ KI-optimiert</span>':'')+'</div>';
    if(imgs)html+='<div style="display:flex;gap:5px;flex-wrap:wrap">'+imgs+'</div>';
    if(usps)html+='<ul style="margin:0;padding-left:18px;font-size:12px;color:var(--tx2)">'+usps+'</ul>';
    html+='<span style="align-self:flex-start;display:inline-block;padding:3px 10px;background:var(--'+d.bg+');color:var(--'+d.color+');border-radius:8px;font-size:11px;font-weight:700">'+d.label+'</span>';
    html+='<textarea placeholder="Notizen / Entscheidung …" onchange="auswahlSaveNote(\''+it.id+'\',this.value)" style="width:100%;box-sizing:border-box;min-height:50px;background:var(--s2);border:1px solid var(--bd);border-radius:8px;padding:7px 9px;font-family:inherit;font-size:12px;color:var(--tx);resize:vertical">'+esc(it.notes||'')+'</textarea>';
    html+='<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:2px">';
    if(!it.movedToProducts)html+='<button class="btn btn-sm" onclick="auswahlAddToProduktliste(\''+it.id+'\')" style="background:var(--gn);color:#fff;border:none;font-weight:700">➕ Zur Produktliste</button>';
    else html+='<span style="font-size:11px;color:var(--gn);font-weight:700;align-self:center">✓ in Produktliste · <a onclick="go(\'produkte\')" style="color:var(--ac);cursor:pointer">öffnen</a></span>';
    html+='<button class="btn btn-sm" onclick="auswahlSetDecision(\''+it.id+'\',\'pruefen\')" title="weiter prüfen" style="background:var(--pud);color:var(--pu);border:1px solid var(--pu)">🔍</button>';
    html+='<button class="btn btn-sm" onclick="auswahlOrderSample(\''+it.id+'\')" title="Muster bestellt (übernimmt auch in Produktliste)" style="background:var(--gnd);color:var(--gn);border:1px solid var(--gn)">📦</button>';
    html+='<button class="btn btn-sm" onclick="auswahlSetDecision(\''+it.id+'\',\'abgelehnt\')" title="ablehnen" style="background:var(--rdd);color:var(--rd);border:1px solid var(--rd)">❌</button>';
    html+='<button class="btn btn-sm" onclick="sourcingOpen(\''+it.id+'\')" title="Lieferanten-Anfrage generieren (EN, inkl. Zertifikate)" style="background:var(--s2);color:var(--tx2);border:1px solid var(--bd)">🏭</button>';
    html+='<button class="btn btn-sm" onclick="go(\'inhalt\')" title="Im KI-Bildstudio Bilder erstellen" style="background:var(--acd);color:var(--ac);border:1px solid var(--ac)">🎨</button>';
    html+='<button class="btn btn-sm" onclick="auswahlDelete(\''+it.id+'\')" title="entfernen" style="background:var(--s2);color:var(--tx2);border:1px solid var(--bd)">🗑</button>';
    html+='</div></div>';
  });
  html+='</div>';
  box.innerHTML=html;
}

// Sub-Navigation für Produktfindung-Bereiche
// Wird unter dem page-header eines Sub-Bereichs eingeblendet
function renderFindungSubNav(activeKey){
  var tabs=[
    {key:'ideen',   icon:'💡', label:'Ideen-Pool'},
    {key:'research',icon:'⚔️', label:'Konkurrenz-Tabelle'},
    {key:'auswahl', icon:'⭐', label:'Produkte'},
    {key:'helium',  icon:'📥', label:'Helium 10 Import'}
  ];
  var html='<div class="findung-subnav" style="background:linear-gradient(180deg,var(--pud),transparent);border-bottom:1.5px solid var(--bd);padding:8px 18px 0 18px;margin-bottom:14px;display:flex;gap:4px;flex-wrap:wrap;align-items:center">';
  html+='<span style="font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:var(--pu);font-weight:700;margin-right:8px">🎯 Produktfindung</span>';
  tabs.forEach(function(t){
    var active=t.key===activeKey;
    html+='<button onclick="go(\''+t.key+'\')" style="padding:8px 14px;background:'+(active?'var(--s1)':'transparent')+';border:1.5px solid '+(active?'var(--pu)':'transparent')+';border-bottom:'+(active?'1.5px solid var(--s1)':'2px solid transparent')+';border-radius:8px 8px 0 0;color:'+(active?'var(--pu)':'var(--tx2)')+';font-family:inherit;font-size:12px;font-weight:'+(active?'700':'600')+';cursor:pointer;white-space:nowrap;margin-bottom:-1.5px">'+t.icon+' '+t.label+'</button>';
  });
  html+='</div>';
  return html;
}

// Injiziert die Sub-Nav in einen page-body am oberen Rand
function injectFindungSubNav(pageId,activeKey){
  var page=document.getElementById(pageId);
  if(!page)return;
  var existing=page.querySelector('.findung-subnav');
  if(existing)existing.remove();
  var pageBody=page.querySelector('.page-body');
  if(!pageBody)return;
  pageBody.insertAdjacentHTML('afterbegin',renderFindungSubNav(activeKey));
}

// ═══════════════════════════════════════════════════════════════
// PRODUKTFINDUNG HUB (Pipeline-Übersicht / Kanban)
// ═══════════════════════════════════════════════════════════════

function renderFindungHub(){
  researchInit();
  // Sammle alle Items aus den 3 Quellen mit normalisiertem Status
  var items=[];
  (D.ideen||[]).forEach(function(i){
    items.push({
      id:i.id||'idee_'+items.length,
      type:'idee',
      typeIcon:'💡',
      typeLabel:'Idee',
      typeColor:'pu',
      name:i.title||i.name||'(Unbenannte Idee)',
      status:normalizeStatus(i.status),
      meta:i.kategorie||i.potenzial||'',
      goAction:"go('ideen')",
      ref:i
    });
  });
  (D.research && D.research.candidates||[]).forEach(function(c){
    items.push({
      id:c.id,
      type:'kandidat',
      typeIcon:'🗂️',
      typeLabel:'Kandidat',
      typeColor:'pu',
      name:c.name,
      status:normalizeStatus(c.status),
      meta:(c.kategorie||'')+(c.currentStep?' · Schritt '+c.currentStep+'/20':''),
      goAction:"researchOpenWorkflow('"+c.id+"')",
      ref:c
    });
  });
  (D.products||[]).forEach(function(p){
    items.push({
      id:p.id||p.name,
      type:'produkt',
      typeIcon:'📦',
      typeLabel:'Produkt',
      typeColor:'ac',
      name:p.name||'(Unbenannt)',
      status:normalizeStatus(p.status||'aktiv'),
      meta:p.kategorie||'',
      goAction:"go('produkte')",
      ref:p
    });
  });

  // Gruppiere nach Status
  var byStatus={};
  PIPELINE_ORDER.forEach(function(s){byStatus[s]=[];});
  items.forEach(function(it){
    if(!byStatus[it.status])byStatus[it.status]=[];
    byStatus[it.status].push(it);
  });

  // Hub-Karten-Counts updaten
  var hubIdeen=document.getElementById('findungHubIdeen');
  if(hubIdeen){
    var iCount=(D.ideen||[]).length;
    hubIdeen.textContent=iCount===0?'Noch keine Ideen':iCount+' Ideen · '+byStatus.idee.filter(function(x){return x.type==='idee'}).length+' offen';
  }
  var hubRes=document.getElementById('findungHubRecherche');
  if(hubRes){
    var cands=(D.research && D.research.candidates)||[];
    var active=cands.filter(function(c){return normalizeStatus(c.status)!=='abgelehnt'}).length;
    hubRes.textContent=cands.length===0?'Noch keine Kandidaten':active+' aktive · '+cands.length+' gesamt';
  }

  // Sidebar-Badge: Summe aller offenen Items in Produktfindung
  var openCount=items.filter(function(it){return it.status!=='aktiv' && it.status!=='abgelehnt'}).length;
  var fb=document.getElementById('findungBadge');
  if(fb){
    if(openCount>0){fb.style.display='inline-block';fb.textContent=openCount;}
    else{fb.style.display='none';}
  }

  // Kanban-Spalten rendern (5 Spalten: idee, recherche, kandidat, muster, abgelehnt)
  // "aktiv" zeigen wir nicht hier, weil das in der Produktliste ist
  var columnKeys=['idee','recherche','kandidat','muster','abgelehnt'];
  var pipeline=document.getElementById('findungPipeline');
  if(!pipeline)return;
  var html='';
  columnKeys.forEach(function(key){
    var cfg=PIPELINE_STATUS[key];
    var colItems=byStatus[key]||[];
    var aktivCount=byStatus.aktiv.length;
    html+='<div style="background:var(--s2);border:1px solid var(--bd);border-top:3px solid var(--'+cfg.color+');border-radius:10px;padding:12px;min-height:200px;display:flex;flex-direction:column">'+
      '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px;padding-bottom:8px;border-bottom:1px dashed var(--bd)">'+
        '<div><span style="font-size:14px">'+cfg.icon+'</span> <span style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--'+cfg.color+')">'+cfg.label+'</span></div>'+
        '<span style="font-size:18px;font-weight:800;color:var(--'+cfg.color+')">'+colItems.length+'</span>'+
      '</div>'+
      '<div style="display:flex;flex-direction:column;gap:6px;flex:1;max-height:480px;overflow-y:auto">';
    if(colItems.length===0){
      html+='<div style="text-align:center;color:var(--tx3);font-size:11px;padding:24px 8px;font-style:italic">'+(key==='abgelehnt'?'Keine aussortiert':'Leer')+'</div>';
    }else{
      colItems.slice(0,12).forEach(function(it){
        var typeColor=it.type==='idee'?'pu':(it.type==='kandidat'?'ac':'cy');
        html+='<div onclick="'+it.goAction+'" style="background:var(--s1);border:1px solid var(--bd);border-left:3px solid var(--'+typeColor+');border-radius:6px;padding:8px 10px;cursor:pointer;transition:all .12s" onmouseover="this.style.borderColor=\'var(--'+typeColor+')\';this.style.transform=\'translateX(2px)\'" onmouseout="this.style.borderColor=\'var(--bd)\';this.style.transform=\'\'" title="'+esc(it.name)+'">'+
          '<div style="display:flex;align-items:center;gap:5px;margin-bottom:2px"><span style="font-size:10px">'+it.typeIcon+'</span><span style="font-size:9px;text-transform:uppercase;letter-spacing:.8px;color:var(--'+typeColor+');font-weight:700">'+it.typeLabel+'</span></div>'+
          '<div style="font-size:12px;font-weight:600;color:var(--tx);line-height:1.3;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">'+esc(it.name)+'</div>'+
          (it.meta?'<div style="font-size:10px;color:var(--tx3);margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(it.meta)+'</div>':'')+
        '</div>';
      });
      if(colItems.length>12){
        html+='<div style="text-align:center;padding:6px;font-size:10px;color:var(--tx3);font-style:italic">+ '+(colItems.length-12)+' weitere</div>';
      }
    }
    html+='</div></div>';
  });
  pipeline.innerHTML=html;

  // Aktiv-Banner falls Produkte da
  if(byStatus.aktiv.length>0){
    var bannerId='findungActivBanner';
    var existing=document.getElementById(bannerId);
    var bannerHtml='<div id="'+bannerId+'" style="background:var(--gnd);border:1.5px solid var(--gn);border-radius:10px;padding:12px 18px;margin-top:14px;display:flex;align-items:center;gap:14px;flex-wrap:wrap">'+
      '<div style="font-size:24px">🚀</div>'+
      '<div style="flex:1;min-width:200px">'+
        '<div style="font-weight:700;color:var(--gn);font-size:13px">'+byStatus.aktiv.length+' aktive Produkte im Verkauf</div>'+
        '<div style="font-size:11px;color:var(--tx2);margin-top:1px">Diese findest du in der separaten Produktliste</div>'+
      '</div>'+
      '<button class="btn btn-sm" onclick="go(\'produkte\')" style="background:var(--gn);color:#fff;border:none;font-size:11px">📋 Zur Produktliste →</button>'+
    '</div>';
    if(existing){existing.outerHTML=bannerHtml;}
    else{pipeline.insertAdjacentHTML('afterend',bannerHtml);}
  }else{
    var ex=document.getElementById('findungActivBanner');
    if(ex)ex.remove();
  }
}

// Quick-Action: Neue Idee aus dem Hub heraus
function findungNewIdea(){
  if(typeof openIdeeModal==='function'){
    go('ideen');
    setTimeout(function(){openIdeeModal();},80);
  }else{
    go('ideen');
  }
}

function renderResearch(){
  researchInit();
  researchShowTab(researchCurrentTab||'overview');
  researchUpdateBadge();
}

var researchCurrentTab='overview';

function researchShowTab(tab){
  researchCurrentTab=tab;
  // Update tab visual state
  var tabs=document.querySelectorAll('.researchTab');
  tabs.forEach(function(t){
    var active=t.getAttribute('data-tab')===tab;
    if(active){
      t.style.background='var(--s1)';
      t.style.border='1.5px solid var(--pu)';
      t.style.borderBottom='1.5px solid var(--s1)';
      t.style.color='var(--pu)';
      t.style.fontWeight='700';
    }else{
      t.style.background='transparent';
      t.style.border='1.5px solid transparent';
      t.style.borderBottom='2px solid transparent';
      t.style.color='var(--tx2)';
      t.style.fontWeight='600';
    }
  });
  // Hide all views
  ['overview','workflow','score'].forEach(function(v){
    var el=document.getElementById('researchView_'+v);
    if(el)el.style.display=(v===tab?'block':'none');
  });
  // Render the selected tab
  if(tab==='overview')researchRenderTable();
  else if(tab==='workflow')researchRenderWorkflow();
  else if(tab==='score')researchRenderScore();
}

function researchOpenLearnLink(){
  // Jump to first lesson of Recherche-Prozess module
  if(typeof go_lesson==='function'){
    go('coaching');
    setTimeout(function(){go_lesson('recherche_prozess','rp_1');},80);
  }else{
    go('coaching');
  }
}

function researchUpdateBadge(){
  researchInit();
  if(typeof auswahlUpdateBadge==='function')auswahlUpdateBadge();
  var badge=document.getElementById('researchBadge');
  if(!badge)return;
  var active=D.research.candidates.filter(function(c){return normalizeStatus(c.status)!=='abgelehnt'}).length;
  if(active>0){badge.style.display='inline-block';badge.textContent=active;}
  else{badge.style.display='none';}
}

// ═══════════════════════════════════════════════════════════════
// TAB 1: MASTER-TABELLE
// ═══════════════════════════════════════════════════════════════

function researchAddCandidate(){
  researchInit();
  var name=prompt('Name des Kandidaten (Produktidee):');
  if(!name||!name.trim())return;
  var c={
    id:'cand_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),
    name:name.trim(),
    kategorie:'',hauptkeyword:'',
    vk:null,top10Umsatz:null,avgReviews:null,
    konkurrenz:'',schwaechen:'',differenzierung:'',
    ek:null,fbaGebuehren:null,ppcRisiko:'',nettoMarge:null,
    risiko:'',
    status:'recherche',
    currentStep:1,
    notes:'',
    scoreMatrix:{},
    computedScore:0,
    compTitle:'',compDesc:'',compUsps:[],compImages:[],compAsin:'',beat:null,compFetchedAt:null,
    createdAt:new Date().toISOString(),
    updatedAt:new Date().toISOString()
  };
  D.research.candidates.unshift(c);
  save();
  researchRenderTable();
  researchUpdateBadge();
  toast('✓ Kandidat „'+esc(name)+'" angelegt');
}

// ── Zugriff für das KI-Bildstudio: Kandidaten mit Konkurrenz-Daten ──
window.SHResearch={
  withComp:function(){return ((D.research&&D.research.candidates)||[]).filter(function(c){return c.compTitle||(c.compImages&&c.compImages.length)||c.beat;});},
  byId:function(id){return ((D.research&&D.research.candidates)||[]).find(function(c){return c.id===id;});}
};

// ── Konkurrenz per ASIN / Amazon-Link analysieren → neuer Recherche-Kandidat ──
async function researchAnalyzeAsin(){
  researchInit();
  var inp=document.getElementById('researchAsinInput');
  var raw=(inp&&inp.value||'').trim();
  if(!raw){toast('Bitte einen Amazon-Link oder eine ASIN eingeben');return;}
  if(!window.SHImport||!window.SHImport.fetchListing){toast('Import-Engine nicht geladen – bitte Seite neu laden');return;}
  var btn=document.getElementById('researchAsinBtn');var old=btn?btn.textContent:'';
  if(btn){btn.disabled=true;btn.textContent='Lädt …';}
  var res=document.getElementById('researchAsinResult');
  if(res)res.innerHTML='<div style="padding:14px 4px;color:var(--tx2);font-size:13px">⏳ Konkurrenz-Listing wird geladen … (der erste Abruf kann ein paar Sekunden dauern)</div>';
  try{
    var data=await window.SHImport.fetchListing(raw);
    if(!data.title && !(data.usps&&data.usps.length) && !(data.imageUrls&&data.imageUrls.length)){
      if(res)res.innerHTML='<div style="padding:12px;border:1px solid var(--bd);border-radius:8px;color:var(--tx2);font-size:13px">'+(data.blocked?'⚠️ Amazon hat den Abruf blockiert (Roboter-Check). Bitte später erneut versuchen oder eine andere ASIN.':'⚠️ Nichts gefunden – evtl. blockiert. Bitte später erneut versuchen.')+'</div>';
      return;
    }
    var c={
      id:'cand_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),
      name:(data.title||'Konkurrenz-Produkt').slice(0,120),
      kategorie:(data.category||''),hauptkeyword:'',
      vk:(data.price!=null?data.price:null),top10Umsatz:null,avgReviews:(data.reviews!=null?data.reviews:null),
      konkurrenz:'',schwaechen:'',differenzierung:'',
      ek:null,fbaGebuehren:null,ppcRisiko:'',nettoMarge:null,
      risiko:'',status:'recherche',currentStep:1,notes:'',
      scoreMatrix:{},computedScore:0,
      compTitle:data.title||'',compDesc:data.desc||'',compUsps:data.usps||[],compImages:data.imageUrls||[],compAsin:data.asin||'',beat:null,compFetchedAt:new Date().toISOString(),
      createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()
    };
    D.research.candidates.unshift(c);
    save();researchRenderTable();if(typeof researchRenderStatsBar==='function')researchRenderStatsBar();researchUpdateBadge();
    if(inp)inp.value='';
    toast('✓ Kandidat aus ASIN angelegt'+(data.asin?' ('+data.asin+')':'')+[data.category?'Kategorie':'',data.price!=null?'VK '+data.price+' €':'',data.reviews!=null?data.reviews+' Reviews':''].filter(Boolean).map(function(x){return ' · '+x;}).join(''));
    researchRenderAsinResult(c.id);
  }catch(err){
    if(res)res.innerHTML='<div style="padding:12px;border:1px solid var(--bd);border-radius:8px;color:var(--tx2);font-size:13px">⚠️ Import fehlgeschlagen: '+esc(err&&err.message||'Fehler')+'</div>';
  }finally{if(btn){btn.disabled=false;btn.textContent=old;}}
}

function researchRenderAsinResult(id){
  var res=document.getElementById('researchAsinResult');if(!res)return;
  var c=((D.research&&D.research.candidates)||[]).find(function(x){return x.id===id;});
  if(!c){res.innerHTML='';return;}
  var imgs=(c.compImages||[]).slice(0,9).map(function(u){return '<img src="'+esc(u)+'" class="pzoom" style="width:54px;height:54px;object-fit:cover;border-radius:6px;border:1px solid var(--bd)" loading="lazy">';}).join('');
  var uspLi=(c.compUsps||[]).map(function(u){return '<li>'+esc(u)+'</li>';}).join('');
  var h='';
  h+='<div style="background:var(--s1);border:1.5px solid var(--pu);border-radius:12px;padding:16px;margin-top:12px">';
  h+='<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px"><div style="font-weight:700;color:var(--tx)">🅰 Konkurrenz importiert'+(c.compAsin?' · ASIN '+esc(c.compAsin):'')+'</div><span style="font-size:11px;color:var(--gn);font-weight:700">✓ als Kandidat gespeichert</span></div>';
  h+='<div style="font-size:13px;color:var(--tx);font-weight:600;margin-bottom:6px">'+esc(c.compTitle||c.name||'')+'</div>';
  var meta2=[];
  if(c.kategorie)meta2.push('🏷️ '+esc(c.kategorie));
  if(c.vk!=null)meta2.push('💶 '+esc(String(c.vk))+' €');
  if(c.avgReviews!=null)meta2.push('⭐ '+esc(String(c.avgReviews))+' Bewertungen');
  if(meta2.length)h+='<div style="font-size:12px;color:var(--tx2);margin-bottom:6px">'+meta2.join(' · ')+' <span style="color:var(--tx3)">→ in die Tabelle übernommen</span></div>';
  if(imgs)h+='<div style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0">'+imgs+'</div>';
  if(uspLi)h+='<ul style="margin:6px 0;padding-left:18px;font-size:12px;color:var(--tx2)">'+uspLi+'</ul>';
  h+='<button class="btn btn-p" id="researchBeatBtn_'+c.id+'" onclick="researchBeatCandidate(\''+c.id+'\')" style="margin-top:8px;background:linear-gradient(135deg,var(--pu),var(--ac));border:none">🏆 Vergleichen &amp; besser vermarkten</button>';
  h+='<div id="researchBeatResult_'+c.id+'"></div>';
  h+='</div>';
  res.innerHTML=h;
  if(c.beat)researchRenderBeat(c.id);
}

// ── Fortschritts-Popup für die Konkurrenz-Analyse (Prozent + Balken + Schritte) ──
var RB_STEPS=["Konkurrenz analysieren","Bessere Titel texten","Beschreibung optimieren","Stärkere USPs ableiten","Verkaufsargumente formulieren"];
var rbProg={pct:0,target:0,timer:null};
function researchBeatProgPaint(){
  var p=Math.round(rbProg.pct);
  var pe=document.getElementById('researchBeatPct'),bar=document.getElementById('researchBeatBar');
  if(pe)pe.textContent=p+' %';
  if(bar)bar.style.width=p+'%';
}
function researchBeatProgShow(){
  researchBeatProgHide();
  rbProg={pct:0,target:5,timer:null};
  var ov=document.createElement('div');
  ov.id='researchBeatOverlay';
  ov.style.cssText='position:fixed;inset:0;background:rgba(15,23,41,.55);display:flex;align-items:center;justify-content:center;z-index:99999;backdrop-filter:blur(2px)';
  var steps=RB_STEPS.map(function(s,i){return '<div id="researchBeatStep'+i+'" style="display:flex;align-items:center;gap:9px;font-size:12.5px;color:var(--tx2);opacity:.4;transition:opacity .25s"><span class="rbchk" style="width:18px;height:18px;flex-shrink:0;border-radius:50%;border:1.5px solid var(--bd);display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--gn)">○</span><span>'+s+'</span></div>';}).join('');
  ov.innerHTML='<div style="background:var(--s1);border:1px solid var(--bd);border-radius:16px;padding:26px 28px;width:min(440px,92vw);box-shadow:0 20px 60px rgba(0,0,0,.35)">'+
    '<div style="font-weight:800;font-size:16px;color:var(--tx);margin-bottom:4px">🏆 Besseres Marketing wird erstellt</div>'+
    '<div style="font-size:12.5px;color:var(--tx2);margin-bottom:18px">Die KI analysiert die Konkurrenz und leitet stärkeres Marketing ab. Je nach Auslastung kann das einen Moment dauern – danke für deine Geduld.</div>'+
    '<div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:7px">'+
      '<span id="researchBeatStepLbl" style="font-size:13px;color:var(--tx);font-weight:600">Konkurrenz analysieren …</span>'+
      '<span id="researchBeatPct" style="font-size:22px;font-weight:800;color:var(--pu)">0 %</span>'+
    '</div>'+
    '<div style="height:10px;background:var(--s3);border-radius:6px;overflow:hidden"><div id="researchBeatBar" style="height:100%;width:0%;background:linear-gradient(90deg,var(--pu),var(--ac));border-radius:6px;transition:width .35s ease"></div></div>'+
    '<div style="margin-top:16px;display:flex;flex-direction:column;gap:7px">'+steps+'</div>'+
  '</div>';
  document.body.appendChild(ov);
  researchBeatProgPaint();
  rbProg.timer=setInterval(function(){
    if(rbProg.pct<rbProg.target){rbProg.pct=Math.min(rbProg.target,rbProg.pct+Math.max(.4,(rbProg.target-rbProg.pct)*0.06));researchBeatProgPaint();}
  },90);
}
function researchBeatProgStep(completed,total,label){
  rbProg.target=Math.min(96,(completed/total)*96);
  var lbl=document.getElementById('researchBeatStepLbl');if(lbl&&label)lbl.textContent=label+' …';
  for(var i=0;i<completed;i++){
    var el=document.getElementById('researchBeatStep'+i);
    if(el){el.style.opacity='1';var chk=el.querySelector('.rbchk');if(chk){chk.textContent='✓';chk.style.borderColor='var(--gn)';chk.style.background='var(--gnd)';}}
  }
  researchBeatProgPaint();
}
function researchBeatProgDone(){rbProg.target=100;rbProg.pct=100;researchBeatProgPaint();}
function researchBeatProgHide(){if(rbProg&&rbProg.timer){clearInterval(rbProg.timer);rbProg.timer=null;}var ov=document.getElementById('researchBeatOverlay');if(ov&&ov.parentNode)ov.parentNode.removeChild(ov);}

async function researchBeatCandidate(id){
  var c=((D.research&&D.research.candidates)||[]).find(function(x){return x.id===id;});if(!c)return;
  if(!window.SHImport||!window.SHImport.beat){toast('KI-Engine nicht geladen – bitte Seite neu laden');return;}
  var btn=document.getElementById('researchBeatBtn_'+id);var old=btn?btn.textContent:'';
  if(btn){btn.disabled=true;btn.textContent='… KI analysiert';}
  var box=document.getElementById('researchBeatResult_'+id);
  researchBeatProgShow();
  try{
    var beat=await window.SHImport.beat({title:c.compTitle,desc:c.compDesc,usps:c.compUsps},'Deutsch',researchBeatProgStep);
    if(!beat.titles.length && !beat.desc && !beat.usps.length)throw new Error('Die KI hat gerade keine optimierten Inhalte geliefert (vermutlich kurz überlastet). Bitte erneut versuchen.');
    researchBeatProgDone();
    await new Promise(function(r){setTimeout(r,450);});
    researchBeatProgHide();
    var filledDiff=false;
    if((!c.differenzierung||!c.differenzierung.trim()) && beat.weaknesses && beat.weaknesses.length){
      c.differenzierung=beat.weaknesses.slice(0,3).join(' · ').slice(0,300);filledDiff=true;
    }
    c.beat=beat;c.updatedAt=new Date().toISOString();save();researchRenderTable();
    researchRenderBeat(id);
    toast('✓ KI-Optimierung gespeichert'+(filledDiff?' · Differenzierung vorgefüllt':'')+' – im KI-Bildstudio ladbar');
  }catch(err){
    researchBeatProgHide();
    if(box)box.innerHTML='<div style="padding:12px;border:1px solid var(--bd);border-radius:8px;color:var(--tx2);font-size:13px;display:flex;flex-direction:column;gap:8px;align-items:flex-start"><div>⏳ '+esc(err&&err.message||'Fehler')+'</div><button class="btn btn-sm" onclick="researchBeatCandidate(\''+id+'\')">🔄 Nochmal versuchen</button></div>';
  }finally{researchBeatProgHide();if(btn){btn.disabled=false;btn.textContent=old;}}
}

function researchRenderBeat(id){
  var c=((D.research&&D.research.candidates)||[]).find(function(x){return x.id===id;});if(!c||!c.beat)return;
  var box=document.getElementById('researchBeatResult_'+id);if(!box)return;
  var b=c.beat;
  var titles=(b.titles||[]).map(function(t,i){return '<div style="background:var(--gnd);border:1px solid var(--gn);border-radius:7px;padding:7px 10px;margin:4px 0;font-size:12.5px;color:var(--tx)">'+(i===0?'★ ':'')+esc(t)+'</div>';}).join('');
  var usps=(b.usps||[]).map(function(u){return '<li>'+esc(u)+'</li>';}).join('');
  var why=(b.why||[]).map(function(w){return '<li>'+esc(w)+'</li>';}).join('');
  var weak=(b.weaknesses||[]).map(function(w){return '<li>'+esc(w)+'</li>';}).join('');
  var h='<div style="margin-top:14px;border-top:1px dashed var(--bd);padding-top:12px">';
  h+='<div style="font-weight:700;color:var(--gn);margin-bottom:8px">🅱 KI-optimiertes Marketing ✨ <span style="font-size:11px;color:var(--tx3);font-weight:400">– gespeichert, im Bildstudio ladbar</span></div>';
  if(titles)h+='<div style="font-size:11px;color:var(--tx3);font-weight:700;margin-bottom:2px">BESSERE TITEL</div>'+titles;
  if(b.desc)h+='<div style="font-size:11px;color:var(--tx3);font-weight:700;margin:8px 0 2px">BESSERE BESCHREIBUNG</div><div style="font-size:12.5px;color:var(--tx);background:var(--s2);border-radius:7px;padding:8px 10px">'+esc(b.desc)+'</div>';
  if(usps)h+='<div style="font-size:11px;color:var(--tx3);font-weight:700;margin:8px 0 2px">BESSERE USPs</div><ul style="margin:2px 0;padding-left:18px;font-size:12.5px;color:var(--tx)">'+usps+'</ul>';
  if(why)h+='<div style="font-size:11px;color:var(--tx3);font-weight:700;margin:8px 0 2px">💡 WARUM DAS MEHR VERKAUFT</div><ul style="margin:2px 0;padding-left:18px;font-size:12.5px;color:var(--tx2)">'+why+'</ul>';
  if(weak)h+='<details style="margin-top:10px"><summary style="cursor:pointer;font-size:12.5px;color:var(--tx2)">⚔️ Schwächen der Konkurrenz ('+(b.weaknesses||[]).length+')</summary><ul style="margin:6px 0;padding-left:18px;font-size:12px;color:var(--tx2)">'+weak+'</ul></details>';
  h+='</div>';
  box.innerHTML=h;
}

function researchImportFromIdeen(){
  researchInit();
  var ideen=D.ideen||[];
  if(ideen.length===0){alert('Der Ideen-Pool ist leer.');return;}
  // Build picker
  var existingNames={};
  D.research.candidates.forEach(function(c){existingNames[c.name.toLowerCase()]=true});
  var available=ideen.filter(function(i){return !existingNames[(i.title||i.name||'').toLowerCase()]});
  if(available.length===0){alert('Alle Ideen aus dem Ideen-Pool sind bereits als Kandidaten angelegt.');return;}
  // Modal
  var modal=document.createElement('div');
  modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99996;display:flex;align-items:center;justify-content:center;padding:20px';
  var card='<div style="background:var(--s1);border-radius:14px;padding:24px;max-width:600px;width:100%;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.4)">'+
    '<h2 style="margin:0 0 14px 0;color:var(--pu)">📥 Ideen aus Ideen-Pool importieren</h2>'+
    '<div style="font-size:12px;color:var(--tx2);margin-bottom:14px">Wähle die Ideen, die du als Recherche-Kandidaten übernehmen willst:</div>'+
    '<div style="max-height:400px;overflow-y:auto;border:1px solid var(--bd);border-radius:8px;padding:8px">';
  available.forEach(function(i,idx){
    var title=i.title||i.name||'Ohne Titel';
    card+='<label style="display:flex;align-items:center;gap:10px;padding:8px 10px;cursor:pointer;border-radius:6px" onmouseover="this.style.background=\'var(--s2)\'" onmouseout="this.style.background=\'transparent\'">'+
      '<input type="checkbox" data-idea-idx="'+idx+'" style="width:18px;height:18px;accent-color:var(--pu);cursor:pointer">'+
      '<span style="flex:1;font-size:13px;color:var(--tx)">'+esc(title)+'</span>'+
      (i.potenzial?'<span style="font-size:10px;padding:2px 8px;border-radius:6px;background:var(--acd);color:var(--ac);font-weight:600">'+esc(i.potenzial)+'</span>':'')+
    '</label>';
  });
  card+='</div>'+
    '<div style="display:flex;gap:10px;margin-top:18px;justify-content:flex-end">'+
      '<button class="btn btn-sm" onclick="this.closest(\'.researchImportModal\').remove()" style="background:var(--s3);color:var(--tx)">Abbrechen</button>'+
      '<button class="btn btn-p" id="researchImportConfirm">📥 Auswahl importieren</button>'+
    '</div>'+
  '</div>';
  modal.innerHTML=card;
  modal.className='researchImportModal';
  document.body.appendChild(modal);
  modal.onclick=function(e){if(e.target===modal)modal.remove();};
  document.getElementById('researchImportConfirm').onclick=function(){
    var picked=modal.querySelectorAll('input[data-idea-idx]:checked');
    if(picked.length===0){alert('Bitte wähle mindestens eine Idee aus.');return;}
    picked.forEach(function(cb){
      var i=available[parseInt(cb.getAttribute('data-idea-idx'),10)];
      var c={
        id:'cand_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),
        name:i.title||i.name||'Idee',
        kategorie:i.kategorie||'',
        hauptkeyword:i.hauptkeyword||i.keyword||'',
        vk:null,top10Umsatz:null,avgReviews:null,
        konkurrenz:'',schwaechen:'',
        differenzierung:i.differenzierung||'',
        ek:null,fbaGebuehren:null,ppcRisiko:'',nettoMarge:null,
        risiko:'',
        status:'recherche',
        currentStep:1,
        notes:i.notes||i.beschreibung||'',
        scoreMatrix:{},
        computedScore:0,
        sourceIdea:i.id||null,
        createdAt:new Date().toISOString(),
        updatedAt:new Date().toISOString()
      };
      D.research.candidates.unshift(c);
    });
    save();
    modal.remove();
    researchRenderTable();
    researchUpdateBadge();
    toast('✓ '+picked.length+' Idee'+(picked.length>1?'n':'')+' importiert');
  };
}

// ═══════════════════════════════════════════════════════════════
// RECHERCHE-PIPELINE (Kanban-Board über alle Stufen)
// ═══════════════════════════════════════════════════════════════
// Kompakte Flag-Chips für Karten/Widgets (nutzt f.s = Kurzlabel)
function pipeFlagChips(flags){
  if(!flags||!flags.length)return '';
  return '<div style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:8px">'+flags.map(function(f){
    var c=f.hard?'rd':'ac';
    return '<span title="'+esc(f.t)+'" style="font-size:9px;font-weight:700;color:var(--'+c+');background:var(--'+c+'d);border:1px solid var(--'+c+');border-radius:5px;padding:1px 5px;line-height:1.5">'+(f.hard?'🔴':'🟡')+' '+esc(f.s||f.t)+'</span>';
  }).join('')+'</div>';
}
function pipeCol(icon,title,color,count,cards){
  return '<div style="flex:0 0 272px;min-width:272px;background:var(--s2);border:1px solid var(--bd);border-radius:12px;display:flex;flex-direction:column;max-height:calc(100vh - 250px)">'+
    '<div style="padding:11px 14px;border-bottom:2px solid var(--'+color+');display:flex;justify-content:space-between;align-items:center;flex-shrink:0">'+
      '<span style="font-weight:700;color:var(--tx);font-size:13px">'+icon+' '+title+'</span>'+
      '<span style="background:var(--'+color+'d);color:var(--'+color+');font-weight:700;font-size:11px;padding:2px 9px;border-radius:10px">'+count+'</span>'+
    '</div>'+
    '<div style="padding:10px;overflow-y:auto;display:flex;flex-direction:column;gap:8px">'+(cards||'<div style="color:var(--tx3);font-size:12px;text-align:center;padding:24px 8px">— leer —</div>')+'</div>'+
  '</div>';
}

function renderPipeline(){
  researchInit();
  var board=document.getElementById('pipelineBoard');
  if(!board)return;
  var shortCandIds={};
  (D.research.shortlist||[]).forEach(function(s){if(s.sourceCandidateId)shortCandIds[s.sourceCandidateId]=true;});

  // ── Stufe 1: Idee ──
  var ideen=(D.ideen||[]).filter(function(i){return !i.promoted && normalizeStatus(i.status)!=='abgelehnt';});
  var c1='';
  ideen.forEach(function(i){
    var idx=D.ideen.indexOf(i);
    c1+='<div style="background:var(--s1);border:1px solid var(--bd);border-radius:9px;padding:10px 11px">'+
      '<div style="font-weight:600;color:var(--tx);font-size:12.5px;margin-bottom:4px">'+esc(i.title||i.name||'Ohne Titel')+'</div>'+
      '<div style="font-size:10.5px;color:var(--tx2);margin-bottom:8px">'+[i.kategorie?esc(i.kategorie):'',i.potenzial?'Potenzial '+esc(i.potenzial):'',i.quelle?esc(i.quelle):''].filter(Boolean).join(' · ')+'</div>'+
      '<div style="display:flex;gap:5px;flex-wrap:wrap">'+
        '<button class="btn btn-sm" onclick="pipelinePromoteIdea('+idx+')" style="font-size:10.5px;background:var(--pud);color:var(--pu);border:1px solid var(--pu);font-weight:700">🔬 Validieren →</button>'+
        '<button class="btn btn-sm" onclick="go(\'ideen\')" style="font-size:10.5px" title="Im Ideen-Pool bearbeiten">✏️</button>'+
        '<button class="btn btn-sm del" onclick="pipelineDelIdee('+idx+')" style="font-size:10.5px" title="Idee löschen">🗑</button>'+
      '</div>'+
    '</div>';
  });

  // ── Stufe 2: Validieren (Kandidaten, noch nicht in Shortlist) ──
  var cands=(D.research.candidates||[]).filter(function(c){var st=normalizeStatus(c.status);return !shortCandIds[c.id]&&st!=='abgelehnt'&&st!=='aktiv'&&st!=='muster';});
  // Kanban = Arbeitsboard, kein Massenlager: nur die Top 10 nach Score anzeigen,
  // der Rest wird in der Master-Tabelle gesichtet (Verweis-Karte unten).
  var candsTotal=cands.length;
  var candsShown=cands;
  if(candsTotal>10){
    candsShown=cands.slice().sort(function(a,b){return researchCalcScore(b)-researchCalcScore(a);}).slice(0,10);
  }
  var c2='';
  candsShown.forEach(function(c){
    var vd=decisionVerdict(c);
    var emoji=vd.verdict==='go'?'🟢':vd.verdict==='nogo'?'🔴':vd.verdict==='pruefen'?'🟡':'⚪';
    var cf=decisionConfidence(c);
    // Harte Red Flags blockieren GO → Karte rot umranden (10-Sekunden-Urteil auf einen Blick)
    var cardBorder=vd.hard>0?'border:1.5px solid var(--rd);box-shadow:0 0 0 3px var(--rdd)':'border:1px solid var(--bd)';
    // Hauptbild + Produktname klickbar → Amazon-Listing (pipeThumb/pipeLinkedName sind gehoistet)
    c2+='<div style="background:var(--s1);'+cardBorder+';border-radius:9px;padding:10px 11px"'+(vd.hard>0?' title="'+vd.hard+' harte'+(vd.hard===1?'r':'')+' Red Flag — GO ist blockiert"':'')+'>'+
      '<div style="display:flex;gap:9px;align-items:flex-start;margin-bottom:4px">'+pipeThumb(c,38)+
        '<div style="flex:1;min-width:0"><div style="font-weight:600;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;line-height:1.4">'+pipeLinkedName(c)+'</div>'+
        '<div style="font-size:10.5px;color:var(--tx2);margin-top:2px">'+(c.kategorie?esc(c.kategorie)+' · ':'')+emoji+' '+vd.label+' · <span style="color:var(--'+cf.color+')" title="Daten-Konfidenz: '+cf.data+' von '+cf.total+' Dimensionen aus echten Daten">⚙️ '+cf.data+'/'+cf.total+'</span></div></div>'+
        '<div style="font-weight:800;color:var(--'+vd.color+');font-size:15px;line-height:1">'+(vd.score>0?vd.score:'—')+'</div>'+
      '</div>'+
      pipeFlagChips(vd.flags)+
      '<div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center">'+
        '<button class="btn btn-sm" onclick="go(\'research\');researchOpenScore(\''+c.id+'\')" style="font-size:11px;font-weight:700" title="Scorecard: bewerten & Urteil sehen">⚖️ Bewerten</button>'+
        '<button class="btn btn-sm" onclick="pipelineEditCand(\''+c.id+'\')" style="font-size:11px" title="Daten eintragen (VK, EK, FBA, Reviews …)">✏️ Daten</button>'+
        '<button class="btn btn-sm" onclick="reviewMiningOpen(\''+c.id+'\')" style="font-size:10.5px;padding-left:8px;padding-right:8px'+(c.reviewMining?';background:var(--gnd);color:var(--gn);border:1px solid var(--gn)':'')+'" title="Review-Mining: Konkurrenz-Reviews analysieren">🔬</button>'+
        '<button class="btn btn-sm" onclick="dossierOpen(\''+c.id+'\')" style="font-size:10.5px;padding-left:8px;padding-right:8px" title="Entscheidungs-Dossier (druckfertiger One-Pager)">📄</button>'+
        '<span style="flex:1"></span>'+
        '<button class="btn btn-sm" onclick="pipelineToShortlist(\''+c.id+'\')" style="font-size:11px;background:var(--acd);color:var(--ac);border:1px solid var(--ac);font-weight:700">⭐ Shortlist →</button>'+
        '<button class="btn btn-sm del" onclick="pipelineDelCand(\''+c.id+'\')" style="font-size:10.5px;padding-left:8px;padding-right:8px" title="Kandidat löschen">🗑</button>'+
      '</div>'+
    '</div>';
  });

  // Mehr als 10 Kandidaten: Verweis-Karte zur Master-Tabelle (dort sichtet man schneller)
  if(candsTotal>10){
    c2+='<div style="background:var(--acd);border:1.5px dashed var(--ac);border-radius:9px;padding:12px;text-align:center">'+
      '<div style="font-size:12.5px;color:var(--tx);font-weight:700;margin-bottom:2px">+ '+(candsTotal-10)+' weitere Kandidaten</div>'+
      '<div style="font-size:10.5px;color:var(--tx2);margin-bottom:8px;line-height:1.45">Das Board zeigt die <b>Top 10 nach Score</b> — Sichten, Sortieren und Aufräumen geht in der Tabelle schneller.</div>'+
      '<button class="btn btn-sm" onclick="go(\'research\')" style="background:var(--ac);color:#fff;border:none;font-weight:700;font-size:11px">📋 Alle '+candsTotal+' in der Tabelle sichten →</button>'+
    '</div>';
  }

  // Hauptbild-Thumbnail + Amazon-Link (gemeinsames Muster für Shortlist/Entscheidung)
  function pipeThumb(it,size){
    var img=(it.compImages&&it.compImages[0])||'';
    var t=img
      ?'<img src="'+esc(img)+'" loading="lazy" alt="" class="pzoom" style="width:'+size+'px;height:'+size+'px;object-fit:cover;border-radius:7px;border:1px solid var(--bd);flex-shrink:0;background:#fff" onerror="this.outerHTML=\'<div style=&quot;width:'+size+'px;height:'+size+'px;border-radius:7px;background:var(--s2);border:1px solid var(--bd);display:flex;align-items:center;justify-content:center;flex-shrink:0&quot;>📦</div>\'">'
      :'<div style="width:'+size+'px;height:'+size+'px;border-radius:7px;background:var(--s2);border:1px solid var(--bd);display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0" title="Kein Bild vorhanden">📦</div>';
    return it.compAsin?'<a href="https://www.amazon.de/dp/'+esc(it.compAsin)+'" target="_blank" rel="noopener" title="Auf Amazon öffnen ('+esc(it.compAsin)+')" style="flex-shrink:0;line-height:0">'+t+'</a>':t;
  }
  function pipeLinkedName(it){
    if(!it.compAsin)return esc(it.name);
    return '<a href="https://www.amazon.de/dp/'+esc(it.compAsin)+'" target="_blank" rel="noopener" title="Auf Amazon öffnen" style="color:var(--tx);text-decoration:none;border-bottom:1px dashed var(--bd2)" onmouseover="this.style.color=\'var(--ac)\'" onmouseout="this.style.color=\'var(--tx)\'">'+esc(it.name)+' <span style="font-size:10px;color:var(--tx3)">↗</span></a>';
  }

  // ── Stufe 3: Shortlist (in Prüfung) ──
  var sl=(D.research.shortlist||[]).filter(function(s){return s.decision==='pruefen'&&!s.movedToProducts;});
  var c3='';
  sl.forEach(function(s){
    c3+='<div style="background:var(--s1);border:1px solid var(--bd);border-radius:9px;padding:10px 11px">'+
      '<div style="display:flex;gap:9px;align-items:flex-start;margin-bottom:4px">'+pipeThumb(s,38)+
        '<div style="flex:1;min-width:0"><div style="font-weight:600;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;line-height:1.4">'+pipeLinkedName(s)+'</div>'+
        '<div style="font-size:10.5px;color:var(--tx2);margin-top:2px">'+(s.kategorie?esc(s.kategorie)+' · ':'')+(s.compUsps&&s.compUsps.length?s.compUsps.length+' USPs':'')+'</div></div>'+
        (s.score?'<div style="font-weight:800;color:var(--ac);font-size:15px;line-height:1">'+s.score+'</div>':'')+
      '</div>'+
      '<div style="display:flex;gap:5px;flex-wrap:wrap">'+
        '<button class="btn btn-sm" onclick="pipelineDecide(\''+s.id+'\',\'muster\')" style="font-size:10.5px;background:var(--gnd);color:var(--gn);border:1px solid var(--gn);font-weight:700">✅ GO →</button>'+
        '<button class="btn btn-sm" onclick="pipelineDecide(\''+s.id+'\',\'abgelehnt\')" style="font-size:10.5px;background:var(--rdd);color:var(--rd);border:1px solid var(--rd)">❌ NO-GO</button>'+
        '<button class="btn btn-sm" onclick="go(\'auswahl\')" style="font-size:10.5px" title="In Engerer Wahl bearbeiten">✏️</button>'+
        '<button class="btn btn-sm del" onclick="pipelineDelShort(\''+s.id+'\')" style="font-size:10.5px" title="Aus Engerer Wahl entfernen">🗑</button>'+
      '</div>'+
    '</div>';
  });

  // ── Stufe 4: Entscheidung (GO/NO-GO/zur Produktliste) ──
  var dec=(D.research.shortlist||[]).filter(function(s){return s.movedToProducts||s.decision==='muster'||s.decision==='abgelehnt';});
  var c4='';
  dec.forEach(function(s){
    var go1=s.movedToProducts||s.decision==='muster';
    var col=go1?'gn':'rd';
    var label=s.movedToProducts?'🟢 In Produktliste':go1?'🟢 GO':'🔴 NO-GO';
    c4+='<div style="background:var(--s1);border:1px solid var(--'+col+');border-radius:9px;padding:10px 11px;'+(go1?'':'opacity:.7')+'">'+
      '<div style="display:flex;gap:9px;align-items:center;margin-bottom:8px">'+pipeThumb(s,34)+
        '<div style="flex:1;min-width:0"><div style="font-weight:600;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;line-height:1.4">'+pipeLinkedName(s)+'</div>'+
        '<div style="font-size:11px;color:var(--'+col+');font-weight:700;margin-top:2px">'+label+'</div></div>'+
      '</div>'+
      '<div style="display:flex;gap:5px;flex-wrap:wrap">'+
        (go1&&!s.movedToProducts?'<button class="btn btn-sm" onclick="auswahlOrderSample(\''+s.id+'\')" style="font-size:10.5px;background:var(--gnd);color:var(--gn);border:1px solid var(--gn);font-weight:700">→ Produktliste</button>':'')+
        (!go1?'<button class="btn btn-sm" onclick="pipelineDecide(\''+s.id+'\',\'pruefen\')" style="font-size:10.5px" title="Zurück in Prüfung">↩</button>':'')+
        '<button class="btn btn-sm del" onclick="pipelineDelShort(\''+s.id+'\')" style="font-size:10.5px" title="Aus Pipeline entfernen">🗑</button>'+
      '</div>'+
    '</div>';
  });

  board.innerHTML=
    pipeCol('💡','Idee','tx3',ideen.length,c1)+
    pipeCol('🔬','Validieren','pu',cands.length,c2)+
    pipeCol('⭐','Shortlist','ac',sl.length,c3)+
    pipeCol('✅','Entscheidung','gn',dec.length,c4);
}

// Idee → Validieren (legt einen Recherche-Kandidaten an)
function pipelinePromoteIdea(idx){
  researchInit();
  var i=D.ideen[idx];if(!i)return;
  var c={
    id:'cand_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),
    name:i.title||i.name||'Idee',kategorie:i.kategorie||'',hauptkeyword:i.hauptkeyword||i.keyword||'',
    vk:(i.vkPreis!=null?i.vkPreis:null),top10Umsatz:null,avgReviews:null,
    konkurrenz:'',schwaechen:'',differenzierung:i.differenzierung||'',
    ek:null,fbaGebuehren:null,ppcRisiko:'',nettoMarge:null,risiko:'',
    status:'recherche',currentStep:1,notes:i.notes||i.beschreibung||'',
    scoreMatrix:{},score2:{},computedScore:0,sourceIdea:i.id||null,
    createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()
  };
  D.research.candidates.unshift(c);
  i.promoted=true;
  save();renderPipeline();if(typeof researchUpdateBadge==='function')researchUpdateBadge();
  toast('🔬 „'+esc(c.name)+'" ist jetzt in Validieren');
}
// Validieren → Shortlist (ohne Wegnavigieren)
function pipelineToShortlist(candId){
  researchPromoteToProduct(candId,{stay:true});
  renderPipeline();
}
// Shortlist-Entscheidung setzen (bleibt auf dem Board)
function pipelineDecide(id,dec){
  researchInit();
  var it=D.research.shortlist.find(function(x){return x.id===id;});if(!it)return;
  it.decision=dec;it.updatedAt=new Date().toISOString();
  save();auswahlUpdateBadge();renderPipeline();
  toast(dec==='muster'?'✅ GO – in Entscheidung':dec==='abgelehnt'?'❌ NO-GO':'↩ zurück in Prüfung');
}
// Löschen direkt vom Board (nutzt vorhandene Lösch-Funktionen + frischt das Board auf)
function pipelineDelIdee(idx){var i=D.ideen[idx];if(!i)return;if(!confirm('Idee „'+(i.title||i.name||'')+'" wirklich löschen?'))return;D.ideen.splice(idx,1);save();renderPipeline();toast('Idee gelöscht');}
function pipelineDelCand(id){researchDeleteCandidate(id);renderPipeline();}
function pipelineDelShort(id){auswahlDelete(id);renderPipeline();}
// Bearbeiten: in die jeweilige Detailansicht springen
function pipelineEditCand(id){go('research');researchOpenEdit(id);}
// Leeren Kandidaten direkt vom Board anlegen
function pipelineAddCandidate(){researchAddCandidate();renderPipeline();}

function researchRenderStatsBar(){
  researchInit();
  var cands=D.research.candidates;
  // Count by normalized pipeline status (research-relevant ones)
  var researchStatuses=['recherche','kandidat','muster','aktiv','abgelehnt'];
  var byStatus={};
  researchStatuses.forEach(function(s){byStatus[s]=0;});
  cands.forEach(function(c){var s=normalizeStatus(c.status);if(byStatus.hasOwnProperty(s))byStatus[s]++;});
  var bar=document.getElementById('researchStatsBar');
  if(!bar)return;
  var html='';
  researchStatuses.forEach(function(s){
    var cfg=PIPELINE_STATUS[s];
    html+='<div style="background:var(--s1);border:1px solid var(--bd);border-left:3px solid var(--'+cfg.color+');border-radius:8px;padding:10px 14px">'+
      '<div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--tx3);font-weight:700">'+cfg.icon+' '+esc(cfg.label)+'</div>'+
      '<div style="font-size:22px;font-weight:700;color:var(--'+cfg.color+');margin-top:2px">'+byStatus[s]+'</div>'+
    '</div>';
  });
  // Total
  html+='<div style="background:var(--s1);border:1px solid var(--pu);border-radius:8px;padding:10px 14px">'+
    '<div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--tx3);font-weight:700">📊 Gesamt</div>'+
    '<div style="font-size:22px;font-weight:700;color:var(--pu);margin-top:2px">'+cands.length+'</div>'+
  '</div>';
  bar.innerHTML=html;
}

// ── Mehrfachauswahl Master-Tabelle: markieren (auch „alle") + Sammel-Löschen ──
var researchSel={},researchTableAllIds=[];
function researchToggleSel(id,on){if(on)researchSel[id]=1;else delete researchSel[id];researchRenderTable();}
function researchSelAll(on){
  researchSel={};
  if(on)researchTableAllIds.forEach(function(id){researchSel[id]=1;});
  researchRenderTable();
}
function researchDeleteSelected(){
  var ids=Object.keys(researchSel);if(!ids.length)return;
  if(!confirm(ids.length+' markierte Kandidaten endgültig löschen?\n\nWorkflow-Notizen und Bewertungen dieser Kandidaten gehen verloren. Einträge in der Engeren Wahl bleiben erhalten.'))return;
  var sel=researchSel;
  D.research.candidates=D.research.candidates.filter(function(c){return !sel[c.id];});
  ids.forEach(function(id){if(D.research.workflowState&&D.research.workflowState[id])delete D.research.workflowState[id];});
  researchSel={};
  save();researchRenderTable();researchUpdateBadge();
  if(typeof researchRenderStatsBar==='function')researchRenderStatsBar();
  if(document.getElementById('pipelineBoard')&&typeof renderPipeline==='function')renderPipeline();
  toast('🗑 '+ids.length+' Kandidaten gelöscht');
}
window.researchToggleSel=researchToggleSel;window.researchSelAll=researchSelAll;window.researchDeleteSelected=researchDeleteSelected;

var researchTablePage=1,researchTableSig='';
function researchTableGoPage(p){
  researchTablePage=p;researchRenderTable();
  var t=document.getElementById('researchMasterTable');if(t)t.scrollIntoView({behavior:'smooth',block:'start'});
}
window.researchTableGoPage=researchTableGoPage;
function researchRenderTable(){
  researchInit();
  researchRenderStatsBar();
  var tbody=document.getElementById('researchTableBody');
  var empty=document.getElementById('researchTableEmpty');
  if(!tbody)return;
  var filter=document.getElementById('researchFilterStatus');
  var search=document.getElementById('researchSearch');
  var filterStatus=filter?filter.value:'';
  var searchQ=search?search.value.toLowerCase().trim():'';

  var cands=D.research.candidates.slice();
  if(filterStatus)cands=cands.filter(function(c){return normalizeStatus(c.status)===filterStatus});
  if(searchQ)cands=cands.filter(function(c){
    return (c.name||'').toLowerCase().indexOf(searchQ)>-1 ||
           (c.kategorie||'').toLowerCase().indexOf(searchQ)>-1 ||
           (c.hauptkeyword||'').toLowerCase().indexOf(searchQ)>-1;
  });

  // Verwaiste Markierungen entfernen (gelöschte Kandidaten dürfen nicht weiterzählen)
  var existIds={};D.research.candidates.forEach(function(c){existIds[c.id]=1;});
  Object.keys(researchSel).forEach(function(id){if(!existIds[id])delete researchSel[id];});

  if(cands.length===0){
    tbody.innerHTML='';
    if(empty)empty.style.display='block';
    var pgEmpty=document.getElementById('researchTablePager');if(pgEmpty)pgEmpty.innerHTML='';
    var bulkEmpty=document.getElementById('researchBulkBar');if(bulkEmpty)bulkEmpty.innerHTML='';
    var cbEmpty=document.getElementById('researchSelAllCb');if(cbEmpty){cbEmpty.checked=false;cbEmpty.indeterminate=false;}
    researchTableAllIds=[];
    if(typeof researchRenderStatsBar==='function')researchRenderStatsBar();
    return;
  }
  if(empty)empty.style.display='none';

  // ── Sortierung (Standard: Score absteigend — die besten zuerst) ──
  var sortSel=document.getElementById('researchSort');
  var sortMode=sortSel?sortSel.value:'score';
  cands.sort(function(a,b){
    if(sortMode==='neu')return new Date(b.createdAt||0)-new Date(a.createdAt||0);
    if(sortMode==='vk')return (b.vk||0)-(a.vk||0);
    if(sortMode==='reviews')return (a.avgReviews==null?1e12:a.avgReviews)-(b.avgReviews==null?1e12:b.avgReviews); // wenige Reviews = gut → aufsteigend
    return researchCalcScore(b)-researchCalcScore(a);
  });

  // Gefilterte IDs für „Alle markieren" (über alle Seiten hinweg) merken
  researchTableAllIds=cands.map(function(c){return c.id;});

  // ── Blätterung: 30 je Seite; bei Filter-/Suchwechsel zurück auf Seite 1 ──
  var sig=filterStatus+'|'+searchQ+'|'+sortMode;
  if(sig!==researchTableSig){researchTablePage=1;researchTableSig=sig;}
  var RT_PAGE=30;
  var totalPages=Math.max(1,Math.ceil(cands.length/RT_PAGE));
  if(researchTablePage>totalPages)researchTablePage=totalPages;
  var candsAll=cands.length;
  cands=cands.slice((researchTablePage-1)*RT_PAGE,researchTablePage*RT_PAGE);

  var html='';
  cands.forEach(function(c){
    var statusKey=normalizeStatus(c.status);
    var cfg=PIPELINE_STATUS[statusKey];
    var score=researchCalcScore(c);
    var scoreColor=score>=70?'gn':score>=50?'ac':score>0?'rd':'tx3';
    // Hauptbild ganz vorn: aus compImages[0] (Import/ASIN-Analyse); Klick → Amazon-Listing
    var mimg=(c.compImages&&c.compImages[0])||'';
    var mthumb=mimg
      ?'<img src="'+esc(mimg)+'" loading="lazy" alt="" class="pzoom" style="width:36px;height:36px;object-fit:cover;border-radius:7px;border:1px solid var(--bd);flex-shrink:0;background:#fff" onerror="this.outerHTML=\'<div style=&quot;width:36px;height:36px;border-radius:7px;background:var(--s2);border:1px solid var(--bd);display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0&quot;>📦</div>\'">'
      :'<div style="width:36px;height:36px;border-radius:7px;background:var(--s2);border:1px solid var(--bd);display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0" title="Kein Bild — kommt per ASIN-Analyse oder Import mit Bild-Spalte">📦</div>';
    if(c.compAsin)mthumb='<a href="https://www.amazon.de/dp/'+esc(c.compAsin)+'" target="_blank" rel="noopener" title="Auf Amazon öffnen ('+esc(c.compAsin)+')" style="flex-shrink:0;line-height:0">'+mthumb+'</a>';
    html+='<tr data-cid="'+c.id+'">'+
      '<td style="position:sticky;left:0;background:var(--s1)"><div style="display:flex;align-items:center;gap:8px;min-width:240px">'+
        '<input type="checkbox" onclick="event.stopPropagation()" onchange="researchToggleSel(\''+c.id+'\',this.checked)" '+(researchSel[c.id]?'checked':'')+' style="width:15px;height:15px;accent-color:var(--ac);cursor:pointer;flex-shrink:0" title="Markieren">'+mthumb+
        '<button onclick="researchOpenEdit(\''+c.id+'\')" title="Öffnen & bearbeiten" style="flex:1;min-width:0;text-align:left;background:transparent;border:none;padding:5px 6px;border-radius:5px;font-family:inherit;font-size:12.5px;font-weight:600;color:var(--pu);cursor:pointer;display:flex;align-items:center;gap:6px" onmouseover="this.style.background=\'var(--pud)\'" onmouseout="this.style.background=\'transparent\'"><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(c.name||'(ohne Name)')+'</span><span style="opacity:.45;font-size:11px">✏️</span></button>'+
      '</div></td>'+
      '<td><span title="Original-Amazon-Daten – nicht editierbar" style="display:inline-block;padding:4px 6px;font-size:12px;color:var(--tx)">'+(c.kategorie?esc(c.kategorie):'<span style="color:var(--tx3)">—</span>')+'</span></td>'+
      '<td class="nc"><span title="Original-Amazon-Daten – nicht editierbar" style="display:inline-block;padding:4px 6px;font-size:12px;color:var(--tx)">'+(c.vk!=null?'€ '+Number(c.vk).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2}):'<span style="color:var(--tx3)">—</span>')+'</span></td>'+
      '<td class="nc"><span title="Original-Amazon-Daten – nicht editierbar" style="display:inline-block;padding:4px 6px;font-size:12px;color:var(--tx)">'+(c.avgReviews!=null?Number(c.avgReviews).toLocaleString('de-DE'):'<span style="color:var(--tx3)">—</span>')+'</span></td>'+
      '<td class="nc"><span style="display:inline-block;padding:3px 9px;background:var(--'+scoreColor+'d);color:var(--'+scoreColor+');border-radius:10px;font-weight:700;font-size:12px;min-width:40px;text-align:center">'+(score>0?score:'—')+'</span></td>'+
      '<td style="white-space:nowrap;text-align:right">'+
        '<button class="btn btn-sm" onclick="researchOpenEdit(\''+c.id+'\')" title="Bearbeiten" style="padding:4px 8px;font-size:11px;background:var(--s2);color:var(--tx);border:1px solid var(--bd)">✏️</button> '+
        '<button class="btn btn-sm" onclick="researchPromoteToProduct(\''+c.id+'\')" title="In den Bereich Produkte übernehmen" style="padding:4px 9px;font-size:11px;background:var(--gnd);color:var(--gn);border:1px solid var(--gn);font-weight:700">★ Produkt</button> '+
        '<button class="btn btn-sm" onclick="researchOpenScore(\''+c.id+'\')" title="Score-Matrix" style="padding:4px 8px;font-size:11px;background:var(--acd);color:var(--ac);border:1px solid var(--ac)">⚖️</button> '+
        '<button class="btn btn-sm" onclick="researchOpenWorkflow(\''+c.id+'\')" title="20-Schritte-Workflow" style="padding:4px 8px;font-size:11px;background:var(--pud);color:var(--pu);border:1px solid var(--pu)">📋</button> '+
        '<button class="btn btn-sm" onclick="researchDeleteCandidate(\''+c.id+'\')" title="Löschen" style="padding:4px 8px;font-size:11px;background:var(--rdd);color:var(--rd);border:1px solid var(--rd)">🗑</button>'+
      '</td>'+
    '</tr>';
  });
  tbody.innerHTML=html;

  // ── Auswahl-Leiste (erscheint bei markierten Zeilen) + „Alle"-Checkbox im Kopf ──
  var selCount=Object.keys(researchSel).length;
  var allCb=document.getElementById('researchSelAllCb');
  if(allCb){allCb.checked=selCount>0&&selCount>=researchTableAllIds.length;allCb.indeterminate=selCount>0&&selCount<researchTableAllIds.length;}
  var bulk=document.getElementById('researchBulkBar');
  if(bulk){
    bulk.innerHTML=selCount>0
      ?'<div style="display:flex;gap:10px;align-items:center;background:var(--acd);border:1.5px solid var(--ac);border-radius:10px;padding:9px 14px;margin-bottom:10px;flex-wrap:wrap">'+
        '<b style="font-size:13px;color:var(--ac)">'+selCount+' markiert</b>'+
        '<button class="btn btn-sm" onclick="researchDeleteSelected()" style="background:var(--rd);color:#fff;border:none;font-weight:700;font-size:12px">🗑 Markierte löschen</button>'+
        '<button class="btn btn-sm" onclick="researchSelAll(true)" style="font-size:12px">Alle '+researchTableAllIds.length+' markieren</button>'+
        '<button class="btn btn-sm" onclick="researchSelAll(false)" style="font-size:12px">Auswahl aufheben</button>'+
      '</div>':'';
  }

  // ── Blätter-Leiste unter der Tabelle ──
  var pager=document.getElementById('researchTablePager');
  if(pager){
    if(totalPages<=1){pager.innerHTML='<div style="font-size:11px;color:var(--tx3);text-align:center;padding:8px">'+candsAll+' Kandidat'+(candsAll===1?'':'en')+'</div>';}
    else{
      function rpb(label,page,on,dis){
        if(dis)return '<span style="padding:7px 12px;color:var(--tx3);font-size:12px">'+label+'</span>';
        return '<button onclick="researchTableGoPage('+page+')" style="border:1.5px solid '+(on?'var(--ac)':'var(--bd)')+';background:'+(on?'var(--ac)':'var(--s1)')+';color:'+(on?'#fff':'var(--tx2)')+';font-weight:700;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;font-family:inherit;min-width:34px">'+label+'</button>';
      }
      var ph='<div style="display:flex;gap:5px;justify-content:center;align-items:center;padding:12px 0 4px;flex-wrap:wrap">';
      ph+=rpb('‹',researchTablePage-1,false,researchTablePage===1);
      for(var pi=1;pi<=totalPages;pi++)ph+=rpb(pi,pi,pi===researchTablePage,false);
      ph+=rpb('›',researchTablePage+1,false,researchTablePage===totalPages);
      ph+='</div><div style="font-size:11px;color:var(--tx3);text-align:center;padding-bottom:6px">Seite '+researchTablePage+' von '+totalPages+' · '+candsAll+' Kandidaten · sortiert nach '+(sortMode==='neu'?'Neueste':sortMode==='vk'?'VK':sortMode==='reviews'?'wenigsten Reviews':'Score')+'</div>';
      pager.innerHTML=ph;
    }
  }
}

function researchUpdateField(id,field,value){
  researchInit();
  var c=D.research.candidates.find(function(x){return x.id===id});
  if(!c)return;
  // Coerce numeric fields
  if(['vk','top10Umsatz','avgReviews','ek','fbaGebuehren','nettoMarge','gewicht','startMenge'].indexOf(field)>-1){
    var num=parseFloat(value);
    c[field]=isNaN(num)?null:num;
  }else{
    c[field]=value;
  }
  c.updatedAt=new Date().toISOString();
  // Recompute score if relevant
  c.computedScore=researchCalcScore(c);
  save();
  // Stats/Badge bei Status-Änderung
  if(field==='status'){researchRenderStatsBar();researchUpdateBadge();}
  // Score-relevante Felder → Tabelle neu rendern (aktualisiert Score-Badge)
  if(['avgReviews','nettoMarge','konkurrenz','risiko','ppcRisiko','differenzierung','status','vk','gewicht','saisonal','gating','ipRisiko','ek','fbaGebuehren','startMenge','top10Umsatz'].indexOf(field)>-1){
    researchRenderTable();
    if(typeof renderPipeline==='function'&&document.getElementById('pipelineBoard'))renderPipeline();
  }
}

// ── Produkt-Detail bearbeiten (Klick auf Name in der Konkurrenz-Tabelle) ──
function researchCloseEdit(){
  var o=document.getElementById('researchEditOverlay');
  if(o&&o.parentNode)o.parentNode.removeChild(o);
  var pg=document.getElementById('p-research');
  if(pg&&pg.classList.contains('active')&&typeof researchRenderTable==='function')researchRenderTable();
}
function researchUpdateUsps(id,val){
  researchInit();
  var c=D.research.candidates.find(function(x){return x.id===id;});if(!c)return;
  c.compUsps=(val||'').split(/\r?\n/).map(function(s){return s.trim();}).filter(Boolean).slice(0,8);
  c.updatedAt=new Date().toISOString();save();
}
function researchOpenEdit(id){
  researchInit();
  var c=D.research.candidates.find(function(x){return x.id===id;});if(!c){toast('Eintrag nicht gefunden');return;}
  researchCloseEdit();
  var IN='width:100%;box-sizing:border-box;background:var(--s1);border:1.5px solid var(--bd);border-radius:8px;padding:9px 11px;font-family:inherit;font-size:13px;color:var(--tx);outline:none';
  var LBL='display:block;font-size:11px;font-weight:700;color:var(--tx2);text-transform:uppercase;letter-spacing:.5px;margin:0 0 4px';
  var risk=[['','—'],['niedrig','niedrig'],['mittel','mittel'],['hoch','hoch']];
  var statusOpts=[['recherche','🔍 In Recherche'],['kandidat','⭐ Kandidat'],['muster','📦 Muster bestellt'],['aktiv','🚀 Aktiv'],['abgelehnt','❌ Abgelehnt']];
  function badge(src){
    if(src==='auto')return ' <span style="background:var(--gnd);color:var(--gn);font-size:9px;font-weight:700;padding:1px 6px;border-radius:6px;letter-spacing:0">AUTO</span>';
    if(src==='calc')return ' <span style="background:var(--acd);color:var(--ac);font-size:9px;font-weight:700;padding:1px 6px;border-radius:6px;letter-spacing:0">BERECHNET</span>';
    if(src==='self')return ' <span style="background:var(--s3);color:var(--tx2);font-size:9px;font-weight:700;padding:1px 6px;border-radius:6px;letter-spacing:0">DU</span>';
    return '';
  }
  function field(label,inner,hint,src){return '<div style="margin-bottom:12px"><label style="'+LBL+'">'+label+badge(src)+'</label>'+inner+(hint?'<div style="font-size:10.5px;color:var(--tx3);margin-top:3px">'+hint+'</div>':'')+'</div>';}
  function inp(f,val,type,extra){return '<input type="'+(type||'text')+'" value="'+esc(val!=null?String(val):'')+'" onchange="researchUpdateField(\''+id+'\',\''+f+'\',this.value)" style="'+IN+(extra||'')+'">';}
  function selF(f,curVal,opts){return '<select onchange="researchUpdateField(\''+id+'\',\''+f+'\',this.value)" style="'+IN+'">'+opts.map(function(o){return '<option value="'+o[0]+'"'+(curVal===o[0]?' selected':'')+'>'+o[1]+'</option>';}).join('')+'</select>';}
  var score=researchCalcScore(c);var scc=score>=70?'gn':score>=50?'ac':score>0?'rd':'tx3';
  var imgs=(c.compImages||[]).slice(0,9).map(function(u){return '<img src="'+esc(u)+'" class="pzoom" style="width:48px;height:48px;object-fit:cover;border-radius:6px;border:1px solid var(--bd)" loading="lazy">';}).join('');
  var ov=document.createElement('div');ov.id='researchEditOverlay';
  ov.style.cssText='position:fixed;inset:0;background:rgba(15,23,41,.55);display:flex;align-items:flex-start;justify-content:center;z-index:99999;padding:30px 16px;overflow-y:auto;backdrop-filter:blur(2px)';
  ov.onclick=function(e){if(e.target===ov)researchCloseEdit();};
  var h='<div style="background:var(--s1);border:1px solid var(--bd);border-radius:16px;width:min(720px,100%);box-shadow:0 20px 60px rgba(0,0,0,.35)">';
  h+='<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:18px 22px;border-bottom:1px solid var(--bd)">';
  h+='<div style="font-weight:800;font-size:17px;color:var(--tx)">✏️ Produkt bearbeiten</div>';
  h+='<div style="display:flex;align-items:center;gap:10px"><span style="display:inline-block;padding:4px 11px;background:var(--'+scc+'d);color:var(--'+scc+');border-radius:10px;font-weight:700;font-size:13px">Score '+(score>0?score:'—')+'</span><button onclick="researchCloseEdit()" style="background:none;border:none;font-size:22px;color:var(--tx2);cursor:pointer;line-height:1">✕</button></div>';
  h+='</div>';
  h+='<div style="padding:20px 22px;max-height:68vh;overflow-y:auto">';
  h+='<div style="display:flex;gap:12px;flex-wrap:wrap;font-size:10.5px;color:var(--tx3);margin-bottom:14px;padding-bottom:12px;border-bottom:1px dashed var(--bd)"><span><b style="color:var(--gn)">AUTO</b> = aus dem Listing geladen</span><span><b style="color:var(--ac)">BERECHNET</b> = aus deinen Zahlen</span><span><b style="color:var(--tx2)">DU</b> = selbst eintragen (Helium 10 / Lieferant / Einschätzung)</span></div>';
  h+=field('Produktname',inp('name',c.name,'text'),'Aus dem Konkurrenz-Listing.','auto');
  h+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'+field('Kategorie',inp('kategorie',c.kategorie,'text'),'Automatisch (oberste Amazon-Kategorie) – verfeinerbar.','auto')+field('Hauptkeyword',inp('hauptkeyword',c.hauptkeyword,'text'),'Aus Helium 10 Cerebro / Black Box.','self')+'</div>';
  h+='<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px">'+field('VK €',inp('vk',c.vk,'number',';text-align:right'),'Konkurrenz-Preis, automatisch.','auto')+field('EK €',inp('ek',c.ek,'number',';text-align:right'),'Einkaufspreis beim Lieferanten.','self')+field('FBA-Geb. €',inp('fbaGebuehren',c.fbaGebuehren,'number',';text-align:right'),'Je Stück – aus dem Gebühren-Center.','self')+field('Marge %',inp('nettoMarge',c.nettoMarge,'number',';text-align:right'),'Leer = auto: (VK − EK − FBA) / VK.','calc')+'</div>';
  h+='<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">'+field('Top-10 Umsatz €',inp('top10Umsatz',c.top10Umsatz,'number',';text-align:right'),'Aus Helium 10 Xray.','self')+field('⌀ Reviews',inp('avgReviews',c.avgReviews,'number',';text-align:right'),'Bewertungsanzahl, automatisch.','auto')+field('Startmenge Stk',inp('startMenge',c.startMenge,'number',';text-align:right'),'Für den Kapitalbedarf (leer = 500).','self')+'</div>';
  h+='<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">'+field('Konkurrenz',selF('konkurrenz',c.konkurrenz||'',risk),'Deine Einschätzung.','self')+field('PPC-Risiko',selF('ppcRisiko',c.ppcRisiko||'',risk),'Deine Einschätzung.','self')+field('Risiko',selF('risiko',c.risiko||'',risk),'Deine Einschätzung.','self')+'</div>';
  var jn=[['','—'],['nein','nein'],['ja','ja']];
  h+='<div style="margin:2px 0 10px;font-size:11px;font-weight:700;color:var(--tx2);text-transform:uppercase;letter-spacing:.5px">⚠️ Red-Flag-Check</div>';
  h+='<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px">'+
    field('Gewicht kg',inp('gewicht',c.gewicht,'number',';text-align:right'),'>2 kg = teurer, >5 kg = Sperrgut.','self')+
    field('Saisonal?',selF('saisonal',c.saisonal||'',jn),'Nur zu bestimmten Zeiten gefragt?','self')+
    field('Gating?',selF('gating',c.gating||'',jn),'Amazon-Freischaltung nötig?','self')+
    field('IP-Risiko?',selF('ipRisiko',c.ipRisiko||'',jn),'Marke/Patent/Design geschützt?','self')+
  '</div>';
  var cfE=complianceFor(c);
  h+='<div style="margin:2px 0 8px;font-size:11px;font-weight:700;color:var(--tx2);text-transform:uppercase;letter-spacing:.5px">🧾 Compliance-Check Deutschland <span id="compCount_'+id+'" style="background:'+(cfE.done>=cfE.total?'var(--gnd);color:var(--gn)':'var(--s3);color:var(--tx2)')+';border-radius:8px;padding:1px 8px;letter-spacing:0;text-transform:none;font-weight:700">'+cfE.done+' / '+cfE.total+' erledigt</span></div>';
  h+='<div style="background:var(--s2);border:1px solid var(--bd);border-radius:10px;padding:8px 14px;margin-bottom:12px">'+complianceHtml(c,false)+'</div>';
  h+=field('Status (Pipeline)',selF('status',normalizeStatus(c.status),statusOpts));
  h+=field('Differenzierung (warum besser?)','<textarea onchange="researchUpdateField(\''+id+'\',\'differenzierung\',this.value)" style="'+IN+';min-height:60px;resize:vertical">'+esc(c.differenzierung||'')+'</textarea>','Wird bei „🏆 besser vermarkten" teils automatisch befüllt.','');
  h+=field('USPs (eine pro Zeile)','<textarea onchange="researchUpdateUsps(\''+id+'\',this.value)" placeholder="z. B. Edelstahl rostfrei&#10;Ohne Bohren montierbar" style="'+IN+';min-height:80px;resize:vertical">'+esc((c.compUsps||[]).join('\n'))+'</textarea>','Aus dem Konkurrenz-Listing.','auto');
  h+=field('Notizen','<textarea onchange="researchUpdateField(\''+id+'\',\'notes\',this.value)" style="'+IN+';min-height:60px;resize:vertical">'+esc(c.notes||'')+'</textarea>');
  if(c.compAsin||imgs){h+='<div style="margin-top:6px;padding-top:12px;border-top:1px dashed var(--bd)">';if(c.compAsin)h+='<div style="font-size:11px;color:var(--tx3);margin-bottom:6px">Konkurrenz-ASIN: <b>'+esc(c.compAsin)+'</b></div>';if(imgs)h+='<div style="display:flex;gap:5px;flex-wrap:wrap">'+imgs+'</div>';h+='</div>';}
  h+='</div>';
  h+='<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;padding:14px 22px;border-top:1px solid var(--bd)">';
  h+='<button class="btn btn-sm" onclick="sourcingOpen(\''+id+'\')" style="background:var(--s2);color:var(--tx);border:1px solid var(--bd)" title="Fertige englische Lieferanten-Anfrage (inkl. Zertifikat-Liste) generieren">🏭 Lieferanten-Anfrage</button>';
  h+='<button class="btn btn-sm" onclick="researchCloseEdit();researchOpenScore(\''+id+'\')" style="background:var(--acd);color:var(--ac);border:1px solid var(--ac)">⚖️ Scorecard</button>';
  h+='<button class="btn btn-sm" onclick="researchCloseEdit();researchOpenWorkflow(\''+id+'\')" style="background:var(--pud);color:var(--pu);border:1px solid var(--pu)">📋 Workflow</button>';
  h+='<button class="btn btn-sm" onclick="researchCloseEdit();researchPromoteToProduct(\''+id+'\')" style="background:var(--gn);color:#fff;border:none;font-weight:700">★ Als Produkt übernehmen</button>';
  h+='<button class="btn btn-p" onclick="researchCloseEdit()">✓ Fertig</button>';
  h+='</div></div>';
  ov.innerHTML=h;
  document.body.appendChild(ov);
}

function researchDeleteCandidate(id){
  researchInit();
  var c=D.research.candidates.find(function(x){return x.id===id});
  if(!c)return;
  if(!confirm('Kandidat „'+c.name+'" wirklich löschen?\n\nAlle zugehörigen Workflow-Notizen und Bewertungen gehen verloren.'))return;
  D.research.candidates=D.research.candidates.filter(function(x){return x.id!==id});
  if(D.research.workflowState[id])delete D.research.workflowState[id];
  save();
  researchRenderTable();
  researchUpdateBadge();
  toast('Kandidat gelöscht');
}

// Score-Berechnung (entweder aus Matrix oder grobe Heuristik aus Tabellen-Feldern)
function researchCalcScore(c){
  // Gewichteter Score über die Dimensionen, die einen Wert haben (manuell oder Auto)
  var sum=0,wsum=0;
  DECISION_DIMS.forEach(function(d){
    var v=decisionEff(c,d.key);
    if(typeof v==='number'&&v>0){sum+=v*d.weight;wsum+=d.weight;}
  });
  if(wsum>0)return Math.round(sum/wsum*10); // 1-10 → 1-100
  return 0;
}

// ═══════════════════════════════════════════════════════════════
// TAB 2: WORKFLOW-TRACKER
// ═══════════════════════════════════════════════════════════════

function researchOpenWorkflow(id){
  researchSelectedCandidate=id;
  researchShowTab('workflow');
}

// ═══ PRÜFPLAN (ehem. Workflow-Tracker): Status kommt AUS DEN DATEN, nicht aus Häkchen ═══
// Je Kandidat: was fehlt noch für eine belastbare Entscheidung? Jeder offene Punkt
// verlinkt direkt aufs richtige Werkzeug. Einzig „Dossier geprüft" ist manuell.
function pruefplanFor(c){
  var vd=decisionVerdict(c),rcf=decisionConfidence(c),cf=complianceFor(c),mm=decisionMarge(c);
  var eid=c.id;
  var items=[
    {phase:'📥 Daten holen',color:'pu',label:'Marktdaten vorhanden (Umsatz/Reviews aus Helium, Xray oder Scan)',done:(c.top10Umsatz!=null||c.avgReviews!=null||!!c.nischenScan),tool:'⚡ Xray-Paste',act:"if(typeof xrayPasteOpen==='function')xrayPasteOpen()"},
    {phase:'📥 Daten holen',color:'pu',label:'Konkurrenz-Referenz verknüpft (ASIN + Bilder)',done:!!c.compAsin,tool:'✏️ Editor',act:"pipelineEditCand('"+eid+"')"},
    {phase:'🧭 Markt prüfen',color:'bl',label:'Wettbewerb bewertet (⌀ Reviews der Top-10)',done:decisionEff(c,'wettbewerb')!=null,tool:'🔍 Nischen-Scan',act:"nischenScanOpen('"+eid+"')"},
    {phase:'🧭 Markt prüfen',color:'bl',label:'Differenzierung erarbeitet (Review-Mining / eigenes Konzept)',done:(!!c.reviewMining||((c.differenzierung||'').trim().length>5)),tool:'🔬 Review-Mining',act:"reviewMiningOpen('"+eid+"')"},
    {phase:'🧮 Kalkulieren',color:'ac',label:'Einkaufspreis liegt vor (Lieferant angefragt)',done:(c.ek!=null&&c.ek>0),tool:'🏭 Lieferanten-Anfrage',act:"sourcingOpen('"+eid+"')"},
    {phase:'🧮 Kalkulieren',color:'ac',label:'Netto-Marge berechnet (VK − EK − FBA)',done:mm.val!=null,tool:'✏️ Daten eintragen',act:"pipelineEditCand('"+eid+"')"},
    {phase:'🧮 Kalkulieren',color:'ac',label:'Startbudget geklärt (Startmenge × EK)',done:(c.ek!=null&&c.ek>0&&c.startMenge!=null&&c.startMenge>0),tool:'✏️ Startmenge',act:"pipelineEditCand('"+eid+"')"},
    {phase:'⚖️ Entscheiden',color:'gn',label:'Risiko-Felder geprüft (Gewicht, Saison, Gating, IP)',done:!!(c.risiko||c.gewicht!=null||c.saisonal||c.gating||c.ipRisiko),tool:'✏️ Red-Flag-Check',act:"pipelineEditCand('"+eid+"')"},
    {phase:'⚖️ Entscheiden',color:'gn',label:'Compliance: kritische DE-Pflichten abgehakt',done:(cf.hardOpen===0&&cf.total>0&&(c.compliance&&Object.keys(c.compliance).length>0)),tool:'🧾 Compliance-Check',act:"pipelineEditCand('"+eid+"')"},
    {phase:'⚖️ Entscheiden',color:'gn',label:'Scorecard-Urteil steht (≥ 4 Dimensionen mit Basis)',done:(vd.score>0&&(rcf.data+rcf.manual)>=4),tool:'⚖️ Scorecard',act:"researchOpenScore('"+eid+"')"},
    {phase:'⚖️ Entscheiden',color:'gn',label:'Dossier erstellt und kritisch gelesen',done:!!c.pruefplanDossier,tool:'📄 Dossier',act:"dossierOpen('"+eid+"')",manual:true}
  ];
  var done=items.filter(function(i){return i.done;}).length;
  return {items:items,done:done,total:items.length,pct:Math.round(done/items.length*100)};
}
function pruefplanDossierToggle(candId,on){
  researchInit();
  var c=D.research.candidates.find(function(x){return x.id===candId;});if(!c)return;
  c.pruefplanDossier=!!on;c.updatedAt=new Date().toISOString();save();
  researchRenderWorkflow();
}
window.pruefplanDossierToggle=pruefplanDossierToggle;

function researchRenderWorkflow(){
  researchInit();
  var container=document.getElementById('researchWorkflowContent');
  if(!container)return;
  var cands=D.research.candidates;

  // ── Kein Kandidat gewählt: Übersicht mit Auto-Fortschritt (Top 20 nach Fortschritt) ──
  if(!researchSelectedCandidate||!cands.find(function(c){return c.id===researchSelectedCandidate})){
    if(cands.length===0){
      container.innerHTML='<div style="background:var(--s1);border:1px solid var(--bd);border-radius:12px;padding:50px 30px;text-align:center;color:var(--tx2)"><div style="font-size:48px;margin-bottom:14px">✅</div><div style="font-weight:700;color:var(--tx);margin-bottom:6px;font-size:16px">Noch keine Kandidaten</div><div style="font-size:13px;margin-bottom:18px">Importiere Produkte oder lege einen Kandidaten an — der Prüfplan zeigt dir dann automatisch, was bis zur Entscheidung noch fehlt.</div><button class="btn btn-p" onclick="researchShowTab(\'overview\')">← Zur Master-Tabelle</button></div>';
      return;
    }
    var h=helpBox('✅','Prüfplan: Was fehlt noch bis zur Entscheidung?','Der Prüfplan füllt sich <b>automatisch aus deinen Daten</b> — kein Abhaken von Hand. Jeder offene Punkt hat einen Knopf direkt zum passenden Werkzeug (Xray-Paste, Nischen-Scan, Review-Mining, Lieferanten-Anfrage, Compliance …). Ziel: <b>alle Punkte grün → Entscheidung ist belastbar.</b>',{variant:'purple'});
    var list=cands.slice().map(function(c){return {c:c,pp:pruefplanFor(c)};}).sort(function(a,b){return b.pp.pct-a.pp.pct||new Date(b.c.updatedAt||0)-new Date(a.c.updatedAt||0);}).slice(0,20);
    h+='<div style="background:var(--s1);border:1px solid var(--bd);border-radius:12px;padding:20px 22px"><h3 style="margin:0 0 4px 0">Kandidat wählen</h3><div style="color:var(--tx2);font-size:12px;margin-bottom:14px">Sortiert nach Prüf-Fortschritt — die 20 am weitesten geprüften zuerst. Alle anderen erreichst du über die Master-Tabelle (📋-Aktion).</div><div style="display:flex;flex-direction:column;gap:8px">';
    list.forEach(function(x){
      var c=x.c,pp=x.pp;
      var pimg=(c.compImages&&c.compImages[0])||'';
      var pthumb=pimg?'<img src="'+esc(pimg)+'" loading="lazy" class="pzoom" style="width:36px;height:36px;object-fit:cover;border-radius:7px;border:1px solid var(--bd);flex-shrink:0;background:#fff" onerror="this.style.display=\'none\'">':'<div style="width:36px;height:36px;border-radius:7px;background:var(--s2);border:1px solid var(--bd);display:flex;align-items:center;justify-content:center;flex-shrink:0">📦</div>';
      var pcol=pp.pct>=80?'gn':pp.pct>=40?'ac':'tx3';
      h+='<div onclick="researchOpenWorkflow(\''+c.id+'\')" style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:var(--s2);border:1px solid var(--bd);border-radius:10px;cursor:pointer" onmouseover="this.style.transform=\'translateX(3px)\'" onmouseout="this.style.transform=\'\'">'+pthumb+
        '<div style="flex:1;min-width:0"><div style="font-weight:700;color:var(--tx);font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(c.name)+'</div>'+
        '<div style="display:flex;align-items:center;gap:8px;margin-top:4px"><div style="flex:1;height:6px;background:var(--s3);border-radius:4px;overflow:hidden;max-width:220px"><div style="height:100%;width:'+pp.pct+'%;background:var(--'+pcol+')"></div></div><span style="font-size:11px;color:var(--'+pcol+');font-weight:700">'+pp.done+' / '+pp.total+'</span></div></div>'+
        '<span style="font-size:16px;color:var(--pu)">→</span></div>';
    });
    h+='</div></div>';
    container.innerHTML=h;
    return;
  }

  // ── Prüfplan des gewählten Kandidaten ──
  var c=cands.find(function(x){return x.id===researchSelectedCandidate});
  var pp=pruefplanFor(c);
  var vd=decisionVerdict(c);
  var himg=(c.compImages&&c.compImages[0])||'';
  var html='';
  html+='<div style="background:linear-gradient(135deg,var(--pud),var(--s2));border:1px solid var(--pu);border-radius:12px;padding:18px 22px;margin-bottom:18px">'+
    '<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">'+
      '<button class="btn btn-sm" onclick="researchSelectedCandidate=null;researchRenderWorkflow()" style="font-size:11px">← Andere Kandidaten</button>'+
      (himg?'<img src="'+esc(himg)+'" class="pzoom" style="width:46px;height:46px;object-fit:cover;border-radius:10px;border:1px solid var(--bd);background:#fff">':'')+
      '<div style="flex:1;min-width:200px"><div style="font-family:\'Playfair Display\',serif;font-size:20px;color:var(--tx);font-weight:700">'+esc(c.name)+'</div><div style="font-size:12px;color:var(--tx2)">'+(c.kategorie?esc(c.kategorie)+' · ':'')+'Score '+(vd.score>0?vd.score:'—')+' · '+vd.label+'</div></div>'+
      '<button class="btn btn-sm" onclick="researchOpenScore(\''+c.id+'\')" style="background:var(--acd);color:var(--ac);border:1px solid var(--ac);font-size:11px">⚖️ Scorecard</button>'+
    '</div>'+
    '<div style="margin-top:14px"><div style="height:9px;background:var(--s3);border-radius:5px;overflow:hidden"><div style="height:100%;width:'+pp.pct+'%;background:linear-gradient(90deg,var(--pu),var(--gn));transition:width .3s"></div></div>'+
    '<div style="font-size:12px;color:var(--tx2);margin-top:5px;font-weight:600">'+pp.done+' von '+pp.total+' Prüf-Punkten erfüllt'+(pp.done===pp.total?' — Entscheidung ist belastbar 🎉':' — offene Punkte unten direkt erledigen')+'</div></div>'+
  '</div>';
  var lastPhase='';
  pp.items.forEach(function(it){
    if(it.phase!==lastPhase){
      lastPhase=it.phase;
      html+='<div style="font-size:12px;font-weight:800;color:var(--'+it.color+');text-transform:uppercase;letter-spacing:1.5px;margin:16px 0 8px">'+it.phase+'</div>';
    }
    html+='<div style="display:flex;align-items:center;gap:12px;background:'+(it.done?'var(--gnd)':'var(--s1)')+';border:1px solid '+(it.done?'var(--gn)':'var(--bd)')+';border-radius:10px;padding:11px 16px;margin-bottom:8px">'+
      (it.manual
        ?'<input type="checkbox" '+(it.done?'checked':'')+' onchange="pruefplanDossierToggle(\''+c.id+'\',this.checked)" style="width:19px;height:19px;accent-color:var(--gn);cursor:pointer;flex-shrink:0" title="Manuell bestätigen">'
        :'<span style="font-size:17px;flex-shrink:0" title="'+(it.done?'Automatisch erkannt: erledigt':'Automatisch erkannt: offen')+'">'+(it.done?'✅':'⬜️')+'</span>')+
      '<div style="flex:1;min-width:0;font-size:13px;font-weight:600;color:'+(it.done?'var(--tx2)':'var(--tx)')+'">'+it.label+(it.manual?'':' <span style="font-size:9.5px;color:var(--tx3);font-weight:700;background:var(--s2);border-radius:6px;padding:1px 6px;vertical-align:1px">AUTO</span>')+'</div>'+
      (it.done?'':'<button class="btn btn-sm" onclick="'+it.act.replace(/"/g,'&quot;')+'" style="font-size:11px;background:var(--'+it.color+'d);color:var(--'+it.color+');border:1px solid var(--'+it.color+');font-weight:700;white-space:nowrap">'+it.tool+' →</button>')+
    '</div>';
  });
  html+='<div style="font-size:11px;color:var(--tx3);margin-top:10px">AUTO-Punkte erkennen sich selbst aus deinen Daten — nur „Dossier geprüft" bestätigst du bewusst von Hand.</div>';
  container.innerHTML=html;
}

function researchToggleStep(candId,stepNum,checked){
  researchInit();
  if(!D.research.workflowState[candId])D.research.workflowState[candId]={steps:{},stepNotes:{}};
  if(!D.research.workflowState[candId].steps)D.research.workflowState[candId].steps={};
  if(checked){
    D.research.workflowState[candId].steps[stepNum]=new Date().toISOString();
  }else{
    delete D.research.workflowState[candId].steps[stepNum];
  }
  // Auto-update currentStep: highest done +1, or first undone
  var c=D.research.candidates.find(function(x){return x.id===candId});
  if(c){
    var doneSteps=Object.keys(D.research.workflowState[candId].steps).filter(function(k){return D.research.workflowState[candId].steps[k]}).map(Number);
    if(doneSteps.length>0){
      var maxDone=Math.max.apply(null,doneSteps);
      c.currentStep=Math.min(20,maxDone+1);
    }
    c.updatedAt=new Date().toISOString();
  }
  save();
  researchRenderWorkflow();
}

function researchUpdateStepNote(candId,stepNum,note){
  researchInit();
  if(!D.research.workflowState[candId])D.research.workflowState[candId]={steps:{},stepNotes:{}};
  if(!D.research.workflowState[candId].stepNotes)D.research.workflowState[candId].stepNotes={};
  D.research.workflowState[candId].stepNotes[stepNum]=note;
  var c=D.research.candidates.find(function(x){return x.id===candId});
  if(c)c.updatedAt=new Date().toISOString();
  save();
}

function researchSetCurrentStep(candId,stepNum){
  researchInit();
  var c=D.research.candidates.find(function(x){return x.id===candId});
  if(!c)return;
  c.currentStep=stepNum;
  c.updatedAt=new Date().toISOString();
  save();
  researchRenderWorkflow();
}

function researchOpenLesson(lessonId,moduleId){
  moduleId=moduleId||'recherche_prozess';
  if(typeof go_lesson==='function'){
    go('coaching');
    setTimeout(function(){go_lesson(moduleId,lessonId);},80);
  }else{
    go('coaching');
  }
}

// ═══════════════════════════════════════════════════════════════
// TAB 3: SCORE-MATRIX
// ═══════════════════════════════════════════════════════════════

function researchOpenScore(id){
  researchSelectedCandidate=id;
  researchShowTab('score');
}

var researchRankPage=1;
function researchRankGoPage(p){
  researchRankPage=p;researchRenderScore();
  var el=document.getElementById('researchScoreContent');if(el)el.scrollIntoView({behavior:'smooth',block:'start'});
}
window.researchRankGoPage=researchRankGoPage;
function researchRenderScore(){
  researchInit();
  var container=document.getElementById('researchScoreContent');
  if(!container)return;
  var cands=D.research.candidates;

  if(cands.length===0){
    container.innerHTML='<div style="background:var(--s1);border:1px solid var(--bd);border-radius:12px;padding:50px 30px;text-align:center;color:var(--tx2)"><div style="font-size:48px;margin-bottom:14px">⚖️</div><div style="font-weight:700;color:var(--tx);margin-bottom:6px;font-size:16px">Keine Kandidaten zu bewerten</div><div style="font-size:13px;margin-bottom:18px">Lege zuerst Kandidaten in der Master-Tabelle an.</div><button class="btn btn-p" onclick="researchShowTab(\'overview\')">← Zur Master-Tabelle</button></div>';
    return;
  }

  cands.forEach(decisionMigrate);

  var html='';

  html+=helpBox('⚖️','Entscheidungs-Scorecard – ein Urteil','<b>6 gewichtete Dimensionen</b> (Nachfrage 25 % · Wettbewerb 25 % · Wirtschaftlichkeit 20 % · Differenzierung 15 % · Risiko 10 % · Kapital 5 %) → Score 0–100 + Ampel <b>🟢 GO / 🟡 PRÜFEN / 🔴 NO-GO</b>. Wo Daten vorliegen, wird automatisch geschätzt – per Regler überschreibbar. <b>Rote Flags</b> (Preis&lt;15 €, &gt;2.000 Reviews, Marge&lt;15 %) verhindern ein GO. Die <b>Daten-Konfidenz</b> zeigt, auf wie vielen <b>echten Datenpunkten</b> das Urteil beruht (⚙️ Daten · ✏️ manuell · – offen) – einem GO auf reinem Bauchgefühl nicht trauen.',{variant:'gold',lessonId:'rp_6'});

  var selected=researchSelectedCandidate?cands.find(function(c){return c.id===researchSelectedCandidate}):null;

  if(!selected){
    html+='<div style="background:var(--s1);border:1px dashed var(--bd2);border-radius:12px;padding:18px 22px;margin-bottom:18px;color:var(--tx2);font-size:13px">⬇️ Wähle unten einen Kandidaten, um sein Entscheidungs-Scorecard zu öffnen.</div>';
  }else{
    var vd=decisionVerdict(selected);
    var col=vd.color;
    var emoji=vd.verdict==='go'?'🟢':vd.verdict==='nogo'?'🔴':vd.verdict==='pruefen'?'🟡':'⚪';
    html+='<div style="background:linear-gradient(135deg,var(--'+col+'d),var(--s2));border:1.5px solid var(--'+col+');border-radius:12px;padding:18px 22px;margin-bottom:18px">';
    // Kopf: Name + großer Score + Urteil
    html+='<div style="display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:14px">'+
      '<div style="min-width:0"><div style="font-family:\'Playfair Display\',serif;font-size:20px;color:var(--tx);font-weight:700">'+esc(selected.name)+'</div><div style="font-size:11px;color:var(--tx2);margin-top:2px">'+vd.rated+'/'+vd.total+' Dimensionen bewertet</div></div>'+
      '<div style="display:flex;align-items:center;gap:16px">'+
        '<div style="text-align:center"><div style="font-size:40px;font-weight:800;color:var(--'+col+');line-height:1">'+(vd.score>0?vd.score:'—')+'</div><div style="font-size:10px;color:var(--tx3);text-transform:uppercase;letter-spacing:1px">Score /100</div></div>'+
        '<div style="background:var(--'+col+');color:#fff;font-weight:800;font-size:15px;padding:8px 16px;border-radius:10px;white-space:nowrap">'+emoji+' '+vd.label+'</div>'+
      '</div>'+
    '</div>';
    // Daten-Konfidenz: worauf beruht das Urteil? (Phase 1.2)
    var cf=decisionConfidence(selected);
    var cfIcon={data:'⚙️',manual:'✏️',none:'–'};
    var cfTip={data:'aus echten Daten berechnet',manual:'manuell geschätzt (Regler)',none:'nicht bewertet'};
    html+='<div style="font-size:12.5px;color:var(--tx);background:var(--s1);border:1px solid var(--'+cf.color+');border-radius:8px;padding:9px 12px;margin-bottom:10px">'+
      '<span style="background:var(--'+cf.color+'d);color:var(--'+cf.color+');font-weight:800;font-size:10px;padding:2px 8px;border-radius:8px;text-transform:uppercase;letter-spacing:.5px;margin-right:7px">Daten-Konfidenz '+cf.level+'</span>'+
      (vd.score>0?'<b>'+vd.label+'</b>':'Das Urteil')+' basiert auf <b>'+cf.data+'/'+cf.total+'</b> echten Datenpunkten'+(cf.manual?' · '+cf.manual+' manuell geschätzt':'')+(cf.open?' · '+cf.open+' offen':'')+
      '<div style="margin-top:6px;display:flex;gap:5px;flex-wrap:wrap">'+cf.dims.map(function(x){return '<span title="'+cfTip[x.src]+'" style="font-size:10px;background:var(--s2);border:1px solid var(--bd);border-radius:7px;padding:2px 7px;color:var(--'+(x.src==='data'?'gn':x.src==='manual'?'ac':'tx3')+')">'+cfIcon[x.src]+' '+esc(x.label)+'</span>';}).join('')+'</div>'+
      ((vd.verdict==='go'||vd.verdict==='nogo')&&cf.data<3?'<div style="margin-top:7px;font-size:11.5px;color:var(--rd)">⚠️ Das Urteil beruht kaum auf echten Daten – erst Zahlen nachtragen (📥 Helium-Import, 🔍 Nischen-Scan, 🔬 Review-Mining), dann entscheiden.</div>':'')+
    '</div>';
    // Größter Schwachpunkt
    if(vd.weakest&&vd.score>0){
      html+='<div style="font-size:12.5px;color:var(--tx);background:var(--s1);border:1px solid var(--bd);border-radius:8px;padding:8px 12px;margin-bottom:10px">⚠️ <b>Größter Schwachpunkt:</b> '+esc(vd.weakest.label)+' ('+vd.weakest.val+'/10)</div>';
    }
    // Red Flags
    if(vd.flags.length){
      html+='<div style="margin-bottom:14px;display:flex;flex-direction:column;gap:5px">';
      vd.flags.forEach(function(f){
        html+='<div style="font-size:12px;color:var(--'+(f.hard?'rd':'ac')+');background:var(--'+(f.hard?'rd':'ac')+'d);border:1px solid var(--'+(f.hard?'rd':'ac')+');border-radius:7px;padding:6px 10px">'+(f.hard?'🔴':'🟡')+' '+esc(f.t)+'</div>';
      });
      html+='</div>';
    }
    // Dimensionen
    html+='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px">';
    DECISION_DIMS.forEach(function(d){
      var eff=decisionEff(selected,d.key);
      var a=decisionAuto(selected,d.key);
      var ov=selected.score2&&selected.score2[d.key];
      var manual=typeof ov==='number'&&ov>0;
      var dv=(typeof eff==='number')?eff:0;
      var dcol=eff==null?'tx3':eff>=7?'gn':eff>=4?'ac':'rd';
      var reason=manual?('✏️ manuell gesetzt'+(a.val!=null?' (Auto wäre '+a.val+')':'')):(eff==null?('— '+a.reason):('⚙️ Auto · '+a.reason));
      html+='<div style="background:var(--s1);border:1px solid var(--bd);border-radius:8px;padding:12px 14px">'+
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px"><span style="font-size:12.5px;font-weight:700;color:var(--tx)">'+esc(d.label)+'</span><span style="font-size:10px;background:var(--pud);color:var(--pu);padding:2px 7px;border-radius:8px;font-weight:700">'+d.weight+' %</span></div>'+
        '<div style="font-size:10px;color:var(--tx3);margin-bottom:8px;line-height:1.3">'+esc(d.desc)+'</div>'+
        '<div style="height:8px;background:var(--s2);border-radius:5px;overflow:hidden;margin-bottom:8px"><div id="sc_bar_'+d.key+'" style="height:100%;width:'+(dv*10)+'%;background:var(--'+dcol+')"></div></div>'+
        '<div style="display:flex;align-items:center;gap:10px">'+
          '<input type="range" min="0" max="10" step="1" value="'+(manual?ov:0)+'" oninput="researchUpdateScoreCriterion(\''+selected.id+'\',\''+d.key+'\',this.value)" title="0 = Auto-Wert nutzen, 1–10 = manuell setzen" style="flex:1;accent-color:var(--ac)">'+
          '<span id="sc_val_'+d.key+'" style="font-weight:700;color:var(--'+dcol+');min-width:38px;text-align:right;font-size:14px">'+(eff==null?'–':dv)+' / 10</span>'+
        '</div>'+
        '<div style="font-size:10px;color:var(--tx3);margin-top:5px">'+esc(reason)+'</div>'+
        (d.key==='differenz'?'<button class="btn btn-sm" onclick="reviewMiningOpen(\''+selected.id+'\')" style="margin-top:8px;width:100%;font-size:10.5px;background:var(--pud);color:var(--pu);border:1px solid var(--pu);font-weight:700">🔬 Reviews analysieren'+(selected.reviewMining?' ✓':'')+'</button>':'')+
        (d.key==='wettbewerb'?'<button class="btn btn-sm" onclick="nischenScanOpen(\''+selected.id+'\')" style="margin-top:8px;width:100%;font-size:10.5px;background:var(--acd);color:var(--ac);border:1px solid var(--ac);font-weight:700">🔍 Nischen-Scan'+(selected.nischenScan?' ✓':'')+'</button>':'')+
      '</div>';
    });
    html+='</div>';
    // Footer
    html+='<div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--bd);display:flex;gap:8px;flex-wrap:wrap">'+
      '<button class="btn btn-sm" onclick="dossierOpen(\''+selected.id+'\')" title="Druckfertiger One-Pager: Urteil, Scorecard, Flags, Marge, Review-Insights" style="background:var(--bld);color:var(--bl);border:1px solid var(--bl);font-weight:700;font-size:11px">📄 Dossier</button>'+
      '<button class="btn btn-sm" onclick="researchOpenWorkflow(\''+selected.id+'\')" style="background:var(--pud);color:var(--pu);border:1px solid var(--pu);font-size:11px">📋 Workflow öffnen</button>'+
      (vd.verdict==='go'?'<button class="btn btn-sm" onclick="researchPromoteToProduct(\''+selected.id+'\')" style="background:var(--gnd);color:var(--gn);border:1px solid var(--gn);font-weight:700;font-size:11px">★ In Engere Wahl</button>':'')+
      '<button class="btn btn-sm" onclick="researchResetScore(\''+selected.id+'\')" style="background:var(--s3);color:var(--tx2);font-size:11px">↺ Manuelle Werte zurücksetzen</button>'+
      '<button class="btn btn-sm" onclick="researchSelectedCandidate=null;researchRenderScore()" style="font-size:11px;margin-left:auto">← Übersicht</button>'+
    '</div>';
    html+='</div>';
  }

  // Ranking (blätterbar: 20 je Seite; Rang bleibt global über alle Seiten korrekt)
  var ranked=cands.slice().map(function(c){return {c:c,vd:decisionVerdict(c)}}).sort(function(a,b){return b.vd.score-a.vd.score});
  var RANK_PAGE=20;
  var rankPages=Math.max(1,Math.ceil(ranked.length/RANK_PAGE));
  if(researchRankPage>rankPages)researchRankPage=rankPages;
  var rankSlice=ranked.slice((researchRankPage-1)*RANK_PAGE,researchRankPage*RANK_PAGE);

  html+='<div style="background:var(--s1);border:1px solid var(--bd);border-radius:12px;padding:18px 22px">'+
    '<h3 style="margin:0 0 14px 0">🏆 Ranking aller Kandidaten <span style="font-size:11px;color:var(--tx3);font-weight:400">· '+ranked.length+' gesamt, nach Score</span></h3>'+
    '<div style="display:flex;flex-direction:column;gap:8px">';
  rankSlice.forEach(function(item,i){
    var idx=(researchRankPage-1)*RANK_PAGE+i;
    var c=item.c,vd=item.vd,s=vd.score;
    var cfg=PIPELINE_STATUS[normalizeStatus(c.status)]||PIPELINE_STATUS.idee;
    var emoji=vd.verdict==='go'?'🟢':vd.verdict==='nogo'?'🔴':vd.verdict==='pruefen'?'🟡':'⚪';
    var rcf=decisionConfidence(c);
    var isTop3=idx<3&&s>0;
    // Hauptbild mit Zoom-Hover (pzoom); Bild-Klick → Amazon, Zeilen-Klick → Scorecard
    var rimg=(c.compImages&&c.compImages[0])||'';
    var rthumb=rimg
      ?'<img src="'+esc(rimg)+'" loading="lazy" alt="" class="pzoom" style="width:40px;height:40px;object-fit:cover;border-radius:8px;border:1px solid var(--bd);flex-shrink:0;background:#fff" onerror="this.outerHTML=\'<div style=&quot;width:40px;height:40px;border-radius:8px;background:var(--s2);border:1px solid var(--bd);display:flex;align-items:center;justify-content:center;flex-shrink:0&quot;>📦</div>\'">'
      :'<div style="width:40px;height:40px;border-radius:8px;background:var(--s1);border:1px solid var(--bd);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0" title="Kein Bild vorhanden">📦</div>';
    if(c.compAsin)rthumb='<a href="https://www.amazon.de/dp/'+esc(c.compAsin)+'" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="Auf Amazon öffnen ('+esc(c.compAsin)+')" style="flex-shrink:0;line-height:0">'+rthumb+'</a>';
    html+='<div onclick="researchOpenScore(\''+c.id+'\')" style="display:flex;align-items:center;gap:12px;padding:10px 16px;background:'+(isTop3?'var(--'+vd.color+'d)':'var(--s2)')+';border:1px solid '+(isTop3?'var(--'+vd.color+')':'var(--bd)')+';border-radius:10px;cursor:pointer'+(researchSelectedCandidate===c.id?';box-shadow:0 0 0 2px var(--ac)':'')+'" onmouseover="this.style.transform=\'translateX(3px)\'" onmouseout="this.style.transform=\'\'">'+
      '<div style="font-size:15px;font-weight:800;color:var(--tx3);min-width:34px;text-align:center">#'+(idx+1)+'</div>'+
      rthumb+
      '<div style="flex:1;min-width:0"><div style="font-weight:700;color:var(--tx);font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(c.name)+'</div><div style="font-size:11px;color:var(--tx2);margin-top:2px">'+(c.kategorie?esc(c.kategorie)+' · ':'')+esc(cfg.label)+' · <span style="color:var(--'+rcf.color+')" title="Daten-Konfidenz: '+rcf.data+' von '+rcf.total+' Dimensionen aus echten Daten">⚙️ '+rcf.data+'/'+rcf.total+' Daten</span></div></div>'+
      '<div style="font-size:12px;font-weight:700;color:var(--'+vd.color+');white-space:nowrap">'+emoji+' '+vd.label+'</div>'+
      '<div style="text-align:right;min-width:46px"><div style="font-size:22px;font-weight:800;color:var(--'+vd.color+');line-height:1">'+(s>0?s:'—')+'</div><div style="font-size:10px;color:var(--tx3);text-transform:uppercase;letter-spacing:1px">Score</div></div>'+
    '</div>';
  });
  html+='</div>';
  // Blätter-Leiste
  if(rankPages>1){
    function rkb(label,page,on,dis){
      if(dis)return '<span style="padding:7px 12px;color:var(--tx3);font-size:12px">'+label+'</span>';
      return '<button onclick="researchRankGoPage('+page+')" style="border:1.5px solid '+(on?'var(--ac)':'var(--bd)')+';background:'+(on?'var(--ac)':'var(--s1)')+';color:'+(on?'#fff':'var(--tx2)')+';font-weight:700;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;font-family:inherit;min-width:34px">'+label+'</button>';
    }
    html+='<div style="display:flex;gap:5px;justify-content:center;align-items:center;padding-top:14px;flex-wrap:wrap">'+rkb('‹',researchRankPage-1,false,researchRankPage===1);
    for(var rp=1;rp<=rankPages;rp++)html+=rkb(rp,rp,rp===researchRankPage,false);
    html+=rkb('›',researchRankPage+1,false,researchRankPage===rankPages)+'</div>';
    html+='<div style="font-size:11px;color:var(--tx3);text-align:center;padding-top:6px">Seite '+researchRankPage+' von '+rankPages+' · Bild-Klick öffnet Amazon, Zeilen-Klick die Scorecard</div>';
  }
  html+='</div>';

  // Empfehlung
  var go1=ranked.filter(function(r){return r.vd.verdict==='go';});
  if(go1.length){
    html+='<div style="background:var(--gnd);border:1.5px solid var(--gn);border-radius:12px;padding:16px 22px;margin-top:16px">'+
      '<div style="font-weight:700;color:var(--gn);margin-bottom:6px">💡 Empfehlung</div>'+
      '<div style="font-size:13px;color:var(--tx);line-height:1.6;margin-bottom:8px"><b>'+go1.length+'</b> Kandidat'+(go1.length>1?'en':'')+' mit 🟢 GO – Favorit: <b>'+esc(go1[0].c.name)+'</b> (Score '+go1[0].vd.score+'). Vor dem Geldausgeben die finale kritische Prüfung mit Claude (Workflow-Schritt 17) machen.</div>'+
      '<button class="btn btn-sm" onclick="dossierOpen(\''+go1[0].c.id+'\')" style="background:var(--gn);color:#fff;border:none;font-weight:700;font-size:11px">📄 Entscheidungs-Dossier für „'+esc(go1[0].c.name.substring(0,30))+'" öffnen</button>'+
    '</div>';
  }

  container.innerHTML=html;
}

function researchUpdateScoreCriterion(candId,key,value){
  researchInit();
  var c=D.research.candidates.find(function(x){return x.id===candId});
  if(!c)return;
  if(!c.score2)c.score2={};
  c.score2[key]=parseInt(value,10);
  c.computedScore=researchCalcScore(c);
  c.updatedAt=new Date().toISOString();
  save();
  // Inline-Update (Slider nicht stören), volles Re-Render leicht verzögert für Urteil/Ranking
  var eff=decisionEff(c,key);
  var disp=document.getElementById('sc_val_'+key);if(disp)disp.textContent=(eff==null?'–':eff)+' / 10';
  var bar=document.getElementById('sc_bar_'+key);if(bar)bar.style.width=((eff||0)*10)+'%';
  clearTimeout(window._researchScoreRerender);
  window._researchScoreRerender=setTimeout(researchRenderScore,320);
}

function researchResetScore(id){
  if(!confirm('Manuelle Werte dieses Kandidaten zurücksetzen? (Auto-Schätzung bleibt aktiv)'))return;
  researchInit();
  var c=D.research.candidates.find(function(x){return x.id===id});
  if(!c)return;
  c.score2={};
  c.computedScore=researchCalcScore(c);
  save();
  researchRenderScore();
}

// ═══════════════════════════════════════════════════════════════
// REVIEW-MINING: Konkurrenz-Rezensionen → Differenzierung + Score
// ═══════════════════════════════════════════════════════════════
function reviewMiningOpen(candId){
  researchInit();
  var c=D.research.candidates.find(function(x){return x.id===candId;});
  if(!c){toast('Kandidat nicht gefunden');return;}
  var old=document.getElementById('reviewMiningModal');if(old)old.remove();
  var asin=c.compAsin||'';
  var revUrl=asin?('https://www.amazon.de/product-reviews/'+asin+'/?reviewerType=all_reviews&sortBy=recent'):'';
  var ov=document.createElement('div');
  ov.id='reviewMiningModal';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99997;display:flex;align-items:center;justify-content:center;padding:20px';
  ov.onclick=function(e){if(e.target===ov)ov.remove();};
  ov.innerHTML='<div style="background:var(--s1);border-radius:14px;max-width:700px;width:100%;max-height:90vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.5)">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid var(--bd)"><h2 style="margin:0;font-size:17px">🔬 Review-Mining</h2><button onclick="document.getElementById(\'reviewMiningModal\').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--tx2)">✕</button></div>'+
    '<div style="padding:18px 20px">'+
      '<div style="font-weight:700;color:var(--tx);font-size:14px;margin-bottom:4px">'+esc(c.name)+(asin?' <span style="font-family:monospace;font-size:11px;color:var(--tx2)">'+esc(asin)+'</span>':'')+'</div>'+
      '<div style="font-size:12px;color:var(--tx2);line-height:1.5;margin-bottom:10px">Kopiere die <b>Kundenrezensionen des Konkurrenz-Produkts</b> von Amazon (am besten die kritischen 1–3-Sterne) und füge sie unten ein. Die KI findet die häufigsten Schwächen → daraus deine Differenzierung.'+(revUrl?' <a href="'+revUrl+'" target="_blank" style="color:var(--pu);font-weight:700">Amazon-Reviews öffnen ↗</a>':'')+'</div>'+
      '<textarea id="rmInput" rows="7" placeholder="Rezensionstexte hier einfügen …" style="width:100%;font-family:inherit;font-size:12.5px;padding:10px;border-radius:8px;border:1px solid var(--bd);background:var(--s2);color:var(--tx);resize:vertical;box-sizing:border-box"></textarea>'+
      '<div style="display:flex;gap:8px;margin-top:10px"><button class="btn btn-p" onclick="reviewMiningRun(\''+c.id+'\')">🔬 Analysieren</button></div>'+
      '<div id="rmResult" style="margin-top:14px"></div>'+
    '</div>'+
  '</div>';
  document.body.appendChild(ov);
  if(c.reviewMining){var r=document.getElementById('rmResult');if(r)r.innerHTML=reviewMiningResultHtml(c.reviewMining);}
  setTimeout(function(){var t=document.getElementById('rmInput');if(t)t.focus();},80);
}

function reviewMiningParse(raw){
  if(!raw)return null;
  var s=String(raw);var a=s.indexOf('{'),b=s.lastIndexOf('}');
  if(a<0||b<=a)return null;
  try{var o=JSON.parse(s.slice(a,b+1));
    return {
      complaints:Array.isArray(o.complaints)?o.complaints.slice(0,6):[],
      wishes:Array.isArray(o.wishes)?o.wishes.slice(0,5):[],
      diffIdeas:Array.isArray(o.diffIdeas)?o.diffIdeas.slice(0,5):[],
      score:typeof o.score==='number'?o.score:(parseInt(o.score,10)||0)
    };
  }catch(e){return null;}
}

async function reviewMiningRun(candId){
  researchInit();
  var c=D.research.candidates.find(function(x){return x.id===candId;});
  if(!c)return;
  var inp=document.getElementById('rmInput');var txt=(inp&&inp.value||'').trim();
  if(txt.length<40){toast('Bitte genügend Rezensionstext einfügen (mind. ein paar Sätze)');return;}
  if(!window.SHImport||!window.SHImport.ask){toast('KI-Engine nicht geladen – bitte Seite neu laden');return;}
  var res=document.getElementById('rmResult');
  if(res)res.innerHTML='<div style="color:var(--tx2);font-size:13px;padding:10px">⏳ KI analysiert die Rezensionen … (kann ein paar Sekunden dauern)</div>';
  var prompt='Du bist Amazon-Produktanalyst. Analysiere die folgenden Kundenrezensionen eines KONKURRENZ-Produkts und finde Chancen für ein eigenes, besseres Produkt.\n\nAntworte AUSSCHLIESSLICH mit gültigem JSON in GENAU diesem Format, ohne Vorrede, ohne Markdown:\n{"complaints":[{"text":"kurze Beschwerde","freq":"hoch|mittel|niedrig","severity":"hoch|mittel|niedrig"}],"wishes":["Wunsch"],"diffIdeas":["konkrete Differenzierungsidee"],"score":7}\n\nRegeln: max 6 complaints (nach Häufigkeit), max 5 wishes, max 5 diffIdeas (konkret, umsetzbar). score = 0–10 wie groß die Differenzierungschance ist (10 = viele klar lösbare Schwächen). Alles auf Deutsch.\n\nREZENSIONEN:\n'+txt.slice(0,6000);
  try{
    var raw=await window.SHImport.ask(prompt);
    var data=reviewMiningParse(raw);
    if(!data){if(res)res.innerHTML='<div style="color:var(--rd);font-size:12px;padding:10px">⚠️ Konnte die KI-Antwort nicht als JSON lesen. Bitte erneut versuchen (ggf. Gemini-Key im KI-Bildstudio hinterlegen für stabilere Ergebnisse).</div>';return;}
    data.at=new Date().toISOString();
    c.reviewMining=data;
    c.score2=c.score2||{};
    if(typeof data.score==='number')c.score2.differenz=Math.max(0,Math.min(10,Math.round(data.score)));
    if(data.diffIdeas&&data.diffIdeas.length)c.differenzierung=data.diffIdeas.slice(0,3).join(' · ');
    c.computedScore=researchCalcScore(c);c.updatedAt=new Date().toISOString();
    save();
    if(res)res.innerHTML=reviewMiningResultHtml(data);
    var pp=document.getElementById('p-pipeline');if(pp&&pp.classList.contains('active')&&typeof renderPipeline==='function')renderPipeline();
    var pr=document.getElementById('p-research');if(pr&&pr.classList.contains('active')&&typeof researchRenderScore==='function')researchRenderScore();
    toast('✓ Review-Mining übernommen – Differenzierung '+(c.score2.differenz!=null?c.score2.differenz+'/10':''));
  }catch(err){if(res)res.innerHTML='<div style="color:var(--rd);font-size:12px;padding:10px">⚠️ Analyse fehlgeschlagen: '+esc(err&&err.message||'Fehler')+'. Bitte erneut versuchen.</div>';}
}

function reviewMiningResultHtml(d){
  function sevCol(s){return s==='hoch'?'rd':s==='mittel'?'ac':'tx2';}
  var h='';
  h+='<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;background:var(--gnd);border:1px solid var(--gn);border-radius:9px;padding:10px 14px"><div style="font-size:30px;font-weight:800;color:var(--gn);line-height:1">'+(d.score!=null?d.score:'–')+'/10</div><div style="font-size:12px;color:var(--tx)">Differenzierungs-Chance<br><span style="color:var(--gn);font-weight:700">✓ ins Scorecard übernommen</span></div></div>';
  if(d.complaints&&d.complaints.length){
    h+='<div style="font-weight:700;font-size:12.5px;margin:10px 0 6px;color:var(--tx)">😖 Top-Beschwerden der Konkurrenz</div><div style="display:flex;flex-direction:column;gap:5px">';
    d.complaints.forEach(function(c){
      h+='<div style="display:flex;justify-content:space-between;gap:8px;background:var(--s2);border:1px solid var(--bd);border-radius:7px;padding:6px 10px;font-size:12px"><span style="color:var(--tx)">'+esc(c.text||'')+'</span><span style="white-space:nowrap;color:var(--'+sevCol(c.severity)+');font-weight:700;font-size:10.5px">'+(c.freq?esc(c.freq):'')+(c.severity?' · '+esc(c.severity):'')+'</span></div>';
    });
    h+='</div>';
  }
  if(d.wishes&&d.wishes.length){
    h+='<div style="font-weight:700;font-size:12.5px;margin:12px 0 6px;color:var(--tx)">💭 Kundenwünsche</div><div style="display:flex;flex-wrap:wrap;gap:6px">';
    d.wishes.forEach(function(w){h+='<span style="background:var(--bld);color:var(--bl);border-radius:10px;padding:3px 10px;font-size:11.5px">'+esc(w)+'</span>';});
    h+='</div>';
  }
  if(d.diffIdeas&&d.diffIdeas.length){
    h+='<div style="font-weight:700;font-size:12.5px;margin:12px 0 6px;color:var(--tx)">🚀 Differenzierungs-Ideen</div><ul style="margin:0;padding-left:18px;font-size:12.5px;color:var(--tx);line-height:1.6">';
    d.diffIdeas.forEach(function(x){h+='<li>'+esc(x)+'</li>';});
    h+='</ul>';
  }
  return h;
}

// ═══════════════════════════════════════════════════════════════
// NISCHEN-SCAN: mehrere Konkurrenz-ASINs → ⌀ Preis/Reviews → Wettbewerb
// ═══════════════════════════════════════════════════════════════
function nischenScanOpen(candId){
  researchInit();
  var c=D.research.candidates.find(function(x){return x.id===candId;});
  if(!c){toast('Kandidat nicht gefunden');return;}
  var old=document.getElementById('nischenScanModal');if(old)old.remove();
  var ov=document.createElement('div');
  ov.id='nischenScanModal';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99997;display:flex;align-items:center;justify-content:center;padding:20px';
  ov.onclick=function(e){if(e.target===ov)ov.remove();};
  ov.innerHTML='<div style="background:var(--s1);border-radius:14px;max-width:680px;width:100%;max-height:90vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.5)">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid var(--bd)"><h2 style="margin:0;font-size:17px">🔍 Nischen-Scan</h2><button onclick="document.getElementById(\'nischenScanModal\').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--tx2)">✕</button></div>'+
    '<div style="padding:18px 20px">'+
      '<div style="font-weight:700;color:var(--tx);font-size:14px;margin-bottom:4px">'+esc(c.name)+'</div>'+
      '<div style="font-size:12px;color:var(--tx2);line-height:1.5;margin-bottom:10px">Füge die <b>ASINs der Top-Konkurrenz</b> dieser Nische ein (von der Amazon-Suchergebnisseite – eine pro Zeile oder kommagetrennt). Der Scan holt ⌀ Preis &amp; ⌀ Reviews → daraus der Wettbewerbs-Score. <i>Amazon blockt Abrufe gelegentlich – dann gibt es weniger Treffer.</i></div>'+
      '<textarea id="nsInput" rows="5" placeholder="B0CVBBBCZN\nB09XYZ1234\nB07ABC9999" style="width:100%;font-family:monospace;font-size:12.5px;padding:10px;border-radius:8px;border:1px solid var(--bd);background:var(--s2);color:var(--tx);resize:vertical;box-sizing:border-box">'+esc(c.compAsin||'')+'</textarea>'+
      '<div style="display:flex;gap:8px;margin-top:10px"><button class="btn btn-p" id="nsRunBtn" onclick="nischenScanRun(\''+c.id+'\')">🔍 Scannen</button></div>'+
      '<div id="nsResult" style="margin-top:14px"></div>'+
    '</div>'+
  '</div>';
  document.body.appendChild(ov);
  if(c.nischenScan){var r=document.getElementById('nsResult');if(r)r.innerHTML=nischenScanResultHtml(c.nischenScan);}
}

async function nischenScanRun(candId){
  researchInit();
  var c=D.research.candidates.find(function(x){return x.id===candId;});
  if(!c)return;
  var inp=document.getElementById('nsInput');var raw=(inp&&inp.value||'');
  var found=raw.match(/B0[A-Z0-9]{8}/gi)||[];
  var seen={},uniq=[];found.forEach(function(a){a=a.toUpperCase();if(!seen[a]){seen[a]=1;uniq.push(a);}});
  if(uniq.length===0){toast('Keine gültigen ASINs gefunden (Format B0XXXXXXXX)');return;}
  if(uniq.length>12)uniq=uniq.slice(0,12);
  if(!window.SHImport||!window.SHImport.fetchListing){toast('Import-Engine nicht geladen – bitte Seite neu laden');return;}
  var res=document.getElementById('nsResult');var btn=document.getElementById('nsRunBtn');
  if(btn)btn.disabled=true;
  var prices=[],reviews=[],ok=0,fail=0;
  for(var i=0;i<uniq.length;i++){
    if(res)res.innerHTML='<div style="color:var(--tx2);font-size:13px;padding:10px">⏳ Scanne '+(i+1)+'/'+uniq.length+' … ('+ok+' ok, '+fail+' fehlgeschlagen)</div>';
    try{
      var d=await window.SHImport.fetchListing(uniq[i]);
      if(d&&(d.price!=null||d.reviews!=null)){ok++;if(d.price!=null)prices.push(d.price);if(d.reviews!=null)reviews.push(d.reviews);}
      else fail++;
    }catch(e){fail++;}
  }
  if(ok===0){if(res)res.innerHTML='<div style="color:var(--rd);font-size:12px;padding:10px">⚠️ Keine Daten abrufbar (Amazon blockt evtl.). Bitte später erneut versuchen.</div>';if(btn)btn.disabled=false;return;}
  function avg(a){return a.length?a.reduce(function(x,y){return x+y;},0)/a.length:null;}
  var data={count:uniq.length,okCount:ok,failCount:fail,avgPrice:avg(prices),avgReviews:avg(reviews),
    minReviews:reviews.length?Math.min.apply(null,reviews):null,maxReviews:reviews.length?Math.max.apply(null,reviews):null,
    beatable:reviews.filter(function(r){return r<300;}).length,asins:uniq,at:new Date().toISOString()};
  c.nischenScan=data;
  if(data.avgReviews!=null)c.avgReviews=Math.round(data.avgReviews);
  if(data.avgPrice!=null&&c.vk==null)c.vk=Math.round(data.avgPrice*100)/100;
  c.computedScore=researchCalcScore(c);c.updatedAt=new Date().toISOString();
  save();
  if(res)res.innerHTML=nischenScanResultHtml(data);
  if(btn)btn.disabled=false;
  var pp=document.getElementById('p-pipeline');if(pp&&pp.classList.contains('active')&&typeof renderPipeline==='function')renderPipeline();
  var pr=document.getElementById('p-research');if(pr&&pr.classList.contains('active')&&typeof researchRenderScore==='function')researchRenderScore();
  toast('✓ Nischen-Scan übernommen – ⌀ '+Math.round(data.avgReviews||0)+' Reviews');
}

function nischenScanResultHtml(d){
  function stat(label,val,col){return '<div style="background:var(--s2);border:1px solid var(--bd);border-radius:8px;padding:9px 12px"><div style="font-size:10px;color:var(--tx3);text-transform:uppercase;letter-spacing:.5px">'+label+'</div><div style="font-size:17px;font-weight:800;color:var(--'+(col||'tx')+')">'+val+'</div></div>';}
  var h='<div style="background:var(--acd);border:1px solid var(--ac);border-radius:9px;padding:8px 12px;font-size:12px;color:var(--tx);margin-bottom:10px">✓ <b>'+d.okCount+' von '+d.count+'</b> Listings abgerufen → Wettbewerb im Scorecard aktualisiert'+(d.failCount?' ('+d.failCount+' blockiert/leer)':'')+'</div>';
  h+='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px">';
  h+=stat('⌀ Preis',d.avgPrice!=null?fmt(d.avgPrice)+'€':'—');
  h+=stat('⌀ Reviews',d.avgReviews!=null?Math.round(d.avgReviews).toLocaleString('de-DE'):'—',d.avgReviews!=null?(d.avgReviews<300?'gn':d.avgReviews<1000?'ac':'rd'):'tx');
  h+=stat('Reviews-Spanne',(d.minReviews!=null?d.minReviews:'—')+'–'+(d.maxReviews!=null?d.maxReviews:'—'));
  h+=stat('Schwache Listings','&lt;300: '+d.beatable,d.beatable>0?'gn':'tx');
  h+='</div>';
  return h;
}

// ═══════════════════════════════════════════════════════════════
// ENTSCHEIDUNGS-DOSSIER (Phase 3): 1-Klick druckfertiger One-Pager
// Feste Druckfarben (themeunabhängig), Print-Isolation via @media print
// ═══════════════════════════════════════════════════════════════
var DOSSIER_COL={gn:'#1e8e3e',ac:'#b26a00',rd:'#c5221f',tx3:'#8a94a0',tx:'#1a2330',mut:'#5b6673',bd:'#d8dee6',bg:'#f4f6f9'};

function dossierOpen(candId){
  researchInit();
  var c=D.research.candidates.find(function(x){return x.id===candId;});
  if(!c){toast('Kandidat nicht gefunden');return;}
  decisionMigrate(c);
  var old=document.getElementById('dossierModal');if(old)old.remove();
  var ov=document.createElement('div');
  ov.id='dossierModal';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:99998;display:flex;flex-direction:column;align-items:center;padding:18px;overflow:auto';
  ov.onclick=function(e){if(e.target===ov)ov.remove();};
  ov.innerHTML=
    '<style>@media print{'+
      'body>*:not(#dossierModal){display:none!important}'+
      '#dossierModal{position:static!important;background:#fff!important;padding:0!important;overflow:visible!important;display:block!important}'+
      '#dossierModal .no-print{display:none!important}'+
      '#dossierModal .dossier-sheet{box-shadow:none!important;width:auto!important;max-width:none!important;border-radius:0!important;margin:0!important;padding:0!important}'+
      '#dossierModal *{-webkit-print-color-adjust:exact;print-color-adjust:exact}'+
    '}</style>'+
    '<div class="no-print" style="display:flex;gap:8px;width:100%;max-width:820px;justify-content:flex-end;margin-bottom:10px;flex-shrink:0">'+
      '<button class="btn btn-p btn-sm" onclick="window.print()">🖨️ Drucken / als PDF sichern</button>'+
      '<button class="btn btn-sm" onclick="document.getElementById(\'dossierModal\').remove()">✕ Schließen</button>'+
    '</div>'+
    '<div class="dossier-sheet" style="background:#fff;color:'+DOSSIER_COL.tx+';width:100%;max-width:820px;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.5);padding:34px 40px;box-sizing:border-box;flex-shrink:0">'+dossierHtml(c)+'</div>';
  document.body.appendChild(ov);
}

// Urteils-Begründung in Klartext (aus Verdict + Konfidenz + Flags abgeleitet)
function dossierReasoning(c,vd,cf){
  var K=DOSSIER_COL;
  var s=[];
  if(vd.verdict==='offen')return 'Noch keine Bewertung möglich – es sind keine Dimensionen bewertet. Erst Daten erfassen (Xray-Paste, Gebühren-Rechner), dann entscheiden.';
  var strongest=null;
  DECISION_DIMS.forEach(function(d){var v=decisionEff(c,d.key);if(typeof v==='number'&&(!strongest||v>strongest.val))strongest={label:d.label,val:v};});
  if(vd.verdict==='go')s.push('<b style="color:'+K.gn+'">GO:</b> Score '+vd.score+'/100 (Schwelle 70) über '+vd.rated+' von '+vd.total+' Dimensionen, ohne harte Red Flags.');
  else if(vd.verdict==='nogo')s.push('<b style="color:'+K.rd+'">NO-GO:</b> '+(vd.hard>0?vd.hard+' harte Red Flag'+(vd.hard>1?'s':'')+' bei Score '+vd.score+'/100.':'Score '+vd.score+'/100 liegt unter der 50er-Schwelle.'));
  else s.push('<b style="color:'+K.ac+'">PRÜFEN:</b> Score '+vd.score+'/100 – weder klares GO (≥70 ohne harte Flags) noch NO-GO (<50).');
  if(strongest)s.push('Stärkste Dimension: '+strongest.label+' ('+strongest.val+'/10).');
  if(vd.weakest)s.push('Größter Schwachpunkt: '+vd.weakest.label+' ('+vd.weakest.val+'/10).');
  s.push('Das Urteil stützt sich auf <b>'+cf.data+'/'+cf.total+' echte Datenpunkte</b>'+(cf.manual?' und '+cf.manual+' manuelle Schätzung'+(cf.manual>1?'en':''):'')+' (Konfidenz: '+cf.level+').');
  if((vd.verdict==='go'||vd.verdict==='nogo')&&cf.data<3)s.push('<b style="color:'+K.rd+'">⚠️ Achtung:</b> Für ein belastbares '+vd.label+' fehlen echte Daten – erst nachtragen, dann final entscheiden.');
  return s.join(' ');
}

function dossierHtml(c){
  var K=DOSSIER_COL;
  var vd=decisionVerdict(c);
  var cf=decisionConfidence(c);
  var vcol=K[vd.color]||K.tx3;
  var emoji=vd.verdict==='go'?'🟢':vd.verdict==='nogo'?'🔴':vd.verdict==='pruefen'?'🟡':'⚪';
  var now=new Date();
  function sec(t){return '<h3 style="font-size:13px;margin:22px 0 8px;padding-bottom:5px;border-bottom:2px solid '+K.bd+';color:'+K.tx+';text-transform:uppercase;letter-spacing:1px">'+t+'</h3>';}
  function kv(label,val,hint){return '<tr><td style="padding:5px 10px 5px 0;color:'+K.mut+';font-size:12px;white-space:nowrap">'+label+'</td><td style="padding:5px 0;font-weight:700;font-size:12.5px;color:'+K.tx+'">'+val+'</td>'+(hint!==undefined?'<td style="padding:5px 0 5px 14px;font-size:11px;color:'+K.mut+'">'+hint+'</td>':'')+'</tr>';}
  function eur(v){return v!=null?fmt(v)+' €':'<span style="color:'+K.ac+'">offen</span>';}
  var h='';

  // ── Kopf ──
  h+='<div style="display:flex;justify-content:space-between;align-items:baseline;border-bottom:3px solid '+K.tx+';padding-bottom:10px;margin-bottom:14px">'+
    '<div style="font-weight:800;font-size:13px;letter-spacing:2px;text-transform:uppercase">⚖️ Entscheidungs-Dossier</div>'+
    '<div style="font-size:11px;color:'+K.mut+'">AMZ SellerHub · '+now.toLocaleDateString('de-DE')+'</div>'+
  '</div>';
  h+='<div style="font-family:\'Playfair Display\',serif;font-size:26px;font-weight:700;line-height:1.2;margin-bottom:4px">'+esc(c.name)+'</div>';
  var meta=[];
  if(c.kategorie)meta.push(esc(c.kategorie));
  if(c.hauptkeyword&&c.hauptkeyword!==c.name)meta.push('Keyword: '+esc(c.hauptkeyword));
  if(c.compAsin)meta.push('Referenz-ASIN: '+esc(c.compAsin));
  if(meta.length)h+='<div style="font-size:12px;color:'+K.mut+';margin-bottom:16px">'+meta.join(' · ')+'</div>';

  // ── Urteil ──
  h+='<div style="border:2px solid '+vcol+';border-radius:10px;padding:14px 18px;display:flex;align-items:center;gap:18px;flex-wrap:wrap;background:'+K.bg+'">'+
    '<div style="text-align:center"><div style="font-size:38px;font-weight:800;color:'+vcol+';line-height:1">'+(vd.score>0?vd.score:'—')+'</div><div style="font-size:9px;color:'+K.mut+';text-transform:uppercase;letter-spacing:1px">Score /100</div></div>'+
    '<div style="background:'+vcol+';color:#fff;font-weight:800;font-size:16px;padding:8px 18px;border-radius:9px">'+emoji+' '+vd.label+'</div>'+
    '<div style="flex:1;min-width:180px;font-size:11.5px;color:'+K.mut+'">Daten-Konfidenz: <b style="color:'+(K[cf.color]||K.tx)+'">'+cf.level.toUpperCase()+'</b> · '+cf.data+'/'+cf.total+' echte Datenpunkte'+(cf.manual?' · '+cf.manual+' manuell':'')+(cf.open?' · '+cf.open+' offen':'')+'</div>'+
  '</div>';
  h+='<div style="font-size:12.5px;line-height:1.65;margin:12px 0 0;color:'+K.tx+'">'+dossierReasoning(c,vd,cf)+'</div>';

  // ── Scorecard ──
  h+=sec('Scorecard – 6 Dimensionen');
  h+='<table style="width:100%;border-collapse:collapse;font-size:12px">';
  h+='<tr style="text-align:left;color:'+K.mut+';font-size:10.5px;text-transform:uppercase;letter-spacing:.5px"><th style="padding:4px 0;font-weight:600">Dimension</th><th style="padding:4px 8px;font-weight:600">Gewicht</th><th style="padding:4px 8px;font-weight:600">Wert</th><th style="padding:4px 8px;font-weight:600">Basis</th></tr>';
  DECISION_DIMS.forEach(function(d){
    var eff=decisionEff(c,d.key);
    var a=decisionAuto(c,d.key);
    var ov2=c.score2&&c.score2[d.key];
    var manual=typeof ov2==='number'&&ov2>0;
    var dcol=eff==null?K.tx3:eff>=7?K.gn:eff>=4?K.ac:K.rd;
    var basis=manual?'✏️ manuell gesetzt'+(a.val!=null?' (Auto: '+a.val+')':''):(eff==null?'– '+esc(a.reason):'⚙️ '+esc(a.reason));
    h+='<tr style="border-top:1px solid '+K.bd+'">'+
      '<td style="padding:6px 0;font-weight:700">'+esc(d.label)+'</td>'+
      '<td style="padding:6px 8px;color:'+K.mut+'">'+d.weight+' %</td>'+
      '<td style="padding:6px 8px;font-weight:800;color:'+dcol+';white-space:nowrap">'+(eff==null?'– /10':eff+' /10')+'</td>'+
      '<td style="padding:6px 8px;font-size:11px;color:'+K.mut+'">'+basis+'</td>'+
    '</tr>';
  });
  h+='</table>';

  // ── Red Flags ──
  if(vd.flags.length){
    h+=sec('Red Flags ('+vd.hard+' hart · '+(vd.flags.length-vd.hard)+' weich)');
    h+='<div style="display:flex;flex-direction:column;gap:4px">';
    vd.flags.slice().sort(function(a,b){return (b.hard?1:0)-(a.hard?1:0);}).forEach(function(f){
      var fc=f.hard?K.rd:K.ac;
      h+='<div style="font-size:12px;color:'+fc+';border:1px solid '+fc+';border-radius:7px;padding:5px 10px">'+(f.hard?'🔴 HART':'🟡 weich')+' · '+esc(f.t)+'</div>';
    });
    h+='</div>';
  }

  // ── Compliance-Check Deutschland ──
  var dcf=complianceFor(c);
  h+=sec('Compliance-Check Deutschland ('+dcf.done+' / '+dcf.total+' erledigt'+(dcf.hardOpen?' · '+dcf.hardOpen+' kritische offen':'')+')');
  var dst=c.compliance||{};
  dcf.groups.forEach(function(g){
    h+='<div style="font-size:11px;font-weight:800;color:'+K.mut+';margin:8px 0 3px">'+g.label+'</div>';
    g.items.forEach(function(i){
      h+='<div style="font-size:12px;color:'+(dst[i.k]?K.mut:K.tx)+';padding:2px 0">'+(dst[i.k]?'✅':'⬜️')+' '+(i.hard?'<b style="color:'+K.rd+'">●</b> ':'')+esc(i.t)+'</div>';
    });
  });
  h+='<div style="font-size:10px;color:'+K.mut+';margin-top:5px">● = kritisch · automatisch erkannt aus Kategorie/Name · Arbeits-Checkliste, keine Rechtsberatung.</div>';

  // ── Markt & Wettbewerb ──
  var ns=c.nischenScan;
  if(c.top10Umsatz!=null||c.avgReviews!=null||ns){
    h+=sec('Markt &amp; Wettbewerb');
    h+='<table style="border-collapse:collapse">';
    if(c.top10Umsatz!=null)h+=kv('⌀ Umsatz Top-Konkurrenz',Math.round(c.top10Umsatz).toLocaleString('de-DE')+' €/Monat');
    if(ns&&ns.totalRevenue!=null)h+=kv('Nische gesamt',Math.round(ns.totalRevenue).toLocaleString('de-DE')+' €/Monat');
    if(c.avgReviews!=null)h+=kv('⌀ Reviews Top-10',Math.round(c.avgReviews).toLocaleString('de-DE'),ns&&ns.minReviews!=null?('Spanne '+ns.minReviews+'–'+ns.maxReviews):'');
    if(ns&&ns.beatable!=null)h+=kv('Schwache Listings (&lt;300 Rev.)',String(ns.beatable),'angreifbare Plätze in den Top-'+(ns.count||10));
    if(ns&&ns.avgRating!=null)h+=kv('⌀ Rating','⭐ '+ns.avgRating.toFixed(1));
    if(ns&&ns.avgPrice!=null)h+=kv('⌀ Marktpreis',fmt(ns.avgPrice)+' €');
    h+='</table>';
    if(ns)h+='<div style="font-size:10.5px;color:'+K.mut+';margin-top:5px">Quelle: '+(ns.source==='xray-paste'?'⚡ Xray-Paste ('+ns.count+' Top-Produkte aggregiert)':'🔍 Nischen-Scan ('+ns.okCount+'/'+ns.count+' ASINs abgerufen)')+' · Stand '+new Date(ns.at).toLocaleDateString('de-DE')+'</div>';
  }

  // ── Margenrechnung ──
  h+=sec('Margenrechnung (je Stück)');
  h+='<table style="border-collapse:collapse">';
  h+=kv('Verkaufspreis (VK)',eur(c.vk));
  h+=kv('Einkaufspreis (EK)',eur(c.ek));
  h+=kv('FBA-Gebühren',eur(c.fbaGebuehren),'inkl. Versand durch Amazon');
  var dmm=decisionMarge(c);
  h+=kv('Netto-Marge',dmm.val!=null?('<span style="color:'+(dmm.val>=25?K.gn:dmm.val>=15?K.ac:K.rd)+'">'+dmm.val+' %</span>'):'<span style="color:'+K.ac+'">offen</span>',dmm.src==='auto'?'auto: (VK − EK − FBA) / VK; Ziel ≥ 25 %':'nach FBA + PPC; Ziel ≥ 25 %');
  if(c.vk!=null&&dmm.val!=null)h+=kv('Gewinn je Stück',fmt(c.vk*dmm.val/100)+' €');
  var dmenge=(c.startMenge!=null&&c.startMenge>0)?c.startMenge:500;
  if(c.ek!=null&&c.ek>0)h+=kv('Startbudget ('+dmenge+' Stück)','~'+Math.round(c.ek*dmenge).toLocaleString('de-DE')+' €','EK × '+dmenge+', ohne PPC-Anlauf');
  h+='</table>';
  if(dmm.val==null||c.fbaGebuehren==null)h+='<div style="font-size:10.5px;color:'+K.ac+';margin-top:5px">⚠️ Margenrechnung unvollständig – im 💶 Gebühren-Rechner mit der echten Amazon-Rate-Card (Stand 1.2.2026) ermitteln.</div>';

  // ── Review-Insights ──
  var rm=c.reviewMining;
  if(rm){
    h+=sec('Review-Insights (Differenzierungs-Chance: '+(rm.score!=null?rm.score+'/10':'–')+')');
    if(rm.complaints&&rm.complaints.length){
      h+='<div style="font-size:11px;font-weight:700;color:'+K.mut+';margin-bottom:4px">😖 TOP-BESCHWERDEN DER KONKURRENZ</div><ul style="margin:0 0 10px;padding-left:18px;font-size:12px;line-height:1.6">';
      rm.complaints.forEach(function(x){h+='<li>'+esc(x.text||'')+(x.freq||x.severity?' <span style="color:'+K.mut+';font-size:10.5px">('+[x.freq,x.severity].filter(Boolean).map(esc).join(' · ')+')</span>':'')+'</li>';});
      h+='</ul>';
    }
    if(rm.wishes&&rm.wishes.length)h+='<div style="font-size:11px;font-weight:700;color:'+K.mut+';margin-bottom:4px">💭 KUNDENWÜNSCHE</div><div style="font-size:12px;line-height:1.6;margin-bottom:10px">'+rm.wishes.map(esc).join(' · ')+'</div>';
    if(rm.diffIdeas&&rm.diffIdeas.length){
      h+='<div style="font-size:11px;font-weight:700;color:'+K.mut+';margin-bottom:4px">🚀 DIFFERENZIERUNGS-IDEEN</div><ul style="margin:0;padding-left:18px;font-size:12px;line-height:1.6">';
      rm.diffIdeas.forEach(function(x){h+='<li>'+esc(x)+'</li>';});
      h+='</ul>';
    }
  }

  // ── Differenzierung / Notizen ──
  if((c.differenzierung||'').trim())h+=sec('Geplante Differenzierung')+'<div style="font-size:12.5px;line-height:1.65">'+esc(c.differenzierung)+'</div>';
  if((c.notes||'').trim())h+=sec('Notizen')+'<div style="font-size:12px;line-height:1.6;color:'+K.mut+'">'+esc(c.notes)+'</div>';

  // ── Nächste Schritte (offene Datenpunkte) ──
  var nextSteps=[];
  var stepMap={nachfrage:'Nachfrage-Daten holen: ⚡ Xray-Paste oder 📥 Helium-Import (Top-10-Umsatz)',
    wettbewerb:'Wettbewerb erfassen: ⚡ Xray-Paste oder 🔍 Nischen-Scan (⌀ Reviews)',
    wirtschaft:'Marge rechnen: 💶 Gebühren-Rechner mit echter Rate-Card (EK, FBA, Netto-Marge)',
    differenz:'Differenzierung finden: 🔬 Review-Mining der Konkurrenz-Rezensionen',
    risiko:'Red-Flag-Check im Kandidaten-Editor: Gewicht, Saisonalität, Gating, IP-Risiko',
    kapital:'Einkaufspreis (EK) erfassen → Startbudget-Schätzung'};
  cf.dims.forEach(function(x,i){if(x.src==='none'&&stepMap[DECISION_DIMS[i].key])nextSteps.push(stepMap[DECISION_DIMS[i].key]);});
  if(vd.verdict==='go')nextSteps.push('Finale kritische Prüfung mit Claude (Workflow-Schritt 17), dann Muster bestellen');
  if(nextSteps.length){
    h+=sec('Nächste Schritte');
    h+='<ol style="margin:0;padding-left:20px;font-size:12.5px;line-height:1.8">';
    nextSteps.forEach(function(x){h+='<li>'+x+'</li>';});
    h+='</ol>';
  }

  // ── Fußzeile ──
  h+='<div style="margin-top:26px;padding-top:10px;border-top:1px solid '+K.bd+';display:flex;justify-content:space-between;font-size:10px;color:'+K.mut+'">'+
    '<span>Erstellt mit AMZ SellerHub – Entscheidungs-Cockpit für Amazon-Produktrecherche</span>'+
    '<span>'+now.toLocaleDateString('de-DE')+' '+now.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})+' Uhr · alle Werte aus eigenen Eingaben &amp; Importen</span>'+
  '</div>';
  return h;
}

// ═══════════════════════════════════════════════════════════════
// TAB 4: PROMPT-BIBLIOTHEK
// ═══════════════════════════════════════════════════════════════

function researchRenderPrompts(){
  var container=document.getElementById('researchPromptsContent');
  if(!container)return;
  // Group prompts by phase
  var phases=[
    {key:'recherche',label:'🔍 Recherche-Phase',desc:'Schritte 1-5: Ideen sammeln, filtern, Master-Tabelle aufbauen',color:'pu'},
    {key:'analyse',label:'📊 Analyse-Phase',desc:'Schritte 6-10: Konkurrenz, Keywords, Saisonalität',color:'bl'},
    {key:'validierung',label:'⚖️ Validierungs-Phase',desc:'Schritte 11-15: Reviews, Marge, Lieferanten, Recht',color:'ac'},
    {key:'entscheidung',label:'🎯 Entscheidungs-Phase',desc:'Schritte 16-20: Score, Bewertung, Muster, Launch',color:'gn'}
  ];

  var html=helpBox('📚','Prompt-Bibliothek: '+RESEARCH_PROMPTS.length+' Profi-Prompts gebrauchsfertig','Alle Prompts aus dem 20-Schritte-Workflow auf einer Seite. Jeder Prompt ist für ein bestimmtes <b>Tool</b> optimiert (Claude, Perplexity, Gemini). <b>So nutzt du sie:</b> 1) Auf „📋 Kopieren" klicken, 2) auf „↗ Öffnen" klicken (öffnet das Tool im neuen Tab), 3) Prompt einfügen, 4) die Platzhalter <code style="background:var(--s3);padding:1px 5px;border-radius:3px;font-size:11px">[in eckigen Klammern]</code> durch deine echten Daten ersetzen.<br><span style="color:var(--tx3);font-style:italic;font-size:11px;display:inline-block;margin-top:4px">💡 Tipp: Bevor du einen Prompt nutzt, schreib mindestens 1-2 Sätze Kontext zu deinem Produkt – das verbessert die Antwortqualität massiv.</span>',{variant:'green',lessonId:'rp_1'});

  phases.forEach(function(phase){
    var prompts=RESEARCH_PROMPTS.filter(function(p){return p.phase===phase.key});
    if(prompts.length===0)return;
    html+='<div style="margin-bottom:24px">'+
      '<div style="display:flex;align-items:baseline;gap:10px;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid var(--'+phase.color+'d)">'+
        '<h3 style="margin:0;color:var(--'+phase.color+');font-size:14px">'+phase.label+'</h3>'+
        '<span style="font-size:11px;color:var(--tx3)">'+esc(phase.desc)+' · '+prompts.length+' Prompts</span>'+
      '</div>'+
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:14px">';
    prompts.forEach(function(p){
      var toolColors={claude:'#c2410c',perplexity:'#0891b2',gemini:'#7c3aed'};
      var toolLabels={claude:'🤖 Claude',perplexity:'🔍 Perplexity',gemini:'✨ Gemini'};
      var tc=toolColors[p.tool]||'var(--tx2)';
      var tl=toolLabels[p.tool]||'📋 Allgemein';
      var elId='lib_prompt_'+p.id;
      html+='<div style="background:var(--s1);border:1.5px solid '+tc+';border-radius:12px;overflow:hidden">'+
        '<div style="background:'+tc+';color:#fff;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">'+
          '<div style="display:flex;align-items:center;gap:8px"><span style="font-size:12px;font-weight:700">'+tl+'</span><span style="font-size:10px;opacity:.8">· Schritt '+p.step+'</span></div>'+
          '<div style="display:flex;gap:4px">'+
            '<button onclick="wikaCopyPrompt(\''+elId+'\',this)" style="background:rgba(255,255,255,.2);color:#fff;border:1px solid rgba(255,255,255,.3);padding:3px 9px;border-radius:5px;cursor:pointer;font-family:inherit;font-size:10px;font-weight:700">📋 Kopieren</button>'+
            (p.tool?'<a href="'+researchToolUrl(p.tool)+'" target="_blank" rel="noopener" style="background:rgba(255,255,255,.2);color:#fff;border:1px solid rgba(255,255,255,.3);padding:3px 9px;border-radius:5px;cursor:pointer;font-family:inherit;font-size:10px;font-weight:700;text-decoration:none;display:inline-block">↗ Öffnen</a>':'')+
          '</div>'+
        '</div>'+
        '<div style="padding:12px 16px;background:var(--s2);border-bottom:1px solid var(--bd)"><b style="font-size:13px;color:var(--tx)">'+esc(p.title)+'</b></div>'+
        '<pre id="'+elId+'" style="margin:0;padding:12px 16px;background:var(--s1);font-family:\'SF Mono\',Menlo,Consolas,monospace;font-size:11px;line-height:1.55;color:var(--tx);white-space:pre-wrap;max-height:200px;overflow-y:auto;border:none">'+esc(p.text)+'</pre>'+
      '</div>';
    });
    html+='</div></div>';
  });

  container.innerHTML=html;
}

function fillProdSelects(){
  ['wProd','kwProd','revProd','srcProd','laProd'].forEach(function(id){
    var s=document.getElementById(id);if(!s)return;
    var v=s.value;s.innerHTML='<option value="">— Produkt wählen —</option>';
    D.products.forEach(function(p,i){var o=document.createElement('option');o.value=i;o.textContent=p.name;s.appendChild(o);});
    s.value=v;
  });
}

// ═══════════════ CALCULATIONS ═══════════════
// Wirtschaftlichkeit: OHNE erfasste Kosten (EK/FBA/…) gibt es keine ehrliche Marge —
// incomplete:true statt „100 % Marge"-Unsinn; Anzeigen zeigen dann „—".
function cp(p){var ek=p.einkaufspreis||0,vk=p.verkaufspreis||0,fba=p.fbaGebuehren||0,vs=p.versand||0,zl=p.zoll||0,so=p.sonstigeKosten||0;var tc=ek+fba+vs+zl+so;var incomplete=tc<=0;var pr=vk-tc;return{tc:tc,pr:pr,incomplete:incomplete,m:(vk>0&&!incomplete)?(pr/vk)*100:null,roi:ek>0?(pr/ek)*100:null}}
function mc(m){return m===null?'':'color:'+(m>=30?'var(--gn)':m>=15?'var(--ac)':'var(--rd)')}
function pf(id){return parseFloat(document.getElementById(id).value)||0}
function fmt(v){return v?Number(v).toFixed(2):'—'}
function eur(v){return v.toFixed(2)+' €'}
function esc(s){var d=document.createElement('div');d.textContent=s;return d.innerHTML}
function toast(m){var t=document.getElementById('toast');t.textContent=m;t.classList.add('show');setTimeout(function(){t.classList.remove('show')},2400)}

// Tooltip-Helper: erzeugt das HTML für ein Info-Icon mit Hover-Tooltip
// pos: 'top' (default), 'below', 'left', 'right' — bestimmt die Position bei Bildschirm-Rändern
function wtip(text,pos){
  var posClass=pos?(' '+pos):'';
  return '<span class="wtip" tabindex="0" aria-label="Hilfe"><span style="pointer-events:none">ⓘ</span><span class="wtip-content'+posClass+'">'+text+'</span></span>';
}

// Help-Box-Helper: erzeugt eine fest sichtbare Erklär-Box mit optionalem Link zum Lernzentrum
// variant: 'blue' (default), 'purple', 'gold', 'green'
// linkLessonId: optional, ID einer Lektion zum Verlinken
function helpBox(icon,title,text,opts){
  opts=opts||{};
  var variant=opts.variant||'blue';
  var varClass=variant==='blue'?'':' '+variant;
  var linkHtml='';
  if(opts.lessonId){
    linkHtml='<a class="help-link" onclick="researchOpenLesson(\''+opts.lessonId+'\');return false" style="cursor:pointer">📖 Methodik im Lernzentrum nachlesen →</a>';
  }else if(opts.link){
    linkHtml='<a class="help-link" onclick="'+opts.link+';return false" style="cursor:pointer">📖 '+(opts.linkLabel||'Mehr erfahren')+' →</a>';
  }
  return '<div class="help-box'+varClass+'">'+
    '<div class="help-icon">'+icon+'</div>'+
    '<div class="help-body">'+
      '<div class="help-title">'+title+'</div>'+
      '<div class="help-text">'+text+'</div>'+
      linkHtml+
    '</div>'+
  '</div>';
}

// Collapsible help-box: aufklappbare Variante für detailliertere Anleitungen
function helpBoxCollapsible(icon,title,text,opts){
  opts=opts||{};
  var variant=opts.variant||'blue';
  var varClass=variant==='blue'?'':' '+variant;
  return '<details class="help-box help-box-collapsible'+varClass+'" style="display:block">'+
    '<summary>'+icon+' '+title+' <span style="font-size:11px;color:var(--tx3);font-weight:500;margin-left:auto">▾ Klick für Details</span></summary>'+
    '<div class="help-text" style="margin-top:8px">'+text+'</div>'+
    (opts.lessonId?'<a class="help-link" onclick="researchOpenLesson(\''+opts.lessonId+'\');return false" style="cursor:pointer">📖 Methodik im Lernzentrum nachlesen →</a>':'')+
  '</details>';
}

// ═══════════════ PRODUKTE ═══════════════
var prodView=(function(){try{return localStorage.getItem('shub_prodView')||'table';}catch(e){return 'table';}})();
function setProdView(v){prodView=v;try{localStorage.setItem('shub_prodView',v);}catch(e){}renderProds();}
function renderProds(){
  var q=(document.getElementById('prodSearch').value||'').toLowerCase();
  var fs=document.getElementById('fStatus').value;
  var fk=document.getElementById('fKat').value;
  var fl=D.products.filter(function(p){
    var ms=!q||p.name.toLowerCase().indexOf(q)>-1||(p.kategorie||'').toLowerCase().indexOf(q)>-1||(p.notizen||'').toLowerCase().indexOf(q)>-1;
    return ms&&(!fs||p.status===fs)&&(!fk||p.kategorie===fk);
  });
  var sf=pSort.f,dir=pSort.d==='asc'?1:-1;
  fl.sort(function(a,b){
    var va,vb;
    if(sf==='marge'){va=cp(a).m||-999;vb=cp(b).m||-999}
    else if(sf==='profit'){va=cp(a).pr||-999;vb=cp(b).pr||-999}
    else if(sf==='roi'){va=cp(a).roi||-999;vb=cp(b).roi||-999}
    else{va=a[sf]||'';vb=b[sf]||''}
    if(typeof va==='number'&&typeof vb==='number')return(va-vb)*dir;
    return String(va).localeCompare(String(vb),'de')*dir;
  });
  var tb=document.getElementById('prodBody');tb.innerHTML='';
  var cardsHtml='';
  fl.forEach(function(p){
    var i=D.products.indexOf(p),c=cp(p);
    var sc=p.status==='Idee'?'b-idee':p.status==='Recherche'?'b-recherche':p.status==='Analyse'?'b-analyse':p.status==='Bestellt'?'b-bestellt':'b-abgelehnt';
    var stars='';for(var s=1;s<=5;s++)stars+='<span class="star'+(s<=(p.bewertung||0)?' a':'')+'">★</span>';
    var tr=document.createElement('tr');
    tr.style.cursor='pointer';
    tr.onclick=function(e){
      // Only open detail if click was on row background (not on action buttons)
      if(e.target===tr||e.target.tagName==='TD'){
        openProductDetail(i);
      }
    };
    var isSelected=selectedProds.indexOf(i)>-1;
    if(isSelected)tr.style.background='var(--acd)';
    tr.innerHTML='<td style="text-align:center" onclick="event.stopPropagation()"><input type="checkbox" class="prod-check" data-idx="'+i+'" '+(isSelected?'checked':'')+' onchange="prodToggleSelect('+i+',this.checked)" style="cursor:pointer;width:16px;height:16px;accent-color:var(--ac)"></td>'
      +'<td class="pn"><div style="display:flex;align-items:center">'+(p.bild?'<img class="prodrow-thumb" src="'+esc(p.bild)+'" alt="" loading="lazy" onerror="this.style.display=\'none\'">':'')+'<div>'+(p.name?esc(p.name):'<span style="color:var(--rd);font-style:italic">⚠️ Ohne Namen</span>')+(p.asin?'<br><span style="font-size:10px;color:var(--tx2);font-weight:400">'+esc(p.asin)+'</span>':'')+'</div></div></td>'
      +'<td>'+esc(p.kategorie||'—')+'</td>'
      +'<td><span class="badge '+sc+'">'+esc(p.status)+'</span></td>'
      +'<td class="nc">'+fmt(p.einkaufspreis)+'</td>'
      +'<td class="nc">'+fmt(p.verkaufspreis)+'</td>'
      +'<td class="nc" style="font-weight:700;'+mc(c.m)+'">'+(c.m!==null?c.m.toFixed(1)+'%':'—')+'</td>'
      +'<td class="nc" style="font-weight:600;'+(c.pr>=0?'color:var(--gn)':'color:var(--rd)')+'">'+((p.verkaufspreis&&!c.incomplete)?c.pr.toFixed(2)+'€':'—')+'</td>'
      +'<td class="nc">'+(c.roi!==null?c.roi.toFixed(0)+'%':'—')+'</td>'
      +'<td class="nc">'+(p.bsr?Number(p.bsr).toLocaleString('de-DE'):'—')+'</td>'
      +'<td>'+stars+'</td>'
      +'<td>'+esc(p.quelle||'—')+'</td>'
      +'<td class="note-c" title="'+esc(p.notizen||'')+'">'+esc(p.notizen||'—')+'</td>'
      +'<td style="font-size:11px;color:var(--tx2);white-space:nowrap">'+(p.datum||'—')+'</td>'
      +'<td onclick="event.stopPropagation()"><div class="row-act">'
        +'<button onclick="openProductDetail('+i+')" title="Detail-Ansicht öffnen (mit 4 Tabs)" style="background:linear-gradient(135deg,var(--ac),var(--ac2));color:#fff;border:none;font-weight:600;padding:5px 10px;font-size:11px;border-radius:5px"><span style="font-size:12px">📝</span> Details</button>'
        +(p.bild?'':'<button onclick="productFetchImage('+i+')" title="Hauptbild von Amazon holen (per ASIN) oder URL eintragen">🖼️</button>')
        +'<button onclick="dupProd('+i+')" title="Duplizieren">📋</button>'
        +'<button class="del" onclick="delProd('+i+')" title="Löschen">🗑️</button>'
      +'</div></td>';
    tb.appendChild(tr);
    var mcol=(c.m!==null)?(c.m>=25?'gn':c.m>=10?'ac':'rd'):'tx3';
    var imgBlock=p.bild
      ? '<div class="prodcard-imgwrap"><img class="prodcard-img" src="'+esc(p.bild)+'" alt="" loading="lazy" onerror="this.style.display=\'none\';this.parentNode.innerHTML=\'<span class=&quot;prodcard-noimg&quot;>📦</span>\'"></div>'
      : '<div class="prodcard-imgwrap" onclick="event.stopPropagation();productFetchImage('+i+')" title="Bild von Amazon holen (per ASIN) oder URL eintragen" style="cursor:pointer;flex-direction:column;gap:6px"><span class="prodcard-noimg">📦</span><span style="font-size:11px;color:var(--ac);font-weight:700">🖼️ Bild laden</span></div>';
    cardsHtml+='<div onclick="openProductDetail('+i+')" style="background:var(--s1);border:1px solid var(--bd);border-radius:12px;padding:14px;cursor:pointer;display:flex;flex-direction:column;gap:8px;transition:border-color .12s" onmouseover="this.style.borderColor=\'var(--ac)\'" onmouseout="this.style.borderColor=\'var(--bd)\'">'
      +imgBlock
      +'<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px"><div style="font-weight:700;color:var(--tx);font-size:14px;line-height:1.3">'+(p.name?esc(p.name):'<span style="color:var(--rd)">⚠️ Ohne Namen</span>')+(p.asin?'<br><span style="font-size:10px;color:var(--tx2);font-weight:400">'+esc(p.asin)+'</span>':'')+'</div><span class="badge '+sc+'" style="flex-shrink:0">'+esc(p.status)+'</span></div>'
      +(p.kategorie?'<div style="font-size:11.5px;color:var(--tx2)">🏷️ '+esc(p.kategorie)+'</div>':'')
      +'<div style="display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--tx2);border-top:1px solid var(--bd);padding-top:8px">'
        +'<span>EK <b style="color:var(--tx)">'+fmt(p.einkaufspreis)+'</b></span>'
        +'<span>VK <b style="color:var(--tx)">'+fmt(p.verkaufspreis)+'</b></span>'
        +'<span>Marge <b style="color:var(--'+mcol+')">'+(c.m!==null?c.m.toFixed(1)+'%':'—')+'</b></span>'
        +'<span>ROI <b style="color:var(--tx)">'+(c.roi!==null?c.roi.toFixed(0)+'%':'—')+'</b></span>'
      +'</div>'
      +(p.quelle?'<div style="font-size:10.5px;color:var(--tx3)">Quelle: '+esc(p.quelle)+'</div>':'')
      +'<div onclick="event.stopPropagation()" style="display:flex;gap:6px;margin-top:2px">'
        +'<button class="btn btn-sm" onclick="openProductDetail('+i+')" style="background:linear-gradient(135deg,var(--ac),var(--ac2));color:#fff;border:none;font-weight:600;font-size:11px">📝 Details</button>'
        +'<button class="btn btn-sm" onclick="dupProd('+i+')" title="Duplizieren">📋</button>'
        +'<button class="btn btn-sm del" onclick="delProd('+i+')" title="Löschen">🗑️</button>'
      +'</div>'
    +'</div>';
  });
  document.getElementById('prodCards').innerHTML=cardsHtml;
  var hasItems=fl.length>0;
  document.getElementById('prodEmpty').style.display=hasItems?'none':'block';
  document.getElementById('prodTable').style.display=(hasItems&&prodView==='table')?'table':'none';
  document.getElementById('prodCards').style.display=(hasItems&&prodView==='cards')?'grid':'none';
  var _bt=document.getElementById('prodViewTable'),_bc=document.getElementById('prodViewCards');
  if(_bt&&_bc){
    _bt.style.background=prodView==='table'?'var(--ac)':'transparent';_bt.style.color=prodView==='table'?'#fff':'var(--tx2)';
    _bc.style.background=prodView==='cards'?'var(--ac)':'transparent';_bc.style.color=prodView==='cards'?'#fff':'var(--tx2)';
  }
  document.getElementById('prodCount').textContent=D.products.length+' Produkte';
  // stats
  document.getElementById('stTotal').textContent=D.products.length;
  document.getElementById('stIdee').textContent=D.products.filter(function(p){return p.status==='Idee'}).length;
  document.getElementById('stAna').textContent=D.products.filter(function(p){return p.status==='Analyse'||p.status==='Recherche'}).length;
  document.getElementById('stBest').textContent=D.products.filter(function(p){return p.status==='Bestellt'}).length;
  var ms=D.products.map(function(p){return cp(p).m}).filter(function(m){return m!==null});
  document.getElementById('stMarge').textContent=ms.length?(ms.reduce(function(a,b){return a+b},0)/ms.length).toFixed(1)+'%':'—';
  // kat filter
  var ks={};D.products.forEach(function(p){if(p.kategorie)ks[p.kategorie]=1});
  var sel=document.getElementById('fKat'),cv=sel.value;
  sel.innerHTML='<option value="">Alle Kategorien</option>';
  Object.keys(ks).sort().forEach(function(k){sel.innerHTML+='<option'+(k===cv?' selected':'')+'>'+esc(k)+'</option>'});
  var dl=document.getElementById('kl');dl.innerHTML='';
  Object.keys(ks).sort().forEach(function(k){var o=document.createElement('option');o.value=k;dl.appendChild(o)});
  updateProdBulkBar();
}

// ═══════════════ PRODUCT BULK SELECTION ═══════════════
function prodToggleSelect(idx,checked){
  var pos=selectedProds.indexOf(idx);
  if(checked&&pos===-1)selectedProds.push(idx);
  else if(!checked&&pos>-1)selectedProds.splice(pos,1);
  // Update row highlighting
  var cb=document.querySelector('.prod-check[data-idx="'+idx+'"]');
  if(cb){
    var tr=cb.closest('tr');
    if(tr)tr.style.background=checked?'var(--acd)':'';
  }
  updateProdBulkBar();
}

function prodToggleSelectAll(checked){
  selectedProds=[];
  if(checked){
    document.querySelectorAll('.prod-check').forEach(function(cb){
      var idx=parseInt(cb.getAttribute('data-idx'));
      selectedProds.push(idx);
      cb.checked=true;
      var tr=cb.closest('tr');
      if(tr)tr.style.background='var(--acd)';
    });
  }else{
    document.querySelectorAll('.prod-check').forEach(function(cb){
      cb.checked=false;
      var tr=cb.closest('tr');
      if(tr)tr.style.background='';
    });
  }
  updateProdBulkBar();
}

function prodClearSelection(){
  selectedProds=[];
  var sa=document.getElementById('prodSelAll');if(sa){sa.checked=false;sa.indeterminate=false}
  document.querySelectorAll('.prod-check').forEach(function(cb){
    cb.checked=false;
    var tr=cb.closest('tr');
    if(tr)tr.style.background='';
  });
  updateProdBulkBar();
}

function updateProdBulkBar(){
  var bar=document.getElementById('prodBulkBar');
  var txt=document.getElementById('prodBulkCount');
  if(!bar)return;
  if(selectedProds.length>0){
    bar.style.display='flex';
    if(txt)txt.textContent=selectedProds.length+(selectedProds.length===1?' ausgewählt':' ausgewählt');
  }else{
    bar.style.display='none';
  }
  var selAll=document.getElementById('prodSelAll');
  if(selAll){
    var visible=document.querySelectorAll('.prod-check').length;
    if(selectedProds.length===0){selAll.checked=false;selAll.indeterminate=false}
    else if(selectedProds.length>=visible&&visible>0){selAll.checked=true;selAll.indeterminate=false}
    else{selAll.indeterminate=true}
  }
}

function prodBulkDelete(){
  if(selectedProds.length===0)return;
  var names=selectedProds.slice(0,3).map(function(idx){return D.products[idx]?D.products[idx].name:''}).filter(Boolean);
  var more=selectedProds.length>3?' und '+(selectedProds.length-3)+' weitere':'';
  if(!confirm(selectedProds.length+' Produkt(e) wirklich löschen?\n\n'+names.join(', ')+more))return;
  // Sort desc so splicing doesn't shift indexes
  var toDel=selectedProds.slice().sort(function(a,b){return b-a});
  toDel.forEach(function(idx){D.products.splice(idx,1)});
  var count=selectedProds.length;
  selectedProds=[];
  save();renderProds();
  toast('✓ '+count+' Produkt(e) gelöscht');
}

function prodBulkSetStatus(newStatus){
  if(selectedProds.length===0)return;
  selectedProds.forEach(function(idx){
    if(D.products[idx])D.products[idx].status=newStatus;
  });
  var count=selectedProds.length;
  selectedProds=[];
  save();renderProds();
  toast('✓ '+count+' Produkt(e) → '+newStatus);
}

function psort(f){if(pSort.f===f)pSort.d=pSort.d==='asc'?'desc':'asc';else{pSort.f=f;pSort.d='asc';}renderProds()}

function openProdModal(i){
  editIdx=typeof i==='number'?i:-1;
  document.getElementById('pmTitle').textContent=editIdx>=0?'Bearbeiten':'Neues Produkt';
  document.getElementById('pmBtn').textContent=editIdx>=0?'Aktualisieren':'Speichern';
  if(editIdx>=0){var p=D.products[i];
    document.getElementById('fNa').value=p.name||'';document.getElementById('fKa').value=p.kategorie||'';
    document.getElementById('fSt').value=p.status||'Idee';document.getElementById('fAs').value=p.asin||'';
    document.getElementById('fImg').value=p.bild||'';
    document.getElementById('fQu').value=p.quelle||'';document.getElementById('fBw').value=p.bewertung||0;
    document.getElementById('fEK').value=p.einkaufspreis||'';document.getElementById('fVK').value=p.verkaufspreis||'';
    document.getElementById('fFBA').value=p.fbaGebuehren||'';document.getElementById('fVs').value=p.versand||'';
    document.getElementById('fZl').value=p.zoll||'';document.getElementById('fSo').value=p.sonstigeKosten||'';
    document.getElementById('fGw').value=p.gewicht||'';document.getElementById('fMa').value=p.masse||'';
    document.getElementById('fBS').value=p.bsr||'';document.getElementById('fBe').value=p.bewertungen||'';
    document.getElementById('fWb').value=p.wettbewerber||'';document.getElementById('fSV').value=p.suchvolumen||'';
    document.getElementById('fNo').value=p.notizen||'';fCalc();
  }else{document.querySelectorAll('#prodModal input,#prodModal textarea,#prodModal select').forEach(function(el){if(el.tagName==='SELECT')el.selectedIndex=0;else el.value='';});
    ['fLC','fLG','fLM','fLR'].forEach(function(id){document.getElementById(id).textContent='—'});}
  document.getElementById('prodModal').classList.add('show');
  setTimeout(function(){document.getElementById('fNa').focus()},100);
}
function closePM(){document.getElementById('prodModal').classList.remove('show');editIdx=-1}

function fCalc(){
  var vk=pf('fVK'),ek=pf('fEK'),fba=pf('fFBA'),vs=pf('fVs'),zl=pf('fZl'),so=pf('fSo');
  var tc=ek+fba+vs+zl+so,pr=vk-tc,m=vk>0?(pr/vk)*100:null,roi=ek>0?(pr/ek)*100:null;
  document.getElementById('fLC').textContent=tc>0?tc.toFixed(2)+'€':'—';
  var g=document.getElementById('fLG');g.textContent=vk>0?pr.toFixed(2)+'€':'—';g.style.color=m>=30?'var(--gn)':m>=15?'var(--ac)':'var(--rd)';
  var me=document.getElementById('fLM');me.textContent=m!==null?m.toFixed(1)+'%':'—';me.style.color=m>=30?'var(--gn)':m>=15?'var(--ac)':'var(--rd)';
  var re=document.getElementById('fLR');re.textContent=roi!==null?roi.toFixed(0)+'%':'—';re.style.color=roi>=100?'var(--gn)':roi>=50?'var(--ac)':'var(--rd)';
}

function saveProd(){
  var n=document.getElementById('fNa').value.trim();if(!n)return;
  // Bestehendes Produkt als Basis behalten (bewahrt bild, helSales etc.), nur Modal-Felder überschreiben
  var base=editIdx>=0?D.products[editIdx]:{};
  var p=Object.assign({},base,{name:n,kategorie:document.getElementById('fKa').value.trim(),status:document.getElementById('fSt').value,
    asin:document.getElementById('fAs').value.trim(),bild:document.getElementById('fImg').value.trim(),quelle:document.getElementById('fQu').value.trim(),
    bewertung:parseInt(document.getElementById('fBw').value)||0,
    einkaufspreis:pf('fEK'),verkaufspreis:pf('fVK'),fbaGebuehren:pf('fFBA'),versand:pf('fVs'),zoll:pf('fZl'),sonstigeKosten:pf('fSo'),
    gewicht:parseInt(document.getElementById('fGw').value)||0,masse:document.getElementById('fMa').value.trim(),
    bsr:parseInt(document.getElementById('fBS').value)||0,bewertungen:parseInt(document.getElementById('fBe').value)||0,
    wettbewerber:parseInt(document.getElementById('fWb').value)||0,suchvolumen:parseInt(document.getElementById('fSV').value)||0,
    notizen:document.getElementById('fNo').value.trim(),
    datum:editIdx>=0?D.products[editIdx].datum:new Date().toLocaleDateString('de-DE')});
  if(editIdx>=0){D.products[editIdx]=p;toast('Aktualisiert ✓')}else{D.products.push(p);toast('Hinzugefügt ✓')}
  save();renderProds();closePM();
}
function editProd(i){openProdModal(i)}
function dupProd(i){var c=JSON.parse(JSON.stringify(D.products[i]));c.name+=' (Kopie)';c.datum=new Date().toLocaleDateString('de-DE');D.products.push(c);save();renderProds();toast('Dupliziert ✓')}
function delProd(i){if(confirm('„'+D.products[i].name+'" löschen?')){D.products.splice(i,1);save();renderProds();toast('Gelöscht')}}
// Hauptbild für ein Produkt von Amazon holen (per ASIN) – nutzt die vorhandene Import-Engine
async function productFetchImage(i){
  var p=D.products[i];if(!p)return;
  if(!p.asin){openProdModal(i);setTimeout(function(){var f=document.getElementById('fImg');if(f)f.focus();},120);toast('Keine ASIN – bitte Bild-URL manuell eintragen');return;}
  if(!window.SHImport||!window.SHImport.fetchListing){toast('Import-Engine nicht geladen – bitte Seite neu laden');return;}
  toast('⏳ Lade Amazon-Bild …');
  try{
    var data=await window.SHImport.fetchListing(p.asin);
    var img=(data&&data.imageUrls&&data.imageUrls[0])||'';
    if(!img){toast('⚠️ Kein Bild gefunden (evtl. blockiert) – später erneut oder URL manuell eintragen');return;}
    D.products[i].bild=img;save();renderProds();toast('✓ Bild geladen');
  }catch(err){toast('⚠️ Bild-Abruf fehlgeschlagen: '+(err&&err.message||'Fehler'));}
}
function toCalc(i){var p=D.products[i];document.getElementById('qEK').value=p.einkaufspreis||'';document.getElementById('qVK').value=p.verkaufspreis||'';document.getElementById('qFBA').value=p.fbaGebuehren||'';document.getElementById('qShip').value=p.versand||'';document.getElementById('qZoll').value=p.zoll||'';document.getElementById('qSon').value=p.sonstigeKosten||'';go('gebuehren');switchCalcTab('quick');qCalc();toast('Daten übernommen ✓')}

// ═══════════════ PRODUCT DETAIL VIEW ═══════════════
var currentDetailIdx=-1;

function openProductDetail(idx){
  if(idx<0||idx>=D.products.length)return;
  currentDetailIdx=idx;
  var p=D.products[idx];

  // Hauptbild im Kopf (Klick → Amazon, Hover → pzoom-Vorschau)
  var hi=document.getElementById('dHeadImg');
  if(hi){
    if(p.bild){
      hi.innerHTML='<img src="'+esc(p.bild)+'" class="pzoom" alt="" style="width:54px;height:54px;object-fit:cover;border-radius:11px;border:1px solid var(--bd);background:#fff" onerror="this.parentNode.innerHTML=\'\'">';
      if(p.asin){
        hi.style.cursor='zoom-in';
        hi.onclick=function(ev){ev.stopPropagation();window.open('https://www.amazon.de/dp/'+p.asin,'_blank');};
        hi.title='Auf Amazon öffnen ('+p.asin+')';
      }else{hi.onclick=function(ev){ev.stopPropagation();};hi.title='';}
    }else{hi.innerHTML='';hi.onclick=null;}
  }

  // Header info
  var titleEl=document.getElementById('dTitle');
  if(p.name){
    titleEl.textContent=p.name;
    titleEl.style.color='var(--ac)';
    titleEl.style.fontStyle='normal';
    document.title=WIKA_NAME+' – '+p.name+' – v'+WIKA_VERSION;
  }else{
    titleEl.textContent='⚠️ Ohne Namen';
    titleEl.style.color='var(--rd)';
    titleEl.style.fontStyle='italic';
    document.title=WIKA_NAME+' v'+WIKA_VERSION;
  }
  var statusEl=document.getElementById('dStatus');
  var sc=p.status==='Idee'?'b-idee':p.status==='Recherche'?'b-recherche':p.status==='Analyse'?'b-analyse':p.status==='Bestellt'?'b-bestellt':'b-abgelehnt';
  statusEl.className='badge '+sc;
  statusEl.textContent=p.status||'—';
  document.getElementById('dKategorie').textContent=p.kategorie?'📂 '+p.kategorie:'';
  document.getElementById('dAsin').textContent=p.asin?'ASIN: '+p.asin:'';
  document.getElementById('dDatum').textContent=p.datum?'📅 '+p.datum:'';

  // Overview tab
  document.getElementById('dfStatus').value=p.status||'Idee';
  document.getElementById('dfBewertung').value=p.bewertung||0;
  var nameInput=document.getElementById('dfName');
  nameInput.value=p.name||'';
  nameInput.style.borderColor=p.name?'':'var(--rd)';
  nameInput.style.background=p.name?'':'rgba(255,90,90,.08)';
  document.getElementById('dfKategorie').value=p.kategorie||'';
  document.getElementById('dfAsin').value=p.asin||'';
  document.getElementById('dfQuelle').value=p.quelle||'';
  document.getElementById('dfGewicht').value=p.gewicht||'';
  document.getElementById('dfMasse').value=p.masse||'';
  document.getElementById('dfNotizen').value=p.notizen||'';

  // Recherche tab
  document.getElementById('dfBeschreibung').value=p.beschreibung||'';
  document.getElementById('dfMarktanalyse').value=p.marktanalyse||'';
  document.getElementById('dfKonkurrenz').value=p.konkurrenz||'';
  document.getElementById('dfSnapshots').value=p.snapshots||'';
  document.getElementById('dfReviews').value=p.reviewsInsight||'';
  document.getElementById('dfTrends').value=p.trends||'';
  document.getElementById('dfPro').value=p.pro||'';
  document.getElementById('dfContra').value=p.contra||'';
  document.getElementById('dfAnalyse').value=p.analyse||'';
  document.getElementById('dfQuellen').value=p.quellen||'';

  // Kalkulation tab
  document.getElementById('dfEK').value=p.einkaufspreis||'';
  document.getElementById('dfVK').value=p.verkaufspreis||'';
  document.getElementById('dfFBA').value=p.fbaGebuehren||'';
  document.getElementById('dfVersand').value=p.versand||'';
  document.getElementById('dfZoll').value=p.zoll||'';
  document.getElementById('dfSonstige').value=p.sonstigeKosten||'';
  document.getElementById('dfMenge').value=p.bestellmenge||'';
  document.getElementById('dfVerkaeufe').value=p.verkaeufeMonat||'';
  document.getElementById('dfPPC').value=p.ppcMonat||'';

  // Render Hersteller links and supplier table
  renderDetailHerstellerLinks();
  renderDetailSuppliers();

  // Show market-data indicator dot if Helium 10 data exists
  var salesInd=document.getElementById('salesCount');
  if(salesInd){
    if(productHasHeliumData(p)){
      salesInd.style.display='inline-block';
      salesInd.style.color='var(--gn)';
    }else{
      salesInd.style.display='none';
    }
  }

  // Recalculate live values
  recalcDetail();

  // Switch to detail page
  go('detail');
  // Default to overview sub-tab
  goSub('overview');
  // Reset save status
  setDetailSaved();
}

function goSub(name){
  document.querySelectorAll('.subpage').forEach(function(p){p.classList.remove('active')});
  var sub=document.getElementById('sub-'+name);
  if(sub)sub.classList.add('active');
  document.querySelectorAll('.subtab').forEach(function(t){t.classList.remove('active')});
  document.querySelectorAll('.subtab').forEach(function(t){
    if(t.getAttribute('data-sub')===name)t.classList.add('active');
  });
  if(name==='sales')renderDetailSales();
}

// Liefert ein lesbares Label zur erkannten Helium-Quelle
function heliumSourceLabel(type){
  return type==='xray'?'Xray':type==='blackbox'?'Black Box':type==='asin_generic'?'ASIN-Liste':(type||'Helium 10');
}

// Hat das Produkt strukturierte Helium-10-Marktdaten?
function productHasHeliumData(p){
  if(!p)return false;
  return p.helSales!=null||p.helRevenue!=null||p.helBsr!=null||p.helReviews!=null||p.helRating!=null||p.helSellers!=null||p.helPrice!=null;
}

function renderDetailSales(){
  if(currentDetailIdx<0)return;
  var p=D.products[currentDetailIdx];
  var container=document.getElementById('dSalesContent');
  if(!container)return;

  var indicator=document.getElementById('salesCount');

  // ── Leerzustand: noch keine Helium-Marktdaten → handlungsfähiger CTA ──
  if(!productHasHeliumData(p)){
    var asinHint=p.asin
      ? 'Wird automatisch der Zeile mit ASIN <b style="font-family:monospace;color:var(--ac)">'+esc(p.asin)+'</b> zugeordnet.'
      : 'Tipp: Hinterlege oben unter <b>Übersicht</b> die ASIN – dann wird die passende Zeile automatisch erkannt.';
    container.innerHTML='<div class="card"><div style="text-align:center;padding:40px 24px">'+
      '<div style="font-size:48px;margin-bottom:14px;opacity:.55">📈</div>'+
      '<h3 style="margin-bottom:8px">Noch keine Marktdaten</h3>'+
      '<p style="color:var(--tx2);margin:0 auto 6px;max-width:460px">Importiere die <b>Helium-10-Daten</b> (Xray oder Black Box) für genau dieses Produkt. Verkäufe/Monat, Umsatz, BSR, Reviews &amp; Rating werden dann hier angezeigt.</p>'+
      '<p style="color:var(--tx3);font-size:12px;margin:0 auto 18px;max-width:460px">'+asinHint+'</p>'+
      '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">'+
        '<button class="btn btn-p" onclick="importHeliumForProduct()">📥 Helium-10-Daten importieren</button>'+
        '<button class="btn" onclick="estimateHeliumForProduct()">🔢 Aus BSR schätzen</button>'+
      '</div>'+
      '</div></div>';
    if(indicator)indicator.style.display='none';
    return;
  }

  // ── Gefüllt: Helium-Marktdaten anzeigen ──
  var src=p.helSource||'Helium 10';
  var stand=p.helDate||'—';
  var num=function(v){return v!=null?Math.round(v).toLocaleString('de-DE'):'—'};

  var html='';

  // Kopfzeile mit Quelle + Aktionen
  html+='<div class="card" style="margin-bottom:16px"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">'+
    '<div><h3 style="margin:0">📈 Marktdaten aus Helium 10</h3>'+
    '<div style="font-size:11px;color:var(--tx2);margin-top:3px">Quelle: Helium 10 ('+esc(src)+')'+(p.asin?' · ASIN <span style="font-family:monospace">'+esc(p.asin)+'</span>':'')+' · Stand '+esc(stand)+'</div></div>'+
    '<div style="display:flex;gap:8px">'+
      '<button class="btn btn-sm" onclick="importHeliumForProduct()" title="Neue Helium-10-CSV einlesen und Werte aktualisieren">📥 Aktualisieren</button>'+
      '<button class="btn btn-sm btn-d" onclick="clearProductSalesData()" title="Marktdaten dieses Produkts löschen">🗑️ Löschen</button>'+
    '</div></div></div>';

  // Stat-Karten
  html+='<div class="detail-row three" style="margin-bottom:18px">';

  // Verkäufe & Umsatz (monatlich, geschätzt)
  html+='<div class="card"><h3>💰 Verkäufe &amp; Umsatz <span style="font-weight:400;color:var(--tx2);font-size:11px">/ Monat</span></h3>';
  html+='<div class="cg" style="grid-template-columns:1fr 1fr">';
  html+='<div class="ci"><span class="cl">Verkäufe</span><span class="cv" style="color:var(--gn)">'+num(p.helSales)+'</span></div>';
  html+='<div class="ci"><span class="cl">Umsatz</span><span class="cv" style="color:var(--gn);font-size:18px">'+(p.helRevenue!=null?fmt(p.helRevenue)+'€':'—')+'</span></div>';
  html+='</div></div>';

  // Markt-Position
  html+='<div class="card"><h3>🏆 Markt-Position</h3>';
  html+='<div class="cg" style="grid-template-columns:1fr 1fr">';
  html+='<div class="ci"><span class="cl">BSR</span><span class="cv" style="color:var(--bl)">'+(p.helBsr!=null?'#'+num(p.helBsr):'—')+'</span></div>';
  html+='<div class="ci"><span class="cl">Rating</span><span class="cv" style="color:var(--ac)">'+(p.helRating!=null?p.helRating.toFixed(1)+' ⭐':'—')+'</span></div>';
  html+='<div class="ci"><span class="cl">Reviews</span><span class="cv" style="color:var(--pu)">'+num(p.helReviews)+'</span></div>';
  html+='<div class="ci"><span class="cl">Verkäufer</span><span class="cv" style="color:var(--or)">'+(p.helSellers!=null?p.helSellers:'—')+'</span></div>';
  html+='</div></div>';

  // Listing-Eckdaten
  html+='<div class="card"><h3>🏷️ Listing</h3>';
  html+='<div class="cg" style="grid-template-columns:1fr 1fr">';
  html+='<div class="ci"><span class="cl">Preis</span><span class="cv">'+(p.helPrice!=null?fmt(p.helPrice)+'€':'—')+'</span></div>';
  html+='<div class="ci"><span class="cl">Gewicht</span><span class="cv" style="color:var(--cy)">'+(p.helWeight!=null?p.helWeight+' kg':'—')+'</span></div>';
  html+='<div class="ci" style="grid-column:1/3"><span class="cl">Kategorie</span><span class="cv" style="font-size:13px">'+(p.helCategory?esc(p.helCategory):'—')+'</span></div>';
  html+='</div></div>';

  html+='</div>';// end three-col

  html+='<div style="font-size:11px;color:var(--tx3);font-style:italic">💡 Helium-10-Werte sind Markt-Schätzungen (Verkäufe/Umsatz pro Monat), keine Echtdaten aus Seller Central. Über „📥 Aktualisieren" jederzeit mit einem frischen Export überschreiben.</div>';

  container.innerHTML=html;

  if(indicator){indicator.style.display='inline-block';indicator.style.color='var(--gn)';}
}

// Öffnet einen Datei-Dialog, um eine Helium-10-CSV für DIESES Produkt einzulesen
function importHeliumForProduct(){
  if(currentDetailIdx<0)return;
  var prodIdx=currentDetailIdx;
  var inp=document.createElement('input');
  inp.type='file';inp.accept='.csv,.tsv,.txt';inp.style.display='none';
  inp.onchange=function(e){handleHeliumProductFile(e,prodIdx);if(inp.parentNode)inp.parentNode.removeChild(inp);};
  document.body.appendChild(inp);
  inp.click();
}

function handleHeliumProductFile(e,prodIdx){
  var f=e.target.files[0];if(!f)return;
  var r=new FileReader();
  r.onload=function(ev){
    var parsed=parseCSV(ev.target.result);
    if(!parsed.headers||parsed.headers.length===0){toast('Keine Daten in der Datei');return}
    var type=detectHeliumType(parsed.headers);
    if(type==='keywords'){toast('Das ist ein Keyword-Export – hier brauchst du Black Box oder Xray');return}
    var rows=parsed.rows.map(function(rw){return mapHeliumRow(rw,type)}).filter(function(rw){return rw.asin});
    if(rows.length===0){toast('Keine ASIN-Zeilen in der Datei gefunden');return}
    var p=D.products[prodIdx];
    var asin=(p.asin||'').trim().toUpperCase();
    var match=null;
    if(asin){match=rows.filter(function(rw){return(rw.asin||'').trim().toUpperCase()===asin})[0];}
    if(match){applyHeliumToProduct(prodIdx,match,type);}
    else if(rows.length===1){applyHeliumToProduct(prodIdx,rows[0],type);}
    else{heliumPickForProduct(prodIdx,rows,type);}
  };
  r.readAsText(f,'UTF-8');
}

// Keine eindeutige ASIN-Zuordnung → Auswahlliste direkt im Tab
function heliumPickForProduct(prodIdx,rows,type){
  var container=document.getElementById('dSalesContent');
  if(!container)return;
  window._heliumPickRows=rows;window._heliumPickType=type;window._heliumPickProd=prodIdx;
  var p=D.products[prodIdx];
  var html='<div class="card"><h3>📥 Passende Zeile auswählen</h3>'+
    '<p style="color:var(--tx2);font-size:12px;margin-bottom:12px">'+(p.asin?'Keine Zeile mit ASIN <b style="font-family:monospace">'+esc(p.asin)+'</b> gefunden. ':'')+'Wähle die Zeile, die zu „<b>'+esc(p.name||'')+'</b>" gehört:</p>'+
    '<div style="max-height:360px;overflow:auto;border:1px solid var(--bd);border-radius:8px"><table style="width:100%;font-size:11px"><thead><tr style="position:sticky;top:0;background:var(--s2);z-index:1">'+
    '<th style="text-align:left;padding:6px 10px">ASIN</th><th style="text-align:left;padding:6px 10px;min-width:180px">Produkt</th><th class="nc" style="padding:6px 10px">Sales/M</th><th class="nc" style="padding:6px 10px">Revenue/M</th><th style="padding:6px 10px"></th></tr></thead><tbody>';
  rows.slice(0,60).forEach(function(r,i){
    html+='<tr style="border-bottom:1px solid var(--bd)">'+
      '<td style="padding:5px 10px;font-family:monospace;color:var(--tx2)">'+esc(r.asin||'—')+'</td>'+
      '<td style="padding:5px 10px">'+esc((r.name||'').substring(0,60))+'</td>'+
      '<td class="nc" style="padding:5px 10px;color:var(--gn)">'+(r.sales!=null?Math.round(r.sales):'—')+'</td>'+
      '<td class="nc" style="padding:5px 10px;color:var(--gn)">'+(r.revenue!=null?fmt(r.revenue)+'€':'—')+'</td>'+
      '<td style="padding:5px 10px;text-align:right"><button class="btn btn-sm btn-p" onclick="applyHeliumPick('+i+')">übernehmen</button></td>'+
    '</tr>';
  });
  html+='</tbody></table></div>'+
    '<div style="margin-top:12px"><button class="btn btn-sm" onclick="renderDetailSales()">Abbrechen</button></div></div>';
  container.innerHTML=html;
}

function applyHeliumPick(i){
  var rows=window._heliumPickRows||[];
  if(!rows[i])return;
  applyHeliumToProduct(window._heliumPickProd,rows[i],window._heliumPickType);
}

// Schreibt die Helium-Marktdaten einer Zeile strukturiert aufs Produkt
function applyHeliumToProduct(prodIdx,r,type){
  var p=D.products[prodIdx];
  if(!p)return;
  if(r.sales!=null)p.helSales=r.sales;
  if(r.revenue!=null)p.helRevenue=r.revenue;
  if(r.bsr!=null)p.helBsr=r.bsr;
  if(r.reviews!=null)p.helReviews=r.reviews;
  if(r.rating!=null)p.helRating=r.rating;
  if(r.sellers!=null)p.helSellers=r.sellers;
  if(r.price!=null)p.helPrice=r.price;
  if(r.category)p.helCategory=r.category;
  if(r.weight!=null)p.helWeight=r.weight;
  p.helSource=heliumSourceLabel(type);
  p.helDate=new Date().toLocaleDateString('de-DE');
  if(!p.asin&&r.asin)p.asin=r.asin;
  save();
  renderDetailSales();
  if(typeof renderProds==='function')renderProds();
  toast('✓ Helium-10-Daten übernommen');
}

// Inline-BSR-Schätzer im Marktdaten-Tab (nutzt dieselbe Logik wie die Seller-Tools)
function estimateHeliumForProduct(){
  if(currentDetailIdx<0)return;
  var p=D.products[currentDetailIdx];
  var container=document.getElementById('dSalesContent');
  if(!container)return;
  var catOpts=BSR_CATS.map(function(c){return '<option value="'+c.key+'">'+esc(c.label)+'</option>'}).join('');
  var bsrPre=p.helBsr!=null?p.helBsr:(p.bsr||'');
  var pricePre=p.helPrice!=null?p.helPrice:(p.verkaufspreis||'');
  container.innerHTML='<div class="card"><h3>🔢 Verkäufe aus BSR schätzen</h3>'+
    '<p style="color:var(--tx2);font-size:12px;margin-bottom:12px">Schätzt monatliche Verkäufe &amp; Umsatz aus dem BSR – als Alternative zum Helium-Import. <a onclick="go(\'tools\')" style="color:var(--pu);cursor:pointer">Mehr (inkl. Kalibrierung) in den Seller-Tools →</a></p>'+
    '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:end">'+
      '<div class="fi" style="margin:0"><label>Kategorie</label><select id="estCat">'+catOpts+'</select></div>'+
      '<div class="fi" style="margin:0"><label>BSR</label><input id="estBsr" type="number" value="'+bsrPre+'" placeholder="z. B. 4500" style="width:130px" oninput="estPreview()"></div>'+
      '<div class="fi" style="margin:0"><label>Preis €</label><input id="estPrice" type="number" step="0.01" value="'+pricePre+'" style="width:120px" oninput="estPreview()"></div>'+
    '</div>'+
    '<div id="estPreviewBox" style="margin:14px 0;font-size:13px;color:var(--tx2)"></div>'+
    '<div style="display:flex;gap:8px"><button class="btn btn-p" onclick="estApply()">✓ Übernehmen</button><button class="btn btn-sm" onclick="renderDetailSales()">Abbrechen</button></div>'+
    '</div>';
  estPreview();
}
function estPreview(){
  var cat=document.getElementById('estCat').value;
  var bsr=document.getElementById('estBsr').value;
  var price=parseFloat(document.getElementById('estPrice').value);
  var m=estimateMonthlySalesBsr(cat,bsr);
  var box=document.getElementById('estPreviewBox');
  if(m==null){box.innerHTML='<span style="color:var(--tx3)">BSR eingeben für Schätzung …</span>';return;}
  box.innerHTML='≈ <b style="color:var(--gn)">'+Math.round(m).toLocaleString('de-DE')+'</b> Verkäufe/Monat'+(price>0?' · <b style="color:var(--gn)">'+fmt(m*price)+'€</b> Umsatz/Monat':'');
}
function estApply(){
  if(currentDetailIdx<0)return;
  var p=D.products[currentDetailIdx];
  var cat=document.getElementById('estCat').value;
  var bsr=parseFloat(document.getElementById('estBsr').value);
  var price=parseFloat(document.getElementById('estPrice').value);
  var m=estimateMonthlySalesBsr(cat,bsr);
  if(m==null){toast('Bitte gültigen BSR eingeben');return;}
  p.helSales=Math.round(m);
  if(price>0){p.helRevenue=m*price;p.helPrice=price;}
  p.helBsr=bsr;
  p.helSource='BSR-Schätzung';
  p.helDate=new Date().toLocaleDateString('de-DE');
  save();
  renderDetailSales();
  if(typeof renderProds==='function')renderProds();
  toast('✓ Schätzung übernommen');
}

function clearProductSalesData(){
  if(currentDetailIdx<0)return;
  var p=D.products[currentDetailIdx];
  if(!confirm('Helium-10-Marktdaten für „'+p.name+'" löschen? Das kann nicht rückgängig gemacht werden.'))return;
  ['helSales','helRevenue','helBsr','helReviews','helRating','helSellers','helPrice','helCategory','helWeight','helSource','helDate'].forEach(function(k){delete p[k]});
  if(p.asin&&D.salesData&&D.salesData[p.asin])delete D.salesData[p.asin];
  save();
  renderDetailSales();
  toast('Marktdaten gelöscht');
}

// ═══════════════════════════════════════════════════════════════
// BSR-Schätzer (Tab im Kalkulations-Center) + Scribbles (Tab im Keyword-Center)
// ═══════════════════════════════════════════════════════════════

// Füllt das BSR-Kategorie-Dropdown einmalig
function bsrPopulateCats(){
  var sel=document.getElementById('bsrCat');
  if(sel&&sel.options.length===0){
    BSR_CATS.forEach(function(c){
      var o=document.createElement('option');o.value=c.key;o.textContent=c.label;sel.appendChild(o);
    });
    sel.onchange=bsrCalc;
  }
  bsrCalc();
}

// ─────────────────────────────────────────────
// BSR → Verkäufe-Schätzer (Potenz-Modell)
//   monatl. Verkäufe = scale · BSR^(−SLOPE)
// ─────────────────────────────────────────────
var BSR_SLOPE=0.85;
var BSR_BASE=320000;
var BSR_CATS=[
  {key:'std',     label:'Standard / Sonstige',        mult:1.0},
  {key:'kueche',  label:'Küche & Haushalt',           mult:1.3},
  {key:'drogerie',label:'Drogerie & Körperpflege',    mult:1.25},
  {key:'beauty',  label:'Beauty',                      mult:1.2},
  {key:'elektro', label:'Elektronik',                  mult:1.15},
  {key:'spiel',   label:'Spielzeug',                   mult:1.1},
  {key:'sport',   label:'Sport & Freizeit',            mult:1.0},
  {key:'tier',    label:'Haustier',                    mult:0.95},
  {key:'garten',  label:'Garten',                      mult:0.9},
  {key:'baumarkt',label:'Baumarkt',                    mult:0.85},
  {key:'buero',   label:'Bürobedarf',                  mult:0.8}
];
function bsrGetCalib(){try{return JSON.parse(localStorage.getItem('bsr_calib')||'{}')}catch(e){return {}}}
function bsrSetCalib(o){try{localStorage.setItem('bsr_calib',JSON.stringify(o))}catch(e){}}
function bsrScaleFor(catKey){
  var cal=bsrGetCalib();
  if(cal[catKey]!=null)return cal[catKey];
  var c=BSR_CATS.filter(function(x){return x.key===catKey})[0];
  return BSR_BASE*(c?c.mult:1);
}
function estimateMonthlySalesBsr(catKey,bsr){
  bsr=parseFloat(bsr);
  if(!bsr||bsr<1)return null;
  return bsrScaleFor(catKey)*Math.pow(bsr,-BSR_SLOPE);
}
function bsrCalc(){
  var catEl=document.getElementById('bsrCat');if(!catEl)return;
  var cat=catEl.value||'std';
  var bsr=document.getElementById('bsrRank').value;
  var price=parseFloat(document.getElementById('bsrPrice').value);
  var monthly=estimateMonthlySalesBsr(cat,bsr);
  var dayEl=document.getElementById('bsrDay'),moEl=document.getElementById('bsrMonth'),revEl=document.getElementById('bsrRev'),stEl=document.getElementById('bsrCalibState');
  if(monthly==null){dayEl.textContent='—';moEl.textContent='—';revEl.textContent='—';}
  else{
    dayEl.textContent=Math.max(0,Math.round(monthly/30.4)).toLocaleString('de-DE');
    moEl.textContent=Math.round(monthly).toLocaleString('de-DE');
    revEl.textContent=(price>0)?fmt(monthly*price)+'€':'— (Preis fehlt)';
  }
  var cal=bsrGetCalib();
  stEl.textContent=cal[cat]!=null?'Kalibriert ✓':'Standard';
  stEl.style.color=cal[cat]!=null?'var(--gn)':'var(--tx2)';
}
function bsrCalibrate(){
  var cat=document.getElementById('bsrCat').value||'std';
  var r=parseFloat(document.getElementById('bsrCalRank').value);
  var s=parseFloat(document.getElementById('bsrCalSales').value);
  if(!r||r<1||!s||s<1){toast('Bitte gültigen BSR und echte Verkäufe/Monat eintragen');return;}
  var scale=s*Math.pow(r,BSR_SLOPE); // s = scale·r^−SLOPE  →  scale = s·r^SLOPE
  var cal=bsrGetCalib();cal[cat]=scale;bsrSetCalib(cal);
  bsrCalc();
  toast('🎯 Kategorie kalibriert');
}
function bsrResetCalib(){
  var cat=document.getElementById('bsrCat').value||'std';
  var cal=bsrGetCalib();delete cal[cat];bsrSetCalib(cal);
  bsrCalc();
  toast('Kalibrierung zurückgesetzt');
}

// ─────────────────────────────────────────────
// Scribbles – Listing-Keyword-Abdeckung (Tab im Keyword-Center)
// ─────────────────────────────────────────────
function scribblesRun(){
  var kwEl=document.getElementById('scKw');if(!kwEl)return;
  var kws=(kwEl.value||'').split(/\n+/).map(function(s){return s.trim()}).filter(function(s){return s.length>0});
  var title=(document.getElementById('scTitle').value||'').toLowerCase();
  var bullets=(document.getElementById('scBullets').value||'').toLowerCase();
  var desc=(document.getElementById('scDesc').value||'').toLowerCase();
  var all=title+' \n '+bullets+' \n '+desc;
  var out=document.getElementById('scOut');
  if(kws.length===0){out.innerHTML='<div style="color:var(--tx3);font-style:italic">Trag Keywords und Listing-Text ein …</div>';return;}
  function wordsIn(str,phrase){
    var ws=phrase.toLowerCase().split(/[^0-9a-zA-ZäöüÄÖÜß]+/).filter(function(w){return w.length>1});
    if(ws.length===0)return false;
    return ws.every(function(w){return str.indexOf(w)>-1;});
  }
  var covered=0;
  var rows='';
  kws.forEach(function(k){
    var inT=wordsIn(title,k),inB=wordsIn(bullets,k),inD=wordsIn(desc,k);
    var any=inT||inB||inD;
    if(any)covered++;
    function badge(on,l){return '<span style="display:inline-block;width:20px;text-align:center;border-radius:4px;font-size:10px;font-weight:700;margin-left:3px;background:'+(on?'var(--gnd)':'var(--s2)')+';color:'+(on?'var(--gn)':'var(--tx3)')+'">'+l+'</span>';}
    rows+='<tr style="border-bottom:1px solid var(--bd)">'+
      '<td style="padding:5px 8px">'+(any?'<span style="color:var(--gn)">✓</span>':'<span style="color:var(--rd)">✗</span>')+'</td>'+
      '<td style="padding:5px 8px;'+(any?'':'color:var(--rd);font-weight:600')+'">'+esc(k)+'</td>'+
      '<td style="padding:5px 8px;text-align:right">'+badge(inT,'T')+badge(inB,'B')+badge(inD,'D')+'</td>'+
    '</tr>';
  });
  var pct=Math.round(covered/kws.length*100);
  var col=pct>=80?'var(--gn)':pct>=50?'var(--ac)':'var(--rd)';
  out.innerHTML=
    '<div style="display:flex;align-items:center;gap:14px;margin-bottom:12px;flex-wrap:wrap">'+
      '<div style="font-size:28px;font-weight:800;color:'+col+'">'+pct+'%</div>'+
      '<div style="flex:1;min-width:160px"><div style="height:10px;background:var(--s2);border-radius:6px;overflow:hidden"><div style="height:100%;width:'+pct+'%;background:'+col+'"></div></div>'+
      '<div style="font-size:11px;color:var(--tx2);margin-top:4px">'+covered+' von '+kws.length+' Keywords abgedeckt · Titel '+title.length+' Zeichen</div></div>'+
    '</div>'+
    '<div style="overflow:auto;max-height:320px"><table style="width:100%;font-size:12px"><thead><tr style="position:sticky;top:0;background:var(--s2)"><th style="text-align:left;padding:5px 8px">✓</th><th style="text-align:left;padding:5px 8px">Keyword</th><th style="text-align:right;padding:5px 8px">T·B·D</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
    '<div style="margin-top:8px;font-size:11px;color:var(--tx3)">T = Titel · B = Bullets · D = Beschreibung. Abgedeckt = alle Wörter des Keywords kommen im Text vor.</div>';
}

function editTitleInline(){
  if(currentDetailIdx<0)return;
  // Switch to overview tab
  goSub('overview');
  // Scroll to and focus the name input
  setTimeout(function(){
    var nameInput=document.getElementById('dfName');
    if(nameInput){
      nameInput.scrollIntoView({behavior:'smooth',block:'center'});
      nameInput.focus();
      nameInput.select();
      // Visual flash to draw attention
      nameInput.style.transition='box-shadow .3s';
      nameInput.style.boxShadow='0 0 0 3px var(--ac)';
      setTimeout(function(){nameInput.style.boxShadow=''},1200);
    }
  },50);
}

// ─── Dirty tracking & manual save ───
var detailDirty=false;
var detailSaveTimer=null;

function setDetailDirty(){
  detailDirty=true;
  var st=document.getElementById('dSaveStatus');
  var btn=document.getElementById('dSaveBtn');
  if(st){
    st.textContent='● Ungespeicherte Änderungen';
    st.style.color='var(--or)';
    st.style.background='rgba(255,140,40,.12)';
  }
  if(btn){
    btn.style.animation='pulse 1.5s ease-in-out infinite';
    btn.style.boxShadow='0 0 0 0 var(--ac)';
  }
}

function setDetailSaved(){
  detailDirty=false;
  var st=document.getElementById('dSaveStatus');
  var btn=document.getElementById('dSaveBtn');
  if(st){
    st.textContent='✓ Gespeichert';
    st.style.color='var(--gn)';
    st.style.background='var(--s2)';
  }
  if(btn){
    btn.style.animation='';
    btn.style.boxShadow='';
  }
}

function saveDetailManual(){
  if(currentDetailIdx<0){toast('Kein Produkt geöffnet');return}
  // All fields are already saved via oninput, but force a save() call for safety
  save();
  setDetailSaved();
  // Re-render the list in background so it's up to date when user navigates back
  renderProds();
  toast('✓ Gespeichert');
  // Brief flash on the status indicator
  var st=document.getElementById('dSaveStatus');
  if(st){
    var orig=st.style.background;
    st.style.background='var(--gn)';
    st.style.color='#fff';
    setTimeout(function(){st.style.background=orig;st.style.color='var(--gn)'},600);
  }
}

function saveDetailField(field,value){
  if(currentDetailIdx<0)return;
  D.products[currentDetailIdx][field]=value;
  save();
  setDetailDirty();
  // Auto-clear dirty indicator after 800ms of no further changes
  if(detailSaveTimer)clearTimeout(detailSaveTimer);
  detailSaveTimer=setTimeout(function(){setDetailSaved()},800);
  // Update header if relevant fields changed
  if(field==='name'){
    var titleEl=document.getElementById('dTitle');
    if(value){
      titleEl.textContent=value;
      titleEl.style.color='var(--ac)';
      titleEl.style.fontStyle='normal';
      // Update browser tab title
      document.title=WIKA_NAME+' – '+value+' – v'+WIKA_VERSION;
    }else{
      titleEl.textContent='⚠️ Ohne Namen';
      titleEl.style.color='var(--rd)';
      titleEl.style.fontStyle='italic';
      document.title=WIKA_NAME+' v'+WIKA_VERSION;
    }
    // Visual feedback on the input itself
    var nameInput=document.getElementById('dfName');
    if(nameInput){
      nameInput.style.borderColor=value?'':'var(--rd)';
      nameInput.style.background=value?'':'rgba(255,90,90,.08)';
    }
  }
  if(field==='status'){
    var p=D.products[currentDetailIdx];
    var sc=value==='Idee'?'b-idee':value==='Recherche'?'b-recherche':value==='Analyse'?'b-analyse':value==='Bestellt'?'b-bestellt':'b-abgelehnt';
    var el=document.getElementById('dStatus');
    el.className='badge '+sc;
    el.textContent=value;
  }
  if(field==='kategorie')document.getElementById('dKategorie').textContent=value?'📂 '+value:'';
  if(field==='asin')document.getElementById('dAsin').textContent=value?'ASIN: '+value:'';
}

function recalcDetail(){
  if(currentDetailIdx<0)return;
  var p=D.products[currentDetailIdx];
  var c=cp(p);// existing calc helper

  // Overview cards
  document.getElementById('dMarge').textContent=c.m!==null?c.m.toFixed(1)+'%':'—';
  document.getElementById('dMarge').style.cssText=c.m!==null?mc(c.m):'';
  document.getElementById('dGewinn').textContent=(p.verkaufspreis&&!c.incomplete)?c.pr.toFixed(2)+'€':'—';
  document.getElementById('dGewinn').style.color=c.pr>=0?'var(--gn)':'var(--rd)';
  document.getElementById('dGewinn').title=c.incomplete?'Einkaufspreis + FBA-Gebühren im Tab „Kalkulation" eintragen':'';
  document.getElementById('dROI').textContent=c.roi!==null?c.roi.toFixed(0)+'%':'—';
  document.getElementById('dVK').textContent=p.verkaufspreis?fmt(p.verkaufspreis)+'€':'—';
  document.getElementById('dBSR').textContent=p.bsr?Number(p.bsr).toLocaleString('de-DE'):'—';
  document.getElementById('dWb').textContent=p.wettbewerber||'—';
  var _be=p.bewertungenZahl||p.bewertungen; // Alt-Feld „bewertungen" (Übernahme aus Engerer Wahl) mitlesen
  document.getElementById('dBe').textContent=_be?Number(_be).toLocaleString('de-DE'):'—';
  document.getElementById('dSv').textContent=p.suchvolumen?Number(p.suchvolumen).toLocaleString('de-DE'):'—';

  // Live calc card
  document.getElementById('dlcKosten').textContent=(p.verkaufspreis&&!c.incomplete)?c.tc.toFixed(2)+'€':'—';
  document.getElementById('dlcGewinn').textContent=(p.verkaufspreis&&!c.incomplete)?c.pr.toFixed(2)+'€':'—';
  document.getElementById('dlcGewinn').style.color=c.pr>=0?'var(--gn)':'var(--rd)';
  document.getElementById('dlcMarge').textContent=c.m!==null?c.m.toFixed(1)+'%':'—';
  document.getElementById('dlcMarge').style.cssText=c.m!==null?mc(c.m):'';
  document.getElementById('dlcROI').textContent=c.roi!==null?c.roi.toFixed(0)+'%':'—';

  // Investment
  var menge=parseInt(p.bestellmenge)||0;
  var ek=parseFloat(p.einkaufspreis)||0;
  document.getElementById('dInvest').textContent=(menge*ek).toFixed(2)+'€';

  // Break-even (cover PPC + investment recovery in 1 month)
  var ppc=parseFloat(p.ppcMonat)||0;
  var be='—';
  if(c.pr>0){
    var beStk=Math.ceil((ppc+menge*ek)/c.pr);
    be=beStk>0?beStk.toLocaleString('de-DE')+' Stk':'—';
  }
  document.getElementById('dlcBE').textContent=be;

  // Monthly profit
  var verkMonat=parseInt(p.verkaeufeMonat)||0;
  var monatlich=verkMonat*c.pr-ppc;
  document.getElementById('dlcMonatlich').textContent=verkMonat?monatlich.toFixed(2)+'€':'—';
  document.getElementById('dlcMonatlich').style.color=monatlich>=0?'var(--gn)':'var(--rd)';

  // Meter (margin viz)
  var meterPct=c.m!==null?Math.min(100,Math.max(0,c.m*2)):0;// 0-50% margin maps to 0-100% bar
  document.getElementById('dMeter').style.width=meterPct+'%';
  document.getElementById('dMeter').style.background=c.m>=30?'var(--gn)':c.m>=15?'var(--ac)':c.m>=0?'var(--or)':'var(--rd)';

  // Scenarios
  if(verkMonat&&c.pr){
    var pess=Math.round(verkMonat*0.7),real=verkMonat,opt=Math.round(verkMonat*1.3);
    var vk=parseFloat(p.verkaufspreis)||0;
    document.getElementById('dspS').textContent=pess+' Stk';
    document.getElementById('dspU').textContent=(pess*vk).toFixed(2)+'€';
    document.getElementById('dspG').textContent=(pess*c.pr-ppc).toFixed(2)+'€';
    document.getElementById('dsrS').textContent=real+' Stk';
    document.getElementById('dsrU').textContent=(real*vk).toFixed(2)+'€';
    document.getElementById('dsrG').textContent=(real*c.pr-ppc).toFixed(2)+'€';
    document.getElementById('dsoS').textContent=opt+' Stk';
    document.getElementById('dsoU').textContent=(opt*vk).toFixed(2)+'€';
    document.getElementById('dsoG').textContent=(opt*c.pr-ppc).toFixed(2)+'€';
  }else{
    ['dspS','dspU','dspG','dsrS','dsrU','dsrG','dsoS','dsoU','dsoG'].forEach(function(id){
      document.getElementById(id).textContent='—';
    });
  }
}

function duplicateCurrentProd(){
  if(currentDetailIdx<0)return;
  dupProd(currentDetailIdx);
  go('produkte');
}

function deleteCurrentProd(){
  if(currentDetailIdx<0)return;
  if(!confirm('„'+D.products[currentDetailIdx].name+'" wirklich löschen?'))return;
  D.products.splice(currentDetailIdx,1);
  currentDetailIdx=-1;
  save();renderProds();
  go('produkte');
  toast('Gelöscht');
}

// ─── Detail Hersteller-Suche Quick-Links ───
function renderDetailHerstellerLinks(){
  var wrap=document.getElementById('dHerstellerLinks');
  if(!wrap||currentDetailIdx<0){if(wrap)wrap.innerHTML='';return}
  var name=D.products[currentDetailIdx].name||'';
  if(!name){wrap.innerHTML='<div style="color:var(--tx3);font-size:12px">Erst Produktnamen festlegen</div>';return}

  var keywordsEN=toSearchKeywords(name);
  var encDE=encodeURIComponent(name);
  var encEN=encodeURIComponent(keywordsEN||name);

  var sources=[
    {flag:'🇨🇳',label:'Alibaba',color:'#ff6a00',url:'https://www.alibaba.com/trade/search?fsb=y&IndexArea=product_en&SearchText='+encEN},
    {flag:'🇨🇳',label:'1688.com',color:'#ff6a00',url:'https://s.1688.com/selloffer/offer_search.htm?keywords='+encDE},
    {flag:'🇨🇳',label:'Made-in-China',color:'#ff6a00',url:'https://www.made-in-china.com/multi-search/'+encEN+'/F1/1.html'},
    {flag:'🇪🇺',label:'Europages',color:'#003580',url:'https://www.europages.de/unternehmen/'+encDE+'.html'},
    {flag:'🇪🇺',label:'Kompass',color:'#003580',url:'https://de.kompass.com/searchCompanies?text='+encDE},
    {flag:'🇩🇪',label:'Wer liefert was',color:'#cc0000',url:'https://www.wlw.de/de/suche?q='+encDE},
    {flag:'🇮🇳',label:'IndiaMART',color:'#f77a00',url:'https://dir.indiamart.com/search.mp?ss='+encEN},
    {flag:'🇹🇷',label:'Türkei',color:'#e30a17',url:'https://www.turkishexporter.net/companies/search?keyword='+encEN},
    {flag:'🌐',label:'Google: Hersteller',color:'#4285f4',url:'https://www.google.com/search?q='+encodeURIComponent('Hersteller OEM Lieferant '+name)}
  ];
  var html='';
  sources.forEach(function(s){
    html+='<a href="'+s.url+'" target="_blank" rel="noopener" style="text-decoration:none;font-size:11px;background:'+s.color+';color:#fff;padding:6px 10px;border-radius:6px;font-weight:600;display:inline-flex;align-items:center;gap:5px">'+s.flag+' '+s.label+'</a>';
  });
  if(keywordsEN&&keywordsEN!==name.toLowerCase()){
    html+='<div style="width:100%;font-size:10px;color:var(--tx3);margin-top:8px;font-style:italic">EN-Keywords: <b style="color:var(--ac)">'+esc(keywordsEN)+'</b></div>';
  }
  wrap.innerHTML=html;
}

// ─── Detail Suppliers (per-product) ───
function renderDetailSuppliers(){
  var tb=document.getElementById('dSupplierBody');
  if(!tb||currentDetailIdx<0)return;
  tb.innerHTML='';
  var p=D.products[currentDetailIdx];
  // Filter suppliers belonging to this product
  var suppliers=(D.suppliers||[]).filter(function(s){return s.productIdx===currentDetailIdx});
  document.getElementById('herCount').textContent=suppliers.length;
  document.getElementById('dSupplierEmpty').style.display=suppliers.length?'none':'block';
  document.getElementById('dSupplierTable').style.display=suppliers.length?'table':'none';

  suppliers.forEach(function(s){
    var idx=D.suppliers.indexOf(s);
    var score=calcSupplierScore(s);
    var scoreColor=score>=80?'var(--gn)':score>=60?'var(--ac)':score>=40?'var(--or)':'var(--rd)';
    var tr=document.createElement('tr');
    tr.innerHTML='<td class="pn">'+esc(s.name||'—')+'</td>'
      +'<td>'+esc(s.platform||'—')+'</td>'
      +'<td class="nc">'+(s.preis?fmt(s.preis):'—')+'</td>'
      +'<td class="nc">'+(s.moq?Number(s.moq).toLocaleString('de-DE'):'—')+'</td>'
      +'<td class="nc">'+(s.lieferzeit||'—')+'</td>'
      +'<td class="nc">'+(s.musterkosten?fmt(s.musterkosten):'—')+'</td>'
      +'<td class="nc" style="font-weight:700;color:'+scoreColor+'">'+score+'</td>'
      +'<td class="note-c" title="'+esc(s.zertifikate||'')+'">'+esc(s.zertifikate||'—')+'</td>'
      +'<td class="note-c" title="'+esc(s.notiz||'')+'">'+esc(s.notiz||'—')+'</td>'
      +'<td>'+(s.link?'<a href="'+esc(s.link)+'" target="_blank" rel="noopener" style="color:var(--ac)">🔗</a>':'—')+'</td>'
      +'<td><div class="row-act">'
        +'<button onclick="editDetailSupplier('+idx+')" title="Bearbeiten">✏️</button>'
        +'<button class="del" onclick="delDetailSupplier('+idx+')" title="Löschen">🗑️</button>'
      +'</div></td>';
    tb.appendChild(tr);
  });
}

function calcSupplierScore(s){
  // Simple scoring: lower price, lower MOQ, faster shipping, has certificates = better
  var score=50;
  var preis=parseFloat(s.preis)||0;
  var moq=parseInt(s.moq)||0;
  var lz=parseInt(s.lieferzeit)||0;
  if(preis>0&&preis<5)score+=15;
  else if(preis>0&&preis<10)score+=10;
  else if(preis>0&&preis<20)score+=5;
  if(moq>0&&moq<=100)score+=15;
  else if(moq>0&&moq<=500)score+=10;
  else if(moq>0&&moq<=1000)score+=5;
  if(lz>0&&lz<=15)score+=10;
  else if(lz>0&&lz<=30)score+=5;
  if(s.zertifikate&&s.zertifikate.length>3)score+=10;
  return Math.min(100,Math.max(0,score));
}

function addDetailSupplier(){
  if(currentDetailIdx<0){toast('Erst Produkt öffnen');return}
  var name=prompt('Lieferanten-Name:');
  if(!name)return;
  if(!D.suppliers)D.suppliers=[];
  D.suppliers.push({
    productIdx:currentDetailIdx,
    name:name,
    platform:'',preis:0,moq:0,lieferzeit:0,musterkosten:0,
    zertifikate:'',notiz:'',link:''
  });
  save();
  renderDetailSuppliers();
  // Open edit immediately for the new one
  editDetailSupplier(D.suppliers.length-1);
}

function editDetailSupplier(idx){
  var s=D.suppliers[idx];
  if(!s)return;
  // Simple inline prompt-based editing (lightweight)
  var fields=[
    {key:'platform',label:'Plattform (z.B. Alibaba, Europages)',type:'text'},
    {key:'preis',label:'Stückpreis €',type:'number'},
    {key:'moq',label:'MOQ (Mindestbestellmenge)',type:'number'},
    {key:'lieferzeit',label:'Lieferzeit (Tage)',type:'number'},
    {key:'musterkosten',label:'Musterkosten €',type:'number'},
    {key:'zertifikate',label:'Zertifikate (z.B. CE, RoHS, FSC)',type:'text'},
    {key:'link',label:'Link / URL',type:'text'},
    {key:'notiz',label:'Notiz',type:'text'}
  ];
  // Use a single prompt for name only
  var newName=prompt('Lieferanten-Name:',s.name);
  if(newName===null)return;
  s.name=newName;
  // Then ask each field one-by-one (simple)
  for(var i=0;i<fields.length;i++){
    var f=fields[i];
    var v=prompt(f.label+':',s[f.key]||'');
    if(v===null){save();renderDetailSuppliers();return}
    s[f.key]=f.type==='number'?(parseFloat(v)||0):v;
  }
  save();
  renderDetailSuppliers();
  toast('Lieferant aktualisiert ✓');
}

function delDetailSupplier(idx){
  if(!D.suppliers[idx])return;
  if(!confirm('Lieferant „'+(D.suppliers[idx].name||'')+'" löschen?'))return;
  D.suppliers.splice(idx,1);
  save();
  renderDetailSuppliers();
  toast('Gelöscht');
}

// ═══════════════ QUICK CALC ═══════════════
function qCalc(){
  var vk=pf('qVK'),ek=pf('qEK'),fba=pf('qFBA'),sh=pf('qShip'),zl=pf('qZoll'),so=pf('qSon');
  var sales=parseInt(document.getElementById('qSales').value)||0,ppc=pf('qPPC');
  var tc=ek+fba+sh+zl+so,pr=vk-tc,m=vk>0?(pr/vk)*100:null,roi=ek>0?(pr/ek)*100:null;
  document.getElementById('rK').textContent=tc>0?tc.toFixed(2)+'€':'—';
  var g=document.getElementById('rG');g.textContent=vk>0?pr.toFixed(2)+'€':'—';g.style.color=pr>=0?'var(--gn)':'var(--rd)';
  var me=document.getElementById('rM');me.textContent=m!==null?m.toFixed(1)+'%':'—';me.style.color=m>=30?'var(--gn)':m>=15?'var(--ac)':'var(--rd)';
  var re=document.getElementById('rR');re.textContent=roi!==null?roi.toFixed(0)+'%':'—';re.style.color=roi>=100?'var(--gn)':roi>=50?'var(--ac)':'var(--rd)';
  var mt=document.getElementById('qMeter');mt.style.width=Math.max(0,Math.min(100,(m||0)*2))+'%';mt.style.background=m>=30?'var(--gn)':m>=15?'var(--ac)':'var(--rd)';mt.textContent=m!==null?m.toFixed(1)+'%':'';
  if(sales>0){fSc('p',Math.round(sales*.7),vk,pr,ppc*.7);fSc('r',sales,vk,pr,ppc);fSc('o',Math.round(sales*1.3),vk,pr,ppc*1.3)}
}
function fSc(x,u,vk,ppu,tppc){
  document.getElementById('s'+x+'S').textContent=u+' Stk';
  document.getElementById('s'+x+'U').textContent=eur(u*vk);
  var ge=document.getElementById('s'+x+'G');var gv=u*ppu-tppc;ge.textContent=eur(gv);ge.style.color=gv>=0?'var(--gn)':'var(--rd)';
}
function q2List(){var n=prompt('Produktname:');if(!n)return;D.products.push({name:n,kategorie:'',status:'Analyse',asin:'',einkaufspreis:pf('qEK'),verkaufspreis:pf('qVK'),fbaGebuehren:pf('qFBA'),versand:pf('qShip'),zoll:pf('qZoll'),sonstigeKosten:pf('qSon'),gewicht:0,masse:'',bsr:0,bewertungen:0,wettbewerber:0,bewertung:0,quelle:'',suchvolumen:0,notizen:'',datum:new Date().toLocaleDateString('de-DE')});save();renderProds();toast('Übernommen ✓');go('produkte')}

// ═══════════════ GEBÜHRENRECHNER ═══════════════
// ═══════════════════════════════════════════════════════════════
// FBA-KALKULATOR — Engine
// ───────────────────────────────────────────────────────────────
// Quellen der Default-Gebühren:
//   - Amazon FBA-Tarifübersicht Europa, gültig ab 1. Februar 2026
//     https://m.media-amazon.com/images/G/02/sell/images/260114-FBA-Rate-Card-DE.pdf
//   - Recherche-Stand: Mai 2026
// ⚠️ WICHTIG: Werte mit "ANNAHME" sind NICHT offiziell verifiziert und
//    sollten mit echten Rate-Card-Werten ersetzt werden (⚙️-Button).
// ═══════════════════════════════════════════════════════════════

var feeConfig={
  // ─── Marktplätze ───
  // VERIFIZIERT: Währung & USt.-Standardsätze (Stand 2026)
  marketplaces:{
    DE:{name:'Deutschland',currency:'€',vatStandard:19,lowPriceThreshold:20},
    FR:{name:'Frankreich',currency:'€',vatStandard:20,lowPriceThreshold:20},
    IT:{name:'Italien',currency:'€',vatStandard:22,lowPriceThreshold:20},
    ES:{name:'Spanien',currency:'€',vatStandard:21,lowPriceThreshold:20},
    NL:{name:'Niederlande',currency:'€',vatStandard:21,lowPriceThreshold:20},
    PL:{name:'Polen',currency:'zł',vatStandard:23,lowPriceThreshold:85} // PLN, Schwelle 85 PLN
  },

  // ─── Referral Fees (Verkaufsprovision) ───
  // VERIFIZIERT: min 0,30€, Schmuck 20%, Amazon-Geräte 45% (Amazon Gebührenordnung).
  // 2026er Schwellpreis-Regeln VERIFIZIERT aus der offiziellen Amazon-Ankündigung
  // „Aktualisierung der Verkaufsgebühren in Europa 2026" (Seller Central, Jan 2026):
  // Kleidung ≤15€→5% / 15–20€→10% (ab 15.12.2025) · Heimbedarf ≤20€→8% ·
  // Tiernahrung ≤10€→5% · Lebensmittel ≤10€→5% · Vitamine/Nahrungserg. ≤10€→5% (ab 1.2.2026).
  // priceTiers = preisabhängige Sätze (erste passende Stufe gewinnt, sonst pct).
  // Übrige Prozentsätze je Kategorie sind ANNAHME — exakt in Seller Central prüfen.
  referralFees:{
    minFee:0.30, // VERIFIZIERT: Mindest-Verkaufsgebühr 0,30 € / Artikel
    categories:[
      {id:'standard',  name:'Standard / Sonstiges',          pct:15.0, note:'VERIFIZIERT (Default-Satz vieler Kategorien)'},
      {id:'home',      name:'Haus & Küche (Heimbedarf)',     pct:15.0, priceTiers:[{upTo:20,pct:8}], note:'VERIFIZIERT (ab 1.2.2026: ≤20€→8%, sonst 15%)'},
      {id:'garden',    name:'Garten',                        pct:15.0, note:'ANNAHME'},
      {id:'diy',       name:'Baumarkt / Heimwerker',         pct:15.0, note:'ANNAHME'},
      {id:'sports',    name:'Sport & Freizeit',              pct:15.0, note:'ANNAHME'},
      {id:'beauty',    name:'Beauty / Drogerie',             pct:15.0, priceTiers:[{upTo:10,pct:8}], note:'ANNAHME (üblich: ≤10€→8%, sonst 15%)'},
      {id:'health',    name:'Gesundheit & Haushalt',         pct:15.0, priceTiers:[{upTo:10,pct:8}], note:'ANNAHME (üblich: ≤10€→8%, sonst 15%)'},
      {id:'vms',       name:'Vitamine & Nahrungsergänzung',  pct:8.0,  priceTiers:[{upTo:10,pct:5}], note:'VERIFIZIERT (neue Kategorie ab 1.2.2026: ≤10€→5%; Basissatz 8% ANNAHME)'},
      {id:'electronics',name:'Elektronik (Unterhaltung)',    pct:7.0,  note:'ANNAHME (Consumer Electronics ~7%)'},
      {id:'computer',  name:'Computer & Zubehör',            pct:7.0,  note:'ANNAHME'},
      {id:'appliances',name:'Großgeräte',                    pct:7.0,  note:'ANNAHME'},
      {id:'auto',      name:'Auto & Motorrad',               pct:15.0, note:'ANNAHME'},
      {id:'toys',      name:'Spielzeug',                     pct:15.0, note:'ANNAHME'},
      {id:'baby',      name:'Baby',                          pct:15.0, priceTiers:[{upTo:10,pct:8}], note:'ANNAHME (teils 8% unter Schwellpreis)'},
      {id:'clothing',  name:'Kleidung & Accessoires',        pct:15.0, priceTiers:[{upTo:15,pct:5},{upTo:20,pct:10}], note:'VERIFIZIERT (ab 15.12.2025: ≤15€→5%, 15–20€→10%, sonst 15%)'},
      {id:'shoes',     name:'Schuhe',                        pct:15.0, note:'ANNAHME'},
      {id:'jewelry',   name:'Schmuck',                       pct:20.0, note:'VERIFIZIERT (bis 20%)'},
      {id:'amazondev', name:'Amazon-Geräte-Zubehör',         pct:45.0, note:'VERIFIZIERT (45%)'},
      {id:'grocery',   name:'Lebensmittel & Feinkost',       pct:8.0,  priceTiers:[{upTo:10,pct:5}], note:'VERIFIZIERT (ab 1.2.2026: ≤10€→5%; Basissatz 8%)'},
      {id:'petfood',   name:'Tierbedarf & -nahrung',         pct:15.0, priceTiers:[{upTo:10,pct:5}], note:'VERIFIZIERT (ab 1.2.2026: ≤10€→5%, sonst 15%)'}
    ]
  },

  // ─── FBA-Versandgebühren (Standardversand, lokal DE) ───
  // ✅ VERIFIZIERT: 1:1 aus der offiziellen Amazon FBA-Tarifübersicht DE
  // (260114-FBA-Rate-Card-DE.pdf, gültig ab 1.2.2026), Spalte „CEP (DE/PL/CZ)".
  // Ohne CEP-Teilnahme +0,26€/Einheit (surcharges.cepPerUnit, Checkbox im UI).
  // Jeder Tier: Maß-Limits (cm, längste→kürzeste Seite), maxWeight = Stückgewicht (g),
  // maxVolWeight = Volumengewicht-Limit (g), brackets = Gewichtsstaffeln
  // {w: bis Versandgewicht g, fee: Standard-Tarif €, lp: Niedrigpreis-Tarif €}.
  // overage = €/kg-Aufschlag über der letzten Staffel (Übergrößen).
  // Vereinfachung: Versandgewicht = max(Stückgewicht, Volumengewicht).
  fbaFees:{
    // tiers werden der Reihe nach geprüft; erster passender Tier gewinnt.
    tiers:[
      {id:'env_light', name:'Leichter Umschlag',    maxLongest:33, maxMid:23, maxShort:2.5, maxWeight:100,
       brackets:[{w:20,fee:2.07,lp:1.61},{w:40,fee:2.11,lp:1.64},{w:60,fee:2.13,lp:1.66},{w:80,fee:2.26,lp:1.80},{w:100,fee:2.28,lp:1.83}], note:'VERIFIZIERT (Rate Card 1.2.2026)'},
      {id:'env_std',   name:'Standardumschlag',     maxLongest:33, maxMid:23, maxShort:2.5, maxWeight:460,
       brackets:[{w:210,fee:2.31,lp:1.86},{w:460,fee:2.42,lp:2.02}], note:'VERIFIZIERT (Rate Card 1.2.2026)'},
      {id:'env_large', name:'Großer Umschlag',      maxLongest:33, maxMid:23, maxShort:4,   maxWeight:960,
       brackets:[{w:960,fee:2.78,lp:2.39}], note:'VERIFIZIERT (Rate Card 1.2.2026)'},
      {id:'env_xl',    name:'Extra großer Umschlag',maxLongest:33, maxMid:23, maxShort:6,   maxWeight:960,
       brackets:[{w:960,fee:3.16,lp:2.78}], note:'VERIFIZIERT (Rate Card 1.2.2026)'},
      {id:'parcel_s',  name:'Kleines Paket',        maxLongest:35, maxMid:25, maxShort:12,  maxWeight:3900, maxVolWeight:2100,
       brackets:[{w:150,fee:3.12,lp:2.78},{w:400,fee:3.13,lp:2.99},{w:900,fee:3.14},{w:1400,fee:3.15},{w:1900,fee:3.17},{w:3900,fee:4.28}], note:'VERIFIZIERT (Rate Card 1.2.2026)'},
      {id:'parcel_std',name:'Standardpaket',        maxLongest:45, maxMid:34, maxShort:26,  maxWeight:11900, maxVolWeight:7960,
       brackets:[{w:150,fee:3.13},{w:400,fee:3.16},{w:900,fee:3.18},{w:1400,fee:3.67},{w:1900,fee:3.69},{w:2900,fee:4.29},{w:3900,fee:4.83},{w:5900,fee:4.96},{w:8900,fee:5.77},{w:11900,fee:6.39}], note:'VERIFIZIERT (Rate Card 1.2.2026)'},
      {id:'oversize_s',    name:'Kleine Übergröße',          maxLongest:61, maxMid:46, maxShort:46, maxWeight:1760,  maxVolWeight:25820,
       brackets:[{w:760,fee:4.30}], overage:{baseW:760, perKg:0.18}, note:'VERIFIZIERT (Rate Card 1.2.2026)'},
      {id:'oversize_light',name:'Standardübergröße leicht',  maxLongest:101,maxMid:60, maxShort:60, maxWeight:15000, maxVolWeight:72720,
       brackets:[{w:760,fee:4.33}], overage:{baseW:760, perKg:0.18}, note:'VERIFIZIERT (Rate Card 1.2.2026)'},
      {id:'oversize_heavy',name:'Standardübergröße schwer',  maxLongest:101,maxMid:60, maxShort:60, maxWeight:23000, maxVolWeight:72720,
       brackets:[{w:15760,fee:6.99}], overage:{baseW:15760, perKg:0.07}, note:'VERIFIZIERT (Rate Card 1.2.2026)'},
      {id:'oversize_large',name:'Standardübergröße groß',    maxLongest:120,maxMid:60, maxShort:60, maxWeight:23000, maxVolWeight:86400,
       brackets:[{w:760,fee:5.80}], overage:{baseW:760, perKg:0.08}, note:'VERIFIZIERT (Rate Card 1.2.2026)'},
      {id:'oversize_bulky',name:'Übergröße sperrig',         maxLongest:175,maxMid:9999,maxShort:9999, maxWeight:23000, maxVolWeight:126000,
       brackets:[{w:760,fee:7.98}], overage:{baseW:760, perKg:0.27}, note:'VERIFIZIERT (Rate Card 1.2.2026); Gurtmaß-Regel (>360cm) nicht geprüft'},
      {id:'oversize_xheavy',name:'Übergröße schwer (>23kg)', maxLongest:175,maxMid:9999,maxShort:9999, maxWeight:31500, maxVolWeight:126000,
       brackets:[{w:31500,fee:12.74}], overage:{baseW:31500, perKg:0.15}, note:'VERIFIZIERT (Rate Card 1.2.2026)'},
      {id:'special_oversize',name:'Besondere Übergröße',     maxLongest:9999,maxMid:9999,maxShort:9999, maxWeight:9999999,
       brackets:[{w:30000,fee:21.30},{w:40000,fee:24.19},{w:50000,fee:47.98},{w:60000,fee:51.99}], overage:{baseW:60000, perKg:0.36}, noCep:true, note:'VERIFIZIERT (Rate Card 1.2.2026, Nur-DE-Tarif — kein CEP möglich)'}
    ],
    // Low-Price-FBA (Niedrigpreisversand): eigener Tarif (lp in brackets) für Artikel
    // ≤20€ inkl. USt. (VERIFIZIERT, Rate Card 1.2.2026). In den Sonderkategorien
    // Beauty/Gesundheit, Business/Industrie, Bürobedarf, Lebensmittel, Bücher,
    // Amazon-Gerätezubehör, Küche gilt ≤12€. Nur bis „Kleines Paket ≤400g";
    // Volumengewicht zählt beim Niedrigpreisversand NICHT (hier vereinfacht ignoriert).
    lowPriceThresholdSpecial:12,
    // Peak-Zuschlag (15. Okt – 14. Jan): Peak-Tarife 2026 gibt Amazon erst am
    // 15.9.2026 bekannt (Rate Card S.5). Bis dahin 0; im ⚙️ als €/Stk setzbar.
    peakSurcharge:0.00
  },

  // ─── Lagergebühren ───
  // ✅ VERIFIZIERT (Rate Card 1.2.2026, S.17): €/m³/Monat, nicht gefährliche Güter,
  // Standardgröße „alle anderen Kategorien" (nicht Kleidung/Schuhe/Taschen).
  // Saison-Staffelung: Jan–Sep günstiger, Okt–Dez teurer. Der zusätzliche
  // Lagernutzungszuschlag (bei Nutzungsgrad >22 Wochen) ist hier NICHT enthalten.
  storageFees:{
    standardJanSep:27.54, standardOktDez:52.20,
    oversizeJanSep:21.78, oversizeOktDez:34.49,
    note:'VERIFIZIERT (Rate Card 1.2.2026) — Kleidung/Schuhe günstiger (19,99/29,23); Gefahrgut teurer'
  },

  // ─── Selling Plan ───
  // VERIFIZIERT: Professional 39€/Monat exkl. VAT, Individual 0,99€/Artikel
  planFees:{
    professional:{monthly:39.00, perItem:0,    note:'VERIFIZIERT: 39€/Monat exkl. USt.'},
    individual:  {monthly:0,     perItem:0.99, note:'VERIFIZIERT: 0,99€/verkauftem Artikel'}
  },

  // ─── Zuschläge ───
  surcharges:{
    fuelLogisticsPct:0,    // VERIFIZIERT: Rate Card 1.2.2026 kennt KEINEN separaten
                           // Treibstoff-/Logistikzuschlag mehr → 0. Im ⚙️ als eigener
                           // Sicherheitspuffer (%) auf die FBA-Gebühr setzbar.
    cepPerUnit:0.26,       // VERIFIZIERT: 0,26€/Einheit ohne Zentraleuropa-Programm
    lithiumPerUnit:0.10,   // VERIFIZIERT: 0,10€/Einheit für Lithium/Gefahrgut
    note:'Alle Werte VERIFIZIERT (Rate Card 1.2.2026); fuelLogisticsPct=0 = optionaler Eigen-Puffer'
  }
};

// ─── State ───
var fbaState={mode:'single'};

// ═══════════════════════════════════════════════════════════════
// BERECHNUNGSFUNKTIONEN (modular)
// ═══════════════════════════════════════════════════════════════

// USt. aus Brutto/Netto
function calculateVat(price, vatRate, mode){
  price=price||0; vatRate=vatRate||0;
  if(mode==='incl'){
    var net=price/(1+vatRate/100);
    return {net:net, gross:price, vat:price-net};
  }else{
    var gross=price*(1+vatRate/100);
    return {net:price, gross:gross, vat:gross-price};
  }
}

// Referral Fee (auf Brutto-Verkaufspreis, min-Fee beachtet)
// priceTiers: preisabhängige Sätze (z.B. Kleidung ≤15€→5%), erste passende Stufe gewinnt.
function calculateReferralFee(grossPrice, categoryId){
  grossPrice=grossPrice||0;
  var cat=feeConfig.referralFees.categories.find(function(c){return c.id===categoryId});
  var pct=cat?cat.pct:15;
  if(cat && cat.priceTiers){
    for(var i=0;i<cat.priceTiers.length;i++){
      if(grossPrice<=cat.priceTiers[i].upTo){pct=cat.priceTiers[i].pct;break;}
    }
  }
  var fee=grossPrice*(pct/100);
  return Math.max(fee, feeConfig.referralFees.minFee);
}

// Size Tier automatisch ermitteln aus Maßen + Gewicht.
// Amazon-Logik: Tier-Zuordnung über Maße + Stückgewicht (maxWeight) + ggf.
// Volumengewicht-Limit (maxVolWeight); die Gebühren-Staffel nutzt das
// Versandgewicht = max(Stückgewicht, Volumengewicht).
function calculateSizeTier(lengthCm, widthCm, heightCm, weightG){
  var dims=[lengthCm||0, widthCm||0, heightCm||0].sort(function(a,b){return b-a;});
  var longest=dims[0], mid=dims[1], shortest=dims[2];
  var volWeight=(longest*mid*shortest)/5000*1000; // cm³/5000 → kg, ×1000 → g
  var shipWeight=Math.max(weightG||0, volWeight);
  for(var i=0;i<feeConfig.fbaFees.tiers.length;i++){
    var t=feeConfig.fbaFees.tiers[i];
    if(longest<=t.maxLongest && mid<=t.maxMid && shortest<=t.maxShort
       && (weightG||0)<=t.maxWeight
       && (!t.maxVolWeight || volWeight<=t.maxVolWeight)){
      return {tier:t, shipWeight:shipWeight, volWeight:volWeight};
    }
  }
  var last=feeConfig.fbaFees.tiers[feeConfig.fbaFees.tiers.length-1];
  return {tier:last, shipWeight:shipWeight, volWeight:volWeight};
}

// FBA Fulfilment Fee — Gewichtsstaffel (brackets), darüber €/kg-Aufschlag (overage).
// lowPriceActive: Niedrigpreis-Tarif (lp) der Staffel, falls vorhanden — sonst Standard
// (Niedrigpreis-Tarife existieren nur bis „Kleines Paket ≤400g").
function calculateFbaFee(tierId, lowPriceActive, shipWeightG){
  var tier=feeConfig.fbaFees.tiers.find(function(t){return t.id===tierId});
  if(!tier)return 0;
  var peak=feeConfig.fbaFees.peakSurcharge||0;
  var w=shipWeightG||0, br=tier.brackets, fee=null;
  for(var i=0;i<br.length;i++){
    if(w<=br[i].w){
      fee=(lowPriceActive && br[i].lp!=null)?br[i].lp:br[i].fee;
      break;
    }
  }
  if(fee==null){
    fee=br[br.length-1].fee;
    if(tier.overage)fee+=Math.max(0,(w-tier.overage.baseW)/1000)*tier.overage.perKg;
  }
  return fee+peak;
}

// Fuel & Logistics Surcharge (auf FBA-Fee)
function calculateFuelSurcharge(fbaFee, active){
  if(!active)return 0;
  return fbaFee*(feeConfig.surcharges.fuelLogisticsPct/100);
}

// Lagerkosten pro Einheit — saisonale Rate-Card-Sätze (Jan–Sep / Okt–Dez),
// getrennt nach Standard-/Übergröße; Saison automatisch nach aktuellem Monat.
function calculateStorageFee(lengthCm, widthCm, heightCm, months, oversize){
  var volM3=((lengthCm||0)*(widthCm||0)*(heightCm||0))/1000000; // cm³ → m³
  var s=feeConfig.storageFees;
  var q4=(new Date().getMonth())>=9; // Okt(9)–Dez(11)
  var rate=oversize?(q4?s.oversizeOktDez:s.oversizeJanSep):(q4?s.standardOktDez:s.standardJanSep);
  return volM3*rate*(months||0);
}

// PPC-Kosten pro Sale
function calculatePpcCost(mode, opts){
  // mode 'cpc': cpc + conversionRate (%) → Kosten pro Verkauf = cpc * (100/CR)
  // mode 'acos': acos (%) * grossPrice * ppcShare(%)
  if(mode==='cpc'){
    var cpc=opts.cpc||0, cr=opts.cr||0;
    if(cr<=0)return 0;
    var clicksPerSale=100/cr;
    return cpc*clicksPerSale;
  }else{
    var acos=opts.acos||0, price=opts.grossPrice||0, share=(opts.ppcShare!=null?opts.ppcShare:100);
    return price*(acos/100)*(share/100);
  }
}

// Selling-Plan-Kosten pro Einheit
function calculatePlanCostPerUnit(plan, salesPerMonth){
  var p=feeConfig.planFees[plan];
  if(!p)return 0;
  var perUnit=p.perItem||0;
  if(p.monthly>0 && salesPerMonth>0)perUnit+=p.monthly/salesPerMonth;
  return perUnit;
}

// Gewinn-Kennzahlen
function calculateProfitMetrics(input){
  var vat=calculateVat(input.price, input.vatRate, input.vatMode);
  var netRevenue=vat.net;       // Netto-Umsatz (für dich relevant)
  var grossPrice=vat.gross;

  // Amazon-Gebühren (auf Brutto)
  var referral=calculateReferralFee(grossPrice, input.categoryId);
  var sizeRes=input.sizeTierId==='auto'
      ? calculateSizeTier(input.length,input.width,input.height,input.weight)
      : {tier:feeConfig.fbaFees.tiers.find(function(t){return t.id===input.sizeTierId;}),shipWeight:input.weight,volWeight:0};
  var tierId=sizeRes.tier?sizeRes.tier.id:'parcel_std';
  var isOversize=/^(oversize|special)/.test(tierId);
  var fbaFee=calculateFbaFee(tierId, input.lowPrice, sizeRes.shipWeight||input.weight||0);
  var fuel=calculateFuelSurcharge(fbaFee, input.fuel);
  // Besondere Übergröße nutzt den Nur-DE-Tarif → CEP-Zuschlag entfällt (noCep)
  var cep=(input.cep && !(sizeRes.tier&&sizeRes.tier.noCep))?feeConfig.surcharges.cepPerUnit:0;
  var storage=calculateStorageFee(input.length,input.width,input.height,input.storageMonths,isOversize);
  var ppc=calculatePpcCost(input.ppcMode,{cpc:input.cpc,cr:input.cr,acos:input.acos,grossPrice:grossPrice,ppcShare:input.ppcShare});
  var planCost=calculatePlanCostPerUnit(input.plan, input.salesPerMonth);
  var extra=(input.extra||0);

  // Referral mindert i.d.R. Netto-Umsatz; FBA-Gebühren sind Netto-Kosten.
  // Vereinfachung: Amazon-Gebühren werden als Netto-Beträge behandelt.
  var amazonFees=referral+fbaFee+fuel+cep;
  var totalAmazon=amazonFees+planCost;

  // Retouren-Kosten: anteilig (Retourenquote auf FBA-Fee als grobe Näherung)
  var returnCost=(input.returnsPct||0)/100*(fbaFee*0.5); // ANNAHME: 50% der FBA-Fee je Retoure

  // Deine Kosten
  var ownCosts=(input.cogs||0)+(input.packaging||0)+(input.inbound||0)+(input.other||0);

  var totalCosts=totalAmazon+storage+ppc+extra+returnCost+ownCosts;
  var profit=netRevenue-totalCosts;
  var margin=netRevenue>0?(profit/netRevenue)*100:null;
  var roi=ownCosts>0?(profit/ownCosts)*100:null;
  var payout=netRevenue-amazonFees-storage; // Netto-Auszahlung von Amazon (vor deinen Warenkosten/PPC)

  return {
    vat:vat, netRevenue:netRevenue, grossPrice:grossPrice,
    referral:referral, fbaFee:fbaFee, fuel:fuel, cep:cep, storage:storage,
    ppc:ppc, planCost:planCost, extra:extra, returnCost:returnCost,
    ownCosts:ownCosts, amazonFees:amazonFees, totalAmazon:totalAmazon,
    totalCosts:totalCosts, profit:profit, margin:margin, roi:roi, payout:payout,
    tier:sizeRes.tier, shipWeight:sizeRes.shipWeight, volWeight:sizeRes.volWeight,
    monthlyProfit:profit*(input.salesPerMonth||0)
  };
}

// Break-even-Kennzahlen
function calculateBreakEvenMetrics(input, metrics){
  // Break-even VK: Preis, bei dem Gewinn = 0
  // Vereinfachte iterative Suche, da Referral & VAT preisabhängig sind
  var beVk=null;
  for(var p=0.5;p<=2000;p+=0.5){
    var testInput=Object.assign({},input,{price:p});
    var m=calculateProfitMetrics(testInput);
    if(m.profit>=0){beVk=p;break;}
  }
  // Break-even CPC: max CPC bei dem Gewinn = 0 (nur cpc-Modus sinnvoll)
  var beCpc=null;
  if(input.ppcMode==='cpc' && input.cr>0){
    var fixedProfitWithoutPpc=metrics.profit+metrics.ppc; // Gewinn ohne PPC
    var clicksPerSale=100/input.cr;
    if(clicksPerSale>0)beCpc=fixedProfitWithoutPpc/clicksPerSale;
  }
  // Max tragbarer ACoS: PPC-Spielraum / Brutto-Preis
  var maxAcos=null;
  if(metrics.grossPrice>0){
    var profitWithoutPpc=metrics.profit+metrics.ppc;
    maxAcos=(profitWithoutPpc/metrics.grossPrice)*100;
  }
  return {beVk:beVk, beCpc:beCpc, maxAcos:maxAcos};
}

// Zielmargen-Modus: nötigen VK rückwärts berechnen
function calculateRequiredPrice(input, targetMarginPct){
  for(var p=0.5;p<=2000;p+=0.25){
    var testInput=Object.assign({},input,{price:p});
    var m=calculateProfitMetrics(testInput);
    if(m.margin!=null && m.margin>=targetMarginPct)return {price:p, metrics:m};
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// INPUT-SAMMLUNG & RENDERING
// ═══════════════════════════════════════════════════════════════

function fbaCollectInput(priceOverride, cpcOverride){
  var market=document.getElementById('fbMarket').value;
  var price=priceOverride!=null?priceOverride:pf('fbVK');
  return {
    market:market,
    price:price,
    vatMode:document.getElementById('fbVatMode').value,
    vatRate:pf('fbVat'),
    categoryId:document.getElementById('fbCat').value,
    sizeTierId:document.getElementById('fbSize').value,
    length:pf('fbL'), width:pf('fbB'), height:pf('fbH'), weight:pf('fbW'),
    cogs:pf('fbEK'), packaging:pf('fbPack'), inbound:pf('fbInbound'), other:pf('fbOther'),
    storageMonths:pf('fbStorage'), salesPerMonth:pf('fbSales'), returnsPct:pf('fbReturns'),
    ppcMode:document.getElementById('fbPpcMode').value,
    cpc:cpcOverride!=null?cpcOverride:pf('fbCpc'), cr:pf('fbCr'),
    acos:pf('fbAcos'), ppcShare:pf('fbPpcShare'),
    plan:document.getElementById('fbPlan').value,
    fuel:document.getElementById('fbFuel').checked,
    lowPrice:document.getElementById('fbLowPrice').checked,
    cep:document.getElementById('fbCep').checked,
    extra:pf('fbExtra')
  };
}

function fbaFmt(v){return (v||0).toFixed(2)+' €';}

function fbaCalc(){
  if(!document.getElementById('fbVK'))return;
  var input=fbaCollectInput();
  var price=input.price||0;

  // Status-Banner & KPIs nur wenn Preis vorhanden
  var banner=document.getElementById('fbStatusBanner');
  if(price<=0){
    banner.textContent='Gib einen Verkaufspreis ein, um zu starten';
    banner.style.background='var(--s2)';banner.style.color='var(--tx2)';banner.style.borderColor='var(--bd)';
    ['fbKpiProfit','fbKpiMargin','fbKpiRoi','fbKpiMonthly','fbBeVk','fbBeCpc','fbBeAcos','fbPayout'].forEach(function(id){var e=document.getElementById(id);if(e)e.textContent='—';});
    document.getElementById('fbBreakdown').innerHTML='';
    document.getElementById('fbWarnings').innerHTML='';
    return;
  }

  var m=calculateProfitMetrics(input);
  var be=calculateBreakEvenMetrics(input, m);

  // Status-Banner
  var marginVal=m.margin!=null?m.margin:0;
  var statusColor, statusBg, statusText;
  if(m.profit<=0){statusColor='#fff';statusBg='var(--rd)';statusText='❌ Unprofitabel — '+fbaFmt(m.profit)+' / Einheit';}
  else if(marginVal<10){statusColor='#fff';statusBg='var(--or)';statusText='⚠️ Knapp — '+marginVal.toFixed(1)+'% Marge';}
  else if(marginVal<20){statusColor='#1a1a1a';statusBg='var(--ac)';statusText='👍 Solide — '+marginVal.toFixed(1)+'% Marge';}
  else{statusColor='#fff';statusBg='var(--gn)';statusText='✅ Profitabel — '+marginVal.toFixed(1)+'% Marge';}
  banner.textContent=statusText;
  banner.style.background=statusBg;banner.style.color=statusColor;banner.style.borderColor='transparent';

  // KPIs
  document.getElementById('fbKpiProfit').textContent=fbaFmt(m.profit);
  document.getElementById('fbKpiProfit').style.color=m.profit>0?'var(--gn)':'var(--rd)';
  document.getElementById('fbKpiMargin').textContent=m.margin!=null?m.margin.toFixed(1)+'%':'—';
  document.getElementById('fbKpiRoi').textContent=m.roi!=null?m.roi.toFixed(0)+'%':'—';
  document.getElementById('fbKpiMonthly').textContent=fbaFmt(m.monthlyProfit);
  document.getElementById('fbKpiMonthly').style.color=m.monthlyProfit>0?'var(--pu)':'var(--rd)';

  // Breakdown-Tabelle
  var tierName=m.tier?m.tier.name:'—';
  var rows=[
    ['Brutto-Verkaufspreis', fbaFmt(m.grossPrice), 'var(--tx)'],
    ['./. USt. ('+input.vatRate+'%)', '−'+fbaFmt(m.vat.vat), 'var(--tx3)'],
    ['= Netto-Umsatz', fbaFmt(m.netRevenue), 'var(--tx)'],
    ['Referral Fee', '−'+fbaFmt(m.referral), 'var(--or)'],
    ['FBA-Versandgebühr ('+tierName+')', '−'+fbaFmt(m.fbaFee), 'var(--bl)'],
    ['Fuel-/Logistik-Zuschlag', '−'+fbaFmt(m.fuel), 'var(--bl)'],
    ['CEP-Zuschlag', '−'+fbaFmt(m.cep), 'var(--bl)'],
    ['Lagerkosten ('+input.storageMonths+' Mon.)', '−'+fbaFmt(m.storage), 'var(--pu)'],
    ['PPC / Werbung pro Sale', '−'+fbaFmt(m.ppc), 'var(--pk)'],
    ['Selling-Plan-Anteil', '−'+fbaFmt(m.planCost), 'var(--cy)'],
    ['Retouren-Anteil', '−'+fbaFmt(m.returnCost), 'var(--tx3)'],
    ['Zusatzgebühr', '−'+fbaFmt(m.extra), 'var(--tx3)'],
    ['Wareneinsatz (COGS etc.)', '−'+fbaFmt(m.ownCosts), 'var(--rd)'],
    ['= Gewinn / Einheit', fbaFmt(m.profit), m.profit>0?'var(--gn)':'var(--rd)']
  ];
  var html='';
  rows.forEach(function(r,idx){
    var isTotal=r[0].charAt(0)==='=';
    var isSub=r[0].charAt(0)==='.';
    html+='<tr style="'+(isTotal?'font-weight:700;border-top:2px solid var(--bd2)':'')+'">'+
      '<td style="padding:6px 4px;color:'+(isSub?'var(--tx3)':'var(--tx2)')+';font-size:'+(isTotal?'14':'13')+'px">'+esc(r[0])+'</td>'+
      '<td class="nc" style="padding:6px 4px;color:'+r[2]+';font-weight:'+(isTotal?'700':'600')+';font-size:'+(isTotal?'15':'13')+'px;text-align:right">'+r[1]+'</td>'+
    '</tr>';
  });
  document.getElementById('fbBreakdown').innerHTML=html;

  // Break-even
  document.getElementById('fbBeVk').textContent=be.beVk!=null?fbaFmt(be.beVk):'—';
  document.getElementById('fbBeCpc').textContent=be.beCpc!=null?fbaFmt(be.beCpc):'—';
  document.getElementById('fbBeAcos').textContent=be.maxAcos!=null?be.maxAcos.toFixed(1)+'%':'—';
  document.getElementById('fbPayout').textContent=fbaFmt(m.payout);

  // Size info
  var sizeInfo=document.getElementById('fbSizeInfo');
  if(input.sizeTierId==='auto' && m.tier){
    sizeInfo.innerHTML='⚙️ Ermittelt: <b style="color:var(--ac)">'+esc(m.tier.name)+'</b> · Versandgewicht: '+Math.round(m.shipWeight)+' g'+(m.volWeight>input.weight?' (Volumengewicht maßgeblich)':'');
  }else{sizeInfo.textContent='';}

  // Warnungen
  fbaRenderWarnings(input, m, be);

  // Modus-spezifisch
  if(fbaState.mode==='scenario')fbaRenderScenario(input);
  if(fbaState.mode==='target')fbaRenderTarget(input);

  // Steuerbereich aktualisieren (falls aktiv)
  if(document.getElementById('fbTaxEnable') && document.getElementById('fbTaxEnable').checked)fbaCalcTax();
}

function fbaRenderWarnings(input, m, be){
  var warns=[];
  if(m.profit<0)warns.push({c:'rd',t:'Gewinn ist negativ — bei diesen Werten machst du Verlust.'});
  var targetM=fbaState.mode==='target'?pf('fbTargetMargin'):15;
  if(m.margin!=null && m.margin>=0 && m.margin<targetM)warns.push({c:'or',t:'Marge ('+m.margin.toFixed(1)+'%) liegt unter Zielwert ('+targetM+'%).'});
  if(m.netRevenue>0 && m.ppc/m.netRevenue>0.3)warns.push({c:'or',t:'PPC-Kosten sind hoch (>30% vom Netto-Umsatz) — Werbeeffizienz prüfen.'});
  var cat=feeConfig.referralFees.categories.find(function(c){return c.id===input.categoryId;});
  if(cat && cat.pct>=20)warns.push({c:'pk',t:'Referral Fee dieser Kategorie ist besonders hoch ('+cat.pct+'%).'});
  var mp=feeConfig.marketplaces[input.market];
  if(mp && m.grossPrice>0 && m.grossPrice<=mp.lowPriceThreshold && !input.lowPrice)warns.push({c:'bl',t:'Low-Price-FBA könnte möglich sein (Preis ≤ '+mp.lowPriceThreshold+' '+mp.currency+' inkl. USt.; in Sonderkategorien wie Beauty/Lebensmittel/Bücher/Küche gilt ≤ '+feeConfig.fbaFees.lowPriceThresholdSpecial+' €) — Option aktivieren & prüfen.'});
  if(input.plan==='professional' && input.salesPerMonth>0 && input.salesPerMonth<40)warns.push({c:'cy',t:'Bei nur '+input.salesPerMonth+' Verkäufen/Monat könnte der Individual-Plan (0,99€/Stk.) günstiger sein.'});

  var box=document.getElementById('fbWarnings');
  if(warns.length===0){box.innerHTML='';return;}
  box.innerHTML=warns.map(function(w){
    return '<div style="display:flex;align-items:flex-start;gap:8px;padding:10px 14px;background:var(--'+w.c+'d);border-left:3px solid var(--'+w.c+');border-radius:8px;font-size:12px;line-height:1.5;color:var(--tx)"><span>⚠️</span><span>'+esc(w.t)+'</span></div>';
  }).join('');
}

// ─── Szenariovergleich ───
function fbaRenderScenario(input){
  var priceB=pf('fbVKb');
  var cpcBraw=document.getElementById('fbCpcB').value;
  var cpcB=cpcBraw!==''?parseFloat(cpcBraw):null;
  var box=document.getElementById('fbScenarioResult');
  if(priceB<=0){box.style.display='none';return;}
  box.style.display='block';

  var mA=calculateProfitMetrics(input);
  var inputB=fbaCollectInput(priceB, cpcB);
  var mB=calculateProfitMetrics(inputB);

  var rows=[
    ['Verkaufspreis', fbaFmt(input.price), fbaFmt(priceB)],
    ['Netto-Umsatz', fbaFmt(mA.netRevenue), fbaFmt(mB.netRevenue)],
    ['Amazon-Gebühren', fbaFmt(mA.amazonFees), fbaFmt(mB.amazonFees)],
    ['PPC / Sale', fbaFmt(mA.ppc), fbaFmt(mB.ppc)],
    ['Gewinn / Einheit', fbaFmt(mA.profit), fbaFmt(mB.profit)],
    ['Marge', (mA.margin!=null?mA.margin.toFixed(1)+'%':'—'), (mB.margin!=null?mB.margin.toFixed(1)+'%':'—')],
    ['Gewinn / Monat', fbaFmt(mA.monthlyProfit), fbaFmt(mB.monthlyProfit)]
  ];
  var diff=mB.profit-mA.profit;
  var html='<tr style="border-bottom:2px solid var(--bd2)"><th style="text-align:left;padding:6px 4px;font-size:11px;color:var(--tx3)">Kennzahl</th><th class="nc" style="padding:6px 4px;font-size:11px;color:var(--ac)">Szenario A</th><th class="nc" style="padding:6px 4px;font-size:11px;color:var(--cy)">Szenario B</th></tr>';
  rows.forEach(function(r){
    var isProfit=r[0].indexOf('Gewinn / Einheit')>-1;
    html+='<tr'+(isProfit?' style="font-weight:700"':'')+'><td style="padding:5px 4px;font-size:13px;color:var(--tx2)">'+esc(r[0])+'</td><td class="nc" style="padding:5px 4px;text-align:right;font-size:13px;color:var(--tx)">'+r[1]+'</td><td class="nc" style="padding:5px 4px;text-align:right;font-size:13px;color:var(--tx)">'+r[2]+'</td></tr>';
  });
  html+='<tr style="border-top:2px solid var(--bd2)"><td colspan="3" style="padding:10px 4px;font-size:13px;color:'+(diff>=0?'var(--gn)':'var(--rd)')+';font-weight:700;text-align:center">'+(diff>=0?'▲ Szenario B bringt '+fbaFmt(diff)+' mehr Gewinn/Einheit':'▼ Szenario B bringt '+fbaFmt(Math.abs(diff))+' weniger Gewinn/Einheit')+'</td></tr>';
  document.getElementById('fbScenarioTable').innerHTML=html;
}

// ─── Zielmargen-Modus ───
function fbaRenderTarget(input){
  var target=pf('fbTargetMargin');
  var box=document.getElementById('fbTargetResult');
  box.style.display='block';
  if(target<=0){document.getElementById('fbTargetContent').innerHTML='<span style="color:var(--tx3)">Gib eine Zielmarge ein.</span>';return;}
  var res=calculateRequiredPrice(input, target);
  if(!res){
    document.getElementById('fbTargetContent').innerHTML='<span style="color:var(--rd)">Zielmarge von '+target+'% ist mit diesen Kosten nicht erreichbar (auch bei sehr hohem Preis nicht). Senke deine Kosten.</span>';
    return;
  }
  var cur=calculateProfitMetrics(input);
  var curPrice=input.price||0;
  var diff=res.price-curPrice;
  document.getElementById('fbTargetContent').innerHTML=
    'Um eine Netto-Marge von <b style="color:var(--ac)">'+target+'%</b> zu erreichen, brauchst du einen Verkaufspreis von:'+
    '<div style="font-size:32px;font-weight:800;color:var(--gn);margin:10px 0">'+fbaFmt(res.price)+'</div>'+
    (curPrice>0?'<div style="font-size:13px;color:var(--tx2)">Aktueller Preis: '+fbaFmt(curPrice)+' ('+(cur.margin!=null?cur.margin.toFixed(1)+'% Marge':'—')+')<br>'+
      (diff>0?'<span style="color:var(--or)">→ Du müsstest den Preis um '+fbaFmt(diff)+' erhöhen.</span>':'<span style="color:var(--gn)">→ Dein aktueller Preis übertrifft das Ziel bereits! 🎉</span>')+'</div>':'');
}

// ─── Modus-Umschaltung ───
// ─── Kalkulations-Center: Haupt-Tab-Umschaltung (Schnell vs. Voll) ───
var calcActiveTab='full';
function switchCalcTab(tab){
  calcActiveTab=tab;
  ['quick','full','bsr'].forEach(function(t){
    var pane=document.getElementById('calcTab-'+t);
    if(pane)pane.style.display=(t===tab)?'block':'none';
  });
  document.querySelectorAll('.calcTab').forEach(function(btn){
    var active=btn.getAttribute('data-calctab')===tab;
    btn.style.background=active?'var(--s1)':'transparent';
    btn.style.border=active?'1.5px solid var(--ac)':'1.5px solid transparent';
    btn.style.borderBottom=active?'1.5px solid var(--s1)':'1.5px solid transparent';
    btn.style.color=active?'var(--ac)':'var(--tx2)';
    btn.style.fontWeight=active?'700':'600';
  });
  if(tab==='quick'&&typeof qCalc==='function')qCalc();
  if(tab==='full'&&typeof fbaCalc==='function')fbaCalc();
  if(tab==='bsr'&&typeof bsrPopulateCats==='function')bsrPopulateCats();
}

function fbaSetMode(mode){
  fbaState.mode=mode;
  document.querySelectorAll('.fbaModeBtn').forEach(function(b){
    var active=b.getAttribute('data-mode')===mode;
    b.style.background=active?'var(--ac)':'transparent';
    b.style.color=active?'#fff':'var(--tx2)';
    b.style.borderColor=active?'var(--ac)':'var(--bd)';
    b.style.fontWeight=active?'700':'600';
  });
  document.getElementById('fbScenarioB').style.display=mode==='scenario'?'block':'none';
  document.getElementById('fbScenarioResult').style.display='none';
  document.getElementById('fbTargetResult').style.display='none';
  document.getElementById('fbTargetMarginWrap').style.display=mode==='target'?'block':'none';
  fbaCalc();
}

function fbaTogglePpc(){
  var mode=document.getElementById('fbPpcMode').value;
  document.getElementById('fbPpcCpcFields').style.display=mode==='cpc'?'':'none';
  document.getElementById('fbPpcAcosFields').style.display=mode==='acos'?'':'none';
}

// ─── Dropdown-Beschriftungen ───
function fbaCatLabel(c){
  if(!c.priceTiers)return c.name+' ('+c.pct+'%)';
  return c.name+' ('+c.priceTiers.map(function(t){return '≤'+t.upTo+'€ '+t.pct+'%';}).join(' · ')+' · sonst '+c.pct+'%)';
}
function fbaTierLabel(t){
  var br=t.brackets, min=br[0].fee, max=br[br.length-1].fee;
  var range=min===max?min.toFixed(2)+'€':min.toFixed(2)+'–'+max.toFixed(2)+'€';
  return t.name+' ('+range+(t.overage?' +'+t.overage.perKg.toFixed(2)+'€/kg':'')+')';
}

// ─── Kategorie-Dropdown füllen ───
function fbaPopulateSelects(){
  var catSel=document.getElementById('fbCat');
  if(catSel && catSel.options.length===0){
    feeConfig.referralFees.categories.forEach(function(c){
      var o=document.createElement('option');o.value=c.id;o.textContent=fbaCatLabel(c);catSel.appendChild(o);
    });
  }
  var sizeSel=document.getElementById('fbSize');
  if(sizeSel && sizeSel.options.length<=1){
    feeConfig.fbaFees.tiers.forEach(function(t){
      var o=document.createElement('option');o.value=t.id;o.textContent=fbaTierLabel(t);sizeSel.appendChild(o);
    });
  }
}

// ─── Als Produkt speichern ───
function fbaSaveToProduct(){
  var input=fbaCollectInput();
  if((input.price||0)<=0){toast('Bitte erst Verkaufspreis eingeben');return;}
  var m=calculateProfitMetrics(input);
  var name=prompt('Produktname für die Produktliste:');
  if(!name||!name.trim())return;
  if(!D.products)D.products=[];
  D.products.push({
    name:name.trim(), kategorie:'', status:'Analyse', asin:'',
    einkaufspreis:input.cogs, verkaufspreis:input.price,
    fbaGebuehren:parseFloat((m.fbaFee+m.fuel+m.cep).toFixed(2)),
    versand:input.inbound, zoll:0,
    sonstigeKosten:parseFloat((input.packaging+input.other+m.referral).toFixed(2)),
    gewicht:input.weight, masse:input.length+'x'+input.width+'x'+input.height,
    bsr:0, bewertungen:0, wettbewerber:0, bewertung:0, quelle:'FBA-Kalkulator',
    suchvolumen:0, notizen:'Marge: '+(m.margin!=null?m.margin.toFixed(1)+'%':'—')+', Gewinn/Stk: '+fbaFmt(m.profit),
    datum:new Date().toLocaleDateString('de-DE')
  });
  save();
  if(typeof renderProds==='function')renderProds();
  toast('✓ „'+esc(name)+'" zur Produktliste hinzugefügt');
}

function fbaReset(){
  ['fbVK','fbL','fbB','fbH','fbW','fbEK','fbPack','fbInbound','fbOther','fbExtra','fbVKb','fbCpcB'].forEach(function(id){var e=document.getElementById(id);if(e)e.value='';});
  document.getElementById('fbStorage').value='2';
  document.getElementById('fbSales').value='100';
  document.getElementById('fbReturns').value='5';
  document.getElementById('fbCpc').value='0.50';
  document.getElementById('fbCr').value='10';
  document.getElementById('fbAcos').value='25';
  document.getElementById('fbPpcShare').value='50';
  document.getElementById('fbTargetMargin').value='25';
  fbaCalc();
  toast('Zurückgesetzt');
}

// ─── Gebühren-Konfig-Editor ───
function fbaOpenConfig(){
  var inpStyle='width:80px;background:var(--s2);border:1px solid var(--bd);border-radius:5px;padding:4px 6px;color:var(--tx);font-family:inherit';
  var html='<div style="max-height:60vh;overflow-y:auto">'+
    '<p style="font-size:13px;color:var(--tx2);line-height:1.6;margin-top:0">Alle FBA-Versand- und Lagergebühren stammen 1:1 aus der offiziellen <b>Amazon FBA-Tarifübersicht (gültig ab 1.2.2026)</b>. Werte mit <b style="color:var(--or)">ANNAHME</b> sind nicht offiziell verifiziert — passe sie hier an.</p>'+
    '<h4 style="color:var(--ac);margin:14px 0 8px">FBA-Versandgebühren (€/Einheit, Gewichtsstaffeln)</h4>'+
    '<table style="width:100%;font-size:12px"><tbody>';
  feeConfig.fbaFees.tiers.forEach(function(t,i){
    var isAnnahme=t.note.indexOf('ANNAHME')>-1;
    html+='<tr><td colspan="2" style="padding:8px 4px 2px;color:var(--tx);font-weight:600">'+esc(t.name)+(isAnnahme?' <span style="color:var(--or);font-size:10px">ANNAHME</span>':' <span style="color:var(--gn);font-size:10px">RATE CARD 2026</span>')+'</td></tr>';
    t.brackets.forEach(function(b,j){
      var wLbl=b.w>=1000?('≤ '+(b.w/1000).toLocaleString('de-DE')+' kg'):('≤ '+b.w+' g');
      html+='<tr><td style="padding:2px 4px 2px 18px;color:var(--tx2)">'+wLbl+(b.lp!=null?' <span style="color:var(--bl);font-size:10px" title="Niedrigpreis-Tarif (Low-Price FBA)">LP '+b.lp.toFixed(2)+'€</span>':'')+'</td><td style="padding:2px 4px;width:90px"><input type="number" step="0.01" value="'+b.fee+'" onchange="feeConfig.fbaFees.tiers['+i+'].brackets['+j+'].fee=parseFloat(this.value)||0;fbaPopulateSelectsRefresh();fbaCalc()" style="'+inpStyle+'"></td></tr>';
    });
    if(t.overage)html+='<tr><td style="padding:2px 4px 2px 18px;color:var(--tx3);font-size:11px">darüber je kg</td><td style="padding:2px 4px"><input type="number" step="0.01" value="'+t.overage.perKg+'" onchange="feeConfig.fbaFees.tiers['+i+'].overage.perKg=parseFloat(this.value)||0;fbaCalc()" style="'+inpStyle+'"></td></tr>';
  });
  html+='</tbody></table>'+
    '<h4 style="color:var(--ac);margin:14px 0 8px">Lagergebühren (€/m³/Monat) <span style="color:var(--gn);font-size:10px">RATE CARD 2026</span></h4>'+
    '<table style="width:100%;font-size:12px"><tbody>'+
    '<tr><td style="padding:4px;color:var(--tx2)">Standardgröße Jan–Sep</td><td style="padding:4px;width:90px"><input type="number" step="0.01" value="'+feeConfig.storageFees.standardJanSep+'" onchange="feeConfig.storageFees.standardJanSep=parseFloat(this.value)||0;fbaCalc()" style="'+inpStyle+'"></td></tr>'+
    '<tr><td style="padding:4px;color:var(--tx2)">Standardgröße Okt–Dez</td><td style="padding:4px"><input type="number" step="0.01" value="'+feeConfig.storageFees.standardOktDez+'" onchange="feeConfig.storageFees.standardOktDez=parseFloat(this.value)||0;fbaCalc()" style="'+inpStyle+'"></td></tr>'+
    '<tr><td style="padding:4px;color:var(--tx2)">Übergröße Jan–Sep</td><td style="padding:4px"><input type="number" step="0.01" value="'+feeConfig.storageFees.oversizeJanSep+'" onchange="feeConfig.storageFees.oversizeJanSep=parseFloat(this.value)||0;fbaCalc()" style="'+inpStyle+'"></td></tr>'+
    '<tr><td style="padding:4px;color:var(--tx2)">Übergröße Okt–Dez</td><td style="padding:4px"><input type="number" step="0.01" value="'+feeConfig.storageFees.oversizeOktDez+'" onchange="feeConfig.storageFees.oversizeOktDez=parseFloat(this.value)||0;fbaCalc()" style="'+inpStyle+'"></td></tr>'+
    '</tbody></table>'+
    '<h4 style="color:var(--ac);margin:14px 0 8px">Zuschläge</h4>'+
    '<table style="width:100%;font-size:12px"><tbody>'+
    '<tr><td style="padding:4px;color:var(--tx2)">Eigener Puffer % auf FBA-Gebühr <span style="color:var(--tx3);font-size:10px" title="Die Rate Card 2026 kennt keinen separaten Treibstoffzuschlag mehr — 0 ist korrekt. Optional als Sicherheitspuffer nutzbar.">(2026: 0)</span></td><td style="padding:4px;width:90px"><input type="number" step="0.1" value="'+feeConfig.surcharges.fuelLogisticsPct+'" onchange="feeConfig.surcharges.fuelLogisticsPct=parseFloat(this.value)||0;fbaCalc()" style="'+inpStyle+'"></td></tr>'+
    '<tr><td style="padding:4px;color:var(--tx2)">Nicht-CEP-Zuschlag €/Stk <span style="color:var(--gn);font-size:10px">VERIFIZIERT</span></td><td style="padding:4px"><input type="number" step="0.01" value="'+feeConfig.surcharges.cepPerUnit+'" onchange="feeConfig.surcharges.cepPerUnit=parseFloat(this.value)||0;fbaCalc()" style="'+inpStyle+'"></td></tr>'+
    '<tr><td style="padding:4px;color:var(--tx2)">Peak-Zuschlag €/Stk (15.10.–14.1.) <span style="color:var(--tx3);font-size:10px" title="Peak-Tarife 2026 gibt Amazon am 15.9.2026 bekannt">offen</span></td><td style="padding:4px"><input type="number" step="0.01" value="'+feeConfig.fbaFees.peakSurcharge+'" onchange="feeConfig.fbaFees.peakSurcharge=parseFloat(this.value)||0;fbaCalc()" style="'+inpStyle+'"></td></tr>'+
    '</tbody></table>'+
    '<p style="font-size:11px;color:var(--tx3);margin-top:14px;font-style:italic">💡 Änderungen gelten nur für diese Sitzung. Für dauerhafte Werte: im Code das <code>feeConfig</code>-Objekt anpassen. Quelle: <a href="https://m.media-amazon.com/images/G/02/sell/images/260114-FBA-Rate-Card-DE.pdf" target="_blank" rel="noopener" style="color:var(--ac)">FBA-Tarifübersicht DE (PDF)</a>.</p>'+
  '</div>';
  if(document.getElementById('genModal')){
    document.getElementById('gmTitle').textContent='⚙️ Gebühren anpassen';
    document.getElementById('gmBody').innerHTML=html;
    var saveBtn=document.getElementById('gmSave');
    if(saveBtn){saveBtn.textContent='Schließen';saveBtn.onclick=function(){closeGM();};}
    document.getElementById('genModal').classList.add('show');
  }else{
    alert('Gebühren-Editor: Bitte feeConfig im Code bearbeiten.');
  }
}

function fbaPopulateSelectsRefresh(){
  var sizeSel=document.getElementById('fbSize');
  if(sizeSel){var cur=sizeSel.value;sizeSel.innerHTML='<option value="auto">⚙️ Automatisch ermitteln</option>';feeConfig.fbaFees.tiers.forEach(function(t){var o=document.createElement('option');o.value=t.id;o.textContent=fbaTierLabel(t);sizeSel.appendChild(o);});sizeSel.value=cur;}
}

// ═══════════════════════════════════════════════════════════════
// STEUER-ENGINE — Rücklagenplanung Finanzamt
// ───────────────────────────────────────────────────────────────
// ⚠️ WICHTIG: Dies ist ein vorsichtiges RÜCKLAGEN-MODELL, KEINE
// verbindliche Steuerberechnung und KEINE Steuerberatung!
// Deutsche Steuerlogik, Stand 2026. Werte teils ANNAHME.
// Steuerlogik ist bewusst getrennt von der FBA-Fee-Logik (feeConfig).
// ═══════════════════════════════════════════════════════════════

var taxConfig={
  // ─── Gewerbesteuer ───
  tradeTax:{
    // VERIFIZIERT: Steuermesszahl 3,5% (§11 GewStG)
    baseRate:3.5,
    // VERIFIZIERT: Freibetrag 24.500 € für Einzelunternehmen & Personengesellschaften (§11 Abs.1 GewStG)
    allowance:24500,
    // ANNAHME: durchschnittlicher Hebesatz DE ~400% (Gemeinden 200-900%)
    defaultHebesatz:400,
    note:'Messzahl 3,5% & Freibetrag 24.500€ VERIFIZIERT; Hebesatz je Gemeinde'
  },
  // ─── Einkommensteuer ───
  incomeTax:{
    // VERIFIZIERT (Grundfreibetrag 2026 ~12.348€ — ANNAHME für 2026, da exakter Wert variiert)
    grundfreibetrag:12348,
    // ANNAHME: konservativer pauschaler ESt-Satz, wenn kein persönlicher Satz angegeben
    conservativeRate:35,
    note:'Grundfreibetrag 2026 ist ANNAHME (~12.348€); konservativer Satz 35% ist Rücklage-Annahme'
  },
  // ─── Körperschaftsteuer (UG/GmbH) ───
  corporateTax:{
    // VERIFIZIERT: KSt 15% (§23 KStG)
    rate:15.0,
    // VERIFIZIERT: Solidaritätszuschlag 5,5% auf die KSt
    soli:5.5,
    note:'KSt 15% + Soli 5,5% auf KSt — VERIFIZIERT (§23 KStG)'
  },
  // ─── Solidaritätszuschlag (ESt) ───
  // Für die meisten Einzelunternehmer 2026 entfallen, da unter Freigrenze.
  // Konservativ trotzdem optional. ANNAHME.
  soli:{
    rate:5.5,
    note:'Soli 5,5% — für viele Einzelunternehmer entfallen (Freigrenze), daher Default aus'
  },
  // ─── Anrechnung Gewerbesteuer auf ESt (§35 EStG) ───
  // VERIFIZIERT: das 4-fache des GewSt-Messbetrags wird auf die ESt angerechnet
  gewstAnrechnung:{
    factor:4.0,
    note:'§35 EStG: 4× Messbetrag auf ESt anrechenbar — VERIFIZIERT (vereinfacht)'
  },
  // ─── Sicherheitsaufschlag Default ───
  defaultSafetyMargin:10 // ANNAHME: 10% Puffer empfohlen
};

// ─── Gewerbesteuer-Schätzung ───
// gewinn: Jahresgewinn vor Steuern
// rechtsform: 'einzel'|'freiberufler'|'ug'|'gmbh'
function calculateTradeTaxEstimate(gewinn, rechtsform, hebesatz, tradeTaxLiable){
  if(!tradeTaxLiable)return {tax:0, messbetrag:0};
  if(rechtsform==='freiberufler')return {tax:0, messbetrag:0}; // Freiberufler i.d.R. keine GewSt
  gewinn=gewinn||0;
  hebesatz=hebesatz||taxConfig.tradeTax.defaultHebesatz;
  // Freibetrag nur für Einzelunternehmen & Personengesellschaften (nicht UG/GmbH)
  var allowance=(rechtsform==='einzel')?taxConfig.tradeTax.allowance:0;
  var base=Math.max(0, gewinn-allowance);
  var messbetrag=base*(taxConfig.tradeTax.baseRate/100);
  var tax=messbetrag*(hebesatz/100);
  return {tax:tax, messbetrag:messbetrag};
}

// ─── Einkommensteuer-Schätzung (für Einzel/Freiberufler) ───
// Vereinfachtes Rücklagenmodell: persönlicher Satz × (Gewinn − Grundfreibetrag)
// abzüglich GewSt-Anrechnung nach §35 EStG (vereinfacht).
function calculateIncomeTaxEstimate(gewinn, personalRate, gewstMessbetrag){
  gewinn=gewinn||0;
  var rate=(personalRate!=null && personalRate>0)?personalRate:taxConfig.incomeTax.conservativeRate;
  var taxable=Math.max(0, gewinn-taxConfig.incomeTax.grundfreibetrag);
  var estGross=taxable*(rate/100);
  // §35 EStG: GewSt-Anrechnung (4× Messbetrag), mindert ESt, nicht unter 0
  var anrechnung=(gewstMessbetrag||0)*taxConfig.gewstAnrechnung.factor;
  var est=Math.max(0, estGross-anrechnung);
  return {tax:est, gross:estGross, anrechnung:Math.min(estGross,anrechnung)};
}

// ─── Körperschaftsteuer (UG/GmbH) ───
function calculateCorporateTaxEstimate(gewinn){
  gewinn=Math.max(0, gewinn||0);
  var kst=gewinn*(taxConfig.corporateTax.rate/100);
  var soli=kst*(taxConfig.corporateTax.soli/100);
  return {kst:kst, soli:soli, total:kst+soli};
}

// ─── Umsatzsteuer-Rücklage ───
// Die USt ist ein DURCHLAUFPOSTEN, kein Gewinn! Sie wird vereinnahmt
// und ans Finanzamt abgeführt (abzüglich Vorsteuer).
// vatCollected: vereinnahmte USt (auf Verkäufe)
// vatPaid: gezahlte Vorsteuer (auf Einkäufe/Kosten)
function calculateVatReserve(vatCollected, vatPaid, vatLiable){
  if(!vatLiable)return 0;
  return Math.max(0, (vatCollected||0)-(vatPaid||0));
}

// ─── Gesamte Steuer-Rücklage ───
function calculateTaxReserve(input){
  var gewinn=input.yearlyProfit||0; // Jahresgewinn vor Steuern (operativ)
  var rechtsform=input.rechtsform||'einzel';
  var result={rechtsform:rechtsform, gewinnVorSteuer:gewinn};

  if(rechtsform==='ug'||rechtsform==='gmbh'){
    // Kapitalgesellschaft: KSt + Soli + GewSt (kein Freibetrag, keine ESt auf Firmenebene)
    var trade=calculateTradeTaxEstimate(gewinn, rechtsform, input.hebesatz, input.tradeTaxLiable!==false);
    var corp=calculateCorporateTaxEstimate(gewinn);
    result.gewerbesteuer=trade.tax;
    result.koerperschaftsteuer=corp.kst;
    result.soli=corp.soli;
    result.einkommensteuer=0;
    result.steuerlast=trade.tax+corp.total;
  }else{
    // Einzelunternehmen / Freiberufler: GewSt (mit Freibetrag, außer Freiberufler) + ESt
    var trade2=calculateTradeTaxEstimate(gewinn, rechtsform, input.hebesatz, input.tradeTaxLiable!==false);
    var inc=calculateIncomeTaxEstimate(gewinn, input.personalRate, trade2.messbetrag);
    result.gewerbesteuer=trade2.tax;
    result.gewerbesteuerMessbetrag=trade2.messbetrag;
    result.einkommensteuer=inc.tax;
    result.estAnrechnung=inc.anrechnung;
    result.koerperschaftsteuer=0;
    result.soli=0;
    result.steuerlast=trade2.tax+inc.tax;
  }

  // Sicherheitsaufschlag
  var safety=(input.safetyMargin!=null?input.safetyMargin:taxConfig.defaultSafetyMargin);
  result.sicherheitsaufschlag=result.steuerlast*(safety/100);
  result.steuerlastMitPuffer=result.steuerlast+result.sicherheitsaufschlag;

  // Vorauszahlungen abziehen
  var prepaid=input.prepaid||0;
  result.vorauszahlungen=prepaid;
  result.empfohleneRuecklage=Math.max(0, result.steuerlastMitPuffer-prepaid);

  // USt-Rücklage (separat, Durchlaufposten)
  result.ustRuecklage=calculateVatReserve(input.vatCollected, input.vatPaid, input.vatLiable);

  // Effektive Steuerquote
  result.steuerquote=gewinn>0?(result.steuerlast/gewinn*100):0;

  return result;
}

// ─── Netto nach Steuer-Rücklage ───
function calculateNetAfterTaxReserve(yearlyProfit, taxResult){
  return (yearlyProfit||0)-(taxResult.steuerlastMitPuffer||0);
}

// ═══════════════════════════════════════════════════════════════
// STEUER-RENDERING
// ═══════════════════════════════════════════════════════════════

function fbaToggleTax(){
  var on=document.getElementById('fbTaxEnable').checked;
  document.getElementById('fbTaxPanel').style.display=on?'block':'none';
  if(on)fbaCalcTax();
}

function fbaTaxCollectInput(yearlyProfit, vatCollectedYear, vatPaidYear){
  return {
    yearlyProfit:yearlyProfit,
    rechtsform:document.getElementById('fbTaxForm').value,
    hebesatz:pf('fbTaxHebesatz'),
    vatLiable:document.getElementById('fbTaxVatLiable').value==='yes',
    personalRate:pf('fbTaxEstRate'),
    tradeTaxLiable:document.getElementById('fbTaxTradeLiable').value==='yes',
    prepaid:pf('fbTaxPrepaid'),
    safetyMargin:pf('fbTaxSafety'),
    employment:document.getElementById('fbTaxEmployment').value,
    vatCollected:vatCollectedYear,
    vatPaid:vatPaidYear
  };
}

function fbaCalcTax(){
  if(!document.getElementById('fbTaxEnable')||!document.getElementById('fbTaxEnable').checked)return;
  // Basis: Jahresgewinn = Monatsgewinn der aktuellen Kalkulation × 12
  var input=fbaCollectInput();
  if((input.price||0)<=0){
    document.getElementById('fbTaxResult').innerHTML='<div style="padding:20px;text-align:center;color:var(--tx3);font-size:13px">Gib zuerst oben eine Kalkulation mit Verkaufspreis ein.</div>';
    return;
  }
  var m=calculateProfitMetrics(input);
  var monthlyProfit=m.monthlyProfit||0;
  var yearlyProfit=monthlyProfit*12;

  // USt-Schätzung übers Jahr: vereinnahmte USt auf Verkäufe − Vorsteuer auf Wareneinsatz
  var salesYear=(input.salesPerMonth||0)*12;
  var vatCollectedYear=m.vat.vat*salesYear; // USt pro verkaufter Einheit × Jahresmenge
  var vatPaidYear=((input.cogs||0)+(input.packaging||0)+(input.inbound||0))*0.19/1.19*salesYear; // grobe Vorsteuer-ANNAHME (19% in EK enthalten)

  var taxInput=fbaTaxCollectInput(yearlyProfit, vatCollectedYear, vatPaidYear);
  var t=calculateTaxReserve(taxInput);
  var netAfter=calculateNetAfterTaxReserve(yearlyProfit, t);

  var isKap=(t.rechtsform==='ug'||t.rechtsform==='gmbh');

  // Ampel: Verhältnis Rücklage zu Gewinn
  var reservePct=yearlyProfit>0?(t.steuerlastMitPuffer/yearlyProfit*100):0;
  var ampel, ampelText;
  if(yearlyProfit<=0){ampel='tx3';ampelText='⚪ Kein Gewinn — keine Steuerrücklage nötig';}
  else if(reservePct<25){ampel='gn';ampelText='🟢 Moderate Steuerlast ('+reservePct.toFixed(0)+'% Rücklage)';}
  else if(reservePct<40){ampel='ac';ampelText='🟡 Mittlere Steuerlast ('+reservePct.toFixed(0)+'% Rücklage)';}
  else{ampel='rd';ampelText='🔴 Hohe Steuerlast ('+reservePct.toFixed(0)+'% Rücklage) — gut zurücklegen!';}

  var fmt=function(v){return (v||0).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';};

  var html='';

  // Ampel-Banner
  html+='<div style="border-radius:10px;padding:14px 18px;text-align:center;font-weight:700;font-size:15px;margin-bottom:16px;background:var(--'+ampel+'d);color:var(--'+ampel+');border:1.5px solid var(--'+ampel+')">'+ampelText+'</div>';

  // 4 Hauptkacheln
  html+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">';
  html+='<div class="ci" style="background:var(--s2);border-radius:10px;padding:14px"><span class="cl">Gewinn vor Steuern / Jahr</span><span class="cv" style="color:var(--tx);font-size:22px">'+fmt(yearlyProfit)+'</span></div>';
  html+='<div class="ci" style="background:var(--s2);border-radius:10px;padding:14px"><span class="cl">Geschätzte Steuerlast</span><span class="cv" style="color:var(--rd);font-size:22px">'+fmt(t.steuerlast)+'</span></div>';
  html+='<div class="ci" style="background:var(--'+ampel+'d);border-radius:10px;padding:14px;border:1.5px solid var(--'+ampel+')"><span class="cl">📥 Empfohlene Rücklage</span><span class="cv" style="color:var(--'+ampel+');font-size:22px">'+fmt(t.empfohleneRuecklage)+'</span></div>';
  html+='<div class="ci" style="background:var(--s2);border-radius:10px;padding:14px"><span class="cl">✅ Frei verfügbar / Jahr</span><span class="cv" style="color:var(--gn);font-size:22px">'+fmt(netAfter)+'</span></div>';
  html+='</div>';

  // Monatliche Rücklage-Empfehlung
  html+='<div style="background:linear-gradient(135deg,var(--acd),var(--s2));border:1px solid var(--ac);border-radius:10px;padding:14px 18px;margin-bottom:16px;text-align:center">'+
    '<div style="font-size:12px;color:var(--tx2);text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-bottom:4px">💡 Monatlich zurücklegen</div>'+
    '<div style="font-size:28px;font-weight:800;color:var(--ac)">'+fmt(t.steuerlastMitPuffer/12)+'</div>'+
    '<div style="font-size:11px;color:var(--tx3)">pro Monat aufs Steuer-Unterkonto (inkl. '+(pf('fbTaxSafety')||10)+'% Puffer)</div>'+
  '</div>';

  // Aufschlüsselung
  html+='<div class="card" style="margin:0 0 14px 0"><h3 style="margin-top:0;font-size:14px">📋 Steuer-Aufschlüsselung (Schätzung / Jahr)</h3><table style="margin:0;font-size:13px"><tbody>';
  var rows=[['Operativer Gewinn vor Steuern', fmt(yearlyProfit), 'var(--tx)']];
  if(isKap){
    rows.push(['Körperschaftsteuer (15%)', '−'+fmt(t.koerperschaftsteuer), 'var(--rd)']);
    rows.push(['Solidaritätszuschlag (5,5% auf KSt)', '−'+fmt(t.soli), 'var(--rd)']);
    if(t.gewerbesteuer>0)rows.push(['Gewerbesteuer (Hebesatz '+(pf('fbTaxHebesatz')||400)+'%)', '−'+fmt(t.gewerbesteuer), 'var(--rd)']);
  }else{
    if(t.gewerbesteuer>0){
      rows.push(['Gewerbesteuer (Hebesatz '+(pf('fbTaxHebesatz')||400)+'%, Freibetrag '+(t.rechtsform==='einzel'?'24.500€':'0€')+')', '−'+fmt(t.gewerbesteuer), 'var(--rd)']);
    }else{
      rows.push(['Gewerbesteuer', t.rechtsform==='freiberufler'?'entfällt (Freiberufler)':'0,00 € (unter Freibetrag/nicht pflichtig)', 'var(--tx3)']);
    }
    rows.push(['Einkommensteuer (geschätzt)', '−'+fmt(t.einkommensteuer), 'var(--rd)']);
    if(t.estAnrechnung>0)rows.push(['  davon GewSt-Anrechnung §35 EStG', '+'+fmt(t.estAnrechnung), 'var(--gn)']);
  }
  rows.push(['= Steuerlast gesamt', fmt(t.steuerlast), 'var(--rd)']);
  rows.push(['+ Sicherheitsaufschlag ('+(pf('fbTaxSafety')||10)+'%)', '+'+fmt(t.sicherheitsaufschlag), 'var(--or)']);
  if(t.vorauszahlungen>0)rows.push(['− Bereits geleistete Vorauszahlungen', '−'+fmt(t.vorauszahlungen), 'var(--gn)']);
  rows.push(['= Empfohlene Finanzamt-Rücklage', fmt(t.empfohleneRuecklage), 'var(--ac)']);

  rows.forEach(function(r){
    var isTotal=r[0].charAt(0)==='=';
    var isSub=r[0].charAt(0)===' ';
    html+='<tr style="'+(isTotal?'font-weight:700;border-top:1px solid var(--bd2)':'')+'"><td style="padding:6px 4px;color:'+(isSub?'var(--tx3)':'var(--tx2)')+';font-size:'+(isSub?'12':'13')+'px;'+(isSub?'padding-left:16px':'')+'">'+esc(r[0])+'</td><td class="nc" style="padding:6px 4px;text-align:right;color:'+r[2]+';font-weight:'+(isTotal?'700':'600')+'">'+r[1]+'</td></tr>';
  });
  html+='</tbody></table></div>';

  // USt-Hinweis (separater Durchlaufposten)
  if(t.ustRuecklage>0){
    html+='<div class="card" style="margin:0 0 14px 0;border-left:3px solid var(--bl)"><h3 style="margin-top:0;font-size:14px">🔄 Umsatzsteuer (Durchlaufposten)</h3>'+
      '<p style="font-size:12px;color:var(--tx2);line-height:1.6;margin:0 0 10px">Die USt ist <b>kein Gewinn</b> — du ziehst sie von Kunden ein und führst sie (abzüglich Vorsteuer) ans Finanzamt ab. Lege sie <b>zusätzlich</b> zur Einkommen-/Gewerbesteuer-Rücklage zurück!</p>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'+
        '<div class="ci"><span class="cl">USt-Zahllast / Jahr (geschätzt)</span><span class="cv" style="color:var(--bl)">'+fmt(t.ustRuecklage)+'</span></div>'+
        '<div class="ci"><span class="cl">USt-Rücklage / Monat</span><span class="cv" style="color:var(--bl)">'+fmt(t.ustRuecklage/12)+'</span></div>'+
      '</div>'+
      '<p style="font-size:11px;color:var(--tx3);font-style:italic;margin:10px 0 0">⚠️ Grobe Schätzung: vereinnahmte USt auf Verkäufe minus angenommene Vorsteuer (19% in EK/Verpackung/Versand). Bei Kleinunternehmerregelung (§19 UStG) entfällt das.</p>'+
    '</div>';
  }

  // Gesamt-Rücklage (Steuer + USt)
  var totalReserve=t.empfohleneRuecklage+t.ustRuecklage;
  html+='<div style="background:var(--s1);border:2px solid var(--ac);border-radius:12px;padding:16px 20px;margin-bottom:14px;text-align:center">'+
    '<div style="font-size:12px;color:var(--tx2);text-transform:uppercase;letter-spacing:1px;font-weight:700">📥 Gesamte Finanzamt-Rücklage / Jahr</div>'+
    '<div style="font-size:30px;font-weight:800;color:var(--ac);margin:6px 0">'+fmt(totalReserve)+'</div>'+
    '<div style="font-size:12px;color:var(--tx3)">= '+fmt(t.empfohleneRuecklage)+' Ertragsteuern'+(t.ustRuecklage>0?' + '+fmt(t.ustRuecklage)+' USt':'')+' · ≈ '+fmt(totalReserve/12)+'/Monat</div>'+
  '</div>';

  // Disclaimer
  html+='<div style="background:var(--rdd);border:1px solid var(--rd);border-radius:10px;padding:12px 16px;font-size:12px;line-height:1.6;color:var(--tx)">'+
    '<b style="color:var(--rd)">⚠️ Wichtiger Hinweis:</b> Dies ist eine <b>Schätzung zur Rücklagenplanung</b> und ersetzt keine steuerliche Beratung. Tatsächliche Steuern hängen von deiner Gesamtsituation ab (weitere Einkünfte, Ehegattensplitting, Sonderausgaben, Abschreibungen u.v.m.). Sprich mit einem Steuerberater.'+
  '</div>';

  document.getElementById('fbTaxResult').innerHTML=html;
}

// ═══════════════ WETTBEWERB ═══════════════
function renderComp(){
  var pi=parseInt(document.getElementById('wProd').value);
  var items=D.competitors.filter(function(c){return c.prodIdx===pi});
  var tb=document.getElementById('compBody');tb.innerHTML='';
  document.getElementById('compEmpty').style.display=isNaN(pi)||items.length===0?'block':'none';
  items.forEach(function(c,ci){
    var ri=D.competitors.indexOf(c);
    var tr=document.createElement('tr');
    tr.innerHTML='<td style="font-weight:600">'+esc(c.name)+'</td><td>'+esc(c.asin||'')+'</td><td class="nc">'+fmt(c.preis)+'</td><td class="nc">'+(c.bewertungen||'—')+'</td><td class="nc">'+(c.bsr||'—')+'</td><td class="nc">'+(c.rating||'—')+'</td><td>'+esc(c.staerken||'')+'</td><td>'+esc(c.schwaechen||'')+'</td><td><div class="row-act"><button class="del" onclick="D.competitors.splice('+ri+',1);save();renderComp()">🗑️</button></div></td>';
    tb.appendChild(tr);
  });
}
function addComp(){
  var pi=parseInt(document.getElementById('wProd').value);if(isNaN(pi))return toast('Erst Produkt wählen');
  gmPrompt('Wettbewerber hinzufügen',[{l:'Name *',id:'cn'},{l:'ASIN',id:'ca'},{l:'Preis €',id:'cp',t:'number'},{l:'Bewertungen',id:'cb',t:'number'},{l:'BSR',id:'cbs',t:'number'},{l:'Rating ★',id:'cr',t:'number'},{l:'Stärken',id:'cs',tag:'textarea'},{l:'Schwächen',id:'cw',tag:'textarea'}],function(){
    D.competitors.push({prodIdx:pi,name:document.getElementById('cn').value.trim(),asin:document.getElementById('ca').value.trim(),preis:pf('cp'),bewertungen:parseInt(document.getElementById('cb').value)||0,bsr:parseInt(document.getElementById('cbs').value)||0,rating:pf('cr'),staerken:document.getElementById('cs').value.trim(),schwaechen:document.getElementById('cw').value.trim()});
    save();renderComp();toast('Hinzugefügt ✓');
  });
}

// ═══════════════ KEYWORDS ═══════════════
function renderKW(){
  var pi=parseInt(document.getElementById('kwProd').value);
  var items=D.keywords.filter(function(k){return k.prodIdx===pi});
  var tb=document.getElementById('kwBody');tb.innerHTML='';
  document.getElementById('kwEmpty').style.display=isNaN(pi)||items.length===0?'block':'none';
  items.forEach(function(k){
    var ri=D.keywords.indexOf(k);
    var tr=document.createElement('tr');
    tr.innerHTML='<td style="font-weight:600">'+esc(k.keyword)+'</td><td class="nc">'+(k.volume||'—')+'</td><td class="nc">'+esc(k.wettbewerb||'—')+'</td><td><span class="badge '+(k.relevanz==='Hoch'?'b-bestellt':k.relevanz==='Mittel'?'b-analyse':'b-recherche')+'">'+esc(k.relevanz||'—')+'</span></td><td>'+(k.imListing?'✅':'❌')+'</td><td>'+esc(k.notiz||'')+'</td><td><div class="row-act"><button class="del" onclick="D.keywords.splice('+ri+',1);save();renderKW()">🗑️</button></div></td>';
    tb.appendChild(tr);
  });
}

// ─── Keyword-Center: Tab-Umschaltung ───
function switchKwTab(tab){
  ['tracking','cleaner','scribbles'].forEach(function(t){
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
  if(tab==='cleaner'&&typeof renderKeywordClean==='function')renderKeywordClean();
  if(tab==='scribbles'&&typeof scribblesRun==='function')scribblesRun();
}
function addKW(){
  var pi=parseInt(document.getElementById('kwProd').value);if(isNaN(pi))return toast('Erst Produkt wählen');
  gmPrompt('Keyword hinzufügen',[{l:'Keyword *',id:'kw'},{l:'Suchvolumen',id:'kv',t:'number'},{l:'Wettbewerb',id:'kwb',tag:'select',opts:['Niedrig','Mittel','Hoch']},{l:'Relevanz',id:'kr',tag:'select',opts:['Niedrig','Mittel','Hoch']},{l:'Im Listing?',id:'kl2',tag:'select',opts:['Nein','Ja']},{l:'Notiz',id:'kn'}],function(){
    D.keywords.push({prodIdx:pi,keyword:document.getElementById('kw').value.trim(),volume:parseInt(document.getElementById('kv').value)||0,wettbewerb:document.getElementById('kwb').value,relevanz:document.getElementById('kr').value,imListing:document.getElementById('kl2').value==='Ja',notiz:document.getElementById('kn').value.trim()});
    save();renderKW();toast('Hinzugefügt ✓');
  });
}

// ═══════════════ REVIEWS ═══════════════
function renderRev(){
  var pi=parseInt(document.getElementById('revProd').value);
  var items=D.reviews.filter(function(r){return r.prodIdx===pi});
  var tb=document.getElementById('revBody');tb.innerHTML='';
  document.getElementById('revEmpty').style.display=isNaN(pi)||items.length===0?'block':'none';
  items.forEach(function(r){
    var ri=D.reviews.indexOf(r);
    var tr=document.createElement('tr');
    tr.innerHTML='<td><span class="badge '+(r.kategorie==='Qualität'?'b-abgelehnt':r.kategorie==='Funktion'?'b-analyse':r.kategorie==='Verpackung'?'b-recherche':'b-idee')+'">'+esc(r.kategorie||'')+'</span></td><td>'+esc(r.text)+'</td><td class="nc">'+esc(r.haeufigkeit||'')+'</td><td>'+(r.chance?'✅ Ja':'—')+'</td><td>'+esc(r.notiz||'')+'</td><td><div class="row-act"><button class="del" onclick="D.reviews.splice('+ri+',1);save();renderRev()">🗑️</button></div></td>';
    tb.appendChild(tr);
  });
}
function addRev(){
  var pi=parseInt(document.getElementById('revProd').value);if(isNaN(pi))return toast('Erst Produkt wählen');
  gmPrompt('Review-Punkt',[{l:'Kategorie',id:'rc',tag:'select',opts:['Qualität','Funktion','Verpackung','Preis','Lieferung','Sonstiges']},{l:'Beschwerde / Wunsch *',id:'rt'},{l:'Häufigkeit',id:'rh',tag:'select',opts:['Selten','Gelegentlich','Häufig','Sehr häufig']},{l:'Chance für uns?',id:'ro',tag:'select',opts:['Nein','Ja']},{l:'Notiz',id:'rn'}],function(){
    D.reviews.push({prodIdx:pi,kategorie:document.getElementById('rc').value,text:document.getElementById('rt').value.trim(),haeufigkeit:document.getElementById('rh').value,chance:document.getElementById('ro').value==='Ja',notiz:document.getElementById('rn').value.trim()});
    save();renderRev();toast('Hinzugefügt ✓');
  });
}

// ═══════════════ SOURCING ═══════════════
function renderSrc(){
  var pi=parseInt(document.getElementById('srcProd').value);
  var items=D.suppliers.filter(function(s){return s.prodIdx===pi});
  var tb=document.getElementById('srcBody');tb.innerHTML='';
  document.getElementById('srcEmpty').style.display=isNaN(pi)||items.length===0?'block':'none';
  items.forEach(function(s){
    var ri=D.suppliers.indexOf(s);
    var score=calcSrcScore(s);
    var tr=document.createElement('tr');
    tr.innerHTML='<td style="font-weight:600">'+esc(s.name)+'</td><td>'+esc(s.plattform||'')+'</td><td class="nc">'+fmt(s.preis)+'</td><td class="nc">'+(s.moq||'—')+'</td><td class="nc">'+(s.lieferzeit||'—')+'</td><td class="nc">'+fmt(s.muster)+'</td><td class="nc" style="font-weight:700;color:'+(score>=7?'var(--gn)':score>=4?'var(--ac)':'var(--rd)')+'">'+score.toFixed(1)+'</td><td>'+esc(s.zertifikate||'')+'</td><td class="note-c" title="'+esc(s.notiz||'')+'">'+esc(s.notiz||'')+'</td><td><div class="row-act"><button class="del" onclick="D.suppliers.splice('+ri+',1);save();renderSrc()">🗑️</button></div></td>';
    tb.appendChild(tr);
  });
}
function calcSrcScore(s){var score=5;if(s.preis<2)score+=2;else if(s.preis<5)score+=1;if(s.lieferzeit<20)score+=1;if(s.moq<200)score+=1;if(s.zertifikate)score+=1;return Math.min(10,score)}
function addSrc(){
  var pi=parseInt(document.getElementById('srcProd').value);if(isNaN(pi))return toast('Erst Produkt wählen');
  gmPrompt('Lieferant hinzufügen',[{l:'Name *',id:'sn'},{l:'Plattform',id:'sp',tag:'select',opts:['Alibaba','1688','Made-in-China','Global Sources','Direkt','Andere']},{l:'Stückpreis €',id:'spx',t:'number'},{l:'MOQ',id:'sm',t:'number'},{l:'Lieferzeit (Tage)',id:'sl',t:'number'},{l:'Musterkosten €',id:'smu',t:'number'},{l:'Zertifikate',id:'sz'},{l:'Notiz',id:'sno'}],function(){
    D.suppliers.push({prodIdx:pi,name:document.getElementById('sn').value.trim(),plattform:document.getElementById('sp').value,preis:pf('spx'),moq:parseInt(document.getElementById('sm').value)||0,lieferzeit:parseInt(document.getElementById('sl').value)||0,muster:pf('smu'),zertifikate:document.getElementById('sz').value.trim(),notiz:document.getElementById('sno').value.trim()});
    save();renderSrc();toast('Hinzugefügt ✓');
  });
}

// ═══════════════ LAGERBESTAND ═══════════════
function lCalc(){
  var best=parseInt(document.getElementById('lBest').value)||0;
  var vpt=parseFloat(document.getElementById('lVPT').value)||0;
  var lz=parseInt(document.getElementById('lLZ').value)||35;
  var puff=parseInt(document.getElementById('lPuff').value)||14;
  var nbm=parseInt(document.getElementById('lNBM').value)||500;
  var ek=pf('lEK');
  var reich=vpt>0?Math.floor(best/vpt):0;
  var rop=Math.ceil(vpt*(lz+puff));
  var daysUntilOrder=vpt>0?Math.max(0,Math.floor((best-rop)/vpt)):0;
  var orderDate=new Date();orderDate.setDate(orderDate.getDate()+daysUntilOrder);
  document.getElementById('lReich').textContent=reich>0?reich+' Tage':'—';
  document.getElementById('lDate').textContent=vpt>0?orderDate.toLocaleDateString('de-DE'):'—';
  document.getElementById('lROP').textContent=rop>0?rop+' Stk':'—';
  document.getElementById('lInv').textContent=ek>0?eur(nbm*ek):'—';
  var m=document.getElementById('lMeter');
  var pct=rop>0?Math.min(100,(best/rop)*50):0;// 50% = at reorder point
  m.style.width=Math.min(100,Math.max(5,(best/(rop*2))*100))+'%';
  m.style.background=best<=rop?'var(--rd)':best<=rop*1.5?'var(--ac)':'var(--gn)';
  m.textContent=reich>0?reich+'d':'';
}

// ═══════════════ LAUNCH-PLANER ═══════════════
var defaultLaunch=[
  {text:'Produktidee validiert',done:false,date:''},
  {text:'Sample bestellt',done:false,date:''},
  {text:'Sample getestet & genehmigt',done:false,date:''},
  {text:'Listing-Texte geschrieben',done:false,date:''},
  {text:'Produktfotos erstellt',done:false,date:''},
  {text:'A+ Content erstellt',done:false,date:''},
  {text:'EAN / GTIN beschafft',done:false,date:''},
  {text:'Listing auf Amazon erstellt',done:false,date:''},
  {text:'Bestellung beim Lieferanten',done:false,date:''},
  {text:'Versand zum FBA-Lager',done:false,date:''},
  {text:'Ware im FBA-Lager eingetroffen',done:false,date:''},
  {text:'PPC-Kampagne vorbereitet',done:false,date:''},
  {text:'PPC-Kampagne gestartet',done:false,date:''},
  {text:'Erste Verkäufe überprüft',done:false,date:''},
  {text:'Reviews-Strategie gestartet',done:false,date:''}
];

function renderLaunch(){
  var pi=parseInt(document.getElementById('laProd').value);
  var items=D.launches.filter(function(l){return l.prodIdx===pi});
  var wrap=document.getElementById('launchList');wrap.innerHTML='';
  var prog=document.getElementById('launchProgress');prog.innerHTML='';
  document.getElementById('launchEmpty').style.display=isNaN(pi)||items.length===0?'block':'none';
  if(isNaN(pi)||items.length===0)return;
  var done=items.filter(function(l){return l.done}).length;
  var pct=items.length>0?Math.round((done/items.length)*100):0;
  prog.innerHTML='<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px"><span style="font-size:13px;font-weight:600">'+pct+'% abgeschlossen</span><span style="font-size:12px;color:var(--tx2)">('+done+'/'+items.length+')</span></div><div class="progress-bar"><div class="progress-fill" style="width:'+pct+'%"></div></div>';
  items.forEach(function(l){
    var ri=D.launches.indexOf(l);
    var div=document.createElement('div');div.className='cl-item';
    div.innerHTML='<input type="checkbox" '+(l.done?'checked':'')+' onchange="D.launches['+ri+'].done=this.checked;save();renderLaunch()">'
      +'<span class="cl-text'+(l.done?' done':'')+'">'+esc(l.text)+'</span>'
      +'<span class="cl-date"><input type="date" value="'+(l.date||'')+'" onchange="D.launches['+ri+'].date=this.value;save()"></span>'
      +'<div class="row-act"><button class="del" onclick="D.launches.splice('+ri+',1);save();renderLaunch()">🗑️</button></div>';
    wrap.appendChild(div);
  });
}
function addLaunchItem(){
  var pi=parseInt(document.getElementById('laProd').value);if(isNaN(pi))return toast('Erst Produkt wählen');
  var text=prompt('Aufgabe:');if(!text)return;
  D.launches.push({prodIdx:pi,text:text.trim(),done:false,date:''});save();renderLaunch();toast('Hinzugefügt ✓');
}
function loadLaunchTemplate(){
  var pi=parseInt(document.getElementById('laProd').value);if(isNaN(pi))return toast('Erst Produkt wählen');
  if(!confirm('Standard-Vorlage laden? Bestehende Einträge bleiben erhalten.'))return;
  defaultLaunch.forEach(function(t){D.launches.push({prodIdx:pi,text:t.text,done:false,date:''})});
  save();renderLaunch();toast('Vorlage geladen ✓');
}

// ═══════════════ DASHBOARD ═══════════════
// ═══════════════ GLOBAL SEARCH ═══════════════

var globalSearchSelectedIdx=0;
var globalSearchCurrentResults=[];

function openGlobalSearch(){
  document.getElementById('globalSearchModal').classList.add('show');
  setTimeout(function(){
    var inp=document.getElementById('globalSearchInput');
    inp.value='';
    inp.focus();
    runGlobalSearch('');
  },50);
}

function closeGlobalSearch(){
  document.getElementById('globalSearchModal').classList.remove('show');
  globalSearchCurrentResults=[];
  globalSearchSelectedIdx=0;
}

function escapeHtml(s){if(!s)return'';return String(s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}

function highlightMatch(text,query){
  if(!text)return'';
  if(!query)return escapeHtml(text);
  var safe=escapeHtml(text);
  var safeQ=escapeHtml(query);
  var re=new RegExp('('+safeQ.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','gi');
  return safe.replace(re,'<mark style="background:var(--acd);color:var(--ac);font-weight:700;padding:1px 3px;border-radius:3px">$1</mark>');
}

function runGlobalSearch(query){
  query=(query||'').trim().toLowerCase();
  var results=[];

  if(query.length>=1){
    // Search products
    (D.products||[]).forEach(function(p,idx){
      var hay=((p.name||'')+' '+(p.kategorie||'')+' '+(p.asin||'')+' '+(p.notizen||'')).toLowerCase();
      if(hay.indexOf(query)>=0){
        results.push({
          type:'product',
          icon:'📋',
          color:'ac',
          title:p.name||'(Ohne Namen)',
          subtitle:'Produkt · '+(p.status||'—')+(p.asin?' · '+p.asin:''),
          action:function(){closeGlobalSearch();openProductDetail(idx)}
        });
      }
    });

    // Search ideas
    (D.ideen||[]).forEach(function(i,idx){
      var hay=((i.name||'')+' '+(i.kategorie||'')+' '+(i.warum||'')+' '+(i.differenzierung||'')+' '+(i.zielgruppe||'')).toLowerCase();
      if(hay.indexOf(query)>=0){
        results.push({
          type:'idea',
          icon:'💡',
          color:'pu',
          title:i.name||'(Ohne Namen)',
          subtitle:'Idee · '+(i.status||'—')+' · Potenzial: '+(i.potenzial||'—'),
          action:function(){closeGlobalSearch();go('ideen');setTimeout(function(){if(typeof openIdeeModal==='function')openIdeeModal(idx)},150)}
        });
      }
    });

    // Search keywords
    (D.keywords||[]).forEach(function(k){
      var hay=(k.keyword||'').toLowerCase();
      if(hay.indexOf(query)>=0){
        var prodName=k.productIdx!=null&&D.products[k.productIdx]?D.products[k.productIdx].name:'—';
        results.push({
          type:'keyword',
          icon:'🔑',
          color:'bl',
          title:k.keyword,
          subtitle:'Keyword · Produkt: '+prodName+' · Vol: '+(k.suchvolumen||'?'),
          action:function(){closeGlobalSearch();go('keywords')}
        });
      }
    });

    // Search suppliers
    (D.suppliers||[]).forEach(function(s){
      var hay=((s.name||'')+' '+(s.land||'')+' '+(s.notiz||'')).toLowerCase();
      if(hay.indexOf(query)>=0){
        var prodName=s.productIdx!=null&&D.products[s.productIdx]?D.products[s.productIdx].name:'—';
        results.push({
          type:'supplier',
          icon:'🏭',
          color:'cy',
          title:s.name||'(Ohne Namen)',
          subtitle:'Lieferant · Produkt: '+prodName+(s.land?' · '+s.land:''),
          action:function(){closeGlobalSearch();if(s.productIdx!=null){openProductDetail(s.productIdx);setTimeout(function(){goSub('hersteller')},120)}}
        });
      }
    });

    // Search coaching lessons
    if(typeof COACHING_MODULES!=='undefined'){
      COACHING_MODULES.forEach(function(mod){
        mod.lessons.forEach(function(l){
          var hay=((l.title||'')+' '+(mod.title||'')).toLowerCase();
          if(hay.indexOf(query)>=0){
            var done=D.coachingProgress&&D.coachingProgress[l.id];
            results.push({
              type:'lesson',
              icon:'🎓',
              color:'gn',
              title:l.title,
              subtitle:'Lektion in '+mod.title+(done?' · ✓ abgeschlossen':' · '+l.readTime),
              action:function(){closeGlobalSearch();go('coaching');setTimeout(function(){go_lesson(mod.id,l.id)},150)}
            });
          }
        });
      });
    }
  }

  // Always include navigation entries (filterable by query)
  var navEntries=[
    {q:'dashboard startseite home',label:'Dashboard',sub:'Startseite mit Übersicht',icon:'🏠',target:'dashboard'},
    {q:'produktliste produkte liste',label:'Produktliste',sub:'Alle Produkte verwalten',icon:'📋',target:'produkte'},
    {q:'ideen pool brainstorming',label:'Ideen-Pool',sub:'Produktideen sammeln',icon:'💡',target:'ideen'},
    {q:'helium 10 import csv black box cerebro xray',label:'Helium 10 Import',sub:'CSV-Daten von Helium importieren',icon:'📥',target:'helium'},
    {q:'gebühren rechner fba kalkulation amazon fees',label:'Gebührenrechner',sub:'Amazon FBA-Gebühren',icon:'💶',target:'gebuehren'},
    {q:'keyword tracker keywords',label:'Keyword-Tracker',sub:'Suchbegriffe verfolgen',icon:'🔑',target:'keywords'},
    {q:'lager lagerbestand bestand inventory',label:'Lagerbestand',sub:'Nachbestellungen planen',icon:'📦',target:'lager'},
    {q:'launch planer launch checkliste',label:'Launch-Planer',sub:'Produkt-Launch organisieren',icon:'🚀',target:'launch'},
    {q:'coaching helium 10 lernen kurs tutorial',label:'Coaching',sub:'Helium 10 Grundlagen lernen',icon:'🎓',target:'coaching'}
  ];
  navEntries.forEach(function(n){
    if(!query||n.q.indexOf(query)>=0||n.label.toLowerCase().indexOf(query)>=0){
      results.push({
        type:'nav',
        icon:n.icon,
        color:'tx2',
        title:n.label,
        subtitle:'Bereich · '+n.sub,
        action:function(){closeGlobalSearch();go(n.target)}
      });
    }
  });

  // Limit to 30 for performance
  results=results.slice(0,30);
  globalSearchCurrentResults=results;
  globalSearchSelectedIdx=0;
  renderGlobalSearchResults(query);
}

function renderGlobalSearchResults(query){
  var container=document.getElementById('globalSearchResults');
  var countEl=document.getElementById('globalSearchCount');
  countEl.textContent=globalSearchCurrentResults.length;

  if(globalSearchCurrentResults.length===0){
    container.innerHTML='<div style="padding:30px;text-align:center;color:var(--tx3);font-size:13px"><div style="font-size:32px;margin-bottom:10px">🤔</div>'+(query?'Keine Treffer für „'+escapeHtml(query)+'"':'Tippe um zu suchen')+'</div>';
    return;
  }

  // Group results by type for visual structure
  var groups={};
  globalSearchCurrentResults.forEach(function(r,i){
    if(!groups[r.type])groups[r.type]={items:[],startIdx:0};
    groups[r.type].items.push({result:r,globalIdx:i});
  });

  var typeLabels={product:'📋 Produkte',idea:'💡 Ideen',keyword:'🔑 Keywords',supplier:'🏭 Lieferanten',lesson:'🎓 Lektionen',nav:'🧭 Navigation'};
  var html='';

  Object.keys(typeLabels).forEach(function(type){
    if(!groups[type])return;
    html+='<div style="padding:6px 18px;font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:var(--tx3);font-weight:700;background:var(--s2);border-bottom:1px solid var(--bd)">'+typeLabels[type]+' ('+groups[type].items.length+')</div>';
    groups[type].items.forEach(function(item){
      var r=item.result;
      var isSelected=item.globalIdx===globalSearchSelectedIdx;
      var bgColor=isSelected?'var(--acd)':'var(--s1)';
      var borderColor=isSelected?'var(--ac)':'transparent';
      html+='<div class="search-result-item" data-idx="'+item.globalIdx+'" onclick="executeSearchResult('+item.globalIdx+')" onmouseenter="setSearchSelected('+item.globalIdx+')" style="display:flex;align-items:center;gap:14px;padding:12px 18px;cursor:pointer;background:'+bgColor+';border-left:3px solid '+borderColor+';transition:background .1s">';
      html+='<div style="width:36px;height:36px;border-radius:9px;background:var(--'+r.color+'d);color:var(--'+r.color+');display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">'+r.icon+'</div>';
      html+='<div style="flex:1;min-width:0">';
      html+='<div style="font-weight:600;font-size:14px;color:var(--tx);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+highlightMatch(r.title,query)+'</div>';
      html+='<div style="font-size:11px;color:var(--tx2);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+highlightMatch(r.subtitle,query)+'</div>';
      html+='</div>';
      if(isSelected)html+='<kbd style="font-family:inherit;font-size:10px;background:var(--ac);border-radius:4px;padding:3px 7px;color:#fff;font-weight:700">⏎</kbd>';
      html+='</div>';
    });
  });

  container.innerHTML=html;

  // Scroll selected into view
  var sel=container.querySelector('[data-idx="'+globalSearchSelectedIdx+'"]');
  if(sel&&typeof sel.scrollIntoView==='function')sel.scrollIntoView({block:'nearest',behavior:'smooth'});
}

function setSearchSelected(idx){
  globalSearchSelectedIdx=idx;
  // Light-touch update without full rerender for hover
  document.querySelectorAll('.search-result-item').forEach(function(el){
    var i=parseInt(el.getAttribute('data-idx'));
    if(i===idx){
      el.style.background='var(--acd)';
      el.style.borderLeftColor='var(--ac)';
    }else{
      el.style.background='var(--s1)';
      el.style.borderLeftColor='transparent';
    }
  });
}

function executeSearchResult(idx){
  var r=globalSearchCurrentResults[idx];
  if(r&&r.action)r.action();
}

function handleSearchKey(e){
  if(e.key==='Escape'){closeGlobalSearch();return}
  if(globalSearchCurrentResults.length===0)return;
  if(e.key==='ArrowDown'){
    e.preventDefault();
    globalSearchSelectedIdx=Math.min(globalSearchSelectedIdx+1,globalSearchCurrentResults.length-1);
    renderGlobalSearchResults(document.getElementById('globalSearchInput').value);
  }else if(e.key==='ArrowUp'){
    e.preventDefault();
    globalSearchSelectedIdx=Math.max(globalSearchSelectedIdx-1,0);
    renderGlobalSearchResults(document.getElementById('globalSearchInput').value);
  }else if(e.key==='Enter'){
    e.preventDefault();
    executeSearchResult(globalSearchSelectedIdx);
  }
}

// ═══════════════ COACHING - HELIUM 10 GRUNDLAGEN ═══════════════

var COACHING_MODULES=[
  {
    id:'recherche_prozess',
    title:'KI-Produktrecherche-Prozess',
    icon:'📋',
    color:'pu',
    desc:'Der komplette 20-Schritte-Workflow mit Helium 10, Claude, Perplexity & Gemini für profitable FBA-Produkte',
    lessons:[

      // ═══════════════════════════════════════════════════════════
      // LEKTION 1: GRUNDSYSTEM
      // ═══════════════════════════════════════════════════════════
      {
        id:'rp_1',
        title:'Grundsystem: Vier Tools, vier Rollen',
        readTime:'8 Min',
        content:[
          {intro:'Bevor du mit der Recherche startest, musst du verstehen, welches Tool wann eingesetzt wird. Profis nutzen nicht ein einziges Tool, sondern eine durchdachte Kombination – jedes mit einer klaren Rolle. Diese Lektion gibt dir das Fundament: Welches Tool hat welche Aufgabe und wann nutzt du es im Workflow.'},

          {section:{label:'Erklärung',title:'Warum vier Tools statt einem?',lead:'Jedes Tool ist Spezialist für eine bestimmte Aufgabe – Universalwerkzeuge gibt es nicht.'}},

          {p:'Anfänger machen oft den Fehler, alles mit einem Tool lösen zu wollen – meistens Helium 10, weil es das bekannteste Amazon-Tool ist. Das führt zu Lücken: Helium 10 zeigt dir <b>Amazon-Daten</b>, aber nicht, ob ein Produkt gerade gesellschaftlich im Trend liegt. Es zeigt Wettbewerber, aber bewertet nicht kritisch, ob dein Produkt rechtlich riskant ist. Und es kann keine Reviews analysieren oder Lieferanten finden.'},

          {p:'Erfolgreiche Verkäufer setzen deshalb auf ein <b>4-Tool-System</b>, in dem jedes Tool seine spezifische Stärke ausspielt. Das Ergebnis: kein blinder Fleck, jede Produktidee wird aus allen relevanten Blickwinkeln beleuchtet, bevor du Geld investierst.'},

          {section:{label:'Übersicht',title:'Die vier Tools und ihre Rollen',lead:'Diese Tabelle ist dein Leitfaden für die nächsten 20 Schritte.'}},

          {table:{
            header:['Tool','Hauptrolle','Wann benutzen?'],
            rows:[
              ['Helium 10','Amazon-Daten, Umsatz, Keywords, Konkurrenz, Marge','Immer, wenn du eine Produktidee auf Amazon validierst'],
              ['Perplexity Pro','Markt-, Trend-, Problem-, Lieferanten- und Regulatorik-Recherche','Am Anfang und bei externer Validierung'],
              ['Gemini Pro','Tabellenanalyse, Review-Mining, Keyword-Clustering, große Datenmengen','Wenn du CSVs, Reviews oder Keywordlisten auswertest'],
              ['Claude Pro','Strategie, kritische Bewertung, Entscheidung, Differenzierung, Launch-Plan','Bei jeder wichtigen Entscheidung']
            ]
          }},

          {h2:'Helium 10 – Der Daten-Lieferant'},
          {p:'Helium 10 ist deine einzige verlässliche Quelle für <b>echte Amazon-Verkaufszahlen</b>. Black Box findet Nischen, Xray analysiert Konkurrenz live auf der Suchergebnisseite, Cerebro und Magnet liefern Keywords, Trendster zeigt Saisonalität, der Profitability Calculator rechnet deine Marge. Ohne diese Daten arbeitest du im Blindflug – sie sind die <b>objektive Basis</b> für jede Entscheidung.'},

          {h2:'Perplexity Pro – Der Recherche-Detektiv'},
          {p:'Perplexity sucht im Web nach Daten, die <b>nicht auf Amazon sichtbar</b> sind: aktuelle Trends, Kundenprobleme in Foren, Lieferanten in China und Europa, rechtliche Anforderungen (CE, REACH, RoHS), Wettbewerbssituation außerhalb von Amazon. Es ist dein Werkzeug für alles, was Helium 10 nicht abbildet.'},

          {h2:'Gemini Pro – Der Tabellen-Profi'},
          {p:'Gemini ist stark, wenn es um <b>große Datenmengen</b> geht: 200 Kundenrezensionen analysieren, 500 Keywords clustern, CSV-Exports verdichten, gewichtete Score-Matrizen berechnen. Was Claude wegen Kontextlänge schwerfällt, macht Gemini souverän. Der zweite Vorteil: Gemini ist exzellent bei der Strukturierung in Tabellenform.'},

          {h2:'Claude Pro – Der kritische Stratege'},
          {p:'Claude ist dein <b>Strategie-Partner</b> – nicht weil er die meisten Daten kennt, sondern weil er sie am schärfsten interpretiert. Er bewertet kritisch, entwickelt Differenzierungsstrategien, entwirft Launch-Pläne und – das Wichtigste – sagt dir auch ehrlich „Nein", wenn ein Produkt nicht funktionieren wird. Nutze ihn an jedem Entscheidungspunkt.'},

          {success:'Faustregel: <b>Perplexity findet Ideen → Helium 10 validiert mit Daten → Gemini analysiert Mengen → Claude entscheidet.</b> Diese Reihenfolge ist über tausende erfolgreicher Produkt-Launches optimiert worden.'},

          {section:{label:'Praxis',title:'Wie das in deinem Alltag aussieht',lead:'Ein konkretes Beispiel-Szenario zeigt dir, wie die Tools ineinandergreifen.'}},

          {example:'<b>Szenario:</b> Du hast die Idee „Duschablage ohne Bohren". So läuft dein Tool-Wechsel ab:<br><br>1. <b>Perplexity</b>: „Welche Probleme haben Käufer aktuell mit Duschablagen?" → liefert dir die häufigsten Beschwerden aus Foren und Blogs.<br>2. <b>Helium 10 Black Box</b>: Suche nach „duschablage ohne bohren" mit Filter Preis 15-50€ → zeigt dir Top-Produkte mit echten Umsatzzahlen.<br>3. <b>Helium 10 Cerebro</b>: 3 Top-ASINs einfügen → liefert alle relevanten Keywords.<br>4. <b>Gemini</b>: Reviews der Top 5 Konkurrenten reinkopieren → identifiziert die häufigsten Schwachstellen.<br>5. <b>Claude</b>: Alle Daten zusammen → kritische Endbewertung „Sollte ich dieses Produkt machen oder nicht?"<br><br>Jeder Schritt baut auf dem vorherigen auf. Kein Tool kann den anderen ersetzen.'}
        ]
      },

      // ═══════════════════════════════════════════════════════════
      // LEKTION 2: ZIELKRITERIEN & WOCHENROUTINE
      // ═══════════════════════════════════════════════════════════
      {
        id:'rp_2',
        title:'Zielkriterien & 5-Tage-Wochenroutine',
        readTime:'10 Min',
        content:[
          {intro:'Bevor du auch nur eine einzige Produktidee bewertest, musst du wissen, wonach du suchst. Diese Lektion definiert die harten Kriterien, an denen jedes Produkt gemessen wird – und zeigt dir die bewährte Wochenroutine, mit der du systematisch 10-20 Ideen pro Woche durchprüfst.'},

          {section:{label:'Erklärung',title:'Die 10 Pflicht-Kriterien für ein gutes FBA-Produkt',lead:'Ein Produkt muss diese Kriterien erfüllen, sonst bist du raus, bevor du startest.'}},

          {p:'Es gibt zehntausende Produkte auf Amazon. Die meisten sind für dich als Private-Label-Seller <b>ungeeignet</b> – zu teuer, zu sperrig, zu rechtlich heikel, zu konkurrenzstark oder zu wenig differenzierbar. Damit du nicht jedes Mal von vorn überlegen musst, hier deine festen Filterkriterien. Ein Produkt muss <b>mehrere</b> dieser Punkte erfüllen, idealerweise alle, um überhaupt in deine Master-Tabelle zu kommen.'},

          {l:[
            '<b>Verkaufspreis: 15 bis 50 Euro.</b> Unter 15 € reicht die Marge selten, über 50 € sinkt die Kaufbereitschaft drastisch.',
            '<b>Produktgröße: klein bis mittelgroß.</b> Passt in einen Schuhkarton oder kleiner. Große Produkte = hohe FBA-Gebühren und Lagerkosten.',
            '<b>Gewicht: möglichst leicht.</b> Idealerweise unter 1 kg. Jedes Gramm zählt bei FBA-Versandkosten und Luftfracht aus China.',
            '<b>Nachfrage: stabil, nicht nur saisonal.</b> Ganzjährige Nachfrage schlägt Sommer- oder Weihnachtsprodukte.',
            '<b>Konkurrenz: nicht komplett von starken Marken dominiert.</b> Wenn die Top 10 alle „große Namen" sind, gewinnst du nicht.',
            '<b>Reviews: Top-Wettbewerber idealerweise nicht alle über 1.000 Bewertungen.</b> Sonst ist der Markt zu reif für Newcomer.',
            '<b>Differenzierung: klare Möglichkeit zur Verbesserung.</b> Die Reviews der Konkurrenz müssen Lücken zeigen, die du füllen kannst.',
            '<b>Marge: nach Amazon-Gebühren und Werbung noch attraktiv.</b> Mindestens 15-25% Netto-Marge.',
            '<b>Risiko: keine gefährliche Elektronik, keine Kosmetik, keine Lebensmittel, keine hohe Haftung.</b> Diese Kategorien haben Sonderregeln und hohe Strafen bei Fehlern.',
            '<b>Varianten: möglichst wenige Größen, Farben oder Kompatibilitätsprobleme.</b> Jede Variante erhöht Komplexität und Lagerbestandsrisiko.'
          ]},

          {warning:'Diese Kriterien sind nicht „nice to have" – sie sind die <b>Voraussetzung</b>. Wenn du Produkte annimmst, die diese Kriterien nicht erfüllen, verbrennst du Zeit und am Ende Kapital. Sei diszipliniert beim Aussortieren.'},

          {section:{label:'Strategie',title:'Die 5-Tage-Wochenroutine',lead:'Systematik schlägt Bauchgefühl. Diese Routine sorgt dafür, dass du in 4 Wochen 40-80 Ideen geprüft hast.'}},

          {p:'Produktrecherche ist <b>Fließbandarbeit</b> – jedenfalls, wenn du erfolgreich sein willst. Anstatt sporadisch zu suchen, arbeitest du in <b>Zyklen von 5 Tagen</b>. Jeder Tag hat einen klaren Fokus. Am Ende der Woche hast du eine fundierte Entscheidung getroffen – Ablehnen, Weiterprüfen oder Muster bestellen.'},

          {workflow_step:{number:'Tag 1',title:'Produktideen sammeln',goal:'10-20 neue Ideen in der Master-Tabelle',tool:'Perplexity Pro + Claude',action:'Perplexity findet Trends und Probleme. Claude reduziert die Liste auf 10 sinnvolle Kandidaten.'}},
          {workflow_step:{number:'Tag 2',title:'Amazon-Daten prüfen',goal:'3-5 Kandidaten mit echten Verkaufszahlen',tool:'Helium 10 Black Box + Xray',action:'Black Box scannt Nischen, Xray analysiert die Top 10 Wettbewerber direkt auf Amazon.'}},
          {workflow_step:{number:'Tag 3',title:'Keywords und Reviews analysieren',goal:'Verstehe Nachfrage UND Probleme der Konkurrenz',tool:'Helium 10 Cerebro/Magnet + Gemini',action:'Cerebro liefert Keywords, Gemini clustert sie und analysiert 100-300 Wettbewerber-Reviews.'}},
          {workflow_step:{number:'Tag 4',title:'Marge, Lieferanten und Risiken prüfen',goal:'Wirtschaftliche Machbarkeit + rechtliche Sicherheit',tool:'Helium 10 Profit Calc + Perplexity',action:'Profit Calculator rechnet dir die Marge. Perplexity sucht Lieferanten und prüft Regulatorik.'}},
          {workflow_step:{number:'Tag 5',title:'Entscheidung treffen',goal:'1-3 Kandidaten zur Muster-Bestellung',tool:'Gemini Score-Matrix + Claude finale Prüfung',action:'Gemini errechnet einen Gesamtscore. Claude prüft kritisch, ob die Zahlen wirklich „Go" rechtfertigen.'}},

          {success:'Wenn du diese Routine 4 Wochen durchziehst, hast du 40-80 Ideen analysiert und wirst <b>realistisch 2-5 ernsthafte Kandidaten</b> haben. Das ist normal. Die anderen 95% scheitern an den Kriterien – und das ist gut so. Lieber 95% Ablehnung als ein teurer Fehlkauf.'},

          {section:{label:'Checkliste',title:'Bist du bereit für die Recherche?',lead:'Bevor du heute startest, hak diese Punkte ab.'}},

          {checklist:{title:'Vorbereitung – das brauchst du',items:[
            'Helium 10 Diamond-Abo aktiv (mindestens Platinum)',
            'Perplexity Pro Account aktiv',
            'Gemini Advanced oder Pro Account aktiv',
            'Claude Pro oder Max Account aktiv',
            'Master-Tabelle (Google Sheets, Excel oder Notion) angelegt – siehe nächste Lektion',
            'Notizblock oder Notion-Page für Beobachtungen während der Recherche',
            '2-3 Produktfelder als Fokus festgelegt (z.B. Bad, Fliesen, Heimwerker)',
            '1-2 Stunden ungestörte Zeit pro Tag eingeplant',
            'Realistische Erwartung: 5% der Ideen werden „Go", das ist normal'
          ]}}
        ]
      },

      // ═══════════════════════════════════════════════════════════
      // LEKTION 3: SCHRITTE 1-5 – IDEEN & ERSTE FILTERUNG
      // ═══════════════════════════════════════════════════════════
      {
        id:'rp_3',
        title:'Schritte 1-5: Produktideen sammeln & filtern',
        readTime:'14 Min',
        content:[
          {intro:'Jetzt geht es in die Praxis. In dieser Lektion durchläufst du die ersten fünf Schritte des 20-Schritte-Workflows. Am Ende hast du eine Master-Tabelle mit 10-20 vorgefilterten Produktideen, die alle die Pflicht-Kriterien erfüllen und in Helium 10 weiter validiert werden.'},

          {workflow_step:{number:1,of:20,title:'Produktfelder definieren',goal:'3-5 klare Produktbereiche, in denen du suchst',tool:'Claude Pro',action:'Lass dir von Claude 10 sinnvolle Produktfelder für deinen Zielmarkt vorschlagen. Dann wählst du 3-5 aus, die zu deinen Interessen, Sourcing-Möglichkeiten und Risikotoleranz passen.'}},

          {prompt:{tool:'claude',title:'Produktfelder vorschlagen lassen',text:'Du bist mein Amazon-FBA-Strategieberater für den deutschen Markt.\n\nIch möchte Produkte im Bereich Bad, Fliesen, Sanitär, Heimwerker und Renovierung finden.\n\nErstelle mir 10 sinnvolle Produktfelder für Amazon FBA Deutschland. Berücksichtige:\n- stabile Nachfrage\n- kleine bis mittelgroße Produkte\n- geringe Haftungsrisiken\n- wenig technische Komplexität\n- gute Differenzierungsmöglichkeiten\n- Produkte, die Kunden bei Renovierung, Montage, Ordnung, Reinigung oder Reparatur helfen\n\nGib mir pro Produktfeld:\n1. Beschreibung\n2. typische Kundenprobleme\n3. mögliche Produktarten\n4. Risiken\n5. Empfehlung: hoch, mittel oder niedrig',note:'Passe die Zielbereiche (Bad, Fliesen, Sanitär, …) an deine eigenen Interessen oder vorhandene Sourcing-Kontakte an.'}},

          {tip:'Beispielhafte Ergebnisfelder aus dieser Anfrage könnten sein: Duschzubehör ohne Bohren, Fugen- und Silikonwerkzeuge, Fliesenverlege-Hilfen, Bad-Organizer, kleine Reparatur- und Montagesets. Wähle <b>nicht alle 10</b>, sondern fokussiere dich auf 3-5 mit dem besten Risiko-Chancen-Profil.'},

          {workflow_step:{number:2,of:20,title:'Erste Produktideen sammeln',goal:'50-100 Produktideen, noch unbewertet',tool:'Perplexity Pro',action:'Lass Perplexity konkrete Produktideen aus echten Kundenproblemen ableiten. Das ist deutlich wertvoller als allgemeine „Trend"-Listen, weil es vom Problem her gedacht ist.'}},

          {prompt:{tool:'perplexity',title:'Produktideen mit Problembezug finden',text:'Finde konkrete Amazon-FBA-Produktideen für Deutschland in den Bereichen Bad, Fliesen, Sanitär, Heimwerker und Renovierung.\n\nFokus:\n- kleine bis mittelgroße Produkte\n- Verkaufspreis 15 bis 50 Euro\n- geringe technische Komplexität\n- keine Elektronik\n- keine Kosmetik\n- keine Lebensmittel\n- geeignet für Private Label\n- mit Verbesserungspotenzial gegenüber bestehenden Produkten\n\nErstelle eine Tabelle mit:\nProduktidee, Kundenproblem, Zielgruppe, Suchbegriffe, mögliche Differenzierung, Risiko'}},

          {prompt:{tool:'perplexity',title:'Zweiter Prompt – Probleme als Ideenquelle',text:'Welche wiederkehrenden Probleme haben Heimwerker, Mieter, Badrenovierer, Fliesenleger und Hausbesitzer beim Renovieren, Montieren, Reinigen oder Reparieren?\n\nLeite daraus konkrete physische Produktideen ab, die sich für Amazon FBA Deutschland eignen.',note:'Diesen Prompt nach dem ersten ausführen – kombiniert produkt-basierte und problem-basierte Ideenquellen.'}},

          {workflow_step:{number:3,of:20,title:'Master-Tabelle anlegen',goal:'Zentrale Ablage für alle Ideen mit einheitlicher Bewertung',tool:'Google Sheets / Excel / Notion',action:'Erstelle die Tabelle mit den 18 Pflichtspalten. Ab jetzt wird jede Idee nach dem gleichen System bewertet – kein Cherry-Picking mehr.'}},

          {h2:'Die 18 Pflicht-Spalten der Master-Tabelle'},

          {table:{
            header:['Spalte','Bedeutung'],
            rows:[
              ['Produktidee','Name des Produkts'],
              ['Kategorie','Bad, Fliesen, Sanitär, Heimwerker usw.'],
              ['Hauptkeyword','wichtigstes Amazon-Suchwort'],
              ['Verkaufspreis','typischer Amazon-Preis'],
              ['Top-10-Umsatz','geschätzter Umsatz der Konkurrenz'],
              ['Top-10-Reviews','Bewertungssituation der Konkurrenz'],
              ['Durchschnittsbewertung','Sternebewertung'],
              ['Konkurrenzstärke','niedrig, mittel, hoch'],
              ['Schwächen der Konkurrenz','aus Rezensionen und Listings'],
              ['Differenzierungsidee','wie du besser wirst'],
              ['Einkaufspreis','geschätzt oder vom Lieferanten'],
              ['FBA-Gebühren','aus Helium 10 oder Amazon-Rechner'],
              ['PPC-Risiko','niedrig, mittel, hoch'],
              ['Netto-Marge','realistische Gewinnmarge'],
              ['Risiko','rechtlich, logistisch, Qualität'],
              ['Score','1 bis 100'],
              ['Entscheidung','Ablehnen, weiter prüfen, Muster bestellen'],
              ['Notizen','beliebige Beobachtungen']
            ]
          }},

          {tip:'Lege diese Tabelle einmal sauber an und kopiere sie als <b>Vorlage</b>. Für jede neue Recherche-Welle erstellst du dann eine Kopie. Behalte das Original als Master und nutze die Kopien als Arbeitsversionen – so behältst du die Übersicht über alle vergangenen Recherchen.'},

          {workflow_step:{number:4,of:20,title:'Erste Filterung mit Claude',goal:'Reduktion von 50-100 auf 10-20 ernsthafte Kandidaten',tool:'Claude Pro',action:'Lass Claude kritisch bewerten. Jede Idee bekommt einen Score 1-10 und eine Empfehlung „Ablehnen / weiter recherchieren / sehr interessant". Nur die letzten beiden Kategorien kommen weiter.'}},

          {prompt:{tool:'claude',title:'Produktideen kritisch bewerten lassen',text:'Du bist mein kritischer Amazon-FBA-Produktanalyst für Deutschland.\n\nBewerte die folgenden Produktideen für Amazon FBA.\n\nKriterien:\n- Nachfragepotenzial\n- Wettbewerb\n- Marge\n- Differenzierung\n- Logistik\n- rechtliches Risiko\n- Retourenrisiko\n- Komplexität\n- Eignung für Private Label\n\nGib jeder Idee einen Score von 1 bis 10.\nMarkiere jede Idee als:\n- Ablehnen\n- weiter recherchieren\n- sehr interessant\n\nSei kritisch und erkläre kurz, warum.\n\nHier sind die Ideen:\n[Produktideen einfügen]',note:'Wichtig: Sag Claude explizit, dass er kritisch sein soll. Sonst neigt er dazu, alles mit „interessant" zu bewerten. Die Aufgabe ist Aussortieren, nicht Schönreden.'}},

          {workflow_step:{number:5,of:20,title:'Amazon-Nische mit Black Box suchen',goal:'10-20 konkrete Amazon-Produkte mit echten Daten',tool:'Helium 10 Black Box',action:'Suche im Black Box mit den Filtern für deine Kriterien. Notiere für jede interessante ASIN: Produktname, Preis, monatlicher Umsatz, Reviews, BSR, Hauptkeyword.'}},

          {h2:'Empfohlene Black-Box-Filter (Startwerte)'},

          {table:{
            header:['Filter','Empfehlung'],
            rows:[
              ['Marketplace','Amazon.de'],
              ['Kategorien','Home & Kitchen, DIY & Tools, Bathroom, Garden, Home Improvement'],
              ['Preis','15 bis 50 Euro'],
              ['Monatlicher Umsatz','mindestens 3.000-10.000 € je Produkt (je nach Nische)'],
              ['Reviews','idealerweise unter 500 bei mehreren Top-Produkten'],
              ['Bewertung','unter 4,5 kann Verbesserungschancen zeigen'],
              ['Gewicht','möglichst niedrig'],
              ['Seller-Anzahl','keine reine Marken-/Amazon-Dominanz']
            ]
          }},

          {checklist:{title:'Was du am Ende der Schritte 1-5 haben solltest',items:[
            '3-5 Produktfelder definiert und in Notizen festgehalten',
            '50-100 Rohideen aus Perplexity gesammelt',
            'Master-Tabelle mit allen 18 Spalten angelegt',
            'Claude hat die Liste auf 10-20 Kandidaten reduziert',
            'Für jeden Kandidaten gibt es eine Begründung im „Notizen"-Feld',
            'Helium 10 Black Box hat 10-20 konkrete Amazon-Produkte gefunden',
            'Für jede ASIN: Preis, Umsatz, Reviews, BSR notiert'
          ]}},

          {success:'Wenn du diese Schritte sauber durchgezogen hast, bist du den meisten Hobby-Sellern bereits weit voraus. Die meisten überspringen die Master-Tabelle und die kritische Claude-Filterung – und wundern sich später, warum ihre Produkte floppen. Du wirst <b>nicht</b> floppen, weil du <b>vorher</b> aussortiert hast.'}
        ]
      },

      // ═══════════════════════════════════════════════════════════
      // LEKTION 4: SCHRITTE 6-10 – AMAZON-DATEN & REVIEWS
      // ═══════════════════════════════════════════════════════════
      {
        id:'rp_4',
        title:'Schritte 6-10: Konkurrenz, Keywords & Reviews',
        readTime:'15 Min',
        content:[
          {intro:'Jetzt geht es ans Eingemachte. In den Schritten 6-10 prüfst du, wie stark die Konkurrenz wirklich ist, welche Keywords echten Traffic bringen, ob die Nachfrage stabil über das Jahr verläuft und – am wichtigsten – welche Schwächen die Konkurrenten haben, die du ausnutzen kannst.'},

          {workflow_step:{number:6,of:20,title:'Konkurrenz mit Xray analysieren',goal:'Realistische Einschätzung, ob die Nische angreifbar ist',tool:'Helium 10 Xray Chrome Extension',action:'Gehe auf amazon.de, suche dein Hauptkeyword, starte Xray auf der Suchergebnisseite. Bewerte die Konkurrenz nach klaren Kriterien.'}},

          {compare:{
            leftTitle:'✅ Gute Signale (Nische ist angreifbar)',
            left:'• Einige Produkte machen guten Umsatz mit unter 300-500 Reviews<br>• Listings sind nicht perfekt (schwache Bilder, unklare Bullets)<br>• Bewertungen zeigen wiederkehrende Probleme<br>• Keine komplette Marken-Dominanz<br>• Preisniveau erlaubt gesunde Marge',
            rightTitle:'❌ Schlechte Signale (Finger weg)',
            right:'• Alle Top-Produkte haben tausende Bewertungen<br>• Nur große Marken dominieren<br>• Sehr niedrige Preise (Margenkampf)<br>• Hohe technische oder rechtliche Risiken<br>• Sehr viele identische Billigangebote'
          }},

          {tip:'Markiere jede Produktidee nach Xray-Analyse als <b>Rot (ablehnen)</b>, <b>Gelb (weiter analysieren)</b> oder <b>Grün (sehr interessant)</b>. So bleibt die Master-Tabelle visuell sortierbar – Gelb und Grün gehen weiter, Rot landet im Archiv.'},

          {workflow_step:{number:7,of:20,title:'Keywords mit Cerebro analysieren',goal:'Verstehe, über welche Suchbegriffe die Wettbewerber verkaufen',tool:'Helium 10 Cerebro',action:'Nimm 3-5 Wettbewerber-ASINs aus Xray. Trage sie in Cerebro ein. Exportiere die relevanten Keywords als CSV für die weitere Analyse in Gemini.'}},

          {h2:'Wichtige Kennzahlen in Cerebro'},

          {l:[
            '<b>Suchvolumen:</b> Wie oft wird das Keyword pro Monat auf Amazon.de gesucht?',
            '<b>Organic Rank:</b> Auf welcher Position rankt der Wettbewerber organisch für dieses Keyword?',
            '<b>Sponsored Rank:</b> Auf welcher Position erscheint er als bezahlte Anzeige?',
            '<b>Competing Products:</b> Wie viele andere Produkte konkurrieren um dieses Keyword?',
            '<b>CPR (Cerebro Product Rank):</b> Wie viele Verkäufe brauchst du in 8 Tagen, um auf Seite 1 zu kommen?',
            '<b>Keyword-Relevanz:</b> Wie thematisch nah ist das Keyword an deinem Produkt?'
          ]},

          {workflow_step:{number:8,of:20,title:'Keywords mit Gemini clustern',goal:'Strukturierte Keyword-Strategie für Titel, Bullets und PPC',tool:'Gemini Pro',action:'Lade die Cerebro-CSV in Gemini hoch oder kopiere die Daten rein. Lass Gemini die Keywords nach Kaufintention gruppieren.'}},

          {prompt:{tool:'gemini',title:'Cerebro-Keywords mit Gemini clustern',text:'Analysiere diese Helium-10-Cerebro-Keyworddaten für Amazon.de.\n\nAufgabe:\n1. Entferne irrelevante Keywords.\n2. Gruppiere die Keywords nach Kaufintention.\n3. Erstelle Cluster:\n   - Hauptkeywords\n   - Longtail-Keywords\n   - Problem-Keywords\n   - Material-Keywords\n   - Anwendungs-Keywords\n   - Zubehör-Keywords\n4. Bewerte jedes Cluster nach Nachfrage, Relevanz und Konkurrenz.\n5. Zeige mir, welche Keywords für Titel, Bullet Points, Backend-Keywords und PPC geeignet sind.\n\nDaten:\n[Keyworddaten einfügen]'}},

          {workflow_step:{number:9,of:20,title:'Neue Keywords mit Magnet finden',goal:'Zusätzliche Long-Tail-Keywords, die Cerebro übersehen hat',tool:'Helium 10 Magnet',action:'Gib dein Hauptkeyword in Magnet ein. Suche nach Variationen, Synonymen und problemorientierten Begriffen. Achte besonders auf „Set", „Edelstahl", „ohne Bohren", „wasserdicht", „für Dusche", „für Fliesen" und ähnliche Modifikatoren.'}},

          {prompt:{tool:'claude',title:'Keyword-Strategie mit Claude finalisieren',text:'Hier ist eine Liste potenzieller Amazon-Keywords für mein Produkt.\n\nBitte bewerte:\n- Welche Keywords zeigen echte Kaufabsicht?\n- Welche Keywords sind für PPC gefährlich oder zu allgemein?\n- Welche Keywords zeigen eine klare Nische?\n- Welche Keywords sollten in Titel, Bullet Points, Beschreibung und Backend?\n\nProdukt:\n[Produkt beschreiben]\n\nKeywords:\n[Keywords einfügen]'}},

          {workflow_step:{number:10,of:20,title:'Saisonalität mit Trendster prüfen',goal:'Verstehe, ob das Produkt ganzjährig oder nur saisonal verkauft',tool:'Helium 10 Trendster',action:'Prüfe Haupt-ASINs und Hauptkeywords in Trendster. Achte auf den 12-Monats-Verlauf der Nachfrage.'}},

          {compare:{
            leftTitle:'✅ Gute Saisonalitäts-Signale',
            left:'• Stabile Nachfrage über das ganze Jahr<br>• Leichter Wachstumstrend in den letzten 12 Monaten<br>• Keine extremen Einbrüche<br>• Saisonale Peaks sind erklärbar (z.B. Frühjahrsputz, Renovierungssaison)',
            rightTitle:'❌ Schlechte Saisonalitäts-Signale',
            right:'• Nur Sommer- oder Wintergeschäft<br>• Kurzer Hype mit anschließendem Verfall<br>• Starker Abwärtstrend über 6+ Monate<br>• Nachfrage nur durch viralen Trend (TikTok-Effekt)'
          }},

          {prompt:{tool:'claude',title:'Saisonalitäts-Risiko mit Claude bewerten',text:'Ich habe die Saisonalität für dieses Produkt geprüft.\n\nErgebnis:\n[Trendster-Beobachtungen einfügen]\n\nBewerte, ob das Produkt für Amazon FBA geeignet ist.\n\nBerücksichtige:\n- Lagerbestandsrisiko\n- Cashflow\n- PPC-Planung\n- saisonale Nachfrage\n- Risiko eines kurzfristigen Hypes'}},

          {warning:'Saisonale Produkte sind nicht grundsätzlich schlecht – aber als <b>erstes Produkt</b> sind sie riskant. Du brauchst gutes Cashflow-Management und Lagerbestandsplanung. Wenn du gerade startest, wähle lieber ein ganzjähriges Produkt und nimm Saison-Geschäft als zweites oder drittes Produkt dazu.'},

          {checklist:{title:'Was du am Ende der Schritte 6-10 haben solltest',items:[
            'Für jeden Kandidaten eine Xray-Analyse mit Rot/Gelb/Grün-Bewertung',
            'Cerebro-Daten der Top 3-5 Wettbewerber gesammelt',
            'Keywords in Gemini nach Kaufintention geclustert',
            'Magnet hat 20-50 zusätzliche Long-Tail-Keywords geliefert',
            'Trendster zeigt die 12-Monats-Saisonalität',
            'Claude hat die Keyword-Strategie und Saisonalität bewertet',
            'Master-Tabelle ist mit Konkurrenzstärke und Saisonalität ergänzt'
          ]}}
        ]
      },

      // ═══════════════════════════════════════════════════════════
      // LEKTION 5: SCHRITTE 11-15 – MARGE, LIEFERANTEN, RECHT
      // ═══════════════════════════════════════════════════════════
      {
        id:'rp_5',
        title:'Schritte 11-15: Reviews, Marge, Lieferanten, Recht',
        readTime:'16 Min',
        content:[
          {intro:'Jetzt wird es konkret. Du analysierst die Schwächen der Konkurrenz aus Reviews, prüfst die Listing-Qualität, rechnest die Marge durch, suchst Lieferanten und prüfst rechtliche Risiken. Am Ende dieser Lektion weißt du, ob ein Produkt wirtschaftlich Sinn ergibt und rechtlich sicher ist.'},

          {workflow_step:{number:11,of:20,title:'Reviews der Konkurrenz auswerten',goal:'Identifiziere wiederkehrende Probleme, die du in deinem Produkt löst',tool:'Gemini Pro + manuell von Amazon',action:'Sammle 100-300 Rezensionen von 3-5 Wettbewerbern. Fokus auf 1-, 2- und 3-Sterne-Bewertungen – dort liegen die Schwächen. Lass Gemini eine strukturierte Auswertung erstellen.'}},

          {prompt:{tool:'gemini',title:'Wettbewerber-Reviews systematisch analysieren',text:'Analysiere diese Amazon-Kundenrezensionen.\n\nErstelle eine strukturierte Auswertung mit:\n1. häufigste Beschwerden\n2. Qualitätsprobleme\n3. fehlende Funktionen\n4. Probleme mit Material, Größe, Montage, Kleber, Verpackung oder Anleitung\n5. positive Kaufgründe\n6. wiederkehrende Begriffe der Kunden\n7. konkrete Produktverbesserungen\n8. mögliche Bundle-Ideen\n9. Risiken, die ich vermeiden muss\n\nErstelle zusätzlich eine Tabelle:\nProblem, Häufigkeit, Schweregrad, mögliche Lösung, geschätzte Wirkung auf Bewertung\n\nRezensionen:\n[Rezensionen einfügen]'}},

          {prompt:{tool:'claude',title:'Differenzierungs-Konzept entwickeln',text:'Basierend auf dieser Review-Analyse:\n[Analyse einfügen]\n\nEntwickle ein besseres Private-Label-Produktkonzept.\n\nBitte liefere:\n1. Produktverbesserungen\n2. Bundle-Idee\n3. Materialempfehlung\n4. Verpackungsidee\n5. deutsche Anleitungsidee\n6. Hauptversprechen für das Listing\n7. Risiken bei der Umsetzung\n8. klare Positionierung gegenüber der Konkurrenz'}},

          {success:'Die Review-Analyse ist <b>der wichtigste einzelne Schritt</b> im gesamten Prozess. Hier entscheidet sich, ob du wirklich besser bist als die Konkurrenz – oder nur das gleiche Produkt mit anderem Label verkaufst. Investiere hier Zeit, sie zahlt sich vielfach aus.'},

          {workflow_step:{number:12,of:20,title:'Listing-Qualität der Konkurrenz prüfen',goal:'Verstehe, ob besseres Marketing ein Wettbewerbsvorteil sein kann',tool:'Helium 10 Listing Analyzer + manuell + Claude',action:'Analysiere 5-10 Top-Listings. Achte auf Titelqualität, Bilder, Infografiken, Bullet Points, A+ Content, Video, Markenauftritt, Bewertungen, Preispositionierung und Fragen/Antworten.'}},

          {prompt:{tool:'claude',title:'Listings analysieren und Schwachstellen finden',text:'Analysiere diese Wettbewerber-Listings für Amazon.de.\n\nProdukt:\n[Produkt]\n\nWettbewerber:\n[Titel, Bullet Points, Bilderbeschreibung, Preis, Bewertungen einfügen]\n\nBewerte:\n1. Was machen die Wettbewerber gut?\n2. Wo sind die Listings schwach?\n3. Welche Bilder fehlen?\n4. Welche Einwände werden nicht beantwortet?\n5. Welche Keywords fehlen wahrscheinlich?\n6. Wie könnte mein Listing besser positioniert werden?\n7. Welche Hauptbotschaft sollte mein Produkt haben?'}},

          {workflow_step:{number:13,of:20,title:'Marge mit Profitability Calculator prüfen',goal:'Bestätigung, dass das Produkt wirtschaftlich Sinn ergibt',tool:'Helium 10 Profitability Calculator',action:'Trage realistische Zahlen ein: Verkaufspreis, Einkaufspreis, Versand, Zoll, Verpackung, FBA-Gebühren, PPC-Kosten, Retourenquote. Lass Claude die Kalkulation kritisch prüfen.'}},

          {h2:'Zielwerte für deine Kalkulation'},

          {table:{
            header:['Kennzahl','Zielwert'],
            rows:[
              ['Bruttomarge vor Werbung','mindestens 35-45%'],
              ['Netto-Marge nach Werbung','mindestens 15-25%'],
              ['Gewinn pro Einheit','idealerweise mindestens 4-8 €'],
              ['PPC-Puffer','ausreichend für 6-12 Wochen Launch-Phase'],
              ['Break-Even-ACoS','sollte sicher über deinem Ziel-ACoS liegen']
            ]
          }},

          {prompt:{tool:'claude',title:'Kalkulation kritisch prüfen lassen',text:'Bewerte diese Amazon-FBA-Kalkulation kritisch.\n\nProdukt:\n[Produkt]\n\nZahlen:\n- Verkaufspreis:\n- Einkaufspreis:\n- Versand:\n- Zoll:\n- Verpackung:\n- FBA-Gebühr:\n- Amazon Referral Fee:\n- erwartete PPC-Kosten:\n- Retourenquote:\n- Gewinn pro Einheit:\n- Netto-Marge:\n\nAufgabe:\n1. Ist das Produkt wirtschaftlich interessant?\n2. Welche Kosten fehlen möglicherweise?\n3. Ab welchem Einkaufspreis wird das Produkt uninteressant?\n4. Welcher Verkaufspreis wäre ideal?\n5. Wie hoch darf mein PPC maximal sein?\n6. Entscheidung: ablehnen, weiter verhandeln oder Muster bestellen?'}},

          {warning:'Anfänger unterschätzen fast immer die <b>PPC-Kosten</b> (Werbung) und die <b>Retourenquote</b>. Plane PPC mit 20-30% des Umsatzes in den ersten 3 Monaten ein. Retourenquote für Heimwerker/Bad/Sanitär liegt typisch bei 5-10%. Wenn deine Kalkulation diese Werte nicht aushält, ist das Produkt nicht profitabel.'},

          {workflow_step:{number:14,of:20,title:'Lieferanten recherchieren',goal:'Mindestens 3 mögliche Lieferanten mit realistischen Preisen',tool:'Perplexity + Alibaba + Europages + Google',action:'Suche nach Herstellern, nicht nur Händlern. Frage gezielt nach MOQ, Preisstaffel, Anpassung, Mustern, Zertifikaten, Produktionszeit und DDP-Versand.'}},

          {prompt:{tool:'perplexity',title:'Lieferanten-Recherche starten',text:'Finde mögliche Lieferanten, Hersteller oder Großhändler für folgendes Produkt:\n[Produkt]\n\nMärkte:\n- China\n- Türkei\n- Polen\n- Deutschland\n- EU\n\nBitte prüfe:\n- typische Materialien\n- mögliche Qualitätsunterschiede\n- übliche MOQ\n- Zertifizierungen oder rechtliche Anforderungen\n- Risiken bei Import nach Deutschland\n- Möglichkeiten für Private Label\n- sinnvolle Fragen an Lieferanten'}},

          {prompt:{tool:'',title:'Standard-Anfrage an Lieferanten (Englisch)',text:'Hello,\n\nI am interested in private label production for [product].\n\nPlease answer:\n1. What is your MOQ?\n2. What is the unit price for 500, 1,000 and 2,000 units?\n3. Can you customize material, color, packaging or logo?\n4. Can you provide samples?\n5. What certifications or test reports do you have?\n6. What is the production time?\n7. What is the packing size and weight per unit?\n8. Can you improve the product based on our requirements?\n9. Do you already supply Amazon sellers in Europe?\n10. Can you provide DDP shipping to Germany?\n\nBest regards',note:'Diese Anfrage ist neutral formuliert und filtert seriöse Lieferanten von unseriösen. Wer auf alle 10 Punkte präzise antwortet, ist potenziell ein guter Partner.'}},

          {workflow_step:{number:15,of:20,title:'Rechtliche und Qualitätsrisiken prüfen',goal:'Vermeide Produkte, die später Abmahnungen oder Verbote verursachen',tool:'Perplexity Pro + Claude',action:'Prüfe alle relevanten Regulatorik: CE-Pflicht, REACH, RoHS, Produktsicherheitsgesetz, Verpackungsgesetz/LUCID, Warnhinweise, Wasserschadenrisiko, Verletzungsrisiko, Ersatzteilprobleme, Retourengefahr.'}},

          {prompt:{tool:'perplexity',title:'Rechtliche Anforderungen recherchieren',text:'Welche rechtlichen, sicherheitsbezogenen und regulatorischen Anforderungen können für dieses Produkt in Deutschland und der EU gelten?\n\nProdukt:\n[Produkt]\n\nBitte berücksichtige Deutschland und EU.\nFokus auf:\n- Produktsicherheit\n- Kennzeichnung\n- CE, REACH, RoHS falls relevant\n- Verpackungsgesetz\n- Haftungsrisiken\n- typische Fehler von Amazon-FBA-Sellern'}},

          {prompt:{tool:'claude',title:'Risikoanalyse zusammenfassen',text:'Bewerte die Risiken dieses Produkts für Amazon FBA Deutschland.\n\nProdukt:\n[Produkt]\n\nBekannte Informationen:\n[Material, Nutzung, Zielgruppe, Lieferant, Zertifikate einfügen]\n\nErstelle eine Risikoanalyse:\n1. rechtliches Risiko\n2. Sicherheitsrisiko\n3. Qualitätsrisiko\n4. Retourenrisiko\n5. Bewertungsrisiko\n6. Risiko durch falsche Kundenerwartung\n7. Empfehlung: ablehnen, prüfen lassen oder weiterverfolgen'}},

          {warning:'Produkte mit hohem Haftungsrisiko (z.B. Klettergurte, Sicherheitsausrüstung, Produkte für Kinder unter 3 Jahren, alles mit Elektrik) sind für Anfänger <b>tabu</b>. Eine einzige Abmahnung oder ein Personenschaden kann dich finanziell ruinieren. Bleib bei harmlosen Kategorien.'},

          {checklist:{title:'Was du am Ende der Schritte 11-15 haben solltest',items:[
            'Review-Analyse mit Top-5 wiederkehrenden Problemen pro Kandidat',
            'Differenzierungskonzept von Claude für jeden Top-Kandidaten',
            'Listing-Analyse: Wo sind die Wettbewerber schwach?',
            'Kalkulation in Helium 10 mit allen Kostenpositionen',
            'Marge ≥ 15-25% nach Werbung – sonst Kandidat raus',
            'Mindestens 3 angefragte Lieferanten mit Antworten',
            'Rechtliche Risikoanalyse von Perplexity + Claude vorhanden',
            'Master-Tabelle: alle Spalten gefüllt, Score-Vorbereitung möglich'
          ]}}
        ]
      },

      // ═══════════════════════════════════════════════════════════
      // LEKTION 6: SCHRITTE 16-20 – ENTSCHEIDUNG & LAUNCH
      // ═══════════════════════════════════════════════════════════
      {
        id:'rp_6',
        title:'Schritte 16-20: Score-Matrix, Muster & Launch-Plan',
        readTime:'14 Min',
        content:[
          {intro:'Die letzten fünf Schritte führen dich zur Bestellentscheidung. Du baust eine gewichtete Score-Matrix, holst dir Claudes finale kritische Bewertung, bestellst Muster, finalisierst dein Produktkonzept und entwickelst den Launch-Plan – bevor du Kapital bindest.'},

          {workflow_step:{number:16,of:20,title:'Score-Matrix erstellen',goal:'Objektive, gewichtete Endbewertung aller Kandidaten',tool:'Gemini Pro',action:'Erstelle eine gewichtete Entscheidungsmatrix mit den 7 Hauptkriterien. Jeder Kandidat bekommt einen Gesamtscore von 1-100.'}},

          {h2:'Die Gewichtung der 7 Bewertungskriterien'},

          {table:{
            header:['Kriterium','Gewicht'],
            rows:[
              ['Nachfrage','20%'],
              ['Wettbewerb','20%'],
              ['Marge','20%'],
              ['Differenzierung','15%'],
              ['Logistik','10%'],
              ['Risiko','10%'],
              ['Lieferantenverfügbarkeit','5%']
            ]
          }},

          {prompt:{tool:'gemini',title:'Gewichtete Score-Matrix erstellen',text:'Erstelle eine gewichtete Entscheidungs-Matrix für diese Amazon-FBA-Produktideen.\n\nBewertungskriterien:\n- Nachfrage: 20 Prozent\n- Wettbewerb: 20 Prozent\n- Marge: 20 Prozent\n- Differenzierung: 15 Prozent\n- Logistik: 10 Prozent\n- Risiko: 10 Prozent\n- Lieferantenverfügbarkeit: 5 Prozent\n\nBewerte jedes Produkt von 1 bis 10 je Kriterium.\nBerechne einen Gesamtscore von 1 bis 100.\n\nGib zusätzlich:\n- Top 5 Produkte\n- größte Risiken\n- beste schnelle Tests\n- klare Entscheidung: ablehnen, weiter recherchieren oder Muster bestellen\n\nDaten:\n[Tabelle einfügen]'}},

          {workflow_step:{number:17,of:20,title:'Finale kritische Entscheidung',goal:'Reduktion auf 1-3 Top-Kandidaten zur Muster-Bestellung',tool:'Claude Pro Max',action:'Zeige Claude deine Top-5-Kandidaten aus der Score-Matrix. Lass ihn eine harte finale Prüfung machen – mit dem Mandat, ehrlich zu sein, auch wenn das Aussortieren bedeutet.'}},

          {prompt:{tool:'claude',title:'Finale Investment-Entscheidung mit Claude',text:'Du bist mein kritischer Amazon-FBA-Investment-Partner.\n\nHier sind meine Top-Produktkandidaten mit Daten:\n[Top-Produkte und Score-Matrix einfügen]\n\nBitte mache eine harte finale Prüfung.\n\nBewerte:\n1. Welches Produkt sieht gut aus, ist aber wahrscheinlich riskant?\n2. Welches Produkt hat das beste Verhältnis aus Nachfrage, Marge und Risiko?\n3. Welches Produkt eignet sich am besten für einen ersten Test?\n4. Welche Annahmen muss ich noch validieren?\n5. Was könnte ich übersehen haben?\n6. Welche Entscheidung würdest du treffen, wenn dein eigenes Geld auf dem Spiel steht?\n\nGib mir eine klare Rangliste und eine finale Empfehlung:\n- ablehnen\n- weiter prüfen\n- Muster bestellen',note:'Der entscheidende Satz ist „wenn dein eigenes Geld auf dem Spiel steht" – das zwingt Claude zu ehrlicher Bewertung statt diplomatischem Schönreden.'}},

          {workflow_step:{number:18,of:20,title:'Muster bestellen und testen',goal:'Bestätige Qualität, Verarbeitung und Verbesserungspotenzial bevor du Massenbestellung machst',tool:'3+ Lieferanten + Claude (Test-Checkliste)',action:'Bestelle Muster von mindestens 3 Lieferanten. Teste systematisch nach Checkliste – nicht nach Bauchgefühl.'}},

          {prompt:{tool:'claude',title:'Test-Checkliste für Muster generieren',text:'Erstelle mir eine Test-Checkliste für Muster dieses Produkts:\n[Produkt]\n\nBerücksichtige:\n- Materialqualität\n- Verarbeitung\n- Funktion\n- Montage\n- Verpackung\n- Kundenerwartungen\n- mögliche negative Rezensionen\n- Vergleich mit Wettbewerbern\n- Verbesserungen vor Massenproduktion\n\nGib mir eine Tabelle mit Testpunkt, Bewertung 1 bis 5, Beobachtung und Entscheidung.'}},

          {workflow_step:{number:19,of:20,title:'Produktkonzept finalisieren',goal:'Klares Briefing für Lieferant, Designer und Listing',tool:'Claude Pro Max',action:'Definiere dein finales Angebot: Positionierung, Bundle, Material, Verpackung, Anleitung, Garantie, Bildkonzept, Differenzierung.'}},

          {prompt:{tool:'claude',title:'Finales Produktkonzept entwickeln',text:'Entwickle mein finales Amazon-Produktkonzept.\n\nProdukt:\n[Produkt]\n\nZielgruppe:\n[Zielgruppe]\n\nKonkurrenzprobleme:\n[Review-Probleme]\n\nMeine Verbesserungen:\n[Verbesserungen]\n\nBitte erstelle:\n1. Produktpositionierung\n2. Hauptnutzen\n3. Bundle-Struktur\n4. Material- und Qualitätsanforderungen\n5. Verpackungsanforderungen\n6. deutsche Anleitung\n7. Garantie- oder Serviceversprechen\n8. Listing-Winkel\n9. Bildkonzept\n10. Differenzierung gegenüber Top 5 Wettbewerbern'}},

          {workflow_step:{number:20,of:20,title:'Launch-Plan vorbereiten',goal:'Klare Strategie für die ersten 30/60/90 Tage',tool:'Claude + Helium-10-Daten',action:'Entwickle einen Launch-Plan, der PPC-Struktur, Keyword-Prioritäten, Preisstrategie, Coupons, Bewertungsstrategie, Lagerbestand und Risiken abdeckt – bevor du auch nur einen Euro bestellst.'}},

          {prompt:{tool:'claude',title:'Launch-Plan für Amazon.de erstellen',text:'Erstelle einen Amazon.de-Launch-Plan für dieses Produkt.\n\nProdukt:\n[Produkt]\n\nKeywords:\n[Keywordliste]\n\nKonkurrenz:\n[Top Wettbewerber]\n\nMarge:\n[Kalkulation]\n\nBitte erstelle:\n1. Launch-Ziel für die ersten 30 Tage\n2. PPC-Struktur\n3. Keyword-Prioritäten\n4. Preisstrategie\n5. Coupon-Strategie\n6. Bilder- und Listing-Anforderungen\n7. Bewertungsstrategie innerhalb der Amazon-Regeln\n8. Lagerbestandsempfehlung\n9. Risiken in den ersten 90 Tagen\n10. klare To-do-Liste vor Bestellung'}},

          {section:{label:'Entscheidungspunkt',title:'Die finale Go/No-Go-Frage',lead:'Nach allen 20 Schritten kommt der wichtigste Moment – die Bestellentscheidung.'}},

          {prompt:{tool:'claude',title:'FINAL: Soll ich bestellen?',text:'Das ist meine finale Produktentscheidung für Amazon FBA Deutschland.\n\nProdukt:\n[Produkt]\n\nMarktdaten:\n[Helium-10-Daten]\n\nKeywords:\n[Keyworddaten]\n\nKonkurrenz:\n[Konkurrenzanalyse]\n\nReviews:\n[Review-Analyse]\n\nMarge:\n[Kalkulation]\n\nLieferant:\n[Lieferantendaten]\n\nRisiken:\n[Risikoanalyse]\n\nBitte entscheide kritisch:\n1. Soll ich dieses Produkt bestellen?\n2. Wenn ja, mit welcher ersten Menge?\n3. Welche Bedingungen muss der Lieferant erfüllen?\n4. Welche Risiken muss ich vorher lösen?\n5. Welche Mindestmarge brauche ich?\n6. Welche 5 Gründe sprechen dafür?\n7. Welche 5 Gründe sprechen dagegen?\n8. Finale Entscheidung: Go, No-Go oder nur kleiner Test.',note:'Nur wenn Claude nach dieser kritischen Prüfung „Go" oder „kleiner Test" empfiehlt – UND die Zahlen aus deiner Kalkulation passen – bestellst du. Im Zweifel: nicht bestellen. Es kommen immer neue Produkte.'}},

          {checklist:{title:'Was du am Ende der 20 Schritte haben solltest',items:[
            'Score-Matrix mit allen Kandidaten und Gesamtscore 1-100',
            'Claude hat eine klare Top-3-Rangliste mit Begründung erstellt',
            'Muster von 3+ Lieferanten bestellt und getestet',
            'Test-Checkliste pro Muster ausgefüllt',
            'Finales Produktkonzept als Dokument vorhanden',
            'Launch-Plan für die ersten 90 Tage festgelegt',
            'PPC-Budget für 6-12 Wochen Launch eingeplant',
            'Erste Bestellmenge realistisch kalkuliert (lieber zu wenig als zu viel)',
            'Lieferantenvertrag mit klaren Qualitätsanforderungen abgeschlossen',
            'Finale Go/No-Go-Entscheidung schriftlich dokumentiert'
          ]}}
        ]
      },

      // ═══════════════════════════════════════════════════════════
      // LEKTION 7: GO/NO-GO REGELN & KURZFORM
      // ═══════════════════════════════════════════════════════════
      {
        id:'rp_7',
        title:'Go/No-Go-Regeln & Kurzform des Prozesses',
        readTime:'9 Min',
        content:[
          {intro:'Diese letzte Lektion ist dein Spickzettel. Hier findest du die klaren Regeln, wann du ein Produkt sofort ablehnst, wann du weiter prüfst und wann du Muster bestellst. Plus: die Kurzform des gesamten 20-Schritte-Prozesses als Pipeline-Übersicht für den schnellen Überblick.'},

          {section:{label:'Regeln',title:'Sofort ablehnen',lead:'Diese Signale sind klare K.O.-Kriterien – egal wie gut die anderen Daten aussehen.'}},

          {l:[
            '<b>Marge zu niedrig:</b> Netto-Marge unter 15% nach allen Kosten inkl. PPC',
            '<b>Alle Top-Listings haben tausende Reviews:</b> Markt ist zu reif für Newcomer',
            '<b>Preis stark gedrückt:</b> Margenkampf mit Billiganbietern, kein Wachstumsspielraum',
            '<b>Rechtlich riskant:</b> CE-Probleme, Sicherheitsanforderungen, Haftung',
            '<b>Viele Varianten nötig:</b> Größen, Farben, Kompatibilität – jede Variante = Risiko',
            '<b>Qualität schwer kontrollierbar:</b> Komplexe Technik, sensible Materialien',
            '<b>Hohe Retourenwahrscheinlichkeit:</b> Passform-Probleme, Kompatibilität, Empfindlichkeit',
            '<b>Keine echte Differenzierung möglich:</b> Du wärst nur das gleiche Produkt mit anderem Label'
          ]},

          {section:{label:'Regeln',title:'Weiter prüfen',lead:'Diese Signale sprechen für tiefere Analyse – das Produkt ist nicht raus, aber noch nicht spruchreif.'}},

          {l:[
            '<b>Nachfrage ist vorhanden</b> (mindestens 3.000-10.000 € Monatsumsatz bei Top 10)',
            '<b>Konkurrenz nicht perfekt:</b> Listings haben sichtbare Schwächen',
            '<b>Reviews zeigen wiederkehrende Probleme</b> – das sind deine Verbesserungschancen',
            '<b>Marge erscheint möglich</b> bei realistischen Einkaufspreisen',
            '<b>Lieferanten können Verbesserungen anbieten</b> – sie sind kooperativ'
          ]},

          {section:{label:'Regeln',title:'Muster bestellen',lead:'Diese Signale rechtfertigen die ~50-150 € Investition für Muster.'}},

          {l:[
            '<b>Helium-10-Daten sind attraktiv</b> (Umsatz, Reviews, BSR, Trends)',
            '<b>Review-Probleme sind klar lösbar</b> mit Material, Anleitung oder Bundle',
            '<b>Marge ist realistisch nach allen Kosten inkl. PPC</b>',
            '<b>Lieferanten sind verfügbar</b> und reagieren professionell',
            '<b>Risiken sind überschaubar</b> – nichts „Show-Stopper-Mäßiges"',
            '<b>Du hast eine klare Differenzierung</b>, die du formulieren und visualisieren kannst'
          ]},

          {section:{label:'Übersicht',title:'Die komplette Pipeline auf einen Blick',lead:'Vom ersten Brainstorming bis zur Muster-Bestellung – alles in einer Übersicht.'}},

          {steps:[
            {title:'Idee finden',text:'Perplexity & Claude'},
            {title:'Helium 10 Black Box prüfen',text:'Filter setzen, Nische mit echten Daten validieren'},
            {title:'Xray Konkurrenz analysieren',text:'Live auf der Amazon-Suchergebnisseite'},
            {title:'Cerebro/Magnet Keywords prüfen',text:'Wettbewerber-Keywords + Long-Tails'},
            {title:'Trendster Saisonalität prüfen',text:'12-Monats-Verlauf der Nachfrage'},
            {title:'Reviews mit Gemini auswerten',text:'100-300 Wettbewerber-Reviews analysieren'},
            {title:'Differenzierung mit Claude entwickeln',text:'Konkrete Verbesserungen ableiten'},
            {title:'Marge mit Helium 10 berechnen',text:'Profitability Calculator nutzen'},
            {title:'Lieferanten mit Perplexity suchen',text:'3+ Anbieter recherchieren, Standardanfrage senden'},
            {title:'Risiko mit Claude prüfen',text:'Rechtlich, Sicherheit, Retourenrate, Haftung'},
            {title:'Score-Matrix mit Gemini bauen',text:'Gewichtete Bewertung aller Kandidaten'},
            {title:'Finale Entscheidung mit Claude',text:'Kritische Endprüfung – „Was übersehe ich?"'},
            {title:'Muster bestellen',text:'Nur jetzt – nicht früher'}
          ]},

          {section:{label:'Startaufgabe',title:'Heute sofort loslegen',lead:'Wenn du jetzt anfangen willst, mache heute nur diese 5 Dinge.'}},

          {checklist:{title:'Deine 5 Aufgaben für heute',items:[
            'Erstelle deine Master-Tabelle mit allen 18 Spalten',
            'Suche mit Perplexity 30 Produktideen in deinen 3-5 Zielfeldern',
            'Lass Claude die 30 Ideen kritisch auf 10 reduzieren',
            'Prüfe die 10 Ideen mit Helium 10 Black Box und Xray',
            'Wähle 3 Ideen aus, die du morgen mit Cerebro, Magnet und Review-Mining tiefer analysierst'
          ]}},

          {success:'<b>Deine wichtigste Regel:</b> Triff niemals eine Produktentscheidung nur anhand einer KI-Antwort. Die richtige Reihenfolge ist immer: Idee mit Perplexity und Claude finden → Amazon-Daten mit Helium 10 prüfen → Keywords und Reviews mit Gemini analysieren → Marge und Risiken prüfen → finale Entscheidung mit Claude kritisch hinterfragen → erst danach Muster bestellen.'},

          {tip:'Speichere diese Lektion als Lesezeichen ⭐. Du wirst sie jedes Mal aufrufen, wenn du eine neue Recherche-Welle startest. Mit der Zeit verinnerlichst du die Pipeline – aber gerade in den ersten Monaten ist die Checkliste deine Versicherung gegen teure Fehler.'}
        ]
      }
    ]
  },

  {
    id:'h10_intro',
    title:'Helium 10 verstehen',
    icon:'🚀',
    color:'ac',
    desc:'Was ist Helium 10 und welche Tools brauchst du als FBA-Seller wirklich?',
    lessons:[
      {
        id:'h10_intro_1',
        title:'Was ist Helium 10?',
        readTime:'4 Min',
        videoId:'hZHKJBCUFWs',
        videoTitle:'Helium 10 Tutorial DEUTSCH (Komplett-Übersicht)',
        content:[
          {h:'Helium 10 in einem Satz'},
          {p:'Helium 10 ist die populärste Software-Suite für Amazon-Seller mit über 30 Tools für Produktrecherche, Keyword-Recherche, Listing-Optimierung, Wettbewerbsanalyse und Operations.'},
          {h:'Die 5 wichtigsten Tools für Beginner'},
          {l:[
            '<b>Black Box</b> – Produktrecherche-Datenbank: Filter nach Marge, BSR, Reviews, Verkäufen → findest profitable Nischen',
            '<b>Cerebro</b> – Reverse-ASIN: gibst eine Konkurrenz-ASIN ein, bekommst alle Keywords für die das Produkt rankt',
            '<b>Magnet</b> – Keyword-Recherche von einem Suchbegriff aus, mit Suchvolumen und Konkurrenz',
            '<b>Xray</b> – Chrome-Extension: Live-Daten direkt auf Amazon-Suchergebnisseiten (BSR, Sales, Revenue, Reviews)',
            '<b>Frankenstein</b> – Keyword-Cleaner: dedupliziert und sortiert Keyword-Listen für Listing-Optimierung'
          ]},
          {h:'Was es kostet'},
          {p:'Plattform-Pläne starten bei rund $39/Monat (Starter), die meisten Profis nutzen Platinum (~$99/Monat) oder Diamond (~$209/Monat). Black Box, Cerebro & Magnet sind in allen Plänen drin – aber mit unterschiedlichen Lookup-Limits.'},
          {tip:'Mein Tipp: Starte mit dem 30-Tage-Test, mache eine Woche lang intensive Recherche, dann entscheidest du.'}
        ]
      },
      {
        id:'h10_intro_2',
        title:'Account einrichten & Marketplace verbinden',
        readTime:'5 Min',
        videoId:'vjprGT_j7_U',
        videoTitle:'Helium 10 für Anfänger - Beste Einstellungen',
        content:[
          {h:'Schritt-für-Schritt Setup'},
          {l:[
            'Account anlegen unter helium10.com',
            'In Helium 10 → "Connections" → Amazon Seller Central verbinden (OAuth-Genehmigung)',
            'Dein Marketplace wählen: für DE → "amazon.de"',
            'PPC-Konto separat verbinden (für Adtomic, falls genutzt)'
          ]},
          {h:'Wichtige Einstellungen'},
          {l:[
            '<b>Sprache:</b> auf "Englisch" lassen, auch wenn du DE verkaufst – die UI/Tutorials sind besser',
            '<b>Currency Display:</b> EUR auswählen damit Black Box-Werte direkt richtig sind',
            '<b>Notifications:</b> Alerts für Hijacking und Buy-Box-Verlust einschalten'
          ]},
          {tip:'Verbinde das Seller-Konto FRÜH – die Daten brauchen 24-48h zum Synchronisieren bevor Tools wie Profits wirklich nützlich werden.'}
        ]
      },
      {
        id:'h10_intro_3',
        title:'Welcher Plan passt zu dir?',
        readTime:'3 Min',
        videoId:'ddj3Qs5wSO8',
        videoTitle:'Die ultimative Helium 10 Anleitung deutsch',
        content:[
          {h:'Entscheidungs-Matrix'},
          {table:{
            header:['Du bist...','Empfohlener Plan','Warum'],
            rows:[
              ['Komplett neu','Starter','Hauptsache Black Box & Cerebro testen, mehr brauchst du nicht'],
              ['Erstes Produkt vorbereitend','Platinum','Volle Recherche-Limits, Keyword-Tracker, Index Checker'],
              ['1-3 Produkte launched','Platinum','Plus Inventory & Profits dashboards'],
              ['Skaliere mehrere Brands','Diamond','Multi-User, Unlimited Lookups, Adtomic']
            ]
          }},
          {tip:'Spar-Tipp: Es gibt 25%-Lifetime-Coupons über YouTube-Affiliate-Links. Suche „Helium 10 coupon" – legal und Helium akzeptiert das.'}
        ]
      }
    ]
  },
  {
    id:'h10_blackbox',
    title:'Black Box – Produktrecherche',
    icon:'📦',
    color:'pu',
    desc:'Profitable Produkt-Nischen finden anhand von Filtern und Marktdaten',
    lessons:[
      {
        id:'h10_bb_1',
        title:'Wie Black Box funktioniert',
        readTime:'5 Min',
        videoId:'2DHLBN1NiLw',
        videoTitle:'Amazon Produkte mit Helium 10 BlackBox finden',
        content:[
          {h:'Was Black Box macht'},
          {p:'Black Box durchsucht Amazons komplette Produktdatenbank (~450 Mio. Listings) und filtert sie nach deinen Kriterien. Output: Liste konkreter ASINs die deine Filter erfüllen.'},
          {h:'Die wichtigsten Tabs in Black Box'},
          {l:[
            '<b>Products</b> – einzelne ASINs nach Verkaufszahlen filtern (Standard-Recherche)',
            '<b>Keywords</b> – ähnlich, aber Einstieg über ein Keyword statt Kategorie',
            '<b>Niches</b> – Cluster von ähnlichen Produkten als Markt analysieren',
            '<b>Categories</b> – Top-Performer in einer Kategorie',
            '<b>Product Targeting</b> – Produkte die für PPC-Targeting gut wären'
          ]},
          {tip:'Für FBA-Privatlabel ist <b>Products</b> der Hauptmodus – nutze ihn 80% der Zeit.'}
        ]
      },
      {
        id:'h10_bb_2',
        title:'Die "perfekten Filter" für Beginner',
        readTime:'7 Min',
        videoId:'vkrGtqsX4j8',
        videoTitle:'Helium 10 Tutorial: Umsatzstarke Nischen finden',
        content:[
          {h:'Standard-Filter-Set für Privatlabel-Einstieg'},
          {table:{
            header:['Filter','Wert','Begründung'],
            rows:[
              ['Marketplace','amazon.de','Dein Heimat-Markt'],
              ['Price','15-50 €','Hohe genug für Marge, niedrig genug für Impulskauf'],
              ['Monthly Revenue','min. 3.000 €','Mindest-Marktgröße um lohnenswert zu sein'],
              ['Monthly Sales','min. 200','Gleiche Logik – Volumen muss da sein'],
              ['Reviews','max. 500','Sonst zu hart umkämpft für Newcomer'],
              ['Rating','3.5-4.6','Über 4.6 schwer zu schlagen, unter 3.5 = Produktproblem'],
              ['Weight','max. 1 kg','FBA-Gebühren bleiben erträglich'],
              ['Number of Sellers','max. 10','Damit du nicht Buy-Box-Hijacking-Hölle hast']
            ]
          }},
          {h:'Erweiterte Filter (für Fortgeschrittene)'},
          {l:[
            '<b>Number of Images</b>: max. 5 → Listings mit weniger Bildern haben Optimierungs-Lücken',
            '<b>Title Word Count</b>: min. 50 → Konkurrenz hat schon SEO-mäßig optimiert (gut zum Lernen)',
            '<b>Listing Quality Score</b>: max. 7 → Lücken in der Listing-Qualität = deine Chance'
          ]},
          {tip:'Speichere dieses Filter-Set als "Beginner-Recherche" in Black Box – du brauchst es bei jeder Recherche.'}
        ]
      },
      {
        id:'h10_bb_3',
        title:'Aus Black Box-Treffer → Produktidee',
        readTime:'8 Min',
        videoId:'emjTmglcFz0',
        videoTitle:'Mit Helium 10 dein erstes Amazon FBA Produkt finden',
        content:[
          {h:'Der Bewertungs-Workflow'},
          {l:[
            'Black Box-Liste exportieren als CSV',
            'In AMZ SellerHub importieren (jetzt im Bereich „📥 Helium 10 Import" möglich!) → landet im Ideen-Pool',
            'Pro Idee: ASIN in Cerebro reverse-suchen → Top-Keywords notieren',
            'Top 3 Konkurrenten in Xray prüfen: wirklich so viel Umsatz wie Black Box behauptet?',
            'Reviews der Top 3 Konkurrenten lesen: was beschweren sich Kunden?',
            'Schwächen → das ist deine Differenzierung'
          ]},
          {h:'Rote Flaggen die du sofort verwirfst'},
          {l:[
            '🚩 Top-Verkäufer ist eine bekannte Marke (Bosch, Philips, …) → keine Chance',
            '🚩 ASIN hat Patente oder Markenrechte (prüfe bei DPMA.de)',
            '🚩 Kategorie ist „Gated" (Lebensmittel, Spielzeug für unter 3 Jahre, etc.)',
            '🚩 Reviews-Anzahl der Top 5 alle über 1.000 → Markt zu reif',
            '🚩 Top-Listings haben „Amazon\'s Choice" Badge → schwer rauszubrechen'
          ]},
          {tip:'AMZ SellerHub-Workflow: Pro Black-Box-Treffer eine Idee im Ideen-Pool. Nach 2-3 Tagen Recherche pro Idee bewertest du sie als „Hohes Potenzial" oder verwirfst.'}
        ]
      }
    ]
  },
  {
    id:'h10_keywords',
    title:'Cerebro & Magnet – Keywords',
    icon:'🔑',
    color:'bl',
    desc:'Die Keywords finden, die deine Konkurrenz Umsatz machen lässt',
    lessons:[
      {
        id:'h10_kw_1',
        title:'Cerebro: Reverse-ASIN richtig nutzen',
        readTime:'6 Min',
        videoId:'ai9osVQFQ_U',
        videoTitle:'Helium 10 Cerebro - Konkurrenz ausspionieren',
        content:[
          {h:'Was Cerebro macht'},
          {p:'Du gibst eine ASIN ein → Cerebro zeigt alle Keywords für die diese ASIN bei Amazon rankt, plus deren Suchvolumen und die Position in den Suchergebnissen.'},
          {h:'Der "Cerebro Triple-Check"'},
          {l:[
            'Top 3 Konkurrenz-ASINs nehmen, jede einzeln in Cerebro werfen',
            'Filter: <b>Position 1-15</b> + <b>Search Volume min. 500</b>',
            'Keywords exportieren, in Excel/AMZ SellerHub-Keyword-Tracker zusammenführen',
            'Keywords die bei <b>allen 3</b> Konkurrenten ranken → das sind deine Pflicht-Keywords',
            'Keywords die nur bei 1 Konkurrenten gut ranken → Nischen-Chance'
          ]},
          {h:'Wichtige Cerebro-Filter'},
          {l:[
            '<b>Organic Rank</b>: 1-15 → wo dein Konkurrent wirklich Traffic bekommt',
            '<b>Sponsored Rank</b>: anzeigen → siehst wo Konkurrent PPC-Geld verbrennt',
            '<b>Competitor Performance Score</b>: 5+ → Keyword bringt Verkäufe',
            '<b>CPR</b> (Cerebro Product Rank): wie viele externe Sales du brauchst zum Ranken'
          ]},
          {tip:'CPR ist Helium-eigene Metrik: niedrig = einfacher zu ranken. Nutze Keywords mit CPR < 50 als Launch-Targets.'}
        ]
      },
      {
        id:'h10_kw_2',
        title:'Magnet: Keyword-Universum erweitern',
        readTime:'5 Min',
        videoId:'6Xdrytyd5RM',
        videoTitle:'Helium 10 Magnet & Cerebro Komplett-Anleitung',
        content:[
          {h:'Magnet vs. Cerebro'},
          {p:'Cerebro startet von einer Konkurrenz-ASIN. Magnet startet von einem Keyword und zeigt alle verwandten Keywords. Nutze Magnet wenn du eine Nische erst betrittst und keine konkrete Konkurrenz-ASIN hast.'},
          {h:'Magnet IQ Score'},
          {p:'Eigene Helium-Metrik (0-100): wie attraktiv ein Keyword ist nach Suchvolumen, Konkurrenz, Trend. Über 60 = solide. Über 80 = Top-Pick.'},
          {h:'Workflow: Listing-Keywords sammeln'},
          {l:[
            'Cerebro für Top 3 Konkurrenten → Liste A',
            'Magnet mit deinem Haupt-Keyword → Liste B',
            'Beide Listen mit Frankenstein bereinigen (Duplikate raus, Sonderzeichen weg)',
            'Liste in Helium\'s "Listing Builder" oder einfach manuell ins Listing einarbeiten',
            'Backend Keywords (Search Terms): die Keywords aus Liste die NICHT in Title/Bullets passen'
          ]},
          {tip:'Maximale Backend-Keyword-Zeichenzahl bei Amazon DE: 250 Bytes. Trenne mit Leerzeichen, KEINE Kommas (verschwendet Bytes).'}
        ]
      }
    ]
  },
  {
    id:'h10_xray',
    title:'Xray Chrome-Extension',
    icon:'🔍',
    color:'cy',
    desc:'Live-Marktdaten direkt auf jeder Amazon-Seite',
    lessons:[
      {
        id:'h10_xray_1',
        title:'Xray installieren & verstehen',
        readTime:'4 Min',
        videoId:'iIpK8tzYLBs',
        videoTitle:'Anleitung Helium 10 Xray Chrome Extension',
        content:[
          {h:'Installation'},
          {l:[
            'Chrome Web Store → "Helium 10 Extension" suchen → installieren',
            'Mit Helium-Account einloggen (gleiche Logindaten)',
            'Auf amazon.de gehen → Helium-Icon oben rechts klicken → Xray öffnet sich'
          ]},
          {h:'Was Xray dir zeigt'},
          {p:'Auf jeder Amazon-Suchergebnis-Seite siehst du sofort für jedes Listing: BSR, geschätzte monatliche Sales, monatlicher Revenue, Anzahl Verkäufer, Listing-Alter, Reviews/Sales-Ratio. Das spart Stunden manueller Recherche.'},
          {h:'Die wichtigsten Xray-Spalten'},
          {l:[
            '<b>BSR</b> – Best Seller Rank: niedriger = mehr Verkäufe',
            '<b>Sales</b> – geschätzte monatliche Stückzahl',
            '<b>Revenue</b> – Sales × Preis = monatlicher Umsatz',
            '<b>Sellers</b> – wie viele Verkäufer das gleiche Listing bedienen (1 = kontrolliert, >5 = Hijacking-Chaos)',
            '<b>Age</b> – Listing-Alter: unter 6 Monate = Newcomer-freundlicher Markt'
          ]}
        ]
      },
      {
        id:'h10_xray_2',
        title:'Marktanalyse mit Xray in 5 Minuten',
        readTime:'5 Min',
        videoId:'ISueNrIU0QQ',
        videoTitle:'Helium 10 Xray Anleitung - Konkurrenten analysieren',
        content:[
          {h:'Schnell-Check für jede Nische'},
          {l:[
            'Suche dein Haupt-Keyword auf amazon.de',
            'Xray öffnen → Top-10-Ergebnisse anschauen',
            'Summe der monatlichen Revenue der Top 10 → Markt-Größe',
            'Wenn Summe < 30.000€/Monat → zu klein, weitersuchen',
            'Wenn 1 ASIN > 50% der Revenue ausmacht → Marken-Dominanz, schwierig'
          ]},
          {h:'Die "Revenue-Verteilungs"-Regel'},
          {p:'Idealer Markt: Top 5 haben jeweils 5.000-15.000€/Monat Revenue, niemand dominiert. Das bedeutet: kein Marken-Monopol, Platz für Newcomer.'},
          {h:'Export für AMZ SellerHub'},
          {l:[
            'In Xray oben „Export to CSV" klicken',
            'In AMZ SellerHub: Helium 10 Import → Xray-Format auswählen',
            'Wahl: Ideen-Pool (zum Bewerten) oder Wettbewerbsanalyse-Tab (für ein bestehendes Produkt)'
          ]},
          {tip:'Xray-Daten sind <i>Schätzungen</i>. Für endgültige Entscheidungen Cerebro für Keyword-Validierung nutzen.'}
        ]
      }
    ]
  },
  {
    id:'h10_workflow',
    title:'Der komplette Recherche-Workflow',
    icon:'⚡',
    color:'gn',
    desc:'Schritt-für-Schritt von Idee bis Bestellung mit Helium 10 + AMZ SellerHub',
    lessons:[
      {
        id:'h10_wf_1',
        title:'Phase 1: Brainstorming (1-2h)',
        readTime:'5 Min',
        videoId:'cgC-E8BVNc4',
        videoTitle:'Kassenschlager Produkte finden - Schritt für Schritt',
        content:[
          {h:'Ziel'},
          {p:'20-50 Roh-Ideen sammeln, alles erlaubt – noch keine Bewertung.'},
          {h:'Tools-Mix'},
          {l:[
            '<b>Helium Black Box</b>: mit den Beginner-Filtern → Top 30 ASINs exportieren',
            '<b>Amazon Movers & Shakers</b>: in deinen Wunsch-Kategorien aktuelle Trends',
            '<b>Trend Hunter / Reddit / TikTok</b>: was ist gerade angesagt',
            '<b>Claude / Perplexity (in AMZ SellerHub)</b>: KI-Brainstorming mit dem Prompt-Generator'
          ]},
          {h:'In AMZ SellerHub landen alle in den Ideen-Pool mit Status „Neu"'}
        ]
      },
      {
        id:'h10_wf_2',
        title:'Phase 2: Markt-Validierung (3-5h)',
        readTime:'7 Min',
        videoId:'sXqJI6JVsGk',
        videoTitle:'Erfolgreiche Amazon FBA Produktsuche',
        content:[
          {h:'Pro Idee diese Daten holen'},
          {l:[
            '<b>Xray auf Amazon</b>: Top 10 Sales/Revenue der Nische',
            '<b>Cerebro</b>: Keyword-Volumen für die Top-3-Konkurrenten',
            '<b>Helium Trendster</b>: ist der Markt wachsend, stabil oder schrumpfend?',
            '<b>Reviews lesen</b>: Top 5 Konkurrenten – häufige Beschwerden notieren'
          ]},
          {h:'In AMZ SellerHub: Idee bearbeiten → Felder ausfüllen'},
          {l:[
            'Marktgröße (z.B. „Top 10 = 80k€/Monat")',
            'Differenzierung („Konkurrent A hat schwache Bilder, Konkurrent B Reviews unter 4.0")',
            'Risiken („Patent von ABC GmbH bei DPMA")'
          ]},
          {tip:'Status auf „Recherchiert" setzen wenn alle Felder voll. Nur dann weitermachen.'}
        ]
      },
      {
        id:'h10_wf_3',
        title:'Phase 3: Sourcing & Kalkulation (5-10h)',
        readTime:'6 Min',
        videoId:'oi5lOs1Uvu4',
        videoTitle:'Helium 10 Tutorial deutsch - Amazon FBA',
        content:[
          {h:'In AMZ SellerHub: Idee → Produktliste übernehmen'},
          {p:'Im Ideen-Pool den ➡️-Button klicken → Idee wandert zur Produktliste, Detail-Ansicht öffnet sich.'},
          {h:'Im Hersteller-Tab'},
          {l:[
            'Alibaba & 1688 Quick-Links nutzen (englische Keywords sind drin)',
            'Top 5 Lieferanten kontaktieren – um Sample fragen',
            'Stückpreise notieren (FOB, EXW, CIF)',
            'MOQ, Lieferzeit, Zertifikate erfassen',
            'AMZ SellerHub berechnet automatisch einen Score je Lieferant'
          ]},
          {h:'Im Kalkulation-Tab'},
          {l:[
            'EK aus bestem Lieferanten-Angebot',
            'FBA-Gebühren mit dem Gebührenrechner ermitteln',
            'Versand (DDP-Preis vom Lieferanten oder Logistiker)',
            'Realistischen VK aus Konkurrenz-Recherche',
            'Marge prüfen: <b>< 25% → verwerfen</b>, 25-35% = OK, 35%+ = sehr gut'
          ]}
        ]
      },
      {
        id:'h10_wf_4',
        title:'Phase 4: Pre-Launch Vorbereitung',
        readTime:'5 Min',
        videoId:'ddj3Qs5wSO8',
        videoTitle:'Die ultimative Helium 10 Anleitung deutsch',
        content:[
          {h:'Listing erstellen'},
          {l:[
            'Title: max. 200 Zeichen, wichtigste Keywords (aus Cerebro) nach vorn',
            '5 Bullet Points: jeder fokussiert auf einen Nutzen + Keyword-Integration',
            'Description / A+ Content: Geschichte des Produkts + Detail-Bilder',
            '7-9 Listing-Bilder: Hauptbild auf weiß (Pflicht), 2-3 Lifestyle, 2-3 Infografiken, 1 Größenvergleich'
          ]},
          {h:'Helium-Tools für Listing'},
          {l:[
            '<b>Listing Builder</b>: schreibt das Listing mit Keywords aus Cerebro',
            '<b>Index Checker</b>: prüft welche Keywords Amazon wirklich indexiert hat',
            '<b>Frankenstein</b>: bereinigt Backend-Keywords-Liste',
            '<b>Scribbles</b>: Echtzeit-Keyword-Tracking während du Listing schreibst'
          ]},
          {h:'AMZ SellerHub: Launch-Planer befüllen'},
          {p:'Im Launch-Planer eine Checkliste machen: Inspection im Werk, FBA-Versand-Buchung, Listing live, PPC-Kampagnen, Review-Anfragen, Brand Registry – alles abhakbar.'},
          {tip:'Erst launchen wenn alle Pre-Launch-Aufgaben erledigt sind. Eile = teuer.'}
        ]
      }
    ]
  },
  {
    id:'sourcing',
    title:'Sourcing & Lieferanten',
    icon:'🏭',
    color:'or',
    desc:'Vom Alibaba-Suchen bis zum Container-Versand: alles über die Beschaffung',
    lessons:[
      {
        id:'src_1',
        title:'Alibaba richtig nutzen',
        readTime:'8 Min',
        content:[
          {h:'Account einrichten'},
          {l:[
            'Auf alibaba.com kostenlos registrieren mit deiner E-Mail',
            '<b>Wichtig:</b> als Business-Buyer registrieren, nicht als Privatperson',
            'Profil ausfüllen damit Lieferanten dich ernst nehmen',
            'Trade Assurance immer aktivieren (Käufer-Schutz)'
          ]},
          {h:'Die richtigen Filter setzen'},
          {l:[
            '<b>Verified Supplier</b>: nur verifizierte Hersteller anzeigen',
            '<b>Trade Assurance</b>: Käuferschutz – ohne nicht bestellen',
            '<b>Gold Supplier</b>: zahlt für Status, ist aber kein Qualitätsbeweis',
            '<b>Years of Experience</b>: min. 3 Jahre auf der Plattform',
            '<b>Response Rate</b>: über 80% – langsame Lieferanten sind Zeitkiller'
          ]},
          {h:'Die richtigen Suchbegriffe'},
          {p:'Englische Begriffe nutzen, sehr spezifisch. „Yoga mat" ist zu breit. Besser „TPE yoga mat 6mm thick eco-friendly". Je spezifischer, desto bessere Treffer.'},
          {tip:'Tipp: Bei Alibaba sortieren manche Hersteller nach hinten – die sind oft die besten. Schau auf Seite 3-5 statt nur Top-Treffer.'}
        ]
      },
      {
        id:'src_2',
        title:'Lieferanten kontaktieren & verhandeln',
        readTime:'7 Min',
        content:[
          {h:'Erstanfrage-Template (Englisch)'},
          {p:'„Hello, I am a German Amazon seller looking for [Product Name]. We expect monthly orders of 500-1000 units. Could you please provide: <br>1. Your best FOB price for 500/1000/2000 units<br>2. MOQ and lead time<br>3. Certifications you can provide (CE, RoHS, REACH for EU)<br>4. Custom branding/logo options<br>5. Sample cost and shipping to Germany<br>Thank you, [Name]"'},
          {h:'Was du in jedem Fall klärst'},
          {l:[
            '<b>FOB-Preis</b> pro Stück bei verschiedenen Mengen',
            '<b>MOQ</b> (Minimum Order Quantity) – ist sie verhandelbar?',
            '<b>Lead Time</b> (Produktionszeit) in Tagen',
            '<b>Sample-Preis</b> & Versand nach Deutschland',
            '<b>Zertifikate</b>: CE, RoHS, REACH (für Verkauf in DE Pflicht!)',
            '<b>Custom Branding</b>: Logo, Verpackung, Anleitung'
          ]},
          {h:'Verhandeln'},
          {l:[
            'Erste Preise sind ALWAYS verhandelbar – fordere 20-30% Reduktion',
            'Mehrere Lieferanten parallel anschreiben (5-10), dann gegeneinander verhandeln',
            'Bei höherer Stückzahl mehr Rabatt fordern',
            'Bezahlung: 30% Anzahlung, 70% nach QC-Check vor Versand'
          ]},
          {tip:'Niemals den ersten Preis akzeptieren! Selbst „best price" ist verhandelbar. Lieferanten kalkulieren mit 30-50% Verhandlungsspielraum.'}
        ]
      },
      {
        id:'src_3',
        title:'Samples bestellen & prüfen',
        readTime:'5 Min',
        content:[
          {h:'Warum Samples Pflicht sind'},
          {p:'Niemals 500+ Stück bestellen ohne ein Sample in der Hand gehabt zu haben. Bilder lügen, Kleinserien-Qualität weicht oft von Massenproduktion ab. Samples kosten 30-100€ pro Lieferant – das beste Investment.'},
          {h:'Sample-Prozess'},
          {l:[
            'Bei min. 3 Top-Lieferanten Samples bestellen',
            'Per DHL Express: 5-7 Tage Lieferung, 30-80€ Versand',
            'Beim Erhalt: <b>Foto und Video</b> machen für späteren Vergleich',
            'Genaue Inspektion: Material, Verarbeitung, Verpackung, Geruch',
            'Live-Test: nutze das Produkt 1 Woche wie ein Endkunde'
          ]},
          {h:'Was du checken musst'},
          {l:[
            '<b>Funktionalität</b>: macht es was es soll?',
            '<b>Materialqualität</b>: hochwertig oder „cheap China feel"?',
            '<b>Verarbeitung</b>: Nähte, Klebestellen, Symmetrie',
            '<b>Verpackung</b>: präsentationsfähig auf Amazon?',
            '<b>Geruch</b>: chemisch? → CE-Zertifikat fragwürdig'
          ]},
          {tip:'Mache eine Sample-Vergleichs-Tabelle in AMZ SellerHub: Lieferant A vs B vs C nach Qualität, Preis, MOQ, Antwortzeit. Score-System hilft bei Entscheidung.'}
        ]
      },
      {
        id:'src_4',
        title:'Versand: Sea Freight vs Air Freight',
        readTime:'6 Min',
        content:[
          {h:'Die 3 Versand-Optionen'},
          {table:{
            header:['Option','Dauer','Kosten','Wann nutzen'],
            rows:[
              ['Express (DHL/FedEx)','5-7 Tage','12-20€/kg','Samples, eilige Nachbestellungen, < 50 kg'],
              ['Air Freight','10-14 Tage','5-8€/kg','Kleine Mengen 50-300 kg, eilig'],
              ['Sea Freight','30-45 Tage','1-2€/kg','Große Mengen ab 1 m³ / 200+ kg, nicht eilig']
            ]
          }},
          {h:'Incoterms verstehen'},
          {l:[
            '<b>EXW</b> (Ex Works): du holst die Ware ab Werk – kompliziert',
            '<b>FOB</b> (Free on Board): bis zum Hafen – Standard, gut für Anfänger',
            '<b>CIF</b> (Cost Insurance Freight): bis zum Zielhafen inkl. Versicherung',
            '<b>DDP</b> (Delivered Duty Paid): bis zur Tür inkl. Zoll – am einfachsten, aber teurer'
          ]},
          {h:'Beim ersten Mal: nimm einen Spediteur'},
          {p:'Spediteure (z.B. Senator, Flexport, Forto) übernehmen alles: Abholung in China, Verzollung, Lieferung an Amazon FBA. Kostet 200-500€ extra, spart aber Wochen Stress beim ersten Import.'},
          {tip:'Plane mindestens 8 Wochen vom „Bestellung aufgegeben" bis „Ware bei Amazon FBA". Sea Freight + Verzollung + Amazon Receiving dauert oft länger als gedacht.'}
        ]
      }
    ]
  },
  {
    id:'ppc',
    title:'Amazon PPC – Schritt für Schritt',
    icon:'📣',
    color:'pk',
    desc:'Vom Anfänger zum Profi: Sponsored Products, ACoS-Optimierung, Kampagnen-Strukturen mit echten Beispielen',
    lessons:[

      // ═══════════════════════════════════════════════════════════
      // LEKTION 1: GRUNDLAGEN
      // ═══════════════════════════════════════════════════════════
      {
        id:'ppc_1',
        title:'Was ist Amazon PPC? – Die absoluten Grundlagen',
        readTime:'9 Min',
        videoId:'i0jenf0Xp1I',
        videoTitle:'Erstelle eine Amazon PPC Kampagne in 5 Schritten – Amazon Ads (offizieller Kanal)',
        content:[
          {intro:'PPC ist die wichtigste Werbeform auf Amazon. In dieser Lektion siehst du in Schaubildern – mit ausführlicher Erklärung daneben – was PPC ist, welche drei Anzeigentypen es gibt und warum jeder Seller sie braucht. Einfach erklärt, aber fachlich korrekt.'},

          {section:{label:'Grundprinzip',title:'PPC = Pay-Per-Click',lead:'Du zahlst nur, wenn jemand klickt – nicht fürs bloße Anzeigen.'}},

          {visual:{
            title:'💡 Das Grundprinzip an einem Tag',
            textPos:'right',
            image:'<svg viewBox="0 0 520 300" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;font-family:DM Sans,sans-serif"><rect x="0" y="0" width="520" height="300" rx="14" fill="#0f1729"/><text x="260" y="38" text-anchor="middle" font-size="17" font-weight="800" fill="#e8a832">Ein Tag mit deiner Anzeige</text><rect x="28" y="62" width="200" height="200" rx="12" fill="#141d2e" stroke="#2a3550" stroke-width="1.5"/><text x="128" y="108" text-anchor="middle" font-size="46" font-weight="800" fill="#9aa6c2">1.000</text><text x="128" y="132" text-anchor="middle" font-size="14" font-weight="600" fill="#9aa6c2">Impressionen</text><text x="128" y="152" text-anchor="middle" font-size="12" fill="#6b7694">Anzeige nur gesehen</text><rect x="58" y="174" width="140" height="40" rx="8" fill="#16341f"/><text x="128" y="200" text-anchor="middle" font-size="18" font-weight="800" fill="#34d058">0 € Kosten</text><text x="128" y="238" text-anchor="middle" font-size="12" fill="#6b7694">= kostenlose Sichtbarkeit</text><path d="M236 162 L286 162" stroke="#e8a832" stroke-width="3" marker-end="url(#ar1)"/><defs><marker id="ar1" markerWidth="10" markerHeight="10" refX="7" refY="5" orient="auto"><path d="M0 0 L10 5 L0 10 Z" fill="#e8a832"/></marker></defs><rect x="296" y="62" width="200" height="200" rx="12" fill="#141d2e" stroke="#e8a832" stroke-width="2"/><text x="396" y="108" text-anchor="middle" font-size="46" font-weight="800" fill="#e8a832">15</text><text x="396" y="132" text-anchor="middle" font-size="14" font-weight="600" fill="#e8a832">Klicks</text><text x="396" y="152" text-anchor="middle" font-size="12" fill="#9aa6c2">auf Anzeige geklickt</text><rect x="326" y="174" width="140" height="40" rx="8" fill="#3a2410"/><text x="396" y="200" text-anchor="middle" font-size="18" font-weight="800" fill="#e8a832">7,50 € Kosten</text><text x="396" y="238" text-anchor="middle" font-size="12" fill="#6b7694">= 15 × 0,50 € pro Klick</text></svg>',
            text:'<b>PPC</b> bedeutet „Pay-Per-Click" – Bezahlung pro Klick. Das ist das Abrechnungsprinzip aller Amazon-Werbeanzeigen.<br><br>Deine Anzeige wird vielen Käufern <b>gezeigt</b> – jede Einblendung heißt <b>Impression</b> und kostet dich <b>nichts</b>. Du bezahlst erst, wenn jemand wirklich <b>klickt</b> und auf deiner Produktseite landet.<br><br>Im Beispiel: 1.000 Menschen sehen die Anzeige, aber nur 15 klicken. Bei einem durchschnittlichen Klickpreis (CPC) von 0,50 € zahlst du an dem Tag also nur <b>7,50 €</b>. Die übrigen 985 Einblendungen waren <b>kostenlose Werbung</b> für deine Marke.<br><br>Das macht PPC fair und planbar: Du zahlst nur für echten Besuch auf deiner Seite, nie für bloßes Anzeigen.',
            caption:'Nur Klicks kosten Geld. Reine Einblendungen sind gratis.'
          }},

          {section:{label:'Überblick',title:'Die 3 Anzeigentypen',lead:'Jedes Format hat einen klaren Zweck. Als Anfänger startest du immer mit dem ersten.'}},

          {visual:{
            title:'📊 Sponsored Products, Brands & Display im Vergleich',
            textPos:'top',
            image:'<svg viewBox="0 0 600 300" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;font-family:DM Sans,sans-serif"><rect x="0" y="0" width="600" height="300" rx="14" fill="#0f1729"/><rect x="20" y="24" width="180" height="256" rx="12" fill="#141d2e" stroke="#34d058" stroke-width="2.5"/><circle cx="110" cy="66" r="24" fill="#16341f"/><text x="110" y="76" text-anchor="middle" font-size="24">🎯</text><text x="110" y="108" text-anchor="middle" font-size="15" font-weight="800" fill="#34d058">Sponsored</text><text x="110" y="127" text-anchor="middle" font-size="15" font-weight="800" fill="#34d058">Products</text><rect x="48" y="142" width="124" height="24" rx="12" fill="#16341f"/><text x="110" y="159" text-anchor="middle" font-size="11" font-weight="700" fill="#34d058">★ FÜR ANFÄNGER</text><text x="110" y="188" text-anchor="middle" font-size="12" fill="#c2cad9">Einzelne Produkte</text><text x="110" y="205" text-anchor="middle" font-size="12" fill="#c2cad9">in der Suche</text><text x="110" y="240" text-anchor="middle" font-size="30" font-weight="800" fill="#34d058">80%</text><text x="110" y="258" text-anchor="middle" font-size="11" fill="#6b7694">vom Budget · kein</text><text x="110" y="271" text-anchor="middle" font-size="11" fill="#6b7694">Markenkonto nötig</text><rect x="210" y="24" width="180" height="256" rx="12" fill="#141d2e" stroke="#2a3550" stroke-width="1.5"/><circle cx="300" cy="66" r="24" fill="#241a3a"/><text x="300" y="76" text-anchor="middle" font-size="24">🏷️</text><text x="300" y="108" text-anchor="middle" font-size="15" font-weight="800" fill="#a78bfa">Sponsored</text><text x="300" y="127" text-anchor="middle" font-size="15" font-weight="800" fill="#a78bfa">Brands</text><rect x="232" y="142" width="136" height="24" rx="12" fill="#241a3a"/><text x="300" y="159" text-anchor="middle" font-size="10.5" font-weight="700" fill="#a78bfa">BRAND REGISTRY NÖTIG</text><text x="300" y="188" text-anchor="middle" font-size="12" fill="#c2cad9">Logo + 3 Produkte</text><text x="300" y="205" text-anchor="middle" font-size="12" fill="#c2cad9">oben in der Suche</text><text x="300" y="240" text-anchor="middle" font-size="30" font-weight="800" fill="#a78bfa">15%</text><text x="300" y="258" text-anchor="middle" font-size="11" fill="#6b7694">vom Budget · baut</text><text x="300" y="271" text-anchor="middle" font-size="11" fill="#6b7694">die Marke auf</text><rect x="400" y="24" width="180" height="256" rx="12" fill="#141d2e" stroke="#2a3550" stroke-width="1.5"/><circle cx="490" cy="66" r="24" fill="#3a1a24"/><text x="490" y="76" text-anchor="middle" font-size="24">🖥️</text><text x="490" y="108" text-anchor="middle" font-size="15" font-weight="800" fill="#f472b6">Sponsored</text><text x="490" y="127" text-anchor="middle" font-size="15" font-weight="800" fill="#f472b6">Display</text><rect x="422" y="142" width="136" height="24" rx="12" fill="#3a1a24"/><text x="490" y="159" text-anchor="middle" font-size="10.5" font-weight="700" fill="#f472b6">FORTGESCHRITTEN</text><text x="490" y="188" text-anchor="middle" font-size="12" fill="#c2cad9">Retargeting, auch</text><text x="490" y="205" text-anchor="middle" font-size="12" fill="#c2cad9">außerhalb Amazons</text><text x="490" y="240" text-anchor="middle" font-size="30" font-weight="800" fill="#f472b6">5%</text><text x="490" y="258" text-anchor="middle" font-size="11" fill="#6b7694">vom Budget · holt</text><text x="490" y="271" text-anchor="middle" font-size="11" fill="#6b7694">Unentschlossene</text></svg>',
            text:'Amazon bietet dir drei Werbeformate – jedes für eine andere Phase deines Geschäfts:<br><br><b>🎯 Sponsored Products</b> bewirbt einzelne Produkte direkt in den Suchergebnissen, mit dem dezenten Hinweis „Gesponsert". Für Käufer sehen sie fast wie normale Treffer aus – das sorgt für hohe Klickraten. Sie sind einfach einzurichten, brauchen <b>kein Markenkonto</b> und sollten als Anfänger rund <b>80 % deines Budgets</b> bekommen. Das ist dein Einstieg.<br><br><b>🏷️ Sponsored Brands</b> sind Banner mit deinem <b>Logo und mehreren Produkten</b> ganz oben in der Suche. Sie bauen Markenbekanntheit auf – setzen aber eine eingetragene Marke (<b>Brand Registry</b>) voraus.<br><br><b>🖥️ Sponsored Display</b> zeigt deine Anzeige Käufern erneut – auch <b>außerhalb von Amazon</b> auf anderen Webseiten und Apps. Das ist Retargeting für Fortgeschrittene, um Unentschlossene zurückzuholen.',
            caption:'Start immer mit Sponsored Products. Brands & Display kommen später dazu.'
          }},

          {section:{label:'Der Effekt',title:'Warum PPC dein Ranking verbessert',lead:'Bezahlte Verkäufe ziehen kostenlose organische Verkäufe nach sich – das „Flywheel".'}},

          {visual:{
            title:'🔄 Das PPC-Flywheel',
            textPos:'left',
            image:'<svg viewBox="0 0 340 340" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;font-family:DM Sans,sans-serif"><rect x="0" y="0" width="340" height="340" rx="14" fill="#0f1729"/><circle cx="170" cy="170" r="104" fill="none" stroke="#2a3550" stroke-width="2" stroke-dasharray="5,5"/><rect x="105" y="40" width="130" height="52" rx="10" fill="#141d2e" stroke="#e8a832" stroke-width="1.5"/><text x="170" y="62" text-anchor="middle" font-size="12" font-weight="800" fill="#e8a832">1. PPC schalten</text><text x="170" y="79" text-anchor="middle" font-size="10.5" fill="#9aa6c2">Produkt auf Seite 1</text><rect x="248" y="144" width="84" height="52" rx="10" fill="#141d2e" stroke="#34d058" stroke-width="1.5"/><text x="290" y="166" text-anchor="middle" font-size="12" font-weight="800" fill="#34d058">2. Verkäufe</text><text x="290" y="183" text-anchor="middle" font-size="10.5" fill="#9aa6c2">+ Reviews</text><rect x="105" y="248" width="130" height="52" rx="10" fill="#141d2e" stroke="#60a5fa" stroke-width="1.5"/><text x="170" y="270" text-anchor="middle" font-size="12" font-weight="800" fill="#60a5fa">3. Besseres Ranking</text><text x="170" y="287" text-anchor="middle" font-size="10.5" fill="#9aa6c2">Amazon zählt PPC mit</text><rect x="8" y="144" width="84" height="52" rx="10" fill="#141d2e" stroke="#a78bfa" stroke-width="1.5"/><text x="50" y="166" text-anchor="middle" font-size="12" font-weight="800" fill="#a78bfa">4. Gratis</text><text x="50" y="183" text-anchor="middle" font-size="10.5" fill="#9aa6c2">Traffic</text><path d="M235 70 Q295 95 300 140" fill="none" stroke="#e8a832" stroke-width="2.5" marker-end="url(#fw)"/><path d="M290 198 Q270 245 238 258" fill="none" stroke="#34d058" stroke-width="2.5" marker-end="url(#fw)"/><path d="M105 262 Q60 250 65 198" fill="none" stroke="#60a5fa" stroke-width="2.5" marker-end="url(#fw)"/><path d="M50 142 Q55 95 103 72" fill="none" stroke="#a78bfa" stroke-width="2.5" marker-end="url(#fw)"/><defs><marker id="fw" markerWidth="9" markerHeight="9" refX="6" refY="4.5" orient="auto"><path d="M0 0 L9 4.5 L0 9 Z" fill="#9aa6c2"/></marker></defs></svg>',
            text:'Amazon ist im Kern eine Suchmaschine. Ganz oben stehen die Produkte, die sich am häufigsten verkaufen. Ein neues Produkt ohne Verkaufshistorie landet daher weit hinten – auf Seite 5, 10 oder noch tiefer, wo es praktisch niemand sieht. <b>70 % der Käufer schauen nur die erste Seite an.</b><br><br>Mit <b>PPC</b> erkaufst du dir sofort einen Platz auf Seite 1, noch bevor du einen einzigen organischen Verkauf hattest. Die ersten bezahlten Verkäufe bringen <b>Bewertungen</b> und Vertrauen.<br><br>Jetzt kommt der entscheidende Punkt: <b>Amazon zählt PPC-Verkäufe genauso wie organische Verkäufe.</b> Dein Produkt steigt dadurch auch im kostenlosen (organischen) Ranking – und du bekommst Gratis-Traffic obendrauf. Dieser sich selbst verstärkende Kreislauf heißt <b>„PPC-Flywheel"</b>.',
            caption:'Mehr PPC-Verkäufe → besseres Ranking → später brauchst du weniger PPC.'
          }},

          {success:'PPC-Verkäufe und organische Verkäufe zählen für Amazon zusammen. Mehr PPC-Verkäufe = besseres organisches Ranking = später weniger PPC nötig. Genau das nutzt jeder erfolgreiche FBA-Seller.'},

          {section:{label:'Vorsicht',title:'Wann PPC NICHT funktioniert',lead:'Erst diese 3 Dinge müssen stehen – sonst verbrennst du nur Geld.'}},

          {visual:{
            title:'✅ Deine Checkliste VOR dem ersten Euro',
            textPos:'right',
            image:'<svg viewBox="0 0 300 320" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;font-family:DM Sans,sans-serif"><rect x="0" y="0" width="300" height="320" rx="14" fill="#0f1729"/><rect x="24" y="26" width="252" height="78" rx="11" fill="#141d2e" stroke="#60a5fa" stroke-width="1.5"/><circle cx="64" cy="65" r="26" fill="#0f1729" stroke="#60a5fa" stroke-width="2"/><text x="64" y="74" text-anchor="middle" font-size="24">📷</text><text x="104" y="58" font-size="14" font-weight="800" fill="#60a5fa">1. Gute Bilder</text><text x="104" y="78" font-size="11.5" fill="#9aa6c2">Profi-Fotos → höhere</text><text x="104" y="93" font-size="11.5" fill="#9aa6c2">Klickrate, weniger Kosten</text><text x="150" y="124" text-anchor="middle" font-size="20" font-weight="800" fill="#6b7694">+</text><rect x="24" y="134" width="252" height="78" rx="11" fill="#141d2e" stroke="#a78bfa" stroke-width="1.5"/><circle cx="64" cy="173" r="26" fill="#0f1729" stroke="#a78bfa" stroke-width="2"/><text x="64" y="182" text-anchor="middle" font-size="24">📝</text><text x="104" y="166" font-size="14" font-weight="800" fill="#a78bfa">2. Top-Listing</text><text x="104" y="186" font-size="11.5" fill="#9aa6c2">Titel + Bullets + Beschreibung</text><text x="104" y="201" font-size="11.5" fill="#9aa6c2">vollständig &amp; SEO-optimiert</text><text x="150" y="232" text-anchor="middle" font-size="20" font-weight="800" fill="#6b7694">+</text><rect x="24" y="242" width="252" height="78" rx="11" fill="#141d2e" stroke="#34d058" stroke-width="1.5"/><circle cx="64" cy="281" r="26" fill="#0f1729" stroke="#34d058" stroke-width="2"/><text x="64" y="290" text-anchor="middle" font-size="24">⭐</text><text x="104" y="274" font-size="14" font-weight="800" fill="#34d058">3. Bewertungen</text><text x="104" y="294" font-size="11.5" fill="#9aa6c2">mindestens 5–10 echte</text><text x="104" y="309" font-size="11.5" fill="#9aa6c2">Reviews → Käufer vertrauen</text></svg>',
            text:'<b>PPC ist ein Verstärker – kein Wundermittel.</b> Wenn dein Produkt grundlegende Schwächen hat, macht PPC sie nur teurer sichtbar. Bevor du den ersten Cent ausgibst, müssen diese drei Dinge stehen:<br><br><b>1. Gute Bilder:</b> Professionelle Produktfotos sind das Erste, was der Käufer sieht. Schlechte Bilder senken die Klickrate und treiben deinen Klickpreis hoch.<br><br><b>2. Top-Listing:</b> Titel, Bullet Points und Beschreibung müssen vollständig und mit den richtigen Keywords (SEO) gefüllt sein – sonst klickt jemand, versteht das Produkt aber nicht und springt ab.<br><br><b>3. Bewertungen:</b> Ohne mindestens 5–10 echte Reviews vertrauen Käufer dir nicht. Sie klicken vielleicht, aber sie kaufen nicht. <b>Jeder Klick ohne Kauf ist verschwendetes Geld.</b>',
            caption:'Fehlt auch nur ein Punkt, ist PPC Geldverschwendung.'
          }},

          {warning:'Viele Anfänger schalten PPC sofort beim Launch – ohne Bewertungen. Ergebnis: hohe Kosten, kaum Verkäufe, Frust. <b>Investiere die ersten Wochen in Bewertungen und Listing-Qualität.</b> Erst dann arbeitet PPC für dich.'},

          {tip:'Optimale Reihenfolge: <b>1.</b> Produkt + Listing perfektionieren → <b>2.</b> mind. 10 echte Bewertungen aufbauen → <b>3.</b> dann mit kleinem PPC-Budget starten und langsam skalieren.'}
        ]      },

      // ═══════════════════════════════════════════════════════════
      // LEKTION 2: KENNZAHLEN
      // ═══════════════════════════════════════════════════════════
      {
        id:'ppc_2',
        title:'Die wichtigsten Kennzahlen: ACoS, TACoS, ROAS, CTR',
        readTime:'12 Min',
        videoId:'CFo2XLXFgY8',
        videoTitle:'Amazon PPC Schritt für Schritt – FBA Unstoppable',
        content:[
          {intro:'Ohne das Verständnis der wichtigsten PPC-Kennzahlen wirst du nie profitabel werden. Diese Lektion ist die wichtigste deines gesamten PPC-Lernwegs. Du lernst, was ACoS, TACoS, CTR und CVR bedeuten, wie sie berechnet werden – und vor allem: wie du sie richtig interpretierst, um intelligente Entscheidungen zu treffen.'},

          {section:{label:'Erklärung',title:'ACoS – die zentrale Profitabilitäts-Kennzahl',lead:'Der ACoS ist die wichtigste Zahl, auf die jeder PPC-Manager blickt. Aber: viele verstehen ihn falsch.'}},

          {p:'ACoS steht für „Advertising Cost of Sale" – auf Deutsch: Anzeigenkosten pro Verkauf. Diese Kennzahl beantwortet eine einfache, aber entscheidende Frage: <b>Welcher Prozentsatz meines Werbeumsatzes geht für die Werbung selbst drauf?</b> Wenn du diese Zahl nicht kennst, weißt du nicht, ob du Geld verdienst oder verlierst. Sie ist die wichtigste Kennzahl für jede einzelne Kampagne und für jedes einzelne Keyword.'},

          {p:'Die Berechnung ist einfach: Du teilst deine Werbekosten durch deinen Werbeumsatz und multiplizierst das Ergebnis mit 100. Heraus kommt ein Prozentwert. Je niedriger dieser Wert, desto profitabler ist deine Kampagne. Ein ACoS von 10 % bedeutet, dass du für jeden Euro Umsatz nur 10 Cent für die Werbung ausgegeben hast – das ist hervorragend. Ein ACoS von 50 % heißt, dass die Hälfte deines Umsatzes an Amazon fließt – das ist meistens zu viel.'},

          {formula:'ACoS = (Werbekosten ÷ Werbeumsatz) × 100',formulaTitle:'ACoS-Formel'},

          {h2:'Praktisches Beispiel'},
          {example:'Du hast in einer Woche 50 € für PPC ausgegeben und damit 250 € Werbeumsatz erzielt. <br><br>→ ACoS = (50 ÷ 250) × 100 = <b>20 %</b><br><br>Heißt: Für jeden Euro Umsatz hast du 20 Cent Werbekosten gezahlt. Dir bleiben 80 Cent von jedem Euro für Produktkosten, Versand, Amazon-Gebühren und Gewinn. Ob das gut oder schlecht ist, hängt von deiner Marge ab – dazu kommen wir gleich.'},

          {section:{label:'Erklärung',title:'Was ist ein „guter" ACoS?',lead:'Es gibt keine Universal-Antwort. Der gute ACoS hängt zu 100% von deiner Marge ab.'}},

          {p:'Viele Anfänger fragen: „Ist ein ACoS von 25 % gut?" Die ehrliche Antwort lautet: <b>Es kommt darauf an.</b> Der entscheidende Vergleichswert ist deine Marge nach allen Produktkosten – also nach Wareneinkauf, Versand, Amazon-Provision, FBA-Gebühren und sonstigen Ausgaben. Was übrig bleibt, ist dein Bruttogewinn pro verkaufter Einheit. Genau dieser Wert in Prozent vom Verkaufspreis ist deine maximale Schmerzgrenze für den ACoS – auch „Break-Even-ACoS" genannt.'},

          {p:'Ein ACoS, der über deinem Break-Even liegt, bedeutet, dass du <b>pro verkaufter Einheit Geld verlierst</b>. Ein ACoS unter dem Break-Even bedeutet, du machst Gewinn. Profitable Verkäufer arbeiten typischerweise mit einem Ziel-ACoS, der etwa 5–10 Prozentpunkte unter dem Break-Even-ACoS liegt – damit bleibt ein gesunder Gewinn übrig.'},

          {table:{
            header:['Marge','Break-Even ACoS','Ziel-ACoS','Skalierungs-ACoS'],
            rows:[
              ['20 %','20 %','12-15 %','17-20 %'],
              ['30 %','30 %','18-22 %','25-30 %'],
              ['40 %','40 %','25-30 %','35-40 %'],
              ['50 %','50 %','30-35 %','42-50 %']
            ]
          }},

          {tip:'Die Spalte „Skalierungs-ACoS" ist wichtig: Wenn du gerade ein neues Produkt launchst und schnell auf Seite 1 willst, darfst du kurzfristig auch über deinem Ziel-ACoS liegen, um Verkäufe und Bewertungen aufzubauen. Das ist eine bewusste Investition in dein organisches Ranking.'},

          {section:{label:'Erklärung',title:'TACoS – die Königin aller Kennzahlen',lead:'Der ACoS zeigt nur die halbe Wahrheit. Erst der TACoS zeigt, ob deine Marke wirklich wächst.'}},

          {p:'Wenn du bereits ein paar Wochen mit PPC arbeitest, wirst du eine erstaunliche Beobachtung machen: Deine Verkäufe steigen – auch ohne dass du PPC ausweitest. Der Grund: Die durch PPC ausgelösten Verkäufe haben dein organisches Ranking verbessert. Du verkaufst jetzt zusätzlich zu den PPC-Verkäufen auch organisch. Genau diese Mischung aus PPC- und organischen Verkäufen macht den Unterschied zwischen einem Hobby-Verkäufer und einer echten Marke aus.'},

          {p:'Hier kommt der <b>TACoS</b> ins Spiel – „Total Advertising Cost of Sales". Er setzt deine Werbekosten in Relation zu deinem <b>gesamten Umsatz</b>, also PPC-Umsatz plus organischer Umsatz. Diese Kennzahl ist die wahre Profitabilitäts-Kennzahl deiner Marke. Während der ACoS nur die Effizienz innerhalb der Werbung misst, misst der TACoS, wie effizient deine Marke insgesamt arbeitet.'},

          {formula:'TACoS = (Werbekosten ÷ Gesamt-Umsatz) × 100',formulaTitle:'TACoS-Formel'},

          {h2:'Praktisches Beispiel'},
          {example:'Du hast 50 € PPC-Kosten und damit 250 € PPC-Umsatz. Zusätzlich hast du 750 € organischen Umsatz. Dein Gesamt-Umsatz beträgt also 1.000 €.<br><br>→ TACoS = (50 ÷ 1.000) × 100 = <b>5 %</b><br><br>Das ist ein hervorragender Wert! Er bedeutet: Du gibst nur 5 Cent von jedem Umsatz-Euro für Werbung aus. Die anderen 95 Cent stehen für Marge, Wareneinkauf und Gewinn zur Verfügung.'},

          {h2:'Warum der TACoS-Trend wichtiger ist als der absolute Wert'},
          {p:'Schau dir nicht den TACoS einer einzelnen Woche an, sondern beobachte den Trend über mehrere Monate. Ein <b>fallender TACoS</b> ist das beste Zeichen für eine gesunde Marke: dein Produkt verkauft sich zunehmend organisch, du brauchst weniger Werbung für denselben Umsatz. Ein <b>steigender TACoS</b> dagegen ist eine Warnung: entweder verlierst du organisch Boden, oder du wirst zunehmend abhängig von Werbung. Beides ist ein Alarmsignal.'},

          {compare:{
            leftTitle:'TACoS sinkt 📉',
            left:'<b>Sehr gut!</b><br>Bedeutet: Dein Produkt verkauft sich zunehmend organisch. Du brauchst weniger PPC, um den gleichen Umsatz zu halten. Das ist das Ziel jeder gesunden Marke. Es zeigt, dass dein Listing, deine Bewertungen und dein Ranking immer besser werden.',
            rightTitle:'TACoS steigt 📈',
            right:'<b>Achtung!</b><br>Du wirst abhängig von Werbung. Mögliche Ursachen: Konkurrenz wird stärker, dein organisches Ranking sinkt, deine Bewertungen sind schlechter geworden, oder du gibst ineffizient mehr Geld aus. Sofort die Ursache prüfen!'
          }},

          {section:{label:'Erklärung',title:'CTR – die Klickrate misst Listing-Qualität',lead:'Wenn deine CTR niedrig ist, hast du ein Listing-Problem.'}},

          {p:'CTR steht für „Click-Through-Rate" – auf Deutsch: Klickrate. Sie zeigt dir, wie attraktiv dein Produkt in den Suchergebnissen wirkt. Konkret beantwortet sie die Frage: Von 100 Käufern, die deine Anzeige <b>sehen</b>, wie viele klicken tatsächlich? Diese Kennzahl wird oft unterschätzt, dabei ist sie ein direkter Indikator für die Qualität deines Hauptbildes, deines Titels und deines Preises.'},

          {p:'Wenn deine CTR niedrig ist (unter 0,3 %), dann <b>überzeugst du in den Suchergebnissen nicht</b>. Käufer scrollen an deiner Anzeige vorbei. Das ist fast immer ein Signal, dass dein Hauptbild zu unprofessionell wirkt, dein Titel die wichtigsten Merkmale nicht zeigt, oder dein Preis im Vergleich zu Konkurrenten nicht wettbewerbsfähig ist. Eine niedrige CTR macht zudem deine Werbung teurer: Amazons Algorithmus interpretiert eine schlechte CTR als „diese Anzeige ist nicht relevant" und erhöht dafür den Klickpreis.'},

          {formula:'CTR = (Klicks ÷ Impressionen) × 100',formulaTitle:'CTR-Formel'},

          {table:{
            header:['CTR-Wert','Bewertung','Empfohlene Maßnahme'],
            rows:[
              ['unter 0,2 %','Schlecht','Hauptbild & Preis dringend prüfen'],
              ['0,3 – 0,5 %','OK','Akzeptabel für die meisten Kategorien'],
              ['0,5 – 1,0 %','Gut','Listing funktioniert solide'],
              ['über 1 %','Sehr gut','Klares Skalierungssignal']
            ]
          }},

          {section:{label:'Erklärung',title:'CVR – die Conversion-Rate misst Verkaufsstärke',lead:'Hohe CTR, aber niemand kauft? Dann liegt es an deiner Produktdetailseite.'}},

          {p:'Die CVR – „Conversion Rate" oder Konversionsrate – ist das Spiegelbild der CTR. Sie misst nicht, wie viele Käufer klicken, sondern wie viele der Klickenden anschließend tatsächlich kaufen. Wenn 100 Personen auf dein Produkt klicken und 8 davon kaufen, hast du eine CVR von 8 %. Diese Kennzahl ist ein direkter Indikator für die Qualität deiner Produktdetailseite (PDP) – also der Seite, die der Käufer nach dem Klick sieht.'},

          {p:'Eine niedrige CVR bedeutet, dass der Käufer auf deiner Produktseite ankommt, sich umschaut – und dann doch nicht kauft. Das ist immer ein Warnsignal. Die häufigsten Ursachen sind: zu wenige oder schlechte Bewertungen, fehlende Informationen in den Bullet Points, schwache zusätzliche Produktbilder, ein zu hoher Preis im Vergleich zur Konkurrenz, oder fehlender A+ Content. Eine niedrige CVR macht deine Werbung extrem unprofitabel: Du zahlst für die Klicks, bekommst aber keine Verkäufe.'},

          {tip:'<b>Faustregel für den deutschen Markt:</b> Eine CVR unter 8 % deutet auf ein Listing-Problem hin. Eine CVR über 12 % zeigt ein sehr gutes Listing. Optimiere zuerst Bilder, Bewertungen und Preis, bevor du mehr PPC-Budget gibst – sonst skalierst du nur deine Verluste.'},

          {section:{label:'Wichtig zu wissen',title:'Die größten Denkfehler bei den Kennzahlen',lead:'Kennzahlen sind nur dann nützlich, wenn man sie richtig interpretiert.'}},

          {warning:'Viele Anfänger fixieren sich nur auf den ACoS – das ist gefährlich. Ein ACoS von 50 % kann <b>top sein</b>, wenn du dadurch viel organischen Umsatz aufbaust und dein TACoS gleichzeitig sinkt. Das ist typisch in der Launch-Phase. Umgekehrt kann ein ACoS von nur 10 % <b>schlecht sein</b>, wenn du dabei nur deine eigenen Marken-Keywords bewirbst und keine neuen Kunden gewinnst. Die ganze Wahrheit zeigt sich nur, wenn du ACoS, TACoS, CTR und CVR zusammen betrachtest.'}
        ]
      },

      // ═══════════════════════════════════════════════════════════
      // LEKTION 3: KAMPAGNEN-TYPEN
      // ═══════════════════════════════════════════════════════════
      {
        id:'ppc_3',
        title:'Auto- vs. manuelle Kampagne: Was wann nutzen?',
        readTime:'10 Min',
        videoId:'hZHKJBCUFWs',
        videoTitle:'Helium 10 PPC Tutorial – Komplett-Übersicht (Deutsch)',
        content:[
          {intro:'Bei Sponsored Products musst du dich zwischen zwei grundlegenden Kampagnen-Typen entscheiden: Automatische Kampagne oder manuelle Kampagne. Diese Wahl bestimmt, wer entscheidet, bei welchen Suchbegriffen deine Anzeige erscheint – Amazon oder du selbst. Beide Typen haben ihre Berechtigung, und tatsächlich brauchst du langfristig <b>beide</b>. In dieser Lektion lernst du, wann du welche nutzt – und wie sie zusammen ein perfekt abgestimmtes Team bilden.'},

          {section:{label:'Erklärung',title:'Die automatische Kampagne – Amazon entscheidet',lead:'Bei der Auto-Kampagne übergibst du die Keyword-Auswahl komplett an Amazon.'}},

          {p:'Die automatische Kampagne (kurz: Auto-Kampagne) ist genau das, was der Name sagt: Amazon entscheidet automatisch, bei welchen Suchbegriffen deine Anzeige erscheint. Wie macht Amazon das? Der Algorithmus analysiert dein Produkt-Listing – also Titel, Bullet Points, Beschreibung und Backend-Keywords – und sucht selbstständig nach Suchbegriffen, die zu deinem Produkt passen könnten. Das passiert kontinuierlich und im Hintergrund.'},

          {p:'<b>Der größte Vorteil:</b> Du musst keine Keyword-Recherche machen, bevor du startest. Amazon zeigt dir oft Suchbegriffe, an die du selbst nie gedacht hättest – ungewöhnliche Schreibweisen, Synonyme oder ganz neue Long-Tail-Begriffe. Die Auto-Kampagne ist also dein <b>Discovery-Tool</b>: ein Werkzeug, um neue, profitable Keywords zu entdecken. Daher ist sie ideal für Anfänger und für die ersten Wochen mit einem neuen Produkt.'},

          {p:'<b>Der größte Nachteil:</b> Du hast wenig Kontrolle. Amazon zeigt deine Anzeige auch bei Suchbegriffen, die nicht 100% zu deinem Produkt passen. Das führt zu Klicks ohne Verkäufe – und damit zu verschwendetem Budget. Außerdem kannst du nicht für einzelne Keywords unterschiedliche Gebote festlegen. Alle Keywords einer Auto-Kampagne haben dasselbe Standard-Gebot, was selten optimal ist.'},

          {section:{label:'Erklärung',title:'Die manuelle Kampagne – du hast die volle Kontrolle',lead:'Bei manuellen Kampagnen wählst du jedes Keyword einzeln aus.'}},

          {p:'Die manuelle Kampagne ist das genaue Gegenteil. Hier wählst du selbst exakt aus, bei welchen Suchbegriffen deine Anzeige erscheinen soll. Du legst eine Liste von Keywords an – zum Beispiel „yogamatte rutschfest", „yogamatte 6mm", „yogamatte naturkautschuk" – und für jeden einzelnen Begriff kannst du ein eigenes Gebot festlegen. Damit kannst du dein wichtigstes Keyword aggressiv pushen (hohes Gebot) und ein nebensächliches Keyword nur halbherzig bewerben (niedriges Gebot).'},

          {p:'<b>Der große Vorteil:</b> Volle Kontrolle. Du bewirbst nur die Keywords, die wirklich zu deinem Produkt passen, und du steuerst die Aggressivität pro Keyword einzeln. Das macht manuelle Kampagnen extrem effizient. Sie sind unverzichtbar, sobald du deine besten Keywords kennst und gezielt skalieren möchtest.'},

          {p:'<b>Der Nachteil:</b> Du brauchst eine gute Keyword-Recherche, bevor du startest. Wenn du die wirklich relevanten Keywords nicht kennst, wirst du schlechter performen als mit einer Auto-Kampagne. Anfängern fehlt diese Datenbasis – und genau hier kommen die beiden Kampagnentypen zusammen.'},

          {compare:{
            leftTitle:'🤖 Automatische Kampagne',
            left:'<b>Vorteil:</b> Du findest <b>neue Keywords</b>, an die du nie gedacht hast. Sehr einfach zu starten.<br><br><b>Nachteil:</b> Weniger Kontrolle, oft auch teure Klicks ohne Verkauf.<br><br><b>Wann nutzen:</b> Erste Wochen mit einem neuen Produkt. Keyword-Discovery.',
            rightTitle:'🎯 Manuelle Kampagne',
            right:'<b>Vorteil:</b> Volle Kontrolle, exakte Gebote pro Keyword. Maximale Effizienz.<br><br><b>Nachteil:</b> Erfordert gute Keyword-Recherche im Vorfeld.<br><br><b>Wann nutzen:</b> Nach 2-3 Wochen Datensammlung. Skalierung der besten Keywords.'
          }},

          {section:{label:'Strategie',title:'Die Auto + Manuell-Strategie für Anfänger',lead:'Profis nutzen niemals nur einen Kampagnen-Typ. Hier ist die bewährte Methode.'}},

          {p:'Die erfolgreichste Strategie für Amazon-PPC kombiniert beide Kampagnen-Typen in einem klugen Zusammenspiel. Sie heißt „Harvesting-Strategie" – auf Deutsch etwa „Ernte-Strategie". Die Idee dahinter: Die Auto-Kampagne ist dein Acker, auf dem du verschiedene Keyword-Saaten testest. Die manuelle Kampagne ist deine Ernte – hier nimmst du nur die besten Keywords und investierst gezielt mehr Budget. So nutzt du die Stärken beider Welten und minimierst die Schwächen.'},

          {steps:[
            {title:'Schritt 1: Auto-Kampagne starten',text:'Erstelle eine automatische Kampagne mit etwa 30 % deines Werbebudgets. Lass sie 14-21 Tage laufen, ohne einzugreifen. In dieser Zeit sammelt Amazon Daten darüber, welche Suchbegriffe wirklich zu deinem Produkt passen und konvertieren.'},
            {title:'Schritt 2: Daten auswerten',text:'Nach 2-3 Wochen lädst du den Suchbegriffsbericht herunter. Darin siehst du jede einzelne Suchanfrage, bei der deine Anzeige erschienen ist – inklusive Klicks, Kosten und Verkäufen. Das ist Gold wert.'},
            {title:'Schritt 3: Top-Performer markieren',text:'Identifiziere die Suchbegriffe mit guten Ergebnissen: mindestens 1-2 Verkäufen UND einem ACoS unter deiner Schmerzgrenze. Das sind deine „Gewinner-Keywords".'},
            {title:'Schritt 4: Manuelle Exact-Kampagne aufbauen',text:'Erstelle eine neue manuelle Kampagne mit Match-Type „Exact" (= exakte Übereinstimmung). Übernimm dort alle Gewinner-Keywords mit höheren Geboten – etwa 20-30 % über dem CPC der Auto-Kampagne. So sicherst du dir die Top-Plätze für diese Keywords.'},
            {title:'Schritt 5: In Auto-Kampagne ausschließen',text:'In der Auto-Kampagne fügst du nun die Gewinner-Keywords als „Negative Exact" hinzu. So konkurrieren die beiden Kampagnen nicht mehr miteinander – die Auto-Kampagne sucht weiter nach neuen Keywords, die manuelle Kampagne pusht die bekannten Gewinner.'},
            {title:'Schritt 6: Wiederholen',text:'Lass die Auto-Kampagne weiterhin laufen. Wiederhole die Schritte 2-5 alle 2-3 Wochen. So findest du kontinuierlich neue Gewinner-Keywords. Das ist der Harvesting-Loop – das Herzstück erfolgreicher PPC-Strategien.'}
          ]},

          {image:'<svg viewBox="0 0 500 200" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:500px;height:auto"><rect x="0" y="0" width="500" height="200" fill="#f1f4f9" rx="8"/><rect x="30" y="40" width="120" height="120" fill="#dbeafe" stroke="#1d4ed8" stroke-width="2" rx="8"/><text x="90" y="65" text-anchor="middle" font-family="DM Sans" font-size="11" font-weight="700" fill="#1d4ed8">🤖 AUTO</text><text x="90" y="82" text-anchor="middle" font-family="DM Sans" font-size="9" fill="#475066">Suche neue</text><text x="90" y="94" text-anchor="middle" font-family="DM Sans" font-size="9" fill="#475066">Keywords</text><text x="90" y="120" text-anchor="middle" font-family="DM Sans" font-size="22">🔍</text><text x="90" y="148" text-anchor="middle" font-family="DM Sans" font-size="9" fill="#1d4ed8" font-weight="600">30% Budget</text><path d="M 155 100 L 200 100 L 200 92 L 215 100 L 200 108 L 200 100" fill="#d97706" stroke="#d97706"/><text x="185" y="80" text-anchor="middle" font-family="DM Sans" font-size="9" fill="#d97706" font-weight="700">Top-Keywords</text><text x="185" y="125" text-anchor="middle" font-family="DM Sans" font-size="9" fill="#d97706">übernehmen</text><rect x="220" y="40" width="120" height="120" fill="#d1fae5" stroke="#059669" stroke-width="2" rx="8"/><text x="280" y="65" text-anchor="middle" font-family="DM Sans" font-size="11" font-weight="700" fill="#059669">🎯 EXACT</text><text x="280" y="82" text-anchor="middle" font-family="DM Sans" font-size="9" fill="#475066">Skaliere</text><text x="280" y="94" text-anchor="middle" font-family="DM Sans" font-size="9" fill="#475066">Top-Performer</text><text x="280" y="120" text-anchor="middle" font-family="DM Sans" font-size="22">💰</text><text x="280" y="148" text-anchor="middle" font-family="DM Sans" font-size="9" fill="#059669" font-weight="600">50% Budget</text><rect x="370" y="40" width="100" height="120" fill="#fef3c7" stroke="#d97706" stroke-width="2" rx="8"/><text x="420" y="65" text-anchor="middle" font-family="DM Sans" font-size="11" font-weight="700" fill="#d97706">📊 BROAD</text><text x="420" y="82" text-anchor="middle" font-family="DM Sans" font-size="9" fill="#475066">Research &amp;</text><text x="420" y="94" text-anchor="middle" font-family="DM Sans" font-size="9" fill="#475066">Variationen</text><text x="420" y="120" text-anchor="middle" font-family="DM Sans" font-size="22">🌐</text><text x="420" y="148" text-anchor="middle" font-family="DM Sans" font-size="9" fill="#d97706" font-weight="600">20% Budget</text><text x="250" y="190" text-anchor="middle" font-family="DM Sans" font-size="10" fill="#475066" font-style="italic">Standard-Kampagnenstruktur für Anfänger</text></svg>',caption:'Die typische 3-Kampagnen-Struktur: Auto findet Keywords, Exact skaliert Gewinner, Broad fängt Variationen ab.'},

          {section:{label:'Erklärung',title:'Die drei Match-Types in manuellen Kampagnen',lead:'Bei manuellen Kampagnen entscheidest du zusätzlich, wie strikt deine Keywords gematcht werden.'}},

          {p:'Wenn du in einer manuellen Kampagne ein Keyword einträgst, kannst du zwischen drei „Match-Types" wählen. Diese bestimmen, wie genau die Suchanfrage des Käufers mit deinem hinterlegten Keyword übereinstimmen muss, damit deine Anzeige geschaltet wird. Das ist ein subtiles, aber extrem wichtiges Detail – jeder Match-Type hat seinen eigenen Einsatzbereich, sein eigenes Risiko-Profil und seinen eigenen Sweet-Spot.'},

          {h2:'Broad Match (weite Übereinstimmung)'},
          {p:'Bei Broad Match werden Variationen, Synonyme, Tippfehler und sogar Begriffe in anderer Reihenfolge erfasst. Wenn du das Keyword „Bluetooth Kopfhörer" als Broad einträgst, wird deine Anzeige auch bei Suchanfragen wie „kabellose Hörer", „headphones bluetooth", „Kopfhörer Wireless" oder „Bluetoothkopfhörer schwarz" geschaltet. Das gibt dir maximale Reichweite – aber auch viele irrelevante Klicks. Broad eignet sich vor allem für die Discovery-Phase.'},

          {h2:'Phrase Match (Phrasen-Übereinstimmung)'},
          {p:'Bei Phrase Match muss deine eingetragene Phrase vollständig und in der korrekten Reihenfolge in der Suchanfrage enthalten sein – aber zusätzliche Wörter davor oder danach sind erlaubt. „Bluetooth Kopfhörer" als Phrase trifft also auch „günstige Bluetooth Kopfhörer schwarz" – aber nicht „Kopfhörer Bluetooth" (falsche Reihenfolge). Phrase ist ein guter Mittelweg zwischen Reichweite und Kontrolle.'},

          {h2:'Exact Match (exakte Übereinstimmung)'},
          {p:'Exact Match ist die strengste Variante. Hier muss die Suchanfrage des Käufers exakt deinem Keyword entsprechen – mit kleinen Toleranzen für Plurale, Singulare und Tippfehler. Wenn du „Bluetooth Kopfhörer" als Exact einträgst, wird deine Anzeige nur bei genau dieser Suche geschaltet. Maximale Kontrolle, geringere Reichweite. Exact ist der Match-Type für deine besten, profitabelsten Keywords.'},

          {success:'Profi-Tipp: Starte mit Broad in einer separaten Research-Kampagne mit niedrigem Gebot, um Variationen zu finden. Die besten Suchbegriffe daraus wandern in deine Exact-Kampagne mit höherem Gebot. Diese „Trichter-Strategie" ist die effizienteste Art, Keywords zu validieren und gleichzeitig dein Budget zu schonen.'}
        ]
      },

      // ═══════════════════════════════════════════════════════════
      // LEKTION 4: ERSTE KAMPAGNE ERSTELLEN
      // ═══════════════════════════════════════════════════════════
      {
        id:'ppc_4',
        title:'Deine erste PPC-Kampagne: Schritt-für-Schritt-Anleitung',
        readTime:'15 Min',
        videoId:'i0jenf0Xp1I',
        videoTitle:'Erstelle eine Amazon PPC Kampagne in 5 Schritten (Amazon Ads offiziell)',
        content:[
          {intro:'Jetzt wird es ernst: In dieser Lektion erstellst du gemeinsam mit mir deine erste Amazon-PPC-Kampagne. Ich zeige dir jeden einzelnen Klick im Seller Central, erkläre dir, welche Einstellungen du wählen sollst – und genauso wichtig: welche Fallen du unbedingt vermeiden musst. Am Ende dieser Lektion läuft deine erste Kampagne im Idealfall live.'},

          {section:{label:'Vorbereitung',title:'Die Pflicht-Checkliste vor dem Start',lead:'Ohne diese Voraussetzungen verbrennst du Geld. Punkt.'}},

          {p:'Bevor du im Seller Central auch nur einen Knopf drückst, musst du sicherstellen, dass dein Produkt-Setup PPC-tauglich ist. Diese Checkliste klingt nach Bürokratie, aber jeder einzelne Punkt ist aus harter Erfahrung entstanden. Verkäufer, die diese Punkte überspringen, verbrennen typischerweise 100-300 € in den ersten Wochen, ohne nennenswerte Verkäufe zu generieren. Verkäufer, die alles abhaken, sind oft nach 3-4 Wochen profitabel.'},

          {l:[
            '<b>✅ Mindestens 5-10 echte Bewertungen vorhanden.</b> Ohne Bewertungen kaufen Käufer fast nie – egal wie gut deine Anzeige ist.',
            '<b>✅ Hauptbild auf weißem Hintergrund.</b> Das ist Amazon-Pflicht, aber mehr noch: Das Produkt sollte 85% des Bildes ausfüllen, damit es in der Suche groß und auffällig wirkt.',
            '<b>✅ Titel enthält dein wichtigstes Keyword.</b> Idealerweise in den ersten 30 Zeichen – das ist der Bereich, der auf Mobile-Geräten zuerst sichtbar ist.',
            '<b>✅ Bullet Points fertig.</b> Mindestens 5 Punkte, alle vollständig, mit Nutzen-Argumenten statt Feature-Listen.',
            '<b>✅ A+ Content vorhanden.</b> Vorausgesetzt, du hast eine eingetragene Marke. A+ Content steigert die CVR um 5-10%.',
            '<b>✅ Kalkulation gemacht.</b> Du kennst deinen Break-Even-ACoS. Ohne diese Zahl steuerst du blind.',
            '<b>✅ Backend-Keywords gepflegt.</b> Im Seller Central unter „Suchbegriffe" – diese Keywords speist die Auto-Kampagne mit zusätzlichen Hinweisen.'
          ]},

          {section:{label:'Schritt 1',title:'Die Kampagne im Seller Central anlegen',lead:'Hier ist der Klick-für-Klick-Pfad durch das Amazon Werbe-Interface.'}},

          {p:'Logge dich ins Seller Central ein und navigiere oben zu „Werbung" → „Kampagne erstellen". Amazon führt dich nun durch einen mehrstufigen Assistenten. Wir gehen jeden Schritt einzeln durch und ich erkläre dir, welche Einstellung du wählen sollst und warum.'},

          {steps:[
            {title:'Werbungstyp wählen',text:'Klicke auf „Sponsored Products". Das ist der einzig richtige Typ für deine erste Kampagne. Sponsored Brands und Sponsored Display kommen erst später – frühestens nach 2-3 Monaten Erfahrung mit SP.'},
            {title:'Kampagnen-Name vergeben',text:'Wichtig: Vergib einen aussagekräftigen Namen, kein „Kampagne 1". Gutes Beispiel: „Yogamatte_AUTO_DE" oder „Yogamatte_EXACT_Hauptkw_DE". Das Schema ist: [Produkt]_[Typ]_[Markt]. Diese Namen werden später Gold wert sein, wenn du 20+ Kampagnen hast.'},
            {title:'Tagesbudget festlegen',text:'Anfänger starten mit 10-20 € pro Tag. Niedrig starten, beobachten, dann erhöhen. Niemals mit 50 € oder höher einsteigen – das ist der häufigste Anfänger-Fehler und führt zu massiven Verlusten in der Lernphase.'},
            {title:'Targeting wählen',text:'Bei deiner ersten Kampagne wählst du „Automatisches Targeting". Amazon entscheidet, bei welchen Suchbegriffen deine Anzeige erscheint – basierend auf deinem Listing.'},
            {title:'Anzeigengruppe + Produkte',text:'Erstelle eine Anzeigengruppe (Standard-Name reicht hier). Wähle EIN einzelnes Produkt für diese Anzeigengruppe – am Anfang nicht mehrere. So kannst du später besser auswerten, was funktioniert.'},
            {title:'Standard-Gebot setzen',text:'Für den deutschen Markt ist 0,40 - 0,80 € ein guter Start. Zu niedrig (z.B. 0,20 €) bedeutet kaum Impressionen. Zu hoch (z.B. 1,50 €) bedeutet teure Klicks ohne Verkauf. Beobachte 5-7 Tage und passe an.'},
            {title:'Gebotsstrategie wählen',text:'Hier ist eine kritische Entscheidung. Für Auto-Kampagnen ist die richtige Wahl IMMER „Dynamisch – nur senken". Amazon reduziert dein Gebot, wenn ein Klick wahrscheinlich nicht konvertiert. Das ist die sicherste Wahl für Anfänger.'},
            {title:'Kampagne starten',text:'Klick auf „Kampagne starten". Die ersten Impressionen sind nach 1-2 Stunden zu sehen, manchmal dauert es bis zu einem Tag. Lass dich nicht beunruhigen, wenn am ersten Tag wenig passiert – das ist normal.'}
          ]},

          {warning:'Niemals „Dynamisch – erhöhen und senken" als Anfänger! Diese Einstellung erlaubt Amazon, dein Gebot um bis zu 100 % zu erhöhen. Aus geplanten 0,50 € pro Klick werden plötzlich 1,00 €. Bei 50 Klicks am Tag sind das 25 € Mehrkosten – ohne dass du es bemerkst. Diese Einstellung ist ausschließlich für erfahrene Verkäufer mit etablierten, gut konvertierenden Produkten geeignet.'},

          {section:{label:'Schritt 2',title:'Die ersten 14 Tage – Nicht eingreifen!',lead:'Das ist die schwerste Disziplin im PPC. Aber sie ist entscheidend.'}},

          {p:'In den ersten zwei Wochen wirst du beobachten, wie Geld ausgegeben wird – und nicht jeder Euro bringt sofort einen Verkauf. Die Versuchung ist riesig, einzugreifen, Gebote zu senken, Keywords zu pausieren. <b>Tu es nicht.</b> Amazons Algorithmus braucht Daten, um zu lernen, welche Suchanfragen am besten zu deinem Produkt passen. Wenn du zu früh eingreifst, störst du diesen Lernprozess. Das Ergebnis: schlechtere Performance auf Dauer.'},

          {p:'Nutze die Wartezeit, um den Suchbegriffsbericht und das Werbe-Dashboard im Seller Central kennenzulernen. Schau dir die Daten täglich an, aber unternimm nichts. Notiere dir Auffälligkeiten in einem Spreadsheet. Nach 14 Tagen hast du genug Daten für die erste echte Optimierung.'},

          {tip:'Mein Standard-Setup für Anfänger der ersten Woche: 15 €/Tag Auto-Kampagne, „Dynamisch nur senken", Standardgebot 0,50 €. Dann lass die Kampagne LAUFEN. Erst nach 14 Tagen analysieren – nicht vorher. Diese Disziplin ist eine der wichtigsten Lektionen im PPC.'},

          {section:{label:'Schritt 3',title:'Die erste Auswertung nach 14 Tagen',lead:'Jetzt wird aus Daten echtes Wissen.'}},

          {p:'Nach zwei Wochen ist es Zeit für die erste Optimierung. Amazon hat genug Daten gesammelt, um dir zu zeigen, welche Suchanfragen wirklich funktionieren – und welche nicht. Diese Auswertung ist der wichtigste wiederkehrende Prozess in deinem PPC-Workflow. Wenn du diesen Prozess beherrschst, beherrschst du PPC.'},

          {steps:[
            {title:'Suchbegriffsbericht herunterladen',text:'Werbung → Berichte → „Suchbegriff (Sponsored Products)". Wähle als Zeitraum die letzten 14 Tage. Exportiere als CSV-Datei.'},
            {title:'In Excel sortieren',text:'Öffne die CSV in Excel oder Google Sheets. Sortiere absteigend nach der Spalte „Bestellungen" (oder „Käufe"). Oben stehen jetzt die Suchbegriffe, die dir die meisten Verkäufe gebracht haben.'},
            {title:'Top-Performer identifizieren',text:'Markiere alle Suchanfragen mit mindestens 1 Bestellung UND einem ACoS, der unter deiner Schmerzgrenze liegt. Das sind deine Gewinner-Keywords.'},
            {title:'Negative Keywords identifizieren',text:'Schau dir die Suchanfragen mit 10+ Klicks aber 0 Verkäufen an. Diese Begriffe verbrennen nur Geld. Füge sie in deiner Auto-Kampagne als „Negative Exact" hinzu, damit sie nie wieder ausgespielt werden.'},
            {title:'Top-Performer in Exact-Kampagne übernehmen',text:'Erstelle eine neue manuelle Kampagne mit Match-Type „Exact". Trage dort deine Gewinner-Keywords ein. Setze die Gebote etwa 20-30 % höher als der durchschnittliche CPC, den die Auto-Kampagne dafür gezahlt hat.'},
            {title:'Gewinner in Auto-Kampagne ausschließen',text:'Diese Gewinner-Keywords müssen jetzt aus der Auto-Kampagne raus, sonst konkurrieren deine eigenen Kampagnen miteinander. Füge sie als „Negative Exact" in der Auto-Kampagne hinzu.'}
          ]},

          {h2:'Praktisches Beispiel'},
          {example:'Nach 14 Tagen sieht dein Suchbegriffsbericht so aus:<br><br>• <b>„yogamatte rutschfest 6mm"</b> → 4 Verkäufe, 23 Klicks, ACoS 18 % ← <b>Gewinner!</b><br>• <b>„yogamatte naturkautschuk"</b> → 2 Verkäufe, 14 Klicks, ACoS 22 % ← <b>Gewinner!</b><br>• <b>„yoga fitness training"</b> → 0 Verkäufe, 12 Klicks, ACoS — ← <b>Verlierer!</b><br>• <b>„matte sport kinder"</b> → 0 Verkäufe, 8 Klicks, ACoS — ← <b>Beobachten</b><br><br>Aktion: Die ersten beiden Keywords kommen in eine neue Exact-Kampagne mit Geboten von ca. 0,80 €. „yoga fitness training" wird in der Auto-Kampagne als Negative Exact ausgeschlossen. „matte sport kinder" lässt du noch eine Woche laufen.'}
        ]
      },

      // ═══════════════════════════════════════════════════════════
      // LEKTION 5: KEYWORD-RECHERCHE
      // ═══════════════════════════════════════════════════════════
      {
        id:'ppc_5',
        title:'Keyword-Recherche für PPC: Helium 10 Cerebro nutzen',
        readTime:'12 Min',
        videoId:'qSvdF8mUNv8',
        videoTitle:'PPC Kampagnen Anleitung für Anfänger (Helium 10)',
        content:[
          {intro:'Eine PPC-Kampagne ohne saubere Keyword-Recherche ist wie Geld in die Luft werfen. In dieser Lektion lernst du die wichtigsten Werkzeuge und Methoden, um die richtigen Keywords für dein Produkt zu finden – und welche du sofort ausschließen solltest. Ich zeige dir die bewährte „Cerebro-3"-Methode, die jeder ernsthafte FBA-Seller nutzt.'},

          {section:{label:'Erklärung',title:'Warum Keyword-Recherche entscheidend ist',lead:'Ohne die richtigen Keywords schaltet Amazon deine Anzeige bei den falschen Suchanfragen.'}},

          {p:'Stell dir vor, du verkaufst eine hochwertige rutschfeste Yogamatte. Wenn deine Werbung jedem Käufer angezeigt wird, der nach „Yoga" sucht, hast du ein Problem: Diese Käufer suchen vielleicht Yoga-Bücher, Yoga-Klamotten oder Online-Kurse – nicht eine Matte. Jeder Klick dieser Käufer ist verschwendetes Geld. Deshalb musst du <b>vor</b> dem Kampagnen-Start wissen, welche Begriffe deine Zielgruppe wirklich sucht – und welche du tunlichst vermeiden solltest.'},

          {p:'Die gute Nachricht: Du musst nicht raten. Es gibt professionelle Tools, die dir auf Knopfdruck zeigen, was Käufer wirklich suchen, in welchem Volumen und mit welcher Konkurrenz. Das wichtigste dieser Tools im FBA-Bereich ist Helium 10 mit den Modulen Cerebro und Magnet. In dieser Lektion zeige ich dir, wie du sie für deine PPC-Strategie nutzt.'},

          {section:{label:'Erklärung',title:'Die drei wichtigsten Keyword-Quellen',lead:'Profis kombinieren mehrere Quellen, um keine wichtigen Keywords zu übersehen.'}},

          {p:'Es gibt verschiedene Wege, an gute Keywords zu kommen. Jede Quelle hat ihren eigenen Charakter: Manche zeigen, wofür Konkurrenten ranken, andere zeigen Suchvolumen, wieder andere zeigen, was Käufer in der Suchleiste eintippen. Erfolgreiche Keyword-Recherche kombiniert alle drei Quellen – das ist der Unterschied zwischen einer guten und einer großartigen PPC-Kampagne.'},

          {steps:[
            {title:'Helium 10 Cerebro (Reverse-ASIN)',text:'Du gibst die ASIN eines Top-Konkurrenten ein. Cerebro zeigt dir ALLE Keywords, für die das Produkt rankt – inklusive Suchvolumen, Position und Schwierigkeit. Das ist die wichtigste Recherche-Methode überhaupt.'},
            {title:'Helium 10 Magnet',text:'Du gibst ein Seed-Keyword ein (z.B. „Yogamatte"). Magnet liefert hunderte verwandter Keywords mit Suchvolumen, Trends und Konkurrenz. Ideal um neue Long-Tails und Variationen zu entdecken.'},
            {title:'Amazon Auto-Suggest',text:'Geh auf amazon.de, klick in die Suchleiste, tippe dein Keyword ein und schau dir die Vorschläge an. Diese Begriffe werden NACHWEISLICH gesucht – Amazon zeigt nur die Top-Suchen. Eine kostenlose, aber wertvolle Methode.'}
          ]},

          {section:{label:'Strategie',title:'Die Cerebro-3-Methode',lead:'Eine bewährte Strategie, um die wichtigsten Pflicht-Keywords zu finden.'}},

          {p:'Die „Cerebro-3-Methode" ist eine der effektivsten Recherche-Techniken im FBA-Bereich. Die Idee dahinter: Wenn drei verschiedene Top-Konkurrenten in deiner Nische für dasselbe Keyword auf den vorderen Plätzen ranken, ist dieses Keyword <b>mit hoher Wahrscheinlichkeit relevant und profitabel</b>. Wenn du dieses Keyword nicht in deiner PPC-Kampagne hast, lässt du Geld auf der Straße liegen.'},

          {p:'Die Methode ist simpel: Du nimmst die ASINs der drei stärksten Konkurrenten in deiner Nische, gibst sie gemeinsam in Cerebro ein, und filterst die Ausgabe so, dass du nur Keywords siehst, für die <b>alle drei</b> Konkurrenten ranken. Das Ergebnis ist deine Pflicht-Keyword-Liste.'},

          {steps:[
            {title:'3 Top-ASINs identifizieren',text:'Suche auf amazon.de nach deinem Hauptkeyword. Wähle die drei stärksten Konkurrenten aus den ersten 3-5 organischen Treffern – nicht aus den gesponserten Anzeigen. Sie sollten ähnliche Preise und Features haben wie dein Produkt.'},
            {title:'In Cerebro einfügen',text:'Öffne Helium 10 Cerebro, füge die drei ASINs ein und klick auf „Get Keywords". Cerebro analysiert nun alle Keywords, für die diese drei Produkte ranken.'},
            {title:'Filter setzen',text:'Setze „Ranking Competitor" auf 3/3 (alle drei müssen ranken). „Min Search Volume" auf 500-1000 (für DE). „Position Rank" auf maximal 30. Diese Filter zeigen nur die wirklich wichtigen Keywords.'},
            {title:'Liste exportieren',text:'Die übrig gebliebenen Keywords sind dein Pflichtprogramm. Jedes davon sollte in deinem Listing UND deinen PPC-Kampagnen vorkommen. Exportiere als CSV für die weitere Verwendung.'}
          ]},

          {section:{label:'Erklärung',title:'Keyword-Kategorien verstehen',lead:'Nicht alle Keywords sind gleich. Jede Kategorie braucht eine eigene Strategie.'}},

          {p:'Sobald du eine Liste von 50-100 Keywords hast, beginnt die schwierigere Arbeit: Du musst sie kategorisieren. Verschiedene Keyword-Typen brauchen verschiedene PPC-Strategien. Ein Hauptkeyword wie „yogamatte" verhält sich völlig anders als ein Long-Tail wie „yogamatte rutschfest 6mm naturkautschuk lila". Beide sind wichtig, aber für unterschiedliche Zwecke.'},

          {table:{
            header:['Kategorie','Beispiel','PPC-Strategie'],
            rows:[
              ['Hauptkeyword','„yogamatte"','Hohes Gebot, Exact, eigene Kampagne'],
              ['Long-Tail','„yogamatte rutschfest 6mm naturkautschuk"','Niedriges Gebot, niedriger ACoS, hohe CVR'],
              ['Marken-Keyword','„liforme yogamatte"','Phrase Match, Vorsicht (rechtlich)'],
              ['Zubehör','„yogatasche"','Niedrige Priorität, nur wenn Cross-Sell'],
              ['Saisonal','„yoga geschenk weihnachten"','Saison-Kampagnen, zeitlich begrenzt']
            ]
          }},

          {section:{label:'Erklärung',title:'CPR-Wert verstehen',lead:'Helium 10 hat eine eigene Kennzahl, um die Rankbarkeit eines Keywords zu zeigen.'}},

          {p:'CPR steht für „Cerebro Product Rank". Diese Helium-10-eigene Kennzahl beantwortet eine sehr praktische Frage: <b>Wie viele Verkäufe brauchst du in 8 aufeinanderfolgenden Tagen, um auf Seite 1 für dieses Keyword zu ranken?</b> Je niedriger der CPR-Wert, desto einfacher ist das Keyword zu rangieren. Ein CPR von 30 bedeutet, du brauchst nur etwa 30 Verkäufe in 8 Tagen – machbar. Ein CPR von 500 bedeutet, du brauchst 500 Verkäufe – das ist ohne riesiges Budget kaum zu schaffen.'},

          {table:{
            header:['CPR-Wert','Schwierigkeit','Empfehlung'],
            rows:[
              ['unter 30','Einfach','Starter-Keyword, schnell rankbar'],
              ['30-100','Mittel','Mit gutem PPC machbar'],
              ['100-500','Schwer','Nur mit Budget + langfristiger Strategie'],
              ['über 500','Sehr schwer','Vermeiden, außer du hast Geduld + Geld']
            ]
          }},

          {success:'Mein Workflow für jedes neue Produkt: 1) Cerebro öffnen → 2) drei Top-Konkurrenten ASINs eingeben → 3) Filter setzen: Suchvolumen >500 und CPR <100 → 4) Top 20 in eine neue Exact-Kampagne einfügen, Rest in eine Phrase-Kampagne. Diese Methode hat sich über hunderte Launches bewährt.'},

          {tip:'Keyword-Recherche ist <b>kein einmaliges Event</b>. Mache sie alle 6 Wochen neu. Trends verschieben sich, neue Keywords tauchen auf, alte sterben aus. Die Marken, die langfristig dominieren, halten ihre Keyword-Listen kontinuierlich aktuell – nicht statisch.'}
        ]
      },

      // ═══════════════════════════════════════════════════════════
      // LEKTION 6: BIDDING
      // ═══════════════════════════════════════════════════════════
      {
        id:'ppc_6',
        title:'Gebote richtig setzen: Strategien & CPC verstehen',
        readTime:'11 Min',
        videoId:'kSgGFI7uqTM',
        videoTitle:'Amazon PPC Kampagne erstellen + optimieren',
        content:[
          {intro:'Wann gewinnst du in der Amazon-Werbe-Auktion – und wie viel zahlst du wirklich pro Klick? Diese Lektion klärt das Mysterium hinter den Geboten. Du lernst, was wirklich passiert, wenn du ein Gebot abgibst, welche Gebot-Strategien Amazon anbietet und welche du wann einsetzen solltest. Falsche Gebote sind einer der Top-Gründe, warum PPC-Kampagnen ineffizient sind.'},

          {section:{label:'Erklärung',title:'Was ist der CPC – und warum ist er nicht dein Gebot?',lead:'Eine der am meisten missverstandenen Tatsachen im PPC.'}},

          {p:'Anfänger glauben oft: „Wenn ich 1,00 € biete, zahle ich 1,00 € pro Klick." Das ist falsch. <b>Der CPC (Cost-per-Click) ist nicht dein Gebot, sondern der tatsächlich bezahlte Preis pro Klick.</b> Diese beiden Werte sind fast nie gleich. Amazon nutzt eine sogenannte „Vickrey-Auktion" – auch Zweitpreis-Auktion genannt. Das bedeutet: Du zahlst nicht dein eigenes Gebot, sondern <b>nur 1 Cent mehr als der zweithöchste Bieter</b>.'},

          {p:'Das ist ein riesiger Vorteil für dich: Wenn du ein Keyword unbedingt haben willst und dafür bis zu 2,00 € bietest, der nächste Bieter aber nur 0,75 € bietet, zahlst du tatsächlich nur 0,76 € pro Klick. Dein 2,00-€-Gebot war nur die Schmerzgrenze – du musstest sie nie ausreizen. Das Gebot ist also deine <b>maximale Bereitschaft zu zahlen</b>, nicht der tatsächliche Preis.'},

          {h2:'Praktisches Beispiel'},
          {example:'Du bietest 1,00 € für das Keyword „yogamatte". Der nächste Bieter bietet 0,65 €.<br><br>→ Du zahlst <b>0,66 €</b> pro Klick – nicht 1,00 €.<br><br>Wenn du das Keyword 30 Mal pro Tag gewinnst, sind das 30 × 0,66 € = 19,80 € pro Tag – nicht 30,00 €. Diese Mathematik ist der Grund, warum aggressive Gebote bei wichtigen Keywords oft sinnvoll sind: Du sicherst dir Position 1, ohne dafür den Maximalpreis zu zahlen.'},

          {section:{label:'Erklärung',title:'Die drei Gebots-Strategien von Amazon',lead:'Amazon bietet dir drei verschiedene Modi – jeder mit eigenen Risiken und Chancen.'}},

          {p:'Wenn du eine Kampagne erstellst, musst du dich für eine von drei Gebots-Strategien entscheiden. Diese Wahl hat enormen Einfluss auf deine Performance, aber viele Anfänger klicken hier blind durch. Verstehe genau, was jede Strategie bedeutet, bevor du sie wählst.'},

          {table:{
            header:['Strategie','Wann nutzen','Risiko'],
            rows:[
              ['Dynamisch – nur senken','Standard für Anfänger, Auto-Kampagnen, Tests','Niedrig'],
              ['Dynamisch – erhöhen und senken','Etablierte Kampagne mit guter CVR (>10%)','Hoch (Gebot kann +100% steigen)'],
              ['Feste Gebote','Du willst exakte Kontrolle, Daten-Tests','Mittel']
            ]
          }},

          {h2:'Dynamisch – nur senken'},
          {p:'Diese Einstellung ist die <b>sicherste Wahl für Anfänger</b>. Amazon darf dein Gebot in Echtzeit reduzieren, wenn der Algorithmus erkennt, dass ein Klick wahrscheinlich nicht zum Verkauf führt – aber niemals erhöhen. Im schlimmsten Fall zahlst du dein angegebenes Gebot, oft aber weniger. Dein Risiko ist minimal, deine Kontrolle hoch. Für 90 % aller neuen Verkäufer ist dies die richtige Wahl.'},

          {h2:'Dynamisch – erhöhen und senken'},
          {p:'Diese Einstellung erlaubt Amazon, dein Gebot um <b>bis zu 100 % zu erhöhen</b>, wenn der Algorithmus glaubt, dass ein Klick mit hoher Wahrscheinlichkeit zum Verkauf führt. Das klingt erstmal toll – aber es ist eine zweischneidige Klinge. Aus geplanten 0,50 € können plötzlich 1,00 € werden. Bei 50 Klicks pro Tag macht das 25 € Mehrkosten aus – ohne dass du es im Detail bemerkst. Diese Einstellung ist nur sinnvoll, wenn du bereits eine erprobte CVR von über 10 % hast.'},

          {h2:'Feste Gebote'},
          {p:'Bei festen Geboten zahlst du immer genau dein Gebot, egal ob ein Klick wahrscheinlich konvertiert oder nicht. Du behältst volle Kontrolle, verzichtest aber auf Amazons Algorithmus-Optimierung. Diese Einstellung ist gut für Daten-Tests und Forschungs-Kampagnen mit niedrigen Geboten – aber selten optimal für laufende Performance-Kampagnen.'},

          {warning:'„Dynamisch – erhöhen und senken" ist eine Falle für Anfänger. Amazon darf das Gebot bis zu 100 % erhöhen. Aus 0,50 € werden plötzlich 1,00 €. Bei 50 Klicks/Tag = 25 € statt 12,50 € Mehrkosten – pro Tag! Erst wenn deine Kampagne stabil läuft und eine CVR über 10 % hat, lohnt sich diese Strategie.'},

          {section:{label:'Erklärung',title:'Platzierungs-Anpassungen – mehr Kontrolle wagen',lead:'Amazon zeigt deine Anzeige an drei verschiedenen Stellen. Du kannst für jede einen eigenen Bonus festlegen.'}},

          {p:'Innerhalb deiner Kampagne hast du eine sehr mächtige zusätzliche Einstellung: die „Platzierungs-Anpassungen". Du kannst Amazon sagen: „Erhöhe mein Gebot um X % für bestimmte Platzierungen." Es gibt drei Platzierungs-Typen, die jeweils unterschiedlich performen. Mit diesem Wissen kannst du gezielter steuern, wo dein Werbe-Euro am meisten Wirkung hat.'},

          {l:[
            '<b>Top of Search (Seite 1):</b> Die obersten Anzeigen-Plätze auf der Suchergebnisseite. Höchste CTR, höchste CVR – aber teuer. Hier sind die kaufbereitesten Käufer.',
            '<b>Rest of Search:</b> Anzeigen weiter unten in den Suchergebnissen oder auf Seite 2 und folgenden. Günstiger, aber niedrigere Performance. Hier surfen oft noch unentschlossene Käufer.',
            '<b>Product Pages:</b> Anzeigen auf anderen Produktdetailseiten – also direkt bei der Konkurrenz. Mittlere Performance, sehr abhängig vom Match-Type.'
          ]},

          {success:'Anfänger-Faustregel: Lass die ersten 4 Wochen ohne Platzierungs-Bonus laufen, um Vergleichsdaten zu sammeln. Dann: Wenn der Top-of-Search-ACoS niedriger ist als der durchschnittliche ACoS, setze einen Bonus von 25-50 % auf Top-of-Search. Diese Optimierung skaliert oft drastisch die Verkäufe – ohne dass die Profitabilität leidet.'},

          {section:{label:'Strategie',title:'Wann erhöhst du Gebote? Wann senkst du?',lead:'Die Entscheidungs-Regeln, nach denen Profis ihre Gebote anpassen.'}},

          {p:'Gebote anpassen ist eine Wissenschaft für sich. Aber im Kern folgen Profis einigen einfachen Regeln. Diese Regeln helfen dir, in der Optimierungs-Phase nicht nach Bauchgefühl zu entscheiden, sondern nach klaren Kriterien.'},

          {steps:[
            {title:'Gebot ERHÖHEN um 10-15 %',text:'Wenn ein Keyword einen ACoS deutlich unter deinem Ziel-ACoS hat UND weniger als 1.000 Impressionen erzielt, hast du noch Potenzial nach oben. Erhöhe das Gebot um 10-15 % und beobachte eine Woche.'},
            {title:'Gebot SENKEN um 10-15 %',text:'Wenn ein Keyword einen ACoS über deinem Ziel-ACoS hat UND mindestens 30 Klicks gesammelt sind (statistische Signifikanz), senke das Gebot um 10-15 %. Niemals stärker – das schockt den Algorithmus.'},
            {title:'Keyword PAUSIEREN',text:'Wenn ein Keyword 30+ Klicks ohne einen einzigen Verkauf hat, pausiere es. Es verbrennt nur Budget. Eine Pause ist reversibel – du kannst es später erneut probieren.'},
            {title:'Keyword AUSSCHLIESSEN (negativ)',text:'Wenn ein Suchbegriff aus dem Suchbegriffsbericht thematisch überhaupt nicht zu deinem Produkt passt, schließe ihn als „Negative Exact" aus. So tauchen ähnliche Suchen nie wieder auf.'}
          ]},

          {tip:'Wichtige Regel: Ändere niemals mehr als 15 % pro Optimierung. Größere Sprünge schocken den Amazon-Algorithmus, der dann nicht mehr richtig lernen kann. Lieber wöchentlich kleine Schritte gehen. Diese Geduld zahlt sich nach 3-6 Monaten in Form von stabilen, profitablen Kampagnen aus.'},

          {section:{label:'Referenz',title:'Realistische CPC-Werte nach Kategorie',lead:'Damit du weißt, ob deine Gebote im Rahmen sind.'}},

          {p:'Eine häufige Frage: „Wie viel sollte ich pro Klick zahlen?" Die Antwort hängt stark von der Kategorie ab. Hier sind realistische CPC-Werte für den deutschen Amazon-Markt, basierend auf Daten verschiedener FBA-Coaches und Agenturen. Diese Werte sind Mittelwerte – einzelne Keywords können deutlich höher oder niedriger liegen.'},

          {table:{
            header:['Kategorie','Typischer CPC DE','Anmerkung'],
            rows:[
              ['Küche & Haushalt','0,40 – 0,80 €','Mittlere Konkurrenz, viele kleine Marken'],
              ['Sport & Fitness','0,50 – 1,20 €','Saisonal stark schwankend (Januar-Spike!)'],
              ['Beauty & Pflege','0,60 – 1,50 €','Hohe Konkurrenz, viele etablierte Marken'],
              ['Bürobedarf','0,30 – 0,60 €','Niedrige Konkurrenz, niedrigere Margen'],
              ['Garten & Outdoor','0,35 – 0,90 €','Saisonal extrem (Frühjahr Peak)'],
              ['Elektronik-Zubehör','0,80 – 2,00 €','Sehr hohe Konkurrenz, viele Markenartikel']
            ]
          }}
        ]
      },

      // ═══════════════════════════════════════════════════════════
      // LEKTION 7: WÖCHENTLICHE OPTIMIERUNG
      // ═══════════════════════════════════════════════════════════
      {
        id:'ppc_7',
        title:'Wöchentliche Optimierung: Die Routine eines Profis',
        readTime:'10 Min',
        videoId:'CFo2XLXFgY8',
        videoTitle:'Amazon PPC Optimierung – FBA Unstoppable',
        content:[
          {intro:'Eine PPC-Kampagne ist niemals „fertig". Sie braucht kontinuierliche Pflege – aber nicht hektisches Eingreifen. In dieser Lektion zeige ich dir die wöchentliche 30-Minuten-Routine, mit der erfolgreiche FBA-Verkäufer ihre Kampagnen am Laufen halten. Mehr braucht es nicht – aber weniger auch nicht.'},

          {section:{label:'Strategie',title:'Die 30-Minuten-Wochen-Routine',lead:'Profis optimieren einmal pro Woche – nicht täglich. Hier ist warum, und wie.'}},

          {p:'Einer der häufigsten Fehler von Anfängern ist das tägliche Mikromanagement der Kampagnen. „Heute hat eine Kampagne 5 € verbrannt und nur 1 Verkauf gebracht – ich muss das Gebot senken!" Solche Reaktionen sind kontraproduktiv. Tagesdaten sind statistisch nicht aussagekräftig genug. Erst wenn du mindestens 7-14 Tage Daten hast, sind Trends erkennbar. Wer täglich eingreift, stört die Lernphase des Amazon-Algorithmus.'},

          {p:'Die bewährte Routine erfolgreicher Verkäufer ist eine wöchentliche 30-Minuten-Session. Idealerweise immer am gleichen Wochentag und zur gleichen Uhrzeit – das schafft Routine und Disziplin. In dieser Session arbeitest du systematisch sechs Schritte ab. Klingt simpel, ist aber das Geheimnis hinter konstant profitablen Kampagnen.'},

          {steps:[
            {title:'1. Suchbegriffsbericht herunterladen (5 Min)',text:'Werbung → Berichte → „Suchbegriff (Sponsored Products)". Wähle die letzten 14 Tage als Zeitraum. Sortiere absteigend nach Klicks. Markiere visuell auffällige Suchbegriffe.'},
            {title:'2. Keywords mit hohem ACoS senken (5 Min)',text:'Alle Keywords mit einem ACoS > 130 % deines Ziel-ACoS bekommen eine Gebotssenkung um 10-15 %. Größer keine Sprünge – das schockt den Algorithmus.'},
            {title:'3. Keywords mit niedrigem ACoS pushen (5 Min)',text:'Alle Keywords mit ACoS < 70 % deines Ziel-ACoS UND weniger als 2.000 Impressionen bekommen eine Gebotserhöhung um 10-15 %. Hier hast du Wachstumspotenzial.'},
            {title:'4. Negative Keywords pflegen (5 Min)',text:'Suchbegriffe mit 10+ Klicks ohne Verkauf werden als Negative Exact ausgeschlossen. Das spart sofort Budget und verbessert die Performance.'},
            {title:'5. Harvesting durchführen (5 Min)',text:'Die Top-Suchbegriffe aus deiner Auto-Kampagne werden in die manuelle Exact-Kampagne übernommen. Gleichzeitig werden sie in der Auto-Kampagne als Negative Exact ausgeschlossen.'},
            {title:'6. Budget-Check (5 Min)',text:'Welche Kampagne läuft täglich aus dem Budget heraus? → Budget um 20 % erhöhen. Welche schöpft das Budget nicht aus? → Gebote prüfen, vielleicht zu niedrig.'}
          ]},

          {section:{label:'Wichtig zu wissen',title:'Die 5 häufigsten Anfänger-Fehler',lead:'Diese Fehler sehe ich bei fast jeder neuen PPC-Kampagne. Vermeide sie.'}},

          {p:'Aus hunderten betreuten Kampagnen kenne ich die immer gleichen Anfänger-Fehler. Sie kosten zusammen oft 200-500 € im ersten Monat – Geld, das du dir sparen kannst, wenn du sie kennst und vermeidest.'},

          {warning:'<b>Fehler 1:</b> Auto-Kampagne ohne Negative-Liste laufen lassen. Das führt zu Budget-Burn auf irrelevante Suchbegriffe.<br><br><b>Fehler 2:</b> Zu schnell Gebote anpassen (täglich). Der Algorithmus kann nicht lernen.<br><br><b>Fehler 3:</b> Nur ACoS angucken statt TACoS. Du übersiehst, ob deine Marke wirklich wächst.<br><br><b>Fehler 4:</b> Bei Top-Keywords zu niedrig bieten. Konkurrenz übernimmt Platz 1, deine CTR sinkt, deine CPCs steigen.<br><br><b>Fehler 5:</b> Kampagnen-Wildwuchs ohne klare Struktur. Mit 20+ ungeordneten Kampagnen ist eine sinnvolle Auswertung unmöglich.'},

          {section:{label:'Strategie',title:'Die Profi-Kampagnenstruktur',lead:'Statt einer großen Kampagne baust du fünf kleine, klar abgegrenzte Kampagnen.'}},

          {p:'Klingt nach mehr Arbeit, ist aber einfacher in der Verwaltung: Statt einer großen Auto-Kampagne baust du pro Produkt eine 5-Kampagnen-Struktur. Jede Kampagne hat einen klaren, einzigartigen Zweck. So weißt du jederzeit, welche Kampagne welche Aufgabe hat – und welche Optimierung wo greift. Diese Struktur ist Standard bei professionellen FBA-Sellern.'},

          {l:[
            '<b>1× Auto-Kampagne (Discovery):</b> Standard-Gebot, „Dynamisch nur senken", findet kontinuierlich neue Keywords',
            '<b>1× Exact-Kampagne (Performance):</b> Top-Performer aus Auto. Hohe Gebote. Niedriger ACoS. Dein „Cash Cow"-Bereich',
            '<b>1× Phrase-Kampagne (Skalierung):</b> Für Variationen der Top-Performer. Mittleres Gebot, mittlere ACoS-Toleranz',
            '<b>1× Broad-Kampagne (Research):</b> Niedriges Gebot, breit gestreut, sucht neue Long-Tails und Synonyme',
            '<b>Optional: Defensiv-Kampagne:</b> Eigene Marken-Keywords, schützt vor Markenklau durch Konkurrenz'
          ]},

          {success:'Profi-Tipp: Diese 5 Kampagnen pro Produkt klingen nach viel, sind aber einfacher zu verwalten als eine große Mischkampagne. Jede Kampagne hat einen klaren Zweck → Optimierung wird zum Routine-Job. Mit klarer Struktur ist die wöchentliche 30-Minuten-Session leicht zu schaffen.'},

          {section:{label:'Strategie',title:'Wann skalierst du? Wann ist es Zeit für mehr Budget?',lead:'Skalieren ohne Plan ist gefährlich. Hier sind die Entscheidungs-Kriterien.'}},

          {p:'„Wann gebe ich mehr Geld aus?" ist die Frage, die jeder erfolgreiche Verkäufer irgendwann stellt. Das Skalieren von PPC ist eine Kunst für sich – zu früh skaliert führt zu Verlusten, zu spät skaliert lässt Geld auf der Straße liegen. Profis nutzen klare Signale, um den richtigen Moment zu erkennen.'},

          {steps:[
            {title:'Wenn ACoS stabil unter Ziel ist',text:'Mindestens 4 Wochen lang konsistent unter Break-Even-ACoS. Stabilität ist wichtiger als ein einzelner Best-Wert.'},
            {title:'Wenn Budget vor Mittag aufgebraucht ist',text:'Wenn deine Kampagne täglich vor 12 Uhr ihr Budget aufgebraucht hat, siehen die nachmittäglichen Käufer dich nicht. Klares Skalierungssignal.'},
            {title:'Schritt-für-Schritt erhöhen',text:'+20 % pro Woche, niemals verdoppeln. Der Algorithmus muss lernen können. Aus 20 € Tagesbudget werden so in 4 Wochen 40 € – nicht 80 € auf einmal.'}
          ]},

          {tip:'Erstelle dir ein Tracking-Spreadsheet: Datum, Kampagne, alte Gebote, neue Gebote, Grund. Nach 3 Monaten siehst du Muster, was bei DEINEN Produkten funktioniert. Diese eigenen Daten sind Gold wert – kein Coaching der Welt ersetzt sie.'}
        ]
      },

      // ═══════════════════════════════════════════════════════════
      // LEKTION 8: SPONSORED BRANDS & DISPLAY
      // ═══════════════════════════════════════════════════════════
      {
        id:'ppc_8',
        title:'Sponsored Brands & Display: die nächste Stufe',
        readTime:'10 Min',
        videoId:'ddj3Qs5wSO8',
        videoTitle:'Die ultimative Helium 10 Anleitung – Komplettkurs Deutsch',
        content:[
          {intro:'Sponsored Products ist die Pflichtveranstaltung im PPC. Sponsored Brands und Sponsored Display sind die Kür. In dieser Lektion lernst du, wann es Zeit ist, deinen PPC-Mix um diese beiden Formate zu erweitern – und wie du sie strategisch einsetzt, um deine Marke aufzubauen und Konkurrenz abzuwehren.'},

          {section:{label:'Erklärung',title:'Wann ist Zeit für SB und SD?',lead:'Erst wenn diese Voraussetzungen erfüllt sind, lohnt sich die Erweiterung.'}},

          {p:'Sponsored Brands (SB) und Sponsored Display (SD) sind nicht für jeden Verkäufer geeignet. Sie machen erst dann Sinn, wenn du eine solide Basis mit Sponsored Products geschaffen hast. Wer zu früh in SB oder SD investiert, verschwendet Geld – die Formate brauchen ein gewisses Volumen, um effizient zu funktionieren. Hier sind die klaren Voraussetzungen, an denen du dich orientieren solltest.'},

          {l:[
            '<b>✅ Du hast eine eingetragene Marke (Brand Registry).</b> Ohne Marken-Registrierung kannst du SB überhaupt nicht nutzen.',
            '<b>✅ Du hast mindestens 3-5 Produkte in deiner Marke.</b> SB ist erst sinnvoll, wenn du mehrere Produkte gleichzeitig bewerben kannst.',
            '<b>✅ SP läuft stabil mit ACoS unter Ziel.</b> Wenn deine SP-Kampagnen noch nicht laufen, baust du auf wackligem Fundament.',
            '<b>✅ Du hast monatliches Werbebudget von mindestens 500-1.000 €.</b> Mit weniger Budget bringen SB und SD nicht genug Datenvolumen für sinnvolle Optimierung.'
          ]},

          {section:{label:'Erklärung',title:'Sponsored Brands – die Marken-Banner',lead:'Sponsored Brands sind die einzigen Anzeigen, die das Branding-Element ins Spiel bringen.'}},

          {p:'Sponsored Brands erscheinen ganz oben in den Amazon-Suchergebnissen als Banner mit deinem Markenlogo und bis zu drei Produkten. Sie sind das einzige Werbeformat, mit dem du wirklich Markenbekanntheit aufbauen kannst – während Sponsored Products primär einzelne Produkte verkauft, baut SB die <b>Marke als Ganzes</b> auf. Das ist langfristig extrem wertvoll, weil eine starke Marke höhere Preise und niedrigere Werbekosten ermöglicht.'},

          {compare:{
            leftTitle:'✅ Vorteile SB',
            left:'• Premium-Platzierung (Top der Suche)<br>• Markenbekanntheit aufbauen<br>• Cross-Sell zwischen eigenen Produkten<br>• Eigene Brand-Store-Landingpage<br>• Niedrigerer durchschnittlicher CPC als SP',
            rightTitle:'⚠️ Nachteile SB',
            right:'• Erfordert Markenregistrierung<br>• Weniger Klicks als SP (kleineres Volumen)<br>• Aufwendigere Creative-Erstellung<br>• Funktioniert nur mit ≥3 Produkten<br>• Schwerer zu optimieren'
          }},

          {h2:'Die drei SB-Formate'},
          {p:'Innerhalb der Sponsored Brands gibt es drei verschiedene Banner-Formate, die du wählen kannst. Jedes Format hat seine eigenen Stärken und Einsatzgebiete. Profis testen oft mehrere Formate parallel, um zu sehen, was bei ihrer Zielgruppe am besten funktioniert.'},

          {l:[
            '<b>Sponsored Brands Banner:</b> Logo + 3 Produkte als Header. Klassisches Format, einfach zu erstellen.',
            '<b>Sponsored Brands Video:</b> 6-45 Sekunden Video mit Produkt in Aktion. <b>Höchste CTR aller Amazon-Anzeigen-Formate.</b> Mein Favorit.',
            '<b>Sponsored Brands Spotlight:</b> Custom Lifestyle-Bild plus 3 Produkte. Ideal für Brand-Storytelling.'
          ]},

          {success:'SB Video schlägt fast immer SB Banner. Selbst ein 6-Sekunden-Video aus deinem A+ Content kann die CTR im Vergleich zum statischen Banner verdoppeln. Die zusätzliche Erstellungs-Investition lohnt sich fast immer.'},

          {section:{label:'Erklärung',title:'Sponsored Display – das Retargeting-Tool',lead:'Mit SD erreichst du Käufer, die schon bei der Konkurrenz waren – aber nicht gekauft haben.'}},

          {p:'Sponsored Display ist Amazons Retargeting-Tool. Es zeigt dein Produkt Käufern, die ähnliche Produkte angeschaut, aber nicht gekauft haben. Das Besondere: SD wirkt nicht nur auf Amazon selbst, sondern auch auf <b>Drittseiten</b> wie News-Portalen, Blogs und Apps. Damit kannst du potenzielle Kunden auch dann erreichen, wenn sie gerade nicht aktiv auf Amazon shoppen.'},

          {h2:'Die zwei SD-Strategien'},
          {p:'Bei Sponsored Display kannst du zwischen zwei grundlegenden Targeting-Arten wählen. Beide haben ihre Berechtigung, und Profis nutzen oft beide parallel.'},

          {l:[
            '<b>Zielgruppen-Targeting (Audience):</b> Kunden, die Konkurrenz-Produkte angeschaut, aber nicht gekauft haben. Ideal um Markt-Anteile zu gewinnen.',
            '<b>Produkt-Targeting (Product):</b> Deine Anzeige erscheint direkt auf der Detailseite einer Konkurrenz-ASIN. Aggressive „Klau-Strategie".'
          ]},

          {warning:'SD-Produkt-Targeting auf Konkurrenten ist effektiv – aber Konkurrenz macht das auch mit dir. Setze unbedingt eine <b>Defensiv-Kampagne</b> auf, die deine eigenen ASINs als Ziel hat. So schützt du deine Detailseiten vor fremden „Klau-Anzeigen".'},

          {h2:'Praktisches Beispiel'},
          {example:'Du verkaufst Yogamatten. Mit SD-Audience zielst du auf „Käufer, die in den letzten 30 Tagen Yogamatten angeschaut, aber nicht gekauft haben". Diese Personen sind im aktiven Kauf-Modus, wissen schon, was sie wollen, sind aber noch unentschlossen. Deine CVR auf diese Zielgruppe ist deutlich höher als bei kalter Reichweite – oft 3-5 Mal höher.'},

          {tip:'Mein Budget-Mix für etablierte Marken: <b>70% SP / 20% SB / 10% SD.</b> SP bleibt das Arbeitspferd, SB baut die Marke, SD holt die Unentschlossenen ab. Diese Verteilung hat sich über viele Marken hinweg bewährt – aber justiere sie an deine konkrete Situation an.'}
        ]
      },

      // ═══════════════════════════════════════════════════════════
      // LEKTION 9: PROFI-KAMPAGNENSTRUKTUR
      // ═══════════════════════════════════════════════════════════
      {
        id:'ppc_9',
        title:'Profi-Kampagnenstruktur: Skalieren ohne Kontrollverlust',
        readTime:'12 Min',
        videoId:'i0jenf0Xp1I',
        videoTitle:'Amazon PPC Kampagnenstruktur – Erstelle in 5 Schritten',
        content:[
          {intro:'Mit einem einzigen Produkt kannst du PPC noch chaotisch managen – mit einer einzigen Mischkampagne. Aber sobald du mehrere Produkte hast oder dein Budget skalierst, brauchst du eine klare Struktur. In dieser Lektion lernst du die bewährte Profi-Architektur, mit der ernsthafte FBA-Verkäufer hunderte Kampagnen managen, ohne den Überblick zu verlieren.'},

          {section:{label:'Erklärung',title:'Warum Struktur alles ist',lead:'Ohne Plan wird PPC mit jedem neuen Produkt komplexer und unkontrollierbarer.'}},

          {p:'Bei einem einzigen Produkt mit zwei Kampagnen lässt sich PPC noch ohne System steuern. Du erkennst auf einen Blick, was funktioniert und was nicht. Aber ich habe Verkäufer gesehen, die mit 50 Kampagnen ohne klare Namensgebung in einem totalen Chaos versanken. Sie wussten nicht mehr, welche Kampagne welche Aufgabe hatte, welches Keyword in welcher Kampagne lief, und ob bestimmte Keywords vielleicht in mehreren Kampagnen mit unterschiedlichen Geboten konkurrierten.'},

          {p:'Eine durchdachte Kampagnen-Struktur löst dieses Problem. Sie ermöglicht dir, hunderte von Kampagnen sauber zu managen. Sie macht Optimierung zur Routine. Und sie macht es einfach, neue Mitarbeiter oder Agenturen einzuarbeiten, falls du je dahin skalieren willst. Die Investition in eine saubere Struktur zahlt sich tausendfach aus.'},

          {section:{label:'Struktur',title:'Das „1 ASIN, 5 Kampagnen"-Prinzip',lead:'Pro Produkt baust du fünf Kampagnen mit klar getrennten Aufgaben.'}},

          {p:'Die Profi-Struktur, die sich über Jahre bewährt hat, ist das „1 ASIN, 5 Kampagnen"-Prinzip. Pro Produkt erstellst du fünf Kampagnen mit jeweils einer klar definierten Funktion. Klingt nach mehr Arbeit – ist aber tatsächlich einfacher zu managen als wilde Mischformen, weil jede Kampagne nur einen Zweck hat.'},

          {image:'<svg viewBox="0 0 500 280" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:500px;height:auto"><rect x="0" y="0" width="500" height="280" fill="#f1f4f9" rx="8"/><rect x="200" y="20" width="100" height="40" fill="#fef3c7" stroke="#d97706" stroke-width="2" rx="6"/><text x="250" y="38" text-anchor="middle" font-family="DM Sans" font-size="11" font-weight="700" fill="#92400e">📦 ASIN</text><text x="250" y="52" text-anchor="middle" font-family="DM Sans" font-size="9" fill="#92400e">Yogamatte 6mm</text><line x1="250" y1="60" x2="80" y2="100" stroke="#94a3b8" stroke-width="1"/><line x1="250" y1="60" x2="180" y2="100" stroke="#94a3b8" stroke-width="1"/><line x1="250" y1="60" x2="280" y2="100" stroke="#94a3b8" stroke-width="1"/><line x1="250" y1="60" x2="380" y2="100" stroke="#94a3b8" stroke-width="1"/><line x1="250" y1="60" x2="450" y2="100" stroke="#94a3b8" stroke-width="1"/><rect x="20" y="100" width="120" height="80" fill="#dbeafe" stroke="#1d4ed8" rx="6"/><text x="80" y="120" text-anchor="middle" font-family="DM Sans" font-size="11" font-weight="700" fill="#1d4ed8">🤖 AUTO</text><text x="80" y="138" text-anchor="middle" font-family="DM Sans" font-size="9" fill="#475066">Discovery</text><text x="80" y="152" text-anchor="middle" font-family="DM Sans" font-size="8" fill="#475066">Findet neue KW</text><text x="80" y="170" text-anchor="middle" font-family="DM Sans" font-size="8" fill="#1d4ed8" font-weight="600">Budget: 20%</text><rect x="150" y="100" width="120" height="80" fill="#d1fae5" stroke="#059669" rx="6"/><text x="210" y="120" text-anchor="middle" font-family="DM Sans" font-size="11" font-weight="700" fill="#059669">🎯 EXACT</text><text x="210" y="138" text-anchor="middle" font-family="DM Sans" font-size="9" fill="#475066">Performance</text><text x="210" y="152" text-anchor="middle" font-family="DM Sans" font-size="8" fill="#475066">Top-Keywords</text><text x="210" y="170" text-anchor="middle" font-family="DM Sans" font-size="8" fill="#059669" font-weight="600">Budget: 40%</text><rect x="280" y="100" width="100" height="80" fill="#fed7aa" stroke="#ea580c" rx="6"/><text x="330" y="120" text-anchor="middle" font-family="DM Sans" font-size="11" font-weight="700" fill="#c2410c">📊 PHRASE</text><text x="330" y="138" text-anchor="middle" font-family="DM Sans" font-size="9" fill="#475066">Skalierung</text><text x="330" y="152" text-anchor="middle" font-family="DM Sans" font-size="8" fill="#475066">Variationen</text><text x="330" y="170" text-anchor="middle" font-family="DM Sans" font-size="8" fill="#c2410c" font-weight="600">Budget: 25%</text><rect x="390" y="100" width="90" height="80" fill="#e9d5ff" stroke="#7e22ce" rx="6"/><text x="435" y="120" text-anchor="middle" font-family="DM Sans" font-size="11" font-weight="700" fill="#6d28d9">🌐 BROAD</text><text x="435" y="138" text-anchor="middle" font-family="DM Sans" font-size="9" fill="#475066">Research</text><text x="435" y="152" text-anchor="middle" font-family="DM Sans" font-size="8" fill="#475066">Long-Tails</text><text x="435" y="170" text-anchor="middle" font-family="DM Sans" font-size="8" fill="#6d28d9" font-weight="600">Budget: 10%</text><rect x="170" y="200" width="160" height="60" fill="#fce7f3" stroke="#be185d" rx="6"/><text x="250" y="220" text-anchor="middle" font-family="DM Sans" font-size="11" font-weight="700" fill="#be185d">🛡️ DEFENSIV</text><text x="250" y="238" text-anchor="middle" font-family="DM Sans" font-size="9" fill="#475066">Eigene Marke + ASIN</text><text x="250" y="252" text-anchor="middle" font-family="DM Sans" font-size="8" fill="#be185d" font-weight="600">Budget: 5%</text></svg>',caption:'Profi-Struktur pro Produkt: 5 Kampagnen mit klar definierten Aufgaben.'},

          {h2:'Die detaillierte Konfiguration jeder Kampagne'},
          {p:'Jede der fünf Kampagnen hat ihre eigenen optimalen Einstellungen. Hier ist die Tabelle, an der ich mich für jede neue Produkt-Struktur orientiere.'},

          {table:{
            header:['Kampagne','Match-Type','Gebot-Strategie','Ziel-ACoS','Budget %'],
            rows:[
              ['AUTO Discovery','Auto','Dyn. nur senken','Break-Even','20%'],
              ['EXACT Performance','Exact','Dyn. erhöhen+senken','12-18%','40%'],
              ['PHRASE Variations','Phrase','Dyn. nur senken','20-25%','25%'],
              ['BROAD Research','Broad','Feste Gebote (niedrig)','30%+','10%'],
              ['DEFENSIV Marken','Exact','Dyn. nur senken','<10%','5%']
            ]
          }},

          {section:{label:'Praxis',title:'Naming Convention – konsistent benennen',lead:'Klare Namen sind 50 % der Optimierung. Hier ist mein bewährtes Schema.'}},

          {p:'Eine konsistente Namensgebung ist absolut entscheidend, sobald du mehrere Produkte hast. Mit klaren Namen findest du jede Kampagne in Sekunden. Ohne klare Namen verbringst du Stunden mit Suchen und versehentlichen Doppelarbeit. Hier ist das Schema, das ich seit Jahren nutze.'},

          {formula:'Format: [PRODUKT]_[TYP]_[MATCH]_[MARKT]',formulaTitle:'Naming-Schema'},

          {h2:'Praktisches Beispiel'},
          {example:'<b>Yogamatte_AUTO_DE</b> → Auto-Kampagne, deutscher Markt<br><b>Yogamatte_EXACT_Hauptkw_DE</b> → Manuelle Exact für Hauptkeywords<br><b>Yogamatte_PHRASE_LongTail_DE</b> → Phrase für Long-Tail-Variationen<br><b>Yogamatte_DEFENSIV_Markenname_DE</b> → Defensiv-Kampagne auf eigene Markennamen<br><br>Mit diesem Schema findest du jede Kampagne durch Sortieren oder Filtern. Du siehst auf einen Blick, welche Produkte welche Kampagnen-Typen haben.'},

          {section:{label:'Erklärung',title:'Anzeigengruppen-Struktur',lead:'Innerhalb einer Kampagne kannst du Keywords thematisch clustern.'}},

          {p:'Neben den Kampagnen selbst gibt es noch eine zweite Strukturebene: die Anzeigengruppen. Innerhalb einer Kampagne kannst du mehrere Anzeigengruppen anlegen, um Keywords thematisch zu clustern. Das ist besonders nützlich bei Variationsprodukten oder wenn du verschiedene Keyword-Themen in einer Kampagne bündeln willst.'},

          {l:[
            '<b>Eine Anzeigengruppe = ein Keyword-Cluster</b> (z.B. alle Material-Keywords „naturkautschuk", „kork", „TPE")',
            '<b>Eine Anzeigengruppe = ein Match-Type</b> (z.B. nur Phrase-Keywords in einer Phrase-Kampagne)',
            '<b>Eine Anzeigengruppe = ein Produkt</b> (für Multi-Variant-ASINs mit verschiedenen Größen oder Farben)'
          ]},

          {success:'Mein bewährtes Setup für 1 Produkt: 5 Kampagnen, je 1-3 Anzeigengruppen, je 5-15 Keywords pro Anzeigengruppe. Klein und kontrollierbar – nicht überladen. Diese Größenordnung ist auch in der wöchentlichen 30-Min-Routine gut zu schaffen.'},

          {warning:'Anti-Pattern: 1 Mega-Kampagne mit 200 Keywords gemischt. Du kannst nicht erkennen, welches Keyword performt – also kannst du nicht optimieren. Solche Kampagnen sind wie ein Auto ohne Tacho – du fährst, weißt aber nicht wohin.'}
        ]
      },

      // ═══════════════════════════════════════════════════════════
      // LEKTION 10: TOOLS & AUTOMATISIERUNG
      // ═══════════════════════════════════════════════════════════
      {
        id:'ppc_10',
        title:'PPC-Tools & Automatisierung: Wann lohnt sich was?',
        readTime:'9 Min',
        videoId:'qSvdF8mUNv8',
        videoTitle:'Helium 10 Adtomic – PPC Automatisierung',
        content:[
          {intro:'PPC-Tools versprechen viel: weniger Arbeit, bessere Performance, automatische Optimierung. Aber lohnen sie sich wirklich? Und wann? In dieser Abschluss-Lektion lernst du, wann du Tools brauchst, welche es gibt und worauf du achten solltest. Und genauso wichtig: Was du auch weiterhin manuell machen solltest.'},

          {section:{label:'Erklärung',title:'Wann brauchst du Tools?',lead:'Nicht jeder braucht teure Software. Hier ist die ehrliche Antwort.'}},

          {p:'Bis zu 2 Produkten und einem monatlichen PPC-Budget von 1.000 € ist manuelles Management völlig OK. Excel oder Google Sheets plus die wöchentliche 30-Minuten-Routine reichen aus. Jeder, der dir einredet, du müsstest sofort ein 200-€-pro-Monat-Tool nutzen, hat ein Eigeninteresse – meistens eine Affiliate-Provision. Glaube nicht jeder Empfehlung blind.'},

          {p:'Sobald du allerdings skalierst – mehrere Produkte, mehrere Marketplaces, höhere Budgets – ändert sich die Rechnung. Mit einem guten Tool sparst du 5-10 Stunden pro Woche. Bei einem Stundensatz von 30-50 € als Selbständiger sind das 600-2.000 € pro Monat an Wertgewinn. Davon zahlst du locker ein 200-€-Tool. Aber erst dann.'},

          {section:{label:'Marktübersicht',title:'Die wichtigsten PPC-Tools im Vergleich',lead:'Diese Tools sind aktuell die relevantesten im FBA-Markt.'}},

          {table:{
            header:['Tool','Preis','Stärken','Wann sinnvoll?'],
            rows:[
              ['Helium 10 Adtomic','In Diamond inkl.','Voll integriert, Cerebro-Synergien','Wenn du eh Helium 10 hast'],
              ['Perpetua','ab 250 €/Mon','KI-basierte Optimierung','Bei 5.000+ €/Monat Budget'],
              ['PPC Ninja','ab 99 €/Mon','Bulk-Optimierung, einfacher Einstieg','2-5 Produkte'],
              ['Sellics (Adferno)','ab 200 €/Mon','Tageweise Auto-Optimierung','Erfahrene Seller'],
              ['Excel/Sheets','kostenlos','Volle Kontrolle, kein Zwang','1-2 Produkte']
            ]
          }},

          {section:{label:'Erklärung',title:'Was Tools konkret machen',lead:'Verstehe, was du dir wirklich erkaufst – damit du keine Erwartungen hast, die das Tool nicht erfüllt.'}},

          {p:'PPC-Tools übernehmen typischerweise fünf Hauptaufgaben. Wenn dir 3 oder mehr davon Zeit sparen würden, lohnt sich der Kauf. Wenn die meisten dieser Funktionen für dich nicht relevant sind (weil deine Setup-Größe das nicht erfordert), spar dir das Geld.'},

          {l:[
            '<b>Auto-Bidding nach Regeln:</b> „Wenn ACoS > 25 % UND Klicks > 20 → Gebot −15 %." Ohne dass du es manuell machst.',
            '<b>Keyword-Harvesting automatisch:</b> Top-Performer aus Auto-Kampagnen werden automatisch in manuelle Exact-Kampagnen übernommen.',
            '<b>Negative-Keyword-Vorschläge:</b> Tool erkennt Suchbegriffe mit Klicks ohne Verkauf und schlägt Negative vor.',
            '<b>Tagesreports per E-Mail:</b> Auffälligkeiten siehst du sofort, ohne ins Seller Central zu loggen.',
            '<b>Multi-Marketplace:</b> Wenn du DE + UK + FR betreibst – ein Tool managed alles.'
          ]},

          {section:{label:'Strategie',title:'Tool oder kein Tool? Die Entscheidungshilfe',lead:'Diese klaren Kriterien helfen dir bei der Entscheidung.'}},

          {compare:{
            leftTitle:'❌ Wann KEIN Tool?',
            left:'• Du hast weniger als 2 Produkte<br>• Monats-Budget unter 1.000 €<br>• Du fängst gerade erst an<br>• Du willst PPC erst manuell verstehen<br>• Marge ist sehr knapp (Tool zahlt sich nicht)',
            rightTitle:'✅ Wann DOCH Tool?',
            right:'• 5+ Produkte<br>• 3.000+ €/Monat Budget<br>• Du verbringst über 5 Stunden/Woche mit PPC<br>• Mehrere Marketplaces<br>• Du willst skalieren ohne Personal'
          }},

          {tip:'Bevor du ein Tool kaufst: Nutze die 30-Tage-Free-Trial. Wenn das Tool in 30 Tagen <b>nicht mehr Geld einbringt als es kostet</b>, brauchst du es noch nicht. Diese Regel hat mir schon hunderte Euro gespart.'},

          {section:{label:'Wichtig zu wissen',title:'Was du IMMER manuell machen solltest',lead:'Keine Software ersetzt menschliches Urteilsvermögen.'}},

          {p:'Auch mit dem besten Tool gibt es Aufgaben, die du niemals automatisieren solltest. Diese Aufgaben erfordern Kontext, strategisches Denken oder einen Marktblick, den keine KI ersetzen kann. Profis lassen das Tool die Routine erledigen, behalten aber die Strategie selbst in der Hand.'},

          {l:[
            '<b>Strategie-Entscheidungen:</b> Welche Produkte überhaupt bewerben? Welche Märkte erschließen?',
            '<b>Listing-Optimierung:</b> Tools können kein gutes Listing schreiben. Bilder, Titel, Bullets bleiben deine Aufgabe.',
            '<b>Saisonale Anpassungen:</b> Zu Weihnachten oder Black Friday musst du die Strategie umstellen. Tools erkennen das nicht.',
            '<b>Wettbewerbsanalyse:</b> Was machen Konkurrenten neu? Welche neuen Anbieter sind aufgetaucht? Das braucht einen menschlichen Blick.',
            '<b>Final-Approval bei Tool-Vorschlägen:</b> Niemals Tool 100% ungeprüft lassen. Schaue mindestens wöchentlich drüber, was es geändert hat.'
          ]},

          {warning:'Tools können nur das, wofür sie programmiert sind. Sie verstehen nicht, dass dein Produkt zu Weihnachten dreimal so viel verkauft wird. Sie wissen nicht, dass dein Konkurrent gerade einen Sale gestartet hat. Mensch + Tool = beste Kombination.'},

          {success:'Mein finaler Rat: Lerne PPC erst manuell. Verbringe 3 Monate mit deinen eigenen Kampagnen. Dann verstehst du, was Tools dir abnehmen sollen – und kannst sie bewusst einsetzen statt blind zu vertrauen. Diese Selbst-Erfahrung ist durch nichts zu ersetzen.'}
        ]
      }
,
      // ═══════════════════════════════════════════════════════════
      // LEKTION 11: SPONSORED BRANDS – SCHRITT FÜR SCHRITT
      // ═══════════════════════════════════════════════════════════
      {
        id:'ppc_11',
        title:'Sponsored Brands einrichten: alle Formate Schritt für Schritt',
        readTime:'14 Min',
        videoId:'',
        videoTitle:'Offizieller Amazon-Ads-Leitfaden: Sponsored Brands (Link unten)',
        content:[
          {intro:'In Lektion 8 hast du erfahren, WANN sich Sponsored Brands lohnen. Jetzt geht es ums WIE: Diese Lektion führt dich Klick für Klick durch die Einrichtung – inklusive aller drei Anzeigenformate (Produktkollektion, Store-Spotlight, Video) und der neuen Targeting-Optionen 2025/2026. Am Ende kannst du deine erste SB-Kampagne selbst aufsetzen.'},

          {section:{label:'Voraussetzung',title:'Was du vorher brauchst',lead:'Ohne diese drei Dinge kannst du keine Sponsored Brands schalten.'}},

          {l:[
            '<b>Brand Registry:</b> Deine Marke muss bei Amazon registriert sein. Ohne Markenregistrierung ist das Format komplett gesperrt.',
            '<b>Mindestens 3 Produkte (ASINs):</b> Für das Produktkollektions-Format brauchst du mindestens drei beworbene ASINs. Hast du wegen Lagermangel weniger als drei, wird die Kampagne pausiert.',
            '<b>Hochauflösendes Logo:</b> Lege eine Logo-Datei in guter Auflösung bereit, bevor du startest – du brauchst sie im Einrichtungs-Prozess.'
          ]},

          {section:{label:'Schritt für Schritt',title:'Die SB-Kampagne anlegen',lead:'So gehst du im Kampagnen-Manager vor.'}},

          {h2:'Schritt 1: Kampagne erstellen'},
          {p:'Logge dich ins <b>Seller Central</b> ein und gehe zu <b>Werbung → Kampagnen-Manager</b>. Klicke auf <b>„Kampagne erstellen"</b> und wähle den Kampagnentyp <b>„Sponsored Brands"</b>.'},

          {h2:'Schritt 2: Grundeinstellungen'},
          {p:'Vergib einen aussagekräftigen Kampagnen-Namen (z.B. „SB_Marke_Yogamatten_Exact"), wähle die zu bewerbende Marke aus, lege Start- und ggf. Enddatum fest und bestimme dein Budget. <b>Tipp für den Start:</b> Kein Enddatum setzen und mit einem Tagesbudget beginnen, das du beobachten kannst (z.B. 10-20 €/Tag).'},

          {h2:'Schritt 3: Anzeigenformat wählen'},
          {p:'Jetzt wählst du eines der drei SB-Formate. Das ist die wichtigste Entscheidung der Kampagne:'},

          {l:[
            '<b>Produktkollektion:</b> Logo + Überschrift + bis zu 3 Produkte. Beim Klick aufs Logo/die Überschrift landet der Kunde in deinem Brand Store oder einer Produktlistenseite. Das vielseitigste Format.',
            '<b>Store-Spotlight:</b> Hebt mehrere Unterseiten deines Brand Stores hervor. Ideal, wenn du einen gut ausgebauten Store mit mehreren Kategorien hast.',
            '<b>Video:</b> 6-45 Sekunden Video, das in den Suchergebnissen abgespielt wird. <b>Höchste Klickrate aller Amazon-Formate.</b> Braucht ein Produktvideo, lohnt sich aber fast immer.'
          ]},

          {success:'Wenn du ein Produktvideo hast (oder erstellen kannst): Starte mit dem Video-Format. Selbst ein einfaches 6-Sekunden-Video aus deinem A+ Content schlägt statische Banner meist deutlich. Amazon bietet im Tab „Werbemittel-Tools" sogar einen Videogenerator an.'},

          {h2:'Schritt 4: Landing Page festlegen'},
          {p:'Du entscheidest, wohin der Klick aufs Logo/die Überschrift führt: zu deinem <b>Brand Store</b> (empfohlen, wenn vorhanden – hält den Kunden in deiner Markenwelt) oder zu einer <b>Produktlistenseite</b> mit einer Auswahl deiner Artikel. Die Produktlistenseite muss mindestens 3 ASINs enthalten.'},

          {section:{label:'Targeting',title:'Schritt 5: Die richtige Ausrichtung wählen',lead:'Sponsored Brands bietet zwei Targeting-Arten plus eine Neuerung.'}},

          {l:[
            '<b>Keyword-Targeting (empfohlen):</b> Du bietest auf Suchbegriffe, die Kunden eingeben. Nutze deinen Suchbegriffsbericht aus den SP-Kampagnen als Quelle für die besten Keywords.',
            '<b>Produkt-Targeting:</b> Deine Anzeige erscheint bei bestimmten Konkurrenz-Produkten oder -Kategorien.',
            '<b>Theme Based Targeting (seit 2024):</b> Ein dynamischer, modellbasierter Ansatz – Amazon gruppiert verwandte Suchbegriffe automatisch zu Themen, statt dass du jedes Keyword einzeln pflegst. Gut für schnellen Start, aber weniger granular steuerbar.'
          ]},

          {tip:'Für den Einstieg: Beginne mit Keyword-Targeting und übernimm die Top-Performer aus deinen Sponsored-Products-Kampagnen. So baust du auf bereits validierten Keywords auf, statt bei null anzufangen.'},

          {h2:'Schritt 6: Gebote & Start'},
          {p:'Setze deine Gebote (orientiere dich am CPC-Niveau deiner SP-Kampagnen, oft etwas niedriger) und starte die Kampagne. Wie bei Sponsored Products gilt: <b>Mindestens 14 Tage laufen lassen, bevor du optimierst</b> – die ersten Tage liefern noch keine verlässlichen Daten.'},

          {compare:{
            leftTitle:'📊 Limits & Fakten',
            left:'• Max. 100 Anzeigen pro Kampagne<br>• Max. 1.000 Keywords pro Kampagne<br>• Nur mit Brand Registry<br>• Gebraucht/generalüberholt/Erotik nicht erlaubt',
            rightTitle:'🎯 Wann welches Format',
            right:'• Video → höchste CTR, wenn Video vorhanden<br>• Produktkollektion → flexibler Standard<br>• Store-Spotlight → bei ausgebautem Brand Store'
          }},

          {p:'<b>Offizielle Quelle:</b> Den vollständigen Amazon-Leitfaden zur SB-Einrichtung findest du unter <a href="https://advertising.amazon.de/help/GF86HBCNDJUAC5WN" target="_blank" rel="noopener" style="color:var(--ac);text-decoration:underline">advertising.amazon.de – Sponsored Brands erstellen</a> sowie den Lernpfad unter <a href="https://advertising.amazon.com/de-de/solutions/products/sponsored-brands" target="_blank" rel="noopener" style="color:var(--ac);text-decoration:underline">Sponsored Brands – Markenbewusstsein fördern</a>.'},

          {warning:'Hinweis zu Videos: AMZ SellerHub ist eine Offline-App und kann keine YouTube-Videos automatisch aktuell halten. Für aktuelle Video-Anleitungen suche auf YouTube nach „Amazon Sponsored Brands Tutorial deutsch" oder nutze den offiziellen Amazon-Ads-Lernpfad oben – dort sind die Anleitungen immer auf dem neuesten Stand der Benutzeroberfläche.'}
        ]
      },
      // ═══════════════════════════════════════════════════════════
      // LEKTION 12: SPONSORED DISPLAY / DISPLAYANZEIGEN
      // ═══════════════════════════════════════════════════════════
      {
        id:'ppc_12',
        title:'Sponsored Display einrichten: Retargeting & die neue Display-Plattform',
        readTime:'12 Min',
        videoId:'',
        videoTitle:'Offizieller Amazon-Ads-Leitfaden: Sponsored Display (Link unten)',
        content:[
          {intro:'Sponsored Display ist das Format, mit dem du Käufer auch außerhalb der Suche erreichst – auf Produktdetailseiten, Drittseiten und sogar auf Fire TV oder Twitch. Diese Lektion zeigt dir die Einrichtung Schritt für Schritt und erklärt eine wichtige aktuelle Änderung: Amazon führt Sponsored Display in ein breiteres „Displayanzeigen"-Angebot über.'},

          {section:{label:'Aktuelle Änderung',title:'Sponsored Display wird zu „Displayanzeigen"',lead:'Eine Neuerung, die du kennen solltest.'}},

          {p:'Amazon vereinheitlicht seine Werbeplattform: <b>Sponsored Display wird Teil eines breiteren „Displayanzeigen"-Angebots</b> in einem zentralen Hub, der gesponserte Anzeigen und die Amazon DSP in einem Arbeitsbereich zusammenführt. Praktisch heißt das: Bestehende Sponsored-Display-Kampagnen laufen unverändert weiter. Für neue Kampagnen gehst du künftig auf <b>„Kampagne erstellen" → „Display"</b>. Die hier beschriebenen Targeting-Prinzipien bleiben dieselben.'},

          {section:{label:'Voraussetzung',title:'Was du brauchst',lead:'Die Hürde ist niedriger als bei Sponsored Brands.'}},

          {l:[
            '<b>Brand Registry:</b> Auch SD/Displayanzeigen erfordern eine registrierte Marke.',
            '<b>Bewährte Produkte:</b> Amazon empfiehlt, mindestens 10 gut laufende Produkte hinzuzufügen, damit die Kampagne genug Auswahl für relevante Anzeigen hat.',
            '<b>Stabile SP-Basis:</b> Nimm Produkte, die in deinen Sponsored-Products-Kampagnen schon gut verkaufen.'
          ]},

          {section:{label:'Schritt für Schritt',title:'Die SD-Kampagne anlegen',lead:'Der Einrichtungs-Prozess ist bewusst einfach gehalten.'}},

          {h2:'Schritt 1: Kampagne erstellen'},
          {p:'Gehe im <b>Kampagnen-Manager</b> auf <b>„Kampagne erstellen"</b> und wähle <b>„Sponsored Display"</b> (bzw. künftig „Display"). Vergib einen Namen und lege dein Tagesbudget fest.'},

          {h2:'Schritt 2: Produkte & Anzeigengruppe'},
          {p:'Füge die zu bewerbenden Produkte hinzu. <b>Wichtig:</b> Sponsored Display unterstützt eine Anzeigengruppe pro Kampagne – alle Produkte darin teilen sich dasselbe Gebot und Targeting. Wähle daher Produkte, die in dieselbe Kategorie fallen, eng verwandt sind oder einen ähnlichen Preispunkt haben.'},

          {section:{label:'Targeting',title:'Schritt 3: Die zwei Targeting-Arten',lead:'Hier liegt die eigentliche Strategie von Sponsored Display.'}},

          {h2:'Kontext-Targeting (Produkte & Kategorien)'},
          {p:'Du richtest deine Anzeige auf <b>bestimmte Produkte oder Produktkategorien</b> im Amazon-Onlineshop aus. Die Anzeigen erscheinen z.B. auf Produktdetailseiten, neben Kundenrezensionen und auf Suchergebnisseiten. Du kannst nach Preis, Marke und Prime-Berechtigung verfeinern. <b>Aggressive Strategie:</b> Ziele auf Konkurrenz-ASINs, um direkt auf deren Detailseiten zu erscheinen.'},

          {h2:'Zielgruppen-Targeting (Audiences)'},
          {p:'Hier erreichst du Käufer nach Verhalten und Interessen – auch außerhalb von Amazon. Drei Methoden stehen zur Verfügung:'},

          {l:[
            '<b>Amazon-Zielgruppen:</b> Vordefinierte Interessensgruppen (z.B. „Heimwerker", „Hobbyköche") oder neue Zielgruppen erschließen.',
            '<b>Weitervermarktung nach Aufrufen (Views Remarketing):</b> Sprich Personen an, die deine Produkte oder ähnliche angeschaut, aber nicht gekauft haben. <b>Das klassische Retargeting</b> – meist die effektivste SD-Strategie.',
            '<b>Weitervermarktung nach Käufen:</b> Erreiche frühere Käufer erneut – ideal für Verbrauchsprodukte und Cross-Selling.'
          ]},

          {h2:'Schritt 4: Werbemittel & Gebot'},
          {p:'Wähle zwischen <b>Bild und Video</b> als Anzeigenformat. Amazon kann automatisch Werbemittel generieren (mit Bewertungen, Prime-Logo, „Jetzt einkaufen"-Button) oder du lädst eigene hoch. Setze dein Gebot und starte.'},

          {compare:{
            leftTitle:'🎯 Kontext-Targeting',
            left:'• Zielt auf Produkte/Kategorien<br>• Wirkt im Amazon-Shop<br>• Gut gegen Konkurrenz-ASINs<br>• Sofort einsetzbar',
            rightTitle:'👥 Zielgruppen-Targeting',
            right:'• Zielt auf Käufer-Verhalten<br>• Wirkt auch außerhalb Amazons<br>• Stark fürs Retargeting<br>• Braucht etwas Vorlauf-Daten'
          }},

          {warning:'Defensiv-Tipp: Konkurrenten können mit Produkt-Targeting auf DEINE Detailseiten zielen. Setze eine Defensiv-Kampagne auf, die deine eigenen ASINs als Ziel hat – so belegst du den Werbeplatz auf deinen Seiten selbst und hältst fremde „Klau-Anzeigen" fern.'},

          {h2:'Praktisches Beispiel'},
          {example:'Du verkaufst Yogamatten. Mit Views-Remarketing zielst du auf Käufer, die in den letzten 30 Tagen Yogamatten angesehen, aber nicht gekauft haben. Diese Personen sind im aktiven Kaufmodus und nur noch unentschlossen – deine Conversion-Rate auf diese warme Zielgruppe ist oft um ein Vielfaches höher als bei kalter Reichweite.'},

          {tip:'Budget-Mix-Erinnerung aus Lektion 8: Für etablierte Marken hat sich grob 70% Sponsored Products / 20% Sponsored Brands / 10% Sponsored Display bewährt. SD ist der kleinste Posten, aber holt gezielt die Unentschlossenen ab.'},

          {p:'<b>Offizielle Quellen:</b> <a href="https://advertising.amazon.com/de-de/library/guides/sponsored-display-guide" target="_blank" rel="noopener" style="color:var(--ac);text-decoration:underline">Alles über Sponsored Display</a> · <a href="https://advertising.amazon.com/de-de/solutions/products/sponsored-display" target="_blank" rel="noopener" style="color:var(--ac);text-decoration:underline">Sponsored Display / Displayanzeigen</a>'},

          {success:'Damit kennst du alle drei Amazon-Anzeigenformate im Detail: Sponsored Products (das Arbeitspferd), Sponsored Brands (der Marken-Aufbau) und Sponsored Display (das Retargeting). Du hast jetzt das komplette PPC-Werkzeug, um deinen Werbe-Mix strategisch aufzubauen.'}
        ]
      }    ]
  }
];

var currentLesson=null;
var coachCurrentView='dashboard';
var coachCurrentModuleId=null;
var coachCurrentCategoryId=null;

// ═══════════════════════════════════════════════════════════════
// LERNBEREICHE / KATEGORIEN
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// LERNPFAD: 8 PHASEN (didaktische Reise statt Themen-Bibliothek)
// Jede Phase bereitet eine konkrete Entscheidung vor.
// Hartes Gating: phase N+1 wird erst frei, wenn phase N abgeschlossen.
// (Admins sehen alles — siehe coachIsPhaseUnlocked)
// ═══════════════════════════════════════════════════════════════
var COACHING_CATEGORIES=[
  {
    id:'phase0', phase:0,
    title:'Fundament & Überblick',
    icon:'🧭', color:'pu',
    desc:'Verstehe das Gesamtsystem und die vier Werkzeuge, bevor du startest.',
    goal:'Du verstehst den kompletten Prozess und weißt, welches Tool wann eingesetzt wird.',
    decision:'„Ich verstehe den Prozess und bin startbereit."',
    moduleIds:['recherche_prozess']
  },
  {
    id:'phase1', phase:1,
    title:'Produktkriterien festlegen',
    icon:'🎯', color:'ac',
    desc:'Definiere klare, messbare Kriterien für ein gutes Produkt.',
    goal:'Du hast deine persönlichen Mindest-Anforderungen (Preis, Größe, Marge, Risiko).',
    decision:'„Das sind meine Filterkriterien."',
    moduleIds:['h10_intro']
  },
  {
    id:'phase2', phase:2,
    title:'Nachfrage validieren',
    icon:'📈', color:'gn',
    desc:'Prüfe, ob überhaupt genug Menschen das Produkt suchen und kaufen.',
    goal:'Du kannst Suchvolumen, Verkäufe und Trends zuverlässig einschätzen.',
    decision:'„Es gibt genug Nachfrage."',
    moduleIds:['h10_blackbox','h10_keywords']
  },
  {
    id:'phase3', phase:3,
    title:'Wettbewerb analysieren',
    icon:'⚔️', color:'bl',
    desc:'Verstehe, gegen wen du antrittst und ob du eine echte Chance hast.',
    goal:'Du bewertest Wettbewerber-Stärke (Reviews, BSR, Listing-Qualität) objektiv.',
    decision:'„Der Wettbewerb ist schlagbar."',
    moduleIds:['h10_xray']
  },
  {
    id:'phase4', phase:4,
    title:'Wirtschaftlichkeit prüfen',
    icon:'💶', color:'cy',
    desc:'Rechne knallhart durch, ob am Ende Gewinn übrig bleibt.',
    goal:'Du beherrschst FBA-Gebühren, Marge, ROI und Break-even.',
    decision:'„Die Zahlen stimmen." → Jetzt im FBA-Kalkulator anwenden.',
    moduleIds:['h10_workflow']
  },
  {
    id:'phase5', phase:5,
    title:'Differenzierung & Risiko',
    icon:'🛡️', color:'or',
    desc:'Finde heraus, wie du besser wirst – und ob rechtliche Risiken lauern.',
    goal:'Du leitest aus Reviews Verbesserungen ab und erkennst Risiken früh.',
    decision:'„Mein Produkt ist besser UND sicher."',
    moduleIds:[]
  },
  {
    id:'phase6', phase:6,
    title:'Beschaffung prüfen',
    icon:'📦', color:'pk',
    desc:'Stelle sicher, dass du das Produkt zuverlässig und profitabel beschaffen kannst.',
    goal:'Du findest Lieferanten, bewertest Angebote und planst Muster & Import.',
    decision:'„Ich kann zuverlässig liefern."',
    moduleIds:['sourcing']
  },
  {
    id:'phase7', phase:7,
    title:'Entscheidung: Go oder No-Go',
    icon:'✅', color:'gn',
    desc:'Bündle alle Erkenntnisse in einer fundierten, datenbasierten Entscheidung.',
    goal:'Du nutzt die Score-Matrix und Go/No-Go-Regeln für eine objektive Wahl.',
    decision:'„JA – ich starte dieses Produkt." oder „Nein, nächste Idee."',
    moduleIds:[]
  },
  {
    id:'phase8', phase:8,
    title:'Launch & Skalierung',
    icon:'🚀', color:'pk',
    desc:'Erst nach dem „Go": Listing erstellen, launchen und mit PPC skalieren.',
    goal:'Du planst den Launch, optimierst dein Listing und steuerst Werbung effizient.',
    decision:'„Mein Launch läuft und ich skaliere."',
    moduleIds:['ppc']
  }
];

// ─── Gating-Logik ───
// Eine Phase ist freigeschaltet, wenn ALLE vorherigen Phasen mit Modulen abgeschlossen sind.
// Phasen ohne Module (5,7) blockieren NICHT (kein Content → automatisch "übersprungen").
// Admins sehen immer alles.
function coachPhaseLessonStats(cat){
  var total=0,done=0;
  (cat.moduleIds||[]).forEach(function(mid){
    var m=COACHING_MODULES.find(function(x){return x.id===mid;});
    if(!m)return;
    m.lessons.forEach(function(l){total++;if(D.coachingProgress&&D.coachingProgress[l.id])done++;});
  });
  return {total:total,done:done,complete:total>0&&done===total};
}
function coachIsPhaseUnlocked(phaseIndex){
  // Admin-Override: Admins haben immer Vollzugriff
  var u=window.WikaAuth?window.WikaAuth.currentUser():null;
  if(u&&u.role==='admin')return true;
  // Phase 0 immer frei
  if(phaseIndex<=0)return true;
  // Alle vorherigen Phasen müssen abgeschlossen sein (Phasen ohne Lektionen zählen als erledigt)
  for(var i=0;i<phaseIndex;i++){
    var prev=COACHING_CATEGORIES[i];
    var st=coachPhaseLessonStats(prev);
    if(st.total>0 && !st.complete)return false;
  }
  return true;
}
function coachNextRecommendedPhase(){
  for(var i=0;i<COACHING_CATEGORIES.length;i++){
    var st=coachPhaseLessonStats(COACHING_CATEGORIES[i]);
    if(st.total>0 && !st.complete)return i;
  }
  return -1; // alles fertig
}

function coachGetCategoryOfModule(modId){
  for(var i=0;i<COACHING_CATEGORIES.length;i++){
    if(COACHING_CATEGORIES[i].moduleIds.indexOf(modId)>=0)return COACHING_CATEGORIES[i];
  }
  return null;
}

function coachGetModulesInCategory(catId){
  var cat=COACHING_CATEGORIES.find(function(c){return c.id===catId;});
  if(!cat)return [];
  return cat.moduleIds.map(function(mid){
    return COACHING_MODULES.find(function(m){return m.id===mid;});
  }).filter(function(m){return m;});
}

// ═══════════════════════════════════════════════════════════════
// COACHING SUB-NAVIGATION
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// MAIN NAVIGATION (dynamisch generiert)
// ═══════════════════════════════════════════════════════════════

function coachBuildMainNav(){
  // Neue Themen-Sidebar (vertikal, nach Modulen statt Phasen)
  var nav=document.getElementById('coachSidebar');
  if(!nav)return;

  var prog=D.coachingProgress||{};
  var bm=D.coachingBookmarks||{};
  var bmCount=Object.keys(bm).length;

  function moduleStats(m){
    var total=m.lessons.length,done=0;
    m.lessons.forEach(function(l){if(prog[l.id])done++;});
    return {total:total,done:done,pct:total>0?Math.round(done/total*100):0,complete:total>0&&done===total};
  }

  var html='';

  // ── Suche oben ──
  html+='<div style="padding:6px 6px 10px">'+
    '<input type="text" id="coachSearchInput" placeholder="🔍 Thema suchen…" oninput="coachSearch()" style="width:100%;padding:9px 12px;border-radius:8px;border:1px solid var(--bd);background:var(--s2);color:var(--tx);font-family:inherit;font-size:13px;outline:none;box-sizing:border-box" onfocus="this.style.borderColor=\'var(--ac)\'" onblur="this.style.borderColor=\'var(--bd)\'">'+
  '</div>';

  // ── Home / Übersicht ──
  var isHome=coachCurrentView==='dashboard';
  html+='<button onclick="coachShowView(\'dashboard\')" style="width:100%;text-align:left;padding:10px 12px;margin-bottom:2px;background:'+(isHome?'var(--acd)':'transparent')+';border:none;border-left:3px solid '+(isHome?'var(--ac)':'transparent')+';border-radius:0 8px 8px 0;color:'+(isHome?'var(--ac)':'var(--tx)')+';font-family:inherit;font-size:13.5px;font-weight:'+(isHome?'700':'600')+';cursor:pointer;display:flex;align-items:center;gap:9px">'+
    '<span style="font-size:16px">🏠</span><span>Übersicht</span></button>';

  // ── Sektion: Themen (alle Module) ──
  html+='<div style="font-size:10px;text-transform:uppercase;letter-spacing:1.2px;color:var(--tx3);font-weight:700;padding:14px 12px 6px">📚 Themen</div>';

  COACHING_MODULES.forEach(function(m){
    var active=(coachCurrentView==='module'||coachCurrentView==='lesson')&&coachCurrentModuleId===m.id;
    var st=moduleStats(m);
    var col=active?'var(--'+(m.color||'ac')+')':'var(--tx)';
    html+='<button onclick="coachOpenModule(\''+m.id+'\')" title="'+esc(m.desc||'')+'" style="width:100%;text-align:left;padding:10px 12px;margin-bottom:2px;background:'+(active?'var(--'+(m.color||'ac')+'d)':'transparent')+';border:none;border-left:3px solid '+(active?'var(--'+(m.color||'ac')+')':'transparent')+';border-radius:0 8px 8px 0;color:'+col+';font-family:inherit;font-size:13px;font-weight:'+(active?'700':'500')+';cursor:pointer;display:flex;align-items:center;gap:9px" '+
      'onmouseover="if(!'+active+')this.style.background=\'var(--s2)\'" onmouseout="if(!'+active+')this.style.background=\'transparent\'">'+
      '<span style="font-size:16px;flex-shrink:0">'+m.icon+'</span>'+
      '<span style="flex:1;min-width:0;line-height:1.25">'+esc(m.title)+'</span>'+
      (st.complete?'<span style="color:var(--gn);font-size:13px;font-weight:700;flex-shrink:0">✓</span>'
        :(st.done>0?'<span style="background:var(--'+(m.color||'ac')+');color:#fff;border-radius:9px;padding:1px 6px;font-size:9px;font-weight:700;flex-shrink:0">'+st.pct+'%</span>'
          :'<span style="color:var(--tx3);font-size:10px;flex-shrink:0">'+st.total+'</span>'))+
    '</button>';
  });

  // ── Sektion: Meine Ansichten ──
  html+='<div style="font-size:10px;text-transform:uppercase;letter-spacing:1.2px;color:var(--tx3);font-weight:700;padding:14px 12px 6px">⭐ Persönlich</div>';

  var isBm=coachCurrentView==='bookmarks';
  html+='<button onclick="coachShowView(\'bookmarks\')" style="width:100%;text-align:left;padding:10px 12px;margin-bottom:2px;background:'+(isBm?'var(--acd)':'transparent')+';border:none;border-left:3px solid '+(isBm?'var(--ac)':'transparent')+';border-radius:0 8px 8px 0;color:'+(isBm?'var(--ac)':'var(--tx)')+';font-family:inherit;font-size:13px;font-weight:'+(isBm?'700':'500')+';cursor:pointer;display:flex;align-items:center;gap:9px">'+
    '<span style="font-size:16px">⭐</span><span style="flex:1">Lesezeichen</span>'+
    (bmCount>0?'<span style="background:var(--ac);color:#fff;border-radius:9px;padding:1px 6px;font-size:9px;font-weight:700">'+bmCount+'</span>':'')+'</button>';

  var isCmp=coachCurrentView==='completed';
  html+='<button onclick="coachShowView(\'completed\')" style="width:100%;text-align:left;padding:10px 12px;margin-bottom:2px;background:'+(isCmp?'var(--acd)':'transparent')+';border:none;border-left:3px solid '+(isCmp?'var(--ac)':'transparent')+';border-radius:0 8px 8px 0;color:'+(isCmp?'var(--ac)':'var(--tx)')+';font-family:inherit;font-size:13px;font-weight:'+(isCmp?'700':'500')+';cursor:pointer;display:flex;align-items:center;gap:9px">'+
    '<span style="font-size:16px">🏆</span><span style="flex:1">Abgeschlossen</span></button>';

  nav.innerHTML=html;
}

// ═══════════════════════════════════════════════════════════════
// LESSON SUB-NAVIGATION (Lektionen innerhalb eines Moduls)
// ═══════════════════════════════════════════════════════════════

function coachBuildLessonNav(){
  var nav=document.getElementById('coachingLessonNav');
  var spacer=document.getElementById('coachingNavSpacer');
  if(!nav||!spacer)return;

  // Show only when in module or lesson view
  if(coachCurrentView!=='module' && coachCurrentView!=='lesson'){
    nav.style.display='none';
    spacer.style.display='block';
    return;
  }
  if(!coachCurrentModuleId){
    nav.style.display='none';
    spacer.style.display='block';
    return;
  }

  var mod=COACHING_MODULES.find(function(m){return m.id===coachCurrentModuleId;});
  if(!mod){nav.style.display='none';spacer.style.display='block';return;}

  nav.style.display='flex';
  spacer.style.display='none';

  var color='var(--'+mod.color+')';
  var prog=D.coachingProgress||{};

  var currentLessonId=(coachCurrentView==='lesson'&&currentLesson)?currentLesson.lesson.id:null;
  var currentIdx=currentLessonId?mod.lessons.findIndex(function(l){return l.id===currentLessonId;}):-1;

  var html='';

  // Module-Title-Pill (left)
  html+='<div style="display:flex;align-items:center;gap:8px;padding:4px 12px;background:var(--'+mod.color+'d);border-radius:8px;margin-right:8px">'+
    '<span style="font-size:16px">'+mod.icon+'</span>'+
    '<div>'+
      '<div style="font-size:9px;text-transform:uppercase;letter-spacing:1px;color:var(--tx2);font-weight:700">Modul</div>'+
      '<div style="font-size:12px;font-weight:700;color:'+color+'">'+esc(mod.title)+'</div>'+
    '</div>'+
  '</div>';

  // Prev button
  if(currentIdx>0){
    var prev=mod.lessons[currentIdx-1];
    html+='<button onclick="go_lesson(\''+mod.id+'\',\''+prev.id+'\')" title="'+esc(prev.title)+'" style="background:var(--s1);border:1px solid var(--bd);border-radius:6px;padding:6px 10px;cursor:pointer;font-family:inherit;font-size:12px;color:var(--tx);font-weight:600">← Vorherige</button>';
  }else if(currentIdx===0){
    html+='<button disabled style="background:var(--s2);border:1px solid var(--bd);border-radius:6px;padding:6px 10px;font-family:inherit;font-size:12px;color:var(--tx3);font-weight:600;cursor:not-allowed">← Vorherige</button>';
  }

  // Module-Übersicht button
  html+='<button onclick="coachOpenModule(\''+mod.id+'\')" style="background:'+(coachCurrentView==='module'?color:'var(--s1)')+';border:1px solid '+(coachCurrentView==='module'?color:'var(--bd)')+';border-radius:6px;padding:6px 10px;cursor:pointer;font-family:inherit;font-size:12px;color:'+(coachCurrentView==='module'?'#fff':'var(--tx)')+';font-weight:'+(coachCurrentView==='module'?'700':'600')+'">📋 Übersicht</button>';

  // Lesson dots (visual progress + jump)
  if(mod.lessons.length<=12){
    html+='<div style="display:flex;align-items:center;gap:3px;padding:0 6px;border-left:1px solid var(--bd);border-right:1px solid var(--bd);margin:0 4px">';
    mod.lessons.forEach(function(l,i){
      var lDone=!!prog[l.id];
      var isCurrent=l.id===currentLessonId;
      var dotSize=isCurrent?'24px':'18px';
      var dotBg=isCurrent?color:(lDone?'var(--gn)':'var(--s3)');
      var dotColor=isCurrent||lDone?'#fff':'var(--tx2)';
      var dotBorder=isCurrent?'2px solid '+color:'1px solid '+(lDone?'var(--gn)':'var(--bd)');
      html+='<button onclick="go_lesson(\''+mod.id+'\',\''+l.id+'\')" title="Lektion '+(i+1)+': '+esc(l.title)+'" style="width:'+dotSize+';height:'+dotSize+';border-radius:50%;background:'+dotBg+';border:'+dotBorder+';color:'+dotColor+';font-family:inherit;font-size:10px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;transition:all .15s">'+(lDone?'✓':(i+1))+'</button>';
    });
    html+='</div>';
  }else{
    // For long modules, show "Lektion X/Y" instead
    if(currentIdx>=0){
      html+='<div style="padding:4px 10px;background:var(--s1);border:1px solid var(--bd);border-radius:6px;font-size:11px;color:var(--tx2);font-weight:600">Lektion '+(currentIdx+1)+' / '+mod.lessons.length+'</div>';
    }else{
      html+='<div style="padding:4px 10px;background:var(--s1);border:1px solid var(--bd);border-radius:6px;font-size:11px;color:var(--tx2);font-weight:600">'+mod.lessons.length+' Lektionen</div>';
    }
  }

  // Next button
  if(currentIdx>=0&&currentIdx<mod.lessons.length-1){
    var next=mod.lessons[currentIdx+1];
    html+='<button onclick="go_lesson(\''+mod.id+'\',\''+next.id+'\')" title="'+esc(next.title)+'" style="background:'+color+';border:1px solid '+color+';border-radius:6px;padding:6px 10px;cursor:pointer;font-family:inherit;font-size:12px;color:#fff;font-weight:700">Nächste →</button>';
  }else if(currentIdx>=0&&currentIdx===mod.lessons.length-1){
    html+='<button disabled style="background:var(--s2);border:1px solid var(--bd);border-radius:6px;padding:6px 10px;font-family:inherit;font-size:12px;color:var(--tx3);font-weight:600;cursor:not-allowed">Letzte Lektion</button>';
  }else{
    // In module overview, show "Start" button
    var first=mod.lessons[0];
    if(first){
      html+='<button onclick="go_lesson(\''+mod.id+'\',\''+first.id+'\')" style="background:'+color+';border:1px solid '+color+';border-radius:6px;padding:6px 12px;cursor:pointer;font-family:inherit;font-size:12px;color:#fff;font-weight:700">▶️ Modul starten</button>';
    }
  }

  // Module-pct-badge (right)
  var modDone=mod.lessons.filter(function(l){return prog[l.id];}).length;
  var modTotal=mod.lessons.length;
  var modPct=modTotal>0?Math.round((modDone/modTotal)*100):0;
  html+='<div style="margin-left:auto;display:flex;align-items:center;gap:6px;font-size:11px;color:var(--tx2)">'+
    '<span><b style="color:'+color+'">'+modDone+'</b>/'+modTotal+' Lektionen</span>'+
    '<div style="width:80px;height:5px;background:var(--s3);border-radius:3px;overflow:hidden"><div style="height:100%;background:'+color+';width:'+modPct+'%;transition:width .35s"></div></div>'+
    '<span style="font-weight:700;color:'+color+'">'+modPct+'%</span>'+
  '</div>';

  nav.innerHTML=html;
}

// ═══════════════════════════════════════════════════════════════
// VIEW SWITCHING
// ═══════════════════════════════════════════════════════════════

function coachShowView(viewName){
  // Hide all views
  ['dashboard','module','category','bookmarks','completed','search','lesson'].forEach(function(v){
    var el=document.getElementById('coachView_'+v);
    if(el)el.style.display='none';
  });
  // Show requested view
  var view=document.getElementById('coachView_'+viewName);
  if(view)view.style.display='block';
  coachCurrentView=viewName;

  // Update breadcrumb
  var bc=document.getElementById('coachingBreadcrumb');
  if(bc){
    if(viewName==='dashboard')bc.textContent='Coaching für Amazon FBA-Seller';
    else if(viewName==='category'){
      var cat=COACHING_CATEGORIES.find(function(x){return x.id===coachCurrentCategoryId;});
      bc.textContent='Lernbereich: '+(cat?cat.title:'');
    }
    else if(viewName==='module'){
      var m=COACHING_MODULES.find(function(x){return x.id===coachCurrentModuleId;});
      var pcat=m?coachGetCategoryOfModule(m.id):null;
      bc.textContent=(pcat?pcat.title+' › ':'')+'Modul: '+(m?m.title:'');
    }
    else if(viewName==='lesson'&&currentLesson){
      var lcat=coachGetCategoryOfModule(currentLesson.module.id);
      bc.textContent=(lcat?lcat.title+' › ':'')+currentLesson.module.title+' › '+currentLesson.lesson.title;
    }
    else if(viewName==='bookmarks')bc.textContent='Lesezeichen';
    else if(viewName==='completed')bc.textContent='Abgeschlossen';
    else if(viewName==='search')bc.textContent='Suche';
  }

  // Trigger view-specific renders
  if(viewName==='dashboard')coachRenderDashboard();
  else if(viewName==='category')coachRenderCategory();
  else if(viewName==='bookmarks')coachRenderBookmarks();
  else if(viewName==='completed')coachRenderCompleted();
  else if(viewName==='module')coachRenderSingleModule();

  // Rebuild navs
  coachBuildMainNav();
  coachBuildLessonNav();

  // Scroll page-body to top
  var pb=document.querySelector('#p-coaching .page-body');
  if(pb)pb.scrollTop=0;
}

function coachOpenCategory(catId){
  var idx=COACHING_CATEGORIES.findIndex(function(c){return c.id===catId;});
  if(idx>=0 && !coachIsPhaseUnlocked(idx)){
    var prevWithContent=null;
    for(var i=idx-1;i>=0;i--){var st=coachPhaseLessonStats(COACHING_CATEGORIES[i]);if(st.total>0&&!st.complete){prevWithContent=COACHING_CATEGORIES[i];break;}}
    toast('🔒 Erst „'+(prevWithContent?prevWithContent.title:'die vorherige Phase')+'" abschließen');
    return;
  }
  coachCurrentCategoryId=catId;
  coachShowView('category');
}

function coachOpenModule(moduleId){
  coachCurrentModuleId=moduleId;
  // also set the category, so the category tab stays active
  var cat=coachGetCategoryOfModule(moduleId);
  if(cat)coachCurrentCategoryId=cat.id;
  coachShowView('module');
}

function coachJumpToFirstModule(){
  if(COACHING_MODULES.length){
    coachOpenModule(COACHING_MODULES[0].id);
  }
}

// ═══════════════════════════════════════════════════════════════
// LESSON NAVIGATION
// ═══════════════════════════════════════════════════════════════

function go_lesson(moduleId,lessonId){
  var mod=COACHING_MODULES.find(function(m){return m.id===moduleId});
  if(!mod)return;
  var lesson=mod.lessons.find(function(l){return l.id===lessonId});
  if(!lesson)return;
  // Switch to coaching page if needed
  go('coaching');
  currentLesson={module:mod,lesson:lesson};
  coachCurrentModuleId=moduleId;
  coachShowView('lesson');
  renderLessonView();
}

// ─── Bild-Lightbox: Klick auf Grafik → groß anzeigen ───
function coachZoomImage(wrapper){
  var svg=wrapper.querySelector('svg');
  if(!svg)return;
  var lb=document.getElementById('coachLightbox');
  var inner=document.getElementById('coachLightboxInner');
  if(!lb||!inner)return;
  // viewBox auslesen für korrektes Seitenverhältnis
  var vb=(svg.getAttribute('viewBox')||'0 0 600 400').split(/\s+/);
  var w=parseFloat(vb[2])||600, h=parseFloat(vb[3])||400;
  var ratio=h/w;
  // Kopie des SVG mit EXPLIZITER Größe (sonst rendert SVG ohne width nicht → schwarz)
  var clone=svg.cloneNode(true);
  clone.removeAttribute('style');
  // Zielbreite: möglichst groß, aber innerhalb Viewport
  var targetW=Math.min(window.innerWidth*0.88, 900);
  var targetH=targetW*ratio;
  // Falls zu hoch, an Höhe ausrichten
  if(targetH>window.innerHeight*0.82){
    targetH=window.innerHeight*0.82;
    targetW=targetH/ratio;
  }
  clone.setAttribute('width',Math.round(targetW));
  clone.setAttribute('height',Math.round(targetH));
  clone.style.display='block';
  clone.style.background='#0f1729';
  clone.style.borderRadius='14px';
  inner.innerHTML='';
  inner.appendChild(clone);
  lb.style.display='flex';
}
function coachCloseZoom(){
  var lb=document.getElementById('coachLightbox');
  if(lb)lb.style.display='none';
}
// ESC schließt die Lightbox
document.addEventListener('keydown',function(e){
  if(e.key==='Escape'){var lb=document.getElementById('coachLightbox');if(lb&&lb.style.display==='flex')coachCloseZoom();}
});

function coachBackFromLesson(){
  // Go back to single-module view
  if(coachCurrentModuleId){
    coachShowView('module');
  }else{
    coachShowView('dashboard');
  }
}

function closeLesson(){
  // Backwards compat
  coachBackFromLesson();
}

function toggleLessonComplete(lessonId,completed){
  D.coachingProgress=D.coachingProgress||{};
  // Phasen-Status VOR der Änderung merken
  var phasesBefore=COACHING_CATEGORIES.map(function(c){return coachPhaseLessonStats(c).complete;});
  if(completed)D.coachingProgress[lessonId]=new Date().toISOString();
  else delete D.coachingProgress[lessonId];
  save();
  // Prüfen, ob durch diese Lektion eine ganze Phase NEU abgeschlossen wurde
  if(completed){
    for(var i=0;i<COACHING_CATEGORIES.length;i++){
      var nowComplete=coachPhaseLessonStats(COACHING_CATEGORIES[i]).complete;
      if(nowComplete && !phasesBefore[i]){
        coachCelebratePhase(i);
        break;
      }
    }
  }
  if(currentLesson)renderLessonView();
}

// Motivierendes Übergangs-Banner, wenn eine Phase abgeschlossen wurde
function coachCelebratePhase(phaseIdx){
  var cat=COACHING_CATEGORIES[phaseIdx];
  // Nächste Phase mit Inhalten finden
  var next=null;
  for(var i=phaseIdx+1;i<COACHING_CATEGORIES.length;i++){
    if(coachPhaseLessonStats(COACHING_CATEGORIES[i]).total>0){next=COACHING_CATEGORIES[i];break;}
  }
  var allDone=COACHING_CATEGORIES.every(function(c){var s=coachPhaseLessonStats(c);return s.total===0||s.complete;});
  var msg, sub;
  if(allDone){
    msg='🏆 Glückwunsch! Du hast den kompletten Lernpfad abgeschlossen!';
    sub='Du bist jetzt bereit, fundierte Produktentscheidungen zu treffen. Zeit, dein Wissen in der Produktfindung anzuwenden!';
  }else if(next){
    msg='✅ Phase '+cat.phase+' geschafft: '+cat.title+'!';
    sub='Du bist jetzt bereit für Phase '+next.phase+': '+next.title+'. '+next.decision;
  }else{
    msg='✅ Phase '+cat.phase+' abgeschlossen: '+cat.title+'!';
    sub=cat.decision;
  }
  // Overlay-Banner
  var ov=document.createElement('div');
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999;animation:fadeIn .2s';
  ov.onclick=function(){ov.remove();};
  var nextColor=next?'var(--'+next.color+')':'var(--gn)';
  ov.innerHTML='<div style="background:linear-gradient(135deg,var(--s1),var(--s2));border:2px solid var(--gn);border-radius:18px;padding:32px 36px;max-width:440px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.5)" onclick="event.stopPropagation()">'+
    '<div style="font-size:54px;margin-bottom:8px">'+(next?next.icon:'🏆')+'</div>'+
    '<div style="font-size:20px;font-weight:800;color:var(--tx);font-family:\'Playfair Display\',serif;margin-bottom:10px;line-height:1.3">'+esc(msg)+'</div>'+
    '<div style="font-size:13.5px;color:var(--tx2);line-height:1.6;margin-bottom:22px">'+esc(sub)+'</div>'+
    (next?'<button onclick="this.closest(\'div[style*=fixed]\').remove();coachOpenCategory(\''+next.id+'\')" style="background:'+nextColor+';color:#fff;border:none;border-radius:10px;padding:12px 28px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer;margin-right:8px">▶️ Weiter zu Phase '+next.phase+'</button>':'')+
    '<button onclick="this.closest(\'div[style*=fixed]\').remove()" style="background:var(--s3);color:var(--tx);border:none;border-radius:10px;padding:12px 22px;font-family:inherit;font-size:14px;font-weight:600;cursor:pointer">Schließen</button>'+
  '</div>';
  document.body.appendChild(ov);
}

// ═══════════════════════════════════════════════════════════════
// BOOKMARKS
// ═══════════════════════════════════════════════════════════════

function coachToggleBookmark(lessonId){
  D.coachingBookmarks=D.coachingBookmarks||{};
  if(D.coachingBookmarks[lessonId])delete D.coachingBookmarks[lessonId];
  else D.coachingBookmarks[lessonId]=new Date().toISOString();
  save();
  if(currentLesson)renderLessonView();
  coachUpdateBookmarkBadge();
}

function coachUpdateBookmarkBadge(){
  var bm=D.coachingBookmarks||{};
  var count=Object.keys(bm).length;
  var badge=document.getElementById('bookmarkCount');
  if(badge){
    if(count>0){badge.textContent=count;badge.style.display='inline-block';}
    else badge.style.display='none';
  }
}

// ═══════════════════════════════════════════════════════════════
// SEARCH
// ═══════════════════════════════════════════════════════════════

function coachSearch(){
  var q=(document.getElementById('coachSearchInput').value||'').toLowerCase().trim();
  if(q.length<2){
    if(coachCurrentView==='search')coachShowView('dashboard');
    return;
  }
  // Find matching lessons
  var matches=[];
  COACHING_MODULES.forEach(function(mod){
    mod.lessons.forEach(function(l){
      var hay=(l.title+' '+(l.videoTitle||'')+' '+(l.readTime||'')+' '+JSON.stringify(l.content||'')).toLowerCase();
      if(hay.indexOf(q)>=0)matches.push({mod:mod,lesson:l});
    });
  });

  // Switch to search view
  if(coachCurrentView!=='search')coachShowView('search');

  var sub=document.getElementById('searchSubtitle');
  if(sub)sub.textContent=matches.length+' Treffer für "'+q+'"';

  var box=document.getElementById('coachSearchResults');
  if(!box)return;
  if(!matches.length){
    box.innerHTML='<div style="background:var(--s1);border:1px solid var(--bd);border-radius:10px;padding:30px;text-align:center;color:var(--tx2)"><div style="font-size:32px;margin-bottom:10px">🤔</div>Keine Lektionen gefunden für "<b>'+esc(q)+'</b>"</div>';
    return;
  }
  box.innerHTML=matches.map(function(m){
    var done=!!D.coachingProgress[m.lesson.id];
    var color='var(--'+m.mod.color+')';
    return '<button onclick="go_lesson(\''+m.mod.id+'\',\''+m.lesson.id+'\')" style="display:block;width:100%;text-align:left;background:var(--s1);border:1px solid var(--bd);border-radius:10px;padding:14px 18px;margin-bottom:8px;cursor:pointer;font-family:inherit;color:var(--tx);transition:all .15s" onmouseover="this.style.borderColor=\''+color+'\';this.style.transform=\'translateY(-1px)\'" onmouseout="this.style.borderColor=\'var(--bd)\';this.style.transform=\'none\'">'+
      '<div style="display:flex;align-items:center;gap:12px">'+
        '<div style="font-size:24px">'+m.mod.icon+'</div>'+
        '<div style="flex:1;min-width:0">'+
          '<div style="font-size:11px;color:'+color+';text-transform:uppercase;letter-spacing:1px;font-weight:700">'+esc(m.mod.title)+'</div>'+
          '<div style="font-size:14px;font-weight:700;color:var(--tx);margin:2px 0">'+esc(m.lesson.title)+(done?' <span style="color:var(--gn);font-size:12px">✓</span>':'')+'</div>'+
          '<div style="font-size:11px;color:var(--tx3)">⏱ '+esc(m.lesson.readTime||'')+'</div>'+
        '</div>'+
        '<div style="font-size:18px;color:var(--tx3)">→</div>'+
      '</div>'+
    '</button>';
  }).join('');
}

// ═══════════════════════════════════════════════════════════════
// CONTINUE LEARNING
// ═══════════════════════════════════════════════════════════════

function coachFindNextLesson(){
  // Find first unfinished lesson based on progress
  for(var i=0;i<COACHING_MODULES.length;i++){
    var mod=COACHING_MODULES[i];
    for(var j=0;j<mod.lessons.length;j++){
      var l=mod.lessons[j];
      if(!D.coachingProgress[l.id])return {mod:mod,lesson:l};
    }
  }
  return null;
}

function coachContinueLearning(){
  var next=coachFindNextLesson();
  if(next){
    go_lesson(next.mod.id,next.lesson.id);
  }else{
    // All done!
    if(window.toast)toast('🎉 Alle Lektionen abgeschlossen! Großartig!');
    coachShowView('completed');
  }
}

// ═══════════════════════════════════════════════════════════════
// VIEW: DASHBOARD
// ═══════════════════════════════════════════════════════════════

function coachRenderDashboard(){
  // Calculate stats
  var totalLessons=0,doneLessons=0,totalMinutes=0,doneMinutes=0;
  COACHING_MODULES.forEach(function(m){
    m.lessons.forEach(function(l){
      totalLessons++;
      var min=parseInt((l.readTime||'5').match(/\d+/)||[5],10);
      totalMinutes+=min;
      if(D.coachingProgress[l.id]){doneLessons++;doneMinutes+=min;}
    });
  });
  var pct=totalLessons>0?Math.round((doneLessons/totalLessons)*100):0;

  // Hero stats
  var pctEl=document.getElementById('coachOverallPct');
  if(pctEl)pctEl.textContent=pct+'%';
  var textEl=document.getElementById('coachOverallText');
  if(textEl)textEl.textContent=doneLessons+' / '+totalLessons+' Lektionen';

  // Personalized welcome
  var u=window.WikaAuth?window.WikaAuth.currentUser():null;
  var welcomeEl=document.getElementById('coachWelcomeText');
  var subEl=document.getElementById('coachWelcomeSubtext');
  if(welcomeEl){
    if(doneLessons===0){
      welcomeEl.textContent='Werde zum Amazon-FBA-Profi 🚀';
      if(subEl)subEl.textContent='Strukturierte Module von Helium 10 bis PPC-Optimierung. Schritt für Schritt mit Videos, Beispielen und Übungen.';
    }else if(pct<33){
      welcomeEl.textContent='Du bist auf einem guten Weg! 💪';
      if(subEl)subEl.textContent='Bleib dran – jede abgeschlossene Lektion bringt dich näher zum Ziel.';
    }else if(pct<66){
      welcomeEl.textContent='Stark – fast die Hälfte geschafft! 🔥';
      if(subEl)subEl.textContent='Du hast schon viel gelernt. Mach weiter, der Profi wartet!';
    }else if(pct<100){
      welcomeEl.textContent='Endspurt – du bist fast am Ziel! 🏁';
      if(subEl)subEl.textContent='Nur noch wenige Lektionen bis zum kompletten Lernpfad.';
    }else{
      welcomeEl.textContent='Du hast es geschafft! 🏆';
      if(subEl)subEl.textContent='Alle Module abgeschlossen. Zeit, das Wissen anzuwenden!';
    }
  }

  // Stats grid
  var statsGrid=document.getElementById('coachStatsGrid');
  if(statsGrid){
    var bm=D.coachingBookmarks||{};
    var bmCount=Object.keys(bm).length;
    var streak=coachCalculateStreak();
    var modulesDone=COACHING_MODULES.filter(function(m){
      return m.lessons.every(function(l){return D.coachingProgress[l.id];});
    }).length;
    var modulesContentStat=COACHING_MODULES.filter(function(m){return m.lessons.length>0;}).length;
    var modulesDoneStat=COACHING_MODULES.filter(function(m){return m.lessons.length>0&&m.lessons.every(function(l){return D.coachingProgress&&D.coachingProgress[l.id];});}).length;

    statsGrid.innerHTML=
      coachStatCard('📚','Themen',modulesDoneStat+'/'+modulesContentStat,'abgeschlossen','ac')+
      coachStatCard('✅','Lektionen',doneLessons+'/'+totalLessons,'erledigt','gn')+
      coachStatCard('⏱','Lernzeit',doneMinutes+' Min',totalMinutes+' Min Gesamt','bl')+
      coachStatCard('⭐','Lesezeichen',bmCount,bmCount===1?'gespeichert':bmCount+' gespeichert','pu')+
      coachStatCard('🔥','Lern-Streak',streak.days,streak.days===1?'Tag':streak.days+' Tage in Folge','pk');
  }

  // Continue card
  coachRenderContinueCard();

  // Render PHASEN-PFAD (Lernreise mit Gating)
  var dashGrid=document.getElementById('coachDashboardModules');
  if(dashGrid){
    var prog2=D.coachingProgress||{};
    var html='<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px">';
    COACHING_MODULES.forEach(function(m){
      var total=m.lessons.length,done=0,totalMin=0;
      m.lessons.forEach(function(l){if(prog2[l.id])done++;totalMin+=parseInt((l.readTime||'5').match(/\d+/)||[5],10);});
      var pct2=total>0?Math.round(done/total*100):0;
      var allDone=total>0&&done===total;
      var col='var(--'+(m.color||'ac')+')';
      var colBg='var(--'+(m.color||'ac')+'d)';
      html+='<div onclick="coachOpenModule(\''+m.id+'\')" style="background:linear-gradient(135deg,'+colBg+',var(--s1));border:1.5px solid '+(allDone?'var(--gn)':col+'66')+';border-radius:14px;padding:18px 20px;cursor:pointer;transition:all .18s;display:flex;flex-direction:column;gap:12px;position:relative;overflow:hidden" '+
        'onmouseover="this.style.transform=\'translateY(-3px)\';this.style.boxShadow=\'0 8px 24px rgba(0,0,0,.3)\'" onmouseout="this.style.transform=\'none\';this.style.boxShadow=\'none\'">'+
        '<div style="position:absolute;top:-30px;right:-30px;width:130px;height:130px;background:radial-gradient(circle,'+col+'22,transparent 70%);pointer-events:none"></div>'+
        '<div style="display:flex;align-items:flex-start;gap:13px;position:relative">'+
          '<div style="width:50px;height:50px;border-radius:13px;background:'+col+';color:#fff;display:flex;align-items:center;justify-content:center;font-size:26px;flex-shrink:0">'+m.icon+'</div>'+
          '<div style="flex:1;min-width:0">'+
            '<div style="font-size:17px;font-weight:800;color:var(--tx);font-family:\'Playfair Display\',serif;line-height:1.2;margin-bottom:3px">'+esc(m.title)+'</div>'+
            '<div style="font-size:12px;color:var(--tx2);line-height:1.45">'+esc(m.desc||'')+'</div>'+
          '</div>'+
        '</div>'+
        '<div style="display:flex;gap:14px;font-size:11.5px;color:var(--tx2);position:relative">'+
          '<div><b style="color:'+col+';font-size:13px">'+total+'</b> Lektion'+(total===1?'':'en')+'</div>'+
          '<div><b style="color:'+col+';font-size:13px">'+totalMin+'</b> Min</div>'+
          '<div style="margin-left:auto;color:'+col+';font-weight:700">'+done+' / '+total+'</div>'+
        '</div>'+
        '<div style="height:6px;background:var(--s3);border-radius:3px;overflow:hidden;position:relative"><div style="height:100%;background:'+(allDone?'var(--gn)':col)+';width:'+pct2+'%;transition:width .35s"></div></div>'+
        '<div style="background:'+(allDone?'var(--gn)':col)+';color:#fff;padding:10px 16px;border-radius:9px;text-align:center;font-weight:700;font-size:12.5px;display:flex;align-items:center;justify-content:center;gap:8px;position:relative">'+
          (done===0?'▶️ Starten':(allDone?'✓ Abgeschlossen — nochmal ansehen':'▶️ Weiterlernen ('+(total-done)+' offen)'))+'<span>→</span></div>'+
      '</div>';
    });
    html+='</div>';
    dashGrid.innerHTML=html;
    dashGrid.style.display='block';
  }

  // Update sidebar badge
  coachUpdateSidebarBadge(doneLessons,totalLessons,pct);
  coachUpdateBookmarkBadge();
}

function coachStatCard(icon,label,val,sub,color){
  return '<div style="background:var(--s1);border:1px solid var(--bd);border-left:3px solid var(--'+color+');border-radius:10px;padding:14px 16px">'+
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">'+
      '<span style="font-size:18px">'+icon+'</span>'+
      '<span style="font-size:10px;color:var(--tx2);text-transform:uppercase;letter-spacing:1px;font-weight:700">'+esc(label)+'</span>'+
    '</div>'+
    '<div style="font-size:24px;font-weight:800;color:var(--tx);font-family:\'Playfair Display\',serif;line-height:1">'+esc(String(val))+'</div>'+
    '<div style="font-size:11px;color:var(--tx3);margin-top:3px">'+esc(sub)+'</div>'+
  '</div>';
}

function coachCalculateStreak(){
  // Calculate days streak based on coachingProgress timestamps
  var dates={};
  Object.keys(D.coachingProgress||{}).forEach(function(lid){
    var d=new Date(D.coachingProgress[lid]);
    var key=d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate();
    dates[key]=true;
  });
  if(!Object.keys(dates).length)return {days:0};
  // Walk backwards from today
  var streak=0;
  var d=new Date();
  for(var i=0;i<60;i++){
    var k=d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate();
    if(dates[k]){streak++;}
    else if(i>0){break;} // allow today to be empty, but break on first empty day after
    d.setDate(d.getDate()-1);
  }
  return {days:streak};
}

function coachRenderContinueCard(){
  var box=document.getElementById('coachContinueCard');
  if(!box)return;
  var next=coachFindNextLesson();
  if(!next){
    box.innerHTML='';
    return;
  }
  var color='var(--'+next.mod.color+')';
  var lessonIdx=next.mod.lessons.findIndex(function(l){return l.id===next.lesson.id;});
  var modProgress=next.mod.lessons.filter(function(l){return D.coachingProgress[l.id];}).length;

  box.innerHTML=
    '<div style="background:linear-gradient(135deg,var(--s1),var(--s2));border:1.5px solid '+color+';border-radius:12px;padding:18px 22px;margin:18px 0;display:grid;grid-template-columns:auto 1fr auto;gap:18px;align-items:center;cursor:pointer;transition:all .15s" onmouseover="this.style.transform=\'translateY(-2px)\';this.style.boxShadow=\'0 6px 20px rgba(0,0,0,.4)\'" onmouseout="this.style.transform=\'none\';this.style.boxShadow=\'none\'" onclick="go_lesson(\''+next.mod.id+'\',\''+next.lesson.id+'\')">'+
      '<div style="font-size:36px">'+next.mod.icon+'</div>'+
      '<div>'+
        '<div style="font-size:10px;color:'+color+';text-transform:uppercase;letter-spacing:1.5px;font-weight:700;margin-bottom:3px">▶️ Weiterlernen</div>'+
        '<div style="font-size:17px;font-weight:700;color:var(--tx);margin-bottom:3px">'+esc(next.lesson.title)+'</div>'+
        '<div style="font-size:12px;color:var(--tx2)">'+esc(next.mod.title)+' · Lektion '+(lessonIdx+1)+' von '+next.mod.lessons.length+' · ⏱ '+esc(next.lesson.readTime||'')+'</div>'+
      '</div>'+
      '<div style="background:'+color+';color:#fff;padding:12px 22px;border-radius:10px;font-weight:700;font-size:13px">▶️ Starten</div>'+
    '</div>';
}

// ═══════════════════════════════════════════════════════════════
// MODULE CARD BUILDER (used by dashboard)
// ═══════════════════════════════════════════════════════════════

function coachBuildModuleCard(mod,compact){
  var modDone=mod.lessons.filter(function(l){return D.coachingProgress[l.id];}).length;
  var modTotal=mod.lessons.length;
  var modPct=modTotal>0?(modDone/modTotal)*100:0;
  var color='var(--'+mod.color+')';
  var bgColor='var(--'+mod.color+'d)';
  var allDone=modDone===modTotal&&modTotal>0;

  var card=document.createElement('div');
  card.style.cssText='background:var(--s1);border:1.5px solid '+(allDone?'var(--gn)':'var(--bd2)')+';border-radius:12px;padding:18px;cursor:pointer;transition:all .18s;position:relative';
  card.onmouseenter=function(){this.style.borderColor=color;this.style.transform='translateY(-3px)';this.style.boxShadow='0 8px 24px rgba(0,0,0,.4)'};
  card.onmouseleave=function(){this.style.borderColor=allDone?'var(--gn)':'var(--bd2)';this.style.transform='translateY(0)';this.style.boxShadow=''};
  card.onclick=function(){coachOpenModule(mod.id);};

  // Don't show full lesson list in compact dashboard preview
  var lessonsPreview='';
  if(!compact){
    mod.lessons.slice(0,4).forEach(function(l){
      var done=!!D.coachingProgress[l.id];
      lessonsPreview+='<div style="display:flex;align-items:center;gap:8px;padding:6px 0;font-size:12px;color:'+(done?'var(--gn)':'var(--tx2)')+'"><span style="font-size:14px">'+(done?'✓':'○')+'</span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(l.title)+'</span></div>';
    });
    if(mod.lessons.length>4){
      lessonsPreview+='<div style="font-size:11px;color:var(--tx3);margin-top:4px;font-style:italic">+ '+(mod.lessons.length-4)+' weitere Lektionen…</div>';
    }
  }

  card.innerHTML=
    (allDone?'<div style="position:absolute;top:12px;right:12px;background:var(--gn);color:#fff;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800">✓</div>':'')+
    '<div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:12px">'+
      '<div style="width:48px;height:48px;border-radius:11px;background:'+bgColor+';color:'+color+';display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0">'+mod.icon+'</div>'+
      '<div style="flex:1;min-width:0">'+
        '<div style="font-weight:700;color:var(--tx);font-size:15px;line-height:1.25;margin-bottom:3px">'+esc(mod.title)+'</div>'+
        '<div style="font-size:11px;color:var(--tx2);line-height:1.4">'+esc(mod.desc||'')+'</div>'+
      '</div>'+
    '</div>'+
    '<div style="margin:12px 0">'+
      '<div style="display:flex;justify-content:space-between;font-size:10px;color:var(--tx2);margin-bottom:5px"><span>'+modTotal+' Lektion'+(modTotal===1?'':'en')+'</span><span style="font-weight:700;color:'+color+'">'+modDone+'/'+modTotal+'</span></div>'+
      '<div style="height:5px;background:var(--s3);border-radius:3px;overflow:hidden"><div style="height:100%;background:'+color+';width:'+modPct+'%;transition:width .35s"></div></div>'+
    '</div>'+
    (compact?'':'<div style="border-top:1px solid var(--bd);padding-top:10px;margin-top:10px">'+lessonsPreview+'</div>')+
    '<div style="margin-top:12px;padding:10px 14px;background:'+color+';color:#fff;border-radius:8px;text-align:center;font-weight:700;font-size:12px">'+(modDone===0?'▶️ Modul starten':(allDone?'✓ Modul wiederholen':'▶️ Fortsetzen ('+(modTotal-modDone)+' offen)'))+'</div>';

  return card;
}

// ═══════════════════════════════════════════════════════════════
// VIEW: SINGLE MODULE
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// VIEW: CATEGORY (Lernbereich-Übersicht)
// ═══════════════════════════════════════════════════════════════

function coachRenderCategory(){
  var cat=COACHING_CATEGORIES.find(function(c){return c.id===coachCurrentCategoryId;});
  if(!cat){coachShowView('dashboard');return;}
  var box=document.getElementById('coachCategoryContent');
  if(!box)return;

  var modules=coachGetModulesInCategory(cat.id);
  var prog=D.coachingProgress||{};
  var color='var(--'+cat.color+')';

  // Calc category stats
  var catTotal=0,catDone=0,totalMin=0,doneMin=0;
  modules.forEach(function(mod){
    mod.lessons.forEach(function(l){
      catTotal++;
      var min=parseInt((l.readTime||'5').match(/\d+/)||[5],10);
      totalMin+=min;
      if(prog[l.id]){catDone++;doneMin+=min;}
    });
  });
  var catPct=catTotal>0?Math.round((catDone/catTotal)*100):0;

  // Hero block
  var heroHtml=
    '<div style="background:linear-gradient(135deg,#1a2233 0%,#0f1729 100%);border-radius:16px;padding:30px 36px;margin-bottom:24px;color:#fff;display:grid;grid-template-columns:auto 1fr auto;gap:24px;align-items:center;position:relative;overflow:hidden">'+
      '<div style="position:absolute;top:-60px;right:-60px;width:280px;height:280px;background:radial-gradient(circle,'+color+'33,transparent 70%);pointer-events:none"></div>'+
      '<div style="font-size:72px;position:relative;z-index:1">'+cat.icon+'</div>'+
      '<div style="position:relative;z-index:1">'+
        '<div style="font-size:12px;text-transform:uppercase;letter-spacing:2px;color:rgba(255,255,255,.6);font-weight:700;margin-bottom:6px">Lernbereich</div>'+
        '<div style="font-size:32px;font-weight:800;font-family:\'Playfair Display\',serif;margin-bottom:8px">'+esc(cat.title)+'</div>'+
        '<div style="font-size:15px;color:rgba(255,255,255,.8);margin-bottom:16px;max-width:560px;line-height:1.5">'+esc(cat.desc)+'</div>'+
        '<div style="display:flex;gap:24px;font-size:14px;color:rgba(255,255,255,.85)">'+
          '<div><b style="color:'+color+';font-size:18px">'+modules.length+'</b> Module</div>'+
          '<div><b style="color:'+color+';font-size:18px">'+catTotal+'</b> Lektionen</div>'+
          '<div><b style="color:'+color+';font-size:18px">'+totalMin+'</b> Min Lesezeit</div>'+
          '<div><b style="color:'+color+';font-size:18px">'+catDone+'</b> abgeschlossen</div>'+
        '</div>'+
      '</div>'+
      '<div style="position:relative;z-index:1;text-align:center">'+
        '<div style="font-size:48px;font-weight:800;color:'+color+';font-family:\'Playfair Display\',serif;line-height:1">'+catPct+'%</div>'+
        '<div style="font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:rgba(255,255,255,.6);margin-top:6px">Fortschritt</div>'+
        '<div style="margin-top:12px;width:140px;height:7px;background:rgba(255,255,255,.15);border-radius:4px;overflow:hidden"><div style="height:100%;background:'+color+';width:'+catPct+'%;transition:width .5s"></div></div>'+
      '</div>'+
    '</div>';

  // Module-cards in this category
  var modulesHtml='<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">'+
    '<h2 style="font-size:16px;text-transform:uppercase;letter-spacing:2px;color:var(--tx2);font-weight:700;margin:0">📚 Module in diesem Lernbereich</h2>'+
    '<span style="font-size:12px;color:var(--tx3)">Klick auf ein Modul, um die Lektionen zu öffnen</span>'+
  '</div>';
  modulesHtml+='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:16px">';
  modules.forEach(function(mod,i){
    var modDone=mod.lessons.filter(function(l){return prog[l.id];}).length;
    var modTotal=mod.lessons.length;
    var modPct=modTotal>0?Math.round((modDone/modTotal)*100):0;
    var modColor='var(--'+mod.color+')';
    var modBg='var(--'+mod.color+'d)';
    var allDone=modDone===modTotal&&modTotal>0;

    modulesHtml+='<div onclick="coachOpenModule(\''+mod.id+'\')" '+
      'style="background:var(--s1);border:1.5px solid '+(allDone?'var(--gn)':'var(--bd2)')+';border-radius:14px;padding:20px;cursor:pointer;transition:all .18s;position:relative" '+
      'onmouseover="this.style.borderColor=\''+modColor+'\';this.style.transform=\'translateY(-3px)\';this.style.boxShadow=\'0 8px 24px rgba(0,0,0,.4)\'" '+
      'onmouseout="this.style.borderColor=\''+(allDone?'var(--gn)':'var(--bd2)')+'\';this.style.transform=\'translateY(0)\';this.style.boxShadow=\'\'">'+
      // Number badge
      '<div style="position:absolute;top:14px;right:14px;background:'+(allDone?'var(--gn)':modColor)+';color:#fff;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800">'+(allDone?'✓':(i+1))+'</div>'+
      '<div style="display:flex;align-items:flex-start;gap:14px;margin-bottom:14px;padding-right:36px">'+
        '<div style="width:54px;height:54px;border-radius:12px;background:'+modBg+';color:'+modColor+';display:flex;align-items:center;justify-content:center;font-size:28px;flex-shrink:0">'+mod.icon+'</div>'+
        '<div style="flex:1;min-width:0">'+
          '<div style="font-weight:700;color:var(--tx);font-size:17px;line-height:1.3;margin-bottom:4px">'+esc(mod.title)+'</div>'+
          '<div style="font-size:13px;color:var(--tx2);line-height:1.45">'+esc(mod.desc||'')+'</div>'+
        '</div>'+
      '</div>'+
      '<div style="margin:14px 0">'+
        '<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--tx2);margin-bottom:5px"><span>'+modTotal+' Lektion'+(modTotal===1?'':'en')+'</span><span style="font-weight:700;color:'+modColor+'">'+modDone+' / '+modTotal+'</span></div>'+
        '<div style="height:6px;background:var(--s3);border-radius:3px;overflow:hidden"><div style="height:100%;background:'+modColor+';width:'+modPct+'%;transition:width .35s"></div></div>'+
      '</div>'+
      '<div style="margin-top:14px;padding:11px 16px;background:'+modColor+';color:#fff;border-radius:9px;text-align:center;font-weight:700;font-size:13px">'+
        (modDone===0?'▶️ Modul starten':(allDone?'✓ Modul wiederholen':'▶️ Fortsetzen ('+(modTotal-modDone)+' offen)'))+
      '</div>'+
    '</div>';
  });
  modulesHtml+='</div>';

  box.innerHTML=heroHtml+modulesHtml;
}

// ═══════════════════════════════════════════════════════════════
// VIEW: SINGLE MODULE
// ═══════════════════════════════════════════════════════════════

function coachRenderSingleModule(){
  var mod=COACHING_MODULES.find(function(m){return m.id===coachCurrentModuleId;});
  if(!mod){coachShowView('modules');return;}
  var box=document.getElementById('coachModuleContent');
  if(!box)return;

  var modDone=mod.lessons.filter(function(l){return D.coachingProgress[l.id];}).length;
  var modTotal=mod.lessons.length;
  var modPct=modTotal>0?Math.round((modDone/modTotal)*100):0;
  var color='var(--'+mod.color+')';
  var bgColor='var(--'+mod.color+'d)';

  var totalMin=0,doneMin=0;
  mod.lessons.forEach(function(l){
    var m=parseInt((l.readTime||'5').match(/\d+/)||[5],10);
    totalMin+=m;
    if(D.coachingProgress[l.id])doneMin+=m;
  });

  // Hero block
  var heroHtml=
    '<div style="background:linear-gradient(135deg,#1a2233 0%,#0f1729 100%);border-radius:14px;padding:26px 30px;margin-bottom:20px;color:#fff;display:grid;grid-template-columns:auto 1fr auto;gap:20px;align-items:center;position:relative;overflow:hidden">'+
      '<div style="position:absolute;top:-50px;right:-50px;width:240px;height:240px;background:radial-gradient(circle,'+color+'33,transparent 70%);pointer-events:none"></div>'+
      '<div style="font-size:64px;position:relative;z-index:1">'+mod.icon+'</div>'+
      '<div style="position:relative;z-index:1">'+
        '<div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;color:rgba(255,255,255,.6);font-weight:700;margin-bottom:4px">Modul</div>'+
        '<div style="font-size:26px;font-weight:800;font-family:\'Playfair Display\',serif;margin-bottom:6px">'+esc(mod.title)+'</div>'+
        '<div style="font-size:13px;color:rgba(255,255,255,.75);margin-bottom:14px;max-width:520px">'+esc(mod.desc||'')+'</div>'+
        '<div style="display:flex;gap:18px;font-size:12px;color:rgba(255,255,255,.85)">'+
          '<div><b style="color:'+color+'">'+modTotal+'</b> Lektionen</div>'+
          '<div><b style="color:'+color+'">'+totalMin+'</b> Min Lesezeit</div>'+
          '<div><b style="color:'+color+'">'+modDone+'</b> abgeschlossen</div>'+
        '</div>'+
      '</div>'+
      '<div style="position:relative;z-index:1;text-align:center">'+
        '<div style="font-size:42px;font-weight:800;color:'+color+';font-family:\'Playfair Display\',serif;line-height:1">'+modPct+'%</div>'+
        '<div style="font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:rgba(255,255,255,.6);margin-top:4px">Fortschritt</div>'+
        '<div style="margin-top:10px;width:120px;height:6px;background:rgba(255,255,255,.15);border-radius:3px;overflow:hidden"><div style="height:100%;background:'+color+';width:'+modPct+'%;transition:width .5s"></div></div>'+
      '</div>'+
    '</div>';

  // Lessons list as cards
  var lessonsHtml='<div style="display:grid;grid-template-columns:1fr;gap:10px">';
  mod.lessons.forEach(function(l,i){
    var done=!!D.coachingProgress[l.id];
    var bm=D.coachingBookmarks&&D.coachingBookmarks[l.id];
    lessonsHtml+='<button onclick="go_lesson(\''+mod.id+'\',\''+l.id+'\')" style="display:flex;align-items:center;gap:14px;background:'+(done?'var(--gnd)':'var(--s1)')+';border:1.5px solid '+(done?'var(--gn)':'var(--bd)')+';border-radius:10px;padding:14px 18px;cursor:pointer;font-family:inherit;color:var(--tx);text-align:left;transition:all .15s" onmouseover="this.style.borderColor=\''+color+'\';this.style.transform=\'translateX(4px)\'" onmouseout="this.style.borderColor=\''+(done?'var(--gn)':'var(--bd)')+'\';this.style.transform=\'none\'">'+
      '<div style="width:36px;height:36px;border-radius:50%;background:'+(done?'var(--gn)':color)+';color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;flex-shrink:0">'+(done?'✓':(i+1))+'</div>'+
      '<div style="flex:1;min-width:0">'+
        '<div style="font-weight:700;color:var(--tx);font-size:14px;margin-bottom:2px">'+esc(l.title)+(bm?' <span style="color:var(--ac)" title="Lesezeichen">⭐</span>':'')+'</div>'+
        '<div style="font-size:11px;color:var(--tx2)">⏱ '+esc(l.readTime||'')+(l.videoTitle?' · 📺 Video inklusive':'')+'</div>'+
      '</div>'+
      '<div style="font-size:18px;color:var(--tx3)">'+(done?'↻':'▶️')+'</div>'+
    '</button>';
  });
  lessonsHtml+='</div>';

  box.innerHTML=heroHtml+
    '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px">'+
      '<h2 style="font-size:14px;text-transform:uppercase;letter-spacing:2px;color:var(--tx2);font-weight:700;margin:0">📖 Lektionen</h2>'+
      (modDone<modTotal?'<button class="btn btn-p" onclick="coachStartModule(\''+mod.id+'\')" style="background:linear-gradient(135deg,'+color+',var(--ac2));border:none">▶️ '+(modDone===0?'Modul starten':'Weiterlernen')+'</button>':'')+
    '</div>'+
    lessonsHtml;
}

function coachStartModule(modId){
  var mod=COACHING_MODULES.find(function(m){return m.id===modId;});
  if(!mod)return;
  // Find first unfinished lesson in this module
  var next=mod.lessons.find(function(l){return !D.coachingProgress[l.id];});
  if(!next)next=mod.lessons[0]; // all done -> restart from beginning
  go_lesson(modId,next.id);
}

// ═══════════════════════════════════════════════════════════════
// VIEW: BOOKMARKS
// ═══════════════════════════════════════════════════════════════

function coachRenderBookmarks(){
  var bm=D.coachingBookmarks||{};
  var keys=Object.keys(bm);
  var sub=document.getElementById('bookmarkSubtitle');
  if(sub)sub.textContent=keys.length+' Lektion'+(keys.length===1?'':'en')+' gespeichert';

  var box=document.getElementById('coachBookmarksList');
  if(!box)return;
  if(!keys.length){
    box.innerHTML='<div style="background:var(--s1);border:1px solid var(--bd);border-radius:10px;padding:30px;text-align:center;color:var(--tx2)"><div style="font-size:36px;margin-bottom:10px">⭐</div><div style="font-weight:700;color:var(--tx);margin-bottom:6px">Noch keine Lesezeichen</div><div style="font-size:12px">Klicke beim Lesen einer Lektion auf das Stern-Symbol, um sie hier zu speichern.</div></div>';
    return;
  }

  // Build matched lessons sorted by bookmark date (newest first)
  var entries=[];
  keys.forEach(function(lid){
    COACHING_MODULES.forEach(function(mod){
      var l=mod.lessons.find(function(x){return x.id===lid;});
      if(l)entries.push({mod:mod,lesson:l,date:bm[lid]});
    });
  });
  entries.sort(function(a,b){return new Date(b.date)-new Date(a.date);});

  box.innerHTML=entries.map(function(e){
    var done=!!D.coachingProgress[e.lesson.id];
    var color='var(--'+e.mod.color+')';
    var d=new Date(e.date);
    var ds=d.toLocaleDateString('de-DE',{day:'2-digit',month:'short',year:'numeric'});
    return '<button onclick="go_lesson(\''+e.mod.id+'\',\''+e.lesson.id+'\')" style="display:block;width:100%;text-align:left;background:var(--s1);border:1px solid var(--bd);border-radius:10px;padding:14px 18px;margin-bottom:8px;cursor:pointer;font-family:inherit;color:var(--tx);transition:all .15s" onmouseover="this.style.borderColor=\''+color+'\'" onmouseout="this.style.borderColor=\'var(--bd)\'">'+
      '<div style="display:flex;align-items:center;gap:12px">'+
        '<div style="font-size:24px">⭐</div>'+
        '<div style="flex:1;min-width:0">'+
          '<div style="font-size:11px;color:'+color+';text-transform:uppercase;letter-spacing:1px;font-weight:700">'+e.mod.icon+' '+esc(e.mod.title)+'</div>'+
          '<div style="font-size:14px;font-weight:700;color:var(--tx);margin:2px 0">'+esc(e.lesson.title)+(done?' <span style="color:var(--gn);font-size:12px">✓</span>':'')+'</div>'+
          '<div style="font-size:11px;color:var(--tx3)">⏱ '+esc(e.lesson.readTime||'')+' · gespeichert am '+ds+'</div>'+
        '</div>'+
        '<div style="font-size:18px;color:var(--tx3)">→</div>'+
      '</div>'+
    '</button>';
  }).join('');
}

// ═══════════════════════════════════════════════════════════════
// VIEW: COMPLETED
// ═══════════════════════════════════════════════════════════════

function coachRenderCompleted(){
  var prog=D.coachingProgress||{};
  var keys=Object.keys(prog);
  var sub=document.getElementById('completedSubtitle');
  if(sub)sub.textContent=keys.length+' Lektion'+(keys.length===1?'':'en')+' abgeschlossen';

  var box=document.getElementById('coachCompletedList');
  if(!box)return;
  if(!keys.length){
    box.innerHTML='<div style="background:var(--s1);border:1px solid var(--bd);border-radius:10px;padding:30px;text-align:center;color:var(--tx2)"><div style="font-size:36px;margin-bottom:10px">📚</div><div style="font-weight:700;color:var(--tx);margin-bottom:6px">Noch keine Lektion abgeschlossen</div><div style="font-size:12px">Starte mit einem Modul aus der Übersicht!</div><button class="btn btn-p" onclick="coachShowView(\'modules\')" style="margin-top:14px">📚 Module ansehen</button></div>';
    return;
  }

  // Group by module
  var html='';
  COACHING_MODULES.forEach(function(mod){
    var done=mod.lessons.filter(function(l){return prog[l.id];});
    if(!done.length)return;
    var color='var(--'+mod.color+')';
    html+='<div style="background:var(--s1);border:1px solid var(--bd);border-radius:10px;padding:14px 18px;margin-bottom:10px">'+
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid var(--bd)">'+
        '<div style="font-size:20px">'+mod.icon+'</div>'+
        '<div style="flex:1"><div style="font-weight:700;color:var(--tx);font-size:14px">'+esc(mod.title)+'</div>'+
        '<div style="font-size:11px;color:var(--tx2)">'+done.length+' / '+mod.lessons.length+' Lektionen abgeschlossen</div></div>'+
        '<button class="btn btn-sm" onclick="coachOpenModule(\''+mod.id+'\')">Modul öffnen</button>'+
      '</div>';
    done.forEach(function(l){
      var d=new Date(prog[l.id]);
      var ds=d.toLocaleDateString('de-DE',{day:'2-digit',month:'short',year:'numeric'});
      html+='<div onclick="go_lesson(\''+mod.id+'\',\''+l.id+'\')" style="display:flex;align-items:center;gap:10px;padding:8px 4px;cursor:pointer;border-radius:6px" onmouseover="this.style.background=\'var(--s2)\'" onmouseout="this.style.background=\'transparent\'">'+
        '<div style="color:var(--gn);font-size:14px">✓</div>'+
        '<div style="flex:1;font-size:13px;color:var(--tx)">'+esc(l.title)+'</div>'+
        '<div style="font-size:10px;color:var(--tx3)">'+ds+'</div>'+
      '</div>';
    });
    html+='</div>';
  });
  box.innerHTML=html;
}

// ═══════════════════════════════════════════════════════════════
// LESSON RENDERER (with bookmark + sidebar)
// ═══════════════════════════════════════════════════════════════

function toggleVideoEmbed(lessonId){
  var body=document.getElementById('videoBody_'+lessonId);
  var toggle=document.getElementById('videoToggle_'+lessonId);
  var frame=document.getElementById('videoFrame_'+lessonId);
  if(!body)return;
  if(body.style.display==='none'||!body.style.display){
    // Lazy-load src
    if(frame && frame.dataset.src && !frame.src){frame.src=frame.dataset.src;}
    body.style.display='block';
    if(toggle)toggle.textContent='▴';
  }else{
    body.style.display='none';
    if(toggle)toggle.textContent='▾';
  }
}

// ═══════════════════════════════════════════════════════════════
// PROMPT COPY & CHECKLIST HELPERS
// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
// HELP / TOOLTIP / INFO-CARD HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Generates a help icon (ⓘ) with hover tooltip.
 * @param {string} text - Tooltip content (supports \n for line breaks)
 * @param {string} alignment - 'left'|'right' (right for icons near right edge)
 */
function wikaHelpIcon(text,alignment){
  if(!text)return '';
  var safe=String(text).replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  var cls='wika-help'+(alignment==='right'?' wika-help-right':'');
  return '<span class="'+cls+'" data-tooltip="'+safe+'" aria-label="Hilfe">ⓘ</span>';
}

/**
 * Generates an info-card HTML for a page's top area.
 * @param {Object} opts - {icon, title, text, color, actions:[{label,onclick,primary}], lessonId, dismissKey}
 */
function wikaInfoCard(opts){
  opts=opts||{};
  var color=opts.color||'';
  var icon=opts.icon||'💡';
  var title=opts.title||'';
  var text=opts.text||'';
  var actions=opts.actions||[];
  var dismissKey=opts.dismissKey||null;
  var lessonId=opts.lessonId||null;
  var moduleId=opts.moduleId||'recherche_prozess';

  // Check if dismissed
  if(dismissKey && localStorage.getItem('wika_info_dismissed_'+dismissKey)==='1'){
    return '<div style="margin-bottom:8px;text-align:right"><button onclick="wikaShowInfoCard(\''+dismissKey+'\')" style="background:transparent;border:1px solid var(--bd);color:var(--tx3);font-family:inherit;font-size:11px;padding:4px 10px;border-radius:6px;cursor:pointer">ⓘ Erklärung einblenden</button></div>';
  }

  var actionHtml='';
  // Auto-add lesson link if lessonId given
  if(lessonId){
    actions.unshift({
      label:'📖 Vollständige Anleitung',
      onclick:'researchOpenLesson(\''+lessonId+'\',\''+moduleId+'\')',
      primary:false
    });
  }
  if(actions.length>0){
    actionHtml='<div class="wika-info-card-actions">';
    actions.forEach(function(a){
      var p=a.primary?' primary':'';
      actionHtml+='<button class="wika-info-card-action'+p+'" onclick="'+a.onclick+'">'+a.label+'</button>';
    });
    actionHtml+='</div>';
  }

  var dismissBtn=dismissKey?'<button class="wika-info-card-toggle" onclick="wikaDismissInfoCard(\''+dismissKey+'\',this)" title="Erklärung ausblenden">✕</button>':'';

  return '<div class="wika-info-card '+color+'" id="info-card-'+(dismissKey||'static')+'">'+
    '<div class="wika-info-card-icon">'+icon+'</div>'+
    '<div class="wika-info-card-content">'+
      '<div class="wika-info-card-title">'+title+'</div>'+
      '<div class="wika-info-card-text">'+text+'</div>'+
      actionHtml+
    '</div>'+
    dismissBtn+
  '</div>';
}

function wikaDismissInfoCard(key,btn){
  localStorage.setItem('wika_info_dismissed_'+key,'1');
  var card=document.getElementById('info-card-'+key);
  if(card){
    // Replace with show-button
    card.outerHTML='<div style="margin-bottom:8px;text-align:right"><button onclick="wikaShowInfoCard(\''+key+'\')" style="background:transparent;border:1px solid var(--bd);color:var(--tx3);font-family:inherit;font-size:11px;padding:4px 10px;border-radius:6px;cursor:pointer">ⓘ Erklärung einblenden</button></div>';
  }
}

function wikaShowInfoCard(key){
  localStorage.removeItem('wika_info_dismissed_'+key);
  // Force re-render of current page
  var page=document.querySelector('.page.active');
  if(page){
    var pid=page.id.replace('p-','');
    if(typeof go==='function')go(pid);
  }
}

/**
 * Empty-state guide with numbered first steps.
 * @param {Object} opts - {icon, title, text, steps:[{text}], action:{label,onclick}, lessonId}
 */
function wikaEmptyGuide(opts){
  opts=opts||{};
  var icon=opts.icon||'📋';
  var title=opts.title||'Noch keine Daten';
  var text=opts.text||'';
  var steps=opts.steps||[];
  var action=opts.action||null;
  var lessonId=opts.lessonId||null;
  var moduleId=opts.moduleId||'recherche_prozess';

  var stepsHtml='';
  if(steps.length>0){
    stepsHtml='<div class="wika-empty-guide-steps">';
    steps.forEach(function(s,i){
      stepsHtml+='<div class="wika-empty-guide-step"><div class="wika-empty-guide-step-num">'+(i+1)+'</div><div>'+s+'</div></div>';
    });
    stepsHtml+='</div>';
  }

  var actionHtml='<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:14px">';
  if(action){
    actionHtml+='<button class="btn btn-p" onclick="'+action.onclick+'" style="font-size:13px">'+action.label+'</button>';
  }
  if(lessonId){
    actionHtml+='<button class="btn btn-sm" onclick="researchOpenLesson(\''+lessonId+'\',\''+moduleId+'\')" style="background:var(--gnd);color:var(--gn);border:1px solid var(--gn);font-size:12px">📖 Methodik nachlesen</button>';
  }
  actionHtml+='</div>';

  return '<div class="wika-empty-guide">'+
    '<div class="wika-empty-guide-icon">'+icon+'</div>'+
    '<div class="wika-empty-guide-title">'+title+'</div>'+
    '<div class="wika-empty-guide-text">'+text+'</div>'+
    stepsHtml+
    actionHtml+
  '</div>';
}

function wikaCopyPrompt(elementId,btn){
  var el=document.getElementById(elementId);
  if(!el)return;
  var text=el.textContent||el.innerText||'';
  var done=function(){
    if(!btn)return;
    var orig=btn.innerHTML;
    btn.innerHTML='✓ Kopiert!';
    btn.style.background='rgba(255,255,255,.35)';
    setTimeout(function(){
      btn.innerHTML=orig;
      btn.style.background='rgba(255,255,255,.18)';
    },1600);
    if(window.toast)toast('📋 Prompt in Zwischenablage kopiert');
  };
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(done).catch(function(){
      // Fallback
      var ta=document.createElement('textarea');
      ta.value=text;
      ta.style.position='fixed';
      ta.style.left='-9999px';
      document.body.appendChild(ta);
      ta.select();
      try{document.execCommand('copy');done();}catch(e){alert('Bitte manuell kopieren.');}
      document.body.removeChild(ta);
    });
  }else{
    var ta=document.createElement('textarea');
    ta.value=text;
    ta.style.position='fixed';
    ta.style.left='-9999px';
    document.body.appendChild(ta);
    ta.select();
    try{document.execCommand('copy');done();}catch(e){alert('Bitte manuell kopieren.');}
    document.body.removeChild(ta);
  }
}

function wikaToggleCheck(storageKey,index,checked){
  var state={};
  try{state=JSON.parse(localStorage.getItem(storageKey)||'{}');}catch(e){}
  if(checked)state[index]=new Date().toISOString();
  else delete state[index];
  try{localStorage.setItem(storageKey,JSON.stringify(state));}catch(e){}
  // Update label visual immediately
  var label=event.target.closest('label');
  if(label){
    var span=label.querySelector('span:last-child');
    if(span){
      if(checked){span.style.textDecoration='line-through';span.style.color='var(--tx3)';}
      else{span.style.textDecoration='';span.style.color='';}
    }
  }
}

function renderLessonView(){
  if(!currentLesson)return;
  var mod=currentLesson.module;
  var lesson=currentLesson.lesson;
  var done=!!D.coachingProgress[lesson.id];
  var bookmarked=!!(D.coachingBookmarks&&D.coachingBookmarks[lesson.id]);
  var color='var(--'+mod.color+')';

  // Build content HTML
  var contentHtml='';

  // Auto-banner: if this is the recherche_prozess module, show CTA to research workspace
  if(mod.id==='recherche_prozess'){
    contentHtml+='<div style="background:linear-gradient(135deg,var(--pud),var(--s2));border:1.5px solid var(--pu);border-radius:12px;padding:14px 18px;margin-bottom:20px;display:flex;align-items:center;gap:14px;flex-wrap:wrap">'+
      '<div style="font-size:30px">🎯</div>'+
      '<div style="flex:1;min-width:220px">'+
        '<div style="font-weight:700;color:var(--pu);font-size:14px;margin-bottom:3px">Bereit, das Gelernte anzuwenden?</div>'+
        '<div style="font-size:12px;color:var(--tx2);line-height:1.5">Diese Lektion erklärt die <b>Methodik</b>. Im Arbeitsbereich „Produktrecherche" kannst du sie direkt anwenden – mit Master-Tabelle, Workflow-Tracker und Score-Matrix.</div>'+
      '</div>'+
      '<button class="btn btn-p" onclick="go(\'research\')" style="background:var(--pu);color:#fff;border:none;white-space:nowrap">📊 Workflow starten →</button>'+
    '</div>';
  }

  lesson.content.forEach(function(block){
    if(block.h)contentHtml+='<h3 style="margin-top:34px;margin-bottom:14px;font-size:22px;color:'+color+';font-family:\'Playfair Display\',serif;padding-bottom:10px;border-bottom:2px solid '+color+'33;font-weight:700">'+esc(block.h)+'</h3>';
    if(block.h2)contentHtml+='<h4 style="margin-top:22px;margin-bottom:10px;font-size:17px;color:var(--tx);font-weight:700">'+esc(block.h2)+'</h4>';
    if(block.p)contentHtml+='<p style="line-height:1.8;color:var(--tx);margin-bottom:16px;font-size:16px;font-weight:400">'+block.p+'</p>';
    if(block.intro)contentHtml+='<div style="line-height:1.75;color:var(--tx);margin:0 0 24px 0;font-size:17px;font-style:italic;padding:18px 22px;background:var(--s2);border-radius:10px;border-left:4px solid '+color+'">'+block.intro+'</div>';
    if(block.section){
      // Clean visual separator with title
      contentHtml+='<div style="margin:38px 0 16px 0;padding-top:20px;border-top:2px solid var(--bd);display:flex;align-items:center;gap:12px;flex-wrap:wrap"><span style="background:'+color+';color:#fff;padding:5px 14px;border-radius:16px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px">'+esc(block.section.label||'Abschnitt')+'</span><span style="font-size:20px;font-weight:700;color:var(--tx);font-family:\'Playfair Display\',serif">'+esc(block.section.title||'')+'</span></div>';
      if(block.section.lead)contentHtml+='<p style="line-height:1.7;color:var(--tx2);margin-bottom:18px;font-size:15px;font-style:italic">'+block.section.lead+'</p>';
    }
    if(block.divider)contentHtml+='<hr style="margin:24px 0;border:none;border-top:1px dashed var(--bd2)">';
    if(block.l){
      contentHtml+='<ul style="list-style:none;padding:0;margin:0 0 16px 0">';
      block.l.forEach(function(item){
        contentHtml+='<li style="padding:10px 0 10px 24px;position:relative;line-height:1.7;color:var(--tx);font-size:15px;border-bottom:1px solid var(--bd)"><span style="position:absolute;left:0;color:'+color+';font-weight:700;font-size:16px">→</span>'+item+'</li>';
      });
      contentHtml+='</ul>';
    }
    if(block.table){
      var t=block.table;
      contentHtml+='<div style="overflow-x:auto;margin:16px 0"><table style="width:100%;font-size:14px"><thead><tr>';
      t.header.forEach(function(h){contentHtml+='<th style="text-align:left;padding:10px 14px;background:var(--s2);color:var(--tx2);font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:700">'+esc(h)+'</th>'});
      contentHtml+='</tr></thead><tbody>';
      t.rows.forEach(function(row){
        contentHtml+='<tr style="border-bottom:1px solid var(--bd)">';
        row.forEach(function(cell,i){
          var style=i===0?'padding:10px 14px;font-weight:600;color:var(--tx);font-size:14px':'padding:10px 14px;color:var(--tx2);font-size:14px';
          contentHtml+='<td style="'+style+'">'+esc(String(cell))+'</td>';
        });
        contentHtml+='</tr>';
      });
      contentHtml+='</tbody></table></div>';
    }
    if(block.tip){
      contentHtml+='<div style="background:var(--acd);border-left:4px solid var(--ac);border-radius:8px;padding:14px 18px;margin:16px 0;font-size:15px;line-height:1.65;color:var(--tx)">💡 <b style="color:var(--ac)">Tipp:</b> '+block.tip+'</div>';
    }
    if(block.warning){
      contentHtml+='<div style="background:var(--rdd);border-left:4px solid var(--rd);border-radius:8px;padding:14px 18px;margin:16px 0;font-size:15px;line-height:1.65;color:var(--tx)">⚠️ <b style="color:var(--rd)">Achtung:</b> '+block.warning+'</div>';
    }
    if(block.example){
      contentHtml+='<div style="background:var(--bld);border-left:4px solid var(--bl);border-radius:8px;padding:14px 18px;margin:16px 0;font-size:15px;line-height:1.65;color:var(--tx)">📌 <b style="color:var(--bl)">Beispiel:</b> '+block.example+'</div>';
    }
    if(block.success){
      contentHtml+='<div style="background:var(--gnd);border-left:4px solid var(--gn);border-radius:8px;padding:14px 18px;margin:16px 0;font-size:15px;line-height:1.65;color:var(--tx)">✅ <b style="color:var(--gn)">Best Practice:</b> '+block.success+'</div>';
    }
    if(block.formula){
      contentHtml+='<div style="background:linear-gradient(135deg,var(--s2),var(--s1));border:2px solid var(--ac);border-radius:10px;padding:20px 24px;margin:20px 0;text-align:center;font-family:\'SF Mono\',Menlo,Consolas,monospace;font-size:18px;color:var(--tx);font-weight:600;box-shadow:0 2px 8px rgba(15,23,41,.06)">'+(block.formulaTitle?'<div style="font-size:12px;text-transform:uppercase;letter-spacing:1.5px;color:var(--ac);font-weight:700;margin-bottom:10px;font-family:\'DM Sans\',sans-serif">📐 '+esc(block.formulaTitle)+'</div>':'')+block.formula+'</div>';
    }
    if(block.image){
      contentHtml+='<div style="margin:22px 0"><div style="background:linear-gradient(135deg,var(--s2),var(--s1));border:1px solid var(--bd2);border-radius:14px;padding:22px 24px;box-shadow:0 2px 12px rgba(0,0,0,.12)">'+
        '<div class="lesson-gfx" onclick="coachZoomImage(this)" title="Zum Vergrößern klicken" style="cursor:zoom-in;position:relative">'+block.image+'<div style="position:absolute;top:6px;right:6px;background:rgba(0,0,0,.55);color:#fff;font-size:10px;padding:3px 8px;border-radius:6px;pointer-events:none">🔍 Vergrößern</div></div>'+
        (block.caption?'<div style="font-size:12.5px;color:var(--tx2);margin-top:14px;text-align:center;font-style:italic;border-top:1px solid var(--bd);padding-top:12px">'+esc(block.caption)+'</div>':'')+
        '</div></div>';
    }
    if(block.visual){
      // Bild + Erklärtext als EINE Einheit (Beginner-freundlich: sehen + verstehen)
      var v=block.visual;
      var pos=v.textPos||'right';
      var gfx='<div class="lesson-gfx" onclick="coachZoomImage(this)" title="Zum Vergrößern klicken" style="min-width:0;cursor:zoom-in;position:relative">'+v.image+'<div style="position:absolute;top:6px;right:6px;background:rgba(0,0,0,.55);color:#fff;font-size:10px;padding:3px 8px;border-radius:6px;pointer-events:none">🔍 Vergrößern</div></div>';
      var txt='<div style="font-size:15px;line-height:1.75;color:var(--tx)">'+v.text+'</div>';
      var inner;
      if(pos==='top'){
        // Bild oben mittig, ausführlicher Text in voller Breite darunter
        inner='<div style="max-width:420px;margin:0 auto 16px">'+gfx+'</div>'+txt;
      }else if(pos==='left'){
        // Text links, Bild rechts
        inner='<div class="visual-grid" style="display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:24px;align-items:center">'+txt+gfx+'</div>';
      }else{
        // Standard: Bild links (kleiner), Text rechts (mehr Platz)
        inner='<div class="visual-grid" style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.4fr);gap:24px;align-items:center">'+gfx+txt+'</div>';
      }
      contentHtml+='<div style="margin:22px 0;background:linear-gradient(135deg,var(--s2),var(--s1));border:1px solid var(--bd2);border-radius:14px;padding:22px 24px;box-shadow:0 2px 12px rgba(0,0,0,.12)">'+
        (v.title?'<div style="font-size:16px;font-weight:800;color:var(--tx);margin-bottom:16px;font-family:\'Playfair Display\',serif">'+esc(v.title)+'</div>':'')+
        inner+
        (v.caption?'<div style="font-size:12px;color:var(--tx3);margin-top:14px;text-align:center;font-style:italic;border-top:1px solid var(--bd);padding-top:12px">'+esc(v.caption)+'</div>':'')+
        '</div>';
    }
    if(block.compare){
      var c=block.compare;
      contentHtml+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:18px 0">';
      contentHtml+='<div style="background:var(--bld);border:1.5px solid var(--bl);border-radius:10px;padding:16px 20px"><div style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:var(--bl);font-weight:700;margin-bottom:8px">'+esc(c.leftTitle||'Option A')+'</div><div style="font-size:15px;line-height:1.7;color:var(--tx)">'+c.left+'</div></div>';
      contentHtml+='<div style="background:var(--gnd);border:1.5px solid var(--gn);border-radius:10px;padding:16px 20px"><div style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:var(--gn);font-weight:700;margin-bottom:8px">'+esc(c.rightTitle||'Option B')+'</div><div style="font-size:15px;line-height:1.7;color:var(--tx)">'+c.right+'</div></div>';
      contentHtml+='</div>';
    }
    if(block.steps){
      contentHtml+='<div style="margin:18px 0">';
      block.steps.forEach(function(step,i){
        contentHtml+='<div style="display:flex;gap:16px;align-items:flex-start;padding:14px 18px;background:var(--s2);border-radius:10px;margin-bottom:10px;border-left:4px solid '+color+'"><div style="flex:0 0 36px;height:36px;border-radius:50%;background:'+color+';color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px">'+(i+1)+'</div><div style="flex:1;font-size:15px;line-height:1.7;color:var(--tx)">'+(step.title?'<b style="color:'+color+';font-size:16px">'+esc(step.title)+'</b><br>':'')+(step.text||step)+'</div></div>';
      });
      contentHtml+='</div>';
    }
    if(block.workflow_step){
      var ws=block.workflow_step;
      contentHtml+='<div style="background:linear-gradient(135deg,'+color+'22,var(--s2));border:2px solid '+color+';border-radius:12px;padding:18px 22px;margin:24px 0">'+
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap">'+
          '<span style="background:'+color+';color:#fff;padding:5px 12px;border-radius:12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px">Schritt '+esc(String(ws.number||'?'))+(ws.of?' / '+esc(String(ws.of)):'')+'</span>'+
          '<span style="font-size:18px;font-weight:700;color:var(--tx);font-family:\'Playfair Display\',serif">'+esc(ws.title||'')+'</span>'+
        '</div>'+
        (ws.goal?'<div style="margin:8px 0"><span style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--tx2);font-weight:700">🎯 Ziel</span><div style="font-size:14px;color:var(--tx);line-height:1.6;margin-top:3px">'+ws.goal+'</div></div>':'')+
        (ws.tool?'<div style="margin:8px 0"><span style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--tx2);font-weight:700">🛠 Tool</span><div style="font-size:14px;color:var(--tx);font-weight:600;margin-top:3px">'+ws.tool+'</div></div>':'')+
        (ws.action?'<div style="margin:8px 0"><span style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--tx2);font-weight:700">✍️ Was du machst</span><div style="font-size:14px;color:var(--tx);line-height:1.6;margin-top:3px">'+ws.action+'</div></div>':'')+
      '</div>';
    }
    if(block.prompt){
      var pr=block.prompt;
      var promptId='prompt_'+lesson.id+'_'+Math.random().toString(36).slice(2,8);
      var promptText=pr.text||'';
      // Encode for safe HTML attribute & textarea content
      var promptEsc=esc(promptText);
      var labelText=pr.label||'Prompt';
      var targetTool=pr.tool||''; // 'claude'|'perplexity'|'gemini'
      var toolColors={claude:'#c2410c',perplexity:'#0891b2',gemini:'#7c3aed'};
      var toolLabels={claude:'🤖 Claude',perplexity:'🔍 Perplexity',gemini:'✨ Gemini'};
      var toolUrls={claude:'https://claude.ai/new',perplexity:'https://www.perplexity.ai/',gemini:'https://gemini.google.com/app'};
      var toolColor=toolColors[targetTool]||color;
      var toolLabel=toolLabels[targetTool]||labelText;
      var toolUrl=toolUrls[targetTool]||'';

      contentHtml+='<div style="background:var(--s2);border:1.5px solid '+toolColor+';border-radius:12px;margin:20px 0;overflow:hidden">'+
        '<div style="background:'+toolColor+';color:#fff;padding:10px 16px;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">'+
          '<div style="display:flex;align-items:center;gap:10px">'+
            '<span style="font-size:14px;font-weight:700">📋 Prompt für '+esc(toolLabel)+'</span>'+
            (pr.title?'<span style="font-size:12px;opacity:.9">– '+esc(pr.title)+'</span>':'')+
          '</div>'+
          '<div style="display:flex;gap:6px">'+
            '<button onclick="wikaCopyPrompt(\''+promptId+'\',this)" style="background:rgba(255,255,255,.18);color:#fff;border:1px solid rgba(255,255,255,.3);padding:5px 10px;border-radius:6px;cursor:pointer;font-family:inherit;font-size:11px;font-weight:700">📋 Kopieren</button>'+
            (toolUrl?'<a href="'+toolUrl+'" target="_blank" rel="noopener" style="background:rgba(255,255,255,.18);color:#fff;border:1px solid rgba(255,255,255,.3);padding:5px 10px;border-radius:6px;cursor:pointer;font-family:inherit;font-size:11px;font-weight:700;text-decoration:none;display:inline-block">↗ Öffnen</a>':'')+
          '</div>'+
        '</div>'+
        '<pre id="'+promptId+'" style="margin:0;padding:14px 18px;background:var(--s1);color:var(--tx);font-family:\'SF Mono\',Menlo,Consolas,monospace;font-size:13px;line-height:1.6;white-space:pre-wrap;word-break:break-word;border:none;max-height:340px;overflow-y:auto">'+promptEsc+'</pre>'+
        (pr.note?'<div style="padding:10px 18px;background:var(--s2);font-size:12px;color:var(--tx2);border-top:1px solid var(--bd);font-style:italic">💡 '+pr.note+'</div>':'')+
      '</div>';
    }
    if(block.checklist){
      var cl=block.checklist;
      var clKey='wika_check_'+lesson.id;
      var clState={};
      try{clState=JSON.parse(localStorage.getItem(clKey)||'{}');}catch(e){}
      var clTitle=cl.title||'Checkliste';
      contentHtml+='<div style="background:var(--s1);border:1.5px solid '+color+';border-radius:12px;padding:16px 20px;margin:20px 0">'+
        '<div style="font-size:13px;text-transform:uppercase;letter-spacing:1.5px;color:'+color+';font-weight:700;margin-bottom:12px">✅ '+esc(clTitle)+'</div>'+
        '<div>';
      (cl.items||[]).forEach(function(item,idx){
        var key=lesson.id+'_'+idx;
        var checked=!!clState[idx];
        contentHtml+='<label style="display:flex;align-items:flex-start;gap:12px;padding:8px 0;cursor:pointer;font-size:14px;line-height:1.55;color:var(--tx);border-bottom:1px solid var(--bd)">'+
          '<input type="checkbox" '+(checked?'checked':'')+' onchange="wikaToggleCheck(\''+clKey+'\','+idx+',this.checked)" style="margin-top:3px;width:18px;height:18px;accent-color:'+color+';flex-shrink:0;cursor:pointer">'+
          '<span style="'+(checked?'text-decoration:line-through;color:var(--tx3)':'')+'">'+item+'</span>'+
        '</label>';
      });
      contentHtml+='</div></div>';
    }
  });

  // Lesson navigation
  var lessonIdx=mod.lessons.findIndex(function(l){return l.id===lesson.id});
  var prev=lessonIdx>0?mod.lessons[lessonIdx-1]:null;
  var next=lessonIdx<mod.lessons.length-1?mod.lessons[lessonIdx+1]:null;

  var navHtml='<div style="display:flex;justify-content:space-between;gap:10px;margin-top:24px;padding-top:18px;border-top:1px solid var(--bd)">';
  navHtml+=prev?'<button class="btn btn-sm" onclick="go_lesson(\''+mod.id+'\',\''+prev.id+'\')">← '+esc(prev.title)+'</button>':'<div></div>';
  navHtml+=next?'<button class="btn btn-sm btn-p" onclick="go_lesson(\''+mod.id+'\',\''+next.id+'\')" style="background:linear-gradient(135deg,'+color+',var(--ac2));border:none;color:#fff">'+esc(next.title)+' →</button>':'<button class="btn btn-sm btn-p" onclick="coachBackFromLesson()" style="background:linear-gradient(135deg,var(--gn),#2db890);border:none;color:#fff">✓ Modul abschließen</button>';
  navHtml+='</div>';

  document.getElementById('coachingLessonContent').innerHTML=
    '<div style="background:var(--s1);border:1px solid var(--bd2);border-radius:14px;padding:32px 36px">'+
      '<div style="display:flex;align-items:flex-start;gap:16px;margin-bottom:8px">'+
        '<span style="font-size:38px">'+mod.icon+'</span>'+
        '<div style="flex:1">'+
          '<div style="font-size:12px;color:var(--tx2);text-transform:uppercase;letter-spacing:1.5px;font-weight:600">'+esc(mod.title)+' · Lektion '+(lessonIdx+1)+' von '+mod.lessons.length+'</div>'+
          '<h2 style="font-size:30px;font-family:\'Playfair Display\',serif;color:var(--tx);margin:4px 0;font-weight:700;line-height:1.2">'+esc(lesson.title)+'</h2>'+
          '<div style="font-size:13px;color:var(--tx3);margin-top:2px">⏱ '+esc(lesson.readTime)+' Lesezeit</div>'+
        '</div>'+
        '<button onclick="coachToggleBookmark(\''+lesson.id+'\')" title="'+(bookmarked?'Lesezeichen entfernen':'Als Lesezeichen speichern')+'" style="background:'+(bookmarked?'var(--acd)':'var(--s2)')+';border:1px solid '+(bookmarked?'var(--ac)':'var(--bd)')+';border-radius:8px;padding:8px 14px;cursor:pointer;font-family:inherit;color:'+(bookmarked?'var(--ac)':'var(--tx2)')+';font-size:15px;display:flex;align-items:center;gap:6px">'+
          (bookmarked?'⭐':'☆')+'<span style="font-size:12px;font-weight:700">'+(bookmarked?'Gespeichert':'Speichern')+'</span>'+
        '</button>'+
      '</div>'+
      (lesson.videoId?
        '<div style="margin-top:14px;background:var(--s2);border:1px solid var(--bd);border-radius:10px;overflow:hidden;max-width:560px">'+
          '<div style="padding:8px 12px;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--bd);background:var(--s3);cursor:pointer" onclick="toggleVideoEmbed(\''+lesson.id+'\')">'+
            '<span style="font-size:16px">📺</span>'+
            '<div style="flex:1;min-width:0">'+
              '<div style="font-size:9px;color:var(--tx2);text-transform:uppercase;letter-spacing:1px;font-weight:700">YouTube-Video (Deutsch) — zum Aufklappen</div>'+
              '<div style="font-size:12px;font-weight:600;color:var(--tx);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(lesson.videoTitle||'Video ansehen')+'</div>'+
            '</div>'+
            '<span id="videoToggle_'+esc(lesson.id)+'" style="color:var(--tx2);font-size:14px;font-weight:700">▾</span>'+
            '<a href="https://www.youtube.com/watch?v='+esc(lesson.videoId)+'" target="_blank" onclick="event.stopPropagation()" style="background:#FF0000;color:#fff;padding:5px 10px;border-radius:6px;text-decoration:none;font-size:10px;font-weight:700;white-space:nowrap;display:inline-flex;align-items:center;gap:4px">▶ YouTube</a>'+
          '</div>'+
          '<div id="videoBody_'+esc(lesson.id)+'" style="display:none">'+
            '<div style="position:relative;padding-bottom:56.25%;height:0;background:#000">'+
              '<iframe id="videoFrame_'+esc(lesson.id)+'" data-src="https://www.youtube.com/embed/'+esc(lesson.videoId)+'" style="position:absolute;top:0;left:0;width:100%;height:100%;border:none" allowfullscreen></iframe>'+
            '</div>'+
          '</div>'+
        '</div>'
        :'')+
      '<div style="margin-top:20px">'+contentHtml+'</div>'+
      '<div style="margin-top:24px;padding:14px 18px;background:'+(done?'var(--gnd)':'var(--s2)')+';border:1px solid '+(done?'var(--gn)':'var(--bd)')+';border-radius:8px;display:flex;align-items:center;gap:12px;cursor:pointer" onclick="toggleLessonComplete(\''+lesson.id+'\','+(!done)+')">'+
        '<div style="width:24px;height:24px;border-radius:6px;border:2px solid '+(done?'var(--gn)':'var(--tx3)')+';background:'+(done?'var(--gn)':'transparent')+';display:flex;align-items:center;justify-content:center;color:'+(done?'#000':'var(--tx3)')+';font-weight:900">'+(done?'✓':'')+'</div>'+
        '<div style="flex:1"><div style="font-weight:700;color:'+(done?'var(--gn)':'var(--tx)')+'">'+(done?'Lektion abgeschlossen':'Als gelesen markieren')+'</div>'+
        (done?'<div style="font-size:11px;color:var(--tx2)">Klicke zum Zurücksetzen</div>':'<div style="font-size:11px;color:var(--tx2)">Klicke wenn du fertig bist</div>')+'</div>'+
      '</div>'+
      navHtml+
    '</div>';
}

// ═══════════════════════════════════════════════════════════════
// SIDEBAR BADGE & ENTRY POINT
// ═══════════════════════════════════════════════════════════════

function coachUpdateSidebarBadge(doneLessons,totalLessons,pct){
  var badge=document.getElementById('coachingBadge');
  if(badge){
    var unfinished=totalLessons-doneLessons;
    if(unfinished>0&&doneLessons===0){badge.textContent='Neu';badge.style.display='inline-block';badge.style.background='var(--ac)';}
    else if(unfinished>0&&doneLessons<totalLessons){badge.textContent=pct+'%';badge.style.display='inline-block';badge.style.background='var(--ac)';}
    else if(doneLessons>0&&doneLessons===totalLessons){badge.textContent='✓';badge.style.background='var(--gn)';badge.style.display='inline-block';}
    else{badge.style.display='none';}
  }

  // Update dashboard quick card
  var qc=document.getElementById('qcCoaching');
  if(qc){
    if(doneLessons===0)qc.textContent='Lernzentrum starten';
    else qc.textContent=doneLessons+'/'+totalLessons+' Lektionen';
  }
}

// ═══════════════════════════════════════════════════════════════
// AUFGABEN-BOARD — Kanban / Projektmanagement (Etappe 1)
// ───────────────────────────────────────────────────────────────
// Datenmodell unter D.pm (gekapselt, localStorage-persistent).
// Sauber getrennt: State / Logik / Rendering.
// Erweiterbar für Mehrbenutzer (assignee-Feld) & Backend (flache IDs).
// ═══════════════════════════════════════════════════════════════

// ─── State ───
var pmState={
  view:'dashboard',       // dashboard | board | myTasks
  activeBoardId:null,
  filter:{priority:'',assignee:'',label:'',status:'',search:''},
  dragTaskId:null
};

// ─── Konstanten ───
var PM_PRIORITIES=[
  {id:'urgent', label:'Dringend', color:'rd', icon:'🔴'},
  {id:'high',   label:'Hoch',     color:'or', icon:'🟠'},
  {id:'medium', label:'Mittel',   color:'ac', icon:'🟡'},
  {id:'low',    label:'Niedrig',  color:'bl', icon:'🔵'}
];
var PM_DEFAULT_LISTS=['Ideen / Backlog','Geplant','In Bearbeitung','Wartet auf Rückmeldung','Erledigt'];
var PM_LABEL_COLORS=['ac','gn','bl','pu','pk','or','cy','rd'];

// ─── Board-Vorlagen (FBA-spezifisch) ───
var PM_TEMPLATES=[
  {
    id:'tpl_recherche', title:'Produktrecherche', icon:'🔍', color:'pu',
    desc:'Von der Idee bis zur Go/No-Go-Entscheidung',
    lists:['Ideen / Backlog','In Recherche','Validierung','Entscheidung','Erledigt'],
    tasks:[
      {list:0,title:'Nische & Produktfelder definieren',priority:'high'},
      {list:0,title:'10 Produktideen sammeln (Claude/Perplexity)',priority:'medium'},
      {list:1,title:'Nachfrage prüfen (Black Box, Suchvolumen)',priority:'high'},
      {list:1,title:'Wettbewerb analysieren (Xray)',priority:'high'},
      {list:2,title:'Marge & FBA-Gebühren kalkulieren',priority:'urgent'},
      {list:2,title:'Reviews der Top-5 auswerten',priority:'medium'},
      {list:3,title:'Score-Matrix ausfüllen & Go/No-Go',priority:'urgent'}
    ]
  },
  {
    id:'tpl_launch', title:'Produktlaunch', icon:'🚀', color:'gn',
    desc:'Checkliste für einen sauberen Produktstart',
    lists:['Vorbereitung','Listing','Pre-Launch','Launch','Erledigt'],
    tasks:[
      {list:0,title:'Wareneingang im Lager bestätigen',priority:'urgent'},
      {list:0,title:'Verkaufspreis & Marge final festlegen',priority:'high'},
      {list:1,title:'Titel + Bullet Points schreiben',priority:'high'},
      {list:1,title:'Produktbilder & A+ Content erstellen',priority:'high'},
      {list:1,title:'Backend-Keywords eintragen',priority:'medium'},
      {list:2,title:'PPC-Kampagnen vorbereiten (Auto + Manual)',priority:'high'},
      {list:2,title:'Launch-Rabattstrategie festlegen',priority:'medium'},
      {list:3,title:'Listing live schalten',priority:'urgent'},
      {list:3,title:'Erste Reviews generieren (Vine etc.)',priority:'high'}
    ]
  },
  {
    id:'tpl_ppc', title:'PPC-Optimierung', icon:'📣', color:'pk',
    desc:'Wöchentlicher Werbe-Optimierungs-Workflow',
    lists:['Zu prüfen','In Analyse','Maßnahmen','Beobachten','Erledigt'],
    tasks:[
      {list:0,title:'Suchbegriffsbericht der letzten 7 Tage ziehen',priority:'high'},
      {list:0,title:'ACoS pro Kampagne prüfen',priority:'high'},
      {list:1,title:'Verlustbringer-Keywords identifizieren',priority:'medium'},
      {list:1,title:'Gewinner-Keywords in Manual übernehmen',priority:'medium'},
      {list:2,title:'Negative Keywords hinzufügen',priority:'high'},
      {list:2,title:'Gebote anpassen (Bid-Optimierung)',priority:'medium'},
      {list:3,title:'Performance nach 3 Tagen kontrollieren',priority:'low'}
    ]
  },
  {
    id:'tpl_lieferant', title:'Lieferantenmanagement', icon:'🏭', color:'or',
    desc:'Lieferanten finden, vergleichen, Muster bestellen',
    lists:['Kontakt aufnehmen','Angebote','Muster','Verhandlung','Bestätigt'],
    tasks:[
      {list:0,title:'5 Lieferanten auf Alibaba anfragen',priority:'high'},
      {list:0,title:'Anforderungs-Spezifikation erstellen',priority:'medium'},
      {list:1,title:'Angebote vergleichen (Preis, MOQ, Lieferzeit)',priority:'high'},
      {list:2,title:'Muster bei Top-2 bestellen',priority:'urgent'},
      {list:2,title:'Muster-Qualität bewerten',priority:'high'},
      {list:3,title:'Preis & Konditionen verhandeln',priority:'high'},
      {list:3,title:'Zahlungs- & Lieferbedingungen klären',priority:'medium'}
    ]
  },
  {
    id:'tpl_monat', title:'Monatsplanung', icon:'📅', color:'bl',
    desc:'Wiederkehrende monatliche Business-Aufgaben',
    lists:['Diesen Monat','In Bearbeitung','Wartet','Erledigt'],
    tasks:[
      {list:0,title:'Umsatz & Gewinn des Vormonats auswerten',priority:'high'},
      {list:0,title:'Lagerbestand prüfen & Nachbestellungen planen',priority:'urgent'},
      {list:0,title:'Buchhaltung / Belege sortieren',priority:'medium'},
      {list:0,title:'USt-Voranmeldung vorbereiten',priority:'high'},
      {list:0,title:'PPC-Budget für den Monat festlegen',priority:'medium'},
      {list:1,title:'Neue Produktideen recherchieren',priority:'low'}
    ]
  }
];

// ─── Init / Datenstruktur sicherstellen ───
// ═══════════════════════════════════════════════════════════════
// PM PLATTFORM-ARCHITEKTUR (backend-ready / database-ready)
// ───────────────────────────────────────────────────────────────
// Schichten-Trennung:
//   UI  →  Services  →  Repository  →  Adapter (localStorage | Supabase)
//
// Die UI ruft NIE direkt D.pm auf, sondern geht über Services.
// Heute aktiv: LocalStorageAdapter (offline-first).
// Später: SupabaseAdapter aktivieren (Code als Vorlage unten).
//
// Alle Entitäten haben Plattform-Felder:
//   id, workspace_id, created_by, created_at, updated_at, deleted_at
// → Multi-Tenant-fähig, Soft-Delete-fähig, Audit-fähig.
// ═══════════════════════════════════════════════════════════════

// ─── Aktueller Kontext (später aus authService) ───
var PM_CONTEXT={
  workspaceId:'ws_default',   // Mandant; später pro Login
  userId:'usr_local',         // aktueller Nutzer
  role:'owner'                // owner | admin | member | viewer
};
function pmSyncContext(){
  // Bindet den AMZ SellerHub-Login an den PM-Kontext (Multi-User-Vorbereitung)
  var u=window.WikaAuth?window.WikaAuth.currentUser():null;
  if(u){
    PM_CONTEXT.userId='usr_'+(u.username||'local');
    PM_CONTEXT.role=(u.role==='admin')?'owner':'member';
    PM_CONTEXT.workspaceId='ws_'+(u.username||'default'); // pro Nutzer eigener Workspace (browser-isoliert)
  }
}

// ─── Plattform-Feld-Helfer ───
function pmNewId(prefix){return prefix+'_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);}
function pmStamp(entity,prefix){
  var now=new Date().toISOString();
  entity.id=entity.id||pmNewId(prefix);
  entity.workspace_id=entity.workspace_id||PM_CONTEXT.workspaceId;
  entity.created_by=entity.created_by||PM_CONTEXT.userId;
  entity.created_at=entity.created_at||now;
  entity.updated_at=now;
  if(!('deleted_at' in entity))entity.deleted_at=null;
  return entity;
}

// ═══════════════════════════════════════════════════════════════
// ADAPTER-SCHICHT — austauschbare Persistenz
// Jeder Adapter implementiert dasselbe Interface:
//   list(collection, filter) → []
//   get(collection, id) → obj|null
//   insert(collection, obj) → obj
//   update(collection, id, changes) → obj
//   remove(collection, id, soft) → bool
// ═══════════════════════════════════════════════════════════════

// ─── ADAPTER 1: localStorage (AKTIV, offline-first) ───
// Speichert unter D.pm[collection]. Synchron, aber als Promise verpackt,
// damit die Service-API identisch zur späteren HTTP/Supabase-Variante ist.
var LocalStorageAdapter={
  _coll:function(name){D.pm=D.pm||{};D.pm[name]=D.pm[name]||[];return D.pm[name];},
  list:function(collection,filter){
    var arr=this._coll(collection).filter(function(r){
      if(r.deleted_at)return false; // Soft-Delete ausblenden
      if(r.workspace_id && r.workspace_id!==PM_CONTEXT.workspaceId)return false; // Mandanten-Trennung
      return true;
    });
    if(filter)arr=arr.filter(filter);
    return Promise.resolve(arr.slice());
  },
  get:function(collection,id){
    var r=this._coll(collection).find(function(x){return x.id===id && !x.deleted_at;});
    return Promise.resolve(r||null);
  },
  insert:function(collection,obj){
    this._coll(collection).push(obj);
    save();
    return Promise.resolve(obj);
  },
  update:function(collection,id,changes){
    var r=this._coll(collection).find(function(x){return x.id===id;});
    if(!r)return Promise.resolve(null);
    Object.keys(changes).forEach(function(k){r[k]=changes[k];});
    r.updated_at=new Date().toISOString();
    save();
    return Promise.resolve(r);
  },
  remove:function(collection,id,soft){
    var coll=this._coll(collection);
    if(soft!==false){
      var r=coll.find(function(x){return x.id===id;});
      if(r){r.deleted_at=new Date().toISOString();save();}
      return Promise.resolve(true);
    }else{
      D.pm[collection]=coll.filter(function(x){return x.id!==id;});
      save();
      return Promise.resolve(true);
    }
  }
};

// ─── ADAPTER 2: Supabase (VORLAGE — später aktivieren) ───
// Aktivierung: 1) Supabase-JS einbinden, 2) SUPABASE_URL/KEY setzen,
// 3) PM_ADAPTER=SupabaseAdapter; setzen. Tabellen siehe SQL-Beilage.
/*
var SupabaseAdapter=(function(){
  // const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  function scoped(q){ return q.eq('workspace_id', PM_CONTEXT.workspaceId).is('deleted_at', null); }
  return {
    list:function(collection,filter){
      // return scoped(supabase.from(collection).select('*')).then(r=>r.data||[]);
    },
    get:function(collection,id){
      // return supabase.from(collection).select('*').eq('id',id).is('deleted_at',null).single().then(r=>r.data);
    },
    insert:function(collection,obj){
      // return supabase.from(collection).insert(obj).select().single().then(r=>r.data);
    },
    update:function(collection,id,changes){
      // changes.updated_at=new Date().toISOString();
      // return supabase.from(collection).update(changes).eq('id',id).select().single().then(r=>r.data);
    },
    remove:function(collection,id,soft){
      // if(soft!==false) return supabase.from(collection).update({deleted_at:new Date().toISOString()}).eq('id',id).then(()=>true);
      // return supabase.from(collection).delete().eq('id',id).then(()=>true);
    }
  };
})();
*/

// ─── Aktiver Adapter (hier umschalten, wenn Backend bereit) ───
var PM_ADAPTER=LocalStorageAdapter;

// ═══════════════════════════════════════════════════════════════
// API-CLIENT — eine Fassade über dem Adapter
// Entspricht später HTTP-Endpunkten (siehe API-Doku in SQL-Beilage).
// GET    /:collection            → apiClient.list
// GET    /:collection/:id        → apiClient.get
// POST   /:collection            → apiClient.create
// PATCH  /:collection/:id        → apiClient.update
// DELETE /:collection/:id        → apiClient.remove
// ═══════════════════════════════════════════════════════════════
var apiClient={
  list:function(collection,filter){return PM_ADAPTER.list(collection,filter);},
  get:function(collection,id){return PM_ADAPTER.get(collection,id);},
  create:function(collection,obj,prefix){pmStamp(obj,prefix||collection.slice(0,3));return PM_ADAPTER.insert(collection,obj);},
  update:function(collection,id,changes){return PM_ADAPTER.update(collection,id,changes);},
  remove:function(collection,id,soft){return PM_ADAPTER.remove(collection,id,soft);}
};

// ═══════════════════════════════════════════════════════════════
// AUTH-SERVICE (Vorbereitung Rollen & Rechte)
// ═══════════════════════════════════════════════════════════════
var authService={
  currentUser:function(){return {id:PM_CONTEXT.userId,role:PM_CONTEXT.role,workspaceId:PM_CONTEXT.workspaceId};},
  can:function(action){
    // Rollen-Matrix: owner/admin alles, member schreiben, viewer nur lesen
    var role=PM_CONTEXT.role;
    if(role==='viewer')return action==='read';
    if(role==='member')return action!=='admin';
    return true; // owner/admin
  }
};

// NB: Die Services sind bewusst SYNCHRON-kompatibel gehalten, indem die
// localStorage-Variante sofort auflöst. Beim Umstieg auf echtes Backend
// werden die aufrufenden Render-Funktionen auf async/await umgestellt —
// die Service-Signaturen bleiben identisch.

function pmInit(){
  D.pm=D.pm||{};
  // Plattform-Collections (Tabellen-äquivalent)
  ['workspaces','users','boards','lists','tasks','comments','labels','attachments','notifications','activity_logs','reminders'].forEach(function(c){
    D.pm[c]=D.pm[c]||[];
  });
  pmSyncContext();
  // Default-Workspace anlegen
  if(!D.pm.workspaces.some(function(w){return w.id===PM_CONTEXT.workspaceId;})){
    D.pm.workspaces.push(pmStamp({id:PM_CONTEXT.workspaceId,name:'Mein Workspace'},'ws'));
  }
  // Default-Labels (einmalig pro Workspace)
  if(!D.pm.labels.some(function(l){return l.workspace_id===PM_CONTEXT.workspaceId;})){
    [['Wichtig','rd'],['Schnell erledigt','gn'],['Warten auf andere','or'],['Recherche','pu']].forEach(function(p){
      D.pm.labels.push(pmStamp({id:pmNewId('lbl'),name:p[0],color:p[1]},'lbl'));
    });
  }
  pmMigrateLegacy();
}

// ─── Migration: alte Board-Daten (ohne Plattform-Felder) hochziehen ───
function pmMigrateLegacy(){
  var migrated=false;
  ['boards','lists','tasks'].forEach(function(c){
    (D.pm[c]||[]).forEach(function(r){
      if(!r.workspace_id){
        // alte camelCase-Felder auf snake_case-Plattformfelder mappen
        r.workspace_id=PM_CONTEXT.workspaceId;
        r.created_by=r.created_by||PM_CONTEXT.userId;
        r.created_at=r.created_at||r.createdAt||new Date().toISOString();
        r.updated_at=r.updated_at||r.updatedAt||r.created_at;
        if(!('deleted_at' in r))r.deleted_at=null;
        migrated=true;
      }
    });
  });
  if(migrated)save();
}

// ═══════════════════════════════════════════════════════════════
// SERVICE-SCHICHT — Business-Logik (UI ruft NUR diese auf)
// Jeder Service kapselt eine Entität + zugehörige Regeln.
// ═══════════════════════════════════════════════════════════════

// ─── boardService ───
var boardService={
  getBoards:function(){return (D.pm.boards||[]).filter(function(b){return !b.deleted_at && b.workspace_id===PM_CONTEXT.workspaceId;});},
  getBoardById:function(id){return (D.pm.boards||[]).find(function(b){return b.id===id && !b.deleted_at;});},
  createBoard:function(title,icon,color){
    var b=pmStamp({title:title||'Neues Board',icon:icon||'📋',color:color||'ac',archived:false},'brd');
    D.pm.boards.push(b);pmLog(b.id,'board','Board erstellt');save();return b;
  },
  updateBoard:function(id,changes){
    var b=boardService.getBoardById(id);if(!b)return null;
    Object.keys(changes).forEach(function(k){b[k]=changes[k];});b.updated_at=new Date().toISOString();save();return b;
  },
  archiveBoard:function(id,archived){var b=boardService.getBoardById(id);if(b){b.archived=archived!==false;b.updated_at=new Date().toISOString();save();}},
  deleteBoard:function(id){
    // Soft-Delete inkl. Kaskade auf Listen + Tasks
    var now=new Date().toISOString();
    (D.pm.boards||[]).forEach(function(b){if(b.id===id)b.deleted_at=now;});
    (D.pm.lists||[]).forEach(function(l){if(l.boardId===id)l.deleted_at=now;});
    (D.pm.tasks||[]).forEach(function(t){if(t.boardId===id)t.deleted_at=now;});
    save();
  }
};

// ─── listService ───
var listService={
  getLists:function(boardId){return (D.pm.lists||[]).filter(function(l){return l.boardId===boardId && !l.deleted_at;}).sort(function(a,b){return a.order-b.order;});},
  createList:function(boardId,title,order){
    var l=pmStamp({boardId:boardId,title:title||'Neue Liste',order:order!=null?order:listService.getLists(boardId).length},'lst');
    D.pm.lists.push(l);save();return l;
  },
  updateList:function(id,changes){var l=(D.pm.lists||[]).find(function(x){return x.id===id;});if(l){Object.keys(changes).forEach(function(k){l[k]=changes[k];});l.updated_at=new Date().toISOString();save();}return l;}
};

// ─── taskService ───
var taskService={
  getTasks:function(listId){return (D.pm.tasks||[]).filter(function(t){return t.listId===listId && !t.deleted_at;}).sort(function(a,b){return a.order-b.order;});},
  getByBoard:function(boardId){return (D.pm.tasks||[]).filter(function(t){return t.boardId===boardId && !t.deleted_at;});},
  getTaskById:function(id){return (D.pm.tasks||[]).find(function(t){return t.id===id && !t.deleted_at;});},
  getAll:function(){return (D.pm.tasks||[]).filter(function(t){return !t.deleted_at && t.workspace_id===PM_CONTEXT.workspaceId;});},
  createTask:function(boardId,listId,fields){
    fields=fields||{};
    var t=pmStamp({
      boardId:boardId, listId:listId,
      title:fields.title||'Neue Aufgabe', desc:fields.desc||'',
      priority:fields.priority||'medium', status:fields.status||'',
      dueDate:fields.dueDate||'', dueTime:fields.dueTime||'',
      reminder:fields.reminder||'', assignee:fields.assignee||'',
      labels:fields.labels||[], checklist:fields.checklist||[],
      comments:[], activity:[{at:new Date().toISOString(),text:'Aufgabe erstellt'}],
      recurring:fields.recurring||'', notes:fields.notes||'',
      order:taskService.getTasks(listId).length
    },'tsk');
    D.pm.tasks.push(t);save();return t;
  },
  updateTask:function(id,changes,activityText){
    var t=taskService.getTaskById(id);if(!t)return null;
    Object.keys(changes).forEach(function(k){t[k]=changes[k];});
    t.updated_at=new Date().toISOString();
    if(activityText)t.activity.push({at:t.updated_at,text:activityText});
    save();return t;
  },
  moveTask:function(id,targetListId,targetOrder){
    var t=taskService.getTaskById(id);if(!t)return;
    var oldList=t.listId;t.listId=targetListId;t.updated_at=new Date().toISOString();
    if(oldList!==targetListId)t.activity.push({at:t.updated_at,text:'Verschoben nach „'+pmListName(targetListId)+'"'});
    var inList=taskService.getTasks(targetListId).filter(function(x){return x.id!==id;});
    if(targetOrder==null)targetOrder=inList.length;
    inList.splice(targetOrder,0,t);
    inList.forEach(function(x,i){x.order=i;});
    save();
  },
  deleteTask:function(id){var t=taskService.getTaskById(id);if(t){t.deleted_at=new Date().toISOString();save();}}
};

// ─── notificationService (Vorbereitung Etappe 2) ───
var notificationService={
  getNotifications:function(){return (D.pm.notifications||[]).filter(function(n){return !n.deleted_at && n.user_id===PM_CONTEXT.userId;}).sort(function(a,b){return new Date(b.created_at)-new Date(a.created_at);});},
  create:function(type,taskId,message){
    var n=pmStamp({type:type,task_id:taskId,user_id:PM_CONTEXT.userId,message:message,status:'pending',read:false},'ntf');
    D.pm.notifications.push(n);save();return n;
  },
  markAsRead:function(id){var n=(D.pm.notifications||[]).find(function(x){return x.id===id;});if(n){n.read=true;n.status='dismissed';n.updated_at=new Date().toISOString();save();}},
  unreadCount:function(){return notificationService.getNotifications().filter(function(n){return !n.read;}).length;}
};

// ─── Aktivitäts-Log (Audit) ───
function pmLog(entityId,entityType,text){
  D.pm.activity_logs=D.pm.activity_logs||[];
  D.pm.activity_logs.push(pmStamp({entity_id:entityId,entity_type:entityType,text:text},'log'));
}

// ═══════════════════════════════════════════════════════════════
// KOMPATIBILITÄTS-WRAPPER
// Die bestehende UI ruft diese Namen auf — sie delegieren an Services.
// So bleibt die UI unverändert, während darunter die saubere
// Architektur arbeitet.
// ═══════════════════════════════════════════════════════════════
function createBoard(title,icon,color){return boardService.createBoard(title,icon,color);}
function createList(boardId,title,order){return listService.createList(boardId,title,order);}
function createTask(boardId,listId,fields){return taskService.createTask(boardId,listId,fields);}
function updateTask(taskId,changes,activityText){return taskService.updateTask(taskId,changes,activityText);}
function moveTask(taskId,targetListId,targetOrder){return taskService.moveTask(taskId,targetListId,targetOrder);}
function deleteTask(taskId){return taskService.deleteTask(taskId);}
function archiveBoard(boardId,archived){return boardService.archiveBoard(boardId,archived);}
function deleteBoard(boardId){return boardService.deleteBoard(boardId);}

// ─── Getter / Helpers (nutzen jetzt Services) ───
function pmGetLists(boardId){return listService.getLists(boardId);}
function pmGetTasks(listId){return taskService.getTasks(listId);}
function pmListName(listId){var l=(D.pm.lists||[]).find(function(x){return x.id===listId;});return l?l.title:'?';}
function pmBoard(boardId){return boardService.getBoardById(boardId);}
function pmTask(taskId){return taskService.getTaskById(taskId);}
function pmPriority(pid){return PM_PRIORITIES.find(function(p){return p.id===pid;})||PM_PRIORITIES[2];}
function pmLabel(lid){return (D.pm.labels||[]).find(function(l){return l.id===lid;});}

// ─── Fortschritt / Statistik ───
function calculateBoardProgress(boardId){
  var lists=pmGetLists(boardId);
  var allTasks=taskService.getByBoard(boardId);
  // "Erledigt" = Tasks in der letzten Liste (oder Liste mit "Erledigt"/"Done" im Namen)
  var doneList=lists.find(function(l){return /erledigt|done|fertig|abgeschlossen|bestätigt/i.test(l.title);})||lists[lists.length-1];
  var done=doneList?allTasks.filter(function(t){return t.listId===doneList.id;}).length:0;
  var total=allTasks.length;
  return {total:total,done:done,open:total-done,pct:total>0?Math.round(done/total*100):0,doneListId:doneList?doneList.id:null};
}

function pmIsOverdue(t){
  if(!t.dueDate)return false;
  // Erledigte Tasks sind nicht überfällig
  var prog=calculateBoardProgress(t.boardId);
  if(prog.doneListId&&t.listId===prog.doneListId)return false;
  var due=new Date(t.dueDate+(t.dueTime?'T'+t.dueTime:'T23:59'));
  return due<new Date();
}
function pmIsDueToday(t){
  if(!t.dueDate)return false;
  var today=new Date().toISOString().split('T')[0];
  return t.dueDate===today;
}
function pmIsDueSoon(t){
  if(!t.dueDate)return false;
  var due=new Date(t.dueDate+'T23:59');
  var now=new Date();
  var diff=(due-now)/(1000*60*60*24);
  return diff>=0&&diff<=2;
}

function getDueTasks(){
  var overdue=[],today=[],soon=[];
  taskService.getAll().forEach(function(t){
    if(pmIsOverdue(t))overdue.push(t);
    else if(pmIsDueToday(t))today.push(t);
    else if(pmIsDueSoon(t))soon.push(t);
  });
  return {overdue:overdue,today:today,soon:soon};
}

// ─── Filter ───
function filterTasks(tasks){
  var f=pmState.filter;
  return tasks.filter(function(t){
    if(f.priority&&t.priority!==f.priority)return false;
    if(f.assignee&&t.assignee!==f.assignee)return false;
    if(f.label&&t.labels.indexOf(f.label)<0)return false;
    if(f.search){
      var q=f.search.toLowerCase();
      if(t.title.toLowerCase().indexOf(q)<0&&(t.desc||'').toLowerCase().indexOf(q)<0)return false;
    }
    return true;
  });
}

// ─── Board aus Vorlage erstellen ───
function pmCreateFromTemplate(tplId){
  var tpl=PM_TEMPLATES.find(function(t){return t.id===tplId;});
  if(!tpl)return null;
  var b=createBoard(tpl.title,tpl.icon,tpl.color);
  var listIds=[];
  tpl.lists.forEach(function(name,i){listIds.push(createList(b.id,name,i).id);});
  tpl.tasks.forEach(function(tk){
    createTask(b.id,listIds[tk.list],{title:tk.title,priority:tk.priority});
  });
  return b;
}

// ─── Leeres Board mit Standard-Listen ───
function pmCreateEmptyBoard(title,icon,color){
  var b=createBoard(title,icon,color);
  PM_DEFAULT_LISTS.forEach(function(name,i){createList(b.id,name,i);});
  return b;
}

// ═══════════════════════════════════════════════════════════════
// AUFGABEN-BOARD — Rendering
// ═══════════════════════════════════════════════════════════════

function renderTasks(){
  pmInit();
  if(pmState.view==='board'&&pmState.activeBoardId&&!pmBoard(pmState.activeBoardId))pmState.view='dashboard';
  if(pmState.view==='board')pmRenderBoard();
  else if(pmState.view==='myTasks')pmRenderMyTasks();
  else pmRenderDashboard();
  pmUpdateBadge();
}

function pmUpdateBadge(){
  var due=getDueTasks();
  var n=due.overdue.length;
  var badge=document.getElementById('tasksBadge');
  if(badge){
    if(n>0){badge.textContent=n;badge.style.display='inline-block';}
    else badge.style.display='none';
  }
}

// ─── DASHBOARD ───
function pmRenderDashboard(){
  var body=document.getElementById('tasksBody');
  var boards=boardService.getBoards().filter(function(b){return !b.archived;});
  var archived=boardService.getBoards().filter(function(b){return b.archived;});
  var due=getDueTasks();
  var fmt=function(d){return d?new Date(d).toLocaleDateString('de-DE',{day:'2-digit',month:'short'}):'';};

  var html='';

  // ── Sub-Navigation ──
  html+='<div style="display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap">'+
    '<button onclick="pmGo(\'dashboard\')" style="padding:8px 16px;border-radius:8px;border:1.5px solid var(--ac);background:var(--ac);color:#fff;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer">📊 Übersicht</button>'+
    '<button onclick="pmGo(\'myTasks\')" style="padding:8px 16px;border-radius:8px;border:1.5px solid var(--bd);background:transparent;color:var(--tx2);font-family:inherit;font-size:13px;font-weight:600;cursor:pointer">👤 Meine Aufgaben</button>'+
    '<button onclick="pmNewBoardDialog()" style="margin-left:auto;padding:8px 16px;border-radius:8px;border:none;background:var(--gn);color:#fff;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer">＋ Neues Board</button>'+
  '</div>';

  // ── "Nächste beste Aktion" ──
  var nextAction=pmGetNextBestAction();
  if(nextAction){
    html+='<div style="background:linear-gradient(135deg,var(--acd),var(--s2));border:1.5px solid var(--ac);border-radius:14px;padding:18px 22px;margin-bottom:20px;display:flex;align-items:center;gap:16px;flex-wrap:wrap">'+
      '<div style="font-size:36px">🎯</div>'+
      '<div style="flex:1;min-width:200px">'+
        '<div style="font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:var(--ac);font-weight:700;margin-bottom:3px">Nächste beste Aktion</div>'+
        '<div style="font-size:16px;font-weight:700;color:var(--tx);margin-bottom:2px">'+esc(nextAction.task.title)+'</div>'+
        '<div style="font-size:12px;color:var(--tx2)">'+nextAction.reason+' · Board: '+esc(pmBoard(nextAction.task.boardId).title)+'</div>'+
      '</div>'+
      '<button onclick="pmOpenTask(\''+nextAction.task.id+'\')" style="padding:10px 20px;border-radius:9px;border:none;background:var(--ac);color:#fff;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer">Öffnen →</button>'+
    '</div>';
  }

  // ── Statistik-Kacheln ──
  var totalOpen=0;boardService.getBoards().forEach(function(b){if(!b.archived)totalOpen+=calculateBoardProgress(b.id).open;});
  html+='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:22px">'+
    pmStatCard('📋',boards.length,'Aktive Boards','ac')+
    pmStatCard('📝',totalOpen,'Offene Aufgaben','bl')+
    pmStatCard('⏰',due.today.length,'Heute fällig','or')+
    pmStatCard('🔴',due.overdue.length,'Überfällig','rd')+
  '</div>';

  // ── Überfällige Warnung ──
  if(due.overdue.length>0){
    html+='<div style="background:var(--rdd);border-left:3px solid var(--rd);border-radius:8px;padding:12px 16px;margin-bottom:20px">'+
      '<div style="font-weight:700;color:var(--rd);font-size:13px;margin-bottom:8px">🔴 '+due.overdue.length+' überfällige Aufgabe'+(due.overdue.length===1?'':'n')+'</div>'+
      '<div style="display:flex;flex-direction:column;gap:6px">'+
      due.overdue.slice(0,5).map(function(t){
        return '<div onclick="pmOpenTask(\''+t.id+'\')" style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px;color:var(--tx2);padding:4px 0"><span>'+pmPriority(t.priority).icon+'</span><span style="flex:1">'+esc(t.title)+'</span><span style="color:var(--rd);font-weight:600">'+fmt(t.dueDate)+'</span></div>';
      }).join('')+
      '</div></div>';
  }

  // ── Board-Vorlagen ──
  if(boards.length===0){
    html+='<div style="text-align:center;padding:20px 0 10px"><div style="font-size:15px;font-weight:700;color:var(--tx);margin-bottom:6px">Starte mit einer Vorlage 🚀</div><div style="font-size:13px;color:var(--tx2)">Vorgefertigte Boards für typische FBA-Workflows — oder erstelle ein leeres Board.</div></div>';
  }else{
    html+='<div style="font-size:13px;font-weight:700;color:var(--tx2);text-transform:uppercase;letter-spacing:1px;margin:8px 0 12px">Deine Boards</div>';
  }

  // Bestehende Boards
  if(boards.length>0){
    html+='<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px;margin-bottom:24px">';
    boards.forEach(function(b){
      var prog=calculateBoardProgress(b.id);
      var c='var(--'+b.color+')';
      var boardTasks=taskService.getByBoard(b.id);
      var overdueN=boardTasks.filter(pmIsOverdue).length;
      html+='<div onclick="pmOpenBoard(\''+b.id+'\')" style="background:linear-gradient(135deg,var(--'+b.color+'d),var(--s1));border:1.5px solid '+c+'66;border-radius:13px;padding:18px;cursor:pointer;transition:all .16s;position:relative;overflow:hidden" onmouseover="this.style.transform=\'translateY(-2px)\';this.style.borderColor=\''+c+'\'" onmouseout="this.style.transform=\'none\';this.style.borderColor=\''+c+'66\'">'+
        '<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">'+
          '<div style="width:46px;height:46px;border-radius:11px;background:'+c+';display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0">'+b.icon+'</div>'+
          '<div style="flex:1;min-width:0"><div style="font-size:16px;font-weight:700;color:var(--tx);line-height:1.2">'+esc(b.title)+'</div>'+
          '<div style="font-size:11px;color:var(--tx3)">'+prog.total+' Aufgaben · '+prog.open+' offen</div></div>'+
          (overdueN>0?'<div style="background:var(--rd);color:#fff;border-radius:20px;padding:2px 8px;font-size:11px;font-weight:700">'+overdueN+' ⏰</div>':'')+
        '</div>'+
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><div style="flex:1;height:6px;background:var(--s3);border-radius:3px;overflow:hidden"><div style="height:100%;background:'+c+';width:'+prog.pct+'%;transition:width .3s"></div></div><span style="font-size:12px;font-weight:700;color:'+c+'">'+prog.pct+'%</span></div>'+
        '<div style="font-size:11px;color:var(--tx3)">'+prog.done+' von '+prog.total+' erledigt</div>'+
      '</div>';
    });
    html+='</div>';
  }

  // Vorlagen-Galerie
  html+='<div style="font-size:13px;font-weight:700;color:var(--tx2);text-transform:uppercase;letter-spacing:1px;margin:8px 0 12px">📑 Board-Vorlagen</div>';
  html+='<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px">';
  PM_TEMPLATES.forEach(function(tpl){
    var c='var(--'+tpl.color+')';
    html+='<div onclick="pmCreateBoardFromTemplate(\''+tpl.id+'\')" style="background:var(--s2);border:1px solid var(--bd);border-radius:11px;padding:16px;cursor:pointer;transition:all .16s" onmouseover="this.style.borderColor=\''+c+'\';this.style.background=\'var(--'+tpl.color+'d)\'" onmouseout="this.style.borderColor=\'var(--bd)\';this.style.background=\'var(--s2)\'">'+
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px"><span style="font-size:24px">'+tpl.icon+'</span><span style="font-size:14px;font-weight:700;color:var(--tx)">'+esc(tpl.title)+'</span></div>'+
      '<div style="font-size:11.5px;color:var(--tx2);line-height:1.5;margin-bottom:10px">'+esc(tpl.desc)+'</div>'+
      '<div style="font-size:10px;color:var(--tx3)">'+tpl.lists.length+' Listen · '+tpl.tasks.length+' Aufgaben</div>'+
      '<div style="margin-top:10px;background:'+c+';color:#fff;text-align:center;padding:7px;border-radius:7px;font-size:12px;font-weight:700">＋ Board erstellen</div>'+
    '</div>';
  });
  html+='<div onclick="pmNewBoardDialog()" style="background:var(--s1);border:2px dashed var(--bd2);border-radius:11px;padding:16px;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;min-height:140px" onmouseover="this.style.borderColor=\'var(--ac)\'" onmouseout="this.style.borderColor=\'var(--bd2)\'">'+
    '<span style="font-size:28px">➕</span><span style="font-size:13px;font-weight:700;color:var(--tx2)">Leeres Board</span><span style="font-size:11px;color:var(--tx3)">5 Standard-Listen</span></div>';
  html+='</div>';

  // Archivierte Boards
  if(archived.length>0){
    html+='<div style="margin-top:24px"><details><summary style="font-size:12px;color:var(--tx3);cursor:pointer;font-weight:600">📦 '+archived.length+' archivierte Board'+(archived.length===1?'':'s')+'</summary><div style="display:flex;flex-direction:column;gap:6px;margin-top:10px">';
    archived.forEach(function(b){
      html+='<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--s2);border-radius:8px;font-size:13px"><span>'+b.icon+'</span><span style="flex:1;color:var(--tx2)">'+esc(b.title)+'</span><button onclick="archiveBoard(\''+b.id+'\',false);save();renderTasks()" style="background:var(--bl);color:#fff;border:none;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer;font-family:inherit">Wiederherstellen</button><button onclick="pmConfirmDeleteBoard(\''+b.id+'\')" style="background:var(--rd);color:#fff;border:none;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer;font-family:inherit">Löschen</button></div>';
    });
    html+='</div></details></div>';
  }

  document.getElementById('tasksBody').innerHTML=html;
  document.getElementById('tasksBreadcrumb').textContent='Projekte & To-dos im Kanban-Stil';
}

function pmStatCard(icon,val,label,color){
  return '<div style="background:var(--s2);border:1px solid var(--bd);border-radius:11px;padding:14px 16px;display:flex;align-items:center;gap:12px">'+
    '<div style="width:42px;height:42px;border-radius:10px;background:var(--'+color+'d);display:flex;align-items:center;justify-content:center;font-size:20px">'+icon+'</div>'+
    '<div><div style="font-size:24px;font-weight:800;color:var(--'+color+');line-height:1">'+val+'</div><div style="font-size:11px;color:var(--tx3)">'+label+'</div></div>'+
  '</div>';
}

// ─── "Nächste beste Aktion"-Logik ───
function pmGetNextBestAction(){
  var candidates=taskService.getAll().filter(function(t){
    var prog=calculateBoardProgress(t.boardId);
    return !(prog.doneListId&&t.listId===prog.doneListId); // nicht erledigt
  });
  if(candidates.length===0)return null;
  // Score: überfällig > heute > Priorität > bald fällig
  function score(t){
    var s=0;
    if(pmIsOverdue(t))s+=1000;
    if(pmIsDueToday(t))s+=500;
    if(pmIsDueSoon(t))s+=200;
    var pr={urgent:100,high:60,medium:30,low:10};
    s+=pr[t.priority]||0;
    return s;
  }
  var best=candidates.slice().sort(function(a,b){return score(b)-score(a);})[0];
  var reason;
  if(pmIsOverdue(best))reason='⏰ Überfällig';
  else if(pmIsDueToday(best))reason='📅 Heute fällig';
  else if(best.priority==='urgent')reason='🔴 Dringende Priorität';
  else if(pmIsDueSoon(best))reason='⏳ Bald fällig';
  else reason='Höchste Priorität';
  return {task:best,reason:reason};
}

// ─── BOARD-ANSICHT (Kanban) ───
function pmRenderBoard(){
  var b=pmBoard(pmState.activeBoardId);
  if(!b){pmState.view='dashboard';return pmRenderDashboard();}
  var lists=pmGetLists(b.id);
  var prog=calculateBoardProgress(b.id);
  var c='var(--'+b.color+')';

  var html='';
  // Toolbar
  html+='<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap">'+
    '<button onclick="pmGo(\'dashboard\')" style="background:var(--s2);border:1px solid var(--bd);border-radius:8px;padding:7px 12px;cursor:pointer;font-family:inherit;font-size:12px;color:var(--tx2)">← Übersicht</button>'+
    '<div style="display:flex;align-items:center;gap:10px;flex:1;min-width:160px">'+
      '<div style="width:38px;height:38px;border-radius:9px;background:'+c+';display:flex;align-items:center;justify-content:center;font-size:20px">'+b.icon+'</div>'+
      '<div><div style="font-size:18px;font-weight:800;color:var(--tx);line-height:1.1">'+esc(b.title)+'</div>'+
      '<div style="font-size:11px;color:var(--tx3)">'+prog.done+'/'+prog.total+' erledigt · '+prog.pct+'%</div></div>'+
    '</div>'+
    '<input type="text" id="pmSearch" placeholder="🔍 Suchen…" value="'+esc(pmState.filter.search)+'" oninput="pmState.filter.search=this.value;pmRenderBoard()" style="padding:7px 12px;border-radius:8px;border:1px solid var(--bd);background:var(--s2);color:var(--tx);font-family:inherit;font-size:12px;width:140px">'+
    '<select onchange="pmState.filter.priority=this.value;pmRenderBoard()" style="padding:7px 10px;border-radius:8px;border:1px solid var(--bd);background:var(--s2);color:var(--tx);font-family:inherit;font-size:12px">'+
      '<option value="">Alle Prioritäten</option>'+PM_PRIORITIES.map(function(p){return '<option value="'+p.id+'"'+(pmState.filter.priority===p.id?' selected':'')+'>'+p.icon+' '+p.label+'</option>';}).join('')+
    '</select>'+
    '<button onclick="pmBoardMenu(\''+b.id+'\')" style="background:var(--s2);border:1px solid var(--bd);border-radius:8px;padding:7px 11px;cursor:pointer;font-family:inherit;font-size:14px;color:var(--tx2)">⋯</button>'+
  '</div>';

  // Kanban-Spalten (horizontal scrollbar)
  html+='<div id="pmBoardCols" style="display:flex;gap:14px;overflow-x:auto;padding-bottom:12px;align-items:flex-start">';
  lists.forEach(function(l){
    var tasks=filterTasks(pmGetTasks(l.id));
    var isDone=prog.doneListId===l.id;
    html+='<div class="pm-list" data-list-id="'+l.id+'" ondragover="pmDragOver(event)" ondrop="pmDrop(event,\''+l.id+'\')" style="flex:0 0 270px;background:var(--s1);border:1px solid var(--bd);border-radius:12px;padding:12px;max-height:calc(100vh - 220px);display:flex;flex-direction:column">'+
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">'+
        (isDone?'<span style="color:var(--gn)">✓</span>':'')+
        '<span style="font-size:13px;font-weight:700;color:var(--tx);flex:1">'+esc(l.title)+'</span>'+
        '<span style="background:var(--s3);color:var(--tx3);border-radius:10px;padding:1px 8px;font-size:11px;font-weight:700">'+tasks.length+'</span>'+
      '</div>'+
      '<div class="pm-cards" style="display:flex;flex-direction:column;gap:8px;overflow-y:auto;flex:1;min-height:20px">';
    tasks.forEach(function(t){html+=pmCardHtml(t);});
    html+='</div>'+
      '<button onclick="pmQuickAdd(\''+b.id+'\',\''+l.id+'\')" style="margin-top:8px;background:transparent;border:1px dashed var(--bd2);border-radius:8px;padding:8px;cursor:pointer;font-family:inherit;font-size:12px;color:var(--tx3);width:100%" onmouseover="this.style.borderColor=\'var(--ac)\';this.style.color=\'var(--ac)\'" onmouseout="this.style.borderColor=\'var(--bd2)\';this.style.color=\'var(--tx3)\'">＋ Aufgabe</button>'+
    '</div>';
  });
  // Neue Liste
  html+='<div style="flex:0 0 200px"><button onclick="pmAddList(\''+b.id+'\')" style="background:var(--s2);border:1px dashed var(--bd2);border-radius:12px;padding:14px;cursor:pointer;font-family:inherit;font-size:13px;color:var(--tx3);width:100%" onmouseover="this.style.borderColor=\'var(--ac)\'" onmouseout="this.style.borderColor=\'var(--bd2)\'">＋ Liste hinzufügen</button></div>';
  html+='</div>';

  document.getElementById('tasksBody').innerHTML=html;
  document.getElementById('tasksBreadcrumb').textContent=b.title;
}

// ─── Karte (Card) HTML ───
function pmCardHtml(t){
  var p=pmPriority(t.priority);
  var overdue=pmIsOverdue(t);
  var dueToday=pmIsDueToday(t);
  var checkDone=t.checklist.filter(function(c){return c.done;}).length;
  var fmt=function(d){return new Date(d).toLocaleDateString('de-DE',{day:'2-digit',month:'short'});};

  var html='<div draggable="true" ondragstart="pmDragStart(event,\''+t.id+'\')" ondragend="pmDragEnd(event)" onclick="pmOpenTask(\''+t.id+'\')" '+
    'style="background:var(--s2);border:1px solid '+(overdue?'var(--rd)':'var(--bd)')+';border-left:3px solid var(--'+p.color+');border-radius:9px;padding:10px 12px;cursor:pointer;transition:all .14s'+(overdue?';box-shadow:0 0 0 1px var(--rd)44':'')+'" '+
    'onmouseover="this.style.background=\'var(--s3)\'" onmouseout="this.style.background=\'var(--s2)\'">';

  // Labels
  if(t.labels&&t.labels.length){
    html+='<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px">';
    t.labels.forEach(function(lid){var lb=pmLabel(lid);if(lb)html+='<span style="background:var(--'+lb.color+');color:#fff;border-radius:4px;padding:1px 7px;font-size:9px;font-weight:700">'+esc(lb.name)+'</span>';});
    html+='</div>';
  }

  // Titel
  html+='<div style="font-size:13px;font-weight:600;color:var(--tx);line-height:1.35;margin-bottom:8px">'+esc(t.title)+'</div>';

  // Meta-Zeile
  var meta=[];
  meta.push('<span title="'+p.label+'">'+p.icon+'</span>');
  if(t.dueDate){
    var col=overdue?'var(--rd)':(dueToday?'var(--or)':'var(--tx3)');
    meta.push('<span style="color:'+col+';font-weight:'+(overdue||dueToday?'700':'500')+'">'+(overdue?'⏰ ':'📅 ')+fmt(t.dueDate)+(t.dueTime?' '+t.dueTime:'')+'</span>');
  }
  if(t.checklist.length)meta.push('<span style="color:var(--tx3)">☑ '+checkDone+'/'+t.checklist.length+'</span>');
  if(t.comments.length)meta.push('<span style="color:var(--tx3)">💬 '+t.comments.length+'</span>');
  if(t.recurring)meta.push('<span title="Wiederkehrend" style="color:var(--cy)">🔁</span>');
  if(t.assignee)meta.push('<span style="background:var(--pu);color:#fff;border-radius:50%;width:18px;height:18px;display:inline-flex;align-items:center;justify-content:center;font-size:9px;font-weight:700" title="'+esc(t.assignee)+'">'+esc(t.assignee.slice(0,2).toUpperCase())+'</span>');

  html+='<div style="display:flex;align-items:center;gap:8px;font-size:11px;flex-wrap:wrap">'+meta.join('')+'</div>';
  html+='</div>';
  return html;
}

// ─── MEINE AUFGABEN ───
function pmRenderMyTasks(){
  var due=getDueTasks();
  var allOpen=taskService.getAll().filter(function(t){
    var prog=calculateBoardProgress(t.boardId);
    return !(prog.doneListId&&t.listId===prog.doneListId);
  });
  var fmt=function(d){return d?new Date(d).toLocaleDateString('de-DE',{weekday:'short',day:'2-digit',month:'short'}):'';};

  var html='';
  html+='<div style="display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap">'+
    '<button onclick="pmGo(\'dashboard\')" style="padding:8px 16px;border-radius:8px;border:1.5px solid var(--bd);background:transparent;color:var(--tx2);font-family:inherit;font-size:13px;font-weight:600;cursor:pointer">📊 Übersicht</button>'+
    '<button onclick="pmGo(\'myTasks\')" style="padding:8px 16px;border-radius:8px;border:1.5px solid var(--ac);background:var(--ac);color:#fff;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer">👤 Meine Aufgaben</button>'+
  '</div>';

  function section(title,tasks,color,icon){
    if(tasks.length===0)return '';
    var s='<div style="margin-bottom:22px"><div style="font-size:13px;font-weight:700;color:var(--'+color+');margin-bottom:10px;display:flex;align-items:center;gap:8px">'+icon+' '+title+' <span style="background:var(--'+color+'d);color:var(--'+color+');border-radius:10px;padding:1px 8px;font-size:11px">'+tasks.length+'</span></div><div style="display:flex;flex-direction:column;gap:8px">';
    tasks.forEach(function(t){
      var p=pmPriority(t.priority);
      var bd=pmBoard(t.boardId);
      s+='<div onclick="pmOpenTask(\''+t.id+'\')" style="background:var(--s2);border:1px solid var(--bd);border-left:3px solid var(--'+p.color+');border-radius:9px;padding:11px 14px;cursor:pointer;display:flex;align-items:center;gap:12px" onmouseover="this.style.background=\'var(--s3)\'" onmouseout="this.style.background=\'var(--s2)\'">'+
        '<span>'+p.icon+'</span>'+
        '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600;color:var(--tx)">'+esc(t.title)+'</div>'+
        '<div style="font-size:11px;color:var(--tx3)">'+(bd?bd.icon+' '+esc(bd.title):'')+' · '+pmListName(t.listId)+'</div></div>'+
        (t.dueDate?'<span style="font-size:11px;color:var(--'+color+');font-weight:600">'+fmt(t.dueDate)+(t.dueTime?' '+t.dueTime:'')+'</span>':'')+
      '</div>';
    });
    s+='</div></div>';
    return s;
  }

  if(allOpen.length===0){
    html+='<div style="text-align:center;padding:60px 20px;color:var(--tx3)"><div style="font-size:48px;margin-bottom:12px">🎉</div><div style="font-size:16px;font-weight:700;color:var(--tx2)">Keine offenen Aufgaben!</div><div style="font-size:13px;margin-top:4px">Erstelle ein Board, um loszulegen.</div></div>';
  }else{
    html+=section('Überfällig',due.overdue,'rd','🔴');
    html+=section('Heute fällig',due.today,'or','📅');
    html+=section('Bald fällig (nächste 2 Tage)',due.soon,'ac','⏳');
    // Ohne Datum
    var noDate=allOpen.filter(function(t){return !t.dueDate;});
    html+=section('Ohne Fälligkeitsdatum',noDate,'bl','📋');
  }

  document.getElementById('tasksBody').innerHTML=html;
  document.getElementById('tasksBreadcrumb').textContent='Meine Aufgaben';
}

// ═══════════════════════════════════════════════════════════════
// NAVIGATION & AKTIONEN
// ═══════════════════════════════════════════════════════════════
function pmGo(view){pmState.view=view;renderTasks();}
function pmOpenBoard(id){pmState.activeBoardId=id;pmState.view='board';renderTasks();}
function pmCreateBoardFromTemplate(tplId){var b=pmCreateFromTemplate(tplId);save();pmOpenBoard(b.id);toast('✓ Board erstellt');}
function pmNewBoardDialog(){
  gmPrompt('Neues Board erstellen',[
    {l:'Board-Name *',id:'pmbName'},
    {l:'Icon (Emoji)',id:'pmbIcon'},
    {l:'Farbe',id:'pmbColor',tag:'select',opts:['ac','gn','bl','pu','pk','or','cy','rd']}
  ],function(){
    var name=document.getElementById('pmbName').value.trim();if(!name)return toast('Name fehlt');
    var icon=document.getElementById('pmbIcon').value.trim()||'📋';
    var color=document.getElementById('pmbColor').value||'ac';
    var b=pmCreateEmptyBoard(name,icon,color);save();pmOpenBoard(b.id);toast('✓ Board erstellt');
  });
}
function pmAddList(boardId){
  var name=prompt('Name der neuen Liste:');if(!name||!name.trim())return;
  createList(boardId,name.trim());save();pmRenderBoard();
}
function pmQuickAdd(boardId,listId){
  var title=prompt('Titel der Aufgabe:');if(!title||!title.trim())return;
  createTask(boardId,listId,{title:title.trim()});save();pmRenderBoard();
}
function pmConfirmDeleteBoard(boardId){
  var b=pmBoard(boardId);if(!b)return;
  if(confirm('Board „'+b.title+'" und alle Aufgaben endgültig löschen?')){deleteBoard(boardId);save();renderTasks();toast('Board gelöscht');}
}
function pmBoardMenu(boardId){
  var b=pmBoard(boardId);if(!b)return;
  gmPrompt('Board: '+b.title,[
    {l:'Board-Name',id:'pmbeName'},
    {l:'Icon',id:'pmbeIcon'}
  ],function(){
    var name=document.getElementById('pmbeName').value.trim();
    var icon=document.getElementById('pmbeIcon').value.trim();
    var ch={};if(name)ch.title=name;if(icon)ch.icon=icon;
    var bb=pmBoard(boardId);Object.keys(ch).forEach(function(k){bb[k]=ch[k];});
    save();pmRenderBoard();toast('✓ Gespeichert');
  });
  setTimeout(function(){
    var n=document.getElementById('pmbeName');if(n)n.value=b.title;
    var i=document.getElementById('pmbeIcon');if(i)i.value=b.icon;
    // Archiv/Löschen-Buttons in Modal ergänzen
    var body=document.getElementById('gmBody');
    if(body&&!document.getElementById('pmBoardExtraBtns')){
      var extra=document.createElement('div');extra.id='pmBoardExtraBtns';extra.style.cssText='display:flex;gap:8px;margin-top:14px;padding-top:14px;border-top:1px solid var(--bd)';
      extra.innerHTML='<button onclick="closeGM();archiveBoard(\''+boardId+'\');save();renderTasks();toast(\'Archiviert\')" style="flex:1;background:var(--or);color:#fff;border:none;border-radius:8px;padding:9px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:700">📦 Archivieren</button>'+
        '<button onclick="closeGM();pmConfirmDeleteBoard(\''+boardId+'\')" style="flex:1;background:var(--rd);color:#fff;border:none;border-radius:8px;padding:9px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:700">🗑️ Löschen</button>';
      body.appendChild(extra);
    }
  },120);
}

// ═══════════════════════════════════════════════════════════════
// DRAG & DROP
// ═══════════════════════════════════════════════════════════════
function pmDragStart(ev,taskId){
  pmState.dragTaskId=taskId;
  ev.dataTransfer.effectAllowed='move';
  ev.target.style.opacity='0.4';
}
function pmDragEnd(ev){ev.target.style.opacity='1';}
function pmDragOver(ev){ev.preventDefault();ev.dataTransfer.dropEffect='move';}
function pmDrop(ev,listId){
  ev.preventDefault();
  var taskId=pmState.dragTaskId;
  if(!taskId)return;
  // Position anhand Maus-Y bestimmen
  var container=ev.currentTarget.querySelector('.pm-cards');
  var cards=Array.from(container.querySelectorAll('[draggable]'));
  var targetOrder=cards.length;
  for(var i=0;i<cards.length;i++){
    var rect=cards[i].getBoundingClientRect();
    if(ev.clientY<rect.top+rect.height/2){targetOrder=i;break;}
  }
  moveTask(taskId,listId,targetOrder);
  notifHandleRecurringComplete(taskId);
  pmState.dragTaskId=null;
  save();pmRenderBoard();notifUpdateBell();
}

// ═══════════════════════════════════════════════════════════════
// TASK-DETAIL-DRAWER
// ═══════════════════════════════════════════════════════════════
function pmOpenTask(taskId){
  var t=pmTask(taskId);if(!t)return;
  var drawer=document.getElementById('pmDrawer');
  if(!drawer){
    drawer=document.createElement('div');drawer.id='pmDrawer';
    document.body.appendChild(drawer);
  }
  drawer.innerHTML=pmTaskDrawerHtml(t);
  drawer.style.display='block';
}
function pmCloseDrawer(){var d=document.getElementById('pmDrawer');if(d)d.style.display='none';if(pmState.view==='board')pmRenderBoard();else renderTasks();}

function pmTaskDrawerHtml(t){
  var p=pmPriority(t.priority);
  var b=pmBoard(t.boardId);
  var lists=pmGetLists(t.boardId);
  var checkDone=t.checklist.filter(function(c){return c.done;}).length;
  var fmtDt=function(iso){return new Date(iso).toLocaleString('de-DE',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});};

  var h='<div onclick="pmCloseDrawer()" style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1000;animation:fadeIn .15s"></div>';
  h+='<div style="position:fixed;top:0;right:0;bottom:0;width:min(540px,100%);background:var(--s1);border-left:1px solid var(--bd2);z-index:1001;overflow-y:auto;box-shadow:-8px 0 30px rgba(0,0,0,.3);animation:slideInRight .2s" onclick="event.stopPropagation()">';
  h+='<div style="padding:20px 24px">';

  // Header
  h+='<div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:18px">'+
    '<div style="flex:1"><div style="font-size:11px;color:var(--tx3);margin-bottom:4px">'+(b?b.icon+' '+esc(b.title):'')+'</div>'+
    '<textarea id="pmtTitle" onchange="pmSaveField(\''+t.id+'\',\'title\',this.value)" style="width:100%;background:transparent;border:none;color:var(--tx);font-family:inherit;font-size:19px;font-weight:700;resize:none;line-height:1.3;overflow:hidden" rows="1" oninput="this.style.height=\'auto\';this.style.height=this.scrollHeight+\'px\'">'+esc(t.title)+'</textarea></div>'+
    '<button onclick="pmCloseDrawer()" style="background:var(--s3);border:none;border-radius:8px;width:32px;height:32px;cursor:pointer;color:var(--tx2);font-size:18px;flex-shrink:0">✕</button>'+
  '</div>';

  // Quick-Controls (Liste, Priorität, Fälligkeit)
  h+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px">';
  h+='<div><label style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--tx3);font-weight:700">Liste / Status</label>'+
    '<select onchange="pmMoveToList(\''+t.id+'\',this.value)" style="width:100%;margin-top:4px;padding:8px;border-radius:7px;border:1px solid var(--bd);background:var(--s2);color:var(--tx);font-family:inherit;font-size:13px">'+
    lists.map(function(l){return '<option value="'+l.id+'"'+(l.id===t.listId?' selected':'')+'>'+esc(l.title)+'</option>';}).join('')+'</select></div>';
  h+='<div><label style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--tx3);font-weight:700">Priorität</label>'+
    '<select onchange="pmSaveField(\''+t.id+'\',\'priority\',this.value)" style="width:100%;margin-top:4px;padding:8px;border-radius:7px;border:1px solid var(--bd);background:var(--s2);color:var(--tx);font-family:inherit;font-size:13px">'+
    PM_PRIORITIES.map(function(pr){return '<option value="'+pr.id+'"'+(pr.id===t.priority?' selected':'')+'>'+pr.icon+' '+pr.label+'</option>';}).join('')+'</select></div>';
  h+='<div><label style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--tx3);font-weight:700">Fällig am</label>'+
    '<input type="date" value="'+esc(t.dueDate)+'" onchange="pmSaveField(\''+t.id+'\',\'dueDate\',this.value)" style="width:100%;margin-top:4px;padding:8px;border-radius:7px;border:1px solid var(--bd);background:var(--s2);color:var(--tx);font-family:inherit;font-size:13px"></div>';
  h+='<div><label style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--tx3);font-weight:700">Uhrzeit</label>'+
    '<input type="time" value="'+esc(t.dueTime)+'" onchange="pmSaveField(\''+t.id+'\',\'dueTime\',this.value)" style="width:100%;margin-top:4px;padding:8px;border-radius:7px;border:1px solid var(--bd);background:var(--s2);color:var(--tx);font-family:inherit;font-size:13px"></div>';
  h+='<div><label style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--tx3);font-weight:700">Verantwortlich</label>'+
    '<input type="text" value="'+esc(t.assignee)+'" placeholder="Name/Kürzel" onchange="pmSaveField(\''+t.id+'\',\'assignee\',this.value)" style="width:100%;margin-top:4px;padding:8px;border-radius:7px;border:1px solid var(--bd);background:var(--s2);color:var(--tx);font-family:inherit;font-size:13px"></div>';
  h+='<div><label style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--tx3);font-weight:700">Wiederkehrend</label>'+
    '<select onchange="pmSaveField(\''+t.id+'\',\'recurring\',this.value)" style="width:100%;margin-top:4px;padding:8px;border-radius:7px;border:1px solid var(--bd);background:var(--s2);color:var(--tx);font-family:inherit;font-size:13px">'+
    ['','täglich','wöchentlich','monatlich'].map(function(r){return '<option value="'+r+'"'+(r===t.recurring?' selected':'')+'>'+(r||'— nein —')+'</option>';}).join('')+'</select></div>';
  h+='</div>';

  // Labels
  h+='<div style="margin-bottom:18px"><label style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--tx3);font-weight:700;display:block;margin-bottom:6px">Labels</label><div style="display:flex;flex-wrap:wrap;gap:6px">';
  (D.pm.labels||[]).forEach(function(lb){
    var active=t.labels.indexOf(lb.id)>=0;
    h+='<button onclick="pmToggleLabel(\''+t.id+'\',\''+lb.id+'\')" style="background:'+(active?'var(--'+lb.color+')':'var(--s2)')+';color:'+(active?'#fff':'var(--tx2)')+';border:1px solid var(--'+lb.color+');border-radius:6px;padding:4px 10px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit">'+(active?'✓ ':'')+esc(lb.name)+'</button>';
  });
  h+='</div></div>';

  // Beschreibung
  h+='<div style="margin-bottom:18px"><label style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--tx3);font-weight:700;display:block;margin-bottom:6px">📝 Beschreibung</label>'+
    '<textarea onchange="pmSaveField(\''+t.id+'\',\'desc\',this.value)" placeholder="Details zur Aufgabe…" style="width:100%;min-height:70px;padding:10px;border-radius:8px;border:1px solid var(--bd);background:var(--s2);color:var(--tx);font-family:inherit;font-size:13px;resize:vertical;line-height:1.5">'+esc(t.desc)+'</textarea></div>';

  // Checkliste / Subtasks
  h+='<div style="margin-bottom:18px"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px"><label style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--tx3);font-weight:700">☑ Checkliste'+(t.checklist.length?' ('+checkDone+'/'+t.checklist.length+')':'')+'</label></div>';
  if(t.checklist.length){
    h+='<div style="height:5px;background:var(--s3);border-radius:3px;overflow:hidden;margin-bottom:10px"><div style="height:100%;background:var(--gn);width:'+(t.checklist.length?Math.round(checkDone/t.checklist.length*100):0)+'%;transition:width .3s"></div></div>';
    h+='<div style="display:flex;flex-direction:column;gap:5px;margin-bottom:8px">';
    t.checklist.forEach(function(c,i){
      h+='<div style="display:flex;align-items:center;gap:8px;padding:5px 8px;background:var(--s2);border-radius:7px"><input type="checkbox"'+(c.done?' checked':'')+' onchange="pmToggleCheck(\''+t.id+'\','+i+')" style="width:16px;height:16px;accent-color:var(--gn);cursor:pointer"><span style="flex:1;font-size:13px;color:'+(c.done?'var(--tx3)':'var(--tx)')+';'+(c.done?'text-decoration:line-through':'')+'">'+esc(c.text)+'</span><button onclick="pmDelCheck(\''+t.id+'\','+i+')" style="background:none;border:none;color:var(--tx3);cursor:pointer;font-size:14px">✕</button></div>';
    });
    h+='</div>';
  }
  h+='<div style="display:flex;gap:6px"><input type="text" id="pmNewCheck_'+t.id+'" placeholder="Neuer Punkt…" onkeydown="if(event.key===\'Enter\')pmAddCheck(\''+t.id+'\')" style="flex:1;padding:7px 10px;border-radius:7px;border:1px solid var(--bd);background:var(--s2);color:var(--tx);font-family:inherit;font-size:12px"><button onclick="pmAddCheck(\''+t.id+'\')" style="background:var(--ac);color:#fff;border:none;border-radius:7px;padding:7px 12px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:700">＋</button></div></div>';

  // Kommentare
  h+='<div style="margin-bottom:18px"><label style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--tx3);font-weight:700;display:block;margin-bottom:8px">💬 Kommentare</label>';
  if(t.comments.length){
    h+='<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:8px">';
    t.comments.forEach(function(c){
      h+='<div style="background:var(--s2);border-radius:8px;padding:8px 12px"><div style="font-size:13px;color:var(--tx);line-height:1.5">'+esc(c.text)+'</div><div style="font-size:10px;color:var(--tx3);margin-top:3px">'+fmtDt(c.at)+'</div></div>';
    });
    h+='</div>';
  }
  h+='<div style="display:flex;gap:6px"><input type="text" id="pmNewComment_'+t.id+'" placeholder="Kommentar…" onkeydown="if(event.key===\'Enter\')pmAddComment(\''+t.id+'\')" style="flex:1;padding:7px 10px;border-radius:7px;border:1px solid var(--bd);background:var(--s2);color:var(--tx);font-family:inherit;font-size:12px"><button onclick="pmAddComment(\''+t.id+'\')" style="background:var(--ac);color:#fff;border:none;border-radius:7px;padding:7px 12px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:700">Senden</button></div></div>';

  // Aktivitätsverlauf
  h+='<div style="margin-bottom:18px"><details><summary style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--tx3);font-weight:700;cursor:pointer">📜 Aktivitätsverlauf ('+t.activity.length+')</summary><div style="display:flex;flex-direction:column;gap:4px;margin-top:8px">';
  t.activity.slice().reverse().forEach(function(a){
    h+='<div style="font-size:11px;color:var(--tx3);display:flex;gap:8px"><span style="color:var(--tx2)">'+fmtDt(a.at)+'</span><span>'+esc(a.text)+'</span></div>';
  });
  h+='</div></details></div>';

  // Meta + Löschen
  h+='<div style="border-top:1px solid var(--bd);padding-top:14px;display:flex;align-items:center;justify-content:space-between">'+
    '<div style="font-size:10px;color:var(--tx3)">Erstellt '+fmtDt(t.createdAt)+'<br>Aktualisiert '+fmtDt(t.updatedAt)+'</div>'+
    '<button onclick="pmDeleteTaskConfirm(\''+t.id+'\')" style="background:var(--rdd);color:var(--rd);border:1px solid var(--rd);border-radius:8px;padding:8px 14px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:700">🗑️ Aufgabe löschen</button>'+
  '</div>';

  // Anhänge-Platzhalter
  h+='<div style="margin-top:14px;padding:10px 12px;background:var(--s2);border:1px dashed var(--bd2);border-radius:8px;font-size:11px;color:var(--tx3);text-align:center">📎 Dateianhänge folgen in einer späteren Etappe (offline-Architektur)</div>';

  h+='</div></div>';
  return h;
}

// ─── Drawer-Aktionen ───
function pmSaveField(taskId,field,value){
  var labels={title:'Titel',desc:'Beschreibung',priority:'Priorität',dueDate:'Fälligkeitsdatum',dueTime:'Uhrzeit',assignee:'Verantwortlicher',recurring:'Wiederholung'};
  var ch={};ch[field]=value;
  updateTask(taskId,ch,(labels[field]||field)+' geändert');
  save();
  // Bei Datums-/Prioritätsänderung Karte refreshen, aber Drawer offen lassen
  if(['priority','dueDate','dueTime'].indexOf(field)>=0){var t=pmTask(taskId);/* live refresh nicht nötig */}
}
function pmMoveToList(taskId,listId){moveTask(taskId,listId,null);notifHandleRecurringComplete(taskId);save();var t=pmTask(taskId);pmOpenTask(taskId);notifUpdateBell();}
function pmToggleLabel(taskId,labelId){
  var t=pmTask(taskId);var i=t.labels.indexOf(labelId);
  if(i>=0)t.labels.splice(i,1);else t.labels.push(labelId);
  updateTask(taskId,{},'Label geändert');save();pmOpenTask(taskId);
}
function pmAddCheck(taskId){
  var inp=document.getElementById('pmNewCheck_'+taskId);if(!inp||!inp.value.trim())return;
  var t=pmTask(taskId);t.checklist.push({text:inp.value.trim(),done:false});
  updateTask(taskId,{},'Checklisten-Punkt hinzugefügt');save();pmOpenTask(taskId);
}
function pmToggleCheck(taskId,idx){
  var t=pmTask(taskId);if(t.checklist[idx]){t.checklist[idx].done=!t.checklist[idx].done;updateTask(taskId,{});save();pmOpenTask(taskId);}
}
function pmDelCheck(taskId,idx){var t=pmTask(taskId);t.checklist.splice(idx,1);updateTask(taskId,{});save();pmOpenTask(taskId);}
function pmAddComment(taskId){
  var inp=document.getElementById('pmNewComment_'+taskId);if(!inp||!inp.value.trim())return;
  var t=pmTask(taskId);t.comments.push({text:inp.value.trim(),at:new Date().toISOString()});
  updateTask(taskId,{},'Kommentar hinzugefügt');save();pmOpenTask(taskId);
}
function pmDeleteTaskConfirm(taskId){
  if(confirm('Diese Aufgabe endgültig löschen?')){deleteTask(taskId);save();pmCloseDrawer();toast('Aufgabe gelöscht');}
}

// ═══════════════════════════════════════════════════════════════
// NISCHEN-ANALYZER — Portfolio-Bewertung mehrerer Produktnischen
// ───────────────────────────────────────────────────────────────
// Transparenter Score: jede Berechnung ist nachvollziehbar.
// Daten: D.nischen = { items:[], weights:{}, assumptions:{} }
// ═══════════════════════════════════════════════════════════════

// ─── AMZ SellerHub-Standard-Kriterien (aus Wissams Recherche-Logik) ───
var NISCHEN_KRITERIEN={
  preisMin:20, preisMax:50,        // EUR Verkaufspreis
  maxGewicht:2000,                 // g (für günstige FBA-Gebühren)
  maxMarken:3,                     // max. dominante Marken (kein Monopol)
  minSuchvolumen:5000,             // monatlich
  minTrend:0                       // % (nicht fallend)
};

// ─── Standard-Gewichtungen (Summe = 100) ───
var NISCHEN_WEIGHTS_DEFAULT={
  nachfrage:30,   // Marktgröße + Suchvolumen
  wettbewerb:25,  // wenig Konkurrenz = besser
  marge:25,       // Profitabilität
  trend:20        // Wachstum
};

// ─── Standard-Annahmen für ROI (explizit, anpassbar) ───
var NISCHEN_ASSUMPTIONS_DEFAULT={
  herstellkostenQuote:25,   // % vom VK (China-Sourcing, Annahme)
  fbaGebuehrQuote:15,       // % vom VK (Amazon-Gebühren grob)
  ppcQuote:12,              // % vom VK (Werbung)
  retourenQuote:5,          // % vom VK
  startMenge:500,           // Stück Erstbestellung (für ROI-Jahr-1)
  marktanteilZiel:3         // % des Nischenumsatzes, den man als Neueinsteiger anpeilt
};

function nischenInit(){
  D.nischen=D.nischen||{};
  D.nischen.items=D.nischen.items||[];
  D.nischen.weights=D.nischen.weights||Object.assign({},NISCHEN_WEIGHTS_DEFAULT);
  D.nischen.assumptions=D.nischen.assumptions||Object.assign({},NISCHEN_ASSUMPTIONS_DEFAULT);
}

function nischenId(){return 'nis_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);}

// ─── Nische anlegen / bearbeiten / löschen ───
function nischenAdd(fields){
  nischenInit();
  var n=Object.assign({
    id:nischenId(), name:'', kategorie:'',
    umsatz:0,        // monatl. Marktumsatz EUR
    preis:0,         // Ø Verkaufspreis EUR
    reviews:0,       // Ø Reviews der Top-Anbieter
    bsr:0,           // Best Seller Rank
    trend:0,         // % Trend
    gewicht:0,       // g
    marken:0,        // Anzahl dominanter Marken
    suchvolumen:0,   // monatl.
    schwaechen:'',   // Schwächen der Top 3 (Freitext)
    createdAt:new Date().toISOString()
  },fields||{});
  D.nischen.items.push(n);
  return n;
}
function nischenUpdate(id,changes){var n=D.nischen.items.find(function(x){return x.id===id;});if(n)Object.keys(changes).forEach(function(k){n[k]=changes[k];});return n;}
function nischenDelete(id){D.nischen.items=D.nischen.items.filter(function(n){return n.id!==id;});}
function nischenGet(id){return D.nischen.items.find(function(n){return n.id===id;});}

// ═══════════════════════════════════════════════════════════════
// SCORING — transparent & nachvollziehbar
// Jede Teil-Bewertung gibt 0..10 zurück (mit Begründung).
// ═══════════════════════════════════════════════════════════════

// Hilfsfunktion: Wert auf 0..10 skalieren (mit Ober-/Untergrenze)
function nScale(val,min,max){
  if(max===min)return 5;
  var s=(val-min)/(max-min)*10;
  return Math.max(0,Math.min(10,s));
}

// ── Nachfrage-Score (Umsatz + Suchvolumen) ──
function nScoreNachfrage(n){
  // Umsatz: 0 € → 0, 500k+ € → 10 (logarithmisch sinnvoller, aber linear transparent)
  var sUmsatz=nScale(n.umsatz,0,500000);
  var sSuch=nScale(n.suchvolumen,0,50000);
  return (sUmsatz*0.6+sSuch*0.4);
}

// ── Wettbewerbs-Score (wenig Konkurrenz = hoch) ──
// Weniger Reviews + weniger Marken + höherer BSR-Wert (=weniger Top-Verkäufe nötig) = leichter Einstieg
function nScoreWettbewerb(n){
  // Reviews: 0 → 10 (leicht), 3000+ → 0 (schwer)
  var sReviews=10-nScale(n.reviews,0,3000);
  // Marken: 1 → 10, 5+ → 0
  var sMarken=10-nScale(n.marken,1,5);
  return (sReviews*0.6+sMarken*0.4);
}

// ── Margen-Score (auf Basis der Annahmen) ──
function nScoreMarge(n){
  var a=D.nischen.assumptions;
  var kostenQuote=a.herstellkostenQuote+a.fbaGebuehrQuote+a.ppcQuote+a.retourenQuote; // % vom VK
  var margeQuote=100-kostenQuote; // Netto-Marge in %
  // 0% → 0, 40%+ → 10
  return nScale(margeQuote,0,40);
}

// ── Trend-Score ──
function nScoreTrend(n){
  // -20% → 0, +30% → 10, 0% → ~4
  return nScale(n.trend,-20,30);
}

// ── Gesamt-Attraktivität (gewichteter Score 1..10) ──
function nischenAttraktivitaet(n){
  var w=D.nischen.weights;
  var total=w.nachfrage+w.wettbewerb+w.marge+w.trend||1;
  var score=(
    nScoreNachfrage(n)*w.nachfrage+
    nScoreWettbewerb(n)*w.wettbewerb+
    nScoreMarge(n)*w.marge+
    nScoreTrend(n)*w.trend
  )/total;
  return Math.round(score*10)/10;
}

// ── Einstiegsbarriere (1..10, hoch = schwerer Einstieg) ──
// Gegenstück zum Wettbewerbs-Score + Kapitalbedarf
function nischenEinstiegsbarriere(n){
  var wettbewerbLeicht=nScoreWettbewerb(n); // hoch = leicht
  var barriereWettbewerb=10-wettbewerbLeicht; // umkehren
  // Kapitalbedarf: höherer Preis × Startmenge = mehr Kapital nötig
  var a=D.nischen.assumptions;
  var kapital=n.preis*(a.herstellkostenQuote/100)*a.startMenge;
  var barriereKapital=nScale(kapital,0,15000); // 0€ → 0, 15k+ → 10
  return Math.round((barriereWettbewerb*0.65+barriereKapital*0.35)*10)/10;
}

// ── Geschätzter eigener Monatsabsatz (aus Marktdaten, nischenspezifisch) ──
// Realistischer Marktanteil als Neueinsteiger × Nischenumsatz / Preis
function nischenMonatsAbsatz(n){
  var a=D.nischen.assumptions;
  if(n.preis<=0||n.umsatz<=0)return 0;
  var eigenerUmsatz=n.umsatz*(a.marktanteilZiel/100); // z.B. 3% des Marktes
  return Math.round(eigenerUmsatz/n.preis);            // verkaufte Einheiten/Monat
}

// ── Profit-Potenzial (EUR/Jahr, geschätzt) ──
function nischenProfitPotenzial(n){
  var a=D.nischen.assumptions;
  var margeProStueck=n.preis*((100-(a.herstellkostenQuote+a.fbaGebuehrQuote+a.ppcQuote+a.retourenQuote))/100);
  var jahresProfit=margeProStueck*nischenMonatsAbsatz(n)*12;
  return Math.round(jahresProfit);
}

// ── ROI Jahr 1 (%) ──
function nischenROI(n){
  var a=D.nischen.assumptions;
  var investment=n.preis*(a.herstellkostenQuote/100)*a.startMenge; // Wareneinsatz Erstbestellung
  if(investment<=0)return 0;
  var profit=nischenProfitPotenzial(n);
  return Math.round(profit/investment*100);
}

// ── Quick-Win-Faktor (1..10): hohe Attraktivität + niedrige Barriere ──
function nischenQuickWin(n){
  var attr=nischenAttraktivitaet(n);
  var barr=nischenEinstiegsbarriere(n);
  // hohe Attraktivität, niedrige Barriere → hoher Quick-Win
  return Math.round((attr*0.6+(10-barr)*0.4)*10)/10;
}

// ═══════════════════════════════════════════════════════════════
// KRITERIEN-CHECK (gegen AMZ SellerHub-Standards)
// ═══════════════════════════════════════════════════════════════
function nischenKriterienCheck(n){
  var k=NISCHEN_KRITERIEN;
  var checks=[];
  checks.push({label:'Preis '+k.preisMin+'–'+k.preisMax+' €',ok:n.preis>=k.preisMin&&n.preis<=k.preisMax,val:n.preis+' €'});
  checks.push({label:'Gewicht ≤ '+(k.maxGewicht/1000)+' kg',ok:n.gewicht>0&&n.gewicht<=k.maxGewicht,val:n.gewicht?n.gewicht+' g':'?'});
  checks.push({label:'≤ '+k.maxMarken+' dominante Marken',ok:n.marken>0&&n.marken<=k.maxMarken,val:n.marken||'?'});
  checks.push({label:'Suchvolumen ≥ '+k.minSuchvolumen.toLocaleString('de-DE'),ok:n.suchvolumen>=k.minSuchvolumen,val:(n.suchvolumen||0).toLocaleString('de-DE')});
  checks.push({label:'Trend nicht fallend',ok:n.trend>=k.minTrend,val:(n.trend>0?'+':'')+n.trend+'%'});
  var passed=checks.filter(function(c){return c.ok;}).length;
  return {checks:checks,passed:passed,total:checks.length,allPass:passed===checks.length};
}

// ── Gesamt-Ranking (sortiert nach Attraktivität) ──
function nischenRanking(){
  return D.nischen.items.slice().map(function(n){
    return {
      n:n,
      attr:nischenAttraktivitaet(n),
      barr:nischenEinstiegsbarriere(n),
      profit:nischenProfitPotenzial(n),
      roi:nischenROI(n),
      quickwin:nischenQuickWin(n),
      krit:nischenKriterienCheck(n)
    };
  }).sort(function(a,b){return b.attr-a.attr;});
}

// ═══════════════════════════════════════════════════════════════
// NISCHEN-ANALYZER — Rendering
// ═══════════════════════════════════════════════════════════════
function renderNischen(){
  nischenInit();
  var body=document.getElementById('nischenBody');
  var items=D.nischen.items;
  var ranking=nischenRanking();

  var html='';

  // ── Aktionsleiste ──
  html+='<div style="display:flex;gap:10px;margin-bottom:18px;flex-wrap:wrap;align-items:center">'+
    '<button onclick="nischenAddDialog()" style="background:var(--gn);color:#fff;border:none;border-radius:9px;padding:10px 18px;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer">＋ Nische hinzufügen</button>'+
    '<button onclick="nischenWeightsDialog()" style="background:var(--s2);color:var(--tx2);border:1px solid var(--bd);border-radius:9px;padding:10px 16px;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer">⚖️ Gewichtungen</button>'+
    '<button onclick="nischenAssumptionsDialog()" style="background:var(--s2);color:var(--tx2);border:1px solid var(--bd);border-radius:9px;padding:10px 16px;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer">📐 ROI-Annahmen</button>'+
    (items.length?'<span style="margin-left:auto;font-size:12px;color:var(--tx3)">'+items.length+' Nische'+(items.length===1?'':'n')+' im Vergleich</span>':'')+
  '</div>';

  // ── Leerzustand ──
  if(items.length===0){
    html+='<div style="text-align:center;padding:50px 20px;background:var(--s1);border:1px dashed var(--bd2);border-radius:14px">'+
      '<div style="font-size:46px;margin-bottom:12px">🎯</div>'+
      '<div style="font-size:17px;font-weight:700;color:var(--tx);margin-bottom:6px">Noch keine Nischen erfasst</div>'+
      '<div style="font-size:13px;color:var(--tx2);max-width:480px;margin:0 auto 18px;line-height:1.6">Trage die Marktdaten deiner Kandidaten-Nischen ein (aus Helium 10 Black Box / Xray oder manuell). Das Tool berechnet Attraktivität, Einstiegsbarriere, ROI und ein Go/No-Go-Ranking.</div>'+
      '<button onclick="nischenAddDialog()" style="background:var(--ac);color:#fff;border:none;border-radius:9px;padding:11px 22px;font-family:inherit;font-size:14px;font-weight:700;cursor:pointer">Erste Nische hinzufügen</button>'+
      '<div style="margin-top:16px"><button onclick="nischenLoadDemo()" style="background:transparent;color:var(--tx3);border:none;font-family:inherit;font-size:12px;cursor:pointer;text-decoration:underline">Mit Beispieldaten ausprobieren</button></div>'+
    '</div>';
    body.innerHTML=html;
    return;
  }

  var top=ranking[0];

  // ── EXECUTIVE SUMMARY (Top 3) ──
  html+='<div style="background:linear-gradient(135deg,var(--acd),var(--s2));border:1.5px solid var(--ac);border-radius:14px;padding:20px 22px;margin-bottom:20px">'+
    '<div style="font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:var(--ac);font-weight:700;margin-bottom:12px">📋 Executive Summary — Top '+Math.min(3,ranking.length)+'</div>'+
    '<div style="display:flex;flex-direction:column;gap:10px">';
  ranking.slice(0,3).forEach(function(r,i){
    var medal=['🥇','🥈','🥉'][i];
    html+='<div style="display:flex;gap:12px;align-items:flex-start"><span style="font-size:22px">'+medal+'</span>'+
      '<div style="flex:1"><span style="font-size:15px;font-weight:700;color:var(--tx)">'+esc(r.n.name||'Unbenannt')+'</span>'+
      '<span style="font-size:12px;color:var(--tx3);margin-left:8px">'+esc(r.n.kategorie||'')+'</span>'+
      '<div style="font-size:12.5px;color:var(--tx2);margin-top:3px;line-height:1.5">Attraktivität <b style="color:var(--ac)">'+r.attr+'/10</b>, Einstiegsbarriere <b style="color:'+(r.barr<=4?'var(--gn)':r.barr<=6.5?'var(--or)':'var(--rd)')+'">'+r.barr+'/10</b>. Geschätzter Profit <b style="color:var(--gn)">'+r.profit.toLocaleString('de-DE')+' €/Jahr</b> ('+r.krit.passed+'/'+r.krit.total+' Kriterien erfüllt).</div></div></div>';
  });
  html+='</div></div>';

  // ── OPPORTUNITY-MATRIX (visuell) ──
  html+=nischenMatrixSvg(ranking);

  // ── RANKING-TABELLE ──
  html+='<div style="background:var(--s1);border:1px solid var(--bd);border-radius:14px;padding:4px;margin-bottom:20px;overflow-x:auto">'+
    '<table style="width:100%;border-collapse:collapse;font-size:12.5px;min-width:680px">'+
    '<thead><tr style="border-bottom:2px solid var(--bd2)">'+
    ['Nische','Attraktivität','Einstiegs­barriere','Profit-Pot.','ROI Jahr 1*','Quick-Win','Kriterien',''].map(function(h){return '<th style="text-align:left;padding:11px 12px;color:var(--tx2);font-weight:700;white-space:nowrap">'+h+'</th>';}).join('')+
    '</tr></thead><tbody>';
  ranking.forEach(function(r,i){
    var barrColor=r.barr<=4?'gn':r.barr<=6.5?'or':'rd';
    var attrColor=r.attr>=7?'gn':r.attr>=5?'ac':'rd';
    html+='<tr style="border-bottom:1px solid var(--bd)'+(i===0?';background:var(--acd)':'')+'">'+
      '<td style="padding:11px 12px"><div style="font-weight:700;color:var(--tx)">'+(i===0?'🥇 ':'')+esc(r.n.name||'Unbenannt')+'</div><div style="font-size:10.5px;color:var(--tx3)">'+esc(r.n.kategorie||'')+'</div></td>'+
      '<td style="padding:11px 12px">'+nischenBar(r.attr,attrColor)+'</td>'+
      '<td style="padding:11px 12px">'+nischenBar(r.barr,barrColor)+'</td>'+
      '<td style="padding:11px 12px;font-weight:700;color:var(--gn);white-space:nowrap">'+r.profit.toLocaleString('de-DE')+' €</td>'+
      '<td style="padding:11px 12px;font-weight:600;color:var(--cy)">'+r.roi+'%</td>'+
      '<td style="padding:11px 12px">'+nischenBar(r.quickwin,'pu')+'</td>'+
      '<td style="padding:11px 12px"><span style="background:var(--'+(r.krit.allPass?'gnd':'ord')+');color:var(--'+(r.krit.allPass?'gn':'or')+');border-radius:12px;padding:2px 9px;font-size:11px;font-weight:700">'+r.krit.passed+'/'+r.krit.total+'</span></td>'+
      '<td style="padding:11px 12px;white-space:nowrap"><button onclick="nischenDetailDialog(\''+r.n.id+'\')" style="background:var(--s3);border:none;border-radius:6px;padding:5px 9px;cursor:pointer;font-size:14px" title="Details">🔍</button> <button onclick="nischenEditDialog(\''+r.n.id+'\')" style="background:var(--s3);border:none;border-radius:6px;padding:5px 9px;cursor:pointer;font-size:14px" title="Bearbeiten">✏️</button> <button onclick="nischenDeleteConfirm(\''+r.n.id+'\')" style="background:var(--rdd);border:none;border-radius:6px;padding:5px 9px;cursor:pointer;font-size:14px" title="Löschen">🗑️</button></td>'+
    '</tr>';
  });
  html+='</tbody></table></div>';
  html+='<div style="font-size:10.5px;color:var(--tx3);margin:-12px 2px 20px">* ROI Jahr 1 ist eine Schätzung auf Basis deiner Annahmen ('+D.nischen.assumptions.marktanteilZiel+'% Ziel-Marktanteil, '+D.nischen.assumptions.startMenge+' Stk. Erstbestellung). Über „📐 ROI-Annahmen" anpassbar.</div>';

  // ── GO/NO-GO EMPFEHLUNG ──
  html+=nischenGoNoGo(ranking);

  body.innerHTML=html;
}

// ── Mini-Balken für Tabellen-Scores ──
function nischenBar(val,color){
  return '<div style="display:flex;align-items:center;gap:7px"><div style="flex:1;height:7px;background:var(--s3);border-radius:4px;overflow:hidden;min-width:50px"><div style="height:100%;background:var(--'+color+');width:'+(val*10)+'%"></div></div><span style="font-weight:700;color:var(--'+color+');font-size:12px;min-width:26px">'+val+'</span></div>';
}

// ── Visuelle Opportunity-Matrix (SVG) ──
// X = Attraktivität (rechts = besser), Y = Einstiegsbarriere (oben = niedriger = besser)
function nischenMatrixSvg(ranking){
  var W=620,H=420,pad=50;
  var plotW=W-pad*2, plotH=H-pad*2;
  var maxProfit=Math.max.apply(null,ranking.map(function(r){return r.profit;}).concat([1]));

  var pts='';
  ranking.forEach(function(r,i){
    var x=pad+(r.attr/10)*plotW;
    var y=pad+(r.barr/10)*plotH; // barr 0 (leicht) → oben
    var rad=8+Math.sqrt(r.profit/maxProfit)*22; // Punktgröße = Profit
    var col=i===0?'var(--ac)':'var(--bl)';
    pts+='<circle cx="'+x.toFixed(0)+'" cy="'+y.toFixed(0)+'" r="'+rad.toFixed(0)+'" fill="'+col+'" opacity="0.55" stroke="'+col+'" stroke-width="2"/>';
    pts+='<text x="'+x.toFixed(0)+'" y="'+(y-rad-5).toFixed(0)+'" text-anchor="middle" fill="var(--tx)" font-size="11" font-weight="700">'+esc((r.n.name||'?').slice(0,16))+'</text>';
  });

  return '<div style="background:var(--s1);border:1px solid var(--bd);border-radius:14px;padding:18px 20px;margin-bottom:20px">'+
    '<div style="font-size:13px;font-weight:700;color:var(--tx);margin-bottom:4px">📊 Opportunity-Matrix</div>'+
    '<div style="font-size:11px;color:var(--tx3);margin-bottom:12px">Ideal ist oben-rechts: hohe Attraktivität + niedrige Einstiegsbarriere. Punktgröße = Profit-Potenzial.</div>'+
    '<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;max-width:'+W+'px;height:auto;display:block;margin:0 auto">'+
    // Quadranten-Hintergrund
    '<rect x="'+pad+'" y="'+pad+'" width="'+(plotW/2)+'" height="'+(plotH/2)+'" fill="var(--gnd)" opacity="0.25"/>'+ // oben-rechts? nein: oben-links
    '<rect x="'+(pad+plotW/2)+'" y="'+pad+'" width="'+(plotW/2)+'" height="'+(plotH/2)+'" fill="var(--gnd)" opacity="0.5"/>'+ // oben-rechts = SWEET SPOT
    '<text x="'+(pad+plotW*0.75)+'" y="'+(pad+14)+'" text-anchor="middle" fill="var(--gn)" font-size="10" font-weight="700" opacity="0.8">★ SWEET SPOT</text>'+
    // Achsen
    '<line x1="'+pad+'" y1="'+(H-pad)+'" x2="'+(W-pad)+'" y2="'+(H-pad)+'" stroke="var(--bd2)" stroke-width="1.5"/>'+
    '<line x1="'+pad+'" y1="'+pad+'" x2="'+pad+'" y2="'+(H-pad)+'" stroke="var(--bd2)" stroke-width="1.5"/>'+
    // Mittellinien
    '<line x1="'+(pad+plotW/2)+'" y1="'+pad+'" x2="'+(pad+plotW/2)+'" y2="'+(H-pad)+'" stroke="var(--bd)" stroke-dasharray="4 4"/>'+
    '<line x1="'+pad+'" y1="'+(pad+plotH/2)+'" x2="'+(W-pad)+'" y2="'+(pad+plotH/2)+'" stroke="var(--bd)" stroke-dasharray="4 4"/>'+
    // Achsen-Labels
    '<text x="'+(W/2)+'" y="'+(H-12)+'" text-anchor="middle" fill="var(--tx2)" font-size="12" font-weight="700">Attraktivität →</text>'+
    '<text x="16" y="'+(H/2)+'" text-anchor="middle" fill="var(--tx2)" font-size="12" font-weight="700" transform="rotate(-90 16 '+(H/2)+')">← Einstiegsbarriere niedrig (gut)</text>'+
    pts+
    '</svg></div>';
}

// ── Go/No-Go-Empfehlung ──
function nischenGoNoGo(ranking){
  if(!ranking.length)return '';
  var top=ranking[0];
  // Begründung dynamisch
  var gruende=[];
  if(top.attr>=7)gruende.push('hohe Attraktivität ('+top.attr+'/10)');
  else if(top.attr>=5)gruende.push('solide Attraktivität ('+top.attr+'/10)');
  if(top.barr<=4)gruende.push('niedrige Einstiegsbarriere ('+top.barr+'/10)');
  if(top.krit.allPass)gruende.push('alle AMZ SellerHub-Kriterien erfüllt');
  else gruende.push(top.krit.passed+'/'+top.krit.total+' Kriterien erfüllt');
  if(top.roi>=100)gruende.push('attraktiver geschätzter ROI ('+top.roi+'%)');

  // Empfehlung Go/Caution/NoGo
  var verdict,vColor,vIcon;
  if(top.attr>=6.5&&top.barr<=5&&top.krit.passed>=4){verdict='GO';vColor='gn';vIcon='✅';}
  else if(top.attr>=5&&top.krit.passed>=3){verdict='GO MIT VORBEHALT';vColor='or';vIcon='⚠️';}
  else{verdict='NO-GO / WEITER SUCHEN';vColor='rd';vIcon='🛑';}

  var risiken=[];
  if(top.barr>6)risiken.push('hohe Einstiegsbarriere — viel Kapital/Differenzierung nötig');
  if(!top.krit.allPass){var failed=top.krit.checks.filter(function(c){return !c.ok;}).map(function(c){return c.label;});risiken.push('verletzt: '+failed.join(', '));}
  if(top.n.trend<5)risiken.push('schwacher Trend ('+(top.n.trend>0?'+':'')+top.n.trend+'%) — Nachfrage genau prüfen');
  if(top.n.reviews>1500)risiken.push('etablierte Wettbewerber mit vielen Reviews');

  return '<div style="background:linear-gradient(135deg,var(--'+vColor+'d),var(--s1));border:1.5px solid var(--'+vColor+');border-radius:14px;padding:20px 22px;margin-bottom:20px">'+
    '<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px"><span style="font-size:32px">'+vIcon+'</span>'+
    '<div><div style="font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:var(--'+vColor+');font-weight:700">Go/No-Go-Empfehlung</div>'+
    '<div style="font-size:20px;font-weight:800;color:var(--tx)">'+esc(top.n.name||'Top-Nische')+' → '+verdict+'</div></div></div>'+
    '<div style="font-size:13px;color:var(--tx2);line-height:1.6;margin-bottom:'+(risiken.length?'12px':'0')+'">'+
      '<b style="color:var(--'+vColor+')">Warum priorisieren:</b> '+esc(top.n.name||'Diese Nische')+' führt das Ranking an wegen '+gruende.join(', ')+'. '+
      (top.n.schwaechen?'Konkrete Differenzierungs-Chance: '+esc(top.n.schwaechen):'')+'</div>'+
    (risiken.length?'<div style="background:var(--s2);border-radius:8px;padding:10px 14px"><b style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--rd)">⚠️ Risikofaktoren</b><ul style="margin:6px 0 0;padding-left:18px;font-size:12px;color:var(--tx2);line-height:1.6">'+risiken.map(function(r){return '<li>'+esc(r)+'</li>';}).join('')+'</ul></div>':'')+
    // Nächste Schritte
    '<div style="margin-top:14px"><b style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--'+vColor+')">📋 Nächste Schritte</b>'+
    '<ol style="margin:6px 0 0;padding-left:18px;font-size:12.5px;color:var(--tx2);line-height:1.7">'+
      '<li>Tiefe Wettbewerbsanalyse der Top-3-Listings (→ Modul „Wettbewerbsanalyse") — ASINs, Preise, Schwächen erfassen.</li>'+
      '<li>Marge exakt rechnen mit echten Sourcing-Angeboten (→ „FBA-Kalkulator") statt der hier genutzten Annahme von '+(100-(D.nischen.assumptions.herstellkostenQuote+D.nischen.assumptions.fbaGebuehrQuote+D.nischen.assumptions.ppcQuote+D.nischen.assumptions.retourenQuote))+'% Netto-Marge.</li>'+
      '<li>2–3 Lieferanten auf Alibaba anfragen und Muster bestellen (→ „Aufgaben-Board", Vorlage Lieferantenmanagement).</li>'+
    '</ol></div>'+
  '</div>';
}

// ═══════════════════════════════════════════════════════════════
// DIALOGE
// ═══════════════════════════════════════════════════════════════
function nischenFields(n){
  n=n||{};
  return [
    {l:'Nischen-Name *',id:'niName',val:n.name||''},
    {l:'Kategorie',id:'niKat',val:n.kategorie||''},
    {l:'Monatl. Marktumsatz (€)',id:'niUmsatz',val:n.umsatz||'',t:'number'},
    {l:'Ø Verkaufspreis (€)',id:'niPreis',val:n.preis||'',t:'number'},
    {l:'Ø Reviews (Top-Anbieter)',id:'niReviews',val:n.reviews||'',t:'number'},
    {l:'BSR (Best Seller Rank)',id:'niBsr',val:n.bsr||'',t:'number'},
    {l:'Trend (%)',id:'niTrend',val:n.trend||'',t:'number'},
    {l:'Produktgewicht (g)',id:'niGewicht',val:n.gewicht||'',t:'number'},
    {l:'Anzahl dominante Marken',id:'niMarken',val:n.marken||'',t:'number'},
    {l:'Monatl. Suchvolumen',id:'niSuch',val:n.suchvolumen||'',t:'number'},
    {l:'Schwächen der Top 3 (Differenzierungs-Chance)',id:'niSchwaechen',val:n.schwaechen||'',tag:'textarea'}
  ];
}
function nischenReadFields(){
  return {
    name:document.getElementById('niName').value.trim(),
    kategorie:document.getElementById('niKat').value.trim(),
    umsatz:pf('niUmsatz'),preis:pf('niPreis'),reviews:pf('niReviews'),
    bsr:pf('niBsr'),trend:pf('niTrend'),gewicht:pf('niGewicht'),
    marken:pf('niMarken'),suchvolumen:pf('niSuch'),
    schwaechen:document.getElementById('niSchwaechen').value.trim()
  };
}
// Hilfsfunktion: Feldwerte nach gmPrompt-Aufbau setzen (gmPrompt befüllt nicht selbst)
function nischenSetVals(map){
  setTimeout(function(){Object.keys(map).forEach(function(id){var el=document.getElementById(id);if(el&&map[id]!=null&&map[id]!=='')el.value=map[id];});},80);
}
function nischenAddDialog(){
  gmPrompt('Nische hinzufügen',nischenFields(),function(){
    var f=nischenReadFields();if(!f.name)return toast('Name fehlt');
    nischenAdd(f);save();renderNischen();toast('✓ Nische hinzugefügt');
  });
}
function nischenEditDialog(id){
  var n=nischenGet(id);if(!n)return;
  gmPrompt('Nische bearbeiten',nischenFields(n),function(){
    var f=nischenReadFields();if(!f.name)return toast('Name fehlt');
    nischenUpdate(id,f);save();renderNischen();toast('✓ Gespeichert');
  });
  nischenSetVals({niName:n.name,niKat:n.kategorie,niUmsatz:n.umsatz,niPreis:n.preis,niReviews:n.reviews,niBsr:n.bsr,niTrend:n.trend,niGewicht:n.gewicht,niMarken:n.marken,niSuch:n.suchvolumen,niSchwaechen:n.schwaechen});
}
function nischenDeleteConfirm(id){
  var n=nischenGet(id);if(!n)return;
  if(confirm('Nische „'+(n.name||'')+'" löschen?')){nischenDelete(id);save();renderNischen();toast('Gelöscht');}
}
function nischenWeightsDialog(){
  var w=D.nischen.weights;
  gmPrompt('Score-Gewichtungen (Summe sollte 100 ergeben)',[
    {l:'Nachfrage (%)',id:'wNach',t:'number'},
    {l:'Wettbewerb (%)',id:'wWett',t:'number'},
    {l:'Marge (%)',id:'wMarge',t:'number'},
    {l:'Trend (%)',id:'wTrend',t:'number'}
  ],function(){
    D.nischen.weights={nachfrage:pf('wNach'),wettbewerb:pf('wWett'),marge:pf('wMarge'),trend:pf('wTrend')};
    save();renderNischen();toast('✓ Gewichtungen aktualisiert');
  });
  nischenSetVals({wNach:w.nachfrage,wWett:w.wettbewerb,wMarge:w.marge,wTrend:w.trend});
}
function nischenAssumptionsDialog(){
  var a=D.nischen.assumptions;
  gmPrompt('ROI-Annahmen (transparent & anpassbar)',[
    {l:'Herstellkosten (% vom VK)',id:'aHk',t:'number'},
    {l:'FBA-Gebühren (% vom VK)',id:'aFba',t:'number'},
    {l:'PPC/Werbung (% vom VK)',id:'aPpc',t:'number'},
    {l:'Retouren (% vom VK)',id:'aRet',t:'number'},
    {l:'Erstbestellung (Stück)',id:'aMenge',t:'number'},
    {l:'Ziel-Marktanteil (% des Nischenumsatzes)',id:'aAnteil',t:'number'}
  ],function(){
    D.nischen.assumptions={herstellkostenQuote:pf('aHk'),fbaGebuehrQuote:pf('aFba'),ppcQuote:pf('aPpc'),retourenQuote:pf('aRet'),startMenge:pf('aMenge'),marktanteilZiel:pf('aAnteil')};
    save();renderNischen();toast('✓ Annahmen aktualisiert');
  });
  nischenSetVals({aHk:a.herstellkostenQuote,aFba:a.fbaGebuehrQuote,aPpc:a.ppcQuote,aRet:a.retourenQuote,aMenge:a.startMenge,aAnteil:a.marktanteilZiel});
}
function nischenDetailDialog(id){
  var n=nischenGet(id);if(!n)return;
  var attr=nischenAttraktivitaet(n),barr=nischenEinstiegsbarriere(n);
  var krit=nischenKriterienCheck(n);
  var body='<div style="display:flex;flex-direction:column;gap:14px">';
  // Score-Aufschlüsselung
  body+='<div><div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--tx3);font-weight:700;margin-bottom:8px">Score-Aufschlüsselung</div>'+
    '<div style="display:flex;flex-direction:column;gap:6px">'+
    [['Nachfrage',nScoreNachfrage(n),'gn'],['Wettbewerb (wenig=gut)',nScoreWettbewerb(n),'bl'],['Marge',nScoreMarge(n),'cy'],['Trend',nScoreTrend(n),'pu']].map(function(p){
      return '<div style="display:flex;align-items:center;gap:10px"><span style="font-size:12px;color:var(--tx2);width:160px">'+p[0]+'</span>'+nischenBar(Math.round(p[1]*10)/10,p[2])+'</div>';
    }).join('')+'</div></div>';
  // Kriterien
  body+='<div><div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--tx3);font-weight:700;margin-bottom:8px">Kriterien-Check ('+krit.passed+'/'+krit.total+')</div>'+
    '<div style="display:flex;flex-direction:column;gap:4px">'+krit.checks.map(function(c){
      return '<div style="display:flex;align-items:center;gap:8px;font-size:12.5px"><span>'+(c.ok?'✅':'❌')+'</span><span style="color:var(--tx2);flex:1">'+c.label+'</span><span style="color:var(--tx3);font-weight:600">'+c.val+'</span></div>';
    }).join('')+'</div></div>';
  // Kennzahlen
  body+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'+
    '<div style="background:var(--s2);border-radius:8px;padding:10px"><div style="font-size:10px;color:var(--tx3)">Profit-Potenzial</div><div style="font-size:18px;font-weight:800;color:var(--gn)">'+nischenProfitPotenzial(n).toLocaleString('de-DE')+' €/J</div></div>'+
    '<div style="background:var(--s2);border-radius:8px;padding:10px"><div style="font-size:10px;color:var(--tx3)">ROI Jahr 1*</div><div style="font-size:18px;font-weight:800;color:var(--cy)">'+nischenROI(n)+'%</div></div>'+
    '<div style="background:var(--s2);border-radius:8px;padding:10px"><div style="font-size:10px;color:var(--tx3)">Gesch. Absatz/Monat</div><div style="font-size:18px;font-weight:800;color:var(--ac)">'+nischenMonatsAbsatz(n)+' Stk</div></div>'+
    '<div style="background:var(--s2);border-radius:8px;padding:10px"><div style="font-size:10px;color:var(--tx3)">Quick-Win-Faktor</div><div style="font-size:18px;font-weight:800;color:var(--pu)">'+nischenQuickWin(n)+'/10</div></div>'+
  '</div>';
  if(n.schwaechen)body+='<div style="background:var(--gnd);border-radius:8px;padding:10px 12px"><div style="font-size:10px;color:var(--gn);font-weight:700;text-transform:uppercase;letter-spacing:1px">Differenzierungs-Chance</div><div style="font-size:12.5px;color:var(--tx);margin-top:4px;line-height:1.5">'+esc(n.schwaechen)+'</div></div>';
  body+='<div style="font-size:10px;color:var(--tx3);font-style:italic">* Schätzung auf Basis deiner ROI-Annahmen — keine garantierte Prognose.</div>';
  body+='</div>';
  document.getElementById('gmTitle').textContent='🔍 '+(n.name||'Nische');
  document.getElementById('gmBody').innerHTML=body;
  var sb=document.getElementById('gmSave');if(sb)sb.style.display='none';
  document.getElementById('genModal').classList.add('show');
}

// ── Demo-Daten ──
function nischenLoadDemo(){
  nischenInit();
  [
    {name:'Bambus-Schreibtisch-Organizer',kategorie:'Büro',umsatz:120000,preis:34.99,reviews:380,bsr:18000,trend:22,gewicht:800,marken:2,suchvolumen:8500,schwaechen:'Top-Anbieter haben wacklige Fächer, schlechte Bilder, keine Kabelführung'},
    {name:'Premium-Hundeleine reflektierend',kategorie:'Haustier',umsatz:80000,preis:24.99,reviews:210,bsr:25000,trend:8,gewicht:300,marken:2,suchvolumen:6200,schwaechen:'Wenig Farbauswahl, Karabiner rostet laut Reviews'},
    {name:'Edelstahl-Trinkflasche 1L',kategorie:'Sport',umsatz:450000,preis:29.99,reviews:1250,bsr:5432,trend:15,gewicht:450,marken:5,suchvolumen:22000,schwaechen:'Deckel undicht, Logo löst sich — aber starker Wettbewerb'},
    {name:'Magnetische Messerleiste',kategorie:'Küche',umsatz:95000,preis:39.99,reviews:540,bsr:14000,trend:12,gewicht:700,marken:3,suchvolumen:7100,schwaechen:'Montage kompliziert, Magnet zu schwach für große Messer'}
  ].forEach(nischenAdd);
  save();renderNischen();toast('✓ Beispieldaten geladen');
}


// ═══════════════════════════════════════════════════════════════
// LISTING-EDITOR — Amazon HTML / WYSIWYG
// ───────────────────────────────────────────────────────────────
// WYSIWYG via contenteditable + execCommand (kein externes Lib).
// Erzeugt nur Amazon-konforme Tags. Export: HTML + Klartext.
// Daten: D.listings = { items:[{id,name,html,createdAt,updatedAt}], activeId }
// ═══════════════════════════════════════════════════════════════

// Amazon-Limits (Stand: konservativ, verifiziere im Seller Central)
var LISTING_LIMITS={
  bullet:500,        // Zeichen pro Bullet Point (Attribut)
  description:2000   // Zeichen Produktbeschreibung
};

// Amazon erlaubte HTML-Tags (bei Accounts mit Bestandsschutz)
var LISTING_ALLOWED_TAGS=['b','strong','i','em','u','br','p','ul','ol','li','h3','h4'];

// ─── Vorlagen ───
var LISTING_TEMPLATES=[
  {
    id:'tpl_beschreibung', name:'Produktbeschreibung', icon:'📄',
    desc:'Klassische Beschreibung mit Einleitung + Vorteilen',
    html:'<h3>Produktname – Der Hauptvorteil auf einen Blick</h3>'+
      '<p>Beschreibe hier in 2–3 Sätzen, was dein Produkt besonders macht und welches Problem es löst.</p>'+
      '<p><b>Warum dieses Produkt?</b></p>'+
      '<ul>'+
      '<li><b>Vorteil 1:</b> Konkreter Nutzen für den Kunden</li>'+
      '<li><b>Vorteil 2:</b> Was dich vom Wettbewerb abhebt</li>'+
      '<li><b>Vorteil 3:</b> Qualitätsmerkmal oder Material</li>'+
      '</ul>'+
      '<p><b>Lieferumfang:</b> Liste hier auf, was enthalten ist.</p>'
  },
  {
    id:'tpl_bullets', name:'5 Bullet Points', icon:'•',
    desc:'Die 5 Attribut-Stichpunkte (max. 500 Zeichen je)',
    html:'<ul>'+
      '<li><b>HAUPTVORTEIL:</b> Der wichtigste Grund zu kaufen – starte mit dem stärksten Nutzen in Großbuchstaben.</li>'+
      '<li><b>QUALITÄT &amp; MATERIAL:</b> Woraus besteht es, warum hält es länger als die Konkurrenz.</li>'+
      '<li><b>ANWENDUNG:</b> Wie und wofür wird es genutzt – mache es dem Kunden leicht.</li>'+
      '<li><b>MASSE &amp; KOMPATIBILITÄT:</b> Größe, Gewicht, womit es kompatibel ist.</li>'+
      '<li><b>ZUFRIEDENHEITS-VERSPRECHEN:</b> Garantie, Support oder Service-Zusage.</li>'+
      '</ul>'
  },
  {
    id:'tpl_features', name:'Feature-Liste', icon:'⭐',
    desc:'Übersichtliche Merkmals-Aufzählung',
    html:'<h3>Produkt-Highlights</h3>'+
      '<ul>'+
      '<li>✓ Merkmal 1</li>'+
      '<li>✓ Merkmal 2</li>'+
      '<li>✓ Merkmal 3</li>'+
      '<li>✓ Merkmal 4</li>'+
      '</ul>'+
      '<p><i>Tipp: Halte jede Zeile kurz und konkret.</i></p>'
  },
  {
    id:'tpl_faq', name:'FAQ-Block', icon:'❓',
    desc:'Häufige Fragen vorwegnehmen',
    html:'<h3>Häufige Fragen</h3>'+
      '<p><b>Frage 1?</b><br>Antwort auf die erste häufige Frage.</p>'+
      '<p><b>Frage 2?</b><br>Antwort auf die zweite häufige Frage.</p>'+
      '<p><b>Frage 3?</b><br>Antwort auf die dritte häufige Frage.</p>'
  }
];

function listingInit(){
  D.listings=D.listings||{};
  D.listings.items=D.listings.items||[];
  if(!D.listings.activeId && D.listings.items.length)D.listings.activeId=D.listings.items[0].id;
}
function listingId(){return 'lst_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);}
function listingActive(){return D.listings.items.find(function(l){return l.id===D.listings.activeId;});}
function listingCreate(name,html){
  var l={id:listingId(),name:name||'Neues Listing',html:html||'',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  D.listings.items.push(l);D.listings.activeId=l.id;return l;
}
function listingDelete(id){
  D.listings.items=D.listings.items.filter(function(l){return l.id!==id;});
  if(D.listings.activeId===id)D.listings.activeId=D.listings.items.length?D.listings.items[0].id:null;
}

// ─── HTML säubern: nur erlaubte Tags behalten ───
function listingSanitize(html){
  var tmp=document.createElement('div');tmp.innerHTML=html;
  (function walk(node){
    var children=Array.prototype.slice.call(node.childNodes);
    children.forEach(function(child){
      if(child.nodeType===1){ // Element
        var tag=child.tagName.toLowerCase();
        walk(child);
        if(LISTING_ALLOWED_TAGS.indexOf(tag)<0){
          // Tag durch seinen Inhalt ersetzen (unwrap)
          while(child.firstChild)node.insertBefore(child.firstChild,child);
          node.removeChild(child);
        }else{
          // Alle Attribute entfernen (Amazon erlaubt keine style/class)
          while(child.attributes.length)child.removeAttribute(child.attributes[0].name);
        }
      }
    });
  })(tmp);
  return tmp.innerHTML;
}

// ─── HTML → Klartext (für Amazon-Felder ohne HTML) ───
function listingToPlainText(html){
  var tmp=document.createElement('div');tmp.innerHTML=html;
  var out=[];
  (function walk(node,prefix){
    Array.prototype.slice.call(node.childNodes).forEach(function(child){
      if(child.nodeType===3){ // Text
        var t=child.textContent.replace(/\s+/g,' ').trim();
        if(t)out.push({type:'text',text:t});
      }else if(child.nodeType===1){
        var tag=child.tagName.toLowerCase();
        if(tag==='li'){
          out.push({type:'li',text:child.textContent.replace(/\s+/g,' ').trim()});
        }else if(tag==='br'){
          out.push({type:'br'});
        }else if(tag==='p'||tag==='h3'||tag==='h4'){
          out.push({type:'block',text:child.textContent.replace(/\s+/g,' ').trim()});
        }else if(tag==='ul'||tag==='ol'){
          walk(child,prefix);
          out.push({type:'br'});
        }else{
          walk(child,prefix);
        }
      }
    });
  })(tmp,'');
  // Zusammenbauen
  var lines=[];
  out.forEach(function(o){
    if(o.type==='li')lines.push('• '+o.text);
    else if(o.type==='block'&&o.text)lines.push(o.text);
    else if(o.type==='text'&&o.text)lines.push(o.text);
    else if(o.type==='br')lines.push('');
  });
  // Doppelte Leerzeilen reduzieren
  return lines.join('\n').replace(/\n{3,}/g,'\n\n').trim();
}

// ═══════════════════════════════════════════════════════════════
// RENDERING
// ═══════════════════════════════════════════════════════════════
function renderListing(){
  listingInit();
  var body=document.getElementById('listingBody');
  var active=listingActive();

  var html='';

  // ── Amazon-Hinweis-Banner (ehrlich) ──
  html+='<div style="background:var(--ord);border-left:3px solid var(--or);border-radius:8px;padding:11px 16px;margin-bottom:16px;font-size:12px;color:var(--tx2);line-height:1.6">'+
    '<b style="color:var(--or)">⚠️ Wichtig zu Amazon &amp; HTML:</b> Amazon zeigt HTML in der Produktbeschreibung bei vielen (neueren) Seller-Accounts <b>nicht mehr</b> an – dort zählt nur Klartext. HTML funktioniert noch bei Accounts mit Bestandsschutz sowie auf eBay, Shopify, Kaufland &amp; eigener Website. '+
    '<b>Nutze den „Klartext"-Export</b> für aktuelle Amazon-Felder (Bullet Points &amp; Beschreibung), den HTML-Export für die übrigen Kanäle.</div>';

  // ── KI-Generator (zusammenklappbar, oben) ──
  html+=lgHtml();

  // ── Listing-Auswahl / Verwaltung ──
  html+='<div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;align-items:center">';
  if(D.listings.items.length){
    html+='<select onchange="listingSwitch(this.value)" style="padding:9px 12px;border-radius:8px;border:1px solid var(--bd);background:var(--s2);color:var(--tx);font-family:inherit;font-size:13px;min-width:180px">'+
      D.listings.items.map(function(l){return '<option value="'+l.id+'"'+(l.id===D.listings.activeId?' selected':'')+'>'+esc(l.name)+'</option>';}).join('')+'</select>';
    html+='<button onclick="listingRename()" style="background:var(--s2);border:1px solid var(--bd);border-radius:8px;padding:9px 12px;cursor:pointer;font-family:inherit;font-size:12px;color:var(--tx2)">✏️ Umbenennen</button>';
  }
  html+='<button onclick="listingNewDialog()" style="background:var(--gn);color:#fff;border:none;border-radius:8px;padding:9px 16px;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer">＋ Neues Listing</button>';
  if(D.listings.items.length)html+='<button onclick="listingDeleteConfirm()" style="background:var(--rdd);color:var(--rd);border:1px solid var(--rd);border-radius:8px;padding:9px 14px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:600">🗑️ Löschen</button>';
  html+='</div>';

  // ── Leerzustand: Vorlagen-Galerie ──
  if(!active){
    html+='<div style="font-size:13px;font-weight:700;color:var(--tx2);text-transform:uppercase;letter-spacing:1px;margin:8px 0 12px">Mit Vorlage starten</div>';
    html+='<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px">';
    LISTING_TEMPLATES.forEach(function(tpl){
      html+='<div onclick="listingCreateFromTemplate(\''+tpl.id+'\')" style="background:var(--s2);border:1px solid var(--bd);border-radius:11px;padding:16px;cursor:pointer;transition:all .16s" onmouseover="this.style.borderColor=\'var(--ac)\';this.style.background=\'var(--acd)\'" onmouseout="this.style.borderColor=\'var(--bd)\';this.style.background=\'var(--s2)\'">'+
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px"><span style="font-size:24px">'+tpl.icon+'</span><span style="font-size:14px;font-weight:700;color:var(--tx)">'+esc(tpl.name)+'</span></div>'+
        '<div style="font-size:11.5px;color:var(--tx2);line-height:1.5;margin-bottom:10px">'+esc(tpl.desc)+'</div>'+
        '<div style="background:var(--ac);color:#fff;text-align:center;padding:7px;border-radius:7px;font-size:12px;font-weight:700">Vorlage nutzen</div>'+
      '</div>';
    });
    html+='<div onclick="listingCreate(\'Neues Listing\',\'\');save();renderListing()" style="background:var(--s1);border:2px dashed var(--bd2);border-radius:11px;padding:16px;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;min-height:120px" onmouseover="this.style.borderColor=\'var(--ac)\'" onmouseout="this.style.borderColor=\'var(--bd2)\'"><span style="font-size:28px">➕</span><span style="font-size:13px;font-weight:700;color:var(--tx2)">Leer starten</span></div>';
    html+='</div>';
    body.innerHTML=html;
    lgCount();
    return;
  }

  // ── Editor-Toolbar ──
  html+='<div style="background:var(--s2);border:1px solid var(--bd);border-radius:10px 10px 0 0;padding:8px 10px;display:flex;gap:4px;flex-wrap:wrap;align-items:center;border-bottom:none">'+
    listingBtn('bold','<b>F</b>','Fett')+
    listingBtn('italic','<i>K</i>','Kursiv')+
    listingBtn('underline','<u>U</u>','Unterstrichen')+
    '<span style="width:1px;height:22px;background:var(--bd2);margin:0 4px"></span>'+
    listingBtnCmd('formatBlock','h3','H3','Überschrift')+
    listingBtnCmd('formatBlock','p','¶','Absatz')+
    '<span style="width:1px;height:22px;background:var(--bd2);margin:0 4px"></span>'+
    listingBtn('insertUnorderedList','• Liste','Aufzählung')+
    listingBtn('insertOrderedList','1. Liste','Nummerierung')+
    '<span style="width:1px;height:22px;background:var(--bd2);margin:0 4px"></span>'+
    listingBtnCustom('listingInsertLink()','🔗','Link einfügen')+
    listingBtn('removeFormat','✕ Format','Formatierung entfernen')+
    '<span style="margin-left:auto;display:flex;gap:4px">'+
    listingBtnCustom('listingPromptGen()','🤖 KI-Text','Claude-Prompt für Listing-Text generieren')+
    '</span>'+
  '</div>';

  // ── Editor + Vorschau (Split) ──
  html+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:0;margin-bottom:16px">';
  // Editor (links)
  html+='<div style="border:1px solid var(--bd);border-top:none;border-radius:0 0 0 10px;background:#fff">'+
    '<div contenteditable="true" id="listingEditor" oninput="listingOnInput()" style="min-height:340px;max-height:520px;overflow-y:auto;padding:16px 18px;color:#1a1a1a;font-family:Arial,sans-serif;font-size:14px;line-height:1.6;outline:none" spellcheck="true">'+active.html+'</div>'+
  '</div>';
  // Vorschau (rechts)
  html+='<div style="border:1px solid var(--bd);border-top:none;border-left:none;border-radius:0 0 10px 0;background:var(--s1);display:flex;flex-direction:column">'+
    '<div style="background:var(--s2);padding:6px 14px;font-size:11px;color:var(--tx3);font-weight:600;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid var(--bd)">👁️ Vorschau (so sieht es gerendert aus)</div>'+
    '<div id="listingPreview" style="flex:1;padding:16px 18px;overflow-y:auto;max-height:480px;color:var(--tx);font-size:14px;line-height:1.6">'+active.html+'</div>'+
  '</div>';
  html+='</div>';

  // ── Zeichenzähler ──
  html+='<div id="listingCounter" style="display:flex;gap:18px;font-size:12px;color:var(--tx3);margin-bottom:16px;flex-wrap:wrap"></div>';

  // ── Export-Bereich ──
  html+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">';
  // HTML
  html+='<div style="background:var(--s1);border:1px solid var(--bd);border-radius:12px;padding:16px">'+
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px"><div style="font-size:13px;font-weight:700;color:var(--tx)">&lt;/&gt; HTML-Code</div>'+
    '<button onclick="listingCopyHtml()" style="background:var(--ac);color:#fff;border:none;border-radius:7px;padding:6px 14px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:700">📋 Kopieren</button></div>'+
    '<textarea id="listingHtmlOut" readonly style="width:100%;height:130px;padding:10px;border-radius:8px;border:1px solid var(--bd);background:var(--s2);color:var(--tx2);font-family:monospace;font-size:11px;resize:vertical;line-height:1.5"></textarea>'+
    '<div style="font-size:10.5px;color:var(--tx3);margin-top:6px">Für eBay, Shopify, Kaufland, eigene Website &amp; Amazon-Bestandsschutz-Accounts.</div>'+
  '</div>';
  // Klartext
  html+='<div style="background:var(--s1);border:1px solid var(--bd);border-radius:12px;padding:16px">'+
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px"><div style="font-size:13px;font-weight:700;color:var(--tx)">📄 Klartext</div>'+
    '<button onclick="listingCopyPlain()" style="background:var(--gn);color:#fff;border:none;border-radius:7px;padding:6px 14px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:700">📋 Kopieren</button></div>'+
    '<textarea id="listingPlainOut" readonly style="width:100%;height:130px;padding:10px;border-radius:8px;border:1px solid var(--bd);background:var(--s2);color:var(--tx2);font-family:monospace;font-size:11px;resize:vertical;line-height:1.5"></textarea>'+
    '<div style="font-size:10.5px;color:var(--tx3);margin-top:6px">Für aktuelle Amazon-Felder (Bullet Points &amp; Beschreibung), wo HTML nicht angezeigt wird.</div>'+
  '</div>';
  html+='</div>';

  body.innerHTML=html;
  listingRefreshOutputs();
  lgCount();
}

// ─── Toolbar-Buttons ───
function listingBtn(cmd,label,title){
  return '<button onmousedown="event.preventDefault()" onclick="listingExec(\''+cmd+'\')" title="'+title+'" style="background:var(--s3);border:1px solid var(--bd);border-radius:6px;padding:6px 10px;cursor:pointer;font-family:inherit;font-size:12px;color:var(--tx);min-width:32px">'+label+'</button>';
}
function listingBtnCmd(cmd,val,label,title){
  return '<button onmousedown="event.preventDefault()" onclick="listingExec(\''+cmd+'\',\'&lt;'+val+'&gt;\')" title="'+title+'" style="background:var(--s3);border:1px solid var(--bd);border-radius:6px;padding:6px 10px;cursor:pointer;font-family:inherit;font-size:12px;color:var(--tx);min-width:32px">'+label+'</button>';
}
function listingBtnCustom(onclick,label,title){
  return '<button onmousedown="event.preventDefault()" onclick="'+onclick+'" title="'+title+'" style="background:var(--s3);border:1px solid var(--bd);border-radius:6px;padding:6px 10px;cursor:pointer;font-family:inherit;font-size:12px;color:var(--tx)">'+label+'</button>';
}

// ─── execCommand-Wrapper ───
function listingExec(cmd,val){
  var ed=document.getElementById('listingEditor');if(ed)ed.focus();
  if(cmd==='formatBlock'){document.execCommand('formatBlock',false,val);}
  else document.execCommand(cmd,false,null);
  listingOnInput();
}
function listingInsertLink(){
  var url=prompt('Link-URL (https://…):');if(!url)return;
  var ed=document.getElementById('listingEditor');if(ed)ed.focus();
  document.execCommand('createLink',false,url);
  listingOnInput();
}

// ─── Eingabe-Handler: speichern + Vorschau + Zähler aktualisieren ───
function listingOnInput(){
  var ed=document.getElementById('listingEditor');if(!ed)return;
  var active=listingActive();if(!active)return;
  active.html=ed.innerHTML;
  active.updatedAt=new Date().toISOString();
  save();
  // Vorschau live
  var pv=document.getElementById('listingPreview');if(pv)pv.innerHTML=ed.innerHTML;
  listingRefreshOutputs();
}

// ─── Export-Felder + Zähler aktualisieren ───
function listingRefreshOutputs(){
  var active=listingActive();if(!active)return;
  var clean=listingSanitize(active.html);
  var plain=listingToPlainText(active.html);
  var htmlOut=document.getElementById('listingHtmlOut');if(htmlOut)htmlOut.value=clean;
  var plainOut=document.getElementById('listingPlainOut');if(plainOut)plainOut.value=plain;
  // Zähler
  var counter=document.getElementById('listingCounter');
  if(counter){
    var plainLen=plain.length;
    var htmlLen=clean.length;
    var descColor=plainLen>LISTING_LIMITS.description?'var(--rd)':'var(--gn)';
    counter.innerHTML=
      '<span>📝 Klartext: <b style="color:'+descColor+'">'+plainLen.toLocaleString('de-DE')+'</b> / '+LISTING_LIMITS.description.toLocaleString('de-DE')+' Zeichen (Beschreibungs-Limit)</span>'+
      '<span>&lt;/&gt; HTML: <b style="color:var(--tx2)">'+htmlLen.toLocaleString('de-DE')+'</b> Zeichen</span>'+
      '<span style="color:var(--tx3)">💡 Bullet-Point-Limit: '+LISTING_LIMITS.bullet+' Zeichen je Stichpunkt</span>';
  }
}

// ─── Aktionen ───
function listingSwitch(id){D.listings.activeId=id;save();renderListing();}
function listingCreateFromTemplate(tplId){
  var tpl=LISTING_TEMPLATES.find(function(t){return t.id===tplId;});if(!tpl)return;
  listingCreate(tpl.name,tpl.html);save();renderListing();toast('✓ Listing aus Vorlage erstellt');
}
function listingNewDialog(){
  gmPrompt('Neues Listing',[{l:'Name des Listings',id:'liName'}],function(){
    var name=document.getElementById('liName').value.trim()||'Neues Listing';
    listingCreate(name,'');save();renderListing();toast('✓ Listing erstellt');
  });
}
function listingRename(){
  var active=listingActive();if(!active)return;
  gmPrompt('Listing umbenennen',[{l:'Name',id:'liRename'}],function(){
    var name=document.getElementById('liRename').value.trim();if(name){active.name=name;save();renderListing();}
  });
  setTimeout(function(){var el=document.getElementById('liRename');if(el)el.value=active.name;},80);
}
function listingDeleteConfirm(){
  var active=listingActive();if(!active)return;
  if(confirm('Listing „'+active.name+'" löschen?')){listingDelete(active.id);save();renderListing();toast('Gelöscht');}
}
function listingCopyHtml(){
  var out=document.getElementById('listingHtmlOut');if(!out)return;
  out.select();
  try{navigator.clipboard.writeText(out.value);}catch(e){document.execCommand('copy');}
  toast('✓ HTML kopiert');
}
function listingCopyPlain(){
  var out=document.getElementById('listingPlainOut');if(!out)return;
  out.select();
  try{navigator.clipboard.writeText(out.value);}catch(e){document.execCommand('copy');}
  toast('✓ Klartext kopiert');
}

// ─── KI-Prompt-Generator (Claude-Workflow, offline-konform) ───
function listingPromptGen(){
  gmPrompt('KI-Listing-Text generieren',[
    {l:'Produktname',id:'lpName'},
    {l:'Hauptmerkmale (Stichworte, kommagetrennt)',id:'lpFeatures',tag:'textarea'},
    {l:'Zielgruppe',id:'lpTarget'},
    {l:'Wichtigster Kundennutzen / USP',id:'lpUsp'}
  ],function(){
    var name=document.getElementById('lpName').value.trim();
    var features=document.getElementById('lpFeatures').value.trim();
    var target=document.getElementById('lpTarget').value.trim();
    var usp=document.getElementById('lpUsp').value.trim();
    var prompt='Du bist ein erfahrener Amazon-Listing-Texter für den deutschen Markt.\n\n'+
      'Erstelle eine überzeugende, conversion-optimierte Produktbeschreibung für folgendes Produkt:\n\n'+
      '- Produkt: '+(name||'[Produktname]')+'\n'+
      '- Hauptmerkmale: '+(features||'[Merkmale]')+'\n'+
      '- Zielgruppe: '+(target||'[Zielgruppe]')+'\n'+
      '- Wichtigster Nutzen (USP): '+(usp||'[USP]')+'\n\n'+
      'Liefere:\n'+
      '1. Eine Überschrift (H3) mit dem stärksten Verkaufsargument\n'+
      '2. Einen Einleitungsabsatz (2–3 Sätze), der das Kundenproblem anspricht\n'+
      '3. Genau 5 Bullet Points, jeder mit einem FETT geschriebenen Schlagwort am Anfang (Großbuchstaben), max. 500 Zeichen pro Punkt\n'+
      '4. Einen Abschlussabsatz mit Kaufanreiz\n\n'+
      'Formatiere die Ausgabe als sauberes HTML mit nur diesen Tags: <h3>, <p>, <b>, <ul>, <li>. '+
      'Keine style-Attribute, keine anderen Tags. Schreibe auf Deutsch, verkaufsstark aber seriös, ohne übertriebene Superlative.';
    // Prompt anzeigen + kopieren
    document.getElementById('gmTitle').textContent='🤖 Claude-Prompt — kopieren & in Claude einfügen';
    document.getElementById('gmBody').innerHTML=
      '<div style="font-size:12px;color:var(--tx2);margin-bottom:10px;line-height:1.6">Kopiere diesen Prompt, füge ihn in Claude (oder ein anderes KI-Tool) ein. Das Ergebnis kannst du dann hier in den Editor einfügen.</div>'+
      '<textarea id="lpPromptOut" readonly style="width:100%;height:240px;padding:12px;border-radius:8px;border:1px solid var(--bd);background:var(--s2);color:var(--tx);font-family:monospace;font-size:11.5px;resize:vertical;line-height:1.5">'+esc(prompt)+'</textarea>'+
      '<button onclick="var o=document.getElementById(\'lpPromptOut\');o.select();try{navigator.clipboard.writeText(o.value)}catch(e){document.execCommand(\'copy\')}toast(\'✓ Prompt kopiert\')" style="margin-top:10px;background:var(--ac);color:#fff;border:none;border-radius:8px;padding:10px 18px;cursor:pointer;font-family:inherit;font-size:13px;font-weight:700;width:100%">📋 Prompt kopieren</button>';
    var sb=document.getElementById('gmSave');if(sb)sb.style.display='none';
  });
}

// ═══════════════════════════════════════════════════════════════
// KI-LISTING-GENERATOR — kompletter Amazon-DE-Listing-Text per KI
// ───────────────────────────────────────────────────────────────
// Eingaben + Ergebnis leben in LG (überleben das Re-Rendern der Seite).
// Gespeicherte Listings: D.aiListings (Array, synct via save() → Cloud).
// Hinweis: D.listings ist bereits vom Editor belegt ({items,activeId}),
// daher eigenes Array D.aiListings für die KI-Ergebnisse.
// ═══════════════════════════════════════════════════════════════
var LG={open:false,name:'',infos:'',keywords:'',ton:'sachlich',res:null,busy:false};
var LG_LIMITS={titel:200,bullet:200,such:249}; // Suchbegriffe = BYTES (UTF-8), Rest = Zeichen

function lgSyToken(){try{return localStorage.getItem('sy_token')||'';}catch(e){return '';}}
function lgBytes(s){try{return new TextEncoder().encode(s||'').length;}catch(e){return (s||'').length;}}

// ─── UI des Generator-Abschnitts (wird von renderListing() eingebettet) ───
function lgHtml(){
  var IN='width:100%;padding:9px 12px;border-radius:8px;border:1px solid var(--bd);background:var(--s2);color:var(--tx);font-family:inherit;font-size:13px;box-sizing:border-box';
  var LB='display:block;font-size:11px;font-weight:700;color:var(--tx2);text-transform:uppercase;letter-spacing:.5px;margin:0 0 4px';
  var h='<details ontoggle="LG.open=this.open"'+(LG.open?' open':'')+' style="background:var(--s1);border:1px solid var(--bd);border-radius:12px;margin-bottom:16px">';
  h+='<summary style="padding:13px 16px;cursor:pointer;font-size:14px;font-weight:700;color:var(--tx)">🤖 KI-Generator <span style="font-size:11px;font-weight:600;color:var(--tx3);margin-left:6px">Titel · 5 Bullets · Beschreibung · Suchbegriffe (Amazon DE)</span></summary>';
  h+='<div style="padding:2px 16px 16px">';
  // Eingaben
  h+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">'+
    '<div><label style="'+LB+'">Produktname</label><input id="lgName" oninput="LG.name=this.value" value="'+escapeHtml(LG.name)+'" placeholder="z. B. Edelstahl-Trinkflasche 1 l" style="'+IN+'"></div>'+
    '<div><label style="'+LB+'">Ziel-Keywords (optional)</label><input id="lgKeywords" oninput="LG.keywords=this.value" value="'+escapeHtml(LG.keywords)+'" placeholder="kommagetrennt, z. B. trinkflasche edelstahl, auslaufsicher" style="'+IN+'"></div></div>';
  h+='<div style="margin-bottom:10px"><label style="'+LB+'">Produktinfos / USPs</label><textarea id="lgInfos" oninput="LG.infos=this.value" placeholder="Material, Maße, Besonderheiten, Zielgruppe — Stichpunkte reichen" style="'+IN+';height:88px;resize:vertical">'+esc(LG.infos)+'</textarea></div>';
  h+='<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:6px">'+
    '<select id="lgTon" onchange="LG.ton=this.value" style="'+IN+';width:auto"><option value="sachlich"'+(LG.ton==='sachlich'?' selected':'')+'>Tonalität: sachlich</option><option value="verkaufsstark"'+(LG.ton==='verkaufsstark'?' selected':'')+'>Tonalität: verkaufsstark</option></select>'+
    '<button id="lgImportBtn" onclick="lgImportAmazon()" style="background:var(--s2);border:1px solid var(--bd);border-radius:8px;padding:9px 14px;cursor:pointer;font-family:inherit;font-size:12.5px;font-weight:600;color:var(--tx)">⬇ Von Amazon importieren</button>'+
    '<button id="lgGenBtn" onclick="lgGenerate()" style="background:linear-gradient(135deg,var(--pu),var(--ac));color:#fff;border:none;border-radius:8px;padding:9px 18px;cursor:pointer;font-family:inherit;font-size:13px;font-weight:700">✨ Listing generieren</button></div>';
  // Ergebnis (editierbar, mit Zählern + Kopieren)
  if(LG.res){
    var cnt=function(id){return '<span id="'+id+'" style="font-size:11px;color:var(--tx3)"></span>';};
    var cpy=function(t){return '<button onclick="lgCopy(\''+t+'\')" title="In Zwischenablage kopieren" style="background:var(--s3);border:1px solid var(--bd);border-radius:6px;padding:3px 8px;cursor:pointer;font-size:11px">📋</button>';};
    var row=function(label,cid,tid){return '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px"><label style="'+LB+';margin:0">'+label+'</label><span style="display:flex;gap:8px;align-items:center">'+cnt(cid)+cpy(tid)+'</span></div>';};
    h+='<div style="border-top:1px dashed var(--bd2);padding-top:14px;margin-top:10px">';
    h+='<div style="font-size:12px;font-weight:700;color:var(--tx2);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">Ergebnis — prüfen &amp; anpassen</div>';
    h+='<div style="margin-bottom:10px">'+row('Titel','lgCntTitel','lgResTitel')+'<input id="lgResTitel" oninput="LG.res.titel=this.value;lgCount()" value="'+escapeHtml(LG.res.titel)+'" style="'+IN+'"></div>';
    for(var i=0;i<5;i++){
      h+='<div style="margin-bottom:8px">'+row('Bullet '+(i+1),'lgCntB'+i,'lgResB'+i)+'<input id="lgResB'+i+'" oninput="LG.res.bullets['+i+']=this.value;lgCount()" value="'+escapeHtml(LG.res.bullets[i]||'')+'" style="'+IN+'"></div>';
    }
    h+='<div style="margin-bottom:10px">'+row('Beschreibung','lgCntBeschr','lgResBeschr')+'<textarea id="lgResBeschr" oninput="LG.res.beschreibung=this.value;lgCount()" style="'+IN+';height:120px;resize:vertical">'+esc(LG.res.beschreibung)+'</textarea></div>';
    h+='<div style="margin-bottom:12px">'+row('Suchbegriffe (Backend)','lgCntSuch','lgResSuch')+'<textarea id="lgResSuch" oninput="LG.res.suchbegriffe=this.value;lgCount()" style="'+IN+';height:52px;resize:vertical">'+esc(LG.res.suchbegriffe)+'</textarea></div>';
    h+='<div style="display:flex;gap:10px;flex-wrap:wrap">'+
      '<button onclick="lgApply()" style="background:var(--ac);color:#fff;border:none;border-radius:8px;padding:9px 16px;cursor:pointer;font-family:inherit;font-size:13px;font-weight:700">📥 In Editor übernehmen</button>'+
      '<button onclick="lgSave()" style="background:var(--gn);color:#fff;border:none;border-radius:8px;padding:9px 16px;cursor:pointer;font-family:inherit;font-size:13px;font-weight:700">💾 Speichern</button></div>';
    h+='</div>';
  }
  // Gespeicherte KI-Listings
  var saved=D.aiListings||[];
  if(saved.length){
    h+='<div style="border-top:1px dashed var(--bd2);margin-top:14px;padding-top:10px"><div style="font-size:11px;font-weight:700;color:var(--tx3);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">💾 Gespeicherte KI-Listings ('+saved.length+')</div>';
    saved.forEach(function(l){
      h+='<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--bd);font-size:12.5px">'+
        '<a href="#" onclick="lgLoad(\''+l.id+'\');return false" title="In die Felder laden" style="color:var(--ac);font-weight:600;text-decoration:none;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(l.name)+'</a>'+
        '<span style="color:var(--tx3);font-size:11px">'+new Date(l.ts).toLocaleDateString('de-DE')+'</span>'+
        '<button onclick="lgDelete(\''+l.id+'\')" title="Löschen" style="background:none;border:none;cursor:pointer;font-size:13px;padding:2px 4px">🗑</button></div>';
    });
    h+='</div>';
  }
  h+='</div></details>';
  return h;
}

// ─── Live-Zähler (Zeichen; Suchbegriffe in BYTES via TextEncoder) ───
function lgCount(){
  if(!LG.res)return;
  function set(id,n,max,unit){
    var el=document.getElementById(id);if(!el)return;
    el.textContent=n.toLocaleString('de-DE')+' / '+max.toLocaleString('de-DE')+(unit?' '+unit:'');
    el.style.color=n>max?'var(--rd)':'var(--tx3)';
    el.style.fontWeight=n>max?'700':'400';
  }
  set('lgCntTitel',(LG.res.titel||'').length,LG_LIMITS.titel,'Zeichen');
  for(var i=0;i<5;i++)set('lgCntB'+i,(LG.res.bullets[i]||'').length,LG_LIMITS.bullet,'Zeichen');
  set('lgCntBeschr',(LG.res.beschreibung||'').length,LISTING_LIMITS.description,'Zeichen');
  set('lgCntSuch',lgBytes(LG.res.suchbegriffe),LG_LIMITS.such,'Bytes');
}

// ─── Amazon-Import in die Eingabefelder (Backend-Endpoint, Bearer) ───
async function lgImportAmazon(){
  if(!lgSyToken()){toast('☁️ Cloud-Konto nötig — bitte zuerst unter „Konto & Sync" anmelden');return;}
  var raw=prompt('Amazon-URL oder ASIN:');
  if(!raw||!raw.trim())return;
  var btn=document.getElementById('lgImportBtn');var old=btn?btn.textContent:'';
  if(btn){btn.disabled=true;btn.textContent='⏳ Importiert …';}
  try{
    var r=await fetch(radarApi()+'/api/import/amazon',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+lgSyToken()},body:JSON.stringify({urlOrAsin:raw.trim()})});
    var j=null;try{j=await r.json();}catch(e){}
    if(!r.ok)throw new Error((j&&j.error)||('Import fehlgeschlagen ('+r.status+')'));
    if(!j||!j.title)throw new Error('Kein Produkt gefunden — bitte Link/ASIN prüfen');
    LG.name=j.title;
    var infos=[];
    if(j.brand)infos.push('Marke: '+j.brand);
    if(j.bullets&&j.bullets.length)infos=infos.concat(j.bullets);
    if(j.description)infos.push(j.description);
    if(infos.length)LG.infos=infos.join('\n');
    LG.open=true;
    renderListing();
    toast('✓ Amazon-Daten übernommen'+(j.asin?' ('+j.asin+')':''));
  }catch(err){
    toast('⚠️ '+(err&&err.message||'Import fehlgeschlagen'));
  }finally{if(btn){btn.disabled=false;btn.textContent=old;}}
}

// ─── Prompt (EIN Aufruf, striktes JSON, Amazon-DE-Regeln aus dem Konzept) ───
function lgBuildPrompt(strict){
  var p='Du bist ein erfahrener Amazon-Listing-Texter für den deutschen Marktplatz (amazon.de). '+
    'Erstelle ein vollständiges, konversionsstarkes Listing auf Deutsch für folgendes Produkt.\n\n'+
    'Produkt: '+(LG.name.trim()||'—')+'\n'+
    'Produktinfos/USPs:\n'+(LG.infos.trim()||'—')+'\n'+
    (LG.keywords.trim()?'Ziel-Keywords (einarbeiten, wo sinnvoll): '+LG.keywords.trim()+'\n':'')+
    'Tonalität: '+(LG.ton==='verkaufsstark'?'verkaufsstark, aber seriös (ohne marktschreierische Übertreibungen)':'sachlich, präzise, vertrauensbildend')+'\n\n'+
    'Halte dich STRIKT an diese Amazon-DE-Regeln:\n'+
    '- "titel": max. 200 Zeichen, wichtigste Keywords und Hauptnutzen vorne, KEINE Werbephrasen (kein "Bestseller", "Top", "Nr. 1", "Angebot", "Aktion"), KEINE Emojis, Ziffern statt ausgeschriebener Zahlwörter.\n'+
    '- "bullets": GENAU 5 Bullet Points, je max. 200 Zeichen, jeder beginnt mit einem GROSS geschriebenen Schlagwort und Doppelpunkt, konkreter Kundennutzen statt Floskeln, keine Emojis.\n'+
    '- "beschreibung": 2 bis 4 Absätze Fließtext (Absätze durch Leerzeilen getrennt), KEIN HTML, keine Aufzählungszeichen, erfinde keine Fakten.\n'+
    '- "suchbegriffe": Backend-Suchbegriffe: alles kleingeschrieben, einzelne Wörter durch Leerzeichen getrennt, max. 249 Bytes, KEINE Wörter, die schon im Titel oder in den Bullets vorkommen, keine Dubletten, keine Wettbewerber-Markennamen.\n\n'+
    'Antworte AUSSCHLIESSLICH mit einem JSON-Objekt in exakt dieser Form (ohne Markdown, ohne Erklärung):\n'+
    '{"titel":"…","bullets":["…","…","…","…","…"],"beschreibung":"…","suchbegriffe":"…"}';
  if(strict)p+='\n\nWICHTIG: Gib NUR das JSON zurück — kein Text davor oder danach, keine Code-Zäune.';
  return p;
}

// ─── Antwort robust parsen: ```json-Zäune tolerieren, {…}-Block extrahieren ───
function lgParse(raw){
  raw=String(raw||'').replace(/```(?:json)?/gi,'').trim();
  var a=raw.indexOf('{'),b=raw.lastIndexOf('}');
  if(a<0||b<=a)return null;
  var j=null;try{j=JSON.parse(raw.slice(a,b+1));}catch(e){return null;}
  if(!j||typeof j.titel!=='string'||!j.titel.trim())return null;
  var bl=Array.isArray(j.bullets)?j.bullets.map(function(x){return String(x||'').trim();}).filter(Boolean):[];
  while(bl.length<5)bl.push('');
  return {titel:j.titel.trim(),bullets:bl.slice(0,5),beschreibung:String(j.beschreibung||'').trim(),suchbegriffe:String(j.suchbegriffe||'').trim().toLowerCase()};
}

async function lgGenerate(){
  if(LG.busy)return;
  if(!LG.name.trim()&&!LG.infos.trim()){toast('Bitte mindestens Produktname oder Produktinfos angeben');return;}
  if(typeof window.igGenText!=='function'){toast('⚠️ KI-Modul nicht geladen — bitte Seite neu laden');return;}
  LG.busy=true;
  var btn=document.getElementById('lgGenBtn');
  if(btn){btn.disabled=true;btn.textContent='⏳ KI schreibt …';}
  try{
    var res=lgParse(await window.igGenText(lgBuildPrompt(false)));
    if(!res)res=lgParse(await window.igGenText(lgBuildPrompt(true))); // 1 Retry mit „NUR das JSON"
    if(!res)throw new Error('Die KI hat kein gültiges JSON geliefert — bitte erneut versuchen.');
    LG.res=res;LG.open=true;
    renderListing();
    toast('✓ Listing generiert — bitte prüfen & anpassen');
  }catch(err){
    toast('⚠️ '+(err&&err.message||'Generierung fehlgeschlagen'));
    if(btn){btn.disabled=false;btn.textContent='✨ Listing generieren';}
  }finally{LG.busy=false;}
}

// ─── Aktionen: Kopieren / In Editor übernehmen / Speichern / Laden / Löschen ───
function lgCopy(id){
  var el=document.getElementById(id);if(!el)return;
  try{navigator.clipboard.writeText(el.value);}catch(e){el.select();document.execCommand('copy');}
  toast('✓ Kopiert');
}
function lgApply(){
  if(!LG.res){toast('Bitte zuerst generieren');return;}
  listingInit();
  var html='';
  if(LG.res.titel)html+='<h3>'+esc(LG.res.titel)+'</h3>';
  var bl=(LG.res.bullets||[]).filter(function(b){return b&&b.trim();});
  if(bl.length)html+='<ul>'+bl.map(function(b){return '<li>'+esc(b.trim())+'</li>';}).join('')+'</ul>';
  (LG.res.beschreibung||'').split(/\n\s*\n/).forEach(function(p){p=p.trim();if(p)html+='<p>'+esc(p).replace(/\n/g,'<br>')+'</p>';});
  var active=listingActive();
  if(active){
    if(active.html && active.html.replace(/<[^>]*>/g,'').trim() && !confirm('Aktuelles Listing „'+active.name+'" mit dem KI-Ergebnis überschreiben?'))return;
    active.html=html;active.updatedAt=new Date().toISOString();
  }else{
    listingCreate((LG.name.trim()||LG.res.titel||'KI-Listing').slice(0,60),html);
  }
  save();renderListing();toast('✓ In den Editor übernommen (Suchbegriffe separat kopieren)');
}
function lgSave(){
  if(!LG.res){toast('Bitte zuerst generieren');return;}
  D.aiListings=D.aiListings||[]; // defensiv (alte Datenstände)
  D.aiListings.unshift({
    id:'ai_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),
    ts:new Date().toISOString(),
    name:(LG.name.trim()||LG.res.titel||'KI-Listing').slice(0,80),
    titel:LG.res.titel,bullets:LG.res.bullets.slice(0,5),beschreibung:LG.res.beschreibung,suchbegriffe:LG.res.suchbegriffe
  });
  save();renderListing();toast('✓ KI-Listing gespeichert');
}
function lgLoad(id){
  var l=(D.aiListings||[]).find(function(x){return x.id===id;});if(!l)return;
  LG.name=l.name||'';
  LG.res={titel:l.titel||'',bullets:(l.bullets||[]).concat(['','','','','']).slice(0,5),beschreibung:l.beschreibung||'',suchbegriffe:l.suchbegriffe||''};
  LG.open=true;renderListing();toast('✓ „'+l.name+'" in die Felder geladen');
}
function lgDelete(id){
  var l=(D.aiListings||[]).find(function(x){return x.id===id;});if(!l)return;
  if(!confirm('Gespeichertes KI-Listing „'+l.name+'" löschen?'))return;
  D.aiListings=D.aiListings.filter(function(x){return x.id!==id;});
  save();renderListing();toast('Gelöscht');
}


// ═══════════════════════════════════════════════════════════════
// KEYWORD-REINIGER — Backend Search Terms bereinigen
// ───────────────────────────────────────────────────────────────
// Bereinigt rohe Keywords nach einstellbaren Regeln.
// Byte-Zählung beachtet UTF-8 (Umlaute = 2 Bytes) → 250-Byte-Limit.
// Daten: D.kwclean = { raw, listing, rules, lastResult }
// ═══════════════════════════════════════════════════════════════

var KW_BYTE_LIMIT=250;

// Deutsche Füllwörter / Stoppwörter (Amazon ignoriert diese ohnehin)
var KW_STOPWORDS=['der','die','das','den','dem','des','ein','eine','einer','eines','einem','einen',
  'und','oder','aber','denn','sondern','sowie','als','wie','wenn','weil','dass','ob',
  'für','mit','von','vom','zur','zum','zu','aus','bei','nach','über','unter','vor','hinter','neben','zwischen',
  'in','im','an','am','auf','ab','um','durch','gegen','ohne','bis','seit','während','wegen','trotz',
  'ich','du','er','sie','es','wir','ihr','mein','dein','sein','ihre','ihr','unser','euer',
  'ist','sind','war','waren','wird','werden','hat','haben','hatte','kann','können','soll','sollte',
  'nicht','kein','keine','keiner','sehr','auch','noch','nur','schon','mehr','immer','dann','hier','dort',
  'man','etwas','alle','alles','jede','jeder','jedes','viele','wenig','ganz','mal'];

// Standard-Regeln
var KW_RULES_DEFAULT={
  lowercase:true,        // alles klein
  removeCommas:true,     // Kommas/Sonderzeichen raus
  removeDuplicates:true, // doppelte Wörter raus
  removeStopwords:true,  // Füllwörter raus
  removeListing:true,    // Wörter, die schon im Listing stehen
  removePlural:false,    // Singular/Plural-Dubletten (heuristisch, default AUS)
  brandWarning:true      // Markenwörter nur warnen, nicht löschen
};

function kwcleanInit(){
  D.kwclean=D.kwclean||{};
  D.kwclean.raw=D.kwclean.raw||'';
  D.kwclean.listing=D.kwclean.listing||'';
  D.kwclean.brands=D.kwclean.brands||'';
  D.kwclean.rules=D.kwclean.rules||Object.assign({},KW_RULES_DEFAULT);
  // fehlende Regel-Keys ergänzen (für Updates)
  Object.keys(KW_RULES_DEFAULT).forEach(function(k){if(!(k in D.kwclean.rules))D.kwclean.rules[k]=KW_RULES_DEFAULT[k];});
}

// ─── UTF-8 Byte-Länge (Umlaute zählen doppelt) ───
function kwByteLength(str){
  // encodeURIComponent gibt %XX pro Byte → zählen
  return encodeURIComponent(str).replace(/%[0-9A-F]{2}/gi,'x').length;
}

// ─── Tokenisieren: in einzelne Wörter zerlegen ───
function kwTokenize(text){
  if(!text)return [];
  // an Komma, Semikolon, Zeilenumbruch, Leerzeichen trennen
  return text.split(/[\s,;\n\r]+/).map(function(w){return w.trim();}).filter(function(w){return w.length>0;});
}

// ─── Sonderzeichen aus Wort entfernen ───
function kwStripSpecial(word){
  // Behalte Buchstaben (inkl. Umlaute), Zahlen, Bindestrich
  return word.replace(/[^a-zA-Z0-9äöüÄÖÜß\-]/g,'');
}

// ─── Singular/Plural-Heuristik: Grundform für Vergleich ───
function kwStemDe(word){
  var w=word.toLowerCase();
  // Häufige deutsche Plural-/Beugungsendungen abschneiden (einfache Heuristik)
  var endings=['en','er','nen','se','es','s','e','n'];
  for(var i=0;i<endings.length;i++){
    var e=endings[i];
    if(w.length>e.length+2 && w.slice(-e.length)===e){
      return w.slice(0,-e.length);
    }
  }
  return w;
}

// ═══════════════════════════════════════════════════════════════
// HAUPT-REINIGUNG
// ═══════════════════════════════════════════════════════════════
function kwClean(raw,listing,brands,rules){
  var removed={duplicates:[],stopwords:[],listing:[],plural:[],special:[],brands:[]};
  var tokens=kwTokenize(raw);
  var original=tokens.slice();

  // Listing-Wörter (für Abgleich)
  var listingWords={};
  if(rules.removeListing&&listing){
    kwTokenize(listing).forEach(function(w){
      var clean=kwStripSpecial(w).toLowerCase();
      if(clean)listingWords[clean]=true;
    });
  }
  // Markenwörter
  var brandWords={};
  if(brands){kwTokenize(brands).forEach(function(w){var c=kwStripSpecial(w).toLowerCase();if(c)brandWords[c]=true;});}

  var seen={};        // für Duplikat-Erkennung
  var seenStems={};   // für Plural-Erkennung
  var result=[];

  tokens.forEach(function(tok){
    var word=tok;
    // 1. Sonderzeichen entfernen
    if(rules.removeCommas){
      var stripped=kwStripSpecial(word);
      if(stripped!==word && stripped.length===0){removed.special.push(tok);return;}
      word=stripped;
    }
    if(!word)return;
    // 2. Kleinschreibung
    var compare=word.toLowerCase();
    // 3. Markenwort?
    if(brandWords[compare]){
      removed.brands.push(word);
      if(!rules.brandWarning)return; // nur entfernen wenn nicht "nur warnen" — aber wir warnen immer, nie löschen
      // brandWarning=true → behalten, nur Warnung sammeln
    }
    // 4. Stoppwort?
    if(rules.removeStopwords && KW_STOPWORDS.indexOf(compare)>=0){removed.stopwords.push(word);return;}
    // 5. Schon im Listing?
    if(rules.removeListing && listingWords[compare]){removed.listing.push(word);return;}
    // 6. Duplikat?
    if(rules.removeDuplicates){
      if(seen[compare]){removed.duplicates.push(word);return;}
      seen[compare]=true;
    }
    // 7. Plural/Singular-Dublette?
    if(rules.removePlural){
      var stem=kwStemDe(compare);
      if(seenStems[stem]){removed.plural.push(word);return;}
      seenStems[stem]=true;
    }
    // behalten
    result.push(rules.lowercase?compare:word);
  });

  var output=result.join(' ');
  return {
    output:output,
    words:result,
    removed:removed,
    statsBefore:{words:original.length,bytes:kwByteLength(raw)},
    statsAfter:{words:result.length,bytes:kwByteLength(output)}
  };
}

// ═══════════════════════════════════════════════════════════════
// RENDERING
// ═══════════════════════════════════════════════════════════════
function renderKeywordClean(){
  kwcleanInit();
  var d=D.kwclean;
  var r=d.rules;
  var body=document.getElementById('keywordcleanBody');

  var html='';

  // ── Eingabe-Bereich ──
  html+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px">';
  // Roh-Keywords
  html+='<div style="background:var(--s1);border:1px solid var(--bd);border-radius:12px;padding:16px">'+
    '<label style="font-size:12px;font-weight:700;color:var(--tx);display:block;margin-bottom:8px">🔤 Roh-Keywords <span style="font-weight:400;color:var(--tx3)">(komma-, zeilen- oder leerzeichengetrennt)</span></label>'+
    '<textarea id="kwRaw" oninput="kwOnInput()" placeholder="z.B.\nyogamatte rutschfest\nyoga matte\ngymnastikmatte für zuhause\nfitnessmatte, sportmatte..." style="width:100%;height:150px;padding:10px;border-radius:8px;border:1px solid var(--bd);background:var(--s2);color:var(--tx);font-family:inherit;font-size:13px;resize:vertical;line-height:1.5">'+esc(d.raw)+'</textarea>'+
  '</div>';
  // Listing-Abgleich
  html+='<div style="background:var(--s1);border:1px solid var(--bd);border-radius:12px;padding:16px">'+
    '<label style="font-size:12px;font-weight:700;color:var(--tx);display:block;margin-bottom:8px">📄 Listing-Text <span style="font-weight:400;color:var(--tx3)">(optional — Titel + Bullets)</span></label>'+
    '<textarea id="kwListing" oninput="kwOnInput()" placeholder="Titel und Bullet Points hier einfügen.&#10;&#10;Wörter, die hier stehen, werden aus den Keywords entfernt — sie sind im Backend Platzverschwendung." style="width:100%;height:150px;padding:10px;border-radius:8px;border:1px solid var(--bd);background:var(--s2);color:var(--tx);font-family:inherit;font-size:13px;resize:vertical;line-height:1.5">'+esc(d.listing)+'</textarea>'+
  '</div>';
  html+='</div>';

  // ── Marken-Feld + Regeln ──
  html+='<div style="background:var(--s1);border:1px solid var(--bd);border-radius:12px;padding:16px;margin-bottom:16px">'+
    '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap">'+
      '<label style="font-size:12px;font-weight:700;color:var(--tx)">⚖️ Reinigungs-Regeln</label>'+
      '<input type="text" id="kwBrands" oninput="kwOnInput()" placeholder="Markenwörter (kommagetrennt) — werden markiert, nicht gelöscht" value="'+esc(d.brands)+'" style="flex:1;min-width:200px;margin-left:auto;padding:7px 10px;border-radius:7px;border:1px solid var(--bd);background:var(--s2);color:var(--tx);font-family:inherit;font-size:12px">'+
    '</div>'+
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px">';
  var ruleDefs=[
    ['removeDuplicates','Duplikate entfernen','Doppelte Wörter raus'],
    ['removeStopwords','Füllwörter entfernen','der, die, für, mit … (DE-Stoppwörter)'],
    ['removeListing','Listing-Abgleich','Wörter entfernen, die schon im Listing stehen'],
    ['removeCommas','Sonderzeichen/Kommas','Amazon trennt per Leerzeichen'],
    ['lowercase','Kleinschreibung','alles klein (Amazon ignoriert Groß/Klein)'],
    ['removePlural','Singular/Plural-Dubletten','⚠️ heuristisch — kann zu viel entfernen'],
    ['brandWarning','Markenwörter warnen','markiert Markenwörter (löscht sie nicht)']
  ];
  ruleDefs.forEach(function(rd){
    var active=r[rd[0]];
    html+='<label style="display:flex;align-items:flex-start;gap:8px;padding:9px 11px;background:var(--s2);border:1px solid '+(active?'var(--ac)':'var(--bd)')+';border-radius:8px;cursor:pointer">'+
      '<input type="checkbox" '+(active?'checked':'')+' onchange="kwToggleRule(\''+rd[0]+'\',this.checked)" style="margin-top:2px;width:15px;height:15px;accent-color:var(--ac);cursor:pointer">'+
      '<span><span style="font-size:12.5px;font-weight:600;color:var(--tx);display:block">'+rd[1]+'</span><span style="font-size:10.5px;color:var(--tx3)">'+rd[2]+'</span></span>'+
    '</label>';
  });
  html+='</div></div>';

  // ── Ergebnis-Bereich (wird von kwOnInput gefüllt) ──
  html+='<div id="kwResult"></div>';

  body.innerHTML=html;
  kwOnInput();
}

// ─── Eingabe-Handler ───
function kwOnInput(){
  var d=D.kwclean;
  d.raw=document.getElementById('kwRaw').value;
  d.listing=document.getElementById('kwListing').value;
  d.brands=document.getElementById('kwBrands').value;
  save();
  kwRenderResult();
}
function kwToggleRule(rule,val){
  D.kwclean.rules[rule]=val;save();renderKeywordClean();
}

// ─── Ergebnis rendern ───
function kwRenderResult(){
  var d=D.kwclean;
  var res=kwClean(d.raw,d.listing,d.brands,d.rules);
  var el=document.getElementById('kwResult');if(!el)return;

  if(!d.raw.trim()){
    el.innerHTML='<div style="text-align:center;padding:30px;color:var(--tx3);font-size:13px">Füge oben Roh-Keywords ein, um die Bereinigung zu starten.</div>';
    return;
  }

  var bytes=res.statsAfter.bytes;
  var bytePct=Math.min(100,Math.round(bytes/KW_BYTE_LIMIT*100));
  var byteColor=bytes>KW_BYTE_LIMIT?'rd':bytes>KW_BYTE_LIMIT*0.9?'or':'gn';
  var saved=res.statsBefore.bytes-res.statsAfter.bytes;
  var totalRemoved=res.removed.duplicates.length+res.removed.stopwords.length+res.removed.listing.length+res.removed.plural.length+res.removed.special.length;

  var html='';

  // ── Byte-Zähler (Hauptanzeige) ──
  html+='<div style="background:var(--s1);border:1.5px solid var(--'+byteColor+');border-radius:12px;padding:18px 20px;margin-bottom:14px">'+
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px">'+
      '<div style="font-size:13px;font-weight:700;color:var(--tx)">📏 Byte-Zähler (Amazon-Limit: '+KW_BYTE_LIMIT+' Bytes)</div>'+
      '<div style="font-size:22px;font-weight:800;color:var(--'+byteColor+')">'+bytes+' / '+KW_BYTE_LIMIT+' Bytes</div>'+
    '</div>'+
    '<div style="height:10px;background:var(--s3);border-radius:5px;overflow:hidden;margin-bottom:8px"><div style="height:100%;background:var(--'+byteColor+');width:'+bytePct+'%;transition:width .3s"></div></div>'+
    (bytes>KW_BYTE_LIMIT?
      '<div style="font-size:12px;color:var(--rd);font-weight:600">⚠️ '+(bytes-KW_BYTE_LIMIT)+' Bytes über dem Limit! Entferne weitere Keywords oder aktiviere mehr Regeln.</div>'
      :'<div style="font-size:12px;color:var(--'+byteColor+')">✓ Im Limit — noch '+(KW_BYTE_LIMIT-bytes)+' Bytes frei.</div>')+
    '<div style="font-size:10.5px;color:var(--tx3);margin-top:6px">💡 Umlaute (ä,ö,ü,ß) zählen als 2 Bytes. Das Limit ist hart — alles darüber wird von Amazon ignoriert.</div>'+
  '</div>';

  // ── Vorher/Nachher-Statistik ──
  html+='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:14px">'+
    kwStat('Vorher',res.statsBefore.words+' Wörter','tx2',res.statsBefore.bytes+' Bytes')+
    kwStat('Nachher',res.statsAfter.words+' Wörter','gn',res.statsAfter.bytes+' Bytes')+
    kwStat('Entfernt',totalRemoved+' Wörter','or','')+
    kwStat('Gespart',saved+' Bytes',saved>0?'cy':'tx3','')+
  '</div>';

  // ── Bereinigtes Ergebnis ──
  html+='<div style="background:var(--s1);border:1px solid var(--bd);border-radius:12px;padding:16px;margin-bottom:14px">'+
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px"><div style="font-size:13px;font-weight:700;color:var(--tx)">✨ Bereinigte Keywords</div>'+
    '<button onclick="kwCopy()" style="background:var(--gn);color:#fff;border:none;border-radius:7px;padding:7px 16px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:700">📋 Kopieren</button></div>'+
    '<textarea id="kwOutput" readonly style="width:100%;height:80px;padding:10px;border-radius:8px;border:1px solid var(--bd);background:var(--s2);color:var(--tx);font-family:monospace;font-size:12px;resize:vertical;line-height:1.5">'+esc(res.output)+'</textarea>'+
  '</div>';

  // ── Transparenz: was wurde entfernt ──
  if(totalRemoved>0||res.removed.brands.length>0){
    html+='<div style="background:var(--s1);border:1px solid var(--bd);border-radius:12px;padding:16px">'+
      '<div style="font-size:13px;font-weight:700;color:var(--tx);margin-bottom:12px">🔍 Was wurde entfernt? <span style="font-weight:400;color:var(--tx3);font-size:11px">(Transparenz — prüfe, ob versehentlich Wichtiges dabei ist)</span></div>';
    var cats=[
      ['duplicates','Duplikate','bl'],
      ['stopwords','Füllwörter','or'],
      ['listing','Bereits im Listing','pu'],
      ['plural','Singular/Plural-Dubletten','cy'],
      ['special','Leere/Sonderzeichen','tx3']
    ];
    cats.forEach(function(c){
      var arr=res.removed[c[0]];
      if(arr.length){
        html+='<div style="margin-bottom:8px"><span style="font-size:11px;font-weight:700;color:var(--'+c[2]+')">'+c[1]+' ('+arr.length+'):</span> '+
          '<span style="font-size:11.5px;color:var(--tx3)">'+arr.map(function(w){return esc(w);}).join(', ')+'</span></div>';
      }
    });
    // Markenwarnung
    if(res.removed.brands.length){
      html+='<div style="background:var(--rdd);border-radius:8px;padding:10px 12px;margin-top:8px"><span style="font-size:11.5px;color:var(--rd);font-weight:600">⚠️ Markenwörter gefunden (NICHT entfernt — prüfe selbst!): </span><span style="font-size:11.5px;color:var(--tx2)">'+res.removed.brands.map(function(w){return esc(w);}).join(', ')+'</span><div style="font-size:10.5px;color:var(--tx3);margin-top:4px">Fremde Markennamen im Backend können zu Listing-Sperrung führen. Eigene Marke ist meist erlaubt, aber im Backend Platzverschwendung.</div></div>';
    }
    html+='</div>';
  }

  el.innerHTML=html;
}

function kwStat(label,val,color,sub){
  return '<div style="background:var(--s2);border-radius:10px;padding:12px 14px"><div style="font-size:10px;color:var(--tx3);text-transform:uppercase;letter-spacing:1px">'+label+'</div><div style="font-size:17px;font-weight:800;color:var(--'+color+');margin-top:2px">'+val+'</div>'+(sub?'<div style="font-size:10px;color:var(--tx3)">'+sub+'</div>':'')+'</div>';
}

function kwCopy(){
  var out=document.getElementById('kwOutput');if(!out)return;
  out.select();
  try{navigator.clipboard.writeText(out.value);}catch(e){document.execCommand('copy');}
  toast('✓ Keywords kopiert');
}


// ═══════════════════════════════════════════════════════════════
// ETAPPE 2: REMINDER-ENGINE + NOTIFICATION-CENTER
// ───────────────────────────────────────────────────────────────
// Baut auf der vorbereiteten Datenstruktur auf (D.pm.notifications,
// notificationService, reminders-Felder). Erzeugt Benachrichtigungen
// aus fälligen Tasks, zeigt sie im Glocken-Panel, optional Browser-Push.
//
// Architektur-konform: nutzt notificationService (kein Direktzugriff).
// Backend-ready: die Reminder-Logik (welche Task → welche Notification)
// könnte später 1:1 in einen Server-Cron-Job wandern.
// ═══════════════════════════════════════════════════════════════

// Reminder-Offsets (Vorbereitung individuelle Erinnerungszeiten)
var NOTIF_REMINDER_OFFSETS={
  'due':0, '5min':5, '15min':15, '1h':60, '1d':1440, '2d':2880
};

// ─── Browser-Notification Permission-Flow ───
function notifRequestPermission(){
  if(!('Notification' in window)){toast('Dein Browser unterstützt keine Benachrichtigungen');return;}
  if(Notification.permission==='granted'){toast('✓ Browser-Benachrichtigungen sind bereits aktiv');notifRenderPanel();return;}
  if(Notification.permission==='denied'){toast('Benachrichtigungen sind im Browser blockiert — bitte in den Browser-Einstellungen erlauben');return;}
  Notification.requestPermission().then(function(perm){
    if(perm==='granted'){toast('✓ Browser-Benachrichtigungen aktiviert');}
    else{toast('Benachrichtigungen nicht aktiviert');}
    notifRenderPanel();
  });
}
function notifBrowserPush(title,body){
  if(!('Notification' in window)||Notification.permission!=='granted')return;
  try{
    var n=new Notification(title,{body:body,icon:'',tag:'wika-'+Date.now()});
    setTimeout(function(){try{n.close();}catch(e){}},8000);
  }catch(e){/* manche Browser brauchen ServiceWorker — still ignorieren */}
}

// ═══════════════════════════════════════════════════════════════
// REMINDER-ENGINE — erzeugt Notifications aus fälligen Tasks
// Läuft beim App-Start + periodisch. Idempotent: erzeugt pro Task
// und Fälligkeits-Typ nur EINE Notification pro Tag (kein Spam).
// ═══════════════════════════════════════════════════════════════
function notifRunReminderEngine(silent){
  if(!D.pm)return;
  pmInit();
  var today=new Date().toISOString().split('T')[0];
  var existing=D.pm.notifications||[];
  var newPush=[];

  // Hilfsfunktion: gibt es schon eine Notification für (task,type) heute?
  function alreadyNotified(taskId,type){
    return existing.some(function(n){
      return n.task_id===taskId && n.type===type && !n.deleted_at &&
             (n.created_at||'').split('T')[0]===today;
    });
  }

  taskService.getAll().forEach(function(t){
    // Erledigte Tasks ignorieren
    var prog=calculateBoardProgress(t.boardId);
    if(prog.doneListId && t.listId===prog.doneListId)return;
    if(!t.dueDate)return;

    var type=null,msg=null;
    if(pmIsOverdue(t)){type='overdue';msg='Überfällig: „'+t.title+'"';}
    else if(pmIsDueToday(t)){type='due_today';msg='Heute fällig: „'+t.title+'"';}
    else if(pmIsDueSoon(t)){type='due_soon';msg='Bald fällig: „'+t.title+'"';}

    if(type && !alreadyNotified(t.id,type)){
      var n=notificationService.create(type,t.id,msg);
      newPush.push({title:notifTypeLabel(type),body:t.title});
    }
  });

  // Browser-Push für neue (gebündelt, um Spam zu vermeiden)
  if(newPush.length && Notification!==undefined && window.Notification && Notification.permission==='granted'){
    if(newPush.length===1)notifBrowserPush(newPush[0].title,newPush[0].body);
    else notifBrowserPush('AMZ SellerHub: '+newPush.length+' neue Erinnerungen',newPush.map(function(p){return p.body;}).slice(0,3).join('\n'));
  }

  notifUpdateBell();
  if(!silent && newPush.length)toast('🔔 '+newPush.length+' neue Erinnerung'+(newPush.length===1?'':'en'));
}

function notifTypeLabel(type){
  return {overdue:'🔴 Überfällig',due_today:'📅 Heute fällig',due_soon:'⏳ Bald fällig',comment:'💬 Neuer Kommentar',assigned:'👤 Zugewiesen',changed:'✏️ Geändert'}[type]||'🔔 Hinweis';
}
function notifTypeColor(type){
  return {overdue:'rd',due_today:'or',due_soon:'ac',comment:'bl',assigned:'pu',changed:'cy'}[type]||'tx2';
}

// ─── Glocken-Badge aktualisieren ───
function notifUpdateBell(){
  if(!D.pm)return;
  var badge=document.getElementById('notifBellBadge');
  if(!badge)return;
  var count=notificationService.unreadCount();
  if(count>0){badge.textContent=count>99?'99+':count;badge.style.display='flex';}
  else badge.style.display='none';
}

// ─── Notification-Panel öffnen/schließen ───
function notifToggle(){
  var panel=document.getElementById('notifPanel');
  if(!panel)return;
  if(panel.style.display==='flex'){panel.style.display='none';return;}
  notifRunReminderEngine(true); // beim Öffnen frisch prüfen
  notifRenderPanel();
  panel.style.display='flex';
}
function notifClose(){var p=document.getElementById('notifPanel');if(p)p.style.display='none';}

function notifRenderPanel(){
  var panel=document.getElementById('notifPanel');if(!panel)return;
  pmInit();
  var notifs=notificationService.getNotifications();
  var unread=notifs.filter(function(n){return !n.read;});
  var permState=('Notification' in window)?Notification.permission:'unsupported';

  var html='';
  // Header
  html+='<div style="padding:14px 16px;border-bottom:1px solid var(--bd);display:flex;align-items:center;justify-content:space-between">'+
    '<div style="font-size:14px;font-weight:800;color:var(--tx)">🔔 Benachrichtigungen'+(unread.length?' <span style="background:var(--rd);color:#fff;border-radius:10px;padding:1px 7px;font-size:11px;margin-left:4px">'+unread.length+'</span>':'')+'</div>'+
    '<button onclick="notifClose()" style="background:var(--s3);border:none;border-radius:6px;width:26px;height:26px;cursor:pointer;color:var(--tx2);font-size:14px">✕</button>'+
  '</div>';

  // Browser-Permission-Banner
  if(permState==='default'){
    html+='<div style="padding:10px 16px;background:var(--acd);border-bottom:1px solid var(--bd);font-size:11.5px;color:var(--tx2);line-height:1.5">'+
      '🌐 <b>Browser-Benachrichtigungen</b> aktivieren, um auch außerhalb von AMZ SellerHub erinnert zu werden?'+
      '<button onclick="notifRequestPermission()" style="display:block;margin-top:8px;background:var(--ac);color:#fff;border:none;border-radius:6px;padding:6px 12px;cursor:pointer;font-family:inherit;font-size:11px;font-weight:700">Aktivieren</button></div>';
  }else if(permState==='granted'){
    html+='<div style="padding:7px 16px;background:var(--gnd);border-bottom:1px solid var(--bd);font-size:11px;color:var(--gn)">✓ Browser-Benachrichtigungen aktiv</div>';
  }

  // Aktionen
  if(notifs.length){
    html+='<div style="padding:8px 16px;border-bottom:1px solid var(--bd);display:flex;gap:8px">'+
      '<button onclick="notifMarkAllRead()" style="flex:1;background:var(--s2);border:1px solid var(--bd);border-radius:7px;padding:6px;cursor:pointer;font-family:inherit;font-size:11px;color:var(--tx2)">Alle gelesen</button>'+
      '<button onclick="notifClearAll()" style="flex:1;background:var(--s2);border:1px solid var(--bd);border-radius:7px;padding:6px;cursor:pointer;font-family:inherit;font-size:11px;color:var(--tx2)">Alle löschen</button>'+
    '</div>';
  }

  // Liste
  html+='<div style="overflow-y:auto;flex:1">';
  if(notifs.length===0){
    html+='<div style="padding:40px 20px;text-align:center;color:var(--tx3)"><div style="font-size:34px;margin-bottom:8px">🎉</div><div style="font-size:13px">Keine Benachrichtigungen</div><div style="font-size:11px;margin-top:4px">Fällige Aufgaben tauchen hier automatisch auf.</div></div>';
  }else{
    notifs.slice(0,50).forEach(function(n){
      var col=notifTypeColor(n.type);
      var when=notifTimeAgo(n.created_at);
      html+='<div onclick="notifClickItem(\''+n.id+'\',\''+(n.task_id||'')+'\')" style="padding:11px 16px;border-bottom:1px solid var(--bd);cursor:pointer;display:flex;gap:10px;align-items:flex-start;'+(n.read?'opacity:.55':'background:var(--'+col+'d)')+'" onmouseover="this.style.background=\'var(--s2)\'" onmouseout="this.style.background=\''+(n.read?'transparent':'var(--'+col+'d)')+'\'">'+
        (n.read?'':'<span style="width:8px;height:8px;border-radius:50%;background:var(--'+col+');flex-shrink:0;margin-top:5px"></span>')+
        '<div style="flex:1;min-width:0'+(n.read?';margin-left:18px':'')+'">'+
          '<div style="font-size:11px;font-weight:700;color:var(--'+col+');margin-bottom:2px">'+notifTypeLabel(n.type)+'</div>'+
          '<div style="font-size:12.5px;color:var(--tx);line-height:1.4">'+esc(n.message)+'</div>'+
          '<div style="font-size:10px;color:var(--tx3);margin-top:3px">'+when+'</div>'+
        '</div>'+
        '<button onclick="event.stopPropagation();notifDismiss(\''+n.id+'\')" style="background:none;border:none;color:var(--tx3);cursor:pointer;font-size:14px;flex-shrink:0">✕</button>'+
      '</div>';
    });
  }
  html+='</div>';

  panel.innerHTML=html;
}

// ─── Relative Zeit ───
function notifTimeAgo(iso){
  var diff=(Date.now()-new Date(iso))/1000;
  if(diff<60)return 'gerade eben';
  if(diff<3600)return Math.floor(diff/60)+' Min.';
  if(diff<86400)return Math.floor(diff/3600)+' Std.';
  if(diff<604800)return Math.floor(diff/86400)+' Tg.';
  return new Date(iso).toLocaleDateString('de-DE',{day:'2-digit',month:'short'});
}

// ─── Panel-Aktionen ───
function notifClickItem(notifId,taskId){
  notificationService.markAsRead(notifId);
  notifUpdateBell();
  if(taskId && pmTask(taskId)){
    notifClose();
    go('tasks');
    pmState.activeBoardId=pmTask(taskId).boardId;
    pmState.view='board';
    renderTasks();
    setTimeout(function(){pmOpenTask(taskId);},150);
  }else{
    notifRenderPanel();
  }
}
function notifDismiss(id){
  // Soft-Delete via Adapter
  var n=(D.pm.notifications||[]).find(function(x){return x.id===id;});
  if(n){n.deleted_at=new Date().toISOString();save();}
  notifUpdateBell();notifRenderPanel();
}
function notifMarkAllRead(){
  notificationService.getNotifications().forEach(function(n){if(!n.read)notificationService.markAsRead(n.id);});
  notifUpdateBell();notifRenderPanel();
}
function notifClearAll(){
  var now=new Date().toISOString();
  (D.pm.notifications||[]).forEach(function(n){if(!n.deleted_at)n.deleted_at=now;});
  save();notifUpdateBell();notifRenderPanel();
}

// ═══════════════════════════════════════════════════════════════
// WIEDERKEHRENDE AUFGABEN
// Beim Abschließen einer Task mit recurring-Wert wird automatisch
// eine neue Task mit verschobenem Fälligkeitsdatum erzeugt.
// ═══════════════════════════════════════════════════════════════
function notifHandleRecurringComplete(taskId){
  var t=pmTask(taskId);
  if(!t||!t.recurring)return;
  // Nur wenn Task gerade in eine "Erledigt"-Liste verschoben wurde
  var prog=calculateBoardProgress(t.boardId);
  if(!(prog.doneListId && t.listId===prog.doneListId))return;

  // Nächstes Fälligkeitsdatum berechnen
  var base=t.dueDate?new Date(t.dueDate):new Date();
  var next=new Date(base);
  if(t.recurring==='täglich')next.setDate(next.getDate()+1);
  else if(t.recurring==='wöchentlich')next.setDate(next.getDate()+7);
  else if(t.recurring==='monatlich')next.setMonth(next.getMonth()+1);
  else return;
  var nextDate=next.toISOString().split('T')[0];

  // Erste Liste des Boards finden (zurück an den Anfang)
  var lists=pmGetLists(t.boardId);
  var firstList=lists[0];
  if(!firstList)return;

  // Neue Task als Kopie erstellen
  taskService.createTask(t.boardId,firstList.id,{
    title:t.title, desc:t.desc, priority:t.priority,
    dueDate:nextDate, dueTime:t.dueTime, assignee:t.assignee,
    labels:t.labels.slice(), recurring:t.recurring,
    checklist:t.checklist.map(function(c){return {text:c.text,done:false};})
  });
  toast('🔁 Wiederkehrende Aufgabe neu angelegt für '+next.toLocaleDateString('de-DE'));
}

function renderCoaching(){
  // Entry point: ensure data structure, then show dashboard
  D.coachingProgress=D.coachingProgress||{};
  D.coachingBookmarks=D.coachingBookmarks||{};
  if(!coachCurrentView||coachCurrentView==='lesson'){coachCurrentView='dashboard';}
  coachShowView(coachCurrentView);
}

// ═══════════════ HELIUM 10 IMPORT ═══════════════

var heliumImportState={fileName:'',rawText:'',parsed:null,detectedType:'',rows:[],destination:'ideen'};

// Detect Helium 10 export type from header columns
function detectHeliumType(headers){
  var lower=headers.map(function(h){return h.toLowerCase().trim()});
  var joined=lower.join('|');

  // Black Box / Jungle Scout: ASIN + Rang + Sales/Revenue (engl. + dt. Oberfläche)
  if(joined.indexOf('asin')>=0
     &&(joined.indexOf('bsr')>=0||joined.indexOf('best seller rank')>=0||(joined.indexOf('rank')>=0&&joined.indexOf('keyword')<0))
     &&(joined.indexOf('sales')>=0||joined.indexOf('revenue')>=0||joined.indexOf('parent level sales')>=0
        ||joined.indexOf('umsatz')>=0||joined.indexOf('verkäufe')>=0)){
    return 'blackbox';
  }
  // Cerebro/Magnet: Keyword + Search Volume / Suchvolumen
  if((joined.indexOf('keyword phrase')>=0||joined.indexOf('keyword')>=0||joined.indexOf('suchbegriff')>=0)
     &&(joined.indexOf('search volume')>=0||joined.indexOf('search vol')>=0||joined.indexOf('suchvolumen')>=0)){
    return 'keywords';
  }
  // Xray: similar to Black Box but typically has "Active Sellers" or "Storefront"
  if(joined.indexOf('asin')>=0&&joined.indexOf('product details')>=0){
    return 'xray';
  }
  // Generic ASIN-based fallback
  if(joined.indexOf('asin')>=0)return 'asin_generic';
  return 'unknown';
}

// Header-Normalisierung: Helium hängt Währung/Einheiten an ("Price $", "Reviews Rating",
// "Active Sellers #", "Weight (lbs)") — für den Vergleich zählen nur Buchstaben/Ziffern.
function helNorm(s){return String(s||'').toLowerCase().replace(/[^a-z0-9äöüß]/g,'');}
function getHelField(row,candidates){
  // exakter Treffer zuerst (schnellster Weg)
  for(var i=0;i<candidates.length;i++){
    var c=candidates[i];
    if(row[c]!==undefined&&row[c]!==''&&row[c]!=='-'&&row[c]!=='N/A')return row[c];
  }
  // normalisierter Vergleich: "Price $" ≙ "Price", "Reviews Rating" ≙ "reviewsrating" …
  var keys=Object.keys(row);
  for(var i2=0;i2<candidates.length;i2++){
    var cn=helNorm(candidates[i2]);
    for(var j=0;j<keys.length;j++){
      var v=row[keys[j]];
      if(v!==''&&v!=='-'&&v!=='N/A'&&helNorm(keys[j])===cn)return v;
    }
  }
  return '';
}

function mapHeliumRow(row,type){
  var result={};
  if(type==='blackbox'||type==='xray'||type==='asin_generic'){
    result.asin=getHelField(row,['ASIN','asin','Asin']);
    result.name=getHelField(row,['Product Details','Title','Product Title','Name','Product Name','Produktdetails','Titel','Produktname','Product']);
    result.brand=getHelField(row,['Brand','brand','Marke']);
    result.price=parseNum(getHelField(row,['Price','Sale Price','Current Price','Preis','Buy Box Price','List Price']));
    result.bsr=parseNum(getHelField(row,['BSR','Best Seller Rank','Best Sellers Rank','Parent Level BSR','Rank']));
    result.sales=parseNum(getHelField(row,['Sales','Monthly Sales','Sales (Last 30 Days)','Parent Level Sales','Parent Level Monthly Sales','ASIN Sales','Est. Sales','Est Monthly Sales','Estimated Monthly Sales','Est. Mo. Sales','Mo. Sales','Verkäufe','Monatliche Verkäufe','Units Sold']));
    result.revenue=parseNum(getHelField(row,['Revenue','Monthly Revenue','Parent Level Revenue','Parent Level Monthly Revenue','ASIN Revenue','Est. Revenue','Est Monthly Revenue','Estimated Monthly Revenue','Est. Mo. Revenue','Mo. Revenue','Umsatz','Monatlicher Umsatz']));
    result.reviews=parseNum(getHelField(row,['Review Count','Reviews','Number of Reviews','Anzahl Reviews','Ratings','Ratings Count','Bewertungen','Anzahl Bewertungen','Reviews Count']));
    result.rating=parseNum(getHelField(row,['Rating','Review Rating','Reviews Rating','Stars','Sterne','Bewertung','Ratings Rating']));
    result.imageCount=parseNum(getHelField(row,['Number of Images','Image Count','# Images','Images']));
    result.weight=parseNum(getHelField(row,['Weight','Item Weight','Gewicht','Weight (lbs)','Weight (kg)','Gewicht (kg)']));
    result.category=getHelField(row,['Category','Top Level Category','Kategorie','Categories','Hauptkategorie']);
    result.sellers=parseNum(getHelField(row,['Number of Sellers','Active Sellers','Anzahl Verkäufer','Seller Count','Anzahl Anbieter']));
    result.imageUrl=getHelField(row,['Image URL','Image','Product Image','Bild-URL']);
    result.amazonUrl=getHelField(row,['Amazon URL','URL','Product URL','Amazon-URL']);
    if(!result.amazonUrl&&result.asin)result.amazonUrl='https://www.amazon.de/dp/'+result.asin;
  }else if(type==='keywords'){
    result.keyword=getHelField(row,['Keyword Phrase','Keyword','keyword','Keyword-Phrase','Suchbegriff']);
    result.searchVolume=parseNum(getHelField(row,['Search Volume','Search Vol.','search volume','Suchvolumen']));
    result.cpr=parseNum(getHelField(row,['CPR','Cerebro Product Rank']));
    result.magnetIQ=parseNum(getHelField(row,['Magnet IQ Score','IQ Score','Magnet IQ']));
    result.competingProducts=parseNum(getHelField(row,['Competing Products','Number of Competing Products','Konkurrierende Produkte']));
    result.organicRank=parseNum(getHelField(row,['Organic Rank','Position','Organischer Rang']));
    result.sponsoredRank=parseNum(getHelField(row,['Sponsored Rank','Gesponserter Rang']));
  }
  return result;
}

function handleHeliumFile(e){
  var f=e.target.files[0];
  if(!f)return;
  var r=new FileReader();
  r.onload=function(ev){
    heliumImportState.fileName=f.name;
    heliumImportState.rawText=ev.target.result;
    parseHeliumFile();
  };
  r.readAsText(f,'UTF-8');
  e.target.value='';
}

function parseHeliumFile(){
  var parsed=parseCSV(heliumImportState.rawText);
  if(!parsed.headers||parsed.headers.length===0){toast('Keine Daten in der Datei');return}

  heliumImportState.parsed=parsed;
  heliumImportState.detectedType=detectHeliumType(parsed.headers);
  heliumImportState.rows=parsed.rows.map(function(r){return mapHeliumRow(r,heliumImportState.detectedType)});

  renderHeliumPreview();
  document.getElementById('heliumImportModal').classList.add('show');
}

function renderHeliumPreview(){
  var s=heliumImportState;
  var typeLabel=s.detectedType==='blackbox'?'📦 Black Box (Produktrecherche)':s.detectedType==='xray'?'🔍 Xray (Live-Marktdaten)':s.detectedType==='keywords'?'🔑 Cerebro/Magnet (Keywords)':s.detectedType==='asin_generic'?'❓ ASIN-Liste (Generisch)':'❌ Format unbekannt';

  // Validate
  var validRows=s.rows.filter(function(r){return r.asin||r.keyword});
  document.getElementById('heliumImportSummary').innerHTML=
    '<div style="display:flex;flex-wrap:wrap;gap:18px;align-items:center">'+
      '<div><div style="font-size:10px;color:var(--tx2);text-transform:uppercase;letter-spacing:1px">Datei</div><div style="font-weight:700;color:var(--ac);font-size:13px">'+esc(s.fileName)+'</div></div>'+
      '<div><div style="font-size:10px;color:var(--tx2);text-transform:uppercase;letter-spacing:1px">Erkanntes Format</div><div style="font-weight:700;font-size:13px">'+typeLabel+'</div></div>'+
      '<div><div style="font-size:10px;color:var(--tx2);text-transform:uppercase;letter-spacing:1px">Zeilen</div><div style="font-weight:700;color:var(--bl);font-size:13px">'+s.rows.length+'</div></div>'+
      '<div><div style="font-size:10px;color:var(--tx2);text-transform:uppercase;letter-spacing:1px">Verwertbar</div><div style="font-weight:700;color:var(--gn);font-size:13px">'+validRows.length+'</div></div>'+
    '</div>';

  // Show destination selector based on type
  var destOptions=document.getElementById('heliumDestination');
  var destWrap=document.getElementById('heliumDestWrap');
  if(s.detectedType==='keywords'){
    destWrap.innerHTML='<div style="padding:12px;background:var(--bld);border:1px solid var(--bl);border-radius:8px;color:var(--bl);font-size:12px">📌 Keyword-Daten werden in den <b>Keyword-Tracker</b> importiert</div>';
    s.destination='keywords';
  }else{
    destWrap.innerHTML=
      '<div class="fi"><label>Ziel auswählen</label>'+
      '<select id="heliumDestSelect" onchange="heliumImportState.destination=this.value">'+
        '<option value="kandidaten">🔬 Recherche-Kandidaten (direkt in „Validieren")</option>'+
        '<option value="ideen">💡 Ideen-Pool (erst grob bewerten)</option>'+
        '<option value="produkte">📋 Produktliste (direkt anlegen)</option>'+
      '</select>'+
      '</div>';
    s.destination='kandidaten';
  }

  // Preview table
  var html='<table style="width:100%;font-size:11px"><thead><tr style="position:sticky;top:0;background:var(--s2);z-index:1">';
  if(s.detectedType==='keywords'){
    html+='<th style="text-align:left;padding:6px 10px">Keyword</th>';
    html+='<th class="nc" style="padding:6px 10px">Suchvolumen</th>';
    html+='<th class="nc" style="padding:6px 10px">CPR</th>';
    html+='<th class="nc" style="padding:6px 10px">Magnet IQ</th>';
    html+='<th class="nc" style="padding:6px 10px">Konkurrenz</th>';
  }else{
    html+='<th style="text-align:left;padding:6px 10px">ASIN</th>';
    html+='<th style="text-align:left;padding:6px 10px;min-width:180px">Produkt</th>';
    html+='<th class="nc" style="padding:6px 10px">Preis</th>';
    html+='<th class="nc" style="padding:6px 10px">BSR</th>';
    html+='<th class="nc" style="padding:6px 10px">Sales/M</th>';
    html+='<th class="nc" style="padding:6px 10px">Revenue/M</th>';
    html+='<th class="nc" style="padding:6px 10px">Reviews</th>';
    html+='<th class="nc" style="padding:6px 10px">Rating</th>';
  }
  html+='</tr></thead><tbody>';

  validRows.slice(0,30).forEach(function(r){
    html+='<tr style="border-bottom:1px solid var(--bd)">';
    if(s.detectedType==='keywords'){
      html+='<td style="padding:5px 10px;font-weight:600">'+esc(r.keyword||'—')+'</td>';
      html+='<td class="nc" style="padding:5px 10px">'+(r.searchVolume!==null?Math.round(r.searchVolume).toLocaleString('de-DE'):'—')+'</td>';
      html+='<td class="nc" style="padding:5px 10px">'+(r.cpr!==null?r.cpr:'—')+'</td>';
      html+='<td class="nc" style="padding:5px 10px;color:'+(r.magnetIQ>=60?'var(--gn)':'var(--tx2)')+'">'+(r.magnetIQ!==null?r.magnetIQ:'—')+'</td>';
      html+='<td class="nc" style="padding:5px 10px">'+(r.competingProducts!==null?Math.round(r.competingProducts).toLocaleString('de-DE'):'—')+'</td>';
    }else{
      html+='<td style="padding:5px 10px;font-family:monospace;color:var(--tx2)">'+esc(r.asin||'—')+'</td>';
      html+='<td style="padding:5px 10px">'+esc((r.name||'').substring(0,60))+'</td>';
      html+='<td class="nc" style="padding:5px 10px">'+(r.price!==null?fmt(r.price)+'€':'—')+'</td>';
      html+='<td class="nc" style="padding:5px 10px">'+(r.bsr!==null?Math.round(r.bsr).toLocaleString('de-DE'):'—')+'</td>';
      html+='<td class="nc" style="padding:5px 10px;color:var(--gn)">'+(r.sales!==null?Math.round(r.sales):'—')+'</td>';
      html+='<td class="nc" style="padding:5px 10px;color:var(--gn)">'+(r.revenue!==null?fmt(r.revenue)+'€':'—')+'</td>';
      html+='<td class="nc" style="padding:5px 10px">'+(r.reviews!==null?Math.round(r.reviews):'—')+'</td>';
      html+='<td class="nc" style="padding:5px 10px">'+(r.rating!==null?'⭐'+r.rating.toFixed(1):'—')+'</td>';
    }
    html+='</tr>';
  });
  if(validRows.length>30)html+='<tr><td colspan="8" style="padding:10px;text-align:center;color:var(--tx3);font-style:italic">... und '+(validRows.length-30)+' weitere</td></tr>';
  html+='</tbody></table>';
  document.getElementById('heliumPreviewContainer').innerHTML=html;

  document.getElementById('heliumImportBtn').textContent='📥 '+validRows.length+' importieren';
  document.getElementById('heliumImportBtn').disabled=validRows.length===0;
}

function confirmHeliumImport(){
  var s=heliumImportState;
  var validRows=s.rows.filter(function(r){return r.asin||r.keyword});
  if(validRows.length===0)return;

  var dest=s.destination;
  var count=0;

  if(dest==='kandidaten'){
    // Schutz vor Pipeline-Flutung: komplette Black-Box-Exporte haben oft 200 Zeilen —
    // das sind Rohtreffer, keine validierten Kandidaten. Ehrlich nachfragen.
    if(validRows.length>30&&!confirm('⚠️ '+validRows.length+' Zeilen als Recherche-Kandidaten anlegen?\n\nDas flutet die Stufe „Validieren". Für ungefilterte Helium-Listen ist der 💡 Ideen-Pool das bessere Ziel (dort grob sichten, die besten 5–20 in die Pipeline schieben).\n\nTrotzdem alle als Kandidaten anlegen?'))return;
    researchInit();
    validRows.forEach(function(r){
      var nm=r.name||((r.brand?r.brand+' ':'')+(r.asin||'')).trim();if(!nm)return;
      D.research.candidates.unshift({
        id:'cand_'+Date.now()+'_'+Math.random().toString(36).slice(2,7)+count,
        name:nm.substring(0,120), kategorie:r.category||'', hauptkeyword:'',
        vk:(r.price!=null?r.price:null),
        top10Umsatz:(r.revenue!=null?r.revenue:null),
        avgReviews:(r.reviews!=null?r.reviews:null),
        bsr:(r.bsr!=null?r.bsr:null),
        wettbewerber:(r.sellers!=null?r.sellers:null),
        konkurrenz:'', schwaechen:'', differenzierung:'',
        ek:null, fbaGebuehren:null, ppcRisiko:'', nettoMarge:null, risiko:'',
        status:'recherche', currentStep:1,
        notes:'Aus Helium 10 importiert ('+s.detectedType+'). BSR '+(r.bsr||'—')+', Rating '+(r.rating||'—'),
        scoreMatrix:{}, score2:{}, computedScore:0,
        compTitle:'', compDesc:'', compUsps:[], compImages:(r.imageUrl?[r.imageUrl]:[]), compAsin:r.asin||'', beat:null, compFetchedAt:null,
        createdAt:new Date().toISOString(), updatedAt:new Date().toISOString()
      });
      count++;
    });
    save();
    if(typeof researchRenderTable==='function')researchRenderTable();
    if(typeof researchUpdateBadge==='function')researchUpdateBadge();
    closeHeliumModal();
    toast('✓ '+count+' Kandidat'+(count===1?'':'en')+' in „Validieren" angelegt');
    go('pipeline');
  }else if(dest==='ideen'){
    validRows.forEach(function(r){
      var ideeName=r.name||r.asin;
      if(!ideeName)return;
      var pot='Mittel';
      if(r.revenue&&r.revenue>10000)pot='Hoch';
      else if(r.revenue&&r.revenue<3000)pot='Niedrig';
      // Build risiken/warum strings
      var marktgroesse=r.revenue?Math.round(r.revenue).toLocaleString('de-DE')+'€/Monat ('+r.sales+' Sales)':'';
      var warum=r.bsr?'BSR: '+Math.round(r.bsr).toLocaleString('de-DE')+', Reviews: '+(r.reviews||'?')+', Rating: '+(r.rating||'?'):'';
      var risiken=r.sellers&&r.sellers>5?'Viele Verkäufer ('+r.sellers+') – Buy-Box-Risiko':'';

      D.ideen.push({
        name:ideeName.substring(0,150),
        kategorie:r.category||'',
        potenzial:pot,
        vkPreis:r.price||0,
        marktgroesse:marktgroesse,
        zielgruppe:'',
        differenzierung:'',
        warum:warum,
        risiken:risiken,
        status:'Zu prüfen',
        quelle:'Helium 10 ('+s.detectedType+')',
        bildUrl:r.imageUrl||'',
        amazonLink:r.amazonUrl||(r.asin?'https://www.amazon.de/dp/'+r.asin:''),
        quellen:'',
        datum:new Date().toLocaleDateString('de-DE')
      });
      count++;
    });
    save();renderIdeen();renderDash();
    closeHeliumModal();
    toast('✓ '+count+' Ideen in Pool importiert');
    go('ideen');
  }else if(dest==='produkte'){
    validRows.forEach(function(r){
      var prodName=r.name||r.asin;
      if(!prodName)return;
      D.products.push({
        name:prodName.substring(0,150),
        asin:r.asin||'',
        kategorie:r.category||'',
        status:'Recherche',
        verkaufspreis:r.price||0,
        einkaufspreis:0,
        fbaGebuehren:0,
        versand:0,
        zoll:0,
        sonstigeKosten:0,
        bewertung:r.rating?Math.round(r.rating):0,
        bewertungenZahl:r.reviews||0,
        bsr:r.bsr||0,
        wettbewerber:r.sellers||0,
        gewicht:r.weight||0,
        bild:r.imageUrl||'',
        // Helium-10-Marktdaten (für den Reiter „Marktdaten (Helium 10)")
        helSales:r.sales!=null?r.sales:null,
        helRevenue:r.revenue!=null?r.revenue:null,
        helBsr:r.bsr!=null?r.bsr:null,
        helReviews:r.reviews!=null?r.reviews:null,
        helRating:r.rating!=null?r.rating:null,
        helSellers:r.sellers!=null?r.sellers:null,
        helPrice:r.price!=null?r.price:null,
        helCategory:r.category||'',
        helWeight:r.weight!=null?r.weight:null,
        helSource:heliumSourceLabel(s.detectedType),
        helDate:new Date().toLocaleDateString('de-DE'),
        notizen:'Aus Helium 10 importiert ('+s.detectedType+'). Revenue: '+(r.revenue?Math.round(r.revenue)+'€/M':'—')+', Sales: '+(r.sales||'—')+'/M',
        datum:new Date().toLocaleDateString('de-DE')
      });
      count++;
    });
    save();renderProds();renderDash();
    closeHeliumModal();
    toast('✓ '+count+' Produkte angelegt');
    go('produkte');
  }else if(dest==='keywords'){
    var firstProdIdx=D.products.length>0?0:-1;
    if(firstProdIdx===-1){toast('Erst Produkt anlegen, dann Keywords zuordnen');return}
    validRows.forEach(function(r){
      if(!r.keyword)return;
      D.keywords.push({
        productIdx:firstProdIdx,
        keyword:r.keyword,
        suchvolumen:r.searchVolume||0,
        cpr:r.cpr||0,
        position:r.organicRank||0,
        notiz:'Magnet IQ: '+(r.magnetIQ||'—')+', Konkurrenz: '+(r.competingProducts||'—'),
        datum:new Date().toLocaleDateString('de-DE')
      });
      count++;
    });
    save();
    closeHeliumModal();
    toast('✓ '+count+' Keywords importiert');
    go('keywords');
  }
}

function closeHeliumModal(){
  document.getElementById('heliumImportModal').classList.remove('show');
  heliumImportState={fileName:'',rawText:'',parsed:null,detectedType:'',rows:[],destination:'ideen'};
}

// Drop-zone wiring for helium
(function setupHeliumDropZone(){
  setTimeout(function(){
    var dz=document.getElementById('heliumDropZone');
    if(!dz)return;
    dz.addEventListener('dragover',function(e){e.preventDefault();dz.style.borderColor='var(--ac)';dz.style.background='var(--acd)'});
    dz.addEventListener('dragleave',function(){dz.style.borderColor='var(--bd2)';dz.style.background='var(--s1)'});
    dz.addEventListener('drop',function(e){
      e.preventDefault();
      dz.style.borderColor='var(--bd2)';dz.style.background='var(--s1)';
      var f=e.dataTransfer.files[0];if(!f)return;
      var r=new FileReader();
      r.onload=function(ev){
        heliumImportState.fileName=f.name;
        heliumImportState.rawText=ev.target.result;
        parseHeliumFile();
      };
      r.readAsText(f,'UTF-8');
    });
  },200);
})();

// ═══════════════ XRAY-PASTE: Nische einfügen → Ampel in 10 Sekunden (Phase 2) ═══════════════
// Xray-Tabelle (Chrome-Extension) kopieren & einfügen → EIN aggregierter Nischen-Kandidat,
// sofort gescort (Nachfrage + Wettbewerb aus echten Daten). Kein Datei-Export nötig.
var xrayPasteState={rows:[],agg:null,raw:'',type:''};

function xrayPasteOpen(){
  var old=document.getElementById('xrayPasteModal');if(old)old.remove();
  xrayPasteState={rows:[],agg:null,raw:'',type:''};
  var ov=document.createElement('div');
  ov.id='xrayPasteModal';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99997;display:flex;align-items:center;justify-content:center;padding:20px';
  ov.onclick=function(e){if(e.target===ov)ov.remove();};
  ov.innerHTML='<div style="background:var(--s1);border-radius:14px;max-width:680px;width:100%;max-height:90vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.5)">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid var(--bd)"><h2 style="margin:0;font-size:17px">⚡ Xray-Schnell-Analyse</h2><button onclick="document.getElementById(\'xrayPasteModal\').remove()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--tx2)">✕</button></div>'+
    '<div style="padding:18px 20px">'+
      '<div style="font-size:12px;color:var(--tx2);line-height:1.6;margin-bottom:12px">Amazon-Suchergebnis öffnen → <b>Xray</b> starten → Tabelle <b>inklusive Kopfzeile</b> markieren &amp; kopieren → hier einfügen. AMZ SellerHub aggregiert die Top-10 zu <b>einem Nischen-Kandidaten</b> und zeigt sofort die Ampel. Auch CSV-Export-Inhalte funktionieren.</div>'+
      '<div class="fi" style="margin-bottom:8px"><label>Nischen-Name (Haupt-Keyword)</label><input id="xpName" type="text" placeholder="z.B. Bambus Schneidebrett" style="width:100%;box-sizing:border-box"></div>'+
      '<textarea id="xpInput" rows="6" placeholder="Xray-Tabelle hier einfügen (Cmd/Strg+V) …" onpaste="setTimeout(xrayPasteAnalyze,60)" style="width:100%;font-family:monospace;font-size:11px;padding:10px;border-radius:8px;border:1px solid var(--bd);background:var(--s2);color:var(--tx);resize:vertical;box-sizing:border-box"></textarea>'+
      '<div style="display:flex;gap:8px;margin-top:10px"><button class="btn btn-p" onclick="xrayPasteAnalyze()">⚡ Analysieren</button></div>'+
      '<div id="xpResult" style="margin-top:14px"></div>'+
    '</div>'+
  '</div>';
  document.body.appendChild(ov);
  setTimeout(function(){var t=document.getElementById('xpInput');if(t)t.focus();},80);
}

function xrayPasteAnalyze(){
  var inp=document.getElementById('xpInput');var res=document.getElementById('xpResult');
  if(!inp||!res)return;
  var raw=inp.value||'';
  if(!raw.trim()){toast('Bitte erst die Xray-Tabelle einfügen');return;}
  function fail(msg){res.innerHTML='<div style="background:var(--rdd);border:1px solid var(--rd);border-radius:8px;padding:10px 14px;font-size:12px;color:var(--rd)">'+msg+'</div>';}
  var parsed=parseCSV(raw);
  if(!parsed.headers.length||!parsed.rows.length){fail('⚠️ Keine Tabelle erkannt. Bitte die Xray-Tabelle <b>inklusive Kopfzeile</b> markieren und kopieren – oder den CSV-Export einfügen.');return;}
  var type=detectHeliumType(parsed.headers);
  if(type==='keywords'){fail('⚠️ Das ist ein <b>Keyword-Export</b> (Cerebro/Magnet). Für die Nischen-Analyse brauchst du die <b>Xray-Produkttabelle</b>. Keywords importierst du über 📥 Helium-Import.');return;}
  if(type==='unknown'){fail('⚠️ Keine ASIN-Spalte gefunden. Bitte die Kopfzeile mitkopieren (Spalten wie ASIN, Price, Revenue …).');return;}
  var rows=parsed.rows.map(function(r){return mapHeliumRow(r,type);}).filter(function(r){return (r.asin||r.name)&&(r.revenue!=null||r.sales!=null||r.reviews!=null||r.price!=null);});
  if(!rows.length){fail('⚠️ Keine verwertbaren Zeilen (keine Zahlen zu Umsatz/Sales/Reviews/Preis gefunden).');return;}
  xrayPasteState.rows=rows;xrayPasteState.raw=raw;xrayPasteState.type=type;
  xrayPasteState.agg=xrayAggregate(rows);
  // Nischen-Name vorschlagen, falls leer
  var nameInp=document.getElementById('xpName');
  if(nameInp&&!nameInp.value.trim()&&rows[0].name)nameInp.value=rows[0].name.split(/[,|–-]/)[0].trim().substring(0,60);
  res.innerHTML=xrayPasteResultHtml(xrayPasteState.agg);
}

// Top-10 (nach Umsatz) aggregieren → Nischen-Kennzahlen
function xrayAggregate(rows){
  function nums(arr,f){return arr.map(f).filter(function(x){return typeof x==='number'&&!isNaN(x);});}
  function avg(arr,f){var v=nums(arr,f);return v.length?v.reduce(function(a,b){return a+b;},0)/v.length:null;}
  function med(arr,f){var v=nums(arr,f).sort(function(a,b){return a-b;});if(!v.length)return null;var m=Math.floor(v.length/2);return v.length%2?v[m]:(v[m-1]+v[m])/2;}
  var withRev=rows.filter(function(r){return r.revenue!=null;}).sort(function(a,b){return b.revenue-a.revenue;});
  var top=(withRev.length?withRev:rows).slice(0,10);
  var revAll=nums(rows,function(r){return r.revenue;});
  var reviews=nums(top,function(r){return r.reviews;});
  var prices=nums(top,function(r){return r.price;});
  // Marken-Dominanz in den Top-10
  var brandCount={},domBrand=null,domCount=0;
  top.forEach(function(r){var b=(r.brand||'').trim();if(!b)return;brandCount[b]=(brandCount[b]||0)+1;if(brandCount[b]>domCount){domCount=brandCount[b];domBrand=b;}});
  return {
    n:rows.length,topN:top.length,
    avgRevenue:avg(top,function(r){return r.revenue;}),
    totalRevenue:revAll.length?revAll.reduce(function(a,b){return a+b;},0):null,
    avgSales:avg(top,function(r){return r.sales;}),
    avgReviews:avg(top,function(r){return r.reviews;}),
    minReviews:reviews.length?Math.min.apply(null,reviews):null,
    maxReviews:reviews.length?Math.max.apply(null,reviews):null,
    beatable:top.filter(function(r){return r.reviews!=null&&r.reviews<300;}).length,
    medPrice:med(top,function(r){return r.price;}),
    minPrice:prices.length?Math.min.apply(null,prices):null,
    maxPrice:prices.length?Math.max.apply(null,prices):null,
    avgRating:avg(top,function(r){return r.rating;}),
    domBrand:domCount>=4?domBrand:null,domCount:domCount,
    asins:top.map(function(r){return r.asin;}).filter(Boolean),
    at:new Date().toISOString()
  };
}

// Kandidaten-Entwurf aus Aggregat (auch für Score-Vorschau vor dem Speichern)
function xrayDraftCandidate(agg,name){
  return {
    name:name||'Xray-Nische',
    vk:agg.medPrice!=null?Math.round(agg.medPrice*100)/100:null,
    top10Umsatz:agg.avgRevenue!=null?Math.round(agg.avgRevenue):null,
    avgReviews:agg.avgReviews!=null?Math.round(agg.avgReviews):null,
    score2:{}
  };
}

function xrayPasteResultHtml(agg){
  var name=(document.getElementById('xpName')||{}).value||'';
  var draft=xrayDraftCandidate(agg,name);
  var vd=decisionVerdict(draft);
  var cf=decisionConfidence(draft);
  var emoji=vd.verdict==='go'?'🟢':vd.verdict==='nogo'?'🔴':vd.verdict==='pruefen'?'🟡':'⚪';
  function stat(label,val,col){return '<div style="background:var(--s2);border:1px solid var(--bd);border-radius:8px;padding:9px 12px"><div style="font-size:10px;color:var(--tx3);text-transform:uppercase;letter-spacing:.5px">'+label+'</div><div style="font-size:16px;font-weight:800;color:var(--'+(col||'tx')+')">'+val+'</div></div>';}
  var h='<div style="background:linear-gradient(135deg,var(--'+vd.color+'d),var(--s2));border:1.5px solid var(--'+vd.color+');border-radius:10px;padding:12px 16px;margin-bottom:10px;display:flex;align-items:center;gap:14px;flex-wrap:wrap">'+
    '<div style="text-align:center"><div style="font-size:32px;font-weight:800;color:var(--'+vd.color+');line-height:1">'+(vd.score>0?vd.score:'—')+'</div><div style="font-size:9px;color:var(--tx3);text-transform:uppercase;letter-spacing:1px">Score /100</div></div>'+
    '<div style="background:var(--'+vd.color+');color:#fff;font-weight:800;font-size:14px;padding:6px 14px;border-radius:9px">'+emoji+' '+vd.label+'</div>'+
    '<div style="flex:1;min-width:160px;font-size:11px;color:var(--tx2);line-height:1.5">Vorläufig – basiert auf <b>'+cf.data+'/'+cf.total+'</b> echten Datenpunkten ('+agg.topN+' Top-Produkte aggregiert). Für volle Konfidenz danach: 💶 Marge rechnen · 🔬 Review-Mining.</div>'+
  '</div>';
  var flags=decisionRedFlags(draft);
  if(flags.length&&typeof pipeFlagChips==='function')h+=pipeFlagChips(flags);
  h+='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin-bottom:10px">';
  h+=stat('⌀ Umsatz Top-'+agg.topN,agg.avgRevenue!=null?Math.round(agg.avgRevenue).toLocaleString('de-DE')+' €/M':'—',agg.avgRevenue>=8000?'gn':'tx');
  h+=stat('Nische gesamt',agg.totalRevenue!=null?Math.round(agg.totalRevenue).toLocaleString('de-DE')+' €/M':'—');
  h+=stat('⌀ Reviews',agg.avgReviews!=null?Math.round(agg.avgReviews).toLocaleString('de-DE'):'—',agg.avgReviews!=null?(agg.avgReviews<300?'gn':agg.avgReviews<1000?'ac':'rd'):'tx');
  h+=stat('Schwache Listings','&lt;300 Rev.: '+agg.beatable,agg.beatable>0?'gn':'tx');
  h+=stat('⌀ Preis (Median)',agg.medPrice!=null?fmt(agg.medPrice)+'€':'—');
  h+=stat('Preis-Spanne',(agg.minPrice!=null?fmt(agg.minPrice):'—')+'–'+(agg.maxPrice!=null?fmt(agg.maxPrice):'—')+'€');
  h+=stat('⌀ Rating',agg.avgRating!=null?'⭐'+agg.avgRating.toFixed(1):'—');
  h+=stat('Zeilen erkannt',agg.n);
  h+='</div>';
  if(agg.domBrand)h+='<div style="background:var(--acd);border:1px solid var(--ac);border-radius:8px;padding:8px 12px;font-size:12px;color:var(--ac);margin-bottom:10px">⚠️ <b>Marken-Dominanz:</b> „'+esc(agg.domBrand)+'" hält '+agg.domCount+' der Top-'+agg.topN+' Plätze – schwerer angreifbar.</div>';
  h+='<div style="display:flex;gap:8px;flex-wrap:wrap">'+
    '<button class="btn btn-p" onclick="xrayPasteConfirm()" style="font-weight:700">✓ Als Nischen-Kandidat übernehmen</button>'+
    '<button class="btn btn-sm" onclick="xrayPasteAsRows()" title="Klassischer Import: jede Zeile einzeln (Ziel wählbar)" style="align-self:center">▸ Zeilen einzeln importieren …</button>'+
  '</div>';
  return h;
}

function xrayPasteConfirm(){
  var s=xrayPasteState;
  if(!s.agg){toast('Bitte erst analysieren');return;}
  researchInit();
  var name=((document.getElementById('xpName')||{}).value||'').trim()||('Xray-Nische '+new Date().toLocaleDateString('de-DE'));
  var draft=xrayDraftCandidate(s.agg,name);
  var c={
    id:'cand_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),
    name:name.substring(0,120), kategorie:'', hauptkeyword:name.substring(0,80),
    vk:draft.vk, top10Umsatz:draft.top10Umsatz, avgReviews:draft.avgReviews,
    konkurrenz:'', schwaechen:'', differenzierung:'',
    ek:null, fbaGebuehren:null, ppcRisiko:'', nettoMarge:null, risiko:'',
    status:'recherche', currentStep:1,
    notes:'⚡ Xray-Paste ('+s.agg.n+' Zeilen, Top-'+s.agg.topN+' aggregiert). ⌀ Rating '+(s.agg.avgRating!=null?s.agg.avgRating.toFixed(1):'—')+', Nische gesamt '+(s.agg.totalRevenue!=null?Math.round(s.agg.totalRevenue).toLocaleString('de-DE')+' €/M':'—'),
    scoreMatrix:{}, score2:{}, computedScore:0,
    compTitle:'', compDesc:'', compUsps:[], compImages:[], compAsin:(s.agg.asins[0]||''), beat:null, compFetchedAt:null,
    // kompatibel zum Nischen-Scan (grüne ✓-Anzeige, Ergebnis im Scan-Modal sichtbar)
    nischenScan:{count:s.agg.topN,okCount:s.agg.topN,failCount:0,avgPrice:s.agg.medPrice,avgReviews:s.agg.avgReviews,
      minReviews:s.agg.minReviews,maxReviews:s.agg.maxReviews,beatable:s.agg.beatable,asins:s.agg.asins,at:s.agg.at,
      avgRevenue:s.agg.avgRevenue,totalRevenue:s.agg.totalRevenue,avgRating:s.agg.avgRating,source:'xray-paste',
      domBrand:s.agg.domBrand||null,domCount:s.agg.domCount||0},
    createdAt:new Date().toISOString(), updatedAt:new Date().toISOString()
  };
  c.computedScore=researchCalcScore(c);
  D.research.candidates.unshift(c);
  save();
  var vd=decisionVerdict(c);
  var old=document.getElementById('xrayPasteModal');if(old)old.remove();
  if(typeof researchRenderTable==='function')researchRenderTable();
  if(typeof researchUpdateBadge==='function')researchUpdateBadge();
  toast((vd.verdict==='go'?'🟢':vd.verdict==='nogo'?'🔴':'🟡')+' „'+c.name.substring(0,40)+'" angelegt – Score '+vd.score+' ('+vd.label+')');
  go('pipeline');
}

// Fallback: klassischer Zeilen-Import über das bestehende Vorschau-Modal
function xrayPasteAsRows(){
  var s=xrayPasteState;
  if(!s.raw){toast('Bitte erst analysieren');return;}
  var old=document.getElementById('xrayPasteModal');if(old)old.remove();
  heliumImportState.fileName='📋 Zwischenablage (Xray-Paste)';
  heliumImportState.rawText=s.raw;
  parseHeliumFile();
}

// ═══════════════ SELLER-CENTER CSV IMPORT ═══════════════

// Robust CSV parser: handles commas vs semicolons vs tabs, quoted fields, line breaks in fields
function parseCSV(text){
  if(!text)return {headers:[],rows:[]};
  // BOM strip
  if(text.charCodeAt(0)===0xFEFF)text=text.substring(1);

  // Detect delimiter: count occurrences in first non-empty line
  var firstLine='';
  for(var li=0;li<text.length;li++){
    var ch=text[li];
    if(ch==='\n'||ch==='\r'){if(firstLine.length>0)break;continue}
    firstLine+=ch;
  }
  var counts={'\t':0,';':0,',':0,'|':0};
  var inQuoteCheck=false;
  for(var i=0;i<firstLine.length;i++){
    var c=firstLine[i];
    if(c==='"')inQuoteCheck=!inQuoteCheck;
    else if(!inQuoteCheck&&counts.hasOwnProperty(c))counts[c]++;
  }
  var delim='\t';var maxC=counts['\t'];
  ['\t',';',',','|'].forEach(function(d){if(counts[d]>maxC){maxC=counts[d];delim=d}});

  // State machine parser to handle quoted fields correctly
  var rows=[];
  var row=[];
  var field='';
  var inQuote=false;
  for(var p=0;p<text.length;p++){
    var ch=text[p];
    if(inQuote){
      if(ch==='"'){
        if(p+1<text.length&&text[p+1]==='"'){field+='"';p++}
        else{inQuote=false}
      }else{field+=ch}
    }else{
      if(ch==='"'){inQuote=true}
      else if(ch===delim){row.push(field);field=''}
      else if(ch==='\r'){/*skip*/}
      else if(ch==='\n'){row.push(field);rows.push(row);row=[];field=''}
      else{field+=ch}
    }
  }
  if(field!==''||row.length>0){row.push(field);rows.push(row)}

  // Filter empty rows
  rows=rows.filter(function(r){return r.length>0&&r.some(function(c){return c&&c.trim()})});
  if(rows.length===0)return{headers:[],rows:[],delim:delim};

  var headers=rows[0].map(function(h){return(h||'').trim()});
  var dataRows=rows.slice(1).map(function(r){
    var obj={};
    headers.forEach(function(h,idx){obj[h]=(r[idx]||'').trim()});
    return obj;
  });
  return {headers:headers,rows:dataRows,delim:delim};
}

// Detect report type from header columns
function detectReportType(headers){
  var lower=headers.map(function(h){return h.toLowerCase()});
  var joined=lower.join('|');

  // Business Report indicators
  if(joined.indexOf('sessions')>=0||joined.indexOf('seitenaufrufe')>=0||joined.indexOf('page views')>=0
     ||joined.indexOf('buy box')>=0||joined.indexOf('einkaufswagen-box')>=0
     ||joined.indexOf('bestellte einheiten')>=0||joined.indexOf('units ordered')>=0){
    return 'business';
  }
  // Inventory Report indicators
  if(joined.indexOf('afn-fulfillable-quantity')>=0||joined.indexOf('available')>=0
     ||joined.indexOf('inbound')>=0||joined.indexOf('reserved-quantity')>=0
     ||joined.indexOf('verfügbar')>=0||joined.indexOf('zugehender bestand')>=0){
    return 'inventory';
  }
  return 'custom';
}

// Map common Amazon column-name variations to canonical fields
function getFieldFromRow(row,candidates){
  for(var i=0;i<candidates.length;i++){
    var c=candidates[i];
    // Exact match
    if(row[c]!==undefined&&row[c]!=='')return row[c];
    // Case-insensitive match
    var keys=Object.keys(row);
    for(var j=0;j<keys.length;j++){
      if(keys[j].toLowerCase()===c.toLowerCase()&&row[keys[j]]!=='')return row[keys[j]];
    }
  }
  return '';
}

// Parse a numeric field that may have €, $, %, commas, dots etc.
function parseNum(v){
  if(v===''||v==null)return null;
  var s=String(v).replace(/[€$£\s%]/g,'').trim();
  // Handle German format "1.234,56" → "1234.56"
  if(s.match(/,\d{1,2}$/)&&s.indexOf('.')>=0)s=s.replace(/\./g,'').replace(',','.');
  else if(s.match(/,\d{1,2}$/))s=s.replace(',','.');
  // US-Tausender "1,234" / "1,234.56" (Helium-Exporte sind oft US-formatiert)
  else if(s.match(/^\d{1,3}(,\d{3})+(\.\d+)?$/))s=s.replace(/,/g,'');
  // Deutsche Tausenderpunkte ohne Komma "1.234" / "1.234.567" (nicht bei führender 0, z.B. "0.750")
  else if(s.match(/^[1-9]\d{0,2}(\.\d{3})+$/))s=s.replace(/\./g,'');
  var n=parseFloat(s);
  return isNaN(n)?null:n;
}

// Extract ASIN from a row (multiple possible column names)
function extractASIN(row){
  return getFieldFromRow(row,['ASIN','asin','(Untergeordnete) ASIN','Child ASIN','Kind-ASIN','Untergeordnete ASIN','Parent ASIN','Eltern-ASIN']);
}

// Extract SKU
function extractSKU(row){
  return getFieldFromRow(row,['SKU','sku','seller-sku','Seller SKU','Verkäufer-SKU','MSKU','msku']);
}

// Map a single row to canonical sales data based on detected type
function mapRowToData(row,type){
  var data={};
  if(type==='business'){
    var sessions=parseNum(getFieldFromRow(row,['Sessions','Sitzungen','Sessions – Total','Sitzungen – Gesamt','Sessions - Total']));
    var pageViews=parseNum(getFieldFromRow(row,['Page Views','Seitenaufrufe','Page Views – Total','Seitenaufrufe – Gesamt']));
    var unitsOrdered=parseNum(getFieldFromRow(row,['Units Ordered','Bestellte Einheiten','Units Ordered - B2B','Units Sold']));
    var orderedRevenue=parseNum(getFieldFromRow(row,['Ordered Product Sales','Umsatz bestellter Produkte','Bestellter Produktumsatz','Ordered Product Sales - B2B']));
    var sessionPercent=parseNum(getFieldFromRow(row,['Session Percentage','Sitzungsprozentsatz']));
    var unitSessionPercent=parseNum(getFieldFromRow(row,['Unit Session Percentage','Einheitensitzungsprozentsatz','Unit Session %']));
    var buyBoxPercent=parseNum(getFieldFromRow(row,['Featured Offer (Buy Box) Percentage','Buy Box Percentage','Einkaufswagen-Box-Prozentsatz','Buy Box %','Featured Offer (Buy Box)']));

    if(sessions!==null)data.sessions=sessions;
    if(pageViews!==null)data.pageViews=pageViews;
    if(unitsOrdered!==null)data.unitsOrdered=unitsOrdered;
    if(orderedRevenue!==null)data.orderedRevenue=orderedRevenue;
    if(sessionPercent!==null)data.sessionPercent=sessionPercent;
    if(unitSessionPercent!==null)data.conversionRate=unitSessionPercent;
    if(buyBoxPercent!==null)data.buyBoxPercent=buyBoxPercent;

    // Compute conversion rate if not present but units & sessions exist
    if(data.conversionRate===undefined&&data.sessions&&data.unitsOrdered){
      data.conversionRate=(data.unitsOrdered/data.sessions)*100;
    }
    data._type='business';
  }else if(type==='inventory'){
    var available=parseNum(getFieldFromRow(row,['afn-fulfillable-quantity','Available','Verfügbar','Available Quantity']));
    var inbound=parseNum(getFieldFromRow(row,['afn-inbound-shipped-quantity','afn-inbound-receiving-quantity','Inbound','Zugehend','Zugehender Bestand']));
    var reserved=parseNum(getFieldFromRow(row,['afn-reserved-quantity','Reserved','Reserviert']));
    var unsellable=parseNum(getFieldFromRow(row,['afn-unsellable-quantity','Unsellable','Nicht verkaufsfähig']));
    var totalQty=parseNum(getFieldFromRow(row,['afn-total-quantity','Total Quantity','Gesamtmenge']));

    if(available!==null)data.inventoryAvailable=available;
    if(inbound!==null)data.inventoryInbound=inbound;
    if(reserved!==null)data.inventoryReserved=reserved;
    if(unsellable!==null)data.inventoryUnsellable=unsellable;
    if(totalQty!==null)data.inventoryTotal=totalQty;
    data._type='inventory';
  }
  return data;
}

// State for current import
var sellerImportState={fileName:'',rawText:'',parsed:null,type:'',matches:[],unmatched:[]};

function handleSellerFile(e){
  var f=e.target.files[0];
  if(!f)return;
  var r=new FileReader();
  r.onload=function(ev){
    sellerImportState.fileName=f.name;
    sellerImportState.rawText=ev.target.result;
    parseSellerFile();
  };
  r.readAsText(f,'UTF-8');
  e.target.value='';// allow re-upload of same file
}

function parseSellerFile(){
  var parsed=parseCSV(sellerImportState.rawText);
  if(!parsed.headers||parsed.headers.length===0){
    toast('Keine Daten erkannt – ist die Datei korrekt?');
    return;
  }
  sellerImportState.parsed=parsed;
  sellerImportState.type=detectReportType(parsed.headers);

  // Build matches against existing products by ASIN/SKU
  var matches=[],unmatched=[];
  parsed.rows.forEach(function(row,idx){
    var asin=extractASIN(row);
    var sku=extractSKU(row);
    var match=null;
    if(asin)match=D.products.find(function(p){return p.asin&&p.asin.toUpperCase()===asin.toUpperCase()});
    if(!match&&sku)match=D.products.find(function(p){return p.sku&&p.sku.toUpperCase()===sku.toUpperCase()});

    var data=mapRowToData(row,sellerImportState.type);
    var entry={rowIdx:idx,asin:asin,sku:sku,product:match,productIdx:match?D.products.indexOf(match):-1,data:data,row:row};
    if(match)matches.push(entry);
    else unmatched.push(entry);
  });
  sellerImportState.matches=matches;
  sellerImportState.unmatched=unmatched;

  renderSellerPreview();
  document.getElementById('sellerReportType').value=sellerImportState.type;
  document.getElementById('sellerImportModal').classList.add('show');
}

function renderSellerPreview(){
  var s=sellerImportState;
  var typeLabel=s.type==='business'?'📈 Business Report':s.type==='inventory'?'📦 Inventory Report':'❓ Custom / Auto-Erkennung';

  document.getElementById('sellerImportSummary').innerHTML=
    '<div style="display:flex;flex-wrap:wrap;gap:18px;align-items:center">'+
      '<div><div style="font-size:10px;color:var(--tx2);text-transform:uppercase;letter-spacing:1px">Datei</div><div style="font-weight:700;color:var(--ac);font-size:13px">'+esc(s.fileName)+'</div></div>'+
      '<div><div style="font-size:10px;color:var(--tx2);text-transform:uppercase;letter-spacing:1px">Typ</div><div style="font-weight:700;font-size:13px">'+typeLabel+'</div></div>'+
      '<div><div style="font-size:10px;color:var(--tx2);text-transform:uppercase;letter-spacing:1px">Zeilen</div><div style="font-weight:700;color:var(--bl);font-size:13px">'+s.parsed.rows.length+'</div></div>'+
      '<div><div style="font-size:10px;color:var(--tx2);text-transform:uppercase;letter-spacing:1px">Erkannt</div><div style="font-weight:700;color:var(--gn);font-size:13px">'+s.matches.length+' Treffer</div></div>'+
      '<div><div style="font-size:10px;color:var(--tx2);text-transform:uppercase;letter-spacing:1px">Unbekannt</div><div style="font-weight:700;color:var(--or);font-size:13px">'+s.unmatched.length+' ohne Match</div></div>'+
    '</div>';

  var matchInfo=document.getElementById('sellerMatchInfo');
  if(s.matches.length>0){
    matchInfo.style.display='block';
    matchInfo.innerHTML='✓ <b>'+s.matches.length+'</b> Zeilen werden bestehenden Produkten zugeordnet (per ASIN/SKU). Die Verkaufsdaten werden im jeweiligen Produkt gespeichert.';
  }else{
    matchInfo.style.display='block';
    matchInfo.style.background='var(--ord)';
    matchInfo.style.color='var(--or)';
    matchInfo.style.borderColor='var(--or)';
    matchInfo.innerHTML='⚠️ Keine ASIN/SKU der CSV-Zeilen passt zu deinen AMZ SellerHub-Produkten. Stelle sicher dass deine Produkte ASIN/SKU haben.';
  }

  // Preview table - show all rows with match status
  var html='<table style="width:100%;font-size:11px"><thead><tr style="position:sticky;top:0;background:var(--s2);z-index:1">';
  html+='<th style="text-align:left;padding:6px 10px">Status</th>';
  html+='<th style="text-align:left;padding:6px 10px">ASIN</th>';
  html+='<th style="text-align:left;padding:6px 10px">Produkt (in AMZ SellerHub)</th>';
  if(s.type==='business'){
    html+='<th class="nc" style="padding:6px 10px">Sessions</th>';
    html+='<th class="nc" style="padding:6px 10px">Verkäufe</th>';
    html+='<th class="nc" style="padding:6px 10px">Umsatz</th>';
    html+='<th class="nc" style="padding:6px 10px">Conv.</th>';
    html+='<th class="nc" style="padding:6px 10px">Buy Box</th>';
  }else if(s.type==='inventory'){
    html+='<th class="nc" style="padding:6px 10px">Verfügbar</th>';
    html+='<th class="nc" style="padding:6px 10px">Inbound</th>';
    html+='<th class="nc" style="padding:6px 10px">Reserviert</th>';
    html+='<th class="nc" style="padding:6px 10px">Gesamt</th>';
  }
  html+='</tr></thead><tbody>';

  // Show matched first, then unmatched, max 50
  var allEntries=s.matches.concat(s.unmatched).slice(0,50);
  allEntries.forEach(function(e){
    var statusBadge=e.product
      ?'<span style="background:var(--gnd);color:var(--gn);padding:2px 7px;border-radius:4px;font-weight:700;font-size:10px">✓ Match</span>'
      :'<span style="background:var(--ord);color:var(--or);padding:2px 7px;border-radius:4px;font-weight:700;font-size:10px">— Skip</span>';
    html+='<tr style="border-bottom:1px solid var(--bd)">';
    html+='<td style="padding:5px 10px">'+statusBadge+'</td>';
    html+='<td style="padding:5px 10px;font-family:monospace;color:var(--tx2)">'+esc(e.asin||'—')+'</td>';
    html+='<td style="padding:5px 10px">'+esc(e.product?e.product.name:'(nicht gefunden)')+'</td>';
    if(s.type==='business'){
      html+='<td class="nc" style="padding:5px 10px">'+(e.data.sessions!==undefined?Math.round(e.data.sessions).toLocaleString('de-DE'):'—')+'</td>';
      html+='<td class="nc" style="padding:5px 10px">'+(e.data.unitsOrdered!==undefined?e.data.unitsOrdered:'—')+'</td>';
      html+='<td class="nc" style="padding:5px 10px">'+(e.data.orderedRevenue!==undefined?fmt(e.data.orderedRevenue)+'€':'—')+'</td>';
      html+='<td class="nc" style="padding:5px 10px">'+(e.data.conversionRate!==undefined?e.data.conversionRate.toFixed(1)+'%':'—')+'</td>';
      html+='<td class="nc" style="padding:5px 10px">'+(e.data.buyBoxPercent!==undefined?e.data.buyBoxPercent.toFixed(0)+'%':'—')+'</td>';
    }else if(s.type==='inventory'){
      html+='<td class="nc" style="padding:5px 10px">'+(e.data.inventoryAvailable!==undefined?e.data.inventoryAvailable:'—')+'</td>';
      html+='<td class="nc" style="padding:5px 10px">'+(e.data.inventoryInbound!==undefined?e.data.inventoryInbound:'—')+'</td>';
      html+='<td class="nc" style="padding:5px 10px">'+(e.data.inventoryReserved!==undefined?e.data.inventoryReserved:'—')+'</td>';
      html+='<td class="nc" style="padding:5px 10px">'+(e.data.inventoryTotal!==undefined?e.data.inventoryTotal:'—')+'</td>';
    }
    html+='</tr>';
  });
  if(allEntries.length===50&&(s.matches.length+s.unmatched.length)>50){
    html+='<tr><td colspan="9" style="padding:10px;text-align:center;color:var(--tx3);font-style:italic">... und '+((s.matches.length+s.unmatched.length)-50)+' weitere Zeilen</td></tr>';
  }
  html+='</tbody></table>';
  document.getElementById('sellerPreviewContainer').innerHTML=html;

  document.getElementById('sellerImportBtn').textContent='📥 '+s.matches.length+' Datensätze importieren';
  document.getElementById('sellerImportBtn').disabled=s.matches.length===0;
}

function confirmSellerImport(){
  var s=sellerImportState;
  if(s.matches.length===0){toast('Keine Treffer zum Importieren');return}

  var period=document.getElementById('sellerPeriod').value.trim()||'Import vom '+new Date().toLocaleDateString('de-DE');
  var typeOverride=document.getElementById('sellerReportType').value;

  // Build sales data record per product
  s.matches.forEach(function(entry){
    var asin=entry.asin;
    if(!asin)return;
    if(!D.salesData[asin])D.salesData[asin]={current:{},history:[]};

    // Use detected type or override
    var dataType=typeOverride==='custom'?s.type:typeOverride;
    var newData=mapRowToData(entry.row,dataType);
    newData._period=period;
    newData._importedAt=new Date().toISOString();

    // Store in current (overwrites previous of same type)
    Object.keys(newData).forEach(function(k){
      D.salesData[asin].current[k]=newData[k];
    });

    // Add to history
    D.salesData[asin].history=D.salesData[asin].history||[];
    D.salesData[asin].history.unshift(newData);
    // Cap history at 24 entries per product
    if(D.salesData[asin].history.length>24)D.salesData[asin].history=D.salesData[asin].history.slice(0,24);
  });

  // Track import session
  D.sellerImports=D.sellerImports||[];
  D.sellerImports.unshift({
    fileName:s.fileName,
    type:typeOverride,
    period:period,
    matchCount:s.matches.length,
    skipCount:s.unmatched.length,
    timestamp:new Date().toISOString()
  });
  // Cap import history at 50
  if(D.sellerImports.length>50)D.sellerImports=D.sellerImports.slice(0,50);

  save();
  closeSellerModal();
  renderSellerPage();
  renderProds();
  renderDash();
  toast('✓ '+s.matches.length+' Datensätze importiert');
}

function closeSellerModal(){
  document.getElementById('sellerImportModal').classList.remove('show');
  sellerImportState={fileName:'',rawText:'',parsed:null,type:'',matches:[],unmatched:[]};
}

// Render the Seller-Daten page (history + product overview)
function renderSellerPage(){
  // Import history
  var hist=D.sellerImports||[];
  var histEl=document.getElementById('sellerImportHistory');
  if(!histEl)return;
  if(hist.length===0){
    histEl.innerHTML='<div style="padding:20px;text-align:center;color:var(--tx3);font-size:12px;background:var(--s1);border:1px dashed var(--bd);border-radius:8px">Noch keine Imports. Lade einen Report aus Seller Central oben hoch.</div>';
  }else{
    histEl.innerHTML=hist.slice(0,10).map(function(h){
      var d=new Date(h.timestamp);
      var typeIcon=h.type==='business'?'📈':h.type==='inventory'?'📦':'📊';
      return '<div style="background:var(--s1);border:1px solid var(--bd);border-radius:8px;padding:10px 14px;display:flex;align-items:center;gap:12px;font-size:12px">'+
        '<span style="font-size:18px">'+typeIcon+'</span>'+
        '<div style="flex:1;min-width:0">'+
          '<div style="font-weight:700;color:var(--tx)">'+esc(h.fileName)+'</div>'+
          '<div style="color:var(--tx2);font-size:11px">'+esc(h.period)+' · '+d.toLocaleString('de-DE')+'</div>'+
        '</div>'+
        '<div style="text-align:right">'+
          '<div style="color:var(--gn);font-weight:700">'+h.matchCount+' importiert</div>'+
          (h.skipCount>0?'<div style="color:var(--or);font-size:10px">'+h.skipCount+' übersprungen</div>':'')+
        '</div>'+
      '</div>';
    }).join('');
  }

  // Per-product overview
  var ovEl=document.getElementById('sellerProductsOverview');
  if(!ovEl)return;
  var withData=D.products.filter(function(p){return p.asin&&D.salesData[p.asin]&&D.salesData[p.asin].current});
  if(withData.length===0){
    ovEl.innerHTML='<div style="padding:20px;text-align:center;color:var(--tx3);font-size:12px;background:var(--s1);border:1px dashed var(--bd);border-radius:8px">Keine Produkte haben bisher Verkaufsdaten. Importiere einen Report.</div>';
  }else{
    ovEl.innerHTML=withData.map(function(p){
      var d=D.salesData[p.asin].current;
      var idx=D.products.indexOf(p);
      return '<div style="background:var(--s1);border:1px solid var(--bd);border-radius:8px;padding:12px 16px;cursor:pointer;display:grid;grid-template-columns:1fr repeat(5,auto);gap:18px;align-items:center;font-size:12px" onclick="openProductDetail('+idx+');setTimeout(function(){goSub(\'sales\')},100)">'+
        '<div><div style="font-weight:700;color:var(--ac)">'+esc(p.name||'(Ohne Namen)')+'</div><div style="font-size:10px;color:var(--tx3);font-family:monospace">'+esc(p.asin)+'</div></div>'+
        '<div style="text-align:center"><div style="font-size:9px;color:var(--tx2);text-transform:uppercase;letter-spacing:1px">Sessions</div><div style="font-weight:700">'+(d.sessions!==undefined?Math.round(d.sessions).toLocaleString('de-DE'):'—')+'</div></div>'+
        '<div style="text-align:center"><div style="font-size:9px;color:var(--tx2);text-transform:uppercase;letter-spacing:1px">Verkäufe</div><div style="font-weight:700;color:var(--gn)">'+(d.unitsOrdered!==undefined?d.unitsOrdered:'—')+'</div></div>'+
        '<div style="text-align:center"><div style="font-size:9px;color:var(--tx2);text-transform:uppercase;letter-spacing:1px">Umsatz</div><div style="font-weight:700;color:var(--gn)">'+(d.orderedRevenue!==undefined?fmt(d.orderedRevenue)+'€':'—')+'</div></div>'+
        '<div style="text-align:center"><div style="font-size:9px;color:var(--tx2);text-transform:uppercase;letter-spacing:1px">Conv.</div><div style="font-weight:700;color:var(--bl)">'+(d.conversionRate!==undefined?d.conversionRate.toFixed(1)+'%':'—')+'</div></div>'+
        '<div style="text-align:center"><div style="font-size:9px;color:var(--tx2);text-transform:uppercase;letter-spacing:1px">Lager</div><div style="font-weight:700;color:var(--cy)">'+(d.inventoryAvailable!==undefined?d.inventoryAvailable:'—')+'</div></div>'+
      '</div>';
    }).join('');
  }

  // Update sidebar badge
  var badge=document.getElementById('sellerBadge');
  if(badge){
    if(hist.length>0){badge.style.display='inline-block';badge.textContent=withData.length}
    else{badge.style.display='none'}
  }
}

// ─── Drag & Drop wiring ───
(function setupSellerDropZone(){
  // Run after DOM is ready
  setTimeout(function(){
    var dz=document.getElementById('sellerDropZone');
    if(!dz)return;
    dz.addEventListener('dragover',function(e){
      e.preventDefault();
      dz.style.borderColor='var(--ac)';
      dz.style.background='var(--acd)';
    });
    dz.addEventListener('dragleave',function(){
      dz.style.borderColor='var(--bd2)';
      dz.style.background='var(--s1)';
    });
    dz.addEventListener('drop',function(e){
      e.preventDefault();
      dz.style.borderColor='var(--bd2)';
      dz.style.background='var(--s1)';
      var f=e.dataTransfer.files[0];
      if(!f)return;
      var r=new FileReader();
      r.onload=function(ev){
        sellerImportState.fileName=f.name;
        sellerImportState.rawText=ev.target.result;
        parseSellerFile();
      };
      r.readAsText(f,'UTF-8');
    });
  },200);
})();

// ═══════════════════════════════════════════════════════════════
// PRODUKTRECHERCHE-FAHRPLAN (geführte Schritte, Status aus echten Daten)
// ═══════════════════════════════════════════════════════════════
function renderResearchRoadmap(){
  researchInit();
  var el=document.getElementById('dashRoadmap');
  if(!el)return;
  var ideen=D.ideen||[], cands=D.research.candidates||[], shortlist=D.research.shortlist||[];
  var dataCount=cands.filter(function(c){return c.avgReviews!=null||c.vk!=null||c.nettoMarge!=null||c.reviewMining;}).length;
  var minedCount=cands.filter(function(c){return c.reviewMining;}).length;
  var decidedCount=cands.filter(function(c){var v=decisionVerdict(c).verdict;return v==='go'||v==='nogo';}).length;

  var steps=[
    {icon:'💡',title:'Ideen sammeln',
     task:'Sammle 5–20 Produktideen – per KI-Import, Helium Black Box oder Brainstorming.',
     done:ideen.length>=1, info:ideen.length+' Idee'+(ideen.length===1?'':'n'),
     cta:'Ideen-Pool', go:"go('ideen')", cta2:'Helium-Import', go2:"go('helium')"},
    {icon:'🔬',title:'In „Validieren" schieben',
     task:'Schiebe vielversprechende Ideen im Board nach „Validieren" – daraus werden Kandidaten.',
     done:cands.length>=1, info:cands.length+' Kandidat'+(cands.length===1?'':'en'),
     cta:'Pipeline', go:"go('pipeline')"},
    {icon:'📊',title:'Daten erfassen & Reviews minen',
     task:'Trag pro Kandidat Preis/Reviews/Marge ein und analysiere Konkurrenz-Reviews (🔬 Review-Mining).',
     done:dataCount>=1, info:dataCount+' mit Daten · '+minedCount+'× gemint',
     cta:'Konkurrenz-Tabelle', go:"go('research')", cta2:'Pipeline (🔬)', go2:"go('pipeline')"},
    {icon:'⚖️',title:'Bewerten & entscheiden',
     task:'Öffne das Scorecard, prüfe Score + Ampel und triff je Kandidat GO / PRÜFEN / NO-GO.',
     done:decidedCount>=1, info:decidedCount+' entschieden',
     cta:'Scorecard', go:"go('research');researchShowTab('score')"},
    {icon:'⭐',title:'Shortlist & Muster',
     task:'GO-Kandidaten in die Engere Wahl, Muster bei 2–3 Lieferanten bestellen, dann Produktliste.',
     done:shortlist.length>=1, info:shortlist.length+' in Engerer Wahl',
     cta:'Pipeline', go:"go('pipeline')"}
  ];

  var doneN=0; steps.forEach(function(s){if(s.done)doneN++;});
  var current=steps.length; for(var j=0;j<steps.length;j++){if(!steps[j].done){current=j;break;}}
  var allDone=current===steps.length;
  var pct=Math.round(doneN/steps.length*100);

  // Einklappbar: Fortgeschrittene (≥3 Stufen begonnen) sehen standardmäßig nur die Slim-Leiste
  var collPref=null;try{collPref=localStorage.getItem('wika_roadmap_collapsed');}catch(e){}
  var collapsed=collPref===null?(doneN>=3):collPref==='1';
  if(collapsed){
    el.innerHTML='<div style="background:var(--s1);border:1px solid var(--bd);border-radius:12px;padding:10px 16px;display:flex;align-items:center;gap:14px;flex-wrap:wrap">'+
      '<span style="font-size:12.5px;font-weight:700;color:var(--tx)">🎯 Recherche-Fahrplan</span>'+
      '<div style="flex:1;min-width:120px;height:6px;background:var(--s2);border-radius:4px;overflow:hidden"><div style="height:100%;width:'+pct+'%;background:var(--ac)"></div></div>'+
      '<span style="font-size:11px;color:var(--tx2);font-weight:600">'+doneN+' / '+steps.length+' Stufen</span>'+
      '<button class="btn btn-sm" onclick="roadmapToggle(false)" style="font-size:10.5px">Aufklappen ▾</button>'+
    '</div>';
    return;
  }

  var html='<div style="background:linear-gradient(135deg,var(--acd),var(--s1));border:1.5px solid var(--ac);border-radius:14px;padding:20px 22px">';
  html+='<div style="display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:2px">'+
    '<div style="font-family:\'Playfair Display\',serif;font-size:20px;font-weight:700;color:var(--tx)">🎯 So funktioniert Produktrecherche</div>'+
    '<div style="display:flex;align-items:center;gap:10px"><span style="font-size:12px;color:var(--tx2);font-weight:700">'+(allDone?'Alle 5 Stufen aktiv 🎉':doneN+' / '+steps.length+' Stufen begonnen')+'</span>'+
    '<button class="btn btn-sm" onclick="roadmapToggle(true)" style="font-size:10.5px" title="Zur schlanken Leiste einklappen">Einklappen ▴</button></div>'+
  '</div>';
  html+='<div style="font-size:11.5px;color:var(--tx2);margin-bottom:10px;line-height:1.45">Die <b>5-Stufen-Methode</b> – du recherchierst <b>beliebig viele Produkte gleichzeitig</b>. Jedes ist eine eigene gespeicherte Recherche und wandert eigenständig durch die <button onclick="go(\'pipeline\')" style="background:none;border:none;color:var(--ac);font-weight:700;cursor:pointer;padding:0;font-size:11.5px">Pipeline →</button>. Du musst nichts „abschließen", um Neues zu starten.</div>';
  html+='<div style="height:8px;background:var(--s2);border-radius:5px;overflow:hidden;margin-bottom:8px"><div style="height:100%;width:'+pct+'%;background:var(--ac);transition:width .3s"></div></div>';
  if(!allDone){
    html+='<div style="font-size:12.5px;color:var(--tx);margin-bottom:16px">👉 <b>Noch nicht begonnen:</b> '+esc(steps[current].title)+' <button class="btn btn-p btn-sm" onclick="'+steps[current].go+'" style="margin-left:6px">Starten →</button></div>';
  }else{
    html+='<div style="font-size:12.5px;color:var(--tx);margin-bottom:16px">🎉 Du nutzt alle 5 Stufen. Weiter geht\'s in der <button class="btn btn-p btn-sm" onclick="go(\'pipeline\')" style="margin-left:4px">Pipeline →</button></div>';
  }
  // Flag-Summary: Kandidaten mit hartem Red Flag (GO blockiert) auf einen Blick
  var hardCands=cands.filter(function(c){var st=normalizeStatus(c.status);return st!=='abgelehnt'&&decisionVerdict(c).hard>0;});
  if(hardCands.length){
    var hardNames=hardCands.slice(0,3).map(function(c){return esc((c.name||'').substring(0,32));}).join(', ')+(hardCands.length>3?' u. a.':'');
    html+='<div style="background:var(--rdd);border:1px solid var(--rd);border-radius:9px;padding:8px 12px;font-size:12px;color:var(--rd);font-weight:600;margin:-6px 0 14px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">'+
      '<span>🚩 '+hardCands.length+' Kandidat'+(hardCands.length===1?'':'en')+' mit hartem Red Flag (GO blockiert): '+hardNames+'</span>'+
      '<button onclick="go(\'pipeline\')" style="background:none;border:none;color:var(--rd);font-weight:700;cursor:pointer;padding:0;font-size:12px;text-decoration:underline">Pipeline →</button>'+
    '</div>';
  }
  html+='<div style="display:flex;flex-direction:column;gap:8px">';
  steps.forEach(function(s,idx){
    var state=s.done?'done':(idx===current?'active':'locked');
    var circleBg=state==='done'?'var(--gn)':state==='active'?'var(--ac)':'var(--s3)';
    var circleTx=state==='locked'?'var(--tx3)':'#fff';
    var circleC=state==='done'?'✓':(idx+1);
    var border=state==='active'?'1.5px solid var(--ac)':'1px solid var(--bd)';
    var bg=state==='active'?'var(--s1)':'var(--s2)';
    var statusTxt=state==='done'?'<span style="color:var(--gn);font-weight:700">✅ erledigt</span> · '+esc(s.info):state==='active'?'<span style="color:var(--ac);font-weight:700">▶ jetzt dran</span> · '+esc(s.info):'<span style="color:var(--tx3)">🔒 als nächstes</span>';
    var op=state==='locked'?'opacity:.62':'';
    html+='<div style="display:flex;gap:12px;align-items:flex-start;padding:11px 14px;background:'+bg+';border:'+border+';border-radius:10px;'+op+'">'+
      '<div style="flex-shrink:0;width:26px;height:26px;border-radius:50%;background:'+circleBg+';color:'+circleTx+';display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px">'+circleC+'</div>'+
      '<div style="flex:1;min-width:0">'+
        '<div style="font-weight:700;color:var(--tx);font-size:13.5px">'+s.icon+' '+esc(s.title)+'</div>'+
        '<div style="font-size:11.5px;color:var(--tx2);margin:3px 0;line-height:1.45">'+esc(s.task)+'</div>'+
        '<div style="font-size:11px">'+statusTxt+'</div>'+
      '</div>'+
      '<div style="flex-shrink:0;display:flex;flex-direction:column;gap:5px;align-items:flex-end">'+
        (state==='locked'
          ? '<button class="btn btn-sm" disabled style="font-size:10.5px;opacity:.5;cursor:not-allowed" title="Erst Schritt '+idx+' abschließen">🔒</button>'
          : '<button class="btn btn-sm'+(state==='active'?' btn-p':'')+'" onclick="'+s.go+'" style="font-size:10.5px;white-space:nowrap">'+esc(s.cta)+' →</button>'+((s.cta2)?'<button class="btn btn-sm" onclick="'+s.go2+'" style="font-size:10px;white-space:nowrap">'+esc(s.cta2)+'</button>':''))+
      '</div>'+
    '</div>';
  });
  html+='</div></div>';
  el.innerHTML=html;
}

// Top-Kandidaten nach Entscheidungs-Score (Dashboard-Widget)
function renderDashTopCands(){
  researchInit();
  var el=document.getElementById('dashTopCands');if(!el)return;
  var cands=(D.research.candidates||[]).slice();
  if(!cands.length){el.innerHTML='<div style="padding:26px;text-align:center;color:var(--tx2);font-size:13px"><div style="font-size:32px;margin-bottom:8px;opacity:.6">🌱</div>Noch keine Kandidaten.<br><a onclick="go(\'pipeline\')" style="color:var(--ac);cursor:pointer">Starte in der Pipeline →</a></div>';return;}
  var ranked=cands.map(function(c){return {c:c,vd:decisionVerdict(c)};}).sort(function(a,b){return b.vd.score-a.vd.score;}).slice(0,6);
  var h='<div style="display:flex;flex-direction:column;gap:7px">';
  ranked.forEach(function(it){
    var c=it.c,vd=it.vd;
    var emoji=vd.verdict==='go'?'🟢':vd.verdict==='nogo'?'🔴':vd.verdict==='pruefen'?'🟡':'⚪';
    var chips=(vd.flags&&vd.flags.length)?'<div style="margin-top:4px">'+pipeFlagChips(vd.flags).replace(';margin-bottom:8px','')+'</div>':'';
    h+='<div onclick="go(\'research\');researchOpenScore(\''+c.id+'\')" style="display:flex;align-items:flex-start;gap:10px;padding:8px 11px;background:var(--s2);border:1px solid var(--bd);border-radius:8px;cursor:pointer" onmouseover="this.style.borderColor=\'var(--ac)\'" onmouseout="this.style.borderColor=\'var(--bd)\'">'+
      '<div style="font-weight:800;color:var(--'+vd.color+');font-size:18px;min-width:30px;text-align:center">'+(vd.score>0?vd.score:'—')+'</div>'+
      '<div style="flex:1;min-width:0"><div style="font-weight:600;color:var(--tx);font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(c.name)+'</div><div style="font-size:10.5px;color:var(--tx2)">'+(c.kategorie?esc(c.kategorie)+' · ':'')+emoji+' '+vd.label+'</div>'+chips+'</div>'+
    '</div>';
  });
  h+='</div>';
  el.innerHTML=h;
}

// Neue Produktsuche vom Dashboard starten (legt einen Recherche-Kandidaten an)
function startNewProductSearch(){
  if(typeof researchAddCandidate==='function')researchAddCandidate();
  renderDash();
}
// Liste „Deine Produktsuchen": je Produkt eine eigene 5-Schritte-Fortschrittsanzeige
function renderDashSearches(){
  researchInit();
  var el=document.getElementById('dashSearches');if(!el)return;
  var cands=(D.research.candidates||[]).filter(function(c){return normalizeStatus(c.status)!=='abgelehnt';});
  var shortIds={};(D.research.shortlist||[]).forEach(function(s){if(s.sourceCandidateId)shortIds[s.sourceCandidateId]=true;});
  var stepDefs=['Angelegt','Daten + Nische','Review-Mining','Bewertet','Entscheidung'];
  function stepsDone(c){
    return [true,
      (c.avgReviews!=null||c.vk!=null||c.top10Umsatz!=null||!!c.nischenScan),
      !!c.reviewMining,
      decisionVerdict(c).verdict!=='offen',
      (!!shortIds[c.id]||normalizeStatus(c.status)==='muster')
    ];
  }
  var html='<div style="background:var(--s1);border:1px solid var(--bd2);border-radius:12px;padding:18px 20px">';
  html+='<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:'+(cands.length?'14px':'8px')+'">'+
    '<h3 style="margin:0">🔎 Deine Produktsuchen <span style="font-size:12px;color:var(--tx3);font-weight:400">('+cands.length+' aktiv, parallel)</span></h3>'+
    '<button class="btn btn-p btn-sm" onclick="startNewProductSearch()">➕ Neue Produktsuche</button>'+
  '</div>';
  if(!cands.length){
    html+='<div style="font-size:12.5px;color:var(--tx2)">Noch keine. Starte beliebig viele parallel – jede durchläuft dieselben 5 Schritte. Oder importiere mehrere auf einmal über <button onclick="go(\'helium\')" style="background:none;border:none;color:var(--ac);font-weight:700;cursor:pointer;padding:0;font-size:12.5px">📥 Helium-Import →</button></div>';
  }else{
    html+='<div style="display:flex;flex-direction:column;gap:8px">';
    cands.slice(0,12).forEach(function(c){
      var done=stepsDone(c);var vd=decisionVerdict(c);
      var emoji=vd.verdict==='go'?'🟢':vd.verdict==='nogo'?'🔴':vd.verdict==='pruefen'?'🟡':'⚪';
      var dots='';
      done.forEach(function(ok,i){
        dots+='<span title="'+stepDefs[i]+(ok?' ✓':' – offen')+'" style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;font-size:10px;font-weight:800;background:'+(ok?'var(--gn)':'var(--s3)')+';color:'+(ok?'#fff':'var(--tx3)')+'">'+(ok?'✓':(i+1))+'</span>';
        if(i<done.length-1)dots+='<span style="color:var(--bd2);font-size:9px;margin:0 1px">—</span>';
      });
      html+='<div onclick="go(\'research\');researchOpenScore(\''+c.id+'\')" style="display:flex;align-items:center;gap:12px;padding:10px 12px;background:var(--s2);border:1px solid var(--bd);border-radius:9px;cursor:pointer" onmouseover="this.style.borderColor=\'var(--ac)\'" onmouseout="this.style.borderColor=\'var(--bd)\'">'+
        '<div style="flex:1;min-width:0"><div style="font-weight:600;color:var(--tx);font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(c.name)+'</div><div style="display:flex;align-items:center;margin-top:6px">'+dots+'</div></div>'+
        '<div style="text-align:right;white-space:nowrap"><div style="font-weight:800;color:var(--'+vd.color+');font-size:16px;line-height:1">'+(vd.score>0?vd.score:'—')+'</div><div style="font-size:10px;color:var(--'+vd.color+');font-weight:700;margin-top:2px">'+emoji+' '+vd.label+'</div></div>'+
      '</div>';
    });
    html+='</div>';
    html+='<div style="margin-top:10px;font-size:10.5px;color:var(--tx3)">Schritte: 1 Angelegt · 2 Daten+Nische · 3 Review-Mining · 4 Bewertet · 5 Entscheidung — klick auf eine Suche öffnet ihr Scorecard.</div>';
  }
  html+='</div>';
  el.innerHTML=html;
}

// ═══ TOOL-HUB (Dashboard): alle Module als Kachel-Gruppen — nichts bleibt versteckt ═══
var DASH_HUB=[
  {title:'🔎 Produktforschung',tiles:[
    {icon:'🗂️',t:'Recherche-Pipeline',d:'Idee → Validieren → Shortlist → Entscheidung',act:"go('pipeline')"},
    {icon:'⚡',t:'Xray-Paste',d:'Helium-Xray einfügen → Nische sofort bewertet',act:"if(typeof xrayPasteOpen==='function')xrayPasteOpen()"},
    {icon:'📥',t:'Daten holen',d:'Helium-10-Import (Black Box, Xray, Cerebro)',act:"go('helium')"},
    {icon:'🧭',t:'Nischen vergleichen',d:'Mehrere Nischen objektiv ranken',act:"go('nischen')"},
    {icon:'💶',t:'Marge rechnen',d:'FBA-Profit, ROI & BSR-Schätzer',act:"go('gebuehren')"},
    {icon:'⚖️',t:'Scorecard',d:'6 Dimensionen, Ampel-Urteil, Red Flags',act:"go('research');if(typeof researchShowTab==='function')researchShowTab('score')"}
  ]},
  {title:'📝 Listings & Content',tiles:[
    {icon:'✨',t:'KI-Bildstudio',d:'Produktfoto → Hauptbild, USPs, Lifestyle',act:"go('inhalt')"},
    {icon:'📝',t:'Listing-Editor',d:'Titel, Bullets & Beschreibung mit KI',act:"go('listing')"},
    {icon:'🔑',t:'Keyword-Center',d:'Tracking, Backend-Reiniger, Abdeckung',act:"go('keywords')"}
  ]},
  {title:'🛠️ Betrieb & Gewinne',tiles:[
    {icon:'📋',t:'Produktliste',d:'Deine aktiven Produkte & Kalkulationen',act:"go('produkte')"},
    {icon:'🚀',t:'Launch-Planer',d:'Schritt für Schritt zum Livegang',act:"go('launch')"},
    {icon:'📦',t:'Lagerbestand',d:'Bestände & Reichweiten im Blick',act:"go('lager')"},
    {icon:'✅',t:'Aufgaben-Board',d:'Was heute zu tun ist',act:"go('tasks')"}
  ]},
  {title:'📡 Markt & Wissen',tiles:[
    {icon:'📰',t:'News & Events',d:'Der komplette Seller-Radar als Bereich',act:"go('news')",neu:true},
    {icon:'🎓',t:'Lernzentrum',d:'FBA-Coaching in Lektionen',act:"go('coaching')"},
    {icon:'☁️',t:'Cloud-Konto',d:'Sync, Passwort, Geräte',act:"if(typeof syBtnClick==='function')syBtnClick()"},
    {icon:'🛡️',t:'Benutzerverwaltung',d:'Cloud-Konten des Servers verwalten',act:"go('admin')",adminOnly:true}
  ]}
];
function renderDashHub(){
  var el=document.getElementById('dashHub');
  if(!el)return;
  var u=(window.WikaAuth&&WikaAuth.currentUser&&WikaAuth.currentUser())||null;
  var isAdmin=!!(u&&u.role==='admin');
  var h='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:16px;margin-bottom:22px">';
  DASH_HUB.forEach(function(g){
    var tiles=g.tiles.filter(function(t){return !t.adminOnly||isAdmin;});
    if(!tiles.length)return;
    h+='<div class="card" style="padding:16px 16px 12px">';
    h+='<div style="font-weight:800;font-size:14px;color:var(--tx);margin-bottom:10px">'+g.title+'</div>';
    h+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">';
    tiles.forEach(function(t){
      h+='<button onclick="'+t.act.replace(/"/g,'&quot;')+'" style="display:flex;align-items:center;gap:10px;text-align:left;background:var(--s2);border:1px solid var(--bd);border-radius:10px;padding:10px 12px;cursor:pointer;font-family:inherit;transition:all .15s" onmouseover="this.style.borderColor=\'var(--ac)\';this.style.transform=\'translateY(-1px)\'" onmouseout="this.style.borderColor=\'var(--bd)\';this.style.transform=\'none\'">'+
        '<span style="flex-shrink:0;width:34px;height:34px;border-radius:9px;background:var(--acd);display:flex;align-items:center;justify-content:center;font-size:17px">'+t.icon+'</span>'+
        '<span style="flex:1;min-width:0"><span style="display:block;font-weight:700;font-size:12px;color:var(--tx)">'+t.t+(t.neu?' <span style="background:var(--ac);color:#fff;border-radius:8px;padding:0 6px;font-size:8.5px;font-weight:800;vertical-align:1px">NEU</span>':'')+'</span>'+
        '<span style="display:block;font-size:10.5px;color:var(--tx2);line-height:1.35">'+t.d+'</span></span>'+
        '<span style="color:var(--tx3);font-size:13px">›</span>'+
      '</button>';
    });
    h+='</div></div>';
  });
  h+='</div>';
  el.innerHTML=h;
}

// ═══ NEWS & EVENTS — Seller-Radar als kuratierter Bereich (p-news) ═══
// Je Item merkbar: ⭐ Favorit (oben gepinnt) · ✓ gelesen (gedimmt) · ✕ ausgeblendet.
// Status liegt in wika_news_state (in der Sync-Positivliste → geräteübergreifend).
var NEWS_PAGE_SIZE=10;           // 10 je Seite, mehr → Blätterung 1·2·3·Weiter
var newsPageNum=1;
var newsFilterMode='alle';       // alle | fav | neu
function newsState(){try{return JSON.parse(localStorage.getItem('wika_news_state')||'{}')||{};}catch(e){return {};}}
function newsSetState(s){
  try{localStorage.setItem('wika_news_state',JSON.stringify(s));}catch(e){}
  if(typeof syQueue==='function')try{syQueue('wika_news_state');}catch(e){}
}
function newsAct(id,action){
  var s=newsState();var e=s[id]||{};
  if(action==='fav')e.fav=!e.fav;
  if(action==='read')e.read=!e.read;
  if(action==='del'){e.del=true;toast('Ausgeblendet — unten wiederherstellbar');}
  s[id]=e;newsSetState(s);
  renderNewsPage(false,true); // aus dem Cache neu malen (kein API-Call)
}
function newsResetDeleted(){
  var s=newsState();Object.keys(s).forEach(function(k){delete s[k].del;});
  newsSetState(s);renderNewsPage(false,true);toast('Ausgeblendete Einträge wiederhergestellt');
}
function newsSetFilter(m){newsFilterMode=m;newsPageNum=1;renderNewsPage(false,true);}
function newsSetPage(p){
  newsPageNum=p;renderNewsPage(false,true);
  var el=document.getElementById('newsBody');if(el)el.scrollIntoView({behavior:'smooth',block:'start'});
}
window.newsAct=newsAct;window.newsResetDeleted=newsResetDeleted;window.newsSetFilter=newsSetFilter;window.newsSetPage=newsSetPage;

// Events: nur Amazon-/FBA-relevant (Titel-Match), nur Zukunft, nur aktuelles Jahr.
// Viele Event-Meldungen haben KEIN extrahierbares Start-Datum → dann gelten sie als
// frische Ankündigung (max. 21 Tage alt, laufendes Jahr) mit Hinweis „Termin s. Artikel".
var EVENT_RELEVANT=/amazon|fba|seller|marktplatz|marketplace|e-?commerce|onlineh(a|ä)ndler|händler|prime|ppc/i;
function newsEventVisible(ev){
  var now=new Date();
  if(ev.event_start){
    var d=new Date(ev.event_start);
    if(isNaN(d.getTime()))return false;
    if(d.getTime()<now.getTime()-864e5)return false;            // verstrichen (1 Tag Kulanz)
    if(d.getFullYear()!==now.getFullYear())return false;         // nur aktuelles Jahr
  }else{
    var p=new Date(ev.publish_date);
    if(isNaN(p.getTime())||p.getFullYear()!==now.getFullYear())return false;
    if(now.getTime()-p.getTime()>21*864e5)return false;          // alte Ankündigung = wahrscheinlich vorbei
  }
  return EVENT_RELEVANT.test(ev.title||'');
}

function renderNewsPage(force,fromCache){
  var el=document.getElementById('newsBody');
  if(!el)return;
  var stand=document.getElementById('newsStand');
  var cached=null;try{cached=JSON.parse(localStorage.getItem('wika_news_cache')||'null');}catch(e){}
  if(cached&&(fromCache||!force))newsPageHtml(cached);
  if(fromCache&&cached)return; // reine UI-Aktion: kein Netz nötig
  var api=radarApi();
  var prof=radarProfileParams();
  Promise.all([
    fetch(api+'/api/news'+(prof?prof+'&':'?')+'limit=60').then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();}),
    fetch(api+'/api/events').then(function(r){return r.ok?r.json():{items:[]};}).catch(function(){return {items:[]};}),
    fetch(api+'/api/forecast').then(function(r){return r.ok?r.json():null;}).catch(function(){return null;})
  ]).then(function(res){
    var d={news:res[0].items||[],events:res[1].items||[],fc:res[2],at:new Date().toISOString()};
    try{localStorage.setItem('wika_news_cache',JSON.stringify(d));}catch(e){}
    newsPageHtml(d);
  }).catch(function(e){
    if(!cached)el.innerHTML='<div style="background:var(--rdd);border:1px solid var(--rd);border-radius:12px;padding:16px 20px;color:var(--rd);font-size:13px;font-weight:600">📡 Radar-API nicht erreichbar ('+esc(e&&e.message||'Netzwerk')+') — später erneut versuchen.</div>';
    if(stand)stand.textContent='API nicht erreichbar';
  });

  // ── kleine Bausteine ──
  function actBtns(id,st){
    function ab(label,title,on,action){
      return '<button onclick="event.stopPropagation();newsAct(\''+id+'\',\''+action+'\')" title="'+title+'" style="border:1px solid '+(on?'var(--ac)':'var(--bd)')+';background:'+(on?'var(--acd)':'var(--s1)')+';color:'+(on?'var(--ac)':'var(--tx3)')+';border-radius:8px;padding:3px 9px;font-size:12px;cursor:pointer;font-family:inherit;line-height:1.4">'+label+'</button>';
    }
    return '<div style="display:flex;gap:5px;flex-shrink:0">'+
      ab(st.fav?'⭐':'☆',st.fav?'Favorit entfernen':'Favorisieren (wird oben gepinnt)',st.fav,'fav')+
      ab('✓',st.read?'Als ungelesen markieren':'Als gelesen markieren',st.read,'read')+
      ab('✕','Ausblenden',false,'del')+
    '</div>';
  }
  function sortWithState(items,s){
    // Ausgeblendete raus, Rest streng NACH DATUM (neueste zuerst) — vorhersehbare Ordnung
    return items.filter(function(x){return !(s[x.id]&&s[x.id].del);})
      .sort(function(a,b){return new Date(b.publish_date).getTime()-new Date(a.publish_date).getTime();});
  }

  function newsPageHtml(d){
    var s=newsState();
    var newsAll=sortWithState(d.news,s);
    var hiddenCount=d.news.length-newsAll.length;
    if(newsFilterMode==='fav')newsAll=newsAll.filter(function(n){return s[n.id]&&s[n.id].fav;});
    if(newsFilterMode==='neu')newsAll=newsAll.filter(function(n){return !(s[n.id]&&s[n.id].read);});
    // Blätterung: 10 je Seite, streng nach Datum
    var totalPages=Math.max(1,Math.ceil(newsAll.length/NEWS_PAGE_SIZE));
    if(newsPageNum>totalPages)newsPageNum=totalPages;
    var news=newsAll.slice((newsPageNum-1)*NEWS_PAGE_SIZE,newsPageNum*NEWS_PAGE_SIZE);
    var events=sortWithState(d.events.filter(newsEventVisible),s);
    var unread=d.news.filter(function(n){return !(s[n.id]&&(s[n.id].read||s[n.id].del));}).length;
    if(stand)stand.textContent='Stand: '+(d.at?radarRelTime(d.at):'—');

    var h='';
    // ── Kopfband: Kennzahlen + Filter (Premium-Anmutung) ──
    h+='<div style="background:linear-gradient(135deg,#182238,#0f1729);border-radius:16px;padding:20px 24px;margin-bottom:18px;display:flex;align-items:center;gap:22px;flex-wrap:wrap">'+
      '<div style="flex:1;min-width:220px"><div style="font-family:\'Playfair Display\',serif;font-size:19px;font-weight:700;color:#fff">Marktüberblick <span style="font-size:12px;color:#fbb040;font-weight:600;letter-spacing:.5px">AMAZON &amp; E-COMMERCE · DACH</span></div>'+
      '<div style="font-size:12px;color:#aeb8d0;margin-top:3px">Aktuelle Branchen-Nachrichten und FBA-Termine — täglich aktualisiert, chronologisch sortiert.</div></div>'+
      '<div style="display:flex;gap:18px;flex-wrap:wrap">'+
        '<div style="text-align:center"><div style="font-size:22px;font-weight:800;color:#fff">'+unread+'</div><div style="font-size:10px;color:#aeb8d0;text-transform:uppercase;letter-spacing:.8px">Ungelesen</div></div>'+
        '<div style="text-align:center"><div style="font-size:22px;font-weight:800;color:#fbb040">'+Object.keys(s).filter(function(k){return s[k].fav&&!s[k].del;}).length+'</div><div style="font-size:10px;color:#aeb8d0;text-transform:uppercase;letter-spacing:.8px">Favoriten</div></div>'+
        '<div style="text-align:center"><div style="font-size:22px;font-weight:800;color:#fff">'+events.length+'</div><div style="font-size:10px;color:#aeb8d0;text-transform:uppercase;letter-spacing:.8px">Events '+new Date().getFullYear()+'</div></div>'+
      '</div></div>';
    // Filter-Leiste
    function fbtn(mode,label){var on=newsFilterMode===mode;return '<button onclick="newsSetFilter(\''+mode+'\')" style="border:1.5px solid '+(on?'var(--ac)':'var(--bd)')+';background:'+(on?'var(--acd)':'var(--s1)')+';color:'+(on?'var(--ac)':'var(--tx2)')+';font-weight:700;border-radius:10px;padding:7px 16px;font-size:12.5px;cursor:pointer;font-family:inherit">'+label+'</button>';}
    h+='<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;align-items:center">'+fbtn('alle','Alle')+fbtn('neu','● Ungelesen')+fbtn('fav','⭐ Favoriten')+
      (hiddenCount>0?'<button onclick="newsResetDeleted()" style="margin-left:auto;border:none;background:none;color:var(--tx3);font-size:11.5px;cursor:pointer;font-family:inherit;text-decoration:underline">'+hiddenCount+' ausgeblendete wiederherstellen</button>':'')+'</div>';

    h+='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:18px;align-items:start"><div style="grid-column:1/-1;display:grid;grid-template-columns:minmax(0,1.65fr) minmax(300px,1fr);gap:18px;align-items:start" class="news-grid">';

    // ── News-Liste (max 12, Karten mit Dringlichkeits-Akzent) ──
    h+='<div style="min-width:0">';
    if(news.length){
      news.forEach(function(n){
        var st=s[n.id]||{};
        var cat=n.ai_category&&RADAR_CAT[n.ai_category]?RADAR_CAT[n.ai_category]:null;
        var score=n.ai_score!=null?n.ai_score:n.relevance_score;
        var sum=(n.ai_summary&&n.ai_summary.length)?n.ai_summary:[];
        var accent=n.ai_urgency==='hoch'?'var(--rd)':st.fav?'var(--ac)':'var(--bd2)';
        h+='<div style="background:var(--s1);border:1px solid var(--bd);border-left:3px solid '+accent+';border-radius:12px;padding:14px 16px;margin-bottom:10px;transition:box-shadow .15s'+(st.read?';opacity:.55':'')+'" onmouseover="this.style.boxShadow=\'0 6px 20px rgba(15,23,41,.08)\'" onmouseout="this.style.boxShadow=\'none\'">'+
          '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:6px">'+
            '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;font-size:10.5px">'+
              (st.fav?'<span style="color:var(--ac);font-weight:800">⭐</span>':'')+
              (cat?'<span style="background:var(--'+cat[0]+(cat[0]==='tx3'?'':'d')+');color:var(--'+cat[0]+');border-radius:7px;padding:2px 8px;font-weight:700">'+cat[1]+'</span>':'')+
              (n.ai_urgency==='hoch'?'<span style="background:var(--rdd);color:var(--rd);border-radius:7px;padding:2px 8px;font-weight:700">⚠️ dringend</span>':'')+
              '<span style="color:var(--tx3)">'+esc(n.source)+' · '+radarRelTime(n.publish_date)+' · '+(n.ai_score!=null?'🤖':'🔥')+' '+score+'</span>'+
            '</div>'+actBtns(n.id,st)+
          '</div>'+
          '<a href="'+esc(n.url)+'" target="_blank" rel="noopener" style="text-decoration:none"><div style="font-size:14px;font-weight:700;color:var(--tx);line-height:1.45">'+esc(n.title)+'</div></a>'+
          (sum.length?'<div style="font-size:12px;color:var(--tx2);margin-top:5px;line-height:1.55">'+sum.slice(0,2).map(function(x){return '→ '+esc(x);}).join('<br>')+'</div>':'')+
        '</div>';
      });
      // ── Blätterung: « 1 2 3 Weiter » ──
      if(totalPages>1){
        function pbtn(label,page,on,dis){
          if(dis)return '<span style="padding:7px 13px;color:var(--tx3);font-size:12.5px">'+label+'</span>';
          return '<button onclick="newsSetPage('+page+')" style="border:1.5px solid '+(on?'var(--ac)':'var(--bd)')+';background:'+(on?'var(--ac)':'var(--s1)')+';color:'+(on?'#fff':'var(--tx2)')+';font-weight:700;border-radius:9px;padding:7px 13px;font-size:12.5px;cursor:pointer;font-family:inherit;min-width:38px">'+label+'</button>';
        }
        h+='<div style="display:flex;gap:6px;justify-content:center;align-items:center;margin-top:14px;flex-wrap:wrap">';
        h+=pbtn('‹ Zurück',newsPageNum-1,false,newsPageNum===1);
        for(var pi=1;pi<=totalPages;pi++)h+=pbtn(pi,pi,pi===newsPageNum,false);
        h+=pbtn('Weiter ›',newsPageNum+1,false,newsPageNum===totalPages);
        h+='</div>';
      }
      h+='<div style="font-size:11px;color:var(--tx3);padding:8px 2px;text-align:center">Seite '+newsPageNum+' von '+totalPages+' · '+newsAll.length+' Meldungen'+(newsFilterMode!=='alle'?' (Filter aktiv)':'')+' · neueste zuerst</div>';
    }else{
      h+='<div style="background:var(--s1);border:1px dashed var(--bd2);border-radius:14px;padding:36px 20px;text-align:center;color:var(--tx3)"><div style="font-size:34px;margin-bottom:8px">'+(newsFilterMode==='fav'?'⭐':'📰')+'</div><div style="font-size:13px;font-weight:600;color:var(--tx2)">'+(newsFilterMode==='fav'?'Noch keine Favoriten — markiere Meldungen mit ☆':newsFilterMode==='neu'?'Alles gelesen — stark! 💪':'Noch keine Meldungen — der Crawler läuft 2× täglich.')+'</div></div>';
    }
    h+='</div>';

    // ── Rechte Spalte: Events + Prognose ──
    h+='<div style="min-width:0">';
    h+='<div class="card" style="margin-bottom:18px;border-top:3px solid var(--ac)"><h3 style="margin-bottom:4px">📅 FBA-Events '+new Date().getFullYear()+'</h3><div style="font-size:11px;color:var(--tx3);margin-bottom:10px">Nur kommende, Amazon-relevante Termine — Vergangenes wird automatisch entfernt.</div>';
    if(events.length){
      events.forEach(function(ev){
        var st=s[ev.id]||{};
        var hasStart=!!ev.event_start;
        var d2=new Date(hasStart?ev.event_start:ev.publish_date);
        var tage=Math.ceil((d2.getTime()-Date.now())/864e5);
        var when=hasStart?(tage<=0?'heute':tage===1?'morgen':'in '+tage+' Tagen'):'🗓 Termin s. Artikel';
        h+='<div style="display:flex;gap:12px;padding:11px 0;border-bottom:1px solid var(--bd)'+(st.read?';opacity:.55':'')+'">'+
          '<div style="flex-shrink:0;width:46px;text-align:center;background:'+(hasStart?'var(--acd)':'var(--s2)')+';border-radius:10px;padding:6px 2px"><div style="font-size:16px;font-weight:800;color:'+(hasStart?'var(--ac)':'var(--tx3)')+';line-height:1.1">'+d2.getDate()+'</div><div style="font-size:9px;font-weight:700;color:'+(hasStart?'var(--ac)':'var(--tx3)')+';text-transform:uppercase">'+d2.toLocaleDateString('de-DE',{month:'short'}).replace('.','')+'</div></div>'+
          '<div style="flex:1;min-width:0">'+
            '<a href="'+esc(ev.url)+'" target="_blank" rel="noopener" style="text-decoration:none"><div style="font-size:12.5px;font-weight:700;color:var(--tx);line-height:1.4">'+(st.fav?'⭐ ':'')+esc(ev.title)+'</div></a>'+
            '<div style="font-size:10.5px;color:var(--tx3);margin-top:2px">'+when+' · '+esc(ev.source)+'</div>'+
            '<div style="margin-top:5px">'+actBtns(ev.id,st)+'</div>'+
          '</div></div>';
      });
    }else h+='<div style="font-size:12px;color:var(--tx3);padding:8px 0">Kein kommendes FBA-Event im Radar — neue Termine erscheinen hier automatisch.</div>';
    h+='</div>';
    if(d.fc&&d.fc.items&&d.fc.items.length){
      var FC_DIR={steigend:['gn','↗ steigend'],fallend:['rd','↘ fallend'],stabil:['tx3','→ stabil']};
      h+='<div class="card" style="border-top:3px solid var(--pu)"><h3 style="margin-bottom:10px">📈 Trend-Prognose · 7 Tage</h3>';
      d.fc.items.forEach(function(f){
        var dir=FC_DIR[f.direction]||FC_DIR.stabil;
        h+='<div style="padding:7px 0;border-bottom:1px solid var(--bd)" title="'+esc(f.reasoning||'')+'">'+
          '<span style="font-size:12.5px;font-weight:700;color:var(--tx)">'+esc(f.topic_name)+'</span> '+
          '<span style="color:var(--'+dir[0]+');font-size:11px;font-weight:700">'+dir[1]+'</span>'+
          '<span style="color:var(--tx3);font-size:10.5px"> · Konfidenz '+(f.confidence!=null?f.confidence:'–')+' %</span></div>';
      });
      h+='<div style="font-size:10.5px;color:var(--tx3);margin-top:8px">Deterministische Holt-Prognose — Konfidenz steigt mit jedem gesammelten Tag.</div></div>';
    }
    h+='</div></div></div>';
    el.innerHTML=h;
  }
}
window.renderNewsPage=renderNewsPage;

// ═══ „WAS IST NEU?" — Modul-Updates sichtbar machen (ausblendbar, Stand je Version) ═══
// Dismiss-Key nutzt das wika_info_dismissed_-Präfix → wird über Geräte gesynct.
var WHATSNEW_KEY='wika_info_dismissed_wn20260706';
var WHATSNEW=[
  {icon:'☁️',title:'Cloud-Konto & Login',desc:'Anmeldung läuft jetzt über dein Cloud-Konto (E-Mail). Passwort ändern & Sync: Wolke oben links.',cta:'Konto öffnen',act:"if(typeof syBtnClick==='function')syBtnClick()"},
  {icon:'📈',title:'Trend-Prognose & Briefing',desc:'Der Radar liefert ein Tages-Briefing, Markt-Trends und eine 7-Tage-Prognose — direkt hier im Dashboard.',cta:'Zum Radar',act:"var r=document.getElementById('dashRadar');if(r)r.scrollIntoView({behavior:'smooth'})"},
  {icon:'🧮',title:'Auto-Marge in der Scorecard',desc:'VK, EK und FBA-Gebühren eintragen — die Netto-Marge (und der Marge-Red-Flag) rechnet sich von selbst.',cta:'Zur Pipeline',act:"go('pipeline')"},
  {icon:'🚩',title:'Monopol-Flag & rote Rahmen',desc:'Dominiert eine Marke die Top-10, warnt die Scorecard; Kandidaten mit hartem Red Flag sind rot umrandet.',cta:'Zur Pipeline',act:"go('pipeline')"},
  {icon:'⚡',title:'Xray-Paste',desc:'Helium-10-Xray-Tabelle kopieren, einfügen — fertiger Nischen-Kandidat mit Score & Ampel in Sekunden.',cta:'Ausprobieren',act:"if(typeof xrayPasteOpen==='function')xrayPasteOpen()"},
  {icon:'🛡️',title:'Cloud-Nutzer-Verwaltung',desc:'Als Admin verwaltest du die echten Server-Konten: Passwort-Reset, Rollen — Admin-Bereich, Sektion „Cloud-Konten".',cta:'Zum Admin',act:"go('admin')",adminOnly:true}
];
function whatsNewDismiss(){
  try{localStorage.setItem(WHATSNEW_KEY,'1');}catch(e){}
  var el=document.getElementById('dashWhatsNew');if(el)el.innerHTML='';
  if(typeof syQueue==='function')try{syQueue(WHATSNEW_KEY);}catch(e){}
  toast('Ausgeblendet — die Funktionen findest du weiter an ihren Plätzen');
}
function renderWhatsNew(){
  var el=document.getElementById('dashWhatsNew');
  if(!el)return;
  var dismissed=false;try{dismissed=!!localStorage.getItem(WHATSNEW_KEY);}catch(e){}
  if(dismissed){el.innerHTML='';return;}
  var u=(window.WikaAuth&&WikaAuth.currentUser&&WikaAuth.currentUser())||null;
  var isAdmin=!!(u&&u.role==='admin');
  var items=WHATSNEW.filter(function(w){return !w.adminOnly||isAdmin;});
  var h='<div style="background:linear-gradient(135deg,var(--pud),var(--s1));border:1.5px solid var(--pu);border-radius:14px;padding:18px 20px;margin-bottom:18px">';
  h+='<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px">'+
    '<div style="font-family:\'Playfair Display\',serif;font-size:18px;font-weight:700;color:var(--tx)">✨ Was ist neu in AMZ SellerHub <span style="font-size:11px;color:var(--tx3);font-weight:400">· Stand 06.07.2026</span></div>'+
    '<button class="btn btn-sm" onclick="whatsNewDismiss()" style="font-size:11px">✕ Ausblenden</button></div>';
  h+='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px">';
  items.forEach(function(w){
    h+='<div style="background:var(--s1);border:1px solid var(--bd);border-radius:10px;padding:12px 14px;display:flex;flex-direction:column;gap:6px">'+
      '<div style="font-weight:700;color:var(--tx);font-size:13px">'+w.icon+' '+w.title+'</div>'+
      '<div style="font-size:11.5px;color:var(--tx2);line-height:1.5;flex:1">'+w.desc+'</div>'+
      '<button class="btn btn-sm" onclick="'+w.act.replace(/"/g,'&quot;')+'" style="align-self:flex-start;font-size:10.5px;background:var(--pud);color:var(--pu);border:1px solid var(--pu);font-weight:700">'+w.cta+' →</button>'+
    '</div>';
  });
  h+='</div></div>';
  el.innerHTML=h;
}
window.whatsNewDismiss=whatsNewDismiss;

// Fahrplan ein-/ausklappen (Präferenz bleibt lokal gespeichert)
window.roadmapToggle=function(collapse){
  try{localStorage.setItem('wika_roadmap_collapsed',collapse?'1':'0');}catch(e){}
  if(typeof renderResearchRoadmap==='function')renderResearchRoadmap();
};

function renderDash(){
  var prods=D.products||[];
  var ideen=D.ideen||[];

  // ─── Persönliche Begrüßung (Cloud-Konto) ───
  var greetEl=document.getElementById('dashGreeting');
  if(greetEl){
    var gu=(window.WikaAuth&&WikaAuth.currentUser&&WikaAuth.currentUser())||null;
    greetEl.textContent=gu?('Herzlich willkommen, '+gu.username+' · Dein Entscheidungs-Cockpit'):'Dein Entscheidungs-Cockpit · AMZ SellerHub';
  }

  // ─── „Was ist neu?" + Tool-Hub + Produktrecherche-Fahrplan (geführt) ───
  if(typeof renderWhatsNew==='function')renderWhatsNew();
  if(typeof renderDashHub==='function')renderDashHub();
  if(typeof renderResearchRoadmap==='function')renderResearchRoadmap();
  if(typeof renderBackupHint==='function')renderBackupHint();
  if(typeof renderRadarWidget==='function')renderRadarWidget();
  if(typeof renderDashSearches==='function')renderDashSearches();

  // ─── License Countdown Panel ───
  if(typeof renderLicensePanel==='function')renderLicensePanel();

  // ─── Hero Stats ───
  var active=prods.filter(function(p){return p.status==='Bestellt'||p.status==='Analyse'});
  var totalProfit=0,margins=[];
  prods.forEach(function(p){var c=cp(p);if(c.m!==null){margins.push(c.m);totalProfit+=c.pr}});
  var avgM=margins.length>0?margins.reduce(function(a,b){return a+b},0)/margins.length:0;
  var ideenHohesPotenzial=ideen.filter(function(i){return i.potenzial==='Hoch'}).length;
  var herstellerCount=(D.suppliers||[]).length;

  researchInit();
  var rcands=(D.research&&D.research.candidates)?D.research.candidates:[];
  var rshort=(D.research&&D.research.shortlist)?D.research.shortlist:[];
  var activeCands=rcands.filter(function(c){var s=normalizeStatus(c.status);return s!=='abgelehnt'&&s!=='aktiv';});
  var goCands=rcands.filter(function(c){return decisionVerdict(c).verdict==='go';}).length;
  // Ø Netto-Marge über alle bewertbaren Kandidaten (decisionMarge: manuell ODER auto)
  var candMargins=activeCands.map(function(c){return decisionMarge(c).val;}).filter(function(v){return v!=null;});
  var avgCandM=candMargins.length?Math.round(candMargins.reduce(function(a,b){return a+b;},0)/candMargins.length):null;
  var heroStats=[
    {label:'Ideen',val:ideen.length,sub:ideenHohesPotenzial+' mit Hohem Potenzial',color:'pu',icon:'💡',go:"go('ideen')"},
    {label:'Kandidaten',val:activeCands.length,sub:'in Validierung',color:'ac',icon:'🔬',go:"go('pipeline')"},
    {label:'GO-Kandidaten',val:goCands,sub:'bereit für Shortlist',color:'gn',icon:'🟢',go:"go('research');researchShowTab('score')"},
    {label:'Ø Marge',val:avgCandM!=null?avgCandM+' %':'—',sub:candMargins.length?candMargins.length+' Kandidat'+(candMargins.length===1?'':'en')+' kalkuliert':'VK/EK/FBA eintragen',color:avgCandM==null?'tx3':avgCandM>=25?'gn':avgCandM>=15?'ac':'rd',icon:'🧮',go:"go('pipeline')"},
    {label:'Engere Wahl',val:rshort.length,sub:'Shortlist & Entscheidung',color:'cy',icon:'⭐',go:"go('pipeline')"}
  ];
  var heroHtml='';
  heroStats.forEach(function(s){
    var color='var(--'+s.color+')';
    heroHtml+='<div class="hero-stat" onclick="'+s.go+'" style="border-left:3px solid '+color+';cursor:pointer">'+
      '<span class="hs-bg-icon">'+s.icon+'</span>'+
      '<div class="hs-label">'+s.label+'</div>'+
      '<div class="hs-val" style="color:'+color+'">'+esc(String(s.val))+'</div>'+
      '<div class="hs-trend">'+esc(s.sub)+'</div>'+
    '</div>';
  });
  document.getElementById('dashHeroStats').innerHTML=heroHtml;

  // ─── Quick Actions: die 4 häufigsten Handgriffe, groß und eindeutig ───
  var qa=document.getElementById('dashQuickActions');
  if(qa){
    var QA=[
      {icon:'⚡',t:'Nische analysieren',d:'Xray einfügen → Urteil',act:"if(typeof xrayPasteOpen==='function')xrayPasteOpen()"},
      {icon:'🔗',t:'ASIN analysieren',d:'Konkurrenz-Listing laden',act:"go('research');setTimeout(function(){var e=document.getElementById('researchAsinInput');if(e){e.focus();e.scrollIntoView({block:'center'})}},160)"},
      {icon:'🎨',t:'KI-Bild erzeugen',d:'Produktfoto → Visuals',act:"go('inhalt')"},
      {icon:'📝',t:'Listing optimieren',d:'Titel, Bullets, Backend',act:"go('listing')"}
    ];
    var qh='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px">';
    QA.forEach(function(q){
      qh+='<button onclick="'+q.act.replace(/"/g,'&quot;')+'" style="display:flex;align-items:center;gap:12px;text-align:left;background:linear-gradient(135deg,var(--ac),#b45309);border:none;border-radius:13px;padding:14px 16px;cursor:pointer;font-family:inherit;color:#fff;box-shadow:0 4px 14px rgba(217,119,6,.28);transition:transform .15s,box-shadow .15s" onmouseover="this.style.transform=\'translateY(-2px)\';this.style.boxShadow=\'0 8px 22px rgba(217,119,6,.4)\'" onmouseout="this.style.transform=\'none\';this.style.boxShadow=\'0 4px 14px rgba(217,119,6,.28)\'">'+
        '<span style="font-size:24px">'+q.icon+'</span>'+
        '<span><span style="display:block;font-weight:800;font-size:13.5px">'+q.t+'</span><span style="display:block;font-size:11px;opacity:.85">'+q.d+'</span></span>'+
      '</button>';
    });
    qh+='</div>';
    qa.innerHTML=qh;
  }

  // ─── Profil-Chip (Kopfleiste): Initiale des Cloud-Kontos ───
  var pc=document.getElementById('profileChip');
  if(pc){
    var pu=(window.WikaAuth&&WikaAuth.currentUser&&WikaAuth.currentUser())||null;
    if(pu){pc.style.display='flex';pc.textContent=(pu.username||'?').charAt(0).toUpperCase();pc.title=pu.username+(pu.email?' · '+pu.email:'')+' — Konto öffnen';}
    else pc.style.display='none';
  }

  // ─── Quick action card meta ───
  var qProds=document.getElementById('qcProds');if(qProds)qProds.textContent=prods.length+' Produkte';
  var qIdeen=document.getElementById('qcIdeen');if(qIdeen)qIdeen.textContent=ideen.length+' Ideen, '+ideenHohesPotenzial+'★';
  var qRes=document.getElementById('qcResearch');
  if(qRes){
    var resCands=(D.research && D.research.candidates)?D.research.candidates:[];
    var ideenCount=(D.ideen||[]).length;
    var allItems=ideenCount+resCands.length;
    qRes.textContent=allItems===0?'Pipeline: Ideen · Recherche · Helium 10':ideenCount+' Ideen · '+resCands.length+' Kandidaten';
  }
  if(typeof researchUpdateBadge==='function')researchUpdateBadge();
  // Auch das Findung-Hub-Badge aktualisieren
  if(typeof renderFindungHub==='function'){
    var fb=document.getElementById('findungBadge');
    if(fb){
      var items=(D.ideen||[]).length;
      var cands=(D.research&&D.research.candidates)?D.research.candidates.filter(function(c){return normalizeStatus(c.status)!=='abgelehnt'&&normalizeStatus(c.status)!=='aktiv'}).length:0;
      var openCount=items+cands;
      if(openCount>0){fb.style.display='inline-block';fb.textContent=openCount;}
      else{fb.style.display='none';}
    }
  }
  var qComp=document.getElementById('qcCompetitors');if(qComp)qComp.textContent=(D.competitors||[]).length+' Einträge';
  var qKeys=document.getElementById('qcKeywords');if(qKeys)qKeys.textContent=(D.keywords||[]).length+' Keywords';
  var qRev=document.getElementById('qcReviews');if(qRev)qRev.textContent=(D.reviews||[]).length+' Analysen';
  var qLau=document.getElementById('qcLaunches');if(qLau)qLau.textContent=(D.launches||[]).length+' Launches';
  var qSel=document.getElementById('qcSeller');
  if(qSel){
    var imports=D.sellerImports||[];
    if(imports.length>0){
      var last=imports[0];
      var d=new Date(last.timestamp);
      qSel.textContent=imports.length+' Imports · '+d.toLocaleDateString('de-DE');
    }else{
      qSel.textContent='Noch kein Import';
    }
  }

  // ─── Top-Kandidaten nach Score ───
  if(typeof renderDashTopCands==='function')renderDashTopCands();

  // ─── Activity feed (recent products + ideas merged by date) ───
  var activities=[];
  prods.forEach(function(p,i){
    if(p.datum)activities.push({type:'product',name:p.name||'(Ohne Namen)',status:p.status,date:p.datum,idx:i,icon:'📋',color:'ac'});
  });
  ideen.forEach(function(it,i){
    if(it.datum)activities.push({type:'idea',name:it.name||'(Ohne Namen)',status:it.status,date:it.datum,idx:i,icon:'💡',color:'pu',extra:it.potenzial});
  });
  // Recherche-Kandidaten (updatedAt = ISO) — zuletzt bearbeitete zuerst im Feed
  rcands.forEach(function(c){
    if(!c.updatedAt)return;
    var vd=decisionVerdict(c);
    activities.push({type:'cand',name:c.name||'(Ohne Namen)',status:(vd.score>0?'Score '+vd.score+' · '+vd.label:'unbewertet'),
      date:new Date(c.updatedAt).toLocaleDateString('de-DE'),ts:new Date(c.updatedAt).getTime(),icon:'🔬',color:'cy'});
  });
  // Sort newest first by date (ISO-Zeitstempel bevorzugt, sonst de-DE-Datum)
  activities.sort(function(a,b){
    var pa=a.ts||parseGermanDate(a.date),pb=b.ts||parseGermanDate(b.date);
    return pb-pa;
  });

  var actHtml='';
  if(activities.length===0){
    actHtml='<div style="padding:24px;text-align:center;color:var(--tx2);font-size:12px"><div style="font-size:32px;margin-bottom:8px;opacity:.5">🌱</div>Noch keine Aktivität.<br><a onclick="go(\'ideen\')" style="color:var(--ac);cursor:pointer">Lege deine erste Idee an →</a></div>';
  }else{
    activities.slice(0,12).forEach(function(a){
      var color='var(--'+a.color+')';
      var bgColor='var(--'+a.color+'d)';
      var clickHandler=a.type==='product'?'openProductDetail('+a.idx+')':a.type==='cand'?'go(\'pipeline\')':'go(\'ideen\')';
      actHtml+='<div class="act-item" onclick="'+clickHandler+'">'+
        '<div class="ai-ico" style="background:'+bgColor+';color:'+color+'">'+a.icon+'</div>'+
        '<div class="ai-body">'+
          '<div class="ai-title">'+esc(a.name)+'</div>'+
          '<div class="ai-meta">'+esc(a.status||'')+(a.extra?' · '+esc(a.extra):'')+' · '+esc(a.date)+'</div>'+
        '</div>'+
      '</div>';
    });
  }
  document.getElementById('dashActivity').innerHTML=actHtml;

  // ─── Status bars (product status distribution) ───
  var statusCounts={'Idee':0,'Recherche':0,'Analyse':0,'Bestellt':0,'Abgelehnt':0};
  prods.forEach(function(p){if(statusCounts[p.status]!==undefined)statusCounts[p.status]++});
  var statusColors={'Idee':'var(--tx3)','Recherche':'var(--bl)','Analyse':'var(--pu)','Bestellt':'var(--gn)','Abgelehnt':'var(--or)'};
  var maxStatus=Math.max(1,Math.max.apply(null,Object.values(statusCounts)));
  var statusHtml='';
  Object.keys(statusCounts).forEach(function(k){
    var pct=(statusCounts[k]/maxStatus)*100;
    statusHtml+='<div class="status-bar">'+
      '<div class="sb-label">'+k+'</div>'+
      '<div class="sb-track"><div class="sb-fill" style="width:'+pct+'%;background:'+statusColors[k]+'"></div></div>'+
      '<div class="sb-val">'+statusCounts[k]+'</div>'+
    '</div>';
  });
  if(prods.length===0)statusHtml='<div style="text-align:center;color:var(--tx3);padding:20px;font-size:12px">Noch keine Produkte vorhanden</div>';
  document.getElementById('dashStatusBars').innerHTML=statusHtml;

  // ─── Ideen-Funnel ───
  var ideenStatus={'Neu':0,'Zu prüfen':0,'Recherchiert':0,'Hohes Potenzial':0,'Verworfen':0};
  ideen.forEach(function(i){if(ideenStatus[i.status]!==undefined)ideenStatus[i.status]++});
  var ideenColors={'Neu':'var(--tx3)','Zu prüfen':'var(--bl)','Recherchiert':'var(--pu)','Hohes Potenzial':'var(--gn)','Verworfen':'var(--or)'};
  var maxIdeen=Math.max(1,Math.max.apply(null,Object.values(ideenStatus)));
  var ideenHtml='';
  Object.keys(ideenStatus).forEach(function(k){
    var pct=(ideenStatus[k]/maxIdeen)*100;
    ideenHtml+='<div class="status-bar">'+
      '<div class="sb-label" style="width:110px">'+k+'</div>'+
      '<div class="sb-track"><div class="sb-fill" style="width:'+pct+'%;background:'+ideenColors[k]+'"></div></div>'+
      '<div class="sb-val">'+ideenStatus[k]+'</div>'+
    '</div>';
  });
  if(ideen.length===0)ideenHtml='<div style="text-align:center;color:var(--tx3);padding:20px;font-size:12px">Noch keine Ideen im Pool</div>';
  document.getElementById('dashIdeenFunnel').innerHTML=ideenHtml;
}

// Helper: parse German date format DD.MM.YYYY to Date object for sorting
function parseGermanDate(s){
  if(!s)return new Date(0);
  var parts=s.split('.');
  if(parts.length!==3)return new Date(0);
  return new Date(parseInt(parts[2]),parseInt(parts[1])-1,parseInt(parts[0]));
}

// ═══════════════ GENERIC MODAL ═══════════════
function gmPrompt(title,fields,onSave){
  document.getElementById('gmTitle').textContent=title;
  var sb0=document.getElementById('gmSave');if(sb0)sb0.style.display='';
  var html='<div class="fg2">';
  fields.forEach(function(f){
    html+='<div class="fi"><label>'+f.l+'</label>';
    if(f.tag==='textarea')html+='<textarea id="'+f.id+'"></textarea>';
    else if(f.tag==='select'){html+='<select id="'+f.id+'">';(f.opts||[]).forEach(function(o){html+='<option>'+o+'</option>'});html+='</select>';}
    else html+='<input type="'+(f.t||'text')+'" id="'+f.id+'"'+(f.t==='number'?' step="0.01"':'')+'>';
    html+='</div>';
  });
  html+='</div>';
  document.getElementById('gmBody').innerHTML=html;
  document.getElementById('gmSave').onclick=function(){onSave();closeGM()};
  document.getElementById('genModal').classList.add('show');
  setTimeout(function(){var first=document.getElementById(fields[0].id);if(first)first.focus()},100);
}
function closeGM(){document.getElementById('genModal').classList.remove('show')}

// ═══════════════ EXPORT / IMPORT ═══════════════
function exportCSV(){
  var h=['Name','Kategorie','Status','ASIN','EK','VK','FBA','Versand','Zoll','Sonstige','Marge%','Gewinn','ROI%','BSR','Bewertungen','Wettbewerber','Rating','Quelle','Suchvolumen','Notizen','Datum'];
  var rows=[h.join(';')];
  D.products.forEach(function(p){var c=cp(p);rows.push(['"'+esc(p.name)+'"','"'+(p.kategorie||'')+'"',p.status,p.asin||'',p.einkaufspreis||'',p.verkaufspreis||'',p.fbaGebuehren||'',p.versand||'',p.zoll||'',p.sonstigeKosten||'',c.m!==null?c.m.toFixed(1):'',c.pr.toFixed(2),c.roi!==null?c.roi.toFixed(0):'',p.bsr||'',p.bewertungen||'',p.wettbewerber||'',p.bewertung||'','"'+(p.quelle||'')+'"',p.suchvolumen||'','"'+(p.notizen||'').replace(/"/g,'""')+'"',p.datum||''].join(';'))});
  dlf('sellerhub_produkte.csv',rows.join('\n'),'text/csv;charset=utf-8');toast('CSV ✓');
}
function exportJSON(){
  // Wrap data with version metadata
  var backup={
    _meta:{
      app:WIKA_NAME,
      version:WIKA_VERSION,
      build:WIKA_BUILD_DATE,
      exportedAt:new Date().toISOString()
    },
    data:D
  };
  var dateStr=new Date().toISOString().split('T')[0];
  dlf('sellerhub_backup_'+dateStr+'_v'+WIKA_VERSION+'.json',JSON.stringify(backup,null,2),'application/json');
  toast('Backup v'+WIKA_VERSION+' ✓');
}
function handleImp(e){
  var f=e.target.files[0];if(!f)return;
  var r=new FileReader();
  r.onload=function(ev){
    try{
      var d=JSON.parse(ev.target.result);
      // Check if this is a versioned backup (has _meta)
      if(d&&d._meta&&d.data){
        var backupVer=d._meta.version||'unknown';
        var msg='Backup-Datei erkannt: '+(d._meta.app||'AMZ SellerHub')+' v'+backupVer;
        if(backupVer!==WIKA_VERSION){
          msg+='\n\n⚠️ Andere Version: aktuell v'+WIKA_VERSION+', Backup v'+backupVer;
          msg+='\n\nDaten trotzdem importieren? (Import addiert die Daten zu den vorhandenen)';
        }else{
          msg+='\n\nDaten importieren?';
        }
        if(!confirm(msg))return;
        // Merge versioned data
        var inner=d.data;
        ['products','competitors','keywords','reviews','suppliers','launches','ideen'].forEach(function(k){
          if(inner[k]&&Array.isArray(inner[k]))D[k]=D[k].concat(inner[k]);
        });
        save();renderProds();renderIdeen();
        toast('Backup v'+backupVer+' importiert ✓');
      }
      // Legacy format: array of products
      else if(Array.isArray(d)){
        D.products=D.products.concat(d);save();renderProds();
        toast(d.length+' Produkte importiert ✓');
      }
      // Legacy format: object with named arrays
      else if(d.products){
        ['products','competitors','keywords','reviews','suppliers','launches','ideen'].forEach(function(k){
          if(d[k]&&Array.isArray(d[k]))D[k]=D[k].concat(d[k]);
        });
        save();renderProds();renderIdeen();
        toast('Importiert ✓');
      }else{
        alert('Unbekanntes Datenformat');
      }
    }catch(err){alert('Ungültiges JSON: '+err.message)}
  };
  r.readAsText(f);e.target.value='';
}
function dlf(n,t,ty){var a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\uFEFF'+t],{type:ty}));a.download=n;a.click()}

// ═══════════════ KEYBOARD ═══════════════
document.addEventListener('keydown',function(e){
  if(e.key==='Escape'){closePM();closeGM();closeGlobalSearch()}
  // Cmd/Ctrl+K → Open global search
  if(e.key==='k'&&(e.metaKey||e.ctrlKey)){
    e.preventDefault();
    openGlobalSearch();
    return;
  }
  if(e.key==='n'&&(e.metaKey||e.ctrlKey)){e.preventDefault();openProdModal()}
  // Cmd/Ctrl+S in detail view triggers manual save
  if(e.key==='s'&&(e.metaKey||e.ctrlKey)){
    var detailActive=document.getElementById('p-detail').classList.contains('active');
    if(detailActive){
      e.preventDefault();
      saveDetailManual();
    }
  }
});

// ═══════════════ IDEEN-POOL ═══════════════
function ideenResetFilters(){
  var s=document.getElementById('ideenSearch');if(s)s.value='';
  var fs=document.getElementById('fIdeeStatus');if(fs)fs.value='';
  var fq=document.getElementById('fIdeeQuelle');if(fq)fq.value='';
  renderIdeen();
}
function renderIdeen(){
  var q=(document.getElementById('ideenSearch').value||'').toLowerCase();
  var fs=document.getElementById('fIdeeStatus').value;
  var fq=document.getElementById('fIdeeQuelle').value;
  var fl=D.ideen.filter(function(i){
    var ms=!q||i.name.toLowerCase().indexOf(q)>-1||(i.kategorie||'').toLowerCase().indexOf(q)>-1||(i.warum||'').toLowerCase().indexOf(q)>-1||(i.differenzierung||'').toLowerCase().indexOf(q)>-1||(i.zielgruppe||'').toLowerCase().indexOf(q)>-1;
    return ms&&(!fs||i.status===fs)&&(!fq||i.quelle===fq);
  });
  var sf=iSort.f,dir=iSort.d==='asc'?1:-1;
  fl.sort(function(a,b){
    var va=a[sf]||'',vb=b[sf]||'';
    if(sf==='potenzial'){var rank={'Hoch':3,'Mittel':2,'Niedrig':1};va=rank[a.potenzial]||0;vb=rank[b.potenzial]||0}
    if(typeof va==='number'&&typeof vb==='number')return(va-vb)*dir;
    return String(va).localeCompare(String(vb),'de')*dir;
  });
  var tb=document.getElementById('ideenBody');tb.innerHTML='';
  fl.forEach(function(i){
    var idx=D.ideen.indexOf(i);
    var sc=i.status==='Neu'?'b-idee':i.status==='Zu prüfen'?'b-recherche':i.status==='Hohes Potenzial'?'b-bestellt':i.status==='Recherchiert'?'b-analyse':'b-abgelehnt';
    var potColor=i.potenzial==='Hoch'?'var(--gn)':i.potenzial==='Mittel'?'var(--ac)':'var(--rd)';
    // BILD CELL: Auto-fallback to Amazon image search if no bildUrl set
    // Use Google's image search via thumbnail proxy as default fallback
    var thumbUrl=i.bildUrl;
    if(!thumbUrl&&i.amazonLink){
      // Extract ASIN from amazon link if possible for direct image
      var asinMatch=i.amazonLink.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/);
      if(asinMatch)thumbUrl='https://images-na.ssl-images-amazon.com/images/P/'+asinMatch[1]+'.jpg';
    }
    var bildCell;
    if(thumbUrl){
      var safeUrl=esc(thumbUrl).replace(/'/g,"\\'");
      var safeName=esc(i.name).replace(/'/g,"\\'").replace(/"/g,'&quot;');
      bildCell='<div class="bild-wrap" data-url="'+esc(thumbUrl)+'" data-name="'+esc(i.name)+'" style="width:48px;height:48px;position:relative">'+
        '<img src="'+esc(thumbUrl)+'" style="width:48px;height:48px;object-fit:cover;border-radius:6px;border:1px solid var(--bd);cursor:pointer;display:block" '+
        'onerror="this.style.display=\'none\';this.parentNode.querySelector(\'.no-img\').style.display=\'flex\'" '+
        'onclick="event.stopPropagation();showBildPreview(\''+safeUrl+'\',\''+safeName+'\')">'+
        '<div class="no-img" style="display:none;width:48px;height:48px;background:var(--s3);border-radius:6px;align-items:center;justify-content:center;font-size:18px;color:var(--tx3);position:absolute;top:0;left:0;cursor:pointer" onclick="event.stopPropagation();searchImageOnGoogle('+idx+')" title="Auf Amazon suchen + Bild kopieren">🔍</div>'+
      '</div>';
    }else{
      // No image at all – show search icon to fetch from Google Images
      bildCell='<div class="bild-wrap" style="width:48px;height:48px">'+
        '<div style="width:48px;height:48px;background:var(--s3);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:16px;color:var(--ac);cursor:pointer;border:1px dashed var(--bd)" '+
        'onclick="event.stopPropagation();searchImageOnGoogle('+idx+')" title="Amazon öffnen → Produktbild kopieren">🔍</div>'+
      '</div>';
    }

    // AMAZON CELL: Better targeted search (uses keywords + restricted to relevant search)
    var amazonCell;
    if(i.amazonLink){
      var shortUrl=i.amazonLink.replace(/^https?:\/\/(www\.)?/,'').substring(0,28);
      if(i.amazonLink.length>30)shortUrl+='…';
      amazonCell='<a href="'+esc(i.amazonLink)+'" target="_blank" rel="noopener" onclick="event.stopPropagation()" style="color:var(--ac);text-decoration:none;font-size:11px;display:inline-flex;align-items:center;gap:4px;background:var(--acd);padding:4px 8px;border-radius:5px;border:1px solid var(--ac)" title="'+esc(i.amazonLink)+'">🔗 '+esc(shortUrl)+'</a><button onclick="event.stopPropagation();addAmazonLink('+idx+')" style="background:none;border:none;color:var(--tx3);padding:2px 4px;font-size:10px;cursor:pointer;margin-left:4px" title="Link bearbeiten">✏️</button>';
    }else{
      // "Produkt finden" resolves the real top Amazon product on click and opens it directly
      amazonCell='<button onclick="event.stopPropagation();ideenOpenProduct('+idx+')" style="color:var(--bl);text-decoration:none;font-size:11px;display:inline-flex;align-items:center;gap:4px;background:var(--bld);padding:4px 8px;border-radius:5px;border:1px solid var(--bl);cursor:pointer;font-family:inherit" title="Öffnet eine präzise Amazon-Suche – die obersten Treffer sind die echten Produkte für: '+esc(i.name)+'">🔍 Produkt finden</button><button onclick="event.stopPropagation();addAmazonLink('+idx+')" style="background:none;border:1px dashed var(--bd);color:var(--tx3);padding:3px 6px;border-radius:5px;font-size:10px;cursor:pointer;margin-left:4px" title="Echten /dp/-Link einfügen → öffnet danach direkt das Produkt">+</button>';
    }

    // HERSTELLER CELL: Quick-search buttons for Alibaba (with EN translation), Europages (correct URL)
    var keywordsEN=toSearchKeywords(i.name);
    var alibabaSearch=encodeURIComponent(keywordsEN||i.name);
    var europagesSearch=encodeURIComponent(i.name);
    var herstellerCell='<div style="display:flex;flex-wrap:wrap;gap:3px;align-items:center">'+
      '<a href="https://www.alibaba.com/trade/search?fsb=y&IndexArea=product_en&SearchText='+alibabaSearch+'" target="_blank" rel="noopener" onclick="event.stopPropagation()" style="text-decoration:none;font-size:10px;background:#ff6a00;color:#fff;padding:3px 6px;border-radius:4px;font-weight:600" title="Alibaba (EN-Keywords: '+esc(keywordsEN)+')">🇨🇳 Alibaba</a>'+
      '<a href="https://www.europages.de/unternehmen/'+europagesSearch+'.html" target="_blank" rel="noopener" onclick="event.stopPropagation()" style="text-decoration:none;font-size:10px;background:#003580;color:#fff;padding:3px 6px;border-radius:4px;font-weight:600" title="Europages.de Hersteller-Suche">🇪🇺 Europages</a>'+
      '<button onclick="event.stopPropagation();showHerstellerMenu('+idx+',event)" style="background:var(--s3);border:1px solid var(--bd);color:var(--tx2);padding:3px 6px;border-radius:4px;font-size:10px;cursor:pointer" title="Mehr Hersteller-Quellen (10 Plattformen)">⋯</button>'+
      '</div>';

    var isSelected=selectedIdeen.indexOf(idx)>-1;
    var tr=document.createElement('tr');
    if(isSelected)tr.style.background='var(--acd)';
    tr.style.cursor='pointer';
    tr.innerHTML='<td onclick="event.stopPropagation()"><input type="checkbox" class="idee-check" data-idx="'+idx+'" '+(isSelected?'checked':'')+' onchange="toggleSelect('+idx+',this.checked)" style="cursor:pointer;width:16px;height:16px;accent-color:var(--ac)"></td>'
      +'<td>'+bildCell+'</td>'
      +'<td class="pn" style="cursor:pointer" title="Klicken zum Bearbeiten">'+esc(i.name)+'</td>'
      +'<td>'+esc(i.kategorie||'—')+'</td>'
      +'<td style="font-weight:700;color:'+potColor+'">'+esc(i.potenzial||'—')+'</td>'
      +'<td class="nc">'+(i.vkPreis?fmt(i.vkPreis):'—')+'</td>'
      +'<td class="note-c" title="'+esc(i.marktgroesse||'')+'">'+esc(i.marktgroesse||'—')+'</td>'
      +'<td class="note-c" title="'+esc(i.zielgruppe||'')+'">'+esc(i.zielgruppe||'—')+'</td>'
      +'<td class="note-c" title="'+esc(i.differenzierung||'')+'">'+esc(i.differenzierung||'—')+'</td>'
      +'<td class="note-c" title="'+esc(i.warum||'')+'">'+esc(i.warum||'—')+'</td>'
      +'<td class="note-c" title="'+esc(i.risiken||'')+'">'+esc(i.risiken||'—')+'</td>'
      +'<td><span class="badge '+sc+'">'+esc(i.status)+'</span></td>'
      +'<td><span style="font-size:11px;color:var(--tx2)">'+esc(i.quelle||'')+'</span>'+(i.quellen?'<div title="Quellen: '+esc(i.quellen.replace(/\n/g,', '))+'" style="display:inline-block;margin-left:4px;color:#40c9d8;font-size:10px;cursor:help">📚</div>':'')+'</td>'
      +'<td onclick="event.stopPropagation()" style="white-space:nowrap">'+amazonCell+'</td>'
      +'<td onclick="event.stopPropagation()">'+herstellerCell+'</td>'
      +'<td style="font-size:11px;color:var(--tx2);white-space:nowrap">'+(i.datum||'—')+'</td>'
      +'<td onclick="event.stopPropagation()"><div class="row-act">'
        +'<button onclick="editIdee('+idx+')" title="Bearbeiten">✏️</button>'
        +'<button onclick="ideeToProd('+idx+')" title="In Produktliste übernehmen" style="background:var(--gn);color:#fff;border:none;font-weight:600;padding:5px 9px;font-size:11px;border-radius:5px;white-space:nowrap">➕ Produktliste</button>'
        +'<button class="del" onclick="delIdee('+idx+')" title="Löschen">🗑️</button>'
      +'</div></td>';
    // Click on row opens edit modal (except on interactive cells that stopped propagation)
    tr.onclick=function(){editIdee(idx)};
    tb.appendChild(tr);
  });
  updateBulkBar();
  var _ie=document.getElementById('ideenEmpty');
  if(fl.length){_ie.style.display='none';}
  else if(D.ideen.length>0){
    // Ideen vorhanden, aber durch Filter ausgeblendet → klar machen + Reset anbieten
    _ie.style.display='block';
    _ie.innerHTML='<div class="eico">🔍</div><h3>'+D.ideen.length+' Idee'+(D.ideen.length>1?'n':'')+' durch Filter ausgeblendet</h3><p>Such-, Status- oder Quellen-Filter blenden gerade alle Ideen aus.</p><button class="btn btn-p" onclick="ideenResetFilters()">Filter zurücksetzen &amp; alle anzeigen</button>';
  }else{
    _ie.style.display='block';
    _ie.innerHTML='<div class="eico">💡</div><h3>Noch keine Ideen</h3><p>Nutze <b>🤖 KI-Import</b> um Ideen von Claude/Gemini reinzuladen, oder lege manuell an.</p>';
  }
  document.getElementById('ideenTable').style.display=fl.length?'table':'none';
  document.getElementById('ideenCount').textContent=D.ideen.length+' Ideen';
  // stats
  document.getElementById('istTotal').textContent=D.ideen.length;
  document.getElementById('istHoch').textContent=D.ideen.filter(function(i){return i.potenzial==='Hoch'||i.status==='Hohes Potenzial'}).length;
  document.getElementById('istPruefen').textContent=D.ideen.filter(function(i){return i.status==='Zu prüfen'||i.status==='Neu'}).length;
  document.getElementById('istVerworfen').textContent=D.ideen.filter(function(i){return i.status==='Verworfen'}).length;
  // badge in sidebar
  var neuCount=D.ideen.filter(function(i){return i.status==='Neu'}).length;
  var b=document.getElementById('ideenBadge');
  if(!b)return;
  if(neuCount>0){b.style.display='inline-block';b.textContent=neuCount}else b.style.display='none';
}

function isort(f){if(iSort.f===f)iSort.d=iSort.d==='asc'?'desc':'asc';else{iSort.f=f;iSort.d='asc';}renderIdeen()}

function repairIdeen(){
  if(!confirm('Alle Ideen nach kaputten Zeichen (z.B. KÃ¼che → Küche) durchsuchen und reparieren?'))return;
  var fixed=0;
  D.ideen.forEach(function(it){
    var before=JSON.stringify(it);
    ['name','kategorie','marktgroesse','zielgruppe','differenzierung','warum','risiken'].forEach(function(k){
      if(it[k])it[k]=fixEnc(it[k]);
    });
    if(JSON.stringify(it)!==before)fixed++;
  });
  save();renderIdeen();
  toast(fixed>0?'✓ '+fixed+' Ideen repariert':'Keine kaputten Zeichen gefunden');
}

// ═══════════════ BULK SELECTION ═══════════════
function toggleSelect(idx,checked){
  var pos=selectedIdeen.indexOf(idx);
  if(checked&&pos===-1)selectedIdeen.push(idx);
  else if(!checked&&pos>-1)selectedIdeen.splice(pos,1);
  updateBulkBar();
  // Update row highlight
  var tr=document.querySelector('.idee-check[data-idx="'+idx+'"]');
  if(tr){tr=tr.closest('tr');tr.style.background=checked?'var(--acd)':''}
}

function toggleSelectAll(checked){
  selectedIdeen=[];
  if(checked){
    // Only select visible (filtered) rows
    var visible=document.querySelectorAll('.idee-check');
    visible.forEach(function(cb){
      cb.checked=true;
      var idx=parseInt(cb.getAttribute('data-idx'));
      if(selectedIdeen.indexOf(idx)===-1)selectedIdeen.push(idx);
      cb.closest('tr').style.background='var(--acd)';
    });
  }else{
    document.querySelectorAll('.idee-check').forEach(function(cb){
      cb.checked=false;
      cb.closest('tr').style.background='';
    });
  }
  updateBulkBar();
}

function clearSelection(){
  selectedIdeen=[];
  document.getElementById('ideenSelAll').checked=false;
  document.querySelectorAll('.idee-check').forEach(function(cb){
    cb.checked=false;
    cb.closest('tr').style.background='';
  });
  updateBulkBar();
}

function updateBulkBar(){
  var bar=document.getElementById('bulkBar');
  var txt=document.getElementById('bulkCount');
  if(!bar)return;
  if(selectedIdeen.length>0){
    bar.style.display='flex';
    if(txt)txt.textContent=selectedIdeen.length+' ausgewählt';
  }else{
    bar.style.display='none';
  }
  // Update "select all" indicator
  var selAll=document.getElementById('ideenSelAll');
  if(selAll){
    var visible=document.querySelectorAll('.idee-check').length;
    if(selectedIdeen.length===0){selAll.checked=false;selAll.indeterminate=false}
    else if(selectedIdeen.length>=visible&&visible>0){selAll.checked=true;selAll.indeterminate=false}
    else{selAll.indeterminate=true}
  }
}

function bulkDelete(){
  if(selectedIdeen.length===0)return;
  if(!confirm(selectedIdeen.length+' ausgewählte Idee(n) wirklich löschen?'))return;
  // Sort desc so splicing doesn't shift indexes
  var toDel=selectedIdeen.slice().sort(function(a,b){return b-a});
  toDel.forEach(function(idx){D.ideen.splice(idx,1)});
  var count=selectedIdeen.length;
  selectedIdeen=[];
  save();renderIdeen();
  toast('✓ '+count+' Ideen gelöscht');
}

function bulkSetStatus(newStatus){
  if(selectedIdeen.length===0)return;
  selectedIdeen.forEach(function(idx){
    if(D.ideen[idx])D.ideen[idx].status=newStatus;
  });
  var count=selectedIdeen.length;
  selectedIdeen=[];
  save();renderIdeen();
  toast('✓ '+count+' Ideen → '+newStatus);
}
// Keep old name as alias for backward compat
function bulkChangeStatus(s){return bulkSetStatus(s)}

function addBildUrl(idx){
  var url=prompt('Bild-URL eingeben (z.B. von Amazon.de – Rechtsklick auf Produktbild → Bildadresse kopieren):',D.ideen[idx].bildUrl||'');
  if(url===null)return;
  D.ideen[idx].bildUrl=url.trim();
  save();renderIdeen();
  if(url.trim())toast('✓ Bild hinzugefügt');
}

// Click "Produkt finden": if a real /dp/ link is cached, open the product directly; otherwise
// open a PRECISE Amazon search (the top hits are the real products). Reliable, no dead links.
function ideenOpenProduct(idx){
  var idee=D.ideen[idx];if(!idee)return;
  if(idee.amazonLink&&/\/dp\/|\/gp\/product\//i.test(idee.amazonLink)){window.open(idee.amazonLink,'_blank','noopener');return;}
  window.open(buildAmazonSearchUrl(idee.name),'_blank','noopener');
}
function addAmazonLink(idx){
  var current=D.ideen[idx].amazonLink||'';
  var suggest=current||'https://www.amazon.de/s?k='+encodeURIComponent(D.ideen[idx].name);
  var url=prompt('Amazon-Link eingeben (Produktseite oder Suchergebnis):',suggest);
  if(url===null)return;
  D.ideen[idx].amazonLink=url.trim();
  save();renderIdeen();
  if(url.trim())toast('✓ Amazon-Link hinzugefügt');
}

function showBildPreview(url,name){
  var overlay=document.createElement('div');
  overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:600;display:flex;align-items:center;justify-content:center;cursor:zoom-out;backdrop-filter:blur(6px)';
  overlay.onclick=function(){overlay.remove()};
  overlay.innerHTML='<div style="max-width:90vw;max-height:90vh;text-align:center"><img src="'+esc(url)+'" style="max-width:90vw;max-height:80vh;border-radius:12px;box-shadow:0 12px 48px rgba(0,0,0,.6)"><div style="color:#fff;margin-top:14px;font-weight:600">'+esc(name)+'</div><div style="color:#999;font-size:12px;margin-top:4px">Klicken zum Schließen</div></div>';
  document.body.appendChild(overlay);
}

// Build a smart Amazon search URL that goes directly to product results, not category
// Trim a long marketing product name down to the core search keywords (better Amazon top-hits)
function amazonSearchTerms(name){
  if(!name)return '';
  var stop=/^(set|aus|fuer|für|mit|und|der|die|das|den|dem|ein|eine|einen|im|in|zum|zur|von|vom|am|als|oder|bzw|sowie|inkl|inklusive|modulares?|modular|mehrzweck|hochwertige[rsn]?|premium|universal|verstellbare[rsn]?|faltbare[rsn]?|luftdichte[rsn]?|wandmontierte[rsn]?|tuerhaengende[rsn]?)$/i;
  var words=name.replace(/[*_`#,()\/]/g,' ').replace(/&/g,' ').split(/\s+/).filter(Boolean).filter(function(w){return !stop.test(w)});
  var terms=words.slice(0,6).join(' ').trim();
  return terms||name.replace(/[*_`#]/g,'').trim();
}
function buildAmazonSearchUrl(productName){
  if(!productName)return 'https://www.amazon.de';
  var clean=amazonSearchTerms(productName);
  // Amazon's standard search with sort by relevance
  return 'https://www.amazon.de/s?k='+encodeURIComponent(clean)+'&i=aps&ref=nb_sb_noss';
}

// Translate German product name to English search keywords for international platforms
// (Alibaba, 1688, Made-in-China etc. work much better with English/short keywords)
function toSearchKeywords(productName){
  if(!productName)return '';
  var name=productName.toLowerCase();

  // Common German -> English product term mappings (FBA-relevant categories)
  // Order: longest/specific first
  var translations={
    // Compound multi-word terms first
    'aufbewahrungsbox':'storage box','aufbewahrungsdose':'storage container','aufbewahrungssystem':'storage system',
    'aufbewahrung':'storage',
    'kabelbinder-organizer':'cable tie organizer','kabelbinder':'cable tie',
    'küchen-aufbewahrungsbox':'kitchen storage box',
    'spülmaschinen-untersetzer':'dishwasher coaster','spülmaschine':'dishwasher','spülmaschinen':'dishwasher',
    'mikrofaser-tüchern':'microfiber cloth','mikrofaser-tuch':'microfiber cloth','mikrofaser':'microfiber',
    'flachmopf-set':'flat mop set','flachmopp-set':'flat mop set','flachmopf':'flat mop','flachmopp':'flat mop',
    'wischmopp':'mop','wischmop':'mop',
    'wandhalterung':'wall mount','wandhalter':'wall mount',
    'badputzutensilien':'bathroom cleaning utensils','badputz':'bathroom cleaning',
    'schneidebretter':'cutting boards','schneidebrett':'cutting board',
    'gewürzbehälter':'spice container','gewürzregal':'spice rack','gewürz':'spice',
    'frischhaltedose':'food container','frischhaltedosen':'food containers',
    'rutschfeste':'non-slip','rutschfest':'non-slip','rutsch-':'non-slip ',
    'saugnapf-unterlage':'suction cup mat','saugnapf':'suction cup',
    'badaccessoires':'bathroom accessories','badezimmer':'bathroom','badezubehör':'bathroom accessories',
    'haushaltskabel':'household cable','haushalt':'household',
    'raumduft':'air freshener','duftöl':'fragrance oil','nachfüllflasche':'refill bottle','holzdispenser':'wood dispenser',
    'putzrollen':'paper towel holder','putzrolle':'paper towel','küchenrolle':'paper towel',
    'reinigungstuch':'cleaning cloth','trocken-tuch':'dry cloth',
    'möbelgleiter':'furniture glider pad','filzgleiter':'felt pad','filzgleitern':'felt pads',
    'silikon-abdeckung':'silicone cover','silikon-':'silicone ','silikon':'silicone',
    'magnetisch':'magnetic','magnetischer':'magnetic','magnetisches':'magnetic','magnetische':'magnetic','magnet':'magnetic',
    'edelstahl':'stainless steel','rostfrei':'rust-free',
    // Single-word general terms
    'küche':'kitchen','küchen':'kitchen','küchen-':'kitchen ','küchenutensilien':'kitchen utensils',
    'untersetzer':'coaster','topf':'pot','töpfe':'pots','töpfen':'pots',
    'messer':'knife','messerblock':'knife block','besteck':'cutlery',
    'fächern':'compartments','fächer':'compartments','fach':'compartment',
    'tüchern':'cloths','tücher':'cloths','tuch':'cloth',
    'utensilien':'utensils',
    'unterlage':'mat','matte':'mat',
    'bad':'bathroom','dusche':'shower','seifenspender':'soap dispenser',
    'kabel':'cable','organizer':'organizer',
    'abdeckung':'cover','schrank':'cabinet','ablage':'shelf','regal':'shelf',
    'feucht':'wet','feuchtigkeit':'moisture','trocken':'dry',
    'möbel':'furniture','gleiter':'pad','gleitern':'pads',
    'schraube':'screw','nagel':'nail','klebe':'adhesive',
    'garten':'garden','reise':'travel','wasserflasche':'water bottle','flasche':'bottle','trinkflasche':'water bottle',
    'set':'set','premium':'premium','faltbar':'foldable','tragbar':'portable',
    'bambus':'bamboo','holz':'wood','plastik':'plastic','kunststoff':'plastic','keramik':'ceramic','glas':'glass',
    'universal':'universal','universal-':'universal ',
    'für':'for','mit':'with','und':'and','oder':'or','ohne':'without',
    'haushaltsgeräte':'household appliances'
  };

  // Try matching multi-word terms first (longest first)
  var keys=Object.keys(translations).sort(function(a,b){return b.length-a.length});
  var translated=name;
  keys.forEach(function(k){
    // Use word boundary or hyphen as boundary
    var escaped=k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    var re=new RegExp('(^|[\\s\\-])'+escaped+'($|[\\s\\-])','gi');
    translated=translated.replace(re,function(m,p1,p2){return p1+translations[k]+p2});
  });

  // Strip remaining German articles and connector words
  translated=translated.replace(/\b(der|die|das|den|dem|des|ein|eine|einen|einem|eines|im|am|zum|zur|von|aus|auf|an|bei)\b/gi,'');

  // Clean up: collapse hyphens/spaces
  translated=translated.replace(/[*_`#"'()&]/g,' ').replace(/[-]+/g,' ').replace(/\s+/g,' ').trim();

  // Now extract words and filter
  var words=translated.split(' ').filter(function(w){return w.length>1});

  // Remove leftover German words that didn't get translated (heuristic: contain umlauts or look German)
  words=words.filter(function(w){
    // Keep English words and numbers
    if(/^[a-z\d]+$/i.test(w))return true;
    // Drop words with umlauts that didn't get translated (still German)
    if(/[äöüßÄÖÜ]/.test(w))return false;
    return true;
  });

  // Keep up to 6 unique words, filter pure numbers and 1-letter words
  var seen={},result=[];
  for(var i=0;i<words.length&&result.length<6;i++){
    var w=words[i].toLowerCase();
    if(/^\d+$/.test(w))continue;
    if(!seen[w]){seen[w]=1;result.push(words[i])}
  }

  // Final cleanup: remove trailing prepositions
  while(result.length>0&&/^(with|for|and|or|at|to|in|on|the|a|an|of|by)$/i.test(result[result.length-1])){
    result.pop();
  }
  // Also remove leading prepositions
  while(result.length>0&&/^(with|for|and|or|at|to|in|on|the|a|an|of|by)$/i.test(result[0])){
    result.shift();
  }

  return result.join(' ');
}

// Open Google Images search and let user grab a real product image
function searchImageOnGoogle(idx){
  var name=D.ideen[idx].name;
  // Better: open Amazon directly so user can grab the actual product image
  var amzUrl=buildAmazonSearchUrl(name);
  window.open(amzUrl,'_blank');
  setTimeout(function(){
    var msg='Amazon wurde im neuen Tab geöffnet.\n\n'+
      '📋 So bekommst du das Produktbild:\n\n'+
      '1. Auf das richtige Produkt klicken\n'+
      '2. Rechtsklick auf das große Produktbild\n'+
      '3. „Bildadresse kopieren" wählen\n'+
      '4. Hier einfügen\n\n'+
      'Bild-URL jetzt einfügen?';
    if(confirm(msg)){
      addBildUrl(idx);
    }
  },500);
}

// Show hersteller menu popup with all manufacturer search options
function showHerstellerMenu(idx,evt){
  // Remove existing menu if any
  var existing=document.getElementById('herstellerMenu');
  if(existing){existing.remove();return}

  var name=D.ideen[idx].name;
  var keywordsEN=toSearchKeywords(name);// English keywords for international platforms
  var encDE=encodeURIComponent(name);
  var encEN=encodeURIComponent(keywordsEN||name);

  var menu=document.createElement('div');
  menu.id='herstellerMenu';
  menu.className='hersteller-menu';
  menu.onclick=function(e){e.stopPropagation()};

  // VERIFIED working URLs (April 2026):
  var sources=[
    // China platforms - use English keywords
    {flag:'🇨🇳',label:'Alibaba',url:'https://www.alibaba.com/trade/search?fsb=y&IndexArea=product_en&SearchText='+encEN,note:'EN: '+keywordsEN},
    {flag:'🇨🇳',label:'1688.com (Direktimport)',url:'https://s.1688.com/selloffer/offer_search.htm?keywords='+encDE,note:'Original-Begriff'},
    {flag:'🇨🇳',label:'Made-in-China',url:'https://www.made-in-china.com/multi-search/'+encEN+'/F1/1.html',note:'EN: '+keywordsEN},
    {flag:'🇨🇳',label:'Global Sources',url:'https://www.globalsources.com/searchList/products?keyWord='+encEN,note:'EN'},
    // Europe
    {flag:'🇪🇺',label:'Europages.de',url:'https://www.europages.de/unternehmen/'+encDE+'.html',note:'DE'},
    {flag:'🇪🇺',label:'Kompass (B2B Europa)',url:'https://de.kompass.com/searchCompanies?text='+encDE,note:'DE'},
    // Germany
    {flag:'🇩🇪',label:'Wer liefert was (DE)',url:'https://www.wlw.de/de/suche?q='+encDE,note:'DE'},
    // Other regions
    {flag:'🇮🇳',label:'IndiaMART',url:'https://dir.indiamart.com/search.mp?ss='+encEN,note:'EN'},
    {flag:'🇹🇷',label:'Türkei (Turkishexporter)',url:'https://www.turkishexporter.net/companies/search?keyword='+encEN,note:'EN'},
    {flag:'🌐',label:'Google: "Hersteller"+Name',url:'https://www.google.com/search?q='+encodeURIComponent('Hersteller OEM Lieferant '+name),note:'Web-Suche'}
  ];

  var html='<div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--tx2);padding:6px 12px 4px;font-weight:600">Hersteller suchen für:</div>';
  html+='<div style="font-size:11px;color:var(--ac);padding:0 12px 4px;font-weight:600">'+esc(name.substring(0,50))+(name.length>50?'…':'')+'</div>';
  if(keywordsEN&&keywordsEN!==name.toLowerCase()){
    html+='<div style="font-size:10px;color:var(--tx2);padding:0 12px 8px;font-style:italic">EN-Keywords: '+esc(keywordsEN)+'</div>';
  }
  html+='<div style="border-top:1px solid var(--bd);padding-top:6px"></div>';
  sources.forEach(function(s){
    html+='<a href="'+s.url+'" target="_blank" rel="noopener" title="'+esc(s.note||s.label)+'"><span class="flag">'+s.flag+'</span><span style="flex:1">'+s.label+'</span><span style="color:var(--tx3);font-size:10px">↗</span></a>';
  });
  menu.innerHTML=html;

  // Position near button
  var rect=evt.target.getBoundingClientRect();
  menu.style.top=(rect.bottom+window.scrollY+4)+'px';
  // Adjust horizontal position to stay within viewport
  var menuWidth=240;
  var leftPos=rect.left+window.scrollX-menuWidth+rect.width;
  if(leftPos<10)leftPos=10;
  menu.style.left=leftPos+'px';
  menu.style.width=menuWidth+'px';
  document.body.appendChild(menu);

  // Close on outside click
  setTimeout(function(){
    document.addEventListener('click',function closeMenu(){
      var m=document.getElementById('herstellerMenu');
      if(m)m.remove();
      document.removeEventListener('click',closeMenu);
    },{once:true});
  },10);
}

function openIdeeModal(i){
  editIdeeIdx=typeof i==='number'?i:-1;
  document.getElementById('iTitle').textContent=editIdeeIdx>=0?'Idee bearbeiten':'Neue Idee';
  document.getElementById('iSaveBtn').textContent=editIdeeIdx>=0?'Aktualisieren':'Speichern';
  if(editIdeeIdx>=0){var it=D.ideen[i];
    document.getElementById('iName').value=it.name||'';document.getElementById('iKat').value=it.kategorie||'';
    document.getElementById('iPot').value=it.potenzial||'Mittel';document.getElementById('iStatus').value=it.status||'Neu';
    document.getElementById('iQuelle').value=it.quelle||'Manuell';document.getElementById('iVK').value=it.vkPreis||'';
    document.getElementById('iMarkt').value=it.marktgroesse||'';document.getElementById('iZielg').value=it.zielgruppe||'';
    document.getElementById('iDiff').value=it.differenzierung||'';document.getElementById('iWarum').value=it.warum||'';
    document.getElementById('iRisiken').value=it.risiken||'';
    document.getElementById('iBild').value=it.bildUrl||'';document.getElementById('iAmazon').value=it.amazonLink||'';
    document.getElementById('iQuellen').value=it.quellen||'';
  }else{document.querySelectorAll('#ideeModal input,#ideeModal textarea,#ideeModal select').forEach(function(el){if(el.tagName==='SELECT')el.selectedIndex=0;else el.value='';});}
  document.getElementById('ideeModal').classList.add('show');
  setTimeout(function(){document.getElementById('iName').focus()},100);
}
function closeIdeeModal(){document.getElementById('ideeModal').classList.remove('show');editIdeeIdx=-1}
function editIdee(i){openIdeeModal(i)}
function delIdee(i){if(confirm('„'+D.ideen[i].name+'" löschen?')){D.ideen.splice(i,1);save();renderIdeen();toast('Gelöscht')}}

function saveIdee(){
  var n=document.getElementById('iName').value.trim();if(!n)return;
  var it={name:n,kategorie:document.getElementById('iKat').value.trim(),
    potenzial:document.getElementById('iPot').value,status:document.getElementById('iStatus').value,
    quelle:document.getElementById('iQuelle').value,vkPreis:pf('iVK'),
    marktgroesse:document.getElementById('iMarkt').value.trim(),zielgruppe:document.getElementById('iZielg').value.trim(),
    differenzierung:document.getElementById('iDiff').value.trim(),warum:document.getElementById('iWarum').value.trim(),
    risiken:document.getElementById('iRisiken').value.trim(),
    bildUrl:document.getElementById('iBild').value.trim(),amazonLink:document.getElementById('iAmazon').value.trim(),
    quellen:document.getElementById('iQuellen').value.trim(),
    datum:editIdeeIdx>=0?D.ideen[editIdeeIdx].datum:new Date().toLocaleDateString('de-DE')};
  if(editIdeeIdx>=0){D.ideen[editIdeeIdx]=it;toast('Aktualisiert ✓')}
  else{D.ideen.push(it);toast('Idee hinzugefügt ✓')}
  save();renderIdeen();closeIdeeModal();
  var pp=document.getElementById('p-pipeline');if(pp&&pp.classList.contains('active')&&typeof renderPipeline==='function')renderPipeline();
}

function ideeToProd(i){
  var it=D.ideen[i];
  if(!confirm('„'+it.name+'" in die Produktliste übernehmen?\n\n(Die Idee bleibt im Pool und wird als „Recherchiert" markiert.)'))return;
  D.products.push({
    name:it.name,kategorie:it.kategorie||'',status:'Recherche',asin:'',
    einkaufspreis:0,verkaufspreis:it.vkPreis||0,fbaGebuehren:0,versand:0,zoll:0,sonstigeKosten:0,
    gewicht:0,masse:'',bsr:0,bewertungen:0,wettbewerber:0,bewertung:0,
    quelle:it.quelle||'',suchvolumen:0,
    notizen:'Aus Ideen-Pool übernommen.'+(it.warum?' Warum: '+it.warum:'')+(it.differenzierung?' | Differenzierung: '+it.differenzierung:'')+(it.risiken?' | Risiken: '+it.risiken:''),
    datum:new Date().toLocaleDateString('de-DE')
  });
  D.ideen[i].status='Recherchiert';
  save();renderIdeen();renderProds();toast('In Produktliste übernommen ✓');
}

// ═══════════════ KI IMPORT ═══════════════
function openImportModal(){document.getElementById('importModal').classList.add('show');document.getElementById('impJSON').value='';document.getElementById('impText').value=''}
function closeImportModal(){document.getElementById('importModal').classList.remove('show')}

function switchImpTab(t){
  document.getElementById('impJSONTab').style.display=t==='json'?'block':'none';
  document.getElementById('impTextTab').style.display=t==='text'?'block':'none';
  document.getElementById('tabJSON').style.borderBottomColor=t==='json'?'var(--ac)':'transparent';
  document.getElementById('tabJSON').style.color=t==='json'?'var(--ac)':'var(--tx)';
  document.getElementById('tabText').style.borderBottomColor=t==='text'?'var(--ac)':'transparent';
  document.getElementById('tabText').style.color=t==='text'?'var(--ac)':'var(--tx)';
}

function runImport(){
  var quelle=document.getElementById('impQuelle').value;
  var defStatus=document.getElementById('impStatus').value;
  var jsonMode=document.getElementById('impJSONTab').style.display!=='none';
  var count=0,errors=0;

  if(jsonMode){
    var txt=document.getElementById('impJSON').value.trim();
    if(!txt)return toast('Nichts zu importieren');
    // try to extract JSON from text (even if wrapped in markdown)
    var jsonMatch=txt.match(/\[[\s\S]*\]/);
    if(jsonMatch)txt=jsonMatch[0];
    try{
      var arr=JSON.parse(txt);
      if(!Array.isArray(arr))throw new Error('Kein Array');
      arr.forEach(function(o){
        if(!o.name&&!o.produkt&&!o.title)return;
        D.ideen.push(normalizeIdee(o,quelle,defStatus));
        count++;
      });
    }catch(e){return toast('JSON-Fehler: '+e.message)}
  }else{
    var txt=document.getElementById('impText').value.trim();
    if(!txt)return toast('Nichts zu importieren');
    var parsed=parseFreitext(txt);
    parsed.forEach(function(o){
      D.ideen.push(normalizeIdee(o,quelle,defStatus));
      count++;
    });
  }

  if(count>0){save();renderIdeen();closeImportModal();toast(count+' Ideen importiert ✓');go('ideen');}
  else toast('Keine Ideen erkannt – Format prüfen');
}

function normalizeIdee(o,quelle,defStatus){
  return {
    name:fixEnc((o.name||o.produkt||o.title||o.produktname||'Unbenannt').toString().trim()),
    kategorie:fixEnc((o.kategorie||o.category||o.nische||'').toString().trim()),
    potenzial:normPot(o.potenzial||o.potential||o.score||'Mittel'),
    status:defStatus,
    quelle:quelle,
    vkPreis:parseFloat(o.vkPreis||o.preis||o.price||o.vk||0)||0,
    marktgroesse:fixEnc((o.marktgroesse||o.marktgröße||o.marketsize||o.markt||'').toString().trim()),
    zielgruppe:fixEnc((o.zielgruppe||o.targetgroup||o.target||'').toString().trim()),
    differenzierung:fixEnc((o.differenzierung||o.differentiation||o.usp||'').toString().trim()),
    warum:fixEnc((o.warum||o.why||o.reason||o.begruendung||'').toString().trim()),
    risiken:fixEnc((o.risiken||o.risks||o.risk||o.nachteile||'').toString().trim()),
    bildUrl:(o.bildUrl||o.bild||o.image||o.imageUrl||'').toString().trim(),
    amazonLink:(function(){
      var l=(o.amazonLink||o.amazon||o.link||o.url||'').toString().trim();
      if(l)return l;
      // JSON gave only a bare ASIN → build a direct Amazon.de product link
      var a=(o.asin||o.ASIN||'').toString().trim();
      if(/^[A-Z0-9]{10}$/i.test(a))return 'https://www.amazon.de/dp/'+a.toUpperCase();
      return '';
    })(),
    quellen:(o.quellen||o.sources||o.source||'').toString().trim(),
    datum:new Date().toLocaleDateString('de-DE')
  };
}

// Fix common mojibake (UTF-8 decoded as Latin-1)
function fixEnc(s){
  if(!s||typeof s!=='string')return s;
  // Only apply if we detect mojibake pattern (Ã followed by another char)
  if(!/Ã|â€|Â/.test(s))return s;
  var map={
    'Ã¤':'ä','Ã¶':'ö','Ã¼':'ü','ÃŸ':'ß',
    'Ã„':'Ä','Ã–':'Ö','Ãœ':'Ü',
    'Ã©':'é','Ã¨':'è','Ãª':'ê','Ã«':'ë',
    'Ã¡':'á','Ã ':'à','Ã¢':'â','Ã£':'ã',
    'Ã­':'í','Ã¬':'ì','Ã®':'î','Ã¯':'ï',
    'Ã³':'ó','Ã²':'ò','Ã´':'ô','Ãµ':'õ',
    'Ãº':'ú','Ã¹':'ù','Ã»':'û','Ã½':'ý',
    'Ã±':'ñ','Ã§':'ç',
    'â€"':'—','â€"':'–','â€˜':'\u2018','â€™':'\u2019','â€œ':'\u201C','â€':'\u201D',
    'â€¢':'•','â€¦':'…','â€š':'\u201A','â€ž':'\u201E',
    'Â°':'°','Â©':'©','Â®':'®','Â´':'´','Â':''
  };
  var out=s;
  // Apply replacements multiple times to catch nested mojibake
  for(var i=0;i<2;i++){
    Object.keys(map).forEach(function(k){
      out=out.split(k).join(map[k]);
    });
  }
  return out;
}

function normPot(v){
  var s=(v||'').toString().toLowerCase();
  if(s.indexOf('hoch')>-1||s.indexOf('high')>-1||s==='3')return 'Hoch';
  if(s.indexOf('niedrig')>-1||s.indexOf('low')>-1||s==='1')return 'Niedrig';
  return 'Mittel';
}

function parseFreitext(txt){
  var ideas=[];
  // Try to split by numbered list or blank lines
  var blocks=txt.split(/\n\s*\n|(?=^\s*\d+[\.\)]\s)/m).filter(function(b){return b.trim().length>10});

  blocks.forEach(function(block){
    var lines=block.split('\n').map(function(l){return l.trim()}).filter(function(l){return l.length>0});
    if(lines.length===0)return;
    // First line is usually the name
    var first=lines[0].replace(/^[\d\.\)\*\-\s]+/,'').replace(/^\*+|\*+$/g,'').trim();
    // Try to extract name and rest (separator: :, –, -, —)
    var sep=first.match(/^([^:–—]+?)(?:\s*[–—:\-]\s*)(.+)$/);
    var name=sep?sep[1].trim():first;
    var rest=sep?sep[2].trim():'';
    // Clean up name (remove markdown bold)
    name=name.replace(/\*\*/g,'').replace(/^["„]|["'"]$/g,'').trim();
    if(name.length<3||name.length>120)return;

    var obj={name:name};
    var fullText=lines.slice(1).join(' ')+' '+rest;

    // Try to extract price
    var priceMatch=fullText.match(/(\d{1,3}[.,]?\d{0,2})\s*(?:€|EUR|Euro)/i);
    if(priceMatch)obj.vkPreis=parseFloat(priceMatch[1].replace(',','.'));

    // Try to extract category (common keywords)
    var katMatch=fullText.match(/(?:Kategorie|Bereich|Nische|Category)[:\s]+([A-ZÄÖÜa-zäöü][^.,;\n]{2,30})/i);
    if(katMatch)obj.kategorie=katMatch[1].trim();

    // Try to find zielgruppe
    var zgMatch=fullText.match(/(?:Zielgruppe|Target)[:\s]+([^.\n]{5,100})/i);
    if(zgMatch)obj.zielgruppe=zgMatch[1].trim();

    // Potential markers
    if(/hoch|high|sehr gut|stark|vielversprechend/i.test(fullText))obj.potenzial='Hoch';
    else if(/niedrig|low|schwach|gering/i.test(fullText))obj.potenzial='Niedrig';
    else obj.potenzial='Mittel';

    // everything else as "warum"
    obj.warum=fullText.substring(0,300).trim();

    ideas.push(obj);
  });
  return ideas;
}

// ═══════════════ PROMPT GENERATOR ═══════════════
function openPromptModal(){
  try{
    document.getElementById('promptModal').classList.add('show');
    generatePrompt();
  }catch(e){alert('Fehler beim Öffnen: '+e.message)}
}
function closePromptModal(){document.getElementById('promptModal').classList.remove('show')}

function resetPrompt(){
  try{
    var set=function(id,v){var el=document.getElementById(id);if(el)el.value=v};
    set('pNische','Haushalt');set('pAnzahl','10');set('pPreis','15-50');
    set('pMarkt','Amazon.de');set('pSprache','de');set('pTyp','any');
    set('pZG','any');set('pStrategie','niche');set('pMarge','30');
    set('pSaison','ganzjaehrig');set('pMarke','safe');set('pKrit','');
    generatePrompt();
  }catch(e){alert('Reset-Fehler: '+e.message)}
}

function generatePrompt(){
  try{
    var getV=function(id,def){var el=document.getElementById(id);return el?(el.value||def||''):(def||'')};
    var nische=(getV('pNische','Haushalt')||'').trim()||'Haushalt';
    var anzahl=parseInt(getV('pAnzahl','10'))||10;
    if(anzahl<3)anzahl=3;if(anzahl>30)anzahl=30;
    var preis=(getV('pPreis','15-50')||'').trim()||'15-50';
    var markt=getV('pMarkt','Amazon.de');
    var sprache=getV('pSprache','de');
    var typ=getV('pTyp','any');
    var zg=getV('pZG','any');
    var strategie=getV('pStrategie','niche');
    var marge=getV('pMarge','30');
    var saison=getV('pSaison','ganzjaehrig');
    var marke=getV('pMarke','safe');
    var krit=(getV('pKrit','')||'').trim();

    var isDE=sprache==='de';

    // Mapping tables
    var typMap=isDE?{
      'any':'Beliebig','physisch-klein':'Klein & leicht (unter 500 g)','physisch-mittel':'Mittelgroß (0,5–2 kg)',
      'set':'Set / Bundle / Kit','verbrauchsgut':'Verbrauchsgut oder Refill-Produkt','zubehoer':'Zubehör zu einem bestehenden Produkt'
    }:{
      'any':'Any','physisch-klein':'Small & light (under 500g)','physisch-mittel':'Medium-sized (0.5–2 kg)',
      'set':'Set / Bundle / Kit','verbrauchsgut':'Consumable or refill product','zubehoer':'Accessory for an existing product'
    };
    var zgMap=isDE?{
      'any':'Beliebig','young':'Junge Erwachsene (18–30 Jahre)','professional':'Berufstätige (25–45 Jahre)',
      'family':'Familien mit Kindern','senior':'Senioren (60+)','enthusiast':'Hobby-Enthusiasten mit Kaufkraft','b2b':'B2B / Gewerbliche Käufer'
    }:{
      'any':'Any','young':'Young adults (18-30)','professional':'Working professionals (25-45)',
      'family':'Families with children','senior':'Seniors (60+)','enthusiast':'Hobby enthusiasts with spending power','b2b':'B2B / commercial buyers'
    };
    var stratMap=isDE?{
      'niche':'Nischenprodukt mit überschaubarem Wettbewerb','trending':'Trending oder wachsender Markt mit steigenden Suchanfragen',
      'evergreen':'Evergreen-Produkt mit zeitloser Nachfrage','problem-solver':'Klares Problemlöser-Produkt',
      'improvement':'Verbesserung/Weiterentwicklung existierender Produkte'
    }:{
      'niche':'Niche product with manageable competition','trending':'Trending or growing market',
      'evergreen':'Evergreen product with timeless demand','problem-solver':'Clear problem-solver product',
      'improvement':'Improvement of existing products'
    };
    var saisonMap=isDE?{
      'ganzjaehrig':'Nur ganzjährig verkäufliche Produkte (keine reinen Saisonprodukte)',
      'any':'Saisonalität egal','saison-ok':'Saisonprodukte sind in Ordnung'
    }:{
      'ganzjaehrig':'Year-round products only','any':'Seasonality doesn\'t matter','saison-ok':'Seasonal products OK'
    };
    var markeText=marke==='safe'?(isDE?'Keine Markenrecht-Risiken (keine Patente, keine geschützten Designs, keine Trademark-Konflikte)':'No trademark/patent conflicts'):(isDE?'Markenrecht-Check durch den Seller':'Trademark check by seller');

    var p='';

    if(isDE){
      p+='Du bist ein erfahrener Amazon FBA Produktforscher mit tiefer Marktkenntnis für den deutschen E-Commerce. Du hilfst einem erfahrenen Private-Label-Seller dabei, profitable Produktideen zu identifizieren, die auf '+markt+' funktionieren.\n\n';
      p+='**DEINE AUFGABE:** Finde '+anzahl+' vielversprechende Produktideen für die Nische „'+nische+'" auf '+markt+'.\n\n';
      p+='---\n\n';
      p+='**KERN-KRITERIEN (müssen alle erfüllt sein):**\n';
      p+='- Verkaufspreis: **'+preis+' €**\n';
      p+='- Ziel-Marge nach allen Kosten (EK + FBA + Versand + Zoll + Sonstiges): **mindestens '+marge+'%**\n';
      p+='- FBA-tauglich: klein, stabil, nicht zerbrechlich, lagerfähig, einfacher Versand\n';
      p+='- Echtes Marktbedürfnis: Produkt löst ein konkretes Problem oder deckt klaren Wunsch ab\n';
      p+='- Differenzierungspotenzial: Es muss möglich sein, sich durch USPs von der Konkurrenz abzuheben\n\n';

      p+='**ZUSÄTZLICHE QUALITÄTSKRITERIEN:**\n';
      p+='- Saisonalität: '+saisonMap[saison]+'\n';
      p+='- Markenrecht: '+markeText+'\n';
      if(typ!=='any')p+='- Produkt-Typ: '+typMap[typ]+'\n';
      if(zg!=='any')p+='- Zielgruppe: '+zgMap[zg]+'\n';
      p+='- Marktstrategie: '+stratMap[strategie]+'\n';
      if(krit)p+='- Zusätzlich: '+krit+'\n';
      p+='\n';

      p+='**BITTE VERMEIDEN:**\n';
      p+='- Produkte mit offensichtlich dominanten Marken (Apple-Zubehör, Lego-Kompatibel, etc.)\n';
      p+='- Gated/Restricted Kategorien ohne Freigabe (Nahrungsergänzung, Medizinprodukte, etc.)\n';
      p+='- Hochpreisige Elektronik mit kurzem Lebenszyklus\n';
      p+='- Produkte mit hohem Retouren-Risiko (Kleidung in vielen Größen, fragile Ware)\n';
      p+='- Zu generische Ideen ohne klaren USP\n\n';
      p+='---\n\n';

      p+='**ANTWORTFORMAT – SEHR WICHTIG:**\n\n';
      p+='Antworte AUSSCHLIESSLICH mit einem gültigen JSON-Array. Keine Einleitung, keine Erklärungen, keine Kommentare davor oder danach. Nur das JSON-Array.\n\n';
      p+='**WICHTIG zu Umlauten:** Verwende deutsche Umlaute direkt (ä, ö, ü, ß, €, °) – KEINE HTML-Entities, KEINE Escape-Sequenzen wie "\\u00e4", KEINE doppelten Bindestriche. Halte das JSON einfach und sauber UTF-8.\n\n';
      p+='Struktur pro Idee:\n\n';
      p+='```json\n[\n  {\n    "name": "Konkreter Produktname",\n    "kategorie": "Amazon-Kategorie",\n    "potenzial": "Hoch",\n    "vkPreis": 24.99,\n    "marktgroesse": "z.B. 5.000 Suchanfragen/Monat, wachsend",\n    "zielgruppe": "Spezifische Zielgruppenbeschreibung",\n    "differenzierung": "Konkreter USP gegenüber Konkurrenz",\n    "warum": "Datenbasierte Begründung",\n    "risiken": "Mögliche Herausforderungen",\n    "bildUrl": "",\n    "amazonLink": "https://www.amazon.de/dp/B0XXXXXXXX"\n  }\n]\n```\n\n';

      p+='**REGELN FÜR DIE FELDER:**\n';
      p+='- "name": Konkreter, verkäuflicher Produktname (nicht zu generisch, max. 60 Zeichen)\n';
      p+='- "kategorie": Amazon-Hauptkategorie oder Unterkategorie\n';
      p+='- "potenzial": NUR "Hoch", "Mittel" oder "Niedrig"\n';
      p+='- "vkPreis": Realistischer Verkaufspreis in Euro (Zahl, keine Anführungszeichen)\n';
      p+='- "marktgroesse": Konkrete Einschätzung mit Zahlen wenn möglich, inkl. Trend\n';
      p+='- "zielgruppe": Spezifische Beschreibung der idealen Kunden\n';
      p+='- "differenzierung": Konkreter USP oder Verbesserung gegenüber existierender Konkurrenz\n';
      p+='- "warum": Datenbasierte Begründung warum diese Idee vielversprechend ist\n';
      p+='- "risiken": Ehrliche Einschätzung der Risiken\n';
      p+='- "bildUrl": Leer lassen "" (Bild wird später manuell hinzugefügt)\n';
      p+='- "amazonLink": Direkter Amazon.de-Produktlink (Format https://www.amazon.de/dp/ASIN) zu EINEM konkreten, real existierenden Referenzprodukt dieser Art, das du per Websuche tatsächlich gefunden hast. So landet der Nutzer direkt auf dem Produkt statt auf einer Suchergebnis-Liste. NUR einen echten, verifizierten Link angeben – wenn du nicht im Web suchst oder unsicher bist, leer lassen "" (dann wird automatisch eine Amazon-Suche genutzt).\n\n';

      p+='**Liefere genau '+anzahl+' Ideen. Sei spezifisch, nicht generisch. Denke wie ein Unternehmer.**';
    }else{
      p+='You are an experienced Amazon FBA product researcher with deep knowledge of the '+markt+' marketplace. You help an experienced private-label seller identify profitable product opportunities.\n\n';
      p+='**YOUR TASK:** Find '+anzahl+' promising product ideas in the "'+nische+'" niche for '+markt+'.\n\n';
      p+='---\n\n';
      p+='**CORE CRITERIA (all must be met):**\n';
      p+='- Selling price: **'+preis+' EUR**\n';
      p+='- Target margin after all costs: **at least '+marge+'%**\n';
      p+='- FBA-friendly: small, sturdy, not fragile, storage-friendly\n';
      p+='- Real market demand: solves concrete problem\n';
      p+='- Differentiation potential: must be possible to stand out via USPs\n\n';

      p+='**ADDITIONAL CRITERIA:**\n';
      p+='- Seasonality: '+saisonMap[saison]+'\n';
      p+='- Trademark: '+markeText+'\n';
      if(typ!=='any')p+='- Product type: '+typMap[typ]+'\n';
      if(zg!=='any')p+='- Target group: '+zgMap[zg]+'\n';
      p+='- Strategy: '+stratMap[strategie]+'\n';
      if(krit)p+='- Additional: '+krit+'\n';
      p+='\n';

      p+='**PLEASE AVOID:**\n';
      p+='- Products with dominant brands\n- Gated/restricted categories\n- High-priced electronics\n- High return risk products\n- Too generic ideas\n\n---\n\n';

      p+='**RESPONSE FORMAT – IMPORTANT:**\n\nRespond ONLY with a valid JSON array. No introduction, no explanations.\n\n';
      p+='```json\n[\n  {\n    "name": "Product name",\n    "kategorie": "Category",\n    "potenzial": "Hoch",\n    "vkPreis": 24.99,\n    "marktgroesse": "Market size estimate",\n    "zielgruppe": "Target group",\n    "differenzierung": "USP",\n    "warum": "Why promising",\n    "risiken": "Risks",\n    "amazonLink": "https://www.amazon.de/dp/B0XXXXXXXX"\n  }\n]\n```\n\n';
      p+='"potenzial" must be only "Hoch", "Mittel" or "Niedrig". "amazonLink" = a direct Amazon.de product link (https://www.amazon.de/dp/ASIN) to ONE real reference product you actually found via web search, so the user lands directly on the product instead of a search list. Only provide a real, verified link – if you are not browsing the web or unsure, leave it "". Return exactly '+anzahl+' ideas.';
    }

    var out=document.getElementById('pOut');
    var cc=document.getElementById('pCharCount');
    if(!out){return}
    out.value=p;
    // Scroll to top so user sees the beginning of the new prompt
    out.scrollTop=0;
    if(cc)cc.textContent=p.length+' Zeichen';
    // Strong visual feedback: green flash border + char count pulse
    out.style.transition='border-color 0.2s,box-shadow 0.2s';
    out.style.borderColor='var(--gn)';
    out.style.boxShadow='0 0 0 3px rgba(45,212,160,0.25)';
    if(cc){cc.style.transition='color 0.2s,transform 0.2s';cc.style.color='var(--gn)';cc.style.transform='scale(1.15)';cc.style.display='inline-block'}
    setTimeout(function(){
      out.style.borderColor='';
      out.style.boxShadow='';
      if(cc){cc.style.color='';cc.style.transform=''}
    },600);
  }catch(err){
    console.error('generatePrompt error:',err);
  }
}

function copyPrompt(){
  try{
    var t=document.getElementById('pOut');
    if(!t||!t.value){toast('Erst „🔄 Prompt generieren" klicken!');return}
    var btn=document.getElementById('copyBtn');
    var onSuccess=function(){
      toast('✓ Prompt kopiert – jetzt in Claude/Gemini einfügen');
      if(btn){btn.textContent='✓ Kopiert!';setTimeout(function(){btn.textContent='📋 Prompt kopieren'},2000)}
    };
    if(navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(t.value).then(onSuccess).catch(function(){fallbackCopy(t,onSuccess)});
    }else{fallbackCopy(t,onSuccess)}
  }catch(e){alert('Kopieren fehlgeschlagen: '+e.message)}
}
function fallbackCopy(t,onSuccess){
  t.removeAttribute('readonly');
  t.focus();t.select();t.setSelectionRange(0,99999);
  try{
    var ok=document.execCommand('copy');
    t.setAttribute('readonly','');
    if(ok)onSuccess();else toast('Bitte manuell markieren & kopieren (Cmd+A, Cmd+C)');
  }catch(e){t.setAttribute('readonly','');toast('Bitte manuell markieren & kopieren')}
}

// ═══════════════ CLAUDE INTEGRATION (1-Click Open) ═══════════════
function openClaudeWithPrompt(){
  var promptText=document.getElementById('pOut').value;
  if(!promptText||promptText.length<50){toast('Erst Prompt generieren!');return}

  // Save the metadata so we know what to do on return
  var meta={
    quelle:'Claude',
    nische:document.getElementById('pNische').value,
    sprache:document.getElementById('pSprache').value,
    timestamp:Date.now()
  };
  try{localStorage.setItem('wika_pending_claude',JSON.stringify(meta))}catch(e){}

  // Copy prompt to clipboard
  var copied=false;
  var doCopy=function(){
    if(navigator.clipboard&&navigator.clipboard.writeText){
      return navigator.clipboard.writeText(promptText);
    }else{
      // fallback
      var ta=document.getElementById('pOut');
      ta.removeAttribute('readonly');ta.focus();ta.select();
      try{document.execCommand('copy')}catch(e){}
      ta.setAttribute('readonly','');
      return Promise.resolve();
    }
  };

  doCopy().then(function(){
    copied=true;
    // Open Claude in new tab
    window.open('https://claude.ai/new','_blank');
    // Show the response modal after a short delay
    closePromptModal();
    setTimeout(function(){
      showClaudeInstruction();
    },400);
  }).catch(function(){
    // Even if copy fails, open Claude and show modal with fallback instructions
    window.open('https://claude.ai/new','_blank');
    closePromptModal();
    setTimeout(showClaudeInstruction,400);
  });
}

function showClaudeInstruction(){
  document.getElementById('claudeResp').value='';
  document.getElementById('parsePreview').style.display='none';
  document.getElementById('claudeImportBtn').disabled=true;
  document.getElementById('claudeImportBtn').style.opacity='.5';
  document.getElementById('claudeModal').classList.add('show');
  // Show informative toast
  toast('✓ Prompt kopiert – in Claude mit ⌘V einfügen, Antwort kopieren, hierher zurück');
  setTimeout(function(){document.getElementById('claudeResp').focus()},200);
}

function closeClaudeModal(){document.getElementById('claudeModal').classList.remove('show')}

// Smart parser for Perplexity-style markdown answers (numbered lists, headers, descriptions)
function parsePerplexityMarkdown(text){
  if(!text)return [];
  var ideas=[];

  // Pre-clean: remove citation markers like [1], [2], (1), etc.
  var cleaned=text.replace(/\[\d+\]/g,'').replace(/\[citation:?\s*\d+\]/gi,'');

  // Strategy 1: Split by numbered headings (### 1. Name, ## 1. Name, **1. Name**, 1. **Name**, ## Idee 1: Name)
  // Common Perplexity formats:
  //   ### 1. Faltbare Wasserflasche
  //   **1. Faltbare Wasserflasche**
  //   1. **Faltbare Wasserflasche**
  //   ## Idee 1: Faltbare Wasserflasche
  //   ## Produkt 1 - Faltbare Wasserflasche

  var blockSplitRegex=/(?:^|\n)\s*(?:#{1,4}\s*)?(?:\*\*)?(?:Idee\s+|Produkt\s+|Vorschlag\s+|Produktidee\s+)?(\d+)\s*[.\):\-–—]\s*(?:\*\*)?\s*([^\n*]+?)(?:\*\*)?(?=\n|$)/g;
  var matches=[];
  var m;
  var lastEnd=0;
  while((m=blockSplitRegex.exec(cleaned))!==null){
    matches.push({num:parseInt(m[1]),title:m[2].trim().replace(/^\*+|\*+$/g,'').replace(/[:\-–—]\s*$/,''),start:m.index,headerEnd:m.index+m[0].length});
  }

  if(matches.length>=2){
    // Slice content between matches
    for(var i=0;i<matches.length;i++){
      var startContent=matches[i].headerEnd;
      var endContent=i+1<matches.length?matches[i+1].start:cleaned.length;
      var bodyText=cleaned.substring(startContent,endContent).trim();
      var idea=parseIdeaBlock(matches[i].title,bodyText);
      if(idea&&idea.name)ideas.push(idea);
    }
    if(ideas.length>0)return ideas;
  }

  // Strategy 2: Bold-headed paragraphs (**Name**\nbeschreibung...)
  var boldHeaders=cleaned.match(/\*\*([^*\n]{5,80})\*\*\s*\n([\s\S]+?)(?=\n\*\*[^*\n]{5,80}\*\*|$)/g);
  if(boldHeaders&&boldHeaders.length>=2){
    boldHeaders.forEach(function(block){
      var headerMatch=block.match(/^\*\*([^*\n]+)\*\*\s*\n([\s\S]+)/);
      if(headerMatch){
        var title=headerMatch[1].trim().replace(/^\d+[.\)]\s*/,'');
        var body=headerMatch[2].trim();
        var idea=parseIdeaBlock(title,body);
        if(idea&&idea.name)ideas.push(idea);
      }
    });
    if(ideas.length>0)return ideas;
  }

  return ideas;
}

// Parse a single idea block: extract structured fields from natural-language description
function parseIdeaBlock(title,body){
  if(!title||title.length<3)return null;
  // Skip non-product headers (sources, summary, intro etc.)
  if(/^(quellen|sources|zusammenfassung|summary|fazit|einleitung|introduction|conclusion|hinweis|note)/i.test(title))return null;

  var idea={
    name:fixEnc(title.substring(0,80)),
    kategorie:'',
    potenzial:'Mittel',
    vkPreis:0,
    marktgroesse:'',
    zielgruppe:'',
    differenzierung:'',
    warum:'',
    risiken:''
  };

  // Try to extract structured fields by label patterns (German + English)
  // Common patterns: "Kategorie: ...", "**Preis:** ...", "- Zielgruppe: ..."
  var fieldPatterns=[
    {key:'kategorie',re:/(?:kategorie|category|nische|bereich)\s*:?\s*\*?\*?\s*([^\n]+)/i},
    {key:'vkPreis',re:/(?:preis|price|verkaufspreis|vk[\-\s]?preis)\s*:?\s*\*?\*?\s*([0-9]+(?:[.,]\d{1,2})?)/i,parse:function(v){return parseFloat(v.replace(',','.'))}},
    {key:'marktgroesse',re:/(?:markt(?:größe|groesse)?|marktpotenzial|market(?:size)?|nachfrage|demand|suchvolumen|search\s*volume)\s*:?\s*\*?\*?\s*([^\n]+)/i},
    {key:'zielgruppe',re:/(?:zielgruppe|target(?:\s*group)?|kundengruppe|kunden)\s*:?\s*\*?\*?\s*([^\n]+)/i},
    {key:'differenzierung',re:/(?:differenzierung|differentiation|usp|alleinstellung|unique\s*selling)\s*:?\s*\*?\*?\s*([^\n]+)/i},
    {key:'warum',re:/(?:warum(?:\s+interessant)?|why|begr(?:ü|ue)ndung|reason|chance|opportunity|potenzial|potential)\s*:?\s*\*?\*?\s*([^\n]+)/i},
    {key:'risiken',re:/(?:risiken|risks?|herausforderungen|challenges|nachteile|hindernisse)\s*:?\s*\*?\*?\s*([^\n]+)/i},
    {key:'potenzial',re:/(?:potenzial[\-\s]?bewertung|potential[\-\s]?rating|bewertung|rating)\s*:?\s*\*?\*?\s*(hoch|mittel|niedrig|high|medium|low)/i}
  ];

  fieldPatterns.forEach(function(p){
    var m=body.match(p.re);
    if(m&&m[1]){
      var val=m[1].trim().replace(/^\*+|\*+$/g,'').replace(/[*_`]/g,'');
      if(p.parse)val=p.parse(val);
      if(typeof val==='string')val=fixEnc(val);
      if(p.key==='potenzial')val=normPot(val);
      if(val&&!idea[p.key])idea[p.key]=val;
    }
  });

  // Try to extract price from anywhere if not yet set
  if(!idea.vkPreis){
    var priceMatch=body.match(/(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:€|EUR|Euro)/i);
    if(priceMatch)idea.vkPreis=parseFloat(priceMatch[1].replace(',','.'));
  }

  // Detect potenzial keywords if not yet set
  if(idea.potenzial==='Mittel'){
    if(/\b(?:sehr\s+(?:hoch|gut|stark)|hohes?\s+potenzial|hoher?\s+nachfrage|wachsend|trending|booming|stark\s+(?:nachgefragt|wachsend))\b/i.test(body)){
      idea.potenzial='Hoch';
    }else if(/\b(?:niedrig|gering|schwach|low|stagnierend|r(?:ü|ue)ckl(?:ä|ae)ufig|niedriges?\s+potenzial)\b/i.test(body)){
      idea.potenzial='Niedrig';
    }
  }

  // If no specific fields were extracted, use first 250 chars as "warum"
  if(!idea.warum&&!idea.differenzierung&&!idea.marktgroesse){
    var clean=body.replace(/\*+/g,'').replace(/\n+/g,' ').replace(/\s+/g,' ').trim();
    idea.warum=fixEnc(clean.substring(0,300));
  }

  // Try to grab a direct Amazon product link (so "Produkt finden" opens the exact product, not a search)
  var amzUrl=body.match(/https?:\/\/(?:www\.)?amazon\.[a-z.]+\/[^\s)\]]*?(?:\/dp\/|\/gp\/product\/)[A-Z0-9]{10}[^\s)\]]*/i);
  if(amzUrl){
    idea.amazonLink=amzUrl[0].replace(/[).,]+$/,'');
  }else{
    // Or a bare ASIN mentioned in the text → build a direct .de link
    var asinM=body.match(/\bASIN\s*:?\s*([A-Z0-9]{10})\b/i)||body.match(/\b(B0[A-Z0-9]{8})\b/);
    if(asinM)idea.amazonLink='https://www.amazon.de/dp/'+asinM[1].toUpperCase();
  }

  return idea;
}

// Smart JSON extractor – finds JSON array in any text
function extractJSON(text){
  if(!text)return null;
  // Pre-fix encoding issues BEFORE parsing – broken chars can break JSON
  text=fixEnc(text);
  // Try 1: direct JSON array
  var trimmed=text.trim();
  if(trimmed.startsWith('[')&&trimmed.endsWith(']')){
    try{return JSON.parse(trimmed)}catch(e){}
    var rep=tryRepairJSON(trimmed);
    if(rep)return rep;
  }
  // Try 2: markdown code block ```json ... ```
  var mdMatch=text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if(mdMatch){
    var jsonContent=mdMatch[1].trim();
    try{return JSON.parse(jsonContent)}catch(e){}
    var rep2=tryRepairJSON(jsonContent);
    if(rep2)return rep2;
  }
  // Try 3: find first [ and last ] – BUT properly account for strings
  // Use bracket-aware scanning
  var arrayBounds=findJSONArrayBounds(text);
  if(arrayBounds){
    var slice=text.substring(arrayBounds.start,arrayBounds.end+1);
    try{return JSON.parse(slice)}catch(e){
      var rep3=tryRepairJSON(slice);
      if(rep3)return rep3;
    }
  }
  // Try 4: fallback to first [ to last ]
  var first=text.indexOf('[');
  var last=text.lastIndexOf(']');
  if(first>-1&&last>first){
    var slice2=text.substring(first,last+1);
    var rep4=tryRepairJSON(slice2);
    if(rep4)return rep4;
  }
  // Try 5: individual objects – find all {...} blocks and wrap in array
  var objects=[];
  var depth=0,start=-1;
  var inStr=false,strCh='';
  for(var i=0;i<text.length;i++){
    var ch=text[i],prev=i>0?text[i-1]:'';
    if(inStr){
      if(ch===strCh&&prev!=='\\')inStr=false;
      continue;
    }
    if(ch==='"'||ch==="'"){inStr=true;strCh=ch;continue}
    if(ch==='{'){if(depth===0)start=i;depth++}
    else if(ch==='}'){depth--;if(depth===0&&start>-1){
      try{
        var blockText=text.substring(start,i+1);
        var obj=JSON.parse(blockText);
        if(obj&&(obj.name||obj.produkt||obj.title))objects.push(obj);
      }catch(e){
        var repObj=tryRepairJSON(text.substring(start,i+1));
        if(repObj){
          if(Array.isArray(repObj))objects=objects.concat(repObj);
          else if(repObj.name||repObj.produkt||repObj.title)objects.push(repObj);
        }
      }
      start=-1;
    }}
  }
  if(objects.length>0)return objects;
  return null;
}

// Find the actual bounds of a JSON array, ignoring brackets inside strings
function findJSONArrayBounds(text){
  var first=text.indexOf('[');
  if(first===-1)return null;
  var depth=0;
  var inStr=false;
  var strCh='';
  for(var i=first;i<text.length;i++){
    var ch=text[i],prev=i>0?text[i-1]:'';
    if(inStr){
      if(ch===strCh&&prev!=='\\')inStr=false;
      continue;
    }
    if(ch==='"'||ch==="'"){inStr=true;strCh=ch;continue}
    if(ch==='['){depth++}
    else if(ch===']'){depth--;if(depth===0)return{start:first,end:i}}
  }
  return null;
}

// Repair common JSON issues, especially markdown links [text](url) inside string values
function tryRepairJSON(text){
  if(!text)return null;
  var attempts=[];

  // Attempt 1: Just escape brackets/braces inside string values
  attempts.push(function(){
    return repairBracketsInStrings(text);
  });

  // Attempt 2: Convert markdown links [text](url) to plain text
  attempts.push(function(){
    var t=text.replace(/\[([^\]]+)\]\(([^)]+)\)/g,'$1 ($2)');
    return t;
  });

  // Attempt 3: Both fixes combined + cleanup
  attempts.push(function(){
    var t=text;
    // Convert markdown links first
    t=t.replace(/\[([^\]]+)\]\(([^)]+)\)/g,'$1 ($2)');
    // Then fix brackets in strings
    t=repairBracketsInStrings(t);
    // Other common fixes
    t=t.replace(/,\s*(\]|\})/g,'$1');// trailing commas
    return t;
  });

  // Attempt 4: Remove citation insertions BETWEEN JSON properties
  // This handles Perplexity's habit of dropping [link](url) markers between fields:
  //   "warum": "...", [dype](https://...)
  //   "risiken": "..."
  attempts.push(function(){
    var t=text;
    // Remove markdown links that appear OUTSIDE of strings (between properties)
    t=removeOuterMarkdownLinks(t);
    // Remove trailing citation markers like [1], [2] outside strings
    t=removeOuterCitations(t);
    // Then convert any remaining markdown links inside strings to plain text
    t=t.replace(/\[([^\]]+)\]\(([^)]+)\)/g,'$1');
    t=repairBracketsInStrings(t);
    t=t.replace(/,\s*(\]|\})/g,'$1');
    // Also handle stray commas immediately followed by a property (no value before)
    t=t.replace(/,\s*,/g,',');
    return t;
  });

  // Attempt 5: Aggressive – strip everything that looks like an external citation
  attempts.push(function(){
    var t=text;
    t=removeOuterMarkdownLinks(t);
    t=removeOuterCitations(t);
    t=t.replace(/\[([^\]]+)\]\(([^)]+)\)/g,'$1');// strip remaining md links
    t=t.replace(/\[\d+\]/g,'');// citation markers
    t=repairBracketsInStrings(t);
    t=t.replace(/,\s*(\]|\})/g,'$1');
    t=t.replace(/,\s*,/g,',');
    return t;
  });

  for(var i=0;i<attempts.length;i++){
    try{
      var fixed=attempts[i]();
      var parsed=JSON.parse(fixed);
      return parsed;
    }catch(e){}
  }
  return null;
}

// Remove markdown links [text](url) that are OUTSIDE of string values (between properties)
function removeOuterMarkdownLinks(text){
  var out='';
  var inStr=false,strCh='';
  var i=0;
  while(i<text.length){
    var ch=text[i],prev=i>0?text[i-1]:'';
    if(inStr){
      if(ch===strCh&&prev!=='\\')inStr=false;
      out+=ch;i++;continue;
    }
    if(ch==='"'){inStr=true;strCh=ch;out+=ch;i++;continue}
    // Outside string: check for markdown link pattern [text](url)
    if(ch==='['){
      // Look ahead for ]( ... )
      var rest=text.substring(i);
      var mdMatch=rest.match(/^\[([^\]]+)\]\(([^)]+)\)/);
      if(mdMatch){
        // Skip the entire markdown link
        i+=mdMatch[0].length;
        continue;
      }
    }
    out+=ch;i++;
  }
  return out;
}

// Remove citation markers like [1], [2] OUTSIDE of strings
function removeOuterCitations(text){
  var out='';
  var inStr=false,strCh='';
  var i=0;
  while(i<text.length){
    var ch=text[i],prev=i>0?text[i-1]:'';
    if(inStr){
      if(ch===strCh&&prev!=='\\')inStr=false;
      out+=ch;i++;continue;
    }
    if(ch==='"'){inStr=true;strCh=ch;out+=ch;i++;continue}
    if(ch==='['){
      var rest=text.substring(i);
      var citMatch=rest.match(/^\[\d+\]/);
      if(citMatch){
        i+=citMatch[0].length;
        continue;
      }
    }
    out+=ch;i++;
  }
  return out;
}

// Walk through JSON text and escape unescaped brackets/braces inside string values
function repairBracketsInStrings(text){
  var out='';
  var inStr=false;
  var strCh='';
  for(var i=0;i<text.length;i++){
    var ch=text[i];
    var prev=i>0?text[i-1]:'';
    if(inStr){
      if(ch===strCh&&prev!=='\\'){
        inStr=false;
        out+=ch;
        continue;
      }
      // Inside a string: escape problematic chars that break JSON parsing
      if(ch==='"'&&prev!=='\\'){
        // unescaped quote that's not the closing quote
        out+='\\"';
        continue;
      }
      // Convert literal newlines/tabs to escaped versions
      if(ch==='\n'){out+='\\n';continue}
      if(ch==='\r'){out+='\\r';continue}
      if(ch==='\t'){out+='\\t';continue}
      out+=ch;
    }else{
      if(ch==='"'){inStr=true;strCh=ch;out+=ch;continue}
      out+=ch;
    }
  }
  return out;
}

// Live preview as user pastes
function previewParse(){
  var txt=document.getElementById('claudeResp').value;
  var preview=document.getElementById('parsePreview');
  var result=document.getElementById('parseResult');
  var btn=document.getElementById('claudeImportBtn');

  if(!txt.trim()){
    preview.style.display='none';
    btn.disabled=true;btn.style.opacity='.5';
    return;
  }

  var parsed=extractJSON(txt);
  preview.style.display='block';

  if(parsed&&Array.isArray(parsed)&&parsed.length>0){
    var valid=parsed.filter(function(o){return o&&(o.name||o.produkt||o.title)});
    if(valid.length>0){
      var html='<div style="color:var(--gn);font-weight:700;margin-bottom:8px">✓ '+valid.length+' Ideen erkannt</div>';
      html+='<div style="font-size:11px;color:var(--tx2);max-height:140px;overflow-y:auto">';
      valid.slice(0,5).forEach(function(o,i){
        html+='<div style="padding:4px 0;border-bottom:1px solid var(--bd)">'+(i+1)+'. <b style="color:var(--ac)">'+esc((o.name||o.produkt||o.title||'').substring(0,60))+'</b>';
        if(o.kategorie)html+=' – '+esc(o.kategorie);
        if(o.vkPreis||o.preis)html+=' – '+fmt(o.vkPreis||o.preis)+'€';
        html+='</div>';
      });
      if(valid.length>5)html+='<div style="padding:4px 0;color:var(--tx3)">... und '+(valid.length-5)+' weitere</div>';
      html+='</div>';
      result.innerHTML=html;
      btn.disabled=false;btn.style.opacity='1';
      btn.textContent='📥 '+valid.length+' Ideen importieren';
    }else{
      result.innerHTML='<div style="color:var(--or)">⚠️ JSON gefunden, aber keine gültigen Produktideen (fehlt „name"-Feld?)</div>';
      btn.disabled=true;btn.style.opacity='.5';
    }
  }else{
    result.innerHTML='<div style="color:var(--or)">⚠️ Kein gültiges JSON erkannt. Füge die komplette Claude-Antwort ein – idealerweise mit dem JSON-Codeblock.</div>';
    btn.disabled=true;btn.style.opacity='.5';
  }
}

function importClaudeResponse(){
  var txt=document.getElementById('claudeResp').value;
  var parsed=extractJSON(txt);
  if(!parsed||!Array.isArray(parsed)){toast('Kein JSON erkannt');return}

  // Get metadata from pending session
  var meta={};
  try{meta=JSON.parse(localStorage.getItem('wika_pending_claude')||'{}')}catch(e){}
  var quelle=meta.quelle||'Claude';

  var count=0;
  parsed.forEach(function(o){
    if(!o||(!o.name&&!o.produkt&&!o.title))return;
    D.ideen.push(normalizeIdee(o,quelle,'Zu prüfen'));
    count++;
  });

  if(count>0){
    save();renderIdeen();
    closeClaudeModal();
    // cleanup pending
    try{localStorage.removeItem('wika_pending_claude')}catch(e){}
    toast('✓ '+count+' Ideen in Pool importiert');
    go('ideen');
  }else{
    toast('Keine gültigen Ideen gefunden');
  }
}

// ═══════════════ PERPLEXITY INTEGRATION ═══════════════
function openPerplexityWithPrompt(){
  var promptText=document.getElementById('pOut').value;
  if(!promptText||promptText.length<50){toast('Erst Prompt generieren!');return}

  // Save metadata
  var meta={
    quelle:'Perplexity',
    nische:document.getElementById('pNische').value,
    sprache:document.getElementById('pSprache').value,
    timestamp:Date.now()
  };
  try{localStorage.setItem('wika_pending_perplexity',JSON.stringify(meta))}catch(e){}

  // Copy prompt to clipboard
  var doCopy=function(){
    if(navigator.clipboard&&navigator.clipboard.writeText){
      return navigator.clipboard.writeText(promptText);
    }else{
      var ta=document.getElementById('pOut');
      ta.removeAttribute('readonly');ta.focus();ta.select();
      try{document.execCommand('copy')}catch(e){}
      ta.setAttribute('readonly','');
      return Promise.resolve();
    }
  };

  doCopy().then(function(){
    // Open Perplexity in new tab
    window.open('https://www.perplexity.ai/','_blank');
    closePromptModal();
    setTimeout(function(){
      showPerplexityInstruction();
    },400);
  }).catch(function(){
    window.open('https://www.perplexity.ai/','_blank');
    closePromptModal();
    setTimeout(showPerplexityInstruction,400);
  });
}

function showPerplexityInstruction(){
  document.getElementById('perplexityResp').value='';
  document.getElementById('parsePreviewPerp').style.display='none';
  document.getElementById('perplexityImportBtn').disabled=true;
  document.getElementById('perplexityImportBtn').style.opacity='.5';
  document.getElementById('perplexityModal').classList.add('show');
  toast('✓ Prompt kopiert – in Perplexity einfügen, Antwort kopieren, hierher zurück');
  setTimeout(function(){document.getElementById('perplexityResp').focus()},200);
}

function closePerplexityModal(){document.getElementById('perplexityModal').classList.remove('show')}

// Extract source URLs from Perplexity response (the citations at the end)
function extractPerplexitySources(text){
  if(!text)return [];
  var sources=[];
  var seen={};

  // Match URLs (http/https)
  var urlRegex=/https?:\/\/[^\s\)\]\>"']+/g;
  var match;
  while((match=urlRegex.exec(text))!==null){
    var url=match[0].replace(/[.,;:!?]+$/,'');// strip trailing punctuation
    if(!seen[url]){
      seen[url]=true;
      sources.push(url);
    }
    if(sources.length>=20)break;// cap
  }
  return sources;
}

function previewParsePerplexity(){
  var txt=document.getElementById('perplexityResp').value;
  var preview=document.getElementById('parsePreviewPerp');
  var result=document.getElementById('parseResultPerp');
  var btn=document.getElementById('perplexityImportBtn');

  if(!txt.trim()){
    preview.style.display='none';
    btn.disabled=true;btn.style.opacity='.5';
    return;
  }

  // Try JSON first, fallback to markdown parser
  var parsed=extractJSON(txt);
  var parseMode='JSON';
  if(!parsed||!Array.isArray(parsed)||parsed.length===0){
    parsed=parsePerplexityMarkdown(txt);
    parseMode='Markdown';
  }
  var sources=extractPerplexitySources(txt);
  preview.style.display='block';

  if(parsed&&Array.isArray(parsed)&&parsed.length>0){
    var valid=parsed.filter(function(o){return o&&(o.name||o.produkt||o.title)});
    if(valid.length>0){
      var modeLabel=parseMode==='JSON'?'aus JSON':'aus Text extrahiert';
      var html='<div style="color:var(--gn);font-weight:700;margin-bottom:8px">✓ '+valid.length+' Ideen erkannt <span style="font-weight:400;font-size:11px;color:var(--tx2)">('+modeLabel+')</span>';
      if(sources.length>0)html+=' <span style="color:#40c9d8;font-weight:500"> · '+sources.length+' Quellen</span>';
      html+='</div>';
      html+='<div style="font-size:11px;color:var(--tx2);max-height:140px;overflow-y:auto">';
      valid.slice(0,5).forEach(function(o,i){
        html+='<div style="padding:4px 0;border-bottom:1px solid var(--bd)">'+(i+1)+'. <b style="color:var(--ac)">'+esc((o.name||o.produkt||o.title||'').substring(0,60))+'</b>';
        if(o.kategorie)html+=' – '+esc(o.kategorie);
        if(o.vkPreis||o.preis)html+=' – '+fmt(o.vkPreis||o.preis)+'€';
        if(o.potenzial)html+=' <span style="color:'+(o.potenzial==='Hoch'?'var(--gn)':o.potenzial==='Niedrig'?'var(--rd)':'var(--ac)')+'">['+esc(o.potenzial)+']</span>';
        html+='</div>';
      });
      if(valid.length>5)html+='<div style="padding:4px 0;color:var(--tx3)">... und '+(valid.length-5)+' weitere</div>';
      html+='</div>';
      result.innerHTML=html;
      btn.disabled=false;btn.style.opacity='1';
      btn.textContent='📥 '+valid.length+' Ideen importieren';
    }else{
      result.innerHTML='<div style="color:var(--or)">⚠️ Keine gültigen Produktideen erkannt</div>';
      btn.disabled=true;btn.style.opacity='.5';
    }
  }else{
    if(sources.length>0){
      result.innerHTML='<div style="color:var(--or)">⚠️ Konnte keine Produktideen extrahieren ('+sources.length+' Quellen erkannt). Versuche: Numerierte Liste, Überschriften (#, ##, ###) oder fettgedruckte Produktnamen (**Name**) verwenden.</div>';
    }else{
      result.innerHTML='<div style="color:var(--or)">⚠️ Keine Ideen erkennbar. Format-Tipp: Nummerierte Liste mit Produktnamen.</div>';
    }
    btn.disabled=true;btn.style.opacity='.5';
  }
}

// Collect all Amazon PRODUCT links (/dp/ASIN or /gp/product/ASIN) from a text.
// The URL is REBUILT cleanly as https://www.amazon.<tld>/dp/<ASIN> so trailing
// markdown (**, ), tracking params, …) can never break the link.
function collectAmazonProductLinks(text){
  if(!text)return [];
  var out=[],seen={};
  var re=/https?:\/\/(?:www\.)?(amazon\.(?:[a-z]{2,3})(?:\.[a-z]{2})?)((?:\/[^\s)\]>"'*`]+?)?)\/(?:dp|gp\/product)\/([A-Z0-9]{10})/gi;
  var m;
  while((m=re.exec(text))!==null){
    var host=m[1].toLowerCase();
    var path=m[2]||'';
    var asin=m[3].toUpperCase();
    if(seen[asin])continue;
    seen[asin]=true;
    var slug;try{slug=decodeURIComponent(host+path)}catch(e){slug=host+path}
    slug=slug.toLowerCase().replace(/ä/g,'a').replace(/ö/g,'o').replace(/ü/g,'u').replace(/ß/g,'ss');
    out.push({
      url:'https://www.'+host+'/dp/'+asin,   // clean, canonical link
      asin:asin,
      slug:slug,
      hasSlug:path.replace(/^\/+/,'').length>2   // true = real product-name URL (trustworthy), false = bare /dp/ (often AI-guessed)
    });
  }
  return out;
}
// Rebuild any Amazon product link into a clean canonical https://www.amazon.<tld>/dp/ASIN
// (removes trailing markdown like ** or ), tracking params, etc. that would break the link)
function cleanAmazonUrl(url){
  if(!url)return '';
  var m=url.match(/(amazon\.(?:[a-z]{2,3})(?:\.[a-z]{2})?)\/(?:[^\s]*?\/)?(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
  if(m)return 'https://www.'+m[1].toLowerCase()+'/dp/'+m[2].toUpperCase();
  return url;
}
// Tokenize a product name into comparable keywords (lowercase, umlaut-free, words >=4 chars, no stopwords)
function ideaTokens(name){
  if(!name)return [];
  var s=name.toLowerCase().replace(/ä/g,'a').replace(/ö/g,'o').replace(/ü/g,'u').replace(/ß/g,'ss').replace(/[^a-z0-9]+/g,' ');
  var stop={der:1,die:1,das:1,und:1,fuer:1,mit:1,aus:1,set:1,the:1,for:1,and:1,with:1,von:1,den:1,ein:1,eine:1};
  return s.split(/\s+/).filter(function(w){return w.length>=4&&!stop[w]});
}
// Pick the Amazon product link whose URL-slug best matches an idea name (so each idea opens its OWN product)
function bestAmazonLinkFor(name,cands,used){
  var toks=ideaTokens(name);
  if(!toks.length)return null;
  var best=null,bestScore=0;
  cands.forEach(function(c){
    if(used[c.asin])return;
    var score=0;
    toks.forEach(function(t){if(c.slug.indexOf(t)>-1)score++;});
    if(score>bestScore){bestScore=score;best=c;}
  });
  return bestScore>=1?best:null;
}

// Check if an ASIN is a REAL Amazon product: its image-CDN entry is an actual photo,
// not the 1x1 transparent placeholder that Amazon returns for non-existent ASINs.
// (Loading an <img> needs no CORS, so this works from file:// too.)
function asinHasImage(asin){
  return new Promise(function(res){
    if(!/^[A-Z0-9]{10}$/i.test(asin)){res(false);return;}
    var img=new Image(),done=false;
    var finish=function(v){if(done)return;done=true;res(v);};
    img.onload=function(){finish(img.naturalWidth>=2&&img.naturalHeight>=2);};
    img.onerror=function(){finish(false);};
    img.src='https://images-na.ssl-images-amazon.com/images/P/'+asin.toUpperCase()+'.jpg';
    setTimeout(function(){finish(false);},5000);
  });
}
// Validate many ASINs in parallel → returns a map {ASIN:true} of the ones that really exist
function validateAsins(asins){
  return Promise.all(asins.map(function(a){
    return asinHasImage(a).then(function(ok){return ok?a.toUpperCase():null});
  })).then(function(r){var s={};r.forEach(function(a){if(a)s[a]=true;});return s;});
}
function asinOf(url){var m=(url||'').match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);return m?m[1].toUpperCase():'';}

async function importPerplexityResponse(){
  var txt=document.getElementById('perplexityResp').value;
  var parsed=extractJSON(txt);
  if(!parsed||!Array.isArray(parsed)||parsed.length===0){
    parsed=parsePerplexityMarkdown(txt);
  }
  if(!parsed||!Array.isArray(parsed)||parsed.length===0){toast('Keine Ideen erkannt');return}

  var meta={};
  try{meta=JSON.parse(localStorage.getItem('wika_pending_perplexity')||'{}')}catch(e){}
  var quelle=meta.quelle||'Perplexity';

  // Extract sources for attribution
  var sources=extractPerplexitySources(txt);
  var sourcesText=sources.length>0?sources.slice(0,8).join('\n'):'';
  // All Amazon product links in the response → assign the matching one to each idea
  var amazonCands=collectAmazonProductLinks(txt);

  // Build all ideas first (so we can do link-matching in two passes)
  var neueIdeen=[];
  parsed.forEach(function(o){
    if(!o||(!o.name&&!o.produkt&&!o.title))return;
    var idee=normalizeIdee(o,quelle,'Zu prüfen');
    if(sourcesText)idee.quellen=sourcesText;
    if(idee.amazonLink)idee.amazonLink=cleanAmazonUrl(idee.amazonLink);
    neueIdeen.push(idee);
  });

  // ── Verify every candidate ASIN really exists on Amazon (AI loves to invent them) ──
  var checkAsins={};
  amazonCands.forEach(function(c){checkAsins[c.asin]=true;});
  neueIdeen.forEach(function(i){var a=asinOf(i.amazonLink);if(a)checkAsins[a]=true;});
  var asinList=Object.keys(checkAsins);
  var valid={};
  if(asinList.length){
    toast('Prüfe '+asinList.length+' Produktlink'+(asinList.length>1?'s':'')+' …');
    try{valid=await validateAsins(asinList);}catch(e){valid={};}
  }
  var fakeCount=asinList.length-Object.keys(valid).length;
  // Drop AI-invented links; keep only verified real products as candidates
  var goodCands=amazonCands.filter(function(c){return valid[c.asin];});
  var usedAsins={};
  var hasDp=function(l){return /\/dp\/|\/gp\/product\//i.test(l||'')};

  // Clear the model's own JSON link if its ASIN is fake; otherwise reserve it
  neueIdeen.forEach(function(idee){
    var a=asinOf(idee.amazonLink);
    if(a&&!valid[a])idee.amazonLink='';
    else if(a)usedAsins[a]=true;
  });
  // Pass 1: high-confidence match by product-name words in the URL (verified links only)
  neueIdeen.forEach(function(idee){
    if(hasDp(idee.amazonLink))return;
    var match=bestAmazonLinkFor(idee.name,goodCands,usedAsins);
    if(match){idee.amazonLink=match.url;usedAsins[match.asin]=true;}
  });
  // Pass 2: assign remaining verified links to still-unlinked ideas IN ORDER
  var rest=goodCands.filter(function(c){return !usedAsins[c.asin];});
  var ri=0;
  neueIdeen.forEach(function(idee){
    if(hasDp(idee.amazonLink))return;
    if(ri<rest.length){idee.amazonLink=rest[ri].url;usedAsins[rest[ri].asin]=true;ri++;}
  });

  var count=0,linked=0;
  neueIdeen.forEach(function(idee){
    if(hasDp(idee.amazonLink))linked++;
    D.ideen.push(idee);
    count++;
  });

  if(count>0){
    save();renderIdeen();
    closePerplexityModal();
    try{localStorage.removeItem('wika_pending_perplexity')}catch(e){}
    var msg='✓ '+count+' Ideen importiert';
    if(linked>0)msg+=' · '+linked+'× 🔗 Direktlink';
    if(fakeCount>0)msg+=' · '+fakeCount+' erfundene Links verworfen → Suche';
    toast(msg);
    go('ideen');
  }else{
    toast('Keine gültigen Ideen gefunden');
  }
}

// ═══════════════ INIT ═══════════════
// Set version display
(function(){
  var v=document.getElementById('versionDisplay');
  var b=document.getElementById('buildDate');
  if(v)v.textContent='v'+WIKA_VERSION;
  if(b)b.textContent=WIKA_BUILD_DATE;
  document.title=WIKA_NAME+' v'+WIKA_VERSION;
})();

load();renderProds();renderIdeen();renderDash();renderCoaching();

// ── Etappe 2: Reminder-Engine starten ──
setTimeout(function(){
  try{
    if(D.pm){notifRunReminderEngine(true);notifUpdateBell();}
  }catch(e){}
},1500);
// Periodische Prüfung alle 60 Sekunden
setInterval(function(){
  try{
    if(D.pm){notifRunReminderEngine(true);notifUpdateBell();}
  }catch(e){}
},60000);

// Check if user returned from Claude/Perplexity with pending import
setTimeout(function(){
  try{
    // Check Perplexity first (more recent typically)
    var pendingP=localStorage.getItem('wika_pending_perplexity');
    if(pendingP){
      var metaP=JSON.parse(pendingP);
      if((Date.now()-(metaP.timestamp||0))/60000<30){
        showPendingBanner(metaP,'perplexity');
      }else{localStorage.removeItem('wika_pending_perplexity')}
    }
    var pending=localStorage.getItem('wika_pending_claude');
    if(pending){
      var meta=JSON.parse(pending);
      var ageMinutes=(Date.now()-(meta.timestamp||0))/60000;
      if(ageMinutes<30){
        showPendingBanner(meta,'claude');
      }else{
        localStorage.removeItem('wika_pending_claude');
      }
    }
  }catch(e){}
},500);

function showPendingBanner(meta,type){
  type=type||'claude';
  var isPerp=type==='perplexity';
  var banner=document.createElement('div');
  banner.id='pendingBanner_'+type;
  // Stack banners if both shown: shift Perplexity down if Claude already exists
  var topPos=isPerp?'20px':(document.getElementById('pendingBanner_perplexity')?'150px':'20px');
  var grad=isPerp?'#20808d,#176874':'#d97706,#b45309';
  var fg=isPerp?'#176874':'#b45309';
  var icon=isPerp?'🔍':'🚀';
  var label=isPerp?'Perplexity':'Claude';
  var fn=isPerp?'showPerplexityInstruction':'showClaudeInstruction';
  var key=isPerp?'wika_pending_perplexity':'wika_pending_claude';

  banner.style.cssText='position:fixed;top:'+topPos+';right:20px;z-index:400;background:linear-gradient(135deg,'+grad+');color:#fff;padding:14px 18px;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.4);max-width:340px;font-size:13px;animation:slideIn .4s cubic-bezier(.34,1.56,.64,1)';
  banner.innerHTML=
    '<div style="font-weight:700;margin-bottom:4px;display:flex;align-items:center;gap:6px">'+icon+' '+label+'-Antwort wartet</div>'+
    '<div style="font-size:12px;opacity:.9;margin-bottom:10px">Nische: <b>'+esc(meta.nische||'—')+'</b></div>'+
    '<div style="display:flex;gap:6px">'+
      '<button onclick="document.getElementById(\'pendingBanner_'+type+'\').remove();'+fn+'()" style="background:#fff;color:'+fg+';border:none;padding:7px 12px;border-radius:6px;font-weight:700;cursor:pointer;font-size:12px;flex:1">Antwort einfügen</button>'+
      '<button onclick="localStorage.removeItem(\''+key+'\');document.getElementById(\'pendingBanner_'+type+'\').remove()" style="background:rgba(255,255,255,.2);color:#fff;border:none;padding:7px 10px;border-radius:6px;cursor:pointer;font-size:12px">✕</button>'+
    '</div>';
  document.body.appendChild(banner);
  if(!document.getElementById('bannerKeyframes')){
    var style=document.createElement('style');
    style.id='bannerKeyframes';
    style.textContent='@keyframes slideIn{from{transform:translateX(400px);opacity:0}to{transform:translateX(0);opacity:1}}';
    document.head.appendChild(style);
  }
}

// ═══ Produktbild-Zoom (pzoom): Hover auf ein Thumbnail → große Vorschau daneben ═══
// Delegiert auf document — funktioniert damit in Tabelle, Pipeline und Editor,
// auch für später nachgerenderte Karten. Popup ist pointer-events:none (kein Flackern).
(function(){
  var pop=null;
  function hidePz(){if(pop&&pop.parentNode)pop.parentNode.removeChild(pop);pop=null;}
  document.addEventListener('mouseover',function(e){
    var img=e.target;
    if(!(img&&img.tagName==='IMG'&&img.classList&&img.classList.contains('pzoom')))return;
    hidePz();
    pop=document.createElement('div');
    pop.id='pzPop';
    var big=document.createElement('img');
    big.src=img.src;big.alt='';
    big.onerror=hidePz; // kaputtes Bild: kein leeres Popup stehen lassen
    pop.appendChild(big);
    document.body.appendChild(pop);
    var r=img.getBoundingClientRect(),w=280,h=280;
    var left=r.right+12;
    if(left+w>window.innerWidth-8)left=r.left-w-12; // rechts kein Platz → links andocken
    if(left<8)left=8;
    var top=Math.max(8,Math.min(window.innerHeight-h-8,r.top-60));
    pop.style.left=left+'px';pop.style.top=top+'px';
  });
  document.addEventListener('mouseout',function(e){
    if(e.target&&e.target.classList&&e.target.classList.contains('pzoom'))hidePz();
  });
  document.addEventListener('scroll',hidePz,true);
})();
