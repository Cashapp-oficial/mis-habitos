/*
  Mis hábitos: la pantalla. Dibuja las tres pestañas y responde a los toques.
  Dónde se guardan los datos lo resuelve store.js; las cuentas puras están en
  datos.js y las fechas (siempre de Buenos Aires) en fechas.js.
*/

import { todayStr, parse, addDays, weekStartOf, fmtWd, fmtDay, fmtShort, fmtMonth, fmtMonthName, pad } from './fechas.js';
import { CATS, getVal, streak as streakOf, bestStreak, mergeData, makeBackup, parseBackup, countDays, cleanLogs, monthStats, countTasks,
  freqOf, freqLabel, isScheduled, countsOn, weekCount, periodScore, pct, cleanHabit } from './datos.js';
import { createStore, readLocalData } from './store.js';
import { vapidKey } from './firebase-config.js';

var STARTER = [
  ['ejercicio', 'Entrenar 40 minutos'],
  ['ejercicio', 'Caminar 30 minutos'],
  ['ejercicio', 'Estirar 10 minutos'],
  ['cuidado', 'Tomar 2 litros de agua'],
  ['cuidado', 'Skincare de noche'],
  ['cuidado', 'Acostarme antes de las 23:30'],
  ['cuidado', 'Meditar 10 minutos'],
  ['trabajo', 'Definir 3 prioridades del día'],
  ['trabajo', 'Un bloque de foco de 90 minutos'],
  ['trabajo', 'Cerrar la jornada y anotar pendientes']
];
var WD = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

var CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
var XMARK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
var UP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>';
var DOWN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6"/></svg>';

function $(id) { return document.getElementById(id); }
var els = {
  viewLogin: $('viewLogin'), viewHoy: $('viewHoy'), viewSemana: $('viewSemana'), viewMes: $('viewMes'), viewHabitos: $('viewHabitos'),
  tabbar: $('tabbar'), signIn: $('signIn'), signOut: $('signOut'), accountText: $('accountText'), syncText: $('syncText'),
  dayName: $('dayName'), dayTitle: $('dayTitle'), prevDay: $('prevDay'), nextDay: $('nextDay'),
  goToday: $('goToday'), summary: $('summary'), hoyList: $('hoyList'), tasksHoy: $('tasksHoy'), tasksSemana: $('tasksSemana'),
  weekEyebrow: $('weekEyebrow'), weekTitle: $('weekTitle'), prevWeek: $('prevWeek'), nextWeek: $('nextWeek'),
  weekSummary: $('weekSummary'), weekGrid: $('weekGrid'),
  monthEyebrow: $('monthEyebrow'), monthTitle: $('monthTitle'), prevMonth: $('prevMonth'), nextMonth: $('nextMonth'),
  goThisMonth: $('goThisMonth'), monthBody: $('monthBody'),
  addForm: $('addForm'), newName: $('newName'), newCat: $('newCat'), newFreq: $('newFreq'), habitList: $('habitList'),
  reminderPanel: $('reminderPanel'), remOn: $('remOn'), remTime: $('remTime'), remStatus: $('remStatus'), remTest: $('remTest'),
  exportBtn: $('exportBtn'), importBtn: $('importBtn'), importFile: $('importFile'),
  dialog: $('dialog'), dialogEyebrow: $('dialogEyebrow'), dialogTitle: $('dialogTitle'), dialogText: $('dialogText'),
  dialogOk: $('dialogOk'), dialogCancel: $('dialogCancel'),
  status: $('status')
};

/* ---------- adornos de grabado (los mismos de Porkie) ---------- */

function r1(n) { return Math.round(n * 10) / 10; }
function rosetaPath(capa) {
  var pts = [];
  for (var i = 0; i <= 360; i++) {
    var t = (i / 360) * Math.PI * 2;
    var r = 112 + 16 * Math.sin(18 * t + capa * 0.45) + 6 * Math.sin(54 * t - capa * 0.3) - capa * 7;
    pts.push((i ? 'L' : 'M') + r1(150 + r * Math.cos(t)) + ' ' + r1(150 + r * Math.sin(t)));
  }
  return pts.join('') + 'Z';
}
function guardaPath(fase) {
  var pts = [];
  for (var x = 0; x <= 354; x += 1.5) {
    pts.push((x ? 'L' : 'M') + r1(x) + ' ' + r1(6 + 4 * Math.sin((x / 22) * Math.PI * 2 + (fase * Math.PI) / 2)));
  }
  return pts.join('');
}
var ROSETA = [0, 1, 2, 3, 4, 5, 6].map(function (c) {
  return '<path d="' + rosetaPath(c) + '" fill="none" stroke="rgba(246,191,184,' + (0.3 - c * 0.025).toFixed(3) + ')" stroke-width="0.6"/>';
}).join('');
var GUARDA = [0, 1, 2, 3].map(function (f) {
  return '<path d="' + guardaPath(f) + '" fill="none" stroke="rgba(246,191,184,' + (f % 2 ? 0.35 : 0.22) + ')" stroke-width="0.6"/>';
}).join('');
var MICRO = Array(6).fill('Cada día cuenta').join(' · ');

function drawOrnaments() {
  $('fondoRoseta').innerHTML = ROSETA;
  document.querySelectorAll('[data-roseta]').forEach(function (s) { s.innerHTML = ROSETA; });
  document.querySelectorAll('[data-guarda]').forEach(function (s) { s.innerHTML = GUARDA; });
}

/* ---------- utilidades ---------- */

