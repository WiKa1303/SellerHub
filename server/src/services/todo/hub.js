// ═══ TODO: SSE-Hub (Echtzeit-Updates) ═══
// In-Memory-Verteiler je Nutzer. Ein Prozess = eine Instanz (Railway Hobby) —
// bei Multi-Instanz später Redis-PubSub davorschalten. Clients ohne offene
// Verbindung verpassen nichts Dauerhaftes: der Delta-Sync (?since=) holt beim
// Reconnect alles nach; SSE ist nur der „sofort"-Kanal.
import { log } from '../../core/logger.js';

const subscribers = new Map(); // userId → Set<res>
let heartbeatTimer = null;

export const hubState = { connections: 0, sent: 0 };

/** SSE-Response registrieren; Rückgabe = Abmelde-Funktion. */
export function subscribe(userId, res) {
  if (!subscribers.has(userId)) subscribers.set(userId, new Set());
  subscribers.get(userId).add(res);
  hubState.connections++;
  if (!heartbeatTimer) {
    // Kommentar-Zeile alle 25 s hält Proxies/Load-Balancer die Verbindung offen
    heartbeatTimer = setInterval(() => {
      for (const set of subscribers.values()) {
        for (const r of set) { try { r.write(': ping\n\n'); } catch { /* close räumt auf */ } }
      }
    }, 25000);
    heartbeatTimer.unref && heartbeatTimer.unref();
  }
  return () => {
    const set = subscribers.get(userId);
    if (set) {
      set.delete(res);
      if (!set.size) subscribers.delete(userId);
    }
    hubState.connections = Math.max(0, hubState.connections - 1);
  };
}

/** Event an eine Nutzer-Menge senden (z. B. alle Mitglieder einer Liste). */
export function publish(userIds, event) {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const uid of userIds) {
    const set = subscribers.get(uid);
    if (!set) continue;
    for (const res of set) {
      try { res.write(payload); hubState.sent++; }
      catch (e) { log.warn('SSE-Schreibfehler:', e.message); }
    }
  }
}
