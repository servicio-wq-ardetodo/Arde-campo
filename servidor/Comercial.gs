// ============================================================
// ARDE · MÓDULO COMERCIAL de la API de ARDE Campo (antes formulario comercial)
// Incidencias / Solicitud de Instalación / Solicitud de Retiro
// Cambio de Equipo / Traslado de Equipo / Pasar Demo a Contrato
// ============================================================
// NOTA: confirma que este ID sea el del spreadsheet de Registro
// Técnico (donde vive la hoja INCIDENCIAS). Si es otro, cámbialo aquí.
var SPREADSHEET_ID = '1lflbeQUpPy7r3P4odcbmjQA6_n3usO_ZJSmcLrjolqk';
 
var SHEET_INCIDENCIAS   = 'INCIDENCIAS';
var SHEET_INSTALACION   = 'SOLICITUD_INSTALACION';
var SHEET_RETIRO        = 'SOLICITUD_RETIRO';
var SHEET_CAMBIO        = 'SOLICITUD_CAMBIO';
var SHEET_TRASLADO      = 'Solicitud_Traslado';
var SHEET_REF_CLIENTES  = 'REF_Clientes';
var SHEET_REF_FRAGANCIAS = 'REF_Fragancias';
var SHEET_HIST_RETIROS  = 'Historial de Retiros';
 
// Carpeta de Drive donde se guardan fotos de incidencias comerciales.
// Se busca por nombre; si no existe, se crea dentro de "Proyecto Josef" (o en la raíz si no la encuentra).
var FOTO_FOLDER_NAME = 'Fotos_Solicitudes_Comercial';
 
// Encabezados de las hojas nuevas (se crean automáticamente si no existen)
var HEADERS_INSTALACION = ['TICKET','FECHA_HORA','SOLICITANTE','CLIENTE','CONTACTO','TELEFONO','DIRECCION','DISTRITO','INDUSTRIA','MODELO_SOLICITADO','TIPO_SERVICIO','M2','FRAGANCIA_PREFERIDA','PRECIO_ACORDADO','HORARIO_PREFERIDO','OBSERVACIONES','URL_FOTO'];
var HEADERS_RETIRO      = ['TICKET','FECHA_HORA','SOLICITANTE','ID_EQUIPO','CLIENTE','MODELO','DIRECCION','DISTRITO','MOTIVO_RETIRO','OBSERVACIONES'];
// ── Lineamiento de crédito (oct-2026): luz verde para instalar ──
// Correo que recibe el aviso de cada solicitud que necesita validación de Operaciones.
var NOTIFICAR_A       = 'operaciones@ardetodo.com';
var NOTIFICAR_CC      = '';   // ej. correo de gerencia; vacío = sin copia
// Carpeta PRIVADA de Drive para vouchers y capturas de correos de aprobación (no se comparte por link)
var SUSTENTO_FOLDER_NAME = 'Sustentos_Pago_Credito';
var SHEET_CONVERSION  = 'Conversion_Demo';
// Columnas nuevas de SOLICITUD_INSTALACION (V..AB). R..U las sigue llenando Operaciones/técnico.
var HEADERS_LUZ_VERDE = ['CONDICION_PAGO','MONTO_PAGADO','N_OPERACION','FECHA_PAGO_O_CORREO','URL_SUSTENTO','JUSTIFICACION_NO_AUTOGESTION','VALIDADO_OPS'];
var COL_LUZ_VERDE     = 22; // V
var HEADERS_CONVERSION = ['FECHA_HORA','SOLICITANTE','ID_EQUIPO','CLIENTE','TIPO_NUEVO','RENTA_MENSUAL','CONDICION_PAGO','MONTO_PAGADO','N_OPERACION','FECHA_PAGO_O_CORREO','URL_SUSTENTO','JUSTIFICACION_NO_AUTOGESTION','VALIDADO_OPS'];
var HEADERS_TRASLADO    = ['TICKET','FECHA_HORA','SOLICITANTE','ID_EQUIPO','CLIENTE','MODELO','DIRECCION_ACTUAL','DISTRITO_ACTUAL','DIRECCION_NUEVA','DISTRITO_NUEVO','UBICACION_INSTALAR'];
 
// ============================================================
// LECTURA DE DATOS DE REFERENCIA
// ============================================================
 
