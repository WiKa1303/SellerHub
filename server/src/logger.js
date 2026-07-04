// Mini-Logger: Zeitstempel + Level, mehr braucht der MVP nicht.
// Railway/Render sammeln stdout automatisch ein.
function ts() { return new Date().toISOString(); }
export const log = {
  info: (...a) => console.log(ts(), 'INFO ', ...a),
  warn: (...a) => console.warn(ts(), 'WARN ', ...a),
  error: (...a) => console.error(ts(), 'ERROR', ...a),
};
