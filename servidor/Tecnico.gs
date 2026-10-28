// ============================================================
// ARDE · Sistema de Registro Técnico
// Módulo técnico de la API de ARDE Campo — v4.0 (oct-2026)
// (Antes era el formulario técnico; el doGet ahora vive en Api.gs)
// Módulos: Mantenimiento · Instalación · Incidencias · Salida de almacén
//          Retiro · Cambio · Traslado
// Sheet: SISTEMA_AROMATIZACION_ACTUALIZADO (4)
// ============================================================
 
// ── CONFIGURACIÓN GLOBAL ─────────────────────────────────────
const CONFIG = {
  SPREADSHEET_ID: '1lflbeQUpPy7r3P4odcbmjQA6_n3usO_ZJSmcLrjolqk',
  PHOTOS_FOLDER_NAME: 'Fotos_Registro_Tecnico',
 
  // Nombres exactos de las hojas en el Google Sheet
  SHEETS: {
    REF_CLIENTES:   'REF_Clientes',
    REF_FRAGANCIAS: 'REF_Fragancias',
    REGISTRO_CAMPO: 'REGISTRO_Campo',
    INCIDENCIAS:    'INCIDENCIAS',
    INSTALACION:    'SOLICITUD_INSTALACION',
    RETIRO:         'SOLICITUD_RETIRO',
    CAMBIO:         'SOLICITUD_CAMBIO',
    TRASLADO:       'Solicitud_Traslado',
    HIST_RETIROS:   'Historial de Retiros',
    SALIDA:         'SALIDA_Almacen',
  },
};
 
// ── Columnas de REF_Clientes (encabezados fila 3, datos desde fila 4) ──
// B ID_EQUIPO · C ID_CLIENTE · D NOMBRE CLIENTE · E DIRECCIÓN · F DISTRITO/CIUDAD ·
// G MODELO · H TIPO ESPACIO · I M² · J FRAGANCIA · K PRECIO MENSUAL · L DESCUENTO % ·
// M INDUSTRIA · N CONSUMO PROY. · O ESTADO · P ÚLT. MANTENIM. (fórmula) ·
// Q PRÓX. MANTENIM. · R DISTRITO_NORM · S CONSUMO TEÓRICO · T TIPO_CONTRATO ·
// U FECHA DE RETIRO · V ÚLT. VISITA REGISTRADA (fórmula) ·
// W TIMESTAMP_INSTALACION · X TECNICO · Y URL_FOTO_EQUIPO · Z URL_FOTO_FRASCO ·
// AA OBSERVACIONES_INSTALACION · AB..AF detalle de retiro (solo en Historial)
var RC = {
  ID: 2, CLIENTE: 4, DIRECCION: 5, DISTRITO: 6, MODELO: 7, FRAGANCIA: 10,
  PRECIO: 11, ESTADO: 15, ULT_MANT: 16, PROX_MANT: 17, DIST_NORM: 18,
  TIPO_CONTRATO: 20, FECHA_RETIRO: 21, ULT_VISITA: 22,
  PRIMERA_COL: 2, ULTIMA_COL: 32, // B..AF
  FILA_DATOS: 4,
};
 
// ============================================================
// UTILIDADES GENERALES
// ============================================================
 
function getSpreadsheet() {
  return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
}
 
/**
 * Obtiene (o crea) una hoja por nombre dentro del Spreadsheet.
 */
function getOrCreateSheet(ss, sheetName) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    Logger.log('Hoja creada: ' + sheetName);
  }
  return sheet;
}
 
/**
 * Obtiene (o crea) la carpeta de fotos dentro de Proyecto Josef.
 */
function getPhotosFolder() {
  const parentFolders = DriveApp.getFoldersByName('Proyecto Josef');
  if (!parentFolders.hasNext()) {
    throw new Error('No se encontró la carpeta "Proyecto Josef" en Drive.');
  }
  const parentFolder = parentFolders.next();
  const subFolders = parentFolder.getFoldersByName(CONFIG.PHOTOS_FOLDER_NAME);
  if (subFolders.hasNext()) {
    return subFolders.next();
  }
  const newFolder = parentFolder.createFolder(CONFIG.PHOTOS_FOLDER_NAME);
  Logger.log('Carpeta de fotos creada: ' + CONFIG.PHOTOS_FOLDER_NAME);
  return newFolder;
}
 
/**
 * Guarda un archivo base64 en Drive y devuelve la URL pública.
 */
function savePhotoToDrive(base64Data, mimeType, fileName) {
  try {
    const folder = getPhotosFolder();
    const decoded = Utilities.base64Decode(base64Data);
    const blob = Utilities.newBlob(decoded, mimeType, fileName);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return file.getUrl();
  } catch (e) {
    Logger.log('Error guardando foto: ' + e.toString());
    return 'Error al guardar foto';
  }
}
 
/**
 * Formatea fecha/hora actual en Lima (UTC-5).
 */
function getNowLima() {
  return Utilities.formatDate(ahora_(), 'America/Lima', 'dd/MM/yyyy HH:mm:ss');
}
 
function sello_() {
  return Utilities.formatDate(ahora_(), 'America/Lima', 'yyyyMMdd_HHmmss');
}
 
/**
 * Busca la fila de un ID_EQUIPO en REF_Clientes (columna B). Devuelve -1 si no está.
 */
function filaEquipoEnRef_(sheet, idEquipo) {
  var lastRow = sheet.getLastRow();
  if (lastRow < RC.FILA_DATOS) return -1;
  var ids = sheet.getRange(RC.FILA_DATOS, RC.ID, lastRow - RC.FILA_DATOS + 1, 1).getValues();
  var buscado = String(idEquipo || '').trim();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === buscado) return i + RC.FILA_DATOS;
  }
  return -1;
}
 
/**
 * Primera fila libre de una hoja según una columna (ignora filas vacías al final
 * que tengan solo formato o validaciones).
 */
function primeraFilaLibre_(sheet, columna, filaInicio) {
  var lastRow = sheet.getLastRow();
  if (lastRow < filaInicio) return filaInicio;
  var vals = sheet.getRange(filaInicio, columna, lastRow - filaInicio + 1, 1).getValues();
  for (var i = vals.length - 1; i >= 0; i--) {
    if (vals[i][0] !== '' && vals[i][0] !== null) return filaInicio + i + 1;
  }
  return filaInicio;
}
 
/**
 * Localiza la fila de una solicitud al momento de grabar. Las hojas se ordenan
 * y filtran a mano, así que el número de fila que se cargó en el formulario
 * puede haber cambiado: se confirma por TICKET + un dato clave, y si no coincide
 * se busca en toda la hoja.
 * @param colTicket   columna (1-based) del ticket
 * @param colClave    columna (1-based) del dato clave (ID_EQUIPO o CLIENTE)
 * @param colEstado   columna (1-based) del estado que debe decir "programado"
 */