// Convierte cualquier valor de celda a algo seguro de serializar (fechas, errores de fórmula, etc.)
function safeVal_(v) {
  if (v === null || v === undefined) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    try { return Utilities.formatDate(v, 'America/Lima', 'dd/MM/yyyy'); } catch (e) { return ''; }
  }
  if (typeof v === 'object') return ''; // valores raros (errores de fórmula, etc.) -> vacío
  return v;
}
 
// Devuelve equipos ACTIVOS e INACTIVOS desde REF_Clientes (los RETIRADOS quedan fuera)
function getEquiposComercial_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = ss.getSheetByName(SHEET_REF_CLIENTES);
  if (!sh) return [];
 
  var lastRow = sh.getLastRow();
  if (lastRow < 4) return [];
 
  // Columnas B:V -> B=1 col offset desde A, leemos B4:V(lastRow)
  var range = sh.getRange(4, 2, lastRow - 3, 21); // B..V = 21 columnas
  var values = range.getValues();
 
  var out = [];
  for (var i = 0; i < values.length; i++) {
    try {
      var r = values[i];
      var id = safeVal_(r[0]); // B ID_EQUIPO
      if (!id) continue;
      var estado = String(safeVal_(r[13])).toLowerCase().trim(); // O ESTADO
      if (estado !== 'activo' && estado !== 'inactivo') continue; // solo Activo e Inactivo; Retirado queda fuera
 
      out.push({
        id: id,
        cliente: safeVal_(r[2]),      // D NOMBRE CLIENTE
        direccion: safeVal_(r[3]),    // E DIRECCIÓN
        distrito: safeVal_(r[4]),     // F DISTRITO/CIUDAD
        modelo: safeVal_(r[5]),       // G MODELO
        espacio: safeVal_(r[6]),      // H TIPO ESPACIO
        fragancia: safeVal_(r[8]),    // J FRAGANCIA
        industria: safeVal_(r[11]),   // M INDUSTRIA
        estado: safeVal_(r[13]),      // O ESTADO
        tipoContrato: safeVal_(r[18]),// T TIPO_CONTRATO
        ultVisita: safeVal_(r[20])    // V ÚLT. VISITA EQUIPO
      });
    } catch (eFila) {
      // Si una fila tiene un valor corrupto, se salta esa fila y se sigue con las demás
      continue;
    }
  }
  return out;
}
 
// Devuelve catálogo de fragancias desde REF_Fragancias
function getFraganciasComercial_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = ss.getSheetByName(SHEET_REF_FRAGANCIAS);
  if (!sh) return [];
 
  var lastRow = sh.getLastRow();
  if (lastRow < 4) return [];
 
  var range = sh.getRange(4, 2, lastRow - 3, 9); // B..J = 9 columnas
  var values = range.getValues();
 
  var out = [];
  for (var i = 0; i < values.length; i++) {
    try {
      var r = values[i];
      var nombre = safeVal_(r[0]); // B NOMBRE FRAGANCIA
      if (!nombre) continue;
      var estadoRaw = safeVal_(r[8]) || ''; // J ESTADO (K ahora es TIER OLFATIVO)
      var estado = String(estadoRaw).toUpperCase().indexOf('SIN CONSUMO') !== -1 ? 'SIN_CONSUMO' : 'ACTIVO';
      out.push({ nombre: nombre, estado: estado });
    } catch (eFila) {
      continue;
    }
  }
  return out;
}
 
// ============================================================
// HELPERS
// ============================================================
 
function ensureSheet_(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }
  return sh;
}
 
function nowLima_() {
  return Utilities.formatDate(ahora_(), 'America/Lima', 'dd/MM/yyyy HH:mm');
}
 
// Genera un correlativo único y consecutivo por prefijo (SOP, INS, RET, CAM, TRA), ej. "SOP0001"
// Usa un candado (lock) para que dos envíos simultáneos nunca repitan el mismo número
function siguienteCorrelativo_(prefijo) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var props = PropertiesService.getScriptProperties();
    var key = 'CORRELATIVO_' + prefijo;
    // Si este proyecto aún no tiene el contador (p. ej. la API recién creada),
    // se parte del ticket más alto que ya existe en la hoja, para no repetir números
    if (props.getProperty(key) == null) props.setProperty(key, String(maxTicketEnHoja_(prefijo)));
    var actual = parseInt(props.getProperty(key) || '0', 10);
    var siguiente = actual + 1;
    props.setProperty(key, String(siguiente));
    var numStr = String(siguiente);
    while (numStr.length < 4) numStr = '0' + numStr;
    return prefijo + numStr;
  } finally {
    lock.releaseLock();
  }
}
 
