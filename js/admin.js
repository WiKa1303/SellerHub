/* ═══════════════════════════════════════════════════════════════
   ADMIN AREA - USER MANAGEMENT UI
   ═══════════════════════════════════════════════════════════════ */

var _adminEditingUser=null;
var _adminPwTarget=null;
var _licenseCountdownTimer=null;

function adminFmtDate(ts){
  if(!ts)return '—';
  var d=new Date(ts);
  return d.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'})+' '+d.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});
}
function adminEscape(s){
  return String(s||'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});
}

/* ═══════════════════════════════════════════════════════════════
   LICENSE COUNTDOWN PANEL (Dashboard)
   ═══════════════════════════════════════════════════════════════ */
function renderLicensePanel(){
  var panel=document.getElementById('dashLicensePanel');
  if(!panel || !window.WikaAuth)return;
  var u=window.WikaAuth.currentUser();
  if(!u){panel.style.display='none';return;}

  // Stop any existing timer
  if(_licenseCountdownTimer){clearInterval(_licenseCountdownTimer);_licenseCountdownTimer=null;}

  var isAdmin=u.role==='admin';
  var permanent=(u.licenseExpiresAt===null||typeof u.licenseExpiresAt==='undefined');

  // Cloud-Konten sind permanent: normale Nutzer brauchen keine Lizenz-Box mehr
  if(permanent && !isAdmin){panel.style.display='none';return;}

  // Admins with permanent license -> compact info card
  if(isAdmin && permanent){
    panel.style.display='block';
    panel.innerHTML=
      '<div style="background:linear-gradient(135deg,rgba(217,119,6,.10),rgba(217,119,6,.04));border:1px solid rgba(217,119,6,.25);border-left:4px solid var(--ac);border-radius:12px;padding:14px 18px;display:flex;align-items:center;gap:14px;flex-wrap:wrap">'+
        '<div style="font-size:24px">🛡️</div>'+
        '<div style="flex:1;min-width:200px">'+
          '<div style="font-weight:700;color:var(--tx);margin-bottom:2px">Administrator-Lizenz</div>'+
          '<div style="font-size:12px;color:var(--tx2)">Lizenzkey: <span style="font-family:monospace;color:var(--ac-text);font-weight:600">'+adminEscape(u.licenseKey||'—')+'</span> · Unbegrenzt gültig</div>'+
        '</div>'+
        '<button class="btn btn-sm" onclick="go(\'admin\')">🛡️ Admin-Bereich</button>'+
      '</div>';
    return;
  }

  // Standard user (or admin with limited license) -> full countdown box
  panel.style.display='block';

  function renderTick(){
    var fresh=window.WikaAuth.currentUser();
    if(!fresh){panel.innerHTML='';return;}
    var msLeft=window.WikaAuth.licenseMsLeft(fresh);
    var pwDaysLeft=window.WikaAuth.daysLeft(fresh);
    var pwExpired=window.WikaAuth.isExpired(fresh);
    var licExpired=window.WikaAuth.isLicenseExpired(fresh);

    var days=Math.floor(msLeft/(24*60*60*1000));
    var hrs=Math.floor((msLeft%(24*60*60*1000))/(60*60*1000));
    var mins=Math.floor((msLeft%(60*60*1000))/(60*1000));
    var secs=Math.floor((msLeft%(60*1000))/1000);

    // Color logic
    var bg,border,ic,title,subtitle;
    if(licExpired){
      bg='linear-gradient(135deg,#fee2e2,#fecaca)';
      border='var(--rd)';
      ic='⌛';
      title='Lizenz abgelaufen';
      subtitle='Bitte fordere eine Verlängerung beim Administrator an.';
    }else if(days<=3){
      bg='linear-gradient(135deg,#fed7aa,#fdba74)';
      border='var(--or)';
      ic='⏰';
      title='Lizenz läuft bald ab!';
      subtitle='Verlängerung empfohlen — sonst kein Zugriff mehr ab dem Ablauftag.';
    }else if(days<=7){
      bg='linear-gradient(135deg,#fef3c7,#fde68a)';
      border='var(--ac)';
      ic='📅';
      title='Lizenz-Status';
      subtitle='Deine Lizenz ist noch eine Weile gültig.';
    }else{
      bg='linear-gradient(135deg,#d1fae5,#a7f3d0)';
      border='var(--gn)';
      ic='✅';
      title='Lizenz aktiv';
      subtitle='Alle Funktionen verfügbar.';
    }

    var validUntil=fresh.licenseExpiresAt?new Date(fresh.licenseExpiresAt):null;
    var validUntilStr=validUntil?validUntil.toLocaleDateString('de-DE',{weekday:'short',day:'2-digit',month:'long',year:'numeric'})+' um '+validUntil.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'}):'—';

    // Format countdown
    var bigCountdown;
    if(licExpired){
      bigCountdown='<div style="font-size:34px;font-weight:800;color:var(--rd);font-family:\'DM Sans\',sans-serif">ABGELAUFEN</div>';
    }else{
      bigCountdown=
        '<div style="display:flex;gap:14px;align-items:flex-start;justify-content:center">'+
          '<div style="text-align:center"><div style="font-size:38px;font-weight:800;color:#0f1729;line-height:1;font-variant-numeric:tabular-nums">'+days+'</div><div style="font-size:10px;color:#475066;text-transform:uppercase;letter-spacing:1.5px;margin-top:4px;font-weight:700">Tage</div></div>'+
          '<div style="font-size:32px;color:#94a3b8;line-height:1.1">:</div>'+
          '<div style="text-align:center"><div style="font-size:38px;font-weight:800;color:#0f1729;line-height:1;font-variant-numeric:tabular-nums">'+(hrs<10?'0':'')+hrs+'</div><div style="font-size:10px;color:#475066;text-transform:uppercase;letter-spacing:1.5px;margin-top:4px;font-weight:700">Std</div></div>'+
          '<div style="font-size:32px;color:#94a3b8;line-height:1.1">:</div>'+
          '<div style="text-align:center"><div style="font-size:38px;font-weight:800;color:#0f1729;line-height:1;font-variant-numeric:tabular-nums">'+(mins<10?'0':'')+mins+'</div><div style="font-size:10px;color:#475066;text-transform:uppercase;letter-spacing:1.5px;margin-top:4px;font-weight:700">Min</div></div>'+
          '<div style="font-size:32px;color:#94a3b8;line-height:1.1">:</div>'+
          '<div style="text-align:center"><div style="font-size:38px;font-weight:800;color:#0f1729;line-height:1;font-variant-numeric:tabular-nums">'+(secs<10?'0':'')+secs+'</div><div style="font-size:10px;color:#475066;text-transform:uppercase;letter-spacing:1.5px;margin-top:4px;font-weight:700">Sek</div></div>'+
        '</div>';
    }

    var pwBadge='';
    if(pwExpired){
      pwBadge='<span style="display:inline-block;padding:4px 10px;border-radius:12px;background:var(--rdd);color:var(--rd);font-weight:700;font-size:11px;margin-left:6px">🔑 PW abgelaufen</span>';
    }else if(pwDaysLeft<=3){
      pwBadge='<span style="display:inline-block;padding:4px 10px;border-radius:12px;background:var(--ord);color:var(--or);font-weight:600;font-size:11px;margin-left:6px">🔑 PW läuft in '+pwDaysLeft+' Tag'+(pwDaysLeft===1?'':'en')+' ab</span>';
    }

    panel.innerHTML=
      '<div style="background:'+bg+';border:1.5px solid '+border+';border-radius:14px;padding:22px 26px;box-shadow:0 4px 14px rgba(15,23,41,.08)">'+
        '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:14px">'+
          '<div style="display:flex;align-items:center;gap:12px">'+
            '<div style="font-size:30px">'+ic+'</div>'+
            '<div>'+
              '<div style="font-size:18px;font-weight:700;color:#0f1729">'+title+pwBadge+'</div>'+
              '<div style="font-size:13px;color:#475066">'+subtitle+'</div>'+
            '</div>'+
          '</div>'+
          '<div style="text-align:right">'+
            '<div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#475066;font-weight:700">Lizenzkey</div>'+
            '<div style="font-family:\'SF Mono\',Menlo,Consolas,monospace;font-size:13px;font-weight:700;color:#0f1729;letter-spacing:1px">'+adminEscape(fresh.licenseKey||'—')+'</div>'+
          '</div>'+
        '</div>'+
        '<div style="background:rgba(255,255,255,.6);border-radius:10px;padding:18px;margin-bottom:14px">'+
          bigCountdown+
          '<div style="text-align:center;margin-top:14px;font-size:12px;color:#475066">Gültig bis: <b style="color:#0f1729">'+validUntilStr+'</b></div>'+
        '</div>'+
        '<div style="display:flex;gap:8px;flex-wrap:wrap">'+
          '<button class="btn btn-p" onclick="userRequestRenewal()" style="flex:1;min-width:200px">✉️ Verlängerung per E-Mail anfordern</button>'+
          (pwDaysLeft<=7||pwExpired?'<button class="btn" onclick="userOpenChangePw()" style="flex:1;min-width:160px">🔑 Passwort ändern</button>':'')+
        '</div>'+
      '</div>';
  }
  renderTick();
  // Only run countdown ticker if license is still valid
  if(!window.WikaAuth.isLicenseExpired(u)){
    _licenseCountdownTimer=setInterval(renderTick,1000);
  }
}

// User actions from dashboard
function userRequestRenewal(){
  var u=window.WikaAuth.currentUser();
  if(!u)return;
  if(window.wikaSendRenewalMail)window.wikaSendRenewalMail(u);
}
function userOpenChangePw(){
  // Reuse admin password modal but target self
  if(typeof adminChangePw==='function'){
    var u=window.WikaAuth.currentUser();
    if(u)adminChangePw(u.username);
  }
}

function adminRenderUsers(){
  if(!window.WikaAuth)return;
  var users=window.WikaAuth.loadUsers()||[];
  var current=window.WikaAuth.currentUser();
  var body=document.getElementById('adminUsersBody');
  if(!body)return;

  // Update lifetime text
  var lt=document.getElementById('adminPwLifetimeText');
  if(lt)lt.textContent=window.WikaAuth.PW_LIFETIME_DAYS+' Tage';

  // Stats
  var admins=0, pwExpired=0, licExpired=0;
  users.forEach(function(u){
    if(u.role==='admin')admins++;
    if(window.WikaAuth.isExpired(u))pwExpired++;
    if(window.WikaAuth.isLicenseExpired(u))licExpired++;
  });
  var stats=document.getElementById('adminStatsLine');
  if(stats){
    var s=users.length+' Benutzer · '+admins+' Admin'+(admins===1?'':'s');
    if(licExpired)s+=' · <span style="color:var(--rd);font-weight:700">'+licExpired+' Lizenz abgelaufen</span>';
    if(pwExpired)s+=' · <span style="color:var(--or);font-weight:700">'+pwExpired+' PW abgelaufen</span>';
    stats.innerHTML=s;
  }
  var cnt=document.getElementById('adminUserCount');
  if(cnt)cnt.textContent=users.length+' Benutzer';

  // Render rows
  body.innerHTML='';
  if(!users.length){
    body.innerHTML='<tr><td colspan="7" style="padding:30px;text-align:center;color:var(--tx2)">Keine Benutzer vorhanden.</td></tr>';
    return;
  }

  users.forEach(function(u){
    var isCurrent=current && current.username===u.username;
    var isAdmin=u.role==='admin';
    var pwExp=window.WikaAuth.isExpired(u);
    var licExp=window.WikaAuth.isLicenseExpired(u);
    var pwDays=window.WikaAuth.daysLeft(u);
    var licDays=window.WikaAuth.licenseDaysLeft(u);
    var permanent=(u.licenseExpiresAt===null||typeof u.licenseExpiresAt==='undefined');

    var roleBadge=isAdmin
      ? '<span style="display:inline-block;padding:3px 10px;border-radius:12px;background:var(--acd);color:var(--ac-text);font-weight:700;font-size:11px">🛡️ Admin</span>'
      : '<span style="display:inline-block;padding:3px 10px;border-radius:12px;background:var(--bld);color:var(--bl);font-weight:600;font-size:11px">👤 Standard</span>';

    // Status badge (combined)
    var statusBadge='';
    if(u.status==='blocked'){
      statusBadge='<span style="display:inline-block;padding:3px 10px;border-radius:12px;background:var(--rdd);color:var(--rd);font-weight:700;font-size:11px">🚫 Gesperrt</span>';
    }else if(u.status==='pending'){
      statusBadge='<span style="display:inline-block;padding:3px 10px;border-radius:12px;background:var(--ord);color:var(--or);font-weight:700;font-size:11px">⏳ Wartet</span>';
    }else if(licExp){
      statusBadge='<span style="display:inline-block;padding:3px 10px;border-radius:12px;background:var(--rdd);color:var(--rd);font-weight:700;font-size:11px">⌛ Lizenz abgelaufen</span>';
    }else if(u.mustChange){
      statusBadge='<span style="display:inline-block;padding:3px 10px;border-radius:12px;background:var(--ord);color:var(--or);font-weight:600;font-size:11px">⚠️ PW-Wechsel fällig</span>';
    }else if(pwExp){
      statusBadge='<span style="display:inline-block;padding:3px 10px;border-radius:12px;background:var(--ord);color:var(--or);font-weight:600;font-size:11px">🔑 PW abgelaufen</span>';
    }else{
      statusBadge='<span style="display:inline-block;padding:3px 10px;border-radius:12px;background:var(--gnd);color:var(--gn);font-weight:600;font-size:11px">✓ Aktiv</span>';
    }

    // License validity column
    var licText;
    if(permanent){
      licText='<span style="color:var(--ac-text);font-weight:700">∞ permanent</span>';
    }else if(licExp){
      licText='<span style="color:var(--rd);font-weight:700">abgelaufen</span>';
    }else{
      var d=new Date(u.licenseExpiresAt);
      var ds=d.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'2-digit'});
      var color=licDays<=3?'var(--rd)':licDays<=7?'var(--or)':'var(--tx)';
      licText='<span style="color:'+color+';font-weight:600">'+licDays+'d</span> <span style="color:var(--tx3);font-size:11px">bis '+ds+'</span>';
    }

    // PW column
    var pwText;
    if(pwExp){
      pwText='<span style="color:var(--rd);font-weight:700">abgelaufen</span>';
    }else{
      var pwColor=pwDays<=3?'var(--rd)':pwDays<=7?'var(--or)':'var(--tx2)';
      pwText='<span style="color:'+pwColor+'">'+pwDays+'d</span>';
    }

    // License key column
    var keyHtml='<span style="font-family:monospace;font-size:11px;color:var(--tx2)">'+adminEscape(u.licenseKey||'—')+'</span>';
    if(u.email){
      keyHtml='<div style="font-size:11px;color:var(--tx3);margin-bottom:2px">'+adminEscape(u.email)+'</div>'+keyHtml;
    }

    // Actions: dropdown-like menu
    var actions='';
    actions+='<button class="btn btn-sm" onclick="adminChangePw(\''+adminEscape(u.username)+'\')" title="Passwort ändern" style="margin-left:2px">🔑</button>';
    actions+='<button class="btn btn-sm" onclick="adminOpenLicenseMenu(\''+adminEscape(u.username)+'\')" title="Lizenz verwalten" style="margin-left:2px">📅</button>';
    actions+='<button class="btn btn-sm" onclick="adminToggleRole(\''+adminEscape(u.username)+'\')" title="Rolle wechseln" style="margin-left:2px">🔄</button>';
    if(u.email){
      actions+='<button class="btn btn-sm" onclick="adminMailUser(\''+adminEscape(u.username)+'\')" title="E-Mail an Benutzer" style="margin-left:2px">✉️</button>';
    }
    if(!isCurrent){
      actions+='<button class="btn btn-sm btn-d" onclick="adminDeleteUser(\''+adminEscape(u.username)+'\')" title="Benutzer löschen" style="margin-left:2px">🗑️</button>';
    }else{
      actions+='<span style="margin-left:6px;font-size:11px;color:var(--tx3);font-style:italic">(du)</span>';
    }

    var tr=document.createElement('tr');
    tr.style.borderBottom='1px solid var(--bd)';
    if(isCurrent)tr.style.background='rgba(217,119,6,.05)';
    tr.innerHTML=
      '<td style="padding:12px;font-weight:600">'+adminEscape(u.username)+(isCurrent?' <span style="color:var(--ac-text);font-size:11px">●</span>':'')+'</td>'+
      '<td style="padding:12px">'+roleBadge+'</td>'+
      '<td style="padding:12px">'+keyHtml+'</td>'+
      '<td style="padding:12px;font-size:12px">'+licText+'</td>'+
      '<td style="padding:12px">'+pwText+'</td>'+
      '<td style="padding:12px">'+statusBadge+'</td>'+
      '<td style="padding:12px;text-align:right;white-space:nowrap">'+actions+'</td>';
    body.appendChild(tr);
  });

  // Render current session block
  var sessBox=document.getElementById('adminCurrentSession');
  if(sessBox && current){
    var dl=window.WikaAuth.daysLeft(current);
    var ldl=window.WikaAuth.licenseDaysLeft(current);
    var lp=(current.licenseExpiresAt===null||typeof current.licenseExpiresAt==='undefined');
    sessBox.innerHTML=
      '<div style="width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,var(--ac),var(--ac2));color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:20px">'+(current.username[0]||'?').toUpperCase()+'</div>'+
      '<div style="flex:1;min-width:200px">'+
        '<div style="font-size:16px;font-weight:700">'+adminEscape(current.username)+(current.email?' <span style="font-size:12px;color:var(--tx3);font-weight:400">· '+adminEscape(current.email)+'</span>':'')+'</div>'+
        '<div style="font-size:12px;color:var(--tx2)">'+(current.role==='admin'?'🛡️ Administrator':'👤 Standard-Benutzer')+' · Lizenz: <span style="font-family:monospace">'+adminEscape(current.licenseKey||'—')+'</span></div>'+
      '</div>'+
      '<div style="text-align:right">'+
        '<div style="font-size:11px;color:var(--tx3);text-transform:uppercase;letter-spacing:.5px">Lizenz</div>'+
        '<div style="font-size:20px;font-weight:700;color:'+(lp?'var(--ac)':(ldl<=3?'var(--rd)':'var(--gn)'))+'">'+(lp?'∞':(ldl+' Tag'+(ldl===1?'':'e')))+'</div>'+
      '</div>'+
      '<div style="text-align:right">'+
        '<div style="font-size:11px;color:var(--tx3);text-transform:uppercase;letter-spacing:.5px">PW gültig</div>'+
        '<div style="font-size:20px;font-weight:700;color:'+(dl<=3?'var(--rd)':'var(--gn)')+'">'+dl+' Tag'+(dl===1?'':'e')+'</div>'+
      '</div>'+
      '<button class="btn" onclick="adminChangePw(\''+adminEscape(current.username)+'\')">🔑 Mein Passwort ändern</button>';
  }
}