function ubicarSolicitud_(sheet, filaSugerida, ticket, colTicket, clave, colClave, colEstado) {
  var lastRow = sheet.getLastRow();
  var ancho = Math.max(colTicket, colClave, colEstado);
  function coincide(fila) {
    if (fila < 2 || fila > lastRow) return false;
    var r = sheet.getRange(fila, 1, 1, ancho).getValues()[0];
    return String(r[colTicket - 1]).trim() === String(ticket).trim()
        && String(r[colClave - 1]).trim() === String(clave).trim()
        && String(r[colEstado - 1]).trim().toLowerCase() === 'programado';
  }
  if (coincide(Number(filaSugerida))) return Number(filaSugerida);
  if (lastRow < 2) return -1;
  var datos = sheet.getRange(2, 1, lastRow - 1, ancho).getValues();
  for (var i = 0; i < datos.length; i++) {
    var r = datos[i];
    if (String(r[colTicket - 1]).trim() === String(ticket).trim()
        && String(r[colClave - 1]).trim() === String(clave).trim()
        && String(r[colEstado - 1]).trim().toLowerCase() === 'programado') {
      return i + 2;
    }
  }
  return -1;
}
 
/**
 * Escribe un encabezado en la fila 1 solo si la celda está vacía.
 */
function asegurarEncabezado_(sheet, columna, texto) {
  var celda = sheet.getRange(1, columna);
  if (!celda.getValue()) celda.setValue(texto).setFontWeight('bold');
}
 
/**
 * DISTRITO_NORM (columna R): parte antes de la coma, en mayúsculas y sin tildes
 * (se conserva la Ñ), con los alias que ya se usan en la hoja.
 */
function normalizarDistrito_(distrito) {
  var s = String(distrito || '').replace(/\u00a0/g, ' ').split(',')[0].trim().toUpperCase();
  if (!s || s === 'OTRO') return '';
  s = s.replace(/[ÁÀÄ]/g, 'A').replace(/[ÉÈË]/g, 'E').replace(/[ÍÌÏ]/g, 'I')
       .replace(/[ÓÒÖ]/g, 'O').replace(/[ÚÙÜ]/g, 'U');
  var alias = {
    'S.J.L.': 'SAN JUAN DE LURIGANCHO', 'SJL': 'SAN JUAN DE LURIGANCHO',
    'S.J.M.': 'SAN JUAN DE MIRAFLORES', 'SJM': 'SAN JUAN DE MIRAFLORES',
    'VES': 'VILLA EL SALVADOR',
    'CERCADO': 'CERCADO DE LIMA', 'CECADO': 'CERCADO DE LIMA',
  };
  return alias[s] || s;
}
 
/**
 * Fórmula de ÚLT. MANTENIM. (P) y ÚLT. VISITA REGISTRADA (V) para una fila de
 * REF_Clientes. Lee la última FECHA VISITA de REGISTRO_Campo para ese ID.
 * Rango abierto (B7:B / D7:D) para que no se corte al pasar la fila 2000.
 */
function formulaUltimaVisita_(fila) {
  var b = '$B' + fila;
  var mx = 'MAXIFS(REGISTRO_Campo!$B$7:$B,REGISTRO_Campo!$D$7:$D,' + b + ')';
  return '=IF(' + b + '="","",IF(' + mx + '=0,"",INT(' + mx + ')))';
}
 
/**
 * Mueve un equipo de REF_Clientes a "Historial de Retiros":
 *  1. Copia la fila completa B..AF como valores fijos.
 *  2. ID con prefijo RET- · ESTADO = Retirado · FECHA DE RETIRO = fechaRetiro.
 *  3. Completa el detalle del retiro en AB..AF (fecha, técnico, motivo, obs., foto).
 *  4. Pega la fila al final del historial y recién entonces la borra de REF_Clientes.
 * Devuelve true si movió el equipo, false si no lo encontró en REF_Clientes.
 * (Misma lógica que retirarDemo del formulario comercial.)
 */
function moverEquipoAHistorial_(ss, idEquipo, fechaRetiro, detalle) {
  var ref = ss.getSheetByName(CONFIG.SHEETS.REF_CLIENTES);
  var hist = ss.getSheetByName(CONFIG.SHEETS.HIST_RETIROS);
  if (!ref) throw new Error('No se encontró la hoja ' + CONFIG.SHEETS.REF_CLIENTES);
  if (!hist) throw new Error('No se encontró la hoja ' + CONFIG.SHEETS.HIST_RETIROS);
 
  var fila = filaEquipoEnRef_(ref, idEquipo);
  if (fila === -1) return false;
 
  var ancho = RC.ULTIMA_COL - RC.PRIMERA_COL + 1; // 31 columnas: B..AF
  var v = ref.getRange(fila, RC.PRIMERA_COL, 1, ancho).getValues()[0];
  var c = function(col) { return col - RC.PRIMERA_COL; }; // columna de hoja → índice del arreglo
 
  v[c(RC.ID)]           = 'RET-' + String(idEquipo).trim();
  v[c(RC.ESTADO)]       = 'Retirado';
  v[c(RC.FECHA_RETIRO)] = fechaRetiro;
  v[c(28)] = fechaRetiro;                       // AB FECHA_RETIRO
  v[c(29)] = detalle.tecnico || '';             // AC TECNICO_RETIRO
  v[c(30)] = detalle.motivo || '';              // AD MOTIVO_RETIRO
  v[c(31)] = detalle.observaciones || '';       // AE OBSERVACIONES_RETIRO
  v[c(32)] = detalle.urlFoto || '';             // AF URL_FOTO_RETIRO
 
  var destino = primeraFilaLibre_(hist, RC.ID, RC.FILA_DATOS);
  hist.getRange(destino, RC.PRIMERA_COL, 1, ancho).setValues([v]);
  SpreadsheetApp.flush();
 
  ref.deleteRow(fila);
  return true;
}
 
// ============================================================
// MÓDULO 1 — MANTENIMIENTO
// Escribe en hoja: REGISTRO_Campo
// ============================================================
 
/**
 * Registra una visita en REGISTRO_Campo y aplica en REF_Clientes los cambios
 * propios de un mantenimiento (fragancia nueva y PRÓX. MANTENIM.).
 * La usan tres módulos: Mantenimiento, Instalación e Incidencias (cuando la
 * visita también cuenta como mantenimiento).
 * Orden de columnas de REGISTRO_Campo (A..Q):
 * TIMESTAMP | FECHA_VISITA | TECNICO | ID_EQUIPO | CLIENTE | MODELO |
 * TIPO_ESPACIO | DISTRITO | NIVEL_LLEGADA | RECARGA | NIVEL_SALIDA |
 * DIAS_DESDE_ULT_VISITA | FRAGANCIA | CAMBIO_FRAGANCIA | NUEVA_FRAGANCIA |
 * OBSERVACIONES | URL_FOTO
 */
function registrarVisitaCampo_(ss, data, urlFoto) {
  var sheet = ss.getSheetByName(CONFIG.SHEETS.REGISTRO_CAMPO);
  if (!sheet) throw new Error('No se encontró la hoja: ' + CONFIG.SHEETS.REGISTRO_CAMPO);
 
  var llegada = Number(data.nivelLlegada) || 0;
  var recarga = Number(data.recarga) || 0;
  var fila = [
    new Date(),
    getNowLima(),
    data.tecnico       || '',
    data.idEquipo      || '',
    data.cliente       || '',
    data.modelo        || '',
    data.tipoEspacio   || '',
    data.distrito      || '',
    llegada,
    recarga,
    llegada + recarga,                    // NIVEL_SALIDA = llegada + recarga
    Number(data.diasUltVisita) || 0,
    data.fragancia     || '',
    data.cambioFragancia || 'No',         // 'Sí' o 'No'
    data.nuevaFragancia || '',            // solo si cambioFragancia = 'Sí'
    data.observaciones || '',
    urlFoto || '',
  ];
  sheet.appendRow(fila);
 
  if (data.cambioFragancia === 'Sí' && data.nuevaFragancia && data.idEquipo) {
    actualizarFraganciaEnRefClientes(ss, data.idEquipo, data.nuevaFragancia);
  }
  actualizarProximoMantenimiento(ss, data.idEquipo);
}
 
