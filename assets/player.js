/* Urgencias respiratorias · pantalla del jugador (celular) */
(function () {
  'use strict';

  var QZ = window.QZ;
  var fire = QZ.fire;
  var LETTERS = ['A', 'B', 'C', 'D'];
  var SHAPES = [
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 22 20H2z"/></svg>',
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 22 12 12 22 2 12z"/></svg>',
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/></svg>',
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>'
  ];
  var ICONS = {
    check: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    cross: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    clock: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    siren: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M18 46V32a14 14 0 0 1 28 0v14z" fill="#DD2E24"/><path d="M24 34a8 8 0 0 1 8-8" stroke="#fff" stroke-width="3.5" fill="none" stroke-linecap="round"/><rect x="12" y="46" width="40" height="8" rx="3" fill="#9F1920"/><path d="M32 6v7M12 14l5 5M52 14l-5 5M4 30h7M53 30h7" stroke="#9F1920" stroke-width="4" stroke-linecap="round"/></svg>',
    eye: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M4 32s10-16 28-16 28 16 28 16-10 16-28 16S4 32 4 32z" fill="#fff"/><circle cx="32" cy="32" r="10" fill="#9F1920"/><circle cx="35" cy="29" r="3" fill="#fff"/></svg>',
    trophy: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M20 8h24v14a12 12 0 0 1-24 0z" fill="#E4B856" stroke="#9F1920" stroke-width="3"/><path d="M20 12h-8a8 8 0 0 0 8 10M44 12h8a8 8 0 0 1-8 10" fill="none" stroke="#9F1920" stroke-width="3"/><path d="M28 34h8v8h-8z" fill="#9F1920"/><rect x="20" y="42" width="24" height="8" rx="2" fill="#9F1920"/></svg>'
  };

  // ?slot=N permite tener varios "jugadores" en el mismo navegador para ensayar.
  var params = new URLSearchParams(location.search);
  var SLOT = (params.get('slot') || '').replace(/\W/g, '');
  var LS_ME = 'qz-player-v1' + (SLOT ? '-' + SLOT : '');
  var LS_ANS = 'qz-answers-v1' + (SLOT ? '-' + SLOT : '');

  var store = QZ.createStore({ server: false });
  var app = document.getElementById('app');
  var meName = document.getElementById('me-name');
  var mePts = document.getElementById('me-pts');
  var net = document.getElementById('net');

  var me = null, joined = false, state = null, board = null, seenSelf = false;
  var unsubs = [], viewKey = '', connected = false, netTimer = null, buzzKey = '';
  var answered = lsGet(LS_ANS) || {};

  // ------------------------------------------------------------------ utilidades
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function fmtPin(p) { p = String(p || ''); return p.length > 3 ? p.slice(0, 3) + ' ' + p.slice(3) : p; }
  function fmtPts(n) { return Math.round(n || 0).toLocaleString('es-MX'); }
  // Quita caracteres de control e invisibles (por rangos de código, sin regex).
  var HIDDEN = [[0x0, 0x1f], [0x7f, 0x9f], [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x206f], [0xfeff, 0xfeff]];
  function cleanName(s) {
    s = String(s || '');
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i), hidden = false;
      for (var j = 0; j < HIDDEN.length; j++) {
        if (c >= HIDDEN[j][0] && c <= HIDDEN[j][1]) { hidden = true; break; }
      }
      out += hidden ? ' ' : s.charAt(i);
    }
    return Array.from(out.replace(/\s+/g, ' ').trim()).slice(0, 18).join('').trim();
  }
  function newId() {
    var abc = 'abcdefghijkmnpqrstuvwxyz23456789', s = 'p';
    var r = window.crypto && window.crypto.getRandomValues ? window.crypto.getRandomValues(new Uint8Array(11)) : null;
    for (var i = 0; i < 11; i++) s += abc[(r ? r[i] : Math.floor(Math.random() * 256)) % abc.length];
    return s;
  }
  function buzz(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} }
  function badge(i) {
    var b = el('span', 'badge');
    b.innerHTML = SHAPES[i] + '<b>' + LETTERS[i] + '</b>';
    return b;
  }
  function choiceChip(q, i) {
    var c = el('div', 'choice o' + i);
    c.append(badge(i), el('span', null, q.options[i]));
    return c;
  }
  function screen(key, build) {
    if (key === viewKey) return false;
    viewKey = key;
    app.textContent = '';
    build();
    return true;
  }

  // ------------------------------------------------------------------ mantener la pantalla encendida
  var wakeLock = null;
  function keepAwake() {
    if (!joined || wakeLock || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
    navigator.wakeLock.request('screen').then(function (w) {
      wakeLock = w;
      w.addEventListener('release', function () { wakeLock = null; });
    }).catch(function () {});
  }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') keepAwake(); });
  document.addEventListener('click', keepAwake);

  // ------------------------------------------------------------------ unirse
  function viewJoin(pin, name, msg) {
    joined = false;
    document.body.classList.remove('joined');
    viewKey = 'join';
    app.textContent = '';
    var wrap = el('div', 'join');
    var hero = el('div', 'hero');
    hero.append(
      el('p', 'kicker', 'Código azul'),
      el('h1', 'display hero-title', 'Urgencias respiratorias'),
      el('p', 'hero-sub', 'Únete al equipo médico y responde desde tu celular.')
    );
    var form = el('form', 'card form');
    form.noValidate = true;
    form.setAttribute('autocomplete', 'off');
    var l1 = el('label', 'field');
    var inPin = el('input');
    inPin.type = 'text'; inPin.name = 'pin'; inPin.inputMode = 'numeric'; inPin.maxLength = 7;
    inPin.placeholder = '000 000'; inPin.autocomplete = 'off'; inPin.value = fmtPin(pin || '');
    l1.append(el('span', null, 'PIN del juego'), inPin);
    var l2 = el('label', 'field');
    var inName = el('input');
    inName.type = 'text'; inName.name = 'nickname'; inName.maxLength = 18; inName.placeholder = 'Tu nombre o apodo';
    inName.autocomplete = 'nickname'; inName.enterKeyHint = 'go'; inName.value = name || '';
    l2.append(el('span', null, 'Tu nombre'), inName);
    var err = el('p', 'err');
    if (msg) { err.textContent = msg.text; if (msg.note) err.classList.add('note'); } else err.hidden = true;
    var btn = el('button', 'btn btn-primary', 'Entrar');
    btn.type = 'submit';
    form.append(l1, l2, err, btn);
    wrap.append(hero, form);
    app.appendChild(wrap);

    inPin.addEventListener('input', function () {
      var d = inPin.value.replace(/\D/g, '').slice(0, 6);
      inPin.value = fmtPin(d);
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      doJoin(inPin.value.replace(/\D/g, ''), inName.value, err, btn);
    });
    setTimeout(function () { try { (pin ? inName : inPin).focus(); } catch (e) {} }, 60);
  }

  function doJoin(pin, rawName, err, btn) {
    var name = cleanName(rawName);
    function fail(text) { err.hidden = false; err.classList.remove('note'); err.textContent = text; btn.disabled = false; btn.textContent = 'Entrar'; }
    if (!/^\d{6}$/.test(pin)) return fail('El PIN tiene 6 números. Lo ves en la pantalla.');
    if (!name) return fail('Escribe tu nombre.');
    btn.disabled = true;
    btn.textContent = 'Entrando…';
    err.hidden = true;
    var base = 'games/' + pin;
    QZ.withTimeout(store.get(base + '/created'), 9000).then(function (created) {
      if (!created) throw new Error('nopin');
      return QZ.withTimeout(store.get(base + '/players'), 9000);
    }).then(function (players) {
      players = players || {};
      var saved = lsGet(LS_ME);
      var pid = saved && saved.pin === pin && saved.pid && players[saved.pid] ? saved.pid : newId();
      var low = name.toLowerCase();
      var taken = Object.keys(players).some(function (k) {
        var p = players[k];
        return k !== pid && p && typeof p.name === 'string' && p.name.toLowerCase() === low;
      });
      if (taken) throw new Error('taken');
      return QZ.withTimeout(store.set(base + '/players/' + pid, { name: name, joined: store.TS }), 9000).then(function () { return pid; });
    }).then(function (pid) {
      me = { pin: pin, pid: pid, name: name };
      lsSet(LS_ME, me);
      enterGame();
    }).catch(function (e) {
      var m = e && e.message;
      if (m === 'nopin') fail('No encontramos ese PIN. Revísalo en la pantalla.');
      else if (m === 'taken') fail('Ese nombre ya está en uso. Prueba con otro.');
      else if (m === 'timeout') fail(store.mode === 'local'
        ? 'No se pudo conectar. Si estás en tu celular: al juego le falta la URL de Firebase en config.js.'
        : 'No se pudo conectar. Revisa tu internet e intenta otra vez.');
      else if (QZ.isPermissionError(e)) fail('El juego no está aceptando jugadores (permiso denegado). Avísale al presentador.');
      else fail('Algo falló. Intenta otra vez.');
    });
  }

  function resume(saved) {
    viewKey = 'resume';
    app.textContent = '';
    var c = el('div', 'center');
    c.append(el('h1', 'display title', 'Conectando…'), el('p', 'lead', 'Recuperando tu lugar en el juego.'));
    app.appendChild(c);
    QZ.withTimeout(store.get('games/' + saved.pin + '/players/' + saved.pid), 9000).then(function (p) {
      if (p && p.name) {
        me = { pin: saved.pin, pid: saved.pid, name: p.name };
        lsSet(LS_ME, me);
        enterGame();
      } else {
        viewJoin(saved.pin, saved.name || '', null);
      }
    }).catch(function () {
      viewJoin(saved.pin, saved.name || '', { text: 'No pudimos conectarnos. Revisa tu internet y vuelve a entrar.' });
    });
  }

  function enterGame() {
    joined = true;
    seenSelf = false;
    state = null;
    board = null;
    viewKey = '';
    unsubs.forEach(function (u) { u(); });
    unsubs = [];
    document.body.classList.add('joined');
    meName.textContent = me.name;
    var base = 'games/' + me.pin;
    unsubs.push(store.sub(base + '/state', function (v) { state = v; render(); }));
    unsubs.push(store.sub(base + '/board', function (v) { board = v; render(); }));
    unsubs.push(store.sub(base + '/players/' + me.pid, function (v) {
      if (v) seenSelf = true;
      else if (seenSelf) kicked();
    }));
    markOnline();
    keepAwake();
    render();
  }

  function markOnline() {
    if (!joined || !me) return;
    var p = 'games/' + me.pin + '/online/' + me.pid;
    fire(store.set(p, true));
    fire(store.onDisconnectRemove(p));
  }

  function kicked() {
    var pin = me.pin;
    fire(store.remove('games/' + pin + '/online/' + me.pid));
    unsubs.forEach(function (u) { u(); });
    unsubs = [];
    me = null;
    lsSet(LS_ME, { pin: pin, pid: null, name: '' });
    viewJoin(pin, '', { text: 'El presentador te quitó de la partida. Puedes volver a entrar con otro nombre.', note: true });
  }

  // ------------------------------------------------------------------ respuestas
  function ansKey(q) { return me.pin + ':' + q.id + ':' + q.startAt; }
  function myAnswer(q) { var v = answered[ansKey(q)]; return typeof v === 'number' ? v : null; }
  function answer(i) {
    var s = state;
    if (!s || s.phase !== 'question' || !s.q) return;
    var q = s.q, k = ansKey(q);
    if (answered[k] != null) return;
    var now = store.now();
    if (now < q.startAt || now > q.startAt + q.dur * 1000) return;
    answered[k] = i;
    var keys = Object.keys(answered);
    if (keys.length > 60) keys.slice(0, keys.length - 60).forEach(function (x) { delete answered[x]; });
    lsSet(LS_ANS, answered);
    fire(store.set('games/' + me.pin + '/answers/' + q.id + '/' + me.pid, { c: i, at: store.TS }));
    buzz(25);
    render();
  }

  // ------------------------------------------------------------------ vistas del juego
  function mine() { return board && board.players && board.players[me.pid] || null; }

  function standingCard(m, count) {
    var box = el('div', 'standing');
    var a = el('div'), b = el('div');
    a.append(el('b', null, m.r + '°'), el('span', null, 'de ' + count));
    b.append(el('b', null, fmtPts(m.t)), el('span', null, 'puntos'));
    box.append(a, b);
    return box;
  }

  function updateHeader() {
    var m = joined ? mine() : null;
    if (m) { mePts.hidden = false; mePts.textContent = fmtPts(m.t) + ' pts'; }
    else mePts.hidden = true;
  }

  function render() {
    if (!joined || !me) return;
    updateHeader();
    var s = state;
    if (!s) {
      screen('wait', function () {
        var c = el('div', 'center');
        c.append(el('h1', 'display title', 'Conectando…'), el('p', 'lead', 'Un momento.'));
        app.appendChild(c);
      });
      return;
    }
    var m = mine(), total = s.total || 10;
    var q = s.q;

    if (s.phase === 'question' && q) {
      var now = store.now(), ans = myAnswer(q);
      var sub = ans != null ? 'answered'
        : now < q.startAt ? 'countdown'
        : now > q.startAt + q.dur * 1000 ? 'late' : 'open';
      if (sub === 'open' && buzzKey !== 'open' + q.startAt) { buzzKey = 'open' + q.startAt; buzz(40); }
      screen('q|' + q.id + '|' + q.startAt + '|' + sub, function () { viewQuestion(q, total, sub, ans); });
      tick();
      return;
    }
    if (s.phase === 'closed' && q) {
      var a2 = myAnswer(q);
      screen('c|' + q.id + '|' + q.startAt + '|' + a2, function () { viewClosed(q, a2); });
      return;
    }
    if (s.phase === 'reveal' && q) {
      var ready = board && board.qid === q.id;
      var k = 'r|' + q.id + '|' + q.startAt + '|' + (ready ? JSON.stringify(m) : 'espera');
      screen(k, function () {
        if (ready && !m) {
          var c0 = el('div', 'center');
          var ic0 = el('div', 'beacon');
          ic0.innerHTML = ICONS.siren;
          c0.append(ic0, el('h1', 'display title', '¡Ya estás dentro!'), el('p', 'lead', 'Empiezas a sumar puntos desde la siguiente pregunta.'));
          app.appendChild(c0);
        } else if (ready) viewReveal(q, s.correct, m, board.count || 0);
        else {
          var c = el('div', 'center');
          c.append(el('h1', 'display title', 'Calculando…'), el('p', 'lead', 'Revisando respuestas.'));
          app.appendChild(c);
        }
      });
      return;
    }
    if (s.phase === 'board' || s.phase === 'podium') {
      var fin = s.phase === 'podium';
      screen((fin ? 'f|' : 'b|') + JSON.stringify(m) + '|' + (board && board.count), function () { viewStanding(m, board ? board.count : 0, fin); });
      return;
    }
    if (s.phase === 'slide') {
      screen('s|' + JSON.stringify(m) + '|' + (board && board.count), function () {
        var c = el('div', 'center');
        var ic = el('div', 'beacon');
        ic.innerHTML = ICONS.eye;
        c.append(ic, el('h1', 'display title', 'Atento a la presentación'), el('p', 'lead', 'La siguiente pregunta va a aparecer aquí.'));
        if (m) c.appendChild(standingCard(m, board.count || 0));
        app.appendChild(c);
      });
      return;
    }
    screen('lobby', function () {
      var c = el('div', 'center');
      var ic = el('div', 'beacon');
      ic.innerHTML = ICONS.siren;
      c.append(ic, el('h1', 'display title', '¡Ya estás dentro!'), el('p', 'lead', 'Mira la pantalla: el juego empieza en un momento.'));
      app.appendChild(c);
    });
  }

  function viewQuestion(q, total, sub, ans) {
    var wrap = el('div', 'q');
    var head = el('div', 'q-head');
    var secs = el('span', 'q-secs');
    secs.id = 'tsec';
    head.append(el('span', 'q-num', 'Pregunta ' + q.n + ' de ' + total), secs);
    var tb = el('div', 'tbar'), tf = el('div', 'tfill');
    tf.id = 'tfill';
    tb.appendChild(tf);
    var text = el('div', 'q-text');
    if (q.context) text.appendChild(el('p', 'q-context', q.context));
    text.appendChild(el('h2', 'q-title', q.text));
    wrap.append(head, tb, text);

    if (sub === 'countdown') {
      secs.hidden = true;
      tb.hidden = true;
      var cd = el('div', 'countdown');
      var n = el('div', 'cd-n display');
      n.id = 'cdn';
      cd.append(n, el('div', 'cd-l', '¡Prepárate!'));
      wrap.appendChild(cd);
    } else if (sub === 'open') {
      var opts = el('div', 'opts');
      q.options.forEach(function (t, i) {
        var b = el('button', 'opt o' + i);
        b.type = 'button';
        b.append(badge(i), el('span', 'otext', t));
        b.addEventListener('click', function () { answer(i); });
        opts.appendChild(b);
      });
      wrap.appendChild(opts);
    } else if (sub === 'answered') {
      var card = el('div', 'card sent');
      var ic = el('div', 'sent-ic');
      ic.innerHTML = ICONS.check;
      card.append(ic, el('h3', 'display', '¡Respuesta enviada!'), choiceChip(q, ans), el('p', null, 'Espera a que se acabe el tiempo…'));
      wrap.appendChild(card);
    } else {
      var late = el('div', 'card sent late');
      var ic2 = el('div', 'sent-ic');
      ic2.innerHTML = ICONS.clock;
      late.append(ic2, el('h3', 'display', 'Se acabó el tiempo'), el('p', null, 'Esta no alcanzaste a responderla. ¡A la siguiente!'));
      wrap.appendChild(late);
    }
    app.appendChild(wrap);
  }

  function viewClosed(q, ans) {
    var c = el('div', 'center');
    var ic = el('div', 'beacon');
    ic.innerHTML = ICONS.clock.replace('currentColor', '#9F1920');
    c.append(ic, el('h1', 'display title', '¡Tiempo!'));
    if (ans != null) {
      c.appendChild(el('p', 'lead', 'Tu respuesta:'));
      c.appendChild(choiceChip(q, ans));
    } else {
      c.appendChild(el('p', 'lead', 'No alcanzaste a responder.'));
    }
    c.appendChild(el('p', 'lead small', 'Espera la respuesta correcta en la pantalla…'));
    app.appendChild(c);
  }

  function viewReveal(q, correct, m, count) {
    var ok = m ? m.ok : -1;
    var kind = ok === 1 ? 'good' : ok === 0 ? 'bad' : 'none';
    var c = el('div', 'center');
    var card = el('div', 'result ' + kind);
    var ic = el('div', 'result-ic');
    ic.innerHTML = ok === 1 ? ICONS.check : ok === 0 ? ICONS.cross : ICONS.clock;
    var title = ok === 1 ? '¡Correcto!' : ok === 0 ? 'Incorrecto' : 'Sin respuesta';
    card.append(ic, el('h1', 'display', title), el('p', 'result-pts', ok === 1 ? '+' + fmtPts(m.p) + ' puntos' : '+0 puntos'));
    c.appendChild(card);
    if (ok !== 1 && typeof correct === 'number' && q.options[correct] != null) {
      c.appendChild(el('p', 'lead', 'La respuesta correcta era:'));
      c.appendChild(choiceChip(q, correct));
    }
    if (m) c.appendChild(standingCard(m, count));
    app.appendChild(c);
    var key = 'rev' + q.id + q.startAt;
    if (buzzKey !== key) { buzzKey = key; buzz(ok === 1 ? [60, 50, 60] : 220); }
  }

  function viewStanding(m, count, final) {
    var c = el('div', 'center');
    if (final) {
      var ic = el('div', 'beacon');
      ic.innerHTML = ICONS.trophy;
      c.appendChild(ic);
      if (!m) {
        c.append(el('h1', 'display title', '¡Terminó el juego!'), el('p', 'lead', 'Gracias por participar.'));
      } else if (m.r === 1) {
        c.append(el('h1', 'display title', '¡Ganaste!'), el('p', 'lead', 'Quedaste en primer lugar. ¡Reclama tu premio especial!'));
      } else if (m.r <= 3) {
        c.append(el('h1', 'display title', '¡Estás en el podio!'), el('p', 'lead', 'Quedaste en el lugar ' + m.r + '. ¡Muy bien!'));
      } else {
        c.append(el('h1', 'display title', '¡Terminó el juego!'), el('p', 'lead', 'Quedaste en el lugar ' + m.r + '. Gracias por participar.'));
      }
      if (m) c.appendChild(standingCard(m, count));
    } else {
      c.appendChild(el('h1', 'display title', 'Tabla de posiciones'));
      if (!m) {
        c.appendChild(el('p', 'lead', 'Todavía no tienes puntos. ¡Responde la siguiente!'));
      } else {
        c.appendChild(standingCard(m, count));
        var msg = m.r === 1 ? '¡Vas en primer lugar!'
          : m.g > 0 ? 'Te faltan ' + fmtPts(m.g) + ' puntos para alcanzar el lugar ' + (m.r - 1) + '.'
          : 'Empatado en puntos con el lugar ' + (m.r - 1) + ': desempata la rapidez.';
        c.appendChild(el('p', 'lead', msg));
      }
    }
    app.appendChild(c);
  }

  function tick() {
    if (!joined || !state || state.phase !== 'question' || !state.q) return;
    var q = state.q, now = store.now();
    var sub = myAnswer(q) != null ? 'answered' : now < q.startAt ? 'countdown' : now > q.startAt + q.dur * 1000 ? 'late' : 'open';
    if (viewKey !== 'q|' + q.id + '|' + q.startAt + '|' + sub) { render(); return; }
    var left = Math.max(0, Math.min(q.dur * 1000, q.startAt + q.dur * 1000 - now));
    var tf = document.getElementById('tfill');
    if (tf) tf.style.transform = 'scaleX(' + (left / (q.dur * 1000)).toFixed(4) + ')';
    var ts = document.getElementById('tsec');
    if (ts) { ts.textContent = Math.ceil(left / 1000); ts.classList.toggle('urgent', left <= 5000); }
    var cdn = document.getElementById('cdn');
    if (cdn) cdn.textContent = Math.max(1, Math.ceil((q.startAt - now) / 1000));
  }
  setInterval(tick, 150);

  // ------------------------------------------------------------------ conexión
  store.onConnection(function (c) {
    connected = c;
    clearTimeout(netTimer);
    if (c) { net.hidden = true; markOnline(); }
    else netTimer = setTimeout(function () { if (!connected && joined) net.hidden = false; }, 1800);
  });

  if (store.mode === 'local') document.getElementById('localnote').hidden = false;

  // ------------------------------------------------------------------ arranque
  var urlPin = (params.get('pin') || '').replace(/\D/g, '').slice(0, 6);
  var saved = lsGet(LS_ME);
  if (saved && saved.pid && /^\d{6}$/.test(String(saved.pin)) && (!urlPin || urlPin === saved.pin)) resume(saved);
  else viewJoin(urlPin || (saved && saved.pin) || '', (saved && saved.name) || '', null);
})();