// ── New / Edit user modal ──
function adminOpenNewUserModal(){
  _adminEditingUser=null;
  document.getElementById('adminUserModalTitle').textContent='Neuer Benutzer';
  document.getElementById('adminUserName').value='';
  document.getElementById('adminUserName').disabled=false;
  document.getElementById('adminUserEmail').value='';
  document.getElementById('adminUserRole').value='user';
  document.getElementById('adminUserLicenseDuration').value='14';
  document.getElementById('adminUserPw').value='';
  document.getElementById('adminUserMustChange').checked=true;
  document.getElementById('adminUserPwField').style.display='';
  adminToggleLicenseField();
  var err=document.getElementById('adminUserError');err.style.display='none';
  document.getElementById('adminUserModal').classList.add('show');
  setTimeout(function(){document.getElementById('adminUserName').focus();},80);
}
function adminCloseUserModal(){
  document.getElementById('adminUserModal').classList.remove('show');
}
function adminToggleLicenseField(){
  // Admins get permanent by default; show field anyway
  var role=document.getElementById('adminUserRole').value;
  if(role==='admin'){
    document.getElementById('adminUserLicenseDuration').value='permanent';
  }
}

function adminGenPw(){
  document.getElementById('adminUserPw').value=adminGeneratePassword();
  document.getElementById('adminUserPw').type='text';
  document.getElementById('adminUserPwToggle').textContent='🙈';
}
function adminGenPwForChange(){
  document.getElementById('adminPwNew').value=adminGeneratePassword();
  document.getElementById('adminPwNew').type='text';
  document.getElementById('adminPwNewToggle').textContent='🙈';
}
function adminGeneratePassword(){
  var chars='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  var pw='';
  if(window.crypto && crypto.getRandomValues){
    var arr=new Uint32Array(12);
    crypto.getRandomValues(arr);
    for(var i=0;i<12;i++){pw+=chars[arr[i]%chars.length];}
  }else{
    for(var j=0;j<12;j++){pw+=chars[Math.floor(Math.random()*chars.length)];}
  }
  return pw;
}

