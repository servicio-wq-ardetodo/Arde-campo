// ============================================================
// ARDE CAMPO · SUPERVISIÓN DE CLIENTES (Paul)
// - Prioridades: morosos (hoja CXC de COBRANZA) + clientes problema
//   (3+ incidencias en 60 días o una abierta hace más de 7 días)
// - Visita a cliente → hoja VISITAS_SUPERVISION
// - Si la visita incluye Cliente Feliz, la encuesta se agrega al
//   Sheet de Cliente Feliz de siempre (misma estructura de columnas)
// ============================================================

var SUP = {
  COBRANZA_ID: '1PjFkTPF4whqMeu0sZ4-ES6AK9BfP7oadiOxUXq3iGAo',
  COBRANZA_HOJA: 'CXC',
  COBRANZA_CLIENTES: 'DATA',
  CF_ID: '1dPa0SP2BIdOy8IZo0O0MgQypSmsNnhwnfpiXELA-hXU',
  CF_HOJA: 'Respuestas de formulario 1',
  CF_CARPETA_FOTOS: 'Cliente Feliz · Fotos',
  HOJA_VISITAS: 'VISITAS_SUPERVISION',
  PROBLEMA_INCIDENCIAS: 3,    // incidencias en la ventana
  PROBLEMA_DIAS: 60,          // ventana
  PROBLEMA_ABIERTA_DIAS: 7,   // incidencia abierta más de N días
};

var HEADERS_VISITAS = ['N° VISITA', 'FECHA', 'SUPERVISOR', 'CLIENTE', 'RUC', 'DIRECCIÓN', 'EQUIPOS', 'MOTIVOS',
  'DEUDA AL VISITAR (S/)', 'INCIDENCIAS 60D', 'HALLAZGOS', 'ACUERDOS', 'CAUSA INCIDENCIAS', 'ACCIÓN A SEGUIR',
  'RESULTADO COBRANZA', 'MONTO (S/)', 'FECHA COMPROMISO', 'CLIENTE FELIZ', 'FOTO'];

// ── Lista de clientes para el supervisor ────────────────────

function clientesSupervision_() {
  var mapa = {}, lista = [];
  var hoy = new Date();
  function cliente(nombre) {
    var k = claveCliente_(nombre);
    if (!k) return null;
    if (!mapa[k]) {
      mapa[k] = { k: k, cliente: String(nombre).trim(), direccion: '', distrito: '', tipo: '', equipos: [], inc60: 0, incAbiertas: 0, incViejaDias: 0, incs: [], deuda: null };
      lista.push(mapa[k]);
    }
    return mapa[k];
  }

  // 1) Cartera (REF_Clientes)
  getEquipos().forEach(function(e){
    var c = cliente(e.cliente); if (!c) return;
    c.equipos.push(e.id);
    if (!c.direccion) { c.direccion = e.direccion; c.distrito = e.distrito; }
    if (!c.tipo && e.tipoContrato) c.tipo = e.tipoContrato;
  });

  // 2) Incidencias
  var sh = getSpreadsheet().getSheetByName('INCIDENCIAS');
  if (sh && sh.getLastRow() >= 2) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 17).getValues().forEach(function(r){
      var f = r[2];
      if (!esFecha_(f) || !r[5]) return;
      var estado = String(r[16] || '').trim();
      var cerrada = /resuelto|atendido|cancel/i.test(estado);
      var dias = Math.floor((hoy - f) / 86400000);
      var c = cliente(r[5]); if (!c) return;
      if (dias <= SUP.PROBLEMA_DIAS) {
        c.inc60++;
        c.incs.push({ ticket: String(r[0] || ''), fecha: Utilities.formatDate(f, 'America/Lima', 'dd/MM'), tipo: String(r[10] || r[12] || ''),
          estado: estado, desc: String(r[14] || r[12] || '').slice(0, 90), _t: f.getTime() });
      }
      if (!cerrada && String(r[0] || '').trim()) {
        c.incAbiertas++;
        c.incViejaDias = Math.max(c.incViejaDias, dias);
      }
    });
  }

  // 3) Cobranza (morosos)
  var cob = morosos_();
  cob.lista.forEach(function(m){
    var c = null;
    for (var i = 0; i < m.nombres.length && !c; i++) c = buscarClienteParecido_(mapa, m.nombres[i]);
    if (!c) {
      c = cliente(m.nombres[m.nombres.length - 1] || m.razon);
      if (!c) return;
    }
    if (c.deuda) {   // dos RUC para el mismo nombre: se suman
      c.deuda.total += m.total; c.deuda.docs += m.docs; c.deuda.diasMax = Math.max(c.deuda.diasMax, m.diasMax);
    } else {
      c.deuda = { total: m.total, docs: m.docs, diasMax: m.diasMax, desde: m.desde, celular: m.celular, asesor: m.asesor, razon: m.razon, estadoCliente: m.estadoCliente };
    }
    c.ruc = c.ruc || m.ruc;
    c.razon = c.razon || m.razon;
  });

  lista.forEach(function(c){
    c.incs.sort(function(a, b){ return b._t - a._t; });
    c.incs = c.incs.slice(0, 6).map(function(i){ delete i._t; return i; });
    if (c.deuda) c.deuda.total = Math.round(c.deuda.total * 100) / 100;
    c.moroso = !!(c.deuda && c.deuda.total > 0);
    c.problema = c.inc60 >= SUP.PROBLEMA_INCIDENCIAS || (c.incAbiertas > 0 && c.incViejaDias > SUP.PROBLEMA_ABIERTA_DIAS);
  });
  // Solo clientes con equipos, deuda o incidencias
  var out = lista.filter(function(c){ return c.equipos.length || c.moroso || c.inc60; });
  return { clientes: out, error: cob.error };
}

