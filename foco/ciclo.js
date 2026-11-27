// foco/ciclo.js — Carga directa en Foco en Obra para el ciclo semanal Last Planner de CNT Newen Antu.
// Se pega/ejecuta en la consola de la página de Foco (javascript_tool). No forma parte del sitio web.
// Páginas y tokens:
//   Planner / restricciones / CNC -> focowebextembedded-…azurewebsites.net/*  (localStorage foco_token_v2, crudo)
//   Ingreso de avance             -> embeddedfoco.focoenobra.cl/advance-income (localStorage foco_token, con Bearer)
//   403 "Token inválido": entrar por el menú de Foco a la opción y navegar la pestaña al iframe.src.
// Uso: siempre primero simular:true (PC1 = OK del usuario), luego simular:false. Resultado en window._r.
// Reglas de código: hoja MAPEO FOCO de la planilla pizarra. Referencia de la API: doc foco-api.md del proyecto.

// ===== Común =====
const USR='r.gatica', EMP='DON PEDRO', OBRA=118, CUAD=266, GANT=167;
const V2='https://focowebapiv2ext-htctbahkhybrdzc8.eastus-01.azurewebsites.net/';
const Q=`?user=${USR}&company=DON+PEDRO`;
const T = {T5:1, T4:2, T3:3, T2:4, T1:5};   // torre pizarra -> 4.{t} (y rellenos 2.1.4.{t}, mismo orden)
const REGLAS = {                              // partida pizarra -> (u) => [códigos Foco]
  'Rellenos controlados':        u => [`2.1.4.${T[u.torre]}`],
  'Compactación sello fundación':u => [`4.${T[u.torre]}.1.1.1`],
  'Emplantillado viga/losa':     u => [`4.${T[u.torre]}.1.1.2`],
  'Enfierradura fundaciones':    u => [3,4].map(k=>`4.${T[u.torre]}.1.1.${k}`),
  'Enf. vertical muro/pilar':    u => [`4.${T[u.torre]}.1.1.5`],
  'Inst. sanitaria fundación':   u => [1,2,3,4].map(d=>`4.${T[u.torre]}.3.2.2.1.${d}`),
  'Moldaje viga':                u => [`4.${T[u.torre]}.1.1.6`],
  'Hormigón viga':               u => [`4.${T[u.torre]}.1.1.7`],
  'Enfierradura':                u => [`4.${T[u.torre]}.1.2.${u.nivel}.1.${u.ciclo}`],
  'Inst. eléctrica muros':       u => (u.ciclo==1?[1,2]:[3,4]).map(d=>`4.${T[u.torre]}.3.1.2.${u.nivel}.${d}`),
  'Moldajes':                    u => [`4.${T[u.torre]}.1.2.${u.nivel}.2.${u.ciclo}`],
  'Hormigón':                    u => [`4.${T[u.torre]}.1.2.${u.nivel}.3.${u.ciclo}`],
  'Descimbre':                   u => [`4.${T[u.torre]}.1.2.${u.nivel}.4.${u.ciclo}`],
  // LOSAS: por verificar en Foco con la primera losa. No usar hasta confirmar.
  'Losa':                        u => { throw 'Losas: códigos por verificar (MAPEO FOCO)'; },
};
const codigos = lista => lista.flatMap(u => {
  if (!T[u.torre]) throw 'Torre inválida: '+u.torre;
  const f = REGLAS[u.partida]; if (!f) throw 'Sin regla: '+u.partida;
  return f(u).map(c => ({c, u}));
});
async function api(url, opt={}) {                       // corta ante cualquier error HTTP
  const r = await fetch(url, opt);
  if (!r.ok) throw `HTTP ${r.status} ${opt.method||'GET'} ${url.split('?')[0].split('/').slice(-2).join('/')}: ${(await r.text()).slice(0,200)}`;
  const t = await r.text(); try { return JSON.parse(t) } catch { return t }
}
const hV2 = () => ({authorization: localStorage.getItem('foco_token_v2'), 'content-type':'application/json'});
const fecha = d => d ? `${String(d).slice(0,10)}T12:00:00` : null;   // evita el día menos por zona horaria
const ganttView = async idAva => { const g = await api(V2+`planner-visualization/gantt-view${Q}&idAva=${idAva}&tipoAvance=1&idGant=${GANT}`,{headers:hV2()}); return g.data||g; };