function adminShowUserErr(msg){
  var e=document.getElementById('adminUserError');
  e.textContent=msg;
  e.style.display='block';
}

function adminSaveUser(){
  var name=(document.getElementById('adminUserName').value||'').trim();
  var email=(document.getElementById('adminUserEmail').value||'').trim();
  var role=document.getElementById('adminUserRole').value;
  var dur=document.getElementById('adminUserLicenseDuration').value;
  var pw=document.getElementById('adminUserPw').value||'';
  var mustChange=document.getElementById('adminUserMustChange').checked;

  if(name.length<3){return adminShowUserErr('Benutzername muss mindestens 3 Zeichen lang sein.');}
  if(!/^[a-zA-Z0-9_-]+$/.test(name)){return adminShowUserErr('Nur Buchstaben, Zahlen, Unter-/Bindestrich erlaubt.');}
  if(email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)){return adminShowUserErr('Bitte eine gültige E-Mail-Adresse eingeben (oder leer lassen).');}
  if(pw.length<6){return adminShowUserErr('Passwort muss mindestens 6 Zeichen lang sein.');}

  var users=window.WikaAuth.loadUsers()||[];
  // Duplicate check (case-insensitive)
  for(var i=0;i<users.length;i++){
    if(users[i].username.toLowerCase()===name.toLowerCase()){
      return adminShowUserErr('Ein Benutzer mit diesem Namen existiert bereits.');
    }
    if(email && (users[i].email||'').toLowerCase()===email.toLowerCase()){
      return adminShowUserErr('Diese E-Mail-Adresse ist bereits vergeben.');
    }
  }

  // License expiry
  var licenseExpiresAt;
  if(dur==='permanent'){licenseExpiresAt=null;}
  else{licenseExpiresAt=Date.now()+(parseInt(dur,10)*24*60*60*1000);}

  // License key (admin permanent gets WIKA-ADMIN-PERMANENT, others random)
  var licenseKey=(role==='admin' && dur==='permanent')?'WIKA-ADMIN-PERMANENT':window.WikaAuth.genLicense();

  users.push({
    username:name,
    email:email,
    passHash:window.WikaAuth.hash(pw),
    role:role,
    status:'active',
    pwSetAt:Date.now(),
    mustChange:mustChange,
    createdAt:Date.now(),
    licenseKey:licenseKey,
    licenseExpiresAt:licenseExpiresAt
  });
  window.WikaAuth.saveUsers(users);

  adminCloseUserModal();
  if(window.toast)toast('✅ Benutzer "'+name+'" angelegt');
  adminRenderUsers();

  // If email exists, offer to send the welcome mail right away
  if(email){
    setTimeout(function(){
      if(confirm('📧 Soll jetzt eine E-Mail mit den Zugangsdaten an '+email+' geöffnet werden?')){
        adminSendWelcomeMail(name,email,licenseKey,pw,licenseExpiresAt);
      }
    },300);
  }
}

