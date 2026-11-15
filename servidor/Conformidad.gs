// ============================================================
// ARDE CAMPO · CARGOS DE CONFORMIDAD (PDF)
// Cada registro de un técnico genera un cargo en PDF con la firma
// del técnico y la del cliente. El PDF:
//   1) se guarda en Drive:  ARDE · Cargos de conformidad / <Módulo> / <yyyy-MM Mes>
//   2) se envía por correo al cliente (si dejó correo)
//   3) queda listado en la hoja CONFORMIDADES
// Las hojas y carpetas se crean solas la primera vez.
// ============================================================

var CONF = {
  HOJA: 'CONFORMIDADES',
  HOJA_CORREOS: 'CORREOS_CLIENTES',
  CARPETA_RAIZ: 'ARDE · Cargos de conformidad',
  // Opcional: ID de una carpeta de Drive donde crear la estructura (ej. "Proyecto Josef").
  // Vacío = se crea en "Mi unidad" de quien implementó la API.
  CARPETA_PADRE_ID: '',
  // Opcional: copia oculta de cada cargo enviado al cliente (ej. 'operaciones@ardetodo.com')
  COPIA_OCULTA: '',
  REMITENTE: 'ARDE · Servicio técnico',
};

var HEADERS_CONF = ['N° CARGO', 'FECHA', 'MÓDULO', 'REFERENCIA', 'ID_EQUIPO', 'CLIENTE', 'TÉCNICO',
  'FIRMA CLIENTE', 'RECIBIÓ', 'DNI / CARGO', 'CORREO', 'ENVÍO', 'PDF', 'ID_REGISTRO'];

var CARPETA_MODULO_ = {
  mantenimiento: '1. Mantenimiento', instalacion: '2. Instalación', incidencia: '3. Incidencias',
  salida: '4. Salida de almacén', retiro: '5. Retiro', cambio: '6. Cambio de equipo', traslado: '7. Traslado',
  sup_visita: '8. Visitas de supervisión',
};
var TITULO_MODULO_ = {
  mantenimiento: 'Mantenimiento', instalacion: 'Instalación de equipo', incidencia: 'Atención de incidencia',
  salida: 'Salida de almacén', retiro: 'Retiro de equipo', cambio: 'Cambio de equipo', traslado: 'Traslado de equipo',
  sup_visita: 'Visita de supervisión',
};
var MESES_ = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Setiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// Llamado desde registrar_() cuando el registro del técnico salió OK.
// Nunca hace fallar el registro: si algo falla, lo anota en CONFORMIDADES.
function procesarConformidad_(idRegistro, modulo, datos, res, usuario) {
  var c = datos.conformidad;
  if (!c || !CARPETA_MODULO_[modulo]) return null;
  var numero = '', url = '', envio = '';
  var fecha = ahora_();
  try {
    numero = siguienteCargo_();
    var html = htmlCargo_(numero, fecha, modulo, c, datos, res, usuario);
    var nombre = numero + ' · ' + (c.idEquipo || c.referencia || '') + ' · ' + limpiarNombre_(c.cliente || 'Sin cliente') + ' · '
      + Utilities.formatDate(fecha, 'America/Lima', 'yyyy-MM-dd') + '.pdf';
    var pdf = Utilities.newBlob(html, 'text/html', 'cargo.html').getAs('application/pdf').setName(nombre);
    var archivo = carpetaCargo_(modulo, fecha).createFile(pdf);
    url = archivo.getUrl();

    if (c.correo) {
      try {
        enviarCargo_(c, numero, modulo, fecha, pdf, usuario);
        envio = 'ENVIADO';
        guardarCorreoCliente_(c.cliente, c.correo, usuario.nombre);
      } catch (e) {
        envio = 'ERROR: ' + String(e.message || e).slice(0, 150);
      }
    } else {
      envio = c.tipo === 'almacen' ? 'INTERNO' : 'SIN CORREO';
    }
  } catch (e) {
    envio = 'ERROR PDF: ' + String(e.message || e).slice(0, 150);
  }
  hojaConformidades_().appendRow([
    numero || '—', fecha, nombreModulo_(modulo), String(res.ticket || c.referencia || ''), c.idEquipo || '', c.cliente || '',
    usuario.nombre, c.tipo === 'almacen' ? 'ALMACÉN' : (c.firmo === 'Sí' ? 'SÍ' : 'NO · ' + (c.motivo || '')),
    c.nombre || '', c.cargo || '', c.correo || '', envio, url, idRegistro,
  ]);
  return { numero: numero, url: url, envio: envio };
}