// ===== A. Planificar semana (página planner-visualization, token v2) =====
// planificar({idAva:1094, unidades:[{partida:'Enfierradura', torre:'T1', nivel:1, ciclo:1}, ...], simular:true})
async function planificar({idAva, unidades, simular=true}) {
  const porCod = Object.fromEntries((await ganttView(idAva)).map(x=>[x.code.trim(), x]));
  const cods = codigos(unidades), faltan = cods.filter(o=>!porCod[o.c]).map(o=>o.c);
  if (faltan.length) return window._r = {error:'Códigos no encontrados', faltan};
  const plan = cods.map(o=>({codigo:o.c, id:porCod[o.c].id, nombre:porCod[o.c].name?.trim(), yaPlanificada:porCod[o.c].scheduledPercent>0}));
  if (simular) return window._r = {simulacion:true, tareas:plan.length, plan};
  for (const p of plan) {
    await api(V2+'planner-visualization/gantt-week'+Q,{method:'PUT',headers:hV2(),body:JSON.stringify({user:USR,company:EMP,idAva,idIns:String(p.id),semanaPla:1,porcSem:100})});
    await api(V2+'planner-visualization/gantt-cuadrillas'+Q,{method:'PUT',headers:hV2(),body:JSON.stringify({idGant:String(idAva),idCuadrilla:String(CUAD),cadenaVgaInsumos:String(p.id),user:USR,company:EMP})});
  }
  return window._r = await verificar(idAva);
}
// Chequeo previo a cerrar (PC2): hojas planificadas, cuadrilla y % planificado FÍSICO (va bajo el PPC en el correo).
async function verificar(idAva) {
  const a = await ganttView(idAva);
  const hojas = a.filter(x=>x.scheduledPercent>0 && !a.some(y=>y.parentId==x.id));
  const sinCuadrilla = hojas.filter(x=>x.asignaCuadrilla!=1 || x.idCuadrilla!=CUAD).map(x=>x.code.trim());
  const det = await api(V2+`planner-visualization/gantt-weekly-detail${Q}&idAva=${idAva}&tipoAvance=2&idCuadrilla=0`,{headers:hV2()});
  const obra = (det.data||det).find(x=>x.idIns=='301403');
  return window._r = {tareas:hojas.length, sinCuadrilla, planificadoFisico: obra ? +obra.porcPla.toFixed(2) : 'no encontrado (fila 301403)'};
  // sinCuadrilla ≠ [] → arreglar en UI: clic derecho tarea > Distribución semanal por UCO > clic derecho celda > Asignar Cuadrilla.
}