function adminSendWelcomeMail(username,email,licenseKey,plainPw,validUntil){
  var dStr=validUntil
    ? new Date(validUntil).toLocaleDateString('de-DE',{day:'2-digit',month:'long',year:'numeric'})
    : 'unbegrenzt';
  var subject='Deine Zugangsdaten für AMZ SellerHub';
  var body=
    'Hallo '+username+',\n\n'+
    'dein AMZ SellerHub-Account wurde angelegt. Hier deine Zugangsdaten:\n\n'+
    '═══════════════════════════════════════\n'+
    '  ZUGANGSDATEN\n'+
    '═══════════════════════════════════════\n\n'+
    'Benutzername: '+username+'\n'+
    'Passwort:     '+plainPw+'\n'+
    'Lizenzkey:    '+licenseKey+'\n'+
    'Gültig bis:   '+dStr+'\n\n'+
    '═══════════════════════════════════════\n\n'+
    '➜ Beim ersten Login musst du das Passwort\n'+
    '  ändern.\n'+
    '➜ Bewahre den Lizenzkey sicher auf.\n\n'+
    'Viel Erfolg!\n'+
    '— AMZ SellerHub Admin';
  window.location.href='mailto:'+encodeURIComponent(email)+
    '?subject='+encodeURIComponent(subject)+
    '&body='+encodeURIComponent(body);
}