// Número más alto ya usado para un prefijo (SOP0123 → 123) en su hoja
function maxTicketEnHoja_(prefijo) {
  var hojas = { SOP: SHEET_INCIDENCIAS, INS: SHEET_INSTALACION, RET: SHEET_RETIRO, CAM: SHEET_CAMBIO, TRA: SHEET_TRASLADO };
  var sh = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(hojas[prefijo]);
  if (!sh || sh.getLastRow() < 1) return 0;
  var max = 0;
  sh.getRange(1, 1, sh.getLastRow(), 1).getValues().forEach(function(r){
    var m = String(r[0]).trim().toUpperCase().match(new RegExp('^' + prefijo + '(\\d+)$'));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return max;
}
 
// Guarda una foto en base64 en Drive y devuelve la URL pública de vista
function guardarFoto_(base64, mime, nombre) {
  if (!base64) return '';
  try {
    var folder = getOrCreateFotoFolder_();
    var blob = Utilities.newBlob(Utilities.base64Decode(base64), mime, nombre || 'foto.jpg');
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return file.getUrl();
  } catch (e) {
    return '';
  }
}
 
// ============================================================
// LUZ VERDE (pago anticipado o aprobación de gerencia)
// ============================================================
 
// Guarda el voucher / captura en la carpeta privada de sustentos (sin compartir por link)
function guardarSustento_(base64, mime, nombre, ticket) {
  if (!base64) return '';
  var folders = DriveApp.getFoldersByName(SUSTENTO_FOLDER_NAME);
  var folder;
  if (folders.hasNext()) {
    folder = folders.next();
  } else {
    var padres = DriveApp.getFoldersByName('Proyecto Josef');
    folder = padres.hasNext() ? padres.next().createFolder(SUSTENTO_FOLDER_NAME) : DriveApp.getRootFolder().createFolder(SUSTENTO_FOLDER_NAME);
  }
  var stamp = Utilities.formatDate(new Date(), 'America/Lima', 'yyyyMMdd_HHmmss');
  var blob = Utilities.newBlob(Utilities.base64Decode(base64), mime || 'image/jpeg', ticket + '_' + stamp + '_' + (nombre || 'sustento'));
  return folder.createFile(blob).getUrl();
}
 
// Valida la luz verde que manda el formulario. Devuelve '' si está OK o el texto del error.
// soloPago = true → solo acepta pago anticipado con comprobante (Pasar Demo a Contrato)
function validarLuzVerde_(lv, soloPago) {
  if (!lv || !lv.condicion) return 'Falta indicar la condición de pago';
  // Cliente existente: se envía sin sustento (no aplica a Demo → Contrato, que exige pago)
  if (lv.condicion === 'Cliente existente') return soloPago ? 'Para pasar la demo a contrato se necesita el comprobante de pago' : '';
  if (lv.condicion !== 'Pago anticipado' && lv.condicion !== 'Aprobación gerencia') return 'Condición de pago no válida';
  if (soloPago && lv.condicion !== 'Pago anticipado') return 'Para pasar la demo a contrato se necesita el comprobante de pago';
  if (!lv.fecha) return 'Falta la fecha del pago o del correo';
  if (!lv.sustentoBase64) return 'Falta adjuntar el sustento (voucher o captura del correo)';
  if (lv.condicion === 'Pago anticipado') {
    if (!(parseFloat(lv.monto) > 0)) return 'Falta el monto pagado';
    if (!String(lv.operacion || '').trim()) return 'Falta el N° de operación';
  }
  return '';
}
 
// Fecha yyyy-mm-dd → Date
function fechaISO_(s) {
  var p = String(s || '').split('-');
  if (p.length !== 3) return '';
  return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
}
 
// Encabezados V..AB y lista desplegable SÍ / NO en VALIDADO_OPS (solo si faltan)
function asegurarColumnasLuzVerde_(sh) {
  var cab = sh.getRange(1, COL_LUZ_VERDE, 1, HEADERS_LUZ_VERDE.length).getValues()[0];
  var falta = false;
  for (var i = 0; i < cab.length; i++) { if (!cab[i]) { falta = true; break; } }
  if (!falta) return;
  sh.getRange(1, COL_LUZ_VERDE, 1, HEADERS_LUZ_VERDE.length).setValues([HEADERS_LUZ_VERDE]).setFontWeight('bold');
  var colValidado = COL_LUZ_VERDE + HEADERS_LUZ_VERDE.length - 1; // AB
  var regla = SpreadsheetApp.newDataValidation().requireValueInList(['SÍ', 'NO'], true).setAllowInvalid(false).build();
  sh.getRange(2, colValidado, Math.max(sh.getMaxRows() - 1, 1), 1).setDataValidation(regla);
}
 
// Aviso por correo a Operaciones para validar (no detiene el registro si falla)
function notificarLuzVerde_(asunto, lineas) {
  if (!NOTIFICAR_A) return;
  try {
    var opts = { name: 'ARDE · Formulario Comercial' };
    if (NOTIFICAR_CC) opts.cc = NOTIFICAR_CC;
    var url = SpreadsheetApp.openById(SPREADSHEET_ID).getUrl();
    MailApp.sendEmail(NOTIFICAR_A, asunto, lineas.join('\n') + '\n\nSheet: ' + url, opts);
  } catch (e) {
    Logger.log('No se pudo enviar el aviso: ' + e.message);
  }
}
 
function getOrCreateFotoFolder_() {
  var folders = DriveApp.getFoldersByName(FOTO_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  // Intenta crearla dentro de "Proyecto Josef" si existe, si no en la raíz
  var padres = DriveApp.getFoldersByName('Proyecto Josef');
  if (padres.hasNext()) {
    return padres.next().createFolder(FOTO_FOLDER_NAME);
  }
  return DriveApp.getRootFolder().createFolder(FOTO_FOLDER_NAME);
}
 
// ============================================================
// MÓDULO 1 — INCIDENCIAS (comercial) → misma hoja INCIDENCIAS
// Estructura actual (A→V):
// A TICKET · B SOLICITANTE · C FECHA_HORA · D TECNICO ASIGNADO · E ID_EQUIPO ·
// F CLIENTE · G MODELO · H DIRECCION · I DISTRITO · J FRAGANCIA_EQUIPO ·
// K TIPO_INCIDENCIA · L NUEVA_FRAGANCIA · M OTRO_TIPO · N SEVERIDAD ·
// O DESCRIPCION_PROBLEMA · P ACCION_TOMADA · Q ESTADO_CIERRE ·
// R REQUIERE_SEGUIMIENTO · S Fecha Programado · T Fecha Realizado ·
// U OBSERVACIONES · V URL_FOTO
// D y N..V los completa el técnico (Q y S se programan a mano).
// ============================================================
function registrarIncidenciaComercial(data) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sh = ss.getSheetByName(SHEET_INCIDENCIAS);
    if (!sh) return { ok: false, mensaje: 'No se encontró la hoja INCIDENCIAS' };
 
    var urlFoto = '';
    if (data.fotoBase64) {
      urlFoto = guardarFoto_(data.fotoBase64, data.fotoMime, data.fotoNombre);
    }
 
    var ticket = siguienteCorrelativo_('SOP');
 
    var fila = [
      ticket,                     // A TICKET
      data.nombreComercial || '', // B SOLICITANTE
      ahora_(),                   // C FECHA_HORA
      '',                         // D TECNICO ASIGNADO (lo llena el técnico)
      data.idEquipo || '',        // E ID_EQUIPO
      data.cliente || '',         // F CLIENTE
      data.modelo || '',          // G MODELO
      data.direccion || '',       // H DIRECCION
      data.distrito || '',        // I DISTRITO
      data.fraganciaEquipo || '', // J FRAGANCIA_EQUIPO
      data.tipoIncidencia || '',  // K TIPO_INCIDENCIA
      data.nuevaFragancia || '',  // L NUEVA_FRAGANCIA
      data.tipoOtro || '',        // M OTRO_TIPO
      '',                         // N SEVERIDAD
      '',                         // O DESCRIPCION_PROBLEMA
      '',                         // P ACCION_TOMADA
      '',                         // Q ESTADO_CIERRE (se programa a mano)
      '',                         // R REQUIERE_SEGUIMIENTO
      '',                         // S Fecha Programado
      '',                         // T Fecha Realizado
      '',                         // U OBSERVACIONES
      urlFoto                     // V URL_FOTO
    ];
 
    sh.appendRow(fila);
    return { ok: true, mensaje: 'Enviado ' + ticket, ticket: ticket };
  } catch (e) {
    return { ok: false, mensaje: 'Error: ' + e.message };
  }
}
 
// ============================================================
// MÓDULO 2 — SOLICITUD DE INSTALACIÓN → hoja nueva
// ============================================================
function registrarSolicitudInstalacion(data) {
  try {
    var sedes = (data.sedes && data.sedes.length) ? data.sedes : [{ equipos: [{}] }];
 
    // ── Lineamiento de crédito: validación en el servidor (no depende del navegador) ──
    // La validación de pago solo aplica a Contrato y Autogestionado. Demo no la requiere.
    var hayDemo = false, hayContrato = false, totalEquipos = 0, requiereLv = false;
    sedes.forEach(function(s){
      if (s.tipoServicio === 'Demo') hayDemo = true;
      if (s.tipoServicio === 'Contrato') hayContrato = true;
      if (s.tipoServicio === 'Contrato' || s.tipoServicio === 'Autogestionado') requiereLv = true;
      totalEquipos += (s.equipos && s.equipos.length) ? s.equipos.length : 1;
    });
    var lv = requiereLv ? (data.luzVerde || {}) : {};
    if (requiereLv) {
      var errorLv = validarLuzVerde_(lv, false);
      if (errorLv) return { ok: false, mensaje: errorLv };
    }
 
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sh = ensureSheet_(ss, SHEET_INSTALACION, HEADERS_INSTALACION);
    asegurarColumnasLuzVerde_(sh);
 
    var fecha = nowLima_();
    var ticket = siguienteCorrelativo_('INS');
    var urlSustento = requiereLv ? guardarSustento_(lv.sustentoBase64, lv.sustentoMime, lv.sustentoNombre, ticket) : '';
    var totalFilas = 0;
    var montoPuesto = false;
 
    sedes.forEach(function(sede){
      var equipos = (sede.equipos && sede.equipos.length) ? sede.equipos : [{}];
      equipos.forEach(function(eq){
        var urlFoto = '';
        if (eq.fotoBase64) {
          urlFoto = guardarFoto_(eq.fotoBase64, eq.fotoMime, eq.fotoNombre);
        }
        var esDemo = sede.tipoServicio === 'Demo';
        // El monto pagado va solo en la primera fila con pago del ticket (para no sumarlo dos veces)
        var monto = '';
        if (!esDemo && !montoPuesto && lv.condicion === 'Pago anticipado') { monto = parseFloat(lv.monto) || ''; montoPuesto = true; }
        var fila = [
          ticket,                          // A
          fecha,                           // B
          data.nombreComercial || '',      // C
          data.cliente || '',              // D
          data.contacto || '',             // E
          data.telefono || '',             // F
          sede.direccion || '',            // G
          sede.distrito || '',             // H
          data.industria || '',            // I
          eq.modelo || '',                 // J
          sede.tipoServicio || '',         // K
          sede.m2 || '',                   // L
          eq.fragancia || '',              // M
          sede.precioAcordado || '',       // N
          sede.horarioPreferido || '',     // O
          sede.observaciones || '',        // P
          urlFoto,                         // Q
          '', '', '', '',                  // R..U (técnico asignado, fecha programado, estado, ejecutado: Operaciones)
          esDemo ? 'No aplica (Demo)' : lv.condicion,   // V CONDICION_PAGO
          monto,                                         // W MONTO_PAGADO
          esDemo ? '' : (lv.operacion || ''),            // X N_OPERACION
          esDemo ? '' : fechaISO_(lv.fecha),             // Y FECHA_PAGO_O_CORREO
          esDemo ? '' : urlSustento,                     // Z URL_SUSTENTO
          '',                                            // AA JUSTIFICACION (regla retirada; columna se conserva)
          ''                               // AB VALIDADO_OPS (lo marca Operaciones; las demos no lo necesitan)
        ];
        sh.appendRow(fila);
        totalFilas++;
      });
    });
 
    if (requiereLv) notificarLuzVerde_('[Validar] ' + ticket + ' · ' + (data.cliente || '') + ' · ' + lv.condicion, [
      'Nueva solicitud de instalación por validar.',
      '',
      'Ticket: ' + ticket,
      'Cliente: ' + (data.cliente || ''),
      'Asesor: ' + (data.nombreComercial || ''),
      'Equipos: ' + totalFilas + (hayDemo ? ' (incluye Demo: esas filas no requieren validación)' : ''),
      'Condición: ' + lv.condicion + (lv.condicion === 'Pago anticipado' ? ' · S/ ' + lv.monto + ' · Op. ' + lv.operacion : ''),
      'Fecha pago/correo: ' + (lv.fecha || '-'),
      'Sustento: ' + (urlSustento || '- (cliente existente, sin sustento)'),
      '',
      'VALIDAR CON UN CLIC: ' + linkValidar_(ticket),
      '',
      'Después de validar, programa la instalación (técnico, fecha y Estado = PROGRAMADO).'
    ]);
 
    var mensaje = (totalFilas > 1 ? ('Enviado ' + ticket + ' (' + totalFilas + ' equipos)') : ('Enviado ' + ticket)) + (requiereLv ? ' · Pendiente de validación de Operaciones' : '');
    return { ok: true, mensaje: mensaje, ticket: ticket };
  } catch (e) {
    return { ok: false, mensaje: 'Error: ' + e.message };
  }
}
 
// ============================================================
// MÓDULO 3 — SOLICITUD DE RETIRO → hoja nueva
// ============================================================
function registrarSolicitudRetiro(data) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sh = ensureSheet_(ss, SHEET_RETIRO, HEADERS_RETIRO);
 
    var ticket = siguienteCorrelativo_('RET');
 
    var fila = [
      ticket,
      nowLima_(),
      data.nombreComercial || '',
      data.idEquipo || '',
      data.cliente || '',
      data.modelo || '',
      data.direccion || '',
      data.distrito || '',
      data.motivoRetiro || '',
      data.observaciones || ''
    ];
 
    sh.appendRow(fila);
    return { ok: true, mensaje: 'Enviado ' + ticket, ticket: ticket };
  } catch (e) {
    return { ok: false, mensaje: 'Error: ' + e.message };
  }
}
 
