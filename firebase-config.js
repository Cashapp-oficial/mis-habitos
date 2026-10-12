/*
  Configuración de Firebase. Mientras valga null, la app guarda todo solo en
  este navegador (localStorage).

  Cuando crees el proyecto en Firebase, reemplazá null por el bloque que te
  muestra la consola, por ejemplo:

  export const firebaseConfig = {
    apiKey: "...",
    authDomain: "...firebaseapp.com",
    projectId: "...",
    storageBucket: "...",
    messagingSenderId: "...",
    appId: "..."
  };

  Estos datos no son secretos: identifican el proyecto. Lo que protege tus
  datos son las reglas de firestore.rules.

  vapidKey: la clave pública de los avisos (Configuración del proyecto ›
  Cloud Messaging › Certificados push web). Tampoco es secreta. Mientras sea
  null, el recordatorio diario aparece como "falta configurar".
*/
export const firebaseConfig = {
  apiKey: "AIzaSyAOdQl6a6XF8G_Hox1GRJQBwsBy3r6j1ZI",
  authDomain: "habit-tracker-oink.firebaseapp.com",
  projectId: "habit-tracker-oink",
  storageBucket: "habit-tracker-oink.firebasestorage.app",
  messagingSenderId: "1053994413350",
  appId: "1:1053994413350:web:49c0f4e17fe3f3aafca5e7"
};

export const vapidKey = null;
