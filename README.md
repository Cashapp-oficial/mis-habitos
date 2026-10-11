# Mis hábitos

App web para marcar hábitos de ejercicio, cuidado personal y trabajo, día por
día. Se instala en el celular y en la compu, funciona sin conexión y guarda el
historial en tu cuenta (Firebase). Estética de Porkie.

Es HTML, CSS y JavaScript sin paso de build: lo que está en esta carpeta es
exactamente lo que se publica.

## Archivos

| Archivo | Qué hace |
|---|---|
| `index.html` | La estructura de las pantallas |
| `styles.css` | La estética |
| `app.js` | Las pantallas y los toques |
| `store.js` | Dónde se guardan los datos: Firebase o, sin configurar, este navegador |
| `datos.js` | Cuentas puras: rachas, combinar respaldos, constancia mensual |
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
npm install                           # una sola vez
npm run probar-reglas                 # prueba las reglas de seguridad
npm run emuladores                    # en otra terminal, y después:
python pruebas/prueba-nube.py         # prueba con la nube simulada
```

## Para más adelante

- **Gráfico de constancia mensual:** `monthStats()` en `datos.js` ya devuelve
  el porcentaje de cada día del mes.
- **Recordatorios diarios:** el lugar para los avisos está marcado al final de
  `sw.js` (Firebase Cloud Messaging).