// ============================================================
// MÓDULO 4 — CAMBIO DE EQUIPO → hoja SOLICITUD_CAMBIO (ya existente)
// ============================================================
function registrarSolicitudCambio(data) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sh = ss.getSheetByName(SHEET_CAMBIO);
    if (!sh) return { ok: false, mensaje: 'No se encontró la hoja ' + SHEET_CAMBIO };
 
    var ticket = siguienteCorrelativo_('CAM');
 
    var fila = [
      ticket,                     // A TICKET
      nowLima_(),                 // B FECHA_HORA
      data.nombreComercial || '', // C SOLICITANTE (nombre del comercial)
      data.idEquipo || '',        // D ID_EQUIPO
      data.cliente || '',         // E CLIENTE (automático)
      data.modeloActual || '',    // F MODELO ACTUAL (automático, = REF_Clientes col G)
      data.modeloNuevo || '',     // G MODELO NUEVO (catálogo)
      data.direccion || '',       // H DIRECCION (automático)
      data.distrito || '',        // I DISTRITO (automático)
      data.motivo || '',          // J MOTIVO DEL CAMBIO (texto libre)
      '',                         // K en blanco
      '',                         // L en blanco
      '',                         // M en blanco
      '',                         // N en blanco
      ''                          // O en blanco
    ];
 
    sh.appendRow(fila);
    return { ok: true, mensaje: 'Enviado ' + ticket, ticket: ticket };
  } catch (e) {
    return { ok: false, mensaje: 'Error: ' + e.message };
  }
}
 
