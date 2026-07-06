// ═══ Amazon-Import-Tests (Modul 3): ASIN-Parsing, Parser, Cache, Limits, Bild-Proxy ═══
//   node test/import.test.js   (pg-mem — kein Postgres; Amazon-Fetch gemockt)
import { newDb } from 'pg-mem';
import { initDb, db, getUsage, todayKey } from '../src/data/db.js';
import { buildApi } from '../src/api/routes.js';
import { config } from '../src/core/config.js';
import { importFetch, parseAsin, parseProduct, proxyImage, fetchAmazonPage, IMAGE_HOSTS, MAX_IMAGE_BYTES } from '../src/services/import/index.js';
import { validateConfig } from '../src/core/config.js';

let pass = 0, fail = 0;
function t(name, cond, extra) {
  console.log((cond ? '✅' : '❌') + ' ' + name + (extra !== undefined ? ' → ' + extra : ''));
  cond ? pass++ : fail++;
}

// ── Kompaktes, realistisches Amazon-Produktseiten-Fixture ──
// productTitle (mit Entities), bylineInfo, a-offscreen-Preis, feature-bullets (3 echte li
// + 1 leeres + 1 „Mehr anzeigen"), colorImages-JSON mit hiRes/large, productDescription.
const FIXTURE = `<!doctype html><html lang="de"><head><title>Amazon.de</title></head><body>
<div id="titleSection"><span id="productTitle" class="a-size-large product-title-word-break">
  Edelstahl-Tr&ouml;pfler &amp; Zubeh&ouml;r &ndash; 2er Pack
</span></div>
<div id="bylineInfo_feature_div"><a id="bylineInfo" class="a-link-normal" href="/stores/TestMarke/page/1">Besuche den TestMarke-Store</a></div>
<div class="a-section"><span class="a-price" data-a-color="base"><span class="a-offscreen">19,99&nbsp;€</span><span aria-hidden="true">19,99 €</span></span></div>
<div id="feature-bullets"><ul class="a-unordered-list a-vertical a-spacing-mini">
<li><span class="a-list-item"> Erster Punkt mit &uuml;berzeugender Qualit&auml;t </span></li>
<li><span class="a-list-item">Zweiter Punkt — robust &amp; langlebig</span></li>
<li><span class="a-list-item">Dritter Punkt f&uuml;r die K&uuml;che</span></li>
<li><span class="a-list-item">   </span></li>
<li><span class="a-list-item">Mehr anzeigen</span></li>
</ul></div>
<script type="text/javascript">
P.when('A').register("ImageBlockATF", function(A){
var data = {"colorImages":{"initial":[
 {"hiRes":"https://m.media-amazon.com/images/I/71abc._AC_SL1500_.jpg","large":"https://m.media-amazon.com/images/I/71abc._AC_SL1000_.jpg"},
 {"hiRes":"https://m.media-amazon.com/images/I/81def._AC_SL1500_.jpg","large":"https://m.media-amazon.com/images/I/81def._AC_SL1000_.jpg"},
 {"hiRes":null,"large":"https://m.media-amazon.com/images/I/91ghi._AC_SL1000_.jpg"}]}};
});
</script>
<div id="productDescription" class="a-section a-spacing-small"><p>Eine sch&ouml;ne Beschreibung des Produkts.</p></div>
</body></html>`.replace('<div id="feature-bullets">',
  // Signale wie auf echten Seiten VOR den Bullets: Breadcrumb, Reviews/Sterne, Verkäufer
  `<div id="wayfinding-breadcrumbs_feature_div"><ul><li><a class="a-link-normal" href="/kueche">K&uuml;che, Haushalt &amp; Wohnen</a></li><li><a href="/tropf">Tr&ouml;pfler</a></li></ul></div>
<div id="averageCustomerReviews"><span class="a-icon-alt">4,4 von 5 Sternen</span><span id="acrCustomerReviewText" class="a-size-base">1.234 Sternebewertungen</span></div>
<div id="merchant-info">Verkauf durch Amazon</div>
<div id="detailBullets"><span class="a-text-bold">Amazon Bestseller-Rang:</span> Nr. 2.345 in K&uuml;che, Haushalt &amp; Wohnen (Siehe Top 100) <span>Nr. 12 in Tr&ouml;pfler</span></div>
<div id="feature-bullets">`);

