// ═══ IMPORT-SERVICE: Amazon-Produktimport über den Server (KONZEPT-Import-Listing.md, Modul 3) ═══
// Ersetzt die wacklige clientseitige CORS-Proxy-Kette als ERSTE Stufe: der Server holt
// die Produktseite (amazon.de/dp/ASIN) mit Browser-Headern und parst tolerant per Regex
// (bewusst dependency-frei — Muster von services/crawler/html.js). Bot-Block wird ehrlich
// als 502 gemeldet, der Client fällt dann auf seine alte Proxy-Kette zurück.
// Kostenbremsen (Radar-Konvention): 24-h-Cache (import_cache, Treffer zählen NICHT),
// Tageslimit je Nutzer (ai_usage.import_calls), Zähler VOR dem Fetch.
// Kein AI-Modul → NICHT in der Intelligence-Registry; Sichtbarkeit über /internal.
import { config } from '../../core/config.js';
import { log } from '../../core/logger.js';
import { decodeEntities, stripTags } from '../../core/html-text.js';
import { getCached, saveCache, getUsage, incrementUsage, todayKey } from '../../data/db.js';

// Seiten-Fetch und Bild-Proxy sind interaktiv, aber Amazon/CDN können träge sein: 20 s.
export const IMPORT_TIMEOUT_MS = 20_000;
// Cache-Frische: Treffer < 24 h kommen aus import_cache (cached:true, ohne Zähler).
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
// Bild-Proxy: max. 8 MB (Amazon-Produktbilder liegen weit darunter — Schutz vor Missbrauch).
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
// Host-Whitelist des Bild-Proxys — EXAKT laut Konzept, fremde Hosts → 403.
export const IMAGE_HOSTS = ['m.media-amazon.com', 'images-eu.ssl-images-amazon.com', 'images-na.ssl-images-amazon.com'];

// Realistische Browser-Header (Desktop-Chrome) — ohne sie liefert Amazon fast immer Captcha.
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'de-DE,de;q=0.9',
};

// Captcha-/Bot-Block-Marker (dazu zählt JEDER Nicht-200-Status, s. fetchAmazonPage)
const BLOCK_PATTERN = /api-services-support@amazon\.com|Geben Sie die angezeigten Zeichen|captcha/i;
const BLOCK_MESSAGE = 'Amazon blockiert gerade automatisierte Abrufe — gleich erneut versuchen';

// Test-Override im ai-proxy-Stil: importFetch(mock) ersetzt globalThis.fetch.
let fetchImpl = null;
export function importFetch(override) { fetchImpl = override; return fetchImpl; }
const doFetch = (url, opts) => (fetchImpl || globalThis.fetch)(url, opts);

/**
 * ASIN aus Nutzereingabe extrahieren: /dp/<ASIN>, /gp/product/<ASIN> oder
 * roher 10-stelliger ASIN (A-Z0-9, case-insensitive akzeptiert, normalisiert auf GROSS).
 * @returns {string|null} ASIN oder null (keine gültige Eingabe)
 */
