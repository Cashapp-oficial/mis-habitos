"""Prueba la app con la nube, contra los emuladores de Firebase (npm run emuladores).
Uso: python pruebas/prueba-nube.py [url]   (por defecto http://127.0.0.1:5510/)

Cubre: migración desde el navegador, entrar con Google, marcas que se guardan
en la nube, marcar sin conexión y que se suba al volver, y que otra cuenta no
vea los datos."""
import json
import sys
import urllib.error
import urllib.request

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5510/"
URL = BASE + "?emulador=1"
PROYECTO = "demo-habitos"
CONFIG = ('export const firebaseConfig = { apiKey: "demo-key", authDomain: "127.0.0.1", '
          f'projectId: "{PROYECTO}", appId: "demo-app" }};')
errores = []


def ok(m):
    print("  OK  " + m)


def falla(m):
    print("  FALLA  " + m)
    sys.exit(1)


def limpiar_emuladores():
    for url in (f"http://127.0.0.1:8080/emulator/v1/projects/{PROYECTO}/databases/(default)/documents",
                f"http://127.0.0.1:9099/emulator/v1/projects/{PROYECTO}/accounts"):
        urllib.request.urlopen(urllib.request.Request(url, method="DELETE"))


def leer_mes_como_admin(uid, mes):
    req = urllib.request.Request(
        f"http://127.0.0.1:8080/v1/projects/{PROYECTO}/databases/(default)/documents/users/{uid}/logs/{mes}",
        headers={"Authorization": "Bearer owner"})
    return json.loads(urllib.request.urlopen(req).read())


def esperar_en_nube(uid, mes, texto, segundos=15):
    """Espera hasta que el mes en la nube contenga ese texto (las escrituras tardan un poco)."""
    import time
    fin = time.time() + segundos
    while time.time() < fin:
        try:
            if texto in json.dumps(leer_mes_como_admin(uid, mes)):
                return True
        except urllib.error.HTTPError:
            pass
        time.sleep(0.5)
    return False


def entrar(page, email):
    with page.expect_popup() as pop:
        page.click("#signIn")
    p = pop.value
    p.wait_for_load_state()
    p.click("#add-account-button")
    p.fill("#email-input", email)
    p.fill("#display-name-input", email.split("@")[0])
    p.click("#sign-in")
    p.wait_for_event("close")


limpiar_emuladores()
with sync_playwright() as pw:
    nav = pw.chromium.launch()
    ctx = nav.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True,
                          timezone_id="America/Buenos_Aires")
    # Sin service worker en esta prueba: así la configuración falsa no queda guardada.
    ctx.add_init_script("delete Object.getPrototypeOf(navigator).serviceWorker")
    page = ctx.new_page()
    page.on("console", lambda m: errores.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errores.append(str(e)))

    # 1. Datos viejos en el navegador, como los dejaba la versión anterior.
    page.goto(BASE)
    page.evaluate("""() => {
      localStorage.setItem('mh:habits', JSON.stringify({ items: [
        { id: 'hviejo1', name: 'Correr', cat: 'ejercicio' },
        { id: 'hviejo2', name: 'Leer', cat: 'trabajo' } ] }));
      localStorage.setItem('mh:logs:2026-09', JSON.stringify({ days: {
        '2026-09-30': { hviejo1: 1, hviejo2: 0 }, '2026-09-29': { hviejo1: 1 } } }));
    }""")

    # 2. Ahora la app con la nube configurada.
    page.route("**/firebase-config.js", lambda r: r.fulfill(body=CONFIG, content_type="text/javascript"))
    page.goto(URL)
    page.wait_for_selector("#viewLogin:not([hidden])")
    if page.is_visible("#tabbar"):
        falla("la barra de pestañas se ve sin haber entrado")
    ok("sin sesión muestra la pantalla de entrada")

    entrar(page, "alicia@example.com")
    page.wait_for_selector("dialog[open]")
    texto = page.text_content("#dialogText")
    if "2 hábitos" not in texto or "2 días" not in texto:
        falla("la oferta de importar no cuenta bien: " + texto)
    ok("al entrar ofrece importar: " + texto[:70] + "…")
    page.click("#dialogOk")
    page.wait_for_selector("text=Correr")
    ok("importó los hábitos del navegador")

    # El uid lo sacamos de la base del emulador de Auth.
    cuentas = json.loads(urllib.request.urlopen(urllib.request.Request(
        f"http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/{PROYECTO}/accounts:query",
        data=b"{}", headers={"Authorization": "Bearer owner", "Content-Type": "application/json"})).read())
    uid = cuentas["userInfo"][0]["localId"]
    if not esperar_en_nube(uid, "2026-09", "2026-09-30"):
        falla("las marcas importadas no llegaron a la nube")
    ok("las marcas importadas están en la nube")

    # 3. Marcar y recargar.
    page.locator(".check").first.click()
    page.wait_for_selector("#syncText", state="attached")
    page.wait_for_timeout(1500)
    page.reload()
    page.wait_for_selector(".state-done")
    if page.text_content(".big").strip() != "1/2":
        falla("después de recargar el resumen no es 1/2: " + page.text_content(".big"))
    ok("marcar un hábito se guarda y se ve tras recargar")
    if page.locator("dialog[open]").count():
        falla("volvió a ofrecer importar después de haberlo hecho")
    ok("no vuelve a ofrecer la importación")

    # 4. Sin conexión: marcar y que se suba al volver.
    ctx.set_offline(True)
    page.locator(".x-btn").nth(1).click()
    if page.locator(".state-miss").count() != 1:
        falla("sin conexión no se pudo marcar")
    page.click('.tab[data-tab="habitos"]')
    if "Sin conexión" not in page.text_content("#syncText"):
        falla("no avisa que está sin conexión: " + page.text_content("#syncText"))
    ok("sin conexión se puede marcar y avisa: " + page.text_content("#syncText"))
    ctx.set_offline(False)
    page.evaluate("window.dispatchEvent(new Event('online'))")
    hoy = page.evaluate("new Intl.DateTimeFormat('en-CA',{timeZone:'America/Buenos_Aires'}).format(new Date())")
    if not esperar_en_nube(uid, hoy[:7], '"hviejo2": {"integerValue": "0"}'):
        falla("la marca hecha sin conexión no llegó a la nube")
    ok("la marca hecha sin conexión se subió sola al volver")
    page.wait_for_selector("#syncText:has-text('Todo guardado')")
    ok("después dice: " + page.text_content("#syncText"))

    # 5. Otra cuenta no ve nada de la primera.
    page.click("#signOut")
    page.click("#dialogOk")
    page.wait_for_selector("#viewLogin:not([hidden])")
    page.evaluate("localStorage.clear()")
    entrar(page, "bruno@example.com")
    page.wait_for_selector("#viewHoy:not([hidden]) >> text=Tu lista está vacía")
    for tab in ("hoy", "semana", "habitos"):
        page.click(f'.tab[data-tab="{tab}"]')
        page.wait_for_timeout(300)
        if page.locator("text=Correr").count():
            falla(f"la segunda cuenta ve los hábitos de la primera (pestaña {tab})")
    if page.locator("text=Correr").count():
        falla("la segunda cuenta ve los hábitos de la primera")
    ok("otra cuenta entra y ve su lista vacía, no la de la primera")

    reales = [e for e in errores if "ERR_INTERNET_DISCONNECTED" not in e and "Failed to fetch" not in e
              and "offline" not in e.lower() and "Could not reach Cloud Firestore" not in e]
    if reales:
        falla("errores en consola: " + " | ".join(reales))
    ok("sin errores en consola")
    nav.close()
print("TODO OK")
