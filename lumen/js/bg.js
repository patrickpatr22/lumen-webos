/*
 * Lumen – Hintergrund (Anpassen → Darstellung → Hintergrund)
 *   accent        App-Farbe: das Licht wechselt mit der ausgewählten App (Standard)
 *   design:<id>   eigene Lumen-Designs (reines CSS, ruhig, kostet keine Leistung)
 *   image:<datei> eigenes Bild aus dem Web-Backend (/var/lib/webosbrew/lumen/backgrounds)
 * Auswahl im Web-Backend landet in ui.json; preview.sync liest sie und gibt sie hierher.
 */
(function (L) {
  'use strict';
  var S = L.S;
  var DESIGNS = [
    ['aurora', 'Polarlicht'], ['deepsea', 'Tiefsee'], ['sunset', 'Abendrot'],
    ['nebula', 'Nebel'], ['graphite', 'Graphit'], ['midnight', 'Mitternacht']
  ];

  function current() {
    var v = L.prefs.bg || 'accent';
    if (/^image:/.test(v) && !imageFor(v.slice(6)) && S.bgLoaded) return 'accent';
    return v;
  }
  function imageFor(file) {
    for (var i = 0; i < S.bgImages.length; i++) if (S.bgImages[i].file === file) return S.bgImages[i];
    return null;
  }

  function options() {
    var o = [['accent', 'App-Farbe']];
    DESIGNS.forEach(function (d) { o.push(['design:' + d[0], d[1]]); });
    S.bgImages.forEach(function (b) { o.push(['image:' + b.file, 'Bild: ' + b.name]); });
    var c = L.prefs.bg;
    if (/^image:/.test(c) && !imageFor(c.slice(6))) o.push([c, 'Bild: ' + c.slice(6).replace(/\.[a-z]+$/i, '')]);
    return o;
  }

  var layer = null;
  function apply() {
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'bg-image';
      var bg = document.getElementById('bg'), shade = bg && bg.querySelector('.shade');
      if (bg) bg.insertBefore(layer, shade || null);
    }
    var v = current(), kind = v.split(':')[0];
    document.body.dataset.bg = kind;
    layer.className = '';
    layer.style.backgroundImage = '';
    if (kind === 'design') layer.className = 'bgd-' + v.slice(7);
    else if (kind === 'image') {
      var b = imageFor(v.slice(6));
      if (b) layer.style.backgroundImage = 'url("' + b.src + '")';
      else document.body.dataset.bg = 'accent';
    }
  }

  // Auswahl am Fernseher: merken und für das Web-Backend in ui.json schreiben
  function set(v) {
    L.prefs.bg = v;
    L.prefs.bgStamp = Date.now();
    L.savePrefs();
    apply();
    if (Luna.available()) {
      var D = L.DATA_DIR;
      Luna.exec('mkdir -p ' + Luna.shq(D) + '; printf %s ' + Luna.shq(JSON.stringify({ bg: v, stamp: L.prefs.bgStamp })) +
        ' > ' + Luna.shq(D + '/ui.json') + '; echo ok').catch(function () {});
    }
  }

  // Ergebnis von preview.sync: Bilderliste und Auswahl aus dem Web-Backend
  function fromSync(images, ui) {
    S.bgImages = images || [];
    S.bgLoaded = true;
    if (ui && ui.bg && +ui.stamp > (+L.prefs.bgStamp || 0)) {
      L.prefs.bg = String(ui.bg);
      L.prefs.bgStamp = +ui.stamp;
      L.savePrefs();
    }
    apply();
  }

  L.bg = { apply: apply, set: set, options: options, current: current, fromSync: fromSync, DESIGNS: DESIGNS };
})(window.Lumen);
