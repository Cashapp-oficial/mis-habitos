/*
  Recordatorio diario. Lo corre GitHub Actions cada 15 minutos
  (.github/workflows/recordatorio.yml). Para cada persona con el aviso
  activado: si ya pasó su hora (en Buenos Aires), todavía no se le avisó hoy
  y le falta marcar algo de hoy, le manda una notificación a sus aparatos.
  Un aviso por día como máximo; si no falta nada, no manda nada.

  Necesita el secreto FIREBASE_SERVICE_ACCOUNT (la clave de la cuenta de
  servicio de Firebase, en JSON). Sin el secreto termina sin hacer nada.

  Para probar en la compu contra el emulador:
    FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 DRY_RUN=1 node recordatorio/enviar.mjs
  DRY_RUN=1 escribe en pantalla el aviso en vez de mandarlo.
  AHORA="2026-10-11T21:05:00-03:00" simula otra hora.
*/

import { pathToFileURL } from 'node:url';
import { todayStr, weekStartOf } from '../fechas.js';
import { validHabit, getVal, isScheduled, freqOf, weekCount, weekday, cleanTasks } from '../datos.js';

const VENTANA_MIN = 180; // si el programa no corrió a tiempo, avisa igual hasta 3 horas después

/** Minutos desde la medianoche en Buenos Aires. */
export function minutosBA(ahora) {
  const p = {};
  new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Buenos_Aires', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(ahora).forEach((x) => { p[x.type] = x.value; });
  return Number(p.hour) * 60 + Number(p.minute);
}

/** ¿Le toca el aviso ahora? */
export function tocaAvisar(rem, hoy, ahora) {
  if (!rem || rem.enabled !== true || !Array.isArray(rem.tokens) || !rem.tokens.length) return false;
  if (rem.lastSent === hoy) return false;
  const m = /^(\d{2}):(\d{2})$/.exec(rem.time || '');
  if (!m) return false;
  const desde = Number(m[1]) * 60 + Number(m[2]);
  const ya = minutosBA(ahora);
  return ya >= desde && ya - desde <= VENTANA_MIN;
}

function lista(nombres) {
  if (nombres.length === 1) return nombres[0];
  return nombres.slice(0, -1).join(', ') + ' y ' + nombres[nombres.length - 1];
}

/**
 * Qué falta hoy: los que tocan y no están marcados, y los de "X por semana"
 * que ya no llegan a la meta si no los hacés hoy. Devuelve { title, body } o
 * null si no falta nada.
 */
export function armarAviso(habits, logs, tasks, hoy) {
  const ws = weekStartOf(hoy);
  const quedanDias = 7 - weekday(hoy); // contando hoy
  const faltan = habits.filter((h) => {
    if (getVal(logs, hoy, h.id) !== undefined) return false; // ya lo marcaste (hecho o no hecho)
    const f = freqOf(h);
    if (f.type === 'weekly') return f.times - weekCount(logs, h, ws, hoy) >= quedanDias;
    return isScheduled(h, hoy);
  });
  const pendientes = (tasks[ws] || []).filter((t) => !t.done).length;
  if (!faltan.length && !pendientes) return null;

  let body;
  if (faltan.length) {
    const nombres = faltan.map((h) => h.name);
    body = faltan.length <= 3
      ? 'Te ' + (faltan.length === 1 ? 'falta' : 'faltan') + ': ' + lista(nombres) + '.'
      : 'Te faltan ' + faltan.length + ': ' + nombres.slice(0, 2).join(', ') + ' y ' + (faltan.length - 2) + ' más.';
    if (pendientes) body += ' Y ' + pendientes + (pendientes === 1 ? ' pendiente' : ' pendientes') + ' de la semana.';
  } else {
    body = 'Te ' + (pendientes === 1 ? 'queda 1 pendiente' : 'quedan ' + pendientes + ' pendientes') + ' de la semana.';
  }
  return { title: 'Mis hábitos', body };
}

async function iniciar() {
  const { initializeApp, cert } = await import('firebase-admin/app');
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    initializeApp({ projectId: process.env.PROYECTO || 'demo-habitos' });
  } else {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
      console.log('Falta el secreto FIREBASE_SERVICE_ACCOUNT: no hago nada.');
      return false;
    }
    initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  }
  return true;
}

export async function correr() {
  if (!(await iniciar())) return;
  const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
  const db = getFirestore();
  const dry = process.env.DRY_RUN === '1';
  const ahora = process.env.AHORA ? new Date(process.env.AHORA) : new Date();
  const hoy = todayStr(ahora);

  const usuarios = await db.collection('users').listDocuments();
  for (const u of usuarios) {
    const remRef = u.collection('config').doc('reminder');
    const remSnap = await remRef.get();
    const rem = remSnap.exists ? remSnap.data() : null;
    if (!tocaAvisar(rem, hoy, ahora)) continue;

    const habSnap = await u.collection('config').doc('habits').get();
    const habits = ((habSnap.exists && habSnap.data().items) || []).filter(validHabit);
    // El mes de hoy y, si la semana empezó el mes anterior, también ese.
    const logs = {};
    for (const mk of new Set([hoy.slice(0, 7), weekStartOf(hoy).slice(0, 7)])) {
      const s = await u.collection('logs').doc(mk).get();
      if (s.exists) logs[mk] = s.data().days || {};
    }
    const tSnap = await u.collection('tasks').doc(weekStartOf(hoy)).get();
    const tasks = cleanTasks(tSnap.exists ? { [weekStartOf(hoy)]: tSnap.data().items } : {});

    const aviso = armarAviso(habits, logs, tasks, hoy);
    if (!aviso) {
      console.log(u.id.slice(0, 6) + '…: no falta nada hoy, no aviso.');
      await remRef.set({ lastSent: hoy }, { merge: true });
      continue;
    }
    if (dry) {
      console.log(u.id.slice(0, 6) + '…: AVISO ' + JSON.stringify(aviso));
      await remRef.set({ lastSent: hoy }, { merge: true });
      continue;
    }

    const { getMessaging } = await import('firebase-admin/messaging');
    const res = await getMessaging().sendEachForMulticast({
      tokens: rem.tokens,
      data: aviso,
      webpush: { headers: { Urgency: 'high', TTL: String(4 * 3600) } }
    });
    // Los aparatos que ya no existen (desinstalaste la app, borraste datos) se sacan.
    const muertos = [];
    res.responses.forEach((r, i) => {
      const code = r.error && r.error.code;
      if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') muertos.push(rem.tokens[i]);
    });
    const cambios = { lastSent: hoy };
    if (muertos.length) cambios.tokens = FieldValue.arrayRemove(...muertos);
    await remRef.set(cambios, { merge: true });
    console.log(u.id.slice(0, 6) + '…: enviado a ' + res.successCount + ' de ' + rem.tokens.length + ' aparatos' + (muertos.length ? ' (' + muertos.length + ' borrados)' : '') + '.');
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  correr().catch((e) => { console.error(e); process.exit(1); });
}
