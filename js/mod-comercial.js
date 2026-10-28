// ============================================================
// ARDE Campo · módulos comerciales
// Misma lógica de negocio que el Formulario Comercial (Apps Script)
// ============================================================
(function () {
  'use strict';
  var A = window.A, ui = A.ui, h = ui.h;
  A.modulos = A.modulos || {};

  var TIPOS_INC = [
    { v: 'Fuga / derrame', t: 'Fuga / derrame', ico: '💧' }, { v: 'Equipo apagado', t: 'Equipo apagado', ico: '⚡' },
    { v: 'Bajar intensidad', t: 'Bajar intensidad', ico: '🔉' }, { v: 'Subir intensidad', t: 'Subir intensidad', ico: '🔊' },
    { v: 'Cambio fragancia', t: 'Cambio fragancia', ico: '🔄' }, { v: 'Reclamo cliente', t: 'Reclamo cliente', ico: '🗣️' },
    { v: 'Otro', t: 'Otro', ico: '✏️' },
  ];
  var MOTIVOS_RETIRO = ['Cliente cerró negocio', 'No renovó contrato', 'Falta de pago', 'Cambio de proveedor', 'Otro'];
  var TIPOS_SERVICIO = [{ v: 'Contrato', t: 'Contrato' }, { v: 'Demo', t: 'Demo' }, { v: 'Autogestionado', t: 'Autogestion.', s: '' }];

  function n(v) { var x = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(x) ? x : NaN; }
  function llevaPrecio(t) { return t === 'Contrato' || t === 'Autogestionado'; }

  function equipoCard(f, e, v, opts) {
    opts = opts || {};
    var lista = function () { return opts.filtro ? (v.equipos || []).filter(opts.filtro) : v.equipos; };
    return f.card(opts.titulo || 'Equipo del cliente', '1', [
      f.pick('equipo', 'Equipo', { req: true, contar: true, titulo: 'Buscar equipo', ph: opts.ph || 'Buscar cliente o código',
        buscarPh: 'Cliente, EQP, distrito o modelo', vacio: opts.vacio, items: function () { return ui.itemsEquipos(lista()); } }),
      f.datos(function () {
        var x = A.equipo(v, e.equipo); if (!x) return [];
        return [['Cliente', x.cliente, '', true], ['Modelo', x.modelo], ['Tipo de servicio', ui.pillServicio(x.tipoContrato)],
          ['Dirección', x.direccion, '', true], ['Distrito', x.distrito], ['Fragancia', x.fragancia]];
      }),
    ]);
  }

  // Bloque de comprobante de pago (pago anticipado) reutilizable
  function bloquePago(f, req) {
    return [
      h('div', { class: 'row2' },
        f.num('lvMonto', 'Monto pagado (S/)', { req: req, ph: '180' }),
        f.text('lvOper', 'N° de operación', { req: req, ph: '004512' })),
      f.date('lvFecha', 'Fecha del pago', { req: req }),
      f.foto('lvVoucher', 'Voucher o constancia', { req: req, accept: 'image/*,application/pdf', titulo: 'Adjuntar voucher', sub: 'Foto, captura o PDF', listo: 'Voucher listo' }),
    ];
  }
  function leerPago(e) {
    return { condicion: 'Pago anticipado', monto: n(e.lvMonto), operacion: String(e.lvOper || '').trim(), fecha: e.lvFecha,
      sustentoBase64: A.base64(e.lvVoucher), sustentoMime: e.lvVoucher && e.lvVoucher.mime, sustentoNombre: e.lvVoucher && e.lvVoucher.nombre };
  }

  // ============================================================
  // 1. INCIDENCIA
  // ============================================================
  A.modulos.c_incidencia = {
    id: 'c_incidencia', rol: 'COMERCIAL', titulo: 'Reportar incidencia', sub: 'Problema de un cliente', ico: '⚠️', hue: 'red',
    boton: 'Enviar incidencia',
    vista: function (c) {
      var f = c.f, e = c.estado, v = c.vista;
      return [
        equipoCard(f, e, v),
        f.card('Qué pasa', '2', [
          f.seg('tipo', 'Tipo de incidencia', TIPOS_INC, { req: true, cls: 'tiles' }),
          f.si(function () { return e.tipo === 'Cambio fragancia'; }, [
            f.pick('nuevaFrag', 'Nueva fragancia', { req: function () { return e.tipo === 'Cambio fragancia'; }, items: function () { return A.itemsFragancias(v); }, icono: 'down' })]),
          f.si(function () { return e.tipo === 'Otro'; }, [
            f.area('otro', 'Describe la incidencia', { req: function () { return e.tipo === 'Otro'; }, ph: 'Qué reporta el cliente' })]),
        ]),
      ];
    },
    armar: function (c) {
      var e = c.estado, x = A.equipo(c.vista, e.equipo) || {};
      return {
        modulo: 'c_incidencia', resumen: { t: x.cliente, s: x.id + ' · ' + e.tipo },
        datos: { idEquipo: x.id, cliente: x.cliente, modelo: x.modelo, direccion: x.direccion, distrito: x.distrito, fraganciaEquipo: x.fragancia,
          tipoIncidencia: e.tipo, nuevaFragancia: e.tipo === 'Cambio fragancia' ? e.nuevaFrag : '', tipoOtro: e.tipo === 'Otro' ? e.otro : '' },
      };
    },
  };

  // ============================================================
  // 2. SOLICITUD DE INSTALACIÓN (varias sedes y equipos + luz verde)
  // ============================================================
  function nuevaSede() { return { id: A.uuid().slice(0, 8), equipos: [nuevoEquipo()] }; }
  function nuevoEquipo() { return { id: A.uuid().slice(0, 8) }; }

  A.modulos.c_instalacion = {
    id: 'c_instalacion', rol: 'COMERCIAL', titulo: 'Solicitar instalación', sub: 'Cliente nuevo o sede nueva', ico: '➕', hue: 'green',
    boton: 'Enviar solicitud',
    inicial: function () { return { sedes: [nuevaSede()] }; },
    vista: function (c) {
      var f = c.f, e = c.estado, v = c.vista;
      if (!e.sedes || !e.sedes.length) e.sedes = [nuevaSede()];
      c.subs = [];
      var tipos = function () { return e.sedes.map(function (s) { return s.tipo; }); };
      var requiereLv = function () { return tipos().some(llevaPrecio); };
      var noExistente = function () { return requiereLv() && e.ce === 'NO'; };
      var pago = function () { return noExistente() && e.lv === 'Pago anticipado'; };
      var aprob = function () { return noExistente() && e.lv === 'Aprobación gerencia'; };

      var cajaSedes = h('div');
      function pintarSedes() {
        cajaSedes.innerHTML = '';
        c.subs = [];
        e.sedes.forEach(function (sede, i) { cajaSedes.appendChild(bloqueSede(sede, i)); });
        cajaSedes.appendChild(h('button', { type: 'button', class: 'btn-add', html: ui.icon('plus') + ' Agregar otra sede', onclick: function () {
          e.sedes.push(nuevaSede()); pintarSedes(); f.cambio();
        } }));
      }
      function bloqueSede(sede, i) {
        var sf = ui.form(sede, function () { f.cambio(); });
        c.subs.push(sf);
        var cajaEq = h('div');
        function pintarEquipos() {
          cajaEq.innerHTML = '';
          sede.equipos.forEach(function (eq, j) {
            var ef = ui.form(eq, function () { f.cambio(); });
            c.subs.push(ef);
            cajaEq.appendChild(h('div', { class: 'sub-block' },
              h('div', { class: 'sb-h' }, h('b', { text: 'Equipo ' + (j + 1) }),
                sede.equipos.length > 1 ? h('button', { type: 'button', class: 'btn-x', text: 'Quitar', onclick: function () { sede.equipos.splice(j, 1); pintarEquipos(); f.cambio(); } }) : null),
              ef.select('modelo', 'Modelo', function () { return A.opcionesModelos(v); }, { req: true }),
              ef.si(function () { return eq.modelo === 'otro'; }, [ef.text('modeloOtro', 'Nombre del modelo', { req: function () { return eq.modelo === 'otro'; } })]),
              ef.pick('frag', 'Fragancia preferida', { items: function () { return A.itemsFragancias(v); }, icono: 'down', ph: 'Opcional' }),
              ef.foto('foto', 'Foto del lugar de instalación', { titulo: 'Adjuntar foto', sub: 'Opcional · ayuda al técnico' })));
          });
          cajaEq.appendChild(h('button', { type: 'button', class: 'btn-add', html: ui.icon('plus') + ' Otro equipo en esta sede', onclick: function () {
            sede.equipos.push(nuevoEquipo()); pintarEquipos(); f.cambio();
          } }));
        }
        pintarEquipos();
        return f.card(e.sedes.length > 1 ? 'Sede ' + (i + 1) : 'Sede', String(i + 2), [
          e.sedes.length > 1 ? h('div', { style: { textAlign: 'right', marginTop: '-8px' } }, h('button', { type: 'button', class: 'btn-x', text: 'Quitar sede', onclick: function () {
            e.sedes.splice(i, 1); pintarSedes(); f.cambio();
          } })) : null,
          sf.text('direccion', 'Dirección', { req: true, ph: 'Av. / Jr. / Calle y número' }),
          h('div', { class: 'row2' }, sf.select('distrito', 'Distrito', A.cfg.DISTRITOS, { req: true }), sf.num('m2', 'Metros²', { inputmode: 'numeric', ph: 'Opcional' })),
          sf.seg('tipo', 'Tipo de servicio', TIPOS_SERVICIO, { req: true }),
          sf.si(function () { return llevaPrecio(sede.tipo); }, [sf.num('precio', 'Precio acordado (S/ al mes)', { req: function () { return llevaPrecio(sede.tipo); }, ph: '180' })]),
          sf.seg('horario', 'Horario preferido', [{ v: 'AM', t: '☀️ Mañana' }, { v: 'PM', t: '🌙 Tarde' }], { toggle: true }),
          cajaEq,
          h('div', { style: { height: '12px' } }),
          sf.area('obs', 'Observaciones de la sede', { ph: 'Acceso, horarios, contexto de la venta…' }),
        ]);
      }
      pintarSedes();

      return [
        f.card('Cliente', '1', [
          f.text('cliente', 'Nombre del cliente', { req: true, ph: 'Local o empresa' }),
          h('div', { class: 'row2' }, f.text('contacto', 'Contacto', { ph: 'Persona' }), f.text('telefono', 'Teléfono', { inputmode: 'tel', ph: '9xx xxx xxx' })),
          f.select('industria', 'Industria', A.cfg.INDUSTRIAS, { req: true }),
        ]),
        cajaSedes,
        f.si(requiereLv, [f.card('Luz verde para instalar', '✓', [
          h('p', { class: 'hint', style: { marginTop: '-6px', marginBottom: '12px' } }, 'Contrato y Autogestionado no se programan sin pago confirmado o aprobación de gerencia. Las demos no necesitan este paso.'),
          f.seg('ce', '¿Es cliente existente?', [{ v: 'SI', t: 'Sí', s: 'Ya tiene equipos' }, { v: 'NO', t: 'No', s: 'Cliente nuevo' }], { req: requiereLv }),
          f.si(function () { return e.ce === 'SI'; }, [h('div', { class: 'banner ok', style: { marginBottom: 0 } }, h('span', { class: 'bi', text: '✅' }),
            h('div', null, 'No necesitas adjuntar pago ni aprobación. Operaciones valida antes de programar.'))]),
          f.si(noExistente, [
            f.seg('lv', 'Condición', [{ v: 'Pago anticipado', t: '💵 Pago anticipado', s: 'El cliente ya pagó' }, { v: 'Aprobación gerencia', t: '✉️ Aprobación', s: 'Correo de gerencia' }], { req: noExistente }),
            f.si(pago, bloquePago(f, pago)),
            f.si(aprob, [
              f.date('lvFechaC', 'Fecha del correo de aprobación', { req: aprob }),
              f.foto('lvCorreo', 'Captura del correo de gerencia', { req: aprob, accept: 'image/*,application/pdf', titulo: 'Adjuntar captura', sub: 'Que se vea quién aprueba, el cliente y la fecha', listo: 'Captura lista' }),
            ]),
          ]),
          f.si(function () { return requiereLv() && tipos().indexOf('Demo') !== -1; }, [h('div', { class: 'hint', style: { marginTop: '10px' } }, 'Esta solicitud mezcla Demo con otros servicios: el sustento aplica solo a las sedes que no son Demo.')]),
        ])]),
      ];
    },
    revisar: function (c) {
      for (var i = 0; i < (c.subs || []).length; i++) { var err = c.subs[i].validar(); if (err) return err; }
      var e = c.estado;
      if (e.ce === 'NO' && e.lv === 'Pago anticipado' && !(n(e.lvMonto) > 0)) return c.f.error('lvMonto', 'Ingresa el monto pagado');
      var total = e.sedes.reduce(function (s, x) { return s + x.equipos.length; }, 0);
      return { avisos: [], resumenEnvio: total + ' equipo(s) en ' + e.sedes.length + ' sede(s)' };
    },
    armar: function (c) {
      var e = c.estado;
      var requiereLv = e.sedes.some(function (s) { return llevaPrecio(s.tipo); });
      var lv = {};
      if (requiereLv) {
        if (e.ce === 'SI') lv = { condicion: 'Cliente existente' };
        else if (e.lv === 'Pago anticipado') lv = leerPago(e);
        else lv = { condicion: 'Aprobación gerencia', fecha: e.lvFechaC, sustentoBase64: A.base64(e.lvCorreo), sustentoMime: e.lvCorreo && e.lvCorreo.mime, sustentoNombre: e.lvCorreo && e.lvCorreo.nombre };
      }
      var total = 0;
      var sedes = e.sedes.map(function (s) {
        return {
          direccion: s.direccion, distrito: s.distrito, m2: s.m2 || '', tipoServicio: s.tipo,
          precioAcordado: llevaPrecio(s.tipo) ? n(s.precio) : '', horarioPreferido: s.horario || '', observaciones: s.obs || '',
          equipos: s.equipos.map(function (q) {
            total++;
            return { modelo: q.modelo === 'otro' ? (q.modeloOtro || 'OTRO') : q.modelo, fragancia: q.frag || '',
              fotoBase64: A.base64(q.foto), fotoMime: q.foto && q.foto.mime, fotoNombre: q.foto && q.foto.nombre };
          }),
        };
      });
      return {
        modulo: 'c_instalacion',
        resumen: { t: e.cliente, s: total + ' equipo(s) · ' + e.sedes.map(function (s) { return s.tipo; }).join(', ') },
        datos: { cliente: e.cliente, contacto: e.contacto || '', telefono: e.telefono || '', industria: e.industria, sedes: sedes, luzVerde: lv },
      };
    },
  };

  // ============================================================
  // 3. SOLICITUD DE RETIRO
  // ============================================================
  A.modulos.c_retiro = {
    id: 'c_retiro', rol: 'COMERCIAL', titulo: 'Solicitar retiro', sub: 'Cliente da de baja', ico: '📤', hue: 'amber',
    boton: 'Enviar solicitud',
    vista: function (c) {
      var f = c.f, e = c.estado, v = c.vista;
      return [
        equipoCard(f, e, v),
        f.card('Motivo', '2', [
          f.select('motivo', 'Motivo del retiro', MOTIVOS_RETIRO, { req: true }),
          f.area('obs', 'Observaciones', { ph: 'Contexto del retiro' }),
        ]),
      ];
    },
    armar: function (c) {
      var e = c.estado, x = A.equipo(c.vista, e.equipo) || {};
      return { modulo: 'c_retiro', resumen: { t: x.cliente, s: x.id + ' · ' + e.motivo },
        datos: { idEquipo: x.id, cliente: x.cliente, modelo: x.modelo, direccion: x.direccion, distrito: x.distrito, motivoRetiro: e.motivo, observaciones: e.obs || '' } };
    },
  };

  // ============================================================
  // 4. SOLICITUD DE CAMBIO DE EQUIPO
  // ============================================================
  A.modulos.c_cambio = {
    id: 'c_cambio', rol: 'COMERCIAL', titulo: 'Solicitar cambio', sub: 'Otro modelo de equipo', ico: '🔁', hue: 'teal',
    boton: 'Enviar solicitud',
    vista: function (c) {
      var f = c.f, e = c.estado, v = c.vista;
      return [
        equipoCard(f, e, v, { titulo: 'Equipo actual' }),
        f.card('Equipo nuevo', '2', [
          f.select('modeloNuevo', 'Modelo nuevo', function () { return A.opcionesModelos(v); }, { req: true }),
          f.si(function () { return e.modeloNuevo === 'otro'; }, [f.text('modeloOtro', 'Nombre del modelo', { req: function () { return e.modeloNuevo === 'otro'; } })]),
          f.area('motivo', 'Motivo del cambio', { req: true, ph: 'Por qué se pide el cambio' }),
        ]),
      ];
    },
    armar: function (c) {
      var e = c.estado, x = A.equipo(c.vista, e.equipo) || {};
      var nuevo = e.modeloNuevo === 'otro' ? (e.modeloOtro || 'OTRO') : e.modeloNuevo;
      return { modulo: 'c_cambio', resumen: { t: x.cliente, s: x.id + ' · ' + x.modelo + ' → ' + nuevo },
        datos: { idEquipo: x.id, cliente: x.cliente, modeloActual: x.modelo, modeloNuevo: nuevo, direccion: x.direccion, distrito: x.distrito, motivo: e.motivo } };
    },
  };

  // ============================================================
  // 5. SOLICITUD DE TRASLADO
  // ============================================================
  A.modulos.c_traslado = {
    id: 'c_traslado', rol: 'COMERCIAL', titulo: 'Solicitar traslado', sub: 'Cliente se muda', ico: '🚚', hue: 'indigo',
    boton: 'Enviar solicitud',
    vista: function (c) {
      var f = c.f, e = c.estado, v = c.vista;
      return [
        equipoCard(f, e, v),
        f.card('Nueva dirección', '2', [
          f.text('dirNueva', 'Dirección nueva', { req: true, ph: 'Av. / Jr. / Calle y número' }),
          f.select('distNuevo', 'Distrito', A.cfg.DISTRITOS, { req: true }),
          f.area('ubicacion', 'Dónde se instalará el equipo', { req: true, ph: 'Ej. recepción, junto a la puerta de ingreso' }),
        ]),
      ];
    },
    armar: function (c) {
      var e = c.estado, x = A.equipo(c.vista, e.equipo) || {};
      return { modulo: 'c_traslado', resumen: { t: x.cliente, s: x.id + ' → ' + String(e.distNuevo).split(',')[0] },
        datos: { idEquipo: x.id, cliente: x.cliente, modelo: x.modelo, direccionActual: x.direccion, distritoActual: x.distrito,
          direccionNueva: e.dirNueva, distritoNuevo: e.distNuevo, ubicacion: e.ubicacion } };
    },
  };

  // ============================================================
  // 6. PASAR DEMO A CONTRATO (o registrar que la demo se retiró)
  // ============================================================
  function esDemo(x) { var t = String(x.tipoContrato || '').toLowerCase().trim(); return t === 'demo' || t === 'prueba'; }

  A.modulos.c_demo = {
    id: 'c_demo', rol: 'COMERCIAL', titulo: 'Demo a contrato', sub: 'Cerrar una demo', ico: '🤝', hue: 'slate',
    boton: 'Continuar',
    contar: function (v) { return (v.equipos || []).filter(esDemo).length; },
    vista: function (c) {
      var f = c.f, e = c.estado, v = c.vista;
      var no = function () { return e.ret === 'NO'; }, si = function () { return e.ret === 'SI'; };
      if (!e.fechaRet) e.fechaRet = A.hoyLima();
      return [
        equipoCard(f, e, v, { titulo: 'Equipo en demo', filtro: esDemo, vacio: 'No hay equipos en demo', ph: 'Buscar demo por cliente o código' }),
        f.card('¿Ya se retiró el equipo?', '2', [
          f.seg('ret', null, [{ v: 'NO', t: 'No', s: 'El cliente se queda' }, { v: 'SI', t: 'Sí', s: 'Ya se recogió' }], { req: true }),
          f.si(si, [h('div', { style: { height: '12px' } }), f.date('fechaRet', 'Fecha de retiro', { req: si }),
            h('div', { class: 'banner warn', style: { marginBottom: 0 } }, h('span', { class: 'bi', text: '⚠️' }),
              h('div', null, 'El equipo saldrá de la cartera y pasará al Historial de Retiros.'))]),
        ]),
        f.si(no, [f.card('Nuevo servicio', '3', [
          f.seg('tipoNuevo', 'Pasa a', [{ v: 'Contrato', t: 'Contrato' }, { v: 'Autogestionado', t: 'Autogestionado' }], { req: no }),
          f.num('renta', 'Renta mensual (S/)', { req: no, ph: '180', hint: 'Se graba como precio mensual del equipo' }),
        ])]),
        f.si(no, [f.card('Comprobante de pago', '4', [
          h('p', { class: 'hint', style: { marginTop: '-6px', marginBottom: '12px' } }, 'Sin pago confirmado no se aplica la recarga inicial.'),
        ].concat(bloquePago(f, no)))]),
      ];
    },
    revisar: function (c) {
      var e = c.estado, x = A.equipo(c.vista, e.equipo);
      if (e.ret === 'SI') {
        return { confirmar: { titulo: '¿El equipo ya se retiró?', peligro: true, ok: 'Sí, mover al historial',
          html: '<p><b>' + ui.esc(x.id) + '</b> · ' + ui.esc(x.cliente) + '</p><p>Se borrará de la cartera y pasará al Historial de Retiros.</p>' } };
      }
      if (!(n(e.renta) > 0)) return c.f.error('renta', 'Ingresa la renta mensual');
      if (!(n(e.lvMonto) > 0)) return c.f.error('lvMonto', 'Ingresa el monto pagado');
      return null;
    },
    armar: function (c) {
      var e = c.estado, x = A.equipo(c.vista, e.equipo) || {};
      if (e.ret === 'SI') {
        return { modulo: 'c_demo_retiro', resumen: { t: x.cliente, s: x.id + ' · demo retirada' }, ref: { quitarEquipo: x.id },
          datos: { idEquipo: x.id, fechaRetiro: e.fechaRet } };
      }
      return { modulo: 'c_demo_contrato', resumen: { t: x.cliente, s: x.id + ' · ' + e.tipoNuevo + ' S/ ' + n(e.renta) },
        ref: { equipo: { id: x.id, cambios: { tipoContrato: e.tipoNuevo } } },
        datos: { idEquipo: x.id, tipoNuevo: e.tipoNuevo, precio: n(e.renta), luzVerde: leerPago(e) } };
    },
  };
})();