/**
 * Llamado desde el cliente (HTML) al enviar el formulario de mantenimiento.
 */
function registrarMantenimiento(data) {
  try {
    var ss = getSpreadsheet();
    var urlFoto = '';
    if (data.fotoBase64 && data.fotoMime && data.fotoNombre) {
      urlFoto = savePhotoToDrive(data.fotoBase64, data.fotoMime, 'MANT_' + data.idEquipo + '_' + sello_() + '_' + data.fotoNombre);
    }
    registrarVisitaCampo_(ss, data, urlFoto);
    return { ok: true, mensaje: 'Mantenimiento registrado correctamente.' };
  } catch (e) {
    Logger.log('Error en registrarMantenimiento: ' + e.toString());
    return { ok: false, mensaje: 'Error: ' + e.toString() };
  }
}
 
/**
 * Actualiza PRÓX. MANTENIM. (Q) = hoy + 30 días.
 * ÚLT. MANTENIM. (P) y ÚLT. VISITA (V) NO se escriben: son fórmulas que leen
 * REGISTRO_Campo y se actualizan solas con la fila que se acaba de agregar.
 */
function actualizarProximoMantenimiento(ss, idEquipo) {
  var sheet = ss.getSheetByName(CONFIG.SHEETS.REF_CLIENTES);
  if (!sheet) return;
  var fila = filaEquipoEnRef_(sheet, idEquipo);
  if (fila === -1) return;
  var proxima = ahora_();
  proxima.setDate(proxima.getDate() + 30);
  sheet.getRange(fila, RC.PROX_MANT).setValue(proxima);
}
 
/**
 * Actualiza la fragancia (columna J) en REF_Clientes cuando hay cambio.
 */
function actualizarFraganciaEnRefClientes(ss, idEquipo, nuevaFragancia) {
  var sheet = ss.getSheetByName(CONFIG.SHEETS.REF_CLIENTES);
  if (!sheet) return;
  var fila = filaEquipoEnRef_(sheet, idEquipo);
  if (fila === -1) return;
  sheet.getRange(fila, RC.FRAGANCIA).setValue(nuevaFragancia);
}
 
// ============================================================
// MÓDULO 2 — INSTALACIÓN
// Lee SOLICITUD_INSTALACION y escribe fila nueva en REF_Clientes
// ============================================================
 
/**
 * Solicitudes de instalación con Estado (T) = "Programado".
 * A Ticket · B FECHA_HORA · C SOLICITANTE · D CLIENTE · E Contacto · F TELEFONO ·
 * G DIRECCION · H DISTRITO · I INDUSTRIA · J MODELO_SOLICITADO · K TIPO_SERVICIO ·
 * L M2 · M FRAGANCIA_PREFERIDA · N PRECIO_ACORDADO · O HORARIO · P OBSERVACIONES ·
 * Q Fotos · R TÉCNICO ASIGNADO · S Fecha Programado · T Estado · U FECHA_HORA EJECUTADO
 */
function getSolicitudesProgramadas() {
  try {
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName(CONFIG.SHEETS.INSTALACION);
    if (!sheet) return [];
 
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];
 
    var values = sheet.getRange(2, 1, lastRow - 1, 28).getValues(); // A..AB
    var out = [];
 
    for (var i = 0; i < values.length; i++) {
      var r = values[i];
      var estado = String(r[19] || '').trim().toLowerCase(); // T = Estado
      if (estado !== 'programado') continue;
      // Lineamiento de crédito: Contrato y Autogestionado solo se muestran si Operaciones
      // validó el pago o el correo de gerencia. Las demos no requieren validación.
      var tipoServ = String(r[10] || '').trim().toLowerCase(); // K = TIPO_SERVICIO
      var validado = String(r[27] || '').trim().toUpperCase().replace('Í', 'I'); // AB = VALIDADO_OPS
      if (tipoServ !== 'demo' && validado !== 'SI') continue;
 
      out.push({
        fila:         i + 2,
        ticket:       String(r[0]  || ''),   // A
        cliente:      String(r[3]  || ''),   // D
        contacto:     String(r[4]  || ''),   // E
        telefono:     String(r[5]  || ''),   // F
        direccion:    String(r[6]  || ''),   // G
        distrito:     String(r[7]  || ''),   // H
        industria:    String(r[8]  || ''),   // I
        modelo:       String(r[9]  || ''),   // J
        tipoServicio: String(r[10] || ''),   // K
        m2:           r[11] || '',           // L
        fragancia:    String(r[12] || ''),   // M
        precio:       r[13] || '',           // N PRECIO_ACORDADO
      });
    }
 
    Logger.log('getSolicitudesProgramadas devuelve: ' + out.length);
    return out;
 
  } catch (e) {
    Logger.log('Error en getSolicitudesProgramadas: ' + e.toString());
    return [];
  }
}
 
/**
 * Marca una fila de SOLICITUD_INSTALACION como ejecutada:
 * R técnico · T Estado = "Instalado" · U FECHA_HORA EJECUTADO.
 */
function marcarSolicitudInstalacionEjecutada(ss, data) {
  var sheet = ss.getSheetByName(CONFIG.SHEETS.INSTALACION);
  if (!sheet || !data.filaProgramada) return false;
  // Se confirma por TICKET (A) + CLIENTE (D) + Estado (T) = Programado
  var fila = ubicarSolicitud_(sheet, data.filaProgramada, data.ticket, 1, data.cliente, 4, 20);
  if (fila === -1) return false;
  sheet.getRange(fila, 18).setValue(data.tecnico || '');   // R TÉCNICO ASIGNADO
  sheet.getRange(fila, 20).setValue('Instalado');          // T Estado
  sheet.getRange(fila, 21).setValue(getNowLima());         // U FECHA_HORA EJECUTADO
  return true;
}
 
/**
 * Llamado desde el cliente (HTML) al enviar el formulario de instalación.
 */