function esc(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function clone(x) { return JSON.parse(JSON.stringify(x)); }
function makeId() { return 'h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function refocus(root, sel) {
  var n = root.querySelector(sel);
  if (n) { try { n.focus({ preventScroll: true }); } catch (e) { n.focus(); } }
}

/* ---------- estado ---------- */

var state = {
  tab: 'hoy', today: todayStr(), date: todayStr(), followToday: true, weekStart: weekStartOf(todayStr()), month: todayStr().slice(0, 7), followMonth: true,
  habits: [], logs: {}, tasks: {}, ready: false, confirmDel: null, confirmTask: null,
  user: null, pending: false, online: navigator.onLine, dataKey: ''
};
var store = null;

function ordered() {
  var out = [];
  CATS.forEach(function (c) {
    state.habits.forEach(function (h) { if (h.cat === c.key) out.push(h); });
  });
  return out;
}
function val(date, id) { return getVal(state.logs, date, id); }
function counts(h, date) { return countsOn(state.logs, h, date); }

/* Frecuencia en el editor: el valor del <select> y de vuelta. */
var FREQ_OPTS = [['daily', 'Todos los días'], ['w1', '1 vez por semana'], ['w2', '2 veces por semana'], ['w3', '3 veces por semana'],
  ['w4', '4 veces por semana'], ['w5', '5 veces por semana'], ['w6', '6 veces por semana'], ['days', 'Días fijos']];
function freqValue(h) {
  var f = freqOf(h);
  return f.type === 'weekly' ? 'w' + f.times : f.type;
}
function freqFrom(value, prev) {
  if (value === 'days') {
    var p = prev && freqOf({ freq: prev });
    return { type: 'days', days: p && p.type === 'days' ? p.days : [0, 1, 2, 3, 4] };
  }
  if (/^w[1-6]$/.test(value)) return { type: 'weekly', times: Number(value.slice(1)) };
  return null;
}
function freqOptions(selected) {
  return FREQ_OPTS.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === selected ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('');
}
function unit(s) { return s.unit === 'sem' ? (s.n === 1 ? 'semana' : 'semanas') : (s.n === 1 ? 'día' : 'días'); }
function compareText(now, before, period) {
  if (now === null || before === null) return '';
  var dlt = now - before;
  return dlt === 0 ? 'igual que ' + period : (dlt > 0 ? '▲ ' + dlt + ' puntos más' : '▼ ' + (-dlt) + ' puntos menos') + ' que ' + period;
}

function setVal(date, id, v) {
  var mk = date.slice(0, 7);
  var m = state.logs[mk] || (state.logs[mk] = {});
  var day = m[date] || (m[date] = {});
  if (v === undefined) { delete day[id]; if (!Object.keys(day).length) delete m[date]; }
  else day[id] = v;
  store.setMark(date, id, v).catch(saveError);
}
function persistHabits() {
  store.saveHabits(state.habits.map(cleanHabit)).catch(saveError);
}
function tasksOf(week) { return state.tasks[week] || []; }
function saveTasks(week, items) {
  if (items.length) state.tasks[week] = items; else delete state.tasks[week];
  store.saveTasks(week, items.map(function (t) { return { id: t.id, text: t.text, done: t.done }; })).catch(saveError);
}

function saveError(e) {
  console.error(e);
  say('No se pudo guardar. Revisá la conexión y probá de nuevo.', true);
}

/* ---------- aviso ---------- */

var statusTimer;
function say(msg, isErr) {
  els.status.textContent = msg;
  els.status.classList.toggle('err', !!isErr);
  els.status.hidden = false;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(function () { els.status.hidden = true; }, isErr ? 6000 : 2600);
}

/* ---------- diálogo de confirmación ---------- */

function ask(o) {
  return new Promise(function (resolve) {
    els.dialogEyebrow.textContent = o.eyebrow || '';
    els.dialogTitle.textContent = o.title;
    els.dialogText.textContent = o.text;
    els.dialogOk.textContent = o.ok;
    els.dialogCancel.textContent = o.cancel;
    els.dialog.returnValue = '';
    els.dialog.addEventListener('close', function onClose() {
      els.dialog.removeEventListener('close', onClose);
      resolve(els.dialog.returnValue === 'ok' ? true : els.dialog.returnValue === 'cancel' ? false : null);
    });
    els.dialog.showModal();
  });
}

/* ---------- vistas ---------- */

function emptyHtml(withLink) {
  return '<div class="empty vidrio"><h2>Tu lista está vacía</h2>' +
    '<p>Armá tus hábitos de ejercicio, cuidado personal y trabajo. Podés empezar con una lista base y cambiarla como quieras.</p>' +
    '<div class="empty-actions"><button type="button" class="btn primary" data-act="starter">Cargar lista base</button>' +
    (withLink ? '<button type="button" class="btn" data-act="goHabitos">Crear los míos</button>' : '') +
    '</div></div>';
}

function habitRow(h, d) {
  var v = val(d, h.id), f = freqOf(h);
  var st = v === 1 ? 'done' : v === 0 ? 'miss' : '';
  var name = esc(h.name);
  var off = f.type === 'days' && !isScheduled(h, d) && v !== 1;
  var s = streakOf(state.logs, h, d), best = bestStreak(state.logs, h, d);
  var dots = '';
  for (var i = 6; i >= 0; i--) {
    var dd = addDays(d, -i), x = val(dd, h.id);
    dots += '<span class="dot' + (x === 1 ? ' done' : x === 0 ? ' miss' : '') +
      (f.type === 'days' && !isScheduled(h, dd) && x !== 1 ? ' off' : '') + (i === 0 ? ' cur' : '') + '"></span>';
  }
  var meta = '';
  if (f.type === 'weekly') {
    meta += '<span class="semanal">' + weekCount(state.logs, h, weekStartOf(d), d) + ' de ' + f.times + (d === state.today ? ' esta semana' : ' esa semana') + '</span>';
  }
  if (off) meta += '<span class="no-toca">' + (d === state.today ? 'hoy no toca' : 'no tocaba') + '</span>';
  // En los de "X por semana", "sin racha" no suma nada al lado de "2 de 3 esta semana".
  if (s.n || f.type !== 'weekly') meta += '<span class="streak' + (s.n ? ' on' : '') + '">' + (s.n ? 'racha ' + s.n + ' ' + unit(s) : 'sin racha') + '</span>';
  if (best.n >= 2) {
    meta += s.n === best.n ? '<span class="record top">tu récord</span>' : '<span class="record">récord ' + best.n + '</span>';
  }
  return '<li class="habit' + (st ? ' state-' + st : '') + (off ? ' off-day' : '') + '">' +
    '<button type="button" class="check" data-act="done" data-id="' + h.id + '" aria-pressed="' + (v === 1) + '" aria-label="' + name + ': hecho">' + CHECK + '</button>' +
    '<div class="h-body"><p class="h-name">' + name + '</p>' +
    '<div class="h-meta"><span class="dots" aria-hidden="true">' + dots + '</span>' + meta + '</div></div>' +
    '<button type="button" class="x-btn" data-act="miss" data-id="' + h.id + '" aria-pressed="' + (v === 0) + '" aria-label="' + name + ': no lo hice" title="No lo hice">' + XMARK + '</button>' +
    '</li>';
}

function renderHoy() {
  var t = state.today, d = state.date, dt = parse(d), tt = parse(t);
  var diff = Math.round((tt - dt) / 864e5), wd = fmtWd.format(dt);
  els.dayName.textContent = diff === 0 ? 'Hoy · ' + wd : diff === 1 ? 'Ayer · ' + wd : diff === 2 ? 'Anteayer · ' + wd :
    (dt.getUTCFullYear() !== tt.getUTCFullYear() ? wd + ' ' + dt.getUTCFullYear() : wd);
  els.dayTitle.textContent = fmtDay.format(dt);
  els.nextDay.disabled = d >= t;
  els.goToday.hidden = d === t;
  renderTasksHoy();

  if (!state.ready) {
    els.summary.innerHTML = '';
    els.hoyList.innerHTML = '<p class="empty-note">Cargando tus hábitos…</p>';
    return;
  }
  var list = ordered();
  if (!list.length) {
    els.summary.innerHTML = '';
    els.hoyList.innerHTML = emptyHtml(true);
    return;
  }

  // Cuentan los que tocan ese día y los que hiciste igual.
  var due = list.filter(function (h) { return counts(h, d); });
  var done = 0, miss = 0, segs = '';
  due.forEach(function (h) {
    var v = val(d, h.id);
    if (v === 1) done++; else if (v === 0) miss++;
    segs += '<span class="seg cat-' + h.cat + (v === 1 ? ' done' : v === 0 ? ' miss' : '') + '"></span>';
  });
  var label = !due.length ? (d === t ? 'hoy no te toca ningún hábito' : 'ese día no tocaba ningún hábito') :
    'hechos ' + (d === t ? 'hoy' : 'ese día') + (miss ? ' · ' + miss + ' no hecho' + (miss > 1 ? 's' : '') : '');
  els.summary.innerHTML =
    '<div class="sum-hero"><svg class="roseta" viewBox="0 0 300 300" aria-hidden="true">' + ROSETA + '</svg>' +
    '<span class="big">' + done + '<span class="of">/' + due.length + '</span></span>' +
    '<span class="sum-sub">' + label + '</span>' +
    '<span class="micro" aria-hidden="true">' + MICRO + '</span></div>' +
    (due.length ? '<div class="tally" role="img" aria-label="' + done + ' de ' + due.length + ' hábitos hechos">' + segs + '</div>' : '') +
    '<p class="hint">Círculo: lo hice. X: no lo hice. Los puntos son los últimos 7 días.</p>';

  els.hoyList.innerHTML = CATS.map(function (c) {
    var hs = list.filter(function (h) { return h.cat === c.key; });
    if (!hs.length) return '';
    var n = hs.filter(function (h) { return val(d, h.id) === 1; }).length;
    var nd = hs.filter(function (h) { return counts(h, d); }).length;
    return '<section class="cat vidrio cat-' + c.key + '" aria-labelledby="cat-' + c.key + '">' +
      '<header class="cat-head"><h2 id="cat-' + c.key + '">' + c.label + '</h2><span class="count">' + n + '/' + nd + '</span></header>' +
      '<ul class="habits">' + hs.map(function (h) { return habitRow(h, d); }).join('') + '</ul></section>';
  }).join('');
}

function renderSemana() {
  var t = state.today, ws = state.weekStart;
  // Se puede ir hasta la semana que viene, para dejar anotados sus pendientes.
  var cur = weekStartOf(t);
  els.weekEyebrow.textContent = ws === cur ? 'Esta semana' : ws > cur ? 'La semana que viene' : 'Semana';
  els.weekTitle.textContent = fmtShort.format(parse(ws)) + ' – ' + fmtShort.format(parse(addDays(ws, 6)));
  els.nextWeek.disabled = ws > cur;
  renderTasksSemana();

  if (!state.ready) {
    els.weekSummary.textContent = '';
    els.weekGrid.innerHTML = '<p class="empty-note">Cargando tus hábitos…</p>';
    return;
  }
  var list = ordered();
  if (!list.length) {
    els.weekSummary.textContent = '';
    els.weekGrid.innerHTML = '<p class="empty-note">Todavía no hay hábitos. Cargalos en la pestaña Hábitos.</p>';
    return;
  }
  var days = [0, 1, 2, 3, 4, 5, 6].map(function (i) { return addDays(ws, i); });

  var head = '<tr><th scope="col"><span class="sr-only">Hábito</span></th>' + days.map(function (d, i) {
    return '<th scope="col" class="' + (d === t ? 'today' : '') + '"><span class="wd">' + WD[i] + '</span><span class="wn">' + parse(d).getUTCDate() + '</span></th>';
  }).join('') + '</tr>';

  var body = '';
  CATS.forEach(function (c) {
    var hs = list.filter(function (h) { return h.cat === c.key; });
    if (!hs.length) return;
    body += '<tr class="cat-' + c.key + ' cat-row"><th colspan="8" scope="colgroup">' + c.label + '</th></tr>';
    hs.forEach(function (h) {
      var f = freqOf(h);
      var wmeta = f.type === 'weekly' ? weekCount(state.logs, h, ws, t) + ' de ' + f.times : f.type === 'days' ? freqLabel(h) : '';
      body += '<tr class="cat-' + c.key + '"><th scope="row" class="w-name" title="' + esc(h.name) + '">' + esc(h.name) +
        (wmeta ? '<span class="w-meta">' + wmeta + '</span>' : '') + '</th>';
      days.forEach(function (d) {
        var v = val(d, h.id), future = d > t;
        var off = f.type === 'days' && !isScheduled(h, d) && v !== 1;
        var stateTxt = v === 1 ? 'hecho' : v === 0 ? 'no hecho' : off ? 'no toca' : 'sin marcar';
        body += '<td><button type="button" class="cell' + (v === 1 ? ' done' : v === 0 ? ' miss' : '') + (off ? ' off' : '') + '" data-id="' + h.id + '" data-date="' + d + '"' +
          (future ? ' disabled' : '') + ' aria-label="' + esc(h.name) + ', ' + fmtShort.format(parse(d)) + ': ' + stateTxt + '">' +
          (v === 1 ? CHECK : v === 0 ? XMARK : '') + '</button></td>';
      });
      body += '</tr>';
    });
  });

  var foot = '<tr><th scope="row">Cumplido</th>' + days.map(function (d) {
    if (d > t) return '<td>·</td>';
    var n = 0, due = 0;
    list.forEach(function (h) { if (counts(h, d)) { due++; if (val(d, h.id) === 1) n++; } });
    return '<td>' + (due ? Math.round(n / due * 100) + '%' : '–') + '</td>';
  }).join('') + '</tr>';

  // Contra lo que te propusiste (los de "X por semana" cuentan su meta) y contra la semana anterior.
  var now = ws <= t ? pct(periodScore(state.logs, list, ws, addDays(ws, 6) < t ? addDays(ws, 6) : t)) : null;
  var before = pct(periodScore(state.logs, list, addDays(ws, -7), addDays(ws, -1)));
  els.weekSummary.innerHTML = now === null ? '' : '<strong>' + now + '% cumplido</strong>' +
    (compareText(now, before, 'la semana anterior') ? ' · <span class="' + (now > before ? 'sube' : now < before ? 'baja' : '') + '">' + compareText(now, before, 'la semana anterior') + '</span>' : '');
  els.weekGrid.innerHTML = '<table class="week"><colgroup><col class="name">' + days.map(function () { return '<col>'; }).join('') + '</colgroup>' +
    '<thead>' + head + '</thead><tbody>' + body + '</tbody><tfoot>' + foot + '</tfoot></table>';
}

function addMonths(mk, n) {
  var p = mk.split('-').map(Number);
  var d = new Date(Date.UTC(p[0], p[1] - 1 + n, 1));
  return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1);
}
function daysInMonth(mk) {
  var p = mk.split('-').map(Number);
  return new Date(Date.UTC(p[0], p[1], 0)).getUTCDate();
}

