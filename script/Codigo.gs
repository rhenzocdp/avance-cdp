/**
 * Newen Antu · Tablero de Obra — script de datos
 * ------------------------------------------------
 * Pegar en: Planilla "Pizarra Programación Intermedia - Newen Antu" > Extensiones > Apps Script.
 * Implementar > Nueva implementación > Aplicación web
 *   - Ejecutar como: Yo
 *   - Quién tiene acceso: Cualquier usuario
 * Copiar la URL (termina en /exec) y pegarla en datos.js del visor (SCRIPT_URL).
 *
 * El visor lee todo desde aquí:
 *   PIZARRA     -> semana 0 (la que se planifica): PROG, REAL, META por partida
 *   PROJECT OG  -> orden y fecha de cada unidad (torre / piso / ciclo)
 *   CONFIG APP  -> obra, supervisor por defecto, plan de ataque, firmas
 * No hay que llenar nada más: al actualizar la pizarra, el visor y el PAC se actualizan solos.
 */

function doGet() {
  var datos;
  try {
    datos = construirDatos_();
  } catch (err) {
    datos = { ok: false, error: String(err) };
  }
  return ContentService.createTextOutput(JSON.stringify(datos))
    .setMimeType(ContentService.MimeType.JSON);
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Newen Antu')
    .addItem('Escribir plan de la semana (hoja PLAN SEMANA)', 'escribirPlanSemana')
    .addToUi();
}

function construirDatos_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var leer = function (nombre) {
    var h = ss.getSheetByName(nombre);
    if (!h) throw new Error('Falta la hoja "' + nombre + '"');
    return h.getDataRange().getDisplayValues();
  };
  var cfg = leer('CONFIG APP');
  var curva = [];
  var idAv = '';
  cfg.forEach(function (r) { if (String(r[0]).trim() === 'ID planilla avances') idAv = String(r[1]).trim(); });
  if (idAv) {
    try {
      var hAv = SpreadsheetApp.openById(idAv).getSheetByName('CURVA GENERAL NEWEN ANTU');
      if (hAv) curva = hAv.getRange('A1:F200').getDisplayValues();
    } catch (e) { /* sin acceso a la planilla de avances */ }
  }
  return calcularPlan(leer('PIZARRA'), leer('PROJECT OG'), cfg, curva);
}

/** Deja el plan en una hoja para revisarlo o copiarlo a Foco. */
function escribirPlanSemana() {
  var d = construirDatos_();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var h = ss.getSheetByName('PLAN SEMANA') || ss.insertSheet('PLAN SEMANA');
  h.clear();
  var filas = [['#', 'Torre', 'Frente / Nivel', 'Unidad de control', 'Partida', 'Subcontrato', 'Supervisor', 'Código unidad', 'Fecha programa']];
  d.plan.forEach(function (p, i) {
    filas.push([i + 1, p.torre, p.frente, p.unidad, p.partida, p.resp, p.supervisor, p.codigo, p.fecha]);
  });
  h.getRange(1, 1, 1, 3).setValues([['Semana ' + d.semana.inicio + ' al ' + d.semana.fin, '', 'Generado ' + d.generado]]);
  h.getRange(3, 1, filas.length, filas[0].length).setValues(filas);
  h.getRange(3, 1, 1, filas[0].length).setFontWeight('bold');
}

/* =====================  LÓGICA (sin dependencias de Google)  ===================== */