function registrarInstalacion(data) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEETS.REF_CLIENTES);
    if (!sheet) throw new Error('No se encontró la hoja: ' + CONFIG.SHEETS.REF_CLIENTES);
 
    // ID_EQUIPO con formato EQP-XXX
    const numPadded = String(parseInt(data.idEquipoNum, 10)).padStart(3, '0');
    const idEquipo = 'EQP-' + numPadded;
 
    // No permitir un ID que ya existe en REF_Clientes
    if (filaEquipoEnRef_(sheet, idEquipo) !== -1) {
      return { ok: false, mensaje: idEquipo + ' ya existe en REF_Clientes. Revisa el número del equipo.' };
    }
 
    let urlFotoEquipo = '';
    let urlFotoFrasco = '';
    if (data.fotoEquipoBase64 && data.fotoEquipoMime) {
      urlFotoEquipo = savePhotoToDrive(data.fotoEquipoBase64, data.fotoEquipoMime, 'INST_EQ_' + idEquipo + '_' + sello_() + '.jpg');
    }
    if (data.fotoFrascoBase64 && data.fotoFrascoMime) {
      urlFotoFrasco = savePhotoToDrive(data.fotoFrascoBase64, data.fotoFrascoMime, 'INST_FRAC_' + idEquipo + '_' + sello_() + '.jpg');
    }
 
    const modeloFinal = data.modelo === 'otro' ? (data.modeloOtro || 'OTRO') : (data.modelo || '');
    const precio = Number(data.precioAcordado) || '';
    const nuevaFila = primeraFilaLibre_(sheet, RC.ID, RC.FILA_DATOS);
 
    const fila = [
      idEquipo,                                   // B  ID_EQUIPO
      '',                                         // C  ID_CLIENTE — se llena manual
      data.cliente       || '',                   // D
      data.direccion     || '',                   // E
      data.distrito      || '',                   // F
      modeloFinal,                                // G
      data.tipoEspacio   || '',                   // H
      Number(data.m2)    || '',                   // I
      data.fragancia     || '',                   // J
      precio,                                     // K  PRECIO MENSUAL (viene de la solicitud)
      '',                                         // L  DESCUENTO % — se llena manual
      data.industria     || '',                   // M
      Number(data.fraganciaAplicadaMl) || '',     // N  CONSUMO PROY. / fragancia aplicada
      'Activo',                                   // O  ESTADO
      formulaUltimaVisita_(nuevaFila),            // P  ÚLT. MANTENIM. (fórmula)
      '',                                         // Q  PRÓX. MANTENIM.
      normalizarDistrito_(data.distrito),         // R  DISTRITO_NORM
      '',                                         // S  CONSUMO TEÓRICO
      data.tipoServicio  || '',                   // T  TIPO_CONTRATO (Contrato / Demo / Autogestionado)
      '',                                         // U  FECHA DE RETIRO
      formulaUltimaVisita_(nuevaFila),            // V  ÚLT. VISITA REGISTRADA (fórmula)
      getNowLima(),                               // W  TIMESTAMP_INSTALACION
      data.tecnico       || '',                   // X  TECNICO
      urlFotoEquipo,                              // Y  URL_FOTO_EQUIPO
      urlFotoFrasco,                              // Z  URL_FOTO_FRASCO
      data.observaciones || '',                   // AA OBSERVACIONES_INSTALACION
    ];
 
    sheet.getRange(nuevaFila, RC.PRIMERA_COL, 1, fila.length).setValues([fila]);
 
    // La instalación también queda como primera visita en REGISTRO_Campo
    // (nivel al llegar 0, recarga = fragancia aplicada). Así las fórmulas de
    // ÚLT. MANTENIM. / ÚLT. VISITA toman la fecha de instalación y se calcula
    // PRÓX. MANTENIM. (+30 días).
    var avisoCampo = '';
    try {
      registrarVisitaCampo_(ss, {
        tecnico: data.tecnico, idEquipo: idEquipo, cliente: data.cliente, modelo: modeloFinal,
        tipoEspacio: data.tipoEspacio, distrito: data.distrito,
        nivelLlegada: 0, recarga: Number(data.fraganciaAplicadaMl) || 0, diasUltVisita: 0,
        fragancia: data.fragancia, cambioFragancia: 'No', nuevaFragancia: '',
        observaciones: 'Instalación' + (data.observaciones ? ' · ' + data.observaciones : ''),
      }, urlFotoEquipo);
    } catch (eCampo) {
      avisoCampo = ' Ojo: no se pudo registrar la visita en REGISTRO_Campo (' + eCampo.message + ').';
    }
 
    var avisoSolicitud = '';
    if (data.filaProgramada) {
      if (!marcarSolicitudInstalacionEjecutada(ss, data)) {
        avisoSolicitud = ' Ojo: no se encontró la solicitud programada para marcarla como Instalado.';
      }
    }
 
    var avisoPrecio = precio ? '' : ' Completa Precio Mensual y Descuento en REF_Clientes.';
    return { ok: true, mensaje: 'Instalación registrada. ID: ' + idEquipo + '.' + avisoPrecio + avisoSolicitud + avisoCampo };
 
  } catch (e) {
    Logger.log('Error en registrarInstalacion: ' + e.toString());
    return { ok: false, mensaje: 'Error: ' + e.toString() };
  } finally {
    lock.releaseLock();
  }
}
 
// ============================================================
// MÓDULO 3 — INCIDENCIAS
// Estructura actual de INCIDENCIAS (A→V):
// A TICKET · B SOLICITANTE · C FECHA_HORA · D TECNICO ASIGNADO · E ID_EQUIPO ·
// F CLIENTE · G MODELO · H DIRECCION · I DISTRITO · J FRAGANCIA_EQUIPO ·
// K TIPO_INCIDENCIA · L NUEVA_FRAGANCIA · M OTRO_TIPO · N SEVERIDAD ·
// O DESCRIPCION_PROBLEMA · P ACCION_TOMADA · Q ESTADO_CIERRE ·
// R REQUIERE_SEGUIMIENTO · S Fecha Programado · T Fecha Realizado ·
// U OBSERVACIONES · V URL_FOTO · W APLICO_FRAGANCIA · X ML_APLICADOS ·
// Y CUENTA_COMO_MANTENIMIENTO
// ============================================================
var INC = {
  TICKET: 1, SOLICITANTE: 2, FECHA_HORA: 3, TECNICO: 4, ID: 5, CLIENTE: 6, MODELO: 7,
  DIRECCION: 8, DISTRITO: 9, FRAGANCIA: 10, TIPO: 11, NUEVA_FRAG: 12, OTRO: 13,
  SEVERIDAD: 14, DESCRIPCION: 15, ACCION: 16, ESTADO: 17, SEGUIMIENTO: 18,
  FECHA_PROG: 19, FECHA_REAL: 20, OBS: 21, FOTO: 22, ANCHO: 22,
  // Columnas nuevas (las llena solo el técnico):
  APLICO_FRAG: 23,   // W APLICO_FRAGANCIA (Sí / No)
  ML_APLICADOS: 24,  // X ML_APLICADOS
  CUENTA_MANT: 25,   // Y CUENTA_COMO_MANTENIMIENTO (Sí / No)
};
 
/**
 * Fila del encabezado de INCIDENCIAS (la hoja se ordena a mano y el encabezado
 * no siempre está en la fila 1). Busca "TICKET" en la columna A.
 */
function filaEncabezadoIncidencias_(sheet) {
  var n = Math.min(sheet.getLastRow(), 200);
  if (n < 1) return 1;
  var colA = sheet.getRange(1, 1, n, 1).getValues();
  for (var i = 0; i < colA.length; i++) {
    if (String(colA[i][0]).trim().toUpperCase() === 'TICKET') return i + 1;
  }
  return 1;
}
 
function asegurarEncabezadosIncidencias_(sheet) {
  var fh = filaEncabezadoIncidencias_(sheet);
  var cab = sheet.getRange(fh, INC.APLICO_FRAG, 1, 3).getValues()[0];
  if (!cab[0] || !cab[1] || !cab[2]) {
    sheet.getRange(fh, INC.APLICO_FRAG, 1, 3)
      .setValues([['APLICO_FRAGANCIA', 'ML_APLICADOS', 'CUENTA_COMO_MANTENIMIENTO']])
      .setFontWeight('bold');
  }
}
 
