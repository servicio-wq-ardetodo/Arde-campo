// ============================================================
// ARDE CAMPO · API
// Servidor de la app "ARDE Campo" (Android / iOS).
// La app llama a esta Web App; aquí se valida quién es (PIN),
// se registra cada envío en LOG_APP (con GPS) y se reparte a la
// lógica de Tecnico.gs y Comercial.gs, que es la misma de los
// formularios anteriores.
//
// PRIMERA VEZ: ejecutar configurarApp() desde el editor (▶).
// ============================================================

var APP = {
  VERSION: '1.0.0',
  SHEET_USUARIOS: 'USUARIOS_APP',
  SHEET_LOG: 'LOG_APP',
  TOKEN_DIAS: 60,
  RESUMEN_HORA: 19,                      // hora (Lima) del resumen diario
  RESUMEN_PARA: 'operaciones@ardetodo.com',
  // Usuarios iniciales: configurarApp() les asigna un PIN al azar (editable en USUARIOS_APP)
  USUARIOS_INICIALES: [
    ['Josef López', 'ADMIN'],
    ['Gerson Ortiz', 'COMERCIAL'],
    ['Marco Lavado', 'COMERCIAL'],
    ['Violeta Beltran', 'COMERCIAL'],
    ['Guillermo Esquen - Lima', 'TECNICO'],
    ['Christian Malpartida - Lima', 'TECNICO'],
    ['Miguel Huaman - Lima', 'TECNICO'],
    ['Félix Ochotama - Lima', 'TECNICO'],
    ['Carlos Quispe - Lima', 'TECNICO'],
    ['Alex Mora - Lima', 'TECNICO'],
    ['Manuel Castillo - Piura', 'TECNICO'],
  ],
};

var HEADERS_LOG = ['FECHA_SERVIDOR', 'ID_REGISTRO', 'USUARIO', 'ROL', 'MODULO', 'REFERENCIA',
  'RESULTADO', 'MENSAJE', 'CAPTURADO_EN', 'LAT', 'LNG', 'PRECISION_M', 'MAPA', 'DISPOSITIVO'];

// Hora "real" del trabajo. Cuando un registro se hizo sin señal y llega después,
// la app manda la hora en que se capturó; todas las fechas de ejecución la usan.
var FECHA_CAPTURA_ = null;
function ahora_() {
  return FECHA_CAPTURA_ ? new Date(FECHA_CAPTURA_.getTime()) : new Date();
}

// Qué módulos puede usar cada rol y qué función los procesa
var MODULOS = {
  // ── Técnico ──
  mantenimiento:  { rol: 'TECNICO',   fn: function(d){ return registrarMantenimiento(d); },   ref: 'idEquipo' },
  instalacion:    { rol: 'TECNICO',   fn: function(d){ return registrarInstalacion(d); },     ref: 'ticket' },
  incidencia:     { rol: 'TECNICO',   fn: function(d){ return registrarIncidencia(d); },      ref: 'ticket' },
  salida:         { rol: 'TECNICO',   fn: function(d){ return registrarSalida(d); },          ref: 'fragancia' },
  retiro:         { rol: 'TECNICO',   fn: function(d){ return registrarRetiro(d); },          ref: 'ticket' },
  cambio:         { rol: 'TECNICO',   fn: function(d){ return registrarCambioEquipo(d); },    ref: 'ticket' },
  traslado:       { rol: 'TECNICO',   fn: function(d){ return registrarTraslado(d); },        ref: 'ticket' },
  // ── Comercial ──
  c_incidencia:   { rol: 'COMERCIAL', fn: function(d){ return registrarIncidenciaComercial(d); }, ref: 'idEquipo' },
  c_instalacion:  { rol: 'COMERCIAL', fn: function(d){ return registrarSolicitudInstalacion(d); }, ref: 'cliente' },
  c_retiro:       { rol: 'COMERCIAL', fn: function(d){ return registrarSolicitudRetiro(d); },     ref: 'idEquipo' },
  c_cambio:       { rol: 'COMERCIAL', fn: function(d){ return registrarSolicitudCambio(d); },     ref: 'idEquipo' },
  c_traslado:     { rol: 'COMERCIAL', fn: function(d){ return registrarSolicitudTraslado(d); },   ref: 'idEquipo' },
  c_demo_contrato:{ rol: 'COMERCIAL', fn: function(d){ return pasarDemoAContrato(d); },           ref: 'idEquipo' },
  c_demo_retiro:  { rol: 'COMERCIAL', fn: function(d){ return retirarDemo(d); },                  ref: 'idEquipo' },
};

