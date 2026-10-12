// Prueba la lógica del recordatorio diario (recordatorio/enviar.mjs) sin mandar nada.
// Se corre con: node --test pruebas/recordatorio.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { armarAviso, tocaAvisar, minutosBA } from '../recordatorio/enviar.mjs';

const H = (id, name, freq) => ({ id, name, cat: 'cuidado', ...(freq ? { freq } : {}) });
const logs = (marcas) => {
  const out = {};
  for (const [d, m] of Object.entries(marcas)) (out[d.slice(0, 7)] ??= {})[d] = m;
  return out;
};

// Domingo 11/10/2026 (último día de la semana del lunes 5).
const hoy = '2026-10-11';

test('avisa lo que toca hoy y no está marcado', () => {
  const habits = [H('a', 'Meditar'), H('b', 'Leer'), H('c', 'Agua')];
  const a = armarAviso(habits, logs({ [hoy]: { c: 1 } }), {}, hoy);
  assert.equal(a.body, 'Te faltan: Meditar y Leer.');
});

test('lo marcado como "no lo hice" ya está decidido: no se avisa', () => {
  const habits = [H('a', 'Meditar')];
  assert.equal(armarAviso(habits, logs({ [hoy]: { a: 0 } }), {}, hoy), null);
});

test('días fijos: si hoy no toca, no avisa', () => {
  const habits = [H('g', 'Gimnasio', { type: 'days', days: [0, 2, 4] })];
  assert.equal(armarAviso(habits, {}, {}, hoy), null);
});

test('X por semana: avisa solo si hoy es la última chance de llegar a la meta', () => {
  const tres = H('r', 'Correr', { type: 'weekly', times: 3 });
  // Domingo con 2 de 3: hay que hacerlo hoy.
  assert.equal(armarAviso([tres], logs({ '2026-10-06': { r: 1 }, '2026-10-08': { r: 1 } }), {}, hoy).body, 'Te falta: Correr.');
  // Domingo con 3 de 3: no.
  assert.equal(armarAviso([tres], logs({ '2026-10-06': { r: 1 }, '2026-10-08': { r: 1 }, '2026-10-09': { r: 1 } }), {}, hoy), null);
  // Martes con 0 de 3: quedan 6 días, no hace falta avisar.
  assert.equal(armarAviso([tres], {}, {}, '2026-10-06'), null);
});

test('muchos faltantes y pendientes de la semana', () => {
  const habits = ['Uno', 'Dos', 'Tres', 'Cuatro', 'Cinco'].map((n, i) => H('h' + i, n));
  const tasks = { '2026-10-05': [{ id: 't', text: 'Dentista', done: false }, { id: 'u', text: 'Informe', done: true }] };
  assert.equal(armarAviso(habits, {}, tasks, hoy).body, 'Te faltan 5: Uno, Dos y 3 más. Y 1 pendiente de la semana.');
  assert.equal(armarAviso([], {}, tasks, hoy).body, 'Te queda 1 pendiente de la semana.');
});

test('cuándo toca avisar', () => {
  const rem = { enabled: true, time: '21:00', tokens: ['x'] };
  const a = (iso) => new Date(iso);
  assert.equal(minutosBA(a('2026-10-11T21:05:00-03:00')), 21 * 60 + 5);
  assert.equal(tocaAvisar(rem, hoy, a('2026-10-11T20:59:00-03:00')), false); // antes de hora
  assert.equal(tocaAvisar(rem, hoy, a('2026-10-11T21:10:00-03:00')), true);
  assert.equal(tocaAvisar({ ...rem, lastSent: hoy }, hoy, a('2026-10-11T21:10:00-03:00')), false); // ya avisó hoy
  assert.equal(tocaAvisar(rem, hoy, a('2026-10-12T00:30:00-03:00')), false); // más de 3 horas tarde
  assert.equal(tocaAvisar({ ...rem, enabled: false }, hoy, a('2026-10-11T21:10:00-03:00')), false);
  assert.equal(tocaAvisar({ ...rem, tokens: [] }, hoy, a('2026-10-11T21:10:00-03:00')), false);
});
