/*
 * Lumen – Daten: App-Liste, Symbole, Eingänge, Zwischenspeicher, Aktualisieren.
 */
(function (L) {
  'use strict';
  var S = L.S;

  function iconPathOf(a) {
    var keys = ['extraLargeIcon', 'largeIcon', 'mediumIcon', 'icon'];
    for (var i = 0; i < keys.length; i++) {
      var v = a[keys[i]];
      if (v && typeof v === 'string') {
        if (v.indexOf('file://') === 0) v = v.slice(7);
        if (v.charAt(0) !== '/') v = (a.folderPath || '') + '/' + v;
        return v;
      }
    }
    return '';
  }

  function normalizeApps(list) {
    return list.filter(function (a) {
      return a && a.id && a.visible !== false && a.id !== L.SELF_ID && L.INPUT_IDS.indexOf(a.id) < 0;
    }).map(function (a) {
      return { kind: 'app', id: a.id, title: a.title || a.id, iconPath: iconPathOf(a), iconSrc: '',
        color: L.parseColor(a.iconColor) };
    });
  }

  function hash(str) {
    var h = 5381;
    for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }

  // Zwischenspeicher: App-Liste, Farben und Eingangsstatus überleben den Neustart,
  // damit der Launcher sofort vollständig erscheint.
  function loadCache() {
    try {
      var c = JSON.parse(localStorage.getItem(L.CACHE_KEY));
      if (c && Array.isArray(c.apps) && c.apps.length) return c;
    } catch (e) { /* ignorieren */ }
    return null;
  }
  var cacheTimer = null;
  function saveCache() {
    if (!Luna.available()) return;
    clearTimeout(cacheTimer);
    cacheTimer = setTimeout(function () {
      try {
        localStorage.setItem(L.CACHE_KEY, JSON.stringify({
          ver: L.VERSION, sig: S.appSig, colors: S.colors, inputStatus: S.inputStatus,
          apps: S.allApps.map(function (a) {
            return { kind: 'app', id: a.id, title: a.title, iconSrc: a.iconSrc, color: a.color };
          })
        }));
      } catch (e) { /* ignorieren */ }
    }, 400);
  }

  // Symbole einmal in den eigenen Ordner kopieren (dort darf die App sie sicher lesen)
  function cacheIcons(apps, stampBase) {
    var dir = L.selfDir() + '/cache';
    var stamp = stampBase + '-' + Date.now().toString(36);
    var parts = ['mkdir -p ' + Luna.shq(dir)];
    apps.forEach(function (a) {
      if (!a.iconPath) return;
      var m = a.iconPath.match(/\.(png|jpe?g|webp|gif|svg)$/i);
      a.cacheName = a.id.replace(/[^A-Za-z0-9._-]/g, '_') + (m ? m[0].toLowerCase() : '.png');
      parts.push('cp -f ' + Luna.shq(a.iconPath) + ' ' + Luna.shq(dir + '/' + a.cacheName) + ' 2>/dev/null');
    });
    parts.push('echo ok');
    return Luna.exec(parts.join('; '))
      .then(function () {
        apps.forEach(function (a) { if (a.cacheName) a.iconSrc = 'cache/' + encodeURIComponent(a.cacheName) + '?v=' + stamp; });
        return apps;
      })
      .catch(function () {
        apps.forEach(function (a) { if (a.iconPath) a.iconSrc = 'file://' + a.iconPath; });
        return apps;
      });
  }

  // Liefert {apps, sig}. apps ist null, wenn sich nichts geändert hat.
  function loadApps() {
    if (!Luna.available()) return Promise.resolve({ apps: S.allApps.length ? null : demoApps(), sig: 'demo' });
    return Luna.call('luna://com.webos.applicationManager/listApps', {}, 3000)
      .then(function (res) {
        if (!res.apps || res.apps.length < 3) throw new Error('App-Liste unvollständig');
        return res;
      })
      .catch(function () {
        return Luna.exec("luna-send -n 1 -f luna://com.webos.applicationManager/listApps '{}'")
          .then(function (out) { return JSON.parse(out); });
      })
      .then(function (res) {
        // alle installierten Kennungen merken, auch unsichtbare (z. B. die Lumen Leiste)
        S.allIds = (res.apps || []).map(function (a) { return a && a.id; }).filter(Boolean);
        var apps = normalizeApps(res.apps || []);
        var sig = apps.map(function (a) { return a.id + '|' + a.title + '|' + a.iconPath; }).join(';');
        if (sig === S.appSig && S.allApps.length && !S.iconsStale) return { apps: null, sig: sig };
        return cacheIcons(apps, hash(sig)).then(function (done) {
          S.iconsStale = false;
          return { apps: done, sig: sig };
        });
      });
  }

  // Ist am Anschluss wirklich ein Gerät eingesteckt? Je nach webOS-Version heißt das Feld anders.
  function plugState(d) {
    var keys = ['hdmiPlugIn', 'plugged', 'isPlugged', 'signalDetected', 'connected'];
    for (var i = 0; i < keys.length; i++) {
      var v = d[keys[i]];
      if (v === true || v === 'true') return true;
      if (v === false || v === 'false') return false;
    }
    return null;
  }

  function loadInputStatus() {
    if (!Luna.available()) {
      return Promise.resolve({
        'com.webos.app.hdmi1': { connected: true }, 'com.webos.app.hdmi2': { connected: true },
        'com.webos.app.hdmi3': { connected: false }, 'com.webos.app.hdmi4': { connected: false }
      });
    }
    return Luna.call('luna://com.webos.service.eim/getAllInputStatus', {}, 4000)
      .then(function (r) {
        var map = {};
        (r.devices || r.inputs || []).forEach(function (d) {
          var id = d.appId || d.id;
          if (id) map[id] = { connected: plugState(d) };
        });
        return map;
      })
      .catch(function () { return null; });
  }

  // Beispiel-Apps für die Vorschau im Browser (neutrale Platzhalter-Symbole)
  function demoIcon(letter, c1, c2, transparent) {
    var bg = transparent
      ? '<circle cx="128" cy="128" r="92" fill="url(#g)"/>'
      : '<rect width="256" height="256" fill="' + c1 + '"/>';
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + c1 +
      '"/><stop offset="1" stop-color="' + c2 + '"/></linearGradient></defs>' + bg +
      '<text x="128" y="160" font-family="Arial, sans-serif" font-size="100" font-weight="700" ' +
      'text-anchor="middle" fill="#fff">' + letter + '</text></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
  function demoApps() {
    var list = [
      ['youtube.leanback.v4', 'YouTube', 'Y', '#3b4cca', '#1d2a8a'],
      ['netflix', 'Netflix', 'N', '#0f766e', '#064e3b'],
      ['amazon', 'Prime Video', 'P', '#b45309', '#78350f'],
      ['com.disney.disneyplus-prod', 'Disney+', 'D', '#6d28d9', '#3b0764', true],
      ['com.apple.appletv', 'Apple TV', 'A', '#334155', '#0f172a'],
      ['spotify-beehive', 'Spotify', 'S', '#be185d', '#831843', true],
      ['com.webos.app.mediadiscovery', 'Media Player', 'M', '#0369a1', '#0c4a6e'],
      ['com.webos.app.discovery', 'Apps', '+', '#475569', '#1e293b'],
      ['org.webosbrew.hbchannel', 'Homebrew Channel', 'H', '#a16207', '#713f12', true]
    ];
    return list.map(function (x) {
      return { kind: 'app', id: x[0], title: x[1], iconSrc: demoIcon(x[2], x[3], x[4], x[5]), color: null };
    });
  }

  // ------------------------------------------------------------------
  // Listen
  // ------------------------------------------------------------------
  function orderedApps() {
    var hidden = L.prefs.hidden, order = L.prefs.order;
    var apps = S.allApps.filter(function (a) { return hidden.indexOf(a.id) < 0; });
    function rank(a) {
      var i = order.indexOf(a.id);
      if (i >= 0) return i;
      var p = L.PREFERRED.indexOf(a.id);
      if (p >= 0) return 1000 + p;
      if (L.UTILITY.indexOf(a.id) >= 0 || /^com\.cleanyourtv\./.test(a.id)) return 3000 + L.UTILITY.indexOf(a.id);
      return 2000;
    }
    return apps.sort(function (a, b) {
      return (rank(a) - rank(b)) || a.title.localeCompare(b.title, 'de');
    });
  }

  function glyphFor(name) {
    if (/pc|laptop|computer/i.test(name)) return 'monitor';
    if (/playstation|ps\d|xbox|switch|konsole|nintendo/i.test(name)) return 'gamepad';
    if (/receiver|soundbar|verst/i.test(name)) return 'speaker';
    if (/blu-?ray|dvd/i.test(name)) return 'disc';
    if (/box|stick|apple tv|fire/i.test(name)) return 'box';
    return 'hdmi';
  }

  function allInputs() {
    return L.INPUT_IDS.map(function (id, i) {
      var n = i + 1, p = L.prefs.inputs[id] || {}, st = S.inputStatus[id];
      var name = p.name || ('HDMI ' + n);
      return {
        kind: 'input', id: id, n: n, title: name, sub: p.name ? 'HDMI ' + n : 'Eingang',
        glyph: glyphFor(name), connected: st ? st.connected : null, show: p.show !== false
      };
    });
  }

  function rebuild() {
    S.rows[0].items = orderedApps();
    S.rows[1].items = allInputs().filter(function (x) { return x.show; }).concat([
      { kind: 'action', id: 'settings', title: 'Einstellungen', sub: 'TV', glyph: 'gear' },
      { kind: 'action', id: 'customize', title: 'Anpassen', sub: 'Lumen', glyph: 'sliders' }
    ]);
    writeShared();
  }

  // ------------------------------------------------------------------
  // Eigenschaft unter dem Titel („Video“, „Musik“ …). Eigener Text pro App über das
  // Web-Backend (tiles.json → tag), sonst nach der App-Kennung geraten.
  // ------------------------------------------------------------------
  var TAGS = [
    [/youtube|vimeo|dailymotion/i, 'Video'],
    [/twitch|kick\.com/i, 'Live-Streams'],
    [/netflix|amazon(?!.*music)|primevideo|disney|appletv|apple\.tv|joyn|\brtl|\bzdf|\bard\b|\barte\b|waipu|magenta|\bsky|\bwow\b|paramount|\bmax\b|hbo|crunchyroll|mubi|pluto|rakuten|filmfriend/i, 'Filme & Serien'],
    [/dazn|sport/i, 'Sport'],
    [/spotify|deezer|tidal|music|tunein|radio|soundcloud|podcast|audible/i, 'Musik'],
    [/mediadiscovery|photovideo|mediaplayer|media|plex|kodi|jellyfin|emby|vlc|smb|dlna/i, 'Multimedia'],
    [/browser|web\b/i, 'Internet'],
    [/steam|geforce|xcloud|xbox|boosteroid|moonlight|limelight|game|luna/i, 'Spiele'],
    [/livetv|\btv\b|zattoo/i, 'Fernsehen'],
    [/hbchannel|webosbrew/i, 'Homebrew'],
    [/discovery|store|appstore/i, 'App-Store'],
    [/settings|setting/i, 'System']
  ];
  function autoTag(item) {
    var key = item.id + ' ' + (item.title || '');
    for (var i = 0; i < TAGS.length; i++) if (TAGS[i][0].test(key)) return TAGS[i][1];
    return 'App';
  }
  function tagFor(item) {
    if (!item) return '';
    if (item.kind === 'app') {
      var t = S.tiles[item.id];
      return (t && t.tag) || autoTag(item);
    }
    if (item.kind === 'input') {
      return 'Eingang · HDMI ' + item.n + (item.connected ? ' · verbunden' : '');
    }
    return item.id === 'settings' ? 'Fernseher' : 'Lumen';
  }

  // Für die Lumen-Leiste (Source-Taste über dem Bild) und das Web-Backend:
  // Eingänge mit Namen und Sichtbarkeit in den gemeinsamen Ordner schreiben
  var sharedSig = '', sharedTimer = null;
  function writeShared() {
    if (!Luna.available()) return;
    var list = allInputs().map(function (x) {
      return { id: x.id, n: x.n, title: x.title, show: x.show, glyph: x.glyph };
    });
    var sig = JSON.stringify(list);
    if (sig === sharedSig) return;
    clearTimeout(sharedTimer);
    sharedTimer = setTimeout(function () {
      var D = L.DATA_DIR;
      Luna.exec('mkdir -p ' + Luna.shq(D) + '; printf %s ' + Luna.shq(sig) + ' > ' + Luna.shq(D + '/inputs.json') + '; echo ok')
        .then(function () { sharedSig = sig; }, function () {});
    }, 1200);
  }

  // ------------------------------------------------------------------
  // Aktualisieren: App-Liste höchstens einmal pro Minute (oder mit force),
  // Eingangsstatus bei jedem Aufruf.
  // ------------------------------------------------------------------
  var refreshing = null;
  function refresh(announce, force) {
    if (refreshing) return refreshing;
    var keep = L.home.currentItem(), keepRow = S.focus.row;
    var wantApps = force || S.iconsStale || !S.lastAppsAt || Date.now() - S.lastAppsAt > 60000;
    refreshing = Promise.all([wantApps ? loadApps() : Promise.resolve(null), loadInputStatus()])
      .then(function (res) {
        var changed = false, firstLoad = !S.loaded, appsChanged = false;
        if (res[0]) {
          S.lastAppsAt = Date.now();
          if (res[0].apps) { S.allApps = res[0].apps; S.appSig = res[0].sig; changed = appsChanged = true; }
        }
        if (res[1]) {
          var st = JSON.stringify(res[1]);
          if (st !== S.statusSig) { S.statusSig = st; S.inputStatus = res[1]; changed = true; }
        }
        S.loaded = true;
        if (changed || firstLoad) {
          rebuild();
          L.home.renderRows();
          if (firstLoad && !S.userMoved) S.focus = { row: S.rows[0].items.length ? 0 : 1, col: 0 };
          else if (keep) L.home.focusById(keepRow, keep.id);
          L.home.applyFocus(true);
          saveCache();
          if (L.ui && L.ui.refreshOpen) L.ui.refreshOpen();
        }
        // apps.json (für Web-Backend und Lumen Leiste): bei Änderungen und einmal pro Start
        if ((appsChanged || !S.appsWritten) && L.backend && S.allApps.length) { S.appsWritten = true; L.backend.writeApps(); }
        if (announce) L.toast('App-Liste aktualisiert');
      })
      .catch(function (err) {
        if (!S.loaded) {
          S.loaded = true;
          rebuild();
          L.home.renderRows();
          L.home.applyFocus(true);
        }
        L.toast('App-Liste konnte nicht geladen werden');
        if (window.console) console.error(err);
      })
      .then(function () { refreshing = null; });
    return refreshing;
  }

  L.data = {
    loadCache: loadCache, saveCache: saveCache, refresh: refresh, rebuild: rebuild,
    allInputs: allInputs, orderedApps: orderedApps, demoApps: demoApps, tagFor: tagFor, autoTag: autoTag
  };
})(window.Lumen);