/* El mes entero, del 1 al último día: un calendario pintado según cuánto
   cumpliste cada día y una tira por hábito con todos los días del mes. */
function renderMes() {
  var t = state.today, mk = state.month, thisMonth = t.slice(0, 7);
  els.monthEyebrow.textContent = mk === thisMonth ? 'Este mes' : 'Mes';
  els.monthTitle.textContent = fmtMonth.format(parse(mk + '-01'));
  els.nextMonth.disabled = mk >= thisMonth;
  els.goThisMonth.hidden = mk === thisMonth;

  if (!state.ready) { els.monthBody.innerHTML = '<p class="empty-note">Cargando tus hábitos…</p>'; return; }
  var list = ordered();
  if (!list.length) {
    els.monthBody.innerHTML = '<p class="empty-note">Todavía no hay hábitos. Cargalos en la pestaña Hábitos.</p>';
    return;
  }

  var total = daysInMonth(mk);
  var stats = monthStats(state.logs, list, mk, t); // solo hasta hoy
  var past = stats.length;
  var last = mk + '-' + pad(total);
  var score = periodScore(state.logs, list, mk + '-01', last < t ? last : t);
  var pctAll = pct(score) || 0, doneAll = score.marks;
  var full = stats.filter(function (s) { return s.due && s.done === s.due; }).length;
  var prevMk = addMonths(mk, -1);
  var before = pct(periodScore(state.logs, list, prevMk + '-01', prevMk + '-' + pad(daysInMonth(prevMk))));
  var cmp = past ? compareText(pctAll, before, fmtMonthName.format(parse(prevMk + '-01'))) : '';

  var summary = '<div class="mes-resumen">' +
    '<div><span class="mes-num">' + pctAll + '<small>%</small></span><span class="rotulo">cumplido</span></div>' +
    '<div><span class="mes-num">' + doneAll + '</span><span class="rotulo">hechos</span></div>' +
    '<div><span class="mes-num">' + full + '</span><span class="rotulo">días completos</span></div>' +
    '</div>' +
    (cmp ? '<p class="comparacion ' + (pctAll > before ? 'sube' : pctAll < before ? 'baja' : '') + '">' + cmp + '</p>' : '') +
    '<p class="hint">' + (past === total ? 'Los ' + total + ' días del mes.' : 'Del 1 al ' + past + ' de ' + total + ' días. Se completa a medida que pasa el mes.') + '</p>';

  // Calendario: lunes primero, como la semana.
  var offset = (parse(mk + '-01').getUTCDay() + 6) % 7;
  var cal = '<div class="cal-cab" aria-hidden="true">' + WD.map(function (w) { return '<span>' + w + '</span>'; }).join('') + '</div><div class="cal">';
  for (var b = 0; b < offset; b++) cal += '<span class="cal-hueco"></span>';
  for (var i = 1; i <= total; i++) {
    var date = mk + '-' + pad(i), future = date > t;
    var st = stats[i - 1];
    var lvl = future || !st.done ? 0 : st.pct === 1 ? 4 : st.pct >= 0.67 ? 3 : st.pct >= 0.34 ? 2 : 1;
    var lbl = fmtDay.format(parse(date)) + (future ? '' : st.due ? ': ' + st.done + ' de ' + st.due + ' hechos' : ': no tocaba nada');
    cal += '<button type="button" class="cal-dia n' + lvl + (date === t ? ' hoy' : '') + '" data-date="' + date + '"' +
      (future ? ' disabled' : '') + ' aria-label="' + lbl + '"><span>' + i + '</span>' +
      (!future && st.done ? '<small>' + Math.round(st.pct * 100) + '%</small>' : '') + '</button>';
  }
  cal += '</div>';
  var legend = '<div class="cal-leyenda" aria-hidden="true"><span>Menos</span><i class="n0"></i><i class="n1"></i><i class="n2"></i><i class="n3"></i><i class="n4"></i><span>Todo</span></div>';

  var cats = CATS.map(function (c) {
    var hs = list.filter(function (h) { return h.cat === c.key; });
    if (!hs.length) return '';
    return '<section class="cat vidrio cat-' + c.key + '"><header class="cat-head"><h2>' + c.label + '</h2></header>' +
      '<ul class="habits">' + hs.map(function (h) {
        var n = 0, due = 0, cells = '', f = freqOf(h);
        for (var d = 1; d <= total; d++) {
          var date = mk + '-' + pad(d), v = val(date, h.id), sch = isScheduled(h, date);
          if (v === 1) n++;
          if (sch && date <= t) due++;
          cells += '<i class="' + (date > t ? 'fut' : v === 1 ? 'done' : v === 0 ? 'miss' : '') +
            (f.type === 'days' && !sch && v !== 1 ? ' off' : '') + (date === t ? ' cur' : '') + '"></i>';
        }
        var txt = f.type === 'weekly' ? n + (n === 1 ? ' vez' : ' veces') + ' · meta ' + f.times + ' por semana' :
          f.type === 'days' ? n + ' de ' + due + (due === 1 ? ' día que tocaba' : ' días que tocaban') :
          n + ' de ' + past + (past === 1 ? ' día' : ' días');
        return '<li class="mes-habito"><div class="mes-habito-cab"><p class="h-name">' + esc(h.name) + '</p>' +
          '<span class="count">' + txt + '</span></div>' +
          '<div class="tira" role="img" aria-label="' + esc(h.name) + ': ' + txt + '">' + cells + '</div></li>';
      }).join('') + '</ul></section>';
  }).join('');

  els.monthBody.innerHTML = summary +
    '<div class="vidrio cal-tarjeta">' + cal + legend + '</div>' +
    '<p class="hint">Tocá un día para verlo y marcarlo en Hoy.</p>' +
    '<div class="mes-cats">' + cats + '</div>';
}