// ============================================================
// ENTRADAS WEB
// ============================================================

function doPost(e) {
  var req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, mensaje: 'Solicitud no válida' });
  }
  try {
    switch (req.accion) {
      case 'login':        return json_(login_(req));
      case 'datos':        return json_(conSesion_(req, datos_));
      case 'registrar':    return json_(conSesion_(req, registrar_));
      case 'misRegistros': return json_(conSesion_(req, misRegistros_));
      case 'ping':         return json_({ ok: true, version: APP.VERSION, hora: new Date().toISOString() });
      default:             return json_({ ok: false, mensaje: 'Acción desconocida' });
    }
  } catch (err) {
    Logger.log('doPost ' + req.accion + ': ' + err.stack);
    return json_({ ok: false, transitorio: true, mensaje: 'Error del servidor: ' + err.message });
  }
}

// GET: página para validar una instalación desde el link del correo
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.accion === 'validar') {
    var t = HtmlService.createTemplate(PAGINA_VALIDAR_);
    t.ticket = String(p.ticket || '');
    t.firma = String(p.f || '');
    t.valida = firmaValida_('validar|' + t.ticket, t.firma);
    return t.evaluate().setTitle('ARDE · Validar ' + t.ticket)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  return ContentService.createTextOutput('ARDE Campo API ' + APP.VERSION + ' · en línea');
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// SESIÓN (PIN → token)
// ============================================================

function login_(req) {
  var pin = String(req.pin || '').trim();
  if (!/^\d{4,6}$/.test(pin)) return { ok: false, mensaje: 'PIN no válido' };

  // Freno a intentos repetidos: por dispositivo y en general
  var cache = CacheService.getScriptCache();
  var claveDisp = 'fallos_' + String(req.dispositivo || 'x').slice(0, 40);
  var fallosDisp = parseInt(cache.get(claveDisp) || '0', 10);
  var fallosTot = parseInt(cache.get('fallos_total') || '0', 10);
  if (fallosDisp >= 6 || fallosTot >= 60) {
    return { ok: false, mensaje: 'Demasiados intentos. Espera 10 minutos e inténtalo de nuevo.' };
  }

  var usuario = buscarUsuarioPorPin_(pin);
  if (!usuario) {
    cache.put(claveDisp, String(fallosDisp + 1), 600);
    cache.put('fallos_total', String(fallosTot + 1), 600);
    return { ok: false, mensaje: 'PIN incorrecto' };
  }
  cache.remove(claveDisp);

  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
  var exp = Date.now() + APP.TOKEN_DIAS * 86400000;
  PropertiesService.getScriptProperties().setProperty('T_' + token, JSON.stringify({ n: usuario.nombre, r: usuario.rol, e: exp }));
  marcarAcceso_(usuario.fila);
  return { ok: true, token: token, usuario: { nombre: usuario.nombre, rol: usuario.rol } };
}

function buscarUsuarioPorPin_(pin) {
  var sh = getSpreadsheet().getSheetByName(APP.SHEET_USUARIOS);
  if (!sh || sh.getLastRow() < 2) return null;
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues();
  for (var i = 0; i < vals.length; i++) {
    var activo = String(vals[i][3]).trim().toUpperCase().replace('Í', 'I');
    if (String(vals[i][2]).trim() === pin && activo === 'SI' && vals[i][0]) {
      return { nombre: String(vals[i][0]).trim(), rol: String(vals[i][1]).trim().toUpperCase(), fila: i + 2 };
    }
  }
  return null;
}

function marcarAcceso_(fila) {
  try {
    getSpreadsheet().getSheetByName(APP.SHEET_USUARIOS).getRange(fila, 5).setValue(new Date());
  } catch (e) { /* no detiene el login */ }
}

// Valida el token y que el usuario siga activo; luego ejecuta la acción
function conSesion_(req, accion) {
  var raw = PropertiesService.getScriptProperties().getProperty('T_' + String(req.token || ''));
  if (!raw) return { ok: false, sesion: false, mensaje: 'Tu sesión venció. Ingresa tu PIN de nuevo.' };
  var s = JSON.parse(raw);
  if (s.e < Date.now() || !usuarioActivo_(s.n)) {
    PropertiesService.getScriptProperties().deleteProperty('T_' + req.token);
    return { ok: false, sesion: false, mensaje: 'Tu sesión venció. Ingresa tu PIN de nuevo.' };
  }
  return accion(req, { nombre: s.n, rol: s.r });
}

// Cache de 5 min para no leer USUARIOS_APP en cada envío
function usuarioActivo_(nombre) {
  var cache = CacheService.getScriptCache();
  var lista = cache.get('usuarios_activos');
  if (!lista) {
    var sh = getSpreadsheet().getSheetByName(APP.SHEET_USUARIOS);
    var vals = sh && sh.getLastRow() >= 2 ? sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues() : [];
    lista = JSON.stringify(vals.filter(function(r){
      return String(r[3]).trim().toUpperCase().replace('Í', 'I') === 'SI';
    }).map(function(r){ return String(r[0]).trim(); }));
    cache.put('usuarios_activos', lista, 300);
  }
  return JSON.parse(lista).indexOf(nombre) !== -1;
}

function puedeUsar_(rolUsuario, rolModulo) {
  return rolUsuario === 'ADMIN' || rolUsuario === rolModulo;
}

// ============================================================
// DATOS PARA LA APP (según el rol)
// ============================================================

function datos_(req, usuario) {
  var out = {
    ok: true,
    version: APP.VERSION,
    usuario: usuario,
    equipos: getEquipos(),          // Activos e inactivos, con tipo de servicio
    fragancias: getFragancias(),
    modelos: getModelos_(),
    hoy: Utilities.formatDate(new Date(), 'America/Lima', 'yyyy-MM-dd'),
  };
  if (puedeUsar_(usuario.rol, 'TECNICO')) {
    out.programados = {
      instalacion: getSolicitudesProgramadas(),
      incidencia:  getIncidenciasProgramadas(),
      retiro:      getRetirosProgramados(),
      cambio:      getCambiosProgramados(),
      traslado:    getTrasladosProgramados(),
    };
  }
  return out;
}

// Catálogo de modelos desde REF_Equipos (B código · C nombre · E tanque ml · K estado)
function getModelos_() {
  var sh = getSpreadsheet().getSheetByName('REF_Equipos');
  if (!sh || sh.getLastRow() < 4) return [];
  var vals = sh.getRange(4, 2, sh.getLastRow() - 3, 10).getValues();
  var out = [];
  vals.forEach(function(r){
    var codigo = String(r[0] || '').trim();
    if (!codigo || codigo.charAt(0) === '*') return;
    out.push({
      codigo: codigo,
      nombre: String(r[1] || codigo),
      tanque: Number(r[3]) || 0,
      legacy: String(r[9] || '').toUpperCase() === 'LEGACY',
    });
  });
  return out;
}

// ============================================================
// REGISTRAR (con GPS, idempotencia y bitácora LOG_APP)
// ============================================================

function registrar_(req, usuario) {
  var mod = MODULOS[req.modulo];
  if (!mod) return { ok: false, mensaje: 'Módulo desconocido' };
  if (!puedeUsar_(usuario.rol, mod.rol)) return { ok: false, mensaje: 'Tu usuario no tiene acceso a este módulo' };

  var id = String(req.id || '').trim();
  if (!/^[a-zA-Z0-9-]{8,64}$/.test(id)) return { ok: false, mensaje: 'Registro sin identificador' };

  // 1) ¿Ya llegó antes? (la app reintenta si se cortó la señal) → no se duplica
  var previo = buscarEnLog_(id);
  if (previo) return { ok: previo.ok, mensaje: previo.mensaje, duplicado: true };

  // 2) ¿Se está procesando ahora mismo en otro intento? → reintentar luego
  var cache = CacheService.getScriptCache();
  if (cache.get('proc_' + id)) return { ok: false, transitorio: true, mensaje: 'Procesando, reintentando...' };
  cache.put('proc_' + id, '1', 300);

  var datos = req.datos || {};
  // El nombre de quien registra sale del PIN, no del formulario
  if (mod.rol === 'TECNICO') datos.tecnico = usuario.nombre;
  else datos.nombreComercial = usuario.nombre;

  // Hora en que se hizo el trabajo (si se registró sin señal y se envía después)
  var capturado = req.capturadoEn ? new Date(req.capturadoEn) : null;
  if (capturado && !isNaN(capturado.getTime()) && capturado.getTime() <= Date.now() + 300000
      && capturado.getTime() > Date.now() - 7 * 86400000) {
    FECHA_CAPTURA_ = capturado;
  }

  var res;
  try {
    res = mod.fn(datos) || { ok: false, mensaje: 'Sin respuesta' };
  } catch (err) {
    cache.remove('proc_' + id);
    throw err;
  }
  // Errores de Google (cuotas, tiempo) vuelven como "Error: ..." → la app reintenta
  if (!res.ok && /^Error/.test(String(res.mensaje || ''))) {
    res.transitorio = true;
    cache.remove('proc_' + id);
    escribirLog_(id, usuario, req, mod, datos, res);
    return res;
  }
  escribirLog_(id, usuario, req, mod, datos, res);
  cache.remove('proc_' + id);
  return res;
}

function hojaLog_() {
  var ss = getSpreadsheet();
  var sh = ss.getSheetByName(APP.SHEET_LOG);
  if (!sh) {
    sh = ss.insertSheet(APP.SHEET_LOG);
    sh.getRange(1, 1, 1, HEADERS_LOG.length).setValues([HEADERS_LOG]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

// Solo cuenta como "ya registrado" si terminó OK o fue rechazado (no los errores transitorios)
function buscarEnLog_(id) {
  var sh = hojaLog_();
  if (sh.getLastRow() < 2) return null;
  var celdas = sh.getRange(2, 2, sh.getLastRow() - 1, 1).createTextFinder(id).matchEntireCell(true).findAll();
  for (var i = celdas.length - 1; i >= 0; i--) {
    var fila = sh.getRange(celdas[i].getRow(), 7, 1, 2).getValues()[0];
    if (fila[0] === 'OK') return { ok: true, mensaje: fila[1] };
    if (fila[0] === 'RECHAZADO') return { ok: false, mensaje: fila[1] };
  }
  return null;
}

function escribirLog_(id, usuario, req, mod, datos, res) {
  var gps = req.gps || {};
  var lat = Number(gps.lat), lng = Number(gps.lng);
  var tieneGps = isFinite(lat) && isFinite(lng) && (lat !== 0 || lng !== 0);
  var ref = res.ticket || datos[mod.ref] || datos.idEquipo || datos.ticket || '';
  hojaLog_().appendRow([
    new Date(),
    id,
    usuario.nombre,
    usuario.rol,
    req.modulo,
    String(ref),
    res.ok ? 'OK' : (res.transitorio ? 'ERROR_TEMPORAL' : 'RECHAZADO'),
    String(res.mensaje || '').slice(0, 500),
    FECHA_CAPTURA_ || '',
    tieneGps ? lat : '',
    tieneGps ? lng : '',
    tieneGps && gps.precision ? Math.round(Number(gps.precision)) : '',
    tieneGps ? 'https://maps.google.com/?q=' + lat + ',' + lng : '',
    String(req.dispositivo || '').slice(0, 60),
  ]);
}

// Últimos 7 días del usuario (para la pantalla "Historial" de la app)
function misRegistros_(req, usuario) {
  var sh = hojaLog_();
  var last = sh.getLastRow();
  if (last < 2) return { ok: true, registros: [] };
  var desde = Math.max(2, last - 1500);
  var vals = sh.getRange(desde, 1, last - desde + 1, 9).getValues();
  var limite = Date.now() - 7 * 86400000;
  var out = [];
  for (var i = vals.length - 1; i >= 0 && out.length < 150; i--) {
    var r = vals[i];
    if (r[2] !== usuario.nombre || r[6] === 'ERROR_TEMPORAL') continue;
    var f = esFecha_(r[8]) ? r[8] : r[0];
    if (!(esFecha_(f)) || f.getTime() < limite) continue;
    out.push({ id: r[1], modulo: r[4], referencia: r[5], ok: r[6] === 'OK', mensaje: r[7], fecha: f.toISOString() });
  }
  return { ok: true, registros: out };
}

// ============================================================
// VALIDAR INSTALACIÓN CON UN CLIC (link firmado del correo)
// ============================================================

function secreto_() {
  var props = PropertiesService.getScriptProperties();
  var s = props.getProperty('SECRETO_FIRMA');
  if (!s) {
    s = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('SECRETO_FIRMA', s);
  }
  return s;
}

function firmar_(texto) {
  var bytes = Utilities.computeHmacSha256Signature(texto, secreto_());
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '').slice(0, 32);
}

function firmaValida_(texto, firma) {
  return !!firma && firmar_(texto) === firma;
}

// Lo usa Comercial.gs en el correo de aviso
function linkValidar_(ticket) {
  try {
    var url = ScriptApp.getService().getUrl();
    return url + '?accion=validar&ticket=' + encodeURIComponent(ticket) + '&f=' + firmar_('validar|' + ticket);
  } catch (e) {
    return '(publica la API para generar el link)';
  }
}

// Lo llama el botón "Confirmar" de la página (un clic real; los antivirus del correo
// que abren links automáticamente no validan nada)
function confirmarValidacion(ticket, firma) {
  if (!firmaValida_('validar|' + ticket, firma)) return { ok: false, mensaje: 'Link no válido.' };
  var sh = getSpreadsheet().getSheetByName('SOLICITUD_INSTALACION');
  if (!sh || sh.getLastRow() < 2) return { ok: false, mensaje: 'No se encontró la hoja.' };
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, 28).getValues();
  var marcadas = 0, yaEstaban = 0;
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]).trim() !== ticket) continue;
    if (String(vals[i][10]).trim().toLowerCase() === 'demo') continue; // las demos no se validan
    if (String(vals[i][27]).trim().toUpperCase().replace('Í', 'I') === 'SI') { yaEstaban++; continue; }
    sh.getRange(i + 2, 28).setValue('SÍ');
    marcadas++;
  }
  if (!marcadas && !yaEstaban) return { ok: false, mensaje: 'No se encontraron filas de ' + ticket + ' para validar.' };
  hojaLog_().appendRow([new Date(), 'VAL-' + ticket + '-' + Date.now(), 'Operaciones (link)', 'ADMIN', 'validar',
    ticket, 'OK', marcadas + ' fila(s) validadas', '', '', '', '', '', 'correo']);
  return {
    ok: true,
    mensaje: marcadas
      ? ticket + ' validado (' + marcadas + ' fila(s)). Ahora prográmalo: técnico, fecha y Estado = PROGRAMADO.'
      : ticket + ' ya estaba validado.',
  };
}

