// ═══ KI-PROXY-SERVICE: Gemini-Aufrufe des Bildstudios über den Server (KONZEPT-KI-Proxy.md, Modul 2) ═══
// Der GEMINI_API_KEY verlässt NIE den Server: Clients rufen /api/ai/* mit Bearer-Token
// (Modul 1), der Server ruft Gemini. Ohne Key antwortet der Proxy 503 — bewusster
// Degradations-Pfad: das Frontend fällt still auf eigenen Key/Pollinations zurück.
// Kostenbremsen (Radar-Konvention): Tageslimits je Nutzer (ai_usage), Limit VOR dem
// Upstream-Call geprüft, ehrliche 429 mit „morgen wieder".
// Kein AI-Modul → NICHT in der Intelligence-Registry; Sichtbarkeit über /internal.
import { config } from '../../core/config.js';
import { log } from '../../core/logger.js';
import { incrementUsage, getUsage, todayKey } from '../../data/db.js';

// Upstream-Timeouts: Text ist interaktiv (30 s reicht), Bild-Generierung braucht länger (90 s).
export const TEXT_TIMEOUT_MS = 30_000;
export const IMAGE_TIMEOUT_MS = 90_000;
// Gesamt-JSON der parts (Produktfotos inline als Base64) — passend zum 25-MB-Body-Limit der Route.
export const MAX_PARTS_BYTES = 25 * 1024 * 1024;

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';

// Test-Override im Stil von services/alerts/dispatch.js: aiProxyFetch(mock) ersetzt globalThis.fetch.
let fetchImpl = null;
export function aiProxyFetch(override) { fetchImpl = override; return fetchImpl; }
const doFetch = (url, opts) => (fetchImpl || globalThis.fetch)(url, opts);

/** Key-Maskierung: der GEMINI_API_KEY (auch URL-encodiert) darf NIE in Logs oder Fehlermeldungen auftauchen. */
function maskKey(s) {
  let out = String(s ?? '');
  if (config.geminiApiKey) {
    out = out.split(config.geminiApiKey).join('***');
    out = out.split(encodeURIComponent(config.geminiApiKey)).join('***');
  }
  return out;
}

/** Log je Call (Dauer, Nutzer-ID gekürzt, Typ, ok/Fehler) — fail-soft, bricht nie einen Request. */
function logCall(art, userId, startedAt, error) {
  try {
    const uid = String(userId).slice(0, 8);
    const ms = Date.now() - startedAt;
    if (error) log.warn(`KI-Proxy [${art}] Nutzer ${uid}… fehlgeschlagen nach ${ms} ms: ${maskKey(error)}`);
    else log.info(`KI-Proxy [${art}] Nutzer ${uid}… ok (${ms} ms)`);
  } catch { /* Logging darf den Call nicht brechen */ }
}

/**
 * Upstream-Call mit AbortController-Timeout. Fehler kommen IMMER maskiert zurück
 * ({error}) — die Meldung ist für den Client bestimmt (502, ohne Key-Leak).
 */
async function callGemini(model, body, timeoutMs) {
  const url = GEMINI_BASE + model + ':generateContent?key=' + encodeURIComponent(config.geminiApiKey);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  let res;
  try {
    res = await doFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
  } catch (e) {
    // e.message kann die URL (inkl. ?key=…) enthalten → maskieren!
    const reason = e.name === 'AbortError' ? `Timeout nach ${Math.round(timeoutMs / 1000)} s` : maskKey(e.message);
    return { error: ('KI-Dienst nicht erreichbar: ' + reason).slice(0, 300) };
  } finally {
    clearTimeout(timer);
  }
  let data = null;
  try { data = await res.json(); } catch { /* Nicht-JSON-Antwort → generische Meldung unten */ }
  if (!res.ok) {
    // Upstream-Meldung durchreichen (Konzept), aber ohne Key-Leak und gekürzt
    return { error: ('KI-Dienst antwortete mit Fehler: ' + maskKey(data?.error?.message || 'HTTP ' + res.status)).slice(0, 300) };
  }
  return { data };
}

/**
 * parts-Validierung: Array, jedes Element GENAU {text} oder {inlineData:{mimeType,data}}
 * (das Format ist der Gemini-Vertrag des Bildstudios — 1:1 durchgereicht, aber geprüft).
 * @returns {string|null} deutsche Fehlermeldung oder null (gültig)
 */
export function validateParts(parts) {
  if (!Array.isArray(parts) || parts.length === 0) return 'parts (nicht-leeres Array) erforderlich';
  for (const p of parts) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) return 'Jeder part muss ein Objekt sein';
    const keys = Object.keys(p);
    if (keys.length !== 1 || !['text', 'inlineData'].includes(keys[0])) {
      return 'Jeder part erlaubt genau EIN Feld: {text} oder {inlineData}';
    }
    if (keys[0] === 'text' && typeof p.text !== 'string') return 'part.text muss ein String sein';
    if (keys[0] === 'inlineData') {
      const d = p.inlineData;
      if (!d || typeof d !== 'object' || Array.isArray(d)
        || typeof d.mimeType !== 'string' || typeof d.data !== 'string'
        || Object.keys(d).some(k => !['mimeType', 'data'].includes(k))) {
        return 'part.inlineData braucht genau {mimeType, data} (beides Strings)';
      }
    }
  }
  return null;
}

