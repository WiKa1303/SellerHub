// ═══ HTML-Quellen-Tests: Parser (Inline-Fixtures, KEIN Netz) + pg-mem-Integration ═══
//   node test/html.test.js
import { newDb } from 'pg-mem';
import { initDb, insertItem } from '../src/data/db.js';
import { parseHtmlList } from '../src/services/crawler/html.js';
import { canonicalUrl, normalizeTitle, parseDate } from '../src/services/crawler/normalize.js';
import { urlHash } from '../src/core/dedupe.js';

let pass = 0, fail = 0;
function t(name, cond, extra) {
  console.log((cond ? '✅' : '❌') + ' ' + name + (extra !== undefined ? ' → ' + extra : ''));
  cond ? pass++ : fail++;
}

// ── Fixture 1: Struktur wie IT-Recht-Kanzlei-Newsarchiv (dt. Datum, Entities, relative Links) ──
const ARCHIV = `
<html><body><div class="news-archiv"><h2 class="with-line">Juli 2026</h2>
  <div class="newsitem">
    <div class="news-thumbnail"><img src="/img/a.jpg"></div>
    <div>
      <span class="date">03.07.2026</span>
      <a href="/eu-verpackungsverordnung.html">EU-Verpackungsrecht: H&auml;ndlerpflichten &bdquo;neu&#8220;</a>
    </div>
  </div>
  <div class="newsitem">
    <div><span class="date">2.7.2026</span>
      <a href="https://www.beispiel.de/amazon-widerruf.html">Amazon: Neue Widerrufsfunktion</a>
    </div>
  </div>
  <div class="newsitem">
    <div><span class="date">01.07.2026</span><a href="#seitenanfang">nach oben</a>
      <a href='/etsy-widerruf.html'>Etsy: Widerrufsfunktion verf&uuml;gbar</a>
    </div>
  </div>
</div></body></html>`;

const sel = { item: '<div class="newsitem">' };
const items = parseHtmlList(ARCHIV, sel, 'https://www.beispiel.de/Newsarchiv.php');

// ── Normale Extraktion ──
t('Fixture 1: 3 Items extrahiert', items.length === 3, items.length);
t('Titel: Entities dekodiert (benannt + numerisch)', items[0].title === 'EU-Verpackungsrecht: Händlerpflichten „neu“', items[0].title);
t('Relativer Link wird absolut', items[0].link === 'https://www.beispiel.de/eu-verpackungsverordnung.html', items[0].link);
t('Absoluter Link bleibt unverändert', items[1].link === 'https://www.beispiel.de/amazon-widerruf.html');
t('Deutsches Datum → ISO (nicht US-fehlinterpretiert)', items[0].pubDate === '2026-07-03', items[0].pubDate);
t('Deutsches Datum einstellig (2.7.2026)', items[1].pubDate === '2026-07-02', items[1].pubDate);
t('Anker ohne Text / #-Anker übersprungen (single quotes ok)', items[2].link.endsWith('/etsy-widerruf.html') && items[2].title.startsWith('Etsy'), items[2].title);
t('pubDate ist für run.js/parseDate verwertbar', items.every(i => parseDate(i.pubDate) !== null));
t('summary ohne Konfiguration leer', items.every(i => i.summary === ''));

// ── Fixture 2: explizite Selektoren (title.tag, summary.tag, <time datetime>) ──
const BLOG = `
<article class="post">
  <a href="/artikel-1"><img src="x.jpg"></a>
  <h2 class="head">FBA-Geb&uuml;hren steigen</h2>
  <p>Amazon erh&ouml;ht die Lagergeb&uuml;hren zum Herbst.</p>
  <time datetime="2026-07-01T08:30:00+02:00">1. Juli 2026</time>
</article>
<article class="post">
  <a href="/artikel-2">Zweiter Artikel</a>
  <h2>GPSR-Frist naht</h2>
  <p>Was jetzt zu tun ist.</p>
</article>`;