// ============================================================
// MÓDULO 5 — TRASLADO DE EQUIPO → hoja Solicitud_Traslado (se crea sola)
// ============================================================
function registrarSolicitudTraslado(data) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sh = ensureSheet_(ss, SHEET_TRASLADO, HEADERS_TRASLADO);
 
    var ticket = siguienteCorrelativo_('TRA');
 
    var fila = [
      ticket,                       // A TICKET
      nowLima_(),                   // B FECHA_HORA
      data.nombreComercial || '',   // C SOLICITANTE
      data.idEquipo || '',          // D ID_EQUIPO
      data.cliente || '',           // E CLIENTE (automático)
      data.modelo || '',            // F MODELO (automático)
      data.direccionActual || '',   // G DIRECCION_ACTUAL (automático)
      data.distritoActual || '',    // H DISTRITO_ACTUAL (automático)
      data.direccionNueva || '',    // I DIRECCION_NUEVA
      data.distritoNuevo || '',     // J DISTRITO_NUEVO
      data.ubicacion || ''          // K UBICACION_INSTALAR
    ];
 
    sh.appendRow(fila);
    return { ok: true, mensaje: 'Enviado ' + ticket, ticket: ticket };
  } catch (e) {
    return { ok: false, mensaje: 'Error: ' + e.message };
  }
}

