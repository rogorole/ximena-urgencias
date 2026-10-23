/* Urgencias respiratorias · modo presentador */
(function () {
  'use strict';

  var QZ = window.QZ;
  var QUIZ = window.QZ_QUIZ;
  var SFX = QZ.sfx;
  var fire = QZ.fire;

  var LETTERS = ['A', 'B', 'C', 'D'];
  var SHAPES = [
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 22 20H2z"/></svg>',
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 22 12 12 22 2 12z"/></svg>',
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/></svg>',
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>'
  ];
  var CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  var UP = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 5l8 10H4z"/></svg>';
  var DOWN = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 19 4 9h16z"/></svg>';

  var COUNTDOWN_MS = 3000;   // "3, 2, 1" antes de que aparezcan las opciones
  var GRACE_MS = 800;        // tolerancia de red al cerrar una pregunta
  var CIRC = 2 * Math.PI * 52;
  var LS_HOST = 'qz-host-v1';
  var LS_SOUND = 'qz-sound-v1';

  var frame = document.getElementById('frame');
  var stage = document.getElementById('stage');
  var overlay = document.getElementById('overlay');
  var bar = document.getElementById('bar');
  var toasts = document.getElementById('toasts');
  var startEl = document.getElementById('start');

  // ------------------------------------------------------------------ utilidades
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function fmtPin(p) { p = String(p || ''); return p.slice(0, 3) + ' ' + p.slice(3); }
  function fmtPts(n) { return Math.round(n || 0).toLocaleString('es-MX'); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  var toastTimers = {};
  function toast(msg, opts) {
    opts = opts || {};
    var id = opts.id, t = null;
    if (id) t = toasts.querySelector('[data-id="' + id + '"]');
    if (!t) {
      t = el('div', 'toast');
      if (id) t.dataset.id = id;
      toasts.appendChild(t);
    }
    t.classList.toggle('err', !!opts.err);
    t.textContent = msg;
    if (id && toastTimers[id]) clearTimeout(toastTimers[id]);
    if (!opts.sticky) {
      var tm = setTimeout(function () { t.remove(); if (id) delete toastTimers[id]; }, opts.ms || 2600);
      if (id) toastTimers[id] = tm;
    }
  }
  function dropToast(id) {
    var t = toasts.querySelector('[data-id="' + id + '"]');
    if (t) t.remove();
    if (toastTimers[id]) { clearTimeout(toastTimers[id]); delete toastTimers[id]; }
  }

  // ------------------------------------------------------------------ contenido
  var QUESTIONS = QUIZ.questions.map(function (q, i) {
    var c = {};
    Object.keys(q).forEach(function (k) { c[k] = q[k]; });
    c.n = i + 1;
    return c;
  });
  var QBY = {};
  QUESTIONS.forEach(function (q) { QBY[q.id] = q; });
  var TOTAL = QUESTIONS.length;

  var SEQ = QUIZ.sequence.map(function (it) {
    if (it.slide && it.reveal) return { type: 'reveal', slide: it.slide, qid: it.reveal };
    if (it.slide) return { type: 'slide', slide: it.slide };
    if (it.lobby) return { type: 'lobby' };
    if (it.question) return { type: 'question', qid: it.question };
    if (it.board) return { type: 'board', qid: it.board };
    if (it.podium) return { type: 'podium' };
    throw new Error('Elemento de la secuencia no válido: ' + JSON.stringify(it));
  });
  SEQ.forEach(function (it) {
    if (it.qid && !QBY[it.qid]) throw new Error('La secuencia usa una pregunta que no existe: ' + it.qid);
  });

  var FIRST_Q = SEQ.findIndex(function (it) { return it.type === 'question'; });
  var PODIUM_POS = SEQ.findIndex(function (it) { return it.type === 'podium'; });

  function slideSrc(n) { return (QUIZ.slidesPath || 'slides/') + pad2(n) + '.' + (QUIZ.slidesExt || 'webp'); }

  // ------------------------------------------------------------------ estado
  var store = QZ.createStore({ server: true });
  var pin = null, pos = -1, cur = null, view = null, game = {};
  var unsubGame = null, pendingGo = null, publishedKey = '';
  var arrivedAt = 0, closeArmedAt = 0, autoCloseTimer = null;
  var overlayKind = null, overlayView = null, lastPlayerCount = -1;
  var soundOn = lsGet(LS_SOUND) !== false;
  var connected = false, started = false, netTimer = null;
  SFX.setEnabled(soundOn);

  // ------------------------------------------------------------------ enlaces y QR
  function joinBase() {
    var u = new URL('./', location.href);
    return u.origin && u.origin !== 'null' ? u.origin + u.pathname : u.href;
  }
  function joinURL() { return joinBase() + '?pin=' + pin + (QZ.forcedLocal ? '&local=1' : ''); }
  function joinShort() {
    var u = new URL('./', location.href);
    return ((u.host || '') + u.pathname).replace(/\/$/, '').replace(/^\//, '');
  }
  function qrSVG(text) {
    if (typeof window.qrcode !== 'function') return '';
    var qr = window.qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    var n = qr.getModuleCount(), q = 1, size = n + q * 2, d = '';
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) if (qr.isDark(r, c)) d += 'M' + (c + q) + ' ' + (r + q) + 'h1v1h-1z';
    }
    return '<svg viewBox="0 0 ' + size + ' ' + size + '" shape-rendering="crispEdges" role="img" aria-label="Código QR para unirse">' +
      '<rect width="' + size + '" height="' + size + '" fill="#fff"/><path d="' + d + '" fill="#1b0a0a"/></svg>';
  }

  // ------------------------------------------------------------------ datos derivados
  function playersMap() {
    var p = game.players || {}, out = {};
    Object.keys(p).forEach(function (id) {
      var v = p[id];
      if (v && typeof v.name === 'string' && v.name) out[id] = v;
    });
    return out;
  }
  function playersList() {
    var m = playersMap(), online = game.online || {};
    return Object.keys(m).map(function (id) {
      return { id: id, name: m[id].name, joined: m[id].joined || 0, online: !!online[id] };
    }).sort(function (a, b) { return a.joined - b.joined || (a.name < b.name ? -1 : 1); });
  }
  function qMeta(qid) { return (game.qs && game.qs[qid]) || null; }
  function qStatus(qid) { var m = qMeta(qid); return (m && m.status) || 'pending'; }

  // Respuestas válidas: de jugadores existentes y dentro del tiempo.
  function validAnswers(qid) {
    var meta = qMeta(qid), q = QBY[qid], out = {};
    if (!meta || !q || typeof meta.startAt !== 'number') return out;
    var ans = (game.answers && game.answers[qid]) || {};
    var players = playersMap();
    var limit = typeof meta.closeAt === 'number'
      ? Math.min(meta.closeAt, meta.startAt + meta.dur * 1000) + GRACE_MS
      : meta.startAt + meta.dur * 1000 + GRACE_MS;
    Object.keys(ans).forEach(function (pid) {
      var a = ans[pid];
      if (!players[pid] || !a || typeof a.c !== 'number' || typeof a.at !== 'number') return;
      if (a.c < 0 || a.c >= q.options.length) return;
      if (a.at > limit || a.at < meta.startAt - 2000) return;
      out[pid] = { c: a.c, el: Math.max(0, a.at - meta.startAt) };
    });
    return out;
  }
  function qStats(qid) {
    var q = QBY[qid], va = validAnswers(qid), ok = 0, n = 0;
    Object.keys(va).forEach(function (pid) { n++; if (va[pid].c === q.correct) ok++; });
    return { ok: ok, answered: n, count: playersList().length };
  }
  function revealedIds() {
    return QUESTIONS.filter(function (q) { return qStatus(q.id) === 'revealed'; }).map(function (q) { return q.id; });
  }

  // Puntos estilo Kahoot: correcta = 500 a 1000 según rapidez. Empates: gana el más rápido.
  function standings(ids) {
    var rows = {};
    playersList().forEach(function (p) {
      rows[p.id] = { id: p.id, name: p.name, joined: p.joined, t: 0, speed: 0, last: -1, lp: 0 };
    });
    var lastId = ids[ids.length - 1];
    ids.forEach(function (qid) {
      var q = QBY[qid], meta = qMeta(qid);
      if (!q || !meta) return;
      var va = validAnswers(qid), durMs = meta.dur * 1000;
      Object.keys(rows).forEach(function (pid) {
        var a = va[pid];
        if (!a) return;
        var ok = a.c === q.correct;
        var pts = ok ? Math.round(1000 * (1 - clamp(a.el / durMs, 0, 1) / 2)) : 0;
        rows[pid].t += pts;
        if (ok) rows[pid].speed += a.el;
        if (qid === lastId) { rows[pid].last = ok ? 1 : 0; rows[pid].lp = pts; }
      });
    });
    var list = Object.keys(rows).map(function (k) { return rows[k]; });
    list.sort(function (a, b) {
      return b.t - a.t || a.speed - b.speed || a.joined - b.joined || (a.name < b.name ? -1 : 1);
    });
    list.forEach(function (r, i) { r.r = i + 1; r.g = i > 0 ? list[i - 1].t - r.t : 0; });
    return list;
  }
  function buildBoard(ids) {
    var list = standings(ids), lastId = ids[ids.length - 1] || '';
    var b = { qid: lastId, n: lastId ? QBY[lastId].n : 0, count: list.length, ok: 0, answered: 0, players: {} };
    list.forEach(function (r) {
      b.players[r.id] = { t: r.t, r: r.r, g: r.g, ok: r.last, p: r.lp };
      if (r.last === 1) b.ok++;
      if (r.last !== -1) b.answered++;
    });
    return b;
  }

  // ------------------------------------------------------------------ lo que ven los celulares
  function stateFor(phase, qid) {
    var s = { phase: phase, total: TOTAL };
    if (qid) {
      var q = QBY[qid], meta = qMeta(qid);
      s.q = {
        id: qid, n: q.n, context: q.context || '', text: q.text, options: q.options.slice(),
        startAt: meta && typeof meta.startAt === 'number' ? meta.startAt : 0,
        dur: meta && meta.dur ? meta.dur : q.time
      };
      if (phase === 'reveal') s.correct = q.correct;
    }
    return s;
  }
  function publish(s, extra) {
    var key = JSON.stringify(s);
    if (key === publishedKey && !extra) return;
    publishedKey = key;
    var full = JSON.parse(key);
    full.v = Date.now();
    var upd = {};
    if (extra) Object.keys(extra).forEach(function (k) { upd[k] = extra[k]; });
    upd.state = full;
    fire(store.update('games/' + pin, upd));
  }

  // ------------------------------------------------------------------ ciclo de cada pregunta
  function setLocalMeta(qid, meta) {
    var qs = {};
    Object.keys(game.qs || {}).forEach(function (k) { qs[k] = game.qs[k]; });
    if (meta) qs[qid] = meta; else delete qs[qid];
    game.qs = qs;
  }
  function openQuestion(qid, extra) {
    var q = QBY[qid];
    var meta = { status: 'open', startAt: Math.round(store.now() + COUNTDOWN_MS), dur: q.time };
    setLocalMeta(qid, meta);
    if (game.answers && game.answers[qid]) {
      var a = {};
      Object.keys(game.answers).forEach(function (k) { if (k !== qid) a[k] = game.answers[k]; });
      game.answers = a;
    }
    var upd = extra || {};
    upd['qs/' + qid] = meta;
    upd['answers/' + qid] = null;
    publish(stateFor('question', qid), upd);
  }
  function closeQuestion(qid) {
    if (qStatus(qid) !== 'open') return;
    if (autoCloseTimer) { clearTimeout(autoCloseTimer); autoCloseTimer = null; }
    var meta = qMeta(qid), closeAt = Math.round(store.now());
    var m2 = {};
    Object.keys(meta).forEach(function (k) { m2[k] = meta[k]; });
    m2.status = 'closed';
    m2.closeAt = closeAt;
    setLocalMeta(qid, m2);
    var upd = {};
    upd['qs/' + qid + '/status'] = 'closed';
    upd['qs/' + qid + '/closeAt'] = closeAt;
    publish(stateFor('closed', qid), upd);
    SFX.timeUp();
    refresh();
  }
  function revealQuestion(qid) {
    var st = qStatus(qid);
    if (st === 'open') { closeQuestion(qid); st = qStatus(qid); }
    if (st === 'pending') { publish(stateFor('slide')); return; }
    if (st === 'revealed') { publish(stateFor('reveal', qid)); return; }
    var meta = qMeta(qid), m2 = {};
    Object.keys(meta).forEach(function (k) { m2[k] = meta[k]; });
    m2.status = 'revealed';
    setLocalMeta(qid, m2);
    var upd = { board: buildBoard(revealedIds()) };
    upd['qs/' + qid + '/status'] = 'revealed';
    publish(stateFor('reveal', qid), upd);
    SFX.reveal();
  }
  function restartQuestion() {
    if (!cur || cur.type !== 'question') {
      toast('Para repetir una pregunta, ve a su pantalla en vivo y presiona R.', { id: 'nav' });
      return;
    }
    var qid = cur.qid;
    if (!window.confirm('¿Repetir la pregunta ' + QBY[qid].n + '? Se borran sus respuestas y vuelve a empezar.')) return;
    var wasRevealed = qStatus(qid) === 'revealed';
    setLocalMeta(qid, null);
    var extra = {};
    if (wasRevealed) {
      var ids = revealedIds();
      extra.board = ids.length ? buildBoard(ids) : null;
    }
    publishedKey = '';
    if (view && view.destroy) view.destroy();
    mount();
    openQuestion(qid, extra);
    arrivedAt = Date.now();
    refresh();
  }
  function checkAutoClose() {
    if (!cur || cur.type !== 'question') return;
    var qid = cur.qid, meta = qMeta(qid);
    if (!meta || meta.status !== 'open') return;
    var now = store.now();
    if (now >= meta.startAt + meta.dur * 1000) { closeQuestion(qid); return; }
    if (now < meta.startAt + 1500 || autoCloseTimer) return;
    var online = playersList().filter(function (p) { return p.online; });
    if (!online.length) return;
    var va = validAnswers(qid);
    if (online.every(function (p) { return va[p.id]; })) {
      autoCloseTimer = setTimeout(function () {
        autoCloseTimer = null;
        if (cur && cur.qid === qid) closeQuestion(qid);
      }, 700);
    }
  }
  function kick(pid) {
    var upd = {};
    upd['players/' + pid] = null;
    upd['online/' + pid] = null;
    fire(store.update('games/' + pin, upd));
  }

  // ------------------------------------------------------------------ navegación
  function isOpenNow() { return !!(cur && cur.type === 'question' && qStatus(cur.qid) === 'open'); }

  function go(i) {
    i = clamp(i, 0, SEQ.length - 1);
    if (i === pos && view) return;
    if (isOpenNow()) {
      toast('La pregunta sigue abierta: presiona → dos veces para cerrarla.', { id: 'nav' });
      return;
    }
    if (view && view.destroy) view.destroy();
    pos = i;
    cur = SEQ[i];
    arrivedAt = Date.now();
    closeArmedAt = 0;
    lsSet(LS_HOST, { pin: pin, pos: pos });
    mount();
    enter();
    preloadAround(i);
  }
  function next() {
    if (!cur) return;
    var now = Date.now();
    if (now - arrivedAt < (cur.type === 'question' ? 1200 : 180)) return;
    if (cur.type === 'question') {
      var meta = qMeta(cur.qid);
      if (meta && meta.status === 'open') {
        if (store.now() < meta.startAt) return;
        if (now - closeArmedAt < 2500) {
          closeArmedAt = 0;
          dropToast('nav');
          closeQuestion(cur.qid);
        } else {
          closeArmedAt = now;
          toast('Presiona → otra vez para cerrar la pregunta', { id: 'nav' });
        }
        return;
      }
    }
    if (view && view.skip && view.skip()) return;
    if (pos < SEQ.length - 1) go(pos + 1);
  }
  function prev() {
    if (!cur || pos <= 0) return;
    if (isOpenNow()) {
      toast('La pregunta sigue abierta: presiona → dos veces para cerrarla.', { id: 'nav' });
      return;
    }
    go(pos - 1);
  }

  function mount() {
    stage.textContent = '';
    if (cur.type === 'slide' || cur.type === 'reveal') view = SlideView(cur);
    else if (cur.type === 'lobby') view = JoinPanel(stage, true);
    else if (cur.type === 'question') view = QuestionView(cur);
    else if (cur.type === 'board') view = BoardView();
    else view = PodiumView();
  }
  function enter() {
    var it = cur, st;
    switch (it.type) {
      case 'slide':
        // Antes de la primera pregunta los celulares ven "¡Ya estás dentro!"; después del podio, su resultado final.
        publish(stateFor(FIRST_Q >= 0 && pos < FIRST_Q ? 'lobby' : PODIUM_POS >= 0 && pos > PODIUM_POS ? 'podium' : 'slide'));
        break;
      case 'lobby': publish(stateFor('lobby')); break;
      case 'question':
        st = qStatus(it.qid);
        if (st === 'pending') openQuestion(it.qid);
        else if (st === 'open') publish(stateFor('question', it.qid));
        else if (st === 'closed') publish(stateFor('closed', it.qid));
        else publish(stateFor('reveal', it.qid));
        break;
      case 'reveal': revealQuestion(it.qid); break;
      case 'board': publish(stateFor('board')); break;
      case 'podium': publish(stateFor('podium')); break;
    }
    refresh();
  }
  function refresh() {
    if (view && view.refresh) view.refresh();
    if (overlayView && overlayView.refresh) overlayView.refresh();
    updateBar();
  }

  function preloadAround(i) {
    for (var k = 1; k <= 3; k++) {
      var it = SEQ[i + k];
      if (it && it.slide) { var im = new Image(); im.src = slideSrc(it.slide); }
    }
  }
  function preloadAll() {
    var list = SEQ.filter(function (it) { return it.slide; }).map(function (it) { return slideSrc(it.slide); });
    var i = 0;
    (function nextImg() {
      if (i >= list.length) return;
      var im = new Image();
      im.onload = im.onerror = function () { setTimeout(nextImg, 40); };
      im.src = list[i++];
    })();
  }

  // ------------------------------------------------------------------ pantallas
  function SlideView(it) {
    var wrap = el('div', 'slide');
    var img = el('img');
    img.alt = 'Diapositiva ' + it.slide;
    img.src = slideSrc(it.slide);
    wrap.appendChild(img);
    stage.appendChild(wrap);
    var pill = null, pillKey = '';
    return {
      refresh: function () {
        if (it.type !== 'reveal') return;
        var s = qStatus(it.qid) === 'revealed' ? qStats(it.qid) : null;
        var key = s && s.count ? s.ok + '/' + s.count : '';
        if (key === pillKey) return;
        pillKey = key;
        if (pill) { pill.remove(); pill = null; }
        if (!key) return;
        pill = el('div', 'reveal-pill');
        pill.innerHTML = CHECK;
        pill.appendChild(el('span', null, s.ok + ' de ' + s.count + ' acertaron (' + Math.round(s.ok * 100 / s.count) + '%)'));
        wrap.appendChild(pill);
      }
    };
  }

  function JoinPanel(container, isLobby) {
    var root = el('div', 'lobby sunburst');
    var left = el('div', 'lobby-left');
    var title = el('h1', 'display big-title lobby-title');
    title.innerHTML = '¡Únete al<br>equipo médico!';
    var s1 = el('div', 'lobby-step');
    s1.innerHTML = '<span class="num">1</span><span>Escanea el código o entra a</span>';
    var short = joinShort();
    var url = el('div', 'url-pill', short);
    url.style.fontSize = (short.length <= 22 ? 44 : short.length <= 28 ? 38 : short.length <= 34 ? 33 : 28) + 'px';
    var s2 = el('div', 'lobby-step');
    s2.innerHTML = '<span class="num">2</span><span>Escribe el PIN y tu nombre</span>';
    var pinCard = el('div', 'pin-card');
    var pinLabel = el('span', 'pin-label');
    pinLabel.innerHTML = 'PIN del<br>juego';
    pinCard.append(pinLabel, el('span', 'pin-num display', fmtPin(pin)));
    left.append(title, s1, url, s2, pinCard);

    var qr = el('div', 'qr-card');
    qr.innerHTML = qrSVG(joinURL());

    var players = el('div', 'lobby-players');
    var badge = el('div', 'count-badge');
    var bn = el('b', null, '0'), bl = el('span', null, 'jugadores');
    badge.append(bn, bl);
    var chips = el('div', 'chips');
    players.append(badge, chips);
    var hint = el('div', 'lobby-hint', isLobby
      ? 'Clic en un nombre para quitarlo · → continuar'
      : 'Clic en un nombre para quitarlo · Q o Esc para cerrar');
    root.append(left, qr, players, hint);
    container.appendChild(root);

    var lastKey = null;
    function refresh() {
      var list = playersList();
      var key = JSON.stringify(list.map(function (p) { return [p.id, p.name, p.online]; }));
      if (key === lastKey) return;
      lastKey = key;
      bn.textContent = list.length;
      bl.textContent = list.length === 1 ? 'jugador' : 'jugadores';
      var existing = {};
      Array.prototype.forEach.call(chips.querySelectorAll('.chip[data-pid]'), function (c) { existing[c.dataset.pid] = c; });
      chips.textContent = '';
      if (!list.length) { chips.appendChild(el('div', 'chips-empty', 'Esperando jugadores…')); return; }
      list.slice().reverse().forEach(function (p) {
        var c = existing[p.id];
        if (c) c.classList.add('seen');
        else {
          c = el('button', 'chip');
          c.type = 'button';
          c.dataset.pid = p.id;
          c.title = 'Quitar del juego';
          c.addEventListener('click', function (e) {
            e.stopPropagation();
            var name = c.textContent;
            if (window.confirm('¿Quitar a "' + name + '" del juego?')) kick(c.dataset.pid);
          });
        }
        c.textContent = p.name;
        c.classList.toggle('off', !p.online);
        chips.appendChild(c);
      });
      // Si no caben, se resume el final como "+N".
      var nodes = chips.children, cut = -1;
      for (var i = 0; i < nodes.length; i++) {
        if (nodes[i].offsetTop + nodes[i].offsetHeight > chips.clientHeight + 2) { cut = i; break; }
      }
      if (cut > 0) {
        var hidden = nodes.length - cut + 1;
        while (chips.children.length > cut - 1) chips.removeChild(chips.lastChild);
        var more = el('span', 'chip seen', '+' + hidden + ' más');
        more.style.cursor = 'default';
        chips.appendChild(more);
      }
    }
    return { refresh: refresh };
  }

  function QuestionView(it) {
    var q = QBY[it.qid];
    var root = el('div', 'qv sunburst ' + (q.options.length > 2 ? 'four' : 'two'));
    var top = el('div', 'qv-top');
    top.append(el('div', 'tag', 'Pregunta ' + q.n + ' de ' + TOTAL), el('div', 'tag tag-light', joinShort() + ' · PIN ' + fmtPin(pin)));
    var qb = el('div', 'qv-q');
    if (q.context) qb.appendChild(el('p', 'qv-context', q.context));
    qb.appendChild(el('h2', 'qv-text display big-title', q.text));

    var mid = el('div', 'qv-mid');
    var timer = el('div', 'timer');
    timer.innerHTML = '<svg viewBox="0 0 120 120" aria-hidden="true"><circle class="trk" cx="60" cy="60" r="52"/><circle class="arc" cx="60" cy="60" r="52"/></svg><span class="secs display"></span>';
    var arc = timer.querySelector('.arc'), secsEl = timer.querySelector('.secs');
    var center = el('div', 'mid-center');
    var tbar = el('div', 'tbar'), tfill = el('div', 'tfill');
    tbar.appendChild(tfill);
    var midLabel = el('div', 'mid-label display');
    center.append(tbar, midLabel);
    var cnt = el('div', 'acount');
    var cntN = el('span', 'n', '0'), cntL = el('span', 'l', 'respuestas');
    cnt.append(cntN, cntL);
    mid.append(timer, center, cnt);

    var opts = el('div', 'qv-opts');
    var cards = q.options.map(function (t, i) {
      var c = el('div', 'opt o' + i);
      var barEl = el('span', 'obar');
      var badge = el('span', 'badge');
      badge.innerHTML = SHAPES[i] + '<b>' + LETTERS[i] + '</b>';
      var mark = el('span', 'ok-mark');
      mark.innerHTML = CHECK;
      var res = el('span', 'ores');
      c.append(barEl, badge, el('span', 'otext', t), res, mark);
      opts.appendChild(c);
      return { c: c, bar: barEl, res: res };
    });

    var cd = el('div', 'cd');
    var cdN = el('div', 'cd-n display', '');
    cd.append(cdN, el('div', 'cd-l', '¡Prepárense!'));
    var stamp = el('div', 'stamp display', '¡Tiempo!');
    var hint = el('div', 'hint');
    root.append(top, qb, mid, opts, cd, stamp, hint);
    stage.appendChild(root);

    var shown = null, lastSec = null;
    function phase() {
      var m = qMeta(it.qid), st = qStatus(it.qid);
      if (st === 'open' && m && store.now() < m.startAt) return 'countdown';
      return st;
    }
    function refresh() {
      var ph = phase();
      if (ph !== shown) {
        var before = shown;
        shown = ph;
        root.dataset.phase = ph;
        if (ph === 'open' && before === 'countdown') SFX.go();
        if (ph === 'closed' && (before === 'open' || before === 'countdown')) {
          stamp.classList.remove('go');
          void stamp.offsetWidth;
          stamp.classList.add('go');
        }
        var live = ph === 'open' || ph === 'countdown';
        tbar.hidden = !live;
        midLabel.hidden = live;
        midLabel.textContent = ph === 'revealed' ? 'Respuesta correcta' : 'Así votó el equipo';
        hint.textContent = ph === 'open' ? 'Presiona → dos veces para cerrar antes de tiempo'
          : ph === 'closed' ? '→ ver la respuesta correcta'
          : ph === 'revealed' ? '→ continuar' : '';
      }
      var va = validAnswers(it.qid), n = Object.keys(va).length, total = playersList().length;
      cntN.textContent = n;
      cntL.textContent = total ? 'de ' + total + ' respondieron' : 'respuestas';
      var showRes = ph === 'closed' || ph === 'revealed';
      var counts = q.options.map(function () { return 0; });
      Object.keys(va).forEach(function (pid) { counts[va[pid].c]++; });
      cards.forEach(function (o, i) {
        if (showRes) {
          var pct = n ? Math.round(counts[i] * 100 / n) : 0;
          o.bar.style.width = pct + '%';
          o.res.textContent = String(counts[i]);
          o.res.appendChild(el('small', null, pct + '%'));
        } else {
          o.bar.style.width = '0%';
          o.res.textContent = '';
        }
        o.c.classList.toggle('is-correct', ph === 'revealed' && i === q.correct);
        o.c.classList.toggle('is-dim', ph === 'revealed' && i !== q.correct);
      });
      tick();
    }
    function tick() {
      var m = qMeta(it.qid);
      if (!m) return;
      var ph = phase();
      if (ph !== shown) { refresh(); return; }
      var now = store.now();
      if (ph === 'countdown') {
        var s = String(Math.max(1, Math.ceil((m.startAt - now) / 1000)));
        if (cdN.textContent !== s) { cdN.textContent = s; SFX.tick(); }
        return;
      }
      if (ph === 'open') {
        var left = clamp(m.startAt + m.dur * 1000 - now, 0, m.dur * 1000);
        var sec = Math.ceil(left / 1000), frac = left / (m.dur * 1000);
        secsEl.textContent = sec;
        timer.classList.remove('done');
        arc.style.strokeDashoffset = (CIRC * (1 - frac)).toFixed(1);
        tfill.style.transform = 'scaleX(' + frac.toFixed(4) + ')';
        timer.classList.toggle('urgent', sec <= 5 && sec > 0);
        if (sec <= 5 && sec > 0 && sec !== lastSec) SFX.tick();
        lastSec = sec;
      } else {
        secsEl.textContent = '0';
        arc.style.strokeDashoffset = CIRC.toFixed(1);
        timer.classList.remove('urgent');
        timer.classList.add('done');
      }
    }
    return { refresh: refresh, tick: tick };
  }

  function BoardView() {
    var root = el('div', 'board sunburst');
    var sub = el('div', 'board-sub');
    var list = el('div', 'board-list');
    root.append(el('h1', 'display big-title board-title', 'Tabla de posiciones'), sub, list);
    stage.appendChild(root);
    var lastKey = '', firstRender = true;
    function render() {
      var ids = revealedIds();
      var rows = standings(ids);
      var prevRank = null;
      if (ids.length > 1) {
        prevRank = {};
        standings(ids.slice(0, -1)).forEach(function (r) { prevRank[r.id] = r.r; });
      }
      var key = JSON.stringify(rows.slice(0, 5).map(function (r) { return [r.id, r.t, r.name]; })) + ids.join();
      if (key === lastKey) return;
      lastKey = key;
      var lastId = ids[ids.length - 1];
      if (lastId) {
        var st = qStats(lastId);
        sub.textContent = 'Después de la pregunta ' + QBY[lastId].n + ' de ' + TOTAL +
          (st.count ? ' · ' + st.ok + ' de ' + st.count + ' acertaron' : '');
      } else sub.textContent = 'Todavía no hay puntos';
      list.textContent = '';
      if (!rows.length) { list.appendChild(el('p', 'board-empty', 'Todavía no se ha unido nadie.')); return; }
      rows.slice(0, 5).forEach(function (r, i) {
        var row = el('div', 'brow' + (i === 0 ? ' first' : ''));
        if (firstRender) row.style.animationDelay = (i * 110) + 'ms'; else row.classList.add('noanim');
        var mv = el('span', 'bmove');
        if (prevRank && prevRank[r.id] != null) {
          var d = prevRank[r.id] - r.r;
          if (d > 0) { mv.innerHTML = UP; mv.appendChild(document.createTextNode(String(d))); mv.classList.add('up'); }
          else if (d < 0) { mv.innerHTML = DOWN; mv.appendChild(document.createTextNode(String(-d))); mv.classList.add('down'); }
        }
        row.append(el('span', 'brank display', String(r.r)), el('span', 'bname', r.name), mv, el('span', 'bpts', fmtPts(r.t)));
        list.appendChild(row);
      });
      firstRender = false;
    }
    render();
    return { refresh: render };
  }

  function PodiumView() {
    var root = el('div', 'podium sunburst');
    var title = el('h1', 'display big-title podium-title', '¡Tenemos ganadores!');
    var prize = el('div', 'pod-prize');
    var podStage = el('div', 'pod-stage');
    var rows = standings(revealedIds());
    var cols = {};
    [2, 1, 3].forEach(function (place) {
      var r = rows[place - 1];
      var col = el('div', 'pod-col p' + place);
      var who = el('div', 'pod-who');
      who.append(el('div', 'pod-name', r ? r.name : '—'), el('div', 'pod-pts', r ? fmtPts(r.t) + ' pts' : ''));
      var block = el('div', 'pod-block');
      block.appendChild(el('span', 'display', String(place)));
      col.append(who, block);
      podStage.appendChild(col);
      cols[place] = col;
    });
    root.append(title, prize, podStage);
    stage.appendChild(root);

    if (!rows.length) {
      title.textContent = 'Fin del juego';
      prize.textContent = 'Nadie se unió a la partida.';
      prize.classList.add('show');
      return {};
    }
    var step = 0, timers = [], stopConfetti = null;
    function stepTo(n) {
      while (step < n) {
        step++;
        if (step === 1) { cols[3].classList.add('show'); SFX.drum(); }
        if (step === 2) { cols[2].classList.add('show'); SFX.drum(); }
        if (step === 3) {
          cols[1].classList.add('show');
          SFX.fanfare();
          prize.textContent = '¡El premio especial es para ' + rows[0].name + '!';
          prize.classList.add('show');
          stopConfetti = confetti(root);
        }
      }
    }
    timers.push(setTimeout(function () { stepTo(1); }, 700));
    timers.push(setTimeout(function () { stepTo(2); }, 2300));
    timers.push(setTimeout(function () { stepTo(3); }, 4000));
    return {
      skip: function () {
        if (step >= 3) return false;
        timers.forEach(clearTimeout);
        stepTo(3);
        return true;
      },
      destroy: function () {
        timers.forEach(clearTimeout);
        if (stopConfetti) stopConfetti();
      }
    };
  }

  function confetti(container) {
    var cv = el('canvas', 'confetti');
    cv.width = 1600; cv.height = 900;
    container.appendChild(cv);
    var ctx = cv.getContext('2d');
    var colors = ['#E4B856', '#FFF7EC', '#DD2E24', '#2E9B57', '#2563A6', '#9F1920'];
    var ps = [];
    for (var i = 0; i < 240; i++) {
      var fromLeft = i % 2 === 0;
      ps.push({
        x: fromLeft ? -20 : 1620, y: 640 + Math.random() * 120,
        vx: (fromLeft ? 1 : -1) * (8 + Math.random() * 14), vy: -(14 + Math.random() * 14),
        s: 9 + Math.random() * 10, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.35,
        c: colors[i % colors.length]
      });
    }
    var t0 = performance.now(), raf = 0;
    function draw(t) {
      ctx.clearRect(0, 0, 1600, 900);
      ps.forEach(function (p) {
        p.vy += 0.42; p.vx *= 0.985; p.vy *= 0.995;
        p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
        ctx.restore();
      });
      if (t - t0 < 7000) raf = requestAnimationFrame(draw); else cv.remove();
    }
    raf = requestAnimationFrame(draw);
    return function () { cancelAnimationFrame(raf); cv.remove(); };
  }

  function IndexPanel() {
    var root = el('div', 'idx');
    var head = el('div', 'idx-head');
    head.append(el('h2', 'display', 'Índice'), el('p', null, 'Clic para ir · G o Esc para cerrar'));
    var grid = el('div', 'idx-grid');
    SEQ.forEach(function (it, i) {
      var b = el('button', 'idx-item' + (i === pos ? ' current' : ''));
      b.type = 'button';
      if (it.slide) {
        var im = el('img');
        im.src = slideSrc(it.slide);
        im.alt = '';
        im.loading = 'lazy';
        b.appendChild(im);
      } else {
        var label = it.type === 'question' ? 'Pregunta ' + QBY[it.qid].n + ' en vivo'
          : it.type === 'board' ? 'Tabla tras la pregunta ' + QBY[it.qid].n
          : it.type === 'lobby' ? 'Unirse (QR)' : 'Podio final';
        b.appendChild(el('div', 'idx-tile t-' + it.type, label));
      }
      b.appendChild(el('span', 'idx-num', String(i + 1)));
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        if (isOpenNow() && i !== pos) {
          toast('La pregunta sigue abierta: ciérrala primero.', { id: 'nav' });
          return;
        }
        closeOverlay();
        go(i);
      });
      grid.appendChild(b);
    });
    root.append(head, grid);
    overlay.appendChild(root);
    setTimeout(function () {
      var c = grid.querySelector('.current');
      if (c) c.scrollIntoView({ block: 'center' });
    }, 0);
    return {};
  }

  // ------------------------------------------------------------------ capas, barra, teclado
  function openOverlay(kind) {
    overlay.textContent = '';
    overlay.hidden = false;
    overlayKind = kind;
    overlayView = kind === 'join' ? JoinPanel(overlay, false) : IndexPanel();
    if (overlayView.refresh) overlayView.refresh();
  }
  function closeOverlay() {
    overlay.hidden = true;
    overlay.textContent = '';
    overlayKind = null;
    overlayView = null;
  }
  function toggleOverlay(kind) { if (overlayKind === kind) closeOverlay(); else openOverlay(kind); }

  function toggleSound() {
    soundOn = !soundOn;
    SFX.setEnabled(soundOn);
    lsSet(LS_SOUND, soundOn);
    toast(soundOn ? 'Sonido activado' : 'Sonido apagado', { id: 'snd' });
    updateBar();
  }
  function toggleFullscreen() {
    var d = document, r = d.documentElement;
    try {
      if (!d.fullscreenElement && !d.webkitFullscreenElement) {
        var p = (r.requestFullscreen || r.webkitRequestFullscreen).call(r);
        if (p && p.catch) p.catch(function () {});
      } else {
        (d.exitFullscreen || d.webkitExitFullscreen).call(d);
      }
    } catch (e) {}
  }

  function updateBar() {
    if (!started) return;
    document.getElementById('bar-pos').textContent = (pos + 1) + ' / ' + SEQ.length;
    document.getElementById('bar-pin').textContent = (store.mode === 'local' ? 'Prueba local · ' : '') + 'PIN ' + fmtPin(pin);
    var list = playersList(), on = list.filter(function (p) { return p.online; }).length;
    document.getElementById('bar-players').textContent = plural(list.length, 'jugador', 'jugadores') + (list.length ? ' · ' + on + ' en línea' : '');
    bar.querySelector('.dot').classList.toggle('off', !connected);
    document.getElementById('btn-sound').classList.toggle('off', !soundOn);
  }
  bar.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-act]');
    if (!b) return;
    var a = b.dataset.act;
    if (a === 'prev') prev();
    else if (a === 'next') next();
    else if (a === 'join') toggleOverlay('join');
    else if (a === 'index') toggleOverlay('index');
    else if (a === 'sound') toggleSound();
    else if (a === 'fs') toggleFullscreen();
    b.blur();
  });

  document.addEventListener('keydown', function (e) {
    if (!started || e.ctrlKey || e.metaKey || e.altKey) return;
    var k = e.key, tag = (e.target && e.target.tagName) || '';
    if (overlayKind) {
      if (k === 'Escape') { e.preventDefault(); closeOverlay(); }
      else if (k === 'q' || k === 'Q') { e.preventDefault(); toggleOverlay('join'); }
      else if (k === 'g' || k === 'G') { e.preventDefault(); toggleOverlay('index'); }
      return;
    }
    switch (k) {
      case 'ArrowRight': case 'ArrowDown': case 'PageDown': case ' ': case 'Enter':
        if ((k === ' ' || k === 'Enter') && tag === 'BUTTON') return;
        e.preventDefault(); next(); break;
      case 'ArrowLeft': case 'ArrowUp': case 'PageUp': case 'Backspace':
        e.preventDefault(); prev(); break;
      case 'f': case 'F': toggleFullscreen(); break;
      case 'q': case 'Q': toggleOverlay('join'); break;
      case 'g': case 'G': toggleOverlay('index'); break;
      case 'm': case 'M': toggleSound(); break;
      case 'r': case 'R': restartQuestion(); break;
      case 'Home': e.preventDefault(); go(0); break;
      case 'End': e.preventDefault(); go(SEQ.length - 1); break;
    }
  });
  frame.addEventListener('click', function (e) {
    if (!started || overlayKind) return;
    if (e.target.closest('button, a, input')) return;
    next();
  });
  frame.addEventListener('contextmenu', function (e) {
    if (!started || overlayKind) return;
    e.preventDefault();
    prev();
  });

  var idleTimer = null;
  function wake() {
    document.body.classList.remove('idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function () { if (started) document.body.classList.add('idle'); }, 2600);
  }
  document.addEventListener('mousemove', wake);

  function fit() {
    var s = Math.min(window.innerWidth / 1600, window.innerHeight / 900);
    frame.style.transform = 'translate(-50%, -50%) scale(' + s + ')';
  }
  window.addEventListener('resize', fit);
  fit();

  // ------------------------------------------------------------------ reloj
  setInterval(function () {
    if (!started) return;
    if (view && view.tick) view.tick();
    checkAutoClose();
  }, 100);

  // ------------------------------------------------------------------ datos en vivo
  function onGame(val) {
    game = val || {};
    if (pendingGo !== null) {
      var g = pendingGo;
      pendingGo = null;
      lastPlayerCount = playersList().length;
      go(g);
      return;
    }
    var n = playersList().length;
    if (n > lastPlayerCount && lastPlayerCount >= 0 && cur && (cur.type === 'lobby' || overlayKind === 'join')) SFX.join();
    lastPlayerCount = n;
    refresh();
    checkAutoClose();
  }

  // ------------------------------------------------------------------ inicio
  var btnNew = document.getElementById('btn-new');
  var btnCont = document.getElementById('btn-continue');
  var modeEl = document.getElementById('mode');
  var modeText = document.getElementById('mode-text');
  var saved = lsGet(LS_HOST);
  var savedChecked = false;

  function setMode(kind, text) { modeEl.className = 'mode ' + (kind || ''); modeText.textContent = text; }

  if (store.mode === 'local') {
    setMode(QZ.sdkMissing ? 'bad' : '', QZ.forcedLocal
      ? 'Modo de prueba local (activado con ?local=1).'
      : QZ.sdkMissing
        ? 'No se cargó la librería de Firebase (carpeta assets/vendor). Revisa que hayas subido todos los archivos.'
        : 'Modo de prueba local: config.js no tiene la URL de Firebase. Sirve para ensayar en esta computadora; los celulares no se conectarán.');
  } else {
    setMode('', 'Conectando a Firebase…');
  }
  var connTimer = setTimeout(function () {
    if (!connected && store.mode === 'firebase') setMode('bad', 'No se pudo conectar a Firebase. Revisa la URL en config.js y tu internet.');
  }, 9000);

  store.onConnection(function (c) {
    connected = c;
    if (!started) {
      if (c) {
        clearTimeout(connTimer);
        if (store.mode === 'firebase') setMode('ok', 'Conectado a Firebase. Todo listo.');
        btnNew.disabled = false;
        checkSaved();
      }
      return;
    }
    clearTimeout(netTimer);
    if (c) dropToast('net');
    else netTimer = setTimeout(function () {
      if (!connected) toast('Sin conexión a internet. Reconectando…', { id: 'net', sticky: true, err: true });
    }, 2000);
    updateBar();
  });
  store.onError(function (e) {
    if (QZ.isPermissionError(e)) {
      var msg = 'Firebase no deja leer/escribir. Revisa que la base de datos esté en "modo de prueba" (ver LEEME).';
      if (started) toast(msg, { id: 'perm', err: true, sticky: true });
      else setMode('bad', msg);
    } else if (started) {
      toast('Error al guardar: ' + ((e && e.message) || e), { id: 'err', err: true, ms: 5000 });
    }
  });

  function checkSaved() {
    if (savedChecked) return;
    savedChecked = true;
    if (!saved || !/^\d{6}$/.test(String(saved.pin || ''))) return;
    QZ.withTimeout(store.get('games/' + saved.pin + '/created'), 8000).then(function (c) {
      if (!c) return;
      btnCont.hidden = false;
      btnCont.textContent = 'Continuar partida ' + fmtPin(saved.pin) + ' (pantalla ' + ((saved.pos || 0) + 1) + ')';
    }).catch(function () {});
  }

  function createGame() {
    var tries = 0;
    function attempt() {
      var p = String(100000 + Math.floor(Math.random() * 900000));
      return QZ.withTimeout(store.get('games/' + p + '/created'), 9000).then(function (exists) {
        if (exists) {
          if (++tries > 5) throw new Error('no se encontró un PIN libre');
          return attempt();
        }
        var data = { created: store.TS, title: QUIZ.title, state: { phase: 'lobby', total: TOTAL, v: 1 } };
        return QZ.withTimeout(store.set('games/' + p, data), 9000).then(function () { return p; });
      });
    }
    return attempt();
  }

  function begin(p, position) {
    pin = p;
    started = true;
    startEl.hidden = true;
    bar.hidden = false;
    publishedKey = '';
    pendingGo = clamp(position | 0, 0, SEQ.length - 1);
    lsSet(LS_HOST, { pin: pin, pos: pendingGo });
    if (unsubGame) unsubGame();
    unsubGame = store.sub('games/' + pin, onGame);
    wake();
    preloadAll();
  }

  btnCont.addEventListener('click', function () {
    SFX.unlock();
    begin(saved.pin, saved.pos || 0);
  });
  btnNew.addEventListener('click', function () {
    SFX.unlock();
    btnNew.disabled = true;
    btnNew.textContent = 'Creando partida…';
    createGame().then(function (p) { begin(p, 0); }).catch(function (e) {
      btnNew.disabled = false;
      btnNew.textContent = 'Crear partida nueva';
      setMode('bad', 'No se pudo crear la partida: ' + (e && e.message === 'timeout' ? 'Firebase no respondió.' : (e && e.message) || e));
    });
  });

  // Para pruebas automáticas y depuración desde la consola.
  window.QZ_HOST = {
    state: function () { return { pin: pin, pos: pos, cur: cur, game: game }; },
    go: go, next: next, prev: prev,
    standings: function () { return standings(revealedIds()); }
  };
})();