const blogItems = parseHtmlList(BLOG, { item: '<article', title: { tag: 'h2' }, summary: { tag: 'p' } }, 'https://blog.beispiel.de/news/');
t('title.tag: Titel aus <h2>, Link aus erstem Anker', blogItems[0].title === 'FBA-Gebühren steigen' && blogItems[0].link === 'https://blog.beispiel.de/artikel-1', blogItems[0].title);
t('summary.tag: Text aus <p>', blogItems[0].summary === 'Amazon erhöht die Lagergebühren zum Herbst.', blogItems[0].summary);
t('<time datetime> hat Vorrang', blogItems[0].pubDate === '2026-07-01T08:30:00+02:00', blogItems[0].pubDate);
t('Item ohne Datum: pubDate leer (run.js verwirft)', blogItems[1].pubDate === '');

// ── Kaputtes HTML: kein Crash, brauchbare Teile werden trotzdem geliefert ──
const BROKEN = `
<div class="newsitem"><span class="date">30.06.2026<a href="/ok.html">Intakter Artikel
<div class="newsitem"><a href= kaputt ><b>ohne href-Quotes</b>
<div class="newsitem"><img src="nur-bild.jpg">
<div class="newsitem"><span class="date">32.13.2026</span><a href="/unsinn-datum.html">Unsinniges Datum</a>`;
let broken;
try { broken = parseHtmlList(BROKEN, sel, 'https://www.beispiel.de'); } catch (e) { broken = e; }
t('Kaputtes HTML crasht nicht', Array.isArray(broken), Array.isArray(broken) ? broken.length + ' Items' : String(broken));
t('Unschließbare/linklose Fragmente werden still übersprungen', Array.isArray(broken) && broken.every(i => i.link && i.title));
const unsinn = Array.isArray(broken) ? broken.find(i => i.link.includes('unsinn-datum')) : null;
t('Unplausibles Datum (32.13.) wird nicht übernommen', !!unsinn && unsinn.pubDate === '', unsinn && unsinn.pubDate);

// ── Fehlerfälle: verständliche Fehler für die Quellen-Statistik (run.js fängt sie) ──
let err1 = ''; try { parseHtmlList('<html></html>', sel, 'https://x.de'); } catch (e) { err1 = e.message; }
t('Marker nicht gefunden → Fehler mit Marker im Text', err1.includes('newsitem'), err1);
let err2 = ''; try { parseHtmlList('<html></html>', {}, 'https://x.de'); } catch (e) { err2 = e.message; }
t('selector_json.item fehlt → Fehler', err2.includes('selector_json.item'), err2);

// ── maxItems begrenzt (Quellen-Schonung) ──
const many = '<li class=x><a href="/a1.html">T1 20.06.2026</a>'.repeat(10).replace(/a1/g, () => 'a' + Math.random().toString(36).slice(2, 6));
t('maxItems kappt die Liste', parseHtmlList(many, { item: '<li class=x>', maxItems: 4 }, 'https://x.de').length === 4);

// ── Integration: geparste Items landen idempotent in der DB (pg-mem, wie im Crawler) ──
const mem = newDb();
const { Pool } = mem.adapters.createPg();
const pool = new Pool();
await initDb(pool);

const it = items[0];
const row = {
  id: urlHash(canonicalUrl(it.link)), title: it.title, titleNorm: normalizeTitle(it.title),
  summary: it.summary, url: canonicalUrl(it.link), source: 'IT-Recht Kanzlei',
  publishDate: parseDate(it.pubDate).toISOString(), country: 'DE', type: 'news', relevanceScore: 55,
};
t('Insert: geparstes Item wird gespeichert', await insertItem(row) === true);
// Idempotenz über die tatsächliche Zeilenzahl prüfen — pg-mem meldet bei
// ON CONFLICT DO NOTHING fälschlich rowCount=1, die Zeile wird aber korrekt NICHT dupliziert.
await insertItem(row);
const cnt = await pool.query('SELECT count(*) AS n FROM news_events WHERE id = $1', [row.id]);
t('Idempotenz: zweiter Insert erzeugt keine Dublette', Number(cnt.rows[0].n) === 1, cnt.rows[0].n + ' Zeile(n)');

console.log(`\n${pass} bestanden, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);