// ============================================================
// MÓDULO 6 — PASAR DEMO A CONTRATO → actualiza REF_Clientes
// Solo escribe dos celdas de la fila del equipo:
//   K PRECIO MENSUAL (S/.)  y  T TIPO_CONTRATO
// ============================================================
var COL_PRECIO_MENSUAL = 11; // K
var COL_TIPO_CONTRATO  = 20; // T
 
function pasarDemoAContrato(data) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var tipoNuevo = String(data.tipoNuevo || '');
    if (tipoNuevo !== 'Contrato' && tipoNuevo !== 'Autogestionado') {
      return { ok: false, mensaje: 'Tipo de servicio no válido' };
    }
    var precio = parseFloat(data.precio);
    if (!(precio > 0)) return { ok: false, mensaje: 'Ingresar un precio mayor a 0' };
    if (!String(data.nombreComercial || '').trim()) return { ok: false, mensaje: 'Falta el asesor comercial' };
    var lv = data.luzVerde || {};
    var errorLv = validarLuzVerde_(lv, true); // Demo → Contrato/Autogestionado: solo con comprobante de pago
    if (errorLv) return { ok: false, mensaje: errorLv };
 
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sh = ss.getSheetByName(SHEET_REF_CLIENTES);
    if (!sh) return { ok: false, mensaje: 'No se encontró la hoja ' + SHEET_REF_CLIENTES };
 
    var lastRow = sh.getLastRow();
    if (lastRow < 4) return { ok: false, mensaje: 'REF_Clientes no tiene equipos' };
 
    // Se busca la fila por ID en el momento de grabar (por si alguien insertó u ordenó filas)
    var ids = sh.getRange(4, 2, lastRow - 3, 1).getValues(); // columna B
    var buscado = String(data.idEquipo || '').trim();
    var fila = -1;
    for (var i = 0; i < ids.length; i++) {
      if (String(safeVal_(ids[i][0])).trim() === buscado) { fila = i + 4; break; }
    }
    if (fila === -1) return { ok: false, mensaje: 'No se encontró el equipo ' + buscado + ' en REF_Clientes' };
 
    var tipoActual = String(safeVal_(sh.getRange(fila, COL_TIPO_CONTRATO).getValue())).trim();
    var t = tipoActual.toLowerCase();
    if (t !== 'demo' && t !== 'prueba') {
      return { ok: false, mensaje: buscado + ' ya figura como "' + (tipoActual || 'sin tipo') + '"' };
    }
 
    var cliente = String(safeVal_(sh.getRange(fila, 4).getValue())).trim(); // D
 
    sh.getRange(fila, COL_PRECIO_MENSUAL).setValue(precio);
    sh.getRange(fila, COL_TIPO_CONTRATO).setValue(tipoNuevo);
 
    // Registro de la conversión con su sustento (hoja Conversion_Demo, se crea sola)
    var urlSustento = guardarSustento_(lv.sustentoBase64, lv.sustentoMime, lv.sustentoNombre, 'CONV_' + buscado);
    var log = ensureSheet_(ss, SHEET_CONVERSION, HEADERS_CONVERSION);
    log.appendRow([
      nowLima_(), data.nombreComercial, buscado, cliente, tipoNuevo, precio,
      lv.condicion, lv.condicion === 'Pago anticipado' ? (parseFloat(lv.monto) || '') : '',
      lv.operacion || '', fechaISO_(lv.fecha), urlSustento,
      '', ''
    ]);
    notificarLuzVerde_('[Validar] Demo → ' + tipoNuevo + ' · ' + buscado + ' · ' + cliente, [
      'Un equipo en demo pasó a ' + tipoNuevo + '.',
      '',
      'Equipo: ' + buscado + ' · ' + cliente,
      'Asesor: ' + data.nombreComercial,
      'Renta mensual: S/ ' + precio,
      'Condición: ' + lv.condicion + (lv.condicion === 'Pago anticipado' ? ' · S/ ' + lv.monto + ' · Op. ' + lv.operacion : ''),
      'Fecha pago/correo: ' + lv.fecha,
      'Sustento: ' + urlSustento,
      '',
      'Revisa y marca VALIDADO_OPS en la hoja ' + SHEET_CONVERSION + '.'
    ]);
 
    return {
      ok: true,
      ticket: buscado,
      mensaje: 'Enviado ' + buscado + ' Ahora es ' + tipoNuevo + ' · S/ ' + precio + ' al mes'
    };
  } catch (e) {
    return { ok: false, mensaje: 'Error: ' + e.message };
  } finally {
    lock.releaseLock();
  }
}