/* ---------- pendientes de la semana ---------- */

var CHECK_CHICO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

/* La lista de una semana. En Hoy va compacta (sin campo para anotar) y solo
   si esa semana tiene pendientes; en Semana va completa. */
function tasksHtml(ws, compact) {
  var items = tasksOf(ws), t = state.today;
  var done = items.filter(function (x) { return x.done; }).length;
  var cur = weekStartOf(t);
  var title = ws === cur ? 'Pendientes de la semana' : ws > cur ? 'Pendientes de la semana que viene' : 'Pendientes de esa semana';
  var html = '<section class="vidrio tareas" data-week="' + ws + '" aria-label="' + title + '">' +
    '<header class="tareas-cab"><h2>' + title + '</h2>' + (items.length ? '<span class="count">' + done + '/' + items.length + '</span>' : '') + '</header>';

  if (!compact && ws === cur) {
    var left = tasksOf(addDays(ws, -7)).filter(function (x) { return !x.done; });
    if (left.length) {
      html += '<div class="tareas-quedaron"><p>' + (left.length === 1 ? 'Quedó 1 pendiente' : 'Quedaron ' + left.length + ' pendientes') +
        ' sin hacer la semana pasada.</p><button type="button" class="btn" data-tact="carry">Pasar a esta semana</button></div>';
    }
  }

  if (items.length) {
    html += '<ul class="tareas-lista">' + items.map(function (x) {
      var txt = esc(x.text), armed = state.confirmTask === x.id;
      return '<li class="tarea' + (x.done ? ' hecha' : '') + '">' +
        '<button type="button" class="tarea-check" data-tact="toggle" data-tid="' + x.id + '" aria-pressed="' + x.done + '" aria-label="' + txt + ': hecho">' + CHECK_CHICO + '</button>' +
        '<p class="tarea-texto">' + txt + '</p>' +
        (compact ? '' : '<button type="button" class="tarea-borrar' + (armed ? ' armed' : '') + '" data-tact="del" data-tid="' + x.id + '" aria-label="' + (armed ? 'Confirmar: borrar ' : 'Borrar ') + txt + '">' + (armed ? 'Borrar' : XMARK) + '</button>') +
        '</li>';
    }).join('') + '</ul>';
  } else if (!compact) {
    html += '<p class="tareas-vacio">Nada anotado para esta semana. Sumá lo que tengas que hacer, por ejemplo: Llamar al dentista.</p>';
  }

  if (compact) {
    html += '<button type="button" class="tareas-ver" data-tact="goSemana">Ver y anotar en Semana</button>';
  } else {
    html += '<form class="tarea-nueva" autocomplete="off">' +
      '<label class="sr-only" for="nt-' + ws + '">Nuevo pendiente</label>' +
      '<input id="nt-' + ws + '" class="field" type="text" maxlength="140" placeholder="Anotar un pendiente">' +
      '<button type="submit" class="btn primary">Añadir</button></form>';
  }
  return html + '</section>';
}