function adminMailUser(username){
  var u=window.WikaAuth.findUser(username);
  if(!u || !u.email){alert('Kein E-Mail vorhanden für diesen Benutzer.');return;}
  var dStr=u.licenseExpiresAt
    ? new Date(u.licenseExpiresAt).toLocaleDateString('de-DE',{day:'2-digit',month:'long',year:'numeric'})
    : 'unbegrenzt';
  var subject='AMZ SellerHub · Info zu deinem Account';
  var body=
    'Hallo '+u.username+',\n\n'+
    'hier dein aktueller Lizenz-Status:\n\n'+
    'Benutzername: '+u.username+'\n'+
    'Lizenzkey:    '+u.licenseKey+'\n'+
    'Gültig bis:   '+dStr+'\n\n'+
    '— AMZ SellerHub Admin';
  window.location.href='mailto:'+encodeURIComponent(u.email)+
    '?subject='+encodeURIComponent(subject)+
    '&body='+encodeURIComponent(body);
}

function adminToggleRole(username){
  var users=window.WikaAuth.loadUsers()||[];
  var current=window.WikaAuth.currentUser();
  var target=null;
  users.forEach(function(u){if(u.username===username)target=u;});
  if(!target)return;

  // Prevent demoting the last admin
  if(target.role==='admin'){
    var adminCount=users.filter(function(u){return u.role==='admin';}).length;
    if(adminCount<=1){
      alert('❌ Du kannst den letzten Administrator nicht zum Standard-Benutzer machen.');
      return;
    }
    if(current && current.username===username){
      if(!confirm('⚠️ Du machst dich selbst zum Standard-Benutzer und verlierst sofort den Zugriff auf den Admin-Bereich. Wirklich fortfahren?'))return;
    }
  }

  var newRole=target.role==='admin'?'user':'admin';
  if(!confirm('Rolle von "'+username+'" auf "'+(newRole==='admin'?'Administrator':'Standard-Benutzer')+'" ändern?'))return;

  for(var i=0;i<users.length;i++){
    if(users[i].username===username){users[i].role=newRole;break;}
  }
  window.WikaAuth.saveUsers(users);
  if(window.toast)toast('✅ Rolle geändert');
  adminRenderUsers();
  if(window.wikaApplyRoleVisibility)window.wikaApplyRoleVisibility();
}