// ============================================================
// MÓDULO 6 (opción "Ya se retiró = SÍ") — mueve el equipo demo
// de REF_Clientes a "Historial de Retiros"
//   1. Copia la fila completa B..AF como valores fijos (incluye W..AA, datos de instalación)
//   2. ID con prefijo RET- · ESTADO = Retirado · FECHA DE RETIRO (U y AB) = la indicada
//   3. AD MOTIVO_RETIRO = "Demo no convertida" · AE = "Registrado por formulario comercial"
//   4. Agrega la fila al final de Historial de Retiros y recién después la borra de REF_Clientes
//   (Misma estructura que usa el módulo Retiro del formulario técnico.)
// ============================================================
var COL_ESTADO        = 15; // O
var COL_FECHA_RETIRO  = 21; // U
 
function retirarDemo(data) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sh = ss.getSheetByName(SHEET_REF_CLIENTES);
    var hist = ss.getSheetByName(SHEET_HIST_RETIROS);
    if (!sh) return { ok: false, mensaje: 'No se encontró la hoja ' + SHEET_REF_CLIENTES };
    if (!hist) return { ok: false, mensaje: 'No se encontró la hoja ' + SHEET_HIST_RETIROS };
 
    // Fecha de retiro (llega como yyyy-mm-dd desde el formulario)
    var p = String(data.fechaRetiro || '').split('-');
    if (p.length !== 3) return { ok: false, mensaje: 'Fecha de retiro no válida' };
    var fechaRetiro = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
 
    var lastRow = sh.getLastRow();
    if (lastRow < 4) return { ok: false, mensaje: 'REF_Clientes no tiene equipos' };
 
    var ids = sh.getRange(4, 2, lastRow - 3, 1).getValues(); // columna B
    var buscado = String(data.idEquipo || '').trim();
    var fila = -1;
    for (var i = 0; i < ids.length; i++) {
      if (String(safeVal_(ids[i][0])).trim() === buscado) { fila = i + 4; break; }
    }
    if (fila === -1) return { ok: false, mensaje: 'No se encontró el equipo ' + buscado + ' en REF_Clientes' };
 
    var tipoActual = String(safeVal_(sh.getRange(fila, COL_TIPO_CONTRATO).getValue())).trim();
    var t = tipoActual.toLowerCase();
    if (t !== 'demo' && t !== 'prueba') {
      return { ok: false, mensaje: buscado + ' ya figura como "' + (tipoActual || 'sin tipo') + '"' };
    }
 
    // B..AF como valores fijos (las fórmulas quedan con su último resultado)
    var valores = sh.getRange(fila, 2, 1, 31).getValues()[0];
    valores[0]  = 'RET-' + buscado;   // B ID_EQUIPO con prefijo RET-
    valores[COL_ESTADO - 2]       = 'Retirado'; // O ESTADO
    valores[COL_FECHA_RETIRO - 2] = fechaRetiro; // U FECHA DE RETIRO
    valores[28 - 2] = fechaRetiro;                              // AB FECHA_RETIRO
    valores[30 - 2] = 'Demo no convertida';                     // AD MOTIVO_RETIRO
    valores[31 - 2] = 'Registrado por formulario comercial';    // AE OBSERVACIONES_RETIRO
 
    // Primera fila libre de Historial de Retiros según la columna B
    var histLast = hist.getLastRow();
    var destino = 4;
    if (histLast >= 4) {
      var colB = hist.getRange(4, 2, histLast - 3, 1).getValues();
      for (var j = colB.length - 1; j >= 0; j--) {
        if (colB[j][0] !== '' && colB[j][0] !== null) { destino = j + 5; break; }
      }
    }
    hist.getRange(destino, 2, 1, valores.length).setValues([valores]);
    SpreadsheetApp.flush();
 
    // Recién con la copia hecha se borra la fila de REF_Clientes
    sh.deleteRow(fila);
 
    return {
      ok: true,
      ticket: buscado,
      mensaje: 'Enviado ' + buscado + ' Movido a Historial de Retiros como RET-' + buscado
    };
  } catch (e) {
    return { ok: false, mensaje: 'Error: ' + e.message };
  } finally {
    lock.releaseLock();
  }
}