const CAPTCHA_HTML = `<html><body><h4>Geben Sie die angezeigten Zeichen in das Feld ein</h4>
<p>Bei Fragen: api-services-support@amazon.com</p><form action="/errors/validateCaptcha"></form></body></html>`;

const KAPUTT_HTML = `<html><body><div class="irgendwas">Hier gibt es keinen Produkttitel.</div></body></html>`;

// ── Mock: Amazon-/CDN-Fetch (Antwort schaltbar, alle Aufrufe protokolliert) ──
let upstreamCalls = [];
let upstreamNext = null; // {status, html} für Seiten, {status, contentType, bytes} für Bilder
importFetch(async (url, opts) => {
  upstreamCalls.push({ url, opts });
  const r = upstreamNext || { status: 200, html: FIXTURE };
  return {
    ok: r.status === 200,
    status: r.status,
    headers: { get: (h) => ({ 'content-type': r.contentType || 'text/html', 'content-length': r.contentLength || '' })[h.toLowerCase()] ?? null },
    text: async () => r.html || '',
    arrayBuffer: async () => (r.bytes || new Uint8Array()).buffer,
  };
});

// ── Setup: pg-mem + API + Testkonto (Muster: test/ai-proxy.test.js) ──
const mem = newDb();
const { Pool } = mem.adapters.createPg();
await initDb(new Pool());
const app = buildApi();
const srv = app.listen(0);
const base = 'http://127.0.0.1:' + srv.address().port;

const post = (path, body, token) => fetch(base + path, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
  body: JSON.stringify(body),
});

config.registrationCode = 'einladung-test';
await post('/api/auth/register', { email: 'import@test.de', password: 'passwort1', inviteCode: 'einladung-test' });
const login = await (await post('/api/auth/login', { email: 'import@test.de', password: 'passwort1' })).json();
const token = login.token;
const userId = login.user.id;
t('Setup: Testkonto angelegt + eingeloggt', !!token && !!userId);

// Kleines Limit für deterministische 429-Tests (Muster: config-Override wie ai-proxy.test.js)
config.importPerDay = 5;

// ── parseAsin: alle Varianten + Fehler ──
t('parseAsin: /dp/-URL', parseAsin('https://www.amazon.de/Edelstahl-Troepfler/dp/B0AAAAAA01/ref=sr_1_1?keywords=x') === 'B0AAAAAA01');
t('parseAsin: /gp/product/-URL', parseAsin('https://www.amazon.de/gp/product/B0BBBBBB02?psc=1') === 'B0BBBBBB02');
t('parseAsin: roher ASIN', parseAsin('B0CCCCCC03') === 'B0CCCCCC03');
t('parseAsin: roher ASIN mit Leerraum + lowercase → normalisiert', parseAsin('  b0cccccc03  ') === 'B0CCCCCC03');
t('parseAsin: 9 Zeichen → Fehler', parseAsin('B0AAAAAA0') === null);
t('parseAsin: 11 Zeichen → Fehler', parseAsin('B0AAAAAA011') === null);
t('parseAsin: Freitext → Fehler', parseAsin('kein asin hier') === null);
t('parseAsin: leer → Fehler', parseAsin('') === null && parseAsin(undefined) === null);
t('parseAsin: URL ohne /dp/ → Fehler', parseAsin('https://www.amazon.de/s?k=toaster') === null);

// ── 401: Bearer-Pflicht (Modul 1) ──
let r = await post('/api/import/amazon', { urlOrAsin: 'B0AAAAAA01' });
t('Import: ohne Token → 401', r.status === 401);
r = await fetch(base + '/api/import/amazon-image?url=' + encodeURIComponent('https://m.media-amazon.com/images/I/x.jpg'));
t('Bild-Proxy: ohne Token → 401', r.status === 401);
t('401 erreicht den Upstream nie', upstreamCalls.length === 0);

