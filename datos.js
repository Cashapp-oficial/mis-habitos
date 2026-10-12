/*
  Datos: funciones puras sobre la lista de hábitos y las marcas. No tocan la
  pantalla ni la base, así se pueden probar y reusar (la vista Mes sale de monthStats).

  Forma de los datos:
    habits: [{ id, name, cat, freq? }]
      freq: { type: 'daily' }                 todos los días (es lo que vale si no hay freq)
            { type: 'weekly', times: 1..6 }   X veces por semana, cualquier día
            { type: 'days', days: [0..6] }    días fijos; 0 = lunes, 6 = domingo
    logs:   { "2026-10": { "2026-10-11": { idHabito: 1 | 0 } } }   1 = hecho, 0 = no hecho
    tasks:  { "2026-10-06": [{ id, text, done }] }   pendientes, por el lunes de su semana
*/

import { addDays, isValidDate, pad, parse, weekStartOf } from './fechas.js';

export var CATS = [
  { key: 'ejercicio', label: 'Ejercicio' },
  { key: 'cuidado', label: 'Cuidado personal' },
  { key: 'trabajo', label: 'Trabajo' }
];

export function validHabit(h) {
  return !!h && typeof h.id === 'string' && h.id.length > 0 && h.id.length <= 64 &&
    typeof h.name === 'string' && h.name.trim().length > 0 &&
    CATS.some(function (c) { return c.key === h.cat; }) &&
    (h.freq === undefined || validFreq(h.freq));
}
export function cleanHabit(h) {
  var out = { id: h.id, name: h.name.trim().slice(0, 60), cat: h.cat };
  var f = freqOf(h);
  if (f.type !== 'daily') out.freq = f;
  return out;
}

/* ---------- frecuencia ---------- */

function validFreq(f) {
  if (!f || typeof f !== 'object') return false;
  if (f.type === 'daily') return true;
  if (f.type === 'weekly') return Number.isInteger(f.times) && f.times >= 1 && f.times <= 6;
  if (f.type === 'days') {
    return Array.isArray(f.days) && f.days.length >= 1 && f.days.length <= 7 &&
      f.days.every(function (d) { return Number.isInteger(d) && d >= 0 && d <= 6; });
  }
  return false;
}
export function freqOf(h) {
  var f = h && h.freq;
  if (!validFreq(f) || f.type === 'daily') return { type: 'daily' };
  if (f.type === 'weekly') return { type: 'weekly', times: f.times };
  return { type: 'days', days: f.days.filter(function (d, i, a) { return a.indexOf(d) === i; }).sort() };
}
/** 0 = lunes ... 6 = domingo. */
export function weekday(date) { return (parse(date).getUTCDay() + 6) % 7; }

/** ¿Ese día le toca? Los de "X veces por semana" no tienen días fijos: nunca "tocan". */
export function isScheduled(h, date) {
  var f = freqOf(h);
  if (f.type === 'daily') return true;
  if (f.type === 'days') return f.days.indexOf(weekday(date)) >= 0;
  return false;
}
/** ¿Entra en la cuenta de ese día? Si le toca, o si lo hiciste igual. */
export function countsOn(logs, h, date) {
  return isScheduled(h, date) || getVal(logs, date, h.id) === 1;
}
/** Cuántas veces se hizo en la semana que empieza en ws, hasta upTo (inclusive). */
export function weekCount(logs, h, ws, upTo) {
  var n = 0;
  for (var i = 0; i < 7; i++) {
    var d = addDays(ws, i);
    if (upTo && d > upTo) break;
    if (getVal(logs, d, h.id) === 1) n++;
  }
  return n;
}

