// ============================================================
// ARDE Campo · MANUALES (se ven dentro de la app, también sin señal)
// Un manual por rol + uno general. Cada sección tiene un id; los
// módulos abren su sección con el botón "¿Cómo se llena?".
// Para editar un texto: cambia el HTML de la sección y sube la
// versión en sw.js para que llegue a los celulares.
// ============================================================
(function () {
  'use strict';
  var A = window.A;

  // Pequeños ayudantes para escribir el contenido sin repetir HTML
  function pasos(l) { return '<ol class="m-pasos">' + l.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ol>'; }
  function lista(l) { return '<ul class="m-lista">' + l.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>'; }
  function ojo(t) { return '<div class="m-ojo">⚠️ ' + t + '</div>'; }
  function tip(t) { return '<div class="m-tip">💡 ' + t + '</div>'; }
  function tabla(filas) {
    return '<table class="m-tabla">' + filas.map(function (f, i) {
      var tag = i === 0 ? 'th' : 'td';
      return '<tr>' + f.map(function (c) { return '<' + tag + '>' + c + '</' + tag + '>'; }).join('') + '</tr>';
    }).join('') + '</table>';
  }
  function campos(l) { return '<dl class="m-campos">' + l.map(function (c) { return '<dt>' + c[0] + '</dt><dd>' + c[1] + '</dd>'; }).join('') + '</dl>'; }

  // Bloque que se repite en todos los módulos del técnico
  var CARGO = '<h4>Al final: el cargo de conformidad</h4>' + pasos([
    '<b>Observaciones del cargo</b> (opcional): lo que quieres que el cliente lea antes de firmar. <i>Ej.: "Equipo encontrado apagado, se reinició".</i> Sale impreso en el PDF.',
    '<b>¿El cliente firma?</b> → <b>Sí, firma</b>: escribe su nombre (y DNI o cargo si quiere) y que firme con el dedo.',
    'Si no hay nadie: <b>No disponible</b> y elige el motivo. El cargo sale igual, marcado "sin firma".',
    '<b>Correo del cliente</b>: ahí le llega el PDF. La próxima vez aparece solo. Si no tiene correo, marca <b>"El cliente no tiene correo"</b>.',
    '<b>Tu firma</b>: la primera vez firmas; después queda guardada en tu celular.',
  ]);

  A.manuales = [
    // ==========================================================
    {
      id: 'general', ico: '📱', titulo: 'Primeros pasos', sub: 'Instalar, PIN, sin señal e historial', roles: null,
      secciones: [
        { id: 'que-es', t: '¿Qué es ARDE Campo?', html:
          '<p>Es la app donde <b>todo el equipo</b> registra el trabajo: técnicos (mantenimientos, instalaciones, incidencias…), comerciales (solicitudes) y supervisión (visitas a clientes).</p>' +
          '<p>Reemplaza a los formularios antiguos, que ya no reciben información. Lo que envías llega directo al Sheet de Operaciones.</p>' +
          lista(['Funciona <b>sin señal</b>: guarda en el celular y envía solo cuando vuelve la conexión.', 'Cada persona entra con <b>su PIN</b> y ve solo sus módulos.', 'Todo queda registrado con fecha, hora y ubicación.']) },
        { id: 'instalar', t: 'Instalar la app', html:
          '<p>La app <b>solo funciona instalada</b>. Si abres el link en el navegador, solo verás las instrucciones.</p>' +
          '<h4>Android</h4>' + pasos(['Abre el link en <b>Chrome</b> (si estás en WhatsApp: ⋮ → <b>Abrir en Chrome</b>).', 'Menú <b>⋮</b> → <b>Instalar app</b> (o "Agregar a la pantalla principal").', 'Abre <b>ARDE Campo</b> desde el ícono de la llama.']) +
          '<h4>iPhone</h4>' + pasos(['Abre el link en <b>Safari</b> (no en Chrome ni WhatsApp).', 'Botón <b>Compartir</b> ⬆︎ → <b>Agregar a pantalla de inicio</b> → <b>Agregar</b>.', 'Abre <b>ARDE Campo</b> desde el ícono de la llama.']) },
        { id: 'pin', t: 'Entrar con tu PIN', html:
          pasos(['Escribe tus 4 dígitos. Entra solo, sin botón.', 'La primera vez descarga la cartera (necesitas señal).']) +
          lista(['El PIN es <b>personal</b>: todo lo que envíes queda a tu nombre. No lo compartas.', 'Si te equivocas 6 veces, ese celular se bloquea 10 minutos.', '¿Olvidaste tu PIN? Pídelo a Operaciones.']) },
        { id: 'inicio', t: 'La pantalla de inicio', html:
          lista(['Cada cuadro es un módulo. El número naranja indica <b>trabajos pendientes</b> (por ejemplo, instalaciones programadas para ti).',
            'Arriba a la derecha está el <b>estado de envío</b>: <b>✓ Al día</b> (todo enviado), <b>Enviando…</b>, o <b>N en cola</b> (hay registros esperando señal).',
            'Abajo: <b>Inicio</b>, <b>Historial</b>, <b>Manuales</b> y <b>Cuenta</b>.']) },
        { id: 'sin-senal', t: 'Trabajar sin señal', html:
          '<p>Llena y envía normal. Si no hay señal verás <b>"Guardado en el celular"</b>: la app lo envía sola apenas vuelva la conexión.</p>' +
          lista(['La fecha y hora que queda es la <b>de cuando lo hiciste</b>, no la de cuando se envió.', '<b>No borres la app ni cierres sesión</b> si tienes registros en cola: se perderían.', 'Abre la app con señal antes de salir a ruta para tener la cartera actualizada.']) },
        { id: 'borrador', t: 'Si se cierra a la mitad', html:
          '<p>La app guarda lo que vas escribiendo. Si se cierra, se apaga el celular o te llaman, al volver a entrar al módulo aparece todo como lo dejaste, con el aviso <b>"Recuperamos tu borrador"</b> (fotos y firmas incluidas). Si prefieres empezar de cero, toca <b>Empezar de nuevo</b>.</p>' },
        { id: 'historial', t: 'Historial: ¿llegó lo que envié?', html:
          '<p>En <b>Historial</b> ves lo que enviaste en los últimos 7 días:</p>' +
          tabla([['Estado', 'Qué significa', 'Qué haces'],
            ['✅ Enviado', 'Llegó al Sheet', 'Nada'],
            ['⏳ En cola', 'Esperando señal', 'Nada, se envía solo'],
            ['⛔ Rechazado', 'El Sheet no lo aceptó (ej. equipo ya retirado)', 'Lee el motivo, corrige y envía de nuevo. Luego <b>Descartar</b>']]) },
        { id: 'actualizar', t: 'Actualizaciones', html:
          '<p>Cuando haya mejoras verás <b>"Nueva versión disponible"</b>. Toca <b>Actualizar</b>: no se pierde nada de lo que tienes en cola.</p>' },
        { id: 'problemas', t: 'Problemas frecuentes', html:
          campos([
            ['"No encuentro al cliente / equipo"', 'Escribe parte del nombre o el código EQP. Si recién lo dieron de alta, toca ↻ arriba en Inicio (o <b>Cuenta → Actualizar datos</b>).'],
            ['"No me aparece el trabajo programado"', 'Operaciones aún no lo programó (o no está validado). Avisa a Operaciones; luego <b>Cuenta → Actualizar datos</b>.'],
            ['"Tu sesión venció"', 'Ingresa tu PIN de nuevo. Si dice que tu usuario está inactivo, habla con Operaciones.'],
            ['"No toma la foto"', 'Da permiso de cámara a la app (Ajustes del celular → Apps → Chrome/Safari → Cámara). Mientras tanto, toma la foto con la cámara normal y súbela con <b>🖼️ Elegir de galería</b>.'],
            ['"Me sale: Ojo, esta foto es del…"', 'Elegiste de la galería una foto de otro día. Revisa que sea la de esta visita; si no, cámbiala.'],
            ['"Se quedó en cola mucho rato"', 'Revisa que tengas datos o wifi. Abre la app: al abrirla reintenta el envío.'],
          ]) },
      ],
    },

    // ==========================================================
    {
      id: 'tecnico', ico: '🛠️', titulo: 'Manual del técnico', sub: 'Los 7 módulos y el cargo de conformidad', roles: ['TECNICO'],
      secciones: [
        { id: 'reglas', t: 'Reglas de oro', html:
          pasos(['<b>Registra en el momento</b>, en el local del cliente (queda la ubicación GPS).', '<b>Una visita = un registro.</b> Si visitas 3 equipos, son 3 registros.', 'La <b>foto es obligatoria</b> en mantenimiento: que se vea el nivel del frasco.', 'Siempre deja el <b>cargo de conformidad</b> firmado; si no hay nadie, marca "No disponible".', 'Instalaciones, incidencias, retiros, cambios y traslados <b>solo aparecen si Operaciones los programó para ti</b>.']) },
        { id: 'cargo', t: 'Cargo de conformidad (todos los módulos)', html:
          '<p>Al final de cada registro hay dos tarjetas: <b>Conformidad del cliente</b> y <b>Firma del técnico</b>. Al enviar, la app arma un <b>PDF</b> con el trabajo y las firmas, se lo manda al correo del cliente y lo guarda en el Drive de ARDE.</p>' + CARGO +
          ojo('Usa "No disponible" solo cuando de verdad no hay quien firme. Operaciones recibe cada día cuántos cargos salieron sin firma por técnico.') },
        { id: 'mantenimiento', t: '🔄 Mantenimiento', html:
          '<p><b>Cuándo:</b> en cada visita de recarga a un equipo.</p>' +
          pasos(['<b>Equipo visitado</b>: busca por cliente o código EQP. Verás modelo, fragancia, tipo de servicio y días desde la última visita.',
            '<b>Al llegar (ml)</b>: cuánto había en el frasco. <b>Recarga (ml)</b>: cuánto agregaste. La app calcula cómo queda al salir.',
            '<b>¿Se cambió la fragancia?</b> Si dices Sí, elige la nueva.',
            '<b>Foto del frasco al terminar</b> (obligatoria): <b>📷 Tomar foto</b> o <b>🖼️ Elegir de galería</b> si ya la tomaste con la cámara del celular.',
            'Observaciones (internas para Operaciones) y el cargo de conformidad.']) +
          tip('Si el equipo ya tiene una visita hoy o la recarga supera el tamaño del tanque, la app te avisa antes de enviar. Revisa los números.') },
        { id: 'instalacion', t: '📦 Instalación', html:
          '<p><b>Cuándo:</b> instalas un equipo nuevo. Solo aparecen las instalaciones <b>programadas</b> (y validadas por Operaciones si son contrato).</p>' +
          pasos(['<b>Cliente</b>: elige la instalación programada. Se llenan solos los datos del comercial.',
            '<b>Número del equipo</b>: el número de la etiqueta (solo números, ej. 187 → EQP-187).',
            '<b>Modelo</b>, <b>tipo de espacio</b> y m² (opcional).',
            'Revisa <b>dirección, distrito e industria</b>.',
            '<b>Fragancia instalada</b> y <b>ml aplicados</b>.',
            '<b>Dos fotos</b>: el equipo instalado (que se vea el lugar) y el nivel del frasco.',
            'Observaciones y el cargo de conformidad.']) +
          '<p>Al enviar, el equipo entra a la cartera (REF_Clientes) y la solicitud queda como <b>Instalado</b>.</p>' },
        { id: 'incidencia', t: '⚠️ Incidencias', html:
          '<p><b>Cuándo:</b> atiendes un problema que reportó el comercial. Solo aparecen las incidencias <b>programadas</b>.</p>' +
          pasos(['<b>Incidencia</b>: elige la programada. Ves lo que reportó el comercial.',
            '<b>Severidad</b>: Baja (informativa), Media (seguimiento) o Alta (urgente).',
            '<b>¿Se aplicó fragancia?</b> Si sí, los ml. <b>¿Cuenta también como mantenimiento?</b> Si sí, pon el nivel al llegar: quedará registrado como visita de recarga.',
            '<b>Descripción del problema</b> y <b>acción tomada</b>.',
            '<b>Estado al cerrar</b>: Resuelto en campo, Pendiente de repuesto, Pendiente de revisión técnica, Equipo retirado o Escalado a gerencia. Y si hace falta <b>seguimiento</b>.',
            'Foto (recomendada en severidad media y alta) y el cargo de conformidad.']) },
        { id: 'salida', t: '📤 Salida de almacén', html:
          '<p><b>Cuándo:</b> sacas fragancia o un equipo del almacén.</p>' +
          pasos(['<b>Tipo de salida</b>: Fragancia, Equipo o Fragancia + equipo. <b>Para qué</b>: mantenimiento, instalación, retiro u otro.',
            'Fragancia y volumen en ml, y/o el equipo.',
            'Observaciones y foto (opcional).',
            '<b>Conformidad de salida</b>: quién te entrega en almacén firma con el dedo, y firmas tú.']) +
          '<p>El cargo queda en el Drive de ARDE (no se envía por correo a clientes).</p>' },
        { id: 'retiro', t: '🚚 Retiro', html:
          '<p><b>Cuándo:</b> te llevas un equipo porque el cliente se da de baja. Solo aparecen los retiros <b>programados</b>.</p>' +
          pasos(['Elige el <b>retiro programado</b> y confirma que es el equipo correcto.', 'Observaciones y <b>foto del equipo retirado</b>.', 'Cargo de conformidad: que el cliente firme la entrega del equipo.']) +
          ojo('Al enviar, el equipo sale de la cartera activa y pasa a "Historial de Retiros". Confirma bien el código antes de enviar.') },
        { id: 'cambio', t: '🔁 Cambio de equipo', html:
          '<p><b>Cuándo:</b> cambias un equipo por otro modelo, en el mismo lugar y con el mismo código. Solo aparecen los cambios <b>programados</b>.</p>' +
          pasos(['Elige el <b>cambio programado</b>: verás el modelo que sale y el que entra.', 'Observaciones.', 'Cargo de conformidad.']) },
        { id: 'traslado', t: '📍 Traslado', html:
          '<p><b>Cuándo:</b> mudas un equipo a otra dirección del mismo cliente. Solo aparecen los traslados <b>programados</b>.</p>' +
          pasos(['Elige el <b>traslado programado</b>: verás la dirección actual y la nueva.', 'Observaciones.', 'Cargo de conformidad (firma en la dirección nueva).']) +
          '<p>Al enviar, la dirección nueva queda en la cartera.</p>' },
      ],
    },

    // ==========================================================
    {
      id: 'comercial', ico: '💼', titulo: 'Manual comercial', sub: 'Solicitudes, luz verde y demos', roles: ['COMERCIAL'],
      secciones: [
        { id: 'flujo', t: '¿Qué pasa con mi solicitud?', html:
          pasos(['Envías la solicitud desde la app → recibes un <b>ticket</b> (INS, SOP, RET, CAM, TRA).', 'Si es contrato o autogestionado, Operaciones la <b>valida</b> (luz verde).', 'Operaciones la <b>programa</b>: técnico y fecha.', 'El técnico la ve en su app, la ejecuta y el cliente firma el cargo de conformidad, que le llega por correo.']) +
          tip('Guarda el número de ticket: es la forma más rápida de preguntar por una solicitud.') },
        { id: 'c_incidencia', t: '⚠️ Reportar incidencia', html:
          pasos(['<b>Equipo</b>: busca por cliente o código EQP.', '<b>Tipo</b>: fuga o derrame, equipo apagado, bajar o subir intensidad, cambio de fragancia (eliges la nueva), reclamo del cliente u <b>Otro</b> (descríbelo).', 'Envía. Operaciones la programa con un técnico.']) },
        { id: 'c_instalacion', t: '📦 Solicitar instalación', html:
          pasos(['<b>Cliente</b>: nombre, contacto, teléfono e industria.',
            '<b>Sedes</b>: cada local es una sede con su dirección, distrito, m², tipo de servicio, horario preferido y observaciones. Usa <b>+ Agregar sede</b> si son varios locales.',
            '<b>Equipos de cada sede</b>: modelo y fragancia preferida (y una foto del lugar si puedes). <b>+ Agregar equipo</b> para más de uno.',
            '<b>Tipo de servicio</b>: <b>Contrato</b> o <b>Autogestionado</b> (llevan precio mensual) o <b>Demo</b> (sin precio).',
            '<b>Luz verde</b> (solo contrato y autogestionado), ver la sección siguiente.']) },
        { id: 'luz-verde', t: '✅ Luz verde para instalar', html:
          '<p>Por lineamiento de gerencia, <b>no se instala un contrato ni un autogestionado sin luz verde</b>. Las demos no la necesitan.</p>' +
          tabla([['Caso', 'Qué marcas', 'Qué adjuntas'],
            ['Cliente que ya tiene equipos', '¿Es cliente existente? <b>Sí</b>', 'Nada'],
            ['Cliente nuevo que ya pagó', '<b>Pago anticipado</b>', 'Monto, N° de operación, fecha y foto del voucher'],
            ['Cliente nuevo a crédito', '<b>Aprobación de gerencia</b>', 'Fecha y captura del correo de gerencia (que se vea quién aprueba, el cliente y la fecha)']]) +
          '<p>Operaciones valida y recién ahí el técnico la ve programada.</p>' },
        { id: 'c_demo', t: '🎁 Demo a contrato', html:
          '<p><b>Cuándo:</b> una demo termina. Elige el equipo en demo y responde <b>¿Ya se retiró el equipo?</b></p>' +
          campos([['Sí, ya se recogió', 'Pon la fecha de retiro. El equipo sale de la cartera.'],
            ['No, se queda', 'Elige si pasa a <b>Contrato</b> o <b>Autogestionado</b>, la <b>renta mensual</b> y adjunta el <b>comprobante de pago</b> (obligatorio para la recarga inicial).']]) },
        { id: 'c_retiro', t: '🚚 Solicitar retiro', html: pasos(['Elige el equipo.', 'Motivo: cerró negocio, no renovó, falta de pago, cambio de proveedor u otro.', 'Observaciones (horario, contacto, etc.).']) },
        { id: 'c_cambio', t: '🔁 Solicitar cambio de equipo', html: pasos(['Elige el equipo actual.', 'Modelo nuevo.', 'Motivo del cambio.']) },
        { id: 'c_traslado', t: '📍 Solicitar traslado', html: pasos(['Elige el equipo.', 'Dirección y distrito nuevos.', 'Dónde se instalará dentro del local nuevo.']) },
      ],
    },

    // ==========================================================
    {
      id: 'supervisor', ico: '🤝', titulo: 'Manual del supervisor', sub: 'Prioridades, visitas y Cliente Feliz', roles: ['SUPERVISOR'],
      secciones: [
        { id: 'sup_prioridades', t: '🎯 Prioridades', html:
          '<p>Lista de <b>clientes con incidencias</b>: 3 o más incidencias en los últimos 60 días, o una incidencia abierta hace más de 7 días. Arriba los más críticos.</p>' +
          lista(['Cada tarjeta muestra incidencias en 60 días, abiertas y número de equipos.', 'Toca un cliente para abrir la visita con todo llenado.']) +
          tip('Planifica tu ruta del día con esta lista antes de salir.') },
        { id: 'sup_visita', t: '🤝 Visita a cliente', html:
          pasos(['<b>Motivo</b> (puedes marcar varios): Cliente Feliz, Incidencias u Otro.',
            '<b>Cliente</b>: se busca en la cartera. Verás dirección, equipos e incidencias recientes.',
            'Llena las tarjetas del motivo (abajo).',
            '<b>Hallazgos</b> (obligatorio), <b>acuerdos</b> y una foto.',
            'Acta: observaciones, firma del cliente, su correo y tu firma.']) +
          '<p>Al enviar queda en <b>VISITAS_SUPERVISION</b> y el cliente recibe el <b>Acta de visita</b> en PDF.</p>' },
        { id: 'cliente-feliz', t: '😊 Cliente Feliz', html:
          '<p>Dos partes: lo que <b>responde el cliente</b> (experiencia 1–5, presencia del aroma, cómo lo describe, rapidez de respuesta, cómo se siente para los próximos meses, recomendación 0–10 y qué mejorar) y lo que <b>observas tú</b> (aroma percibido, ubicación, factores y observaciones técnicas).</p>' +
          tip('Haz las preguntas tal cual y anota las respuestas en palabras del cliente. Se graba en el mismo Sheet de Cliente Feliz de siempre.') },
        { id: 'sup-incidencias', t: '⚠️ Incidencias recurrentes', html:
          '<p>Verás las últimas incidencias del cliente. Indica la <b>causa principal</b> según tu visita y la <b>acción a seguir</b> (resuelto, programar visita técnica, cambio de fragancia, cambio o reubicación, escalar a gerencia).</p>' },
      ],
    },

    // ==========================================================
    {
      id: 'admin', ico: '🧭', titulo: 'Administración', sub: 'Para Operaciones: usuarios, validación y control', roles: ['ADMIN'],
      secciones: [
        { id: 'circuito', t: 'El circuito completo', html:
          pasos(['Comercial envía la solicitud (app) → fila en su hoja con ticket.', 'Si es contrato/autogestionado: te llega el correo <b>[Validar]</b> → <b>Validar con un clic</b> (marca VALIDADO_OPS = SÍ).', 'Programas: técnico asignado, fecha y <b>Estado = PROGRAMADO</b>.', 'El técnico lo ve en su app, lo ejecuta y el estado cambia solo (Instalado, Retirado…).', 'El cliente recibe el cargo en PDF; todo queda en LOG_APP y CONFORMIDADES.']) +
          tabla([['Hoja', 'Columna de estado para que el técnico lo vea'],
            ['SOLICITUD_INSTALACION', 'T = PROGRAMADO (+ AB = SÍ si no es Demo)'],
            ['INCIDENCIAS', 'Q = Programado'],
            ['SOLICITUD_RETIRO', 'L = Programado'],
            ['SOLICITUD_CAMBIO', 'M = Programado'],
            ['Solicitud_Traslado', 'M = Programado']]) },
        { id: 'usuarios', t: 'Usuarios y PINs (USUARIOS_APP)', html:
          campos([['Agregar a alguien', 'Fila nueva: NOMBRE (para técnicos "Nombre Apellido - Lima"), ROL (TECNICO, COMERCIAL, SUPERVISOR o ADMIN), PIN de <b>4 dígitos</b> que no se repita, ACTIVO = SÍ.'],
            ['Dar de baja', 'ACTIVO = NO. Pierde acceso en máximo 5 minutos.'],
            ['Cambiar PIN', 'Edítalo en la columna PIN.']]) +
          ojo('El nombre de USUARIOS_APP es el que queda en todos los registros. Escríbelo igual siempre.') },
        { id: 'resumen', t: 'Resumen de las 7 p.m.', html:
          lista(['Registros por persona y cuántos sin GPS.', '<b>Solicitudes que ya no están en su hoja</b> (alguien borró una fila): recupérala desde Historial de versiones.', 'Instalaciones esperando validación (con link para validar).', 'Programados pendientes y mantenimientos vencidos.', 'Cargos de conformidad: sin firma del cliente por técnico y envíos con error.', 'Visitas de supervisión del día.', 'Registros rechazados.']) },
        { id: 'cargos', t: 'Cargos de conformidad y Drive', html:
          lista(['PDFs en Drive: <b>ARDE · Cargos de conformidad / módulo / mes</b>.', 'Listado en la hoja <b>CONFORMIDADES</b> (link al PDF, firma, correo, envío).', 'Correos de clientes en <b>CORREOS_CLIENTES</b> (se pueden corregir a mano).']) },
        { id: 'hojas', t: 'Cuidado con las hojas', html:
          lista(['No borres ni limpies filas de las hojas de solicitudes: las columnas A–C muestran un aviso.', 'Para cancelar algo, cambia el Estado a <b>Cancelado</b> en vez de borrar.', 'En el editor de Apps Script, <b>revisarSolicitudesPerdidas</b> lista lo que la app registró y ya no está en su hoja.']) },
        { id: 'actualizar-servidor', t: 'Publicar cambios del servidor', html:
          pasos(['Pega el código nuevo en el proyecto <b>ARDE Campo API</b> y guarda.', '<b>Implementar → Gestionar implementaciones → ✏️ → Versión: Nueva → Implementar</b>.']) +
          ojo('Nunca uses "Nueva implementación": cambia la URL y la app deja de funcionar.') +
          '<p>La app (GitHub) se actualiza sola en los celulares: aparece "Nueva versión disponible".</p>' },
        { id: 'pc', t: 'Usar la app desde la PC', html:
          '<p>Abre el link con <b>?web=1</b> al final. Ese navegador queda habilitado; para quitarlo usa <b>?web=0</b>. No lo compartas con el equipo.</p>' },
        { id: 'cobranza', t: 'Cobranza (oculta en etapa 1)', html:
          '<p>La parte de morosos de Paul está apagada. Para activarla: en <b>Supervision.gs</b> cambia <code>COBRANZA_ACTIVA: false</code> a <code>true</code> y publica una versión nueva.</p>' },
      ],
    },
  ];

  // Manuales que ve un rol (ADMIN ve todos)
  A.manualesPara = function (rol) {
    return A.manuales.filter(function (m) { return rol === 'ADMIN' || !m.roles || m.roles.indexOf(rol) !== -1; });
  };
  // Sección de ayuda de un módulo (para el botón "¿Cómo se llena?")
  A.ayudaDe = function (moduloId) {
    for (var i = 0; i < A.manuales.length; i++) {
      var s = A.manuales[i].secciones.filter(function (x) { return x.id === moduloId; })[0];
      if (s) return { manual: A.manuales[i].id, seccion: s.id };
    }
    return null;
  };
})();
