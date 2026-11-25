"""Genera el PDF del PAC (o del programa por subcontrato) desde los datos del script.

Uso:
  python3 herramientas/generar_pdf.py datos.json salida.pdf                 # PAC de la semana
  python3 herramientas/generar_pdf.py datos.json salida.pdf --sub '*'       # PAC, una hoja por subcontrato
  python3 herramientas/generar_pdf.py datos.json salida.pdf --pagina subcontratos.html --semana 0

datos.json = respuesta del script (fetch a SCRIPT_URL) o calcularPlan() de script/Codigo.gs.
"""
import argparse, asyncio, functools, http.server, pathlib, shutil, tempfile, threading

RAIZ = pathlib.Path(__file__).resolve().parent.parent / 'web'


async def imprimir(url, salida, sub, semana):
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1400, 'height': 900})
        errores = []
        pg.on('pageerror', lambda e: errores.append(str(e)))
        await pg.goto(url)
        await pg.wait_for_timeout(1500)
        if sub is not None and await pg.query_selector('#filtroSub'):
            await pg.select_option('#filtroSub', sub)
        if semana is not None and await pg.query_selector('#filtroSem'):
            await pg.select_option('#filtroSem', semana)
        await pg.wait_for_timeout(400)
        await pg.pdf(path=salida, prefer_css_page_size=True, print_background=True)
        await b.close()
        if errores:
            raise SystemExit('Errores en la página: ' + '; '.join(errores))


def main():
    a = argparse.ArgumentParser()
    a.add_argument('datos'); a.add_argument('salida')
    a.add_argument('--pagina', default='plan.html')
    a.add_argument('--sub'); a.add_argument('--semana')
    args = a.parse_args()
    with tempfile.TemporaryDirectory() as tmp:
        shutil.copytree(RAIZ, tmp, dirs_exist_ok=True)
        shutil.copy(args.datos, pathlib.Path(tmp) / 'datos-ejemplo.json')
        js = pathlib.Path(tmp) / 'datos.js'
        js.write_text(js.read_text(encoding='utf-8').replace("const SCRIPT_URL = '", "const SCRIPT_URL = ''; const _URL_ORIGINAL = '", 1), encoding='utf-8')
        h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=tmp)
        srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), h)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        try:
            asyncio.run(imprimir(f'http://127.0.0.1:{srv.server_port}/{args.pagina}', args.salida, args.sub, args.semana))
        finally:
            srv.shutdown()
    print('PDF:', args.salida)


if __name__ == '__main__':
    main()
