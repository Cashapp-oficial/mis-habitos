// Prueba las cuentas de datos.js: racha, récord y cumplimiento según la frecuencia.
// Se corre con: node --test pruebas/datos.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { streak, bestStreak, periodScore, pct, isScheduled, freqLabel, cleanHabit, validHabit, monthStats } from '../datos.js';

// Arma logs a partir de { 'AAAA-MM-DD': 1 | 0 } para un hábito.
function logsDe(id, marcas) {
  const logs = {};
  for (const [d, v] of Object.entries(marcas)) {
    const mk = d.slice(0, 7);
    logs[mk] ??= {};
    logs[mk][d] = { ...(logs[mk][d] || {}), [id]: v };
  }
  return logs;
}

// Octubre 2026: el lunes 5 empieza una semana; el 11 es domingo.
const diario = { id: 'a', name: 'Agua', cat: 'cuidado' };
const lmv = { id: 'b', name: 'Gimnasio', cat: 'ejercicio', freq: { type: 'days', days: [0, 2, 4] } };
const tresPorSemana = { id: 'c', name: 'Correr', cat: 'ejercicio', freq: { type: 'weekly', times: 3 } };

test('diario: días seguidos; hoy sin marcar no corta', () => {
  const logs = logsDe('a', { '2026-10-08': 1, '2026-10-09': 1, '2026-10-10': 1 });
  assert.deepEqual(streak(logs, diario, '2026-10-11'), { n: 3, unit: 'd' });
  assert.deepEqual(streak(logsDe('a', { '2026-10-09': 1, '2026-10-10': 0 }), diario, '2026-10-11'), { n: 0, unit: 'd' });
});

test('días fijos: los días que no tocan no cortan la racha', () => {
  // lunes 5, miércoles 7, viernes 9 hechos; martes y jueves sin marcar.
  const logs = logsDe('b', { '2026-10-05': 1, '2026-10-07': 1, '2026-10-09': 1 });
  assert.equal(streak(logs, lmv, '2026-10-11').n, 3);
  assert.equal(isScheduled(lmv, '2026-10-06'), false);
  assert.equal(isScheduled(lmv, '2026-10-07'), true);
  // si falló el miércoles, la racha arranca del viernes.
  assert.equal(streak(logsDe('b', { '2026-10-05': 1, '2026-10-09': 1 }), lmv, '2026-10-11').n, 1);
});

test('X por semana: semanas seguidas cumpliendo; la semana en curso no corta', () => {
  const logs = logsDe('c', {
    '2026-09-28': 1, '2026-09-30': 1, '2026-10-02': 1, // semana del 28/9: 3 → cumple
    '2026-10-05': 1, '2026-10-06': 1, '2026-10-08': 1, // semana del 5/10: 3 → cumple
    '2026-10-12': 1 // semana del 12/10: 1 hasta ahora
  });
  assert.deepEqual(streak(logs, tresPorSemana, '2026-10-13'), { n: 2, unit: 'sem' });
  assert.deepEqual(streak(logs, tresPorSemana, '2026-10-11'), { n: 2, unit: 'sem' });
});

test('récord: la racha más larga de la historia', () => {
  const logs = logsDe('a', {
    '2026-10-01': 1, '2026-10-02': 1, '2026-10-03': 1, '2026-10-04': 1, // 4 seguidos
    '2026-10-05': 0,
    '2026-10-06': 1, '2026-10-07': 1 // 2 seguidos
  });
  assert.equal(bestStreak(logs, diario, '2026-10-07').n, 4);
  assert.equal(streak(logs, diario, '2026-10-07').n, 2);
  assert.equal(bestStreak({}, diario, '2026-10-07').n, 0);
});

test('cumplimiento: cada hábito contra lo que se propuso', () => {
  const logs = {
    ...logsDe('a', { '2026-10-05': 1, '2026-10-06': 1 }),
  };
  // Diario, lunes 5 a domingo 11: 2 de 7.
  assert.equal(pct(periodScore(logs, [diario], '2026-10-05', '2026-10-11')), 29);
  // L-M-V hecho los tres: 100%, aunque los demás días estén vacíos.
  const l2 = logsDe('b', { '2026-10-05': 1, '2026-10-07': 1, '2026-10-09': 1 });
  assert.equal(pct(periodScore(l2, [lmv], '2026-10-05', '2026-10-11')), 100);
  // 3 por semana, hecho 4 veces: no pasa del 100%.
  const l3 = logsDe('c', { '2026-10-05': 1, '2026-10-06': 1, '2026-10-07': 1, '2026-10-08': 1 });
  assert.equal(pct(periodScore(l3, [tresPorSemana], '2026-10-05', '2026-10-11')), 100);
  // Sin nada que tocara: null, no 0%.
  assert.equal(pct(periodScore({}, [], '2026-10-05', '2026-10-11')), null);
});

test('el día del mes cuenta solo lo que tocaba', () => {
  const logs = logsDe('a', { '2026-10-06': 1 });
  const dia = monthStats(logs, [diario, lmv, tresPorSemana], '2026-10', '2026-10-06')[5]; // martes 6
  assert.deepEqual([dia.done, dia.due], [1, 1]); // L-M-V no toca el martes; 3 por semana no hecho
});

test('frecuencia: textos, limpieza y validación', () => {
  assert.equal(freqLabel(diario), 'todos los días');
  assert.equal(freqLabel(lmv), 'L X V');
  assert.equal(freqLabel(tresPorSemana), '3 veces por semana');
  assert.equal(freqLabel({ ...lmv, freq: { type: 'days', days: [4, 0, 1, 2, 3] } }), 'de lunes a viernes');
  assert.deepEqual(cleanHabit(diario), { id: 'a', name: 'Agua', cat: 'cuidado' });
  assert.deepEqual(cleanHabit({ ...diario, freq: { type: 'daily' } }), { id: 'a', name: 'Agua', cat: 'cuidado' });
  assert.equal(validHabit({ ...diario, freq: { type: 'weekly', times: 9 } }), false);
  assert.equal(validHabit({ ...diario, freq: { type: 'days', days: [] } }), false);
});