// ── 400: kaputte Eingabe / fremder Marktplatz ──
r = await post('/api/import/amazon', { urlOrAsin: 'kein asin' }, token);
t('Import: ungültige Eingabe → 400', r.status === 400, (await r.json()).error);
r = await post('/api/import/amazon', { urlOrAsin: 'B0AAAAAA01', marketplace: 'com' }, token);
t('Import: marketplace ≠ de → 400 (v1)', r.status === 400);
t('400 zählt nicht aufs Kontingent', (await getUsage(userId, todayKey())).import_calls === 0);

// ── Parser-Roundtrip: alle Felder aus dem Fixture ──
upstreamNext = { status: 200, html: FIXTURE };
r = await post('/api/import/amazon', { urlOrAsin: 'https://www.amazon.de/dp/B0AAAAAA01' }, token);
const p = await r.json();
t('Roundtrip: 200 + cached:false', r.status === 200 && p.cached === false, JSON.stringify({ status: r.status, cached: p.cached }));
t('Roundtrip: asin + marketplace', p.asin === 'B0AAAAAA01' && p.marketplace === 'de');
t('Roundtrip: title getrimmt + Entities dekodiert', p.title === 'Edelstahl-Tröpfler & Zubehör – 2er Pack', p.title);
t('Roundtrip: genau 3 Bullets (leere/Hinweistexte gefiltert)', Array.isArray(p.bullets) && p.bullets.length === 3, JSON.stringify(p.bullets));
t('Roundtrip: Bullet-Entities dekodiert', p.bullets?.[0] === 'Erster Punkt mit überzeugender Qualität');
t('Roundtrip: brand bereinigt („Besuche den …-Store" entfernt)', p.brand === 'TestMarke', p.brand);
t('Roundtrip: description aus #productDescription', p.description === 'Eine schöne Beschreibung des Produkts.', p.description);
t('Roundtrip: price aus erster .a-offscreen', p.price === '19,99 €', p.price);
t('Roundtrip: reviews aus acrCustomerReviewText', p.reviews === 1234, p.reviews);
t('Roundtrip: rating aus „4,4 von 5"', p.rating === 4.4, p.rating);
t('Roundtrip: BSR Haupt-Kategorie (erste Nennung)', p.bsr === 2345 && /K.che/.test(p.bsrCategory), p.bsr + ' in ' + p.bsrCategory);
t('Roundtrip: category aus Breadcrumb', /K.che/.test(p.category), p.category);
t('Roundtrip: soldByAmazon erkannt', p.soldByAmazon === true);
t('Roundtrip: 5 Bilder, hiRes zuerst, dedupliziert',
  p.images?.length === 5 && p.images[0].includes('71abc._AC_SL1500_') && p.images[1].includes('81def._AC_SL1500_')
  && p.images[4].includes('91ghi._AC_SL1000_'), JSON.stringify(p.images));
t('Roundtrip: fetchedAt gesetzt', !!p.fetchedAt);
t('Frisch-Import zählt: import_calls = 1', (await getUsage(userId, todayKey())).import_calls === 1);
const pageCall = upstreamCalls[upstreamCalls.length - 1];
t('Upstream: amazon.de/dp/<ASIN> mit Desktop-Chrome-UA + de-DE',
  pageCall.url === 'https://www.amazon.de/dp/B0AAAAAA01'
  && /Chrome/.test(pageCall.opts.headers['User-Agent'])
  && pageCall.opts.headers['Accept-Language'].startsWith('de-DE')
  && pageCall.opts.headers['Accept'].startsWith('text/html'));
t('Upstream-Call hat Abort-Signal (Timeout 20 s)', !!pageCall.opts.signal);

