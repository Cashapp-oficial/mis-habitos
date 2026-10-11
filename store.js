/*
  Guardado. La pantalla (app.js) no sabe dónde viven los datos: le habla a un
  "store" con siempre las mismas funciones.

  - Nube (Firebase): si firebase-config.js tiene la configuración. Firestore
    guarda una copia en el aparato, así que la app anda sin conexión y sube
    los cambios sola cuando vuelve.
  - Local (este navegador): si todavía no hay configuración. Sirve para
    probar y es de donde se ofrece importar al pasar a la nube.

  Dónde quedan en la nube:
    users/{uid}/config/habits   { items: [{ id, name, cat }] }
    users/{uid}/logs/{AAAA-MM}  { days: { "AAAA-MM-DD": { idHabito: 1 | 0 } } }
    users/{uid}/tasks/{lunes}   { items: [{ id, text, done }] }   pendientes de esa semana
*/

import { firebaseConfig } from './firebase-config.js';
import { validHabit, cleanTasks } from './datos.js';

var SDK = 'https://www.gstatic.com/firebasejs/12.19.0/';

/* ---------- localStorage, con la misma forma que la versión anterior ---------- */

function lsGet(k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }

/** Lo que haya guardado en este navegador (de la versión anterior o del modo local). */
export function readLocalData() {
  var h = lsGet('mh:habits');
  var habits = h && Array.isArray(h.items) ? h.items.filter(validHabit) : [];
  var logs = {};
  try {
    Object.keys(localStorage).forEach(function (k) {
      if (k.indexOf('mh:logs:') === 0) {
        var v = lsGet(k);
        if (v && v.days) logs[k.slice(8)] = v.days;
      }
    });
  } catch (e) { /* sin almacenamiento local */ }
  var tasks = cleanTasks(lsGet('mh:tasks') || {});
  return { habits: habits, logs: logs, tasks: tasks };
}

function localStore() {
  var data = readLocalData();
  var listener = null;
  function emit() { if (listener) listener({ habits: data.habits, logs: data.logs, tasks: data.tasks }, { pending: false }); }
  function saveMonth(mk) {
    if (!lsSet('mh:logs:' + mk, { days: data.logs[mk] || {} })) throw new Error('local');
  }
  return {
    mode: 'local',
    onAuth: function (cb) { cb({ uid: 'local', email: null }); },
    signIn: function () { return Promise.resolve(); },
    signOut: function () { return Promise.resolve(); },
    start: function (onData) { listener = onData; emit(); },
    stop: function () { listener = null; },
    saveHabits: function (habits) {
      data.habits = habits;
      if (!lsSet('mh:habits', { items: habits })) return Promise.reject(new Error('local'));
      return Promise.resolve();
    },
    setMark: function (date, id, v) {
      var mk = date.slice(0, 7);
      var m = data.logs[mk] || (data.logs[mk] = {});
      var day = m[date] || (m[date] = {});
      if (v === undefined) { delete day[id]; if (!Object.keys(day).length) delete m[date]; }
      else day[id] = v;
      try { saveMonth(mk); return Promise.resolve(); } catch (e) { return Promise.reject(e); }
    },
    saveTasks: function (week, items) {
      if (items.length) data.tasks[week] = items; else delete data.tasks[week];
      return lsSet('mh:tasks', data.tasks) ? Promise.resolve() : Promise.reject(new Error('local'));
    },
    applyMerge: function (habits, patch, tasksPatch) {
      Object.keys(tasksPatch || {}).forEach(function (w) { data.tasks[w] = tasksPatch[w]; });
      lsSet('mh:tasks', data.tasks);
      data.habits = habits;
      lsSet('mh:habits', { items: habits });
      Object.keys(patch).forEach(function (mk) {
        var m = data.logs[mk] || (data.logs[mk] = {});
        Object.keys(patch[mk]).forEach(function (date) {
          m[date] = Object.assign(m[date] || {}, patch[mk][date]);
        });
        lsSet('mh:logs:' + mk, { days: m });
      });
      emit();
      return Promise.resolve();
    }
  };
}

/* ---------- Firebase ---------- */

