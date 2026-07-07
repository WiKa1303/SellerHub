// ═══ AUTH-SERVICE: Konten, Sessions, Login-Schutz (KONZEPT-Konten-Sync.md, Modul 1) ═══
// Bewusst OHNE neue Dependencies: Passwort-Hashing mit crypto.scrypt (Node-Bordmittel),
// Sessions als opake Zufalls-Tokens (kein JWT nötig — widerrufbar per DB-Delete).
// Kein AI-Modul → NICHT in der Intelligence-Registry; Sichtbarkeit über /internal.
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { config } from '../../core/config.js';
import { log } from '../../core/logger.js';
import {
  createUser, findByEmail, findById, listUsers, updateLastLogin, updatePassword, updateRole,
  createSession, findValidSession, touchSession, deleteSession, deleteSessionsForUser,
} from '../../data/db.js';

const scrypt = promisify(crypto.scrypt);

// Session-Laufzeit: 30 Tage, GLEITEND — jede authentifizierte Nutzung verlängert.
export const SESSION_TTL_MS = 30 * 864e5;

// ── Passwort-Hashing (scrypt, Format: salt$hash — beides hex) ──

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64);
  return salt + '$' + hash.toString('hex');
}

/** Konstantzeit-Vergleich (timingSafeEqual) — kein Timing-Leck beim Login. */
export async function verifyPassword(password, stored) {
  const [salt, hex] = String(stored || '').split('$');
  if (!salt || !hex) return false;
  const expected = Buffer.from(hex, 'hex');
  const actual = await scrypt(password, salt, expected.length || 64);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// ── Login-Rate-Limit: max. 10 Fehlversuche / 15 min je E-Mail ──
// BEWUSST in-memory (Map) = pro Prozess: bei 1 Kombi-Prozess (heutiger Betrieb) exakt,
// beim späteren API-Split nur je Instanz — fail-soft und für Brute-Force-Bremsung genug.
// Kein Redis dafür anschaffen, solange 1 Prozess läuft (Tech-Debt-Register-Muster).
const LOGIN_MAX_FAILS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const loginFails = new Map(); // email → { count, windowStart }

function loginBlocked(email) {
  const e = loginFails.get(email);
  if (!e) return false;
  if (Date.now() - e.windowStart > LOGIN_WINDOW_MS) { loginFails.delete(email); return false; }
  return e.count >= LOGIN_MAX_FAILS;
}
function noteLoginFail(email) {
  const e = loginFails.get(email);
  if (!e || Date.now() - e.windowStart > LOGIN_WINDOW_MS) loginFails.set(email, { count: 1, windowStart: Date.now() });
  else e.count++;
}
/** Nur für Tests: Limiter-Zustand zurücksetzen. */
export function _resetLoginLimiter() { loginFails.clear(); }

// ── SSE-Einmal-Tickets ──
// EventSource kann keine Header setzen. Statt das 30-Tage-Bearer-Token in die URL zu
// legen (?auth=… → landet in Railway-/Proxy-Access-Logs und der Browser-History), tauscht
// der Client sein Token per POST gegen ein kurzlebiges Einmal-Ticket, das NUR für den
// SSE-Connect gilt. In-memory (1 Prozess) wie der Login-Limiter — fail-soft, kein Redis.
const SSE_TICKET_TTL_MS = 60 * 1000;
const sseTickets = new Map(); // ticket → { userId, expiresAt }
export function issueSseTicket(userId) {
  // Gelegentlicher Sweep abgelaufener, nie eingelöster Tickets (verhindert Leak).
  if (sseTickets.size > 1000) {
    const now = Date.now();
    for (const [k, v] of sseTickets) if (now > v.expiresAt) sseTickets.delete(k);
  }
  const ticket = crypto.randomBytes(24).toString('hex');
  sseTickets.set(ticket, { userId, expiresAt: Date.now() + SSE_TICKET_TTL_MS });
  return ticket;
}
/** Ticket → userId (oder null). Einmal-Nutzung: wird beim Einlösen sofort verbraucht. */
export function consumeSseTicket(ticket) {
  const e = sseTickets.get(String(ticket || ''));
  if (!e) return null;
  sseTickets.delete(String(ticket));
  if (Date.now() > e.expiresAt) return null;
  return e.userId;
}
/** Nur für Tests: Ticket-Store leeren. */
export function _resetSseTickets() { sseTickets.clear(); }

// ── Hilfen ──

const normEmail = (e) => String(e || '').trim().toLowerCase();
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
/** Nur öffentliche Felder — password_hash verlässt NIE den Service. */
const publicUser = (u) => ({
  id: u.id, email: u.email, displayName: u.display_name, role: u.role,
  createdAt: u.created_at, lastLoginAt: u.last_login_at,
});

// ── Anwendungsfälle (Routen delegieren hierher; erwartbare Fehler als {status, error}) ──

/** Registrierung — nur mit gültigem Einladungscode (ENV REGISTRATION_CODE). */
export async function registerUser({ email, password, displayName, inviteCode }) {
  // Leerer/ungesetzter Code = Registrierung bewusst geschlossen (kein offenes SaaS in v1).
  if (!config.registrationCode) return { status: 403, error: 'Registrierung ist geschlossen' };
  if (inviteCode !== config.registrationCode) return { status: 403, error: 'Ungültiger Einladungscode' };
  const mail = normEmail(email);
  if (!validEmail(mail)) return { status: 400, error: 'Gültige E-Mail-Adresse erforderlich' };
  if (typeof password !== 'string' || password.length < 8) {
    return { status: 400, error: 'Passwort muss mindestens 8 Zeichen haben' };
  }
  if (await findByEmail(mail)) return { status: 409, error: 'E-Mail ist bereits registriert' };
  try {
    const user = await createUser({
      id: crypto.randomUUID(), email: mail,
      passwordHash: await hashPassword(password),
      displayName: String(displayName || '').trim().slice(0, 100) || null,
    });
    log.info(`Auth: neues Konto ${mail}`);
    return { status: 201, user: publicUser(user) };
  } catch (e) {
    if (e.code === '23505') return { status: 409, error: 'E-Mail ist bereits registriert' }; // Rennen
    throw e;
  }
}

/** Login → { token, user }. Token verlässt den Server GENAU EINMAL — DB kennt nur den Hash. */
export async function loginUser({ email, password }) {
  const mail = normEmail(email);
  if (loginBlocked(mail)) {
    return { status: 429, error: 'Zu viele Fehlversuche — bitte in 15 Minuten erneut versuchen' };
  }
  const user = await findByEmail(mail);
  // Bewusst dieselbe Antwort für „unbekannte E-Mail" und „falsches Passwort" (kein User-Enumeration).
  if (!user || !(await verifyPassword(String(password || ''), user.password_hash))) {
    noteLoginFail(mail);
    return { status: 401, error: 'E-Mail oder Passwort falsch' };
  }
  loginFails.delete(mail);
  const token = crypto.randomBytes(32).toString('hex');
  await createSession({
    tokenHash: sha256(token), userId: user.id,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
  await updateLastLogin(user.id);
  log.info(`Auth: Login ${mail}`);
  return { status: 200, token, user: publicUser(user) };
}

/** Logout: Session serverseitig widerrufen. */
export async function logoutSession(tokenHash) {
  await deleteSession(tokenHash);
}

/** Passwort ändern (eingeloggt): aktuelles Passwort muss stimmen. */
export async function changePassword(user, currentPassword, newPassword) {
  const row = await findByEmail(user.email);
  if (!row || !(await verifyPassword(String(currentPassword || ''), row.password_hash))) {
    return { status: 401, error: 'Aktuelles Passwort ist falsch' };
  }
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    return { status: 400, error: 'Neues Passwort muss mindestens 8 Zeichen haben' };
  }
  await updatePassword(row.id, await hashPassword(newPassword));
  log.info(`Auth: Passwort geändert für ${row.email}`);
  return { status: 200, ok: true };
}

// ── Nutzer-Admin (Modul 4) — Betreiber-Funktionen; die Routen prüfen den ADMIN_KEY ──

// UUID-Format vorab prüfen: sonst wirft Postgres bei kaputten IDs (uuid-Spalte) einen 500er.
const validId = (id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || ''));

/** Alle Konten (öffentliche Felder) — für die Betreiber-Übersicht. */
export async function adminListUsers() {
  return (await listUsers()).map(publicUser);
}

/** Passwort-Reset durch den Betreiber: setzt neu UND widerruft alle Sessions des Kontos. */
export async function adminResetPassword(userId, newPassword) {
  if (!validId(userId)) return { status: 404, error: 'Konto nicht gefunden' };
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    return { status: 400, error: 'Neues Passwort muss mindestens 8 Zeichen haben' };
  }
  const user = await findById(userId);
  if (!user) return { status: 404, error: 'Konto nicht gefunden' };
  await updatePassword(user.id, await hashPassword(newPassword));
  const revoked = await deleteSessionsForUser(user.id);
  log.info(`Auth: Admin-Passwort-Reset für ${user.email} (${revoked} Session(s) widerrufen)`);
  return { status: 200, ok: true, revokedSessions: revoked };
}