// ── Cache-Hit: 2. Call cached:true, KEIN Zähler, KEIN Upstream ──
const callsBefore = upstreamCalls.length;
r = await post('/api/import/amazon', { urlOrAsin: 'B0AAAAAA01' }, token);
const c = await r.json();
t('Cache-Hit: 200 + cached:true (gleiche ASIN < 24 h)', r.status === 200 && c.cached === true && c.title === p.title);
t('Cache-Hit zählt NICHT (import_calls bleibt 1)', (await getUsage(userId, todayKey())).import_calls === 1);
t('Cache-Hit erreicht den Upstream nicht', upstreamCalls.length === callsBefore);
t('DB hält genau EINE import_cache-Zeile (Upsert)', (await db().query(`SELECT count(*) AS n FROM import_cache`)).rows[0].n == 1);

// ── Cache-Frische: Eintrag älter als 24 h → frischer Import (JS-Datum-Grenze) ──
await db().query(`UPDATE import_cache SET fetched_at = $1`, [new Date(Date.now() - 25 * 3600 * 1000)]);
r = await post('/api/import/amazon', { urlOrAsin: 'B0AAAAAA01' }, token);
t('Abgelaufener Cache (> 24 h) → frischer Import (cached:false)', r.status === 200 && (await r.json()).cached === false);
t('Frischer Import zählt wieder: import_calls = 2', (await getUsage(userId, todayKey())).import_calls === 2);

// ── 502: Captcha-/Bot-Block (Marker) → ehrliche Konzept-Meldung, zählt trotzdem ──
upstreamNext = { status: 200, html: CAPTCHA_HTML };
r = await post('/api/import/amazon', { urlOrAsin: 'B0BBBBBB02' }, token);
const blk = await r.json();
t('Captcha-Marker → 502 mit Konzept-Meldung', r.status === 502 && blk.error.includes('Amazon blockiert gerade automatisierte Abrufe'), blk.error);
t('Block zählt trotzdem (Schutz vor Retry-Stürmen): import_calls = 3', (await getUsage(userId, todayKey())).import_calls === 3);
t('Block landet NICHT im Cache', (await db().query(`SELECT count(*) AS n FROM import_cache`)).rows[0].n == 1);

// ── 502: HTTP ≠ 200 gilt ebenfalls als Block ──
upstreamNext = { status: 503, html: '<html>Service Unavailable</html>' };
r = await post('/api/import/amazon', { urlOrAsin: 'B0BBBBBB02' }, token);
t('HTTP 503 vom Upstream → 502 (Block)', r.status === 502);

// ── 502: kaputtes HTML ohne Titel → „Seite nicht lesbar" ──
upstreamNext = { status: 200, html: KAPUTT_HTML };
r = await post('/api/import/amazon', { urlOrAsin: 'B0CCCCCC03' }, token);
const kaputt = await r.json();
t('HTML ohne Titel → 502 „Seite nicht lesbar"', r.status === 502 && kaputt.error.includes('Seite nicht lesbar'), kaputt.error);
t('parseProduct direkt: {error} statt Wurf', parseProduct(KAPUTT_HTML, 'B0CCCCCC03').error?.includes('Seite nicht lesbar'));

// ── 429: Tageslimit (Limit 5, Stand: 5 Frisch-Versuche verbraucht) ──
const beforeLimit = upstreamCalls.length;
r = await post('/api/import/amazon', { urlOrAsin: 'B0DDDDDD04' }, token);
const lim = await r.json();
t('6. Frisch-Import → 429 mit Limit + „morgen wieder"', r.status === 429 && lim.error.includes('5') && lim.error.includes('morgen wieder'), lim.error);
t('429 wird VOR dem Upstream geprüft (kein Upstream-Call)', upstreamCalls.length === beforeLimit);
t('429 erhöht den Zähler nicht (import_calls bleibt 5)', (await getUsage(userId, todayKey())).import_calls === 5);
r = await post('/api/import/amazon', { urlOrAsin: 'B0AAAAAA01' }, token);
t('Cache-Treffer funktionieren trotz erreichtem Limit weiter', r.status === 200 && (await r.json()).cached === true);
t('Text-/Bild-Kontingente (Modul 2) bleiben unberührt', (await getUsage(userId, todayKey())).text_calls === 0);