function renderTasksHoy() {
  var ws = weekStartOf(state.date);
  els.tasksHoy.innerHTML = state.ready && tasksOf(ws).length ? tasksHtml(ws, true) : '';
}
function renderTasksSemana() {
  els.tasksSemana.innerHTML = state.ready ? tasksHtml(state.weekStart, false) : '';
}

function onTaskClick(e) {
  var b = e.target.closest('button[data-tact]');
  if (!b) return;
  var box = b.closest('.tareas'), act = b.dataset.tact;
  if (act === 'goSemana') { state.weekStart = box.dataset.week; setTab('semana'); return; }
  var ws = box.dataset.week, id = b.dataset.tid;
  var items = tasksOf(ws).map(function (x) { return { id: x.id, text: x.text, done: x.done }; });
  if (act === 'carry') {
    var prev = addDays(ws, -7);
    var old = tasksOf(prev);
    var left = old.filter(function (x) { return !x.done; });
    saveTasks(prev, old.filter(function (x) { return x.done; }));
    saveTasks(ws, items.concat(left.map(function (x) { return { id: x.id, text: x.text, done: false }; })));
    render();
    say(left.length === 1 ? 'Pendiente pasado a esta semana.' : left.length + ' pendientes pasados a esta semana.');
    return;
  }
  var it = items.find(function (x) { return x.id === id; });
  if (!it) return;
  if (act === 'toggle') {
    it.done = !it.done;
    saveTasks(ws, items);
    render();
    refocus(document, '.tareas[data-week="' + ws + '"] button[data-tact="toggle"][data-tid="' + id + '"]');
  } else if (act === 'del') {
    if (state.confirmTask === id) {
      state.confirmTask = null;
      saveTasks(ws, items.filter(function (x) { return x.id !== id; }));
      render();
      say('Pendiente borrado.');
    } else {
      state.confirmTask = id;
      render();
      refocus(document, '.tareas[data-week="' + ws + '"] button[data-tact="del"][data-tid="' + id + '"]');
      clearTimeout(confirmTaskTimer);
      confirmTaskTimer = setTimeout(function () { if (state.confirmTask) { state.confirmTask = null; render(); } }, 4000);
    }
  }
}
var confirmTaskTimer;

function onTaskSubmit(e) {
  var form = e.target.closest('.tarea-nueva');
  if (!form) return;
  e.preventDefault();
  var input = form.querySelector('input'), text = input.value.trim().slice(0, 140);
  if (!text) { input.focus(); return; }
  var ws = form.closest('.tareas').dataset.week;
  if (tasksOf(ws).length >= 100) { say('Esta semana ya tiene 100 pendientes.', true); return; }
  saveTasks(ws, tasksOf(ws).concat([{ id: makeId(), text: text, done: false }]));
  render();
  refocus(els.tasksSemana, '.tarea-nueva input');
}

function freqEditor(h) {
  var f = freqOf(h), name = esc(h.name);
  var html = '<div class="freq-row"><label class="freq-label" for="f-' + h.id + '">Frecuencia</label>' +
    '<select id="f-' + h.id + '" class="field" data-id="' + h.id + '" data-role="freq">' + freqOptions(freqValue(h)) + '</select></div>';
  if (f.type === 'days') {
    html += '<div class="dias" role="group" aria-label="Días de ' + name + '">' + WD.map(function (w, i) {
      var on = f.days.indexOf(i) >= 0;
      return '<button type="button" class="dia' + (on ? ' on' : '') + '" data-act="day" data-id="' + h.id + '" data-d="' + i + '" aria-pressed="' + on + '">' + w + '</button>';
    }).join('') + '</div>';
  }
  return html;
}

// Si estás escribiendo un nombre, no se redibuja la lista (perderías lo que
// tipeás): se redibuja cuando salís del campo.
var habitosDiferido = false;
function editingHabit() {
  var a = document.activeElement;
  return !!a && els.habitList.contains(a) && (a.tagName === 'INPUT' || a.tagName === 'SELECT');
}
function renderHabitos(force) {
  renderAccount();
  if (!force && editingHabit()) { habitosDiferido = true; return; }
  habitosDiferido = false;
  if (!state.ready) {
    els.habitList.innerHTML = '<p class="empty-note">Cargando tus hábitos…</p>';
    return;
  }
  var list = ordered();
  if (!list.length) { els.habitList.innerHTML = emptyHtml(false); return; }
  els.habitList.innerHTML = CATS.map(function (c) {
    var hs = list.filter(function (h) { return h.cat === c.key; });
    if (!hs.length) return '';
    return '<section class="cat vidrio cat-' + c.key + '"><header class="cat-head"><h2>' + c.label + '</h2><span class="count">' + hs.length + '</span></header>' +
      '<ul class="habits">' + hs.map(function (h, i) {
        var name = esc(h.name), armed = state.confirmDel === h.id;
        return '<li class="edit-row">' +
          '<label class="sr-only" for="n-' + h.id + '">Nombre del hábito</label>' +
          '<input id="n-' + h.id + '" class="field" type="text" value="' + name + '" maxlength="60" data-id="' + h.id + '" autocomplete="off">' +
          '<div class="edit-actions">' +
          '<label class="sr-only" for="c-' + h.id + '">Categoría</label>' +
          '<select id="c-' + h.id + '" class="field" data-id="' + h.id + '" data-role="cat">' + CATS.map(function (k) {
            return '<option value="' + k.key + '"' + (k.key === h.cat ? ' selected' : '') + '>' + k.label + '</option>';
          }).join('') + '</select>' +
          '<button type="button" class="icon-btn" data-act="up" data-id="' + h.id + '" aria-label="Subir ' + name + '"' + (i === 0 ? ' disabled' : '') + '>' + UP + '</button>' +
          '<button type="button" class="icon-btn" data-act="down" data-id="' + h.id + '" aria-label="Bajar ' + name + '"' + (i === hs.length - 1 ? ' disabled' : '') + '>' + DOWN + '</button>' +
          '<button type="button" class="btn danger' + (armed ? ' armed' : '') + '" data-act="del" data-id="' + h.id + '">' + (armed ? 'Confirmar' : 'Eliminar') + '</button>' +
          '</div>' + freqEditor(h) + '</li>';
        }).join('') + '</ul></section>';
  }).join('');
}

function renderAccount() {
  if (!store) return;
  renderReminder();
  var u = state.user;
  if (store.mode === 'cloud') {
    els.accountText.innerHTML = u ? 'Entraste como <strong>' + esc(u.email || u.name || 'tu cuenta de Google') + '</strong>.' : '';
    els.signOut.hidden = !u;
    var off = !state.online;
    els.syncText.classList.toggle('pendiente', off || state.pending);
    els.syncText.textContent = off
      ? 'Sin conexión: tus marcas quedan en este aparato y se suben solas cuando vuelve.'
      : state.pending ? 'Subiendo tus cambios…' : 'Todo guardado en la nube.';
  } else {
    els.accountText.textContent = 'Modo local: tus datos se guardan solo en este navegador. Exportá un respaldo de vez en cuando.';
    els.signOut.hidden = true;
    els.syncText.hidden = true;
  }
}

function render() {
  if (state.tab === 'hoy') renderHoy();
  else if (state.tab === 'semana') renderSemana();
  else if (state.tab === 'mes') renderMes();
  else renderHabitos();
}