// ===== B. Ingreso de avance (página advance-income, token foco_token) =====
// cargarAvance({idAva:<avance jueves>, unidades:[{partida, torre, nivel, ciclo, pct?}], simular:true})
// pct = % ACUMULADO de la partida completa (default 100 = todos sus recintos al 100%). Recintos que ya tienen ese % o más se saltan.
const AV='https://webapi.focoenobra.cl:1076/api/Avances/';
const hAv = () => ({'Authorization':'Bearer '+localStorage.getItem('foco_token'),'Content-Type':'application/json'});
const postAv = (m, b) => api(AV+m,{method:'POST',headers:hAv(),body:JSON.stringify({USUARIO:USR,EMPRESA:EMP,...b})});
async function partidasAvance(idAva) {
  const pc = await postAv('GetAvaPartidasCriticas',{ID_OBR:OBRA,ID_AVA:idAva});
  return Object.fromEntries(pc.map(x=>[String(x.CODIGO_INS).trim(), x]));
}
async function cargarAvance({idAva, unidades, simular=true}) {
  const porCod = await partidasAvance(idAva), out = [];
  for (const {c, u} of codigos(unidades)) {
    const p = porCod[c]; if (!p) { out.push({codigo:c, estado:'NO EXISTE'}); continue; }
    const pct = u.pct ?? 100;
    const rec = (await postAv('GetAvaRecintosPartida',{ID_INS:+p.ID_INS,ID_AVA:idAva})).filter(r=>r.ID_PAR_UCO>0);
    const aCargar = rec.filter(r=>(r.PRC_AVANCE??0) < pct);
    out.push({codigo:c, recintos:rec.length, aCargar:aCargar.length, pct});
    if (simular) continue;
    for (const r of aCargar) {
      // CANTIDAD_AVANCE: proporcional a la cantidad del recinto si viene; si no, fracción (pct/100). VERIFICAR con 1 recinto parcial.
      const cant = r.CANTIDAD != null ? +(r.CANTIDAD*pct/100).toFixed(4) : pct/100;
      await postAv('SetAvanceRecinto',{ID_AVA:idAva,ID_PAR_UCO:r.ID_PAR_UCO,PRC_AVANCE:pct,CANTIDAD_AVANCE:cant});
    }
  }
  return window._r = {simulacion:simular, detalle:out};
}
// Mapa ID_INS -> código, para llevar a la página CNC (orígenes distintos, no comparten localStorage):
// en advance-income: JSON.stringify(await mapaIns(idAva)) → pegar como argumento en asignarCNC.
async function mapaIns(idAva) {
  const porCod = await partidasAvance(idAva);
  return window._r = Object.fromEntries(Object.entries(porCod).map(([c,x])=>[x.ID_INS, c]));
}

// ===== C. CNC (página gestion-cnc, token v2) =====
// asignarCNC({idAva:<planificación>, mapa:<salida de mapaIns>, causas:{'4.5.1.1.6':[498,'Llegó solo 1 juego...']}, simular:true})
// Paso 1 (simular): lista no cumplidas con su código y la causa que se asignaría → PC1.
// Paso 2 (simular:false): guarda en un solo POST. Causas: ver foco-api-hallazgos.md (498 Falta de Material, 506 Bajo Rendimiento, …).
async function asignarCNC({idAva, mapa={}, causas={}, simular=true}) {
  const arbol = await api(V2+`cnc-management/goals-by-supervisor${Q}&idAva=${idAva}`,{headers:hV2()});
  const tareas = []; const w = n => { if (n.level=='tarea' && n.porcentajeAvReal<100) tareas.push(n); (n.children||[]).forEach(w); };
  (Array.isArray(arbol)?arbol:[arbol]).forEach(w);
  const filas = tareas.map(t => {
    const codigo = mapa[t.actividadId] || null, causa = codigo && causas[codigo];
    return {codigo, actividadId:t.actividadId, idParUco:t.tareaId, recinto:t.depto, avReal:t.porcentajeAvReal, idCnc:causa?.[0]??null, comentario:causa?.[1]??''};
  });
  const sinCausa = filas.filter(f=>!f.idCnc);
  if (simular || sinCausa.length) return window._r = {simulacion:true, noCumplidas:filas, sinCausa:sinCausa.map(f=>f.codigo||f.actividadId)};
  await api(V2+'cnc-management/save-cnc-goals'+Q,{method:'POST',headers:hV2(),body:JSON.stringify({idAva,
    grillaTareasCnc: filas.map(f=>({semanaId:1,cuadrillaId:CUAD,idParUco:f.idParUco,idCnc:f.idCnc,comentario:f.comentario}))})});
  return window._r = {guardadas:filas.length};
}