// ── parseProduct: landingImage-Fallback (kein hiRes/large-JSON vorhanden) ──
const landing = `<html><body><span id="productTitle">Nur Landing</span>
<img id="landingImage" data-a-dynamic-image="{&quot;https://m.media-amazon.com/images/I/61xyz._AC_SX679_.jpg&quot;:[679,679],&quot;https://m.media-amazon.com/images/I/61xyz._AC_SX466_.jpg&quot;:[466,466]}" src="x"></body></html>`;
const lp = parseProduct(landing, 'B0EEEEEE05');
t('parseProduct: landingImage-Fallback (erste URL aus data-a-dynamic-image)',
  lp.images.length === 1 && lp.images[0] === 'https://m.media-amazon.com/images/I/61xyz._AC_SX679_.jpg', JSON.stringify(lp.images));
t('parseProduct: fehlende Felder leer, KEIN Abbruch (solange Titel da)',
  lp.title === 'Nur Landing' && lp.bullets.length === 0 && lp.brand === '' && lp.price === '');

// ── Bild-Proxy: Whitelist (403 fremder Host, ohne Upstream) ──
const imgBefore = upstreamCalls.length;
r = await fetch(base + '/api/import/amazon-image?url=' + encodeURIComponent('https://boeser-host.example.com/bild.jpg'),
  { headers: { Authorization: 'Bearer ' + token } });
t('Bild-Proxy: fremder Host → 403', r.status === 403, (await r.json()).error);
r = await fetch(base + '/api/import/amazon-image?url=' + encodeURIComponent('http://m.media-amazon.com/x.jpg'),
  { headers: { Authorization: 'Bearer ' + token } });
t('Bild-Proxy: http statt https → 403', r.status === 403);
r = await fetch(base + '/api/import/amazon-image?url=kaputt', { headers: { Authorization: 'Bearer ' + token } });
t('Bild-Proxy: kaputte URL → 400', r.status === 400);
t('403/400 erreichen den Upstream nie', upstreamCalls.length === imgBefore);
t('Whitelist exakt laut Konzept', JSON.stringify(IMAGE_HOSTS)
  === JSON.stringify(['m.media-amazon.com', 'images-eu.ssl-images-amazon.com', 'images-na.ssl-images-amazon.com']));

// ── Bild-Proxy: 200 von media-amazon (gemockt) → Bytes + Content-Type + Cache-Header ──
upstreamNext = { status: 200, contentType: 'image/jpeg', contentLength: '4', bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]) };
r = await fetch(base + '/api/import/amazon-image?url=' + encodeURIComponent('https://m.media-amazon.com/images/I/71abc._AC_SL1500_.jpg'),
  { headers: { Authorization: 'Bearer ' + token } });
const bytes = new Uint8Array(await r.arrayBuffer());
t('Bild-Proxy: 200 + Bytes durchgereicht', r.status === 200 && bytes.length === 4 && bytes[0] === 0xff, bytes.length);
t('Bild-Proxy: Content-Type durchgereicht', (r.headers.get('content-type') || '').startsWith('image/jpeg'));
t('Bild-Proxy: Cache-Control private, max-age=3600', r.headers.get('cache-control') === 'private, max-age=3600');
t('Bild-Proxy zählt NICHT gegen das Import-Limit', (await getUsage(userId, todayKey())).import_calls === 5);