// ── PDF ─────────────────────────────────────────────────────

function htmlCargo_(numero, fecha, modulo, c, datos, res, usuario) {
  var e = escHtml_;
  var tz = 'America/Lima';
  var visita = c.tipo === 'visita';
  var titulo = c.tipo === 'almacen' ? 'Cargo de salida de almacén' : visita ? 'Acta de visita' : 'Cargo de conformidad de servicio';
  var rolFirma = visita ? 'Supervisor ARDE' : 'Técnico ARDE';
  var filas = (c.filas || []).slice();

  var fotos = [];
  Object.keys(datos).forEach(function(k){
    if (/^foto.*Base64$/.test(k) && datos[k] && fotos.length < 2) {
      var mime = datos[k.replace('Base64', 'Mime')] || 'image/jpeg';
      if (/^image\//.test(mime)) fotos.push('data:' + mime + ';base64,' + datos[k]);
    }
  });

  var h = [];
  h.push('<html><head><meta charset="utf-8"><style>');
  h.push('body{font-family:Arial,Helvetica,sans-serif;color:#1C2129;font-size:11pt;margin:0}');
  h.push('.top{border-bottom:3px solid #F28C28;padding-bottom:10px;margin-bottom:14px}');
  h.push('h1{font-size:16pt;margin:0;color:#15191E}.sub{color:#5F6875;font-size:9.5pt;margin-top:2px}');
  h.push('.num{font-size:13pt;font-weight:bold;color:#B4480B;text-align:right}.fecha{color:#5F6875;font-size:9.5pt;text-align:right}');
  h.push('table{border-collapse:collapse;width:100%}');
  h.push('.kv td{padding:6px 8px;border-bottom:1px solid #E1E4E8;vertical-align:top;font-size:10.5pt}');
  h.push('.kv td.k{width:34%;color:#5F6875}');
  h.push('.sec{font-size:10pt;font-weight:bold;color:#B4480B;text-transform:uppercase;letter-spacing:.5px;margin:16px 0 6px}');
  h.push('.box{background:#F7F8FA;border:1px solid #E1E4E8;padding:8px 10px;font-size:10.5pt}');
  h.push('.firma{border-bottom:1px solid #1C2129;height:90px;text-align:center}.firma img{height:85px}');
  h.push('.fn{font-size:10pt;text-align:center;padding-top:4px}.fs{font-size:8.5pt;color:#5F6875;text-align:center}');
  h.push('.nofirma{color:#B42318;font-size:10pt;text-align:center;padding-top:34px}');
  h.push('.pie{margin-top:22px;border-top:1px solid #E1E4E8;padding-top:6px;color:#8A929D;font-size:8pt}');
  h.push('</style></head><body>');

  h.push('<table class="top"><tr>');
  h.push('<td style="width:64px"><img src="data:image/png;base64,' + LOGO_ARDE_ + '" style="width:54px;height:54px"></td>');
  h.push('<td><h1>' + e(titulo) + '</h1><div class="sub">ARDE · Espacios que Arden · Inversiones Fuego S.A.C.</div></td>');
  h.push('<td style="width:190px"><div class="num">' + e(numero) + '</div><div class="fecha">'
    + Utilities.formatDate(fecha, tz, 'dd/MM/yyyy · HH:mm') + '</div></td>');
  h.push('</tr></table>');

  h.push('<table class="kv">');
  h.push(fila_('Servicio', TITULO_MODULO_[modulo]));
  if (c.tipo !== 'almacen' || c.cliente) h.push(fila_('Cliente', c.cliente));
  if (c.direccion) h.push(fila_(c.tipo === 'almacen' ? 'Lugar' : 'Dirección', c.direccion));
  h.push(fila_(visita ? 'Supervisor' : 'Técnico', usuario.nombre));
  h.push('</table>');

  h.push('<div class="sec">' + (visita ? 'Detalle de la visita' : 'Detalle del trabajo') + '</div><table class="kv">');
  filas.forEach(function(r){ h.push(fila_(r[0], r[1])); });
  h.push('</table>');

  if (fotos.length) {
    h.push('<div class="sec">Evidencia</div><table><tr>');
    fotos.forEach(function(src){ h.push('<td style="width:50%;padding:4px"><img src="' + src + '" style="width:100%;max-height:260px"></td>'); });
    if (fotos.length === 1) h.push('<td></td>');
    h.push('</tr></table>');
  }

  h.push('<div class="sec">Conformidad</div>');
  if (c.tipo !== 'almacen') {
    h.push('<div class="box">' + (c.firmo === 'Sí'
      ? (visita ? 'El cliente deja constancia de la visita y de los acuerdos descritos.' : 'El cliente declara que el servicio descrito fue realizado y lo recibe a conformidad.')
      : 'El cargo se emitió <b>sin firma del cliente</b>. Motivo: ' + e(c.motivo || '—') + (c.nombre ? '. Atendió: ' + e(c.nombre) + '.' : '.')) + '</div>');
  } else {
    h.push('<div class="box">Se deja constancia de la salida de almacén descrita, entregada al técnico.</div>');
  }
  h.push('<table style="margin-top:14px"><tr>');
  h.push('<td style="width:46%;vertical-align:bottom">' + (c.firmaTecnico ? '<div class="firma"><img src="data:image/png;base64,' + c.firmaTecnico + '"></div>' : '<div class="firma"></div>')
    + '<div class="fn"><b>' + e(usuario.nombre) + '</b></div><div class="fs">' + rolFirma + '</div></td>');
  h.push('<td style="width:8%"></td>');
  var etiquetaOtro = c.tipo === 'almacen' ? 'Entrega · Almacén' : 'Cliente' + (c.cargo ? ' · ' + e(c.cargo) : '');
  h.push('<td style="width:46%;vertical-align:bottom">'
    + (c.firmaCliente ? '<div class="firma"><img src="data:image/png;base64,' + c.firmaCliente + '"></div>' : '<div class="firma"><div class="nofirma">Sin firma · ' + e(c.motivo || '') + '</div></div>')
    + '<div class="fn"><b>' + e(c.nombre || '—') + '</b></div><div class="fs">' + etiquetaOtro + '</div></td>');
  h.push('</tr></table>');

  h.push('<div class="pie">Documento generado por ARDE Campo el ' + Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy HH:mm')
    + (FECHA_CAPTURA_ && Date.now() - FECHA_CAPTURA_.getTime() > 600000 ? ' · trabajo registrado sin señal a las ' + Utilities.formatDate(FECHA_CAPTURA_, tz, 'HH:mm') : '')
    + (res.ticket ? ' · Ticket ' + e(res.ticket) : '') + '. Consultas: ' + APP.RESUMEN_PARA + '</div>');
  h.push('</body></html>');
  return h.join('');
}

function fila_(k, v) {
  return '<tr><td class="k">' + escHtml_(k) + '</td><td>' + escHtml_(v == null || v === '' ? '—' : v).replace(/\n/g, '<br>') + '</td></tr>';
}
function escHtml_(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(ch){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; });
}
function limpiarNombre_(s) { return String(s).replace(/[\\/:*?"<>|#%]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60); }

// ── Correo al cliente ───────────────────────────────────────

function enviarCargo_(c, numero, modulo, fecha, pdf, usuario) {
  var e = escHtml_;
  var dia = Utilities.formatDate(fecha, 'America/Lima', 'dd/MM/yyyy');
  var cuerpo = '<div style="font-family:Arial,sans-serif;color:#1C2129;max-width:560px">'
    + '<p>Hola' + (c.nombre ? ' ' + e(c.nombre.split(' ')[0]) : '') + ',</p>'
    + (c.tipo === 'visita' ? '<p>Gracias por recibirnos hoy en <b>' + e(c.cliente || 'tu local') + '</b>. Te enviamos el acta de la visita:</p>'
      : '<p>Te enviamos el cargo de conformidad del servicio realizado hoy en <b>' + e(c.cliente || 'tu local') + '</b>:</p>')
    + '<table cellpadding="6" style="border-collapse:collapse;font-size:14px;background:#F7F8FA;border:1px solid #E1E4E8">'
    + '<tr><td style="color:#5F6875">Servicio</td><td><b>' + e(TITULO_MODULO_[modulo]) + '</b></td></tr>'
    + '<tr><td style="color:#5F6875">N° de documento</td><td><b>' + e(numero) + '</b></td></tr>'
    + (c.idEquipo ? '<tr><td style="color:#5F6875">Equipo</td><td>' + e(c.idEquipo) + '</td></tr>' : '')
    + '<tr><td style="color:#5F6875">Fecha</td><td>' + dia + '</td></tr>'
    + '<tr><td style="color:#5F6875">' + (c.tipo === 'visita' ? 'Supervisor' : 'Técnico') + '</td><td>' + e(usuario.nombre) + '</td></tr></table>'
    + '<p>Encontrarás el detalle y las firmas en el PDF adjunto.</p>'
    + '<p>Si notas algo que no coincide con lo realizado, responde a este correo y lo revisamos.</p>'
    + '<p>Gracias por confiar en ARDE.<br><b>Equipo de Operaciones · ARDE</b></p></div>';
  var opciones = {
    to: c.correo,
    subject: 'ARDE · ' + (c.tipo === 'visita' ? 'Acta de visita ' : 'Cargo de conformidad ') + numero + ' · ' + TITULO_MODULO_[modulo] + (c.idEquipo ? ' ' + c.idEquipo : '') + ' · ' + dia,
    htmlBody: cuerpo,
    attachments: [pdf],
    name: CONF.REMITENTE,
    replyTo: APP.RESUMEN_PARA,
  };
  if (CONF.COPIA_OCULTA) opciones.bcc = CONF.COPIA_OCULTA;
  MailApp.sendEmail(opciones);
}

// ── Drive: raíz / módulo / mes ──────────────────────────────

function carpetaCargo_(modulo, fecha) {
  var props = PropertiesService.getScriptProperties();
  var raiz = null, id = props.getProperty('CARPETA_CARGOS_ID');
  if (id) { try { raiz = DriveApp.getFolderById(id); if (raiz.isTrashed()) raiz = null; } catch (e) { raiz = null; } }
  if (!raiz) {
    var padre = CONF.CARPETA_PADRE_ID ? DriveApp.getFolderById(CONF.CARPETA_PADRE_ID) : DriveApp.getRootFolder();
    raiz = subcarpeta_(padre, CONF.CARPETA_RAIZ);
    props.setProperty('CARPETA_CARGOS_ID', raiz.getId());
  }
  var mes = Utilities.formatDate(fecha, 'America/Lima', 'yyyy-MM') + ' ' + MESES_[Number(Utilities.formatDate(fecha, 'America/Lima', 'MM')) - 1];
  return subcarpeta_(subcarpeta_(raiz, CARPETA_MODULO_[modulo]), mes);
}
function subcarpeta_(padre, nombre) {
  var it = padre.getFoldersByName(nombre);
  return it.hasNext() ? it.next() : padre.createFolder(nombre);
}

// ── Correlativo CF-00001 ────────────────────────────────────

function siguienteCargo_() {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var props = PropertiesService.getScriptProperties();
    var n = Number(props.getProperty('CORRELATIVO_CF'));
    if (!n) {
      n = 0;
      var sh = hojaConformidades_();
      if (sh.getLastRow() >= 2) sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().forEach(function(r){
        var m = String(r[0]).match(/^CF-(\d+)/); if (m) n = Math.max(n, Number(m[1]));
      });
    }
    n++;
    props.setProperty('CORRELATIVO_CF', String(n));
    return 'CF-' + ('00000' + n).slice(-5);
  } finally {
    lock.releaseLock();
  }
}

// ── Hojas ───────────────────────────────────────────────────

function hojaConformidades_() {
  var ss = getSpreadsheet();
  var sh = ss.getSheetByName(CONF.HOJA);
  if (!sh) {
    sh = ss.insertSheet(CONF.HOJA);
    sh.getRange(1, 1, 1, HEADERS_CONF.length).setValues([HEADERS_CONF]).setFontWeight('bold').setBackground('#15191E').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
    sh.setColumnWidth(6, 220); sh.setColumnWidth(13, 260);
  }
  return sh;
}

function hojaCorreos_() {
  var ss = getSpreadsheet();
  var sh = ss.getSheetByName(CONF.HOJA_CORREOS);
  if (!sh) {
    sh = ss.insertSheet(CONF.HOJA_CORREOS);
    sh.getRange(1, 1, 1, 4).setValues([['CLIENTE', 'CORREO', 'ACTUALIZADO', 'POR']]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 240); sh.setColumnWidth(2, 260);
  }
  return sh;
}

function claveCliente_(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

// { "ar studio": "admin@arstudio.pe", ... } → la app autocompleta el correo
function correosClientes_() {
  var sh = getSpreadsheet().getSheetByName(CONF.HOJA_CORREOS);
  var out = {};
  if (!sh || sh.getLastRow() < 2) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(function(r){
    var k = claveCliente_(r[0]);
    if (k && r[1]) out[k] = String(r[1]).trim();
  });
  return out;
}

// Guarda o actualiza el correo del cliente (la próxima visita aparece solo)
function guardarCorreoCliente_(cliente, correo, por) {
  var k = claveCliente_(cliente);
  if (!k || !correo) return;
  var sh = hojaCorreos_();
  var n = sh.getLastRow();
  if (n >= 2) {
    var vals = sh.getRange(2, 1, n - 1, 2).getValues();
    for (var i = 0; i < vals.length; i++) {
      if (claveCliente_(vals[i][0]) === k) {
        if (String(vals[i][1]).trim() !== correo) sh.getRange(i + 2, 2, 1, 3).setValues([[correo, new Date(), por]]);
        return;
      }
    }
  }
  sh.appendRow([cliente, correo, new Date(), por]);
}

// Prueba manual desde el editor: genera un cargo de ejemplo en Drive (no envía correo)
function probarCargoPDF() {
  var c = { tipo: 'cliente', cliente: 'Cliente de prueba', direccion: 'Av. Ejemplo 123 · Miraflores', idEquipo: 'EQP-000', referencia: 'EQP-000',
    filas: [['Equipo', 'EQP-000 · A320'], ['Nivel al llegar', '120 ml'], ['Recarga aplicada', '300 ml'], ['Observaciones', 'Prueba del cargo en PDF']],
    firmo: 'No', nombre: '', cargo: '', motivo: 'Prueba', correo: '', firmaCliente: '', firmaTecnico: '' };
  var r = procesarConformidad_('PRUEBA-' + Date.now(), 'mantenimiento', { conformidad: c }, { ok: true }, { nombre: 'Prueba', rol: 'ADMIN' });
  Logger.log(JSON.stringify(r));
}

var LOGO_ARDE_ = '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';
