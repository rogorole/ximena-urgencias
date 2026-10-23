/*
 * Capa de datos compartida por el presentador y los celulares.
 *
 * - Modo Firebase: Realtime Database (cuando config.js trae la URL).
 * - Modo de prueba local: sin internet ni Firebase. La pestaña del presentador
 *   guarda los datos y las demás pestañas del MISMO navegador se conectan a ella.
 *   Sirve para ensayar; no conecta celulares reales.
 *
 * Las dos implementaciones exponen la misma API:
 *   sub(ruta, cb) -> desuscribir     get(ruta) -> Promise
 *   set / update / remove            onDisconnectRemove(ruta)
 *   now() hora del servidor (ms)     TS marca de tiempo del servidor
 *   onConnection(cb)                 onError(cb)
 */
(function () {
  'use strict';

  var QZ = window.QZ = window.QZ || {};
  var SV = { '.sv': 'timestamp' };

  // ---------- configuración ----------
  var conf = window.QUIZ_CONFIG || {};
  var dbURL = String(conf.databaseURL || '').trim().replace(/\/+$/, '');
  var params = new URLSearchParams(location.search);
  QZ.forcedLocal = params.get('local') === '1';
  QZ.hasURL = /^https:\/\/\S+$/i.test(dbURL);
  QZ.sdkMissing = QZ.hasURL && typeof window.firebase === 'undefined';
  QZ.useFirebase = !QZ.forcedLocal && QZ.hasURL && !QZ.sdkMissing;

  // ---------- utilidades ----------
  function parts(path) { return String(path || '').split('/').filter(Boolean); }
  function joinPath(a, b) { return parts(a).concat(parts(b)).join('/'); }
  function isSV(v) { return v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 1 && v['.sv'] === 'timestamp'; }
  function copy(v) { return v == null ? null : JSON.parse(JSON.stringify(v)); }

  QZ.withTimeout = function (p, ms) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { reject(new Error('timeout')); }, ms);
      p.then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
    });
  };
  QZ.fire = function (p) {
    if (p && typeof p.catch === 'function') p.catch(function (e) { console.error('[datos]', e); });
    return p;
  };
  QZ.isPermissionError = function (e) {
    var s = String((e && (e.code || '')) + ' ' + (e && e.message || ''));
    return /permission/i.test(s);
  };

  // =====================================================================
  // Firebase Realtime Database
  // =====================================================================
  function FirebaseStore() {
    var options = {};
    Object.keys(conf).forEach(function (k) { options[k] = conf[k]; });
    options.databaseURL = dbURL;
    if (!firebase.apps.length) firebase.initializeApp(options);
    var db = firebase.database();
    // Solo para pruebas con un servidor local (no hace falta para el juego real).
    if (conf.emulator) {
      var hp = String(conf.emulator).split(':');
      db.useEmulator(hp[0], Number(hp[1]) || 9000);
    }

    var offset = 0, connected = false, connSubs = [], errSubs = [];
    db.ref('.info/serverTimeOffset').on('value', function (s) { offset = Number(s.val()) || 0; });
    db.ref('.info/connected').on('value', function (s) {
      connected = s.val() === true;
      connSubs.slice().forEach(function (cb) { cb(connected); });
    });

    function report(e) { errSubs.slice().forEach(function (cb) { try { cb(e); } catch (x) {} }); }
    function guard(fn) {
      try { return fn().catch(function (e) { report(e); throw e; }); }
      catch (e) { report(e); return Promise.reject(e); }
    }

    return {
      mode: 'firebase',
      TS: firebase.database.ServerValue.TIMESTAMP,
      now: function () { return Date.now() + offset; },
      sub: function (path, cb) {
        var ref = db.ref(path);
        var h = ref.on('value', function (s) { cb(s.val()); }, function (e) { console.error('[datos]', e); report(e); });
        return function () { ref.off('value', h); };
      },
      get: function (path) { return guard(function () { return db.ref(path).once('value').then(function (s) { return s.val(); }); }); },
      set: function (path, v) { return guard(function () { return db.ref(path).set(v); }); },
      update: function (path, obj) { return guard(function () { return db.ref(path).update(obj); }); },
      remove: function (path) { return guard(function () { return db.ref(path).remove(); }); },
      onDisconnectRemove: function (path) { return guard(function () { return db.ref(path).onDisconnect().remove(); }); },
      onConnection: function (cb) {
        connSubs.push(cb);
        setTimeout(function () { cb(connected); }, 0);
        return function () { connSubs = connSubs.filter(function (x) { return x !== cb; }); };
      },
      onError: function (cb) { errSubs.push(cb); },
      isConnected: function () { return connected; }
    };
  }

  // =====================================================================
  // Modo de prueba local (BroadcastChannel entre pestañas)
  // =====================================================================

  // Las mismas reglas que Firebase, para que lo que funciona aquí funcione allá.
  function badKey(k) { return !k || /[.#$\/\[\]\u0000-\u001f\u007f]/.test(k); }
  function validateValue(v, where) {
    if (v === undefined) throw new Error('Valor undefined en ' + where);
    if (v === null) return;
    var t = typeof v;
    if (t === 'function' || t === 'symbol' || t === 'bigint') throw new Error('Valor inválido en ' + where);
    if (t === 'number' && !isFinite(v)) throw new Error('Número inválido en ' + where);
    if (t !== 'object' || isSV(v)) return;
    if (Array.isArray(v)) { v.forEach(function (x, i) { validateValue(x, where + '/' + i); }); return; }
    Object.keys(v).forEach(function (k) {
      if (badKey(k)) throw new Error('Llave inválida "' + k + '" en ' + where);
      validateValue(v[k], where + '/' + k);
    });
  }
  function validatePath(path) {
    parts(path).forEach(function (seg) {
      if (/[.#$\[\]\u0000-\u001f\u007f]/.test(seg)) throw new Error('Ruta inválida: ' + path);
    });
  }
  function validateOp(op) {
    validatePath(op.path);
    if (op.kind === 'set') validateValue(op.value, op.path);
    if (op.kind === 'update') {
      if (!op.value || typeof op.value !== 'object' || Array.isArray(op.value)) throw new Error('update necesita un objeto');
      var keys = Object.keys(op.value);
      var norm = keys.map(function (k) { return parts(k).join('/'); });
      keys.forEach(function (k, i) {
        if (!norm[i]) throw new Error('Llave vacía en update');
        validatePath(k);
        validateValue(op.value[k], joinPath(op.path, k));
      });
      norm.forEach(function (a) {
        norm.forEach(function (b) {
          if (a !== b && b.indexOf(a + '/') === 0) throw new Error('La ruta ' + a + ' es ancestro de ' + b);
        });
      });
    }
  }

  function resolveSV(v, now) {
    if (isSV(v)) return now;
    if (v && typeof v === 'object') {
      if (Array.isArray(v)) return v.map(function (x) { return resolveSV(x, now); });
      var o = {};
      Object.keys(v).forEach(function (k) { o[k] = resolveSV(v[k], now); });
      return o;
    }
    return v;
  }
  // Firebase no guarda null ni objetos vacíos.
  function clean(v) {
    if (v === null || v === undefined) return null;
    if (typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(function (x) { return clean(x); });
    var o = {}, any = false;
    Object.keys(v).forEach(function (k) { var c = clean(v[k]); if (c !== null) { o[k] = c; any = true; } });
    return any ? o : null;
  }
  function getAt(root, path) {
    var cur = root;
    var ps = parts(path);
    for (var i = 0; i < ps.length; i++) {
      if (cur === null || typeof cur !== 'object') return null;
      cur = cur[ps[i]];
      if (cur === undefined) return null;
    }
    return cur === undefined ? null : cur;
  }
  function setAt(root, path, val) {
    var ps = parts(path);
    var v = clean(val);
    if (!ps.length) {
      Object.keys(root).forEach(function (k) { delete root[k]; });
      if (v && typeof v === 'object') Object.keys(v).forEach(function (k) { root[k] = v[k]; });
      return;
    }
    var cur = root, trail = [];
    for (var i = 0; i < ps.length - 1; i++) {
      var k = ps[i];
      if (cur[k] === null || typeof cur[k] !== 'object') {
        if (v === null) return;
        cur[k] = {};
      }
      trail.push([cur, k]);
      cur = cur[k];
    }
    var last = ps[ps.length - 1];
    if (v === null) delete cur[last]; else cur[last] = v;
    for (var j = trail.length - 1; j >= 0; j--) {
      var o = trail[j][0], key = trail[j][1];
      if (o[key] && typeof o[key] === 'object' && !Object.keys(o[key]).length) delete o[key]; else break;
    }
  }

  function LocalStore(isServer) {
    var KEY = 'qz-local-db-v1';
    var ch = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('qz-local-v1') : null;
    var tree = {}, have = false, subs = [], connSubs = [], errSubs = [], dcOps = [];
    var connected = !!isServer, lastBeat = 0;
    var haveResolve, haveP = new Promise(function (r) { haveResolve = r; });

    function setConnected(v) {
      if (v === connected) return;
      connected = v;
      connSubs.slice().forEach(function (cb) { cb(v); });
    }
    function fireSub(s) {
      if (!have || s.dead) return;
      var j = JSON.stringify(getAt(tree, s.path));
      if (j === s.last) return;
      s.last = j;
      try { s.cb(JSON.parse(j)); } catch (e) { console.error(e); }
    }
    function emitAll() { subs.slice().forEach(fireSub); }
    function gotTree(t) {
      tree = t || {};
      lastBeat = Date.now();
      if (!have) { have = true; haveResolve(); }
      setConnected(true);
      emitAll();
    }
    function applyOp(op) {
      var now = Date.now();
      if (op.kind === 'set') setAt(tree, op.path, resolveSV(op.value, now));
      else if (op.kind === 'update') Object.keys(op.value).forEach(function (k) { setAt(tree, joinPath(op.path, k), resolveSV(op.value[k], now)); });
      else if (op.kind === 'remove') setAt(tree, op.path, null);
      try { localStorage.setItem(KEY, JSON.stringify(tree)); } catch (e) {}
      if (ch) ch.postMessage({ t: 'tree', tree: tree });
      setTimeout(emitAll, 0);
    }

    if (isServer) {
      try { tree = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { tree = {}; }
      have = true; haveResolve();
      if (ch) {
        ch.onmessage = function (e) {
          var m = e.data || {};
          if (m.t === 'op') { try { validateOp(m.op); applyOp(m.op); } catch (x) { console.error('[local]', x); } }
          else if (m.t === 'hello') ch.postMessage({ t: 'tree', tree: tree });
        };
        setInterval(function () { ch.postMessage({ t: 'beat' }); }, 1500);
        ch.postMessage({ t: 'tree', tree: tree });
      }
    } else if (ch) {
      ch.onmessage = function (e) {
        var m = e.data || {};
        if (m.t === 'tree') gotTree(m.tree);
        else if (m.t === 'beat') { lastBeat = Date.now(); if (!have) ch.postMessage({ t: 'hello' }); else setConnected(true); }
      };
      ch.postMessage({ t: 'hello' });
      setInterval(function () { if (!have) ch.postMessage({ t: 'hello' }); }, 700);
      setInterval(function () { if (have && Date.now() - lastBeat > 5000) setConnected(false); }, 1000);
      addEventListener('pagehide', function () { dcOps.forEach(function (op) { ch.postMessage({ t: 'op', op: op }); }); });
    }

    function write(op) {
      try { validateOp(op); }
      catch (e) { console.error('[local]', e); errSubs.slice().forEach(function (cb) { cb(e); }); return Promise.reject(e); }
      if (isServer) { applyOp(op); return Promise.resolve(); }
      if (!ch) return Promise.reject(new Error('Este navegador no soporta el modo de prueba local'));
      ch.postMessage({ t: 'op', op: copy(op) });
      return Promise.resolve();
    }

    return {
      mode: 'local',
      TS: SV,
      now: function () { return Date.now(); },
      sub: function (path, cb) {
        var s = { path: path, cb: cb, last: undefined, dead: false };
        subs.push(s);
        setTimeout(function () { fireSub(s); }, 0);
        return function () { s.dead = true; subs = subs.filter(function (x) { return x !== s; }); };
      },
      get: function (path) { return haveP.then(function () { return copy(getAt(tree, path)); }); },
      set: function (path, v) { return write({ kind: 'set', path: path, value: v }); },
      update: function (path, obj) { return write({ kind: 'update', path: path, value: obj }); },
      remove: function (path) { return write({ kind: 'remove', path: path }); },
      onDisconnectRemove: function (path) {
        if (!isServer) {
          dcOps = dcOps.filter(function (op) { return op.path !== path; });
          dcOps.push({ kind: 'remove', path: path });
        }
        return Promise.resolve();
      },
      onConnection: function (cb) {
        connSubs.push(cb);
        setTimeout(function () { cb(connected); }, 0);
        return function () { connSubs = connSubs.filter(function (x) { return x !== cb; }); };
      },
      onError: function (cb) { errSubs.push(cb); },
      isConnected: function () { return connected; }
    };
  }

  QZ.createStore = function (opts) {
    opts = opts || {};
    return QZ.useFirebase ? FirebaseStore() : LocalStore(!!opts.server);
  };
})();