var WD_CORTO = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
/** Texto corto de la frecuencia: "todos los días", "3 por semana", "L M V". */
export function freqLabel(h) {
  var f = freqOf(h);
  if (f.type === 'daily') return 'todos los días';
  if (f.type === 'weekly') return f.times + (f.times === 1 ? ' vez' : ' veces') + ' por semana';
  if (f.days.length === 7) return 'todos los días';
  if (f.days.join() === '0,1,2,3,4') return 'de lunes a viernes';
  if (f.days.join() === '5,6') return 'fines de semana';
  return f.days.map(function (d) { return WD_CORTO[d]; }).join(' ');
}

export function getVal(logs, date, id) {
  var m = logs[date.slice(0, 7)];
  var day = m && m[date];
  return day && Object.prototype.hasOwnProperty.call(day, id) ? day[id] : undefined;
}

/**
 * Racha hasta esa fecha, según la frecuencia del hábito:
 * - todos los días o días fijos: días seguidos hechos, contando solo los días
 *   que tocan (los que no tocan no la cortan). Si ese día todavía no está
 *   hecho, no la corta: se cuenta desde el anterior.
 * - X veces por semana: semanas seguidas cumpliendo la meta. La semana en
 *   curso suma si ya la cumpliste y, si no, todavía no corta nada.
 * Devuelve { n, unit } con unit 'd' (días) o 'sem' (semanas).
 */
export function streak(logs, h, date) {
  var f = freqOf(h);
  if (f.type === 'weekly') {
    var ws = weekStartOf(date), n = 0;
    if (weekCount(logs, h, ws, date) >= f.times) n++;
    ws = addDays(ws, -7);
    while (n < 520 && weekCount(logs, h, ws) >= f.times) { n++; ws = addDays(ws, -7); }
    return { n: n, unit: 'sem' };
  }
  var d = date, k = 0;
  if (getVal(logs, d, h.id) !== 1) d = addDays(d, -1);
  var count = 0;
  while (k++ < 3650) {
    if (getVal(logs, d, h.id) === 1) count++;
    else if (isScheduled(h, d)) break;
    d = addDays(d, -1);
  }
  return { n: count, unit: 'd' };
}

/** Primer día con alguna marca de ese hábito, o null. */
function firstMark(logs, id) {
  var months = Object.keys(logs).sort();
  for (var i = 0; i < months.length; i++) {
    var days = Object.keys(logs[months[i]]).sort();
    for (var j = 0; j < days.length; j++) {
      if (Object.prototype.hasOwnProperty.call(logs[months[i]][days[j]], id)) return days[j];
    }
  }
  return null;
}

/** La racha más larga de toda la historia, con la misma regla que streak(). */
export function bestStreak(logs, h, today) {
  var f = freqOf(h), start = firstMark(logs, h.id);
  if (!start || start > today) return { n: 0, unit: f.type === 'weekly' ? 'sem' : 'd' };
  var best = 0, run = 0;
  if (f.type === 'weekly') {
    var cur = weekStartOf(today);
    for (var ws = weekStartOf(start); ws <= cur; ws = addDays(ws, 7)) {
      if (weekCount(logs, h, ws, today) >= f.times) { run++; if (run > best) best = run; }
      else if (ws !== cur) run = 0;
    }
    return { n: best, unit: 'sem' };
  }
  for (var d = start; d <= today; d = addDays(d, 1)) {
    if (getVal(logs, d, h.id) === 1) { run++; if (run > best) best = run; }
    else if (isScheduled(h, d) && d !== today) run = 0;
  }
  return { n: best, unit: 'd' };
}

/**
 * Cuánto cumpliste entre dos fechas (inclusive), contra lo que te propusiste.
 * Los diarios y de días fijos suman cada día que tocan (o que hiciste igual).
 * Los de "X veces por semana" suman su meta en proporción a los días de cada
 * semana que caen en el período, y no se pasan de ella.
 * Devuelve { done, possible, marks } (done y possible pueden tener decimales).
 */
