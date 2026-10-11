/*
  Datos: funciones puras sobre la lista de hábitos y las marcas. No tocan la
  pantalla ni la base, así se pueden probar y reusar (la vista Mes sale de monthStats).

  Forma de los datos:
    habits: [{ id, name, cat }]
    logs:   { "2026-10": { "2026-10-11": { idHabito: 1 | 0 } } }   1 = hecho, 0 = no hecho
    tasks:  { "2026-10-06": [{ id, text, done }] }   pendientes, por el lunes de su semana
*/

import { addDays, isValidDate, pad } from './fechas.js';

export var CATS = [
  { key: 'ejercicio', label: 'Ejercicio' },
  { key: 'cuidado', label: 'Cuidado personal' },
  { key: 'trabajo', label: 'Trabajo' }
];

export function validHabit(h) {
  return !!h && typeof h.id === 'string' && h.id.length > 0 && h.id.length <= 64 &&
    typeof h.name === 'string' && h.name.trim().length > 0 &&
    CATS.some(function (c) { return c.key === h.cat; });
}
export function cleanHabit(h) {
  return { id: h.id, name: h.name.trim().slice(0, 60), cat: h.cat };
}

export function getVal(logs, date, id) {
  var m = logs[date.slice(0, 7)];
  var day = m && m[date];
  return day && Object.prototype.hasOwnProperty.call(day, id) ? day[id] : undefined;
}

/** Días seguidos hechos hasta esa fecha. Si ese día todavía no está hecho, cuenta desde el anterior. */
export function streak(logs, id, date) {
  var d = getVal(logs, date, id) === 1 ? date : addDays(date, -1);
  var n = 0;
  while (getVal(logs, d, id) === 1 && n < 3650) { n++; d = addDays(d, -1); }
  return n;
}

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
  var habits = base.habits.map(function (h) { return { id: h.id, name: h.name, cat: h.cat }; });
  var newHabits = 0;
  incoming.habits.forEach(function (h) {
    var cur = habits.find(function (x) { return x.id === h.id; });
    if (!cur) { habits.push(cleanHabit(h)); newHabits++; }
    else if (prefer === 'incoming') { cur.name = h.name; cur.cat = h.cat; }
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
 * Por cada día del mes: cuántos hábitos se hicieron y el porcentaje sobre los
 * hábitos actuales. Lo usa la vista Mes.
 */
export function monthStats(logs, habits, mk, today) {
  var p = mk.split('-').map(Number);
  var total = new Date(Date.UTC(p[0], p[1], 0)).getUTCDate();
  var out = [];
  for (var i = 1; i <= total; i++) {
    var date = mk + '-' + pad(i);
    if (today && date > today) break;
    var done = habits.filter(function (h) { return getVal(logs, date, h.id) === 1; }).length;
    out.push({ date: date, done: done, pct: habits.length ? done / habits.length : 0 });
  }
  return out;
}
