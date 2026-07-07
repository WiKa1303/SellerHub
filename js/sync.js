// ═══════════════ CLOUD-SYNC (sy…) — KONZEPT-Konten-Sync.md, Modul 1 ═══════════════
// Opt-in Konten-Sync gegen das Radar-Backend (/api/auth + /api/sync).
// Ohne Token ist dieses Modul KOMPLETT passiv (nur graues ☁️-Icon) — Offline bleibt heilig.
// Wird NACH js/app.js geladen: wrappt window.save() (Data-Layer-Schreibpfad) für den Auto-Push.
// localStorage-Keys dieses Moduls: sy_token (Session), sy_user (JSON), sy_meta (je Sync-Key:
//   {t: Zeitstempel der letzten lokalen Änderung, v: zuletzt bekannte Server-Version}).
(function(){
'use strict';

// ─── API-Basis: gleiche Logik wie radarApi() in app.js (überschreibbar via wika_radar_api) ───
var SY_API_DEFAULT='https://radar-production-388a.up.railway.app';
function syApi(){try{return (localStorage.getItem('wika_radar_api')||SY_API_DEFAULT).replace(/\/+$/,'');}catch(e){return SY_API_DEFAULT;}}

// ─── Welche Keys werden gesynct? Explizite Positivliste + Präfix-Regel. ───
// BEWUSST NICHT dabei:
//   wika_radar_cache            → Cache (wird eh neu geladen)
//   gemini_key                  → Secret (API-Keys syncen wir NICHT)
//   sy_token / sy_user / sy_meta→ Sync-Verwaltung selbst (gerätespezifische Session)
//   wika_lastSnapshotDay / wika_lastExport → gerätespezifische Backup-Zeitstempel
//   wika_radar_api              → gerätespezifischer API-Override (z.B. lokales Backend)
//   wika_pending_claude / wika_pending_perplexity → transiente Zwischenablage-Roundtrips
//   wika_produktrecherche       → Alt-Format v1 (längst nach wika_v2 migriert)
//   wika_pipeline_migrated_v2   → lokales Migrationsflag (Migration ist idempotent)
//   wika_backup_* / WikaAuth-Userstore → lokale Snapshots bzw. lokaler Login (v1 unangetastet)
var SY_KEYS=[
  'wika_v2',              // Haupt-Datenkey (Data-Layer D, SK in app.js)
  'wika_radar_profile',   // Seller-Profil fürs Radar
  'shub_prodView',        // Ansichts-Einstellung Produktliste (Tabelle/Karten)
  'bsr_calib',            // BSR-Kalibrierung (eigene Schätz-Stützpunkte)
  'ig_usp_notext',        // Bildstudio-Einstellung (USP-Bilder ohne Text)
  'wika_news_state'       // News & Events: Favoriten/Gelesen/Ausgeblendet je Item
];
var SY_PREFIXES=[
  'wika_info_dismissed_'  // weggeklickte Info-Boxen (UI-Einstellung, geräteübergreifend sinnvoll)
];
function syIsSyncKey(k){
  if(SY_KEYS.indexOf(k)>=0)return true;
  for(var i=0;i<SY_PREFIXES.length;i++)if(k.indexOf(SY_PREFIXES[i])===0)return true;
  return false;
}
// Haupt-Datenkey: SK aus app.js, falls vorhanden (sync.js lädt danach) — sonst Fallback.
function syMainKey(){return (typeof window.SK==='string'&&window.SK)?window.SK:'wika_v2';}
// Alle aktuell lokal vorhandenen syncbaren Keys (Positivliste + Präfix-Treffer).
function syLocalKeys(){
  var out=[];
  try{
    for(var i=0;i<localStorage.length;i++){
      var k=localStorage.key(i);
      if(syIsSyncKey(k))out.push(k);
    }
  }catch(e){}
  return out;
}

// ─── Token / User / Meta (localStorage) ───
function syToken(){try{return localStorage.getItem('sy_token')||'';}catch(e){return '';}}
function syUser(){try{return JSON.parse(localStorage.getItem('sy_user')||'null');}catch(e){return null;}}
function syMeta(){try{return JSON.parse(localStorage.getItem('sy_meta')||'{}')||{};}catch(e){return {};}}
function sySetMeta(m){try{localStorage.setItem('sy_meta',JSON.stringify(m));}catch(e){}}
function syDropToken(){
  try{localStorage.removeItem('sy_token');localStorage.removeItem('sy_user');}catch(e){}
  sySetState('off');
}

function syToast(m){if(typeof window.toast==='function')window.toast(m);}

// ─── syFetch: fetch mit Bearer-Header; 401 → Token verwerfen + Status zurücksetzen ───
function syFetch(pfad,opts){
  opts=opts||{};
  var h={};for(var k in (opts.headers||{}))h[k]=opts.headers[k];
  var t=syToken();
  if(t)h['Authorization']='Bearer '+t;
  opts.headers=h;
  return fetch(syApi()+pfad,opts).then(function(res){
    if(res.status===401&&t){
      syDropToken();
      syToast('☁️ Cloud-Sitzung abgelaufen — bitte neu anmelden');
    }
    return res;
  });
}

// ─── Merge-Regel (Key-Ebene, last-write-wins): Server gewinnt, wenn sein updated_at
//     NEUER ist als der lokale Änderungs-Zeitstempel (sy_meta[key].t; fehlend = 0,
//     d.h. nie lokal geändert/gesynct → Server gewinnt = Migration beim ersten Pull). ───
function syMerge(serverUpdatedAt,localTs){
  var s=new Date(serverUpdatedAt).getTime()||0;
  var l=Number(localTs)||0;
  return s>l?'server':'local';
}
window.syMerge=syMerge; // exponiert für Tests (Playwright-Check)

// ─── Status-Icon (Sidebar): off=grau · ok=grün · pending=orange · error=rot ───
var syState='off';
function sySetState(state,detail){
  syState=state;
  var btn=document.getElementById('syBtn'),dot=document.getElementById('syBtnDot');
  if(!btn||!dot)return;
  var map={
    off:    {c:'#8a93ad', t:'Cloud-Konto: nicht angemeldet — klicken zum Anmelden', o:'.55'},
    ok:     {c:'#22c55e', t:'Cloud-Sync: synchron'+(syUser()?' ('+syUser().email+')':''), o:'1'},
    pending:{c:'#f59e0b', t:'Cloud-Sync: Änderungen werden übertragen …', o:'1'},
    error:  {c:'#ef4444', t:'Cloud-Sync-Fehler: '+(detail||'unbekannt'), o:'1'}
  };
  var m=map[state]||map.off;
  dot.style.background=m.c;
  btn.style.opacity=m.o;
  btn.title=m.t;
  // Angemeldet ersetzt der Profil-Chip das ☁️-Symbol — Status-Punkt dort mitführen
  var pd=document.getElementById('pcDot');
  if(pd)pd.style.background=m.c;
}

// ─── Push (debounced 3 s): geänderte Keys sammeln, dann PUT /api/sync ───
var syPending={};   // key → true (Warteschlange)
var syTimer=null;
var syPushing=false;
function syQueue(key){
  if(!syIsSyncKey(key))return;
  // Lokale Änderung IMMER mit Zeitstempel vermerken (auch ohne Token) — so gewinnt
  // beim späteren Login der tatsächlich neuere Stand (Merge-Grundlage).
  var meta=syMeta();
  meta[key]=meta[key]||{};
  meta[key].t=Date.now();
  sySetMeta(meta);
  if(!syToken())return;
  syPending[key]=true;
  sySetState('pending');
  if(syTimer)clearTimeout(syTimer);
  syTimer=setTimeout(syPushNow,3000);
}

function syPushNow(){
  if(syTimer){clearTimeout(syTimer);syTimer=null;}
  if(!syToken()||syPushing)return;
  var keys=Object.keys(syPending);
  if(!keys.length){sySetState('ok');return;}
  syPending={};
  var meta=syMeta();
  var items=[];
  keys.forEach(function(k){
    var v=null;try{v=localStorage.getItem(k);}catch(e){}
    if(v===null)return; // gelöschte Keys syncen wir nicht (kein Delete-Protokoll in v1)
    items.push({key:k,value:v,baseVersion:(meta[k]&&meta[k].v)||0});
  });
  if(!items.length){sySetState('ok');return;}
  syPushing=true;
  sySetState('pending');
  syFetch('/api/sync',{
    method:'PUT',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({items:items})
  }).then(function(res){
    return res.json().catch(function(){return {};}).then(function(d){
      syPushing=false;
      if(res.status===409){
        // Konflikt: anderes Gerät war schneller → Server-Stand übernehmen (sichtbar).
        (d.applied||[]).forEach(function(a){meta[a.key]={t:Date.now(),v:a.version};});
        var reload=false;
        (d.conflicts||[]).forEach(function(c){
          var val=(typeof c.value==='string')?c.value:JSON.stringify(c.value);
          try{localStorage.setItem(c.key,val);}catch(e){}
          meta[c.key]={t:new Date(c.updated_at).getTime()||Date.now(),v:c.version};
          if(c.key===syMainKey())reload=true;
        });
        sySetMeta(meta);
        sySetState('ok');
        syToast('☁️ Neuerer Stand von anderem Gerät übernommen');
        if(reload)setTimeout(function(){location.reload();},1300); // Toast kurz zeigen, dann D neu initialisieren
        return;
      }
      if(!res.ok)throw new Error(d.error||('HTTP '+res.status));
      (d.items||[]).forEach(function(a){
        meta[a.key]=meta[a.key]||{};
        meta[a.key].v=a.version;
      });
      sySetMeta(meta);
      // Während des Pushs neu angefallene Änderungen? Dann bleibt es orange und läuft weiter.
      if(Object.keys(syPending).length){syTimer=setTimeout(syPushNow,3000);sySetState('pending');}
      else sySetState('ok');
    });
  }).catch(function(e){
    syPushing=false;
    keys.forEach(function(k){syPending[k]=true;}); // zurück in die Warteschlange
    sySetState('error',e&&e.message||'Netzwerkfehler');
  });
}

// ─── Pull (bei Start/Login): GET /api/sync, je Key neuerer Stand gewinnt ───
function syPull(){
  if(!syToken())return Promise.resolve();
  sySetState('pending');
  return syFetch('/api/sync').then(function(res){
    if(!res.ok)return res.json().catch(function(){return {};}).then(function(d){throw new Error(d.error||('HTTP '+res.status));});
    return res.json();
  }).then(function(d){
    var meta=syMeta();
    var serverKeys={};
    var reload=false;
    (d.items||[]).forEach(function(it){
      if(!syIsSyncKey(it.key))return;
      serverKeys[it.key]=true;
      var localTs=(meta[it.key]&&meta[it.key].t)||0;
      if(syMerge(it.updated_at,localTs)==='server'){
        var val=(typeof it.value==='string')?it.value:JSON.stringify(it.value);
        var cur=null;try{cur=localStorage.getItem(it.key);}catch(e){}
        meta[it.key]={t:new Date(it.updated_at).getTime()||Date.now(),v:it.version};
        if(cur!==val){
          try{localStorage.setItem(it.key,val);}catch(e){}
          if(it.key===syMainKey())reload=true;
        }
      }else{
        // Lokal ist neuer: Server-Version nur als baseVersion merken, dann hochschieben.
        meta[it.key]=meta[it.key]||{};
        meta[it.key].v=it.version;
        syPending[it.key]=true;
      }
    });
    // Lokale syncbare Keys, die der Server noch gar nicht kennt → hochladen (Erst-Migration).
    syLocalKeys().forEach(function(k){if(!serverKeys[k])syPending[k]=true;});
    sySetMeta(meta);
    if(reload){
      syToast('☁️ Neuere Cloud-Daten übernommen — lade neu …');
      setTimeout(function(){location.reload();},1300);
      return;
    }
    if(Object.keys(syPending).length){if(syTimer)clearTimeout(syTimer);syTimer=setTimeout(syPushNow,3000);sySetState('pending');}
    else sySetState('ok');
  }).catch(function(e){
    if(syToken())sySetState('error',e&&e.message||'Netzwerkfehler'); // 401 hat den Token schon verworfen (State=off)
  });
}

// ─── Modal (☁️ Cloud-Konto): Anmelden / Registrieren ───
var sy_mode='login';
function syOpen(){
  sy_mode='login';syApplyMode();
  var err=document.getElementById('syError');if(err)err.style.display='none';
  var pw=document.getElementById('syPw');if(pw)pw.value='';
  var mo=document.getElementById('syModal');if(mo)mo.classList.add('show');
  var em=document.getElementById('syEmail');if(em)setTimeout(function(){em.focus();},50);
}
function syClose(){
  var mo=document.getElementById('syModal');if(mo)mo.classList.remove('show');
  // „Storage-nahe" Settings-Keys beim Schließen mitnehmen: direkte setItem-Schreiber
  // (z.B. shub_prodView, bsr_calib) laufen nicht über save() — hier nachziehen.
  if(syToken()){syLocalKeys().forEach(function(k){syPending[k]=true;});if(syTimer)clearTimeout(syTimer);syTimer=setTimeout(syPushNow,500);}
}
function syMode(m){sy_mode=m;syApplyMode();}
function syApplyMode(){
  var reg=sy_mode==='register';
  var els=document.querySelectorAll('.sy-reg-only');
  for(var i=0;i<els.length;i++)els[i].style.display=reg?'':'none';
  var tl=document.getElementById('syTabLogin'),tr=document.getElementById('syTabReg'),sb=document.getElementById('sySubmitBtn');
  if(tl)tl.classList.toggle('btn-p',!reg);
  if(tr)tr.classList.toggle('btn-p',reg);
  if(sb)sb.textContent=reg?'Konto erstellen':'Anmelden';
  var pw=document.getElementById('syPw');if(pw)pw.autocomplete=reg?'new-password':'current-password';
}
function sySubmitErr(msg){var e=document.getElementById('syError');if(e){e.textContent=msg;e.style.display='block';}}
function sySubmit(){
  var email=(document.getElementById('syEmail').value||'').trim();
  var pw=document.getElementById('syPw').value||'';
  var err=document.getElementById('syError');if(err)err.style.display='none';
  if(!email||!pw)return sySubmitErr('Bitte E-Mail und Passwort eingeben.');
  var sb=document.getElementById('sySubmitBtn');if(sb)sb.disabled=true;
  var done=function(){if(sb)sb.disabled=false;};
  if(sy_mode==='register'){
    var name=(document.getElementById('syName').value||'').trim();
    var code=(document.getElementById('syCode').value||'').trim();
    if(!code){done();return sySubmitErr('Bitte den Einladungscode eingeben.');}
    syFetch('/api/auth/register',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email:email,password:pw,displayName:name,inviteCode:code})
    }).then(function(res){return res.json().catch(function(){return {};}).then(function(d){
      if(!res.ok){done();return sySubmitErr(d.error||('Registrierung fehlgeschlagen (HTTP '+res.status+')'));}
      syLogin(email,pw,done); // frisch registriert → direkt anmelden
    });}).catch(function(){done();sySubmitErr('Server nicht erreichbar.');});
  }else{
    syLogin(email,pw,done);
  }
}
function syLogin(email,pw,done){
  syFetch('/api/auth/login',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({email:email,password:pw})
  }).then(function(res){return res.json().catch(function(){return {};}).then(function(d){
    done();
    if(!res.ok)return sySubmitErr(d.error||('Anmeldung fehlgeschlagen (HTTP '+res.status+')'));
    try{
      localStorage.setItem('sy_token',d.token);
      localStorage.setItem('sy_user',JSON.stringify(d.user||{email:email}));
    }catch(e){return sySubmitErr('Token konnte nicht gespeichert werden (Speicher voll?).');}
    var mo=document.getElementById('syModal');if(mo)mo.classList.remove('show');
    syToast('☁️ Angemeldet als '+email+' — Daten werden abgeglichen …');
    sySetState('pending');
    syPull(); // Erste Anmeldung = automatische Daten-Migration (Pull, dann Push des Rests)
  });}).catch(function(){done();sySubmitErr('Server nicht erreichbar.');});
}
function syLogout(){
  syMenuHide();
  syFetch('/api/auth/logout',{method:'POST'}).catch(function(){}); // fire-and-forget, Session serverseitig widerrufen
  syDropToken();
  syToast('☁️ Vom Cloud-Konto abgemeldet — Daten bleiben lokal erhalten');
}

