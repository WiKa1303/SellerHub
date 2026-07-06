// ═══ SellerHub Marketing-Website — kleine Interaktionen (kein Framework) ═══
// Mobile-Navigation, Preis-Toggle (monatlich/jährlich), Kontaktformular-UI.
(function(){
'use strict';

// ── Mobile-Burger ──
var nav=document.querySelector('.nav');
var burger=document.querySelector('.nav-burger');
if(burger)burger.addEventListener('click',function(){nav.classList.toggle('open');});

// ── Aktiven Nav-Link markieren (Dateiname vergleichen) ──
var here=(location.pathname.split('/').pop()||'index.html');
document.querySelectorAll('.nav-links a').forEach(function(a){
  var href=a.getAttribute('href')||'';
  if(href===here||(here==='index.html'&&href==='index.html'))a.classList.add('active');
});

// ── Preis-Toggle: monatlich / jährlich (−17 % ≈ 2 Monate geschenkt) ──
window.priceMode=function(mode){
  document.querySelectorAll('.price-toggle button').forEach(function(b){
    b.classList.toggle('on',b.dataset.mode===mode);
  });
  document.querySelectorAll('[data-monthly]').forEach(function(el){
    var v=mode==='year'?el.dataset.yearly:el.dataset.monthly;
    el.childNodes[0].nodeValue=v; // Zahl ersetzen, <small> bleibt
  });
  document.querySelectorAll('.per').forEach(function(el){
    el.textContent=mode==='year'?'pro Monat · jährliche Zahlung (2 Monate geschenkt)':'pro Monat · monatlich kündbar';
  });
};

// ── Kontaktformular: valide? → Mail-Programm vorbefüllt öffnen + Erfolgs-UI ──
// (Bewusst ohne Server: die Website ist statisch; die Nachricht geht als E-Mail raus.)
window.contactSubmit=function(ev){
  ev.preventDefault();
  var f=ev.target;
  var name=(f.querySelector('[name=name]').value||'').trim();
  var mail=(f.querySelector('[name=email]').value||'').trim();
  var msg=(f.querySelector('[name=message]').value||'').trim();
  var ok=document.getElementById('formOk'),err=document.getElementById('formErr');
  if(ok)ok.style.display='none';
  if(err)err.style.display='none';
  if(!name||!msg||!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail)){
    if(err){err.textContent='Bitte alle Felder ausfüllen und eine gültige E-Mail-Adresse angeben.';err.style.display='block';}
    return false;
  }
  var body='Name: '+name+'\nE-Mail: '+mail+'\n\n'+msg;
  location.href='mailto:support@amzsellerhub.de?subject='+encodeURIComponent('SellerHub-Anfrage von '+name)+'&body='+encodeURIComponent(body);
  if(ok){ok.textContent='✓ Dein E-Mail-Programm öffnet sich mit der vorbereiteten Nachricht — einfach absenden. Alternativ direkt an support@amzsellerhub.de schreiben.';ok.style.display='block';}
  f.reset();
  return false;
};
})();