function adminDeleteUser(username){
  var current=window.WikaAuth.currentUser();
  if(current && current.username===username){
    alert('❌ Du kannst dich nicht selbst löschen.');
    return;
  }
  var users=window.WikaAuth.loadUsers()||[];
  var target=users.filter(function(u){return u.username===username;})[0];
  if(target && target.role==='admin'){
    var adminCount=users.filter(function(u){return u.role==='admin';}).length;
    if(adminCount<=1){
      alert('❌ Der letzte Administrator kann nicht gelöscht werden.');
      return;
    }
  }
  if(!confirm('Benutzer "'+username+'" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.'))return;

  users=users.filter(function(u){return u.username!==username;});
  window.WikaAuth.saveUsers(users);
  if(window.toast)toast('🗑️ Benutzer gelöscht');
  adminRenderUsers();
}

// ── Change password modal ──
function adminChangePw(username){
  _adminPwTarget=username;
  document.getElementById('adminPwTargetName').textContent=username;
  document.getElementById('adminPwNew').value='';
  document.getElementById('adminPwNew').type='password';
  document.getElementById('adminPwNewToggle').textContent='👁️';
  var current=window.WikaAuth.currentUser();
  document.getElementById('adminPwForceChange').checked=!(current && current.username===username);
  var err=document.getElementById('adminPwError');err.style.display='none';
  document.getElementById('adminPwModal').classList.add('show');
  setTimeout(function(){document.getElementById('adminPwNew').focus();},80);
}
function adminClosePwModal(){
  document.getElementById('adminPwModal').classList.remove('show');
  _adminPwTarget=null;
}
function adminSavePw(){
  if(!_adminPwTarget)return;
  var pw=document.getElementById('adminPwNew').value||'';
  var force=document.getElementById('adminPwForceChange').checked;
  var err=document.getElementById('adminPwError');

  if(pw.length<6){err.textContent='Passwort muss mindestens 6 Zeichen lang sein.';err.style.display='block';return;}

  var users=window.WikaAuth.loadUsers()||[];
  for(var i=0;i<users.length;i++){
    if(users[i].username===_adminPwTarget){
      users[i].passHash=window.WikaAuth.hash(pw);
      users[i].pwSetAt=Date.now();
      users[i].mustChange=force;
      break;
    }
  }
  window.WikaAuth.saveUsers(users);

  // If admin changed own password without force-change, keep session valid
  var current=window.WikaAuth.currentUser();
  var changedSelf=current && current.username===_adminPwTarget;
  if(changedSelf && force){
    if(window.toast)toast('🔑 Passwort geändert. Bitte neu anmelden.');
    setTimeout(function(){window.WikaAuth.logout();},800);
  }else{
    if(window.toast)toast('🔑 Passwort aktualisiert');
  }

  adminClosePwModal();
  adminRenderUsers();
}

/* ═══════════════════════════════════════════════════════════════
   LICENSE MANAGEMENT
   ═══════════════════════════════════════════════════════════════ */
var _adminLicTarget=null;