// Morosos desde CXC: PAGÓ = NO y ya vencido. Agrupado por RUC. Cache 10 min.
function morosos_() {
  var cache = CacheService.getScriptCache();
  var guardado = cache.get('morosos_v1');
  if (guardado) return JSON.parse(guardado);
  var res = { lista: [], error: '' };
  try {
    var ss = SpreadsheetApp.openById(SUP.COBRANZA_ID);
    var sh = ss.getSheetByName(SUP.COBRANZA_HOJA);
    if (!sh) throw new Error('No existe la hoja ' + SUP.COBRANZA_HOJA);
    var vals = sh.getDataRange().getValues();
    var fh = filaEncabezado_(vals, 'RUC');
    var cab = vals[fh];
    var col = function(txt){ return columna_(cab, txt); };
    var C = { venc: col('VENCIMIENTO'), estadoCli: col('ESTADO CLIENTE'), cel: col('CELULAR'), ruc: col('RUC'), cliente: col('RAZON SOCIAL'),
      total: col('TOTAL'), pago: col('PAGO'), estadoPago: col('ESTADO DE PAGO'), asesor: col('ASESOR') };
    if (C.ruc < 0 || C.total < 0 || C.pago < 0) throw new Error('No encontré las columnas RUC / TOTAL / PAGÓ en CXC');

    // Nombres comerciales por RUC (hoja DATA)
    var comerciales = {};
    var data = ss.getSheetByName(SUP.COBRANZA_CLIENTES);
    if (data) {
      var dv = data.getDataRange().getValues();
      var dh = filaEncabezado_(dv, 'RUC');
      var dCli = columna_(dv[dh], 'CLIENTE'), dRuc = columna_(dv[dh], 'RUC');
      if (dCli >= 0 && dRuc >= 0) for (var j = dh + 1; j < dv.length; j++) {
        var ruc = String(dv[j][dRuc] || '').replace(/\D/g, '');
        if (ruc && dv[j][dCli]) (comerciales[ruc] = comerciales[ruc] || []).push(String(dv[j][dCli]).trim());
      }
    }

    var hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    var porRuc = {};
    for (var i = fh + 1; i < vals.length; i++) {
      var r = vals[i];
      var pago = String(r[C.pago] || '').trim().toUpperCase();
      if (pago !== 'NO') continue;
      var venc = aFecha_(r[C.venc]);
      var estado = C.estadoPago >= 0 ? String(r[C.estadoPago] || '').toUpperCase() : '';
      if (!(estado.indexOf('VENCIDO') !== -1 || (venc && venc < hoy))) continue;
      var total = aNumero_(r[C.total]);
      if (!(total > 0)) continue;
      var rucR = String(r[C.ruc] || '').replace(/\D/g, '') || String(r[C.cliente] || '');
      var m = porRuc[rucR];
      if (!m) {
        m = porRuc[rucR] = { ruc: /^\d+$/.test(rucR) ? rucR : '', razon: String(r[C.cliente] || '').trim(), total: 0, docs: 0, diasMax: 0, venc0: null,
          celular: C.cel >= 0 ? String(r[C.cel] || '').replace(/NO TIENE/i, '').trim() : '', asesor: C.asesor >= 0 ? String(r[C.asesor] || '').trim() : '',
          estadoCliente: C.estadoCli >= 0 ? String(r[C.estadoCli] || '').trim() : '' };
        res.lista.push(m);
      }
      m.total += total; m.docs++;
      if (venc) {
        m.diasMax = Math.max(m.diasMax, Math.floor((hoy - venc) / 86400000));
        if (!m.venc0 || venc < m.venc0) m.venc0 = venc;
      }
    }
    res.lista.forEach(function(m){
      m.total = Math.round(m.total * 100) / 100;
      m.desde = m.venc0 ? Utilities.formatDate(m.venc0, 'America/Lima', 'dd/MM/yyyy') : '';
      delete m.venc0;
      m.nombres = (comerciales[m.ruc] || []).concat([m.razon]);
    });
  } catch (e) {
    res.error = 'Cobranza: ' + (e.message || e);
    res.lista = [];
  }
  try { cache.put('morosos_v1', JSON.stringify(res), 600); } catch (e) {}
  return res;
}