/**
 * Si la visita por incidencia también cuenta como mantenimiento, la registra en
 * REGISTRO_Campo y aplica los cambios de mantenimiento en REF_Clientes.
 * Devuelve un texto para agregar al mensaje de respuesta.
 */
function registrarMantenimientoDesdeIncidencia_(ss, data, urlFoto) {
  if (data.cuentaMantenimiento !== 'Sí') return '';
  try {
    registrarVisitaCampo_(ss, {
      tecnico: data.tecnico, idEquipo: data.idEquipo, cliente: data.cliente, modelo: data.modelo,
      tipoEspacio: data.tipoEspacio, distrito: data.distrito,
      nivelLlegada: data.nivelLlegada,
      recarga: data.aplicoFragancia === 'Sí' ? data.mlAplicados : 0,
      diasUltVisita: data.diasUltVisita,
      fragancia: data.fraganciaEquipo,
      cambioFragancia: data.mantCambioFragancia, nuevaFragancia: data.mantNuevaFragancia,
      observaciones: 'Incidencia ' + (data.ticket || '') + (data.observaciones ? ' · ' + data.observaciones : ''),
    }, urlFoto);
    return ' También quedó registrado como mantenimiento.';
  } catch (e) {
    return ' Ojo: no se pudo registrar el mantenimiento en REGISTRO_Campo (' + e.message + ').';
  }
}
 
/**
 * Incidencias con ESTADO_CIERRE (Q) = "Programado".
 */
function getIncidenciasProgramadas() {
  try {
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName(CONFIG.SHEETS.INCIDENCIAS);
    if (!sheet) return [];
 
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];
 
    var values = sheet.getRange(2, 1, lastRow - 1, INC.ANCHO).getValues();
    var out = [];
 
    for (var i = 0; i < values.length; i++) {
      var r = values[i];
      var estado = String(r[INC.ESTADO - 1] || '').trim().toLowerCase();
      if (estado !== 'programado') continue;
 
      out.push({
        fila:           i + 2,
        ticket:         String(r[INC.TICKET - 1]     || ''),
        idEquipo:       String(r[INC.ID - 1]         || ''),
        cliente:        String(r[INC.CLIENTE - 1]    || ''),
        modelo:         String(r[INC.MODELO - 1]     || ''),
        direccion:      String(r[INC.DIRECCION - 1]  || ''),
        distrito:       String(r[INC.DISTRITO - 1]   || ''),
        fragancia:      String(r[INC.FRAGANCIA - 1]  || ''),
        tipoIncidencia: String(r[INC.TIPO - 1]       || ''),
        nuevaFragancia: String(r[INC.NUEVA_FRAG - 1] || ''),
        otroTipo:       String(r[INC.OTRO - 1]       || ''),
      });
    }
 
    Logger.log('getIncidenciasProgramadas devuelve: ' + out.length);
    return out;
 
  } catch (e) {
    Logger.log('Error en getIncidenciasProgramadas: ' + e.toString());
    return [];
  }
}
 
/**
 * Llamado desde el cliente (HTML) al enviar el formulario de incidencias.
 * Caso 1 (normal): completa la fila programada por comercial.
 * Caso 2: incidencia nueva reportada por el técnico (fila nueva).
 */
function registrarIncidencia(data) {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEETS.INCIDENCIAS);
    if (!sheet) throw new Error('No se encontró la hoja: ' + CONFIG.SHEETS.INCIDENCIAS);
 
    let urlFoto = '';
    if (data.fotoBase64 && data.fotoMime && data.fotoNombre) {
      const fileName = 'INCI_' + data.idEquipo + '_' + sello_() + '_' + data.fotoNombre;
      urlFoto = savePhotoToDrive(data.fotoBase64, data.fotoMime, fileName);
    }
 
    // ── Caso 1: incidencia "Programado" por comercial → se completa esa misma fila ──
    if (data.filaProgramada) {
      var fila = ubicarSolicitud_(sheet, data.filaProgramada, data.ticket, INC.TICKET, data.idEquipo, INC.ID, INC.ESTADO);
      if (fila === -1) {
        return { ok: false, mensaje: 'La incidencia ' + data.ticket + ' ya no figura como Programado. Recarga la página.' };
      }
      sheet.getRange(fila, INC.TECNICO).setValue(data.tecnico || '');
      sheet.getRange(fila, INC.SEVERIDAD, 1, 6).setValues([[
        data.severidad    || '',   // N
        data.descripcion  || '',   // O
        data.accionTomada || '',   // P
        data.estadoCierre || '',   // Q (reemplaza "Programado")
        data.seguimiento  || '',   // R
        sheet.getRange(fila, INC.FECHA_PROG).getValue(), // S se conserva
      ]]);
      sheet.getRange(fila, INC.FECHA_REAL).setValue(ahora_());           // T Fecha Realizado
      sheet.getRange(fila, INC.OBS).setValue(data.observaciones || '');     // U
      if (urlFoto) sheet.getRange(fila, INC.FOTO).setValue(urlFoto);        // V
      asegurarEncabezadosIncidencias_(sheet);
      sheet.getRange(fila, INC.APLICO_FRAG, 1, 3).setValues([[              // W X Y
        data.aplicoFragancia || '',
        data.aplicoFragancia === 'Sí' ? (Number(data.mlAplicados) || 0) : 0,
        data.cuentaMantenimiento || '',
      ]]);
 
      var extra = registrarMantenimientoDesdeIncidencia_(ss, data, urlFoto);
      return { ok: true, mensaje: 'Incidencia ' + data.ticket + ' completada.' + extra };
    }
 
    // ── Caso 2: incidencia nueva reportada por el técnico ──
    const filaNueva = [
      '',                              // A TICKET (propio del comercial)
      '',                              // B SOLICITANTE
      new Date(),                      // C FECHA_HORA
      data.tecnico          || '',     // D
      data.idEquipo         || '',     // E
      data.cliente          || '',     // F
      data.modelo           || '',     // G
      data.direccion        || '',     // H
      data.distrito         || '',     // I
      data.fraganciaEquipo  || '',     // J
      data.tipoIncidencia   || '',     // K
      data.nuevaFragancia   || '',     // L
      data.tipoOtro         || '',     // M
      data.severidad        || '',     // N
      data.descripcion      || '',     // O
      data.accionTomada     || '',     // P
      data.estadoCierre     || '',     // Q
      data.seguimiento      || '',     // R
      '',                              // S Fecha Programado
      ahora_(),                        // T Fecha Realizado
      data.observaciones    || '',     // U
      urlFoto,                         // V
      data.aplicoFragancia  || '',     // W
      data.aplicoFragancia === 'Sí' ? (Number(data.mlAplicados) || 0) : 0, // X
      data.cuentaMantenimiento || '',  // Y
    ];
    asegurarEncabezadosIncidencias_(sheet);
    sheet.appendRow(filaNueva);
 
    var extra2 = registrarMantenimientoDesdeIncidencia_(ss, data, urlFoto);
    return { ok: true, mensaje: 'Incidencia registrada correctamente.' + extra2 };
 
  } catch (e) {
    Logger.log('Error en registrarIncidencia: ' + e.toString());
    return { ok: false, mensaje: 'Error: ' + e.toString() };
  }
}
 