function setTab(t) {
  state.tab = t;
  els.viewHoy.hidden = t !== 'hoy';
  els.viewSemana.hidden = t !== 'semana';
  els.viewMes.hidden = t !== 'mes';
  els.viewHabitos.hidden = t !== 'habitos';
  document.querySelectorAll('.tab').forEach(function (b) {
    if (b.dataset.tab === t) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  render();
  window.scrollTo(0, 0);
}

function showLogin(on) {
  els.viewLogin.hidden = !on;
  els.tabbar.hidden = on;
  if (on) {
    els.viewHoy.hidden = els.viewSemana.hidden = els.viewMes.hidden = els.viewHabitos.hidden = true;
  } else {
    setTab(state.tab);
  }
}

/* ---------- acciones ---------- */

function loadStarter() {
  STARTER.forEach(function (p) { state.habits.push({ id: makeId(), name: p[1], cat: p[0] }); });
  persistHabits();
  render();
  say('Lista base cargada. Editala en la pestaña Hábitos.');
}
function move(id, dir) {
  var i = state.habits.findIndex(function (h) { return h.id === id; });
  if (i < 0) return;
  var cat = state.habits[i].cat, j = i + dir;
  while (j >= 0 && j < state.habits.length && state.habits[j].cat !== cat) j += dir;
  if (j < 0 || j >= state.habits.length) return;
  var tmp = state.habits[i]; state.habits[i] = state.habits[j]; state.habits[j] = tmp;
  persistHabits();
  renderHabitos(true);
  refocus(els.habitList, 'button[data-act="' + (dir < 0 ? 'up' : 'down') + '"][data-id="' + id + '"]:not(:disabled)');
}

/** Suma datos que llegan (respaldo o navegador) a los actuales y los guarda. */
function applyIncoming(incoming, prefer) {
  var r = mergeData({ habits: state.habits, logs: state.logs, tasks: state.tasks }, incoming, prefer);
  Object.keys(r.tasksPatch).forEach(function (w) { state.tasks[w] = r.tasksPatch[w]; });
  state.habits = r.habits;
  Object.keys(r.patch).forEach(function (mk) {
    var m = state.logs[mk] || (state.logs[mk] = {});
    Object.keys(r.patch[mk]).forEach(function (date) {
      m[date] = Object.assign(m[date] || {}, r.patch[mk][date]);
    });
  });
  store.applyMerge(state.habits, r.patch, r.tasksPatch).catch(saveError);
  render();
  return r;
}

function plural(n, uno, varios) { return n + ' ' + (n === 1 ? uno : varios); }

/* La primera vez que entrás con tu cuenta, si este navegador tiene datos de
   antes, te ofrece sumarlos. Lo que ya está en la nube no se pisa. */
var migrationAsked = false;
async function offerMigration() {
  if (migrationAsked || store.mode !== 'cloud' || !state.user) return;
  migrationAsked = true;
  var key = 'mh:migrado:' + state.user.uid;
  try { if (localStorage.getItem(key)) return; } catch (e) { return; }
  var local = readLocalData();
  var days = countDays(cleanLogs(local.logs)), nt = countTasks(local.tasks);
  if (!local.habits.length && !days && !nt) return;
  var ok = await ask({
    eyebrow: 'Datos en este navegador',
    title: 'Traer tu historial',
    text: 'Encontramos ' + plural(local.habits.length, 'hábito', 'hábitos') + ' y ' + plural(days, 'día', 'días') +
      ' con marcas' + (nt ? ' y ' + plural(nt, 'pendiente', 'pendientes') : '') + ' guardados en este navegador. ¿Los sumamos a tu cuenta? Lo que ya tengas en la nube no se pisa.',
    ok: 'Importar', cancel: 'No importar'
  });
  if (ok === null) { migrationAsked = false; return; } // cerró con Esc: se vuelve a ofrecer la próxima vez
  try { localStorage.setItem(key, ok ? 'importado' : 'rechazado'); } catch (e) { /* sin almacenamiento */ }
  if (ok) {
    var r = applyIncoming(local, 'existing');
    say('Listo: ' + plural(r.newHabits, 'hábito nuevo', 'hábitos nuevos') + ' y ' + plural(r.marks, 'marca', 'marcas') + ' importadas.');
  }
}

function exportBackup() {
  var data = makeBackup(state.habits, state.logs, state.tasks);
  var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'habitos-' + state.today + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  say('Respaldo descargado: ' + a.download);
}

async function importBackup(file) {
  var data;
  try { data = parseBackup(await file.text()); }
  catch (e) { say(e.message, true); return; }
  var days = countDays(data.logs), nt = countTasks(data.tasks);
  var ok = await ask({
    eyebrow: 'Importar respaldo',
    title: file.name.length > 28 ? 'Cargar respaldo' : file.name,
    text: 'Este archivo trae ' + plural(data.habits.length, 'hábito', 'hábitos') + ' y ' + plural(days, 'día', 'días') +
      ' con marcas' + (nt ? ', y ' + plural(nt, 'pendiente', 'pendientes') : '') + '. Se suman a lo que ya tenés; si un día tiene una marca distinta, queda la del archivo. No se borra nada.',
    ok: 'Importar', cancel: 'Cancelar'
  });
  if (!ok) return;
  var r = applyIncoming(data, 'incoming');
  say('Respaldo importado: ' + plural(r.newHabits, 'hábito nuevo', 'hábitos nuevos') + ', ' + plural(r.marks, 'marca', 'marcas') + ' y ' + plural(r.newTasks, 'pendiente', 'pendientes') + '.');
}

/* ---------- eventos ---------- */

var confirmTimer;
els.hoyList.addEventListener('click', function (e) {
  var b = e.target.closest('button[data-act]');
  if (!b) return;
  var act = b.dataset.act;
  if (act === 'starter') { loadStarter(); return; }
  if (act === 'goHabitos') { setTab('habitos'); return; }
  var id = b.dataset.id;
  if (!id || state.date > state.today) return;
  var cur = val(state.date, id);
  var next = act === 'done' ? (cur === 1 ? undefined : 1) : (cur === 0 ? undefined : 0);
  setVal(state.date, id, next);
  renderHoy();
  refocus(els.hoyList, 'button[data-act="' + act + '"][data-id="' + id + '"]');
});

els.weekGrid.addEventListener('click', function (e) {
  var b = e.target.closest('button.cell');
  if (!b || b.disabled) return;
  var id = b.dataset.id, date = b.dataset.date;
  var cur = val(date, id);
  setVal(date, id, cur === undefined ? 1 : cur === 1 ? 0 : undefined);
  renderSemana();
  refocus(els.weekGrid, 'button.cell[data-id="' + id + '"][data-date="' + date + '"]');
});

els.habitList.addEventListener('click', function (e) {
  var b = e.target.closest('button[data-act]');
  if (!b) return;
  var act = b.dataset.act, id = b.dataset.id;
  if (act === 'starter') { loadStarter(); return; }
  if (act === 'up') { move(id, -1); return; }
  if (act === 'down') { move(id, 1); return; }
  if (act === 'day') {
    var hd = state.habits.find(function (x) { return x.id === id; });
    if (!hd) return;
    var fd = freqOf(hd), dn = Number(b.dataset.d);
    var dset = fd.days.indexOf(dn) >= 0 ? fd.days.filter(function (x) { return x !== dn; }) : fd.days.concat([dn]).sort();
    if (!dset.length) { say('Elegí al menos un día.', true); return; }
    hd.freq = { type: 'days', days: dset };
    persistHabits();
    renderHabitos(true);
    refocus(els.habitList, 'button[data-act="day"][data-id="' + id + '"][data-d="' + dn + '"]');
    return;
  }
  if (act === 'del') {
    if (state.confirmDel === id) {
      state.habits = state.habits.filter(function (h) { return h.id !== id; });
      state.confirmDel = null;
      persistHabits();
      renderHabitos(true);
      say('Hábito eliminado.');
    } else {
      state.confirmDel = id;
      renderHabitos(true);
      refocus(els.habitList, 'button[data-act="del"][data-id="' + id + '"]');
      clearTimeout(confirmTimer);
      confirmTimer = setTimeout(function () {
        if (state.confirmDel) { state.confirmDel = null; if (state.tab === 'habitos') renderHabitos(); }
      }, 5000);
    }
  }
});
document.addEventListener('click', function (e) {
  if (state.confirmTask && !e.target.closest('button[data-tact="del"]')) {
    state.confirmTask = null;
    render();
  }
  if (state.confirmDel && !e.target.closest('button[data-act="del"]')) {
    state.confirmDel = null;
    if (state.tab === 'habitos') renderHabitos();
  }
});

els.habitList.addEventListener('change', function (e) {
  var t = e.target, id = t.dataset && t.dataset.id;
  if (!id) return;
  var h = state.habits.find(function (x) { return x.id === id; });
  if (!h) return;
  if (t.tagName === 'INPUT') {
    var v = t.value.trim().slice(0, 60);
    if (v && v !== h.name) { h.name = v; persistHabits(); }
  } else if (t.dataset.role === 'cat') {
    if (CATS.some(function (c) { return c.key === t.value; })) { h.cat = t.value; persistHabits(); }
  } else if (t.dataset.role === 'freq') {
    var nf = freqFrom(t.value, h.freq);
    if (nf) h.freq = nf; else delete h.freq;
    persistHabits();
    renderHabitos(true);
    refocus(els.habitList, 'select[data-role="freq"][data-id="' + id + '"]');
    return;
  }
  renderHabitos(true);
});
els.habitList.addEventListener('focusout', function () {
  setTimeout(function () { if (habitosDiferido && !editingHabit() && state.tab === 'habitos') renderHabitos(); }, 0);
});

els.addForm.addEventListener('submit', function (e) {
  e.preventDefault();
  var name = els.newName.value.trim().slice(0, 60);
  if (!name) { els.newName.focus(); return; }
  var nh = { id: makeId(), name: name, cat: els.newCat.value };
  var nfq = freqFrom(els.newFreq.value);
  if (nfq) nh.freq = nfq;
  state.habits.push(nh);
  persistHabits();
  els.newName.value = '';
  els.newFreq.value = 'daily';
  renderHabitos(true);
  say('Hábito añadido a ' + CATS.find(function (c) { return c.key === els.newCat.value; }).label + '.');
});

els.prevDay.addEventListener('click', function () {
  state.date = addDays(state.date, -1); state.followToday = false; renderHoy();
});
els.nextDay.addEventListener('click', function () {
  if (state.date >= state.today) return;
  state.date = addDays(state.date, 1); state.followToday = state.date === state.today; renderHoy();
});
els.goToday.addEventListener('click', function () {
  state.date = state.today; state.followToday = true; renderHoy();
});
els.prevWeek.addEventListener('click', function () {
  state.weekStart = addDays(state.weekStart, -7); renderSemana();
});
els.nextWeek.addEventListener('click', function () {
  if (state.weekStart > weekStartOf(state.today)) return;
  state.weekStart = addDays(state.weekStart, 7); renderSemana();
});
els.prevMonth.addEventListener('click', function () {
  state.month = addMonths(state.month, -1); state.followMonth = false; renderMes();
});
els.nextMonth.addEventListener('click', function () {
  if (state.month >= state.today.slice(0, 7)) return;
  state.month = addMonths(state.month, 1); state.followMonth = state.month === state.today.slice(0, 7); renderMes();
});
els.goThisMonth.addEventListener('click', function () {
  state.month = state.today.slice(0, 7); state.followMonth = true; renderMes();
});
els.monthBody.addEventListener('click', function (e) {
  var b = e.target.closest('button.cal-dia');
  if (!b || b.disabled) return;
  state.date = b.dataset.date;
  state.followToday = state.date === state.today;
  setTab('hoy');
});
document.querySelectorAll('.tab').forEach(function (b) {
  b.addEventListener('click', function () { setTab(b.dataset.tab); });
});

els.tasksHoy.addEventListener('click', onTaskClick);
els.tasksSemana.addEventListener('click', onTaskClick);
els.tasksSemana.addEventListener('submit', onTaskSubmit);

els.exportBtn.addEventListener('click', exportBackup);
els.importBtn.addEventListener('click', function () { els.importFile.click(); });
els.importFile.addEventListener('change', function () {
  var f = els.importFile.files && els.importFile.files[0];
  els.importFile.value = '';
  if (f) importBackup(f);
});

els.signIn.addEventListener('click', async function () {
  els.signIn.disabled = true;
  try {
    await store.signIn();
  } catch (e) {
    var code = e && e.code || '';
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') { /* lo cerró: nada que avisar */ }
    else if (code === 'auth/popup-blocked') say('El navegador bloqueó la ventana de Google. Permití las ventanas emergentes para este sitio y probá de nuevo.', true);
    else if (code === 'auth/network-request-failed') say('Sin conexión. Para entrar la primera vez necesitás internet.', true);
    else if (code === 'auth/unauthorized-domain') say('Este sitio todavía no está autorizado en Firebase (Authentication › Configuración › Dominios autorizados).', true);
    else { console.error(e); say('No se pudo entrar con Google. Probá de nuevo.', true); }
  } finally {
    els.signIn.disabled = false;
  }
});
els.signOut.addEventListener('click', async function () {
  var ok = await ask({
    eyebrow: 'Cuenta', title: 'Cerrar sesión',
    text: 'Tus datos quedan guardados en tu cuenta. Para volver a verlos, entrá de nuevo con Google.',
    ok: 'Cerrar sesión', cancel: 'Cancelar'
  });
  if (ok) store.signOut();
});

/* ---------- recordatorio diario ----------
   Acá solo se elige la hora y se registra el aparato. El aviso lo manda
   recordatorio/enviar.mjs desde GitHub Actions, si a esa hora te falta algo. */

var reminder = { enabled: false, time: '21:00', tokens: [] };
var device = { token: null, busy: false, failed: false, tried: false };

function notifState() { return 'Notification' in window ? Notification.permission : 'unsupported'; }
function isIOS() { return /iPhone|iPad|iPod/.test(navigator.userAgent); }

function renderReminder() {
  if (!store || store.mode !== 'cloud' || !state.user) { els.reminderPanel.hidden = true; return; }
  els.reminderPanel.hidden = false;
  els.remOn.checked = reminder.enabled;
  if (document.activeElement !== els.remTime) els.remTime.value = reminder.time;
  var st = notifState(), msg;
  var off = !vapidKey || st === 'unsupported' || st === 'denied';
  els.remOn.disabled = off && !reminder.enabled;
  if (!vapidKey) msg = 'Falta configurar los avisos en Firebase.';
  else if (st === 'unsupported') msg = isIOS() ? 'En iPhone los avisos funcionan con la app instalada: Compartir › Agregar a inicio, y activalos desde ahí.' : 'Este navegador no puede mostrar avisos.';
  else if (st === 'denied') msg = 'Las notificaciones están bloqueadas para este sitio. Activalas en los ajustes del navegador y volvé a intentar.';
  else if (!reminder.enabled) msg = 'Apagado.';
  else if (device.busy) msg = 'Registrando este aparato…';
  else if (device.failed) msg = 'Activado a las ' + reminder.time + ', pero este aparato no se pudo registrar. Apagalo y prendelo para probar de nuevo.';
  else if (st !== 'granted' || !device.token) msg = 'Activado a las ' + reminder.time + '. Para recibirlo en este aparato, apagalo y prendelo acá.';
  else msg = 'Activado: si a las ' + reminder.time + ' te falta marcar algo, te aviso. Puede llegar hasta 20 minutos después.';
  els.remStatus.textContent = msg;
  els.remTest.hidden = st !== 'granted';
}

async function registerDevice(quiet) {
  if (device.busy) return;
  device.busy = true; device.failed = false; device.tried = true;
  renderReminder();
  try {
    if (!('serviceWorker' in navigator)) throw new Error('sin-service-worker');
    var reg = await navigator.serviceWorker.ready;
    device.token = await store.registerDevice(vapidKey, reg);
    if (!quiet) say('Listo: te aviso a las ' + reminder.time + ' si te falta algo.');
  } catch (e) {
    console.warn('No se pudo registrar el aparato para avisos:', e);
    device.failed = true;
    if (!quiet) say('No se pudo registrar este aparato para recibir avisos.', true);
  } finally {
    device.busy = false;
    renderReminder();
  }
}

function startReminder() {
  if (store.mode !== 'cloud') return;
  store.watchReminder(function (r) {
    reminder = r;
    renderReminder();
    // Si ya está activado y este aparato dio permiso, se renueva su registro
    // en silencio una vez por sesión (el token puede cambiar con el tiempo).
    if (r.enabled && vapidKey && notifState() === 'granted' && !device.tried) registerDevice(true);
  });
}

els.remOn.addEventListener('change', async function () {
  if (!els.remOn.checked) {
    reminder.enabled = false;
    store.saveReminder({ enabled: false }).catch(saveError);
    renderReminder();
    return;
  }
  if (!vapidKey || notifState() === 'unsupported') { els.remOn.checked = false; renderReminder(); return; }
  var perm = await Notification.requestPermission();
  if (perm !== 'granted') {
    els.remOn.checked = false;
    renderReminder();
    say('Sin permiso para notificaciones no puedo avisarte.', true);
    return;
  }
  var time = /^\d{2}:\d{2}$/.test(els.remTime.value) ? els.remTime.value : '21:00';
  reminder.enabled = true; reminder.time = time;
  store.saveReminder({ enabled: true, time: time }).catch(saveError);
  registerDevice(false);
});
els.remTime.addEventListener('change', function () {
  var time = els.remTime.value;
  if (!/^\d{2}:\d{2}$/.test(time)) return;
  reminder.time = time;
  store.saveReminder({ time: time }).catch(saveError);
  renderReminder();
  if (reminder.enabled) say('Aviso a las ' + time + '.');
});
els.remTest.addEventListener('click', async function () {
  try {
    var reg = await navigator.serviceWorker.ready;
    await reg.showNotification('Mis hábitos', {
      body: 'Así se ven los avisos. El de verdad llega solo si te falta marcar algo.',
      icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', tag: 'prueba'
    });
  } catch (e) {
    console.warn(e);
    say('No se pudo mostrar el aviso de prueba.', true);
  }
});

/* ---------- conexión y cambio de día ---------- */

window.addEventListener('online', function () { state.online = true; renderAccount(); say('Conexión recuperada. Sincronizando…'); });
window.addEventListener('offline', function () {
  state.online = false; renderAccount();
  if (store && store.mode === 'cloud') say('Sin conexión. Seguí marcando: se sube solo cuando vuelve.');
});

// El día cambia a la medianoche de Buenos Aires, aunque la app quede abierta.
function checkDay() {
  var t = todayStr();
  if (t === state.today) return;
  var prev = state.today;
  state.today = t;
  if (state.followToday) state.date = t;
  if (state.weekStart === weekStartOf(prev)) state.weekStart = weekStartOf(t);
  if (state.followMonth) state.month = t.slice(0, 7);
  render();
}
setInterval(checkDay, 20000);
document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'visible') checkDay();
});