export function parseAsin(input) {
  const s = String(input ?? '').trim();
  if (!s) return null;
  const m = s.match(/\/dp\/([A-Z0-9]{10})(?=[/?#]|$)/i) || s.match(/\/gp\/product\/([A-Z0-9]{10})(?=[/?#]|$)/i);
  if (m) return m[1].toUpperCase();
  if (/^[A-Z0-9]{10}$/i.test(s)) return s.toUpperCase();
  return null;
}

// Scraping-Proxys rendern teils serverseitig — mehr Geduld als beim Direktabruf.
export const PROXY_TIMEOUT_MS = 30_000;

/** Ziel-URL in die SCRAPING_PROXY_URL-Vorlage einsetzen — oder null (kein Proxy konfiguriert). */
function proxyWrap(targetUrl) {
  const tpl = config.scrapingProxyUrl;
  if (!tpl || !tpl.includes('{url}')) return null;
  return tpl.replace('{url}', encodeURIComponent(targetUrl));
}

/** Ein HTML-Abruf mit Timeout; HTTP ≠ 200 oder Captcha-Marker → {error}. */
async function fetchHtml(url, headers, timeoutMs) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  let res, html;
  try {
    res = await doFetch(url, { headers, redirect: 'follow', signal: ac.signal });
    html = await res.text();
  } catch (e) {
    const reason = e.name === 'AbortError' ? `Timeout nach ${Math.round(timeoutMs / 1000)} s` : e.message;
    return { error: ('Amazon nicht erreichbar: ' + reason).slice(0, 300) };
  } finally {
    clearTimeout(timer);
  }
  if (res.status !== 200 || BLOCK_PATTERN.test(html)) return { error: BLOCK_MESSAGE };
  return { html };
}

/**
 * Produktseite holen (amazon.de/dp/ASIN).
 * Mit SCRAPING_PROXY_URL: Proxy ZUERST (Rechenzentrums-IPs sind bei Amazon praktisch
 * immer geblockt), bei Proxy-Fehler Direktabruf als zweite Chance. Ohne Konfiguration:
 * Direktabruf wie bisher (Degradations-Pfad). An den Proxy gehen KEINE Browser-Header —
 * der setzt seine eigenen (und würde unsere u. U. weiterreichen).
 * @returns {{html:string}|{error:string}}
 */
export async function fetchAmazonPage(asin) {
  const target = `https://www.amazon.de/dp/${asin}`;
  const proxied = proxyWrap(target);
  if (proxied) {
    const viaProxy = await fetchHtml(proxied, {}, PROXY_TIMEOUT_MS);
    if (!viaProxy.error) return viaProxy;
    // Proxy-Host statt voller URL loggen — die Vorlage enthält den API-Key!
    let proxyHost = 'Proxy';
    try { proxyHost = new URL(config.scrapingProxyUrl.replace('{url}', '')).host; } catch {}
    log.warn(`Import [${asin}]: Scraping-Proxy ${proxyHost} fehlgeschlagen (${viaProxy.error}) — versuche Direktabruf`);
  }
  return fetchHtml(target, BROWSER_HEADERS, IMPORT_TIMEOUT_MS);
}

/** li-Texte, die keine echten Bullets sind (leere, „Mehr anzeigen"-Umschalter, ›-Pfeile). */
function isNoiseBullet(text) {
  return !text || /^(›|»)/.test(text) || /^(mehr|weniger) anzeigen$/i.test(text);
}

/**
 * Produktseite tolerant parsen (Regex/String, keine DOM-Lib): fehlende Felder bleiben
 * leer, KEIN Abbruch — solange der Titel gefunden wird. Ohne Titel → {error}.
 * Zusätzlich die ENTSCHEIDENDEN Recherche-Signale (Schnell-Check): reviews, rating,
 * bsr + bsrCategory, category (Breadcrumb), soldByAmazon — alles best effort.
 * @returns {{title,bullets:string[],description,brand,images:string[],price,
 *   reviews:number|null,rating:number|null,bsr:number|null,bsrCategory:string,
 *   category:string,soldByAmazon:boolean,offerCount:number|null}|{error:string}}
 */
export function parseProduct(html, asin) {
  const src = String(html ?? '');

  // Titel (#productTitle) — Pflichtfeld: ohne ihn ist die Seite nicht lesbar
  const mTitle = src.match(/id="productTitle"[^>]*>([\s\S]*?)<\//i);
  const title = mTitle ? stripTags(mTitle[1]) : '';
  if (!title) return { error: 'Seite nicht lesbar (kein Produkttitel gefunden) — bitte URL/ASIN prüfen' };

  // Bullets (#feature-bullets → li-Texte, ohne leere/Hinweistexte)
  const bullets = [];
  const fbZone = src.split(/id="feature-bullets"/i)[1]?.slice(0, 20000) || '';
  for (const m of fbZone.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)) {
    const text = stripTags(m[1]);
    if (!isNoiseBullet(text)) bullets.push(text);
  }

  // Bilder: "hiRes":"…" bevorzugt, dann "large":"…" (colorImages-JSON), dedupliziert, max 10
  const hiRes = [...src.matchAll(/"hiRes"\s*:\s*"(https:\/\/[^"]+)"/g)].map(m => m[1]);
  const large = [...src.matchAll(/"large"\s*:\s*"(https:\/\/[^"]+)"/g)].map(m => m[1]);
  let images = [...new Set([...hiRes, ...large])].slice(0, 10);
  if (!images.length) {
    // Fallback: erste URL aus landingImage/data-a-dynamic-image (HTML-escaptes JSON)
    const tag = src.match(/<img[^>]*id="landingImage"[^>]*>/i)?.[0] || '';
    const dyn = tag.match(/data-a-dynamic-image\s*=\s*"([^"]*)"/i);
    const first = dyn ? decodeEntities(dyn[1]).match(/https:\/\/[^"]+/) : null;
    if (first) images = [first[0]];
  }

  // Marke (#bylineInfo) — Amazon-Floskeln entfernen („Besuche den X-Store", „Marke: X")
  const mBrand = src.match(/id="bylineInfo"[^>]*>([\s\S]*?)<\/a>/i);
  const brand = mBrand ? stripTags(mBrand[1])
    .replace(/^(besuche den|besuchen sie den|visit the)\s+/i, '')
    .replace(/^marke:\s*/i, '')
    .replace(/[-‑]?\s*store$/i, '')
    .trim() : '';

  // Beschreibung (#productDescription, erster Absatz — best effort)
  const pdZone = src.split(/id="productDescription"/i)[1]?.slice(0, 20000) || '';
  const mDesc = pdZone.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  const description = mDesc ? stripTags(mDesc[1]) : '';

  // Preis (erste .a-price → .a-offscreen — best effort, kann bei Varianten fehlen)
  const mPrice = src.match(/class="[^"]*\ba-price\b[^"]*"[\s\S]{0,500}?class="[^"]*a-offscreen[^"]*"[^>]*>([^<]+)</i);
  const price = mPrice ? stripTags(mPrice[1]) : '';

  // Bewertungen: Anzahl (#acrCustomerReviewText „1.234 Sternebewertungen") + ⌀ Sterne („4,4 von 5")
  const mRev = src.match(/id="acrCustomerReviewText"[^>]*>\s*([\d.,]+)/i);
  const reviews = mRev ? (parseInt(mRev[1].replace(/[.,]/g, ''), 10) || null) : null;
  const mRat = src.match(/(\d[.,]\d)\s*(?:von 5|out of 5)/i);
  const rating = mRat ? parseFloat(mRat[1].replace(',', '.')) : null;

  // Bestseller-Rang: erste Nennung nach dem Label = HAUPT-Kategorie (die zählt fürs Urteil)
  const bsrZone = src.split(/Bestseller-?Rang|Best Sellers Rank|Amazon Bestseller/i)[1]?.slice(0, 1500) || '';
  const mBsr = bsrZone.match(/(?:Nr\.\s*|#)([\d.,]+)\s+in\s+([^(<|\n]+)/i);
  const bsr = mBsr ? (parseInt(mBsr[1].replace(/[.,]/g, ''), 10) || null) : null;
  const bsrCategory = mBsr ? stripTags(mBsr[2]).trim().slice(0, 80) : '';

  // Kategorie: erster Breadcrumb-Eintrag (#wayfinding-breadcrumbs)
  const bcZone = src.split(/id="wayfinding-breadcrumbs/i)[1]?.slice(0, 4000) || '';
  const mBc = bcZone.match(/<a[^>]*>([\s\S]*?)<\/a>/i);
  const category = mBc ? stripTags(mBc[1]) : '';

  // Verkauft Amazon selbst? („Verkauf durch Amazon" — hartes Warnsignal in der Recherche)
  const soldByAmazon = /Verkauf(?:\s+und\s+Versand)?\s+durch\s+Amazon(?!\s+Marketplace)|sold by\s+Amazon\.(?:de|com)/i.test(src);

  // Anzahl der Verkäufer/Angebote auf DIESEM Listing („Neu (7) ab 18,99 €" /
  // „Alle Angebote anzeigen (7)" / "New (7) from") — ab ~4 Anbietern ist es ein
  // Reseller-/Preiskampf-Listing, kein Private-Label-Markt → entscheidendes Signal.
  const mOff = src.match(/(?:Neu|New)\s*\((\d+)\)\s*(?:ab|from)/i)
    || src.match(/(?:Alle\s+Angebote(?:\s+anzeigen)?|See\s+All\s+Buying\s+Options)[^()<>]{0,40}\((\d+)\)/i);
  const offerCount = mOff ? (parseInt(mOff[1], 10) || null) : null;

  return { title, bullets, description, brand, images, price, reviews, rating, bsr, bsrCategory, category, soldByAmazon, offerCount };
}

/**
 * POST /api/import/amazon: {urlOrAsin, marketplace?='de'} → geparstes Produkt.
 * Ablauf: parseAsin → Cache (24 h, cached:true, KEIN Zähler) → Tageslimit (429)
 * → Zähler-Increment → Fetch → Parse → Cache speichern.
 * Erwartbare Fehler als {status, error} (Routen-Muster von services/auth).
 */
export async function importProduct({ urlOrAsin, marketplace = 'de', userId }) {
  const asin = parseAsin(urlOrAsin);
  if (!asin) return { status: 400, error: 'Keine gültige Eingabe — erwartet Amazon-URL mit /dp/… bzw. /gp/product/… oder eine 10-stellige ASIN' };
  if (marketplace !== 'de') return { status: 400, error: 'Nur marketplace "de" wird in v1 unterstützt' };

  // Cache-Treffer < 24 h: aus dem Cache antworten — zählt NICHT gegen das Tageslimit
  const hit = await getCached(asin, marketplace, new Date(Date.now() - CACHE_TTL_MS));
  if (hit) return { status: 200, ...hit.data, cached: true };

  // Tageslimit (nur Frisch-Importe) — geprüft VOR dem Fetch
  const day = todayKey();
  const usage = await getUsage(userId, day);
  if (usage.import_calls >= config.importPerDay) {
    return { status: 429, error: `Tageslimit von ${config.importPerDay} Frisch-Importen erreicht — morgen wieder (Cache-Treffer zählen nicht)` };
  }

  // Der Zähler wird VOR dem Fetch erhöht, nicht erst bei Erfolg: ein fehlgeschlagener
  // Abruf zählt bewusst trotzdem — sonst könnte ein Client bei 502 unbegrenzt „gratis"
  // retryen (Retry-Sturm = Last ohne Bremse; gleiches Muster wie services/ai-proxy).
  await incrementUsage(userId, day, 'import');

  const startedAt = Date.now();
  const page = await fetchAmazonPage(asin);
  if (page.error) {
    log.warn(`Import [${asin}] Nutzer ${String(userId).slice(0, 8)}… fehlgeschlagen nach ${Date.now() - startedAt} ms: ${page.error}`);
    return { status: 502, error: page.error };
  }

  const product = parseProduct(page.html, asin);
  if (product.error) {
    log.warn(`Import [${asin}] Nutzer ${String(userId).slice(0, 8)}… Parser: ${product.error}`);
    return { status: 502, error: product.error };
  }

  const data = { asin, marketplace, ...product, fetchedAt: new Date().toISOString() };
  await saveCache(asin, marketplace, data);
  log.info(`Import [${asin}] Nutzer ${String(userId).slice(0, 8)}… ok (${Date.now() - startedAt} ms, ${product.images.length} Bilder)`);
  return { status: 200, ...data, cached: false };
}

/**
 * GET /api/import/amazon-image: Bild-Durchreiche für canvas-taint-freie Bytes im Bildstudio.
 * NUR Whitelist-Hosts (403 sonst), max. 8 MB (Content-Length geprüft UND beim Lesen
 * abgebrochen), Timeout 20 s. Zählt nicht gegen Limits (Konzept).
 * @returns {{status:200, contentType:string, buffer:Buffer}|{status, error}}
 */
export async function proxyImage(url) {
  let u;
  try { u = new URL(String(url ?? '')); } catch { return { status: 400, error: 'url (vollständige Bild-URL) erforderlich' }; }
  if (u.protocol !== 'https:' || !IMAGE_HOSTS.includes(u.hostname)) {
    return { status: 403, error: 'Nur Amazon-Bild-Hosts erlaubt: ' + IMAGE_HOSTS.join(', ') };
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), IMPORT_TIMEOUT_MS);
  try {
    const res = await doFetch(u.toString(), { signal: ac.signal, redirect: 'follow' });
    if (!res.ok) return { status: 502, error: 'Bild-Host antwortete mit HTTP ' + res.status };

    // 1. Verteidigungslinie: Content-Length (falls gesetzt)
    const declared = parseInt(res.headers?.get?.('content-length') || '0', 10);
    if (declared > MAX_IMAGE_BYTES) return { status: 502, error: 'Bild größer als 8 MB — wird nicht durchgereicht' };

    // 2. Verteidigungslinie: beim Lesen zählen und über dem Limit ABBRECHEN
    // (Content-Length kann fehlen/lügen). Fallback arrayBuffer für Bodies ohne Stream.
    const chunks = [];
    let total = 0;
    if (res.body?.getReader) {
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_IMAGE_BYTES) {
          await reader.cancel().catch(() => {});
          return { status: 502, error: 'Bild größer als 8 MB — wird nicht durchgereicht' };
        }
        chunks.push(Buffer.from(value));
      }
    } else {
      const ab = await res.arrayBuffer();
      if (ab.byteLength > MAX_IMAGE_BYTES) return { status: 502, error: 'Bild größer als 8 MB — wird nicht durchgereicht' };
      chunks.push(Buffer.from(ab));
    }
    return {
      status: 200,
      contentType: res.headers?.get?.('content-type') || 'image/jpeg',
      buffer: Buffer.concat(chunks),
    };
  } catch (e) {
    const reason = e.name === 'AbortError' ? `Timeout nach ${Math.round(IMPORT_TIMEOUT_MS / 1000)} s` : e.message;
    return { status: 502, error: ('Bild nicht ladbar: ' + reason).slice(0, 300) };
  } finally {
    clearTimeout(timer);
  }
}
