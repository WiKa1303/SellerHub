// Logging-Strategie: menschenlesbar in Dev, JSON-Zeilen in Produktion
// (LOG_FORMAT=json → maschinenlesbar für Railway/Render/Betterstack & Co.).
// API bleibt log.info/warn/error — Aufrufer merken vom Format nichts.
const asJson = process.env.LOG_FORMAT === 'json';

function emit(level, args) {
  const ts = new Date().toISOString();
  if (asJson) {
    console.log(JSON.stringify({ ts, level, msg: args.map(a => a instanceof Error ? a.stack : typeof a === 'string' ? a : JSON.stringify(a)).join(' ') }));
  } else {
    console.log(ts, level.toUpperCase().padEnd(5), ...args);
  }
}

export const log = {
  info: (...a) => emit('info', a),
  warn: (...a) => emit('warn', a),
  error: (...a) => emit('error', a),
};