/** Rolle setzen ('user' | 'admin') — z. B. Betreiber-Konto zum Admin machen. */
export async function adminSetRole(userId, role) {
  if (role !== 'user' && role !== 'admin') return { status: 400, error: 'Rolle muss "user" oder "admin" sein' };
  if (!validId(userId)) return { status: 404, error: 'Konto nicht gefunden' };
  if (!(await updateRole(userId, role))) return { status: 404, error: 'Konto nicht gefunden' };
  log.info(`Auth: Rolle geändert → ${role} (${userId})`);
  return { status: 200, ok: true };
}

// ── Express-Middleware: Authorization: Bearer <token> → req.user ──

export async function authMiddleware(req, res, next) {
  try {
    const m = /^Bearer\s+(\S+)$/i.exec(req.get('Authorization') || '');
    if (!m) return res.status(401).json({ error: 'Anmeldung erforderlich' });
    const tokenHash = sha256(m[1]);
    const s = await findValidSession(tokenHash, new Date());
    if (!s) return res.status(401).json({ error: 'Sitzung ungültig oder abgelaufen' });
    // Gleitende 30 Tage — fail-soft: ein fehlgeschlagenes Touch bricht keinen Request.
    touchSession(tokenHash, new Date(), new Date(Date.now() + SESSION_TTL_MS))
      .catch((e) => log.warn('Auth: touchSession fehlgeschlagen:', e.message));
    req.user = { id: s.user_id, email: s.email, displayName: s.display_name, role: s.role };
    req.sessionTokenHash = tokenHash;
    next();
  } catch (e) {
    log.error('Auth-Middleware-Fehler:', e.stack || e.message);
    res.status(500).json({ error: 'Interner Fehler' });
  }
}