function filaEncabezado_(vals, texto) {
  for (var i = 0; i < Math.min(vals.length, 10); i++) {
    if (vals[i].some(function(v){ return normalTxt_(v) === normalTxt_(texto) || normalTxt_(v).indexOf(normalTxt_(texto)) === 0; })) return i;
  }
  return 0;
}
function columna_(cab, texto) {
  var t = normalTxt_(texto);
  for (var i = 0; i < cab.length; i++) if (normalTxt_(cab[i]) === t) return i;
  for (var j = 0; j < cab.length; j++) if (normalTxt_(cab[j]).indexOf(t) !== -1) return j;
  return -1;
}
function normalTxt_(s) {
  return String(s == null ? '' : s).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}
function aFecha_(v) {
  if (esFecha_(v)) return v;
  var m = String(v || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return null;
  var y = Number(m[3]); if (y < 100) y += 2000;
  return new Date(y, Number(m[2]) - 1, Number(m[1]));
}
function aNumero_(v) {
  if (typeof v === 'number') return v;
  var s = String(v || '').replace(/S\/|\s/g, '').replace(/,/g, '');
  var x = parseFloat(s);
  return isFinite(x) ? x : 0;
}

// Empareja la razón social / nombre comercial de Cobranza con el nombre en la cartera
function nombreBase_(s) {
  return claveCliente_(s)
    .replace(/\(.*?\)/g, ' ')
    .replace(/\b(s\.?\s?a\.?\s?c\.?|s\.?\s?r\.?\s?l\.?|e\.?\s?i\.?\s?r\.?\s?l\.?|s\.?\s?a\.?|sociedad anonima cerrada|sociedad comercial de responsabilidad limitada|tiene deuda)\b\.?/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}
function buscarClienteParecido_(mapa, nombre) {
  var variantes = [nombreBase_(nombre)];
  var par = String(nombre).match(/\(([^)]+)\)/);
  if (par) variantes.push(nombreBase_(par[1]));
  var claves = Object.keys(mapa);
  for (var v = 0; v < variantes.length; v++) {
    var b = variantes[v];
    if (!b || b.length < 4) continue;
    for (var i = 0; i < claves.length; i++) {
      var c = nombreBase_(mapa[claves[i]].cliente);
      if (!c || c.length < 4) continue;
      if (c === b || (b.length >= 5 && c.indexOf(b) !== -1) || (c.length >= 5 && b.indexOf(c) !== -1)) return mapa[claves[i]];
    }
  }
  return null;
}

// ── Registrar la visita ─────────────────────────────────────

function registrarVisitaSupervision(d) {
  try {
    if (!d.cliente) return { ok: false, mensaje: 'Falta el cliente' };
    if (!d.hallazgos) return { ok: false, mensaje: 'Faltan los hallazgos' };
    var fecha = ahora_();
    var numero = siguienteVisita_();

    var urlFoto = '';
    if (d.fotoBase64) {
      try {
        var blob = Utilities.newBlob(Utilities.base64Decode(d.fotoBase64), d.fotoMime || 'image/jpeg',
          numero + ' · ' + limpiarNombre_(d.cliente) + '.jpg');
        var carpeta = subcarpeta_(DriveApp.getRootFolder(), SUP.CF_CARPETA_FOTOS);
        var archivo = carpeta.createFile(blob);
        archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        urlFoto = archivo.getUrl();
      } catch (e) { Logger.log('Foto visita: ' + e); }
    }

    var cfOk = '';
    if (d.clienteFeliz) {
      var q = d.clienteFeliz;
      var hoja = SpreadsheetApp.openById(SUP.CF_ID).getSheetByName(SUP.CF_HOJA);
      if (!hoja) return { ok: false, mensaje: 'Error: no encontré la hoja de Cliente Feliz' };
      hoja.appendRow([fecha, d.cliente, Number(q.sat) || q.sat, q.presencia, q.aroma, q.velocidad, q.futuro, Number(q.nps), q.mejora,
        d.supervisor, d.distrito || '', q.percibido, q.ubicacion, q.factores, q.obsTec, urlFoto]);
      cfOk = 'SÍ';
    }

    hojaVisitas_().appendRow([numero, fecha, d.supervisor, d.cliente, d.ruc || '', [d.direccion, d.distrito].filter(String).join(' · '),
      d.equipos || '', d.motivos || '', d.deudaAlVisitar || 0, d.inc60 || 0, d.hallazgos, d.acuerdos || '',
      d.incDiagnostico || '', d.incAccion || '', d.cobResultado || '', d.cobMonto || '',
      d.cobFecha ? new Date(d.cobFecha + 'T12:00:00') : '', cfOk, urlFoto]);
    return { ok: true, ticket: numero, mensaje: 'Visita ' + numero + ' registrada' + (cfOk ? ' · encuesta en Cliente Feliz' : '') };
  } catch (e) {
    return { ok: false, mensaje: 'Error: ' + (e.message || e) };
  }
}

function hojaVisitas_() {
  var ss = getSpreadsheet();
  var sh = ss.getSheetByName(SUP.HOJA_VISITAS);
  if (!sh) {
    sh = ss.insertSheet(SUP.HOJA_VISITAS);
    sh.getRange(1, 1, 1, HEADERS_VISITAS.length).setValues([HEADERS_VISITAS]).setFontWeight('bold').setBackground('#15191E').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
  }
  return sh;
}

function siguienteVisita_() {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var props = PropertiesService.getScriptProperties();
    var n = Number(props.getProperty('CORRELATIVO_VIS'));
    if (!n) {
      n = 0;
      var sh = hojaVisitas_();
      if (sh.getLastRow() >= 2) sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().forEach(function(r){
        var m = String(r[0]).match(/^VIS-(\d+)/); if (m) n = Math.max(n, Number(m[1]));
      });
    }
    n++;
    props.setProperty('CORRELATIVO_VIS', String(n));
    return 'VIS-' + ('0000' + n).slice(-4);
  } finally {
    lock.releaseLock();
  }
}

