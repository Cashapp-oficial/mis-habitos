# Mis hábitos

App web para marcar hábitos de ejercicio, cuidado personal y trabajo, día por
día, ver el mes entero y anotar pendientes de cada semana. Se instala en el celular y en la compu, funciona sin conexión y guarda el
historial en tu cuenta (Firebase). Estética de Porkie.

Es HTML, CSS y JavaScript sin paso de build: lo que está en esta carpeta es
exactamente lo que se publica.

## Archivos

| Archivo | Qué hace |
|---|---|
| `index.html` | La estructura de las pantallas |
| `styles.css` | La estética |
| `app.js` | Las pantallas y los toques |
| `movimiento.js` | Las animaciones: deslizar, deshacer, el campo que dice que no, transformar, encadenar. Con `?lento` en la dirección van 4 veces más lento |
| `store.js` | Dónde se guardan los datos: Firebase o, sin configurar, este navegador |
| `datos.js` | Cuentas puras: rachas, pendientes, combinar respaldos, constancia mensual |
| `fechas.js` | Fechas, siempre con el calendario de Buenos Aires |
| `firebase-config.js` | La configuración de tu proyecto de Firebase |
| `firestore.rules` | Las reglas de seguridad: cada persona solo ve lo suyo |
| `sw.js`, `manifest.webmanifest`, `icons/` | Para instalarla y que abra sin conexión |
| `pruebas/` y `package.json` | Solo para probar en la compu; la app no los usa |

## Publicar un cambio

```
git add -A
git commit -m "Qué cambié"
git push
```

GitHub Pages lo publica solo en uno o dos minutos. Si cambiás la lista de
archivos que necesita la app sin conexión, subí `VERSION` en `sw.js`.

## Probar en la compu

```
python -m http.server 5510            # la app en http://127.0.0.1:5510
python pruebas/prueba-local.py        # prueba sin Firebase
node --test pruebas/datos.test.mjs pruebas/recordatorio.test.mjs   # cuentas y aviso
npm install                           # una sola vez
npm run probar-reglas                 # prueba las reglas de seguridad
npm run emuladores                    # en otra terminal, y después:
python pruebas/prueba-nube.py         # prueba con la nube simulada
```

## Pestañas

- **Hoy:** marcar los hábitos del día y tildar los pendientes de la semana.
- **Semana:** la grilla de lunes a domingo y los pendientes de la semana (se puede ir a la que viene para anotar).
- **Mes:** el mes entero, del 1 al último día: calendario por porcentaje y una tira por hábito.
- **Hábitos:** editar la lista (nombre, categoría y frecuencia), recordatorio, respaldo y cuenta.

## Recordatorio diario

Lo manda `recordatorio/enviar.mjs`, que corre en GitHub Actions cada 15
minutos (`.github/workflows/recordatorio.yml`). Necesita el secreto
`FIREBASE_SERVICE_ACCOUNT` del repositorio (la clave JSON de la cuenta de
servicio de Firebase) y la `vapidKey` en `firebase-config.js`. GitHub pausa
las tareas programadas de un repositorio sin cambios durante 60 días: si pasa,
avisa por mail y se reactiva con un clic en la pestaña Actions.

Si cambiás `firestore.rules`, hay que pegarlas de nuevo en Firebase → Firestore → Reglas → Publicar.

