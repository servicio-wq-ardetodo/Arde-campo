// ============================================================
// ARDE Campo · pantallas
// ============================================================
(function () {
  'use strict';
  var A = window.A, ui = A.ui, h = ui.h;
  var app = document.getElementById('app');
  var cola = [];                 // copia en memoria de la cola (se actualiza con el evento 'cola')
  var pantalla = null;           // 'login' | 'inicio' | 'modulo' | 'historial' | 'cuenta'
  var instalarEvt = null;        // evento de instalación de Android

  var GRUPOS = [
    { titulo: 'Trabajo de campo', rol: 'TECNICO', mods: ['mantenimiento', 'incidencia', 'instalacion', 'retiro', 'cambio', 'traslado', 'salida'] },
    { titulo: 'Solicitudes comerciales', rol: 'COMERCIAL', mods: ['c_incidencia', 'c_instalacion', 'c_demo', 'c_retiro', 'c_cambio', 'c_traslado'] },
  ];

  // ============================================================
  // ARRANQUE
  // ============================================================
  function iniciar() {
    if (!A.apiConfigurada()) return pantallaSinConfig();
    A.cola.todos().then(function (l) { cola = l; }).catch(function () {}).then(function () {
      if (!A.sesion.activa()) return pantallaLogin();
      if (!A.datos.actual()) return cargarDatosYEntrar();
      irInicio();
      A.datos.refrescar().catch(function () {});
      A.cola.sincronizar();
    });
  }

  A.on('cola', function () {
    A.cola.todos().then(function (l) {
      cola = l;
      pintarSync();
      pintarBadges();
      if (pantalla === 'historial') pintarHistorial();
    });
  });
  A.on('sync', pintarSync);
  A.on('red', function () { pintarSync(); if (pantalla === 'inicio') irInicio(); });
  A.on('datos', function () { if (pantalla === 'inicio') irInicio(); });
  A.on('sesion-vencida', function (msg) {
    if (pantalla === 'login') return;
    A.store.del('token');
    ui.toast(msg || 'Ingresa tu PIN de nuevo', 'err');
    pantallaLogin(true);
  });

  window.addEventListener('popstate', function () {
    if (pantalla === 'modulo' || pantalla === 'historial' || pantalla === 'cuenta') irInicio(true);
  });

  window.addEventListener('beforeinstallprompt', function (ev) { ev.preventDefault(); instalarEvt = ev; if (pantalla === 'inicio') irInicio(true); });

  function cargarDatosYEntrar() {
    app.innerHTML = '';
    app.appendChild(h('div', { class: 'loading' }, h('div', { class: 'spin' }), h('div', { text: 'Descargando cartera y fragancias…' })));
    A.datos.refrescar().then(function () { irInicio(); A.cola.sincronizar(); }, function (e) {
      app.innerHTML = '';
      app.appendChild(h('div', { class: 'loading' },
        h('div', { class: 'e-ico', text: '📶' }),
        h('div', { text: navigator.onLine ? 'No se pudieron descargar los datos: ' + e.message : 'Necesitas señal la primera vez para descargar los datos.' }),
        h('button', { class: 'btn btn-main', text: 'Reintentar', onclick: cargarDatosYEntrar })));
    });
  }

  function pantallaSinConfig() {
    app.innerHTML = '';
    app.appendChild(h('div', { class: 'login' }, h('div', { class: 'login-top', html: ui.llama() },
      h('div', { class: 'login-word', text: 'ARDE' }), h('div', { class: 'login-sub', text: 'Falta configurar la dirección de la API en js/config.js' }))));
  }

  // ============================================================
  // LOGIN CON PIN
  // ============================================================
  function pantallaLogin(vencida) {
    pantalla = 'login';
    var pin = '';
    var dots = h('div', { class: 'pin-dots', 'aria-label': 'PIN' }, h('i'), h('i'), h('i'), h('i'));
    var msg = h('div', { class: 'pin-msg', text: vencida ? 'Tu sesión venció' : '' });
    var ocupado = false;
    function pintar() { [].forEach.call(dots.children, function (d, i) { d.className = i < pin.length ? 'on' : ''; }); }
    function tecla(t) {
      if (ocupado) return;
      if (t === 'del') pin = pin.slice(0, -1);
      else if (pin.length < 4) pin += t;
      msg.textContent = '';
      pintar();
      if (pin.length === 4) entrar();
    }
    function entrar() {
      if (!navigator.onLine) { msg.textContent = 'Necesitas señal para ingresar'; pin = ''; return setTimeout(pintar, 300); }
      ocupado = true; msg.textContent = 'Verificando…'; msg.style.color = '#AEB5BF';
      A.api('login', { pin: pin }, { timeout: 30000 }).then(function (r) {
        ocupado = false; msg.style.color = '';
        if (!r.ok) { error(r.mensaje || 'PIN incorrecto'); return; }
        A.sesion.guardar(r.token, r.usuario);
        cargarDatosYEntrar();
      }, function () { ocupado = false; msg.style.color = ''; error('Sin conexión con el servidor'); });
    }
    function error(t) {
      msg.textContent = t; pin = ''; dots.classList.add('shake');
      if (navigator.vibrate) navigator.vibrate(120);
      setTimeout(function () { dots.classList.remove('shake'); pintar(); }, 420);
    }
    var teclas = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map(function (t) {
      if (!t) return h('span');
      return h('button', { type: 'button', class: t === 'del' ? 'k-ghost' : '', 'aria-label': t === 'del' ? 'Borrar' : t,
        text: t === 'del' ? 'Borrar' : t, onclick: function () { tecla(t); } });
    });
    document.onkeydown = function (ev) {
      if (pantalla !== 'login') return;
      if (/^\d$/.test(ev.key)) tecla(ev.key); else if (ev.key === 'Backspace') tecla('del');
    };
    app.innerHTML = '';
    app.appendChild(h('div', { class: 'login' },
      h('div', { class: 'login-top', html: ui.llama() }, h('div', { class: 'login-word', text: 'ARDE' }), h('div', { class: 'login-sub', text: 'Campo · Registro de operaciones' }),
        dots, msg, h('div', { class: 'pin-help', text: 'Ingresa tu PIN de 4 dígitos' })),
      h('div', { class: 'keypad' }, teclas),
      h('div', { class: 'login-foot', text: '¿Olvidaste tu PIN? Pídelo a Operaciones · v' + A.cfg.VERSION })));
  }

  // ============================================================
  // ESTRUCTURA COMÚN
  // ============================================================
  function vista() { return A.vista(cola); }

  function syncPill() {
    var pend = cola.filter(function (x) { return x.estado === 'pendiente' || x.estado === 'enviando'; }).length;
    var malos = cola.filter(function (x) { return x.estado === 'rechazado'; }).length;
    var pill = h('button', { class: 'sync', id: 'sync-pill', onclick: function () { irHistorial(); } });
    if (!navigator.onLine) { pill.className = 'sync off'; pill.textContent = pend ? 'Sin señal · ' + pend + ' en cola' : 'Sin señal'; }
    else if (A.cola.ocupada() || cola.some(function (x) { return x.estado === 'enviando'; })) { pill.className = 'sync busy'; pill.textContent = 'Enviando ' + (pend || ''); }
    else if (malos) { pill.className = 'sync bad'; pill.textContent = malos + ' con error'; }
    else if (pend) { pill.className = 'sync off'; pill.textContent = pend + ' en cola'; }
    else { pill.textContent = 'Al día'; }
    return pill;
  }
  function pintarSync() {
    var p = document.getElementById('sync-pill');
    if (p) p.replaceWith(syncPill());
  }
  function contarPendientesHist() {
    return cola.filter(function (x) { return x.estado !== 'ok'; }).length;
  }
  function pintarBadges() {
    var b = document.getElementById('badge-hist');
    if (!b) return;
    var n = contarPendientesHist();
    b.hidden = !n; b.textContent = n;
  }

  function tabbar(activa) {
    var b = function (id, ico, txt, fn) {
      return h('button', { class: activa === id ? 'on' : '', onclick: fn, 'aria-current': activa === id ? 'page' : null, html: ui.icon(ico) },
        h('span', { text: txt }), id === 'historial' ? h('span', { class: 'badge', id: 'badge-hist', hidden: !contarPendientesHist(), text: contarPendientesHist() }) : null);
    };
    return h('nav', { class: 'tabbar' },
      b('inicio', 'home', 'Inicio', function () { irInicio(true); }),
      b('historial', 'clock', 'Historial', irHistorial),
      b('cuenta', 'user', 'Cuenta', irCuenta));
  }

  function topbar(titulo, sub, atras, derecha) {
    return h('header', { class: 'topbar' },
      atras ? h('button', { class: 'icon-btn', 'aria-label': 'Volver', html: ui.icon('back'), onclick: atras }) : null,
      h('div', { class: 'grow' }, titulo.nodeType ? titulo : h('h1', { text: titulo }), sub ? h('div', { class: 'sub', text: sub }) : null),
      derecha || syncPill());
  }

  function montar(nodos) {
    app.innerHTML = '';
    document.getElementById('modal-root').innerHTML = '';
    document.body.style.overflow = '';
    nodos.forEach(function (n) { if (n) app.appendChild(n); });
    window.scrollTo(0, 0);
  }

  // ============================================================
  // INICIO
  // ============================================================
  function irInicio(sinHistoria) {
    pantalla = 'inicio';
    var u = A.sesion.usuario() || {};
    var v = vista();
    if (!v) return cargarDatosYEntrar();
    var hora = new Date().getHours();
    var saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';
    var nombre = String(u.nombre || '').split(' - ')[0].split(' ')[0];

    var avisos = [];
    var rech = cola.filter(function (x) { return x.estado === 'rechazado'; });
    if (rech.length) avisos.push(h('div', { class: 'banner err' }, h('span', { class: 'bi', text: '⛔' }),
      h('div', { class: 'grow' }, h('b', { text: rech.length + ' registro(s) no se pudieron guardar' }), 'El servidor los rechazó. Revisa el motivo.',
        h('div', null, h('button', { class: 'link', text: 'Ver en historial', onclick: irHistorial })))));
    if (!navigator.onLine) avisos.push(h('div', { class: 'banner warn' }, h('span', { class: 'bi', text: '📶' }),
      h('div', null, h('b', { text: 'Sin señal' }), 'Puedes seguir registrando. Todo se envía solo cuando vuelva la señal.')));
    var horas = v.descargadoEn ? Math.round((Date.now() - v.descargadoEn) / 3600000) : 99;
    if (horas >= 12) avisos.push(h('div', { class: 'banner info' }, h('span', { class: 'bi', text: '🔄' }),
      h('div', { class: 'grow' }, h('b', { text: 'Datos de hace ' + (horas >= 48 ? Math.round(horas / 24) + ' días' : horas + ' h') }),
        'La lista de equipos y trabajos programados puede no estar al día.',
        h('div', null, h('button', { class: 'link', text: 'Actualizar ahora', onclick: actualizarDatos })))));
    var standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    if (!standalone && !A.store.get('ocultarInstalar')) {
      var ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      avisos.push(h('div', { class: 'banner flame' }, h('span', { class: 'bi', text: '📲' }),
        h('div', { class: 'grow' }, h('b', { text: 'Instala ARDE Campo en tu celular' }),
          ios ? 'En Safari: toca Compartir (□↑) y luego "Agregar a inicio".' : (instalarEvt ? 'Funciona sin señal y abre a pantalla completa.' : 'En Chrome: menú ⋮ → "Instalar app" o "Agregar a la pantalla principal".'),
          h('div', null,
            !ios && instalarEvt ? h('button', { class: 'link', text: 'Instalar', style: { marginRight: '14px' }, onclick: function () { instalarEvt.prompt(); instalarEvt = null; } }) : null,
            h('button', { class: 'link', text: 'Ahora no', onclick: function () { A.store.set('ocultarInstalar', true); irInicio(true); } })))));
    }

    var grupos = GRUPOS.filter(function (g) { return u.rol === 'ADMIN' || u.rol === g.rol; }).map(function (g) {
      return [
        u.rol === 'ADMIN' ? h('div', { class: 'group-title', text: g.titulo }) : null,
        h('div', { class: 'mods' }, g.mods.map(function (id, i) {
          var m = A.modulos[id];
          var ancho = i === g.mods.length - 1 && g.mods.length % 2 === 1;
          var cuenta = m.programados ? (v.programados[m.programados] || []).length : (m.contar ? m.contar(v) : 0);
          return h('button', { class: 'mod' + (ancho ? ' wide' : ''), onclick: function () { abrirModulo(id); } },
            h('span', { class: 'ico hue-' + m.hue, text: m.ico }),
            h('span', null, h('b', { text: m.titulo }), h('small', { text: m.sub })),
            cuenta ? h('span', { class: 'badge', text: cuenta, title: 'Pendientes' }) : null);
        })),
      ];
    });

    montar([
      h('div', { class: 'shell' },
        topbar(h('div', { class: 'mark', html: ui.llama() }, h('b', { text: 'ARDE' }), h('span', { text: 'Campo' })), null, null,
          h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } },
            syncPill(), h('button', { class: 'icon-btn', 'aria-label': 'Actualizar datos', html: ui.icon('refresh'), onclick: actualizarDatos }))),
        h('main', { class: 'main' },
          h('div', { class: 'hello' }, h('h2', { text: saludo + ', ' + nombre }), h('p', { text: resumenHoy() })),
          avisos, grupos)),
      tabbar('inicio'),
    ]);
    if (!sinHistoria && history.state && history.state.p !== 'inicio') history.replaceState({ p: 'inicio' }, '');
  }

  function resumenHoy() {
    var hoy = A.hoyLima();
    var n = cola.filter(function (x) { return A.fechaLima(new Date(x.creado).toISOString()) === hoy && x.estado !== 'rechazado'; }).length;
    return n ? 'Hoy llevas ' + n + ' registro' + (n > 1 ? 's' : '') + '.' : '¿Qué vas a registrar?';
  }

  function actualizarDatos() {
    if (!navigator.onLine) return ui.toast('Sin señal: se actualiza cuando vuelva', '');
    ui.toast('Actualizando…');
    A.datos.refrescar().then(function () { ui.toast('Datos al día', 'ok'); A.cola.sincronizar(); }, function (e) { ui.toast(e.message, 'err'); });
  }

  // ============================================================
  // MÓDULO (formulario)
  // ============================================================
  function abrirModulo(id) {
    var m = A.modulos[id];
    var u = A.sesion.usuario() || {};
    var clave = (u.nombre || '') + '|' + id;
    history.pushState({ p: 'modulo', id: id }, '');
    pantalla = 'modulo';
    A.borrador.leer(clave).then(function (b) {
      var recuperado = b && b.estado && Object.keys(b.estado).length > 1 && (Date.now() - b.guardado) < 3 * 86400000;
      pintarModulo(m, clave, recuperado ? b.estado : null, recuperado ? b.guardado : null);
    });
  }

  function pintarModulo(m, clave, estadoPrevio, guardado) {
    var estado = estadoPrevio || (m.inicial ? m.inicial() : {});
    estado._v = 1;
    var t;
    var f = ui.form(estado, function () {
      clearTimeout(t);
      t = setTimeout(function () { A.borrador.guardar(clave, estado); }, 500);
    });
    var ctx = { estado: estado, f: f, vista: vista(), cola: cola, usuario: A.sesion.usuario() };
    var nodos = m.vista(ctx);
    f.refrescar();

    var btn = h('button', { class: 'btn btn-main' + (m.botonCls ? ' ' + m.botonCls : ''), text: m.boton || 'Registrar' });
    btn.addEventListener('click', function () { enviar(m, ctx, clave, btn); });

    montar([
      h('div', { class: 'shell' },
        topbar(m.titulo, m.sub, function () { history.back(); }),
        h('main', { class: 'main with-submit' },
          guardado ? h('div', { class: 'banner info' }, h('span', { class: 'bi', text: '📝' }),
            h('div', { class: 'grow' }, h('b', { text: 'Recuperamos tu borrador' }), 'Guardado a las ' + A.hora(guardado) + '.',
              h('div', null, h('button', { class: 'link', text: 'Empezar de nuevo', onclick: function () {
                A.borrador.borrar(clave).then(function () { pintarModulo(m, clave, null, null); });
              } })))) : null,
          nodos)),
      h('div', { class: 'submitbar' }, h('div', { class: 'in' }, btn)),
    ]);
    pantalla = 'modulo';
  }

  function enviar(m, ctx, clave, btn) {
    if (btn.disabled) return;
    var err = ctx.f.validar();
    if (err) return ui.toast(err, 'err');
    var r = m.revisar ? m.revisar(ctx) : null;
    if (typeof r === 'string') return ui.toast(r, 'err');
    r = r || {};
    var paso = Promise.resolve(true);
    if (r.avisos && r.avisos.length) {
      paso = paso.then(function () {
        return ui.modal({ ico: '🧐', titulo: 'Revisa antes de enviar', html: '<ul>' + r.avisos.map(function (a) { return '<li>' + a + '</li>'; }).join('') + '</ul>',
          botones: [{ t: 'Corregir', v: false }, { t: 'Enviar igual', v: true, cls: 'btn-main' }] });
      });
    }
    if (r.confirmar) {
      paso = paso.then(function (ok) {
        if (!ok) return false;
        return ui.confirmar(r.confirmar.titulo, r.confirmar.html, r.confirmar.ok, r.confirmar.peligro);
      });
    }
    paso.then(function (ok) {
      if (!ok) return;
      var item;
      try { item = m.armar(ctx); } catch (e) { console.error(e); return ui.toast('Revisa los datos del formulario', 'err'); }
      btn.disabled = true;
      btn.innerHTML = '<span class="spin"></span> Guardando';
      A.gps().then(function (gps) {
        item.gps = gps;
        return A.cola.agregar(item);
      }).then(function (guardado) {
        return esperarResultado(guardado.id, 15000);
      }).then(function (res) {
        btn.disabled = false; btn.textContent = m.boton || 'Registrar';
        if (res && res.estado === 'rechazado') {
          // Rechazado al instante: el formulario queda tal cual para corregir
          A.cola.descartar(res.id);
          return ui.modal({ ico: '⛔', titulo: 'No se pudo guardar', texto: res.mensaje, botones: [{ t: 'Corregir', v: true, cls: 'btn-main' }] });
        }
        A.borrador.borrar(clave);
        var ok = res && res.estado === 'ok';
        return ui.modal({
          ico: ok ? '✅' : '📥', cerrable: false,
          titulo: ok ? (res.ticket ? 'Enviado' : 'Registrado') : 'Guardado en el celular',
          ticket: ok && res.ticket ? res.ticket : null,
          texto: ok ? res.mensaje : (navigator.onLine ? 'Se está enviando. Puedes seguir trabajando.' : 'Sin señal: se enviará solo cuando vuelva la señal. No lo registres de nuevo.'),
          botones: [{ t: 'Ir al inicio', v: 'inicio' }, { t: 'Nuevo registro', v: 'nuevo', cls: 'btn-main' }],
        }).then(function (v) {
          if (v === 'nuevo') pintarModulo(m, clave, null, null);
          else history.back();
        });
      }).catch(function (e) {
        console.error(e);
        btn.disabled = false; btn.textContent = m.boton || 'Registrar';
        ui.toast('No se pudo guardar en el celular: ' + e.message, 'err');
      });
    });
  }

  // Espera a que la cola procese el envío (si hay señal) para mostrar el ticket
  function esperarResultado(id, ms) {
    return new Promise(function (ok) {
      var fin = Date.now() + ms;
      (function mirar() {
        A.idb.get('cola', id).then(function (it) {
          if (!it || it.estado === 'ok' || it.estado === 'rechazado' || !navigator.onLine || Date.now() > fin ||
              (it.estado === 'pendiente' && it.intentos > 0)) return ok(it);
          setTimeout(mirar, 400);
        });
      })();
    });
  }

  // ============================================================
  // HISTORIAL
  // ============================================================
  var servidor = [];
  function irHistorial() {
    if (pantalla !== 'historial') history.pushState({ p: 'historial' }, '');
    pantalla = 'historial';
    montar([
      h('div', { class: 'shell' },
        topbar('Historial', 'Tus registros de los últimos días', function () { history.back(); }),
        h('main', { class: 'main', id: 'hist' })),
      tabbar('historial'),
    ]);
    pintarHistorial();
    if (navigator.onLine) {
      A.api('misRegistros').then(function (r) { if (r && r.ok) { servidor = r.registros; if (pantalla === 'historial') pintarHistorial(); } }).catch(function () {});
    }
  }

  function nombreMod(id) {
    var m = A.modulos[id] || A.modulos[{ c_demo_contrato: 'c_demo', c_demo_retiro: 'c_demo' }[id]];
    if (id === 'c_demo_retiro') return 'Demo retirada';
    return m ? m.titulo : id;
  }

  function pintarHistorial() {
    var cont = document.getElementById('hist');
    if (!cont) return;
    var locales = {};
    var items = cola.map(function (x) { locales[x.id] = 1; return x; });
    servidor.forEach(function (s) {
      if (locales[s.id]) return;
      items.push({ id: s.id, modulo: s.modulo, estado: s.ok ? 'ok' : 'rechazado', mensaje: s.mensaje, creado: new Date(s.fecha).getTime(),
        resumen: { t: s.referencia, s: '' }, remoto: true });
    });
    items.sort(function (a, b) { return b.creado - a.creado; });
    cont.innerHTML = '';
    var pend = items.filter(function (x) { return x.estado === 'pendiente' || x.estado === 'enviando'; });
    if (pend.length) {
      cont.appendChild(h('div', { class: 'banner ' + (navigator.onLine ? 'info' : 'warn') }, h('span', { class: 'bi', text: navigator.onLine ? '⏳' : '📶' }),
        h('div', { class: 'grow' }, h('b', { text: pend.length + ' en cola' }), navigator.onLine ? 'Se están enviando.' : 'Se enviarán solos cuando vuelva la señal.',
          navigator.onLine ? h('div', null, h('button', { class: 'link', text: 'Enviar ahora', onclick: function () { A.cola.sincronizar(); } })) : null)));
    }
    if (!items.length) {
      cont.appendChild(h('div', { class: 'empty' }, h('div', { class: 'e-ico', text: '🗂️' }), 'Aún no tienes registros.'));
      return;
    }
    var dia = null, card = null;
    items.forEach(function (it) {
      var d = A.diaTexto(new Date(it.creado).toISOString());
      if (d !== dia) {
        dia = d;
        cont.appendChild(h('div', { class: 'hist-day', text: d }));
        card = h('div', { class: 'list-card' });
        cont.appendChild(card);
      }
      var st = { ok: ['ok', '✓'], pendiente: ['q', '⏳'], enviando: ['busy', '↑'], rechazado: ['bad', '!'] }[it.estado] || ['q', '·'];
      var acciones = null;
      if (it.estado === 'rechazado' && !it.remoto) {
        acciones = h('div', { style: { marginTop: '6px', display: 'flex', gap: '14px' } },
          h('button', { class: 'link', style: { fontWeight: 700, fontSize: '13px', textDecoration: 'underline' }, text: 'Reintentar', onclick: function () { A.cola.reintentar(it.id); } }),
          h('button', { class: 'link', style: { fontWeight: 700, fontSize: '13px', textDecoration: 'underline', color: 'var(--err)' }, text: 'Descartar', onclick: function () {
            ui.confirmar('¿Descartar este registro?', '<p>Se borra del celular. Si es un error de datos, vuelve a registrarlo corregido.</p>', 'Descartar', true).then(function (ok) { if (ok) A.cola.descartar(it.id); });
          } }));
      }
      card.appendChild(h('div', { class: 'hist-item' },
        h('span', { class: 'st ' + st[0], text: st[1] }),
        h('div', { style: { flex: 1, minWidth: 0 } },
          h('b', { text: (it.resumen && it.resumen.t) || nombreMod(it.modulo) }),
          h('small', { text: nombreMod(it.modulo) + ' · ' + A.hora(new Date(it.creado).toISOString()) + (it.resumen && it.resumen.s ? ' · ' + it.resumen.s : '') }),
          it.ticket ? h('small', { text: 'Ticket ' + it.ticket }) : null,
          it.mensaje && it.estado !== 'ok' ? h('div', { class: 'msg' + (it.estado === 'rechazado' ? ' bad' : ''), text: it.mensaje }) : null,
          acciones)));
    });
  }

  // ============================================================
  // CUENTA
  // ============================================================
  function irCuenta() {
    if (pantalla !== 'cuenta') history.pushState({ p: 'cuenta' }, '');
    pantalla = 'cuenta';
    var u = A.sesion.usuario() || {};
    var v = vista() || {};
    var fila = function (a, b) { return h('div', { class: 'acct-row' }, h('span', { text: a }), h('b', { text: b })); };
    var rol = { TECNICO: 'Técnico', COMERCIAL: 'Asesor comercial', ADMIN: 'Operaciones (todo)' }[u.rol] || u.rol;
    montar([
      h('div', { class: 'shell' },
        topbar('Cuenta', null, function () { history.back(); }),
        h('main', { class: 'main' },
          h('div', { class: 'list-card' },
            fila('Nombre', u.nombre), fila('Perfil', rol),
            fila('Datos actualizados', v.descargadoEn ? A.diaTexto(new Date(v.descargadoEn).toISOString()) + ' ' + A.hora(new Date(v.descargadoEn).toISOString()) : '—'),
            fila('Equipos en cartera', String((v.equipos || []).length)),
            fila('Versión', A.cfg.VERSION)),
          h('button', { class: 'btn btn-ghost btn-block', style: { marginBottom: '10px' }, html: ui.icon('refresh') + ' Actualizar datos', onclick: actualizarDatos }),
          h('button', { class: 'btn btn-ghost btn-block', style: { color: 'var(--err)' }, text: 'Cerrar sesión', onclick: cerrarSesion }),
          h('p', { class: 'hint', style: { textAlign: 'center', marginTop: '18px' } }, 'Cada registro guarda tu nombre, la hora y la ubicación del celular.'))),
      tabbar('cuenta'),
    ]);
  }

  function cerrarSesion() {
    var pend = cola.filter(function (x) { return x.estado === 'pendiente' || x.estado === 'enviando'; }).length;
    var html = pend ? '<p><b>Tienes ' + pend + ' registro(s) sin enviar.</b> Se enviarán cuando vuelvas a ingresar con tu PIN en este celular.</p>' : '<p>Tendrás que ingresar tu PIN de nuevo.</p>';
    ui.confirmar('¿Cerrar sesión?', html, 'Cerrar sesión', !!pend).then(function (ok) {
      if (!ok) return;
      A.sesion.cerrar();
      pantallaLogin();
    });
  }

  // ============================================================
  // SERVICE WORKER (funciona sin señal + actualizaciones)
  // ============================================================
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').then(function (reg) {
        reg.addEventListener('updatefound', function () {
          var nuevo = reg.installing;
          nuevo.addEventListener('statechange', function () {
            if (nuevo.state === 'installed' && navigator.serviceWorker.controller) {
              ui.modal({ ico: '✨', titulo: 'Nueva versión disponible', texto: 'Actualiza para tener las últimas mejoras. Tus registros no se pierden.',
                botones: [{ t: 'Después', v: false }, { t: 'Actualizar', v: true, cls: 'btn-main' }] }).then(function (ok) {
                if (ok) nuevo.postMessage('activar');
              });
            }
          });
        });
      }).catch(function (e) { console.warn('SW', e); });
      var recargado = false;
      navigator.serviceWorker.addEventListener('controllerchange', function () { if (!recargado) { recargado = true; location.reload(); } });
    });
  }

  iniciar();
})();