// ── Bild-Proxy: 8-MB-Grenze (Content-Length + Lese-Grenze, direkt am Service) ──
upstreamNext = { status: 200, contentType: 'image/jpeg', contentLength: String(9 * 1024 * 1024), bytes: new Uint8Array(4) };
let big = await proxyImage('https://m.media-amazon.com/images/I/riesig.jpg');
t('Bild-Proxy: Content-Length > 8 MB → 502', big.status === 502 && big.error.includes('8 MB'), big.error);
upstreamNext = { status: 200, contentType: 'image/jpeg', bytes: new Uint8Array(MAX_IMAGE_BYTES + 1) };
big = await proxyImage('https://m.media-amazon.com/images/I/riesig2.jpg');
t('Bild-Proxy: gelesene Bytes > 8 MB (ohne Content-Length) → 502', big.status === 502 && big.error.includes('8 MB'));
upstreamNext = { status: 404, contentType: 'text/html', html: 'weg' };
big = await proxyImage('https://m.media-amazon.com/images/I/weg.jpg');
t('Bild-Proxy: Upstream-404 → 502', big.status === 502);

// ── /internal: Import-Zeile in der KI-Proxy-/Nutzungs-Sektion ──
r = await fetch(base + '/internal');
const ihtml = await r.text();
t('/internal: Import-Limit + Cache-Größe + import_calls je Nutzer', r.status === 200
  && ihtml.includes('Import-Limit/Tag') && ihtml.includes('Import-Cache (Produkte)')
  && ihtml.includes('Import-Calls heute') && ihtml.includes('import@test.de'));
t('/internal: KI-Proxy-Sektion (Modul 2) weiterhin vorhanden', ihtml.includes('KI-Proxy (Modul 2)') && ihtml.includes('Text-Limit/Tag'));

// ── Scraping-Proxy (SCRAPING_PROXY_URL): Proxy zuerst, Direktabruf als Fallback ──
config.scrapingProxyUrl = 'https://proxy.test/v1?key=GEHEIM&url={url}';
upstreamCalls = []; upstreamNext = null; // Standard-Mock: 200 + FIXTURE
let pg = await fetchAmazonPage('B0AAAAAA01');
t('Proxy: Abruf läuft über die Proxy-URL (Ziel URL-encodiert)', !pg.error && upstreamCalls.length === 1
  && upstreamCalls[0].url === 'https://proxy.test/v1?key=GEHEIM&url=' + encodeURIComponent('https://www.amazon.de/dp/B0AAAAAA01'),
  upstreamCalls[0] && upstreamCalls[0].url);
t('Proxy: KEINE Browser-Header an den Proxy', Object.keys(upstreamCalls[0].opts.headers || {}).length === 0);

// Proxy scheitert (403) → Direktabruf mit Browser-Headern als zweite Chance
upstreamCalls = [];
importFetch(async (url, opts) => {
  upstreamCalls.push({ url, opts });
  const isProxy = url.startsWith('https://proxy.test/');
  return {
    ok: !isProxy, status: isProxy ? 403 : 200,
    headers: { get: () => null },
    text: async () => (isProxy ? '' : FIXTURE),
    arrayBuffer: async () => new Uint8Array().buffer,
  };
});
pg = await fetchAmazonPage('B0AAAAAA01');
t('Proxy: bei Proxy-Fehler Direktabruf als Fallback', !pg.error && upstreamCalls.length === 2
  && upstreamCalls[1].url === 'https://www.amazon.de/dp/B0AAAAAA01'
  && !!(upstreamCalls[1].opts.headers || {})['User-Agent'],
  upstreamCalls.map(c => c.url.split('?')[0]).join(' → '));
config.scrapingProxyUrl = '';

// validateConfig: Vorlage ohne {url}-Platzhalter wird abgelehnt
const dbUrlBackup = config.databaseUrl;
config.databaseUrl = 'postgres://test';
config.scrapingProxyUrl = 'https://proxy.test/v1?key=X&url=OHNE-PLATZHALTER';
let cfgErr = '';
try { validateConfig(); } catch (e) { cfgErr = e.message; }
t('Config: SCRAPING_PROXY_URL ohne {url} → Konfigurationsfehler', cfgErr.includes('SCRAPING_PROXY_URL'), cfgErr.split('\n')[1]);
config.scrapingProxyUrl = '';
config.databaseUrl = dbUrlBackup;

srv.close();

console.log(`\n${pass} bestanden, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);
