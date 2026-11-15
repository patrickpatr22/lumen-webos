/*
 * Lumen – Vorschaukarte: zeigt zur gewählten App den letzten Bildschirm (Screenshot,
 * den tvclean/go-home beim Verlassen per Home-Taste aufnimmt) als lebendige Karte.
 * Für HDMI-Eingänge kann die Karte das Live-Bild einbetten.
 *
 * Ablage: dauerhaft unter /var/lib/webosbrew/lumen/{shots,previews}, gespiegelt in den
 * App-Ordner (cache/…), weil die App Bilder nur von dort sicher laden kann.
 *   shots/<appId>.jpg     automatisch (Home-Taste)
 *   shots/<appId>.pin     festgehalten → wird nicht mehr überschrieben
 *   previews/<appId>.jpg  eigenes Bild (Web-Backend)
 *   tiles.json            pro App: {"content": auto|custom|shot|logo, "tag": "Video"}
 */
(function (L) {
  'use strict';
  var S = L.S, el = L.el, q = function (s) { return Luna.shq(s); };

  function appCache() { return L.selfDir() + '/cache'; }

  // ------------------------------------------------------------------
  // Bestand lesen (und nach einem Lumen-Update aus dem dauerhaften Ordner zurückholen).
  // Dazu die Einstellungen pro App (tiles.json, auch vom Web-Backend geschrieben).
  // ------------------------------------------------------------------
  function sync() {
    if (!Luna.available()) {
      if (window.LUMEN_DEMO_PREVIEWS) S.previews = parse(window.LUMEN_DEMO_PREVIEWS);
      if (window.LUMEN_DEMO_TILES) S.tiles = window.LUMEN_DEMO_TILES;
      if (L.bg) L.bg.fromSync(window.LUMEN_DEMO_BGS || [], window.LUMEN_DEMO_UI || null);
      return Promise.resolve(S.previews);
    }
    var A = appCache(), D = L.DATA_DIR;
    var cmd = [
      'mkdir -p ' + ['/shots', '/previews', '/backgrounds'].map(function (x) { return q(A + x) + ' ' + q(D + x); }).join(' '),
      'cd ' + q(D),
      'for f in shots/*.jpg previews/*.jpg previews/*.png backgrounds/*.jpg backgrounds/*.png; do [ -f "$f" ] || continue; [ ' + q(A) + '/"$f" -nt "$f" ] || cp -f "$f" ' + q(A) + '/"$f"; done',
      'for f in shots/*.jpg shots/*.pin previews/*.jpg previews/*.png backgrounds/*.jpg backgrounds/*.png; do [ -f "$f" ] && echo "$f $(stat -c %Y "$f" 2>/dev/null || date -r "$f" +%s 2>/dev/null)"; done',
      'echo @@tiles', 'cat tiles.json 2>/dev/null', 'echo', 'echo @@ui', 'cat ui.json 2>/dev/null', 'echo', 'echo end'
    ].join('; ');
    return Luna.exec(cmd).then(function (out) {
      out = String(out || '');
      var i = out.indexOf('@@tiles'), u = out.indexOf('@@ui');
      var list = i >= 0 ? out.slice(0, i) : out;
      S.previews = parse(list);
      S.tiles = parseTiles(i >= 0 ? out.slice(i + 7, u > i ? u : undefined).replace(/\n?end\s*$/, '') : '');
      var ui = null;
      if (u >= 0) { try { ui = JSON.parse(out.slice(u + 4).replace(/\n?end\s*$/, '').trim() || 'null'); } catch (e) { ui = null; } }
      if (L.bg) L.bg.fromSync(parseBgs(list), ui);
      return S.previews;
    }).catch(function () { return S.previews; });
  }

  // Liste "shots/<id>.jpg <Sekunden>" → { id: {shot:{src,t}, custom:{src,t}, pinned} }
  function parse(out) {
    if (out && typeof out === 'object') return out;      // Demo: schon fertig
    var map = {};
    String(out || '').split('\n').forEach(function (line) {
      var m = line.trim().match(/^(shots|previews)\/(.+)\.(jpg|png|pin) (\d+)$/);
      if (!m) return;
      var id = m[2], p = map[id] || (map[id] = {});
      if (m[3] === 'pin') { p.pinned = true; return; }
      var e = { src: 'cache/' + m[1] + '/' + encodeURIComponent(id) + '.' + m[3] + '?t=' + m[4], t: +m[4] * 1000 };
      if (m[1] === 'previews') p.custom = e; else p.shot = e;
    });
    return map;
  }

  // "backgrounds/<datei> <Sekunden>" → [{file, name, src, t}], neueste zuerst
  function parseBgs(out) {
    var list = [];
    String(out || '').split('\n').forEach(function (line) {
      var m = line.trim().match(/^backgrounds\/([A-Za-z0-9._ -]+\.(jpg|png)) (\d+)$/);
      if (m) list.push({ file: m[1], name: m[1].replace(/\.(jpg|png)$/, ''), t: +m[3] * 1000,
        src: 'cache/backgrounds/' + encodeURIComponent(m[1]) + '?t=' + m[3] });
    });
    return list.sort(function (a, b) { return b.t - a.t; });
  }

  function parseTiles(txt) {
    try {
      var j = JSON.parse(String(txt || '').trim() || '{}');
      return j && typeof j === 'object' && !Array.isArray(j) ? j : {};
    } catch (e) { return {}; }
  }

  // go-home hat gerade ein frisches Bild aufgenommen (Startparameter shot/t)
  function noteShot(id, t) {
    if (!id || !/^[\w.-]+$/.test(id)) return;
    var p = S.previews[id] || (S.previews[id] = {});
    p.shot = { src: 'cache/shots/' + encodeURIComponent(id) + '.jpg?t=' + (t || Date.now()), t: (+t || Date.now() / 1000) * 1000 };
  }

  // ------------------------------------------------------------------
  // Was zeigt die Karte?  Pro App einstellbar (Web-Backend oder OK lange drücken):
  //   auto    eigenes Bild, sonst letzter Bildschirm, sonst Symbol
  //   custom  eigenes Bild (fehlt es: Symbol)
  //   shot    letzter Bildschirm (fehlt er: Symbol)
  //   logo    immer das App-Symbol
  // ------------------------------------------------------------------
  var CONTENT_OPTS = [['auto', 'Automatisch'], ['custom', 'Eigenes Bild'], ['shot', 'Letzter Bildschirm'], ['logo', 'App-Symbol']];
  function contentOf(id) { var t = S.tiles[id]; return (t && t.content) || 'auto'; }

  function choose(item) {
    if (!item || item.kind !== 'app') return null;
    var p = S.previews[item.id] || {}, c = contentOf(item.id);
    if (c === 'logo') return null;
    if (c === 'custom') return p.custom || null;
    if (c === 'shot') return p.shot || null;
    if (L.prefs.preview.mode === 'icon') return p.custom || null;
    return p.custom || p.shot || null;
  }
  function shotFor(item) { return choose(item); }
  function keyFor(item) { var p = choose(item); return p ? p.src : ''; }

  // ------------------------------------------------------------------
  // Bilder vorab laden und dekodieren (bleiben im Speicher, solange Lumen läuft)
  // ------------------------------------------------------------------
  var imgs = {}, imgOrder = [];
  function imageFor(src) {
    var e = imgs[src];
    if (e) return e;
    var img = new Image();
    img.decoding = 'async';
    img.className = 'art-shot';
    img.alt = '';
    e = imgs[src] = { img: img, ok: null };
    e.ready = new Promise(function (res) {
      img.onload = function () {
        var d = img.decode ? img.decode() : Promise.resolve();
        d.then(function () { e.ok = true; res(true); }, function () { e.ok = true; res(true); });
      };
      img.onerror = function () { e.ok = false; res(false); };
    });
    img.src = src;
    imgOrder.push(src);
    if (imgOrder.length > 24) delete imgs[imgOrder.shift()];   // nicht unbegrenzt behalten
    return e;
  }

  // Promise: Karte kann jetzt ohne Auspacken gezeigt werden (spätestens nach maxWait ms)
  function prepare(item, maxWait) {
    var p = choose(item);
    if (!p) return Promise.resolve();
    var e = imageFor(p.src);
    if (e.ok !== null || !maxWait) return Promise.resolve();
    return Promise.race([e.ready, new Promise(function (res) { setTimeout(res, maxWait); })]);
  }

  // Nachbarn schon einmal laden, wenn gerade nichts los ist
  var preTimer = null;
  function preloadAround(items, col) {
    clearTimeout(preTimer);
    preTimer = setTimeout(function () {
      [1, -1, 2, -2].forEach(function (d) {
        var p = choose(items && items[col + d]);
        if (p) imageFor(p.src);
      });
    }, 900);
  }

  // ------------------------------------------------------------------
  // Karte füllen
  // ------------------------------------------------------------------
  function fill(item, crossfade) {
    var face = el.artFace;
    stopLive();
    if (crossfade && crossFill(item)) return;
    face.textContent = '';
    face.style.background = '';
    el.art.classList.remove('shot', 'live');
    var p = choose(item);
    if (p) {
      var e = imageFor(p.src);
      if (e.ok !== false) {
        el.art.classList.add('shot');
        face.appendChild(e.img);
        e.ready.then(function (ok) {
          if (ok || e.img.parentNode !== face) return;
          e.img.remove(); el.art.classList.remove('shot'); fillIcon(item);
        });
        return;
      }
    }
    fillIcon(item);
  }
  // Neues Bild über das alte legen und einblenden, danach das alte entfernen
  function crossFill(item) {
    var face = el.artFace, p = choose(item);
    var old = face.querySelector('img.art-shot');
    if (!p || !old) return false;
    var e = imageFor(p.src);
    if (e.ok === false) return false;
    if (e.img === old) return true;
    var img = e.img;
    img.className = 'art-shot xf';
    face.appendChild(img);
    void img.offsetWidth;
    img.classList.add('in');
    setTimeout(function () {
      if (old.parentNode === face && old !== img) face.removeChild(old);
      img.className = 'art-shot';
    }, 700);
    return true;
  }

  function fillIcon(item) {
    var face = el.artFace;
    if (item.kind === 'app') {
      L.home.paintFace(face, item);
      if (item.iconSrc) {
        var img = document.createElement('img');
        img.alt = '';
        img.className = 'art-icon';
        var c = S.colors[item.id];
        if (c && c.bg) img.classList.add('opaque');
        img.src = item.iconSrc;
        face.appendChild(img);
      } else {
        var l = document.createElement('div');
        l.className = 'art-letter';
        l.textContent = (item.title || '?').charAt(0).toUpperCase();
        face.appendChild(l);
      }
    } else {
      face.innerHTML = L.svg(item.glyph);
    }
  }

  // ------------------------------------------------------------------
  // HDMI live in der Karte (webOS bettet externe Eingänge als <video> ein)
  // ------------------------------------------------------------------
  var live = { wait: null, poll: null, video: null, id: '' };

  function onFocus(item) {
    clearTimeout(live.wait);
    if (!item || item.kind !== 'input' || !L.prefs.preview.live || !Luna.available()) return;
    if (live.id === item.id) return;
    // erst wenn die Auswahl einen Moment liegen bleibt (kein Umschalten beim Durchscrollen)
    live.wait = setTimeout(function () { startLive(item); }, 700);
  }

  function startLive(item) {
    stopLive();
    if (L.S.mode !== 'home' || document.hidden) return;
    var v = document.createElement('video');
    v.className = 'art-video';
    v.muted = true;
    v.setAttribute('muted', '');
    v.autoplay = true;
    var src = document.createElement('source');
    src.setAttribute('type', 'service/webos-external');
    src.setAttribute('src', 'ext://hdmi:' + item.n);
    v.appendChild(src);
    live.video = v;
    live.id = item.id;
    var shown = false;
    function show() {
      if (shown || live.video !== v) return;
      shown = true;
      clearInterval(live.poll);
      el.art.classList.add('live');
      el.artTilt.style.transform = '';
    }
    v.onloadeddata = v.oncanplay = v.onplaying = show;
    el.artFace.appendChild(v);
    try {
      v.load();
      var pr = v.play();
      if (pr && pr.catch) pr.catch(function () { /* bleibt beim Standbild/Symbol */ });
    } catch (e) { /* bleibt beim Standbild/Symbol */ }
    var n = 0;
    live.poll = setInterval(function () {
      if (v.readyState >= 2) show();
      if (shown || ++n > 16) clearInterval(live.poll);
    }, 250);
  }

  function stopLive() {
    clearTimeout(live.wait);
    clearInterval(live.poll);
    var v = live.video;
    live.video = null;
    live.id = '';
    el.art.classList.remove('live');
    if (!v) return;
    v.onloadeddata = v.oncanplay = v.onplaying = null;
    try { v.pause(); } catch (e) { /* ignorieren */ }
    while (v.firstChild) v.removeChild(v.firstChild);
    v.removeAttribute('src');
    try { v.load(); } catch (e) { /* ignorieren */ }
    if (v.parentNode) v.parentNode.removeChild(v);
  }

  // ------------------------------------------------------------------
  // Verwaltung
  // ------------------------------------------------------------------
  function exec(cmd) {
    if (!Luna.available()) return Promise.resolve('');
    return Luna.exec(cmd);
  }

  function setPinned(id, on) {
    var D = L.DATA_DIR + '/shots/' + id + '.pin';
    var p = S.previews[id] || (S.previews[id] = {});
    p.pinned = on;
    return exec('mkdir -p ' + q(L.DATA_DIR + '/shots') + '; ' + (on ? 'touch ' : 'rm -f ') + q(D) + '; echo ok');
  }

  // which: 'shot' | 'custom' | undefined (beides)
  function remove(id, which) {
    var p = S.previews[id], A = appCache(), D = L.DATA_DIR, files = [];
    if (which !== 'custom') { files.push('shots/' + id + '.jpg', 'shots/' + id + '.pin'); if (p) { delete p.shot; delete p.pinned; } }
    if (which !== 'shot') { files.push('previews/' + id + '.jpg', 'previews/' + id + '.png'); if (p) delete p.custom; }
    return exec(files.map(function (f) { return 'rm -f ' + q(D + '/' + f) + ' ' + q(A + '/' + f); }).join('; ') + '; echo ok');
  }

  function removeAll() {
    S.previews = {};
    var A = appCache(), D = L.DATA_DIR;
    return exec('rm -f ' + [D + '/shots', D + '/previews', A + '/shots', A + '/previews']
      .map(function (d) { return q(d) + '/*'; }).join(' ') + '; echo ok');
  }

  // Einstellung pro App ändern (gleiche Datei wie das Web-Backend)
  function setTile(id, patch) {
    var t = Object.assign({}, S.tiles[id] || {}, patch);
    Object.keys(t).forEach(function (k) { if (t[k] === '' || t[k] == null || (k === 'content' && t[k] === 'auto')) delete t[k]; });
    if (Object.keys(t).length) S.tiles[id] = t; else delete S.tiles[id];
    var D = L.DATA_DIR;
    return exec('mkdir -p ' + q(D) + '; printf %s ' + q(JSON.stringify(S.tiles)) + ' > ' + q(D + '/tiles.json.tmp') +
      ' && mv -f ' + q(D + '/tiles.json.tmp') + ' ' + q(D + '/tiles.json') + '; echo ok');
  }

  // Schalter für go-home: nur wenn die Datei existiert, nimmt die Home-Taste ein Bild auf
  function syncAutoshot() {
    var f = L.DATA_DIR + '/autoshot.on';
    return exec('mkdir -p ' + q(L.DATA_DIR) + '; ' +
      (L.prefs.preview.autoshot ? 'touch ' + q(f) : 'rm -f ' + q(f)) + '; echo ok').catch(function () {});
  }

  L.preview = {
    sync: sync, noteShot: noteShot, shotFor: shotFor, keyFor: keyFor, fill: fill, prepare: prepare,
    preloadAround: preloadAround, imageFor: imageFor, onFocus: onFocus, stopLive: stopLive,
    setPinned: setPinned, remove: remove, removeAll: removeAll, setTile: setTile, contentOf: contentOf,
    CONTENT_OPTS: CONTENT_OPTS, syncAutoshot: syncAutoshot, parse: parse
  };
})(window.Lumen);
