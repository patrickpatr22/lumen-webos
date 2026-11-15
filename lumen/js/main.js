/*
 * Lumen – Start und Steuerung: Tasten, Startparameter (Home/Source), Aufwachen und
 * Schlafen (Vorder-/Hintergrund), Uhr, Bildschirmschoner.
 *
 * Startparameter:
 *   {"focus":"apps"}                     Home-Taste → zurück zur letzten Auswahl (oder erste App)
 *   {"focus":"inputs","key":"source"}    Source-Taste → Eingänge (oder Apps, je nach Einstellung)
 *   {"shot":"<appId>","t":<Sekunden>}    go-home hat gerade ein Vorschaubild aufgenommen
 *
 * Verlassen und Zurückkehren: Lumen bleibt im Hintergrund unverändert stehen. webOS zeigt
 * beim Zurückkommen zuerst das letzte Bild von Lumen – deshalb wird nichts ausgeblendet oder
 * neu aufgebaut, und die Auswahl bleibt, wo sie war. So sieht man keinen Wechsel.
 */
(function (L) {
  'use strict';
  var S = L.S, el = L.el, KEY = L.KEY;

  // ------------------------------------------------------------------
  // Uhr
  // ------------------------------------------------------------------
  var lastTime = '', clockFlip = false;
  function tick() {
    var d = new Date(), time = L.pad(d.getHours()) + ':' + L.pad(d.getMinutes());
    if (time === lastTime) return;
    lastTime = time;
    el.clock.textContent = time;
    el.saverClock.textContent = time;
    el.date.textContent = L.WEEKDAYS[d.getDay()] + ', ' + d.getDate() + '. ' + L.MONTHS[d.getMonth()];
    clockFlip = !clockFlip;
    el.clock.classList.remove(clockFlip ? 'tick-b' : 'tick-a');
    el.clock.classList.add(clockFlip ? 'tick-a' : 'tick-b');
  }

  // ------------------------------------------------------------------
  // Bildschirmschoner (OLED-Schutz)
  // ------------------------------------------------------------------
  var idleTimer = null, saverTimer = null;
  function bumpIdle() {
    clearTimeout(idleTimer);
    if (document.hidden) return;
    var m = +L.prefs.saverMin;
    if (m > 0) idleTimer = setTimeout(startSaver, m * 60000);
  }
  function placeSaverClock() {
    var c = el.saverClock;
    c.classList.add('hide');
    setTimeout(function () {
      var w = c.offsetWidth || 420, h = c.offsetHeight || 180;
      c.style.left = Math.round(80 + Math.random() * (1920 - 160 - w)) + 'px';
      c.style.top = Math.round(80 + Math.random() * (1080 - 160 - h)) + 'px';
      c.classList.remove('hide');
    }, 1400);
  }
  function startSaver() {
    if (S.mode === 'prompt' || S.mode === 'boot') return;
    closeLayers();
    L.wled.leave();
    L.preview.stopLive();
    S.mode = 'saver';
    el.saver.hidden = false;
    document.body.classList.add('saver');
    tick();
    placeSaverClock();
    clearInterval(saverTimer);
    saverTimer = setInterval(placeSaverClock, 30000);
  }
  function stopSaver() {
    S.mode = 'home';
    el.saver.hidden = true;
    document.body.classList.remove('saver');
    clearInterval(saverTimer);
    bumpIdle();
    L.wled.color(S.accent);
  }

  function closeLayers() {
    L.ui.closePop();
    if (S.mode === 'prompt') L.ui.closePrompt();
    if (S.mode === 'settings') L.ui.closeSettings();
    if (S.mode === 'sheet') L.ui.closeSheet();
    if (S.mode === 'saver') stopSaver();
  }

  function applyTheme() {
    S.theme = 'glas';                                  // seit 1.6 nur noch Glas
    document.body.setAttribute('data-theme', S.theme);
    L.bg.apply();
  }

  // ------------------------------------------------------------------
  // Tasten
  // ------------------------------------------------------------------
  var ok = { down: false, long: false, timer: null, at: 0 };

  function onKeyDown(e) {
    var k = e.keyCode;
    var back = k === KEY.BACK || k === KEY.ESC || k === KEY.BACKSPACE;
    if (S.mode === 'boot') {                       // jede Taste überspringt die Start-Animation
      e.preventDefault();
      ok.down = false;
      L.anim.skip();
      return;
    }
    if (L.ui.key(e, k, back)) return;
    bumpIdle();
    if (S.mode === 'saver') { e.preventDefault(); stopSaver(); ok.down = false; return; }

    if (k === KEY.OK) {
      e.preventDefault();
      if (ok.down && Date.now() - ok.at < 3000) return; // Tastenwiederholung
      ok.down = true; ok.long = false; ok.at = Date.now();
      clearTimeout(ok.timer);
      ok.timer = setTimeout(function () {
        if (!ok.down) return;
        ok.long = true;
        if (S.mode === 'home') L.home.longPress(L.home.currentItem());
      }, L.LONG_PRESS_MS);
      return;
    }
    if (S.mode !== 'home') return;
    switch (k) {
      case KEY.LEFT: e.preventDefault(); L.home.move(-1, 0); break;
      case KEY.RIGHT: e.preventDefault(); L.home.move(1, 0); break;
      case KEY.UP: e.preventDefault(); L.home.move(0, -1); break;
      case KEY.DOWN: e.preventDefault(); L.home.move(0, 1); break;
      default:
        if (back) {
          e.preventDefault();
          // Launcher nie verlassen – stattdessen zurück zur ersten Kachel
          L.home.goFirst(0);
        }
    }
  }

  function onKeyUp(e) {
    if (e.keyCode !== KEY.OK || S.mode === 'prompt') return;
    e.preventDefault();
    if (!ok.down) return;
    ok.down = false;
    clearTimeout(ok.timer);
    if (ok.long) return;
    if (L.ui.ok()) return;
    if (S.mode === 'home') L.home.activate(L.home.currentItem());
  }

  function onPointer(e) {
    if (S.mode === 'saver') { stopSaver(); return; }
    if (S.mode === 'boot') return;
    var now = Date.now();
    if (now - (onPointer.bumped || 0) > 1000) { onPointer.bumped = now; bumpIdle(); }
    L.home.onPointer(e);
  }

  // ------------------------------------------------------------------
  // Startparameter
  // ------------------------------------------------------------------
  function launchParams() {
    try {
      var p = window.PalmSystem && window.PalmSystem.launchParams;
      if (!p) return {};
      return (typeof p === 'string' ? JSON.parse(p) : p) || {};
    } catch (e) {
      return {};
    }
  }

  // returning: Lumen kommt gerade aus dem Hintergrund zurück
  function applyLaunchParams(p, returning) {
    if (p.shot) L.preview.noteShot(p.shot, p.t);
    var before = L.home.currentItem();
    if (p.focus === 'inputs') {
      S.userMoved = true;
      L.home.goFirst(L.prefs.sourceFocus === 'apps' ? 0 : 1);
    } else if (p.focus === 'apps') {
      // Home: aus einer App zurück → die Auswahl bleibt (nahtlos); in Lumen selbst → erste App
      if (!(returning && L.prefs.homeFocus !== 'first' && before)) L.home.goFirst(0);
    }
    var cur = L.home.currentItem();
    if (p.shot && cur && cur.id === p.shot) L.home.updateArt(cur, true, false, true);   // neues Bild weich überblenden
  }

  // Bei einem erneuten Start (Home-Taste, App-Symbol) sicher in den Vordergrund kommen.
  function bringToFront() {
    try {
      var sys = window.webOSSystem || window.PalmSystem;
      if (sys && typeof sys.activate === 'function') sys.activate();
    } catch (e) { /* ignorieren */ }
  }

  // ------------------------------------------------------------------
  // Sichtbar werden / verschwinden
  // ------------------------------------------------------------------
  var wakeTimer = null, laterTimer = null;

  function afterShow() {
    L.greet.next();
    bumpIdle();
    L.wled.color(S.accent);
  }

  // Arbeit, die nach dem Zurückkommen nicht sofort sein muss, kommt erst, wenn alles steht
  function later() {
    clearTimeout(laterTimer);
    laterTimer = setTimeout(function () {
      if (document.hidden) return;
      L.data.refresh(false);
      L.preview.sync().then(function () {
        var it = L.home.currentItem();
        if (it) L.home.updateArt(it, false, false, true);
      });
    }, 1600);
  }

  // Lumen kommt aus dem Hintergrund zurück: nach dem Einschalten Start-Animation,
  // sonst (Standard) einfach weiter wie vorher – optional mit sanftem Aufbau
  function wake() {
    clearTimeout(wakeTimer);
    if (!S.away) return;
    S.away = false;
    document.body.classList.remove('paused');     // falls das Sichtbar-Ereignis erst später kommt
    L.anim.decide(false).then(function (kind) {
      if (kind === 'boot') {
        L.anim.playBoot(afterShow, Promise.resolve(L.data.refresh(false)).then(decodeVisible));
      } else {
        L.anim.build();                       // „Keiner“: macht nichts
        afterShow();
        later();
      }
    });
  }

  function replayBoot() {
    if (S.mode !== 'home') closeLayers();
    L.anim.playBoot(afterShow, decodeVisible());
  }

  function onRelaunch() {
    var returning = !!S.away || !!document.hidden;
    bringToFront();
    closeLayers();
    applyLaunchParams(launchParams(), returning);
    if (returning) { S.away = true; wake(); }
    else bumpIdle();                              // war schon zu sehen: nur die Auswahl springt
  }

  function onVisibility() {
    document.body.classList.toggle('paused', document.hidden);
    if (document.hidden) {
      clearTimeout(idleTimer);
      clearTimeout(wakeTimer);
      clearTimeout(laterTimer);
      S.away = true;
      L.anim.markHidden();
      L.wled.leave();
      L.preview.stopLive();
      closeLayers();
      return;
    }
    // Kurz warten: kommt gleich ein webOSRelaunch (Home/Source), übernimmt der
    clearTimeout(wakeTimer);
    wakeTimer = setTimeout(wake, 150);
  }

  // Bereit, wenn die sichtbaren Symbole und das Bild der Karte dekodiert sind
  function decodeVisible() {
    var imgs = (S.nodes[0] || []).slice(0, 7).map(function (t) { return t.querySelector('img.tile-icon'); })
      .filter(Boolean);
    return Promise.all(imgs.map(function (i) {
      return (i.decode ? i.decode() : Promise.resolve()).catch(function () {});
    })).then(function () { return L.preview.prepare(L.home.currentItem(), 2500); });
  }

  // ------------------------------------------------------------------
  // Start
  // ------------------------------------------------------------------
  function init() {
    window.LUMEN_VERSION = L.VERSION;
    applyTheme();
    L.anim.apply();

    // Sofort mit dem Stand vom letzten Mal starten, im Hintergrund aktualisieren
    var cache = Luna.available() ? L.data.loadCache() : null;
    if (cache) {
      S.allApps = cache.apps;
      S.appSig = cache.sig || '';
      S.colors = cache.colors || {};
      S.inputStatus = cache.inputStatus || {};
      S.statusSig = JSON.stringify(S.inputStatus);
      S.loaded = true;
      if (cache.ver !== L.VERSION) S.iconsStale = true;   // nach einem Update fehlt der Symbol-Ordner
    }

    tick();
    setInterval(tick, 5000);
    L.data.rebuild();
    L.home.renderRows();
    S.focus = { row: S.rows[0].items.length ? 0 : 1, col: 0 };
    L.home.applyFocus(true);
    applyLaunchParams(launchParams(), false);

    // Laden läuft hinter der Start-Animation: Liste, Vorschaubilder, Schrift, Symbole
    var synced = L.preview.sync().then(function () { L.home.updateArt(L.home.currentItem(), true, true); });
    var refreshed = new Promise(function (res) {
      setTimeout(function () { Promise.resolve(L.data.refresh(false)).then(res, res); }, cache ? 300 : 0);
    });
    var fonts = document.fonts && document.fonts.ready ? document.fonts.ready.then(function () {
      L.home.measure(); L.home.applyFocus(true); L.home.fitTitle();
    }) : Promise.resolve();
    var ready = Promise.all([synced, refreshed, fonts].map(function (p) { return p.catch(function () {}); }))
      .then(decodeVisible);

    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('keyup', onKeyUp, true);
    document.addEventListener('mousemove', onPointer);
    document.addEventListener('webOSRelaunch', onRelaunch);
    document.addEventListener('visibilitychange', onVisibility);
    // webOS blendet den Zeiger aus, sobald Pfeiltasten benutzt werden
    document.addEventListener('cursorStateChange', function (e) {
      if (e && e.detail && e.detail.visibility === false) L.home.pointerIdle();
    });

    L.greet.start();
    L.anim.watchWake(function () { if (S.mode === 'home' || S.mode === 'settings') replayBoot(); });
    L.preview.syncAutoshot();
    L.bar.sync(false);
    if (L.prefs.backend.on) L.backend.start();
    L.backend.watch();

    L.anim.decide(true).then(function (kind) {
      if (kind === 'boot') L.anim.playBoot(afterShow, ready);
      else {
        // Lumen wurde nur neu gestartet: kurz warten, bis das Wichtigste da ist, dann auftauchen
        Promise.race([ready, new Promise(function (r) { setTimeout(r, 1200); })]).then(function () {
          L.anim.hideCover(); L.anim.build(L.prefs.anim.on ? 'reveal' : 'none'); afterShow();
        });
      }
    });
  }

  L.main = { bumpIdle: bumpIdle, applyTheme: applyTheme, replayBoot: replayBoot, startSaver: startSaver, decodeVisible: decodeVisible };
  init();
})(window.Lumen);
