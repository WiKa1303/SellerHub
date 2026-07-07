// ═══ iCalendar (ICS): Parser + Generator ═══
// Parst externe Kalender-Feeds (Google „Privatadresse im iCal-Format" u. a.) in
// flache Termin-Objekte und erzeugt umgekehrt einen ICS-Feed aus To-Do-Aufgaben.
// Bewusst schlank: VEVENT mit DTSTART/DTEND/SUMMARY/LOCATION/UID, einfache
// RRULEs (DAILY/WEEKLY/MONTHLY/YEARLY mit INTERVAL/COUNT/UNTIL/BYDAY, EXDATE).
// Exotische Regeln degradieren zum ersten Vorkommen — nie hart fehlschlagen.

const DAY_MS = 86400000;
const WEEKDAYS = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 0 };

// ── Zeilen entfalten (RFC 5545: Fortsetzungszeilen beginnen mit Space/Tab) ──
function unfold(text) {
  return String(text).replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');
}

// ── Property-Zeile zerlegen: "DTSTART;TZID=Europe/Berlin:20260707T090000" ──
function parseLine(line) {
  const idx = line.indexOf(':');
  if (idx < 0) return null;
  const left = line.slice(0, idx);
  const value = line.slice(idx + 1);
  const [name, ...paramParts] = left.split(';');
  const params = {};
  for (const p of paramParts) {
    const eq = p.indexOf('=');
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1);
  }
  return { name: name.toUpperCase(), params, value };
}

// ── Zeitzonen-Offset (Minuten) einer IANA-Zone zu einem UTC-Zeitpunkt ──
function tzOffsetMin(tz, utcDate) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(utcDate);
    const g = t => parseInt(parts.find(p => p.type === t).value, 10);
    const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'), g('second'));
    return Math.round((asUtc - utcDate.getTime()) / 60000);
  } catch (e) { return 0; } // unbekannte Zone → wie UTC behandeln
}

// ── DT-Wert nach Date (UTC) — Formen: 20260707 | 20260707T120000Z | 20260707T120000(+TZID) ──
function parseDt(value, params = {}) {
  const m = String(value).match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  const allDay = (params.VALUE === 'DATE') || h === undefined;
  if (allDay) return { date: new Date(Date.UTC(+y, +mo - 1, +d)), allDay: true };
  const wall = Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s || 0));
  if (z) return { date: new Date(wall), allDay: false };
  if (params.TZID) {
    // Wandzeit in TZID → UTC: Offset am (ungefähren) Zeitpunkt bestimmen, zweimal stabilisieren
    let utc = wall - tzOffsetMin(params.TZID, new Date(wall)) * 60000;
    utc = wall - tzOffsetMin(params.TZID, new Date(utc)) * 60000;
    return { date: new Date(utc), allDay: false };
  }
  // „floating time" ohne Zone: als UTC interpretieren (selten; besser als verwerfen)
  return { date: new Date(wall), allDay: false };
}

// ── Kalendertag 'YYYY-MM-DD' eines Zeitpunkts in einer Anzeige-Zeitzone ──
export function dayInTz(date, tz = 'Europe/Berlin') {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  return parts; // en-CA liefert bereits YYYY-MM-DD
}

const isoDay = d => d.toISOString().slice(0, 10);

// ── RRULE parsen: "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;UNTIL=20261231T235959Z" ──
function parseRrule(value) {
  const r = {};
  for (const part of String(value).split(';')) {
    const [k, v] = part.split('=');
    if (k && v !== undefined) r[k.toUpperCase()] = v;
  }
  return r;
}