/* ---------- arranque ---------- */

function onData(data, meta) {
  var habits = data.habits, logs = data.logs, tasks = data.tasks;
  state.pending = !!meta.pending;
  var key = JSON.stringify([habits, logs, tasks]);
  var first = !state.ready;
  state.ready = true;
  if (key === state.dataKey && !first) { renderAccount(); return; }
  state.dataKey = key;
  state.habits = clone(habits);
  state.logs = clone(logs);
  state.tasks = clone(tasks);
  // Que redibujar no te saque el foco del botón que estabas usando.
  var a = document.activeElement, sel = null;
  if (a && a.tagName === 'BUTTON' && a.dataset && a.dataset.id) {
    sel = 'button[data-id="' + a.dataset.id + '"]' +
      (a.dataset.act ? '[data-act="' + a.dataset.act + '"]' : '') +
      (a.dataset.date ? '[data-date="' + a.dataset.date + '"]' : '');
  }
  var typing = a && a.closest && a.closest('.tarea-nueva') ? { week: a.closest('.tareas').dataset.week, value: a.value } : null;
  render();
  if (typing) {
    var again = document.querySelector('.tareas[data-week="' + typing.week + '"] .tarea-nueva input');
    if (again) { again.value = typing.value; again.focus(); }
  }
  if (sel && document.activeElement !== a) refocus(document, sel);
  if (first) offerMigration();
}

