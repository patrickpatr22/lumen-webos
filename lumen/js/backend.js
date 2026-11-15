/*
 * Lumen – Web-Backend (Ansatz): kleiner HTTP-Server auf dem Fernseher (Node.js, das
 * webOS für seine Dienste ohnehin mitbringt). Startet über den Homebrew Channel,
 * erreichbar unter http://<TV-IP>:8484 von PC oder Handy im selben Netz.
 * Erste Funktion: eigene Vorschaubilder je App hochladen.
 */
(function (L) {
  'use strict';
  var PORT = L.BACKEND_PORT, PIDF = '/tmp/lumen-backend.pid', LOG = '/tmp/lumen-backend.log';
  var q = function (s) { return Luna.shq(s); };
  var last = '', ipCache = '';

  function exec(cmd) { return Luna.available() ? Luna.exec(cmd) : Promise.resolve(''); }

  function start() {
    if (!Luna.available()) return Promise.resolve('preview');
    var dir = L.selfDir() + '/backend';
    var run = '"$N" server.js ' + PORT + ' ' + q(L.DATA_DIR) + ' >' + LOG + ' 2>&1 </dev/null &';
    var cmd = [
      'P=$(cat ' + PIDF + ' 2>/dev/null)',
      'if [ -n "$P" ] && kill -0 "$P" 2>/dev/null; then echo running; exit 0; fi',
      'N=$(command -v node 2>/dev/null)',
      'for c in /usr/bin/node /usr/local/bin/node /usr/bin/nodejs; do [ -n "$N" ] && break; [ -x "$c" ] && N="$c"; done',
      'if [ -z "$N" ]; then echo nonode; exit 0; fi',
      'cd ' + q(dir) + ' || { echo nodir; exit 0; }',
      'mkdir -p ' + q(L.DATA_DIR),
      'if command -v setsid >/dev/null 2>&1; then setsid ' + run + ' else nohup ' + run + ' fi',
      'echo $! > ' + PIDF,
      'echo started'
    ].join('; ');
    writeApps();
    return exec(cmd).then(function (out) {
      last = String(out || '').trim().split('\n').pop();
      return last;
    }).catch(function () { last = 'error'; return last; });
  }

  function stop() {
    last = '';
    return exec('P=$(cat ' + PIDF + ' 2>/dev/null); [ -n "$P" ] && kill "$P" 2>/dev/null; rm -f ' + PIDF + '; echo stopped')
      .catch(function () { return ''; });
  }

  function fetchJSON(url, ms) {
    var ac = typeof AbortController === 'function' ? new AbortController() : null, t = null;
    var opt = { cache: 'no-store' };
    if (ac) { opt.signal = ac.signal; t = setTimeout(function () { ac.abort(); }, ms || 1500); }
    return fetch(url, opt).then(function (r) { clearTimeout(t); return r.json(); },
      function (e) { clearTimeout(t); throw e; });
  }

  function status(retry) {
    if (!L.prefs.backend.on) return Promise.resolve({ text: 'aus', url: '' });
    if (!Luna.available() && window.LUMEN_FORCE_BACKEND !== true) {
      return Promise.resolve({ text: 'nur auf dem Fernseher', url: '' });
    }
    if (last === 'nonode') return Promise.resolve({ text: 'Node.js fehlt auf dem Fernseher', url: '' });
    return fetchJSON('http://127.0.0.1:' + PORT + '/api/status', 1500).then(function (j) {
      var ip = (j.ips && j.ips[0]) || ipCache || '127.0.0.1';
      return { text: 'läuft' + (j.node ? ' · Node ' + j.node : ''), url: 'http://' + ip + ':' + PORT };
    }).catch(function () {
      if (!retry) {
        return new Promise(function (res) { setTimeout(res, 900); }).then(function () { return status(true); });
      }
      return { text: 'startet nicht (Protokoll: ' + LOG + ')', url: '' };
    });
  }

  // IP-Adresse des Fernsehers (auch ohne laufendes Backend)
  function tvIp() {
    if (ipCache) return Promise.resolve(ipCache);
    if (!Luna.available()) return Promise.resolve(location.hostname || 'Vorschau im Browser');
    return Luna.call('luna://com.webos.service.connectionmanager/getStatus', {}, 2500)
      .then(function (r) {
        var ip = (r.wired && r.wired.ipAddress) || (r.wifi && r.wifi.ipAddress) || '';
        if (!ip) throw new Error('keine IP');
        return ip;
      })
      .catch(function () {
        return exec("ip -4 -o addr show 2>/dev/null | sed -n 's/.* inet \\([0-9.]*\\)\\/.*/\\1/p' | grep -v '^127\\.' | head -n 1")
          .then(function (out) { return String(out || '').trim(); });
      })
      .then(function (ip) { ipCache = ip; return ip; })
      .catch(function () { return ''; });
  }

  // App-Liste für die Weboberfläche (Namen, Farben)
  var appsTimer = null;
  function writeApps() {
    if (!Luna.available()) return;
    clearTimeout(appsTimer);
    appsTimer = setTimeout(function () {
      var list = L.S.allApps.map(function (a) {
        var c = L.itemAccent(a);
        var m = /^cache\/([^?/]+)/.exec(a.iconSrc || '');
        return { id: a.id, title: a.title, color: c ? L.css(c) : null, icon: a.cacheName || (m ? decodeURIComponent(m[1]) : null),
          tag: L.data.autoTag(a) };
      });
      exec('mkdir -p ' + q(L.DATA_DIR) + '; printf %s ' + q(JSON.stringify(list)) + ' > ' + q(L.DATA_DIR + '/apps.json') + '; echo ok')
        .catch(function () {});
    }, 500);
  }

  // Änderungen aus dem Web-Backend (Inhalt der Kachel, Eigenschaft, eigene Bilder) übernehmen:
  // solange die Startseite zu sehen ist, alle paar Sekunden den Änderungszähler abfragen
  var lastRev = null, watchTimer = null, since = 0;
  function watch() {
    clearInterval(watchTimer);
    since = Date.now();                // Server und Lumen laufen auf demselben Gerät (gleiche Uhr)
    watchTimer = setInterval(function () {
      if (!L.prefs.backend.on || document.hidden || L.S.away || L.S.mode !== 'home') return;
      if (!Luna.available() && window.LUMEN_FORCE_BACKEND !== true) return;
      fetchJSON('http://127.0.0.1:' + PORT + '/api/rev', 1200).then(function (j) {
        var r = j && j.rev;
        if (r == null) return;
        if (lastRev !== null ? r !== lastRev : r > since) {
          L.preview.sync().then(function () { L.home.refreshInfo(); });
        }
        lastRev = r;
      }).catch(function () {});
    }, 4000);
  }

  L.backend = { start: start, stop: stop, status: status, tvIp: tvIp, writeApps: writeApps, watch: watch, PORT: PORT };
})(window.Lumen);