// ============================================================
// FUNCIONES AUXILIARES — Llamadas desde el cliente HTML
// ============================================================
 
/**
 * Equipos de REF_Clientes (Activo e Inactivo) para Mantenimiento y Salida.
 */
function getEquipos() {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEETS.REF_CLIENTES);
    if (!sheet) return [];
 
    const data = sheet.getDataRange().getValues();
    const equipos = [];
 
    for (let i = RC.FILA_DATOS - 1; i < data.length; i++) {
      const row = data[i];
      const id = String(row[1]).trim();
      if (!id || !id.startsWith('EQP')) continue;
      const estado = String(row[14] || '').trim();
      if (estado.toLowerCase() === 'retirado') continue;
 
      const ult = row[15];
      equipos.push({
        id:        id,
        cliente:   String(row[3] || ''),
        direccion: String(row[4] || ''),
        distrito:  String(row[5] || ''),
        modelo:    String(row[6] || ''),
        espacio:   String(row[7] || ''),
        fragancia: String(row[9] || ''),
        ultVisita: Object.prototype.toString.call(ult) === '[object Date]' ? ult.toISOString() : String(ult || ''),
        estado:    estado,
        tipoContrato: String(row[19] || ''),   // T TIPO_CONTRATO
      });
    }
    Logger.log('getEquipos devuelve: ' + equipos.length);
    return equipos;
 
  } catch (e) {
    Logger.log('Error en getEquipos: ' + e.toString());
    return [];
  }
}
 
/**
 * Fragancias desde REF_Fragancias (nombre en B, estado en J).
 * estado = 'ACTIVO' o 'SIN_CONSUMO'.
 */
function getFragancias() {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEETS.REF_FRAGANCIAS);
    if (!sheet) return [];
 
    const data = sheet.getDataRange().getValues();
    const fragancias = [];
 
    for (let i = 3; i < data.length; i++) {
      const row = data[i];
      const nombre = String(row[1] || '').trim();
      if (!nombre || nombre.startsWith('TOTAL')) continue;
      const estadoRaw = String(row[9] || '').toUpperCase(); // J ESTADO
 
      fragancias.push({
        nombre:    nombre,
        proveedor: String(row[2] || ''),
        estado:    estadoRaw.indexOf('SIN CONSUMO') !== -1 ? 'SIN_CONSUMO' : 'ACTIVO',
      });
    }
    Logger.log('getFragancias devuelve: ' + fragancias.length);
    return fragancias;
 
  } catch (e) {
    Logger.log('Error en getFragancias: ' + e.toString());
    return [];
  }
}
 
// ============================================================
// MENÚ PERSONALIZADO — aparece en el Sheet al abrir
// ============================================================
 
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('⚙️ ARDE Sistema')
    .addItem('Ver URL del formulario', 'mostrarUrlFormulario')
    .addSeparator()
    .addItem('Crear carpeta de fotos', 'crearCarpetaFotos')
    .addItem('Inicializar hoja SALIDA_Almacen', 'initSalidaSheet')
    .addSeparator()
    .addItem('Reparar fórmulas y distritos de REF_Clientes', 'repararRefClientes')
    .addToUi();
}
 
function mostrarUrlFormulario() {
  const ui = SpreadsheetApp.getUi();
  ui.alert(
    'URL del formulario',
    'Publica el script como Web App (Implementar → Nueva implementación → Aplicación web).\n\n' +
    'Acceso: Cualquier persona\n' +
    'Ejecutar como: Yo (tu cuenta)\n\n' +
    'La URL generada es la que compartes con los técnicos.',
    ui.ButtonSet.OK
  );
}
 
function crearCarpetaFotos() {
  try {
    const folder = getPhotosFolder();
    SpreadsheetApp.getUi().alert('✅ Carpeta lista: ' + folder.getName() + '\nURL: ' + folder.getUrl());
  } catch (e) {
    SpreadsheetApp.getUi().alert('❌ Error: ' + e.toString());
  }
}
 
/**
 * EJECUTAR UNA VEZ (menú ⚙️ ARDE Sistema o editor → repararRefClientes → ▶).
 * 1. Repone en todas las filas de REF_Clientes la fórmula de P (ÚLT. MANTENIM.)
 *    y V (ÚLT. VISITA REGISTRADA), con rango abierto en REGISTRO_Campo.
 *    Arregla las filas donde se había escrito una fecha fija encima.
 * 2. Completa DISTRITO_NORM (R) solo donde está vacío.
 * Es seguro ejecutarla más de una vez.
 */
function repararRefClientes() {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG.SHEETS.REF_CLIENTES);
  var lastRow = sheet.getLastRow();
  if (lastRow < RC.FILA_DATOS) return;
  var n = lastRow - RC.FILA_DATOS + 1;
 
  var ids   = sheet.getRange(RC.FILA_DATOS, RC.ID, n, 1).getValues();
  var dist  = sheet.getRange(RC.FILA_DATOS, RC.DISTRITO, n, 1).getValues();
  var norm  = sheet.getRange(RC.FILA_DATOS, RC.DIST_NORM, n, 1).getValues();
 
  var formulas = [], normNuevos = [], conFormula = 0, conNorm = 0;
  for (var i = 0; i < n; i++) {
    var fila = RC.FILA_DATOS + i;
    var tieneId = String(ids[i][0]).trim() !== '';
    formulas.push([tieneId ? formulaUltimaVisita_(fila) : '']);
    if (tieneId) conFormula++;
    var actual = norm[i][0];
    if (tieneId && (actual === '' || actual === null)) {
      normNuevos.push([normalizarDistrito_(dist[i][0])]);
      conNorm++;
    } else {
      normNuevos.push([actual]);
    }
  }
 
  sheet.getRange(RC.FILA_DATOS, RC.ULT_MANT, n, 1).setFormulas(formulas);
  sheet.getRange(RC.FILA_DATOS, RC.ULT_VISITA, n, 1).setFormulas(formulas);
  sheet.getRange(RC.FILA_DATOS, RC.DIST_NORM, n, 1).setValues(normNuevos);
 
  var msg = 'Listo: fórmulas de P y V repuestas en ' + conFormula + ' filas; DISTRITO_NORM completado en ' + conNorm + ' filas.';
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { /* ejecutado desde el editor */ }
}
 
// ============================================================
// MÓDULO 4 — SALIDA DE ALMACÉN
// Escribe en hoja: SALIDA_Almacen
// ============================================================
 
function initSalidaSheet() {
  const ss = getSpreadsheet();
  const sheet = getOrCreateSheet(ss, CONFIG.SHEETS.SALIDA);
  if (sheet.getLastRow() === 0) {
    const headers = [
      'TIMESTAMP', 'FECHA_HORA', 'TECNICO', 'TIPO_SALIDA', 'DESTINO', 'FRAGANCIA',
      'VOLUMEN_ML', 'ID_EQUIPO', 'CLIENTE', 'MODELO', 'DISTRITO', 'FRAGANCIA_EQUIPO',
      'OBSERVACIONES', 'URL_FOTO',
    ];
    sheet.appendRow(headers);
    const hr = sheet.getRange(1, 1, 1, headers.length);
    hr.setFontWeight('bold');
    hr.setBackground('#1e3a5f');
    hr.setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    Logger.log('Hoja SALIDA_Almacen inicializada.');
  } else {
    Logger.log('Hoja SALIDA_Almacen ya tiene datos.');
  }
}
 
