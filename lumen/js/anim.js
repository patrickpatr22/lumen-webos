/*
 * Lumen – Animationen: Schalter (Körper-Klassen), Start-Animation mit Logo,
 * strukturierter Aufbau bei Home und die Erkennung „Fernseher wurde gerade eingeschaltet“.
 *
 * Start-Animation „Nach dem Einschalten“:
 *   - Kaltstart von Lumen: nur, wenn sich die boot_id des Systems geändert hat
 *     (also das erste Mal nach einem echten Neustart),
 *   - Fernseher aus dem Standby (Quick Start+): Die Systemzeit ist dann weitergelaufen,
 *     die monotone Uhr (performance.now) nicht – der Sprung verrät das Aufwachen.
 */
(function (L) {
  'use strict';
  var S = L.S, el = L.el;
  // Intro bis zum ruhenden Logo, danach Halten (bis alles geladen ist, höchstens bis MAX_MS),
  // dann Flug in die Startseite (EXIT_MS); die Startseite taucht ab REVEAL_AT dahinter auf.
  var INTRO_MS = 3500, MAX_MS = 9000, EXIT_MS = 1000, REVEAL_AT = 360, BOOT_KEY = 'lumen.bootid';

  function on() { return !!L.prefs.anim.on; }

  // ------------------------------------------------------------------
  // Schalter → Klassen am body (das CSS hängt alles daran)
  // ------------------------------------------------------------------
  function apply() {
    var a = L.prefs.anim, b = document.body, m = on();
    // Tempo-Regler (Prozent) → Zeitfaktoren fürs CSS
    var root = document.documentElement.style;
    root.setProperty('--tk', String(+(100 / L.clamp(+a.tileSpeed || 100, 30, 200)).toFixed(3)));
    root.setProperty('--ck', String(+(100 / L.clamp(+a.cardSpeed || 100, 30, 200)).toFixed(3)));
    b.classList.toggle('anim', m);
    b.classList.toggle('a-float', m && a.float);
    b.classList.toggle('a-breathe', m && a.breathe);
    b.classList.toggle('a-pointer', m && a.pointer);
    b.classList.toggle('a-ambient', m && a.ambient);
    b.setAttribute('data-swap', m ? a.swap : 'off');
    b.setAttribute('data-select', m ? a.select : 'off');
    if (!m || !a.pointer) L.home.pointerIdle();
  }

  // ------------------------------------------------------------------
  // Aufbau beim Öffnen (Home-Taste): schnell, Stück für Stück
  // ------------------------------------------------------------------
  // none: Lumen ist sofort da (nichts wird ausgeblendet und neu aufgebaut)
  var buildTimer = null, BUILDS = ['structured', 'stagger', 'soft', 'reveal'];
  function build(style) {
    var b = document.body;
    clearTimeout(buildTimer);
    b.classList.remove('building');
    BUILDS.forEach(function (s) { b.classList.remove('build-' + s); });
    style = style || L.prefs.anim.build;
    if (!on() || BUILDS.indexOf(style) < 0) return;
    void b.offsetWidth;                         // Animationen neu starten
    b.classList.add('building', 'build-' + style);
    if (style !== 'soft') L.home.replayArt();
    buildTimer = setTimeout(function () {
      b.classList.remove('building', 'build-' + style);
    }, style === 'reveal' ? 1300 : 1500);
  }

  // ------------------------------------------------------------------
  // Start-Animation
  // ------------------------------------------------------------------
  var B = { playing: false, timer: null, reveal: null, cap: null, done: null, revealed: false, exiting: false, run: 0 };

  function hideCover() {
    el.boot.classList.remove('pending', 'play', 'skip', 'exit');
    el.boot.hidden = true;
  }

  // ready: Promise, das erfüllt ist, wenn Apps, Bilder und Symbole bereit sind –
  // bis dahin hält das Logo an (verdeckt die Ladezeit), höchstens bis MAX_MS.
  function playBoot(done, ready) {
    var n = el.boot, run = ++B.run;
    clearTimeout(B.timer);
    clearTimeout(B.reveal);
    clearTimeout(B.cap);
    B.done = done || null;
    B.revealed = false;
    B.exiting = false;
    B.playing = true;
    S.mode = 'boot';
    n.hidden = false;
    n.classList.remove('pending', 'play', 'skip', 'exit');
    void n.offsetWidth;
    n.classList.add('play');
    var introDone = new Promise(function (res) { B.timer = setTimeout(res, INTRO_MS); });
    var cap = new Promise(function (res) { B.cap = setTimeout(res, MAX_MS); });
    Promise.race([Promise.all([introDone, Promise.resolve(ready).catch(function () {})]), cap]).then(function () {
      if (run === B.run && !window.LUMEN_BOOT_HOLD) exit();       // HOLD: nur für Bild-für-Bild-Tests
    });
  }

  // Flug durch den Lichtpunkt; die Startseite taucht dahinter auf
  function exit() {
    if (!B.playing || B.exiting) return;
    B.exiting = true;
    clearTimeout(B.cap);
    el.boot.classList.add('exit');
    if (window.LUMEN_BOOT_HOLD) return;
    B.reveal = setTimeout(reveal, REVEAL_AT);
    B.timer = setTimeout(finish, EXIT_MS);
  }

  function reveal() {
    if (B.revealed) return;
    B.revealed = true;
    build('reveal');
  }

  function skip() {
    if (!B.playing) return;
    B.run++;
    clearTimeout(B.timer);
    clearTimeout(B.reveal);
    clearTimeout(B.cap);
    el.boot.classList.add('skip');
    reveal();
    B.timer = setTimeout(finish, 320);
  }

  function finish() {
    if (!B.playing) return;
    B.playing = false;
    clearTimeout(B.timer);
    clearTimeout(B.reveal);
    clearTimeout(B.cap);
    hideCover();
    if (S.mode === 'boot') S.mode = 'home';
    var d = B.done;
    B.done = null;
    if (d) d();
  }

  // ------------------------------------------------------------------
  // Welche Animation? 'boot' oder 'build'
  // ------------------------------------------------------------------
  function drift() {
    var p = window.performance;
    return p && p.now ? Date.now() - p.now() : NaN;
  }
  var drift0 = drift();
  function markHidden() { drift0 = drift(); }
  // true, wenn das System seit dem letzten Aufruf schlief (Standby)
  function woke() {
    var d = drift();
    if (isNaN(d) || isNaN(drift0)) return false;
    var jump = d - drift0;
    drift0 = d;
    return jump > 60000;
  }

  function withTimeout(p, ms) {
    return new Promise(function (res, rej) {
      var t = setTimeout(function () { rej(new Error('timeout')); }, ms);
      p.then(function (v) { clearTimeout(t); res(v); }, function (e) { clearTimeout(t); rej(e); });
    });
  }

  function decide(cold) {
    var a = L.prefs.anim;
    if (!on() || a.boot === 'off') { woke(); return Promise.resolve('build'); }
    if (!cold) return Promise.resolve(woke() ? 'boot' : 'build');
    if (a.boot === 'always') return Promise.resolve('boot');
    if (!Luna.available()) return Promise.resolve('boot');
    return withTimeout(Luna.exec('cat /proc/sys/kernel/random/boot_id'), 700)
      .then(function (out) {
        var id = String(out || '').trim(), old = null;
        try { old = localStorage.getItem(BOOT_KEY); localStorage.setItem(BOOT_KEY, id); } catch (e) { /* ignorieren */ }
        return id && id === old ? 'build' : 'boot';
      })
      .catch(function () { return 'boot'; });
  }

  // Lumen war beim Ausschalten vorne? Dann merkt das hier den Sprung beim Einschalten.
  function watchWake(onWake) {
    setInterval(function () {
      if (document.hidden || B.playing) return;
      if (woke() && on() && L.prefs.anim.boot !== 'off') onWake();
    }, 3000);
  }

  L.anim = {
    apply: apply, build: build, playBoot: playBoot, skip: skip, hideCover: hideCover, exit: exit,
    decide: decide, markHidden: markHidden, watchWake: watchWake,
    playing: function () { return B.playing; }
  };
})(window.Lumen);