// ===== D. Restricciones (página controlGestionRestricciones o planner-visualization, token v2) =====
// gestionarRestricciones({
//   liberar:    [{idRest, fechaReal:'2026-11-26', obs?}],
//   reprogramar:[{idRest, fechaEst:'2026-12-03'}],            // se mantiene la fecha MÁS ALTA (actual vs nueva)
//   crear:      [{codigo:'4.5.1.2.1.1.1', idIns?, tipo:146, resp:227, detalle:'...', fechaEst:'2026-12-02'}],
//   simular:true })
// Lo marcado cumplido en el acta NO se sube como restricción nueva (filtrarlo antes de armar 'crear').
const RC = V2+'restrictions-control/';
async function gestionarRestricciones({liberar=[], reprogramar=[], crear=[], simular=true}) {
  const lista = await api(RC+`restrictions-list${Q}&idObra=${OBRA}&est=-1`,{headers:hV2()});
  const porId = Object.fromEntries((lista.data||lista).map(r=>[r.ID_REST, r]));
  const out = {liberar:[], reprogramar:[], crear:[], errores:[]};
  const cuerpo = (r, cambios) => ({user:USR, company:EMP, idRest:r.ID_REST, idIns:r.ID_INS, idTipRes:r.ID_TIP_RES, idResp:r.ID_RESP,
    detalleRest:r.DETALLE_REST, estadoLib:r.ESTADO_LIB, fechaEstLib:fecha(r.FECHA_EST_LIB), fechaRealLib:fecha(r.FECHA_REAL_LIB),
    fecEntregaMat:fecha(r.FEC_ENTREGA_MAT), observaRest:r.OBSERVA_REST||'', observaLib:r.OBSERVA_LIB||'', observaCnc:r.Observa_CNC||'', ...cambios});

  for (const x of liberar) {
    const r = porId[x.idRest]; if (!r) { out.errores.push(`liberar ${x.idRest}: no existe`); continue; }
    out.liberar.push({idRest:x.idRest, codigo:r.CODIGO_INS?.trim(), detalle:r.DETALLE_REST, fechaReal:x.fechaReal});
    if (!simular) await api(RC+'update-restriction'+Q,{method:'PUT',headers:hV2(),body:JSON.stringify(cuerpo(r,{estadoLib:1, fechaRealLib:fecha(x.fechaReal), observaLib:x.obs||r.OBSERVA_LIB||''}))});
  }
  for (const x of reprogramar) {
    const r = porId[x.idRest]; if (!r) { out.errores.push(`reprogramar ${x.idRest}: no existe`); continue; }
    const actual = String(r.FECHA_EST_LIB||'').slice(0,10), nueva = x.fechaEst > actual ? x.fechaEst : actual;
    out.reprogramar.push({idRest:x.idRest, codigo:r.CODIGO_INS?.trim(), actual, queda:nueva, cambia:nueva!==actual});
    if (!simular && nueva!==actual) await api(RC+'update-restriction'+Q,{method:'PUT',headers:hV2(),body:JSON.stringify(cuerpo(r,{estadoLib:0, fechaEstLib:fecha(nueva)}))});
  }
  for (const x of crear) {
    if (!x.resp || x.resp==1) { out.errores.push(`crear ${x.codigo}: responsable inválido (DEMO/vacío)`); continue; }
    const idIns = x.idIns || (lista.data||lista).find(r=>r.CODIGO_INS?.trim()==x.codigo)?.ID_INS;   // reutiliza ID_INS de restricciones previas del mismo código
    if (!idIns) { out.errores.push(`crear ${x.codigo}: falta idIns (buscar en partidas-list o fundaciones base+(n−1))`); continue; }
    out.crear.push({codigo:x.codigo, idIns, tipo:x.tipo, resp:x.resp, detalle:x.detalle, fechaEst:x.fechaEst});
    if (!simular) await api(RC+'insert-restriction'+Q,{method:'POST',headers:hV2(),body:JSON.stringify({user:USR, usuario:USR, company:EMP, idObr:OBRA,
      idIns, idTipRes:x.tipo, idResp:x.resp, detalleRest:x.detalle, estadoLib:0, fechaEstLib:fecha(x.fechaEst), fechaRealLib:null, fecEntregaMat:null,
      observaRest:'', observaLib:'', observaCnc:''})});
  }
  return window._r = {simulacion:simular, ...out};
}