function registrarSalida(data) {
  try {
    const ss = getSpreadsheet();
    const sheet = getOrCreateSheet(ss, CONFIG.SHEETS.SALIDA);
    if (sheet.getLastRow() === 0) initSalidaSheet();
 
    let urlFoto = '';
    if (data.fotoBase64 && data.fotoMime) {
      const fn = 'SALIDA_' + (data.idEquipo || data.fragancia || 'ALM') + '_' + sello_() + '.jpg';
      urlFoto = savePhotoToDrive(data.fotoBase64, data.fotoMime, fn);
    }
 
    const fila = [
      new Date(),
      getNowLima(),
      data.tecnico         || '',
      data.tipoSalida      || '',
      data.destino         || '',
      data.fragancia       || '',
      Number(data.volumenMl) || '',
      data.idEquipo        || '',
      data.cliente         || '',
      data.modelo          || '',
      data.distrito        || '',
      data.fraganciaEquipo || '',
      data.observaciones   || '',
      urlFoto,
    ];
 
    sheet.appendRow(fila);
 
    return { ok: true, mensaje: 'Salida registrada correctamente.' };
 
  } catch (e) {
    Logger.log('Error en registrarSalida: ' + e.toString());
    return { ok: false, mensaje: 'Error: ' + e.toString() };
  }
}
 
// ============================================================
// MÓDULO 5 — RETIRO DE EQUIPO
// SOLICITUD_RETIRO: A Ticket · B FECHA_HORA · C SOLICITANTE · D ID_EQUIPO ·
// E CLIENTE · F MODELO · G DIRECCION · H DISTRITO · I MOTIVO_RETIRO ·
// J OBSERVACIONES COMERCIALES · K TÉCNICO ASIGNADO · L ESTADO ·
// M FECHA PROGRAMADO (manual) · N FECHA EJECUTADO · O OBSERVACIONES_TECNICO ·
// P URL_FOTO_RETIRO
// ============================================================
 
/**
 * Retiros con ESTADO (L) = "Programado".
 */
function getRetirosProgramados() {
  try {
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName(CONFIG.SHEETS.RETIRO);
    if (!sheet) return [];
 
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];
 
    var values = sheet.getRange(2, 1, lastRow - 1, 13).getValues(); // A..M
    var out = [];
 
    for (var i = 0; i < values.length; i++) {
      var r = values[i];
      var estado = String(r[11] || '').trim().toLowerCase(); // L
      if (estado !== 'programado') continue;
 
      out.push({
        fila:      i + 2,
        ticket:    String(r[0] || ''), // A
        idEquipo:  String(r[3] || ''), // D
        cliente:   String(r[4] || ''), // E
        modelo:    String(r[5] || ''), // F
        direccion: String(r[6] || ''), // G
        distrito:  String(r[7] || ''), // H
        motivo:    String(r[8] || ''), // I
      });
    }
 
    Logger.log('getRetirosProgramados devuelve: ' + out.length);
    return out;
 
  } catch (e) {
    Logger.log('Error en getRetirosProgramados: ' + e.toString());
    return [];
  }
}
 
/**
 * Retiro de equipo:
 * 1) Completa la fila de SOLICITUD_RETIRO (técnico, estado Retirado, fecha
 *    ejecutado, observaciones y foto).
 * 2) Mueve el equipo de REF_Clientes a "Historial de Retiros" (fila completa,
 *    prefijo RET-, ESTADO Retirado, fecha de retiro y detalle en AB..AF) y lo
 *    borra de REF_Clientes.
 */
function registrarRetiro(data) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var ss = getSpreadsheet();
    var shRetiro = ss.getSheetByName(CONFIG.SHEETS.RETIRO);
    if (!shRetiro) throw new Error('No se encontró la hoja ' + CONFIG.SHEETS.RETIRO);
 
    var fila = ubicarSolicitud_(shRetiro, data.filaProgramada, data.ticket, 1, data.idEquipo, 4, 12);
    if (fila === -1) {
      return { ok: false, mensaje: 'El retiro ' + data.ticket + ' ya no figura como Programado. Recarga la página.' };
    }
 
    var urlFoto = '';
    if (data.fotoBase64 && data.fotoMime && data.fotoNombre) {
      urlFoto = savePhotoToDrive(data.fotoBase64, data.fotoMime, 'RETIRO_' + data.idEquipo + '_' + sello_() + '_' + data.fotoNombre);
    }
 
    // 1) SOLICITUD_RETIRO
    asegurarEncabezado_(shRetiro, 15, 'OBSERVACIONES_TECNICO');
    asegurarEncabezado_(shRetiro, 16, 'URL_FOTO_RETIRO');
    shRetiro.getRange(fila, 11).setValue(data.tecnico || '');        // K TÉCNICO ASIGNADO
    shRetiro.getRange(fila, 12).setValue('Retirado');                // L ESTADO
    shRetiro.getRange(fila, 14).setValue(getNowLima());              // N FECHA EJECUTADO
    shRetiro.getRange(fila, 15).setValue(data.observaciones || '');  // O
    if (urlFoto) shRetiro.getRange(fila, 16).setValue(urlFoto);      // P
 
    // 2) REF_Clientes → Historial de Retiros
    var movido = moverEquipoAHistorial_(ss, data.idEquipo, ahora_(), {
      tecnico: data.tecnico, motivo: data.motivo, observaciones: data.observaciones, urlFoto: urlFoto,
    });
 
    var mensaje = movido
      ? 'Retiro registrado. ' + data.idEquipo + ' pasó a Historial de Retiros.'
      : 'Retiro registrado. Ojo: ' + data.idEquipo + ' no estaba en REF_Clientes (¿ya se había movido?).';
    return { ok: true, mensaje: mensaje };
 
  } catch (e) {
    Logger.log('Error en registrarRetiro: ' + e.toString());
    return { ok: false, mensaje: 'Error: ' + e.toString() };
  } finally {
    lock.releaseLock();
  }
}
 
// ============================================================
// MÓDULO 6 — CAMBIO DE EQUIPO
// SOLICITUD_CAMBIO: A TICKET · B FECHA_HORA · C SOLICITANTE · D ID_EQUIPO ·
// E CLIENTE · F MODELO ACTUAL · G MODELO NUEVO · H DIRECCION · I DISTRITO ·
// J MOTIVO DEL CAMBIO · K OBSERVACIONES · L TÉCNICO ASIGNADO ·
// M ESTADO ("Programado"/"Realizado") · N FECHA PROGRAMADO (manual) · O FECHA EJECUTADO
// ============================================================
 