var PAGINA_VALIDAR_ = [
  '<!DOCTYPE html><html><head><base target="_top"><style>',
  'body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#F3F4F6;margin:0;padding:24px;color:#1B1F24}',
  '.c{max-width:420px;margin:40px auto;background:#fff;border-radius:18px;padding:28px;box-shadow:0 8px 30px rgba(0,0,0,.08)}',
  'h1{font-size:20px;margin:0 0 6px}p{color:#4B5563;line-height:1.5}',
  'button{width:100%;padding:14px;border:0;border-radius:12px;background:#1B1F24;color:#fff;font-size:16px;font-weight:600;cursor:pointer}',
  'button:disabled{opacity:.5}.ok{color:#047857;font-weight:600}.err{color:#B91C1C;font-weight:600}',
  '.m{font-size:12px;letter-spacing:.08em;color:#C2410C;font-weight:700}',
  '</style></head><body><div class="c"><div class="m">ARDE · OPERACIONES</div>',
  '<? if (valida) { ?>',
  '<h1>Validar instalación <?= ticket ?></h1>',
  '<p>Confirmas que revisaste el pago, la aprobación de gerencia o que es cliente existente. La instalación quedará lista para programar.</p>',
  '<button id="b" onclick="ir()">Confirmar validación</button><p id="r"></p>',
  '<script>function ir(){var b=document.getElementById("b");b.disabled=true;b.textContent="Validando...";',
  'google.script.run.withSuccessHandler(function(x){document.getElementById("r").className=x.ok?"ok":"err";',
  'document.getElementById("r").textContent=x.mensaje;b.style.display="none";})',
  '.withFailureHandler(function(e){document.getElementById("r").className="err";document.getElementById("r").textContent=e.message;b.disabled=false;b.textContent="Confirmar validación";})',
  '.confirmarValidacion(<?!= JSON.stringify(ticket) ?>,<?!= JSON.stringify(firma) ?>);}</script>',
  '<? } else { ?><h1>Link no válido</h1><p class="err">Este link de validación no es válido o fue modificado.</p><? } ?>',
  '</div></body></html>',
].join('');

