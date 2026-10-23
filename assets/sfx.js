/* Efectos de sonido sintetizados (sin archivos de audio). Tecla M para silenciar. */
(function () {
  'use strict';
  var QZ = window.QZ = window.QZ || {};
  var ctx = null, enabled = true, master = null;

  function ac() {
    if (!ctx) {
      var C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ctx = new C();
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, at, dur, type, gain) {
    if (!enabled) return;
    var c = ac(); if (!c) return;
    var t = c.currentTime + (at || 0);
    var o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain || 0.15, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function noise(at, dur, gain) {
    if (!enabled) return;
    var c = ac(); if (!c) return;
    var t = c.currentTime + (at || 0);
    var len = Math.floor(c.sampleRate * dur);
    var buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 900;
    g.gain.value = gain || 0.25;
    src.buffer = buf; src.connect(f); f.connect(g); g.connect(master);
    src.start(t);
  }

  QZ.sfx = {
    unlock: function () { ac(); },
    setEnabled: function (v) { enabled = !!v; },
    isEnabled: function () { return enabled; },
    tick: function () { tone(1250, 0, 0.05, 'square', 0.05); },
    go: function () { tone(660, 0, 0.12, 'triangle', 0.18); tone(990, 0.11, 0.22, 'triangle', 0.18); },
    timeUp: function () { tone(523, 0, 0.2, 'sawtooth', 0.07); tone(392, 0.2, 0.45, 'sawtooth', 0.07); },
    reveal: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, i * 0.08, 0.4, 'triangle', 0.13); }); },
    join: function () { tone(880, 0, 0.08, 'sine', 0.08); tone(1320, 0.07, 0.12, 'sine', 0.06); },
    drum: function () { for (var i = 0; i < 6; i++) noise(i * 0.07, 0.09, 0.18); tone(110, 0.42, 0.3, 'sine', 0.3); },
    fanfare: function () {
      var seq = [[523, 0], [659, 0.13], [784, 0.26], [1047, 0.42], [784, 0.62], [1047, 0.76]];
      seq.forEach(function (n) { tone(n[0], n[1], 0.5, 'triangle', 0.16); tone(n[0] / 2, n[1], 0.5, 'sine', 0.08); });
    }
  };
})();