// ── Para el resumen diario ──────────────────────────────────

function resumenSupervision_(esHoy) {
  var sh = getSpreadsheet().getSheetByName(SUP.HOJA_VISITAS);
  var out = { visitas: [], compromisos: [] };
  if (!sh || sh.getLastRow() < 2) return out;
  var hoyTxt = Utilities.formatDate(new Date(), 'America/Lima', 'yyyy-MM-dd');
  var manana = Utilities.formatDate(new Date(Date.now() + 86400000), 'America/Lima', 'yyyy-MM-dd');
  var desde = Math.max(2, sh.getLastRow() - 1000);
  sh.getRange(desde, 1, sh.getLastRow() - desde + 1, 17).getValues().forEach(function(r){
    if (esHoy(r[1])) out.visitas.push(r[0] + ' · ' + r[3] + ' · ' + r[7]);
    if (esFecha_(r[16])) {
      var f = Utilities.formatDate(r[16], 'America/Lima', 'yyyy-MM-dd');
      if (f === hoyTxt || f === manana) out.compromisos.push((f === hoyTxt ? 'HOY' : 'Mañana') + ' · ' + r[3] + ' · S/ ' + r[15] + ' (' + r[0] + ')');
    }
  });
  return out;
}

// ============================================================
// EJECUTAR UNA VEZ tras subir esta versión (▶ actualizarApp):
// agrega el rol SUPERVISOR, crea a Paul con un PIN y las hojas nuevas.
// ============================================================
function actualizarApp() {
  var sh = getSpreadsheet().getSheetByName(APP.SHEET_USUARIOS);
  if (!sh) { configurarApp(); sh = getSpreadsheet().getSheetByName(APP.SHEET_USUARIOS); }
  var regla = SpreadsheetApp.newDataValidation().requireValueInList(['TECNICO', 'COMERCIAL', 'SUPERVISOR', 'ADMIN'], true).build();
  sh.getRange(2, 2, 200, 1).setDataValidation(regla);

  var vals = sh.getLastRow() >= 2 ? sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues() : [];
  var usados = {};
  vals.forEach(function(r){ usados[String(r[2]).trim()] = true; });
  var existe = vals.some(function(r){ return String(r[0]).trim().toLowerCase() === 'paul espichan'; });
  var pin = '';
  if (!existe) {
    do { pin = String(Math.floor(1000 + Math.random() * 9000)); } while (usados[pin]);
    var fila = sh.getLastRow() + 1;
    sh.getRange(fila, 3).setNumberFormat('@');
    sh.getRange(fila, 1, 1, 5).setValues([['Paul Espichan', 'SUPERVISOR', pin, 'SÍ', '']]);
  }
  hojaVisitas_(); hojaConformidades_(); hojaCorreos_();
  CacheService.getScriptCache().remove('usuarios_activos');
  var r = morosos_();
  Logger.log(existe ? 'Paul ya existía en USUARIOS_APP.' : 'Paul Espichan creado con PIN ' + pin);
  Logger.log('Cobranza: ' + (r.error || r.lista.length + ' cliente(s) con deuda vencida'));
}