// ============================================================
// RESUMEN DIARIO POR CORREO
// ============================================================

function enviarResumenDiario() {
  var ss = getSpreadsheet();
  var tz = 'America/Lima';
  var hoyTxt = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  var esHoy = function(d){ return esFecha_(d) && Utilities.formatDate(d, tz, 'yyyy-MM-dd') === hoyTxt; };

  // 1) Registros del día por persona (LOG_APP)
  var log = hojaLog_();
  var porPersona = {}, rechazos = [], totalOk = 0, sinGps = 0;
  if (log.getLastRow() >= 2) {
    var desde = Math.max(2, log.getLastRow() - 3000);
    log.getRange(desde, 1, log.getLastRow() - desde + 1, 13).getValues().forEach(function(r){
      var f = esFecha_(r[8]) ? r[8] : r[0];
      if (!esHoy(f) || r[4] === 'validar') return;
      if (r[6] === 'OK') {
        totalOk++;
        porPersona[r[2]] = porPersona[r[2]] || {};
        porPersona[r[2]][r[4]] = (porPersona[r[2]][r[4]] || 0) + 1;
        if (!r[9]) sinGps++;
      } else if (r[6] === 'RECHAZADO') {
        rechazos.push(r[2] + ' · ' + r[4] + ' · ' + r[5] + ': ' + r[7]);
      }
    });
  }

  // 2) Instalaciones esperando tu validación
  var sinValidar = [];
  var inst = ss.getSheetByName('SOLICITUD_INSTALACION');
  if (inst && inst.getLastRow() >= 2) {
    var vistos = {};
    inst.getRange(2, 1, inst.getLastRow() - 1, 28).getValues().forEach(function(r){
      var ticket = String(r[0]).trim();
      var tipo = String(r[10]).trim().toLowerCase();
      var estado = String(r[19]).trim().toLowerCase();
      var val = String(r[27]).trim().toUpperCase().replace('Í', 'I');
      if (!ticket || tipo === 'demo' || val === 'SI' || vistos[ticket]) return;
      if (estado === 'instalado' || estado === 'cancelado') return;
      if (!r[21]) return; // solicitudes antiguas, anteriores al lineamiento
      vistos[ticket] = true;
      sinValidar.push({ ticket: ticket, cliente: r[3], condicion: r[21], link: linkValidar_(ticket) });
    });
  }

  // 3) Trabajos programados pendientes
  var pend = {
    'Instalaciones': getSolicitudesProgramadas().length,
    'Incidencias': getIncidenciasProgramadas().length,
    'Retiros': getRetirosProgramados().length,
    'Cambios': getCambiosProgramados().length,
    'Traslados': getTrasladosProgramados().length,
  };

  // 4) Mantenimientos vencidos (PRÓX. MANTENIM. pasada)
  var vencidos = 0;
  var ref = ss.getSheetByName('REF_Clientes');
  if (ref && ref.getLastRow() >= 4) {
    var hoy0 = new Date(); hoy0.setHours(0, 0, 0, 0);
    ref.getRange(4, 2, ref.getLastRow() - 3, 16).getValues().forEach(function(r){
      var estado = String(r[13]).toLowerCase();
      if (!r[0] || estado !== 'activo') return;
      if (esFecha_(r[15]) && r[15] < hoy0) vencidos++;
    });
  }

  var h = [];
  h.push('<div style="font-family:Arial,sans-serif;color:#1B1F24;max-width:640px">');
  h.push('<h2 style="margin:0 0 4px">Resumen del día · ' + Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy') + '</h2>');
  h.push('<p style="color:#6B7280;margin:0 0 16px">ARDE Campo · ' + totalOk + ' registros enviados hoy</p>');

  h.push('<h3>Registros por persona</h3>');
  var personas = Object.keys(porPersona).sort();
  if (!personas.length) h.push('<p>Nadie registró hoy.</p>');
  else {
    h.push('<table cellpadding="6" style="border-collapse:collapse;font-size:14px">');
    personas.forEach(function(p){
      var det = Object.keys(porPersona[p]).map(function(m){ return nombreModulo_(m) + ': ' + porPersona[p][m]; }).join(' · ');
      h.push('<tr><td style="border-bottom:1px solid #eee"><b>' + p + '</b></td><td style="border-bottom:1px solid #eee">' + det + '</td></tr>');
    });
    h.push('</table>');
    if (sinGps) h.push('<p style="color:#B45309">⚠ ' + sinGps + ' registro(s) sin ubicación GPS.</p>');
  }

  h.push('<h3>Instalaciones esperando tu validación (' + sinValidar.length + ')</h3>');
  if (!sinValidar.length) h.push('<p>Ninguna.</p>');
  sinValidar.forEach(function(s){
    h.push('<p>' + s.ticket + ' · ' + s.cliente + ' · ' + s.condicion + ' — <a href="' + s.link + '">Validar</a></p>');
  });

  h.push('<h3>Trabajos programados pendientes</h3><p>');
  h.push(Object.keys(pend).map(function(k){ return k + ': <b>' + pend[k] + '</b>'; }).join(' · '));
  h.push('</p><h3>Mantenimientos vencidos</h3><p><b>' + vencidos + '</b> equipo(s) activos con la fecha de próximo mantenimiento pasada.</p>');

  if (rechazos.length) {
    h.push('<h3 style="color:#B91C1C">Registros rechazados hoy (' + rechazos.length + ')</h3>');
    rechazos.forEach(function(r){ h.push('<p style="font-size:13px">' + r + '</p>'); });
  }
  h.push('<p style="color:#9CA3AF;font-size:12px;margin-top:24px">Detalle completo en la hoja LOG_APP del Sistema de Aromatización.</p></div>');

  MailApp.sendEmail({
    to: APP.RESUMEN_PARA,
    subject: 'ARDE Campo · Resumen ' + Utilities.formatDate(new Date(), tz, 'dd/MM') + ' · ' + totalOk + ' registros · ' + sinValidar.length + ' por validar',
    htmlBody: h.join(''),
    name: 'ARDE Campo',
  });
}

function esFecha_(v) {
  return Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime());
}
 
