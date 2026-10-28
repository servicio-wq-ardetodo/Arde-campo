// ============================================================
// ARDE Campo · núcleo
// Sesión, conexión con la API, datos sin señal, cola de envíos,
// borradores, fotos comprimidas y GPS.
// ============================================================
(function () {
  'use strict';
  var A = window.A = {};
  A.cfg = window.ARDE_CONFIG;

  // ── Eventos simples ──
  var oyentes = {};
  A.on = function (ev, fn) { (oyentes[ev] = oyentes[ev] || []).push(fn); };
  A.emit = function (ev, data) { (oyentes[ev] || []).forEach(function (fn) { try { fn(data); } catch (e) { console.error(e); } }); };

  // ── Almacenamiento local (localStorage, a prueba de fallos) ──
  A.store = {
    get: function (k, def) {
      try { var v = localStorage.getItem('arde_' + k); return v == null ? def : JSON.parse(v); } catch (e) { return def; }
    },
    set: function (k, v) { try { localStorage.setItem('arde_' + k, JSON.stringify(v)); } catch (e) { console.warn('store', e); } },
    del: function (k) { try { localStorage.removeItem('arde_' + k); } catch (e) {} },
  };

  A.uuid = function () {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  };

  A.dispositivo = A.store.get('dispositivo');
  if (!A.dispositivo) { A.dispositivo = A.uuid(); A.store.set('dispositivo', A.dispositivo); }

  // ── IndexedDB: cola de envíos y borradores (guardan fotos) ──
  var dbPromesa = null;
  function db() {
    if (dbPromesa) return dbPromesa;
    dbPromesa = new Promise(function (ok, mal) {
      var req = indexedDB.open('arde-campo', 1);
      req.onupgradeneeded = function () {
        var d = req.result;
        if (!d.objectStoreNames.contains('cola')) d.createObjectStore('cola', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('borradores')) d.createObjectStore('borradores', { keyPath: 'clave' });
      };
      req.onsuccess = function () { ok(req.result); };
      req.onerror = function () { mal(req.error); };
    });
    return dbPromesa;
  }
  function tx(store, modo, fn) {
    return db().then(function (d) {
      return new Promise(function (ok, mal) {
        var t = d.transaction(store, modo);
        var s = t.objectStore(store);
        var res = fn(s);
        t.oncomplete = function () { ok(res && res.result !== undefined ? res.result : res); };
        t.onerror = function () { mal(t.error); };
        t.onabort = function () { mal(t.error); };
      });
    });
  }
  A.idb = {
    put: function (store, obj) { return tx(store, 'readwrite', function (s) { s.put(obj); }); },
    del: function (store, key) { return tx(store, 'readwrite', function (s) { s.delete(key); }); },
    get: function (store, key) {
      return db().then(function (d) {
        return new Promise(function (ok, mal) {
          var r = d.transaction(store).objectStore(store).get(key);
          r.onsuccess = function () { ok(r.result || null); }; r.onerror = function () { mal(r.error); };
        });
      });
    },
    all: function (store) {
      return db().then(function (d) {
        return new Promise(function (ok, mal) {
          var r = d.transaction(store).objectStore(store).getAll();
          r.onsuccess = function () { ok(r.result || []); }; r.onerror = function () { mal(r.error); };
        });
      });
    },
  };

  // ── Llamadas a la API ──
  A.apiConfigurada = function () { return A.cfg.API_URL && A.cfg.API_URL.indexOf('PEGAR_AQUI') === -1; };

  A.api = function (accion, cuerpo, opciones) {
    opciones = opciones || {};
    var body = Object.assign({ accion: accion, token: A.sesion.token(), dispositivo: A.dispositivo }, cuerpo || {});
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, opciones.timeout || 45000);
    // text/plain evita la consulta previa (CORS) con Apps Script
    return fetch(A.cfg.API_URL, {
      method: 'POST', body: JSON.stringify(body), redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, signal: ctrl ? ctrl.signal : undefined,
    }).then(function (r) {
      clearTimeout(timer);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }, function (e) { clearTimeout(timer); throw e; }).then(function (res) {
      if (res && res.sesion === false) { A.emit('sesion-vencida', res.mensaje); }
      return res;
    });
  };

  // ── Sesión ──
  A.sesion = {
    token: function () { return A.store.get('token', ''); },
    usuario: function () { return A.store.get('usuario', null); },
    activa: function () { return !!A.store.get('token', ''); },
    guardar: function (token, usuario) { A.store.set('token', token); A.store.set('usuario', usuario); },
    cerrar: function () { A.store.del('token'); A.store.del('usuario'); A.store.del('datos'); },
    esTecnico: function () { var u = A.sesion.usuario(); return !!u && (u.rol === 'TECNICO' || u.rol === 'ADMIN'); },
    esComercial: function () { var u = A.sesion.usuario(); return !!u && (u.rol === 'COMERCIAL' || u.rol === 'ADMIN'); },
  };

  // ── Datos (equipos, fragancias, programados) guardados para usar sin señal ──
  A.datos = {
    actual: function () { return A.store.get('datos', null); },
    refrescar: function () {
      if (!navigator.onLine) return Promise.resolve(A.datos.actual());
      return A.api('datos').then(function (res) {
        if (!res || !res.ok) throw new Error((res && res.mensaje) || 'No se pudieron cargar los datos');
        res.descargadoEn = Date.now();
        A.store.set('datos', res);
        A.emit('datos', res);
        return res;
      });
    },
  };

  // Datos + cambios que ya hiciste en este celular y aún no se reflejan en el servidor
  A.vista = function (cola) {
    var d = A.datos.actual();
    if (!d) return null;
    var desde = d.descargadoEn || 0;
    var recientes = (cola || []).filter(function (it) { return it.creado > desde && it.estado !== 'rechazado'; });
    var v = {
      equipos: (d.equipos || []).map(function (e) { return Object.assign({}, e); }),
      fragancias: d.fragancias || [],
      modelos: (d.modelos && d.modelos.length) ? d.modelos : A.cfg.MODELOS_RESPALDO,
      programados: {},
      hoy: d.hoy,
      descargadoEn: desde,
    };
    var usados = {};
    recientes.forEach(function (it) {
      var ref = it.ref || {};
      if (ref.programado) usados[ref.programado.modulo + '|' + ref.programado.ticket + '|' + ref.programado.fila] = true;
      if (ref.quitarEquipo) v.equipos = v.equipos.filter(function (e) { return e.id !== ref.quitarEquipo; });
      if (ref.equipo) {
        v.equipos.forEach(function (e) { if (e.id === ref.equipo.id) Object.assign(e, ref.equipo.cambios); });
      }
    });
    var p = d.programados || {};
    Object.keys(p).forEach(function (m) {
      v.programados[m] = (p[m] || []).filter(function (x) { return !usados[m + '|' + x.ticket + '|' + x.fila]; });
    });
    return v;
  };

  // ── Cola de envíos ──
  var enviando = false;
  A.cola = {
    todos: function () { return A.idb.all('cola').then(function (l) { return l.sort(function (a, b) { return b.creado - a.creado; }); }); },
    agregar: function (item) {
      item.id = item.id || A.uuid();
      item.creado = Date.now();
      item.capturadoEn = new Date().toISOString();
      item.estado = 'pendiente';
      item.intentos = 0;
      item.proximo = 0;
      return A.idb.put('cola', item).then(function () {
        A.emit('cola');
        setTimeout(A.cola.sincronizar, 50);
        return item;
      });
    },
    pendientes: function () {
      return A.cola.todos().then(function (l) { return l.filter(function (x) { return x.estado === 'pendiente' || x.estado === 'enviando'; }); });
    },
    descartar: function (id) { return A.idb.del('cola', id).then(function () { A.emit('cola'); }); },
    reintentar: function (id) {
      return A.idb.get('cola', id).then(function (it) {
        if (!it) return;
        it.estado = 'pendiente'; it.intentos = 0; it.proximo = 0; it.mensaje = '';
        return A.idb.put('cola', it).then(function () { A.emit('cola'); A.cola.sincronizar(); });
      });
    },
    sincronizar: function () {
      if (enviando || !A.sesion.activa() || !A.apiConfigurada()) return Promise.resolve();
      if (!navigator.onLine) { A.emit('cola'); return Promise.resolve(); }
      enviando = true;
      A.emit('sync', 'enviando');
      var huboOk = false, corte = false;
      return A.cola.todos().then(function (lista) {
        var ahora = Date.now();
        var porEnviar = lista.filter(function (x) {
          return (x.estado === 'pendiente' || x.estado === 'enviando') && (x.proximo || 0) <= ahora;
        }).sort(function (a, b) { return a.creado - b.creado; });
        return porEnviar.reduce(function (cadena, it) {
          return cadena.then(function () {
            if (corte) return;
            it.estado = 'enviando';
            return A.idb.put('cola', it).then(function () {
              A.emit('cola');
              return A.api('registrar', {
                id: it.id, modulo: it.modulo, datos: it.datos, gps: it.gps, capturadoEn: it.capturadoEn,
              }, { timeout: 90000 });
            }).then(function (res) {
              if (res.sesion === false) { it.estado = 'pendiente'; corte = true; return; }
              if (res.ok) {
                it.estado = 'ok'; it.mensaje = res.mensaje || 'Registrado'; it.ticket = res.ticket || '';
                it.enviado = Date.now(); it.datos = aligerar(it.datos); huboOk = true;
              } else if (res.transitorio) {
                it.intentos++;
                if (it.intentos >= 6) { it.estado = 'rechazado'; it.mensaje = res.mensaje; }
                else { it.estado = 'pendiente'; it.proximo = Date.now() + espera(it.intentos); it.mensaje = 'Se reintentará: ' + res.mensaje; }
              } else {
                it.estado = 'rechazado'; it.mensaje = res.mensaje || 'Rechazado por el servidor';
              }
            }, function (err) {
              // Sin señal o servidor lento: queda en cola
              it.estado = 'pendiente'; it.intentos++; it.proximo = Date.now() + espera(it.intentos);
              it.mensaje = 'Sin conexión. Se enviará solo.'; corte = true;
            }).then(function () { return A.idb.put('cola', it); }).then(function () { A.emit('cola'); });
          });
        }, Promise.resolve());
      }).then(function () {
        enviando = false;
        A.emit('sync', corte ? 'cortado' : 'listo');
        if (huboOk) A.datos.refrescar().catch(function () {});
        return limpiarViejos();
      }, function (e) { enviando = false; A.emit('sync', 'error'); console.error(e); });
    },
  };
  A.cola.ocupada = function () { return enviando; };

  function espera(n) { return Math.min(300000, 5000 * Math.pow(2, n - 1)); }

  // Una vez enviado, se borran las fotos del celular (ya están en Drive)
  function aligerar(datos) {
    var d = {};
    Object.keys(datos || {}).forEach(function (k) {
      var v = datos[k];
      if (typeof v === 'string' && v.length > 2000) return;
      if (k === 'sedes' || k === 'luzVerde') return;
      d[k] = v;
    });
    return d;
  }

  function limpiarViejos() {
    var limite = Date.now() - 14 * 86400000;
    return A.idb.all('cola').then(function (l) {
      return Promise.all(l.filter(function (x) { return x.estado === 'ok' && x.creado < limite; })
        .map(function (x) { return A.idb.del('cola', x.id); }));
    });
  }

  window.addEventListener('online', function () { A.emit('red', true); A.cola.sincronizar(); A.datos.refrescar().catch(function () {}); });
  window.addEventListener('offline', function () { A.emit('red', false); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) A.cola.sincronizar(); });
  setInterval(function () { A.cola.sincronizar(); }, 20000);

  // ── Borradores (se guardan solos mientras escribes, con fotos) ──
  A.borrador = {
    guardar: function (clave, estado) { return A.idb.put('borradores', { clave: clave, estado: estado, guardado: Date.now() }).catch(function () {}); },
    leer: function (clave) { return A.idb.get('borradores', clave).catch(function () { return null; }); },
    borrar: function (clave) { return A.idb.del('borradores', clave).catch(function () {}); },
  };

  // ── GPS (no bloquea: si no hay permiso o tarda, se envía sin ubicación) ──
  A.gps = function () {
    return new Promise(function (ok) {
      if (!navigator.geolocation) return ok(null);
      var listo = false;
      var t = setTimeout(function () { if (!listo) { listo = true; ok(null); } }, 7000);
      navigator.geolocation.getCurrentPosition(function (p) {
        if (listo) return; listo = true; clearTimeout(t);
        ok({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6), precision: Math.round(p.coords.accuracy) });
      }, function () { if (!listo) { listo = true; clearTimeout(t); ok(null); } },
      { enableHighAccuracy: true, timeout: 6500, maximumAge: 60000 });
    });
  };

  // ── Fotos: se reducen a 1600 px y JPEG (una foto de 5 MB pasa a ~250 KB) ──
  A.foto = function (file, opciones) {
    opciones = opciones || {};
    var max = opciones.max || 1600;
    return new Promise(function (ok) {
      if (!file) return ok(null);
      var lector = new FileReader();
      lector.onload = function () {
        var original = { dataUrl: lector.result, mime: file.type || 'image/jpeg', nombre: file.name || 'foto.jpg', kb: Math.round(file.size / 1024) };
        if (!/^image\//.test(file.type) || /gif|svg/.test(file.type)) return ok(original); // PDF u otros: tal cual
        var img = new Image();
        img.onload = function () {
          try {
            var w = img.naturalWidth, h = img.naturalHeight;
            var esc = Math.min(1, max / Math.max(w, h));
            var c = document.createElement('canvas');
            c.width = Math.round(w * esc); c.height = Math.round(h * esc);
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            var url = c.toDataURL('image/jpeg', 0.72);
            if (!url || url.length < 100) return ok(original);
            ok({ dataUrl: url, mime: 'image/jpeg', nombre: (file.name || 'foto').replace(/\.\w+$/, '') + '.jpg', kb: Math.round(url.length * 0.75 / 1024) });
          } catch (e) { ok(original); }
        };
        img.onerror = function () { ok(original); };
        img.src = lector.result;
      };
      lector.onerror = function () { ok(null); };
      lector.readAsDataURL(file);
    });
  };
  A.base64 = function (foto) { return foto && foto.dataUrl ? foto.dataUrl.split(',')[1] : ''; };

  // ── Utilidades de fecha y catálogo ──
  A.hoyLima = function () {
    var d = new Date(Date.now() - 5 * 3600000);
    return d.toISOString().slice(0, 10);
  };
  A.fechaLima = function (iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return new Date(d.getTime() - 5 * 3600000).toISOString().slice(0, 10);
  };
  A.diasDesde = function (iso) {
    if (!iso) return null;
    var d = new Date(iso);
    if (isNaN(d)) return null;
    return Math.max(0, Math.round((Date.now() - d.getTime()) / 86400000));
  };
  A.tipoServicio = function (t) {
    var s = String(t || '').trim();
    if (s.toLowerCase() === 'prueba') return 'Demo';
    return s;
  };
  A.modelo = function (vista, codigo) {
    var c = String(codigo || '').split('|')[0].trim().toUpperCase();
    var lista = (vista && vista.modelos) || A.cfg.MODELOS_RESPALDO;
    for (var i = 0; i < lista.length; i++) if (String(lista[i].codigo).toUpperCase() === c) return lista[i];
    for (var j = 0; j < lista.length; j++) if (c.indexOf(String(lista[j].codigo).toUpperCase()) === 0) return lista[j];
    return null;
  };
  A.hora = function (iso) {
    var d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
  };
  A.diaTexto = function (iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    var hoy = A.hoyLima(), f = A.fechaLima(iso);
    var ayer = new Date(Date.now() - 5 * 3600000 - 86400000).toISOString().slice(0, 10);
    if (f === hoy) return 'Hoy';
    if (f === ayer) return 'Ayer';
    return d.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });
  };
})();
