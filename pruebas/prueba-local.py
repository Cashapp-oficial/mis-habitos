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
    page.screenshot(path=str(SALIDA / "semana.png"), full_page=True)
    ok("semana: " + page.text_content("#weekSummary"))

    page.click('.tab[data-tab="habitos"]')
    page.fill("#newName", "Leer 20 minutos")
    page.select_option("#newCat", "trabajo")
    page.click("text=Añadir")
    page.wait_for_selector('input[value="Leer 20 minutos"]')
    ok("añadir un hábito")
    page.screenshot(path=str(SALIDA / "habitos.png"), full_page=True)

    with page.expect_download() as d:
        page.click("#exportBtn")
    arch = SALIDA / "respaldo.json"
    d.value.save_as(arch)
    data = json.loads(arch.read_text(encoding="utf-8"))
    if len(data["habits"]) != 11 or not data["logs"]:
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
