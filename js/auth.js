/* ═══════════════════════════════════════════════════════════════
   SELLERHUB AUTH — Cloud-Login (Modul 4)
   - Anmeldung läuft gegen das Radar-Backend (/api/auth) — dieselben
     Konten wie der Cloud-Sync (js/sync.js, sy_token/sy_user).
   - window.WikaAuth bleibt als Kompatibilitäts-Schicht für admin.js/
     app.js erhalten (Lizenz-Logik ist Geschichte: Cloud-Konto = permanent).
   - Offline-Pfad: Gerät war schon mal angemeldet (sy_user vorhanden),
     Server nicht erreichbar → "Offline weiterarbeiten" (Daten sind lokal).
   ═══════════════════════════════════════════════════════════════ */
(function(){
  document.documentElement.style.overflow='hidden';
  document.body.style.overflow='hidden';

  var USERS_KEY='wika_users_v1'; // Alt-Store (v1) — nur noch für admin.js-Kompatibilität

  // ── API-Basis: identische Logik wie syApi() in js/sync.js (lädt erst später) ──
  var API_DEFAULT='https://radar-production-388a.up.railway.app';
  function api(){try{return (localStorage.getItem('wika_radar_api')||API_DEFAULT).replace(/\/+$/,'');}catch(e){return API_DEFAULT;}}

  function syToken(){try{return localStorage.getItem('sy_token')||'';}catch(e){return '';}}
  function syUser(){try{return JSON.parse(localStorage.getItem('sy_user')||'null');}catch(e){return null;}}
  function syStore(token,user){
    localStorage.setItem('sy_token',token);
    localStorage.setItem('sy_user',JSON.stringify(user||{}));
  }

  // ── Alt-Hash (FNV-1a) — nur noch für den v1-Store in admin.js ──
  function hash(s){
    var salt='wika_salt_2024_';
    var str=salt+s+salt;
    var h=2166136261;
    for(var i=0;i<str.length;i++){h^=str.charCodeAt(i);h=(h*16777619)>>>0;}
    var s2=h.toString(16);
    for(var j=0;j<3;j++){
      var h2=2166136261;
      for(var k=0;k<s2.length;k++){h2^=s2.charCodeAt(k);h2=(h2*16777619)>>>0;}
      s2=h2.toString(16)+s2;
    }
    return s2;
  }
  function loadUsers(){
    try{var raw=localStorage.getItem(USERS_KEY);return raw?JSON.parse(raw):null;}catch(e){return null;}
  }
  function saveUsers(arr){
    try{localStorage.setItem(USERS_KEY,JSON.stringify(arr));return true;}catch(e){return false;}
  }
  function genLicense(){
    var chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    function block(n){
      var s='';
      if(window.crypto && crypto.getRandomValues){
        var arr=new Uint32Array(n);
        crypto.getRandomValues(arr);
        for(var i=0;i<n;i++)s+=chars[arr[i]%chars.length];
      }else{
        for(var j=0;j<n;j++)s+=chars[Math.floor(Math.random()*chars.length)];
      }
      return s;
    }
    return 'WIKA-'+block(4)+'-'+block(4)+'-'+block(4);
  }

  // ── Kompat-Schicht: admin.js/app.js erwarten window.WikaAuth ──
  window.WikaAuth={
    USERS_KEY:USERS_KEY,
    PW_LIFETIME_DAYS:14,
    PW_LIFETIME_MS:14*24*60*60*1000,
    hash:hash,
    genLicense:genLicense,
    loadUsers:loadUsers,
    saveUsers:saveUsers,
    findUser:function(name){
      var users=loadUsers()||[];
      name=(name||'').toLowerCase().trim();
      for(var i=0;i<users.length;i++){
        if((users[i].username||'').toLowerCase()===name)return users[i];
      }
      return null;
    },
    findUserByEmail:function(email){
      var users=loadUsers()||[];
      email=(email||'').toLowerCase().trim();
      for(var i=0;i<users.length;i++){
        if((users[i].email||'').toLowerCase()===email)return users[i];
      }
      return null;
    },
    // Passwort-/Lizenz-Ablauf: mit Cloud-Konten dauerhaft deaktiviert
    daysLeft:function(){return 14;},
    isExpired:function(){return false;},
    licenseDaysLeft:function(){return Infinity;},
    licenseMsLeft:function(){return Infinity;},
    isLicenseExpired:function(){return false;},
    // Cloud-Nutzer im alten Nutzer-Format (username/role/…): quelle = sy_user
    currentUser:function(){
      var u=syUser();
      if(!u)return null;
      if(!syToken() && !offlineMode)return null;
      return {
        username:u.displayName||String(u.email||'').split('@')[0]||'Cloud-Nutzer',
        email:u.email||'',
        role:u.role==='admin'?'admin':'user',
        status:'active',
        pwSetAt:0,mustChange:false,createdAt:0,
        licenseKey:'CLOUD',
        licenseExpiresAt:null // null = permanent (Lizenz-Anzeigen zeigen ∞)
      };
    },
    logout:function(){
      var t=syToken();
      if(t){try{fetch(api()+'/api/auth/logout',{method:'POST',headers:{Authorization:'Bearer '+t}}).catch(function(){});}catch(e){}}
      try{localStorage.removeItem('sy_token');localStorage.removeItem('sy_user');}catch(e){}
      location.reload();
    }
  };

  var offlineMode=false; // "Offline weiterarbeiten" gewählt (kein Token, aber lokale Daten)

  // ── Gültige Cloud-Sitzung auf diesem Gerät? → direkt entsperren ──
  // (Server-Prüfung passiert lazy: sync.js verwirft den Token bei 401.)
  if(syToken()){
    wikaUnlock(true);
    return;
  }

  // ── UI-Helfer ──
  window.wikaTogglePw=function(inputId,btnId){
    var i=document.getElementById(inputId);
    var b=document.getElementById(btnId);
    if(!i)return;
    if(i.type==='password'){i.type='text';if(b)b.textContent='🙈';}
    else{i.type='password';if(b)b.textContent='👁️';}
  };

  function showLoginErr(msg){var e=document.getElementById('wikaLoginError');e.textContent=msg;e.style.display='block';}
  function clearLoginErr(){var e=document.getElementById('wikaLoginError');e.style.display='none';var b=document.getElementById('wikaOfflineBtn');if(b)b.remove();}
  function showRegErr(msg){var e=document.getElementById('wikaRegError');e.textContent=msg;e.style.display='block';}
  function clearRegErr(){document.getElementById('wikaRegError').style.display='none';}

  function showView(which){
    document.getElementById('wikaViewLogin').style.display=(which==='login'?'block':'none');
    document.getElementById('wikaViewRegister').style.display=(which==='register'?'block':'none');
  }

  // Tab-Umschalter (Anmelden / Registrieren)
  window.wikaSwitchTab=function(which){
    var tL=document.getElementById('wikaTabLogin');
    var tR=document.getElementById('wikaTabReg');
    if(which==='login'){
      tL.style.background='#fff';tL.style.color='#0f1729';tL.style.fontWeight='700';tL.style.boxShadow='0 1px 3px rgba(15,23,41,.08)';
      tR.style.background='transparent';tR.style.color='#475066';tR.style.fontWeight='600';tR.style.boxShadow='none';
      showView('login');
      setTimeout(function(){var f=document.getElementById('wikaLoginUser');if(f)f.focus();},50);
    }else{
      tR.style.background='#fff';tR.style.color='#0f1729';tR.style.fontWeight='700';tR.style.boxShadow='0 1px 3px rgba(15,23,41,.08)';
      tL.style.background='transparent';tL.style.color='#475066';tL.style.fontWeight='600';tL.style.boxShadow='none';
      showView('register');
      setTimeout(function(){var f=document.getElementById('wikaRegUser');if(f)f.focus();},50);
    }
  };

  function shake(){
    var box=document.getElementById('wikaLoginBox');
    if(!box)return;
    box.style.transition='transform .08s';
    var i=0;
    var iv=setInterval(function(){
      box.style.transform='translateX('+(i%2?-8:8)+'px)';
      i++;
      if(i>5){clearInterval(iv);box.style.transform='translateX(0)';}
    },50);
  }

  // Nach Login/Registrierung: Token speichern, entsperren, Cloud-Sync anstoßen
  function finishLogin(token,user){
    try{syStore(token,user);}catch(e){showLoginErr('Token konnte nicht gespeichert werden (Speicher voll?).');return;}
    wikaUnlock(false);
    if(window.syNow)setTimeout(function(){window.syNow();},80); // sync.js ist bereits geladen → sofort abgleichen
  }

  // ── Anmelden (POST /api/auth/login — Rate-Limit macht der Server) ──
  window.wikaTryLogin=function(ev){
    if(ev)ev.preventDefault();
    clearLoginErr();
    var email=(document.getElementById('wikaLoginUser').value||'').trim().toLowerCase();
    var pw=document.getElementById('wikaLoginPass').value||'';
    if(!email||!pw){showLoginErr('Bitte E-Mail und Passwort eingeben.');return false;}
    fetch(api()+'/api/auth/login',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email:email,password:pw})
    }).then(function(res){return res.json().catch(function(){return {};}).then(function(d){
      if(!res.ok){
        shake();
        showLoginErr(d.error||('Anmeldung fehlgeschlagen (HTTP '+res.status+')'));
        var pf=document.getElementById('wikaLoginPass');if(pf){pf.value='';pf.focus();}
        return;
      }
      finishLogin(d.token,d.user||{email:email});
    });}).catch(function(){
      shake();
      showLoginErr('⚠️ Server nicht erreichbar. Bitte Internetverbindung prüfen.');
      // Gerät war schon mal angemeldet → lokales Weiterarbeiten anbieten (Daten liegen lokal)
      if(syUser()){
        var box=document.getElementById('wikaLoginError');
        if(box && !document.getElementById('wikaOfflineBtn')){
          var b=document.createElement('button');
          b.id='wikaOfflineBtn';
          b.type='button';
          b.textContent='📴 Offline weiterarbeiten (ohne Sync)';
          b.style.cssText='display:block;margin:10px auto 0;padding:8px 16px;border-radius:8px;border:none;background:#475066;color:#fff;cursor:pointer;font-family:inherit;font-size:12px;font-weight:700';
          b.onclick=function(){offlineMode=true;wikaUnlock(false);};
          box.appendChild(b);
        }
      }
    });
    return false;
  };

  // ── Registrieren (POST /api/auth/register, Einladungscode-Pflicht) ──
  window.wikaTryRegister=function(ev){
    if(ev)ev.preventDefault();
    clearRegErr();
    var name=(document.getElementById('wikaRegUser').value||'').trim();
    var email=(document.getElementById('wikaRegEmail').value||'').trim().toLowerCase();
    var p1=document.getElementById('wikaRegPw').value||'';
    var p2=document.getElementById('wikaRegPw2').value||'';
    var code=(document.getElementById('wikaRegCode').value||'').trim();
    if(!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)){return showRegErr('Bitte eine gültige E-Mail-Adresse eingeben.');}
    if(p1.length<8){return showRegErr('Das Passwort braucht mindestens 8 Zeichen.');}
    if(p1!==p2){return showRegErr('Die Passwörter stimmen nicht überein.');}
    if(!code){return showRegErr('Bitte den Einladungscode eingeben (vom Betreiber).');}
    fetch(api()+'/api/auth/register',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email:email,password:p1,displayName:name,inviteCode:code})
    }).then(function(res){return res.json().catch(function(){return {};}).then(function(d){
      if(!res.ok)return showRegErr(d.error||('Registrierung fehlgeschlagen (HTTP '+res.status+')'));
      // Frisch registriert → direkt anmelden
      fetch(api()+'/api/auth/login',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({email:email,password:p1})
      }).then(function(r2){return r2.json().catch(function(){return {};}).then(function(d2){
        if(!r2.ok)return showRegErr(d2.error||'Konto erstellt — Anmeldung bitte manuell durchführen.');
        finishLogin(d2.token,d2.user||{email:email});
      });}).catch(function(){showRegErr('Konto erstellt — Server für die Anmeldung nicht erreichbar.');});
    });}).catch(function(){showRegErr('Server nicht erreichbar. Bitte Internetverbindung prüfen.');});
    return false;
  };

  // ── Passwort vergessen: Reset kann nur der Betreiber (Nutzer-Admin) ──
  window.wikaForgotPw=function(){
    alert('🔑 Passwort vergessen?\n\nDein Konto liegt in der AMZ SellerHub-Cloud — das Passwort kann nur der Betreiber zurücksetzen.\n\nBitte melde dich per E-Mail:\nwissam.kahil@gmail.com');
  };

  function wikaUnlock(silent){
    var ov=document.getElementById('wikaLoginOverlay');
    if(!ov){applyRoleVisibility();return;}
    if(silent){
      ov.style.display='none';
    }else{
      ov.style.transition='opacity .35s ease';
      ov.style.opacity='0';
      setTimeout(function(){ov.style.display='none';},360);
    }
    document.documentElement.style.overflow='';
    document.body.style.overflow='';
    // Nach dem Entsperren: Admin-Elemente je nach Rolle ein-/ausblenden
    if(document.readyState==='loading'){
      document.addEventListener('DOMContentLoaded',function(){applyRoleVisibility();injectFooterControls();});
    }else{
      applyRoleVisibility();
      injectFooterControls();
    }
  }

  // ── Admin-Sidebar-Einträge je nach Cloud-Rolle ──
  function applyRoleVisibility(){
    var u=window.WikaAuth.currentUser();
    var isAdmin=u && u.role==='admin';
    var adminItems=document.querySelectorAll('[data-admin-only="1"]');
    for(var i=0;i<adminItems.length;i++){
      adminItems[i].style.display=isAdmin?'':'none';
    }
    // Nicht-Admins von der Admin-Seite werfen
    if(!isAdmin){
      var p=document.getElementById('p-admin');
      if(p && p.classList.contains('active')){
        if(window.go)window.go('dashboard');
      }
    }
    // Nutzer-Info im Sidebar-Footer
    var info=document.getElementById('wikaUserInfo');
    if(info && u){
      var roleLabel=isAdmin?'Admin':'Benutzer';
      var color=isAdmin?'#d97706':'#1d4ed8';
      var mode=offlineMode?'<span style="color:#f59e0b">📴 offline</span>':'<span style="color:#10b981">☁️ Cloud</span>';
      info.innerHTML='<span style="color:'+color+';font-weight:700">'+roleLabel+'</span> · '+u.username+'<br>'+mode+(u.email?' · '+u.email:'');
    }
  }
  window.wikaApplyRoleVisibility=applyRoleVisibility;

  // ── Footer: Nutzer-Info + Abmelden-Button ──
  function injectFooterControls(){
    var foot=document.querySelector('.sidebar-footer');
    if(!foot || document.getElementById('wikaLogoutBtn'))return;
    var userLine=document.createElement('div');
    userLine.id='wikaUserInfo';
    userLine.style.cssText='font-size:10px;color:#a8b1cc;padding:4px 0;border-top:1px solid rgba(255,255,255,.08);margin-top:4px;padding-top:8px';
    foot.appendChild(userLine);

    var btn=document.createElement('button');
    btn.id='wikaLogoutBtn';
    btn.innerHTML='🔒 Abmelden';
    btn.style.cssText='width:100%;margin-top:6px;padding:8px 10px;background:rgba(220,38,38,.12);border:1px solid rgba(220,38,38,.3);border-radius:7px;color:#fca5a5;font-family:inherit;font-size:11px;font-weight:600;cursor:pointer;transition:all .15s';
    btn.onmouseover=function(){this.style.background='rgba(220,38,38,.25)';this.style.color='#fff';};
    btn.onmouseout=function(){this.style.background='rgba(220,38,38,.12)';this.style.color='#fca5a5';};
    btn.onclick=function(){if(confirm('Wirklich abmelden?'))window.WikaAuth.logout();};
    foot.appendChild(btn);

    applyRoleVisibility();
  }
})();
