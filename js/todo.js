// ═══════════════════════════════════════════════════════════════════════════
// TO-DO-MODUL (Seite p-todo) — cloud-basierte Aufgabenverwaltung
// Eigenentwicklung im AMZSellerHub-Design: Smart-Lists, Ordner/Listen,
// Ansichten Liste/Board/Kalender, Detail-Panel (Rich-Text, Checkliste,
// Subtasks, Tags, Anhänge, Kommentare, Aktivität), Kollaboration mit Rollen,
// Echtzeit via SSE, optimistische Updates, Shortcuts, Bulk-Aktionen.
// Backend: /api/todo/* (server/src/services/todo) über das Cloud-Konto (sy_token).
// Präfix td… · IIFE wie bildstudio.js · lädt VOR app.js (app.js ruft renderTodo()).
// ═══════════════════════════════════════════════════════════════════════════
(function(){
'use strict';
const $=id=>document.getElementById(id);
const TD_API_DEFAULT='https://radar-production-388a.up.railway.app';
const api=()=>((localStorage.getItem('wika_radar_api')||TD_API_DEFAULT).replace(/\/+$/,''));
const token=()=>localStorage.getItem('sy_token')||'';
const me=()=>{try{return JSON.parse(localStorage.getItem('sy_user')||'null')||{};}catch(e){return{};}};
const esc=s=>{const d=document.createElement('div');d.textContent=s==null?'':String(s);return d.innerHTML;};
const toast=m=>{if(window.toast)window.toast(m);else console.log('[todo]',m);};
const uid=()=>Math.random().toString(36).slice(2,10);
const todayStr=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
const addDays=(s,n)=>{const d=s?new Date(s+'T00:00:00'):new Date();d.setDate(d.getDate()+n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
const fmtDate=s=>{if(!s)return'';const[y,m,d]=s.split('-');const t=todayStr();if(s===t)return'Heute';if(s===addDays(t,1))return'Morgen';if(s===addDays(t,-1))return'Gestern';return d+'.'+m+'.'+y.slice(2);};
const fmtBytes=n=>n>1048576?(n/1048576).toFixed(1)+' MB':n>1024?Math.round(n/1024)+' KB':n+' B';
const fmtWhen=iso=>{if(!iso)return'';const d=new Date(iso);return String(d.getDate()).padStart(2,'0')+'.'+String(d.getMonth()+1).padStart(2,'0')+'. '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');};

const PRIOS=[{id:'keine',label:'Keine',icon:'⚪'},{id:'niedrig',label:'Niedrig',icon:'🔵'},{id:'mittel',label:'Mittel',icon:'🟡'},{id:'hoch',label:'Hoch',icon:'🟠'},{id:'dringend',label:'Dringend',icon:'🔴'}];
const STATI=[{id:'offen',label:'Offen'},{id:'in_arbeit',label:'In Arbeit'},{id:'wartet',label:'Wartet'},{id:'erledigt',label:'Erledigt'}];
const ROLLEN=[{id:'viewer',label:'Nur lesen'},{id:'commenter',label:'Kommentieren'},{id:'editor',label:'Bearbeiten'},{id:'admin',label:'Verwalten'}];
const SMARTS=[
 {id:'inbox',icon:'📥',label:'Eingang',c:'#d97706'},
 {id:'today',icon:'☀️',label:'Heute',c:'#dc2626'},
 {id:'week',icon:'🗓️',label:'Nächste 7 Tage',c:'#1d4ed8'},
 {id:'assigned',icon:'👤',label:'Mir zugewiesen',c:'#6d28d9'},
 {id:'starred',icon:'⭐',label:'Markiert',c:'#b45309'},
 {id:'all',icon:'🗂️',label:'Alle Aufgaben',c:'#4d5568'},
 {id:'done',icon:'✅',label:'Erledigt',c:'#059669'},
];
const STATUS_COLORS={offen:'#7b8395',in_arbeit:'#1d4ed8',wartet:'#d97706',erledigt:'#059669'};
// Farbige Icon-Kachel (Herzstück des warmen Looks — überall wiederverwendet)
const icoTile=(icon,color,big)=>'<span class="td-ico'+(big?' big':'')+'" style="--ic:'+esc(color||'#d97706')+'">'+esc(icon||'•')+'</span>';
const listTile=(l,big)=>icoTile(l.icon||l.name[0].toUpperCase(),l.color||'#d97706',big);
const ACT_LABELS={'task.created':'hat die Aufgabe erstellt','task.updated':'hat die Aufgabe bearbeitet','task.completed':'hat die Aufgabe erledigt','task.reopened':'hat die Aufgabe wieder geöffnet','task.moved':'hat die Aufgabe verschoben','task.deleted':'hat die Aufgabe in den Papierkorb gelegt','task.restored':'hat die Aufgabe wiederhergestellt','task.purged':'hat eine Aufgabe endgültig gelöscht','task.repeated':'Wiederholung: nächste Instanz erstellt','comment.added':'hat kommentiert','attachment.added':'hat eine Datei angehängt','member.added':'hat ein Mitglied eingeladen','member.removed':'hat ein Mitglied entfernt','member.left':'hat die Liste verlassen','member.role':'hat eine Rolle geändert','list.created':'hat die Liste erstellt','list.updated':'hat die Liste bearbeitet'};

// ── Zustand ──
const S={
 booted:false,skeleton:false,offline:false,
 inboxId:null,folders:[],lists:[],tags:[],savedFilters:[],people:[],limits:{},
 tasks:{},order:[],hasMore:false,offset:0,
 scope:{type:'smart',id:'inbox'},view:'list',calMonth:todayStr().slice(0,7),
 search:'',fPrio:'',fTag:'',fStatus:'',fDone:'open',sort:'position',
 sel:new Set(),focus:-1,lastClick:null,
 detailId:null,detail:null,tab:'details',members:[],
 es:null,live:false,refreshT:null,pollT:null,searchT:null,
};
const listById=id=>S.lists.find(l=>l.id===id);
const personName=id=>{const p=S.people.find(p=>p.id===id);return p?p.name:'?';};
const myRoleFor=id=>{const l=listById(id);return l?l.role:null;};
const canEdit=lid=>['editor','admin','owner'].includes(myRoleFor(lid));

// ── API ──
async function call(method,path,body){
 const r=await fetch(api()+path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+token()},...(body!==undefined?{body:JSON.stringify(body)}:{})});
 if(r.status===204)return{};
 let j=null;try{j=await r.json();}catch(e){}
 if(!r.ok){const err=new Error((j&&j.error)||('HTTP '+r.status));err.status=r.status;throw err;}
 return j;
}
const GET=p=>call('GET',p),POST=(p,b)=>call('POST',p,b),PUT=(p,b)=>call('PUT',p,b),DEL=p=>call('DELETE',p);

// ── Cache (Offline-Anzeige, read-only) ──
function cacheWrite(){try{localStorage.setItem('td_cache_v1',JSON.stringify({inboxId:S.inboxId,folders:S.folders,lists:S.lists,tags:S.tags,savedFilters:S.savedFilters,people:S.people,tasks:Object.values(S.tasks).slice(0,500),ts:Date.now()}));}catch(e){}}
function cacheRead(){try{return JSON.parse(localStorage.getItem('td_cache_v1')||'null');}catch(e){return null;}}

// ═══ Modals & Popovers (eigene Dialoge statt prompt/confirm) ═══
const PALETTE=['#d97706','#dc2626','#059669','#1d4ed8','#6d28d9','#0e7490','#be185d','#4d5568'];
const EMOJIS=['📥','📌','🛒','🚀','💡','📊','🧾','📦','✈️','🏭','💶','📣','🎯','📝','🔑','🛠️','🧪','⭐','❤️','🧠'];
const ACT={}; // Callback-Slots des gerade offenen Dialogs (es ist immer nur einer offen)
function ovl(html){
 closeOvl();
 const o=document.createElement('div');o.id='tdOvl';o.className='td-ovl';
 o.innerHTML='<div class="td-modal">'+html+'</div>';
 o.addEventListener('mousedown',e=>{if(e.target===o)closeOvl();});
 document.body.appendChild(o);
 const f=o.querySelector('input:not([type=date]):not([type=time]),textarea');
 if(f)setTimeout(()=>{f.focus();if(f.select)f.select();},40);
 return o;
}
function closeOvl(){const o=$('tdOvl');if(o)o.remove();closePop();}
function closePop(){const p=$('tdPop');if(p)p.remove();document.removeEventListener('mousedown',popOutside,true);}
function popOutside(e){const p=$('tdPop');if(p&&!p.contains(e.target))closePop();}
function popAt(x,y,html,w){
 closePop();
 const p=document.createElement('div');p.id='tdPop';p.className='td-pop';p.style.width=(w||280)+'px';
 p.innerHTML=html;document.body.appendChild(p);
 p.style.left=Math.max(8,Math.min(x,window.innerWidth-(w||280)-14))+'px';
 p.style.top=y+'px';
 requestAnimationFrame(()=>{const h=p.offsetHeight;if(y+h>window.innerHeight-8)p.style.top=Math.max(8,window.innerHeight-h-10)+'px';});
 setTimeout(()=>document.addEventListener('mousedown',popOutside,true),0);
 return p;
}
function popBelow(ev,html,w){const r=ev.currentTarget.getBoundingClientRect();return popAt(r.left,r.bottom+6,html,w);}
function tdConfirm(title,text,okLabel,fn){
 ACT.ok=()=>{closeOvl();fn();};
 ovl('<h3>'+esc(title)+'</h3><p class="td-mtext">'+esc(text)+'</p>'
  +'<div class="td-mbtns"><button class="btn" onclick="td.closeDialogs()">Abbrechen</button>'
  +'<button class="btn btn-d" onclick="td.act(\'ok\')">'+esc(okLabel||'Löschen')+'</button></div>');
}
function tdInput(title,label,value,okLabel,fn){
 ACT.ok=()=>{const v=$('tdMInput').value.trim();closeOvl();if(v)fn(v);};
 ovl('<h3>'+esc(title)+'</h3><div style="margin:12px 0"><label class="td-mlabel">'+esc(label)+'</label>'
  +'<input id="tdMInput" class="td-minput" value="'+esc(value||'')+'" onkeydown="if(event.key===\'Enter\')td.act(\'ok\')"></div>'
  +'<div class="td-mbtns"><button class="btn" onclick="td.closeDialogs()">Abbrechen</button>'
  +'<button class="btn btn-p" onclick="td.act(\'ok\')">'+esc(okLabel||'Speichern')+'</button></div>');
}
function avatar(name){
 let hash=0;for(const ch of String(name))hash=(hash*31+ch.charCodeAt(0))>>>0;
 const ini=String(name).split(/[\s@.]+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase();
 return'<span class="td-avatar" style="background:hsl('+(hash%360)+',52%,44%)">'+esc(ini)+'</span>';
}
const swatchRow=sel=>'<div class="td-swrow">'+PALETTE.map(c=>'<span class="td-swatch'+(sel===c?' on':'')+'" style="background:'+c+'" data-c="'+c+'" onclick="td.pickSwatch(this)"></span>').join('')+'</div>';
const emojiRow=sel=>'<div class="td-emrow"><span class="td-emoji'+(!sel?' on':'')+'" data-e="" onclick="td.pickEmoji(this)" title="Kein Symbol">∅</span>'+EMOJIS.map(e=>'<span class="td-emoji'+(sel===e?' on':'')+'" data-e="'+e+'" onclick="td.pickEmoji(this)">'+e+'</span>').join('')+'</div>';
const nextMondayStr=()=>{const d=new Date();return addDays(todayStr(),(1-d.getDay()+7)%7||7);};
const saturdayStr=()=>{const d=new Date();return addDays(todayStr(),(6-d.getDay()+7)%7);};
const fmtDow=ds=>new Date(ds+'T00:00:00').toLocaleDateString('de-DE',{weekday:'short'});

// ═══ Boot & Realtime ═══
async function boot(force){
 if(S.booted&&!force)return true;
 if(!token()){S.offline=true;return false;}
 try{
  const b=await GET('/api/todo/bootstrap');
  Object.assign(S,{inboxId:b.inboxId,folders:b.folders,lists:b.lists,tags:b.tags,savedFilters:b.savedFilters,people:b.people,limits:b.limits,booted:true,offline:false});
  cacheWrite();connectSSE();startPolling();
  return true;
 }catch(e){
  S.offline=true;
  const c=cacheRead();
  if(c){Object.assign(S,{inboxId:c.inboxId,folders:c.folders,lists:c.lists,tags:c.tags,savedFilters:c.savedFilters,people:c.people});c.tasks.forEach(t=>S.tasks[t.id]=t);}
  return false;
 }
}
function connectSSE(){
 if(S.es)try{S.es.close();}catch(e){}
 try{
  const es=new EventSource(api()+'/api/todo/events?auth='+encodeURIComponent(token()));
  es.onopen=()=>{S.live=true;paintLiveDot();};
  es.onerror=()=>{S.live=false;paintLiveDot();};
  es.onmessage=ev=>{
   let e=null;try{e=JSON.parse(ev.data);}catch(x){return;}
   if(!e||e.module!=='todo')return;
   if(e.type==='reminder'){
    toast('⏰ Erinnerung: '+e.title);
    notifyBrowser('⏰ '+e.title,'AMZ SellerHub To-Do');
    return;
   }
   if(e.type==='hello')return;
   if(e.task)S.tasks[e.task.id]=e.task;
   if(e.type==='list'||e.type==='member'){S.booted=false;}
   scheduleRefresh();
  };
  S.es=es;
 }catch(e){/* SSE nicht verfügbar → Polling deckt ab */}
}
function startPolling(){
 if(S.pollT)clearInterval(S.pollT);
 S.pollT=setInterval(()=>{if(isActive()&&!document.hidden&&!S.live)refresh(true);},60000);
}
function scheduleRefresh(){if(S.refreshT)clearTimeout(S.refreshT);S.refreshT=setTimeout(()=>refresh(true),350);}
function isActive(){const p=$('p-todo');return p&&p.classList.contains('active');}
function notifyBrowser(title,body){
 if(!('Notification'in window))return;
 if(Notification.permission==='granted')new Notification(title,{body});
}
function paintLiveDot(){const d=$('tdLiveDot');if(d){d.style.background=S.live?'var(--gn)':'var(--tx3)';d.title=S.live?'Echtzeit verbunden':'Echtzeit getrennt (Polling aktiv)';}}

// ═══ Daten laden ═══
function scopeQuery(){
 const q=[];const sc=S.scope;
 if(sc.type==='smart'){
  if(sc.id==='inbox')q.push('listId='+S.inboxId);
  if(sc.id==='today')q.push('hasDue=true','dueTo='+todayStr());
  if(sc.id==='week')q.push('hasDue=true','dueFrom='+todayStr(),'dueTo='+addDays(todayStr(),7));
  if(sc.id==='assigned')q.push('assigned=me');
  if(sc.id==='starred')q.push('starred=true');
  if(sc.id==='done')q.push('completed=true');
 }
 if(sc.type==='list')q.push('listId='+sc.id);
 if(sc.type==='folder'){/* client-seitig auf Ordner-Listen gefiltert */}
 if(sc.type==='tag')q.push('tag='+sc.id);
 if(sc.type==='trash')q.push('trash=true');
 // Filterleiste
 if(S.fPrio)q.push('priority='+S.fPrio);
 if(S.fTag)q.push('tag='+S.fTag);
 if(S.fStatus)q.push('status='+S.fStatus);
 if(S.search)q.push('search='+encodeURIComponent(S.search));
 const smartDone=sc.type==='smart'&&sc.id==='done';
 if(!smartDone&&sc.type!=='trash'){
  if(S.fDone==='open')q.push('completed=false');
  if(S.fDone==='done')q.push('completed=true');
 }
 q.push('limit=300','offset='+S.offset);
 return q;
}
async function loadTasks(silent){
 if(!S.booted){if(!(await boot()))return renderAll();}
 try{
  const r=await GET('/api/todo/tasks?'+scopeQuery().join('&'));
  let list=r.tasks;
  if(S.scope.type==='folder'){const ids=S.lists.filter(l=>l.folderId===S.scope.id).map(l=>l.id);list=list.filter(t=>ids.includes(t.listId));}
  if(S.offset===0)S.order=[];
  list.forEach(t=>{S.tasks[t.id]=t;if(!S.order.includes(t.id))S.order.push(t.id);});
  S.hasMore=r.hasMore;S.offline=false;cacheWrite();
 }catch(e){
  if(!silent)toast('⚠️ '+e.message);
  if(e.status===401)S.offline=true;
 }
 renderAll();
}
function refresh(silent){S.offset=0;return loadTasks(silent);}

// aktuelle, sortierte Task-Liste des Scopes
function currentTasks(){
 const arr=S.order.map(id=>S.tasks[id]).filter(Boolean);
 const pv={dringend:0,hoch:1,mittel:2,niedrig:3,keine:4};
 const s=S.sort;
 arr.sort((a,b)=>{
  if(a.completed!==b.completed)return a.completed?1:-1;
  if(s==='due')return String(a.dueDate||'9999').localeCompare(String(b.dueDate||'9999'));
  if(s==='priority')return pv[a.priority]-pv[b.priority];
  if(s==='title')return a.title.localeCompare(b.title,'de');
  if(s==='created')return String(b.createdAt).localeCompare(String(a.createdAt));
  return a.position-b.position||String(a.createdAt).localeCompare(String(b.createdAt));
 });
 return arr;
}
function scopeMeta(){
 const sc=S.scope;
 if(sc.type==='smart'){const s=SMARTS.find(s=>s.id===sc.id);return{icon:s.icon,color:s.c,name:s.label};}
 if(sc.type==='list'){const l=listById(sc.id);return l?{icon:l.icon||l.name[0].toUpperCase(),color:l.color||'#d97706',name:l.name}:{icon:'☰',color:'#7b8395',name:'Liste'};}
 if(sc.type==='folder'){const f=S.folders.find(f=>f.id===sc.id);return{icon:'📁',color:'#8a7a5f',name:f?f.name:'Ordner'};}
 if(sc.type==='tag'){const t=S.tags.find(t=>t.id===sc.id);return{icon:'#',color:(t&&t.color)||'#7b8395',name:t?t.name:'Tag'};}
 if(sc.type==='filter'){const f=S.savedFilters.find(f=>f.id===sc.id);return{icon:'💾',color:'#0e7490',name:f?f.name:'Filter'};}
 if(sc.type==='trash')return{icon:'🗑',color:'#7b8395',name:'Papierkorb'};
 return{icon:'☰',color:'#7b8395',name:''};
}

// ═══ Optimistische Mutationen ═══
async function mutate(fn,rollback){
 try{await fn();}
 catch(e){toast('⚠️ '+e.message);if(rollback)rollback();refresh(true);if(S.detailId)openDetail(S.detailId,true);}
}
function patchLocal(id,patch){const t=S.tasks[id];if(t)Object.assign(t,patch);}
function tdToggleDone(id,ev){
 if(ev)ev.stopPropagation();
 const t=S.tasks[id];if(!t)return;
 const val=!t.completed;
 // Beim Erledigen: kurze Häkchen-Animation zeigen, DANN neu rendern
 const row=document.querySelector('.td-row[data-id="'+id+'"]');
 const apply=()=>{
  patchLocal(id,{completed:val,status:val?'erledigt':'offen'});renderAll();
  mutate(async()=>{const r=await PUT('/api/todo/tasks/'+id,{completed:val});S.tasks[id]=r.task;if(r.spawnedTaskId)refresh(true);renderAll();});
 };
 if(val&&row){row.classList.add('td-completing');setTimeout(apply,340);}
 else apply();
}
function tdToggleStar(id,ev){
 if(ev)ev.stopPropagation();
 const t=S.tasks[id];if(!t)return;
 patchLocal(id,{starred:!t.starred});renderAll();
 mutate(()=>PUT('/api/todo/tasks/'+id,{starred:S.tasks[id].starred}));
}
async function quickAdd(){
 const inp=$('tdQuickAdd');if(!inp)return;
 const title=inp.value.trim();if(!title)return;
 const sc=S.scope;
 let listId=S.inboxId,extra={};
 if(sc.type==='list')listId=sc.id;
 if(sc.type==='smart'&&sc.id==='inbox')listId=S.inboxId;
 if(sc.type==='smart'&&sc.id==='today')extra.dueDate=todayStr();
 if(sc.type==='smart'&&sc.id==='week')extra.dueDate=todayStr();
 if(sc.type==='smart'&&sc.id==='starred')extra.starred=true;
 if(sc.type==='folder'){const first=S.lists.find(l=>l.folderId===sc.id);if(first)listId=first.id;}
 if(sc.type==='tag')extra._tag=sc.id;
 if(!canEdit(listId))return toast('🚫 Keine Schreibrechte in dieser Liste');
 inp.value='';
 mutate(async()=>{
  const r=await POST('/api/todo/tasks',{listId,title,...(extra.dueDate?{dueDate:extra.dueDate}:{}),...(extra.starred?{starred:true}:{})});
  if(extra._tag)await POST('/api/todo/tasks/'+r.task.id+'/tags/'+extra._tag);
  S.tasks[r.task.id]=r.task;S.order.unshift(r.task.id);renderAll();
 });
}
function tdDeleteTask(id){
 const t=S.tasks[id];if(!t)return;
 delete S.tasks[id];S.order=S.order.filter(x=>x!==id);
 if(S.detailId===id){S.detailId=null;S.detail=null;}
 renderAll();toast('🗑 In den Papierkorb gelegt');
 mutate(()=>DEL('/api/todo/tasks/'+id));
}

// ═══ Skeleton ═══
function skeleton(){
 if(S.skeleton)return;
 $('p-todo').innerHTML=
 '<div class="td-wrap">'
 +'<aside class="td-side" id="tdSide"></aside>'
 +'<main class="td-main">'
 + '<div class="td-toolbar">'
 +  '<div id="tdTitle" class="td-htitle"></div>'
 +  '<span id="tdLiveDot" style="width:8px;height:8px;border-radius:50%;background:var(--tx3);display:inline-block"></span>'
 +  '<div style="flex:1"></div>'
 +  '<input id="tdSearch" class="td-search" placeholder="🔍 Suchen…  ( / )" oninput="td.searchInput(this.value)">'
 +  '<div class="td-viewswitch">'
 +   '<button id="tdVList" onclick="td.setView(\'list\')" title="Listenansicht (1)">☰</button>'
 +   '<button id="tdVBoard" onclick="td.setView(\'board\')" title="Board (2)">▦</button>'
 +   '<button id="tdVCal" onclick="td.setView(\'calendar\')" title="Kalender (3)">📆</button>'
 +  '</div>'
 + '</div>'
 + '<div class="td-filterbar" id="tdFilterbar"></div>'
 + '<div class="td-body" id="tdBody"></div>'
 + '<div class="td-bulkbar" id="tdBulkbar" style="display:none"></div>'
 +'</main>'
 +'<aside class="td-detail" id="tdDetail" style="display:none"></aside>'
 +'</div>';
 S.skeleton=true;
 const si=$('tdSearch');
 si.addEventListener('keydown',e=>{if(e.key==='Escape'){si.value='';td.searchInput('');si.blur();}});
}

// ═══ Sidebar ═══
function renderSidebar(){
 const el=$('tdSide');if(!el)return;
 const cnt={};S.lists.forEach(l=>cnt[l.id]=l.openCount||0);
 let h='';
 if(S.offline)h+='<div class="td-offline">📴 Offline — zeige letzten Stand.'+(token()?'':' Bitte am Cloud-Konto anmelden (☁️).')+'</div>';
 h+=SMARTS.map(s=>{
  const on=S.scope.type==='smart'&&S.scope.id===s.id;
  const badge=s.id==='inbox'&&cnt[S.inboxId]?'<span class="td-badge">'+cnt[S.inboxId]+'</span>':'';
  return'<button class="td-nav'+(on?' on':'')+'" onclick="td.setScope(\'smart\',\''+s.id+'\')">'+icoTile(s.icon,s.c)+'<span class="td-navlbl">'+s.label+'</span>'+badge+'</button>';
 }).join('');
 h+='<div class="td-sec">LISTEN <button class="td-mini" title="Neue Liste" onclick="td.newList()">＋</button><button class="td-mini" title="Neuer Ordner" onclick="td.newFolder()">📁＋</button></div>';
 const rootLists=S.lists.filter(l=>!l.folderId&&!l.isInbox);
 const listBtn=l=>{
  const on=S.scope.type==='list'&&S.scope.id===l.id;
  const shared=l.role!=='owner'?' <span class="td-sharemark" title="geteilt — Rolle: '+esc(l.role)+'">👥</span>':'';
  return'<button class="td-nav td-list'+(on?' on':'')+'" ondragover="td.dragOver(event)" ondrop="td.dropOnList(event,\''+l.id+'\')" oncontextmenu="td.listMenu(event,\''+l.id+'\')" onclick="td.setScope(\'list\',\''+l.id+'\')">'
   +listTile(l)+'<span class="td-navlbl">'+esc(l.name)+shared+'</span>'
   +(cnt[l.id]?'<span class="td-badge">'+cnt[l.id]+'</span>':'')+'</button>';
 };
 h+=rootLists.map(listBtn).join('');
 S.folders.forEach(f=>{
  const inside=S.lists.filter(l=>l.folderId===f.id);
  const on=S.scope.type==='folder'&&S.scope.id===f.id;
  h+='<button class="td-nav td-folder'+(on?' on':'')+'" oncontextmenu="td.folderMenu(event,\''+f.id+'\')" onclick="td.setScope(\'folder\',\''+f.id+'\')">'+icoTile('📁',f.color||'#8a7a5f')+'<span class="td-navlbl">'+esc(f.name)+'</span></button>';
  h+='<div class="td-indent">'+inside.map(listBtn).join('')+'</div>';
 });
 h+='<div class="td-sec">TAGS <button class="td-mini" title="Tags verwalten" onclick="td.openTagManager()">⚙</button></div>';
 if(S.tags.length){
  h+='<div class="td-tagcloud">'+S.tags.map(t=>{
   const on=S.scope.type==='tag'&&S.scope.id===t.id;
   return'<button class="td-tagchip'+(on?' on':'')+'" style="--tc:'+esc(t.color||'#7b8395')+'" oncontextmenu="td.tagMenu(event,\''+t.id+'\')" onclick="td.setScope(\'tag\',\''+t.id+'\')">#'+esc(t.name)+'</button>';
  }).join('')+'</div>';
 }
 if(S.savedFilters.length){
  h+='<div class="td-sec">GESPEICHERTE FILTER</div>';
  h+=S.savedFilters.map(f=>'<button class="td-nav'+(S.scope.type==='filter'&&S.scope.id===f.id?' on':'')+'" onclick="td.applySavedFilter(\''+f.id+'\')">💾 '+esc(f.name)+' <span class="td-mini" onclick="event.stopPropagation();td.deleteSavedFilter(\''+f.id+'\')" title="Filter löschen">✕</span></button>').join('');
 }
 h+='<div class="td-sec"></div><button class="td-nav'+(S.scope.type==='trash'?' on':'')+'" onclick="td.setScope(\'trash\')">'+icoTile('🗑','#7b8395')+'<span class="td-navlbl">Papierkorb</span></button>';
 el.innerHTML=h;
}

// ═══ Filterleiste ═══
function renderFilterbar(){
 const el=$('tdFilterbar');if(!el)return;
 const activeFilters=S.fPrio||S.fTag||S.fStatus||S.fDone!=='open';
 el.innerHTML=
  '<select class="fsel td-fsel" onchange="td.setFilter(\'fDone\',this.value)">'
  +['open|Offene','all|Alle','done|Erledigte'].map(o=>{const[v,l]=o.split('|');return'<option value="'+v+'"'+(S.fDone===v?' selected':'')+'>'+l+'</option>';}).join('')+'</select>'
  +'<select class="fsel td-fsel" onchange="td.setFilter(\'fPrio\',this.value)"><option value="">Priorität: alle</option>'
  +PRIOS.slice(1).map(p=>'<option value="'+p.id+'"'+(S.fPrio===p.id?' selected':'')+'>'+p.icon+' '+p.label+'</option>').join('')+'</select>'
  +'<select class="fsel td-fsel" onchange="td.setFilter(\'fStatus\',this.value)"><option value="">Status: alle</option>'
  +STATI.map(s=>'<option value="'+s.id+'"'+(S.fStatus===s.id?' selected':'')+'>'+s.label+'</option>').join('')+'</select>'
  +'<select class="fsel td-fsel" onchange="td.setFilter(\'fTag\',this.value)"><option value="">Tag: alle</option>'
  +S.tags.map(t=>'<option value="'+t.id+'"'+(S.fTag===t.id?' selected':'')+'>#'+esc(t.name)+'</option>').join('')+'</select>'
  +'<select class="fsel td-fsel" onchange="td.setSort(this.value)">'
  +['position|Manuell','due|Fälligkeit','priority|Priorität','title|Titel','created|Neueste'].map(o=>{const[v,l]=o.split('|');return'<option value="'+v+'"'+(S.sort===v?' selected':'')+'>Sortierung: '+l+'</option>';}).join('')+'</select>'
  +(activeFilters?'<button class="btn btn-sm" onclick="td.saveCurrentFilter()">💾 Filter speichern</button><button class="btn btn-sm" onclick="td.clearFilters()">✕ Zurücksetzen</button>':'')
  +'<div style="flex:1"></div>'
  +(S.scope.type==='list'&&myRoleFor(S.scope.id)&&listById(S.scope.id)&&!listById(S.scope.id).isInbox?'<button class="btn btn-sm" onclick="td.shareDialog(\''+S.scope.id+'\')">👥 Teilen</button>':'')
  +(S.scope.type==='trash'?'':'<button class="btn btn-p btn-sm" onclick="td.newTaskDialog()">＋ Neue Aufgabe (n)</button>');
}

// ═══ Hauptansicht ═══
function renderAll(){
 if(!isActive())return;
 skeleton();
 const meta=scopeMeta();
 const openN=currentTasks().filter(t=>!t.completed).length;
 $('tdTitle').innerHTML=icoTile(meta.icon,meta.color,true)
  +'<div class="td-htxt"><div class="td-hname">'+esc(meta.name)+'</div>'
  +'<div class="td-hsub">'+(S.scope.type==='trash'?currentTasks().length+' im Papierkorb':openN+' offen'+(S.search?' · Suche „'+esc(S.search)+'"':''))+'</div></div>';
 ['tdVList','tdVBoard','tdVCal'].forEach((id,i)=>{const b=$(id);if(b)b.classList.toggle('on',['list','board','calendar'][i]===S.view);});
 paintLiveDot();
 renderSidebar();renderFilterbar();
 const body=$('tdBody');
 if(!token()){body.innerHTML='<div class="td-empty">☁️ Das To-Do-Modul braucht dein Cloud-Konto.<br>Bitte oben links über das ☁️-Symbol anmelden.</div>';return;}
 if(S.view==='list')renderListView(body);
 else if(S.view==='board')renderBoardView(body);
 else renderCalView(body);
 renderBulkbar();renderDetail();
}

// ── Zeile einer Aufgabe ──
function taskRow(t,idx){
 const over=t.dueDate&&!t.completed&&t.dueDate<todayStr();
 const sel=S.sel.has(t.id);
 const chips=[];
 if(t.dueDate)chips.push('<span class="td-chip'+(over?' over':'')+'">📅 '+fmtDate(t.dueDate)+(t.dueTime?' '+t.dueTime:'')+'</span>');
 if(t.priority&&t.priority!=='keine')chips.push('<span class="td-chip">'+PRIOS.find(p=>p.id===t.priority).icon+'</span>');
 (t.tags||[]).forEach(tg=>chips.push('<span class="td-chip td-tag" style="--tc:'+esc(tg.color||'#7b8395')+'">#'+esc(tg.name)+'</span>'));
 if(t.checklist&&t.checklist.total)chips.push('<span class="td-chip">☑ '+t.checklist.done+'/'+t.checklist.total+'</span>');
 const c=t.counts||{};
 if(c.subtasks)chips.push('<span class="td-chip">↳ '+c.subtasksDone+'/'+c.subtasks+'</span>');
 if(c.comments)chips.push('<span class="td-chip">💬 '+c.comments+'</span>');
 if(c.attachments)chips.push('<span class="td-chip">📎 '+c.attachments+'</span>');
 if(t.assignedTo)chips.push('<span class="td-chip td-ava" title="Zugewiesen: '+esc(personName(t.assignedTo))+'">'+esc(personName(t.assignedTo).slice(0,2).toUpperCase())+'</span>');
 if(t.repeatRule)chips.push('<span class="td-chip">🔁</span>');
 const trash=S.scope.type==='trash';
 return'<div class="td-row'+(t.completed?' done':'')+(sel?' sel':'')+(S.focus===idx?' foc':'')+(S.detailId===t.id?' open':'')+'" data-id="'+t.id+'" data-idx="'+idx+'" draggable="true"'
  +' ondragstart="td.dragStart(event,\''+t.id+'\')" ondragover="td.dragOver(event)" ondrop="td.dropOnRow(event,\''+t.id+'\')"'
  +' onclick="td.rowClick(event,\''+t.id+'\','+idx+')">'
  +'<span class="td-selbox" onclick="td.toggleSel(event,\''+t.id+'\','+idx+')">'+(sel?'☑':'☐')+'</span>'
  +(trash?'':'<span class="td-check" onclick="td.toggleDone(\''+t.id+'\',event)">'+(t.completed?'✓':'')+'</span>')
  +'<span class="td-title" ondblclick="td.inlineEdit(event,\''+t.id+'\')">'+esc(t.title)+'</span>'
  +'<span class="td-chips">'+chips.join('')+'</span>'
  +(trash
   ?'<span class="td-rowbtns"><button class="td-mini" title="Wiederherstellen" onclick="event.stopPropagation();td.restore(\''+t.id+'\')">↩︎</button><button class="td-mini" title="Endgültig löschen" onclick="event.stopPropagation();td.purge(\''+t.id+'\')">✕</button></span>'
   :'<span class="td-star'+(t.starred?' on':'')+'" onclick="td.toggleStar(\''+t.id+'\',event)">'+(t.starred?'★':'☆')+'</span>')
  +'</div>';
}

function renderListView(body){
 const tasks=currentTasks();
 const multi=S.scope.type!=='list'&&!(S.scope.type==='smart'&&S.scope.id==='inbox');
 let h='';
 if(S.scope.type!=='trash')h+='<div class="td-quickrow"><input id="tdQuickAdd" placeholder="＋ Aufgabe hinzufügen und Enter drücken…" onkeydown="if(event.key===\'Enter\')td.quickAdd()"></div>';
 if(!tasks.length){
  const em=S.scope.type==='trash'?['🗑','Der Papierkorb ist leer','Gelöschte Aufgaben landen hier und können wiederhergestellt werden.']
   :S.search?['🔍','Nichts gefunden','Versuch es mit einem anderen Suchbegriff oder setz die Filter zurück.']
   :S.scope.type==='smart'&&S.scope.id==='today'?['☀️','Nichts für heute fällig','Genieß den Tag — oder plane mit „n" die nächste Aufgabe.']
   :S.scope.type==='smart'&&S.scope.id==='done'?['✅','Noch nichts erledigt','Abgehakte Aufgaben tauchen hier auf.']
   :['🌤','Alles erledigt','Leg mit „n" eine neue Aufgabe an — oder lehn dich zurück.'];
  h+='<div class="td-empty"><div class="td-emoji-big">'+em[0]+'</div><b>'+em[1]+'</b><span>'+em[2]+'</span></div>';
  body.innerHTML=h;return;
 }
 if(multi){
  const groups={};tasks.forEach(t=>{(groups[t.listId]=groups[t.listId]||[]).push(t);});
  let idx=0;
  for(const lid of Object.keys(groups)){
   const l=listById(lid);
   h+='<div class="td-group">'+(l?listTile(l)+'<span>'+esc(l.name)+'</span>':'<span>Liste</span>')+'<em>'+groups[lid].filter(t=>!t.completed).length+'</em></div>';
   h+=groups[lid].map(t=>taskRow(t,idx++)).join('');
  }
 }else{
  h+=tasks.map((t,i)=>taskRow(t,i)).join('');
 }
 if(S.hasMore)h+='<button class="btn btn-sm" style="margin:10px auto;display:block" onclick="td.loadMore()">Mehr laden…</button>';
 body.innerHTML=h;
}

function renderBoardView(body){
 const tasks=currentTasks();
 let h='<div class="td-board">';
 STATI.forEach(st=>{
  const col=tasks.filter(t=>st.id==='erledigt'?(t.completed||t.status==='erledigt'):(!t.completed&&t.status===st.id));
  h+='<div class="td-col" style="--cc:'+STATUS_COLORS[st.id]+'" ondragover="td.dragOver(event)" ondrop="td.dropOnCol(event,\''+st.id+'\')">'
   +'<div class="td-colhead"><span class="td-coldot"></span>'+st.label+' <span class="td-badge">'+col.length+'</span></div>'
   +col.map(t=>'<div class="td-card'+(S.detailId===t.id?' open':'')+'" draggable="true" ondragstart="td.dragStart(event,\''+t.id+'\')" onclick="td.openDetail(\''+t.id+'\')">'
    +'<div class="td-cardtitle">'+(t.completed?'<s>':'')+esc(t.title)+(t.completed?'</s>':'')+'</div>'
    +'<div class="td-cardmeta">'
    +(t.dueDate?'<span class="td-chip'+(t.dueDate<todayStr()&&!t.completed?' over':'')+'">📅 '+fmtDate(t.dueDate)+'</span>':'')
    +(t.priority!=='keine'?'<span class="td-chip">'+PRIOS.find(p=>p.id===t.priority).icon+'</span>':'')
    +(t.tags||[]).map(tg=>'<span class="td-chip td-tag" style="--tc:'+esc(tg.color||'#7b8395')+'">#'+esc(tg.name)+'</span>').join('')
    +(t.assignedTo?'<span class="td-chip td-ava">'+esc(personName(t.assignedTo).slice(0,2).toUpperCase())+'</span>':'')
    +'</div></div>').join('')
   +'</div>';
 });
 h+='</div>';
 body.innerHTML=h;
}

function renderCalView(body){
 const[y,m]=S.calMonth.split('-').map(Number);
 const first=new Date(y,m-1,1);
 const startDow=(first.getDay()+6)%7; // Montag=0
 const daysIn=new Date(y,m,0).getDate();
 const tasks=currentTasks().filter(t=>t.dueDate&&t.dueDate.slice(0,7)===S.calMonth);
 const byDay={};tasks.forEach(t=>{(byDay[t.dueDate]=byDay[t.dueDate]||[]).push(t);});
 const monthName=first.toLocaleDateString('de-DE',{month:'long',year:'numeric'});
 let h='<div class="td-calhead"><button class="btn btn-sm" onclick="td.calShift(-1)">‹</button><b>'+monthName+'</b><button class="btn btn-sm" onclick="td.calShift(1)">›</button><button class="btn btn-sm" onclick="td.calToday()">Heute</button></div>';
 h+='<div class="td-cal">'+['Mo','Di','Mi','Do','Fr','Sa','So'].map(d=>'<div class="td-caldow">'+d+'</div>').join('');
 for(let i=0;i<startDow;i++)h+='<div class="td-calcell off"></div>';
 for(let d=1;d<=daysIn;d++){
  const ds=S.calMonth+'-'+String(d).padStart(2,'0');
  const items=byDay[ds]||[];
  h+='<div class="td-calcell'+(ds===todayStr()?' today':'')+'" ondragover="td.dragOver(event)" ondrop="td.dropOnDay(event,\''+ds+'\')" ondblclick="td.newTaskDialog(\''+ds+'\')">'
   +'<div class="td-calnum">'+d+'</div>'
   +items.slice(0,4).map(t=>'<div class="td-calitem'+(t.completed?' done':'')+'" draggable="true" ondragstart="td.dragStart(event,\''+t.id+'\')" onclick="td.openDetail(\''+t.id+'\')" title="'+esc(t.title)+'">'+esc(t.title)+'</div>').join('')
   +(items.length>4?'<div class="td-calmore">+'+(items.length-4)+' weitere</div>':'')
   +'</div>';
 }
 h+='</div>';
 body.innerHTML=h;
}

// ═══ Bulk ═══
function renderBulkbar(){
 const el=$('tdBulkbar');if(!el)return;
 if(!S.sel.size){el.style.display='none';return;}
 el.style.display='flex';
 el.innerHTML='<b>'+S.sel.size+' ausgewählt</b>'
  +'<button class="btn btn-sm" onclick="td.bulk(\'complete\')">✓ Erledigen</button>'
  +'<button class="btn btn-sm" onclick="td.bulk(\'reopen\')">↩︎ Öffnen</button>'
  +'<select class="fsel td-fsel" onchange="if(this.value)td.bulkPatch({priority:this.value})"><option value="">Priorität…</option>'+PRIOS.map(p=>'<option value="'+p.id+'">'+p.icon+' '+p.label+'</option>').join('')+'</select>'
  +'<select class="fsel td-fsel" onchange="if(this.value)td.bulkPatch({listId:this.value})"><option value="">Verschieben nach…</option>'+S.lists.filter(l=>canEdit(l.id)).map(l=>'<option value="'+l.id+'">'+esc(l.name)+'</option>').join('')+'</select>'
  +'<button class="btn btn-d btn-sm" onclick="td.bulk(\'delete\')">🗑 Löschen</button>'
  +'<button class="btn btn-sm" onclick="td.clearSel()">Abbrechen (Esc)</button>';
}

// ═══ Detail-Panel ═══
async function openDetail(id,silent){
 S.detailId=id;S.tab=S.tab||'details';
 if(!silent)renderAll();
 try{
  const d=await GET('/api/todo/tasks/'+id);
  S.detail=d;S.tasks[id]=d.task;
  try{S.members=(await GET('/api/todo/lists/'+d.task.listId+'/members')).members;}catch(e){S.members=[];}
  renderAll();
 }catch(e){toast('⚠️ '+e.message);S.detailId=null;S.detail=null;renderAll();}
}
function closeDetail(){S.detailId=null;S.detail=null;renderAll();}

function renderDetail(){
 const el=$('tdDetail');if(!el)return;
 if(!S.detailId||!S.detail){el.style.display='none';return;}
 const d=S.detail,t=d.task;
 const editable=['editor','admin','owner'].includes(d.myRole);
 const ro=editable?'':' disabled';
 el.style.display='flex';
 const rr=t.repeatRule||{mode:'none',every:1,unit:'week'};
 let h='<div class="td-dhead">'
  +'<span class="td-check big'+(t.completed?' on':'')+'" onclick="td.toggleDone(\''+t.id+'\')">'+(t.completed?'✓':'')+'</span>'
  +'<span class="td-star'+(t.starred?' on':'')+'" style="font-size:20px" onclick="td.toggleStar(\''+t.id+'\')">'+(t.starred?'★':'☆')+'</span>'
  +'<div style="flex:1"></div>'
  +(editable?'<button class="td-mini" title="Löschen" onclick="td.deleteTask(\''+t.id+'\')">🗑</button>':'')
  +'<button class="td-mini" title="Schließen (Esc)" onclick="td.closeDetail()">✕</button>'
  +'</div>';
 h+='<input class="td-dtitle" value="'+esc(t.title)+'"'+ro+' onchange="td.field(\''+t.id+'\',\'title\',this.value)">';
 if(t.parentId)h+='<div class="td-dparent" onclick="td.openDetail(\''+t.parentId+'\')">↰ Zur übergeordneten Aufgabe</div>';
 // Felder
 h+='<div class="td-dgrid">';
 h+='<label>Liste</label><select class="fsel"'+ro+' onchange="td.field(\''+t.id+'\',\'listId\',this.value)">'+S.lists.filter(l=>canEdit(l.id)||l.id===t.listId).map(l=>'<option value="'+l.id+'"'+(l.id===t.listId?' selected':'')+'>'+esc(l.name)+'</option>').join('')+'</select>';
 h+='<label>Status</label><select class="fsel"'+ro+' onchange="td.field(\''+t.id+'\',\'status\',this.value)">'+STATI.map(s=>'<option value="'+s.id+'"'+(s.id===t.status?' selected':'')+'>'+s.label+'</option>').join('')+'</select>';
 h+='<label>Priorität</label><select class="fsel"'+ro+' onchange="td.field(\''+t.id+'\',\'priority\',this.value)">'+PRIOS.map(p=>'<option value="'+p.id+'"'+(p.id===t.priority?' selected':'')+'>'+p.icon+' '+p.label+'</option>').join('')+'</select>';
 const over=t.dueDate&&!t.completed&&t.dueDate<todayStr();
 h+='<label>Fällig</label><button class="td-fieldbtn'+(over?' over':'')+(t.dueDate?' set':'')+'"'+(editable?' onclick="td.duePop(event,\''+t.id+'\')"':' disabled')+'>'
  +(t.dueDate?'📅 '+fmtDate(t.dueDate)+(t.dueTime?' · '+t.dueTime+' Uhr':''):'＋ Datum wählen…')+'</button>';
 h+='<label>Zugewiesen</label><select class="fsel"'+ro+' onchange="td.field(\''+t.id+'\',\'assignedTo\',this.value||null)"><option value="">— niemand —</option>'+S.members.map(m=>'<option value="'+m.userId+'"'+(m.userId===t.assignedTo?' selected':'')+'>'+esc(m.name)+'</option>').join('')+'</select>';
 h+='<label>Wiederholen</label><div style="display:flex;gap:6px;flex-wrap:wrap">'
  +'<select class="fsel" id="tdRepMode"'+ro+' onchange="td.repeatChange(\''+t.id+'\')">'
  +'<option value="none"'+(!t.repeatRule?' selected':'')+'>Nie</option>'
  +'<option value="fixed"'+(rr.mode==='fixed'?' selected':'')+'>Nach Termin</option>'
  +'<option value="after_done"'+(rr.mode==='after_done'?' selected':'')+'>Nach Erledigung</option></select>'
  +'<input type="number" min="1" id="tdRepEvery" class="fsel" style="width:60px" value="'+(rr.every||1)+'"'+ro+' onchange="td.repeatChange(\''+t.id+'\')">'
  +'<select class="fsel" id="tdRepUnit"'+ro+' onchange="td.repeatChange(\''+t.id+'\')">'
  +[['day','Tag(e)'],['week','Woche(n)'],['month','Monat(e)'],['year','Jahr(e)']].map(u=>'<option value="'+u[0]+'"'+(rr.unit===u[0]?' selected':'')+'>'+u[1]+'</option>').join('')+'</select></div>';
 // Erinnerungen
 h+='<label>Erinnerung</label><div>';
 d.reminders.forEach(r=>{h+='<div class="td-remrow">⏰ '+fmtWhen(r.remindAt)+(r.firedAt?' <i>(zugestellt)</i>':'')+' <button class="td-mini" onclick="td.delReminder(\''+r.id+'\')">✕</button></div>';});
 h+='<button class="td-fieldbtn" onclick="td.remPop(event,\''+t.id+'\')">＋ Erinnerung hinzufügen…</button></div>';
 // Tags
 h+='<label>Tags</label><div class="td-dtags">'
  +(t.tags||[]).map(tg=>'<span class="td-tagchip" style="--tc:'+esc(tg.color||'#7b8395')+'">#'+esc(tg.name)+(editable?' <span onclick="td.untag(\''+t.id+'\',\''+tg.id+'\')" style="cursor:pointer">✕</span>':'')+'</span>').join('')
  +(editable?'<select class="fsel" onchange="if(this.value===\'__new\')td.newTagFor(\''+t.id+'\');else if(this.value)td.tag(\''+t.id+'\',this.value);this.selectedIndex=0"><option value="">＋ Tag…</option>'
   +S.tags.filter(tg=>!(t.tags||[]).some(x=>x.id===tg.id)).map(tg=>'<option value="'+tg.id+'">#'+esc(tg.name)+'</option>').join('')
   +'<option value="__new">✚ Neuen Tag anlegen…</option></select>':'')
  +'</div>';
 h+='</div>'; // dgrid
 // Beschreibung (Rich-Text)
 h+='<div class="td-dsec">Beschreibung</div>';
 if(editable)h+='<div class="td-rtbar">'
  +'<button onclick="td.fmt(\'bold\')" title="Fett"><b>F</b></button>'
  +'<button onclick="td.fmt(\'italic\')" title="Kursiv"><i>K</i></button>'
  +'<button onclick="td.fmt(\'underline\')" title="Unterstrichen"><u>U</u></button>'
  +'<button onclick="td.fmt(\'strikeThrough\')" title="Durchgestrichen"><s>S</s></button>'
  +'<button onclick="td.fmt(\'insertUnorderedList\')" title="Liste">•≡</button>'
  +'<button onclick="td.fmt(\'insertOrderedList\')" title="Nummerierte Liste">1≡</button>'
  +'<button onclick="td.fmtLink()" title="Link">🔗</button>'
  +'</div>';
 h+='<div class="td-desc" id="tdDesc" '+(editable?'contenteditable="true"':'')+' data-id="'+t.id+'">'+(t.description||(editable?'':'<i style="color:var(--tx3)">Keine Beschreibung</i>'))+'</div>';
 // Checkliste
 const doneN=d.checklist.filter(c=>c.done).length;
 h+='<div class="td-dsec">Checkliste '+(d.checklist.length?('<span class="td-badge">'+doneN+'/'+d.checklist.length+'</span>'):'')+'</div>';
 if(d.checklist.length)h+='<div class="td-progress"><div style="width:'+(d.checklist.length?Math.round(100*doneN/d.checklist.length):0)+'%"></div></div>';
 d.checklist.forEach(c=>{
  h+='<div class="td-clrow"><span class="td-check sm'+(c.done?' on':'')+'" onclick="td.clToggle(\''+c.id+'\','+(!c.done)+')">'+(c.done?'✓':'')+'</span>'
   +'<input class="td-clinput'+(c.done?' done':'')+'" value="'+esc(c.title)+'"'+ro+' onchange="td.clEdit(\''+c.id+'\',this.value)">'
   +(editable?'<button class="td-mini" onclick="td.clDel(\''+c.id+'\')">✕</button>':'')+'</div>';
 });
 if(editable)h+='<div class="td-clrow"><input id="tdClNew" placeholder="＋ Punkt hinzufügen…" class="td-clinput" onkeydown="if(event.key===\'Enter\')td.clAdd(\''+t.id+'\')"></div>';
 // Subtasks
 h+='<div class="td-dsec">Unteraufgaben '+(d.subtasks.length?'<span class="td-badge">'+d.subtasks.filter(s=>s.completed).length+'/'+d.subtasks.length+'</span>':'')+'</div>';
 d.subtasks.forEach(s=>{
  h+='<div class="td-clrow"><span class="td-check sm'+(s.completed?' on':'')+'" onclick="td.toggleDoneSub(\''+s.id+'\')">'+(s.completed?'✓':'')+'</span>'
   +'<span class="td-subtitle'+(s.completed?' done':'')+'" onclick="td.openDetail(\''+s.id+'\')">'+esc(s.title)+'</span></div>';
 });
 if(editable&&!t.parentId)h+='<div class="td-clrow"><input id="tdSubNew" placeholder="＋ Unteraufgabe hinzufügen…" class="td-clinput" onkeydown="if(event.key===\'Enter\')td.subAdd(\''+t.id+'\')"></div>';
 // Anhänge
 h+='<div class="td-dsec">Anhänge '+(d.attachments.length?'<span class="td-badge">'+d.attachments.length+'</span>':'')+'</div>';
 d.attachments.forEach(a=>{
  h+='<div class="td-attrow">📎 <a href="#" onclick="td.download(\''+a.id+'\',\''+esc(a.filename)+'\');return false">'+esc(a.filename)+'</a> <span style="color:var(--tx3);font-size:11px">'+fmtBytes(a.sizeBytes)+'</span>'
   +(editable?'<button class="td-mini" onclick="td.attDel(\''+a.id+'\')">✕</button>':'')+'</div>';
 });
 if(editable)h+='<label class="btn btn-sm" style="margin-top:4px;display:inline-block">📎 Datei anhängen<input type="file" style="display:none" onchange="td.attUpload(event,\''+t.id+'\')"></label>';
 // Tabs: Kommentare / Aktivität
 h+='<div class="td-dtabs"><button class="'+(S.tab==='comments'?'on':'')+'" onclick="td.setTab(\'comments\')">💬 Kommentare ('+d.comments.length+')</button><button class="'+(S.tab==='activity'?'on':'')+'" onclick="td.setTab(\'activity\')">📜 Aktivität</button></div>';
 if(S.tab==='activity'){
  h+='<div id="tdActList" class="td-actlist">Lade…</div>';
 }else{
  h+='<div class="td-comments">';
  d.comments.forEach(c=>{
   const mine=c.userId===me().id;
   h+='<div class="td-comment"><b>'+esc(c.name)+'</b> <span style="color:var(--tx3);font-size:10px">'+fmtWhen(c.createdAt)+(c.editedAt?' (bearbeitet)':'')+'</span>'
    +(mine?' <button class="td-mini" onclick="td.cEdit(\''+c.id+'\',\''+t.id+'\')">✎</button><button class="td-mini" onclick="td.cDel(\''+c.id+'\',\''+t.id+'\')">✕</button>':'')
    +'<div id="tdC'+c.id+'">'+esc(c.body)+'</div></div>';
  });
  if(['commenter','editor','admin','owner'].includes(d.myRole)){
   h+='<div style="display:flex;gap:6px;margin-top:6px"><input id="tdCNew" class="td-clinput" placeholder="Kommentar schreiben…" onkeydown="if(event.key===\'Enter\')td.cAdd(\''+t.id+'\')"><button class="btn btn-sm" onclick="td.cAdd(\''+t.id+'\')">Senden</button></div>';
  }
  h+='</div>';
 }
 el.innerHTML=h;
 // Beschreibung: speichern bei Blur
 const desc=$('tdDesc');
 if(desc&&editable){desc.addEventListener('blur',()=>{const val=desc.innerHTML;if(val!==(t.description||''))td.field(t.id,'description',val);});}
 if(S.tab==='activity')loadActivity(t.id);
}
async function loadActivity(taskId){
 try{
  const r=await GET('/api/todo/activity?task='+taskId+'&limit=50');
  const el=$('tdActList');if(!el)return;
  el.innerHTML=r.items.length?r.items.map(a=>'<div class="td-act"><b>'+esc(a.by)+'</b> '+(ACT_LABELS[a.action]||esc(a.action))+' <span style="color:var(--tx3);font-size:10px">'+fmtWhen(a.createdAt)+'</span>'+(a.detail&&a.detail.changes?'<div style="color:var(--tx3);font-size:10px">Felder: '+esc(a.detail.changes.join(', '))+'</div>':'')+'</div>').join(''):'<i>Noch keine Aktivität.</i>';
 }catch(e){}
}

// ═══ Drag & Drop ═══
let dragId=null;
function dragStart(ev,id){dragId=id;ev.dataTransfer.effectAllowed='move';try{ev.dataTransfer.setData('text/plain',id);}catch(e){}}
function dragOver(ev){ev.preventDefault();ev.dataTransfer.dropEffect='move';}
function dropOnRow(ev,targetId){
 ev.preventDefault();ev.stopPropagation();
 if(!dragId||dragId===targetId)return;
 const a=S.tasks[dragId],b=S.tasks[targetId];if(!a||!b)return;
 if(a.listId!==b.listId){moveToList(dragId,b.listId);return;}
 // Manuell einsortieren: Position zwischen Ziel und Vorgänger
 const arr=currentTasks().filter(t=>t.listId===b.listId);
 const ti=arr.findIndex(t=>t.id===targetId);
 const prev=arr[ti-1];
 const newPos=prev?(prev.position+b.position)/2:b.position-1;
 patchLocal(dragId,{position:newPos});S.sort='position';renderAll();
 mutate(()=>PUT('/api/todo/tasks/'+dragId,{position:newPos}));
 dragId=null;
}
function dropOnList(ev,listId){ev.preventDefault();if(dragId)moveToList(dragId,listId);dragId=null;}
function dropOnCol(ev,status){
 ev.preventDefault();
 if(!dragId)return;
 const id=dragId;dragId=null;
 const done=status==='erledigt';
 patchLocal(id,{status,completed:done});renderAll();
 mutate(async()=>{const r=await PUT('/api/todo/tasks/'+id,done?{completed:true}:{status,completed:false});S.tasks[id]=r.task;renderAll();});
}
function dropOnDay(ev,ds){
 ev.preventDefault();
 if(!dragId)return;
 const id=dragId;dragId=null;
 patchLocal(id,{dueDate:ds});renderAll();
 mutate(()=>PUT('/api/todo/tasks/'+id,{dueDate:ds}));
}
function moveToList(id,listId){
 if(!canEdit(listId))return toast('🚫 Keine Schreibrechte in der Zielliste');
 patchLocal(id,{listId});renderAll();
 mutate(()=>PUT('/api/todo/tasks/'+id,{listId}));
}

// ═══ Auswahl & Fokus ═══
function rowClick(ev,id,idx){
 if(ev.shiftKey&&S.lastClick){
  const arr=currentTasks().map(t=>t.id);
  const i1=arr.indexOf(S.lastClick),i2=arr.indexOf(id);
  if(i1>-1&&i2>-1){for(let i=Math.min(i1,i2);i<=Math.max(i1,i2);i++)S.sel.add(arr[i]);renderAll();return;}
 }
 if(ev.metaKey||ev.ctrlKey){toggleSelRaw(id);renderAll();return;}
 S.lastClick=id;S.focus=idx;
 openDetail(id);
}
function toggleSelRaw(id){if(S.sel.has(id))S.sel.delete(id);else S.sel.add(id);S.lastClick=id;}
function toggleSel(ev,id,idx){ev.stopPropagation();toggleSelRaw(id);S.focus=idx;renderAll();}
function clearSel(){S.sel.clear();renderAll();}

// ═══ Shortcuts ═══
document.addEventListener('keydown',function(ev){
 if(!isActive())return;
 // Offene Dialoge/Popover: Esc schließt, alle übrigen Shortcuts pausieren
 if($('tdOvl')||$('tdPop')){
  if(ev.key==='Escape'){ev.preventDefault();closeOvl();}
  return;
 }
 const tag=(document.activeElement&&document.activeElement.tagName)||'';
 const editing=['INPUT','TEXTAREA','SELECT'].includes(tag)||(document.activeElement&&document.activeElement.isContentEditable);
 if(editing){if(ev.key==='Escape')document.activeElement.blur();return;}
 const arr=currentTasks();
 const focT=S.focus>=0&&arr[S.focus]?arr[S.focus]:null;
 switch(ev.key){
  case'n':ev.preventDefault();{const q=$('tdQuickAdd');if(q)q.focus();else td.newTaskDialog();}break;
  case'/':ev.preventDefault();{const si=$('tdSearch');if(si)si.focus();}break;
  case'1':td.setView('list');break;
  case'2':td.setView('board');break;
  case'3':td.setView('calendar');break;
  case'ArrowDown':ev.preventDefault();S.focus=Math.min(arr.length-1,S.focus+1);renderAll();break;
  case'ArrowUp':ev.preventDefault();S.focus=Math.max(0,S.focus-1);renderAll();break;
  case'Enter':if(focT){ev.preventDefault();openDetail(focT.id);}break;
  case'e':if(focT){ev.preventDefault();openDetail(focT.id);}break;
  case'x':if(focT){ev.preventDefault();toggleSelRaw(focT.id);renderAll();}break;
  case'd':if(focT){ev.preventDefault();tdToggleDone(focT.id);}break;
  case's':if(focT){ev.preventDefault();tdToggleStar(focT.id);}break;
  case'Delete':case'Backspace':
   if(S.sel.size){ev.preventDefault();td.bulk('delete');}
   else if(focT){ev.preventDefault();tdDeleteTask(focT.id);}
   break;
  case'Escape':
   if(S.sel.size)clearSel();
   else if(S.detailId)closeDetail();
   break;
 }
});

// ═══ Dialoge: Neue Aufgabe, Listen-Editor, Teilen, Tag-Manager, Kontextmenüs ═══
function dueChips(sel){
 const opts=[['','Kein Datum'],[todayStr(),'Heute'],[addDays(todayStr(),1),'Morgen'],[nextMondayStr(),'Nächste Woche']];
 const custom=sel&&!opts.some(o=>o[0]===sel);
 return opts.map(o=>'<button class="td-qchip'+((sel||'')===o[0]&&!custom?' on':'')+'" data-v="'+o[0]+'" onclick="td.pickDue(this)">'+o[1]+'</button>').join('')
  +'<input type="date" id="tdNtDueCustom" class="fsel" style="font-size:11px" value="'+esc(custom?sel:'')+'" onchange="td.pickDueDate(this)">';
}
function newTaskDialog(dueDate){
 const lists=S.lists.filter(l=>canEdit(l.id));
 const defList=S.scope.type==='list'&&canEdit(S.scope.id)?S.scope.id:S.inboxId;
 ACT.create=()=>{
  const title=$('tdNtTitle').value.trim();if(!title)return;
  const listId=$('tdNtList').value,priority=$('tdNtPrio').value;
  const chip=document.querySelector('#tdOvl .td-qchip.on');
  const due=$('tdNtDueCustom').value||(chip?chip.dataset.v:'');
  closeOvl();
  mutate(async()=>{
   const r=await POST('/api/todo/tasks',{listId,title,...(priority!=='keine'?{priority}:{}),...(due?{dueDate:due}:{})});
   S.tasks[r.task.id]=r.task;S.order.unshift(r.task.id);renderAll();openDetail(r.task.id);
  });
 };
 ovl('<h3>＋ Neue Aufgabe</h3>'
  +'<input id="tdNtTitle" class="td-minput big" placeholder="Was ist zu tun?" onkeydown="if(event.key===\'Enter\')td.act(\'create\')">'
  +'<div class="td-mgrid">'
  +'<label>Liste</label><select id="tdNtList" class="fsel">'+lists.map(l=>'<option value="'+l.id+'"'+(l.id===defList?' selected':'')+'>'+(l.icon?l.icon+' ':'')+esc(l.name)+'</option>').join('')+'</select>'
  +'<label>Priorität</label><select id="tdNtPrio" class="fsel">'+PRIOS.map(p=>'<option value="'+p.id+'">'+p.icon+' '+p.label+'</option>').join('')+'</select>'
  +'<label>Fällig</label><div class="td-quickchips">'+dueChips(dueDate||'')+'</div>'
  +'</div>'
  +'<div class="td-mbtns"><button class="btn" onclick="td.closeDialogs()">Abbrechen</button><button class="btn btn-p" onclick="td.act(\'create\')">Erstellen</button></div>');
}
// Listen-Editor: anlegen (listId=null) oder bearbeiten — Name, Symbol, Farbe, Ordner
function openListModal(listId){
 closePop();
 const l=listId?listById(listId):null;
 if(listId&&!l)return;
 const isOwner=!l||l.role==='owner';
 ACT.save=()=>{
  const name=$('tdLName').value.trim();if(!name)return;
  const em=document.querySelector('#tdOvl .td-emoji.on');
  const sw=document.querySelector('#tdOvl .td-swatch.on');
  const body={name,icon:em?(em.dataset.e||null):null,color:sw?sw.dataset.c:null,folderId:$('tdLFolder').value||null};
  closeOvl();
  mutate(async()=>{
   let goTo=listId;
   if(listId)await PUT('/api/todo/lists/'+listId,body);
   else{const r=await POST('/api/todo/lists',body);goTo=r.list.id;}
   S.booted=false;await boot(true);
   S.scope={type:'list',id:goTo};refresh();
  });
 };
 const folderSel=S.scope.type==='folder'&&!l?S.scope.id:(l?l.folderId:null);
 ovl('<h3>'+(l?'✏️ Liste bearbeiten':'＋ Neue Liste')+'</h3>'
  +'<input id="tdLName" class="td-minput big" placeholder="Name der Liste…" value="'+esc(l?l.name:'')+'" onkeydown="if(event.key===\'Enter\')td.act(\'save\')">'
  +'<div class="td-mlabel">Symbol</div>'+emojiRow(l?l.icon:null)
  +'<div class="td-mlabel">Farbe</div>'+swatchRow(l?l.color:PALETTE[0])
  +'<div class="td-mlabel">Ordner</div><select id="tdLFolder" class="fsel" style="width:100%"><option value="">— kein Ordner —</option>'
  +S.folders.map(f=>'<option value="'+f.id+'"'+(folderSel===f.id?' selected':'')+'>📁 '+esc(f.name)+'</option>').join('')+'</select>'
  +'<div class="td-mbtns">'
  +(l&&isOwner&&!l.isInbox?'<button class="btn btn-d btn-sm" style="margin-right:auto" onclick="td.listDelete(\''+listId+'\')">🗑 Löschen</button>':'')
  +(l&&!isOwner?'<button class="btn btn-d btn-sm" style="margin-right:auto" onclick="td.listLeave(\''+listId+'\')">🚪 Verlassen</button>':'')
  +'<button class="btn" onclick="td.closeDialogs()">Abbrechen</button>'
  +'<button class="btn btn-p" onclick="td.act(\'save\')">'+(l?'Speichern':'Liste anlegen')+'</button></div>');
}
function newList(){openListModal(null);}
function newFolder(){
 tdInput('＋ Neuer Ordner','Name des Ordners','','Anlegen',name=>{
  mutate(async()=>{await POST('/api/todo/folders',{name});S.booted=false;await boot(true);renderAll();});
 });
}
function listMenu(ev,id){
 ev.preventDefault();
 const l=listById(id);if(!l)return;
 const isAdmin=['admin','owner'].includes(l.role);
 let h='';
 if(isAdmin)h+='<button class="td-menuitem" onclick="td.openListModal(\''+id+'\')">✏️ Bearbeiten…</button>';
 if(!l.isInbox)h+='<button class="td-menuitem" onclick="td.closeDialogs();td.shareDialog(\''+id+'\')">👥 Teilen &amp; Mitglieder…</button>';
 if(l.role==='owner'&&!l.isInbox)h+='<button class="td-menuitem danger" onclick="td.listDelete(\''+id+'\')">🗑 Liste löschen…</button>';
 if(l.role!=='owner')h+='<button class="td-menuitem danger" onclick="td.listLeave(\''+id+'\')">🚪 Liste verlassen…</button>';
 if(h)popAt(ev.clientX,ev.clientY,h,215);
}
function folderMenu(ev,id){
 ev.preventDefault();
 const f=S.folders.find(f=>f.id===id);if(!f)return;
 popAt(ev.clientX,ev.clientY,
  '<button class="td-menuitem" onclick="td.folderRename(\''+id+'\')">✏️ Umbenennen…</button>'
  +'<button class="td-menuitem danger" onclick="td.folderDelete(\''+id+'\')">🗑 Ordner löschen…</button>',215);
}
function tagMenu(ev,id){ev.preventDefault();openTagManager();}
// Teilen-Dialog: Mitgliederliste mit Avataren, Rollen-Dropdowns, Einladen per E-Mail
async function shareDialog(listId){
 const l=listById(listId);if(!l)return;
 let mem=[];try{mem=(await GET('/api/todo/lists/'+listId+'/members')).members;}catch(e){return toast('⚠️ '+e.message);}
 const isAdmin=['admin','owner'].includes(l.role);
 const roleCell=m=>m.role==='owner'
  ?'<span class="td-rolefix">👑 Besitzer</span>'
  :(isAdmin
   ?'<select class="fsel" style="font-size:11px;padding:4px 6px" onchange="td.shareRole(\''+listId+'\',\''+m.userId+'\',this.value)">'+ROLLEN.map(r=>'<option value="'+r.id+'"'+(m.role===r.id?' selected':'')+'>'+r.label+'</option>').join('')+'</select>'
   :'<span class="td-rolefix">'+esc((ROLLEN.find(r=>r.id===m.role)||{label:m.role}).label)+'</span>');
 ovl('<h3>👥 „'+esc(l.name)+'" teilen</h3>'
  +'<div class="td-memlist">'+mem.map(m=>'<div class="td-memrow">'+avatar(m.name)
   +'<div class="td-meminfo"><b>'+esc(m.name)+(m.userId===me().id?' (du)':'')+'</b><span>'+esc(m.email)+'</span></div>'
   +roleCell(m)
   +(isAdmin&&m.role!=='owner'?'<button class="td-mini" title="Entfernen" onclick="td.shareKick(\''+listId+'\',\''+m.userId+'\',\''+esc(m.name)+'\')">✕</button>':'')
   +'</div>').join('')+'</div>'
  +(isAdmin
   ?'<div class="td-invrow"><input id="tdInvMail" class="td-minput" placeholder="E-Mail des SellerHub-Kontos…" onkeydown="if(event.key===\'Enter\')td.shareInvite(\''+listId+'\')">'
    +'<select id="tdInvRole" class="fsel">'+ROLLEN.map(r=>'<option value="'+r.id+'"'+(r.id==='editor'?' selected':'')+'>'+r.label+'</option>').join('')+'</select>'
    +'<button class="btn btn-p btn-sm" onclick="td.shareInvite(\''+listId+'\')">Einladen</button></div>'
    +'<p class="td-mhint">Rollen: Nur lesen → Kommentieren → Bearbeiten → Verwalten (darf einladen). Eingeladen werden können nur bestehende SellerHub-Konten.</p>'
   :'<p class="td-mhint">Nur Verwalter können Mitglieder einladen oder Rollen ändern.</p>')
  +'<div class="td-mbtns"><button class="btn" onclick="td.closeDialogs()">Schließen</button></div>');
}
// Tag-Manager: umbenennen, Farbe per Klick, löschen, neu anlegen
function openTagManager(){
 closePop();
 ovl('<h3>🏷 Tags verwalten</h3>'
  +'<div class="td-memlist">'+(S.tags.length?S.tags.map(t=>'<div class="td-memrow">'
   +'<input class="td-minput" style="flex:1;min-width:0" value="'+esc(t.name)+'" onchange="td.tagRename(\''+t.id+'\',this.value)">'
   +'<div class="td-swrow sm">'+PALETTE.map(c=>'<span class="td-swatch'+(t.color===c?' on':'')+'" style="background:'+c+'" onclick="td.tagColor(\''+t.id+'\',\''+c+'\')"></span>').join('')+'</div>'
   +'<button class="td-mini" title="Tag löschen" onclick="td.tagDelete(\''+t.id+'\')">🗑</button></div>').join('')
  :'<p class="td-mtext">Noch keine Tags — lege unten den ersten an.</p>')+'</div>'
  +'<div class="td-invrow"><input id="tdNewTag" class="td-minput" placeholder="Neuen Tag anlegen…" onkeydown="if(event.key===\'Enter\')td.tagCreate()"><button class="btn btn-p btn-sm" onclick="td.tagCreate()">Anlegen</button></div>'
  +'<div class="td-mbtns"><button class="btn" onclick="td.closeDialogs()">Schließen</button></div>');
}
// ═══ Fälligkeits-Popover: Schnellwahl + Mini-Kalender + Uhrzeit ═══
function miniCal(id){
 const[y,m]=S.popMonth.split('-').map(Number);
 const first=new Date(y,m-1,1);
 const startDow=(first.getDay()+6)%7;
 const daysIn=new Date(y,m,0).getDate();
 const sel=S.tasks[id]?S.tasks[id].dueDate:null;
 let h='<div class="td-mcal"><div class="td-mcalhead"><button onclick="td.dueShiftMonth(\''+id+'\',-1)">‹</button><b>'+first.toLocaleDateString('de-DE',{month:'long',year:'numeric'})+'</b><button onclick="td.dueShiftMonth(\''+id+'\',1)">›</button></div><div class="td-mcalgrid">';
 ['Mo','Di','Mi','Do','Fr','Sa','So'].forEach(d=>h+='<span class="dw">'+d+'</span>');
 for(let i=0;i<startDow;i++)h+='<span></span>';
 for(let d=1;d<=daysIn;d++){
  const ds=S.popMonth+'-'+String(d).padStart(2,'0');
  h+='<button class="'+(ds===todayStr()?'today ':'')+(ds===sel?'sel':'')+'" onclick="td.duePick(\''+id+'\',\''+ds+'\')">'+d+'</button>';
 }
 return h+'</div></div>';
}
function duePopHtml(id){
 const t=S.tasks[id]||{};
 const q=[['📅 Heute',todayStr()],['➡️ Morgen',addDays(todayStr(),1)],['🛋 Wochenende',saturdayStr()],['🗓 Nächste Woche',nextMondayStr()]];
 return'<div class="td-popquick">'+q.map(x=>'<button onclick="td.duePick(\''+id+'\',\''+x[1]+'\')">'+x[0]+'<span>'+fmtDow(x[1])+' '+x[1].slice(8,10)+'.'+x[1].slice(5,7)+'.</span></button>').join('')
  +(t.dueDate?'<button class="clear" onclick="td.duePick(\''+id+'\',\'\')">✕ Kein Datum</button>':'')+'</div>'
  +miniCal(id)
  +'<div class="td-poptime"><span>🕐 Uhrzeit</span><input type="time" class="fsel" value="'+esc(t.dueTime||'')+'" onchange="td.field(\''+id+'\',\'dueTime\',this.value||null)"></div>';
}
// ═══ Erinnerungs-Popover: Schnellwahl + eigener Zeitpunkt ═══
function remPopHtml(taskId){
 const now=new Date();
 const opts=[['In 1 Stunde',new Date(now.getTime()+3600e3)]];
 const evening=new Date(now);evening.setHours(18,0,0,0);
 if(evening>now)opts.push(['Heute Abend',evening]);
 const morgen=new Date(now.getTime()+864e5);morgen.setHours(9,0,0,0);opts.push(['Morgen früh',morgen]);
 const mon=new Date(now);mon.setDate(mon.getDate()+((1-mon.getDay()+7)%7||7));mon.setHours(9,0,0,0);opts.push(['Nächste Woche',mon]);
 return'<div class="td-popquick">'+opts.map(o=>'<button onclick="td.remPick(\''+taskId+'\',\''+o[1].toISOString()+'\')">⏰ '+o[0]+'<span>'+fmtWhen(o[1].toISOString())+'</span></button>').join('')+'</div>'
  +'<div class="td-poptime"><input type="datetime-local" id="tdRemCustom" class="fsel" style="flex:1"><button class="btn btn-p btn-sm" onclick="td.remPickCustom(\''+taskId+'\')">＋</button></div>';
}

// ═══ Öffentliche Aktionen (window.td) ═══
window.td={
 setScope(type,id){S.scope={type,id};S.sel.clear();S.focus=-1;S.offset=0;refresh();},
 setView(v){S.view=v;renderAll();},
 setSort(v){S.sort=v;renderAll();},
 setFilter(k,v){S[k]=v;S.offset=0;refresh();},
 clearFilters(){S.fPrio='';S.fTag='';S.fStatus='';S.fDone='open';S.offset=0;refresh();},
 searchInput(v){S.search=v.trim();if(S.searchT)clearTimeout(S.searchT);S.searchT=setTimeout(()=>refresh(),300);},
 loadMore(){S.offset+=300;loadTasks();},
 quickAdd,newTaskDialog,newList,newFolder,listMenu,folderMenu,tagMenu,shareDialog,
 rowClick,toggleSel,clearSel,
 toggleDone:tdToggleDone,toggleStar:tdToggleStar,deleteTask:tdDeleteTask,
 openDetail,closeDetail,setTab(t){S.tab=t;renderDetail();},
 dragStart,dragOver,dropOnRow,dropOnList,dropOnCol,dropOnDay,
 calShift(n){const[y,m]=S.calMonth.split('-').map(Number);const d=new Date(y,m-1+n,1);S.calMonth=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');refresh();},
 calToday(){S.calMonth=todayStr().slice(0,7);refresh();},
 inlineEdit(ev,id){
  ev.stopPropagation();
  const span=ev.target;const t=S.tasks[id];if(!t||!canEdit(t.listId))return;
  const inp=document.createElement('input');inp.className='td-clinput';inp.value=t.title;
  span.replaceWith(inp);inp.focus();inp.select();
  const done=save=>{if(save&&inp.value.trim()&&inp.value.trim()!==t.title){patchLocal(id,{title:inp.value.trim()});mutate(()=>PUT('/api/todo/tasks/'+id,{title:inp.value.trim()}));}renderAll();};
  inp.addEventListener('keydown',e=>{if(e.key==='Enter')done(true);if(e.key==='Escape')done(false);});
  inp.addEventListener('blur',()=>done(true));
 },
 field(id,key,val){
  patchLocal(id,{[key]:val});
  if(S.detail&&S.detail.task.id===id)Object.assign(S.detail.task,{[key]:val});
  mutate(async()=>{const r=await PUT('/api/todo/tasks/'+id,{[key]:val});S.tasks[id]=r.task;if(S.detail&&S.detail.task.id===id){S.detail.task=r.task;}if(key==='listId')openDetail(id,true);renderAll();});
 },
 repeatChange(id){
  const mode=$('tdRepMode').value;
  const rule=mode==='none'?null:{mode,every:Math.max(1,parseInt($('tdRepEvery').value,10)||1),unit:$('tdRepUnit').value};
  td.field(id,'repeatRule',rule);
 },
 toggleDoneSub(id){mutate(async()=>{const t=S.tasks[id]||(S.detail&&S.detail.subtasks.find(s=>s.id===id));const val=t?!t.completed:true;await PUT('/api/todo/tasks/'+id,{completed:val});openDetail(S.detailId,true);});},
 // Checkliste
 clAdd(taskId){const inp=$('tdClNew');const v=inp.value.trim();if(!v)return;inp.value='';mutate(async()=>{await POST('/api/todo/tasks/'+taskId+'/checklist',{title:v,position:(S.detail?S.detail.checklist.length:0)+1});openDetail(taskId,true);});},
 clToggle(cid,done){mutate(async()=>{await PUT('/api/todo/checklist/'+cid,{done});openDetail(S.detailId,true);});},
 clEdit(cid,title){if(!title.trim())return;mutate(()=>PUT('/api/todo/checklist/'+cid,{title:title.trim()}));},
 clDel(cid){mutate(async()=>{await DEL('/api/todo/checklist/'+cid);openDetail(S.detailId,true);});},
 subAdd(taskId){const inp=$('tdSubNew');const v=inp.value.trim();if(!v)return;inp.value='';const t=S.tasks[taskId];mutate(async()=>{await POST('/api/todo/tasks',{listId:t.listId,parentId:taskId,title:v});openDetail(taskId,true);});},
 // Tags
 tag(taskId,tagId){mutate(async()=>{await POST('/api/todo/tasks/'+taskId+'/tags/'+tagId);openDetail(taskId,true);refresh(true);});},
 untag(taskId,tagId){mutate(async()=>{await DEL('/api/todo/tasks/'+taskId+'/tags/'+tagId);openDetail(taskId,true);refresh(true);});},
 newTagFor(taskId){
  ACT.create=()=>{
   const name=$('tdTgName').value.trim();if(!name)return;
   const sw=document.querySelector('#tdOvl .td-swatch.on');
   const color=sw?sw.dataset.c:PALETTE[0];
   closeOvl();
   mutate(async()=>{const r=await POST('/api/todo/tags',{name,color});S.tags.push(r.tag);if(taskId)await POST('/api/todo/tasks/'+taskId+'/tags/'+r.tag.id);if(taskId)openDetail(taskId,true);renderAll();});
  };
  ovl('<h3>✚ Neuer Tag</h3>'
   +'<input id="tdTgName" class="td-minput big" placeholder="Tag-Name…" onkeydown="if(event.key===\'Enter\')td.act(\'create\')">'
   +'<div class="td-mlabel">Farbe</div>'+swatchRow(PALETTE[0])
   +'<div class="td-mbtns"><button class="btn" onclick="td.closeDialogs()">Abbrechen</button><button class="btn btn-p" onclick="td.act(\'create\')">Anlegen</button></div>');
 },
 // Kommentare
 cAdd(taskId){const inp=$('tdCNew');const v=inp.value.trim();if(!v)return;inp.value='';mutate(async()=>{await POST('/api/todo/tasks/'+taskId+'/comments',{body:v});openDetail(taskId,true);});},
 cEdit(cid,taskId){
  const box=$('tdC'+cid);if(!box)return;
  const cur=box.textContent;
  box.innerHTML='<textarea id="tdCE'+cid+'" class="td-ctext">'+esc(cur)+'</textarea>'
   +'<div class="td-mbtns" style="margin-top:4px"><button class="btn btn-sm" onclick="td.openDetail(\''+taskId+'\',true)">Abbrechen</button>'
   +'<button class="btn btn-p btn-sm" onclick="td.cEditSave(\''+cid+'\',\''+taskId+'\')">Speichern</button></div>';
  const ta=$('tdCE'+cid);ta.focus();ta.setSelectionRange(ta.value.length,ta.value.length);
 },
 cEditSave(cid,taskId){const ta=$('tdCE'+cid);const v=ta?ta.value.trim():'';if(!v)return;mutate(async()=>{await PUT('/api/todo/comments/'+cid,{body:v});openDetail(taskId,true);});},
 cDel(cid,taskId){tdConfirm('Kommentar löschen','Der Kommentar wird endgültig entfernt.','Löschen',()=>mutate(async()=>{await DEL('/api/todo/comments/'+cid);openDetail(taskId,true);}));},
 // Anhänge
 attUpload(ev,taskId){
  const f=ev.target.files[0];if(!f)return;
  if(f.size>(S.limits.attachmentMax||5242880))return toast('⚠️ Datei zu groß (max. 5 MB)');
  const rd=new FileReader();
  rd.onload=()=>{
   const b64=String(rd.result).split(',')[1];
   mutate(async()=>{await POST('/api/todo/tasks/'+taskId+'/attachments',{filename:f.name,mime:f.type||'application/octet-stream',dataBase64:b64});toast('📎 Hochgeladen');openDetail(taskId,true);});
  };
  rd.readAsDataURL(f);
 },
 async download(attId,filename){
  try{
   const r=await fetch(api()+'/api/todo/attachments/'+attId,{headers:{Authorization:'Bearer '+token()}});
   if(!r.ok)throw new Error('Download fehlgeschlagen');
   const blob=await r.blob();
   const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;a.click();
   setTimeout(()=>URL.revokeObjectURL(a.href),5000);
  }catch(e){toast('⚠️ '+e.message);}
 },
 attDel(attId){tdConfirm('Anhang löschen','Die Datei wird endgültig entfernt.','Löschen',()=>mutate(async()=>{await DEL('/api/todo/attachments/'+attId);openDetail(S.detailId,true);}));},
 // Fälligkeit: Popover mit Schnellwahl + Mini-Kalender
 duePop(ev,id){
  const t=S.tasks[id];
  S.popMonth=(t&&t.dueDate?t.dueDate:todayStr()).slice(0,7);
  popBelow(ev,duePopHtml(id),300);
 },
 duePick(id,ds){td.field(id,'dueDate',ds||null);closePop();},
 dueShiftMonth(id,n){
  const[y,m]=S.popMonth.split('-').map(Number);
  const d=new Date(y,m-1+n,1);
  S.popMonth=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  const p=$('tdPop');if(p)p.innerHTML=duePopHtml(id);
 },
 // Erinnerungen: Popover mit Schnellwahl + eigenem Zeitpunkt
 remPop(ev,taskId){popBelow(ev,remPopHtml(taskId),290);},
 remPick(taskId,iso){
  if('Notification'in window&&Notification.permission==='default')Notification.requestPermission();
  closePop();
  mutate(async()=>{await POST('/api/todo/tasks/'+taskId+'/reminders',{remindAt:iso});toast('⏰ Erinnerung gesetzt');openDetail(taskId,true);});
 },
 remPickCustom(taskId){
  const inp=$('tdRemCustom');if(!inp||!inp.value)return toast('Bitte Zeitpunkt wählen');
  td.remPick(taskId,new Date(inp.value).toISOString());
 },
 delReminder(rid){mutate(async()=>{await DEL('/api/todo/reminders/'+rid);openDetail(S.detailId,true);});},
 // Papierkorb
 restore(id){mutate(async()=>{await POST('/api/todo/tasks/'+id+'/restore');refresh();});},
 purge(id){tdConfirm('Endgültig löschen','Die Aufgabe wird unwiderruflich gelöscht — das kann nicht rückgängig gemacht werden.','Endgültig löschen',()=>mutate(async()=>{await DEL('/api/todo/tasks/'+id+'/purge');delete S.tasks[id];S.order=S.order.filter(x=>x!==id);renderAll();}));},
 // Bulk
 bulk(action){
  const ids=[...S.sel];if(!ids.length)return;
  const run=()=>{S.sel.clear();mutate(async()=>{const r=await POST('/api/todo/tasks/bulk',{ids,action});if(r.failed&&r.failed.length)toast('⚠️ '+r.failed.length+' fehlgeschlagen (Rechte?)');refresh();});};
  if(action==='delete')tdConfirm('Aufgaben löschen',ids.length+' Aufgabe(n) in den Papierkorb legen?','In Papierkorb',run);
  else run();
 },
 bulkPatch(patch){
  const ids=[...S.sel];if(!ids.length)return;S.sel.clear();
  mutate(async()=>{const r=await POST('/api/todo/tasks/bulk',{ids,action:'patch',patch});if(r.failed&&r.failed.length)toast('⚠️ '+r.failed.length+' fehlgeschlagen');refresh();});
 },
 // Filter speichern/anwenden
 saveCurrentFilter(){
  tdInput('💾 Filter speichern','Name für diesen Filter','','Speichern',name=>{
   const filter={fPrio:S.fPrio,fTag:S.fTag,fStatus:S.fStatus,fDone:S.fDone,search:S.search,scope:S.scope};
   mutate(async()=>{const r=await POST('/api/todo/filters',{name,filter});S.savedFilters.push(r.filter);renderAll();});
  });
 },
 applySavedFilter(id){
  const f=S.savedFilters.find(f=>f.id===id);if(!f)return;
  Object.assign(S,{fPrio:f.filter.fPrio||'',fTag:f.filter.fTag||'',fStatus:f.filter.fStatus||'',fDone:f.filter.fDone||'open',search:f.filter.search||''});
  S.scope={type:'filter',id};
  const si=$('tdSearch');if(si)si.value=S.search;
  S.offset=0;
  // Scope des Filters: gespeicherten Original-Scope anwenden, Anzeige bleibt „Filter"
  const orig=f.filter.scope||{type:'smart',id:'all'};
  const saved=S.scope;S.scope=orig;
  loadTasks().then(()=>{S.scope=saved;renderAll();});
 },
 deleteSavedFilter(id){tdConfirm('Filter löschen','Der gespeicherte Filter wird entfernt.','Löschen',()=>mutate(async()=>{await DEL('/api/todo/filters/'+id);S.savedFilters=S.savedFilters.filter(f=>f.id!==id);if(S.scope.type==='filter'&&S.scope.id===id)S.scope={type:'smart',id:'inbox'};renderAll();}));},
 // Rich-Text
 fmt(cmd){document.execCommand(cmd,false,null);const d=$('tdDesc');if(d)d.focus();},
 fmtLink(){
  const s=document.getSelection();
  const range=s&&s.rangeCount?s.getRangeAt(0).cloneRange():null;
  ACT.ok=()=>{
   const url=$('tdMInput').value.trim();closeOvl();
   if(!/^https?:\/\//i.test(url))return toast('⚠️ Link muss mit http(s):// beginnen');
   const d=$('tdDesc');
   if(d){d.focus();if(range){const sel=document.getSelection();sel.removeAllRanges();sel.addRange(range);}document.execCommand('createLink',false,url);}
  };
  ovl('<h3>🔗 Link einfügen</h3><div style="margin:12px 0"><input id="tdMInput" class="td-minput" placeholder="https://…" onkeydown="if(event.key===\'Enter\')td.act(\'ok\')"></div>'
   +'<div class="td-mbtns"><button class="btn" onclick="td.closeDialogs()">Abbrechen</button><button class="btn btn-p" onclick="td.act(\'ok\')">Einfügen</button></div>');
 },
 // ── Dialog-Infrastruktur & neue Aktionen (Polish-Pass) ──
 act(k){if(ACT[k])ACT[k]();},
 closeDialogs(){closeOvl();},
 pickSwatch(el){el.parentElement.querySelectorAll('.td-swatch').forEach(x=>x.classList.remove('on'));el.classList.add('on');},
 pickEmoji(el){el.parentElement.querySelectorAll('.td-emoji').forEach(x=>x.classList.remove('on'));el.classList.add('on');},
 pickDue(el){el.parentElement.querySelectorAll('.td-qchip').forEach(x=>x.classList.remove('on'));el.classList.add('on');const di=$('tdNtDueCustom');if(di)di.value='';},
 pickDueDate(el){if(el.value)el.parentElement.querySelectorAll('.td-qchip').forEach(x=>x.classList.remove('on'));},
 openListModal,openTagManager,
 listDelete(id){
  const l=listById(id);if(!l)return;
  tdConfirm('Liste löschen','„'+l.name+'" und ALLE Aufgaben darin werden endgültig gelöscht.','Liste löschen',
   ()=>mutate(async()=>{await DEL('/api/todo/lists/'+id);S.booted=false;await boot(true);S.scope={type:'smart',id:'inbox'};refresh();}));
 },
 listLeave(id){
  const l=listById(id);if(!l)return;
  tdConfirm('Liste verlassen','Du verlierst den Zugriff auf „'+l.name+'". Ein Mitglied mit Verwalter-Rolle kann dich erneut einladen.','Verlassen',
   ()=>mutate(async()=>{await DEL('/api/todo/lists/'+id+'/members/'+me().id);S.booted=false;await boot(true);S.scope={type:'smart',id:'inbox'};refresh();}));
 },
 folderRename(id){
  closePop();
  const f=S.folders.find(f=>f.id===id);if(!f)return;
  tdInput('✏️ Ordner umbenennen','Name',f.name,'Speichern',name=>mutate(async()=>{await PUT('/api/todo/folders/'+id,{name});S.booted=false;await boot(true);renderAll();}));
 },
 folderDelete(id){
  tdConfirm('Ordner löschen','Die Listen im Ordner bleiben erhalten und rutschen auf die oberste Ebene.','Ordner löschen',
   ()=>mutate(async()=>{await DEL('/api/todo/folders/'+id);S.booted=false;await boot(true);if(S.scope.type==='folder'&&S.scope.id===id)S.scope={type:'smart',id:'inbox'};refresh();}));
 },
 // Teilen-Dialog-Aktionen (Dialog lädt sich nach jeder Aktion neu)
 shareInvite(listId){
  const mail=$('tdInvMail').value.trim(),role=$('tdInvRole').value;
  if(!mail)return;
  mutate(async()=>{await POST('/api/todo/lists/'+listId+'/members',{email:mail,role});toast('✅ '+mail+' eingeladen');shareDialog(listId);});
 },
 shareRole(listId,userId,role){mutate(async()=>{await PUT('/api/todo/lists/'+listId+'/members/'+userId,{role});toast('✅ Rolle geändert');});},
 shareKick(listId,userId,name){
  tdConfirm('Mitglied entfernen',name+' verliert den Zugriff auf diese Liste.','Entfernen',
   ()=>mutate(async()=>{await DEL('/api/todo/lists/'+listId+'/members/'+userId);toast('✅ Entfernt');shareDialog(listId);}));
 },
 // Tag-Manager-Aktionen
 tagRename(id,name){if(!name.trim())return;mutate(async()=>{await PUT('/api/todo/tags/'+id,{name:name.trim()});const t=S.tags.find(t=>t.id===id);if(t)t.name=name.trim();renderAll();});},
 tagColor(id,c){mutate(async()=>{await PUT('/api/todo/tags/'+id,{color:c});const t=S.tags.find(t=>t.id===id);if(t)t.color=c;openTagManager();renderAll();});},
 tagDelete(id){
  tdConfirm('Tag löschen','Der Tag wird von allen Aufgaben entfernt.','Löschen',
   ()=>mutate(async()=>{await DEL('/api/todo/tags/'+id);S.tags=S.tags.filter(t=>t.id!==id);if(S.scope.type==='tag'&&S.scope.id===id)S.scope={type:'smart',id:'inbox'};openTagManager();refresh();}));
 },
 tagCreate(){
  const i=$('tdNewTag');const v=i?i.value.trim():'';if(!v)return;
  const color=PALETTE[S.tags.length%PALETTE.length];
  mutate(async()=>{const r=await POST('/api/todo/tags',{name:v,color});S.tags.push(r.tag);openTagManager();renderAll();});
 },
};

// Einstieg aus app.js: go('todo') → renderTodo()
window.renderTodo=function(){
 skeleton();
 if(!S.booted){
  $('tdBody')&&($('tdBody').innerHTML='<div class="td-empty">Lade…</div>');
  boot().then(ok=>{if(ok)refresh();else renderAll();});
 }else{
  refresh(true);
 }
};
})();
