# avance-cdp — Newen Antu · Tablero de Obra

Visor web de avance y planificación (Last Planner) de CNT Newen Antu, Constructora Don Pedro.
Publicado en https://newenantu.netlify.app (Netlify publica la carpeta `web/` en cada push a `main`).

## Estructura
- `web/` sitio estático (sin build): index, plan (PAC semanal, filtros supervisor/subcontrato, tramos OG/TERM/URB),
  subcontratos (programa OG por subcontrato, filtro de semana), obra_gruesa, cierres, terminaciones; `datos.js` (SCRIPT_URL), `estilo.css`.
- `script/Codigo.gs` Apps Script de la planilla "Pizarra Programación Intermedia - Newen Antu"
  (ID 1H2MPUVoWukJV_WL64qLxy5gft0oH5EsMMHqDOgI4tV8). Lee PIZARRA, PROJECT OG, CONFIG APP y la curva de la planilla de avances.
  `calcularPlan()` es pura y se prueba con node (`module.exports`). Si cambia, el usuario debe pegarlo y publicar "Nueva versión".
- `herramientas/generar_pdf.py` PDF del PAC o del programa por subcontrato desde un JSON de datos (Playwright).

## Reglas
- Editar en el lugar con cambios mínimos; no reescribir módulos completos (obra_gruesa/cierres/terminaciones tienen planos CAD grandes).
- Tema: grafito + ámbar (no usar azul marino/rojo corporativo en pantalla; el PAC impreso sí lleva formato Don Pedro).
- Plan de ataque T5 → T1 → T2 → T4 → T3. Supervisor Ignacio Fuentes. Semana viernes a jueves, corte jueves.
- Probar en local (python3 -m http.server dentro de web/) antes de hacer push. Commits en español.
