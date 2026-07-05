// ═══ Alert-Dispatcher — Push-Zustellung (Phase 5) ═══
// Arbeitet die Zustell-Queue ab (alerts.delivered_at IS NULL). Kanäle per ENV,
// beide fail-soft:
//   PUSH_WEBHOOK_URL  generischer JSON-POST {title, severity, url, published_at, source}
//   PUSH_NTFY_TOPIC   POST an https://ntfy.sh/<topic> (kontofrei — Topic in der ntfy-App abonnieren)
// Regeln:
//   - Kein Kanal konfiguriert → sauberer Skip mit Log, Queue bleibt stehen (Degradation).
//   - delivered_at wird NUR bei Erfolg gesetzt (mind. 1 Kanal ok) → automatischer Retry.
//   - Nach DISPATCH_MAX_ATTEMPTS Fehlversuchen wird der Alert mit Vermerk aufgegeben
//     (delivered_at + delivery_note), damit die Queue nicht ewig wächst.
import { pendingAlerts, markAlertDelivered, bumpAlertAttempts } from '../../data/db.js';
import { config } from '../../core/config.js';
import { log } from '../../core/logger.js';

export const dispatchState = { lastRun: null, delivered: 0, failed: 0, givenUp: 0, channels: [] };

// Cap pro Lauf: mehr als 20 Pushes auf einmal sind Spam, nicht Information —
// der Rest bleibt in der Queue und kommt im nächsten Lauf dran.
export const DISPATCH_MAX_PER_RUN = 20;
// Nach so vielen Fehlversuchen wird ein Alert aufgegeben (Queue-Hygiene).
export const DISPATCH_MAX_ATTEMPTS = 5;

// Test-Override im Stil von aiClient(mock): dispatchFetch(mock) ersetzt globalThis.fetch.
let fetchImpl = null;
export function dispatchFetch(override) { fetchImpl = override; return fetchImpl; }
const doFetch = (url, opts) => (fetchImpl || globalThis.fetch)(url, opts);

/** Kanal 1: generischer JSON-Webhook. Nicht-2xx = Fehler (Retry im nächsten Lauf). */
async function sendWebhook(alert) {
  const res = await doFetch(config.pushWebhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: alert.title,
      severity: alert.alert_level,
      url: alert.url,
      published_at: alert.publish_date,
      source: alert.source,
    }),
    signal: AbortSignal.timeout(config.fetchTimeoutMs),
  });
  if (!res.ok) throw new Error(`Webhook antwortete HTTP ${res.status}`);
}

/** Kanal 2: ntfy.sh. Title-Header bewusst ASCII-sicher (Level), Details im Body. */
async function sendNtfy(alert) {
  const res = await doFetch('https://ntfy.sh/' + encodeURIComponent(config.pushNtfyTopic), {
    method: 'POST',
    headers: {
      Title: `SellerHub-Alert [${alert.alert_level}]`,
      Priority: alert.alert_level === 'critical' ? 'urgent' : 'default',
    },
    body: `${alert.title}\n${alert.url || ''}`.trim(),
    signal: AbortSignal.timeout(config.fetchTimeoutMs),
  });
  if (!res.ok) throw new Error(`ntfy antwortete HTTP ${res.status}`);
}

/** Ein Dispatcher-Lauf: Queue lesen → zustellen → Erfolg markieren. Läuft NACH dem Alert-Regelwerk. */
export async function dispatchAlerts() {
  dispatchState.lastRun = new Date().toISOString();

  const channels = [];
  if (config.pushWebhookUrl) channels.push(['webhook', sendWebhook]);
  if (config.pushNtfyTopic) channels.push(['ntfy', sendNtfy]);
  dispatchState.channels = channels.map(([name]) => name);
  if (!channels.length) {
    log.info('Alert-Dispatcher: kein Push-Kanal konfiguriert (PUSH_WEBHOOK_URL/PUSH_NTFY_TOPIC) — Zustellung übersprungen, Queue bleibt stehen');
    return { skipped: 'kein Push-Kanal konfiguriert' };
  }

  const queue = await pendingAlerts(DISPATCH_MAX_PER_RUN);
  let delivered = 0, failed = 0, givenUp = 0;

  for (const alert of queue) {
    // Queue-Hygiene: dauerhaft scheiternde Alerts mit Vermerk aufgeben
    if ((alert.attempts || 0) >= DISPATCH_MAX_ATTEMPTS) {
      await markAlertDelivered(alert.id, `Zustellung aufgegeben nach ${alert.attempts} Fehlversuchen`);
      givenUp++;
      log.warn(`Alert-Dispatcher: „${String(alert.title).slice(0, 60)}" nach ${alert.attempts} Fehlversuchen aufgegeben (aus der Queue entfernt)`);
      continue;
    }

    // Jeder Kanal fail-soft; mind. 1 Erfolg = zugestellt
    let ok = false;
    for (const [name, send] of channels) {
      try {
        await send(alert);
        ok = true;
      } catch (e) {
        log.warn(`Alert-Dispatcher: Kanal ${name} fehlgeschlagen für „${String(alert.title).slice(0, 60)}": ${e.message}`);
      }
    }

    if (ok) {
      await markAlertDelivered(alert.id); // NUR bei Erfolg → sonst automatischer Retry
      delivered++;
      log.info(`Alert zugestellt [${alert.alert_level}]: ${String(alert.title).slice(0, 70)}`);
    } else {
      await bumpAlertAttempts(alert.id);
      failed++;
    }
  }

  dispatchState.delivered += delivered;
  dispatchState.failed += failed;
  dispatchState.givenUp += givenUp;
  if (queue.length) log.info(`Alert-Dispatcher: ${delivered} zugestellt, ${failed} fehlgeschlagen (Retry), ${givenUp} aufgegeben — Kanäle: ${dispatchState.channels.join('+')}`);
  return { delivered, failed, givenUp, checked: queue.length };
}