// ─── Passwort ändern (POST /api/auth/change-password, Modul 4) ───
function syPwErr(msg){var e=document.getElementById('syPwError');if(e){e.textContent=msg;e.style.display='block';}}
function syPwOpen(){
  syMenuHide();
  if(!syToken())return syOpen();
  ['syPwCur','syPwNew','syPwNew2'].forEach(function(id){var el=document.getElementById(id);if(el)el.value='';});
  var err=document.getElementById('syPwError');if(err)err.style.display='none';
  var mo=document.getElementById('syPwModal');if(mo)mo.classList.add('show');
  var cur=document.getElementById('syPwCur');if(cur)setTimeout(function(){cur.focus();},50);
}
function syPwClose(){var mo=document.getElementById('syPwModal');if(mo)mo.classList.remove('show');}
function syPwSubmit(){
  var cur=document.getElementById('syPwCur').value||'';
  var nw=document.getElementById('syPwNew').value||'';
  var nw2=document.getElementById('syPwNew2').value||'';
  var err=document.getElementById('syPwError');if(err)err.style.display='none';
  if(!cur||!nw)return syPwErr('Bitte alle Felder ausfüllen.');
  if(nw.length<8)return syPwErr('Das neue Passwort braucht mindestens 8 Zeichen.');
  if(nw!==nw2)return syPwErr('Die neuen Passwörter stimmen nicht überein.');
  if(nw===cur)return syPwErr('Das neue Passwort muss sich vom aktuellen unterscheiden.');
  var sb=document.getElementById('syPwSubmitBtn');if(sb)sb.disabled=true;
  syFetch('/api/auth/change-password',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({currentPassword:cur,newPassword:nw})
  }).then(function(res){return res.json().catch(function(){return {};}).then(function(d){
    if(sb)sb.disabled=false;
    if(!res.ok)return syPwErr(d.error||('Passwort-Änderung fehlgeschlagen (HTTP '+res.status+')'));
    syPwClose();
    syToast('🔑 Cloud-Passwort geändert');
  });}).catch(function(){if(sb)sb.disabled=false;syPwErr('Server nicht erreichbar.');});
}

