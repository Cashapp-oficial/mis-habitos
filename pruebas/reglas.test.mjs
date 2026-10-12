// Prueba las reglas de firestore.rules contra el emulador: cada persona solo
// ve y toca lo suyo. Se corre con: npm run probar-reglas
import { readFileSync } from 'node:fs';
import { test, before, after, beforeEach } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';

let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-habitos',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 }
  });
});
after(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/alicia/config/habits'), { items: [{ id: 'h1', name: 'Correr', cat: 'ejercicio' }] });
    await setDoc(doc(db, 'users/alicia/logs/2026-10'), { days: { '2026-10-11': { h1: 1 } } });
  });
});

const alicia = () => env.authenticatedContext('alicia').firestore();
const bruno = () => env.authenticatedContext('bruno').firestore();
const nadie = () => env.unauthenticatedContext().firestore();

test('la dueña lee y escribe lo suyo', async () => {
  const db = alicia();
  await assertSucceeds(getDoc(doc(db, 'users/alicia/config/habits')));
  await assertSucceeds(getDocs(collection(db, 'users/alicia/logs')));
  await assertSucceeds(setDoc(doc(db, 'users/alicia/config/habits'), { items: [] }));
  await assertSucceeds(setDoc(doc(db, 'users/alicia/logs/2026-11'), { days: { '2026-11-01': { h1: 0 } } }, { merge: true }));
});

test('otra persona no puede leer ni escribir los datos de la dueña', async () => {
  const db = bruno();
  await assertFails(getDoc(doc(db, 'users/alicia/config/habits')));
  await assertFails(getDocs(collection(db, 'users/alicia/logs')));
  await assertFails(setDoc(doc(db, 'users/alicia/config/habits'), { items: [] }));
  await assertFails(setDoc(doc(db, 'users/alicia/logs/2026-10'), { days: {} }));
  await assertFails(deleteDoc(doc(db, 'users/alicia/logs/2026-10')));
});

test('sin iniciar sesión no se puede nada', async () => {
  const db = nadie();
  await assertFails(getDoc(doc(db, 'users/alicia/config/habits')));
  await assertFails(setDoc(doc(db, 'users/alicia/logs/2026-10'), { days: {} }));
});

test('no se puede leer la lista de usuarios ni escribir fuera de lo previsto', async () => {
  const db = alicia();
  await assertFails(getDocs(collection(db, 'users')));
  await assertFails(setDoc(doc(db, 'users/alicia/otra/cosa'), { x: 1 }));
  await assertFails(setDoc(doc(db, 'otra-coleccion/x'), { x: 1 }));
});

test('la forma de los datos se respeta', async () => {
  const db = alicia();
  await assertFails(setDoc(doc(db, 'users/alicia/logs/octubre'), { days: {} }));
  await assertFails(setDoc(doc(db, 'users/alicia/logs/2026-10'), { days: {}, extra: true }));
  await assertFails(setDoc(doc(db, 'users/alicia/config/habits'), { items: 'no es lista' }));
});

test('pendientes de la semana: solo la dueña, con la forma correcta', async () => {
  const a = alicia(), b = bruno();
  await assertSucceeds(setDoc(doc(a, 'users/alicia/tasks/2026-10-05'), { items: [{ id: 't1', text: 'Llamar al dentista', done: false }] }));
  await assertSucceeds(getDocs(collection(a, 'users/alicia/tasks')));
  await assertSucceeds(deleteDoc(doc(a, 'users/alicia/tasks/2026-10-05')));
  await assertFails(getDocs(collection(b, 'users/alicia/tasks')));
  await assertFails(setDoc(doc(b, 'users/alicia/tasks/2026-10-05'), { items: [] }));
  await assertFails(setDoc(doc(a, 'users/alicia/tasks/semana1'), { items: [] }));
  await assertFails(setDoc(doc(a, 'users/alicia/tasks/2026-10-05'), { items: [], extra: 1 }));
});

test('recordatorio: solo la dueña, con hora válida y pocos aparatos', async () => {
  const a = alicia(), b = bruno();
  const ref = (db) => doc(db, 'users/alicia/config/reminder');
  await assertSucceeds(setDoc(ref(a), { enabled: true, time: '21:00', tokens: ['tok1'] }));
  await assertSucceeds(getDoc(ref(a)));
  await assertFails(getDoc(ref(b)));
  await assertFails(setDoc(ref(b), { enabled: false }));
  await assertFails(setDoc(ref(a), { enabled: true, time: '25:00' }));
  await assertFails(setDoc(ref(a), { enabled: 'si' }));
  await assertFails(setDoc(ref(a), { enabled: true, otra: 1 }));
  await assertFails(setDoc(ref(a), { tokens: Array.from({ length: 11 }, (_, i) => 't' + i) }));
});
