/*
 * Lumen Leiste – Source-Taste über dem laufenden Bild.
 *
 * Wird von tvclean/go-inputs gestartet, wenn in Lumen „Source-Taste: Leiste über dem Bild“
 * gewählt ist und gerade eine App oder ein HDMI-Eingang läuft. Die App hat den
 * Fenstertyp „overlay“: webOS legt sie über die laufende App, statt sie zu ersetzen.
 *
 * Inhalt: Eingänge | im Hintergrund offene Apps (+ „Andere schließen“) | Lumen
 *
 *   Links/Rechts  wählen          OK      wechseln (Eingang, App bzw. Lumen)
 *   Hoch          auf einer App: „Schließen“ wählen, OK schließt sie
 *   Zurück        schließen        Source  nächster Eintrag (erneuter Start → webOSRelaunch)
 *   10 s ohne Taste → schließt sich von selbst
 *
 * Startparameter: {"from":"<App, die gerade läuft>"}
 * Daten von Lumen: /var/lib/webosbrew/lumen/inputs.json (Eingänge), apps.json (Apps, Symbole)
 */
(function () {
  'use strict';
  var LUMEN_ID = 'de.lumenhome.launcher', SELF_ID = 'de.lumenhome.leiste';
  var DATA = '/var/lib/webosbrew/lumen';
  var KEY = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, OK: 13, BACK: 461, ESC: 27, BACKSPACE: 8 };
  var IDLE_MS = 10000;
  var GLYPHS = {
    monitor: '<rect x="3" y="4" width="18" height="12" rx="2.2"/><path d="M8.5 20h7M12 16v4"/>',
    gamepad: '<path d="M7.2 8h9.6a4 4 0 0 1 3.9 3.1l.9 4.2a2.3 2.3 0 0 1-3.9 2.1L16 15.6H8l-1.7 1.8a2.3 2.3 0 0 1-3.9-2.1l.9-4.2A4 4 0 0 1 7.2 8z"/><path d="M8.3 10.6v3.2M6.7 12.2h3.2"/>',
    hdmi: '<path d="M3.5 8.5h17v3.6l-2.2 3.4H5.7l-2.2-3.4z"/><path d="M7.5 11.6h9"/>',
    speaker: '<rect x="6" y="3" width="12" height="18" rx="2.4"/><circle cx="12" cy="14.2" r="3.2"/><circle cx="12" cy="7.4" r="1"/>',
    disc: '<circle cx="12" cy="12" r="8.8"/><circle cx="12" cy="12" r="2.4"/><path d="M12 5.6a6.4 6.4 0 0 1 6.4 6.4"/>',
    box: '<rect x="3.5" y="8.5" width="17" height="7.5" rx="2.2"/><path d="M8 19.5h8"/>',
    home: '<path d="M4 11.2 12 4.5l8 6.7V19a1.5 1.5 0 0 1-1.5 1.5h-4v-5.5h-5v5.5h-4A1.5 1.5 0 0 1 4 19z"/>',
    close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
    sweep: '<path d="M5 7h14M9 7V5h6v2M7 7l1 12h8l1-12M10.5 10.5v5M13.5 10.5v5"/>'
  };

  var st = {
    inputs: null, apps: [], running: [], catalog: {}, items: [], focus: 0, from: '', status: {},
    idle: null, nodes: [], closeSel: false, scroll: 0
  };
  var track = document.getElementById('bar-track'), viewport = document.getElementById('bar-viewport');
  var q = function (s) { return Luna.shq(s); };

  function selfDir() {
    try { return decodeURIComponent(location.pathname).replace(/\/[^/]*$/, ''); } catch (e) { return ''; }
  }
  function lumenDir() { return selfDir().replace(/\/[^/]*$/, '') + '/' + LUMEN_ID; }

  function params() {
    try {
      var p = window.PalmSystem && window.PalmSystem.launchParams;
      return (typeof p === 'string' ? JSON.parse(p || '{}') : p) || {};
    } catch (e) { return {}; }
  }

  function defaultInputs() {
    return [1, 2, 3, 4].map(function (n) {
      return { id: 'com.webos.app.hdmi' + n, n: n, title: 'HDMI ' + n, show: true, glyph: 'hdmi' };
    });
  }

  // ------------------------------------------------------------------
  // Einträge
  // ------------------------------------------------------------------
  function buildItems() {
    var list = (st.inputs || defaultInputs()).filter(function (x) { return x.show !== false; }).map(function (x) {
      return { kind: 'input', id: x.id, n: x.n, title: x.title, sub: x.title === 'HDMI ' + x.n ? 'Eingang' : 'HDMI ' + x.n,
        glyph: GLYPHS[x.glyph] ? x.glyph : 'hdmi' };
    });
    var apps = st.running.map(function (id) {
      var a = st.catalog[id] || { id: id, title: id };
      return { kind: 'app', id: id, title: a.title || id, sub: 'App', icon: a.icon || null, color: a.color || null };
    });
    list = list.concat(apps);
    var others = apps.filter(function (a) { return a.id !== st.from; });
    if (others.length >= 2) {
      list.push({ kind: 'closeall', id: '__closeall', title: apps.length > others.length ? 'Andere schließen' : 'Alle schließen',
        sub: others.length + ' Apps', glyph: 'sweep' });
    }
    return list;
  }

  function chip(it, i) {
    var n = document.createElement('div');
    var cur = it.id === st.from;
    n.className = 'chip k-' + it.kind + (cur ? ' current' : '');
    var lead;
    if (it.kind === 'app') {
      lead = '<div class="chip-app" style="' + (it.color ? 'background:' + it.color : '') + '">' +
        (it.icon ? '<img alt="" src="cache/' + encodeURIComponent(it.icon) + '">' : '') +
        '<span>' + escapeHtml((it.title || '?').charAt(0).toUpperCase()) + '</span></div>';
    } else {
      lead = '<svg viewBox="0 0 24 24">' + GLYPHS[it.glyph] + '</svg>';
    }
    n.innerHTML = lead + '<div class="chip-text"><div class="chip-title"></div><div class="chip-sub"></div></div>' +
      (it.kind === 'input' ? '<div class="chip-dot"></div>' : '') +
      (it.kind === 'app' ? '<div class="chip-x"><svg viewBox="0 0 24 24">' + GLYPHS.close + '</svg>Schließen</div>' : '');
    n.querySelector('.chip-title').textContent = it.title;
    n.querySelector('.chip-sub').textContent = cur ? 'läuft gerade' : (it.kind === 'app' ? 'im Hintergrund' : it.sub);
    var img = n.querySelector('.chip-app img');
    if (img) {
      img.onload = function () { n.classList.add('has-icon'); };
      img.onerror = function () { img.remove(); };
    }
    n.addEventListener('mouseenter', function () { st.focus = i; st.closeSel = false; paint(); bump(); });
    n.addEventListener('click', function (e) {
      st.focus = i;
      if (e.target.closest && e.target.closest('.chip-x')) { closeApp(it); return; }
      st.closeSel = false; paint(); choose();
    });
    return n;
  }

  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function render(keepId) {
    keepId = keepId || (st.items[st.focus] && st.items[st.focus].id);
    st.items = buildItems();
    track.textContent = '';
    var lastKind = '';
    st.nodes = st.items.map(function (it, i) {
      var group = it.kind === 'closeall' ? 'app' : it.kind;
      if (lastKind && group !== lastKind) {
        var sep = document.createElement('div');
        sep.className = 'chip-sep';
        track.appendChild(sep);
      }
      lastKind = group;
      var n = chip(it, i);
      track.appendChild(n);
      return n;
    });
    var k = keepId ? st.items.findIndex(function (x) { return x.id === keepId; }) : -1;
    st.focus = k >= 0 ? k : Math.min(st.focus, st.items.length - 1);
    paintStatus();
    paint();
  }

  function paint() {
    st.nodes.forEach(function (n, i) {
      n.classList.toggle('is-focused', i === st.focus);
      n.classList.toggle('x-sel', i === st.focus && st.closeSel);
    });
    keepVisible();
  }

  // Leiste zu breit? Dann so verschieben, dass die Auswahl ganz zu sehen ist
  function keepVisible() {
    var n = st.nodes[st.focus];
    if (!n || !viewport) return;
    var vw = viewport.clientWidth, tw = track.scrollWidth;
    if (tw <= vw + 1) { st.scroll = 0; track.style.transform = ''; return; }
    var l = n.offsetLeft, r = l + n.offsetWidth, m = 40;
    if (l - st.scroll < m) st.scroll = Math.max(0, l - m);
    else if (r - st.scroll > vw - m) st.scroll = Math.min(tw - vw, r - vw + m);
    track.style.transform = 'translateX(' + (-st.scroll) + 'px)';
  }

  function paintStatus() {
    st.items.forEach(function (it, i) {
      var d = st.nodes[i] && st.nodes[i].querySelector('.chip-dot');
      if (d) d.classList.toggle('on', st.status[it.id] === true);
    });
  }

  // Start: auf das, was gerade läuft (Source erneut → der nächste); sonst erster verbundener Eingang
  function initialFocus() {
    var i = st.items.findIndex(function (x) { return x.id === st.from; });
    if (i >= 0) return i;
    var c = st.items.findIndex(function (x) { return x.kind === 'input' && st.status[x.id] === true; });
    return c >= 0 ? c : 0;
  }

  function move(d) {
    st.closeSel = false;
    st.focus = (st.focus + d + st.items.length) % st.items.length;
    paint();
    bump();
  }

  function bump() {
    clearTimeout(st.idle);
    st.idle = setTimeout(close, IDLE_MS);
  }

  // ------------------------------------------------------------------
  // Aktionen
  // ------------------------------------------------------------------
  function lunaSend(uri, body) {
    if (!Luna.available()) return Promise.resolve();
    return Luna.call(uri, body).catch(function () {
      return Luna.exec('luna-send -n 1 ' + uri + ' ' + q(JSON.stringify(body)));
    }).catch(function () {});
  }
  function fgNote(id) {
    return /^[A-Za-z0-9._-]+$/.test(id || '') ? 'echo "$(date +%s) ' + id + '" >> ' + FG_LOG + ' 2>/dev/null' : 'true';
  }
  function launch(id, p) {
    if (Luna.available() && id !== LUMEN_ID) Luna.exec(fgNote(id)).catch(function () {});
    var body = { id: id };
    if (p) body.params = p;
    return lunaSend('luna://com.webos.applicationManager/launch', body);
  }
  // Schließen als root über den Homebrew Channel (eine Homebrew-App darf andere Apps sonst
  // nicht beenden). Danach nachsehen: läuft sie noch, zweiter Weg (close bzw. der neuere
  // Dienstname). Protokoll in /tmp/leiste-close.log zur Fehlersuche.
  function closeById(id) {
    if (!Luna.available()) return Promise.resolve();
    var j = q(JSON.stringify({ id: id })), L = '/tmp/leiste-close.log';
    var running = "luna-send -n 1 luna://com.webos.applicationManager/running '{}' 2>/dev/null | grep -q '\"id\": *\"" + id + "\"'";
    var cmd = [
      'echo "$(date +%T) schließe ' + id + '" >> ' + L,
      'luna-send -n 1 luna://com.webos.applicationManager/running \'{}\' >> ' + L + ' 2>&1',
      'luna-send -n 1 luna://com.webos.applicationManager/closeByAppId ' + j + ' >> ' + L + ' 2>&1',
      'sleep 1',
      'if ' + running + '; then echo "  läuft noch – zweiter Versuch" >> ' + L +
        '; luna-send -n 1 luna://com.webos.service.applicationmanager/closeByAppId ' + j + ' >> ' + L + ' 2>&1' +
        '; luna-send -n 1 luna://com.webos.applicationManager/close ' + j + ' >> ' + L + ' 2>&1; sleep 1; fi',
      'if ' + running + '; then echo still; echo "  läuft weiterhin" >> ' + L + '; else echo closed; fi'
    ].join('; ');
    return Luna.exec(cmd, 15000).catch(function () { return ''; });
  }

  function choose() {
    var it = st.items[st.focus];
    if (!it) return;
    if (it.kind === 'app' && st.closeSel) { closeApp(it); return; }
    if (it.kind === 'closeall') { closeOthers(); return; }
    if (it.kind === 'lumen') { launch(LUMEN_ID, { focus: 'apps' }); close(); return; }
    if (it.id === st.from) { close(); return; }        // läuft schon
    launch(it.id);
    close();
  }

  function forget(id) {
    st.running = st.running.filter(function (x) { return x !== id; });
  }

  function closeApp(it) {
    var wasCurrent = it.id === st.from;
    keepClosed(it.id);
    closeById(it.id);
    var node = st.nodes[st.items.indexOf(it)];
    if (node) node.classList.add('gone');
    forget(it.id);
    st.closeSel = false;
    bump();
    if (wasCurrent) {
      // die App hinter der Leiste ist weg → Lumen öffnen
      launch(LUMEN_ID, { focus: 'apps' });
      close();
      return;
    }
    setTimeout(function () {
      var next = st.items[st.focus + 1] && st.items[st.focus + 1].kind === 'app' ? st.items[st.focus + 1].id
        : (st.items[st.focus - 1] && st.items[st.focus - 1].id);
      render(next);
    }, 220);
  }

  function closeOthers() {
    var ids = st.running.filter(function (id) { return id !== st.from; });
    ids.forEach(function (id, k) {
      keepClosed(id);
      setTimeout(function () { closeById(id); }, k * 120);
    });
    st.nodes.forEach(function (n, i) {
      var it = st.items[i];
      if ((it.kind === 'app' && it.id !== st.from) || it.kind === 'closeall') n.classList.add('gone');
    });
    st.running = st.running.filter(function (id) { return id === st.from; });
    bump();
    setTimeout(function () { render(st.from || LUMEN_ID); }, 240);
  }

  function close() { window.LeisteRouter.closeApp(); }

  function show() {
    document.body.classList.remove('bar-out');
    void document.body.offsetWidth;
    document.body.classList.add('bar-in');
    bump();
  }
  function hide() {
    clearTimeout(st.idle);
    document.body.classList.remove('bar-in');
    document.body.classList.add('bar-out');
  }

  function onKey(e) {
    var k = e.keyCode, it = st.items[st.focus];
    if (k === KEY.LEFT) { e.preventDefault(); move(-1); }
    else if (k === KEY.RIGHT) { e.preventDefault(); move(1); }
    else if (k === KEY.UP) { e.preventDefault(); if (it && it.kind === 'app') { st.closeSel = true; paint(); bump(); } }
    else if (k === KEY.DOWN) { e.preventDefault(); if (st.closeSel) { st.closeSel = false; paint(); bump(); } }
    else if (k === KEY.OK) { e.preventDefault(); choose(); }
    else if (k === KEY.BACK || k === KEY.ESC || k === KEY.BACKSPACE) {
      e.preventDefault();
      if (st.closeSel) { st.closeSel = false; paint(); bump(); } else close();
    }
  }

  // Source erneut gedrückt (go-inputs startet die Leiste nochmal): nächster Eintrag
  function onRelaunch(p) {
    if (p && p.from) st.from = p.from;
    move(1);
  }

  // ------------------------------------------------------------------
  // Daten
  // ------------------------------------------------------------------
  // Ist am Anschluss wirklich ein Gerät? Gleiche Regel wie in Lumen: das erste Feld, das
  // die Firmware liefert, entscheidet (hdmiPlugIn hat Vorrang vor „connected“, das bei
  // manchen Firmwares nur die Verbindung zum Eingangsdienst meint).
  function plugState(d) {
    var keys = ['hdmiPlugIn', 'plugged', 'isPlugged', 'signalDetected', 'connected'];
    for (var i = 0; i < keys.length; i++) {
      var v = d[keys[i]];
      if (v === true || v === 'true') return true;
      if (v === false || v === 'false') return false;
    }
    return null;
  }

  function loadShared() {
    if (!Luna.available()) {
      return Promise.resolve({ inputs: window.LEISTE_DEMO_INPUTS || null, apps: window.LEISTE_DEMO_APPS || [] });
    }
    var S = selfDir(), Ld = lumenDir();
    var cmd = [
      'cat ' + q(DATA + '/inputs.json') + ' 2>/dev/null', 'echo', 'echo @@',
      'cat ' + q(DATA + '/apps.json') + ' 2>/dev/null', 'echo', 'echo @@',
      // Verlauf der Vordergrund-Apps (schreibt der Home-Wächter von tvclean); die App hinter
      // der Leiste trägt die Leiste selbst ein, falls der Wächter gerade nicht läuft
      fgNote(st.from),
      'tail -n 400 ' + FG_LOG + ' 2>/dev/null', 'echo @@',
      // App-Symbole aus Lumens Zwischenspeicher übernehmen (nur fehlende)
      'mkdir -p ' + q(S + '/cache'),
      'for f in ' + q(Ld + '/cache') + '/*.png ' + q(Ld + '/cache') + '/*.jpg; do [ -f "$f" ] || continue; b=${f##*/}; [ -f ' +
        q(S + '/cache') + '/"$b" ] || cp -f "$f" ' + q(S + '/cache') + '/ 2>/dev/null; done',
      'echo ok'
    ].join('; ');
    return Luna.exec(cmd).then(function (out) {
      var parts = String(out || '').split('@@');
      var inputs = null, apps = [];
      try { var j = JSON.parse((parts[0] || '').trim() || 'null'); if (Array.isArray(j) && j.length) inputs = j; } catch (e) { /* Standard */ }
      try { var a = JSON.parse((parts[1] || '').trim() || 'null'); if (Array.isArray(a)) apps = a; } catch (e) { /* leer */ }
      return { inputs: inputs, apps: apps, fg: parts.length > 3 ? parseFg(parts[2]) : null };
    }).catch(function () { return { inputs: null, apps: [] }; });
  }

  // "<Sekunden> <App-ID>" je Zeile → { id: letzter Zeitpunkt im Vordergrund (ms) }; null = kein Verlauf
  var FG_LOG = '/tmp/tvclean-foreground.log';
  function parseFg(txt) {
    var map = {}, n = 0;
    String(txt || '').split('\n').forEach(function (line) {
      var m = line.trim().match(/^(\d{9,11}) ([A-Za-z0-9._-]+)$/);
      if (m) { map[m[2]] = Math.max(map[m[2]] || 0, +m[1] * 1000); n++; }
    });
    return n ? map : null;
  }

  function loadStatus() {
    if (!Luna.available()) return Promise.resolve(window.LEISTE_DEMO_STATUS || {});
    return Luna.call('luna://com.webos.service.eim/getAllInputStatus', {}, 3000).then(function (r) {
      var map = {};
      (r.devices || r.inputs || []).forEach(function (d) {
        var id = d.appId || d.id;
        if (id) map[id] = plugState(d) === true;
      });
      return map;
    }).catch(function () { return {}; });
  }

  // Welche Apps sind gerade offen? (Application Manager „running“)
  function loadRunning() {
    if (!Luna.available()) return Promise.resolve(window.LEISTE_DEMO_RUNNING || []);
    return Luna.call('luna://com.webos.applicationManager/running', {}, 3000)
      .catch(function () {
        return Luna.exec("luna-send -n 1 luna://com.webos.applicationManager/running '{}'").then(function (o) { return JSON.parse(o); });
      })
      // nur vorgeladene Apps (webOS hält YouTube, Netflix … für einen schnellen Start bereit) zählen nicht
      .then(function (r) {
        return (r && r.running || []).filter(function (x) { return x && !preloaded(x); })
          .map(function (x) { return x.id || x.appId; }).filter(Boolean);
      })
      .catch(function () { return []; });
  }

  function preloaded(x) {
    var keys = ['preload', 'preloadMode', 'preloaded', 'isPreloaded'];
    for (var i = 0; i < keys.length; i++) {
      var v = x[keys[i]];
      if (v === true || (typeof v === 'string' && v && v !== 'none' && v !== 'false')) return true;
    }
    return false;
  }

  // Nur echte Apps aus Lumens App-Liste (keine Systemdienste, keine Eingänge, nicht Lumen/Leiste)
  // webOS hält manche Apps (YouTube, Netflix, LG Channels …) vorgeladen im Speicher, auch wenn du
  // sie nie geöffnet oder längst geschlossen hast – „running“ meldet sie trotzdem. Deshalb zählt
  // eine App nur als offen, wenn sie seit dem Einschalten wirklich vorne lief (Verlauf vom
  // Home-Wächter) und seitdem nicht über die Leiste geschlossen wurde. Ohne Verlauf (tvclean
  // fehlt) gilt nur das Merken beim Schließen.
  var CLOSED_KEY = 'leiste.closed';
  function closedMap() {
    try { var m = JSON.parse(localStorage.getItem(CLOSED_KEY) || '{}'); return m && typeof m === 'object' ? m : {}; } catch (e) { return {}; }
  }
  function saveClosed(m) { try { localStorage.setItem(CLOSED_KEY, JSON.stringify(m)); } catch (e) { /* egal */ } }
  function keepClosed(id) { var m = closedMap(); m[id] = Date.now(); saveClosed(m); }

  function filterRunning(ids) {
    var seen = {}, out = [], closed = closedMap(), dirty = false, fg = st.fg;
    if (st.from && closed[st.from]) { delete closed[st.from]; dirty = true; }   // läuft wieder vorne → wieder offen
    if (fg) for (var c in closed) if (fg[c] && fg[c] > closed[c]) { delete closed[c]; dirty = true; }   // seitdem wieder geöffnet
    // aufräumen: mit Verlauf fallen Einträge weg, deren App seit dem Einschalten nie vorne war
    // (Verlauf neu → App gilt ohnehin als zu); ohne Verlauf erst nach einer Woche – webOS lädt
    // geschlossene Apps oft nach Sekunden wieder vor, „nicht mehr laufend“ heißt also nichts
    var week = Date.now() - 7 * 24 * 3600e3;
    for (var k in closed) {
      if (fg ? !fg[k] : closed[k] < week) { delete closed[k]; dirty = true; }
    }
    if (dirty) saveClosed(closed);
    ids.forEach(function (id) {
      if (seen[id] || id === SELF_ID || id === LUMEN_ID || /^com\.webos\.app\.hdmi\d$/.test(id)) return;
      if (!st.catalog[id] || closed[id]) return;
      if (fg && !fg[id] && id !== st.from) return;   // nie selbst geöffnet → nur vorgeladen
      seen[id] = true;
      out.push(id);
    });
    // die App hinter der Leiste zuerst
    var i = out.indexOf(st.from);
    if (i > 0) { out.splice(i, 1); out.unshift(st.from); }
    return out;
  }

  var runningRaw = [];
  function refresh() {
    return Promise.all([loadShared(), loadRunning(), loadStatus()]).then(function (r) {
      if (r[0].inputs) st.inputs = r[0].inputs;
      st.catalog = {};
      (r[0].apps || []).forEach(function (a) { if (a && a.id) st.catalog[a.id] = a; });
      st.fg = r[0].fg || null;
      runningRaw = r[1];
      st.running = filterRunning(runningRaw);
      st.status = r[2];
      var keep = st.items[st.focus] && st.items[st.focus].id;
      var first = !st.loaded;
      st.loaded = true;
      render(keep);
      if (first) { st.focus = initialFocus(); paint(); }
    });
  }

  function start(p) {
    st.from = (p && p.from) || '';
    st.loaded = false;
    st.closeSel = false;
    render();
    st.focus = initialFocus();
    paint();
    requestAnimationFrame(show);
    refresh();
  }

  window.LeisteBar = { start: start, relaunch: onRelaunch, key: onKey, hide: hide,
    state: function () { return st; }, plugState: plugState };
  window.Leiste = window.LeisteBar;
})();
