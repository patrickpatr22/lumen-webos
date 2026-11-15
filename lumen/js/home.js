/*
 * Lumen – Startseite: Reihen, Fokus, Scrollen, Titel, Vorschaukarte, Hintergrundlicht,
 * Magic-Remote-Effekte (Licht, kippende Karte, Kacheln richten sich zum Zeiger aus).
 */
(function (L) {
  'use strict';
  var S = L.S, el = L.el, clamp = L.clamp;

  // ------------------------------------------------------------------
  // Kacheln
  // ------------------------------------------------------------------
  function makeAppTile(item, col) {
    var t = document.createElement('div');
    t.className = 'tile';
    t.dataset.row = '0';
    t.dataset.col = String(col);
    t.style.setProperty('--i', String(Math.min(col, 8)));
    t.innerHTML = '<div class="tile-glow"></div><div class="tile-mag"><div class="tile-face">' +
      '<img class="tile-icon" alt="" decoding="async">' +
      '<div class="tile-gloss"></div><div class="tile-ring"></div></div></div>' +
      '<div class="tile-label"></div>';
    t.querySelector('.tile-label').textContent = item.title;
    var face = t.querySelector('.tile-face');
    var img = t.querySelector('.tile-icon');
    paintFace(face, item, t);
    if (item.iconSrc) {
      img.onload = function () {
        if (!S.colors[item.id]) {
          var sampled = L.sampleColors(img);
          if (sampled) { S.colors[item.id] = sampled; L.data.saveCache(); }
        }
        paintFace(face, item, t);
        var c = S.colors[item.id];
        if (c && c.bg) img.classList.add('opaque');
        img.classList.add('ready');
        if (currentItem() === item) {
          setAmbient(L.itemAccent(item));
          updateArt(item, true);
        }
      };
      img.onerror = function () {
        img.remove();
        face.insertBefore(letterNode(item.title), face.firstChild);
        // Zwischengespeichertes Symbol fehlt (z. B. nach einem Update) → einmal neu kopieren
        if (!S.repairTried && Luna.available()) {
          S.repairTried = true;
          S.iconsStale = true;
          setTimeout(function () { L.data.refresh(false, true); }, 1500);
        }
      };
      img.src = item.iconSrc;
    } else {
      img.remove();
      face.insertBefore(letterNode(item.title), face.firstChild);
    }
    bindPointer(t);
    return t;
  }

  function letterNode(title) {
    var s = document.createElement('div');
    s.className = 'tile-letter';
    s.textContent = (title || '?').trim().charAt(0).toUpperCase();
    return s;
  }

  function paintFace(face, item, tile) {
    var c = S.colors[item.id];
    var base = (c && c.accent) || item.color || L.hashColor(item.id);
    if (tile) tile.style.setProperty('--tc', L.ambientOf(base).map(Math.round).join(','));
    if (c && c.bg) {
      face.style.background = L.css(c.bg);          // nahtlos zum Symbol
      return;
    }
    face.style.background = 'linear-gradient(150deg,' + L.css(L.mix(base, [0, 0, 0], 0.12)) + ',' +
      L.css(L.mix(base, [0, 0, 0], 0.58)) + ')';
  }

  function makeChip(item, col, idx) {
    var t = document.createElement('div');
    t.className = 'chip';
    t.dataset.row = '1';
    t.dataset.col = String(col);
    t.style.setProperty('--i', String(Math.min(idx, 8)));
    t.innerHTML = L.svg(item.glyph) + '<div class="chip-text"><div class="chip-title"></div>' +
      '<div class="chip-sub"></div></div>' +
      (item.kind === 'input' ? '<div class="chip-dot' + (item.connected === true ? ' on' : '') + '"></div>' : '');
    t.querySelector('.chip-title').textContent = item.title;
    t.querySelector('.chip-sub').textContent = item.sub;
    bindPointer(t);
    return t;
  }

  function renderRows() {
    var apps = S.rows[0].items, track = el.tracks[0];
    track.textContent = '';
    if (!S.loaded && !apps.length) {
      for (var i = 0; i < 6; i++) {
        var sk = document.createElement('div');
        sk.className = 'tile skeleton';
        sk.style.setProperty('--i', String(i));
        sk.innerHTML = '<div class="tile-mag"><div class="tile-face"></div></div>';
        track.appendChild(sk);
      }
    } else {
      apps.forEach(function (a, k) { track.appendChild(makeAppTile(a, k)); });
    }
    var t2 = el.tracks[1], sepDone = false, idx = 0;
    t2.textContent = '';
    S.rows[1].items.forEach(function (it, k) {
      // Trennstrich zwischen Eingängen und Einstellungen; er schiebt die Aktionen nach rechts
      if (it.kind === 'action' && !sepDone) {
        sepDone = true;
        var sep = document.createElement('div');
        sep.className = 'chip-sep';
        sep.style.setProperty('--i', String(Math.min(idx++, 8)));
        t2.appendChild(sep);
      }
      t2.appendChild(makeChip(it, k, idx++));
    });
    S.nodes = [
      Array.prototype.slice.call(track.querySelectorAll('[data-col]')),
      Array.prototype.slice.call(t2.querySelectorAll('[data-col]'))
    ];
    S.focusedEl = null;
    magReset(true);
    measure();
  }

  // Positionen einmal pro Neuaufbau messen statt bei jedem Tastendruck
  function measure() {
    S.geo = [0, 1].map(function (r) {
      var vp = el.viewports[r], cs = getComputedStyle(vp);
      var padL = parseFloat(cs.paddingLeft) || 0, padR = parseFloat(cs.paddingRight) || 0;
      var items = S.nodes[r].map(function (n) { return { x: n.offsetLeft, w: n.offsetWidth, h: n.offsetHeight }; });
      var cw = vp.clientWidth - padL - padR;
      var step = items.length > 1 ? items[1].x - items[0].x : (items[0] ? items[0].w : 0);
      var gap = items.length > 1 ? step - items[0].w : 0;
      var rect = vp.getBoundingClientRect();
      return {
        cw: cw,
        left: rect.left + padL,
        top: rect.top + (parseFloat(cs.paddingTop) || 0),
        trackW: el.tracks[r].scrollWidth,
        items: items,
        step: step,
        per: step > 0 ? Math.max(1, Math.floor((cw + gap + 1) / step)) : 1
      };
    });
  }

  function tileEl(row, col) { return S.nodes[row] ? S.nodes[row][col] : null; }
  function currentItem() {
    var r = S.rows[S.focus.row];
    return r ? r.items[S.focus.col] : null;
  }
  function clampFocus() {
    if (!S.rows[S.focus.row] || !S.rows[S.focus.row].items.length) {
      S.focus.row = S.rows[0].items.length ? 0 : 1;
    }
    var n = S.rows[S.focus.row].items.length;
    S.focus.col = clamp(S.focus.col, 0, Math.max(0, n - 1));
  }

  // Ablauf pro Tastendruck – bewusst auf mehrere Bilder verteilt, damit nie alles in
  // einem einzigen Bild passiert (das war auf dem Fernseher als Ruckeln sichtbar):
  //   sofort        Kachel wird ausgewählt, Reihe scrollt (nur fertige Ebenen bewegen)
  //   nächstes Bild Titel und Eigenschaft
  //   nach kurzer Ruhe (DWELL) Vorschaukarte (Bild ist dann schon dekodiert), Hintergrundfarbe, LEDs
  // Bei gehaltener Taste passiert bis zum Stillstand nur der erste Schritt.
  var DWELL = 150;
  var lastMoveAt = 0, decorTimer = null, heroRaf = 0, heroTimer = null;
  // dir: +1 = von links gekommen, -1 = von rechts (Kippen bei „Kachel-Auswahl: Kippen“)
  function applyFocus(instant, dir) {
    clampFocus();
    var t = tileEl(S.focus.row, S.focus.col);
    var now = Date.now(), rapid = !instant && now - lastMoveAt < 170;
    lastMoveAt = now;
    if (S.focusedEl && S.focusedEl !== t) S.focusedEl.classList.remove('is-focused', 'lit', 'from-l', 'from-r');
    if (t) {
      if (t !== S.focusedEl) {
        t.classList.remove('lit', 'from-l', 'from-r');
        if (!rapid) t.classList.add(dir < 0 ? 'from-r' : 'from-l');
      }
      t.classList.add('is-focused');
    }
    S.focusedEl = t;
    scrollRow(S.focus.row, instant);
    clearTimeout(decorTimer);
    clearTimeout(heroTimer);
    cancelAnimationFrame(heroRaf);
    if (instant) { decorate(true); return; }
    if (rapid) {
      if (L.wled) L.wled.cancel();
      if (L.preview) L.preview.stopLive();
      decorTimer = setTimeout(function () { decorate(false); }, 190);
      return;
    }
    heroRaf = requestAnimationFrame(function () { heroTimer = setTimeout(updateHero, 0); });
    decorTimer = setTimeout(function () { decorate(false); }, DWELL);
  }

  function decorate(instant) {
    updateHero();
    var item = currentItem();
    updateArt(item, false, instant);
    S.accent = item && item.kind === 'app' ? L.itemAccent(item) : null;
    setAmbient(S.accent);
    if (S.focusedEl && S.focus.row === 0) S.focusedEl.classList.add('lit');
    if (L.preview) L.preview.onFocus(item);
  }

  // ------------------------------------------------------------------
  // Vorschaukarte rechts (Inhalt baut preview.js)
  // ------------------------------------------------------------------
  var artKey = '', artFlip = false, artToken = 0;
  // Erst wenn das Bild fertig dekodiert ist, wird es eingesetzt und die Karte fliegt ein –
  // so muss der Fernseher während der Animation nichts mehr auspacken.
  // soft: nur das Bild weich überblenden (z. B. frisches Bildschirmfoto nach der Rückkehr)
  function updateArt(item, force, instant, soft) {
    var key = item ? item.kind + ':' + item.id + ':' + item.title + ':' + L.preview.keyFor(item) : '';
    if (key === artKey && !force) return;
    var changed = key !== artKey;
    artKey = key;
    var token = ++artToken;
    if (!item) { el.art.style.visibility = 'hidden'; return; }
    L.preview.prepare(item, instant ? 0 : (soft ? 1500 : 260)).then(function () {
      if (token !== artToken) return;            // inzwischen weitergeblättert
      el.art.style.visibility = '';
      L.preview.fill(item, soft && changed);
      if (changed && !soft) replayArt();
      L.preview.preloadAround(S.rows[S.focus.row].items, S.focus.col);
    });
  }
  function replayArt() {
    artFlip = !artFlip;
    el.art.classList.remove(artFlip ? 'swap-b' : 'swap-a');
    el.art.classList.add(artFlip ? 'swap-a' : 'swap-b');
  }

  function scrollRow(r, instant) {
    var g = S.geo && S.geo[r], track = el.tracks[r];
    var it = g && g.items[S.focus.col];
    if (!it) return;
    var cur = S.scroll[r] || 0;
    if (r === 0 && g.step > 0) {
      // App-Reihe rastet auf ganze Kacheln: links und rechts ist nie eine Kachel angeschnitten
      var first = Math.round(cur / g.step), col = S.focus.col;
      if (col < first) first = col;
      else if (col > first + g.per - 1) first = col - g.per + 1;
      first = clamp(first, 0, Math.max(0, g.items.length - g.per));
      cur = first * g.step;
    } else {
      var margin = 40;
      if (it.x - cur < margin) cur = it.x - margin;
      else if (it.x + it.w - cur > g.cw - margin) cur = it.x + it.w - g.cw + margin;
      cur = clamp(cur, 0, Math.max(0, g.trackW - g.cw));
    }
    if (cur === S.scroll[r] && !instant) return;
    S.scroll[r] = cur;
    if (instant) {
      track.classList.add('instant');
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { track.classList.remove('instant'); });
      });
    }
    track.style.transform = 'translateX(' + (-cur) + 'px)';
    magReset(false);
  }

  // ------------------------------------------------------------------
  // Titel links (passt die Schriftgröße an, damit lange Namen nicht abgeschnitten werden)
  // ------------------------------------------------------------------
  var heroFlip = false;
  function updateHero() {
    var it = currentItem();
    var k = '', t = '';
    if (!it) {
      k = ''; t = S.loaded ? 'Keine Apps' : 'Wird geladen …';
    } else {
      t = it.kind === 'action' ? (it.id === 'settings' ? 'Einstellungen' : 'Anpassen') : it.title;
      k = L.data.tagFor(it);
    }
    if (el.title.textContent === t && el.tag.textContent === k) return;
    el.tag.textContent = k;
    el.tag.parentNode.classList.toggle('empty', !k);
    el.title.textContent = t;
    fitTitle();
    heroFlip = !heroFlip;
    el.hero.classList.remove(heroFlip ? 'pop-b' : 'pop-a');
    el.hero.classList.add(heroFlip ? 'pop-a' : 'pop-b');
  }
  function fitTitle() {
    var n = el.title;
    n.style.fontSize = '';
    var max = n.clientWidth, w = n.scrollWidth;
    if (max > 0 && w > max) {
      var base = parseFloat(getComputedStyle(n).fontSize) || 152;
      n.style.fontSize = Math.max(56, Math.floor(base * max / w)) + 'px';
    }
  }

  // ------------------------------------------------------------------
  // Hintergrundlicht in der Farbe der Auswahl (winzige Canvas, die GPU skaliert sie)
  // ------------------------------------------------------------------
  function setAmbient(color) {
    if (L.wled) L.wled.color(color);
    var c = L.ambientOf(color || L.DEFAULT_ACCENT);
    var key = c.map(Math.round).join(',');
    if (key === S.ambKey) return;
    S.ambKey = key;
    el.hero.style.setProperty('--accent', L.css(c));
    S.ambIdx = 1 - S.ambIdx;
    var on = el.amb[S.ambIdx], off = el.amb[1 - S.ambIdx];
    var c2 = L.mix(c, [60, 80, 255], 0.45);
    var x = on.getContext('2d'), w = on.width, h = on.height;
    x.clearRect(0, 0, w, h);
    blob(x, w * 0.80, h * 0.24, w * 0.62, c, 0.85);
    blob(x, w * 0.04, h * 1.00, w * 0.56, c2, 0.42);
    blob(x, w * 0.42, h * 0.52, w * 0.50, c, 0.18);
    on.classList.add('on');
    off.classList.remove('on');
  }
  function blob(x, cx, cy, r, col, a) {
    var g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, L.css(col, a));
    g.addColorStop(1, L.css(col, 0));
    x.fillStyle = g;
    x.fillRect(0, 0, x.canvas.width, x.canvas.height);
  }

  // ------------------------------------------------------------------
  // Navigation und Aktionen
  // ------------------------------------------------------------------
  function move(dx, dy) {
    S.userMoved = true;
    var r = S.focus.row, c = S.focus.col;
    if (dy) {
      var nr = r + dy;
      if (nr < 0 || nr >= S.rows.length || !S.rows[nr].items.length) return;
      var best = 0, bestD = Infinity, g0 = S.geo && S.geo[r], g1 = S.geo && S.geo[nr];
      var a = g0 && g0.items[c];
      var x = a ? g0.left + a.x - (S.scroll[r] || 0) + a.w / 2 : 0;
      (g1 ? g1.items : []).forEach(function (b, i) {
        var d = Math.abs(g1.left + b.x - (S.scroll[nr] || 0) + b.w / 2 - x);
        if (d < bestD) { bestD = d; best = i; }
      });
      S.focus = { row: nr, col: best };
    } else {
      var nc = c + dx;
      if (nc < 0 || nc >= S.rows[r].items.length) return;
      S.focus.col = nc;
    }
    applyFocus(false, dx);
  }

  function bindPointer(node) {
    node.addEventListener('mouseenter', function () {
      if (S.mode !== 'home') return;
      var r = +node.dataset.row, c = +node.dataset.col;
      if (S.focus.row === r && S.focus.col === c) return;
      S.focus = { row: r, col: c };
      S.userMoved = true;
      applyFocus();
    });
    node.addEventListener('click', function () {
      if (S.mode !== 'home') return;
      S.focus = { row: +node.dataset.row, col: +node.dataset.col };
      applyFocus();
      activate(currentItem());
    });
  }

  // Liefert ein Promise (true = gestartet)
  function launch(id, title, quiet) {
    if (!Luna.available()) {
      L.toast('Vorschau: würde „' + title + '“ öffnen');
      return Promise.resolve(false);
    }
    if (!quiet) L.toast('„' + title + '“ wird geöffnet …');
    return Luna.call('luna://com.webos.applicationManager/launch', { id: id })
      .catch(function () {
        return Luna.exec('luna-send -n 1 luna://com.webos.applicationManager/launch ' +
          Luna.shq(JSON.stringify({ id: id })));
      })
      .then(function () { return true; })
      .catch(function () { L.toast('„' + title + '“ konnte nicht geöffnet werden'); return false; });
  }

  function activate(item) {
    if (!item) return;
    if (item.kind === 'app' || item.kind === 'input') launch(item.id, item.title);
    else if (item.id === 'settings') launch('com.palm.app.settings', 'Einstellungen');
    else if (item.id === 'customize') L.ui.openSettings();
  }

  function longPress(item) {
    if (!item) return;
    if (item.kind === 'app') L.ui.openAppMenu(item);
    else if (item.kind === 'input') L.ui.openInputMenu(item);
    else if (item.id === 'customize') L.ui.openSettings();
  }

  function focusById(row, id) {
    var i = S.rows[row].items.findIndex(function (x) { return x.id === id; });
    if (i >= 0) S.focus = { row: row, col: i };
  }

  function rerender(keepId) {
    var row = S.focus.row;
    L.data.rebuild();
    renderRows();
    if (keepId) focusById(row, keepId);
    applyFocus(true);
  }

  function relayout() {
    measure();
    S.scroll = [0, 0];
    el.tracks.forEach(function (t) { t.style.transform = ''; });
    applyFocus(true);
    fitTitle();
  }

  function goFirst(row) {
    S.focus = { row: S.rows[row].items.length ? row : (row ? 0 : 1), col: 0 };
    applyFocus(true);
  }

  // ------------------------------------------------------------------
  // Magic Remote: Licht folgt dem Zeiger, die Vorschaukarte kippt mit und die
  // Kacheln in der Nähe richten sich leicht zum Zeiger aus.
  // ------------------------------------------------------------------
  var ptr = { x: 0, y: 0, raf: 0, timer: null, bumped: 0, mags: [] };
  var MAG_R = 300;

  function pointerOn() { return document.body.classList.contains('a-pointer'); }

  function onPointer(e) {
    ptr.x = e.clientX;
    ptr.y = e.clientY;
    if (S.mode !== 'home' || !pointerOn()) return;
    if (!ptr.raf) ptr.raf = requestAnimationFrame(pointerFrame);
  }

  function pointerFrame() {
    ptr.raf = 0;
    if (S.theme === 'glas') {
      el.plight.style.transform = 'translate3d(' + (ptr.x - 380) + 'px,' + (ptr.y - 380) + 'px,0)';
      el.plight.classList.add('on');
      var rx = ptr.x / 1920 - 0.5, ry = ptr.y / 1080 - 0.5;
      if (!el.art.classList.contains('live')) {
        el.artTilt.style.transform = 'rotateY(' + (-15 + rx * 12).toFixed(2) + 'deg) rotateX(' +
          (4 - ry * 8).toFixed(2) + 'deg)';
      }
    }
    magFrame();
    clearTimeout(ptr.timer);
    ptr.timer = setTimeout(pointerIdle, 2500);
  }

  function pointerIdle() {
    el.plight.classList.remove('on');
    el.artTilt.style.transform = '';
    magReset(false);
  }

  // Kacheln im Umkreis drehen sich zum Zeiger (Drehachse senkrecht zur Richtung)
  function magFrame() {
    var g = S.geo && S.geo[0];
    if (!g) return;
    var next = [];
    var scroll = S.scroll[0] || 0;
    for (var i = 0; i < S.nodes[0].length; i++) {
      var it = g.items[i];
      if (!it) continue;
      var cx = g.left + it.x - scroll + it.w / 2;
      var cy = g.top + it.h * 0.42;
      var dx = ptr.x - cx, dy = ptr.y - cy;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d > MAG_R || cx < g.left - it.w || cx > g.left + g.cw + it.w) continue;
      var f = 1 - d / MAG_R;                      // 1 = genau darüber, 0 = am Rand
      f = f * f * (3 - 2 * f);                    // weich
      var nx = dx / MAG_R, ny = dy / MAG_R;
      var ry = clamp(nx * 16, -12, 12) * f;       // nach rechts zeigen → rechts nach hinten
      var rx = clamp(-ny * 16, -10, 10) * f;
      var ang = Math.sqrt(rx * rx + ry * ry);
      var mag = S.nodes[0][i].children[1];
      if (!mag) continue;
      if (ang < 0.2) continue;
      mag.classList.add('m');
      // transform statt translate/rotate: die Einzel-Eigenschaften kennt erst Chromium 104
      mag.style.transform = 'translate(' + (nx * 7 * f).toFixed(1) + 'px, ' + (ny * 5 * f).toFixed(1) + 'px) rotate3d(' +
        (rx / ang).toFixed(3) + ', ' + (ry / ang).toFixed(3) + ', 0, ' + ang.toFixed(2) + 'deg)';
      next.push(mag);
    }
    ptr.mags.forEach(function (m) {
      if (next.indexOf(m) < 0) { m.classList.remove('m'); m.style.transform = ''; }
    });
    ptr.mags = next;
  }

  function magReset(hard) {
    ptr.mags.forEach(function (m) { m.classList.remove('m'); m.style.transform = ''; });
    ptr.mags = [];
    if (hard) { clearTimeout(ptr.timer); el.plight.classList.remove('on'); }
  }

  L.home = {
    renderRows: renderRows, measure: measure, applyFocus: applyFocus, decorate: decorate,
    currentItem: currentItem, tileEl: tileEl, move: move, activate: activate, longPress: longPress,
    launch: launch, focusById: focusById, rerender: rerender, relayout: relayout, goFirst: goFirst,
    updateArt: updateArt, replayArt: replayArt, setAmbient: setAmbient, fitTitle: fitTitle,
    onPointer: onPointer, pointerIdle: pointerIdle, magReset: magReset, paintFace: paintFace,
    refreshInfo: function () { updateHero(); updateArt(currentItem(), false, false, true); }
  };
})(window.Lumen);
