// ═══ DATA LAYER — Fassade ═══
// Schema/Pool: schema.js · Queries: repos/ je Domäne (einzige SQL-Stellen).
// Diese Fassade hält alle bestehenden Importe stabil (`from '../data/db.js'`).
// Neue Repos: Datei unter repos/ anlegen und hier re-exportieren.
export { initDb, db } from './schema.js';
export * from './repos/items.js';
export * from './repos/trends.js';
export * from './repos/alerts.js';
export * from './repos/strategy.js';
export * from './repos/ai-calls.js';
export * from './repos/forecast.js';
export * from './repos/users.js';
export * from './repos/sessions.js';
export * from './repos/userData.js';
export * from './repos/aiUsage.js';
export * from './repos/importCache.js';
