"""Prueba la app en modo local (sin Firebase) con Playwright.
Uso: python pruebas/prueba-local.py [url]   (por defecto http://127.0.0.1:5510/)"""
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5510/"
SALIDA = Path(__file__).parent / "capturas"
SALIDA.mkdir(exist_ok=True)
errores = []
ok = lambda m: print("  OK  " + m)


def falla(m):
    print("  FALLA  " + m)
    sys.exit(1)


with sync_playwright() as p:
    nav = p.chromium.launch()
    # Celular, y con la zona horaria de Tokio a propósito: "hoy" tiene que ser el de Buenos Aires.
    ctx = nav.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                          is_mobile=True, has_touch=True, timezone_id="Asia/Tokyo", accept_downloads=True)
    # Modo local: sin la configuración real de Firebase.
    ctx.route("**/firebase-config.js", lambda r: r.fulfill(body="export const firebaseConfig = null; export const vapidKey = null;", content_type="text/javascript"))
    page = ctx.new_page()
    page.on("console", lambda m: errores.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errores.append(str(e)))

    page.goto(URL)
    page.wait_for_selector("text=Tu lista está vacía")
    ok("carga con la lista vacía")

    hoy_ba = page.evaluate("new Intl.DateTimeFormat('en-CA',{timeZone:'America/Buenos_Aires'}).format(new Date())")
    titulo = page.text_content("#dayTitle")
    dia = str(int(hoy_ba[8:]))
    if not titulo.startswith(dia + " de"):
        falla(f"el título {titulo!r} no es el día de Buenos Aires {hoy_ba}")
    ok(f"hoy es el de Buenos Aires ({hoy_ba}) aunque el aparato esté en Tokio")

    page.click("text=Cargar lista base")
    page.wait_for_selector(".habit")
    page.screenshot(path=str(SALIDA / "hoy-vacio-de-marcas.png"), full_page=True)
    page.locator('.check').nth(0).click()
    page.locator('.check').nth(3).click()
    page.locator(".x-btn").nth(1).click()
    if page.text_content(".big").strip() != "2/10":
        falla("el resumen no dice 2/10: " + page.text_content(".big"))
    ok("marcar dos hechos y uno no hecho da 2/10")
    ancho = page.evaluate("innerWidth")
    if ancho != 390:
        falla(f"la página desborda hacia el costado: mide {ancho}px en un celular de 390")
    ok("no desborda hacia el costado")
    page.screenshot(path=str(SALIDA / "hoy.png"), full_page=True)

    page.reload()
    page.wait_for_selector(".habit")
    try:  # al abrir, el número rueda desde 0 hasta su valor
        page.wait_for_function("document.querySelector('.big').textContent.trim() === '2/10'", timeout=3000)
    except Exception:
        pass
    if page.text_content(".big").strip() != "2/10" or page.locator(".state-miss").count() != 1:
        falla("las marcas no sobrevivieron a recargar")
    ok("las marcas siguen después de recargar")

    # Día anterior y vuelta.
    page.click("#prevDay")
    if not page.text_content("#dayName").startswith("Ayer"):
        falla("el día anterior no dice Ayer")
    page.locator('.check').nth(0).click()
    page.click("#goToday")
    ok("navegar a ayer, marcar y volver a hoy")

    page.click('.tab[data-tab="semana"]')
    page.wait_for_selector("table.week")
    page.click("#prevWeek")
    page.click("#nextWeek")
    page.screenshot(path=str(SALIDA / "semana.png"), full_page=True)
    ok("semana: " + page.text_content("#weekSummary"))

    # Pendientes de la semana: anotar, tildar y que se vean en Hoy.
    page.fill("#tasksSemana .tarea-nueva input", "Llamar al dentista")
    page.click("#tasksSemana .tarea-nueva button")
    page.fill("#tasksSemana .tarea-nueva input", "Entregar el informe")
    page.keyboard.press("Enter")
    page.wait_for_selector("#tasksSemana .tarea >> nth=1")
    page.locator("#tasksSemana .tarea-check").first.click()
    # El número rueda hasta el valor nuevo (pintar.js): se espera a que llegue.
    try:
        page.wait_for_function("document.querySelector('#tasksSemana .tareas-cab .count').textContent.trim() === '1/2'", timeout=3000)
    except Exception:
        pass
    if page.text_content("#tasksSemana .tareas-cab .count").strip() != "1/2":
        falla("los pendientes no cuentan 1/2")
    ok("anotar dos pendientes y tildar uno da 1/2")
    sobra = page.evaluate("""() => { const c = document.querySelector('#tasksSemana .tareas').getBoundingClientRect();
      return [...document.querySelectorAll('#tasksSemana .tareas *')].filter(e => e.getBoundingClientRect().right > c.right + 1).length }""")
    if sobra:
        falla(f"{sobra} elementos se salen de la tarjeta de pendientes")
    ok("nada se sale de la tarjeta de pendientes")
    page.screenshot(path=str(SALIDA / "semana-pendientes.png"), full_page=True)
    page.click("#nextWeek")
    if page.text_content("#weekEyebrow") != "La semana que viene":
        falla("no se puede ir a la semana que viene")
    if not page.is_disabled("#nextWeek"):
        falla("se puede ir más allá de la semana que viene")
    page.fill("#tasksSemana .tarea-nueva input", "Turno con el médico")
    page.keyboard.press("Enter")
    page.wait_for_selector("#tasksSemana >> text=Turno con el médico")
    ok("anotar un pendiente en la semana que viene")
    page.click("#prevWeek")
    page.click('.tab[data-tab="hoy"]')
    page.wait_for_selector("#tasksHoy .tarea")
    if page.locator("#tasksHoy .tarea").count() != 2:
        falla("Hoy no muestra los 2 pendientes de esta semana")
    page.locator("#tasksHoy .tarea-check").nth(1).click()
    page.reload()
    page.wait_for_selector("#tasksHoy .tarea")
    if page.locator("#tasksHoy .tarea.hecha").count() != 2:
        falla("tildar un pendiente desde Hoy no se guardó")
    ok("los pendientes se ven y se tildan desde Hoy, y siguen al recargar")
    page.screenshot(path=str(SALIDA / "hoy-pendientes.png"), full_page=True)

    # Mes: el mes entero, del 1 al último día.
    page.click('.tab[data-tab="mes"]')
    page.wait_for_selector(".cal-dia")
    import calendar
    y, m = int(hoy_ba[:4]), int(hoy_ba[5:7])
    dias = calendar.monthrange(y, m)[1]
    if page.locator(".cal-dia").count() != dias:
        falla(f"el calendario no tiene los {dias} días del mes")
    if page.locator(".tira").first.locator("i").count() != dias:
        falla("la tira de cada hábito no tiene todos los días del mes")
    ok(f"Mes: calendario y tiras con los {dias} días")
    page.screenshot(path=str(SALIDA / "mes.png"), full_page=True)
    page.click("#prevMonth")
    if page.is_hidden("#goThisMonth"):
        falla("en el mes anterior no aparece Volver a este mes")
    page.click("#goThisMonth")
    page.locator(".cal-dia.hoy").click()
    page.wait_for_selector("#viewHoy:not([hidden])")
    ok("ir al mes anterior, volver y tocar un día lleva a Hoy")

    page.click('.tab[data-tab="habitos"]')
    page.fill("#newName", "Leer 20 minutos")
    page.select_option("#newCat", "trabajo")
    page.click("text=Añadir")
    page.wait_for_selector('input[value="Leer 20 minutos"]')
    ok("añadir un hábito")
    page.screenshot(path=str(SALIDA / "habitos.png"), full_page=True)

    # Frecuencia: Entrenar 3 veces por semana y Caminar de lunes a viernes.
    page.select_option('select[data-role="freq"] >> nth=0', "w3")
    page.select_option('select[data-role="freq"] >> nth=1', "days")
    page.wait_for_selector(".dias")
    if page.locator(".dia.on").count() != 5:
        falla("días fijos no arranca de lunes a viernes")
    page.locator(".dia").nth(5).click()  # suma el sábado
    if page.locator(".dia.on").count() != 6:
        falla("no se pudo sumar un día")
    page.locator(".dia").nth(5).click()
    ok("elegir frecuencia: 3 por semana y días fijos")
    page.screenshot(path=str(SALIDA / "habitos-frecuencia.png"), full_page=True)
    page.click('.tab[data-tab="hoy"]')
    page.wait_for_selector(".habit")
    if "de 3 esta semana" not in page.text_content("#hoyList"):
        falla("Hoy no muestra el avance semanal del hábito de 3 por semana")
    import datetime
    dia_semana = datetime.date.fromisoformat(hoy_ba).weekday()  # 0 = lunes
    apagados = page.locator(".habit.off-day").count()
    if (dia_semana >= 5) != (apagados == 1):
        falla(f"el hábito de lunes a viernes no se apaga bien hoy (día {dia_semana}, apagados {apagados})")
    ok("Hoy muestra 'de 3 esta semana' y apaga el de días fijos cuando no toca")
    # "Tomar 2 litros de agua" está hecho hoy: marcándolo ayer, la racha es 2 y es su récord.
    page.click("#prevDay")
    page.locator('.habit:has-text("Tomar 2 litros") .check').click()
    page.click("#goToday")
    fila = page.locator('.habit:has-text("Tomar 2 litros")')
    try:  # el número de la racha rueda de 1 a 2
        page.wait_for_function("[...document.querySelectorAll('.habit')].some(f => f.textContent.includes('Tomar 2 litros') && f.textContent.includes('racha 2 días'))", timeout=3000)
    except Exception:
        pass
    if "racha 2 días" not in fila.text_content() or fila.locator(".record.top").count() != 1:
        falla("con dos días seguidos no muestra 'racha 2 días' y 'tu récord': " + fila.text_content())
    ok("dos días seguidos: 'racha 2 días' y 'tu récord'")
    page.screenshot(path=str(SALIDA / "hoy-frecuencia.png"), full_page=True)
    page.click('.tab[data-tab="habitos"]')

    with page.expect_download() as d:
        page.click("#exportBtn")
    arch = SALIDA / "respaldo.json"
    d.value.save_as(arch)
    data = json.loads(arch.read_text(encoding="utf-8"))
    if len(data["habits"]) != 11 or not data["logs"] or sum(len(v) for v in data["tasks"].values()) != 3:
        falla("el respaldo no trae los 11 hábitos y las marcas")
    ok(f"exportar respaldo: {len(data['habits'])} hábitos, meses {list(data['logs'])}")

    # Importar: un respaldo con un hábito nuevo y una marca de hace un mes.
    data["habits"].append({"id": "himport", "name": "Hábito importado", "cat": "cuidado"})
    data["logs"].setdefault("2026-09", {})["2026-09-10"] = {"himport": 1}
    arch2 = SALIDA / "respaldo-modificado.json"
    arch2.write_text(json.dumps(data), encoding="utf-8")
    page.set_input_files("#importFile", str(arch2))
    page.wait_for_selector("dialog[open]")
    page.screenshot(path=str(SALIDA / "dialogo-importar.png"))
    page.click("#dialogOk")
    page.wait_for_selector('input[value="Hábito importado"]')
    ok("importar respaldo suma el hábito nuevo")

    # Sin conexión: la app tiene que abrir igual desde el service worker.
    page.evaluate("navigator.serviceWorker.ready")
    page.reload()
    page.wait_for_timeout(500)
    ctx.set_offline(True)
    page.reload()
    page.wait_for_selector(".tab")
    page.click('.tab[data-tab="hoy"]')
    page.wait_for_selector(".habit")
    ok("abre sin conexión")
    ctx.set_offline(False)

    # Datos viejos: un JSON roto no rompe nada.
    bad = SALIDA / "roto.json"
    bad.write_text("{no es json", encoding="utf-8")
    page.click('.tab[data-tab="habitos"]')
    page.set_input_files("#importFile", str(bad))
    page.wait_for_selector(".status.err")
    ok("un archivo roto muestra un error claro: " + page.text_content("#status"))

    reales = [e for e in errores if "net::ERR_INTERNET_DISCONNECTED" not in e and "Failed to fetch" not in e]
    if reales:
        falla("errores en consola: " + " | ".join(reales))
    ok("sin errores en consola")
    nav.close()
print("TODO OK")
