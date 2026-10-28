// ============================================================
// ARDE Campo · piezas de interfaz y formularios
// ============================================================
(function () {
  'use strict';
  var A = window.A;
  var ui = A.ui = {};

  // ── Crear elementos ──
  function h(tag, attrs) {
    var el = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'text') el.textContent = v;
      else if (k.indexOf('on') === 0 && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else el.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) agregar(el, arguments[i]);
    return el;
  }
  function agregar(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { agregar(el, x); }); return; }
    el.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
  }
  ui.h = h;
  ui.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  // ── Íconos ──
  var P = {
    back: '<path d="M15 18l-6-6 6-6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    file: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/>',
    home: '<path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4.5-6 8-6s7 2 8 6"/>',
    refresh: '<path d="M20 11a8 8 0 10-2.3 5.7"/><path d="M20 4v7h-7"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
  };
  ui.icon = function (n) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[n] || '') + '</svg>';
  };
  ui.llama = function () {
    return '<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="lg" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#FFC460"/><stop offset="1" stop-color="#EE7A1E"/></linearGradient></defs>' +
      '<path fill="url(#lg)" d="M33 4C38 17 49 27 49 42a17 17 0 01-34 0C15 27 27 17 33 4z"/>' +
      '<path fill="#15191E" d="M32.5 27c2.6 6.4 6.5 9.4 6.5 15.2a7 7 0 01-14 0c0-5.8 4.6-8.8 7.5-15.2z"/></svg>';
  };

  // ── Avisos ──
  var tt;
  ui.toast = function (msg, tipo) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast show ' + (tipo || '');
    clearTimeout(tt);
    tt = setTimeout(function () { t.className = 'toast ' + (tipo || ''); }, 3600);
  };

  // Modal con botones; devuelve una promesa con el valor del botón
  ui.modal = function (o) {
    return new Promise(function (ok) {
      var root = document.getElementById('modal-root');
      var cerrar = function (v) { root.innerHTML = ''; ok(v); };
      var botones = (o.botones || [{ t: 'Aceptar', v: true, cls: 'btn-main' }]).map(function (b) {
        return h('button', { class: 'btn ' + (b.cls || 'btn-ghost'), onclick: function () { cerrar(b.v); } }, b.t);
      });
      var caja = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' },
        o.ico ? h('div', { class: 'm-ico', text: o.ico }) : null,
        h('h3', { text: o.titulo || '' }),
        o.ticket ? h('div', { class: 'ticket', text: o.ticket }) : null,
        o.html ? h('div', { html: o.html }) : (o.texto ? h('p', { text: o.texto }) : null),
        h('div', { class: 'm-btns' }, botones));
      root.innerHTML = '';
      root.appendChild(h('div', { class: 'modal-back', onclick: function (e) { if (e.target === e.currentTarget && o.cerrable !== false) cerrar(null); } }, caja));
      var principal = caja.querySelector('.btn-main');
      if (principal) principal.focus();
    });
  };
  ui.confirmar = function (titulo, html, okTxt, peligro) {
    return ui.modal({
      ico: peligro ? '⚠️' : null, titulo: titulo, html: html,
      botones: [{ t: 'Cancelar', v: false }, { t: okTxt || 'Continuar', v: true, cls: 'btn-main' + (peligro ? ' danger' : '') }],
    });
  };

  // ── Buscador en hoja inferior ──
  function normal(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  ui.normal = normal;

  ui.picker = function (o) {
    return new Promise(function (ok) {
      var root = document.getElementById('modal-root');
      var items = o.items || [];
      var input = h('input', { type: 'search', placeholder: o.buscarPh || 'Buscar...', autocomplete: 'off', 'aria-label': 'Buscar' });
      var lista = h('div', { class: 'sheet-list', role: 'listbox' });
      var cerrar = function (v) { root.innerHTML = ''; document.body.style.overflow = ''; ok(v); };
      function pintar() {
        var q = normal(input.value).trim();
        var palabras = q ? q.split(/\s+/) : [];
        var filtrados = items.filter(function (it) {
          if (!palabras.length) return true;
          var txt = normal([it.t, it.s, it.buscar, it.tag].join(' '));
          return palabras.every(function (p) { return txt.indexOf(p) !== -1; });
        });
        lista.innerHTML = '';
        if (items.length > 12) lista.appendChild(h('div', { class: 'sheet-count', text: filtrados.length + ' de ' + items.length }));
        if (!filtrados.length) { lista.appendChild(h('div', { class: 'empty' }, h('div', { class: 'e-ico', text: '🔍' }), o.vacio || 'Sin resultados')); return; }
        var grupo = null;
        filtrados.slice(0, 250).forEach(function (it) {
          if (it.group && it.group !== grupo) { grupo = it.group; lista.appendChild(h('div', { class: 'opt-group', text: grupo })); }
          lista.appendChild(h('button', { class: 'opt-item' + (String(it.v) === String(o.valor) ? ' sel' : ''), role: 'option', onclick: function () { cerrar(it); } },
            h('div', { class: 'oi' }, h('b', { text: it.t }), it.s ? h('small', { text: it.s }) : null),
            it.tag ? h('span', { class: 'tag' + (it.tagCls ? ' ' + it.tagCls : ''), text: it.tag }) : null));
        });
      }
      input.addEventListener('input', pintar);
      var sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': o.titulo },
        h('div', { class: 'sheet-h' },
          h('div', { class: 'grab' }),
          h('div', { class: 'ttl' }, h('h3', { text: o.titulo || 'Seleccionar' }),
            h('button', { class: 'icon-btn', 'aria-label': 'Cerrar', html: ui.icon('x'), onclick: function () { cerrar(null); } })),
          items.length > 6 ? h('div', { class: 'search', html: ui.icon('search') }, input) : null),
        lista);
      root.innerHTML = '';
      document.body.style.overflow = 'hidden';
      root.appendChild(h('div', { class: 'sheet-back', onclick: function () { cerrar(null); } }));
      root.appendChild(sheet);
      pintar();
      if (items.length > 6 && !o.sinFoco) setTimeout(function () { input.focus(); }, 250);
    });
  };

  // ============================================================
  // FORMULARIOS ENLAZADOS A UN "estado"
  // ============================================================
  ui.form = function (estado, alCambiar) {
    var f = { estado: estado, vigias: [], campos: [] };
    var cambio = function () { f.refrescar(); if (alCambiar) alCambiar(estado); };
    f.cambio = cambio;
    f.set = function (k, v) { estado[k] = v; cambio(); };

    f.refrescar = function () { f.vigias.forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } }); };

    function marco(clave, etiqueta, req, control, hint) {
      var reqTxt = typeof req === 'function' ? null : req;
      var lbl = etiqueta ? h('label', { 'for': 'f-' + clave }, etiqueta, reqTxt ? h('span', { class: 'req', text: '*' }) : null) : null;
      var caja = h('div', { class: 'field', 'data-k': clave }, lbl, control, hint ? h('div', { class: 'hint', html: hint }) : null);
      if (req) f.campos.push({ clave: clave, etiqueta: etiqueta, req: req, caja: caja });
      return caja;
    }
    f.marco = marco;

    f.card = function (titulo, paso, hijos, extra) {
      return h('section', { class: 'card' },
        h('div', { class: 'card-h' }, paso ? h('span', { class: 'step', text: paso }) : null, h('h3', { text: titulo }),
          extra && extra.opcional ? h('span', { class: 'opt', text: 'Opcional' }) : null),
        hijos);
    };

    f.text = function (k, etiqueta, o) {
      o = o || {};
      var inp = h('input', {
        id: 'f-' + k, class: 'ctl', type: o.type || 'text', placeholder: o.ph || '', inputmode: o.inputmode,
        autocomplete: 'off', value: estado[k] == null ? '' : estado[k], maxlength: o.max,
        oninput: function () { estado[k] = inp.value; quitarError(k); cambio(); },
      });
      var ctl = o.pre ? h('div', { class: 'input-pre' }, h('span', { text: o.pre }), inp) : inp;
      f.vigias.push(function () { if (document.activeElement !== inp && String(inp.value) !== String(estado[k] == null ? '' : estado[k])) inp.value = estado[k] == null ? '' : estado[k]; });
      return marco(k, etiqueta, o.req, ctl, o.hint);
    };
    f.num = function (k, etiqueta, o) {
      o = Object.assign({ inputmode: 'decimal', ph: '0' }, o || {});
      return f.text(k, etiqueta, o);
    };
    f.area = function (k, etiqueta, o) {
      o = o || {};
      var ta = h('textarea', { id: 'f-' + k, class: 'ctl', placeholder: o.ph || '', rows: o.rows || 3,
        oninput: function () { estado[k] = ta.value; quitarError(k); cambio(); } });
      ta.value = estado[k] || '';
      f.vigias.push(function () { if (document.activeElement !== ta && ta.value !== (estado[k] || '')) ta.value = estado[k] || ''; });
      return marco(k, etiqueta, o.req, ta, o.hint);
    };
    f.date = function (k, etiqueta, o) {
      o = o || {};
      return f.text(k, etiqueta, Object.assign({ type: 'date' }, o));
    };
    // Lista simple (pocas opciones). opciones: ['a','b'] o [{v,t,group}]
    f.select = function (k, etiqueta, opciones, o) {
      o = o || {};
      var sel = h('select', { id: 'f-' + k, class: 'ctl', onchange: function () { estado[k] = sel.value; quitarError(k); if (o.alCambiar) o.alCambiar(sel.value); cambio(); } });
      function pintar() {
        var ops = typeof opciones === 'function' ? opciones() : opciones;
        sel.innerHTML = '';
        sel.appendChild(h('option', { value: '', text: o.ph || 'Seleccionar...' }));
        var grupo = null, cont = sel;
        ops.forEach(function (op) {
          var v = typeof op === 'string' ? op : op.v, t = typeof op === 'string' ? op : (op.t || op.v);
          if (op.group && op.group !== grupo) { grupo = op.group; cont = h('optgroup', { label: grupo }); sel.appendChild(cont); }
          cont.appendChild(h('option', { value: v, text: t }));
        });
        sel.value = estado[k] || '';
      }
      pintar();
      if (typeof opciones === 'function') f.vigias.push(function () { if (sel.value !== (estado[k] || '')) pintar(); });
      else f.vigias.push(function () { if (sel.value !== (estado[k] || '')) sel.value = estado[k] || ''; });
      f.repintar = f.repintar || {};
      f.repintar[k] = pintar;
      return marco(k, etiqueta, o.req, sel, o.hint);
    };

    // Selector con buscador. o.items() → [{v,t,s,tag,group,buscar}]
    f.pick = function (k, etiqueta, o) {
      var btn = h('button', { type: 'button', id: 'f-' + k, class: 'picker' });
      function pintar() {
        var it = estado[k] ? (o.items().filter(function (x) { return String(x.v) === String(estado[k]); })[0] || o.respaldo && o.respaldo(estado[k])) : null;
        btn.className = 'picker' + (it ? ' set' : '');
        btn.innerHTML = '';
        if (it) btn.appendChild(h('div', { class: 'pv' }, h('b', { text: it.t }), it.s ? h('small', { text: it.s }) : null));
        else {
          var n = o.items().length;
          btn.appendChild(h('div', { class: 'pv' }, h('span', { class: 'ph', text: n ? (o.ph || 'Seleccionar...') + (o.contar ? ' (' + n + ')' : '') : (o.vacio || 'No hay opciones') })));
        }
        btn.insertAdjacentHTML('beforeend', ui.icon(o.icono || 'search'));
      }
      btn.addEventListener('click', function () {
        var items = o.items();
        if (!items.length) { ui.toast(o.vacio || 'No hay opciones', ''); return; }
        ui.picker({ titulo: o.titulo || etiqueta, items: items, valor: estado[k], buscarPh: o.buscarPh, vacio: o.vacioBusqueda }).then(function (it) {
          if (!it) return;
          estado[k] = it.v; quitarError(k);
          if (o.alElegir) o.alElegir(it);
          pintar(); cambio();
        });
      });
      pintar();
      f.vigias.push(pintar);
      return marco(k, etiqueta, o.req, btn, o.hint);
    };

    // Botones de opción. opciones: [{v,t,s,ico}]
    f.seg = function (k, etiqueta, opciones, o) {
      o = o || {};
      var cont = h('div', { class: 'seg ' + (o.cls || ''), role: 'radiogroup', id: 'f-' + k });
      var botones = opciones.map(function (op) {
        var b = h('button', { type: 'button', role: 'radio', 'data-v': op.v,
          onclick: function () {
            estado[k] = (o.toggle && estado[k] === op.v) ? '' : op.v;
            quitarError(k);
            if (o.alCambiar) o.alCambiar(estado[k]);
            cambio();
          } },
          op.ico ? h('span', { class: 't-ico', text: op.ico }) : null,
          h('span', null, op.t, op.s ? h('small', { text: op.s }) : null));
        cont.appendChild(b);
        return b;
      });
      var pintarSeg = function () {
        botones.forEach(function (b) { var on = b.getAttribute('data-v') === String(estado[k]); b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
      };
      pintarSeg();
      f.vigias.push(pintarSeg);
      return marco(k, etiqueta, o.req, cont, o.hint);
    };

    // Foto con compresión. Guarda {dataUrl, mime, nombre, kb} en estado[k]
    f.foto = function (k, etiqueta, o) {
      o = o || {};
      var input = h('input', { type: 'file', accept: o.accept || 'image/*', 'aria-label': etiqueta });
      if (o.camara) input.setAttribute('capture', 'environment');
      var caja = h('div', { class: 'photo' });
      function pintar() {
        var v = estado[k];
        caja.className = 'photo' + (v ? ' set' : '');
        caja.innerHTML = '';
        if (v && /^data:image/.test(v.dataUrl)) caja.appendChild(h('img', { src: v.dataUrl, alt: '' }));
        else caja.appendChild(h('div', { class: 'ph-ico', html: ui.icon(v ? 'file' : (o.camara ? 'camera' : 'file')) }));
        caja.appendChild(h('div', null,
          h('b', { text: v ? (o.listo || 'Foto lista') + ' ✓' : (o.titulo || 'Tomar foto') }),
          h('small', { text: v ? (v.nombre + ' · ' + v.kb + ' KB · tocar para cambiar') : (o.sub || '') })));
        caja.appendChild(input);
      }
      input.addEventListener('change', function () {
        var file = input.files && input.files[0];
        if (!file) return;
        caja.querySelector('b').textContent = 'Procesando...';
        A.foto(file).then(function (foto) {
          input.value = '';
          if (!foto) { ui.toast('No se pudo leer la foto', 'err'); pintar(); return; }
          if (foto.kb > 9000) { ui.toast('El archivo es muy pesado (máx. 9 MB)', 'err'); pintar(); return; }
          estado[k] = foto; quitarError(k); pintar(); cambio();
        });
      });
      pintar();
      f.vigias.push(pintar);
      return marco(k, etiqueta, o.req, caja, o.hint);
    };

    // Datos de solo lectura. fn() → [[etiqueta, valor, clase, ancho]]
    f.datos = function (fn) {
      var dl = h('dl', { class: 'facts' });
      function pintar() {
        var filas = fn() || [];
        dl.hidden = !filas.length;
        dl.innerHTML = '';
        filas.forEach(function (r) {
          if (!r) return;
          var dd = h('dd', { class: r[2] || '' });
          if (r[1] && r[1].nodeType) dd.appendChild(r[1]); else dd.textContent = r[1] == null || r[1] === '' ? '—' : r[1];
          dl.appendChild(h('div', { class: r[3] ? 'full' : '' }, h('dt', { text: r[0] }), dd));
        });
      }
      pintar();
      f.vigias.push(pintar);
      return dl;
    };

    // Bloque que solo se muestra si cond() es verdadero
    f.si = function (cond, hijos) {
      var div = h('div', null, hijos);
      f.vigias.push(function () { div.hidden = !cond(); });
      div.hidden = !cond();
      return div;
    };

    // Contenido calculado (se vuelve a pintar en cada cambio)
    f.calc = function (fn, cls) {
      var div = h('div', { class: cls || '' });
      function pintar() { var r = fn(); div.innerHTML = ''; if (r == null || r === '') { div.hidden = true; return; } div.hidden = false; if (r.nodeType) div.appendChild(r); else div.innerHTML = r; }
      pintar();
      f.vigias.push(pintar);
      return div;
    };

    function quitarError(k) {
      f.campos.forEach(function (c) { if (c.clave === k) { c.caja.classList.remove('bad'); var e = c.caja.querySelector('.errtxt'); if (e) e.remove(); } });
    }
    function visible(el) { while (el) { if (el.hidden) return false; el = el.parentElement; } return true; }
    function vacio(v) { return v == null || v === '' || (typeof v === 'string' && !v.trim()); }

    // Revisa los obligatorios visibles; marca y lleva al primero que falta
    f.validar = function () {
      var falta = null;
      f.campos.forEach(function (c) {
        var requerido = typeof c.req === 'function' ? c.req() : c.req;
        if (!requerido || !visible(c.caja) || !c.caja.isConnected) return;
        if (vacio(estado[c.clave])) {
          c.caja.classList.add('bad');
          if (!c.caja.querySelector('.errtxt')) c.caja.appendChild(h('div', { class: 'errtxt', text: 'Falta completar' }));
          if (!falta) falta = c;
        }
      });
      if (falta) {
        falta.caja.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return 'Falta: ' + (falta.etiqueta || 'un campo obligatorio');
      }
      return null;
    };
    f.error = function (clave, msg) {
      var c = f.campos.filter(function (x) { return x.clave === clave; })[0];
      if (c) {
        c.caja.classList.add('bad');
        var e = c.caja.querySelector('.errtxt');
        if (!e) { e = h('div', { class: 'errtxt' }); c.caja.appendChild(e); }
        e.textContent = msg;
        c.caja.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return msg;
    };
    return f;
  };

  // Etiqueta de tipo de servicio
  ui.pillServicio = function (t) {
    var s = A.tipoServicio(t);
    if (!s) return 'Sin dato';
    var cls = { demo: 'demo', contrato: 'contrato', autogestionado: 'auto' }[s.toLowerCase()] || '';
    return h('span', { class: 'pill ' + cls, text: s });
  };

  // Ítems de equipo para el buscador
  ui.itemsEquipos = function (equipos) {
    return (equipos || []).map(function (e) {
      var inactivo = String(e.estado || '').toLowerCase() === 'inactivo';
      return {
        v: e.id, t: e.cliente || e.id,
        s: e.id + ' · ' + (e.modelo || '') + ' · ' + String(e.distrito || '').split(',')[0],
        tag: inactivo ? 'Inactivo' : A.tipoServicio(e.tipoContrato), tagCls: inactivo ? 'inact' : '',
        buscar: [e.id, e.cliente, e.modelo, e.distrito, e.direccion].join(' '),
        e: e,
      };
    });
  };
})();