/**
 * Kontingent-Prüfung + Increment (gemeinsam für Text/Bild).
 * Der Zähler wird VOR dem Upstream-Call erhöht, nicht erst bei Erfolg: ein
 * fehlgeschlagener Upstream zählt bewusst trotzdem — sonst könnte ein Client
 * bei 502 unbegrenzt „gratis" retryen (Retry-Sturm = Kosten ohne Bremse).
 * @returns {{limited:{status:429,error,remaining:0}}} oder {{remaining:number}}
 */
async function checkAndCount(userId, art, limit) {
  const day = todayKey();
  const usage = await getUsage(userId, day);
  const used = art === 'image' ? usage.image_calls : usage.text_calls;
  if (used >= limit) {
    const was = art === 'image' ? 'Bild' : 'Text';
    return { limited: { status: 429, error: `Tageslimit von ${limit} ${was}-Anfragen erreicht — morgen wieder`, remaining: 0 } };
  }
  const after = await incrementUsage(userId, day, art);
  return { remaining: Math.max(0, limit - (art === 'image' ? after.image_calls : after.text_calls)) };
}

/**
 * POST /api/ai/text: {prompt} → {text}. Erwartbare Fehler als {status, error}
 * (Routen-Muster von services/auth), Erfolg als {status:200, text, remaining}.
 */
export async function proxyText({ prompt, userId }) {
  if (!config.geminiApiKey) {
    return { status: 503, error: 'KI-Proxy inaktiv (kein Server-Key konfiguriert) — bitte eigenen Gemini-Key nutzen' };
  }
  if (typeof prompt !== 'string' || !prompt.trim()) return { status: 400, error: 'prompt (nicht-leerer String) erforderlich' };

  const quota = await checkAndCount(userId, 'text', config.aiProxyTextPerDay);
  if (quota.limited) return quota.limited;

  const startedAt = Date.now();
  const r = await callGemini('gemini-2.5-flash', { contents: [{ parts: [{ text: prompt }] }] }, TEXT_TIMEOUT_MS);
  if (r.error) {
    logCall('text', userId, startedAt, r.error);
    return { status: 502, error: r.error, remaining: quota.remaining };
  }
  // Antwort-Text exakt wie das Frontend extrahieren (js/bildstudio.js): alle text-Parts joinen
  const text = (r.data?.candidates?.[0]?.content?.parts || []).map(p => p.text).filter(Boolean).join('\n');
  if (!text) {
    logCall('text', userId, startedAt, 'Antwort ohne Text');
    return { status: 502, error: 'KI-Dienst lieferte keinen Text', remaining: quota.remaining };
  }
  logCall('text', userId, startedAt, null);
  return { status: 200, text, remaining: quota.remaining };
}

/**
 * POST /api/ai/image: {parts, generationConfig?} → {mimeType, dataBase64}.
 * parts wird validiert (Struktur + Gesamtgröße) und dann 1:1 durchgereicht;
 * responseModalities IMAGE wird serverseitig erzwungen.
 */
export async function proxyImage({ parts, generationConfig, userId }) {
  if (!config.geminiApiKey) {
    return { status: 503, error: 'KI-Proxy inaktiv (kein Server-Key konfiguriert) — bitte eigenen Gemini-Key nutzen' };
  }
  const invalid = validateParts(parts);
  if (invalid) return { status: 400, error: invalid };
  if (generationConfig !== undefined && (typeof generationConfig !== 'object' || generationConfig === null || Array.isArray(generationConfig))) {
    return { status: 400, error: 'generationConfig muss ein Objekt sein (oder weggelassen werden)' };
  }
  if (Buffer.byteLength(JSON.stringify(parts), 'utf8') > MAX_PARTS_BYTES) {
    return { status: 413, error: 'parts überschreiten das Limit von 25 MB' };
  }

  const quota = await checkAndCount(userId, 'image', config.aiProxyImagePerDay);
  if (quota.limited) return quota.limited;

  const startedAt = Date.now();
  const body = {
    contents: [{ parts }],
    generationConfig: { ...(generationConfig || {}), responseModalities: ['IMAGE'] },
  };
  const r = await callGemini('gemini-2.5-flash-image', body, IMAGE_TIMEOUT_MS);
  if (r.error) {
    logCall('image', userId, startedAt, r.error);
    return { status: 502, error: r.error, remaining: quota.remaining };
  }
  // inlineData wie das Frontend extrahieren (beide API-Schreibweisen abdecken)
  const part = r.data?.candidates?.[0]?.content?.parts?.find(p => p.inlineData || p.inline_data);
  const inline = part?.inlineData || part?.inline_data;
  if (!inline?.data) {
    const t = r.data?.candidates?.[0]?.content?.parts?.find(p => p.text)?.text;
    logCall('image', userId, startedAt, 'Antwort ohne Bild');
    return { status: 502, error: 'KI-Dienst lieferte kein Bild' + (t ? ': ' + maskKey(t).slice(0, 80) : ''), remaining: quota.remaining };
  }
  logCall('image', userId, startedAt, null);
  return { status: 200, mimeType: inline.mimeType || inline.mime_type || 'image/png', dataBase64: inline.data, remaining: quota.remaining };
}