function adminOpenLicenseMenu(username){
  _adminLicTarget=username;
  var u=window.WikaAuth.findUser(username);
  if(!u){alert('Benutzer nicht gefunden.');return;}
  document.getElementById('adminLicTargetName').textContent=username;
  document.getElementById('adminLicCurrentKey').textContent=u.licenseKey||'—';
  var ex=document.getElementById('adminLicCurrentExpiry');
  if(u.licenseExpiresAt===null||typeof u.licenseExpiresAt==='undefined'){
    ex.innerHTML='<span style="color:var(--ac-text)">∞ permanent</span>';
  }else if(window.WikaAuth.isLicenseExpired(u)){
    ex.innerHTML='<span style="color:var(--rd)">'+adminFmtDate(u.licenseExpiresAt)+' (abgelaufen)</span>';
  }else{
    ex.innerHTML=adminFmtDate(u.licenseExpiresAt)+' <span style="color:var(--gn);font-size:11px">('+window.WikaAuth.licenseDaysLeft(u)+' Tage)</span>';
  }
  document.getElementById('adminLicenseModal').classList.add('show');
}
function adminCloseLicenseModal(){
  document.getElementById('adminLicenseModal').classList.remove('show');
  _adminLicTarget=null;
}

function adminExtendLicense(mode,days){
  if(!_adminLicTarget)return;
  var users=window.WikaAuth.loadUsers()||[];
  var idx=-1;
  for(var i=0;i<users.length;i++){if(users[i].username===_adminLicTarget){idx=i;break;}}
  if(idx===-1)return;
  var u=users[idx];

  if(days==='permanent'){
    u.licenseExpiresAt=null;
  }else{
    days=parseInt(days,10);
    if(mode==='reset'){
      u.licenseExpiresAt=Date.now()+(days*24*60*60*1000);
    }else{ // 'add'
      var base=Math.max(Date.now(),u.licenseExpiresAt||Date.now());
      u.licenseExpiresAt=base+(days*24*60*60*1000);
    }
  }
  window.WikaAuth.saveUsers(users);
  if(window.toast)toast('📅 Lizenz aktualisiert');

  // Refresh modal display
  var refreshed=window.WikaAuth.findUser(_adminLicTarget);
  var ex=document.getElementById('adminLicCurrentExpiry');
  if(refreshed.licenseExpiresAt===null){
    ex.innerHTML='<span style="color:var(--ac-text)">∞ permanent</span>';
  }else{
    ex.innerHTML=adminFmtDate(refreshed.licenseExpiresAt)+' <span style="color:var(--gn);font-size:11px">('+window.WikaAuth.licenseDaysLeft(refreshed)+' Tage)</span>';
  }
  adminRenderUsers();

  // Offer to send mail to user
  if(refreshed.email){
    setTimeout(function(){
      if(confirm('📧 Soll '+refreshed.email+' eine Mail mit dem neuen Status erhalten?')){
        adminSendLicenseUpdateMail(refreshed);
      }
    },300);
  }
}

function adminRegenerateLicenseKey(){
  if(!_adminLicTarget)return;
  if(!confirm('Wirklich einen neuen Lizenzkey generieren? Der alte Key wird ungültig.'))return;
  var users=window.WikaAuth.loadUsers()||[];
  for(var i=0;i<users.length;i++){
    if(users[i].username===_adminLicTarget){
      users[i].licenseKey=window.WikaAuth.genLicense();
      window.WikaAuth.saveUsers(users);
      document.getElementById('adminLicCurrentKey').textContent=users[i].licenseKey;
      if(window.toast)toast('🔑 Neuer Lizenzkey erstellt: '+users[i].licenseKey);
      adminRenderUsers();
      // Mail option
      if(users[i].email){
        setTimeout(function(){
          if(confirm('📧 Neuen Lizenzkey per E-Mail an '+users[i].email+' senden?')){
            adminSendLicenseUpdateMail(users[i]);
          }
        },300);
      }
      break;
    }
  }
}

function adminSendLicenseUpdateMail(u){
  if(!u||!u.email)return;
  var dStr=u.licenseExpiresAt
    ? new Date(u.licenseExpiresAt).toLocaleDateString('de-DE',{day:'2-digit',month:'long',year:'numeric'})
    : 'unbegrenzt';
  var subject='AMZ SellerHub · Deine Lizenz wurde aktualisiert';
  var body=
    'Hallo '+u.username+',\n\n'+
    'deine Lizenz wurde vom Administrator aktualisiert.\n\n'+
    '═══════════════════════════════════════\n'+
    '  AKTUELLE LIZENZ-DATEN\n'+
    '═══════════════════════════════════════\n\n'+
    'Benutzername: '+u.username+'\n'+
    'Lizenzkey:    '+u.licenseKey+'\n'+
    'Gültig bis:   '+dStr+'\n\n'+
    '═══════════════════════════════════════\n\n'+
    'Bei Fragen melde dich beim Administrator.\n\n'+
    '— AMZ SellerHub Admin';
  window.location.href='mailto:'+encodeURIComponent(u.email)+
    '?subject='+encodeURIComponent(subject)+
    '&body='+encodeURIComponent(body);
}

/* ═══════════════════════════════════════════════════════════════
   CLOUD-KONTEN (Betreiber, ADMIN_KEY — Modul 4)
   Verwaltet die ECHTEN Server-Konten (/api/admin/users). Der ADMIN_KEY
   bleibt gerätelokal (sh_admin_key, bewusst NICHT in der Sync-Positivliste).
   ═══════════════════════════════════════════════════════════════ */