// ─── Icon-Klick + Mini-Menü (angemeldet: E-Mail, Jetzt syncen, Abmelden) ───
function syBtnClick(){
  if(!syToken())return syOpen();
  var m=document.getElementById('syMenu');if(!m)return;
  if(m.style.display==='flex')return syMenuHide();
  var u=syUser()||{};
  var el=document.getElementById('syMenuUser');
  if(el)el.textContent='☁️ '+(u.email||'Cloud-Konto')+(u.displayName?' · '+u.displayName:'');
  m.style.display='flex';
  setTimeout(function(){document.addEventListener('click',syMenuOutside);},0);
}
function syMenuHide(){
  var m=document.getElementById('syMenu');if(m)m.style.display='none';
  document.removeEventListener('click',syMenuOutside);
}
function syMenuOutside(e){
  var m=document.getElementById('syMenu'),b=document.getElementById('syBtn');
  if(m&&!m.contains(e.target)&&(!b||!b.contains(e.target)))syMenuHide();
}
function syNow(){
  syMenuHide();
  if(!syToken())return syOpen();
  syLocalKeys().forEach(function(k){syPending[k]=true;});
  syPull().then(function(){syPushNow();});
}

// ─── Hook in den Data-Layer: window.save() (app.js) wrappen → Haupt-Datenkey pushen ───
// sync.js wird NACH app.js geladen, save() existiert hier also bereits. Ohne Token
// vermerkt syQueue nur den lokalen Änderungs-Zeitstempel (billig) — sonst keine Wirkung.
if(typeof window.save==='function'){
  var _syOrigSave=window.save;
  window.save=function(){
    var r=_syOrigSave.apply(this,arguments);
    try{syQueue(syMainKey());}catch(e){}
    return r;
  };
}
// saveNow() (Sofort-Speichern, z.B. vor Export/Logout) ebenfalls erfassen.
if(typeof window.saveNow==='function'){
  var _syOrigSaveNow=window.saveNow;
  window.saveNow=function(){
    var r=_syOrigSaveNow.apply(this,arguments);
    try{syQueue(syMainKey());}catch(e){}
    return r;
  };
}

// ─── Start: Icon initialisieren; mit Token direkt pullen (Merge, ggf. Reload) ───
window.syBtnClick=syBtnClick;
window.syOpen=syOpen;
window.syClose=syClose;
window.syMode=syMode;
window.sySubmit=sySubmit;
window.syLogout=syLogout;
window.syNow=syNow;
window.syPwOpen=syPwOpen;
window.syPwClose=syPwClose;
window.syPwSubmit=syPwSubmit;
window.syFetch=syFetch;

if(syToken()){sySetState('pending');syPull();}
else sySetState('off');
})();
