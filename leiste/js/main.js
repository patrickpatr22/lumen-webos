/*
 * Lumen Leiste – Steuerung: eine App, zwei Ansichten.
 *   {"mode":"settings"}  Schnelleinstellungen links (Einstellungen-Taste, go-settings)
 *   sonst                Eingangs-/App-Leiste unten (Source-Taste, go-inputs)
 * Wird die App erneut gestartet (Taste nochmal gedrückt), entscheidet der neue Modus:
 * gleicher Modus → die Ansicht reagiert selbst (nächster Eintrag bzw. schließen),
 * anderer Modus → umschalten.
 */
(function () {
  'use strict';
  var SELF_ID = 'de.lumenhome.leiste';
  var R = window.LeisteRouter = { mode: null, closing: false, timers: [] };

  function params() {
    try {
      var p = window.PalmSystem && window.PalmSystem.launchParams;
      return (typeof p === 'string' ? JSON.parse(p || '{}') : p) || {};
    } catch (e) { return {}; }
  }
  function modeOf(p) { return p && p.mode === 'settings' ? 'panel' : 'bar'; }
  function mod(m) { return m === 'panel' ? window.LeistePanel : window.LeisteBar; }

  R.closeApp = function () {
    if (R.closing) return;
    R.closing = true;
    var m = mod(R.mode);
    if (m) m.hide();
    R.timers.push(setTimeout(function () {
      try { window.close(); } catch (e) { /* weiter unten */ }
      // falls das Fenster offen bleibt: über den Application Manager schließen
      R.timers.push(setTimeout(function () {
        if (!window.Luna || !Luna.available()) return;
        Luna.exec('luna-send -n 1 luna://com.webos.applicationManager/closeByAppId ' +
          Luna.shq(JSON.stringify({ id: SELF_ID })) + ' >/dev/null 2>&1; echo ok').catch(function () {});
      }, 500));
    }, 260));
  };

  function start(p) {
    R.timers.forEach(clearTimeout);
    R.timers = [];
    R.closing = false;
    var m = modeOf(p);
    if (R.mode && R.mode !== m && mod(R.mode)) mod(R.mode).hide();
    R.mode = m;
    document.body.dataset.mode = m;
    mod(m).start(p);
  }

  document.addEventListener('keydown', function (e) {
    if (R.closing) return;
    var m = mod(R.mode);
    if (m) m.key(e);
  }, true);
  document.addEventListener('webOSRelaunch', function () {
    var p = params();
    if (R.closing || modeOf(p) !== R.mode) start(p);
    else mod(R.mode).relaunch(p);
  });
  document.addEventListener('visibilitychange', function () { if (document.hidden) R.closeApp(); });

  R.params = params;
  start(params());
})();