// ── Wiederholungen ins Fenster expandieren (gedeckelt, fail-soft) ──
function expandRrule(rrule, start, windowStart, windowEnd, maxInstances) {
  const freq = rrule.FREQ;
  const interval = Math.max(1, parseInt(rrule.INTERVAL || '1', 10) || 1);
  const count = rrule.COUNT ? parseInt(rrule.COUNT, 10) : null;
  let until = null;
  if (rrule.UNTIL) { const u = parseDt(rrule.UNTIL); if (u) until = u.date; }
  const out = [];
  const push = d => { if (d >= windowStart && d <= windowEnd) out.push(new Date(d)); };

  if (freq === 'WEEKLY') {
    const bydays = (rrule.BYDAY ? rrule.BYDAY.split(',') : [])
      .map(s => WEEKDAYS[s.replace(/^[+-]?\d+/, '')]).filter(v => v !== undefined);
    const days = bydays.length ? bydays : [start.getUTCDay()];
    // Wochenanker = Montag der Startwoche
    const anchor = new Date(start.getTime() - ((start.getUTCDay() + 6) % 7) * DAY_MS);
    let produced = 0;
    for (let w = 0; w < 750 && produced < (count || 750); w++) {
      const weekStart = new Date(anchor.getTime() + w * interval * 7 * DAY_MS);
      if (weekStart > windowEnd && weekStart > start) break;
      for (const dow of [1, 2, 3, 4, 5, 6, 0]) { // Mo..So in Kalenderreihenfolge
        if (!days.includes(dow)) continue;
        const off = (dow + 6) % 7;
        const inst = new Date(weekStart.getTime() + off * DAY_MS);
        // Uhrzeit des Originals übernehmen
        inst.setUTCHours(start.getUTCHours(), start.getUTCMinutes(), start.getUTCSeconds(), 0);
        if (inst < start) continue;
        if (until && inst > until) return out;
        produced++;
        if (count && produced > count) return out;
        push(inst);
        if (out.length >= maxInstances) return out;
      }
    }
    return out;
  }

  // DAILY / MONTHLY / YEARLY: schrittweise vom Start aus
  let i = 0;
  for (let n = 0; n < 1000; n++) {
    let inst;
    if (freq === 'DAILY') inst = new Date(start.getTime() + n * interval * DAY_MS);
    else if (freq === 'MONTHLY') {
      inst = new Date(start); inst.setUTCMonth(start.getUTCMonth() + n * interval);
      if (inst.getUTCDate() !== start.getUTCDate()) continue; // Monat ohne diesen Tag (31.) überspringen
    } else if (freq === 'YEARLY') {
      inst = new Date(start); inst.setUTCFullYear(start.getUTCFullYear() + n * interval);
    } else return [start]; // unbekannte FREQ → nur Erstvorkommen
    if (until && inst > until) break;
    i++;
    if (count && i > count) break;
    if (inst > windowEnd) break;
    push(inst);
    if (out.length >= maxInstances) break;
  }
  return out;
}

// ═══ Haupteinstieg: ICS-Text → Termin-Liste ═══
// Fenster: [heute−pastDays, heute+futureDays]; Ausgabeform passend zur
// calendar_events-Tabelle (uid/title/location/startDay/endDay/startTs/endTs/allDay).
export function parseIcs(text, { now = new Date(), pastDays = 60, futureDays = 400, maxEvents = 2000, tz = 'Europe/Berlin' } = {}) {
  const windowStart = new Date(now.getTime() - pastDays * DAY_MS);
  const windowEnd = new Date(now.getTime() + futureDays * DAY_MS);
  const lines = unfold(text);
  const events = [];
  let cur = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (line === 'BEGIN:VEVENT') { cur = { exdates: [] }; continue; }
    if (line === 'END:VEVENT') {
      if (cur && cur.start && cur.summary !== undefined && cur.status !== 'CANCELLED') finishEvent(cur);
      cur = null; continue;
    }
    if (!cur) continue;
    const p = parseLine(line);
    if (!p) continue;
    switch (p.name) {
      case 'UID': cur.uid = p.value; break;
      case 'SUMMARY': cur.summary = unescapeText(p.value); break;
      case 'LOCATION': cur.location = unescapeText(p.value); break;
      case 'STATUS': cur.status = p.value.toUpperCase(); break;
      case 'DTSTART': cur.start = parseDt(p.value, p.params); break;
      case 'DTEND': cur.end = parseDt(p.value, p.params); break;
      case 'RRULE': cur.rrule = parseRrule(p.value); break;
      case 'RECURRENCE-ID': cur.recurId = p.value; break;
      case 'EXDATE': for (const v of p.value.split(',')) { const d = parseDt(v, p.params); if (d) cur.exdates.push(d.date.getTime()); } break;
    }
  }

  function finishEvent(ev) {
    if (events.length >= maxEvents) return;
    const allDay = ev.start.allDay;
    const durMs = ev.end ? Math.max(0, ev.end.date - ev.start.date) : (allDay ? DAY_MS : 0);
    const baseUid = ev.uid || ('noid-' + events.length);
    const uidSuffix = ev.recurId ? ':' + ev.recurId : '';

    const emit = (startDate) => {
      if (events.length >= maxEvents) return;
      const endDate = new Date(startDate.getTime() + durMs);
      const startDay = allDay ? isoDay(startDate) : dayInTz(startDate, tz);
      // DTEND ist bei Ganztags-Terminen exklusiv → letzter Tag = Ende − 1
      const endDay = allDay
        ? isoDay(new Date(Math.max(startDate.getTime(), endDate.getTime() - DAY_MS)))
        : dayInTz(new Date(Math.max(startDate.getTime(), endDate.getTime() - 1)), tz);
      events.push({
        uid: (baseUid + uidSuffix + (ev.rrule ? '@' + startDate.getTime() : '')).slice(0, 500),
        title: (ev.summary || '(ohne Titel)').slice(0, 300),
        location: ev.location ? ev.location.slice(0, 300) : null,
        startDay, endDay,
        startTs: allDay ? null : startDate.toISOString(),
        endTs: allDay ? null : endDate.toISOString(),
        allDay,
      });
    };

    if (ev.rrule && ev.rrule.FREQ) {
      const maxInst = 250;
      let starts = [];
      try { starts = expandRrule(ev.rrule, ev.start.date, windowStart, windowEnd, maxInst); }
      catch (e) { starts = [ev.start.date]; }
      for (const s of starts) {
        if (ev.exdates.some(x => Math.abs(x - s.getTime()) < 1000)) continue;
        emit(s);
      }
    } else {
      // Einzeltermin nur im Fenster übernehmen
      const endGuess = new Date(ev.start.date.getTime() + durMs);
      if (endGuess >= windowStart && ev.start.date <= windowEnd) emit(ev.start.date);
    }
  }

  return events;
}