function calcularPlan(piz, og, cfgRows, curvaRows) {
  var norm = function (s) {
    return String(s || '').toLowerCase().replace(/\(fantasma\)/g, '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  };
  var num = function (v) {
    var n = parseFloat(String(v || '').replace(',', '.'));
    return isNaN(n) ? 0 : n;
  };
  var fecha = function (s) {
    var m = String(s || '').match(/(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/);
    return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null;
  };
  var fmt = function (d) {
    return ('0' + d.getDate()).slice(-2) + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + d.getFullYear();
  };

  // --- CONFIG APP ---
  var cfg = { obra: 'CNT Newen Antu', supervisor: '', ataque: ['T5', 'T1', 'T2', 'T4', 'T3'], firmas: [], semanasVentana: 4, subcontratos: {} };
  var supPartida = {};
  var seccion = '';
  cfgRows.forEach(function (r) {
    var k = String(r[0] || '').trim(), v = String(r[1] || '').trim(), x = String(r[2] || '').trim();
    if (/^partida \(igual/i.test(k)) { seccion = 'sup'; return; }
    if (/^subcontratos/i.test(k)) { seccion = 'sub'; return; }
    if (k === 'Semanas a mostrar') { cfg.semanasVentana = /todo/i.test(v) ? 0 : Math.max(1, parseInt(v, 10) || 4); return; }
    if (seccion === 'sup') { if (k && v) supPartida[norm(k)] = v; return; }
    if (seccion === 'sub') { if (k && k !== 'Sigla') cfg.subcontratos[k] = { nombre: v || k, especialidad: x }; return; }
    if (k === 'Obra' && v) cfg.obra = v;
    else if (k === 'Supervisor por defecto') cfg.supervisor = v;
    else if (k === 'Plan de ataque' && v) cfg.ataque = v.split(/[,;\s→>-]+/).filter(Boolean);
    else if (/^Firma \d/.test(k) && v) cfg.firmas.push(v);
  });

  // --- PIZARRA ---
  var inicio = fecha(piz[1] && piz[1][3]);
  if (!inicio) throw new Error('No encuentro la fecha amarilla (PIZARRA!D2)');
  var fin = new Date(inicio.getTime()); fin.setDate(fin.getDate() + 6);
  var partidas = [];
  var grupo = '';
  for (var r = 6; r < piz.length; r++) {
    var row = piz[r];
    var nombre = String(row[1] || '').trim();
    if (!nombre) { if (partidas.length) break; else continue; }
    if (String(row[0] || '').trim()) grupo = String(row[0]).trim();
    var semanas = [];
    for (var k = 0; k < 6; k++) {
      var c = 3 + 3 * k;
      semanas.push({ prog: num(row[c]), real: num(row[c + 1]), meta: num(row[c + 2]) });
    }
    partidas.push({
      orden: partidas.length, grupo: grupo, partida: nombre, resp: String(row[2] || '').trim(),
      fantasma: /fantasma/i.test(nombre), anterior: semanas[0], semana: semanas[1], semanas: semanas
    });
  }

  // --- PROJECT OG: unidades por partida, ordenadas por fecha ---
  var unidades = {};
  for (var i = 1; i < og.length; i++) {
    var p = norm(og[i][0]), u = String(og[i][1] || '').trim();
    if (!p || !u) continue;
    (unidades[p] = unidades[p] || []).push({ codigo: u, fecha: fecha(og[i][2]), pos: i });
  }
  Object.keys(unidades).forEach(function (k) {
    unidades[k].sort(function (a, b) { return ((a.fecha || 0) - (b.fecha || 0)) || (a.pos - b.pos); });
  });

  var describir = function (codigo) {
    var m = codigo.match(/^(T\d)-P(\d)-(MURO|LOSA)-C(\d)$/i);
    if (m) return { torre: m[1], nivel: +m[2], frente: 'Nivel ' + m[2], tipo: m[3].toUpperCase() === 'MURO' ? 'Muros' : 'Losa',
      unidad: (m[3].toUpperCase() === 'MURO' ? 'Muros' : 'Losa cielo') + ' · Ciclo ' + m[4] + (m[4] === '1' ? ' (Oriente)' : ' (Poniente)'), ciclo: 'C' + m[4] };
    m = codigo.match(/^(T\d)-(FUND|EMP)$/i);
    if (m) return { torre: m[1], nivel: 0, frente: 'Torre completa', tipo: 'Fundaciones', unidad: 'Fundaciones', ciclo: '' };
    m = codigo.match(/^(T\d)/);
    return { torre: m ? m[1] : '-', nivel: 0, frente: codigo, tipo: 'Otro', unidad: codigo, ciclo: '' };
  };

  // Nombre para el PAC: sin "(fantasma)" y con el elemento cuando la pizarra lo omite
  var etiqueta = function (pt) {
    var n = pt.partida.replace(/\s*\(fantasma\)/i, '');
    if (/MUROS \/ PILARES|MUROS\/PILARES/i.test(pt.grupo) && !/muro/i.test(n)) n += ' muros/pilares';
    return n;
  };

  var plan = [], estado = {}, sinUnidades = [], programa = [];
  partidas.forEach(function (pt) {
    var lista = unidades[norm(pt.partida)];
    var prog = Math.round(pt.semana.prog);
    var inicioIdx = Math.max(0, Math.round(pt.semana.real - pt.semana.prog));
    pt.totalUnidades = lista ? lista.length : 0;
    if (!lista) { if (prog > 0) sinUnidades.push({ partida: pt.partida, grupo: pt.grupo, resp: pt.resp, prog: prog }); return; }
    lista.forEach(function (u, idx) {
      var st = idx < inicioIdx ? 'hecho' : (idx < inicioIdx + prog ? 'programado' : 'pendiente');
      (estado[u.codigo] = estado[u.codigo] || {})[pt.partida] = st;
      if (st !== 'hecho') {
        var dd = describir(u.codigo);
        programa.push({ torre: dd.torre, nivel: dd.nivel, frente: dd.frente, unidad: dd.unidad, tipo: dd.tipo, ciclo: dd.ciclo,
          codigo: u.codigo, fecha: u.fecha ? fmt(u.fecha) : '', t: u.fecha ? u.fecha.getTime() : 0,
          partida: etiqueta(pt), resp: pt.resp, estado: st, orden: pt.orden });
      }
      if (st === 'programado') {
        var d = describir(u.codigo);
        plan.push({
          torre: d.torre, nivel: d.nivel, frente: d.frente, unidad: d.unidad, tipo: d.tipo, ciclo: d.ciclo,
          codigo: u.codigo, fecha: u.fecha ? fmt(u.fecha) : '', partida: etiqueta(pt),
          grupo: pt.grupo, resp: pt.resp, fantasma: pt.fantasma, orden: pt.orden,
          supervisor: supPartida[norm(pt.partida)] || cfg.supervisor || 'Sin asignar'
        });
      }
    });
  });

  var tIdx = function (t) { var i = cfg.ataque.indexOf(t); return i < 0 ? 99 : i; };
  var tipoIdx = { Fundaciones: 0, Muros: 1, Losa: 2, Otro: 3 };
  plan.sort(function (a, b) {
    return tIdx(a.torre) - tIdx(b.torre) || tipoIdx[a.tipo] - tipoIdx[b.tipo] || a.nivel - b.nivel ||
      a.ciclo.localeCompare(b.ciclo) || a.orden - b.orden;
  });

  // --- Curva de avance (planilla avances: real acumulado de Foco y PPC) ---
  var pct = function (v) {
    var t = String(v || '').replace('%', '').replace(',', '.').trim();
    return t === '' || isNaN(+t) ? null : +t;
  };
  var curva = [], cab = -1;
  (curvaRows || []).forEach(function (r, i) {
    if (cab < 0 && /FECHA/i.test(r[0]) && /REAL/i.test(r.join(' '))) { cab = i; return; }
    if (cab < 0) return;
    var f = fecha(r[0]);
    if (f) curva.push({ fecha: fmt(f), prog: pct(r[1]), real: pct(r[3]), ppc: pct(r[5]) });
  });
  var ultimo = null;
  curva.forEach(function (c) { if (c.real !== null) ultimo = c; });

  return {
    ok: true,
    curva: curva,
    avance: ultimo,
    generado: fmt(new Date()),
    obra: cfg.obra,
    config: cfg,
    semana: { inicio: fmt(inicio), fin: fmt(fin), corte: fmt(fin) },
    partidas: partidas.map(function (p) {
      return { grupo: p.grupo, partida: p.partida, resp: p.resp, fantasma: p.fantasma, total: p.totalUnidades,
        prog: p.semana.prog, real: p.semana.real, meta: p.semana.meta, realAnterior: p.anterior.real };
    }),
    plan: plan,
    programa: programa.filter(function (p) {
      var finVentana = inicio.getTime() + (cfg.semanasVentana * 7 - 1) * 864e5;
      return !cfg.semanasVentana || p.estado === 'programado' || (p.t && p.t <= finVentana);
    }).sort(function (a, b) { return a.t - b.t || a.orden - b.orden; }),
    sinUnidades: sinUnidades,
    estado: estado
  };
}

if (typeof module !== 'undefined') module.exports = { calcularPlan: calcularPlan };
