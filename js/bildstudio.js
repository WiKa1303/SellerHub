(function(){
  const $=id=>document.getElementById(id);
  const MODEL="gemini-2.5-flash-image";
  const ENDPOINT="https://generativelanguage.googleapis.com/v1beta/models/"+MODEL+":generateContent";
  const igToast=(m,err)=>{ if(window.toast){window.toast((err?"⚠️ ":"")+m);} };
  const slug=s=>s.toLowerCase().replace(/[^a-z0-9]+/g,"-");

  // ── Cloud-KI-Proxy (läuft über dieselbe API wie der Seller-Radar) ──
  // bildstudio.js lädt VOR app.js → eigene lokale Kopie der radarApi()-Logik, keine Abhängigkeit.
  const IG_API_DEFAULT="https://radar-production-388a.up.railway.app";
  function igApi(){try{return (localStorage.getItem("wika_radar_api")||IG_API_DEFAULT).replace(/\/+$/,"");}catch(e){return IG_API_DEFAULT;}}
  function igSyToken(){try{return localStorage.getItem("sy_token")||"";}catch(e){return "";}}
  let igQuotaToastShown=false; // 429-Hinweis nur einmal pro Sitzung
  function igProxyWarn(kind,status){
    console.warn("KI-Proxy ("+kind+"): HTTP "+status+" – nutze Fallback-Kette.");
    if(status===429 && !igQuotaToastShown){
      igQuotaToastShown=true;
      igToast("KI-Tageskontingent erreicht — nutze eigenen Key oder Gratis-Modus",true);
    }
  }

  let mainImgs=[], packImg=null, useImg=null, usps=["","",""], igLastResults=[], igCtx=null, igCards=[], igLbRef=null, igCompetitor=null;

  const VISUALS=[
    {nm:"Hauptbild (Amazon-konform)", key:"main", p:"Amazon-Hauptbild nach Vorgaben: Produkt freigestellt auf REINWEISSEM Hintergrund, füllt ca. 85 % der Fläche, KEIN Text, KEINE Logos/Grafik, keine Requisiten."},
    {nm:"USP-Infografik 1", key:"usp1", p:"Infografik-Visual, das den 1. USP hervorhebt: Produkt seitlich, daneben großer Vorteilstext mit Icon und kurzer Erklärung. Klare, moderne Amazon-A+-Optik.",
      pNo:"Infografik-Visual OHNE Text, das den 1. USP rein visuell hervorhebt: Produkt seitlich, daneben ein großes, passendes Icon/Symbol für den Vorteil. Klare, moderne Amazon-A+-Optik."},
    {nm:"USP-Infografik 2", key:"usp2", p:"Infografik-Visual, das den 2. USP hervorhebt: Produkt mit Callout-Linien zu wichtigen Merkmalen, Vorteilstext groß und gut lesbar.",
      pNo:"Infografik-Visual OHNE Text, das den 2. USP rein visuell zeigt: Produkt mit Callout-Linien zu wichtigen Merkmalen – an den Linien nur Icons oder vergrößerte Detail-Ausschnitte statt Text."},
    {nm:"USP-Infografik 3", key:"usp3", p:"Infografik-Visual, das den 3. USP hervorhebt: Vergleich/Benefit-Darstellung mit Häkchen, Produkt gut sichtbar, vertrauensbildend.",
      pNo:"Infografik-Visual OHNE Text, das den 3. USP rein visuell zeigt: Benefit-Darstellung mit Häkchen-Symbolen und Icons, Produkt gut sichtbar, vertrauensbildend."},
    {nm:"Lifestyle / Anwendung", key:"life", p:"Lifestyle-Bild: das Produkt in realer Anwendung/Umgebung der Zielgruppe, natürliches Licht, emotional und ansprechend, dezenter Nutzentext."},
    {nm:"Vertrauen / Qualität", key:"trust", p:"Vertrauens-Visual: Produkt mit Qualitäts-/Gütesiegel-Anmutung (z. B. laborgeprüft, Made-in-Optik), Verpackung sichtbar wenn vorhanden, seriös und premium."}
  ];

  function renderUsps(){
    const c=$("igUspList");c.innerHTML="";
    usps.forEach((v,i)=>{
      const r=document.createElement("div");r.className="ig-usp";
      r.innerHTML='<span class="ig-num">'+(i+1)+'</span><input type="text" placeholder="Vorteil / Alleinstellungsmerkmal '+(i+1)+'"><button class="ig-del" title="Entfernen">🗑</button>';
      const inp=r.querySelector("input");inp.value=v;
      inp.oninput=e=>{usps[i]=e.target.value;updateChecklist();};
      r.querySelector(".ig-del").onclick=()=>{usps.splice(i,1);renderUsps();updateChecklist();};
      c.appendChild(r);
    });
  }
  $("igAddUsp").onclick=()=>{usps.push("");renderUsps();updateChecklist();};

  function readImg(f){return new Promise(res=>{const r=new FileReader();r.onload=()=>res({name:f.name,mime:f.type,dataUrl:r.result,base64:r.result.split(",")[1]});r.readAsDataURL(f);});}
  function setupDrop(dropId,inputId,onFiles){
    const drop=$(dropId),inp=$(inputId);
    drop.onclick=()=>inp.click();
    ["dragover","dragenter"].forEach(e=>drop.addEventListener(e,ev=>{ev.preventDefault();drop.classList.add("drag");}));
    ["dragleave","drop"].forEach(e=>drop.addEventListener(e,ev=>{ev.preventDefault();drop.classList.remove("drag");}));
    drop.addEventListener("drop",ev=>onFiles(ev.dataTransfer.files));
    inp.addEventListener("change",ev=>onFiles(ev.target.files));
  }
  function renderThumbs(elId,arr){
    const c=$(elId);c.innerHTML="";
    arr.forEach((img,i)=>{
      const d=document.createElement("div");d.className="ig-thumb";
      d.innerHTML='<img src="'+img.dataUrl+'"><button>×</button>';
      d.querySelector("button").onclick=()=>{arr.splice(i,1);renderThumbs(elId,arr);updateBadge();updateChecklist();};
      c.appendChild(d);
    });
  }
  function renderSingle(elId,getImg,setNull){
    const c=$(elId);c.innerHTML="";
    const img=getImg();if(!img)return;
    const d=document.createElement("div");d.className="ig-thumb";
    d.innerHTML='<img src="'+img.dataUrl+'"><button>×</button>';
    d.querySelector("button").onclick=()=>{setNull();c.innerHTML="";updateChecklist();};
    c.appendChild(d);
  }
  setupDrop("igDropMain","igFileMain",async list=>{
    for(const f of list){if(!f.type.startsWith("image/")||mainImgs.length>=10)continue;mainImgs.push(await readImg(f));}
    renderThumbs("igThumbsMain",mainImgs);updateBadge();updateChecklist();
  });
  setupDrop("igDropPack","igFilePack",async list=>{if(list[0]){packImg=await readImg(list[0]);renderSingle("igThumbsPack",()=>packImg,()=>packImg=null);}});
  setupDrop("igDropUse","igFileUse",async list=>{if(list[0]){useImg=await readImg(list[0]);renderSingle("igThumbsUse",()=>useImg,()=>useImg=null);}});

  function updateBadge(){const b=$("igBadge");b.textContent=mainImgs.length+" HOCHGELADEN";b.className="ig-badge"+(mainImgs.length>0?" green":"");}

  ["igTitle","igDesc"].forEach(id=>$(id).addEventListener("input",updateChecklist));
  function updateChecklist(){
    const okTitle=$("igTitle").value.trim().length>0;
    const okDesc=$("igDesc").value.trim().length>=30;
    const okImg=mainImgs.length>0;
    const okUsp=usps.filter(u=>u.trim().length>0).length>=3;
    tog("igChk-title",okTitle,1);tog("igChk-desc",okDesc,2);tog("igChk-img",okImg,3);tog("igChk-usp",okUsp,4);
    const done=[okTitle,okDesc,okImg,okUsp].filter(Boolean).length;
    $("igFill").style.width=(done/4*100)+"%";
    const all=done===4;
    const visBox=$("igVisuals");
    const nVis=visBox?visBox.querySelectorAll("input:checked").length:0;
    const btn=$("igGenBtn");
    btn.textContent="✦ "+nVis+" Bild"+(nVis===1?"":"er")+" generieren";
    btn.disabled=!(all && nVis>0);
    $("igWarn").style.display=all?"none":"flex";
    $("igCredits").style.display=all?"block":"none";
  }
  // Zeichenzähler
  function igUpdateCounts(){
    const t=$("igTitle").value.length;
    const c=$("igTitleCount");c.textContent=t+" / 200";c.classList.toggle("over",t>200);
    $("igDescCount").textContent=$("igDesc").value.length+" Zeichen";
  }
  ["igTitle","igDesc"].forEach(id=>$(id).addEventListener("input",igUpdateCounts));
  // Visual-Auswahl
  function igRenderVisuals(){
    const box=$("igVisuals");box.innerHTML="";
    VISUALS.forEach((v,i)=>{
      const l=document.createElement("label");l.className="ig-vis";
      const cb=document.createElement("input");cb.type="checkbox";cb.checked=true;cb.dataset.i=i;
      cb.addEventListener("change",updateChecklist);
      const s=document.createElement("span");s.textContent=v.nm;
      l.appendChild(cb);l.appendChild(s);box.appendChild(l);
    });
  }
  function igSelectedVisuals(){return [...$("igVisuals").querySelectorAll("input:checked")].map(c=>VISUALS[+c.dataset.i]);}
  // ── Umschalter: USP-Bilder ohne Text-Overlay (Zustand in localStorage) ──
  function igUspNoTextOn(){const cb=$("igUspNoText");return !!(cb&&cb.checked);}
  { const cb=$("igUspNoText");
    if(cb){
      cb.checked=localStorage.getItem("ig_usp_notext")==="1";
      cb.addEventListener("change",()=>localStorage.setItem("ig_usp_notext",cb.checked?"1":"0"));
    } }
  function tog(id,on,n){const e=$(id);e.classList.toggle("done",on);e.querySelector(".ig-box").textContent=on?"✓":n;}

  $("igProvider").addEventListener("change",updateProvider);
  function updateProvider(){
    const gem=$("igProvider").value==="gemini";
    $("igKeyBox").style.display=gem?"block":"none";
    $("igProvHint").innerHTML=gem?"✅ Bild-zu-Bild: nutzt deine hochgeladenen Fotos und behält dein echtes Produkt 1:1. Benötigt API-Key mit aktiviertem Billing (~0,04 $/Bild).":"⚠️ Nur Text-zu-Bild: erfindet Bilder aus dem Text und nutzt deine Fotos NICHT – nur für eine schnelle Stil-Vorschau geeignet.";
    $("igCredits").innerHTML=gem?"Dies verbraucht ca. <b>9 Credits</b>":"Kostenloser Test-Modus · <b>0 €</b>";
  }

  // ── Gemini-Key: Status, Banner & Auto-Öffnen bei Überlast ──
  function igHasKey(){return !!(($("igApikey").value||localStorage.getItem("gemini_key")||"").trim());}
  function igUpdateKeyUI(){
    const has=igHasKey(), cloud=!!igSyToken(); // cloud beeinflusst NUR den Hinweistext, nie igHasKey()
    const ok=$("igKeyOk");
    if(ok){
      ok.style.display=(has||cloud)?"block":"none";
      ok.textContent=has?"✓ Key gespeichert":"☁️ KI läuft über dein SellerHub-Konto — eigener Key optional";
    }
    const ban=$("igKeyBanner");
    if(ban)ban.style.display=(!has && !cloud && sessionStorage.getItem("ig_keyban_x")!=="1")?"flex":"none";
  }
  function igRevealKeyBox(){
    const box=$("igKeyBox");if(!box)return;
    box.style.display="block";box.open=true;
    box.scrollIntoView({behavior:"smooth",block:"center"});
    const inp=$("igApikey");if(inp){try{inp.focus();}catch(e){}igFlash(inp);}
  }
  // Bei Überlastung OHNE eigenen Key: Banner wieder zeigen + Key-Feld aktiv öffnen
  function igPromptKeyOnOverload(){
    if(igHasKey())return;
    try{sessionStorage.removeItem("ig_keyban_x");}catch(e){}
    igUpdateKeyUI();
    igRevealKeyBox();
  }
  // Fehlerbox der ✨-Buttons – bei Überlast ohne Key zusätzlich Key-Hinweis
  function igSugErr(box,err){
    const msg=(err&&err.message)||"Unbekannter Fehler";
    const over=igOverloadRe.test(msg)||/überlast/i.test(msg);
    let html='<div class="ig-sug-err">'+(over?"⏳ ":"⚠️ ")+msg+'</div>';
    if(over && !igHasKey()){
      html+='<div class="ig-sug-err" style="margin-top:6px;color:var(--tx3)">Mit eigenem <b>Gemini-Key</b> läuft die KI stabil. <a href="#" id="igSugKeyLink" style="color:var(--pu);font-weight:700">Key eintragen</a> · <a href="https://aistudio.google.com/apikey" target="_blank" style="color:var(--pu)">Key holen ↗</a></div>';
    }
    box.innerHTML=html;
    const lnk=box.querySelector("#igSugKeyLink");
    if(lnk)lnk.onclick=(e)=>{e.preventDefault();igPromptKeyOnOverload();};
  }

  const sk=localStorage.getItem("gemini_key");
  if(sk){$("igApikey").value=sk;}
  $("igApikey").addEventListener("input",e=>{localStorage.setItem("gemini_key",e.target.value.trim());igUpdateKeyUI();});
  igUpdateKeyUI();
  { const b=$("igKeyBannerBtn");if(b)b.onclick=igRevealKeyBox;
    const x=$("igKeyBannerX");if(x)x.onclick=()=>{try{sessionStorage.setItem("ig_keyban_x","1");}catch(e){}igUpdateKeyUI();}; }

  // ── Amazon-Import ──
  // Stufe 0: eigenes Backend (Bearer, gecacht, zuverlässig) — nur mit Cloud-Session (sy_token).
  // Ohne Token oder bei Fehler (401/429/502/Netz): unveränderte clientseitige Proxy-Kette darunter.
  function igRadarApi(){try{return (localStorage.getItem("wika_radar_api")||"https://radar-production-388a.up.railway.app").replace(/\/+$/,"");}catch(e){return "https://radar-production-388a.up.railway.app";}}
  async function igBackendImport(urlOrAsin){
    const tok=igSyToken();if(!tok)return null;
    try{
      const r=await fetch(igRadarApi()+"/api/import/amazon",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+tok},body:JSON.stringify({urlOrAsin:urlOrAsin})});
      if(!r.ok){let msg="";try{msg=((await r.json())||{}).error||"";}catch(e){}console.warn("Backend-Import "+r.status+(msg?" — "+msg:"")+" → Fallback auf Proxy-Kette");return null;}
      const j=await r.json();
      if(!j||!j.title)return null;
      return j;
    }catch(e){console.warn("Backend-Import nicht erreichbar → Fallback auf Proxy-Kette",e);return null;}
  }
  // (Stufe 1+: clientseitig über offene CORS-Proxys, best effort)
  const IG_PROXIES=[
    u=>"https://api.allorigins.win/raw?url="+encodeURIComponent(u),
    u=>"https://api.codetabs.com/v1/proxy/?quest="+encodeURIComponent(u),
    u=>"https://corsproxy.io/?url="+encodeURIComponent(u),
    u=>"https://thingproxy.freeboard.io/fetch/"+u
  ];
  async function igFetchVia(u){
    // 1) jina.ai Reader: liefert rohes deutsches HTML mit CORS, umgeht den Amazon-Block
    try{
      const r=await fetch("https://r.jina.ai/"+u,{headers:{"X-Return-Format":"html","X-Locale":"de-DE"}});
      if(r.ok){const t=await r.text();if(t&&t.length>2000)return t;}
    }catch(e){}
    // 2) klassische Proxys als Fallback
    for(const mk of IG_PROXIES){
      try{const r=await fetch(mk(u));if(!r.ok)continue;const t=await r.text();if(t&&t.length>2000)return t;}catch(e){}
    }
    throw new Error("Seite nicht ladbar (Reader/Proxy nicht erreichbar)");
  }
  // Rohes HTML (mit Amazon-Bild-JSON) NUR über klassische Proxys – ohne jina.ai-Bereinigung
  async function igFetchRawProxy(u){
    for(const mk of IG_PROXIES){
      try{const r=await fetch(mk(u));if(!r.ok)continue;const t=await r.text();if(t&&t.length>2000)return t;}catch(e){}
    }
    return null;
  }
  function igAsin(s){
    var m=s.match(/(?:\/dp\/|\/gp\/product\/|\/product\/|[?&]asin=)([A-Z0-9]{10})/i)||s.match(/(?:^|\/|=)([A-Z0-9]{10})(?:[/?#]|$)/);
    return m?m[1].toUpperCase():null;
  }
  function igTld(s){var m=s.match(/amazon\.([a-z.]{2,6})(?:\/|$)/i);return m?m[1].toLowerCase():"de";}
  async function igFetchImageB64(url){
    let blob=null;
    // Stufe 0: eigener Bild-Proxy (canvas-taint-freie Bytes, Bearer) — nur mit Cloud-Session + Amazon-CDN-Host
    const tok=igSyToken();
    if(tok && /^https?:\/\/(?:m\.media-amazon\.com|images-(?:eu|na)\.ssl-images-amazon\.com)\//i.test(url)){
      try{
        const rp=await fetch(igRadarApi()+"/api/import/amazon-image?url="+encodeURIComponent(url),{headers:{"Authorization":"Bearer "+tok}});
        if(rp.ok){const b=await rp.blob();if(/^image\//.test(b.type))blob=b;}
        else console.warn("Bild-Proxy "+rp.status+" → direkter Abruf");
      }catch(e){console.warn("Bild-Proxy nicht erreichbar → direkter Abruf");}
    }
    // Amazon-CDN sendet CORS (*), daher direkt abrufbar; Proxy nur als Fallback
    if(!blob){try{const r=await fetch(url);if(r.ok)blob=await r.blob();}catch(e){}}
    if(!blob){const r2=await fetch("https://api.allorigins.win/raw?url="+encodeURIComponent(url));if(!r2.ok)throw new Error("img "+r2.status);blob=await r2.blob();}
    if(!/^image\//.test(blob.type))throw new Error("kein Bild");
    return await new Promise((res,rej)=>{const fr=new FileReader();fr.onload=()=>res({name:"amazon.jpg",mime:blob.type,dataUrl:fr.result,base64:String(fr.result).split(",")[1]});fr.onerror=rej;fr.readAsDataURL(blob);});
  }
  function igExtractImages(html,doc){
    // Amazon liefert dasselbe Foto in vielen Größen (gleiche Bild-ID, andere URL).
    // Wir deduplizieren nach BILD-ID, damit echte unterschiedliche Produktfotos zurückkommen.
    const uhtml=String(html).replace(/\\u002[fF]/g,"/").replace(/\\\//g,"/");
    const idOf=u=>{const m=String(u||"").replace(/\\u002[fF]/g,"/").replace(/\\\//g,"/").match(/\/images\/I\/([^.\/]+)\./);return m?m[1]:null;};
    const big=id=>"https://m.media-amazon.com/images/I/"+id+"._AC_SL1500_.jpg";
    const byId=new Map();
    const add=u=>{const id=idOf(u);if(id && id.length>=6 && !byId.has(id))byId.set(id,big(id));};
    let m;
    // 1) Galerie-JSON (colorImages/imageGalleryData): je hiRes/large = EIN eigenes Foto
    const reJson=/"(?:hiRes|large|mainUrl)"\s*:\s*"(https?:[^"]+?\.(?:jpe?g|png))"/gi;
    while((m=reJson.exec(uhtml))){add(m[1]);}
    // 2) Hauptbild + Größen-Varianten (data-a-dynamic-image) → gleiche ID, wird zusammengefasst
    const li=doc.querySelector("#landingImage, #imgBlkFront, #main-image, #imgTagWrapperId img");
    const dyn=li&&li.getAttribute("data-a-dynamic-image");
    if(dyn){try{Object.keys(JSON.parse(dyn)).forEach(add);}catch(e){}}
    if(li){add(li.getAttribute("data-old-hires"));add(li.getAttribute("src"));}
    // 3) Galerie-Thumbnails (teilen die Bild-ID mit dem Vollbild)
    doc.querySelectorAll("#altImages img, li.imageThumbnail img, .imageThumbnail img, .a-button-thumbnail img").forEach(im=>{add(im.getAttribute("src"));add(im.getAttribute("data-src"));});
    // 4) Fallback: alle Amazon-Produktbild-IDs aus dem rohen HTML (nur wenn bisher kaum etwas gefunden)
    if(byId.size<2){
      const reAny=/\/images\/I\/([^"'.\/\\ ]{6,})\.[a-z0-9._-]*?\.(?:jpe?g|png)/gi;
      while((m=reAny.exec(uhtml))){if(!byId.has(m[1]))byId.set(m[1],big(m[1]));}
    }
    // 5) og:image als letzter Notnagel
    if(byId.size===0){const og=doc.querySelector('meta[property="og:image"]');if(og&&og.getAttribute("content"))add(og.getAttribute("content"));}
    return [...byId.values()];
  }
  // Liest alle Felder aus einem Amazon-HTML: Titel, USPs, Bilder, Preis, Kategorie, Review-Anzahl
  function igParseListing(html){
    const doc=new DOMParser().parseFromString(html,"text/html");
    let title="";
    const tEl=doc.querySelector("#productTitle");if(tEl)title=tEl.textContent;
    if(!title){const ogt=doc.querySelector('meta[property="og:title"]');if(ogt)title=ogt.getAttribute("content")||"";}
    if(!title){const tt=doc.querySelector("title");if(tt)title=tt.textContent.replace(/^Amazon\.[a-z.]+\s*:?\s*/i,"").replace(/\s*[:|-]\s*Amazon\.[a-z.]+.*$/i,"");}
    title=(title||"").replace(/\s+/g," ").trim();
    const bullets=[...doc.querySelectorAll("#feature-bullets li .a-list-item, #feature-bullets li")].map(li=>li.textContent.replace(/\s+/g," ").trim()).filter(t=>t&&t.length>2&&!/^(See more|Mehr anzeigen)/i.test(t));
    const usps=[...new Set(bullets)];
    const imageUrls=igExtractImages(html,doc);
    // Preis (de/eu/us-Formate)
    const parsePrice=s=>{
      if(!s)return null;
      const mm=s.replace(/\s/g,"").match(/(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)/);
      if(!mm)return null;
      let n=mm[1];
      if(/[.,]\d{1,2}$/.test(n)){n=n.replace(/[.,](?=\d{3})/g,"").replace(",",".");}else{n=n.replace(/[.,]/g,"");}
      const v=parseFloat(n);
      return isFinite(v)&&v>0&&v<100000?Math.round(v*100)/100:null;
    };
    let priceTxt="";
    const pEl=doc.querySelector("#corePriceDisplay_desktop_feature_div .a-offscreen, #corePrice_feature_div .a-offscreen, #priceblock_ourprice, #priceblock_dealprice, #price_inside_buybox, .a-price .a-offscreen, span.a-price>span.a-offscreen");
    if(pEl)priceTxt=pEl.textContent;
    if(!priceTxt){const pm=html.match(/"priceAmount"\s*:\s*"?([0-9.,]+)/i)||html.match(/"displayPrice"\s*:\s*"([^"]+)"/i)||html.match(/class="a-offscreen">\s*([^<]*\d[^<]*)</);if(pm)priceTxt=pm[1];}
    const price=parsePrice(priceTxt);
    // Kategorie (Breadcrumb oben, sonst Bestseller-Rang-Kategorie)
    let category="";
    const crumbs=[...doc.querySelectorAll("#wayfinding-breadcrumbs_feature_div a, .a-breadcrumb a")].map(a=>a.textContent.replace(/\s+/g," ").trim()).filter(Boolean);
    if(crumbs.length)category=crumbs[0];
    if(!category){const bm=html.match(/Bestseller-Rang[\s\S]{0,140}?\bin\b\s+([A-Za-zÄÖÜäöüß &\/-]{3,40})/i)||html.match(/Best Sellers Rank[\s\S]{0,140}?\bin\b\s+([A-Za-z &\/-]{3,40})/i);if(bm)category=bm[1];}
    category=(category||"").replace(/\s+/g," ").trim().slice(0,40);
    // Review-Anzahl
    let reviews=null,rTxt="";
    const rEl=doc.querySelector("#acrCustomerReviewText, [data-hook='total-review-count']");
    if(rEl)rTxt=rEl.textContent;
    if(!rTxt){const rm=html.match(/([\d.,]+)\s*(?:Bewertungen|Sternebewertungen|ratings|global ratings|customer reviews)/i);if(rm)rTxt=rm[1];}
    if(rTxt){const rn=rTxt.replace(/[^\d]/g,"");if(rn)reviews=parseInt(rn,10);}
    return {title, usps, imageUrls, price, category, reviews};
  }
  // ── Aus Recherche-Kandidat laden (Daten kommen aus der Produktfindung) ──
  function igPopulateCands(){
    const sel=$("igCandSelect");if(!sel)return;
    const list=(window.SHResearch&&window.SHResearch.withComp&&window.SHResearch.withComp())||[];
    const cur=sel.value;
    const esch=s=>(s||"").replace(/[<>&]/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;"}[c]));
    sel.innerHTML='<option value="">– Kandidat wählen –</option>'+list.map(c=>'<option value="'+c.id+'">'+esch((c.name||"Kandidat").slice(0,70))+(c.beat?" ✨":"")+'</option>').join("");
    if(cur)sel.value=cur;
    if(!list.length){const o=document.createElement("option");o.value="";o.textContent="(noch keine analysierten Kandidaten)";sel.appendChild(o);}
  }
  (function(){const s=$("igCandSelect");if(s){s.addEventListener("focus",igPopulateCands);s.addEventListener("mousedown",igPopulateCands);}})();
  $("igLoadCandBtn").onclick=async()=>{
    igPopulateCands();
    const id=$("igCandSelect").value;
    if(!id){igToast("Bitte zuerst einen Recherche-Kandidaten wählen.",true);return;}
    const c=window.SHResearch&&window.SHResearch.byId&&window.SHResearch.byId(id);
    if(!c){igToast("Kandidat nicht gefunden.",true);return;}
    const btn=$("igLoadCandBtn");const old=btn.textContent;btn.disabled=true;btn.textContent="Lädt …";
    try{
      const t=(c.beat&&c.beat.titles&&c.beat.titles[0])||c.compTitle||c.name||"";
      if(t)$("igTitle").value=t.slice(0,250);
      const d=(c.beat&&c.beat.desc)||c.compDesc||"";
      if(d)$("igDesc").value=d;
      const u=(c.beat&&c.beat.usps&&c.beat.usps.length)?c.beat.usps:(c.compUsps||[]);
      if(u.length){usps=u.slice(0,5);while(usps.length<3)usps.push("");renderUsps();}
      let added=0;
      const urls=(c.compImages||[]).slice(0,9);
      for(const iu of urls){if(mainImgs.length>=10)break;try{mainImgs.push(await window.SHImport.fetchImageB64(iu));added++;}catch(e){}}
      renderThumbs("igThumbsMain",mainImgs);updateBadge();igUpdateCounts();updateChecklist();
      igCompetitor={title:c.compTitle||"",desc:c.compDesc||"",usps:c.compUsps||[],asin:c.compAsin||""};
      igToast("Geladen ✓ "+[t?"Titel":"",u.length?"USPs":"",added?added+" Bild(er)":""].filter(Boolean).join(" · ")+(c.beat?" · inkl. KI-Optimierung":""));
    }catch(err){
      igToast("Laden fehlgeschlagen: "+err.message,true);
    }finally{btn.disabled=false;btn.textContent=old;}
  };

  // ── Wettbewerbs-Optimierung: aus Konkurrenz-ASIN besseres Marketing ableiten ──
  const igLine=raw=>(raw||"").split(/\r?\n/).map(l=>l.replace(/^\s*(\d+[\).:]|[-*•])\s*/,"").replace(/^["'»„“]+|["'«”]+$/g,"").trim()).filter(l=>l.length>1);
  // Erkennt Überlastungs-/Rate-Limit-Antworten (auch wenn als 200-OK-Text geliefert)
  const igOverloadRe=/high demand|experiencing high demand|try again later|overloaded|over capacity|at capacity|rate.?limit|too many requests|service unavailable|temporarily unavailable|\b(503|429)\b/i;
  function igLooksOverloaded(t){const s=(t||"").trim();return s.length<400 && igOverloadRe.test(s);}
  const igSleep=ms=>new Promise(r=>setTimeout(r,ms));
  // Ein KI-Aufruf mit automatischem Retry + Backoff bei Überlastung
  async function igGenTextSafe(promptText,tries){
    tries=tries||3;let lastErr;
    for(let i=0;i<tries;i++){
      try{
        const t=await igGenText(promptText);
        if(igLooksOverloaded(t))throw new Error("Modell überlastet – bitte gleich erneut versuchen");
        return (t||"").trim();
      }catch(e){
        lastErr=e;
        if(i<tries-1)await igSleep(800*(i+1)+Math.floor(Math.random()*500));
      }
    }
    throw lastErr||new Error("KI nicht erreichbar");
  }
  // ── Fortschritts-Popup für die Konkurrenzanalyse ──
  const IG_BEAT_STEPLBL=["Konkurrenz analysieren","Bessere Titel texten","Beschreibung optimieren","Stärkere USPs ableiten","Verkaufsargumente formulieren"];
  const igBeatProg={pct:0,target:0,timer:null,n:5};
  function igBeatProgPaint(){
    const p=Math.round(igBeatProg.pct), pe=$("igBeatProgPct"), fl=$("igBeatProgFill"), pe2=$("igBeatInlinePct"), fl2=$("igBeatInlineFill");
    if(pe)pe.innerHTML=p+"&nbsp;%";
    if(fl)fl.style.width=p+"%";
    if(pe2)pe2.innerHTML=p+"&nbsp;%";
    if(fl2)fl2.style.width=p+"%";
  }
  function igBeatProgShow(){
    igBeatProg.pct=0;igBeatProg.target=5;igBeatProg.n=IG_BEAT_STEPLBL.length;
    const box=$("igBeatProgSteps");
    if(box){box.innerHTML="";IG_BEAT_STEPLBL.forEach((s,i)=>{const d=document.createElement("div");d.className="ig-prog-step";d.id="igBeatStep"+i;d.innerHTML='<span class="ig-ps-ic">✓</span><span>'+s+'</span>';box.appendChild(d);});}
    igBeatProgPaint();
    $("igBeatProg").classList.add("show");
    if(igBeatProg.timer)clearInterval(igBeatProg.timer);
    igBeatProg.timer=setInterval(()=>{
      if(igBeatProg.pct<igBeatProg.target){igBeatProg.pct=Math.min(igBeatProg.target,igBeatProg.pct+Math.max(.4,(igBeatProg.target-igBeatProg.pct)*0.07));igBeatProgPaint();}
    },110);
  }
  function igBeatProgStep(i,total){
    igBeatProg.n=total;
    for(let k=0;k<total;k++){const el=$("igBeatStep"+k);if(!el)continue;el.classList.remove("active","done");if(k<i)el.classList.add("done");else if(k===i)el.classList.add("active");}
    const si=$("igBeatInlineStep");if(si&&IG_BEAT_STEPLBL[i])si.textContent=IG_BEAT_STEPLBL[i]+" … ("+(i+1)+"/"+total+")";
    igBeatProg.pct=Math.max(igBeatProg.pct,(i/total)*100);
    igBeatProg.target=((i+0.9)/total)*100;
    igBeatProgPaint();
  }
  function igBeatProgDone(){
    for(let k=0;k<igBeatProg.n;k++){const el=$("igBeatStep"+k);if(el){el.classList.remove("active");el.classList.add("done");}}
    igBeatProg.target=100;igBeatProg.pct=100;igBeatProgPaint();
  }
  function igBeatProgHide(){
    if(igBeatProg.timer){clearInterval(igBeatProg.timer);igBeatProg.timer=null;}
    const m=$("igBeatProg");if(m)m.classList.remove("show");
  }
  // Aufrufe NACHEINANDER (statt 5 parallel) → weniger Überlastung; Teilausfälle bleiben ""
  async function igBeatCalls(ctx,lang){
    const prompts=[
      "Du bist erfahrener Amazon-Marketing-Stratege. Unten stehen die Listing-Daten eines KONKURRENZ-Produkts. Nenne 4–5 konkrete Schwächen/Lücken dieses Listings und wie man dasselbe Produkt BESSER vermarktet, um Käufer abzuwerben. Antworte in "+lang+", je Punkt eine kurze Zeile, OHNE Nummerierung, OHNE Vorrede.\n\n"+ctx,
      "Du bist Amazon-SEO-Texter. Erstelle 3 stärkere, verkaufsstärkere Amazon-Produkttitel in "+lang+", die das folgende KONKURRENZ-Produkt schlagen (mehr relevante Keywords, klarer Hauptnutzen, Vertrauen), max. ca. 180 Zeichen. Nur die 3 Titel, je Zeile, OHNE Nummerierung/Anführungszeichen.\n\n"+ctx,
      "Du bist Amazon-SEO-Texter. Schreibe EINE überzeugende, bessere Produktbeschreibung in "+lang+" als Fließtext (ca. 60–120 Wörter), die das KONKURRENZ-Produkt klar übertrifft und Vorteile/Differenzierung betont. NUR den Text, ohne Vorrede.\n\n"+ctx,
      "Du bist Amazon-SEO-Texter. Leite 5 stärkere, differenzierende USPs in "+lang+" ab, die besser sind als beim KONKURRENZ-Produkt (max. ca. 8 Wörter je USP). Je einer pro Zeile, OHNE Nummerierung/Anführungszeichen.\n\n"+ctx,
      "Du bist Amazon-Conversion-Experte. Erkläre in "+lang+" in 3–4 kurzen, konkreten Stichpunkten, WARUM das neue, optimierte Listing mehr Käufer überzeugt und zu MEHR VERKÄUFEN führt – nimm Bezug auf bessere Keyword-Sichtbarkeit, klareren Hauptnutzen, Vertrauen/Kaufbeweise und stärkeren Kaufanreiz. Je Punkt EINE kurze Zeile, OHNE Nummerierung, OHNE Vorrede.\n\n"+ctx
    ];
    const out=[];let ok=0,lastErr=null;
    for(let i=0;i<prompts.length;i++){
      const lbl=["Analyse","Titel","Beschreibung","USPs","Begründung"][i];
      try{$("igBeatStatus").textContent="… "+lbl+" ("+(i+1)+"/"+prompts.length+")";}catch(e){}
      try{igBeatProgStep(i,prompts.length);}catch(e){}
      try{const t=await igGenTextSafe(prompts[i],4);out.push(t);if(t)ok++;}
      catch(e){out.push("");lastErr=e;}
    }
    try{$("igBeatStatus").textContent="";}catch(e){}
    if(ok===0)throw lastErr||new Error("Die KI ist gerade überlastet.");
    return out;
  }
  function igFlash(el){if(!el)return;el.classList.remove("ig-flash");void el.offsetWidth;el.classList.add("ig-flash");}
  function igRevealInputs(focusId){
    try{igCollapseInputs(false);}catch(e){}
    const lay=$("igLayout");if(lay)lay.scrollIntoView({behavior:"smooth",block:"start"});
    if(focusId){const f=$(focusId);if(f)igFlash(f);}
  }
  function igRenderBeat(aLines,titles,desc,uList,whyLines){
    const ref=igCompetitor||{title:$("igTitle").value.trim(),desc:$("igDesc").value.trim(),usps:usps.filter(u=>u.trim()),asin:""};
    const esc=s=>(s||"").replace(/[<>&]/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;"}[c]));
    const body=$("igBeatBody");body.innerHTML="";

    // Einleitung
    const intro=document.createElement("div");intro.className="ig-cmp-intro";
    intro.innerHTML='Links das Listing der <b>Konkurrenz</b>'+(ref.asin?' (ASIN '+esc(ref.asin)+')':'')+', rechts dein <b style="color:var(--gn)">KI-optimiertes Marketing</b>. Klicke einen grünen Vorschlag zum Übernehmen – oder „Alles übernehmen" unten.';
    body.appendChild(intro);

    // Side-by-side Grid
    const grid=document.createElement("div");grid.className="ig-cmp";

    // ── Spalte A: Konkurrenz (Original) ──
    const colA=document.createElement("div");colA.className="ig-cmp-col";
    colA.innerHTML='<div class="ig-cmp-head">🅰 Konkurrenz<span class="ig-cmp-tag">ORIGINAL</span></div>'+
      '<div class="ig-cmp-body">'+
        '<div class="ig-cmp-block"><div class="ig-cmp-lbl">🏷️ Titel</div><div class="ig-cmp-val">'+(esc(ref.title)||'—')+'</div></div>'+
        '<div class="ig-cmp-block"><div class="ig-cmp-lbl">📝 Beschreibung</div><div class="ig-cmp-val">'+(esc(ref.desc)||'—')+'</div></div>'+
        '<div class="ig-cmp-block"><div class="ig-cmp-lbl">⭐ USPs</div>'+((ref.usps&&ref.usps.length)?'<ul class="ig-cmp-usplist">'+ref.usps.map(u=>'<li>'+esc(u)+'</li>').join('')+'</ul>':'<div class="ig-cmp-val">—</div>')+'</div>'+
      '</div>';
    grid.appendChild(colA);

    // ── Spalte B: Dein optimiertes Marketing ──
    const colB=document.createElement("div");colB.className="ig-cmp-col win";
    const headB=document.createElement("div");headB.className="ig-cmp-head";headB.innerHTML='🅱 Dein Marketing&nbsp;✨<span class="ig-cmp-tag">OPTIMIERT</span>';
    const bodyB=document.createElement("div");bodyB.className="ig-cmp-body";
    colB.appendChild(headB);colB.appendChild(bodyB);

    // Titel
    const tBlock=document.createElement("div");tBlock.className="ig-cmp-block";
    tBlock.innerHTML='<div class="ig-cmp-lbl">🏷️ Bessere Titel</div>';
    titles.forEach((t,i)=>{
      const b=document.createElement("button");b.type="button";b.className="ig-cmp-pick";
      const tx=document.createElement("span");tx.textContent=t;b.appendChild(tx);
      const h=document.createElement("span");h.className="ig-cmp-pickhint";h.textContent=(i===0?"★ Empfohlen · klicken zum Übernehmen":"klicken zum Übernehmen");b.appendChild(h);
      b.onclick=()=>{$("igTitle").value=t.slice(0,250);igUpdateCounts();updateChecklist();igRevealInputs("igTitle");igToast("Titel übernommen ✓");};
      tBlock.appendChild(b);
    });
    if(!titles.length)tBlock.insertAdjacentHTML("beforeend",'<div class="ig-cmp-val">—</div>');
    bodyB.appendChild(tBlock);

    // Beschreibung
    const dBlock=document.createElement("div");dBlock.className="ig-cmp-block";
    dBlock.innerHTML='<div class="ig-cmp-lbl">📝 Bessere Beschreibung</div>';
    if(desc){
      const dv=document.createElement("div");dv.className="ig-cmp-val";dv.textContent=desc;dBlock.appendChild(dv);
      const tb=document.createElement("button");tb.type="button";tb.className="ig-cmp-take";tb.textContent="Übernehmen";
      tb.onclick=()=>{$("igDesc").value=desc;igUpdateCounts();updateChecklist();igRevealInputs("igDesc");igToast("Beschreibung übernommen ✓");};
      dBlock.appendChild(tb);
    }else dBlock.insertAdjacentHTML("beforeend",'<div class="ig-cmp-val">—</div>');
    bodyB.appendChild(dBlock);

    // USPs
    const uBlock=document.createElement("div");uBlock.className="ig-cmp-block";
    uBlock.innerHTML='<div class="ig-cmp-lbl">⭐ Bessere USPs</div>';
    if(uList.length){
      const ul=document.createElement("ul");ul.className="ig-cmp-usplist";
      uList.forEach(u=>{const li=document.createElement("li");li.textContent=u;ul.appendChild(li);});
      uBlock.appendChild(ul);
      const tb=document.createElement("button");tb.type="button";tb.className="ig-cmp-take";tb.textContent="Alle USPs übernehmen";
      tb.onclick=()=>{usps=uList.slice();while(usps.length<3)usps.push("");renderUsps();igUpdateCounts();updateChecklist();igRevealInputs("igUspList");igToast("USPs übernommen ✓");};
      uBlock.appendChild(tb);
    }else uBlock.insertAdjacentHTML("beforeend",'<div class="ig-cmp-val">—</div>');
    bodyB.appendChild(uBlock);

    grid.appendChild(colB);
    body.appendChild(grid);

    // ── Warum verkauft das mehr? ──
    if(whyLines&&whyLines.length){
      const why=document.createElement("div");why.className="ig-why";
      why.innerHTML='<h4>💡 Warum dieses Marketing mehr verkauft</h4><ul></ul>';
      const ul=why.querySelector("ul");whyLines.forEach(l=>{const li=document.createElement("li");li.textContent=l;ul.appendChild(li);});
      body.appendChild(why);
    }

    // ── Schwächen der Konkurrenz (einklappbar) ──
    if(aLines.length){
      const det=document.createElement("details");det.className="ig-adv";det.style.marginTop="14px";
      det.innerHTML='<summary>⚔️ Schwächen der Konkurrenz ('+aLines.length+')</summary>';
      const ul=document.createElement("ul");ul.style.cssText="margin:8px 0 4px;padding-left:20px";
      aLines.forEach(l=>{const li=document.createElement("li");li.style.cssText="font-size:12.5px;line-height:1.45;margin:5px 0;color:var(--tx2)";li.textContent=l;ul.appendChild(li);});
      det.appendChild(ul);body.appendChild(det);
    }

    // ── Alles übernehmen ──
    const all=document.createElement("button");all.type="button";all.className="ig-beat-apply-all";all.textContent="✅ Alles übernehmen (bester Titel + Beschreibung + USPs)";
    all.onclick=()=>{
      const applied=[];
      if(titles[0]){$("igTitle").value=titles[0].slice(0,250);applied.push("Titel");}
      if(desc){$("igDesc").value=desc;applied.push("Beschreibung");}
      if(uList.length){usps=uList.slice();while(usps.length<3)usps.push("");renderUsps();applied.push(uList.length+" USPs");}
      igUpdateCounts();updateChecklist();
      if(!applied.length){igToast("Es gibt noch keine optimierten Inhalte zum Übernehmen – bitte zuerst neu generieren.",true);return;}
      igRevealInputs();
      if(titles[0])igFlash($("igTitle"));
      if(desc)igFlash($("igDesc"));
      if(uList.length)igFlash($("igUspList"));
      $("igBeatStatus").textContent="✓ übernommen";
      igToast("Übernommen: "+applied.join(" · ")+" ✓");
    };
    body.appendChild(all);
  }
  async function igBeatCompetitor(){
    const ref=igCompetitor||{title:$("igTitle").value.trim(),desc:$("igDesc").value.trim(),usps:usps.filter(u=>u.trim())};
    if(!ref.title && !ref.desc){igToast("Bitte zuerst eine Konkurrenz-ASIN importieren.",true);return;}
    const lang=$("igLang").value, btn=$("igBeatBtn"), old=btn.textContent;
    btn.disabled=true;btn.textContent="… KI analysiert";
    $("igBeatCard").style.display="block";$("igBeatStatus").textContent="";
    $("igBeatBody").innerHTML='<div class="ig-beat-wait"><div class="ig-beat-wait-top"><div class="ig-spin"></div><span>Konkurrenz vs. dein optimiertes Marketing wird erstellt …</span></div><div class="ig-prog-pct" id="igBeatInlinePct">0&nbsp;%</div><div class="ig-prog-bar"><div class="ig-prog-fill" id="igBeatInlineFill"></div></div><div class="ig-beat-wait-step" id="igBeatInlineStep">Konkurrenz analysieren …</div></div>';
    $("igBeatCard").scrollIntoView({behavior:"smooth",block:"start"});
    igBeatProgShow();
    const ctx="KONKURRENZ-Titel: "+(ref.title||"—")+"\nKONKURRENZ-Beschreibung: "+(ref.desc||"—")+"\nKONKURRENZ-USPs:\n"+((ref.usps&&ref.usps.length)?ref.usps.map(u=>"- "+u).join("\n"):"—");
    try{
      const r=await igBeatCalls(ctx,lang);
      igBeatProgDone();await igSleep(480);
      const pTitles=igLine(r[1]).slice(0,3);
      const pDesc=(r[2]||"").trim().replace(/^["'»„“]+|["'«”]+$/g,"").trim();
      const pUsps=igLine(r[3]).slice(0,5);
      // Kern-Optimierung (Titel/Beschreibung/USPs) komplett leer → nicht als Erfolg rendern
      if(!pTitles.length && !pDesc && !pUsps.length){
        const e=new Error("Die KI hat gerade keine optimierten Inhalte geliefert (vermutlich kurz überlastet). Bitte erneut versuchen.");e.emptyCore=true;throw e;
      }
      igRenderBeat(igLine(r[0]).slice(0,6), pTitles, pDesc, pUsps, igLine(r[4]).slice(0,5));
    }catch(err){
      const over=(err&&err.emptyCore) || igOverloadRe.test(err&&err.message||"");
      const msg=over?"Die KI ist gerade überlastet (hohe Nachfrage). Das ist meist nur kurz – bitte in ein paar Sekunden erneut versuchen.":("Konnte das Marketing nicht erzeugen: "+(err&&err.message||"Unbekannter Fehler"));
      $("igBeatBody").innerHTML='';
      const box=document.createElement("div");box.className="ig-sug-err";box.style.cssText="display:flex;flex-direction:column;gap:10px;align-items:flex-start";
      const p=document.createElement("div");p.textContent=(over?"⏳ ":"⚠️ ")+msg;box.appendChild(p);
      const rb=document.createElement("button");rb.type="button";rb.className="ig-cmp-take";rb.style.background="var(--pu)";rb.textContent="🔄 Nochmal versuchen";rb.onclick=igBeatCompetitor;box.appendChild(rb);
      const tip=document.createElement("div");tip.style.cssText="font-size:11.5px;color:var(--tx3)";tip.innerHTML='Tipp: Mit einem eigenen <b>Gemini-API-Key</b> (unten unter „Erweitert") ist die KI deutlich stabiler als der kostenlose Test-Dienst.';box.appendChild(tip);
      $("igBeatBody").appendChild(box);
      if(over)igPromptKeyOnOverload();
    }finally{igBeatProgHide();btn.disabled=false;btn.textContent=old;}
  }
  // Hinweis: Der frühere "Vergleichen & besser vermarkten"-Button lebt jetzt in der
  // Produktfindung (researchBeatCandidate). igBeatCompetitor/igRenderBeat bleiben ungenutzt.

  // ── KI-Titel-Verbesserung (Schritt 1) ──
  async function igGenText(promptText){
    // Stufe 0: Cloud-Proxy (SellerHub-Konto) – der Gemini-Key bleibt auf dem Server
    const tok=igSyToken();
    if(tok){
      try{
        const res=await fetch(igApi()+"/api/ai/text",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+tok},body:JSON.stringify({prompt:promptText})});
        if(res.ok){
          const d=await res.json();
          if(d && d.text)return d.text;
          console.warn("KI-Proxy (Text): leere Antwort – nutze Fallback-Kette.");
        }else igProxyWarn("Text",res.status);
      }catch(e){console.warn("KI-Proxy (Text) nicht erreichbar – nutze Fallback-Kette.",e);}
    }
    const key=($("igApikey").value||localStorage.getItem("gemini_key")||"").trim();
    if(key){
      const ep="https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key="+encodeURIComponent(key);
      const res=await fetch(ep,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contents:[{parts:[{text:promptText}]}]})});
      if(!res.ok){let m="HTTP "+res.status;try{m=(await res.json()).error?.message||m;}catch(e){}throw new Error(m);}
      const data=await res.json();
      const t=(data.candidates?.[0]?.content?.parts||[]).map(p=>p.text).filter(Boolean).join("\n");
      if(!t)throw new Error("Keine Antwort von Gemini erhalten");
      return t;
    }
    return await igPollinations(promptText);
  }
  window.igGenText=igGenText;
  // Kostenloser Fallback ohne Key: zuerst zuverlässiger POST-Chat-Endpoint, dann GET als Fallback
  async function igPollinations(promptText){
    const seed=Math.floor(Math.random()*1e6);
    try{
      const res=await fetch("https://text.pollinations.ai/openai",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"openai",seed:seed,referrer:"sellerhub",messages:[{role:"user",content:promptText}]})
      });
      if(res.ok){
        const ct=res.headers.get("content-type")||"";
        if(ct.indexOf("application/json")>-1){const j=await res.json();const t=j&&j.choices&&j.choices[0]&&j.choices[0].message&&j.choices[0].message.content;if(t&&t.trim())return t;}
        else{const t=await res.text();if(t&&t.trim())return t;}
      }
    }catch(e){/* POST fehlgeschlagen → GET-Fallback */}
    const res=await fetch("https://text.pollinations.ai/"+encodeURIComponent(promptText)+"?model=openai&referrer=sellerhub&seed="+seed);
    if(!res.ok)throw new Error("Text-KI nicht erreichbar ("+res.status+")");
    const t=await res.text();
    if(!t||!t.trim())throw new Error("Leere Antwort der Text-KI");
    return t;
  }
  // ── Geteilte Engine für die Produktfindung (Konkurrenz-Analyse aus ASIN/Link) ──
  // Liefert reine Daten zurück (keine DOM-Seiteneffekte), damit der Recherche-Bereich sie nutzen kann.
  // Find the REAL top product on Amazon for a search term → canonical /dp/ link (or null)
  async function igResolveTop(name,tld){
    tld=tld||"de";
    const q="https://www.amazon."+tld+"/s?k="+encodeURIComponent((name||"").replace(/[*_`#]/g,"").trim());
    let html=null;
    try{html=await igFetchRawProxy(q);}catch(e){}
    if(!html||html.length<2000){try{html=await igFetchVia(q);}catch(e){}}
    if(!html)return null;
    // Collect candidate ASINs in document order (search results carry data-asin="B0…")
    const asins=[],seen={};let m;
    const reData=/data-asin="(B0[A-Z0-9]{8})"/gi;
    while((m=reData.exec(html))){const a=m[1].toUpperCase();if(!seen[a]){seen[a]=1;asins.push(a);}}
    if(!asins.length){const reDp=/\/dp\/(B0[A-Z0-9]{8})/gi;while((m=reDp.exec(html))){const a=m[1].toUpperCase();if(!seen[a]){seen[a]=1;asins.push(a);}}}
    // Return the first whose product image really exists (skips junk/placeholder ASINs)
    for(const a of asins.slice(0,8)){
      try{if(typeof asinHasImage==="function"?await asinHasImage(a):true)return "https://www.amazon."+tld+"/dp/"+a;}catch(e){}
    }
    return null;
  }
  window.SHImport={
    asin:igAsin, tld:igTld, fetchImageB64:igFetchImageB64, resolveTop:igResolveTop,
    async fetchListing(raw){
      raw=(raw||"").trim();
      const asin=igAsin(raw);
      if(!/amazon\./i.test(raw) && !asin) throw new Error("Bitte einen Amazon-Link oder eine 10-stellige ASIN angeben.");
      const target=asin?("https://www.amazon."+(/amazon\./i.test(raw)?igTld(raw):"de")+"/dp/"+asin):raw;
      // Stufe 0: eigenes Backend (nur mit Cloud-Session) — liefert dieselbe Ergebnis-Form wie die Proxy-Kette
      const be=await igBackendImport(asin||raw);
      if(be){
        const bUsps=[...new Set((be.bullets||[]).map(b=>String(b||"").replace(/\s+/g," ").trim()).filter(Boolean))];
        return {title:(be.title||"").replace(/\s+/g," ").trim(), desc:be.description||bUsps.join(" "), usps:bUsps.slice(0,5).map(b=>b.length>70?b.slice(0,70):b), imageUrls:(be.images||[]).slice(0,9), asin:be.asin||asin||"", price:(be.price!=null?be.price:null), category:"", reviews:null, blocked:false};
      }
      const html=await igFetchVia(target);
      const blocked=/Robot Check|Geben Sie die angezeigten Zeichen|automated access|api-services-support@amazon|To discuss automated/i.test(html) && !/id="productTitle"/.test(html);
      let r=igParseListing(html);
      // jina.ai liefert oft KEIN Preis/Kategorie/Reviews/komplette Galerie → rohes Amazon-HTML nachladen und Lücken füllen
      if(!r.price || !r.category || r.reviews==null || r.imageUrls.length<2){
        try{
          const rawHtml=await igFetchRawProxy(target);
          if(rawHtml){
            const r2=igParseListing(rawHtml);
            if(!r.title && r2.title)r.title=r2.title;
            if(!r.usps.length && r2.usps.length)r.usps=r2.usps;
            if(!r.price && r2.price)r.price=r2.price;
            if(!r.category && r2.category)r.category=r2.category;
            if(r.reviews==null && r2.reviews!=null)r.reviews=r2.reviews;
            const seen=new Set(r.imageUrls);for(const u of r2.imageUrls){if(!seen.has(u)){seen.add(u);r.imageUrls.push(u);}}
          }
        }catch(e){}
      }
      return {title:r.title, desc:r.usps.join(" "), usps:r.usps.slice(0,5).map(b=>b.length>70?b.slice(0,70):b), imageUrls:r.imageUrls.slice(0,9), asin:asin||"", price:r.price, category:r.category, reviews:r.reviews, blocked};
    },
    async beat(ref, lang, onStep){
      lang=lang||"Deutsch";
      const ctx="KONKURRENZ-Titel: "+(ref.title||"—")+"\nKONKURRENZ-Beschreibung: "+(ref.desc||"—")+"\nKONKURRENZ-USPs:\n"+((ref.usps&&ref.usps.length)?ref.usps.map(u=>"- "+u).join("\n"):"—");
      const prompts=[
        "Du bist erfahrener Amazon-Marketing-Stratege. Unten stehen die Listing-Daten eines KONKURRENZ-Produkts. Nenne 4–5 konkrete Schwächen/Lücken dieses Listings und wie man dasselbe Produkt BESSER vermarktet, um Käufer abzuwerben. Antworte in "+lang+", je Punkt eine kurze Zeile, OHNE Nummerierung, OHNE Vorrede.\n\n"+ctx,
        "Du bist Amazon-SEO-Texter. Erstelle 3 stärkere, verkaufsstärkere Amazon-Produkttitel in "+lang+", die das folgende KONKURRENZ-Produkt schlagen (mehr relevante Keywords, klarer Hauptnutzen, Vertrauen), max. ca. 180 Zeichen. Nur die 3 Titel, je Zeile, OHNE Nummerierung/Anführungszeichen.\n\n"+ctx,
        "Du bist Amazon-SEO-Texter. Schreibe EINE überzeugende, bessere Produktbeschreibung in "+lang+" als Fließtext (ca. 60–120 Wörter), die das KONKURRENZ-Produkt klar übertrifft und Vorteile/Differenzierung betont. NUR den Text, ohne Vorrede.\n\n"+ctx,
        "Du bist Amazon-SEO-Texter. Leite 5 stärkere, differenzierende USPs in "+lang+" ab, die besser sind als beim KONKURRENZ-Produkt (max. ca. 8 Wörter je USP). Je einer pro Zeile, OHNE Nummerierung/Anführungszeichen.\n\n"+ctx,
        "Du bist Amazon-Conversion-Experte. Erkläre in "+lang+" in 3–4 kurzen, konkreten Stichpunkten, WARUM das neue, optimierte Listing mehr Käufer überzeugt und zu MEHR VERKÄUFEN führt – bessere Keyword-Sichtbarkeit, klarerer Hauptnutzen, Vertrauen/Kaufbeweise, stärkerer Kaufanreiz. Je Punkt EINE kurze Zeile, OHNE Nummerierung, OHNE Vorrede.\n\n"+ctx
      ];
      const labels=["Konkurrenz analysieren","Bessere Titel texten","Beschreibung optimieren","Stärkere USPs ableiten","Verkaufsargumente formulieren"];
      const out=[];let ok=0,lastErr=null;
      for(let i=0;i<prompts.length;i++){
        if(onStep){try{onStep(i,prompts.length,labels[i]);}catch(e){}}
        try{const t=await igGenTextSafe(prompts[i],4);out.push(t);if(t)ok++;}catch(e){out.push("");lastErr=e;}
        if(onStep){try{onStep(i+1,prompts.length,labels[i]);}catch(e){}}
      }
      if(ok===0)throw lastErr||new Error("Die KI ist gerade überlastet.");
      const clean=s=>(s||"").trim().replace(/^["'»„“]+|["'«”]+$/g,"").trim();
      return {
        weaknesses:igLine(out[0]).slice(0,6),
        titles:igLine(out[1]).slice(0,3),
        desc:clean(out[2]),
        usps:igLine(out[3]).slice(0,5),
        why:igLine(out[4]).slice(0,5)
      };
    },
    async ask(prompt){ return await igGenTextSafe(prompt,4); }
  };
  function igParseTitles(raw){
    raw=(raw||"").trim();
    try{const j=JSON.parse(raw);if(Array.isArray(j))return j.map(String).map(s=>s.trim()).filter(Boolean).slice(0,3);}catch(e){}
    return raw.split(/\r?\n/).map(l=>l.replace(/^\s*(\d+[\).:\-]|[-*•])\s*/,"").replace(/^["'»„“]+|["'«”]+$/g,"").trim()).filter(l=>l.length>2).slice(0,3);
  }
  async function igSuggestTitles(){
    const title=$("igTitle").value.trim();
    if(!title){igToast("Bitte zuerst einen Produkttitel eingeben.",true);$("igTitle").focus();return;}
    const lang=$("igLang").value, desc=$("igDesc").value.trim();
    const uspTxt=usps.filter(u=>u.trim()).map(u=>"- "+u.trim()).join("\n");
    const box=$("igTitleSuggest"), btn=$("igTitleAi");
    box.innerHTML='<div class="ig-sug-spin"><div class="ig-spin"></div> KI optimiert deinen Titel …</div>';
    btn.disabled=true;
    const prompt="Du bist ein erfahrener Amazon-SEO-Texter. Optimiere den folgenden Produkttitel für ein Amazon-Listing in der Sprache "+lang+".\n\nGib GENAU 3 verbesserte, verkaufsstarke Titel zurück – jeweils in einer eigenen Zeile, OHNE Nummerierung, OHNE Anführungszeichen, OHNE weitere Erklärung. Jeder Titel max. ca. 180 Zeichen, mit den wichtigsten Keywords, dem Hauptnutzen und relevanten Eigenschaften weit vorne. Erfinde keine Fakten.\n\nAktueller Titel: "+title+(desc?"\n\nBeschreibung: "+desc:"")+(uspTxt?"\n\nUSPs:\n"+uspTxt:"");
    try{
      const raw=await igGenTextSafe(prompt,3); // Retry + Backoff bei Überlast
      const titles=igParseTitles(raw);
      if(!titles.length)throw new Error("Keine Vorschläge erhalten – bitte erneut versuchen.");
      box.innerHTML='<div class="ig-sug-head">✨ KI-Vorschläge – zum Übernehmen anklicken</div>';
      titles.forEach(t=>{
        const d=document.createElement("div");d.className="ig-sug";
        d.innerHTML='<span class="ig-sug-txt"></span><span class="ig-sug-take">Übernehmen</span>';
        d.querySelector(".ig-sug-txt").textContent=t;
        d.onclick=()=>{$("igTitle").value=t;updateChecklist();box.innerHTML="";igToast("Titel übernommen ✓");};
        box.appendChild(d);
      });
    }catch(err){
      igSugErr(box,err);
    }finally{ btn.disabled=false; }
  }
  $("igTitleAi").onclick=igSuggestTitles;

  // ── KI-Beschreibung verbessern/erstellen (Schritt 2) ──
  async function igSuggestDesc(){
    const title=$("igTitle").value.trim(), cur=$("igDesc").value.trim(), lang=$("igLang").value;
    if(!title && !cur){igToast("Bitte zuerst einen Produkttitel oder eine Beschreibung eingeben.",true);$("igDesc").focus();return;}
    const uspTxt=usps.filter(u=>u.trim()).map(u=>"- "+u.trim()).join("\n");
    const box=$("igDescSuggest"), btn=$("igDescAi");
    box.innerHTML='<div class="ig-sug-spin"><div class="ig-spin"></div> KI schreibt deine Beschreibung …</div>';
    btn.disabled=true;
    const prompt="Du bist ein erfahrener Amazon-SEO-Texter. "+(cur?"Verbessere":"Erstelle")+" eine überzeugende, gut lesbare Produktbeschreibung in der Sprache "+lang+".\n\nSchreibe verkaufsstarken FLIESSTEXT (ca. 60–120 Wörter), der den Hauptnutzen und die Alleinstellungsmerkmale hervorhebt und zum Kauf motiviert. KEINE Aufzählungszeichen, KEINE Überschrift, KEINE Vorrede – gib NUR den reinen Beschreibungstext zurück. Erfinde keine Fakten.\n\nProdukttitel: "+title+(cur?"\n\nAktuelle Beschreibung: "+cur:"")+(uspTxt?"\n\nUSPs:\n"+uspTxt:"");
    try{
      let raw=await igGenTextSafe(prompt,3); // Retry + Backoff bei Überlast
      raw=(raw||"").trim().replace(/^["'»„“]+|["'«”]+$/g,"").trim();
      if(!raw)throw new Error("Keine Beschreibung erhalten – bitte erneut versuchen.");
      box.innerHTML='<div class="ig-sug-head">✨ KI-Vorschlag</div>';
      const d=document.createElement("div");d.className="ig-sug ig-sug-block";
      d.innerHTML='<div class="ig-sug-txt"></div><div class="ig-sug-actions"><button type="button" class="ig-d-take">Übernehmen</button><button type="button" class="ig-d-redo">↻ Neu</button></div>';
      d.querySelector(".ig-sug-txt").textContent=raw;
      d.querySelector(".ig-d-take").onclick=()=>{$("igDesc").value=raw;updateChecklist();box.innerHTML="";igToast("Beschreibung übernommen ✓");};
      d.querySelector(".ig-d-redo").onclick=igSuggestDesc;
      box.appendChild(d);
    }catch(err){
      igSugErr(box,err);
    }finally{ btn.disabled=false; }
  }
  $("igDescAi").onclick=igSuggestDesc;

  // ── KI-USP-Vorschläge aus Titel + Beschreibung (Schritt 3) ──
  function igAddUsp(text){
    if(usps.some(u=>u.trim().toLowerCase()===text.trim().toLowerCase()))return;
    const empty=usps.findIndex(u=>!u.trim());
    if(empty>-1)usps[empty]=text; else usps.push(text);
    renderUsps();updateChecklist();
  }
  function igRenderUspSuggest(list){
    const box=$("igUspSuggest");box.innerHTML="";
    const head=document.createElement("div");head.className="ig-sug-head";
    const lbl=document.createElement("span");lbl.textContent="✨ Vorschläge – einzeln anklicken oder alle übernehmen";
    const all=document.createElement("button");all.type="button";all.className="ig-d-take";all.style.marginLeft="auto";all.textContent="Alle übernehmen";
    all.onclick=()=>{usps=list.slice();while(usps.length<3)usps.push("");renderUsps();updateChecklist();box.innerHTML="";igToast("USPs übernommen ✓");};
    head.appendChild(lbl);head.appendChild(all);box.appendChild(head);
    const wrap=document.createElement("div");wrap.className="ig-chips";
    list.forEach(u=>{
      const c=document.createElement("button");c.type="button";c.className="ig-chip";
      const plus=document.createElement("span");plus.className="ig-chip-plus";plus.textContent="＋";
      const txt=document.createElement("span");txt.textContent=u;
      c.appendChild(plus);c.appendChild(txt);
      c.onclick=()=>{if(c.classList.contains("added"))return;igAddUsp(u);c.classList.add("added");plus.textContent="✓";};
      wrap.appendChild(c);
    });
    box.appendChild(wrap);
  }
  async function igSuggestUsps(){
    const title=$("igTitle").value.trim(), desc=$("igDesc").value.trim(), lang=$("igLang").value;
    if(!title && !desc){igToast("Bitte zuerst Titel oder Beschreibung eingeben.",true);return;}
    const have=usps.filter(u=>u.trim());
    const box=$("igUspSuggest"), btn=$("igUspAi");
    box.innerHTML='<div class="ig-sug-spin"><div class="ig-spin"></div> KI leitet passende USPs ab …</div>';
    btn.disabled=true;
    const prompt="Du bist ein erfahrener Amazon-SEO-Texter. Leite aus dem folgenden Produkt 5 prägnante, verkaufsstarke USPs / Alleinstellungsmerkmale in der Sprache "+lang+" ab.\n\nJeder USP KURZ (max. ca. 8 Wörter), je ein USP pro Zeile, OHNE Nummerierung, OHNE Anführungszeichen, OHNE Erklärung. Erfinde keine Fakten.\n\nProdukttitel: "+title+(desc?"\n\nBeschreibung: "+desc:"")+(have.length?"\n\nBereits vorhanden (nicht wiederholen):\n"+have.map(u=>"- "+u).join("\n"):"");
    try{
      const raw=await igGenTextSafe(prompt,3); // Retry + Backoff bei Überlast
      const list=(raw||"").split(/\r?\n/).map(l=>l.replace(/^\s*(\d+[\).:\-]|[-*•])\s*/,"").replace(/^["'»„“]+|["'«”]+$/g,"").trim()).filter(l=>l.length>1).slice(0,6);
      if(!list.length)throw new Error("Keine USPs erhalten – bitte erneut versuchen.");
      igRenderUspSuggest(list);
    }catch(err){
      igSugErr(box,err);
    }finally{ btn.disabled=false; }
  }
  $("igUspAi").onclick=igSuggestUsps;

  function igSetResult(nm,url){const ex=igLastResults.find(r=>r.nm===nm);if(ex){ex.url=url;}else{igLastResults.push({nm:nm,url:url});}}
  function igCollapseInputs(collapse){const lay=$("igLayout");if(lay)lay.style.display=collapse?"none":"";$("igToggleInputs").textContent=collapse?"⚙ Eingaben anzeigen":"⚙ Eingaben ausblenden";}
  $("igToggleInputs").onclick=()=>{const lay=$("igLayout");igCollapseInputs(lay.style.display!=="none");};

  // ── Generischer Fortschritts-Controller (Bild-Generierung) ──
  function igMkProg(rootId,pctId,fillId,stepsId,labels){
    const st={pct:0,target:0,timer:null,n:labels.length};
    const paint=()=>{const p=Math.round(st.pct),pe=$(pctId),fl=$(fillId);if(pe)pe.innerHTML=p+"&nbsp;%";if(fl)fl.style.width=p+"%";};
    const box=$(stepsId);
    if(box){box.innerHTML="";labels.forEach((s,i)=>{const d=document.createElement("div");d.className="ig-prog-step";d.id=stepsId+"-s"+i;d.innerHTML='<span class="ig-ps-ic">✓</span><span>'+s+'</span>';box.appendChild(d);});}
    st.show=()=>{st.pct=0;st.target=(100/Math.max(1,st.n))*0.85;paint();const m=$(rootId);if(m)m.classList.add("show");if(st.timer)clearInterval(st.timer);st.timer=setInterval(()=>{if(st.pct<st.target){st.pct=Math.min(st.target,st.pct+Math.max(.25,(st.target-st.pct)*0.05));paint();}},130);};
    st.step=(i)=>{for(let k=0;k<st.n;k++){const el=$(stepsId+"-s"+k);if(!el)continue;el.classList.remove("active","done");if(k<i)el.classList.add("done");else if(k===i)el.classList.add("active");}st.pct=Math.max(st.pct,(i/st.n)*100);st.target=((i+0.85)/st.n)*100;paint();};
    st.mark=(i,okFlag)=>{const el=$(stepsId+"-s"+i);if(el){el.classList.remove("active");el.classList.add("done");if(!okFlag)el.classList.add("fail");}st.pct=Math.max(st.pct,((i+1)/st.n)*100);paint();};
    st.done=()=>{for(let k=0;k<st.n;k++){const el=$(stepsId+"-s"+k);if(el){el.classList.remove("active");el.classList.add("done");}}st.target=100;st.pct=100;paint();};
    st.hide=()=>{if(st.timer){clearInterval(st.timer);st.timer=null;}const m=$(rootId);if(m)m.classList.remove("show");};
    return st;
  }
  let igGenProgCtl=null;

  // ── Hauptbild hart auf 1:1 bringen (Amazon-Anforderung): zentrierter Canvas-Crop,
  //    kürzere Seite = Maß. Quadratische Bilder bleiben unverändert (Original-URL). ──
  function igCropSquare(url){
    return new Promise(resolve=>{
      const img=new Image();img.crossOrigin="anonymous";
      img.onload=()=>{
        const w=img.naturalWidth,h=img.naturalHeight;
        if(!w||!h||w===h){resolve(url);return;} // schon quadratisch → nichts tun
        const s=Math.min(w,h),c=document.createElement("canvas");c.width=s;c.height=s;
        try{
          c.getContext("2d").drawImage(img,(w-s)/2,(h-s)/2,s,s,0,0,s,s);
          resolve(c.toDataURL("image/png"));
        }catch(e){resolve(url);} // z. B. CORS-tainted Canvas → Original behalten
      };
      img.onerror=()=>resolve(url);
      img.src=url;
    });
  }
  window.igCropSquare=igCropSquare; // extern aufrufbar (auch für Tests)

  async function igGenerateOneInto(el,v,i){
    const ph=el.querySelector(".ig-ph"), st=el.querySelector(".st"), act=el.querySelector(".ig-res-actions");
    ph.innerHTML='<div class="ig-spin"></div>';st.textContent="…";if(act)act.style.visibility="hidden";
    try{
      const o={title:igCtx.title,desc:igCtx.desc,uspTxt:igCtx.uspTxt,usps:igCtx.uspsArr||[],lang:igCtx.lang,imgCount:igCtx.imgs.length,hasPack:igCtx.hasPack,hasUse:igCtx.hasUse};
      let url;
      if(igCtx.provider==="gemini"){
        try{url=await generateOne(buildPrompt(v,o),igCtx.imgs,igCtx.key);}
        catch(err){
          if(igCtx.key)throw err; // eigener Key → Fehler wie bisher anzeigen
          // Ohne eigenen Key (Cloud-Proxy fehlgeschlagen) → Pollinations-Fallback
          console.warn("Cloud-KI (Bild) fehlgeschlagen – Fallback auf Pollinations:",err&&err.message);
          url=await generatePollinations(v,{title:igCtx.title,desc:igCtx.desc,uspTxt:igCtx.uspTxt,usps:igCtx.uspsArr||[],lang:igCtx.lang},i);
        }
      }else{
        url=await generatePollinations(v,{title:igCtx.title,desc:igCtx.desc,uspTxt:igCtx.uspTxt,usps:igCtx.uspsArr||[],lang:igCtx.lang},i);
      }
      if(v.key==="main")url=await igCropSquare(url); // NUR Hauptbild: garantiert exakt 1:1
      ph.innerHTML='<img src="'+url+'">';st.textContent="✓";el._url=url;if(act)act.style.visibility="visible";
      igSetResult(v.nm,url);return true;
    }catch(err){
      ph.innerHTML='<div style="font-size:30px;opacity:.4">⚠️</div>';st.textContent="Fehler";el._url=null;
      const e=document.createElement("div");e.className="ig-reserr";e.textContent=err.message;ph.appendChild(e);
      igSetResult(v.nm,null);return false;
    }
  }
  function igMakeResultCard(v,i){
    const el=document.createElement("div");el.className="ig-rescard";
    el.innerHTML='<div class="ig-ph"><div class="ig-spin"></div></div><div class="ig-cap"><span class="nm"></span><span class="st">…</span></div><div class="ig-res-actions" style="visibility:hidden"><button class="ig-res-btn" title="Neu generieren">↻</button><button class="ig-res-btn" title="Herunterladen">⬇</button><button class="ig-res-btn" title="Groß ansehen">🔍</button></div>';
    el.querySelector(".nm").textContent=v.nm;
    const b=el.querySelectorAll(".ig-res-btn");
    b[0].onclick=()=>igGenerateOneInto(el,v,i);
    b[1].onclick=()=>{if(el._url){const a=document.createElement("a");a.href=el._url;a.download=slug(v.nm)+".png";document.body.appendChild(a);a.click();a.remove();}};
    b[2].onclick=()=>{if(el._url)igOpenLightbox(el,v,i);};
    return {el:el,v:v,i:i};
  }
  function igOpenLightbox(el,v,i){igLbRef={el:el,v:v,i:i};$("igLbImg").src=el._url||"";$("igLbTitle").textContent=v.nm;$("igLightbox").classList.add("show");}
  $("igLbClose").onclick=()=>$("igLightbox").classList.remove("show");
  $("igLightbox").onclick=e=>{if(e.target===$("igLightbox"))$("igLightbox").classList.remove("show");};
  $("igLbDownload").onclick=()=>{if(igLbRef&&igLbRef.el._url){const a=document.createElement("a");a.href=igLbRef.el._url;a.download=slug(igLbRef.v.nm)+".png";document.body.appendChild(a);a.click();a.remove();}};
  $("igLbRegen").onclick=async()=>{if(!igLbRef)return;await igGenerateOneInto(igLbRef.el,igLbRef.v,igLbRef.i);if(igLbRef.el._url)$("igLbImg").src=igLbRef.el._url;};

  $("igGenBtn").onclick=async()=>{
    const provider=$("igProvider").value;
    const key=$("igApikey").value.trim();
    if(provider==="gemini" && !key && !igSyToken()){igToast("Bitte Gemini API-Key eingeben (⚙️ unten im Panel).",true);$("igKeyBox").open=true;return;}
    if(provider==="pollinations" && mainImgs.length>0){
      if(!confirm("Achtung: Im Pollinations-Vorschaumodus werden deine hochgeladenen Produktfotos NICHT verwendet – die Bilder werden nur aus dem Text erfunden.\n\nFür echte, produktgenaue Listing-Bilder wechsle zu „Gemini Nano Banana\".\n\nTrotzdem als Stil-Vorschau fortfahren?"))return;
    }
    const sel=igSelectedVisuals();
    if(!sel.length){igToast("Bitte mindestens ein Visual auswählen.",true);return;}
    const lang=$("igLang").value, title=$("igTitle").value.trim(), desc=$("igDesc").value.trim();
    const uspTxt=usps.filter(u=>u.trim()).map((u,i)=>"USP "+(i+1)+": "+u.trim()).join("\n");
    const imgs=[...mainImgs];if(packImg)imgs.push(packImg);if(useImg)imgs.push(useImg);
    igCtx={provider:provider,key:key,lang:lang,title:title,desc:desc,uspTxt:uspTxt,uspsArr:usps.filter(u=>u.trim()),imgs:imgs,hasPack:!!packImg,hasUse:!!useImg};
    igLastResults=[];
    $("igResultsCard").style.display="block";
    $("igBar").style.display="flex";
    $("igDownloadAll").style.display="none";$("igRegenAll").style.display="none";
    igCollapseInputs(true);
    $("igResStatus").textContent="Generiere "+sel.length+" Visuals · Sprache: "+lang+" …";
    const grid=$("igResGrid");grid.innerHTML="";
    igCards=sel.map(igMakeResultCard);
    igCards.forEach(c=>grid.appendChild(c.el));
    $("igResultsCard").scrollIntoView({behavior:"smooth",block:"start"});
    igGenProgCtl=igMkProg("igGenProg","igGenProgPct","igGenProgFill","igGenProgSteps",sel.map(v=>v.nm));
    igGenProgCtl.show();
    let ok=0;
    for(let i=0;i<igCards.length;i++){
      igGenProgCtl.step(i);
      const done=await igGenerateOneInto(igCards[i].el, igCards[i].v, igCards[i].i);
      if(done)ok++;
      igGenProgCtl.mark(i,done);
      $("igResStatus").textContent=(i+1)+"/"+igCards.length+" fertig · Sprache: "+lang;
    }
    igGenProgCtl.done();await igSleep(480);igGenProgCtl.hide();
    $("igResStatus").textContent="✓ Fertig – "+ok+"/"+igCards.length+" Visuals erstellt";
    $("igDownloadAll").style.display=ok>0?"inline-flex":"none";
    $("igRegenAll").style.display="inline-flex";
    igToast("Generierung abgeschlossen ✓");
  };

  function buildPrompt(v,o){
    var lang=o.lang.toUpperCase();
    var usps=o.usps||[];
    // ── HAUPTBILD (Main Image): strenge Amazon-Vorgaben, KEIN Text/Logo/Grafik ──
    if(v.key==="main"){
      var mainNote = o.imgCount>0
        ? "Dir sind reale Produktfotos angehängt (Bild 1 = Haupt-Produktfoto). PFLICHT: Verwende GENAU dieses reale Produkt 1:1 – übernimm Form, Farbe, Material, Logo, Etikett, Beschriftung und Proportionen exakt. Erfinde KEIN neues Produkt und verändere es nicht."
        : "Es sind keine Produktfotos angehängt – stelle das Produkt anhand des Textes möglichst realistisch und neutral dar.";
      return "Erstelle das AMAZON-HAUPTBILD (Main Image) für ein Produktlisting – fotorealistisch, höchste Qualität.\n\n"+mainNote+
        "\n\nSTRENGE AMAZON-REGELN FÜR DAS HAUPTBILD (zwingend einhalten):\n"+
        "- Hintergrund REIN WEISS (RGB 255,255,255), komplett leer – keine Szene, kein Farbverlauf, keine Requisiten.\n"+
        "- NUR das Produkt selbst – kein zusätzliches Objekt, kein nicht mitgeliefertes Zubehör; Verpackung nur zeigen, wenn das Produkt selbst die Verpackung ist.\n"+
        "- ABSOLUT KEIN Text, KEINE Schrift, KEINE Logos, Wasserzeichen, Icons, Badges, Siegel, Pfeile, Rahmen oder Sticker im Bild.\n"+
        "- Produkt freigestellt, mittig, vollständig sichtbar, füllt ca. 85 % der Bildfläche, gestochen scharf, professionelle Studio-Ausleuchtung mit realistischem, weichem Schatten.\n"+
        "- Format EXAKT QUADRATISCH: Seitenverhältnis 1:1, Breite = Höhe (z. B. 1024×1024). Keine Personen, keine Collage.\n\n"+
        "Produkt nur zur Wiedererkennung (NICHT als Text einblenden): "+o.title;
    }
    // ── ZUSATZBILDER (A+/Infografik/Lifestyle): mit Beschriftung aus USP + Beschreibung ──
    var imgNote = o.imgCount>0
      ? "Dir sind "+o.imgCount+" reale Produktfotos angehängt (Bild 1 = Haupt-Produktfoto"+(o.hasPack?", ein Bild zeigt die Verpackung":"")+(o.hasUse?", ein Bild zeigt das Produkt in Benutzung":"")+"). PFLICHT: Verwende GENAU dieses reale Produkt aus den angehängten Fotos als Basis und integriere es in das Visual – übernimm Form, Farbe, Material, Logo, Etikett, Beschriftung und Proportionen exakt 1:1. Erfinde KEIN neues Produkt, ersetze es nicht und verändere es nicht."
      : "Es sind KEINE Produktfotos angehängt – erstelle ein generisches Visual nur anhand des Textes.";
    var focus = v.key==="usp1"?usps[0] : v.key==="usp2"?usps[1] : v.key==="usp3"?usps[2] : "";
    // USP-Infografiken optional OHNE Text-Overlay (Umschalter im Panel)
    var isUsp = v.key==="usp1"||v.key==="usp2"||v.key==="usp3";
    var noText = isUsp && igUspNoTextOn();
    var labelInstr;
    if(noText){
      labelInstr="OHNE TEXT (PFLICHT): Rendere ABSOLUT KEINEN Text ins Bild – KEINE Schrift, KEINE Buchstaben, KEINE Zahlen, KEINE Wörter, KEINE Beschriftung. Stelle den Vorteil"+(focus?" \""+focus+"\"":"")+" rein VISUELL dar: nur Produkt, Icons/Symbole und Bildsprache.";
    }else{
      labelInstr = focus
        ? "BESCHRIFTUNG (PFLICHT): Setze als große, gut lesbare Headline GENAU diesen Vorteil ins Bild: \""+focus+"\". Ergänze einen kurzen erklärenden Untertext (max. ca. 8 Wörter), der zu diesem Vorteil und zur Produktbeschreibung passt."
        : "BESCHRIFTUNG (PFLICHT): Hebe den wichtigsten konkreten Vorteil aus Beschreibung und USPs als große, gut lesbare Headline im Bild hervor, plus kurzer erklärender Untertext (max. ca. 8 Wörter).";
    }
    return "Erstelle ein professionelles, fotorealistisches Amazon-A+/Listing-ZUSATZBILD in höchster Qualität (NICHT das Hauptbild"+(noText?"":" – hier ist Text/Grafik ausdrücklich erwünscht")+").\n\n"+imgNote+
      "\n\nAUFGABE/ZWECK DIESES VISUALS: "+((noText&&v.pNo)?v.pNo:v.p)+
      "\n\n"+labelInstr+
      (noText?"":"\n\nALLE TEXTE IM BILD MÜSSEN AUF "+lang+" SEIN – korrekte Rechtschreibung, gut lesbar, professionell gesetzt, mit klarem Kontrast zum Hintergrund.")+"\n\n"+
      "Produkttitel: "+o.title+"\nBeschreibung: "+o.desc+"\n"+o.uspTxt+
      "\n\nStil: sauberes, verkaufsstarkes E-Commerce-/A+-Design, professionelle Studio-Beleuchtung, hohe Auflösung, quadratisches Format (1:1). Keine Wasserzeichen.";
  }
  function generatePollinations(v,o,i){
    var usps=o.usps||[];
    var focus = v.key==="usp1"?usps[0] : v.key==="usp2"?usps[1] : v.key==="usp3"?usps[2] : "";
    var p;
    var isUsp = v.key==="usp1"||v.key==="usp2"||v.key==="usp3";
    if(v.key==="main"){
      // Amazon-Hauptbild-Regeln: reinweiß, kein Text/Logo, Produkt füllt 85%
      p="Amazon main product image, single product centered on a pure white background (RGB 255,255,255), product fills about 85% of frame, photorealistic studio lighting, soft realistic shadow, NO text, NO logo, NO graphics, NO props, exactly square 1:1 aspect ratio. Product: "+o.title+". "+o.desc;
    }else if(isUsp && igUspNoTextOn()){
      // USP-Infografik OHNE Text-Overlay: rein visuelle Darstellung
      p="Professional Amazon A+ e-commerce infographic visual, absolutely NO text, NO letters, NO words, NO numbers, NO captions – purely visual presentation with product and icons/symbols only, high quality, studio lighting, 1:1. "+(v.pNo||v.p)+" "+(focus?"Benefit to convey visually (do NOT render as text): \""+focus+"\". ":"")+"Product: "+o.title+". "+o.desc+". Clean, commercial, sharp.";
    }else{
      p="Professional Amazon A+ e-commerce marketing visual with bold readable caption text, high quality, studio lighting, 1:1. "+v.p+(focus?" Headline caption in image: \""+focus+"\".":"")+" Product: "+o.title+". "+o.desc+". "+o.uspTxt+". All text in language: "+o.lang+". Clean, commercial, sharp, correct spelling.";
    }
    const seed=1000+i*37;
    const url="https://image.pollinations.ai/prompt/"+encodeURIComponent(p)+"?width=1024&height=1024&nologo=true&model=flux&seed="+seed;
    return new Promise((resolve,reject)=>{const img=new Image();img.crossOrigin="anonymous";img.onload=()=>resolve(url);img.onerror=()=>reject(new Error("Pollinations nicht erreichbar – später erneut versuchen."));img.src=url;});
  }
  async function generateOne(promptText,imgs,key){
    const parts=[{text:promptText}];
    imgs.forEach(img=>parts.push({inline_data:{mime_type:img.mime,data:img.base64}}));
    // Stufe 0: Cloud-Proxy (SellerHub-Konto) – identisches parts-Array wie der direkte Call
    const tok=igSyToken();
    if(tok){
      try{
        const res=await fetch(igApi()+"/api/ai/image",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+tok},body:JSON.stringify({parts:parts,generationConfig:{responseModalities:["IMAGE"]}})});
        if(res.ok){
          const d=await res.json();
          if(d && d.dataBase64)return "data:"+(d.mimeType||"image/png")+";base64,"+d.dataBase64;
          console.warn("KI-Proxy (Bild): leere Antwort – nutze Fallback-Kette.");
        }else igProxyWarn("Bild",res.status);
      }catch(e){console.warn("KI-Proxy (Bild) nicht erreichbar – nutze Fallback-Kette.",e);}
    }
    if(!key)throw new Error("Cloud-KI gerade nicht verfügbar und kein eigener Gemini-Key hinterlegt");
    const res=await fetch(ENDPOINT+"?key="+encodeURIComponent(key),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contents:[{parts}],generationConfig:{responseModalities:["IMAGE"]}})});
    if(!res.ok){let m="HTTP "+res.status;try{m=(await res.json()).error?.message||m;}catch(e){}throw new Error(m);}
    const data=await res.json();
    const part=data.candidates?.[0]?.content?.parts?.find(p=>p.inlineData||p.inline_data);
    const inline=part?.inlineData||part?.inline_data;
    if(!inline){const t=data.candidates?.[0]?.content?.parts?.find(p=>p.text)?.text;throw new Error(t?t.slice(0,80):"Kein Bild erhalten");}
    return "data:"+(inline.mimeType||inline.mime_type||"image/png")+";base64,"+inline.data;
  }

  // Alle fertigen Ergebnisse herunterladen
  $("igDownloadAll").onclick=()=>{
    const ready=igLastResults.filter(r=>r.url);
    if(!ready.length)return;
    ready.forEach((r,i)=>setTimeout(()=>{
      const a=document.createElement("a");a.href=r.url;a.download=slug(r.nm)+".png";
      document.body.appendChild(a);a.click();a.remove();
    },i*250));
    igToast("Download gestartet ("+ready.length+" Bilder)");
  };
  // Alle Visuals neu generieren
  $("igRegenAll").onclick=async()=>{
    if(!igCards.length)return;
    $("igRegenAll").disabled=true;
    igGenProgCtl=igMkProg("igGenProg","igGenProgPct","igGenProgFill","igGenProgSteps",igCards.map(c=>c.v.nm));
    igGenProgCtl.show();
    let ok=0;
    for(let i=0;i<igCards.length;i++){
      igGenProgCtl.step(i);
      const done=await igGenerateOneInto(igCards[i].el, igCards[i].v, igCards[i].i);
      if(done)ok++;
      igGenProgCtl.mark(i,done);
      $("igResStatus").textContent="Neu: "+(i+1)+"/"+igCards.length+" fertig";
    }
    igGenProgCtl.done();await igSleep(480);igGenProgCtl.hide();
    $("igResStatus").textContent="✓ Neu generiert – "+ok+"/"+igCards.length;
    $("igRegenAll").disabled=false;
    igToast("Alle neu generiert ✓");
  };

  // ✨ Auto-Ausfüllen: Titel → Beschreibung → USPs in einem Rutsch
  async function igAutoFill(){
    const btn=$("igAutoAll");
    if(!$("igTitle").value.trim()){igToast("Bitte zuerst einen kurzen Produkttitel eingeben.",true);$("igTitle").focus();return;}
    const old=btn.textContent;btn.disabled=true;btn.textContent="… KI arbeitet";
    const lang=$("igLang").value;
    let fails=0; // Teilausfälle zählen (jeder Schritt hat eigenes Retry + Backoff)
    try{
      try{
        const raw=await igGenTextSafe("Du bist Amazon-SEO-Texter. Gib EINEN einzigen optimierten, verkaufsstarken Amazon-Produkttitel in "+lang+" zurück (max ca. 180 Zeichen), nur den Titel, ohne Anführungszeichen, ohne Erklärung.\n\nAktueller Titel: "+$("igTitle").value.trim()+($("igDesc").value.trim()?"\nBeschreibung: "+$("igDesc").value.trim():""),3);
        const t=(raw||"").split(/\r?\n/).map(s=>s.replace(/^["'»„“]+|["'«”]+$/g,"").trim()).filter(Boolean)[0];
        if(t)$("igTitle").value=t;
      }catch(e){fails++;}
      try{
        const raw=await igGenTextSafe("Du bist Amazon-SEO-Texter. Schreibe EINE verkaufsstarke Produktbeschreibung in "+lang+" als Fließtext (ca. 60–120 Wörter), ohne Aufzählungszeichen, ohne Überschrift, ohne Vorrede – nur den Text. Erfinde keine Fakten.\n\nProdukttitel: "+$("igTitle").value.trim()+($("igDesc").value.trim()?"\nAktuelle Beschreibung: "+$("igDesc").value.trim():""),3);
        const d=(raw||"").trim().replace(/^["'»„“]+|["'«”]+$/g,"").trim();
        if(d)$("igDesc").value=d;
      }catch(e){fails++;}
      try{
        const raw=await igGenTextSafe("Du bist Amazon-SEO-Texter. Leite aus dem Produkt 5 kurze, prägnante USPs in "+lang+" ab (max ca. 8 Wörter), je einer pro Zeile, ohne Nummerierung/Anführungszeichen.\n\nTitel: "+$("igTitle").value.trim()+"\nBeschreibung: "+$("igDesc").value.trim(),3);
        const list=(raw||"").split(/\r?\n/).map(l=>l.replace(/^\s*(\d+[\).:\-]|[-*•])\s*/,"").replace(/^["'»„“]+|["'«”]+$/g,"").trim()).filter(l=>l.length>1).slice(0,5);
        if(list.length){usps=list.slice();while(usps.length<3)usps.push("");renderUsps();}
      }catch(e){fails++;}
      igUpdateCounts();updateChecklist();
      if(fails>=3){igToast("Auto-Ausfüllen fehlgeschlagen – die KI ist gerade überlastet, bitte gleich erneut versuchen.",true);igPromptKeyOnOverload();}
      else if(fails>0)igToast("✨ Auto-Ausfüllen teilweise fertig ("+fails+" Schritt(e) fehlgeschlagen) – bitte prüfen",true);
      else igToast("✨ Auto-Ausfüllen fertig – bitte prüfen");
    }finally{ btn.disabled=false;btn.textContent=old; }
  }
  $("igAutoAll").onclick=igAutoFill;

  renderUsps();igRenderVisuals();updateProvider();updateBadge();igUpdateCounts();updateChecklist();
})();