export function periodScore(logs, habits, from, to) {
  var done = 0, possible = 0, marks = 0;
  habits.forEach(function (h) {
    var f = freqOf(h);
    if (f.type === 'weekly') {
      for (var ws = weekStartOf(from); ws <= to; ws = addDays(ws, 7)) {
        var k = 0, c = 0;
        for (var i = 0; i < 7; i++) {
          var d = addDays(ws, i);
          if (d < from || d > to) continue;
          k++;
          if (getVal(logs, d, h.id) === 1) c++;
        }
        var goal = f.times * k / 7;
        marks += c;
        done += Math.min(c, goal);
        possible += goal;
      }
      return;
    }
    for (var d2 = from; d2 <= to; d2 = addDays(d2, 1)) {
      var v = getVal(logs, d2, h.id) === 1;
      if (v) marks++;
      if (isScheduled(h, d2) || v) { possible++; if (v) done++; }
    }
  });
  return { done: done, possible: possible, marks: marks };
}
export function pct(score) { return score.possible ? Math.round(score.done / score.possible * 100) : null; }

/** Copia sin días vacíos ni valores raros. Es lo que se exporta. */
export function cleanLogs(logs) {
  var out = {};
  Object.keys(logs || {}).sort().forEach(function (mk) {
    if (!/^\d{4}-\d{2}$/.test(mk)) return;
    var month = logs[mk];
    if (!month || typeof month !== 'object') return;
    Object.keys(month).sort().forEach(function (date) {
      if (!isValidDate(date) || date.slice(0, 7) !== mk) return;
      var day = month[date];
      if (!day || typeof day !== 'object') return;
      Object.keys(day).forEach(function (id) {
        var v = day[id];
        if (v !== 1 && v !== 0) return;
        out[mk] = out[mk] || {};
        out[mk][date] = out[mk][date] || {};
        out[mk][date][id] = v;
      });
    });
  });
  return out;
}

export function countDays(logs) {
  var n = 0;
  Object.keys(logs).forEach(function (mk) {
    Object.keys(logs[mk]).forEach(function (d) { if (Object.keys(logs[mk][d]).length) n++; });
  });
  return n;
}

/**
 * Combina datos que llegan (de un respaldo o del navegador) con los que ya hay.
 * prefer = 'existing': lo que ya está no se toca, solo se completan huecos.
 * prefer = 'incoming': si un día tiene una marca distinta, gana la que llega.
 * Devuelve la lista de hábitos resultante y solo las marcas que cambian, por mes.
 */
export function mergeData(base, incoming, prefer) {
  var habits = base.habits.map(cleanHabit);
  var newHabits = 0;
  incoming.habits.forEach(function (h) {
    var cur = habits.find(function (x) { return x.id === h.id; });
    if (!cur) { habits.push(cleanHabit(h)); newHabits++; }
    else if (prefer === 'incoming') { var c = cleanHabit(h); cur.name = c.name; cur.cat = c.cat; if (c.freq) cur.freq = c.freq; else delete cur.freq; }
  });

  var patch = {}, marks = 0;
  var inc = cleanLogs(incoming.logs);
  Object.keys(inc).forEach(function (mk) {
    Object.keys(inc[mk]).forEach(function (date) {
      Object.keys(inc[mk][date]).forEach(function (id) {
        var v = inc[mk][date][id], cur = getVal(base.logs, date, id);
        if (cur === v) return;
        if (cur !== undefined && prefer !== 'incoming') return;
        patch[mk] = patch[mk] || {};
        patch[mk][date] = patch[mk][date] || {};
        patch[mk][date][id] = v;
        marks++;
      });
    });
  });
  // Pendientes: se suman los que faltan; si el mismo pendiente cambió, manda prefer.
  var tasksPatch = {}, newTasks = 0;
  var baseTasks = base.tasks || {}, incTasks = cleanTasks(incoming.tasks || {});
  Object.keys(incTasks).forEach(function (w) {
    var items = (baseTasks[w] || []).map(cleanTask), changed = false;
    incTasks[w].forEach(function (t) {
      var cur = items.find(function (x) { return x.id === t.id; });
      if (!cur) { items.push(t); newTasks++; changed = true; }
      else if (prefer === 'incoming' && (cur.text !== t.text || cur.done !== t.done)) { cur.text = t.text; cur.done = t.done; changed = true; }
    });
    if (changed) tasksPatch[w] = items;
  });
  return { habits: habits, patch: patch, newHabits: newHabits, marks: marks, tasksPatch: tasksPatch, newTasks: newTasks };
}

