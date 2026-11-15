/*
 * Lumen Leiste – Schnelleinstellungen (Einstellungen-Taste, go-settings).
 * Ersetzt LGs Seitenleiste mit denselben Funktionen im Lumen-Stil, links über dem Bild.
 *
 *   Oben:   Alle Einstellungen · KI (falls vorhanden) · Barrierefreiheit · Netzwerk | Anpassen
 *   Zuletzt geändert (Abkürzung)
 *   Kacheln: OLED-Helligkeit · Bildmodus · Augenschonend · Klangmodus · Audioausgabe ·
 *            Schlummerfunktion · Bildschirm aus · Multi View
 *
 *   Pfeile bewegen · OK: Regler bearbeiten / Liste öffnen / umschalten / ausführen
 *   Magic Remote: Zeigen wählt, Klicken löst aus; Helligkeit direkt am Regler ziehen,
 *   die Knöpfe an den Enden springen auf 0 % bzw. 100 %
 *   Zurück oder Einstellungen-Taste nochmal: schließen · 20 s ohne Taste: schließt sich
 *
 * Werte lesen und schreiben über den Einstellungsdienst von webOS (als root über den
 * Homebrew Channel): com.webos.settingsservice get/setSystemSettings, getSystemSettingDesc.
 */
(function () {
  'use strict';
  var KEY = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, OK: 13, BACK: 461, ESC: 27, BACKSPACE: 8 };
  var IDLE_MS = 20000;
  var SET = 'luna://com.webos.settingsservice/setSystemSettings';
  var GET = 'luna://com.webos.settingsservice/getSystemSettings';
  var DESC = 'luna://com.webos.settingsservice/getSystemSettingDesc';
  var q = function (s) { return Luna.shq(s); };

  var G = {
    gear: '<circle cx="12" cy="12" r="3.2"/><path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.6-2-3.4-2.4.9a7.7 7.7 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.4A7.7 7.7 0 0 0 7 6.4l-2.4-.9-2 3.4 2 1.6a7.6 7.6 0 0 0 0 3l-2 1.6 2 3.4 2.4-.9a7.7 7.7 0 0 0 2.6 1.5l.4 2.4h4l.4-2.4a7.7 7.7 0 0 0 2.6-1.5l2.4.9 2-3.4z"/>',
    ai: '<rect x="5" y="8" width="14" height="10" rx="4"/><path d="M12 4.5V8M9.5 12.5v1M14.5 12.5v1M3 12v2.5M21 12v2.5"/><circle cx="12" cy="3.6" r="1"/>',
    access: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="7.3" r="1.4"/><path d="M7.5 9.8 12 11l4.5-1.2M12 11v3.2l-2.2 4.3M12 14.2l2.2 4.3"/>',
    wifi: '<path d="M2.8 9.2a13 13 0 0 1 18.4 0M5.9 12.4a8.6 8.6 0 0 1 12.2 0M9 15.6a4.2 4.2 0 0 1 6 0"/><circle cx="12" cy="18.8" r="1.1"/>',
    pencil: '<path d="M15.5 4.5l4 4L9 19H5v-4z"/><path d="M13.5 6.5l4 4"/>',
    sunLow: '<circle cx="12" cy="12" r="3.2"/><path d="M12 5v1.2M12 17.8V19M5 12h1.2M17.8 12H19"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>',
    picture: '<rect x="3" y="5" width="18" height="12.5" rx="2.4"/><path d="M8.5 21h7M3.5 14l4.5-4 3.5 3 3-2.5 6 4.5"/>',
    eye: '<path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    sound: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
    output: '<rect x="6" y="3" width="12" height="18" rx="2.4"/><circle cx="12" cy="14.2" r="3.2"/><circle cx="12" cy="7.4" r="1"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    power: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 7.5v4.5M8.9 9.6a4.4 4.4 0 1 0 6.2 0"/>',
    multi: '<rect x="3" y="5" width="18" height="14" rx="2.4"/><path d="M12 5v14M5.5 12h4M14.5 12h4"/>',
    check: '<path d="M5 12.5l4.2 4.2L19 7"/>',
    hidden: '<path d="M3 3l18 18M10.6 6a9.8 9.8 0 0 1 1.4-.1c6 0 9.5 6.2 9.5 6.2a16 16 0 0 1-2.9 3.6M6.2 7.4A16 16 0 0 0 2.5 12S6 18.2 12 18.2c1.6 0 3-.4 4.2-1"/>'
  };

  // Anzeigenamen (wie im deutschen Menü); unbekannte Werte werden lesbar gemacht
  var PIC = {
    vivid: 'Lebhaft', standard: 'Standard', normal: 'Standard', eco: 'Auto-Stromsparen', cinema: 'Kino',
    cinemaBright: 'Kino (hell)', sports: 'Sport', game: 'Spiele-Optimierer', filmMaker: 'Filmmaker-Modus',
    expert1: 'Experte (heller Raum)', expert2: 'Experte (dunkler Raum)', photo: 'Foto', homeTheater: 'Heimkino',
    personalized: 'Personalisiert', aiPicture: 'KI-Bildmodus', isfBright: 'ISF heller Raum', isfDark: 'ISF dunkler Raum'
  };
  var SND = {
    standard: 'Standard', aiSoundPlus: 'KI-Sound Pro', aiSound: 'KI-Sound', movie: 'Kino', clearVoice: 'Klare Stimme',
    music: 'Musik', sports: 'Sport', game: 'Spiele-Optimierer', aiSoundPro: 'KI-Sound Pro'
  };
  var OUT = {
    tv_speaker: 'TV-Lautsprecher', external_optical: 'Optischer Ausgang', external_arc: 'HDMI (e)ARC',
    bt_soundbar: 'Bluetooth', headphone: 'Kopfhörer', lineout: 'Line-Out', tv_external_speaker: 'TV + Optisch',
    tv_speaker_headphone: 'TV + Kopfhörer', mobile_phone: 'Smartphone', external_speaker: 'Externer Lautsprecher'
  };
  var OUT_LIST = ['tv_speaker', 'external_arc', 'external_optical', 'bt_soundbar', 'headphone', 'tv_external_speaker'];
  var PIC_LIST = ['vivid', 'standard', 'eco', 'cinema', 'sports', 'game', 'filmMaker', 'expert1', 'expert2'];
  var SND_LIST = ['aiSoundPlus', 'standard', 'clearVoice', 'movie', 'music', 'sports', 'game'];

  function nice(map, v) {
    if (v == null || v === '') return '—';
    if (map[v]) return map[v];
    var m = String(v).match(/^(hdr|dolbyHdr|dolby|hlg)(.+)$/i);
    if (m) {
      var base = m[2].charAt(0).toLowerCase() + m[2].slice(1);
      var pre = /dolby/i.test(m[1]) ? 'Dolby Vision ' : (m[1].toLowerCase() === 'hlg' ? 'HLG ' : 'HDR ');
      return pre + (map[base] || base);
    }
    return String(v).replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, function (c) { return c.toUpperCase(); });
  }

  // Die Kacheln (gleiche Funktionen wie LGs Seitenleiste)
  var TILES = [
    { id: 'oled', kind: 'slider', label: 'OLED-Helligkeit', glyph: 'sun', cat: 'picture', key: 'backlight', min: 0, max: 100 },
    { id: 'picmode', kind: 'select', label: 'Bildmodus', glyph: 'picture', cat: 'picture', key: 'pictureMode', names: PIC, list: PIC_LIST },
    { id: 'eye', kind: 'toggle', label: 'Augenschonend', glyph: 'eye', cat: 'picture', key: 'eyeComfortMode' },
    { id: 'soundmode', kind: 'select', label: 'Klangmodus', glyph: 'sound', cat: 'sound', key: 'soundMode', names: SND, list: SND_LIST },
    { id: 'output', kind: 'select', label: 'Audioausgabe', glyph: 'output', cat: 'sound', key: 'soundOutput', names: OUT, list: OUT_LIST },
    { id: 'sleep', kind: 'native', label: 'Schlummerfunktion', glyph: 'moon' },
    { id: 'screenoff', kind: 'action', label: 'Bildschirm aus', glyph: 'power' },
    { id: 'multiview', kind: 'action', label: 'Multi View', glyph: 'multi', app: 'com.webos.app.multiview' }
  ];
  var TOP = [
    { id: 'all', label: 'Alle Einstellungen', glyph: 'gear', launch: { id: 'com.palm.app.settings' } },
    { id: 'ai', label: 'KI-Assistent', glyph: 'ai', apps: ['com.webos.app.aiconcierge', 'com.webos.app.ai-concierge', 'com.webos.app.aiservice'] },
    { id: 'access', label: 'Barrierefreiheit', glyph: 'access', launch: { id: 'com.palm.app.settings', params: { target: 'accessibility' } } },
    { id: 'net', label: 'Netzwerk', glyph: 'wifi', launch: { id: 'com.palm.app.settings', params: { target: 'network' } } },
    { id: 'edit', label: 'Anpassen', glyph: 'pencil', sep: true }
  ];

  var P = {
    el: null, values: {}, opts: {}, avail: {}, rows: [], focus: { r: 0, c: 0 }, editing: null, pop: null,
    custom: false, idle: null, hidden: loadHidden(), recent: loadRecent(), sendTimer: null, built: false
  };

  function loadHidden() { try { return JSON.parse(localStorage.getItem('leiste.hidden') || '[]'); } catch (e) { return []; } }
  function loadRecent() { try { return localStorage.getItem('leiste.recent') || ''; } catch (e) { return ''; } }
  function saveHidden() { try { localStorage.setItem('leiste.hidden', JSON.stringify(P.hidden)); } catch (e) { /* egal */ } }
  function noteRecent(id) { P.recent = id; try { localStorage.setItem('leiste.recent', id); } catch (e) { /* egal */ } }
  function svg(name) { return '<svg viewBox="0 0 24 24">' + (G[name] || '') + '</svg>'; }
  function tileById(id) { return TILES.filter(function (t) { return t.id === id; })[0]; }

  // ------------------------------------------------------------------
  // Werte lesen
  // ------------------------------------------------------------------
  function load() {
    if (!Luna.available()) {
      var d = window.LEISTE_DEMO_SETTINGS || {};
      P.values = d.values || { backlight: '13', pictureMode: 'expert1', eyeComfortMode: 'on', soundMode: 'game', soundOutput: 'external_optical' };
      P.opts = d.opts || {};
      P.avail = d.avail || { multiview: true, ai: 'com.webos.app.aiconcierge' };
      return Promise.resolve();
    }
    var calls = [
      [GET, { category: 'picture', keys: ['backlight', 'pictureMode', 'eyeComfortMode'] }],
      [GET, { category: 'sound', keys: ['soundMode', 'soundOutput'] }],
      [DESC, { category: 'picture', keys: ['pictureMode'] }],
      [DESC, { category: 'sound', keys: ['soundMode'] }],
      [GET, { category: 'time', keys: ['sleepTimer'] }],
      ['luna://com.webos.service.tv.systemproperty/getSystemInfo', { keys: ['modelName'] }]
    ];
    var appIds = ['com.webos.app.multiview'].concat(TOP[1].apps);
    var cmd = calls.map(function (c) {
      return 'luna-send -n 1 ' + c[0] + ' ' + q(JSON.stringify(c[1])) + ' 2>/dev/null; echo; echo @@';
    }).concat(appIds.map(function (id) {
      return 'luna-send -n 1 luna://com.webos.applicationManager/getAppInfo ' + q(JSON.stringify({ id: id })) + ' 2>/dev/null | grep -q folderPath && echo "app:' + id + '"';
    })).join('; ') + '; echo end';
    return Luna.exec(cmd).then(function (out) {
      var parts = String(out || '').split('@@');
      var j = parts.map(function (x) { try { return JSON.parse(x.trim()); } catch (e) { return null; } });
      var vals = {};
      [j[0], j[1], j[4]].forEach(function (r) {
        if (r && r.settings) Object.keys(r.settings).forEach(function (k) { vals[k] = r.settings[k]; });
      });
      P.values = vals;
      P.opts = {};
      var pm = descValues(j[2]), sm = descValues(j[3]);
      if (pm.length) P.opts.pictureMode = pm;
      if (sm.length) P.opts.soundMode = sm;
      // OLED-Fernseher regeln die Pixelhelligkeit, LCD-Fernseher die Hintergrundbeleuchtung
      var model = j[5] && j[5].modelName;
      if (model) tileById('oled').label = /^OLED/i.test(model) ? 'OLED-Helligkeit' : 'Helligkeit';
      var tail = parts[parts.length - 1] || '';
      P.avail = { multiview: tail.indexOf('app:com.webos.app.multiview') >= 0 };
      TOP[1].apps.forEach(function (id) { if (!P.avail.ai && tail.indexOf('app:' + id) >= 0) P.avail.ai = id; });
    }).catch(function () {});
  }

  // aus getSystemSettingDesc die sichtbaren, aktiven Werte holen
  function descValues(r) {
    var out = [];
    var res = r && (r.results || r.descs || []);
    (Array.isArray(res) ? res : []).forEach(function (x) {
      var v = x && x.values;
      var arr = (v && (v.arrayExt || v.array)) || [];
      arr.forEach(function (e) {
        if (typeof e === 'string') out.push(e);
        else if (e && e.value != null && e.visible !== false && e.active !== false) out.push(String(e.value));
      });
    });
    return out;
  }

  function optionsFor(t) {
    var list = P.opts[t.key] || t.list || [];
    var cur = P.values[t.key];
    if (cur != null && list.indexOf(cur) < 0) list = [cur].concat(list);
    return list;
  }

  // ------------------------------------------------------------------
  // Werte schreiben
  // ------------------------------------------------------------------
  function send(cmd) {
    if (!Luna.available()) { (window.__panelCmds = window.__panelCmds || []).push(cmd); return Promise.resolve(''); }
    return Luna.exec(cmd).catch(function () { return ''; });
  }
  function setSetting(cat, key, value) {
    var s = {}; s[key] = String(value);
    return send('luna-send -n 1 ' + SET + ' ' + q(JSON.stringify({ category: cat, settings: s })));
  }
  function setOutput(v) {
    // erst der Weg der LG-Fernbedienungs-API, sonst direkt in den Einstellungen
    var a = 'luna-send -n 1 luna://com.webos.service.apiadapter/audio/changeSoundOutput ' + q(JSON.stringify({ output: v }));
    var b = 'luna-send -n 1 ' + SET + ' ' + q(JSON.stringify({ category: 'sound', settings: { soundOutput: v } }));
    return send('o=$(' + a + ' 2>&1); echo "$o" | grep -q \'"returnValue":true\' || ' + b);
  }
  function launch(body) {
    return send('luna-send -n 1 luna://com.webos.applicationManager/launch ' + q(JSON.stringify(body)));
  }

  // ------------------------------------------------------------------
  // Aufbau
  // ------------------------------------------------------------------
  function build() {
    if (P.built) return;
    P.built = true;
    var n = document.createElement('div');
    n.id = 'panel';
    n.innerHTML = '<div class="p-head"><div class="p-title">Schnelleinstellungen</div><div class="p-sub"></div></div>' +
      '<div class="p-top"></div><div class="p-recent"></div><div class="p-grid"></div>';
    n.addEventListener('click', function (e) { if (P.pop && !e.target.closest('#p-pop')) closePop(); });
    document.body.appendChild(n);
    var pop = document.createElement('div');
    pop.id = 'p-pop';
    pop.hidden = true;
    document.body.appendChild(pop);
    P.el = n;
  }

  function visibleTiles() {
    return TILES.filter(function (t) {
      if (t.id === 'multiview' && !P.avail.multiview) return false;
      return P.custom || P.hidden.indexOf(t.id) < 0;
    });
  }

  function render() {
    var top = P.el.querySelector('.p-top'), grid = P.el.querySelector('.p-grid'), rec = P.el.querySelector('.p-recent');
    top.textContent = '';
    grid.textContent = '';
    rec.textContent = '';
    P.rows = [];

    var topRow = [];
    TOP.forEach(function (b) {
      if (b.id === 'ai' && !P.avail.ai) return;
      if (b.sep) { var s = document.createElement('i'); s.className = 'p-sep'; top.appendChild(s); }
      var e = document.createElement('div');
      e.className = 'p-ico' + (b.id === 'edit' && P.custom ? ' on' : '');
      e.innerHTML = svg(b.glyph) + '<span class="p-tip"></span>';
      e.querySelector('.p-tip').textContent = b.id === 'edit' && P.custom ? 'Fertig' : b.label;
      top.appendChild(e);
      topRow.push({ type: 'top', item: b, node: e });
    });
    P.rows.push(topRow);

    var rt = tileById(P.recent);
    if (rt && visibleTiles().indexOf(rt) >= 0 && !P.custom) {
      var r = document.createElement('div');
      r.className = 'p-rec';
      r.innerHTML = '<span class="p-rec-k">Zuletzt geändert</span><span class="p-rec-v"></span>';
      r.querySelector('.p-rec-v').textContent = rt.label;
      rec.appendChild(r);
      P.rows.push([{ type: 'recent', item: rt, node: r }]);
    }

    var tiles = visibleTiles(), row = null;
    tiles.forEach(function (t) {
      var wide = t.kind === 'slider';
      if (wide || !row || row.length >= 2 || row.wide) { row = []; row.wide = wide; P.rows.push(row); }
      var e = document.createElement('div');
      e.className = 'p-tile k-' + t.kind + (P.hidden.indexOf(t.id) >= 0 ? ' is-hidden' : '');
      e.innerHTML = '<div class="p-t-top">' + svg(t.glyph) + '<span class="p-label"></span>' +
        (wide ? '<span class="p-value"></span>' : '') + '</div>' +
        (wide ? '' : '<div class="p-value"></div>') + '<div class="p-extra"></div>' +
        (P.custom ? '<div class="p-vis">' + svg(P.hidden.indexOf(t.id) >= 0 ? 'hidden' : 'check') + '</div>' : '');
      e.querySelector('.p-label').textContent = t.label;
      if (wide) {
        e.querySelector('.p-extra').innerHTML = '<div class="p-slide"><button class="p-end p-min">' + svg('sunLow') + '<span>0</span></button>' +
          '<div class="p-bar"><i></i><b></b></div><button class="p-end p-max">' + svg('sun') + '<span>100</span></button></div>';
        bindSlider(t, e);
      }
      grid.appendChild(e);
      row.push({ type: 'tile', item: t, node: e });
      paintTile(t, e);
    });
    bindPointer();
    P.el.classList.toggle('custom', P.custom);
    clampFocus();
    paint();
  }

  function paintTile(t, e) {
    var v = P.values[t.key], val = e.querySelector('.p-value'), ex = e.querySelector('.p-extra');
    if (t.kind === 'slider') {
      var n = v == null || v === '' ? null : Math.round(+v);
      val.textContent = n == null ? '—' : String(n);
      var f = n == null ? 0 : (n - t.min) / (t.max - t.min) * 100;
      var fill = e.querySelector('.p-bar i'), knob = e.querySelector('.p-bar b');
      if (fill) fill.style.width = f + '%';
      if (knob) knob.style.left = f + '%';
      return;
    }
    ex.innerHTML = '';
    if (t.kind === 'select') {
      val.textContent = nice(t.names, v);
      val.classList.toggle('long', val.textContent.length > 15);
      var list = optionsFor(t), idx = list.indexOf(v);
      if (list.length > 1 && list.length <= 12) {
        ex.innerHTML = '<div class="p-dots">' + list.map(function (x, i) { return '<b' + (i === idx ? ' class="on"' : '') + '></b>'; }).join('') + '</div>';
      }
    } else if (t.kind === 'toggle') {
      var on = v === 'on' || v === true || v === 'true';
      val.textContent = v == null ? '—' : (on ? 'Ein' : 'Aus');
      ex.innerHTML = '<span class="p-switch' + (on ? ' on' : '') + '"><i></i></span>';
    } else if (t.kind === 'native') {
      var m = +P.values.sleepTimer;
      val.textContent = P.values.sleepTimer == null ? 'Einstellen' : (m > 0 ? m + ' Min.' : 'Aus');
    } else {
      val.textContent = '';
    }
  }

  function repaintTiles() {
    P.rows.forEach(function (row) {
      row.forEach(function (c) { if (c.type === 'tile') paintTile(c.item, c.node); });
    });
  }

  function clampFocus() {
    if (!P.rows.length) return;
    P.focus.r = Math.max(0, Math.min(P.focus.r, P.rows.length - 1));
    P.focus.c = Math.max(0, Math.min(P.focus.c, P.rows[P.focus.r].length - 1));
  }

  function cur() { var r = P.rows[P.focus.r]; return r && r[P.focus.c]; }

  function paint() {
    P.rows.forEach(function (row, r) {
      row.forEach(function (c, i) {
        c.node.classList.toggle('is-focused', r === P.focus.r && i === P.focus.c);
        c.node.classList.toggle('is-editing', !!(P.editing && P.editing === c.item && r === P.focus.r && i === P.focus.c));
      });
    });
  }

  // ------------------------------------------------------------------
  // Bedienung
  // ------------------------------------------------------------------
  function move(dr, dc) {
    if (dc) {
      var row = P.rows[P.focus.r];
      P.focus.c = Math.max(0, Math.min(row.length - 1, P.focus.c + dc));
    } else if (dr) {
      var from = P.rows[P.focus.r], to = P.rows[P.focus.r + dr];
      if (!to) return;
      // Spalte über die Lage auf dem Bildschirm übernehmen
      var x = from[P.focus.c].node.getBoundingClientRect();
      var mid = x.left + x.width / 2, best = 0, bd = 1e9;
      to.forEach(function (c, i) {
        var b = c.node.getBoundingClientRect(), d = Math.abs(b.left + b.width / 2 - mid);
        if (d < bd) { bd = d; best = i; }
      });
      P.focus.r += dr;
      P.focus.c = best;
    }
    paint();
  }

  function activate() {
    var c = cur();
    if (!c) return;
    if (c.type === 'top') return topAction(c.item);
    if (c.type === 'recent') return focusTile(c.item, true);
    var t = c.item;
    if (P.custom) {
      var i = P.hidden.indexOf(t.id);
      if (i >= 0) P.hidden.splice(i, 1); else P.hidden.push(t.id);
      saveHidden();
      render();
      return;
    }
    if (t.kind === 'slider') { P.editing = P.editing === t ? null : t; paint(); return; }
    if (t.kind === 'select') { openPop(t, c.node); return; }
    if (t.kind === 'toggle') {
      var on = P.values[t.key] === 'on';
      P.values[t.key] = on ? 'off' : 'on';
      setSetting(t.cat, t.key, P.values[t.key]);
      noteRecent(t.id);
      paintTile(t, c.node);
      return;
    }
    if (t.id === 'sleep') {
      launch({ id: 'com.webos.app.tvhotkey', params: { activateType: 'sleep' } });
      window.LeisteRouter.closeApp();
      return;
    }
    if (t.id === 'screenoff') {
      send('luna-send -n 1 luna://com.webos.service.tvpower/power/turnOffScreen \'{}\'');
      window.LeisteRouter.closeApp();
      return;
    }
    if (t.id === 'multiview') {
      launch({ id: t.app });
      window.LeisteRouter.closeApp();
    }
  }

  function focusTile(t, edit) {
    for (var r = 0; r < P.rows.length; r++) {
      for (var i = 0; i < P.rows[r].length; i++) {
        if (P.rows[r][i].type === 'tile' && P.rows[r][i].item === t) {
          P.focus = { r: r, c: i };
          if (edit && t.kind === 'slider') P.editing = t;
          paint();
          if (edit && t.kind === 'select') openPop(t, P.rows[r][i].node);
          return;
        }
      }
    }
  }

  function topAction(b) {
    if (b.id === 'edit') {
      P.custom = !P.custom;
      render();
      return;
    }
    if (b.id === 'ai') launch({ id: P.avail.ai });
    else launch(b.launch);
    window.LeisteRouter.closeApp();
  }

  function adjust(d) {
    var t = P.editing;
    setSlider(t, (Math.round(+P.values[t.key] || 0)) + d);
  }

  // Helligkeit setzen (Wert sofort zeigen, an den Fernseher höchstens alle 150 ms)
  function setSlider(t, v, now) {
    v = Math.max(t.min, Math.min(t.max, Math.round(v)));
    P.values[t.key] = String(v);
    var c = rowsCell(t);
    if (c) paintTile(t, c.node);
    noteRecent(t.id);
    if (now) { clearTimeout(P.sendTimer); P.sendTimer = null; setSetting(t.cat, t.key, P.values[t.key]); return; }
    if (!P.sendTimer) P.sendTimer = setTimeout(function () { P.sendTimer = null; setSetting(t.cat, t.key, P.values[t.key]); }, 150);
  }
  function rowsCell(t) {
    for (var r = 0; r < P.rows.length; r++) for (var i = 0; i < P.rows[r].length; i++) {
      if (P.rows[r][i].type === 'tile' && P.rows[r][i].item === t) return P.rows[r][i];
    }
    return null;
  }

  // Magic Remote: am Regler ziehen oder tippen, Knöpfe springen auf 0 bzw. 100
  function bindSlider(t, e) {
    var bar = e.querySelector('.p-bar');
    function at(ev) { var r = bar.getBoundingClientRect(); return t.min + (ev.clientX - r.left) / r.width * (t.max - t.min); }
    bar.addEventListener('pointerdown', function (ev) {
      if (P.custom) return;
      ev.preventDefault(); ev.stopPropagation();
      P.drag = t;
      try { bar.setPointerCapture(ev.pointerId); } catch (x) { /* ältere Engines */ }
      e.classList.add('dragging');
      setSlider(t, at(ev));
      bump();
    });
    bar.addEventListener('pointermove', function (ev) { if (P.drag === t) { setSlider(t, at(ev)); bump(); } });
    function end(ev) {
      if (P.drag !== t) return;
      P.drag = null;
      e.classList.remove('dragging');
      setSlider(t, at(ev), true);
    }
    bar.addEventListener('pointerup', end);
    bar.addEventListener('pointercancel', function () { P.drag = null; e.classList.remove('dragging'); });
    bar.addEventListener('click', function (ev) { ev.stopPropagation(); });
    e.querySelector('.p-min').addEventListener('click', function (ev) { ev.stopPropagation(); if (!P.custom) { setSlider(t, t.min, true); bump(); } });
    e.querySelector('.p-max').addEventListener('click', function (ev) { ev.stopPropagation(); if (!P.custom) { setSlider(t, t.max, true); bump(); } });
  }

  // Zeigen wählt aus, Klicken löst aus – wie in der Source-Leiste
  function bindPointer() {
    P.rows.forEach(function (row, r) {
      row.forEach(function (c, i) {
        c.node.addEventListener('mouseenter', function () {
          if (P.pop || P.drag) return;
          if (P.editing && P.editing !== c.item) P.editing = null;
          P.focus = { r: r, c: i };
          paint();
          bump();
        });
        c.node.addEventListener('click', function (ev) {
          ev.stopPropagation();   // sonst schließt der Klick die eben geöffnete Liste gleich wieder
          if (P.pop) { closePop(); return; }
          P.focus = { r: r, c: i };
          paint();
          bump();
          if (c.type === 'tile' && c.item.kind === 'slider' && !P.custom) return;   // Regler bedient man direkt
          activate();
        });
      });
    });
  }

  // Auswahlliste neben der Kachel (wie in Lumen)
  function openPop(t, node) {
    var list = optionsFor(t);
    if (!list.length) return;
    var pop = document.getElementById('p-pop');
    pop.innerHTML = '<div class="pp-title"></div><div class="pp-list"></div>';
    pop.querySelector('.pp-title').textContent = t.label;
    var box = pop.querySelector('.pp-list');
    list.forEach(function (v) {
      var e = document.createElement('div');
      e.className = 'pp-item' + (v === P.values[t.key] ? ' is-current' : '');
      e.innerHTML = '<span></span>' + svg('check');
      e.querySelector('span').textContent = nice(t.names, v);
      e.addEventListener('click', function (ev) { ev.stopPropagation(); P.pop.i = list.indexOf(v); pick(); });
      e.addEventListener('mouseenter', function () { if (P.pop) { P.pop.i = list.indexOf(v); paintPop(); bump(); } });
      box.appendChild(e);
    });
    var r = node.getBoundingClientRect();
    pop.hidden = false;
    pop.style.left = (P.el.getBoundingClientRect().right + 18) + 'px';
    var h = pop.offsetHeight;
    pop.style.top = Math.max(40, Math.min(1080 - 40 - h, r.top + r.height / 2 - h / 2)) + 'px';
    P.pop = { t: t, list: list, i: Math.max(0, list.indexOf(P.values[t.key])), node: node };
    paintPop();
  }
  function paintPop() {
    var items = document.querySelectorAll('#p-pop .pp-item');
    for (var i = 0; i < items.length; i++) items[i].classList.toggle('is-focused', i === P.pop.i);
    var f = items[P.pop.i];
    if (f && f.scrollIntoView) f.scrollIntoView({ block: 'nearest' });
  }
  function closePop() { document.getElementById('p-pop').hidden = true; P.pop = null; }
  function pick() {
    var p = P.pop, v = p.list[p.i], t = p.t;
    closePop();
    if (v === P.values[t.key]) return;
    P.values[t.key] = v;
    if (t.key === 'soundOutput') setOutput(v); else setSetting(t.cat, t.key, v);
    noteRecent(t.id);
    paintTile(t, p.node);
  }

  function bump() {
    clearTimeout(P.idle);
    P.idle = setTimeout(function () { window.LeisteRouter.closeApp(); }, IDLE_MS);
  }

  function key(e) {
    var k = e.keyCode;
    var known = [KEY.LEFT, KEY.UP, KEY.RIGHT, KEY.DOWN, KEY.OK, KEY.BACK, KEY.ESC, KEY.BACKSPACE];
    if (known.indexOf(k) < 0) return;
    e.preventDefault();
    bump();
    var back = k === KEY.BACK || k === KEY.ESC || k === KEY.BACKSPACE;
    if (P.pop) {
      if (k === KEY.UP) { P.pop.i = Math.max(0, P.pop.i - 1); paintPop(); }
      else if (k === KEY.DOWN) { P.pop.i = Math.min(P.pop.list.length - 1, P.pop.i + 1); paintPop(); }
      else if (k === KEY.OK) pick();
      else if (back || k === KEY.LEFT) closePop();
      return;
    }
    if (P.editing) {
      if (k === KEY.LEFT) adjust(-1);
      else if (k === KEY.RIGHT) adjust(1);
      else if (k === KEY.OK || back || k === KEY.UP || k === KEY.DOWN) { P.editing = null; paint(); if (k === KEY.UP || k === KEY.DOWN) move(k === KEY.UP ? -1 : 1, 0); }
      return;
    }
    if (back) {
      if (P.custom) { P.custom = false; render(); return; }
      window.LeisteRouter.closeApp();
      return;
    }
    if (k === KEY.LEFT) move(0, -1);
    else if (k === KEY.RIGHT) move(0, 1);
    else if (k === KEY.UP) move(-1, 0);
    else if (k === KEY.DOWN) move(1, 0);
    else if (k === KEY.OK) activate();
  }

  // ------------------------------------------------------------------
  // Öffnen / Schließen
  // ------------------------------------------------------------------
  function start(p) {
    build();
    P.editing = null;
    P.custom = false;
    closePop();
    var sub = P.el.querySelector('.p-sub');
    var now = new Date();
    sub.textContent = ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2);
    render();
    // Start auf der OLED-Helligkeit (wie im Original die erste Kachel)
    P.focus = { r: P.rows.length > 1 ? (P.rows[1][0].type === 'recent' ? 2 : 1) : 0, c: 0 };
    clampFocus();
    paint();
    document.body.classList.remove('panel-out');
    void document.body.offsetWidth;
    document.body.classList.add('panel-in');
    bump();
    load().then(function () {
      var keep = cur() && cur().item;
      render();
      if (keep) {
        for (var r = 0; r < P.rows.length; r++) for (var i = 0; i < P.rows[r].length; i++) {
          if (P.rows[r][i].item === keep) { P.focus = { r: r, c: i }; }
        }
        paint();
      }
    });
  }

  // Einstellungen-Taste nochmal: schließen (wie das Original)
  function relaunch() { window.LeisteRouter.closeApp(); }

  function hide() {
    clearTimeout(P.idle);
    closePop();
    document.body.classList.remove('panel-in');
    document.body.classList.add('panel-out');
  }

  window.LeistePanel = { start: start, relaunch: relaunch, key: key, hide: hide, state: function () { return P; }, nice: nice };
})();
