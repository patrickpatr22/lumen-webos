/*
 * Lumen – Kern: Konstanten, Einstellungen, Zustand, Farben, Symbole, Hinweise.
 * Alle Module hängen an window.Lumen (kurz L) und werden in index.html in fester
 * Reihenfolge geladen; main.js startet am Ende alles.
 */
(function (L) {
  'use strict';

  L.VERSION = '1.6.2';
  L.SELF_ID = 'de.lumenhome.launcher';
  L.BAR_ID = 'de.lumenhome.leiste';              // Lumen-Leiste (Source-Taste über dem Bild)
  L.PREF_VERSION = 16;
  L.PREF_KEY = 'lumen.prefs.v1';
  L.CACHE_KEY = 'lumen.cache.v1';
  L.DATA_DIR = '/var/lib/webosbrew/lumen';      // überlebt Lumen-Updates (Vorschaubilder, Schalter)
  L.BACKEND_PORT = 8484;
  L.LONG_PRESS_MS = 600;
  L.KEY = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, OK: 13, BACK: 461, ESC: 27, BACKSPACE: 8 };

  L.INPUT_IDS = ['com.webos.app.hdmi1', 'com.webos.app.hdmi2', 'com.webos.app.hdmi3', 'com.webos.app.hdmi4'];
  L.INPUT_NAMES = ['', 'PC', 'Laptop', 'PlayStation', 'Xbox', 'Nintendo Switch', 'Konsole',
    'Receiver', 'Soundbar', 'Blu-ray', 'Streaming-Box'];
  // bevorzugte Reihenfolge, solange der Nutzer nichts umsortiert hat
  L.PREFERRED = ['youtube.leanback.v4', 'netflix', 'amazon', 'com.disney.disneyplus-prod',
    'com.apple.appletv', 'spotify-beehive', 'com.webos.app.mediadiscovery'];
  L.UTILITY = ['com.webos.app.discovery', 'org.webosbrew.hbchannel'];
  L.WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  L.MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August',
    'September', 'Oktober', 'November', 'Dezember'];

  // ------------------------------------------------------------------
  // Einstellungen (localStorage)
  // ------------------------------------------------------------------
  function defaults() {
    return {
      order: [], hidden: [], inputs: {}, saverMin: 5,
      theme: 'glas',
      name: '',                    // Name für die Begrüßung (Anpassen → Darstellung)
      greet: 'classic',            // classic | quotes | off
      quoteEvery: 45,              // Sekunden; 0 = nur beim Öffnen
      recentGreets: [], recentQuotes: [],
      sourceFocus: 'inputs',       // Source-Taste: inputs | apps | bar (Lumen-Leiste über dem Bild)
      anim: {
        on: true,                  // Hauptschalter
        boot: 'power',             // power (nach dem Einschalten) | always | off
        build: 'none',             // Rückkehr mit Home: none | soft | structured | stagger
        swap: 'fly',               // Vorschau-Wechsel: fly | rise | tilt | fade | off
        select: 'pop',             // Kachel-Auswahl: pop | bounce | tilt | off
        float: false, breathe: true, pointer: true, ambient: false,
        quote: 'type',             // Zitat-Wechsel: type | fade | off
        tileSpeed: 80,             // Tempo App-Reihe in % (100 = wie 1.4)
        cardSpeed: 80              // Tempo Vorschaukarte in %
      },
      preview: { mode: 'shots', autoshot: true, live: true },
      wled: {
        on: true, ip: '', leave: 'restore',   // ohne IP bleibt WLED aus
        layout: 'zones',           // single | zones
        effect: 'spot',            // spot (Spot atmet + funkelt) | static | breathe | sparkle | combo
        speed: 'mid', dim: 12, fine: true,
        start: 'bm', dir: 'cw', counts: null
      },
      backend: { on: false },
      bg: 'accent',                // Hintergrund: accent | design:<id> | image:<datei>
      bgStamp: 0,                  // wann zuletzt gewählt (Abgleich mit dem Web-Backend)
      pv: L.PREF_VERSION
    };
  }

  function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }
  function merge(d, p) {
    Object.keys(d).forEach(function (k) {
      if (p[k] === undefined) return;
      if (isObj(d[k]) && isObj(p[k])) d[k] = Object.assign(d[k], p[k]);
      else d[k] = p[k];
    });
    return d;
  }

  function loadPrefs() {
    var d = defaults();
    try {
      var p = JSON.parse(localStorage.getItem(L.PREF_KEY));
      if (isObj(p)) {
        if (p.motion === 'static' && !p.anim) d.anim.on = false;   // 1.2/1.3: Schalter „Bewegung“
        delete p.motion;
        delete p.sourceOverlay;                                   // 1.3: altes Overlay
        if (!(p.pv >= 15)) {                                      // von 1.4 und älter
          if (isObj(p.anim)) {
            if (p.anim.build !== 'none') p.anim.build = 'none';   // kein Neuaufbau mehr bei Home
            p.anim.ambient = false;                               // spart Grafikleistung
            p.anim.float = false;
          }
          if (isObj(p.wled) && (!p.wled.effect || p.wled.effect === 'static')) p.wled.effect = 'spot';
          p.pv = 15;
        }
        if (isObj(p.anim) && p.anim.build === 'off') p.anim.build = 'none';
        p.theme = 'glas';                                         // 1.6: Mono gibt es nicht mehr
        p.pv = L.PREF_VERSION;
        merge(d, p);
      }
    } catch (e) { /* ignorieren */ }
    return d;
  }
  L.defaults = defaults;
  L.prefs = loadPrefs();
  L.savePrefs = function () {
    try { localStorage.setItem(L.PREF_KEY, JSON.stringify(L.prefs)); } catch (e) { /* ignorieren */ }
  };
  L.inputPref = function (id) {
    if (!L.prefs.inputs[id]) L.prefs.inputs[id] = {};
    return L.prefs.inputs[id];
  };

  // ------------------------------------------------------------------
  // Zustand
  // ------------------------------------------------------------------
  L.S = {
    allApps: [],
    inputStatus: {},
    rows: [{ key: 'apps', items: [] }, { key: 'inputs', items: [] }],
    focus: { row: 0, col: 0 },
    scroll: [0, 0],
    mode: 'home',              // home | settings | sheet | prompt | saver | boot
    loaded: false,
    userMoved: false,
    colors: {},                // id → {bg, accent}
    ambKey: '', ambIdx: 0,
    appSig: '', statusSig: '',
    iconsStale: false, repairTried: false,
    lastAppsAt: 0,
    theme: 'glas',
    nodes: [[], []],
    geo: null,
    focusedEl: null,
    previews: {},              // id → {shot:{src,t}, custom:{src,t}, pinned}
    tiles: {},                 // id → {content, tag} (tiles.json, auch vom Web-Backend)
    bgImages: [],              // eigene Hintergründe [{file, name, src, t}]
    accent: null               // Akzentfarbe der aktuellen Auswahl (für WLED)
  };

  var $ = function (sel) { return document.querySelector(sel); };
  L.$ = $;
  L.el = {
    amb: document.querySelectorAll('.amb'),
    greet: $('#greet'), clock: $('#clock'), date: $('#date'),
    hero: $('#hero'), title: $('#hero-title'), tag: $('#hero-tag span'),
    tracks: [$('#row-apps .track'), $('#row-inputs .track')],
    viewports: [$('#row-apps .viewport'), $('#row-inputs .viewport')],
    art: $('#art'), artTilt: $('#art .art-tilt'), artCard: $('#art .art-card'),
    artFace: $('#art .art-face'), plight: $('#plight'),
    boot: $('#boot'), guides: $('#guides'),
    saver: $('#saver'), saverClock: $('#saver-clock'),
    toast: $('#toast')
  };

  // ------------------------------------------------------------------
  // Farben
  // ------------------------------------------------------------------
  var clamp = L.clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  L.css = function (c, a) {
    return a == null ? 'rgb(' + c.map(Math.round).join(',') + ')'
      : 'rgba(' + c.map(Math.round).join(',') + ',' + a + ')';
  };
  L.mix = function (a, b, t) { return [0, 1, 2].map(function (i) { return a[i] + (b[i] - a[i]) * t; }); };
  L.parseColor = function (s) {
    if (!s || typeof s !== 'string') return null;
    var m = s.trim().match(/^#?([0-9a-f]{6})$/i);
    if (!m) return null;
    var n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  var rgb2hsl = L.rgb2hsl = function (c) {
    var r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
    }
    return [h, s, l];
  };
  var hsl2rgb = L.hsl2rgb = function (h, s, l) {
    function f(n) {
      var k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l);
      return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)));
    }
    return [f(0), f(8), f(4)];
  };
  L.hashColor = function (str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    return hsl2rgb((h % 360) / 360, 0.55, 0.45);
  };
  L.DEFAULT_ACCENT = [72, 92, 170];
  // Leuchtende, gut sichtbare Variante für den Hintergrund
  L.ambientOf = function (c) {
    var hsl = rgb2hsl(c);
    if (hsl[1] < 0.12) return L.DEFAULT_ACCENT.slice();
    return hsl2rgb(hsl[0], clamp(hsl[1], 0.5, 0.85), clamp(hsl[2], 0.38, 0.55));
  };

  // Ecken-Farbe (Kachelhintergrund) und Akzentfarbe aus dem Symbol lesen
  L.sampleColors = function (img) {
    try {
      var n = 20, cv = document.createElement('canvas');
      cv.width = cv.height = n;
      var cx = cv.getContext('2d');
      cx.drawImage(img, 0, 0, n, n);
      var d = cx.getImageData(0, 0, n, n).data;
      var px = function (x, y) { var k = (y * n + x) * 4; return [d[k], d[k + 1], d[k + 2], d[k + 3]]; };
      var corners = [px(1, 1), px(n - 2, 1), px(1, n - 2), px(n - 2, n - 2)].filter(function (p) { return p[3] > 230; });
      var bg = null;
      if (corners.length >= 3) {
        bg = [0, 1, 2].map(function (i) {
          return corners.reduce(function (s, p) { return s + p[i]; }, 0) / corners.length;
        });
      }
      var sum = [0, 0, 0], w = 0;
      for (var k = 0; k < d.length; k += 4) {
        if (d[k + 3] < 140) continue;
        var c = [d[k], d[k + 1], d[k + 2]], hsl = rgb2hsl(c);
        var wt = hsl[1] * hsl[1] * (1 - Math.abs(hsl[2] - 0.5)) + 0.02;
        sum[0] += c[0] * wt; sum[1] += c[1] * wt; sum[2] += c[2] * wt; w += wt;
      }
      var accent = w ? [sum[0] / w, sum[1] / w, sum[2] / w] : null;
      return { bg: bg, accent: accent };
    } catch (e) {
      return null; // z. B. Canvas-Sperre bei file:// – dann Ersatzfarben
    }
  };

  L.itemAccent = function (item) {
    var c = L.S.colors[item.id];
    return (c && (c.accent || c.bg)) || item.color || null;
  };

  L.pad = function (n) { return (n < 10 ? '0' : '') + n; };
  L.selfDir = function () { return decodeURIComponent(location.pathname).replace(/\/[^/]*$/, ''); };

  // ------------------------------------------------------------------
  // Hinweis unten am Rand
  // ------------------------------------------------------------------
  var toastTimer = null;
  L.toast = function (msg, ms) {
    var t = L.el.toast;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, ms || 2600);
  };

  // ------------------------------------------------------------------
  // Linien-Symbole (24er-Raster)
  // ------------------------------------------------------------------
  var GLYPHS = L.GLYPHS = {
    monitor: '<rect x="3" y="4" width="18" height="12" rx="2.2"/><path d="M8.5 20h7M12 16v4"/>',
    gamepad: '<path d="M7.2 8h9.6a4 4 0 0 1 3.9 3.1l.9 4.2a2.3 2.3 0 0 1-3.9 2.1L16 15.6H8l-1.7 1.8a2.3 2.3 0 0 1-3.9-2.1l.9-4.2A4 4 0 0 1 7.2 8z"/><path d="M8.3 10.6v3.2M6.7 12.2h3.2"/><circle cx="15.6" cy="11.4" r=".5"/><circle cx="17.4" cy="13" r=".5"/>',
    hdmi: '<path d="M3.5 8.5h17v3.6l-2.2 3.4H5.7l-2.2-3.4z"/><path d="M7.5 11.6h9"/>',
    speaker: '<rect x="6" y="3" width="12" height="18" rx="2.4"/><circle cx="12" cy="14.2" r="3.2"/><circle cx="12" cy="7.4" r="1"/>',
    disc: '<circle cx="12" cy="12" r="8.8"/><circle cx="12" cy="12" r="2.4"/><path d="M12 5.6a6.4 6.4 0 0 1 6.4 6.4"/>',
    box: '<rect x="3.5" y="8.5" width="17" height="7.5" rx="2.2"/><path d="M8 19.5h8"/><circle cx="7.4" cy="12.2" r=".5"/>',
    gear: '<circle cx="12" cy="12" r="3.2"/><circle cx="12" cy="12" r="7.6" stroke-width="3" stroke-dasharray="3.1 2.85"/>',
    sliders: '<path d="M4 6.5h9.5M18.5 6.5H20M4 12h3.5M11.5 12H20M4 17.5h11.5M19.5 17.5H20"/><circle cx="16" cy="6.5" r="2.2"/><circle cx="9.5" cy="12" r="2.2"/><circle cx="17.5" cy="17.5" r="2.2"/>',
    grid: '<rect x="4" y="4" width="6.6" height="6.6" rx="1.8"/><rect x="13.4" y="4" width="6.6" height="6.6" rx="1.8"/><rect x="4" y="13.4" width="6.6" height="6.6" rx="1.8"/><rect x="13.4" y="13.4" width="6.6" height="6.6" rx="1.8"/>',
    palette: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.3 0 1.9-.9 1.6-2-.4-1.4.6-2.6 2-2.6h1.4a3.5 3.5 0 0 0 3.5-3.5C20.5 7.3 16.7 3.5 12 3.5z"/><circle cx="7.6" cy="11" r="1.1"/><circle cx="10.5" cy="7.4" r="1.1"/><circle cx="15" cy="7.8" r="1.1"/>',
    sparkle: '<path d="M11 3.5l1.6 4.9 4.9 1.6-4.9 1.6L11 16.5l-1.6-4.9L4.5 10l4.9-1.6z"/><path d="M18 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
    image: '<rect x="3.5" y="5" width="17" height="14" rx="2.4"/><circle cx="9" cy="10" r="1.6"/><path d="M4 17l5-4.6 3.6 3.2 2.6-2.2L20 17"/>',
    bulb: '<path d="M9 17.5h6M9.8 20.5h4.4"/><path d="M12 3.5a5.8 5.8 0 0 0-3.4 10.5c.6.5 1 1.2 1 2V17h4.8v-1c0-.8.4-1.5 1-2A5.8 5.8 0 0 0 12 3.5z"/>',
    globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.3 3.6 5.2 3.6 8.5s-1.2 6.2-3.6 8.5c-2.4-2.3-3.6-5.2-3.6-8.5S9.6 5.8 12 3.5z"/>',
    quote: '<path d="M5 17.5c0-4.6 1.6-8 5.4-10M14 17.5c0-4.6 1.6-8 5.4-10"/><circle cx="7.2" cy="15.6" r="2.2"/><circle cx="16.2" cy="15.6" r="2.2"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.6v.2"/>',
    check: '<path d="M5 12.5l4.4 4.4L19 7.4"/>',
    chevron: '<path d="M9.5 5.5L16 12l-6.5 6.5"/>',
    updown: '<path d="M8 9.5l4-4 4 4M8 14.5l4 4 4-4"/>'
  };

  // Klasse "draw": Linien zeichnen sich beim Fokussieren; "spin": Zahnrad dreht sich langsam
  L.svg = function (name, cls) {
    var g = GLYPHS[name] || GLYPHS.hdmi, c = cls || (name === 'gear' ? 'spin' : 'draw');
    if (c === 'draw') g = g.replace(/<(path|rect|circle)\b/g, '<$1 pathLength="1"');
    return '<svg class="' + c + '" viewBox="0 0 24 24" aria-hidden="true">' + g + '</svg>';
  };

  // ------------------------------------------------------------------
  // Logo: gläserne Kachel, ein „L“ aus Licht und der Lichtpunkt, der es beleuchtet
  // ------------------------------------------------------------------
  L.logo = function (id, extra) {
    var p = 'lg' + (id || 'x');
    return '<svg class="logo ' + (extra || '') + '" viewBox="0 0 120 120" aria-hidden="true">' +
      '<defs>' +
      '<linearGradient id="' + p + 'T" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0" stop-color="#34405f"/><stop offset="1" stop-color="#0b0f1a"/></linearGradient>' +
      '<radialGradient id="' + p + 'H" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffffff" stop-opacity=".95"/><stop offset=".35" stop-color="#bfe3ff" stop-opacity=".55"/><stop offset="1" stop-color="#8a7dff" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="' + p + 'L" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#c9d4ff"/></linearGradient>' +
      '</defs>' +
      '<rect class="lg-tile" x="6" y="6" width="108" height="108" rx="32" fill="url(#' + p + 'T)"/>' +
      '<rect class="lg-edge" x="6.75" y="6.75" width="106.5" height="106.5" rx="31.25" pathLength="1" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="1.5"/>' +
      '<circle class="lg-halo" cx="82" cy="38" r="26" fill="url(#' + p + 'H)"/>' +
      '<path class="lg-l" d="M40 30v42a14 14 0 0 0 14 14h32" pathLength="1" fill="none" stroke="url(#' + p + 'L)" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle class="lg-dot" cx="82" cy="38" r="8.5" fill="#fff"/>' +
      '</svg>';
  };
})(window.Lumen = window.Lumen || {});
