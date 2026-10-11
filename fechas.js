/*
  Fechas. Todas las fechas de la app son textos "AAAA-MM-DD" del calendario de
  Buenos Aires: el día cambia a la medianoche de Argentina aunque el aparato
  esté configurado en otra zona horaria.

  Para hacer cuentas, cada fecha se convierte a un Date a las 12:00 UTC. Así
  sumar o restar días nunca cae en un cambio de horario, y los formateadores
  de abajo usan timeZone "UTC" para mostrar ese mismo día.
*/

export const ZONA = 'America/Buenos_Aires';

var partesHoy = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit'
});

export function pad(n) { return String(n).padStart(2, '0'); }

/** Hoy en Buenos Aires, como "AAAA-MM-DD". */
export function todayStr(ahora) {
  var p = {};
  partesHoy.formatToParts(ahora || new Date()).forEach(function (x) { p[x.type] = x.value; });
  return p.year + '-' + p.month + '-' + p.day;
}

export function parse(s) {
  var p = s.split('-').map(Number);
  return new Date(Date.UTC(p[0], p[1] - 1, p[2], 12));
}
export function ymd(d) {
  return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
}
export function addDays(s, n) {
  var d = parse(s);
  d.setUTCDate(d.getUTCDate() + n);
  return ymd(d);
}
/** Lunes de la semana de esa fecha. */
export function weekStartOf(s) {
  var k = (parse(s).getUTCDay() + 6) % 7;
  return addDays(s, -k);
}
export function isValidDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && ymd(parse(s)) === s;
}

export var fmtWd = new Intl.DateTimeFormat('es-AR', { weekday: 'long', timeZone: 'UTC' });
export var fmtDay = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long', timeZone: 'UTC' });
export var fmtShort = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
export var fmtMonth = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