// ── ICS-Text-Escaping (RFC 5545 §3.3.11) ──
function unescapeText(v) { return String(v).replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1'); }
function escapeText(v) { return String(v).replace(/\\/g, '\\\\').replace(/([,;])/g, '\\$1').replace(/\n/g, '\\n'); }

// ═══ Gegenrichtung: To-Do-Aufgaben → ICS-Feed (für Abo in Google Kalender) ═══
// tasks: [{id, title, due_date 'YYYY-MM-DD', due_time 'HH:MM'|null, list_name}]
export function tasksToIcs(tasks, { calName = 'SellerHub To-Do' } = {}) {
  const nowStamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const L = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//AMZ SellerHub//To-Do//DE',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:' + escapeText(calName), 'X-WR-TIMEZONE:Europe/Berlin',
  ];
  for (const t of tasks) {
    const day = String(t.due_date || '').replace(/-/g, '');
    if (!/^\d{8}$/.test(day)) continue;
    L.push('BEGIN:VEVENT');
    L.push('UID:task-' + t.id + '@amzsellerhub.de');
    L.push('DTSTAMP:' + nowStamp);
    if (t.due_time && /^\d{2}:\d{2}/.test(t.due_time)) {
      // Termin mit Uhrzeit: 1 h Dauer, deutsche Zeit
      const hm = t.due_time.replace(':', '') + '00';
      const endH = String((parseInt(t.due_time.slice(0, 2), 10) + 1) % 24).padStart(2, '0');
      L.push('DTSTART;TZID=Europe/Berlin:' + day + 'T' + hm);
      L.push('DTEND;TZID=Europe/Berlin:' + day + 'T' + endH + t.due_time.slice(3, 5) + '00');
    } else {
      // Ganztags (DTEND exklusiv = Folgetag)
      const d = new Date(Date.UTC(+day.slice(0, 4), +day.slice(4, 6) - 1, +day.slice(6, 8)) + DAY_MS);
      L.push('DTSTART;VALUE=DATE:' + day);
      L.push('DTEND;VALUE=DATE:' + isoDay(d).replace(/-/g, ''));
    }
    L.push('SUMMARY:' + escapeText('☑ ' + t.title));
    if (t.list_name) L.push('CATEGORIES:' + escapeText(t.list_name));
    L.push('END:VEVENT');
  }
  L.push('END:VCALENDAR');
  // RFC verlangt CRLF; Zeilen >75 Oktette falten wir pragmatisch nicht (Google akzeptiert das)
  return L.join('\r\n') + '\r\n';
}