async function cloudStore() {
  var mods = await Promise.all([
    import(SDK + 'firebase-app.js'),
    import(SDK + 'firebase-auth.js'),
    import(SDK + 'firebase-firestore.js')
  ]);
  var fb = mods[0], au = mods[1], fs = mods[2];

  var app = fb.initializeApp(firebaseConfig);
  var auth = au.getAuth(app);
  auth.languageCode = 'es';
  var db = fs.initializeFirestore(app, {
    localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() })
  });

  // Solo para las pruebas automáticas en la compu: ?emulador=1 en localhost
  // usa los emuladores de Firebase en vez del proyecto real.
  var params = new URLSearchParams(location.search);
  if (params.get('emulador') === '1' && (location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    au.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    fs.connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }

  var user = null, unsubs = [];
  function habitsRef() { return fs.doc(db, 'users', user.uid, 'config', 'habits'); }
  function monthRef(mk) { return fs.doc(db, 'users', user.uid, 'logs', mk); }
  function weekRef(w) { return fs.doc(db, 'users', user.uid, 'tasks', w); }

  return {
    mode: 'cloud',
    onAuth: function (cb) {
      au.onAuthStateChanged(auth, function (u) {
        user = u;
        cb(u ? { uid: u.uid, email: u.email, name: u.displayName } : null);
      });
    },
    signIn: function () {
      var provider = new au.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      return au.signInWithPopup(auth, provider);
    },
    signOut: function () { return au.signOut(auth); },

    start: function (onData, onError) {
      var habits = null, logs = null, tasks = null, pendH = false, pendL = false, pendT = false;
      function emit() {
        if (habits && logs && tasks) onData({ habits: habits, logs: logs, tasks: tasks }, { pending: pendH || pendL || pendT });
      }
      unsubs.push(fs.onSnapshot(habitsRef(), { includeMetadataChanges: true }, function (snap) {
        var d = snap.exists() ? snap.data() : null;
        habits = d && Array.isArray(d.items) ? d.items.filter(validHabit) : [];
        pendH = snap.metadata.hasPendingWrites;
        emit();
      }, onError));
      unsubs.push(fs.onSnapshot(fs.collection(db, 'users', user.uid, 'logs'), { includeMetadataChanges: true }, function (snap) {
        var next = {};
        snap.docs.forEach(function (doc) {
          var days = doc.data().days;
          next[doc.id] = days && typeof days === 'object' ? days : {};
        });
        logs = next;
        pendL = snap.metadata.hasPendingWrites;
        emit();
      }, onError));
      unsubs.push(fs.onSnapshot(fs.collection(db, 'users', user.uid, 'tasks'), { includeMetadataChanges: true }, function (snap) {
        var next = {};
        snap.docs.forEach(function (doc) { next[doc.id] = doc.data().items; });
        tasks = cleanTasks(next);
        pendT = snap.metadata.hasPendingWrites;
        emit();
      }, onError));
    },
    stop: function () { unsubs.forEach(function (u) { u(); }); unsubs = []; },

    // Sin conexión, estas promesas quedan esperando hasta que vuelve; la
    // pantalla ya se actualizó con la copia local, así que no se esperan.
    // Solo avisan si el servidor rechaza el cambio.
    saveHabits: function (habits) {
      return fs.setDoc(habitsRef(), {
        items: habits.map(function (h) { return { id: h.id, name: h.name, cat: h.cat }; })
      });
    },
    // Se escribe solo esa marca (no el mes entero): si marcás en el celular y
    // en la compu sin conexión, al volver se juntan las dos.
    setMark: function (date, id, v) {
      var day = {};
      day[id] = v === undefined ? fs.deleteField() : v;
      var days = {};
      days[date] = day;
      return fs.setDoc(monthRef(date.slice(0, 7)), { days: days }, { merge: true });
    },
    // La lista entera de la semana: es corta y así no hay que pensar en mezclas.
    saveTasks: function (week, items) {
      return items.length ? fs.setDoc(weekRef(week), { items: items }) : fs.deleteDoc(weekRef(week));
    },
    applyMerge: function (habits, patch, tasksPatch) {
      var batch = fs.writeBatch(db);
      Object.keys(tasksPatch || {}).forEach(function (w) { batch.set(weekRef(w), { items: tasksPatch[w] }); });
      batch.set(habitsRef(), { items: habits.map(function (h) { return { id: h.id, name: h.name, cat: h.cat }; }) });
      Object.keys(patch).forEach(function (mk) {
        batch.set(monthRef(mk), { days: patch[mk] }, { merge: true });
      });
      return batch.commit();
    }
  };
}

export async function createStore() {
  if (!firebaseConfig) return localStore();
  return cloudStore();
}