function nombreModulo_(m) {
  return {
    mantenimiento: 'Mantenimiento', instalacion: 'Instalación', incidencia: 'Incidencia', salida: 'Salida',
    retiro: 'Retiro', cambio: 'Cambio', traslado: 'Traslado', c_incidencia: 'Incidencia (com.)',
    c_instalacion: 'Solicitud instalación', c_retiro: 'Solicitud retiro', c_cambio: 'Solicitud cambio',
    c_traslado: 'Solicitud traslado', c_demo_contrato: 'Demo → contrato', c_demo_retiro: 'Demo retirada',
  }[m] || m;
}

// Borra sesiones vencidas (corre cada noche)
function limpiarSesiones_() {
  var props = PropertiesService.getScriptProperties();
  var todas = props.getProperties();
  Object.keys(todas).forEach(function(k){
    if (k.indexOf('T_') !== 0) return;
    try { if (JSON.parse(todas[k]).e < Date.now()) props.deleteProperty(k); } catch (e) { props.deleteProperty(k); }
  });
}

function tareaNocturna() {
  limpiarSesiones_();
  enviarResumenDiario();
}

// ============================================================
// CONFIGURACIÓN (ejecutar una vez desde el editor)
// ============================================================

function configurarApp() {
  var ss = getSpreadsheet();

  // 1) Hoja de usuarios con PIN al azar (sin repetir)
  var sh = ss.getSheetByName(APP.SHEET_USUARIOS);
  var creada = false;
  if (!sh) {
    sh = ss.insertSheet(APP.SHEET_USUARIOS);
    sh.getRange(1, 1, 1, 5).setValues([['NOMBRE', 'ROL', 'PIN', 'ACTIVO', 'ULTIMO_ACCESO']]).setFontWeight('bold');
    sh.setFrozenRows(1);
    var usados = {};
    var filas = APP.USUARIOS_INICIALES.map(function(u){
      var pin;
      do { pin = String(Math.floor(1000 + Math.random() * 9000)); } while (usados[pin]);
      usados[pin] = true;
      return [u[0], u[1], pin, 'SÍ', ''];
    });
    sh.getRange(2, 3, 200, 1).setNumberFormat('@'); // PIN como texto
    sh.getRange(2, 1, filas.length, 5).setValues(filas);
    var reglaRol = SpreadsheetApp.newDataValidation().requireValueInList(['TECNICO', 'COMERCIAL', 'ADMIN'], true).build();
    var reglaAct = SpreadsheetApp.newDataValidation().requireValueInList(['SÍ', 'NO'], true).build();
    sh.getRange(2, 2, 200, 1).setDataValidation(reglaRol);
    sh.getRange(2, 4, 200, 1).setDataValidation(reglaAct);
    creada = true;
  }
  // Solo el dueño del archivo puede editar USUARIOS_APP
  var prot = sh.protect().setDescription('PIN de ARDE Campo');
  prot.removeEditors(prot.getEditors());
  if (prot.canDomainEdit()) prot.setDomainEdit(false);

  // 2) Bitácora, firma y contadores de tickets (siguen desde el último ticket de cada hoja)
  hojaLog_();
  secreto_();
  var props = PropertiesService.getScriptProperties();
  ['SOP', 'INS', 'RET', 'CAM', 'TRA'].forEach(function(p){
    var enHoja = maxTicketEnHoja_(p);
    var actual = parseInt(props.getProperty('CORRELATIVO_' + p) || '0', 10);
    props.setProperty('CORRELATIVO_' + p, String(Math.max(enHoja, actual)));
  });

  // 3) Tarea nocturna: resumen diario + limpieza de sesiones
  ScriptApp.getProjectTriggers().forEach(function(t){
    if (t.getHandlerFunction() === 'tareaNocturna') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('tareaNocturna').timeBased().everyDays(1).atHour(APP.RESUMEN_HORA)
    .inTimezone('America/Lima').create();

  Logger.log((creada ? 'Hoja USUARIOS_APP creada con PIN al azar. ' : 'USUARIOS_APP ya existía. ')
    + 'LOG_APP lista. Resumen diario programado a las ' + APP.RESUMEN_HORA + ':00.');
}
