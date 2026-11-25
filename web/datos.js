/* Newen Antu · Tablero de Obra — conexión con la planilla de la pizarra
 * Pegar aquí la URL de la aplicación web del script (termina en /exec).
 */
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbw4QW2JEo6QgR3uVBDgTsL1vVa4X56geg9U7LDfcuuGRg7pburLq0-eQEcLRnemyynsqQ/exec';

const NA = (() => {
  const CACHE = 'NA_V7_DATOS';

  async function cargar() {
    const fuentes = SCRIPT_URL ? [SCRIPT_URL] : [];
    fuentes.push('datos-ejemplo.json');
    let ultimoError = null;
    for (const url of fuentes) {
      try {
        const r = await fetch(url, { cache: 'no-store' });
        const d = await r.json();
        if (!d.ok) throw new Error(d.error || 'Respuesta sin datos');
        const origen = url === SCRIPT_URL ? 'En línea · pizarra' : 'Datos de ejemplo';
        try { localStorage.setItem(CACHE, JSON.stringify({ d, origen })); } catch (e) { /* sin caché */ }
        return { datos: d, origen };
      } catch (e) { ultimoError = e; }
    }
    try {
      const c = JSON.parse(localStorage.getItem(CACHE) || 'null');
      if (c) return { datos: c.d, origen: 'Copia guardada (sin conexión)' };
    } catch (e) { /* nada */ }
    throw ultimoError || new Error('No hay datos');
  }

  // Unidades de PROJECT OG: "T5-P1-MURO-C1" -> { torre:'T5', nivel:'N1', tipo:'MURO', ciclo:'C1' }
  function unidad(codigo) {
    let m = codigo.match(/^(T\d)-P(\d)-(MURO|LOSA)-(C\d)$/i);
    if (m) return { torre: m[1], nivel: 'N' + m[2], tipo: m[3].toUpperCase(), ciclo: m[4].toUpperCase() };
    m = codigo.match(/^(T\d)-(FUND|EMP)$/i);
    if (m) return { torre: m[1], nivel: null, tipo: 'FUND', ciclo: null };
    return null;
  }

  const norm = s => String(s || '').toLowerCase().replace(/\(fantasma\)/g, '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

  return { cargar, unidad, norm };
})();