async function boot() {
  drawOrnaments();
  render();
  try {
    store = await createStore();
  } catch (e) {
    console.error(e);
    state.ready = true;
    render();
    say('No se pudo conectar con la base de datos. Revisá la conexión y recargá la página.', true);
    return;
  }
  store.onAuth(function (user) {
    var prevUid = state.user && state.user.uid;
    state.user = user;
    if (!user) {
      store.stop();
      state.ready = false; state.habits = []; state.logs = {}; state.tasks = {}; state.dataKey = ''; migrationAsked = false;
      // Que no quede nada de la cuenta anterior dibujado en las vistas ocultas.
      els.summary.innerHTML = els.tasksHoy.innerHTML = els.tasksSemana.innerHTML = els.hoyList.innerHTML = els.weekGrid.innerHTML = els.monthBody.innerHTML = els.habitList.innerHTML = '';
      state.tab = 'hoy'; state.date = state.today; state.followToday = true; state.weekStart = weekStartOf(state.today);
      state.month = state.today.slice(0, 7); state.followMonth = true;
      showLogin(true);
      return;
    }
    showLogin(false);
    if (prevUid === user.uid) return;
    store.stop();
    device = { token: null, busy: false, failed: false, tried: false };
    store.start(onData, function (e) {
      console.error(e);
      state.ready = true;
      render();
      say('No se pudieron leer tus datos. Recargá la página.', true);
    });
    startReminder();
  });
}
boot();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function (e) { console.warn('Sin modo offline:', e); });
  });
}
