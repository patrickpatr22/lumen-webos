/*
 * Lumen – Licht über WLED.
 *
 * Aufteilung „Zonen“: Lumen legt die LED-Kette als WLED-Segmente an (unten links,
 * linke Seite, oben, rechte Seite, unten rechts; „fein“ teilt lange Seiten weiter auf).
 * Jede Zone bekommt die Helligkeit, die der Bildschirm an dieser Stelle hat: Im Glas-
 * Design leuchtet die Vorschaukarte rechts oben → dort kräftig, der Rest stark gedimmt.
 * Effekte (Atmen, Funkeln) laufen direkt auf dem Controller – Lumen sendet nur, wenn
 * sich etwas ändert.
 *
 * Übertragung: JSON-API (/json/state). Blockiert der Browser (CORS), geht es über die
 * Shell des Fernsehers (curl/wget, Homebrew Channel).
 */
(function (L) {
  'use strict';
  var S = L.S, q = function (s) { return Luna.shq(s); };
  var noop = function () {};

  var W = {
    timer: null, last: '', sent: '', saved: null, saving: false, via: 'fetch',
    info: null, fx: null, setupKey: '', created: 0, testing: false, warned: false
  };

  function P() { return L.prefs.wled; }
  function enabled() {
    return !!(P().on && P().ip) && (Luna.available() || window.LUMEN_FORCE_WLED === true);
  }
  function base() { return 'http://' + String(P().ip).trim().replace(/^https?:\/\//, '').replace(/\/+$/, ''); }

  // ------------------------------------------------------------------
  // Übertragung
  // ------------------------------------------------------------------
  function fetchT(url, opt, ms) {
    var ac = typeof AbortController === 'function' ? new AbortController() : null, t = null;
    if (ac) { opt.signal = ac.signal; t = setTimeout(function () { ac.abort(); }, ms || 2000); }
    return fetch(url, opt).then(function (r) { clearTimeout(t); return r; }, function (err) { clearTimeout(t); throw err; });
  }

  function shell(path, body) {
    var url = base() + path, cmd;
    if (body == null) {
      cmd = 'curl -s -m 2 ' + q(url) + ' 2>/dev/null || wget -q -T 2 -O - ' + q(url) + ' 2>/dev/null';
    } else {
      cmd = 'curl -s -m 2 -H "Content-Type: application/json" -d ' + q(body) + ' ' + q(url) + ' 2>/dev/null' +
        ' || wget -q -T 2 -O - --header="Content-Type: application/json" --post-data=' + q(body) + ' ' + q(url) + ' 2>/dev/null';
    }
    return Luna.exec(cmd);
  }

  function getJSON(path) {
    if (W.via === 'shell' && Luna.available()) return shell(path).then(JSON.parse);
    return fetchT(base() + path, { cache: 'no-store' }, 2000)
      .then(function (r) { return r.json(); })
      .catch(function (err) {
        if (!Luna.available()) throw err;
        W.via = 'shell';
        return shell(path).then(JSON.parse);
      });
  }

  function post(obj, keepalive) {
    var body = JSON.stringify(obj);
    if (W.via === 'shell' && Luna.available()) return shell('/json/state', body);
    return fetchT(base() + '/json/state', {
      method: 'POST', cache: 'no-store', keepalive: !!keepalive,
      headers: { 'Content-Type': 'application/json' }, body: body
    }, 2000).catch(function (err) {
      if (!Luna.available()) throw err;
      W.via = 'shell';
      return shell('/json/state', body);
    });
  }

  // Zustand, Infos und Effektliste in einem Rutsch (vor der ersten Änderung)
  function save() {
    W.saving = true;
    return getJSON('/json')
      .then(function (j) {
        W.saved = j && j.state ? j.state : false;
        if (j && j.info) W.info = j.info;
        if (j && Array.isArray(j.effects)) resolveFx(j.effects);
      })
      .catch(function () { W.saved = false; })
      .then(function () {
        W.saving = false;
        if (!W.sent) W.saved = null;              // Lumen wurde schon wieder verlassen
      });
  }

  function resolveFx(names) {
    function find(n, def) { var i = names.indexOf(n); return i >= 0 ? i : def; }
    W.fx = { breathe: find('Breathe', 2), twinkle: find('Twinkle', 17), sparkle: find('Sparkle', 20) };
  }
  function fx() { return W.fx || { breathe: 2, twinkle: 17, sparkle: 20 }; }

  // ------------------------------------------------------------------
  // Zonen
  // ------------------------------------------------------------------
  var CW = ['bl', 'l', 't', 'r', 'br'];                    // im Uhrzeigersinn ab unten Mitte (von vorne)
  var PATH = { bl: [[0.5, 1], [0, 1]], l: [[0, 1], [0, 0]], t: [[0, 0], [1, 0]], r: [[1, 0], [1, 1]], br: [[1, 1], [0.5, 1]] };
  var STARTS = { bm: 0, cbl: 1, ctl: 2, ctr: 3, cbr: 4 };
  var FINE = { bl: 1, l: 3, t: 4, r: 3, br: 1 };
  var ZONE_NAMES = { bl: 'unten links', l: 'linke Seite', t: 'oben', r: 'rechte Seite', br: 'unten rechts' };

  function order(start, dir) {
    var k = STARTS[start] || 0, out = [];
    for (var i = 0; i < 5; i++) out.push(dir === 'ccw' ? CW[(k - 1 - i + 10) % 5] : CW[(k + i) % 5]);
    return out;
  }

  // Segmente mit Start/Ende und Bildschirmposition (0..1) ihrer Mitte
  function plan(cfg) {
    var counts = cfg.counts || {}, seq = order(cfg.start, cfg.dir), pos = 0, segs = [];
    seq.forEach(function (z) {
      var n = Math.max(0, Math.round(+counts[z] || 0));
      if (!n) return;
      var parts = cfg.fine ? Math.min(FINE[z], n) : 1;
      var a = PATH[z][0], b = PATH[z][1];
      if (cfg.dir === 'ccw') { var tmp = a; a = b; b = tmp; }
      for (var j = 0; j < parts; j++) {
        var f = (j + 0.5) / parts;
        segs.push({
          zone: z,
          start: pos + Math.round(n * j / parts),
          stop: pos + Math.round(n * (j + 1) / parts),
          x: a[0] + (b[0] - a[0]) * f,
          y: a[1] + (b[1] - a[1]) * f
        });
      }
      pos += n;
    });
    return segs;
  }

  // Anzahl nach Seitenverhältnis 16:9 verteilen (unten je zur Hälfte links/rechts)
  function autoSplit(total) {
    total = Math.max(0, Math.round(+total || 0));
    var per = 2 * 16 + 2 * 9;
    var t = Math.round(total * 16 / per), side = Math.round(total * 9 / per);
    var bottom = Math.max(0, total - t - 2 * side), bl = Math.floor(bottom / 2);
    return { bl: bl, l: side, t: t, r: side, br: bottom - bl };
  }

  function total(counts) {
    if (!counts) return 0;
    return CW.reduce(function (s, z) { return s + Math.max(0, Math.round(+counts[z] || 0)); }, 0);
  }

  // ------------------------------------------------------------------
  // Farben
  // ------------------------------------------------------------------
  function ledColor(c) {
    var hsl = L.rgb2hsl(c || L.DEFAULT_ACCENT);
    if (hsl[1] < 0.12) return [70, 96, 255];
    return L.hsl2rgb(hsl[0], L.clamp(hsl[1] * 1.15, 0.62, 1), 0.5).map(Math.round);
  }

  // Wo leuchtet der Bildschirm am stärksten? Glas: Vorschaukarte rechts oben, Mono: Akzentlinie links
  function spot() { return { x: 0.775, y: 0.33 }; }

  function frame(accent, segs) {
    var c = ledColor(accent), sp = spot(), dim = L.clamp(+P().dim || 0, 0, 100) / 100;
    var w = segs.map(function (s) {
      var dx = (s.x - sp.x) * 1.78, dy = s.y - sp.y;
      return Math.exp(-(dx * dx + dy * dy) / 0.16);
    });
    var max = Math.max.apply(null, w.concat([1e-6]));
    return segs.map(function (s, i) {
      var k = dim + (1 - dim) * Math.pow(w[i] / max, 1.6);
      return { k: k, col: c.map(function (v) { return Math.round(v * k); }) };
    });
  }

  var SPEED = { slow: [30, 70], mid: [80, 130], fast: [150, 200] };   // [Atmen, Funkeln]
  var SPOT_K = 0.55;                                                  // ab hier zählt eine Zone zum Spot
  function segFx(eff, k, col) {
    var sp = SPEED[P().speed] || SPEED.mid, f = fx();
    var black = [0, 0, 0];
    if (eff === 'spot') {
      if (k < SPOT_K) return { fx: 0, sx: 128, ix: 128, col: [col, black, black] };
      // Spot: einzelne LEDs funkeln heller über der App-Farbe (WLED „Sparkle“);
      // das leichte Atmen kommt über die Helligkeit dazu (siehe Atem unten)
      var glint = col.map(function (v) { return Math.round(Math.min(255, v + (255 - v) * 0.62)); });
      return { fx: f.sparkle, sx: sp[1] - 20, ix: 128, col: [glint, col, black] };
    }
    if (eff === 'breathe' || (eff === 'combo' && k >= 0.55)) {
      return { fx: f.breathe, sx: sp[0], ix: 128, col: [col, col.map(function (v) { return Math.round(v * 0.18); }), black] };
    }
    if (eff === 'sparkle' || eff === 'combo') {
      var boost = Math.min(1, k + 0.3);
      var spark = col.map(function (v) { return Math.round(Math.min(255, (v + (255 - v) * 0.5) * boost)); });
      return { fx: f.twinkle, sx: sp[1], ix: eff === 'combo' ? 40 : 70, col: [spark, col, black] };
    }
    return { fx: 0, sx: 128, ix: 128, col: [col, black, black] };
  }

  // ------------------------------------------------------------------
  // Senden
  // ------------------------------------------------------------------
  function ensureCounts() {
    var cfg = P();
    if (total(cfg.counts) > 0) return true;
    var n = W.info && W.info.leds && W.info.leds.count;
    if (n > 0) {
      cfg.counts = autoSplit(n);
      L.savePrefs();
      return true;
    }
    if (!W.warned) {
      W.warned = true;
      L.toast('LED-Anzahl unbekannt – Zonen unter Anpassen → Licht einrichten');
    }
    return false;
  }

  // ------------------------------------------------------------------
  // Atem: Lumen lässt die Helligkeit der Spot-Zonen langsam auf und ab gleiten
  // (WLED blendet über „tt“ weich über). Läuft nur, solange die Startseite zu sehen ist.
  // ------------------------------------------------------------------
  var BREATH = { timer: null, ids: null, hi: true };
  var BREATH_LOW = 150, BREATH_PERIOD = { slow: 6400, mid: 4600, fast: 3200 };
  function breathStart(ids) {
    breathStop();
    if (ids !== 'all' && !(ids && ids.length)) return;
    BREATH.ids = ids;
    BREATH.hi = true;
    var half = (BREATH_PERIOD[P().speed] || BREATH_PERIOD.mid) / 2;
    function step() {
      BREATH.timer = null;
      if (!enabled() || document.hidden || S.away || S.mode === 'saver' || W.testing || !W.sent) return;
      BREATH.hi = !BREATH.hi;
      var bri = BREATH.hi ? 255 : BREATH_LOW;
      var seg = ids === 'all' ? { bri: bri } : ids.map(function (id) { return { id: id, bri: bri }; });
      post({ tt: Math.round(half / 100), seg: seg }).catch(noop);
      BREATH.timer = setTimeout(step, half);
    }
    BREATH.timer = setTimeout(step, 900);
  }
  function breathStop() {
    clearTimeout(BREATH.timer);
    BREATH.timer = null;
    BREATH.ids = null;
  }

  function push(accent) {
    var cfg = P();
    var single = cfg.layout === 'single' || !ensureCounts();
    var segs = single ? [] : plan(cfg);
    if (single || !segs.length) {
      var one = segFx(cfg.effect, 1, ledColor(accent));
      one.bri = 255;
      return post({ on: true, tt: 7, seg: one }).then(function () {
        if (cfg.effect === 'spot') breathStart('all'); else breathStop();
      });
    }
    var fr = frame(accent, segs);
    var key = segs.map(function (s) { return s.start + '-' + s.stop; }).join(',');
    var setup = key !== W.setupKey;
    var arr = [];
    if (setup) {
      // überzählige Segmente entfernen (stop 0), bevor die Zonen gesetzt werden
      var maxOld = 16;
      if (W.saved && Array.isArray(W.saved.seg)) {
        W.saved.seg.forEach(function (sg) { if (typeof sg.id === 'number') maxOld = Math.max(maxOld, sg.id + 1); });
      }
      for (var k = segs.length; k < Math.max(maxOld, W.created); k++) arr.push({ id: k, stop: 0 });
    }
    var spotIds = [];
    segs.forEach(function (s, i) {
      var o = segFx(cfg.effect, fr[i].k, fr[i].col);
      o.id = i;
      o.bri = 255;                                 // falls der Atem gerade unten war
      if (setup) {
        o.start = s.start; o.stop = s.stop; o.grp = 1; o.spc = 0; o.of = 0;
        o.on = true; o.pal = 0; o.sel = true;
      }
      if (fr[i].k >= SPOT_K) spotIds.push(i);
      arr.push(o);
    });
    return post({ on: true, tt: 7, seg: arr }).then(function () {
      W.setupKey = key;
      W.created = Math.max(W.created, segs.length);
      if (cfg.effect === 'spot') breathStart(spotIds); else breathStop();
    });
  }

  function keyOf(accent) {
    var cfg = P();
    return ledColor(accent).join(',') + '|' + cfg.layout + cfg.effect + cfg.speed + cfg.dim + cfg.fine +
      cfg.start + cfg.dir + JSON.stringify(cfg.counts) + S.theme;
  }

  function color(accent) {
    if (!enabled() || W.testing || S.mode === 'saver' || document.hidden || S.away) return;
    var key = keyOf(accent);
    if (key === W.last) return;
    W.last = key;
    clearTimeout(W.timer);
    W.timer = setTimeout(function () {
      W.timer = null;
      W.sent = key;
      var p = W.saved === null && !W.saving ? save() : Promise.resolve();
      p.then(function () {
        if (W.sent !== key) return null;          // inzwischen verlassen oder neue Farbe unterwegs
        return push(accent);
      }).catch(noop);
    }, 320);
  }

  // Taste wird gehalten: noch nichts senden, erst die Farbe, bei der die Auswahl stehen bleibt
  function cancel() {
    if (!W.timer) return;
    clearTimeout(W.timer);
    W.timer = null;
    W.last = W.sent;
  }

  var SEG_KEYS = ['id', 'start', 'stop', 'grp', 'spc', 'of', 'on', 'frz', 'bri', 'cct', 'col', 'fx', 'sx', 'ix',
    'pal', 'c1', 'c2', 'c3', 'sel', 'rev', 'mi', 'o1', 'o2', 'o3', 'si', 'm12'];
  function restoreBody(st, created) {
    var body = { on: st.on, bri: st.bri, tt: 7, seg: [] };
    var orig = Array.isArray(st.seg) ? st.seg : [];
    var ids = orig.map(function (sg) { return sg.id; });
    for (var k = 0; k < created; k++) if (ids.indexOf(k) < 0) body.seg.push({ id: k, stop: 0 });
    orig.forEach(function (sg) {
      var o = {};
      SEG_KEYS.forEach(function (key) { if (sg[key] !== undefined) o[key] = sg[key]; });
      body.seg.push(o);
    });
    return body;
  }

  // Lumen wird verlassen (App gestartet, Bildschirmschoner): Licht zurückgeben
  function leave() {
    breathStop();
    clearTimeout(W.timer);
    W.timer = null;
    var had = W.sent;
    W.last = W.sent = '';
    if (!had || !enabled()) { W.saved = null; return; }
    var mode = P().leave, st = W.saved, created = W.created;
    W.saved = null;
    W.setupKey = '';
    W.created = 0;
    if (mode === 'keep') return;
    if (st) {
      var body = restoreBody(st, created);
      if (mode === 'off') body.on = false;
      post(body, true).then(function () {
        if (mode !== 'off' && typeof st.pl === 'number' && st.pl >= 0) return post({ ps: st.pl }, true);
        return null;
      }).catch(noop);
    } else if (mode === 'off') {
      post({ on: false }, true).catch(noop);
    }
  }

  // Einstellungen geändert: Zonen neu anlegen und aktuelle Farbe neu senden
  function refresh() {
    breathStop();
    clearTimeout(W.timer);
    W.timer = null;
    var st = W.saved, created = W.created;
    W.last = '';
    W.setupKey = '';
    if (!enabled()) return;
    var cfg = P();
    var p = Promise.resolve();
    if (cfg.layout === 'single' && created && st) {
      p = post(restoreBody(st, created)).then(function () { W.created = 0; });
    }
    p.then(function () { color(S.accent); }).catch(noop);
  }

  function prepare() {
    if (W.saved === null && !W.saving) { W.sent = W.sent || 'prep'; return save(); }
    return Promise.resolve();
  }

  // ------------------------------------------------------------------
  // Einstellungen: Verbindung testen, Zonen testen, automatisch aufteilen
  // ------------------------------------------------------------------
  function test() {
    if (!P().ip) { L.toast('Keine WLED-Adresse eingetragen'); return Promise.resolve(null); }
    if (!Luna.available() && window.LUMEN_FORCE_WLED !== true) {
      L.toast('Vorschau: würde ' + P().ip + ' prüfen');
      return Promise.resolve(null);
    }
    L.toast('Suche WLED unter ' + P().ip + ' …');
    return getJSON('/json/info')
      .then(function (info) {
        W.info = info;
        var leds = info && info.leds && info.leds.count;
        L.toast('Verbunden: ' + ((info && info.name) || 'WLED') + (leds ? ' · ' + leds + ' LEDs' : ''));
        return info;
      })
      .catch(function () {
        L.toast('WLED unter ' + P().ip + ' nicht erreichbar');
        return null;
      });
  }

  function split() {
    var go = function (info) {
      var n = info && info.leds && info.leds.count;
      if (!n) { L.toast('LED-Anzahl konnte nicht gelesen werden'); return false; }
      P().counts = autoSplit(n);
      L.savePrefs();
      L.toast(n + ' LEDs aufgeteilt');
      refresh();
      return true;
    };
    if (W.info) return Promise.resolve(go(W.info));
    return test().then(go);
  }

  var TEST_COL = { bl: [255, 40, 30], l: [255, 150, 0], t: [40, 220, 80], r: [10, 130, 255], br: [190, 80, 255] };
  function zoneTest() {
    if (!enabled()) { L.toast('Lichtsync ist aus'); return Promise.resolve(); }
    breathStop();
    return prepare().then(function () {
      if (!ensureCounts()) return;
      var segs = plan(P());
      if (!segs.length) { L.toast('Keine Zonen eingerichtet'); return; }
      var per = {}, seen = {};
      segs.forEach(function (s) { per[s.zone] = (per[s.zone] || 0) + 1; });
      var arr = [];
      for (var k = segs.length; k < 16; k++) arr.push({ id: k, stop: 0 });
      segs.forEach(function (s, i) {
        var j = seen[s.zone] = (seen[s.zone] || 0) + 1;
        var f = per[s.zone] > 1 ? 0.3 + 0.7 * j / per[s.zone] : 1;   // heller in Laufrichtung
        arr.push({ id: i, start: s.start, stop: s.stop, grp: 1, spc: 0, of: 0, on: true, bri: 255, pal: 0, sel: true,
          fx: 0, col: [TEST_COL[s.zone].map(function (v) { return Math.round(v * f); }), [0, 0, 0], [0, 0, 0]] });
      });
      W.testing = true;
      W.setupKey = '';
      W.sent = W.sent || 'test';
      return post({ on: true, tt: 0, seg: arr }).then(function () {
        W.created = Math.max(W.created, segs.length, 16);
        L.toast('Zonentest: unten links rot · links orange · oben grün · rechts blau · unten rechts lila', 7600);
        setTimeout(function () {
          W.testing = false;
          W.last = '';
          color(S.accent);
        }, 8000);
      });
    }).catch(function () { W.testing = false; L.toast('Zonentest fehlgeschlagen'); });
  }

  L.wled = {
    color: color, cancel: cancel, leave: leave, refresh: refresh, test: test, split: split,
    zoneTest: zoneTest, plan: plan, order: order, autoSplit: autoSplit, total: total, frame: frame,
    restoreBody: restoreBody, ledColor: ledColor, ZONES: CW, ZONE_NAMES: ZONE_NAMES,
    state: function () { return W; }, breathing: function () { return BREATH.ids; }
  };
})(window.Lumen);