function shCloudApi(){
  var DEF='https://radar-production-388a.up.railway.app';
  try{return (localStorage.getItem('wika_radar_api')||DEF).replace(/\/+$/,'');}catch(e){return DEF;}
}
function shAdminKey(){
  var inp=document.getElementById('shAdminKey');
  var k=(inp&&inp.value||'').trim();
  if(k){try{localStorage.setItem('sh_admin_key',k);}catch(e){}return k;}
  try{k=localStorage.getItem('sh_admin_key')||'';}catch(e){}
  if(k&&inp)inp.value=k;
  return k;
}
function shCloudErr(msg){
  var e=document.getElementById('shCloudError');
  if(!e)return;
  if(!msg){e.style.display='none';return;}
  e.textContent=msg;e.style.display='block';
}
function shCloudFetch(path,body){
  return fetch(shCloudApi()+path,{
    method:body?'POST':'GET',
    headers:Object.assign({'X-Api-Key':shAdminKey()},body?{'Content-Type':'application/json'}:{}),
    body:body?JSON.stringify(body):undefined
  }).then(function(res){return res.json().catch(function(){return {};}).then(function(d){
    if(res.status===401)throw new Error('ADMIN_KEY falsch oder nicht gesetzt (Railway-Dashboard → radar → Variables).');
    if(!res.ok)throw new Error(d.error||('HTTP '+res.status));
    return d;
  });});
}
var _shCloudUsers=[];
function shCloudLoadUsers(){
  shCloudErr('');
  if(!shAdminKey())return shCloudErr('Bitte zuerst den ADMIN_KEY eingeben.');
  shCloudFetch('/api/admin/users').then(function(d){
    _shCloudUsers=d.users||[];
    shCloudRender();
  }).catch(function(e){shCloudErr(e.message||'Server nicht erreichbar.');});
}
function shCloudRender(){
  var tb=document.getElementById('shCloudUsersBody');
  if(!tb)return;
  var stats=document.getElementById('shCloudStatsLine');
  if(stats)stats.textContent=_shCloudUsers.length+' Konten · '+_shCloudUsers.filter(function(u){return u.role==='admin';}).length+' Admin(s)';
  if(!_shCloudUsers.length){tb.innerHTML='<tr><td colspan="6" style="padding:14px 12px;color:var(--tx3)">Keine Konten vorhanden.</td></tr>';return;}
  tb.innerHTML=_shCloudUsers.map(function(u){
    var isAdmin=u.role==='admin';
    return '<tr style="border-bottom:1px solid var(--bd)">'+
      '<td style="padding:10px 12px;font-weight:600">'+adminEscape(u.email)+'</td>'+
      '<td style="padding:10px 12px">'+adminEscape(u.displayName||'—')+'</td>'+
      '<td style="padding:10px 12px"><span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700;background:'+(isAdmin?'rgba(217,119,6,.15);color:var(--ac-text)':'rgba(29,78,216,.10);color:#1d4ed8')+'">'+(isAdmin?'Admin':'Benutzer')+'</span></td>'+
      '<td style="padding:10px 12px;color:var(--tx2)">'+adminFmtDate(u.createdAt)+'</td>'+
      '<td style="padding:10px 12px;color:var(--tx2)">'+adminFmtDate(u.lastLoginAt)+'</td>'+
      '<td style="padding:10px 12px;text-align:right;white-space:nowrap">'+
        '<button class="btn btn-sm" onclick="shCloudResetPw(\''+u.id+'\')" title="Neues Passwort setzen (widerruft alle Sitzungen)">🔑 Reset</button> '+
        '<button class="btn btn-sm" onclick="shCloudToggleRole(\''+u.id+'\')" title="Rolle umschalten">'+(isAdmin?'⬇️ Zu Benutzer':'⬆️ Zu Admin')+'</button>'+
      '</td>'+
    '</tr>';
  }).join('');
}
function shCloudFind(id){
  for(var i=0;i<_shCloudUsers.length;i++)if(_shCloudUsers[i].id===id)return _shCloudUsers[i];
  return null;
}
function shCloudResetPw(id){
  var u=shCloudFind(id);if(!u)return;
  var np=window.prompt('Neues Passwort für '+u.email+' (mind. 8 Zeichen):\n\nAlle aktiven Sitzungen des Kontos werden widerrufen.','');
  if(np===null)return;
  np=np.trim();
  if(np.length<8)return shCloudErr('Das Passwort braucht mindestens 8 Zeichen.');
  shCloudErr('');
  shCloudFetch('/api/admin/users/'+id+'/reset-password',{newPassword:np}).then(function(d){
    if(typeof window.toast==='function')window.toast('🔑 Passwort für '+u.email+' gesetzt ('+(d.revokedSessions||0)+' Sitzung(en) widerrufen)');
  }).catch(function(e){shCloudErr(e.message);});
}
function shCloudToggleRole(id){
  var u=shCloudFind(id);if(!u)return;
  var neu=u.role==='admin'?'user':'admin';
  if(!confirm(u.email+' → Rolle "'+(neu==='admin'?'Admin':'Benutzer')+'"?'))return;
  shCloudErr('');
  shCloudFetch('/api/admin/users/'+id+'/role',{role:neu}).then(function(){
    u.role=neu;
    shCloudRender();
    if(typeof window.toast==='function')window.toast('🛡️ '+u.email+' ist jetzt '+(neu==='admin'?'Admin':'Benutzer'));
  }).catch(function(e){shCloudErr(e.message);});
}
