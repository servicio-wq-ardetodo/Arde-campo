// ============================================================
// ARDE Campo · módulos del técnico
// Misma lógica de negocio que el Formulario Técnico (Apps Script)
// ============================================================
(function () {
  'use strict';
  var A = window.A, ui = A.ui, h = ui.h;
  A.modulos = A.modulos || {};

  var SI_NO = [{ v: 'Sí', t: 'Sí' }, { v: 'No', t: 'No' }];
  var ESTADOS_CIERRE = ['Resuelto en campo', 'Pendiente de repuesto', 'Pendiente de revisión técnica', 'Equipo retirado', 'Escalado a gerencia'];
  var SEGUIMIENTO = ['No — cerrado', 'Sí — llamar en 48h', 'Sí — revisita en 7 días', 'Sí — esperar repuesto'];

  // ── Ayudas compartidas ──
  A.itemsFragancias = function (vista) {
    var lista = (vista.fragancias || []).slice().sort(function (a, b) {
      if (a.estado !== b.estado) return a.estado === 'ACTIVO' ? -1 : 1;
      return String(a.nombre).localeCompare(String(b.nombre));
    });
    return lista.map(function (f) { return { v: f.nombre, t: f.nombre, group: f.estado === 'ACTIVO' ? 'Activas (con consumo)' : 'Sin consumo (en stock)' }; });
  };
  A.opcionesModelos = function (vista) {
    var ops = [];
    (vista.modelos || []).forEach(function (m) { ops.push({ v: m.codigo, t: m.codigo, group: m.legacy ? 'Legacy (cartera activa)' : 'Activos' }); });
    ops.sort(function (a, b) { return a.group === b.group ? 0 : (a.group === 'Activos' ? -1 : 1); });
    ops.push({ v: 'otro', t: 'Otro (especificar)', group: 'Otro' });
    return ops;
  };
  A.equipo = function (vista, id) { return (vista.equipos || []).filter(function (e) { return e.id === id; })[0] || null; };

  function diasTxt(e) {
    var d = A.diasDesde(e && e.ultVisita);
    if (d == null) return ['Sin registro', ''];
    return [d + ' días', d > 45 ? 'err' : d > 35 ? 'warn' : 'ok'];
  }
  function itemsProgramados(lista, sub) {
    return (lista || []).map(function (x) {
      return { v: String(x.fila), t: x.cliente || x.idEquipo, s: sub(x), tag: x.ticket, buscar: [x.ticket, x.idEquipo, x.cliente, x.direccion].join(' '), x: x };
    });
  }
  function programado(vista, mod, fila) {
    return ((vista.programados || {})[mod] || []).filter(function (x) { return String(x.fila) === String(fila); })[0] || null;
  }
  function n(v) { var x = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(x) ? x : NaN; }

  // Avisos de calidad: visita repetida hoy y lecturas fuera del tanque
  function avisosVisita(vista, cola, eq, llegada, recarga) {
    var av = [];
    if (!eq) return av;
    var hoy = A.hoyLima();
    var yaHoy = A.fechaLima(eq.ultVisita) === hoy || (cola || []).some(function (it) {
      return it.estado !== 'rechazado' && A.fechaLima(new Date(it.creado).toISOString()) === hoy &&
        it.ref && it.ref.equipo && it.ref.equipo.id === eq.id && it.ref.equipo.cambios && it.ref.equipo.cambios.ultVisita;
    });
    if (yaHoy) av.push('<b>' + ui.esc(eq.id) + '</b> ya tiene una visita registrada <b>hoy</b>. ¿Es una segunda visita real?');
    var m = A.modelo(vista, eq.modelo);
    if (m && m.tanque) {
      if (llegada > m.tanque) av.push('Al llegar (' + llegada + ' ml) es más de lo que cabe en el tanque del ' + ui.esc(m.codigo) + ' (' + m.tanque + ' ml).');
      else if (llegada + recarga > m.tanque * 1.1) av.push('Al salir quedaría en ' + (llegada + recarga) + ' ml y el tanque del ' + ui.esc(m.codigo) + ' es de ' + m.tanque + ' ml.');
    }
    return av;
  }

  function lecturaTanque(vista, eq, llegada, recarga) {
    var m = eq ? A.modelo(vista, eq.modelo) : null;
    var a = isNaN(llegada) ? 0 : llegada, r = isNaN(recarga) ? 0 : recarga, s = a + r;
    if (isNaN(llegada) && isNaN(recarga)) return null;
    var caja = h('div', { class: 'calc' + '' }, h('span', { text: 'Al salir' }), h('b', { text: s + ' ml' }));
    var wrap = h('div', null, caja);
    if (m && m.tanque) {
      var over = s > m.tanque * 1.1;
      var bar = h('div', { class: 'tank' + (over ? ' over' : '') },
        h('i', { style: { width: Math.min(100, s / m.tanque * 100) + '%' } }),
        h('i', { class: 'a', style: { width: Math.min(100, a / m.tanque * 100) + '%' } }));
      wrap.appendChild(bar);
      wrap.appendChild(h('div', { class: 'hint', text: 'Tanque ' + m.codigo + ': ' + m.tanque + ' ml · gris = al llegar, naranja = recarga' }));
    }
    return wrap;
  }

  // ============================================================
  // 1. MANTENIMIENTO
  // ============================================================
  A.modulos.mantenimiento = {
    id: 'mantenimiento', rol: 'TECNICO', titulo: 'Mantenimiento', sub: 'Visita de recarga', ico: '🔧', hue: 'blue',
    boton: 'Registrar visita',
    vista: function (c) {
      var f = c.f, e = c.estado, v = c.vista;
      var eq = function () { return A.equipo(v, e.equipo); };
      return [
        f.card('Equipo', '1', [
          f.pick('equipo', 'Equipo visitado', {
            req: true, contar: true, titulo: 'Buscar equipo', ph: 'Buscar cliente o código',
            buscarPh: 'Cliente, EQP, distrito o modelo', items: function () { return ui.itemsEquipos(v.equipos); },
          }),
          f.datos(function () {
            var x = eq(); if (!x) return [];
            var d = diasTxt(x), m = A.modelo(v, x.modelo);
            return [
              ['Cliente', x.cliente, '', true], ['Modelo', x.modelo], ['Tipo de servicio', ui.pillServicio(x.tipoContrato)],
              ['Distrito', x.distrito], ['Espacio', x.espacio], ['Fragancia', x.fragancia, 'hl', true],
              ['Última visita', d[0], d[1]], ['Tanque', m && m.tanque ? m.tanque + ' ml' : '—'],
            ];
          }),
        ]),
        f.card('Lecturas de fragancia', '2', [
          h('div', { class: 'row2' },
            f.num('llegada', 'Al llegar (ml)', { req: true, hint: 'Medir antes de recargar' }),
            f.num('recarga', 'Recarga (ml)', { req: true, hint: '0 si no se recargó' })),
          f.calc(function () { return lecturaTanque(v, eq(), n(e.llegada), n(e.recarga)); }),
        ]),
        f.card('Fragancia', '3', [
          f.seg('cambio', '¿Se cambió la fragancia?', [{ v: 'No', t: 'No', s: 'Misma fragancia' }, { v: 'Sí', t: 'Sí', s: 'Se cambió' }], { req: true }),
          f.si(function () { return e.cambio === 'Sí'; }, [
            f.pick('nuevaFrag', 'Nueva fragancia', { req: function () { return e.cambio === 'Sí'; }, titulo: 'Nueva fragancia', items: function () { return A.itemsFragancias(v); }, icono: 'down' }),
          ]),
        ]),
        f.card('Evidencia', '4', [
          f.foto('foto', 'Foto del frasco al terminar', { req: true, camara: true, titulo: 'Tomar foto', sub: 'Que se vea el nivel de fragancia' }),
          f.area('obs', 'Observaciones', { ph: 'Fugas, equipo apagado, frasco roto, cliente…' }),
        ]),
      ];
    },
    revisar: function (c) {
      var e = c.estado, ll = n(e.llegada), rc = n(e.recarga);
      if (isNaN(ll) || ll < 0) return c.f.error('llegada', 'Número mayor o igual a 0');
      if (isNaN(rc) || rc < 0) return c.f.error('recarga', 'Número mayor o igual a 0');
      return { avisos: avisosVisita(c.vista, c.cola, A.equipo(c.vista, e.equipo), ll, rc) };
    },
    armar: function (c) {
      var e = c.estado, x = A.equipo(c.vista, e.equipo) || {};
      var ll = n(e.llegada), rc = n(e.recarga);
      return {
        modulo: 'mantenimiento',
        resumen: { t: x.cliente || e.equipo, s: e.equipo + ' · ' + rc + ' ml' },
        ref: { equipo: { id: x.id, cambios: Object.assign({ ultVisita: new Date().toISOString() }, e.cambio === 'Sí' ? { fragancia: e.nuevaFrag } : {}) } },
        datos: {
          idEquipo: x.id, cliente: x.cliente, modelo: x.modelo, tipoEspacio: x.espacio, distrito: x.distrito,
          nivelLlegada: ll, recarga: rc, nivelSalida: ll + rc, diasUltVisita: A.diasDesde(x.ultVisita) || 0,
          fragancia: x.fragancia, cambioFragancia: e.cambio, nuevaFragancia: e.cambio === 'Sí' ? e.nuevaFrag : '',
          observaciones: e.obs || '',
          fotoBase64: A.base64(e.foto), fotoMime: e.foto && e.foto.mime, fotoNombre: e.foto && e.foto.nombre,
        },
      };
    },
  };

  // ============================================================
  // 2. INSTALACIÓN
  // ============================================================
  A.modulos.instalacion = {
    id: 'instalacion', rol: 'TECNICO', titulo: 'Instalación', sub: 'Equipo nuevo', ico: '➕', hue: 'green',
    programados: 'instalacion', boton: 'Registrar instalación',
    vista: function (c) {
      var f = c.f, e = c.estado, v = c.vista;
      var sol = function () { return e.sol && e.sol !== 'otro' ? programado(v, 'instalacion', e.sol) : null; };
      var items = function () {
        var l = itemsProgramados(v.programados.instalacion, function (x) { return [x.ticket, x.direccion, x.modelo].filter(Boolean).join(' · '); });
        l.forEach(function (i) { i.tag = A.tipoServicio(i.x.tipoServicio) || i.x.ticket; });
        l.push({ v: 'otro', t: 'Otro / no está en la lista', s: 'Solo con autorización de Operaciones' });
        return l;
      };
      return [
        f.card('Cliente programado', '1', [
          f.pick('sol', 'Cliente', {
            req: true, titulo: 'Instalaciones programadas', ph: 'Elegir instalación programada', items: items, icono: 'down',
            alElegir: function (it) {
              if (it.v === 'otro') return;
              var x = it.x;
              e.direccion = x.direccion || '';
              e.distrito = A.cfg.DISTRITOS.indexOf(x.distrito) !== -1 ? x.distrito : '';
              e.industria = A.cfg.INDUSTRIAS.indexOf(x.industria) !== -1 ? x.industria : '';
              e.m2 = x.m2 || '';
              var codigos = (v.modelos || []).map(function (m) { return m.codigo; });
              if (codigos.indexOf(x.modelo) !== -1) { e.modelo = x.modelo; e.modeloOtro = ''; } else { e.modelo = 'otro'; e.modeloOtro = x.modelo || ''; }
              e.frag = x.fragancia || '';
            },
          }),
          f.si(function () { return e.sol === 'otro'; }, [
            f.text('clienteOtro', 'Nombre del cliente', { req: function () { return e.sol === 'otro'; }, ph: 'Nombre del local o empresa' }),
          ]),
          f.datos(function () {
            var x = sol(); if (!x) return [];
            var serv = h('span', null, ui.pillServicio(x.tipoServicio), x.precio ? ' S/ ' + x.precio + ' al mes' : '');
            return [['Servicio acordado', serv, '', true], ['Ticket', x.ticket], ['Contacto', [x.contacto, x.telefono].filter(Boolean).join(' · ')]];
          }),
        ]),
        f.card('Equipo instalado', '2', [
          f.text('num', 'Número del equipo', { req: true, pre: 'EQP-', inputmode: 'numeric', ph: '187',
            hint: 'Solo el número del sticker' }),
          h('div', { class: 'row2' },
            f.select('modelo', 'Modelo', function () { return A.opcionesModelos(v); }, { req: true }),
            f.num('m2', 'Metros² (opcional)', { inputmode: 'numeric', ph: '50' })),
          f.si(function () { return e.modelo === 'otro'; }, [f.text('modeloOtro', 'Nombre del modelo', { req: function () { return e.modelo === 'otro'; } })]),
          f.seg('espacio', 'Tipo de espacio', [{ v: 'Principal', t: 'Principal' }, { v: 'Secundario', t: 'Secundario' }, { v: 'Otro', t: 'Otro' }], { req: true }),
        ]),
        f.card('Ubicación', '3', [
          f.text('direccion', 'Dirección', { req: true, ph: 'Av. / Jr. / Calle y número' }),
          h('div', { class: 'row2' },
            f.select('distrito', 'Distrito', A.cfg.DISTRITOS, { req: true }),
            f.select('industria', 'Industria', A.cfg.INDUSTRIAS, { req: true })),
        ]),
        f.card('Fragancia', '4', [
          f.pick('frag', 'Fragancia instalada', { req: true, titulo: 'Fragancia', items: function () { return A.itemsFragancias(v); }, icono: 'down',
            respaldo: function (val) { return { v: val, t: val, s: 'De la solicitud' }; } }),
          f.num('ml', 'Fragancia aplicada (ml)', { req: true, inputmode: 'numeric', ph: '300' }),
        ]),
        f.card('Fotos', '5', [
          h('div', { class: 'photos2' },
            f.foto('fotoEq', 'Equipo instalado', { req: true, camara: true, titulo: 'Foto del equipo', sub: 'En su lugar, que se vea el espacio' }),
            f.foto('fotoFr', 'Nivel del frasco', { req: true, camara: true, titulo: 'Foto del frasco', sub: 'Con el nivel visible' })),
          f.area('obs', 'Observaciones', { ph: 'Intensidad configurada, acceso, particularidades…' }),
        ]),
      ];
    },
    revisar: function (c) {
      var e = c.estado, num = parseInt(e.num, 10);
      if (!(num > 0) || String(num) !== String(e.num).replace(/^0+/, '')) return c.f.error('num', 'Solo números, ej. 187');
      var id = 'EQP-' + String(num).padStart(3, '0');
      if (A.equipo(c.vista, id)) return c.f.error('num', id + ' ya existe en la cartera. Revisa el sticker.');
      var ml = n(e.ml);
      if (isNaN(ml) || ml <= 0) return c.f.error('ml', 'Ingresa los ml aplicados');
      var av = [];
      var m = A.modelo(c.vista, e.modelo === 'otro' ? e.modeloOtro : e.modelo);
      if (m && m.tanque && ml > m.tanque * 1.1) av.push('Aplicaste ' + ml + ' ml y el tanque del ' + ui.esc(m.codigo) + ' es de ' + m.tanque + ' ml.');
      return { avisos: av };
    },
    armar: function (c) {
      var e = c.estado, x = e.sol !== 'otro' ? programado(c.vista, 'instalacion', e.sol) : null;
      var num = parseInt(e.num, 10), id = 'EQP-' + String(num).padStart(3, '0');
      var cliente = x ? x.cliente : e.clienteOtro;
      return {
        modulo: 'instalacion',
        resumen: { t: cliente, s: id + (x ? ' · ' + x.ticket : '') },
        ref: x ? { programado: { modulo: 'instalacion', ticket: x.ticket, fila: x.fila } } : {},
        datos: {
          idEquipoNum: num, cliente: cliente, direccion: e.direccion, distrito: e.distrito, industria: e.industria,
          modelo: e.modelo === 'otro' ? (e.modeloOtro || 'OTRO') : e.modelo, tipoEspacio: e.espacio, m2: e.m2 || '',
          fragancia: e.frag, fraganciaAplicadaMl: n(e.ml), observaciones: e.obs || '',
          tipoServicio: x ? x.tipoServicio : '', precioAcordado: x ? x.precio : '',
          filaProgramada: x ? x.fila : '', ticket: x ? x.ticket : '',
          fotoEquipoBase64: A.base64(e.fotoEq), fotoEquipoMime: e.fotoEq && e.fotoEq.mime,
          fotoFrascoBase64: A.base64(e.fotoFr), fotoFrascoMime: e.fotoFr && e.fotoFr.mime,
        },
      };
    },
  };

  // ============================================================
  // 3. INCIDENCIAS
  // ============================================================
  A.modulos.incidencia = {
    id: 'incidencia', rol: 'TECNICO', titulo: 'Incidencias', sub: 'Problemas reportados', ico: '⚠️', hue: 'red',
    programados: 'incidencia', boton: 'Registrar incidencia',
    vista: function (c) {
      var f = c.f, e = c.estado, v = c.vista;
      var inc = function () { return programado(v, 'incidencia', e.inc); };
      var eq = function () { var x = inc(); return x ? A.equipo(v, x.idEquipo) : null; };
      var mant = function () { return e.mant === 'Sí'; };
      return [
        f.card('Incidencia programada', '1', [
          f.pick('inc', 'Incidencia', {
            req: true, titulo: 'Incidencias programadas', ph: 'Elegir incidencia', icono: 'down',
            vacio: 'No hay incidencias programadas',
            items: function () { return itemsProgramados(v.programados.incidencia, function (x) { return [x.idEquipo, x.tipoIncidencia].filter(Boolean).join(' · '); }); },
            alElegir: function (it) {
              var x = it.x;
              if (String(x.tipoIncidencia).toLowerCase() === 'cambio fragancia' && x.nuevaFragancia) { e.cambio = 'Sí'; e.nuevaFrag = x.nuevaFragancia; }
              else { e.cambio = ''; e.nuevaFrag = ''; }
            },
          }),
          f.datos(function () {
            var x = inc(); if (!x) return [];
            return [
              ['Reportado por comercial', x.tipoIncidencia, 'hl', true],
              x.nuevaFragancia ? ['Nueva fragancia solicitada', x.nuevaFragancia, '', true] : null,
              x.otroTipo ? ['Detalle', x.otroTipo, '', true] : null,
              ['Equipo', x.idEquipo], ['Modelo', x.modelo], ['Dirección', x.direccion, '', true],
              ['Distrito', x.distrito], ['Fragancia', x.fragancia],
            ];
          }),
        ]),
        f.card('Severidad', '2', [
          f.seg('sev', null, [{ v: 'Baja', t: 'Baja', s: 'Informativa' }, { v: 'Media', t: 'Media', s: 'Seguimiento' }, { v: 'Alta', t: 'Alta', s: 'Urgente' }], { req: true, cls: 'sev' }),
          f.si(function () { return e.sev === 'Alta'; }, [h('div', { class: 'banner err', style: { marginTop: '12px', marginBottom: '0' } },
            h('span', { class: 'bi', text: '📞' }), h('div', null, 'Severidad alta: avisa a Operaciones hoy mismo, además de registrar.'))]),
        ]),
        f.card('Fragancia y mantenimiento', '3', [
          f.seg('aplico', '¿Se aplicó fragancia?', SI_NO, { req: true }),
          f.si(function () { return e.aplico === 'Sí'; }, [f.num('ml', 'Fragancia aplicada (ml)', { req: function () { return e.aplico === 'Sí'; }, inputmode: 'numeric' })]),
          f.seg('mant', '¿Cuenta también como mantenimiento?', SI_NO, { req: true,
            hint: 'Si haces el mantenimiento completo, se registra también como visita.' }),
          f.si(mant, [
            f.datos(function () {
              var x = eq(); if (!x) return [];
              var d = diasTxt(x);
              return [['Última visita', d[0], d[1]], ['Espacio', x.espacio]];
            }),
            h('div', { style: { height: '12px' } }),
            f.num('llegada', 'Al llegar (ml)', { req: mant, inputmode: 'numeric', hint: 'La recarga es la fragancia aplicada' }),
            f.calc(function () { return mant() ? lecturaTanque(v, eq(), n(e.llegada), e.aplico === 'Sí' ? n(e.ml) : 0) : null; }),
            h('div', { style: { height: '12px' } }),
            f.seg('cambio', '¿Se cambió la fragancia?', [{ v: 'No', t: 'No', s: 'Misma fragancia' }, { v: 'Sí', t: 'Sí', s: 'Se cambió' }], { req: mant }),
            f.si(function () { return e.cambio === 'Sí'; }, [
              f.pick('nuevaFrag', 'Nueva fragancia', { req: function () { return mant() && e.cambio === 'Sí'; }, items: function () { return A.itemsFragancias(v); }, icono: 'down',
                respaldo: function (val) { return { v: val, t: val, s: 'De la incidencia' }; } }),
            ]),
          ]),
        ]),
        f.card('Detalle y cierre', '4', [
          f.area('desc', 'Descripción del problema', { req: true, ph: 'Qué encontraste al llegar' }),
          f.area('accion', 'Acción tomada', { ph: 'Qué hiciste para resolverlo' }),
          h('div', { class: 'row2' },
            f.select('cierre', 'Estado al cerrar', ESTADOS_CIERRE, { req: true }),
            f.select('seguimiento', 'Seguimiento', SEGUIMIENTO)),
          f.area('obs', 'Observaciones', { ph: 'Notas para Operaciones o el próximo técnico' }),
          f.foto('foto', 'Foto', { camara: true, titulo: 'Foto del problema o la solución', sub: 'Recomendada en severidad media y alta' }),
        ]),
      ];
    },
    revisar: function (c) {
      var e = c.estado, av = [];
      if (e.aplico === 'Sí' && !(n(e.ml) > 0)) return c.f.error('ml', 'Ingresa los ml aplicados');
      if (e.mant === 'Sí') {
        var ll = n(e.llegada);
        if (isNaN(ll) || ll < 0) return c.f.error('llegada', 'Número mayor o igual a 0');
        var x = programado(c.vista, 'incidencia', e.inc);
        av = av.concat(avisosVisita(c.vista, c.cola, x && A.equipo(c.vista, x.idEquipo), ll, e.aplico === 'Sí' ? n(e.ml) : 0));
      }
      if ((e.sev === 'Media' || e.sev === 'Alta') && !e.foto) av.push('Severidad ' + e.sev.toLowerCase() + ' sin foto. Se recomienda adjuntar evidencia.');
      return { avisos: av };
    },
    armar: function (c) {
      var e = c.estado, x = programado(c.vista, 'incidencia', e.inc), eq = A.equipo(c.vista, x.idEquipo) || {};
      var mant = e.mant === 'Sí';
      var ref = { programado: { modulo: 'incidencia', ticket: x.ticket, fila: x.fila } };
      if (mant) ref.equipo = { id: x.idEquipo, cambios: Object.assign({ ultVisita: new Date().toISOString() }, e.cambio === 'Sí' ? { fragancia: e.nuevaFrag } : {}) };
      return {
        modulo: 'incidencia',
        resumen: { t: x.cliente, s: x.ticket + ' · ' + x.idEquipo + (mant ? ' · + mantenimiento' : '') },
        ref: ref,
        datos: {
          ticket: x.ticket, idEquipo: x.idEquipo, cliente: x.cliente, modelo: x.modelo, direccion: x.direccion, distrito: x.distrito,
          fraganciaEquipo: x.fragancia, tipoIncidencia: x.tipoIncidencia, nuevaFragancia: x.nuevaFragancia, tipoOtro: x.otroTipo,
          severidad: e.sev, descripcion: e.desc, accionTomada: e.accion || '', estadoCierre: e.cierre, seguimiento: e.seguimiento || '',
          observaciones: e.obs || '', filaProgramada: x.fila,
          fotoBase64: A.base64(e.foto), fotoMime: e.foto && e.foto.mime, fotoNombre: e.foto && e.foto.nombre,
          aplicoFragancia: e.aplico, mlAplicados: e.aplico === 'Sí' ? n(e.ml) : 0, cuentaMantenimiento: e.mant,
          nivelLlegada: mant ? n(e.llegada) : '', diasUltVisita: A.diasDesde(eq.ultVisita) || 0, tipoEspacio: eq.espacio || '',
          mantCambioFragancia: mant ? e.cambio : '', mantNuevaFragancia: mant && e.cambio === 'Sí' ? e.nuevaFrag : '',
        },
      };
    },
  };

  // ============================================================
  // 4. SALIDA DE ALMACÉN
  // ============================================================
  A.modulos.salida = {
    id: 'salida', rol: 'TECNICO', titulo: 'Salida de almacén', sub: 'Fragancia o equipos', ico: '📦', hue: 'purple',
    boton: 'Registrar salida',
    vista: function (c) {
      var f = c.f, e = c.estado, v = c.vista;
      var conFrag = function () { return e.tipo === 'Fragancia' || e.tipo === 'Fragancia + Equipo'; };
      var conEq = function () { return e.tipo === 'Equipo' || e.tipo === 'Fragancia + Equipo'; };
      return [
        f.card('Qué sale', '1', [
          f.seg('tipo', 'Tipo de salida', [
            { v: 'Fragancia', t: 'Fragancia', ico: '🧴' }, { v: 'Equipo', t: 'Equipo', ico: '📟' },
            { v: 'Fragancia + Equipo', t: 'Fragancia + equipo', ico: '🧴' }], { req: true, cls: 'tiles' }),
          f.seg('destino', 'Para qué', [{ v: 'Mantenimiento', t: 'Mantenim.' }, { v: 'Instalación', t: 'Instalación' }, { v: 'Retiro', t: 'Retiro' }, { v: 'Otro', t: 'Otro' }], { req: true, cls: 'wrap' }),
        ]),
        f.si(conFrag, [f.card('Fragancia', null, [
          f.pick('frag', 'Fragancia', { req: conFrag, items: function () { return A.itemsFragancias(v); }, icono: 'down' }),
          f.num('vol', 'Volumen (ml)', { req: conFrag, inputmode: 'numeric', ph: '500' }),
        ])]),
        f.si(conEq, [f.card('Equipo', null, [
          f.pick('equipo', 'Equipo', { req: conEq, titulo: 'Buscar equipo', ph: 'Buscar cliente o código', items: function () { return ui.itemsEquipos(v.equipos); } }),
          f.datos(function () { var x = A.equipo(v, e.equipo); return x ? [['Cliente', x.cliente, '', true], ['Modelo', x.modelo], ['Fragancia', x.fragancia]] : []; }),
        ])]),
        f.card('Observaciones y foto', null, [
          f.area('obs', 'Observaciones', { ph: 'Frasco incompleto, estado del equipo…' }),
          f.foto('foto', 'Foto', { titulo: 'Adjuntar foto', sub: 'Opcional' }),
        ], { opcional: true }),
      ];
    },
    revisar: function (c) {
      var e = c.estado;
      if ((e.tipo === 'Fragancia' || e.tipo === 'Fragancia + Equipo') && !(n(e.vol) > 0)) return c.f.error('vol', 'Ingresa el volumen en ml');
      return null;
    },
    armar: function (c) {
      var e = c.estado, conFrag = e.tipo !== 'Equipo', conEq = e.tipo !== 'Fragancia';
      var x = conEq ? (A.equipo(c.vista, e.equipo) || {}) : {};
      return {
        modulo: 'salida',
        resumen: { t: e.tipo + ' · ' + e.destino, s: [conFrag ? e.frag + ' ' + n(e.vol) + ' ml' : '', conEq ? x.id : ''].filter(Boolean).join(' · ') },
        datos: {
          tipoSalida: e.tipo, destino: e.destino, fragancia: conFrag ? e.frag : '', volumenMl: conFrag ? n(e.vol) : '',
          idEquipo: conEq ? x.id : '', cliente: x.cliente || '', modelo: x.modelo || '', distrito: x.distrito || '', fraganciaEquipo: x.fragancia || '',
          observaciones: e.obs || '', fotoBase64: A.base64(e.foto), fotoMime: e.foto && e.foto.mime,
        },
      };
    },
  };

  // ============================================================
  // 5. RETIRO
  // ============================================================
  A.modulos.retiro = {
    id: 'retiro', rol: 'TECNICO', titulo: 'Retiro', sub: 'Te llevas el equipo', ico: '📤', hue: 'amber',
    programados: 'retiro', boton: 'Registrar retiro', botonCls: 'warn',
    vista: function (c) {
      var f = c.f, e = c.estado, v = c.vista;
      var x = function () { return programado(v, 'retiro', e.ret); };
      return [
        f.card('Retiro programado', '1', [
          f.pick('ret', 'Retiro', { req: true, titulo: 'Retiros programados', ph: 'Elegir retiro', icono: 'down', vacio: 'No hay retiros programados',
            items: function () { return itemsProgramados(v.programados.retiro, function (r) { return [r.idEquipo, r.modelo, r.motivo].filter(Boolean).join(' · '); }); } }),
          f.datos(function () { var r = x(); return r ? [['Equipo', r.idEquipo], ['Modelo', r.modelo], ['Dirección', r.direccion, '', true], ['Distrito', r.distrito], ['Motivo', r.motivo]] : []; }),
          f.si(function () { return !!x(); }, [h('div', { class: 'banner warn', style: { marginTop: '12px', marginBottom: 0 } }, h('span', { class: 'bi', text: '⚠️' }),
            h('div', null, 'Al registrar, el equipo sale de la cartera activa y pasa al Historial de Retiros. Regístralo solo con el equipo en tu poder.'))]),
        ]),
        f.card('Detalle del retiro', '2', [
          f.area('obs', 'Observaciones', { ph: 'Estado del equipo, fragancia sobrante, incidencias…' }),
          f.foto('foto', 'Foto del equipo retirado', { camara: true, titulo: 'Tomar foto', sub: 'Recomendada' }),
        ]),
      ];
    },
    revisar: function (c) {
      var r = programado(c.vista, 'retiro', c.estado.ret);
      return { confirmar: { titulo: '¿Confirmas el retiro?', html: '<p><b>' + ui.esc(r.idEquipo) + '</b> · ' + ui.esc(r.cliente) + '</p><p>El equipo pasará al Historial de Retiros.</p>', ok: 'Sí, registrar retiro', peligro: true },
        avisos: c.estado.foto ? [] : ['No adjuntaste foto del equipo retirado.'] };
    },
    armar: function (c) {
      var e = c.estado, r = programado(c.vista, 'retiro', e.ret);
      return {
        modulo: 'retiro', resumen: { t: r.cliente, s: r.ticket + ' · ' + r.idEquipo },
        ref: { programado: { modulo: 'retiro', ticket: r.ticket, fila: r.fila }, quitarEquipo: r.idEquipo },
        datos: { ticket: r.ticket, idEquipo: r.idEquipo, cliente: r.cliente, modelo: r.modelo, direccion: r.direccion, distrito: r.distrito,
          motivo: r.motivo, observaciones: e.obs || '', filaProgramada: r.fila,
          fotoBase64: A.base64(e.foto), fotoMime: e.foto && e.foto.mime, fotoNombre: e.foto && e.foto.nombre },
      };
    },
  };

  // ============================================================
  // 6. CAMBIO DE EQUIPO
  // ============================================================
  A.modulos.cambio = {
    id: 'cambio', rol: 'TECNICO', titulo: 'Cambio de equipo', sub: 'Otro modelo, mismo código', ico: '🔁', hue: 'teal',
    programados: 'cambio', boton: 'Registrar cambio',
    vista: function (c) {
      var f = c.f, e = c.estado, v = c.vista;
      return [
        f.card('Cambio programado', '1', [
          f.pick('cam', 'Cambio', { req: true, titulo: 'Cambios programados', ph: 'Elegir cambio', icono: 'down', vacio: 'No hay cambios programados',
            items: function () { return itemsProgramados(v.programados.cambio, function (r) { return r.idEquipo + ' · ' + r.modeloActual + ' → ' + r.modeloNuevo; }); } }),
          f.datos(function () {
            var r = programado(v, 'cambio', e.cam);
            return r ? [['Equipo', r.idEquipo], ['Distrito', r.distrito], ['Modelo actual', r.modeloActual], ['Modelo nuevo', r.modeloNuevo, 'hl'],
              ['Motivo', r.motivo, '', true], ['Dirección', r.direccion, '', true]] : [];
          }),
        ]),
        f.card('Detalle del cambio', '2', [f.area('obs', 'Observaciones', { ph: 'Estado del equipo retirado, configuración del nuevo…' })]),
      ];
    },
    armar: function (c) {
      var e = c.estado, r = programado(c.vista, 'cambio', e.cam);
      return {
        modulo: 'cambio', resumen: { t: r.cliente, s: r.ticket + ' · ' + r.modeloActual + ' → ' + r.modeloNuevo },
        ref: { programado: { modulo: 'cambio', ticket: r.ticket, fila: r.fila }, equipo: { id: r.idEquipo, cambios: { modelo: r.modeloNuevo } } },
        datos: { ticket: r.ticket, idEquipo: r.idEquipo, cliente: r.cliente, modeloActual: r.modeloActual, modeloNuevo: r.modeloNuevo,
          direccion: r.direccion, distrito: r.distrito, motivo: r.motivo, observaciones: e.obs || '', filaProgramada: r.fila },
      };
    },
  };

  // ============================================================
  // 7. TRASLADO
  // ============================================================
  A.modulos.traslado = {
    id: 'traslado', rol: 'TECNICO', titulo: 'Traslado', sub: 'Mudar a otra dirección', ico: '🚚', hue: 'indigo',
    programados: 'traslado', boton: 'Registrar traslado',
    vista: function (c) {
      var f = c.f, e = c.estado, v = c.vista;
      return [
        f.card('Traslado programado', '1', [
          f.pick('tra', 'Traslado', { req: true, titulo: 'Traslados programados', ph: 'Elegir traslado', icono: 'down', vacio: 'No hay traslados programados',
            items: function () { return itemsProgramados(v.programados.traslado, function (r) { return r.idEquipo + ' · a ' + String(r.distritoNuevo).split(',')[0]; }); } }),
          f.datos(function () {
            var r = programado(v, 'traslado', e.tra);
            return r ? [['Equipo', r.idEquipo], ['Modelo', r.modelo],
              ['Desde', r.direccionActual + ' · ' + r.distritoActual, '', true],
              ['Hacia', r.direccionNueva + ' · ' + r.distritoNuevo, 'hl', true],
              ['Dónde instalar', r.ubicacion, 'hl', true]] : [];
          }),
        ]),
        f.card('Detalle del traslado', '2', [
          h('div', { class: 'banner info' }, h('span', { class: 'bi', text: 'ℹ️' }), h('div', null, 'Regístralo cuando el equipo ya esté funcionando en la dirección nueva.')),
          f.area('obs', 'Observaciones', { ph: 'Dónde quedó exactamente, configuración…' }),
        ]),
      ];
    },
    armar: function (c) {
      var e = c.estado, r = programado(c.vista, 'traslado', e.tra);
      return {
        modulo: 'traslado', resumen: { t: r.cliente, s: r.ticket + ' · ' + r.idEquipo + ' → ' + String(r.distritoNuevo).split(',')[0] },
        ref: { programado: { modulo: 'traslado', ticket: r.ticket, fila: r.fila }, equipo: { id: r.idEquipo, cambios: { direccion: r.direccionNueva, distrito: r.distritoNuevo } } },
        datos: { ticket: r.ticket, idEquipo: r.idEquipo, observaciones: e.obs || '', filaProgramada: r.fila },
      };
    },
  };
})();
