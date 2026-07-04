/* ═══════════════════════════════════════════════════════════════
   WIKA AUTH SYSTEM
   - User store in localStorage (key: wika_users_v1)
   - Session in sessionStorage
   - Roles: 'admin' | 'user'
   - Password expires after 14 days -> forced change
   ═══════════════════════════════════════════════════════════════ */
(function(){
  document.documentElement.style.overflow='hidden';
  document.body.style.overflow='hidden';

  var USERS_KEY='wika_users_v1';
  var SESSION_KEY='wika_auth_session_v2';
  var FAIL_KEY='wika_auth_fails_v1';
  var PW_LIFETIME_DAYS=14;
  var PW_LIFETIME_MS=PW_LIFETIME_DAYS*24*60*60*1000;

  // ── Hash function (simple but better than plaintext) ──
  function hash(s){
    // Salted hash via repeated FNV-1a — not cryptographic but fine for a local tool
    var salt='wika_salt_2024_';
    var str=salt+s+salt;
    var h=2166136261;
    for(var i=0;i<str.length;i++){
      h^=str.charCodeAt(i);
      h=(h*16777619)>>>0;
    }
    // Mix again
    var s2=h.toString(16);
    for(var j=0;j<3;j++){
      var h2=2166136261;
      for(var k=0;k<s2.length;k++){h2^=s2.charCodeAt(k);h2=(h2*16777619)>>>0;}
      s2=h2.toString(16)+s2;
    }
    return s2;
  }

  // ── User store API ──
  function loadUsers(){
    try{
      var raw=localStorage.getItem(USERS_KEY);
      if(!raw)return null;
      return JSON.parse(raw);
    }catch(e){return null;}
  }
  function saveUsers(arr){
    try{localStorage.setItem(USERS_KEY,JSON.stringify(arr));return true;}
    catch(e){return false;}
  }
  function ensureSeed(){
    var users=loadUsers();
    if(users && users.length){
      // Migration: ensure all users have license fields
      var changed=false;
      for(var i=0;i<users.length;i++){
        if(typeof users[i].email==='undefined'){users[i].email='';changed=true;}
        if(typeof users[i].status==='undefined'){users[i].status=users[i].role==='admin'?'active':'active';changed=true;}
        if(typeof users[i].licenseKey==='undefined'){users[i].licenseKey=users[i].role==='admin'?'WIKA-ADMIN-PERMANENT':genLicense();changed=true;}
        if(typeof users[i].licenseExpiresAt==='undefined'){users[i].licenseExpiresAt=users[i].role==='admin'?null:(users[i].pwSetAt||Date.now())+PW_LIFETIME_MS;changed=true;}
      }
      if(changed)saveUsers(users);
      return users;
    }
    // First start: create admin (permanent license)
    var seed=[{
      username:'wika01',
      email:'',
      passHash:hash('wika1303'),
      role:'admin',
      status:'active',
      pwSetAt:Date.now(),
      mustChange:false,
      createdAt:Date.now(),
      licenseKey:'WIKA-ADMIN-PERMANENT',
      licenseExpiresAt:null  // null = permanent
    }];
    saveUsers(seed);
    return seed;
  }

  // ── License key generator: WIKA-XXXX-XXXX-XXXX ──
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

  ensureSeed();

  // ── Notfall-Reset: Datei mit #reset öffnen, um den Admin-Login wiederherzustellen ──
  try{
    if((location.hash||'').toLowerCase().indexOf('reset')>-1){
      var _ru=loadUsers()||[];
      var _admin=null;
      for(var _ri=0;_ri<_ru.length;_ri++){ if(_ru[_ri].role==='admin'){_admin=_ru[_ri];break;} }
      if(!_admin && _ru.length){_admin=_ru[0];}
      if(_admin){
        _admin.passHash=hash('wika1303');
        _admin.pwSetAt=Date.now();
        _admin.mustChange=false;
        _admin.status='active';
        if(_admin.role==='admin')_admin.licenseExpiresAt=null;
        saveUsers(_ru);
      }
      try{sessionStorage.removeItem(SESSION_KEY);}catch(e){}
      try{localStorage.removeItem(FAIL_KEY);localStorage.removeItem(FAIL_KEY+'_until');}catch(e){}
      try{if(location.hash)history.replaceState(null,'',location.pathname);}catch(e){}
      alert('🔓 Login wurde zurückgesetzt.\n\nBenutzer: '+(_admin?_admin.username:'wika01')+'\nPasswort: wika1303\n\nBitte melde dich an und ändere das Passwort danach.');
    }
  }catch(e){}

  // Expose to global so admin page can use them
  window.WikaAuth={
    USERS_KEY:USERS_KEY,
    PW_LIFETIME_DAYS:PW_LIFETIME_DAYS,
    PW_LIFETIME_MS:PW_LIFETIME_MS,
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
    daysLeft:function(u){
      return PW_LIFETIME_DAYS; // Passwortablauf deaktiviert -> immer volle Laufzeit, keine Warnung
    },
    isExpired:function(u){
      return false; // Passwortablauf dauerhaft abgeschaltet (kein 14-Tage-Zwang mehr)
    },
    // License helpers
    licenseDaysLeft:function(u){
      if(!u)return 0;
      if(u.licenseExpiresAt===null||typeof u.licenseExpiresAt==='undefined')return Infinity;
      var left=u.licenseExpiresAt-Date.now();
      return Math.max(0,Math.ceil(left/(24*60*60*1000)));
    },
    licenseMsLeft:function(u){
      if(!u)return 0;
      if(u.licenseExpiresAt===null||typeof u.licenseExpiresAt==='undefined')return Infinity;
      return Math.max(0,u.licenseExpiresAt-Date.now());
    },
    isLicenseExpired:function(u){
      if(!u)return true;
      if(u.licenseExpiresAt===null||typeof u.licenseExpiresAt==='undefined')return false;
      return Date.now()>=u.licenseExpiresAt;
    },
    currentUser:function(){
      try{
        var raw=sessionStorage.getItem(SESSION_KEY);
        if(!raw)return null;
        var s=JSON.parse(raw);
        if(!s||!s.username)return null;
        return this.findUser(s.username);
      }catch(e){return null;}
    },
    logout:function(){
      try{sessionStorage.removeItem(SESSION_KEY);}catch(e){}
      location.reload();
    }
  };

  // ── If session valid, unlock immediately ──
  try{
    var raw=sessionStorage.getItem(SESSION_KEY);
    if(raw){
      var s=JSON.parse(raw);
      var u=window.WikaAuth.findUser(s&&s.username);
      if(u && !window.WikaAuth.isExpired(u) && !u.mustChange){
        wikaUnlock(true);
        return;
      }else{
        // Session exists but user expired/changed -> drop session
        sessionStorage.removeItem(SESSION_KEY);
      }
    }
  }catch(e){}

  // ── UI helpers ──
  window.wikaTogglePw=function(inputId,btnId){
    var i=document.getElementById(inputId);
    var b=document.getElementById(btnId);
    if(!i)return;
    if(i.type==='password'){i.type='text';if(b)b.textContent='🙈';}
    else{i.type='password';if(b)b.textContent='👁️';}
  };

  function showLoginErr(msg){var e=document.getElementById('wikaLoginError');e.textContent=msg;e.style.display='block';}
  function clearLoginErr(){document.getElementById('wikaLoginError').style.display='none';}
  function showChangeErr(msg){var e=document.getElementById('wikaChangePwError');e.textContent=msg;e.style.display='block';}
  function clearChangeErr(){document.getElementById('wikaChangePwError').style.display='none';}

  function showView(which){
    document.getElementById('wikaViewLogin').style.display=(which==='login'?'block':'none');
    document.getElementById('wikaViewRegister').style.display=(which==='register'?'block':'none');
    document.getElementById('wikaViewRegSuccess').style.display=(which==='regSuccess'?'block':'none');
    document.getElementById('wikaViewChangePw').style.display=(which==='change'?'block':'none');
    // Tabs visible for login/register, hidden for change/success
    var tabs=document.getElementById('wikaAuthTabs');
    if(tabs)tabs.style.display=(which==='login'||which==='register')?'flex':'none';
  }

  // Tab switcher
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

  // ── Registration ──
  function showRegErr(msg){var e=document.getElementById('wikaRegError');e.textContent=msg;e.style.display='block';}
  function clearRegErr(){document.getElementById('wikaRegError').style.display='none';}

  var _lastRegistration=null; // {username,email,licenseKey,validUntil,verifyCode}

  window.wikaTryRegister=function(ev){
    if(ev)ev.preventDefault();
    clearRegErr();

    var u=(document.getElementById('wikaRegUser').value||'').trim();
    var em=(document.getElementById('wikaRegEmail').value||'').trim();
    var p1=document.getElementById('wikaRegPw').value||'';
    var p2=document.getElementById('wikaRegPw2').value||'';

    if(u.length<3){return showRegErr('Benutzername muss mindestens 3 Zeichen lang sein.');}
    if(!/^[a-zA-Z0-9_-]+$/.test(u)){return showRegErr('Nur Buchstaben, Zahlen, Unter-/Bindestrich erlaubt.');}
    if(!em || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)){return showRegErr('Bitte eine gültige E-Mail-Adresse eingeben.');}
    if(p1.length<6){return showRegErr('Passwort muss mindestens 6 Zeichen lang sein.');}
    if(p1!==p2){return showRegErr('Die Passwörter stimmen nicht überein.');}

    if(window.WikaAuth.findUser(u)){return showRegErr('Dieser Benutzername ist bereits vergeben.');}
    if(window.WikaAuth.findUserByEmail(em)){return showRegErr('Diese E-Mail-Adresse ist bereits registriert.');}

    var users=window.WikaAuth.loadUsers()||[];
    var licenseKey=window.WikaAuth.genLicense();
    var now=Date.now();
    var validUntil=now+PW_LIFETIME_MS;
    // Verify code (6 chars) for the activation mail
    var vchars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var verify='';
    if(window.crypto && crypto.getRandomValues){
      var arr=new Uint32Array(6);
      crypto.getRandomValues(arr);
      for(var i=0;i<6;i++)verify+=vchars[arr[i]%vchars.length];
    }else{
      for(var j=0;j<6;j++)verify+=vchars[Math.floor(Math.random()*vchars.length)];
    }

    users.push({
      username:u,
      email:em,
      passHash:hash(p1),
      role:'user',
      status:'active',  // already usable, but admin will see new registration
      pwSetAt:now,
      mustChange:false,
      createdAt:now,
      licenseKey:licenseKey,
      licenseExpiresAt:validUntil,
      verifyCode:verify
    });
    window.WikaAuth.saveUsers(users);

    _lastRegistration={username:u,email:em,licenseKey:licenseKey,validUntil:validUntil,verifyCode:verify};

    // Update success view
    document.getElementById('wikaRegLicenseKey').textContent=licenseKey;
    var d=new Date(validUntil);
    var dStr=d.toLocaleDateString('de-DE',{day:'2-digit',month:'long',year:'numeric'});
    document.getElementById('wikaRegValidUntil').textContent='Gültig bis '+dStr+' (14 Tage)';

    showView('regSuccess');
    return false;
  };

  window.wikaOpenRegMail=function(){
    if(!_lastRegistration)return;
    var r=_lastRegistration;
    // Find first admin's email (or fallback)
    var adminEmail='';
    var allUsers=window.WikaAuth.loadUsers()||[];
    for(var ai=0;ai<allUsers.length;ai++){
      if(allUsers[ai].role==='admin' && allUsers[ai].email){adminEmail=allUsers[ai].email;break;}
    }
    if(!adminEmail)adminEmail='admin@wika.local'; // fallback if no admin email set yet
    var ADMIN_EMAIL=adminEmail;
    var d=new Date(r.validUntil);
    var dStr=d.toLocaleDateString('de-DE',{day:'2-digit',month:'long',year:'numeric'});

    var subject='SellerHub · Registrierungs-Bestätigung & Lizenzkey';
    var body=
      'Hallo!\n\n'+
      'Vielen Dank für deine Registrierung bei SellerHub.\n\n'+
      '═══════════════════════════════════════\n'+
      '  DEINE ZUGANGSDATEN\n'+
      '═══════════════════════════════════════\n\n'+
      'Benutzername:    '+r.username+'\n'+
      'E-Mail:          '+r.email+'\n'+
      'Lizenzkey:       '+r.licenseKey+'\n'+
      'Bestätigungscode: '+r.verifyCode+'\n'+
      'Gültig bis:      '+dStr+' (14 Tage)\n\n'+
      '═══════════════════════════════════════\n'+
      '  WICHTIG\n'+
      '═══════════════════════════════════════\n\n'+
      '➜ Bewahre diesen Lizenzkey sicher auf.\n'+
      '➜ Nach 14 Tagen läuft deine Lizenz ab.\n'+
      '➜ Eine Verlängerung kann jederzeit beim\n'+
      '  Administrator angefordert werden.\n\n'+
      'Diese Mail an dich selbst zur Bestätigung\n'+
      'und gleichzeitig als Kopie an den Admin.\n\n'+
      '— SellerHub · Smarte Werkzeuge für E-Commerce-Profis';
    // Send to user (CC admin)
    var url='mailto:'+encodeURIComponent(r.email)+'?cc='+encodeURIComponent(ADMIN_EMAIL)+
            '&subject='+encodeURIComponent(subject)+
            '&body='+encodeURIComponent(body);
    window.location.href=url;
  };

  window.wikaCopyRegKey=function(){
    if(!_lastRegistration)return;
    var key=_lastRegistration.licenseKey;
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(key).then(function(){
        var btn=event.target;
        var orig=btn.textContent;
        btn.textContent='✓ Kopiert!';
        setTimeout(function(){btn.textContent=orig;},1500);
      }).catch(function(){
        prompt('Lizenzkey:',key);
      });
    }else{
      prompt('Lizenzkey:',key);
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

  // ── Pending user (for forced password change before unlock) ──
  var pendingUser=null;
  var pendingReason='';

  window.wikaTryLogin=function(ev){
    if(ev)ev.preventDefault();
    clearLoginErr();

    var u=(document.getElementById('wikaLoginUser').value||'').trim();
    var p=document.getElementById('wikaLoginPass').value||'';

    // Use localStorage for persistent lockout (survives tab close on the same browser)
    var fails=parseInt(localStorage.getItem(FAIL_KEY)||'0',10);
    var lockUntil=parseInt(localStorage.getItem(FAIL_KEY+'_until')||'0',10);
    if(lockUntil>Date.now()){
      var sec=Math.ceil((lockUntil-Date.now())/1000);
      var mins=Math.ceil(sec/60);
      showLoginErr('🔒 Zu viele Versuche. Gesperrt für '+(sec<60?sec+' Sek.':mins+' Min.'));
      return false;
    }

    var user=window.WikaAuth.findUser(u);
    if(!user || user.passHash!==hash(p)){
      fails+=1;
      try{localStorage.setItem(FAIL_KEY,String(fails));}catch(e){}
      // Progressive lockout: 5 → 30s, 10 → 5min, 15 → 30min, 20+ → 24h
      var lockDuration=0;
      if(fails>=20)lockDuration=24*60*60*1000;
      else if(fails>=15)lockDuration=30*60*1000;
      else if(fails>=10)lockDuration=5*60*1000;
      else if(fails>=5)lockDuration=30*1000;
      if(lockDuration>0){
        var until=Date.now()+lockDuration;
        try{localStorage.setItem(FAIL_KEY+'_until',String(until));}catch(e){}
        var label=lockDuration>=3600000?(lockDuration/3600000)+' Std.':lockDuration>=60000?(lockDuration/60000)+' Min.':(lockDuration/1000)+' Sek.';
        showLoginErr('🔒 Zu viele Fehlversuche. Gesperrt für '+label+'.');
      }else{
        showLoginErr('❌ Falscher Benutzername oder Passwort. ('+fails+'/5)');
      }
      shake();
      document.getElementById('wikaLoginPass').value='';
      document.getElementById('wikaLoginPass').focus();
      return false;
    }

    // Successful credential check — clear all fail counters
    try{localStorage.removeItem(FAIL_KEY);}catch(e){}
    try{localStorage.removeItem(FAIL_KEY+'_until');}catch(e){}
    // Also clear old sessionStorage values from previous versions
    try{sessionStorage.removeItem(FAIL_KEY);}catch(e){}
    try{sessionStorage.removeItem(FAIL_KEY+'_until');}catch(e){}

    // Account status check (pending / blocked)
    if(user.status==='pending'){
      showLoginErr('⏳ Dein Account wartet auf Aktivierung durch einen Administrator.');
      return false;
    }
    if(user.status==='blocked'){
      showLoginErr('🚫 Dein Account wurde gesperrt. Bitte wende dich an den Administrator.');
      return false;
    }

    // License expiry check (admins with null = never expire)
    if(window.WikaAuth.isLicenseExpired(user)){
      showLoginErr('⌛ Dein Lizenzkey ist abgelaufen. Bitte fordere eine Verlängerung beim Administrator an.');
      // Show contact button
      setTimeout(function(){
        var box=document.getElementById('wikaLoginError');
        if(box && !document.getElementById('wikaExpiredMailBtn')){
          var b=document.createElement('button');
          b.id='wikaExpiredMailBtn';
          b.type='button';
          b.textContent='✉️ Verlängerung anfordern';
          b.style.cssText='display:block;margin:10px auto 0;padding:8px 16px;border-radius:8px;border:none;background:#d97706;color:#fff;cursor:pointer;font-family:inherit;font-size:12px;font-weight:700';
          b.onclick=function(){wikaSendRenewalMail(user);};
          box.appendChild(b);
        }
      },100);
      return false;
    }

    // Force password change?
    if(user.mustChange){
      pendingUser=user.username;
      pendingReason='Beim ersten Login muss das Passwort geändert werden.';
      document.getElementById('wikaChangePwReason').textContent=pendingReason;
      showView('change');
      setTimeout(function(){var f=document.getElementById('wikaNewPw1');if(f)f.focus();},50);
      return false;
    }
    if(window.WikaAuth.isExpired(user)){
      pendingUser=user.username;
      pendingReason='Dein Passwort ist nach '+PW_LIFETIME_DAYS+' Tagen abgelaufen. Bitte neu setzen.';
      document.getElementById('wikaChangePwReason').textContent=pendingReason;
      showView('change');
      setTimeout(function(){var f=document.getElementById('wikaNewPw1');if(f)f.focus();},50);
      return false;
    }

    // All good -> session
    try{
      sessionStorage.setItem(SESSION_KEY,JSON.stringify({username:user.username,loginAt:Date.now()}));
    }catch(e){}
    wikaUnlock(false);
    return false;
  };

  // ── Passwort vergessen: sichtbarer Reset direkt vom Login-Screen ──
  window.wikaForgotPw=function(){
    var users=loadUsers()||[];
    if(!users.length){ alert('Es sind keine Konten gespeichert.'); return; }
    var pre=(document.getElementById('wikaLoginUser')||{}).value||'';
    var name=window.prompt('Passwort zurücksetzen für welchen Benutzer?\n\nVorhandene Konten:\n• '+users.map(function(u){return u.username+(u.role==='admin'?' (Admin)':'');}).join('\n• '), (pre||users[0].username));
    if(name===null) return;
    name=(name||'').toLowerCase().trim();
    var user=null;
    for(var i=0;i<users.length;i++){ if((users[i].username||'').toLowerCase()===name){user=users[i];break;} }
    if(!user){ alert('Benutzer „'+name+'" nicht gefunden.'); return; }
    var np=window.prompt('Neues Passwort für „'+user.username+'" eingeben (mind. 6 Zeichen):','');
    if(np===null) return;
    np=(np||'').trim();
    if(np.length<6){ alert('Das Passwort muss mindestens 6 Zeichen haben.'); return; }
    user.passHash=hash(np);
    user.pwSetAt=Date.now();
    user.mustChange=false;
    user.status='active';
    if(user.role==='admin')user.licenseExpiresAt=null;
    saveUsers(users);
    try{localStorage.removeItem(FAIL_KEY);localStorage.removeItem(FAIL_KEY+'_until');}catch(e){}
    try{sessionStorage.removeItem(SESSION_KEY);}catch(e){}
    alert('✓ Passwort für „'+user.username+'" wurde neu gesetzt.\n\nDu kannst dich jetzt mit dem neuen Passwort anmelden.');
    var uf=document.getElementById('wikaLoginUser'); if(uf)uf.value=user.username;
    var pf=document.getElementById('wikaLoginPass'); if(pf){pf.value='';pf.focus();}
    if(typeof clearLoginErr==='function')clearLoginErr();
  };

  // Mailto helper (used by login expiry + dashboard countdown)
  window.wikaSendRenewalMail=function(user){
    // Find first admin's email (or fallback)
    var adminEmail='';
    var allUsers=window.WikaAuth.loadUsers()||[];
    for(var ai=0;ai<allUsers.length;ai++){
      if(allUsers[ai].role==='admin' && allUsers[ai].email){adminEmail=allUsers[ai].email;break;}
    }
    if(!adminEmail)adminEmail='admin@wika.local';
    var ADMIN_EMAIL=adminEmail;
    var subject='SellerHub · Lizenz-Verlängerung anfordern';
    var body=
      'Hallo Administrator,\n\n'+
      'ich bitte um eine Verlängerung meiner SellerHub-Lizenz.\n\n'+
      '──────────────────────────────────\n'+
      'Benutzername: '+(user.username||'')+'\n'+
      'E-Mail: '+(user.email||'')+'\n'+
      'Aktueller Lizenzkey: '+(user.licenseKey||'—')+'\n'+
      'Status: '+(window.WikaAuth.isLicenseExpired(user)?'ABGELAUFEN':'läuft bald ab')+'\n'+
      '──────────────────────────────────\n\n'+
      'Bitte verlängere meine Lizenz oder generiere einen neuen Key.\n\n'+
      'Vielen Dank!\n'+
      (user.username||'');
    var url='mailto:'+ADMIN_EMAIL+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);
    window.location.href=url;
  };

  window.wikaSubmitNewPw=function(ev){
    if(ev)ev.preventDefault();
    clearChangeErr();
    if(!pendingUser){showChangeErr('Sitzung abgelaufen. Bitte neu anmelden.');setTimeout(function(){location.reload();},1200);return false;}

    var p1=document.getElementById('wikaNewPw1').value||'';
    var p2=document.getElementById('wikaNewPw2').value||'';

    if(p1.length<6){showChangeErr('Passwort muss mindestens 6 Zeichen lang sein.');return false;}
    if(p1!==p2){showChangeErr('Die Passwörter stimmen nicht überein.');return false;}

    var users=window.WikaAuth.loadUsers()||[];
    for(var i=0;i<users.length;i++){
      if(users[i].username===pendingUser){
        // Block reusing the same password
        if(users[i].passHash===hash(p1)){
          showChangeErr('Bitte wähle ein anderes Passwort als das alte.');
          return false;
        }
        users[i].passHash=hash(p1);
        users[i].pwSetAt=Date.now();
        users[i].mustChange=false;
        break;
      }
    }
    window.WikaAuth.saveUsers(users);

    try{
      sessionStorage.setItem(SESSION_KEY,JSON.stringify({username:pendingUser,loginAt:Date.now()}));
    }catch(e){}
    pendingUser=null;
    wikaUnlock(false);
    return false;
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
    // After unlock, hide admin items if user is not admin
    if(document.readyState==='loading'){
      document.addEventListener('DOMContentLoaded',function(){applyRoleVisibility();injectFooterControls();});
    }else{
      applyRoleVisibility();
      injectFooterControls();
    }
  }

  // ── Hide/show admin sidebar entries based on role ──
  function applyRoleVisibility(){
    var u=window.WikaAuth.currentUser();
    var isAdmin=u && u.role==='admin';
    var adminItems=document.querySelectorAll('[data-admin-only="1"]');
    for(var i=0;i<adminItems.length;i++){
      adminItems[i].style.display=isAdmin?'':'none';
    }
    // If non-admin somehow tries to view admin page, kick them out
    if(!isAdmin){
      var p=document.getElementById('p-admin');
      if(p && p.classList.contains('active')){
        if(window.go)window.go('dashboard');
      }
    }
    // Update header user info
    var info=document.getElementById('wikaUserInfo');
    if(info && u){
      var d=window.WikaAuth.daysLeft(u);
      var ld=window.WikaAuth.licenseDaysLeft(u);
      var permanent=(u.licenseExpiresAt===null||typeof u.licenseExpiresAt==='undefined');
      var roleLabel=isAdmin?'Admin':'Benutzer';
      var color=isAdmin?'#d97706':'#1d4ed8';
      var licInfo=permanent
        ? '<span style="color:#10b981" title="Lizenz: permanent">Lic ∞</span>'
        : '<span title="Tage bis Lizenz-Ablauf" style="color:'+(ld<=3?'#dc2626':ld<=7?'#f59e0b':'#10b981')+'">Lic '+ld+'d</span>';
      info.innerHTML='<span style="color:'+color+';font-weight:700">'+roleLabel+'</span> · '+u.username+'<br><span title="Tage bis Passwort-Ablauf" style="color:'+(d<=3?'#dc2626':'#6b7488')+'">PW '+d+'d</span> · '+licInfo;
    }
  }
  window.wikaApplyRoleVisibility=applyRoleVisibility;

  // ── Footer logout + change password buttons ──
  function injectFooterControls(){
    var foot=document.querySelector('.sidebar-footer');
    if(!foot || document.getElementById('wikaLogoutBtn'))return;
    var u=window.WikaAuth.currentUser();
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
