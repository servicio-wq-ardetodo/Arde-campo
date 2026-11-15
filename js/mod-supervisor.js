// ============================================================
// ARDE Campo · módulos del supervisor (visitas a clientes)
// Prioridades: morosos (CXC de Cobranza) y clientes problema
// (3+ incidencias en 60 días o una abierta hace más de 7 días).
// La visita puede incluir la encuesta Cliente Feliz, que se graba
// en el mismo Sheet de Cliente Feliz de siempre.
// ============================================================
(function () {
  'use strict';
  var A = window.A, ui = A.ui, h = ui.h;
  A.modulos = A.modulos || {};

  // Opciones idénticas a las del formulario Cliente Feliz (para no romper el dashboard)
  var CF = {
    presencia: ['Sí, siempre', 'A veces se apaga', 'No, hay fallas seguidas'],
    aroma: ['Agradable', 'Perfecto', 'Muy intenso', 'Muy suave', 'Ya no me gusta'],
    velocidad: ['Muy rápido', 'Normal', 'A veces demoran', 'Nunca he necesitado contactarlos'],
    futuro: ['Muy contento, quiero seguir', 'Bien, aunque tengo algunas dudas', 'Quisiera conversar antes de continuar'],
    percibido: ['Sí, claro', 'Débil', 'No se percibe'],
    factores: ['Ninguno aparente', 'Frasco vacío o consumo agotado antes de tiempo', 'Corriente de aire / puerta o ventana abierta',
      'Equipo cerca de fuente de olores (cocina, baño)', 'Equipo apagado o desconfigurado', 'Espacio muy grande para el equipo', 'Aire acondicionado con mal olor'],
  };
  var MOTIVOS = [
    { v: 'Cliente Feliz', t: 'Cliente Feliz', s: 'Encuesta de satisfacción' },
    { v: 'Incidencias recurrentes', t: 'Incidencias', s: 'Problemas repetidos' },
    { v: 'Cobranza', t: 'Cobranza', s: 'Deuda vencida' },
    { v: 'Otro', t: 'Otro', s: 'Seguimiento, reclamo…' },
  ];
  var RESULTADO_COBRO = ['Pagó en el momento', 'Compromiso de pago', 'Dice que ya pagó (verificar)', 'No reconoce la deuda', 'No se ubicó al responsable'];
  var DIAGNOSTICO = ['Falla técnica del equipo', 'La fragancia no dura el mes', 'Intensidad mal configurada', 'Ubicación del equipo', 'Atención tardía de ARDE', 'Expectativa del cliente', 'Otro'];
  var ACCION = ['Resuelto en la visita', 'Programar visita técnica', 'Cambio de fragancia', 'Cambio o reubicación de equipo', 'Escalar a gerencia'];

  function soles(n) { return 'S/ ' + Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function tiene(e, m) { return (e.motivos || []).indexOf(m) !== -1; }
  function n(v) { var x = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(x) ? x : NaN; }
  function clienteDe(v, k) { return (v.clientes || []).filter(function (c) { return c.k === k; })[0] || null; }

  function etiquetas(c) {
    var t = [];
    if (c.deuda) t.push(h('span', { class: 'ptag err', text: soles(c.deuda.total) + ' · ' + c.deuda.diasMax + ' d' }));
    if (c.incAbiertas) t.push(h('span', { class: 'ptag warn', text: c.incAbiertas + ' abierta' + (c.incAbiertas > 1 ? 's' : '') + (c.incViejaDias > 7 ? ' · ' + c.incViejaDias + ' d' : '') }));
    if (c.inc60) t.push(h('span', { class: 'ptag' + (c.inc60 >= 3 ? ' warn' : ''), text: c.inc60 + ' inc. en 60 d' }));
    if (c.equipos && c.equipos.length) t.push(h('span', { class: 'ptag', text: c.equipos.length + ' equipo' + (c.equipos.length > 1 ? 's' : '') }));
    else if (c.deuda && /BAJA|INACTIVO/i.test(c.deuda.estadoCliente || '')) t.push(h('span', { class: 'ptag', text: 'Cliente de baja' }));
    return t;
  }

  function itemsClientes(v) {
    var l = (v.clientes || []).slice().sort(function (a, b) {
      var pa = a.moroso ? 0 : a.problema ? 1 : 2, pb = b.moroso ? 0 : b.problema ? 1 : 2;
      if (pa !== pb) return pa - pb;
      if (pa === 0) return (b.deuda.total || 0) - (a.deuda.total || 0);
      if (pa === 1) return (b.inc60 + b.incAbiertas * 2) - (a.inc60 + a.incAbiertas * 2);
      return String(a.cliente).localeCompare(String(b.cliente));
    });
    var out = l.map(function (c) {
      var tag = c.moroso ? soles(c.deuda.total) : c.problema ? (c.inc60 + ' inc.') : (c.equipos || []).length + ' eq.';
      return { v: c.k, t: c.cliente, s: [String(c.distrito || '').split(',')[0], c.ruc ? 'RUC ' + c.ruc : ''].filter(Boolean).join(' · ') || 'Sin dirección registrada',
        tag: tag, tagCls: c.moroso ? 'inact' : '', group: c.moroso ? 'Morosos' : c.problema ? 'Clientes problema' : 'Resto de la cartera',
        buscar: [c.cliente, c.ruc, c.razon, c.distrito, (c.equipos || []).join(' ')].join(' '), c: c };
    });
    out.push({ v: '_otro', t: 'Otro cliente (no está en la lista)', s: 'Escribir el nombre', group: 'Otro' });
    return out;
  }

  // ============================================================
  // PRIORIDADES (solo lectura) → toca un cliente para visitarlo
  // ============================================================
  A.modulos.sup_prioridades = {
    id: 'sup_prioridades', rol: 'SUPERVISOR', titulo: 'Prioridades', sub: 'Morosos y clientes problema', ico: '🎯', hue: 'red',
    soloLectura: true,
    contar: function (v) { return (v.clientes || []).filter(function (c) { return (c.moroso && (c.equipos || []).length) || c.problema; }).length; },
    vista: function (c) {
      var v = c.vista;
      var morosos = (v.clientes || []).filter(function (x) { return x.moroso; }).sort(function (a, b) { return b.deuda.total - a.deuda.total; });
      var problema = (v.clientes || []).filter(function (x) { return x.problema && !x.moroso; }).sort(function (a, b) { return (b.inc60 + b.incAbiertas * 2) - (a.inc60 + a.incAbiertas * 2); });
      var suma = function (l) { return l.reduce(function (s, x) { return s + x.deuda.total; }, 0); };
      var conEq = morosos.filter(function (x) { return (x.equipos || []).length; });
      var sinEq = morosos.filter(function (x) { return !(x.equipos || []).length; });
      var tarjeta = function (x) {
        return h('button', { class: 'prio-item', onclick: function () { c.abrir('sup_visita', { cliente: x.k, motivos: x.moroso ? ['Cobranza'].concat(x.problema ? ['Incidencias recurrentes'] : []) : ['Incidencias recurrentes'] }); } },
          h('b', { text: x.cliente }),
          h('small', { text: [x.direccion, String(x.distrito || '').split(',')[0]].filter(Boolean).join(' · ') || (x.razon || '') }),
          h('div', { class: 'prio-tags' }, etiquetas(x)));
      };
      var vacio = function (t) { return h('div', { class: 'empty' }, h('div', { class: 'e-ico', text: '✅' }), t); };
      return [
        v.cobranzaError ? h('div', { class: 'banner warn' }, h('span', { class: 'bi', text: '⚠️' }), h('div', null, h('b', { text: 'No se pudo leer Cobranza' }), v.cobranzaError)) : null,
        h('div', { class: 'group-title', text: 'Morosos con equipo instalado · ' + conEq.length + ' · ' + soles(suma(conEq)) }),
        h('div', { class: 'prio' }, conEq.length ? conEq.map(tarjeta) : vacio('Sin deuda vencida')),
        h('div', { class: 'group-title', text: 'Clientes problema · ' + problema.length }),
        h('div', { class: 'hint', style: { margin: '-4px 2px 10px' }, text: '3 o más incidencias en 60 días, o una incidencia abierta hace más de 7 días.' }),
        h('div', { class: 'prio' }, problema.length ? problema.map(tarjeta) : vacio('Ningún cliente problema')),
        sinEq.length ? h('div', { class: 'group-title', text: 'Deuda de clientes sin equipo (bajas) · ' + sinEq.length + ' · ' + soles(suma(sinEq)) }) : null,
        sinEq.length ? h('div', { class: 'prio' }, sinEq.map(tarjeta)) : null,
      ];
    },
  };

  // ============================================================
  // VISITA A CLIENTE
  // ============================================================
  A.modulos.sup_visita = {
    id: 'sup_visita', rol: 'SUPERVISOR', titulo: 'Visita a cliente', sub: 'Cliente Feliz, incidencias, cobranza', ico: '🤝', hue: 'green',
    boton: 'Registrar visita',
    vista: function (c) {
      var f = c.f, e = c.estado, v = c.vista;
      var cli = function () { return clienteDe(v, e.cliente); };
      var esCF = function () { return tiene(e, 'Cliente Feliz'); };
      var esInc = function () { return tiene(e, 'Incidencias recurrentes'); };
      var esCob = function () { return tiene(e, 'Cobranza'); };
      var otro = function () { return e.cliente === '_otro'; };
      return [
        f.card('Cliente', '1', [
          f.pick('cliente', 'Cliente visitado', { req: true, titulo: 'Clientes', ph: 'Buscar cliente', buscarPh: 'Nombre, RUC, distrito o EQP', items: function () { return itemsClientes(v); } }),
          f.si(otro, [f.text('clienteOtro', 'Nombre del cliente', { req: otro, ph: 'Nombre comercial' }), f.text('direccionOtro', 'Dirección', { ph: 'Opcional' })]),
          f.datos(function () {
            var x = cli(); if (!x) return [];
            var d = x.deuda;
            return [
              ['Dirección', [x.direccion, x.distrito].filter(Boolean).join(' · '), '', true],
              ['Equipos', (x.equipos || []).join(', ') || 'Sin equipos en cartera', '', true],
              ['Tipo de servicio', x.tipo ? ui.pillServicio(x.tipo) : '—'],
              ['Incidencias 60 días', String(x.inc60 || 0), x.inc60 >= 3 ? 'err' : ''],
              d ? ['Deuda vencida', soles(d.total) + ' · ' + d.docs + ' doc.', 'err'] : ['Deuda vencida', 'Al día', 'ok'],
              d ? ['Atraso máximo', d.diasMax + ' días', d.diasMax > 30 ? 'err' : 'warn'] : null,
              d && d.estadoCliente ? ['Estado en Cobranza', d.estadoCliente] : null,
              d && d.celular ? ['Celular (cobranza)', d.celular] : null,
              d && d.asesor ? ['Asesor', d.asesor] : null,
            ];
          }),
        ]),
        f.card('Motivo de la visita', '2', [
          f.multi('motivos', null, MOTIVOS, { req: true }),
          f.si(function () { return tiene(e, 'Otro'); }, [f.text('motivoOtro', 'Especifica', { req: function () { return tiene(e, 'Otro'); } })]),
        ]),
        f.si(esCF, [f.card('Cliente Feliz · lo que responde el cliente', null, [
          f.seg('cfSat', '¿Cómo calificarías tu experiencia con ARDE?', [1, 2, 3, 4, 5].map(function (x) { return { v: String(x), t: '★ ' + x }; }), { req: esCF, cls: 'estrellas' }),
          f.seg('cfPresencia', '¿El aroma siempre está presente cuando llegas?', CF.presencia.map(function (x) { return { v: x, t: x }; }), { req: esCF, cls: 'wrap full' }),
          f.seg('cfAroma', '¿Cómo describirías el aroma de tu espacio?', CF.aroma.map(function (x) { return { v: x, t: x }; }), { req: esCF, cls: 'wrap' }),
          f.seg('cfVelocidad', '¿El equipo de ARDE responde rápido cuando lo necesitas?', CF.velocidad.map(function (x) { return { v: x, t: x }; }), { req: esCF, cls: 'wrap' }),
          f.seg('cfFuturo', '¿Cómo te sientes con el servicio de cara a los próximos meses?', CF.futuro.map(function (x) { return { v: x, t: x }; }), { req: esCF, cls: 'wrap full' }),
          f.seg('cfNps', '¿Qué tan probable es que nos recomiendes? (0 a 10)', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(function (x) { return { v: String(x), t: String(x) }; }), { req: esCF, cls: 'escala' }),
          f.area('cfMejora', '¿Hay algo que podemos mejorar?', { ph: 'En palabras del cliente' }),
        ])]),
        f.si(esCF, [f.card('Cliente Feliz · lo que observas tú', null, [
          f.seg('cfPercibido', 'Aroma percibido al llegar', CF.percibido.map(function (x) { return { v: x, t: x }; }), { req: esCF }),
          f.text('cfUbicacion', 'Ubicación del equipo', { ph: 'Ej. recepción, al costado de la puerta' }),
          f.multi('cfFactores', 'Factores detectados', CF.factores, { req: esCF, unico: ['Ninguno aparente'], cls: 'wrap full' }),
          f.area('cfObsTec', 'Observaciones técnicas', { ph: 'Estado del equipo, frasco, configuración…' }),
        ])]),
        f.si(esInc, [f.card('Incidencias recurrentes', null, [
          f.calc(function () {
            var x = cli(); if (!x || !(x.incs || []).length) return '<div class="hint">Sin incidencias registradas en los últimos 60 días.</div>';
            return h('ul', { class: 'lista-mini' }, x.incs.map(function (i) {
              return h('li', null, h('b', { text: (i.ticket || 'Sin ticket') + ' · ' + (i.tipo || '') }), h('small', { text: [i.fecha, i.estado || 'Abierta', i.desc].filter(Boolean).join(' · ') }));
            }));
          }),
          h('div', { style: { height: '10px' } }),
          f.select('incDiag', 'Causa principal (según tu visita)', DIAGNOSTICO, { req: esInc }),
          f.select('incAccion', 'Acción a seguir', ACCION, { req: esInc }),
        ])]),
        f.si(esCob, [f.card('Cobranza', null, [
          f.datos(function () {
            var x = cli(), d = x && x.deuda; if (!d) return [['Deuda vencida', 'Sin deuda registrada en Cobranza', 'ok', true]];
            return [['Total vencido', soles(d.total), 'err'], ['Documentos', String(d.docs)], ['Razón social', d.razon, '', true],
              ['Vence desde', d.desde], ['Atraso máximo', d.diasMax + ' días']];
          }),
          h('div', { style: { height: '10px' } }),
          f.select('cobResultado', 'Resultado', RESULTADO_COBRO, { req: esCob }),
          f.si(function () { return e.cobResultado === 'Compromiso de pago' || e.cobResultado === 'Pagó en el momento'; }, [h('div', { class: 'row2' },
            f.num('cobMonto', 'Monto (S/)', { req: function () { return esCob() && /Compromiso|Pagó/.test(e.cobResultado || ''); }, ph: '0.00' }),
            f.date('cobFecha', 'Fecha de pago', { req: function () { return esCob() && e.cobResultado === 'Compromiso de pago'; } }))]),
        ])]),
        f.card('Resumen de la visita', '3', [
          f.area('hallazgos', 'Hallazgos', { req: true, ph: 'Qué encontraste y qué te dijo el cliente' }),
          f.area('acuerdos', 'Acuerdos', { ph: 'Qué se acordó, quién lo hace y para cuándo' }),
          f.foto('foto', 'Foto', { camara: true, titulo: 'Foto del equipo o del local', sub: esCF() ? 'Se guarda también en Cliente Feliz' : 'Recomendada' }),
        ]),
      ];
    },
    revisar: function (c) {
      var e = c.estado, av = [];
      if (tiene(e, 'Cobranza') && /Compromiso|Pagó/.test(e.cobResultado || '') && !(n(e.cobMonto) > 0)) return c.f.error('cobMonto', 'Ingresa el monto');
      if (e.cobResultado === 'Compromiso de pago' && e.cobFecha && e.cobFecha < A.hoyLima()) return c.f.error('cobFecha', 'La fecha ya pasó');
      if (tiene(e, 'Cliente Feliz') && !e.foto) av.push('Cliente Feliz sin foto del equipo.');
      return { avisos: av };
    },
    armar: function (c) {
      var e = c.estado, x = clienteDe(c.vista, e.cliente) || {}, otro = e.cliente === '_otro';
      var cf = tiene(e, 'Cliente Feliz'), cob = tiene(e, 'Cobranza'), inc = tiene(e, 'Incidencias recurrentes');
      return {
        modulo: 'sup_visita',
        resumen: { t: otro ? e.clienteOtro : x.cliente, s: (e.motivos || []).join(' · ') },
        datos: {
          cliente: otro ? e.clienteOtro : x.cliente, ruc: x.ruc || '', razon: x.deuda ? x.deuda.razon : '',
          direccion: otro ? (e.direccionOtro || '') : x.direccion || '', distrito: otro ? '' : x.distrito || '',
          equipos: (x.equipos || []).join(', '), motivos: (e.motivos || []).map(function (m) { return m === 'Otro' ? 'Otro: ' + (e.motivoOtro || '') : m; }).join(' · '),
          deudaAlVisitar: x.deuda ? x.deuda.total : 0, inc60: x.inc60 || 0,
          hallazgos: e.hallazgos, acuerdos: e.acuerdos || '',
          incDiagnostico: inc ? e.incDiag : '', incAccion: inc ? e.incAccion : '',
          cobResultado: cob ? e.cobResultado : '', cobMonto: cob && e.cobMonto ? n(e.cobMonto) : '', cobFecha: cob ? (e.cobFecha || '') : '',
          clienteFeliz: cf ? {
            sat: e.cfSat, presencia: e.cfPresencia, aroma: e.cfAroma, velocidad: e.cfVelocidad, futuro: e.cfFuturo, nps: e.cfNps,
            mejora: e.cfMejora || '', percibido: e.cfPercibido, ubicacion: e.cfUbicacion || '', factores: (e.cfFactores || []).join(', '), obsTec: e.cfObsTec || '',
          } : null,
          fotoBase64: A.base64(e.foto), fotoMime: e.foto && e.foto.mime, fotoNombre: e.foto && e.foto.nombre,
        },
      };
    },
  };

  // Acta con firma del cliente y del supervisor → PDF en Drive y al correo del cliente
  A.conConformidad(A.modulos.sup_visita, {
    tipo: 'visita', rolFirma: 'supervisor', tituloCard: 'Conformidad de la visita', subFirma: 'Firma el acta',
    info: function (c) {
      var e = c.estado, x = clienteDe(c.vista, e.cliente) || {}, otro = e.cliente === '_otro';
      var filas = [['Motivo', (e.motivos || []).map(function (m) { return m === 'Otro' ? 'Otro: ' + (e.motivoOtro || '') : m; }).join(' · ')],
        ['Equipos', (x.equipos || []).join(', ')]];
      if (tiene(e, 'Cliente Feliz')) filas.push(['Satisfacción', e.cfSat ? e.cfSat + ' de 5' : ''], ['Recomendación', e.cfNps ? e.cfNps + ' de 10' : '']);
      if (tiene(e, 'Incidencias recurrentes')) filas.push(['Causa identificada', e.incDiag], ['Acción a seguir', e.incAccion]);
      if (tiene(e, 'Cobranza')) filas.push(['Cobranza', e.cobResultado + (e.cobMonto ? ' · ' + soles(n(e.cobMonto)) : '') + (e.cobFecha ? ' · ' + e.cobFecha.split('-').reverse().join('/') : '')]);
      filas.push(['Hallazgos', e.hallazgos], ['Acuerdos', e.acuerdos]);
      return { cliente: otro ? e.clienteOtro : x.cliente, direccion: otro ? e.direccionOtro : [x.direccion, x.distrito].filter(Boolean).join(' · '),
        idEquipo: '', referencia: otro ? e.clienteOtro : x.cliente, filas: filas };
    },
  });
})();
