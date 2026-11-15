/*
 * Lumen – Schalter für die „Lumen Leiste“: Source-Taste zeigt über einer laufenden App bzw.
 * einem HDMI-Eingang nur eine Eingangs-Leiste (eigene kleine App mit Fenstertyp „overlay“,
 * sie liegt über dem Bild, statt es zu ersetzen). go-inputs (tvclean) entscheidet anhand der
 * Datei leiste.on im gemeinsamen Ordner, ob es die Leiste oder Lumen öffnet.
 */
(function (L) {
  'use strict';
  var q = function (s) { return Luna.shq(s); };

  // Ist die Lumen Leiste installiert? Drei Wege, der erste Treffer zählt:
  //   1. vollständige App-Liste (enthält auch unsichtbare Apps)
  //   2. Installationsordner auf dem Gerät
  //   3. Application Manager (getAppInfo)
  var DIRS = ['/media/developer/apps/usr/palm/applications', '/media/cryptofs/apps/usr/palm/applications',
    '/var/palm/jail/apps/usr/palm/applications', '/usr/palm/applications'];
  function listed(ids) { return !!(ids && ids.indexOf(L.BAR_ID) >= 0); }

  function check() {
    if (!Luna.available()) return Promise.resolve(false);
    if (listed(L.S.allIds)) return Promise.resolve(true);
    var cmd = 'for d in ' + DIRS.map(q).join(' ') + '; do [ -f "$d/' + L.BAR_ID + '/appinfo.json" ] && { echo "dir:$d"; exit 0; }; done; ' +
      'luna-send -n 1 luna://com.webos.applicationManager/getAppInfo ' + q(JSON.stringify({ id: L.BAR_ID })) + ' 2>&1; echo';
    return Luna.exec(cmd)
      .then(function (out) { out = String(out || ''); return /^dir:/m.test(out) || /"folderPath"/.test(out); }, function () { return false; })
      .then(function (ok) {
        if (ok) return true;
        return Luna.call('luna://com.webos.applicationManager/listApps', {}, 4000)
          .then(function (r) {
            L.S.allIds = (r.apps || []).map(function (a) { return a && a.id; }).filter(Boolean);
            return listed(L.S.allIds);
          }, function () { return false; });
      });
  }

  // announce: Rückmeldung als Hinweis (beim Umstellen in den Einstellungen)
  function sync(announce) {
    var on = L.prefs.sourceFocus === 'bar';
    if (!Luna.available()) {
      if (announce && on) L.toast('Vorschau: Source würde die Leiste zeigen');
      return Promise.resolve();
    }
    var f = L.DATA_DIR + '/leiste.on';
    var p = Luna.exec('mkdir -p ' + q(L.DATA_DIR) + '; ' + (on ? 'touch ' : 'rm -f ') + q(f) + '; echo ok')
      .catch(function () {});
    if (!on || !announce) return p;
    return p.then(check).then(function (ok) {
      L.toast(ok ? 'Source zeigt jetzt die Leiste über dem laufenden Bild'
        : '„Lumen Leiste“ nicht gefunden – lumen-leiste.ipk installieren. Die Einstellung bleibt gespeichert, bis dahin öffnet Source Lumen.', 6500);
    });
  }

  L.bar = { sync: sync, check: check };
})(window.Lumen);