/* ---------- pendientes de la semana ---------- */

export function validTask(t) {
  return !!t && typeof t.id === 'string' && t.id.length > 0 && t.id.length <= 64 &&
    typeof t.text === 'string' && t.text.trim().length > 0 && typeof t.done === 'boolean';
}
function cleanTask(t) { return { id: t.id, text: t.text.trim().slice(0, 140), done: t.done }; }

/** Copia sin semanas vacías ni pendientes raros. */
export function cleanTasks(tasks) {
  var out = {};
  Object.keys(tasks || {}).sort().forEach(function (w) {
    if (!isValidDate(w) || !Array.isArray(tasks[w])) return;
    var seen = {};
    var items = tasks[w].filter(function (t) {
      if (!validTask(t) || seen[t.id]) return false;
      seen[t.id] = true;
      return true;
    }).map(cleanTask);
    if (items.length) out[w] = items;
  });
  return out;
}
export function countTasks(tasks) {
  return Object.keys(tasks).reduce(function (n, w) { return n + tasks[w].length; }, 0);
}

/* ---------- respaldo en archivo ---------- */

export function makeBackup(habits, logs, tasks) {
  return {
    app: 'mis-habitos',
    version: 1,
    exportedAt: new Date().toISOString(),
    timezone: 'America/Buenos_Aires',
    habits: habits.map(cleanHabit),
    logs: cleanLogs(logs),
    tasks: cleanTasks(tasks)
  };
}

/** Lee un respaldo. Acepta también el formato viejo { items } / { days } por si se arma a mano. */
export function parseBackup(text) {
  var data;
  try { data = JSON.parse(text); } catch (e) { throw new Error('El archivo no es un respaldo válido (no es JSON).'); }
  if (!data || typeof data !== 'object') throw new Error('El archivo no es un respaldo válido.');
  var rawHabits = Array.isArray(data.habits) ? data.habits : data.habits && Array.isArray(data.habits.items) ? data.habits.items : null;
  if (!rawHabits || !data.logs || typeof data.logs !== 'object') {
    throw new Error('El archivo no tiene hábitos ni marcas de esta app.');
  }
  var logs = {};
  Object.keys(data.logs).forEach(function (mk) {
    var m = data.logs[mk];
    logs[mk] = m && m.days && typeof m.days === 'object' ? m.days : m;
  });
  var seen = {};
  var habits = rawHabits.filter(function (h) {
    if (!validHabit(h) || seen[h.id]) return false;
    seen[h.id] = true;
    return true;
  }).map(cleanHabit);
  return { habits: habits, logs: cleanLogs(logs), tasks: cleanTasks(data.tasks || {}) };
}

/* ---------- constancia mensual (vista Mes) ---------- */

/**
 * Por cada día del mes hasta hoy: cuántos hábitos se hicieron y el porcentaje
 * sobre los que tocaban ese día (los de "X por semana" solo cuentan si los
 * hiciste). Lo usa la vista Mes.
 */
export function monthStats(logs, habits, mk, today) {
  var p = mk.split('-').map(Number);
  var total = new Date(Date.UTC(p[0], p[1], 0)).getUTCDate();
  var out = [];
  for (var i = 1; i <= total; i++) {
    var date = mk + '-' + pad(i);
    if (today && date > today) break;
    var due = 0, done = 0;
    habits.forEach(function (h) {
      if (!countsOn(logs, h, date)) return;
      due++;
      if (getVal(logs, date, h.id) === 1) done++;
    });
    out.push({ date: date, done: done, due: due, pct: due ? done / due : 0 });
  }
  return out;
}