function getCambiosProgramados() {
  try {
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName(CONFIG.SHEETS.CAMBIO);
    if (!sheet) return [];
 
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];
 
    var values = sheet.getRange(2, 1, lastRow - 1, 15).getValues(); // A..O
    var out = [];
 
    for (var i = 0; i < values.length; i++) {
      var r = values[i];
      var estado = String(r[12] || '').trim().toLowerCase(); // M
      if (estado !== 'programado') continue;
 
      out.push({
        fila:         i + 2,
        ticket:       String(r[0] || ''), // A
        idEquipo:     String(r[3] || ''), // D
        cliente:      String(r[4] || ''), // E
        modeloActual: String(r[5] || ''), // F
        modeloNuevo:  String(r[6] || ''), // G
        direccion:    String(r[7] || ''), // H
        distrito:     String(r[8] || ''), // I
        motivo:       String(r[9] || ''), // J
      });
    }
 
    Logger.log('getCambiosProgramados devuelve: ' + out.length);
    return out;
 
  } catch (e) {
    Logger.log('Error en getCambiosProgramados: ' + e.toString());
    return [];
  }
}
 
function registrarCambioEquipo(data) {
  try {
    var ss = getSpreadsheet();
    var shCambio = ss.getSheetByName(CONFIG.SHEETS.CAMBIO);
    if (!shCambio) throw new Error('No se encontró la hoja ' + CONFIG.SHEETS.CAMBIO);
 
    var fila = ubicarSolicitud_(shCambio, data.filaProgramada, data.ticket, 1, data.idEquipo, 4, 13);
    if (fila === -1) {
      return { ok: false, mensaje: 'El cambio ' + data.ticket + ' ya no figura como Programado. Recarga la página.' };
    }
 
    // 1) SOLICITUD_CAMBIO
    shCambio.getRange(fila, 11).setValue(data.observaciones || '');  // K OBSERVACIONES
    shCambio.getRange(fila, 12).setValue(data.tecnico || '');        // L TÉCNICO ASIGNADO
    shCambio.getRange(fila, 13).setValue('Realizado');               // M ESTADO
    shCambio.getRange(fila, 15).setValue(getNowLima());              // O FECHA EJECUTADO
 
    // 2) REF_Clientes: nuevo modelo
    var aviso = '';
    var ref = ss.getSheetByName(CONFIG.SHEETS.REF_CLIENTES);
    var filaRef = ref ? filaEquipoEnRef_(ref, data.idEquipo) : -1;
    if (filaRef !== -1 && data.modeloNuevo) {
      ref.getRange(filaRef, RC.MODELO).setValue(data.modeloNuevo);
    } else {
      aviso = ' Ojo: no se encontró ' + data.idEquipo + ' en REF_Clientes para actualizar el modelo.';
    }
 
    return { ok: true, mensaje: 'Cambio de equipo registrado correctamente.' + aviso };
 
  } catch (e) {
    Logger.log('Error en registrarCambioEquipo: ' + e.toString());
    return { ok: false, mensaje: 'Error: ' + e.toString() };
  }
}
 
// ============================================================
// MÓDULO 7 — TRASLADO DE EQUIPO
// Solicitud_Traslado: A TICKET · B FECHA_HORA · C SOLICITANTE · D ID_EQUIPO ·
// E CLIENTE · F MODELO · G DIRECCION_ACTUAL · H DISTRITO_ACTUAL ·
// I DIRECCION_NUEVA · J DISTRITO_NUEVO · K UBICACION_INSTALAR ·
// L TÉCNICO ASIGNADO · M ESTADO · N FECHA DE PROGRAMADO (manual) ·
// O FECHA EJECUTADO · P OBSERVACIONES_TECNICO
// ============================================================
 
function getTrasladosProgramados() {
  try {
    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName(CONFIG.SHEETS.TRASLADO);
    if (!sheet) return [];
 
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];
 
    var values = sheet.getRange(2, 1, lastRow - 1, 13).getValues(); // A..M
    var out = [];
 
    for (var i = 0; i < values.length; i++) {
      var r = values[i];
      var estado = String(r[12] || '').trim().toLowerCase(); // M
      if (estado !== 'programado') continue;
 
      out.push({
        fila:            i + 2,
        ticket:          String(r[0]  || ''), // A
        idEquipo:        String(r[3]  || ''), // D
        cliente:         String(r[4]  || ''), // E
        modelo:          String(r[5]  || ''), // F
        direccionActual: String(r[6]  || ''), // G
        distritoActual:  String(r[7]  || ''), // H
        direccionNueva:  String(r[8]  || ''), // I
        distritoNuevo:   String(r[9]  || ''), // J
        ubicacion:       String(r[10] || ''), // K
      });
    }
 
    Logger.log('getTrasladosProgramados devuelve: ' + out.length);
    return out;
 
  } catch (e) {
    Logger.log('Error en getTrasladosProgramados: ' + e.toString());
    return [];
  }
}
 
/**
 * Traslado ejecutado:
 * 1) Solicitud_Traslado: L técnico · M "Realizado" · O fecha ejecutado · P observaciones.
 * 2) REF_Clientes: E dirección nueva · F distrito nuevo · R DISTRITO_NORM.
 */
function registrarTraslado(data) {
  try {
    var ss = getSpreadsheet();
    var sh = ss.getSheetByName(CONFIG.SHEETS.TRASLADO);
    if (!sh) throw new Error('No se encontró la hoja ' + CONFIG.SHEETS.TRASLADO);
 
    var fila = ubicarSolicitud_(sh, data.filaProgramada, data.ticket, 1, data.idEquipo, 4, 13);
    if (fila === -1) {
      return { ok: false, mensaje: 'El traslado ' + data.ticket + ' ya no figura como Programado. Recarga la página.' };
    }
 
    // La dirección nueva se toma de la propia solicitud (no del navegador)
    var sol = sh.getRange(fila, 1, 1, 11).getValues()[0];
    var dirNueva  = String(sol[8] || '').trim();  // I
    var distNuevo = String(sol[9] || '').trim();  // J
 
    // 1) Solicitud_Traslado
    asegurarEncabezado_(sh, 16, 'OBSERVACIONES_TECNICO');
    sh.getRange(fila, 12).setValue(data.tecnico || '');        // L TÉCNICO ASIGNADO
    sh.getRange(fila, 13).setValue('Realizado');               // M ESTADO
    sh.getRange(fila, 15).setValue(getNowLima());              // O FECHA EJECUTADO
    sh.getRange(fila, 16).setValue(data.observaciones || '');  // P OBSERVACIONES_TECNICO
 
    // 2) REF_Clientes
    var ref = ss.getSheetByName(CONFIG.SHEETS.REF_CLIENTES);
    var filaRef = ref ? filaEquipoEnRef_(ref, data.idEquipo) : -1;
    if (filaRef === -1) {
      return { ok: true, mensaje: 'Traslado registrado. Ojo: no se encontró ' + data.idEquipo + ' en REF_Clientes; actualiza la dirección a mano.' };
    }
    ref.getRange(filaRef, RC.DIRECCION).setValue(dirNueva);
    ref.getRange(filaRef, RC.DISTRITO).setValue(distNuevo);
    ref.getRange(filaRef, RC.DIST_NORM).setValue(normalizarDistrito_(distNuevo));
 
    return { ok: true, mensaje: 'Traslado registrado. ' + data.idEquipo + ' ahora figura en ' + dirNueva + ' (' + distNuevo + ').' };
 
  } catch (e) {
    Logger.log('Error en registrarTraslado: ' + e.toString());
    return { ok: false, mensaje: 'Error: ' + e.toString() };
  }
}
