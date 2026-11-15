/*
 * Lumen – Einstellungen und Dialoge.
 *   - Einstellungs-Ansicht: Kategorien links, Optionen rechts (gruppiert wie in iOS),
 *     Unterseiten (z. B. Licht → Zonen)
 *   - Dropdown im iOS-Stil für alles mit mehreren Möglichkeiten
 *   - Schalter für An/Aus
 *   - Texteingabe über die Bildschirmtastatur
 *   - Kontextmenüs für Kacheln (OK lange drücken)
 */
(function (L) {
  'use strict';
  var S = L.S, $ = L.$, clamp = L.clamp;

  var dom = {
    set: $('#settings'), cats: $('#settings .set-cats'), crumb: $('#settings .set-crumb'),
    title: $('#settings .set-title'), sub: $('#settings .set-sub'), scroll: $('#settings .set-scroll'),
    list: $('#settings .set-list'), brand: $('#settings .set-logo'), ver: $('#settings .set-ver'),
    pop: $('#pop'), popList: $('#pop .pop-list'),
    prompt: $('#prompt'), pTitle: $('#prompt .prompt-title'), pSub: $('#prompt .prompt-sub'),
    pInput: $('#prompt-input'), pBtns: $('#prompt .prompt-btns'),
    sheet: $('#sheet'), shTitle: $('#sheet .sheet-title'), shSub: $('#sheet .sheet-sub'), shList: $('#sheet .sheet-list')
  };

  function save() { L.savePrefs(); }
  function opt(list, v) {
    for (var i = 0; i < list.length; i++) if (String(list[i][0]) === String(v)) return list[i][1];
    return '';
  }

  // ------------------------------------------------------------------
  // Kategorien
  // ------------------------------------------------------------------
  var tvIp = '…', backendState = { text: '…', url: '' };

  var CATS = [
    { id: 'general', title: 'Allgemein', icon: 'gear', sub: 'Bedienung und Info', rows: rowsGeneral },
    { id: 'look', title: 'Darstellung', icon: 'palette', sub: 'Design und Begrüßung', rows: rowsLook },
    { id: 'anim', title: 'Animationen', icon: 'sparkle', sub: 'Einzeln abschalten oder austauschen', rows: rowsAnim },
    { id: 'preview', title: 'Vorschau', icon: 'image', sub: 'Inhalt der großen Karte', rows: rowsPreview },
    { id: 'apps', title: 'Apps', icon: 'grid', sub: 'Ausgeblendete Apps und Reihenfolge', rows: rowsApps },
    { id: 'inputs', title: 'Eingänge', icon: 'hdmi', sub: 'Welche HDMI-Eingänge erscheinen', rows: rowsInputs },
    { id: 'light', title: 'Licht (WLED)', icon: 'bulb', sub: 'LEDs folgen der Startseite', rows: rowsLight },
    { id: 'web', title: 'Web-Backend', icon: 'globe', sub: 'Lumen vom PC oder Handy aus erreichen', rows: rowsWeb }
  ];

  function rowsGeneral() {
    var p = L.prefs;
    return [
      { t: 'head', label: 'Bedienung' },
      { t: 'select', label: 'Home-Taste', opts: [['last', 'Zurück zur letzten Auswahl'], ['first', 'Erste App auswählen']],
        get: function () { return p.homeFocus || 'last'; }, set: function (v) { p.homeFocus = v; } },
      { t: 'select', label: 'Source-Taste',
        opts: [['inputs', 'Lumen · Eingänge'], ['apps', 'Lumen · Apps'], ['bar', 'Leiste über dem Bild (Test)']],
        get: function () { return p.sourceFocus; }, set: function (v) { p.sourceFocus = v; L.bar.sync(true); } },
      { t: 'note', label: p.sourceFocus === 'bar'
        ? 'Läuft eine App oder ein HDMI-Eingang, erscheint bei Source nur eine Leiste über dem laufenden Bild (braucht die Zusatz-App „Lumen Leiste“ und das tvclean-Update). Sonst öffnet sich Lumen.'
        : 'Home in einer App: Lumen erscheint so, wie du es verlassen hast.' },
      { t: 'select', label: 'Bildschirmschoner',
        opts: [[0, 'Aus'], [3, 'nach 3 Minuten'], [5, 'nach 5 Minuten'], [10, 'nach 10 Minuten'], [15, 'nach 15 Minuten'], [30, 'nach 30 Minuten']],
        get: function () { return p.saverMin; }, set: function (v) { p.saverMin = +v; L.main.bumpIdle(); } },
      { t: 'head', label: 'Über Lumen' },
      { t: 'info', label: 'Version', value: L.VERSION },
      { t: 'info', label: 'Fernseher', value: tvIp },
      { t: 'action', label: 'Lumen neu laden', run: function () { location.reload(); } }
    ];
  }

  function rowsLook() {
    var p = L.prefs, rows = [
      { t: 'head', label: 'Hintergrund' },
      { t: 'select', label: 'Hintergrund', opts: L.bg.options(),
        get: function () { return L.bg.current(); }, set: function (v) { L.bg.set(v); } },
      { t: 'note', label: S.bgImages.length ? 'Eigene Bilder verwaltest du im Web-Backend.'
        : 'Eigene Bilder: im Web-Backend unter „Hintergründe“ hochladen, dann erscheinen sie hier.' },
      { t: 'head', label: 'Begrüßung' },
      { t: 'select', label: 'Begrüßung', opts: [['classic', 'Klassisch'], ['quotes', 'Meme-Zitate'], ['off', 'Aus']],
        get: function () { return p.greet; }, set: function (v) { p.greet = v; L.greet.next(); } }
    ];
    if (p.greet === 'classic') {
      rows.push({ t: 'text', label: 'Name', get: function () { return p.name; },
        title: 'Dein Name', sub: 'Für die Begrüßung · leer lassen für ohne Namen',
        validate: function (v) { return v.length <= 24; },
        set: function (v) { p.name = v; L.greet.next(); } });
    }
    if (p.greet === 'quotes') {
      rows.push({ t: 'select', label: 'Zitat wechseln',
        opts: [[0, 'Bei jedem Öffnen'], [30, 'Alle 30 Sekunden'], [45, 'Alle 45 Sekunden'], [120, 'Alle 2 Minuten'], [300, 'Alle 5 Minuten']],
        get: function () { return p.quoteEvery; }, set: function (v) { p.quoteEvery = +v; } });
      rows.push({ t: 'action', label: 'Nächstes Zitat', run: function () { L.greet.next(); } });
      rows.push({ t: 'note', label: (window.LUMEN_QUOTES || []).length + ' Zitate im Vorrat. Eigene ergänzen: js/quotes.js' });
    }
    return rows;
  }

  function rowsAnim() {
    var a = L.prefs.anim;
    function set(k) { return function (v) { a[k] = v; L.anim.apply(); }; }
    function get(k) { return function () { return a[k]; }; }
    var rows = [
      { t: 'toggle', label: 'Animationen', get: get('on'), set: function (v) { a.on = v; L.anim.apply(); } }
    ];
    if (!a.on) {
      rows.push({ t: 'note', label: 'Alle Animationen sind aus – Lumen bleibt ruhig und reagiert sofort.' });
      return rows;
    }
    rows.push(
      { t: 'head', label: 'Tempo' },
      { t: 'slider', label: 'App-Reihe', min: 40, max: 160, step: 10, get: get('tileSpeed'), set: set('tileSpeed') },
      { t: 'slider', label: 'Vorschaukarte', min: 40, max: 160, step: 10, get: get('cardSpeed'), set: set('cardSpeed') },
      { t: 'note', label: 'Links/Rechts ändert das Tempo. 100 % = wie Lumen 1.4, kleiner = langsamer und ruhiger.' },
      { t: 'head', label: 'Abläufe' },
      { t: 'select', label: 'Start-Animation', opts: [['power', 'Nach dem Einschalten'], ['always', 'Bei jedem Start'], ['off', 'Aus']],
        get: get('boot'), set: set('boot') },
      { t: 'select', label: 'Rückkehr mit Home', opts: [['none', 'Sofort da (empfohlen)'], ['soft', 'Sanft'], ['structured', 'Strukturiert aufbauen'], ['stagger', 'Gestaffelt aufbauen']],
        get: get('build'), set: function (v) { a.build = v; L.anim.apply(); } },
      { t: 'select', label: 'Vorschau-Wechsel', opts: [['fly', 'Einfliegen & Drehen'], ['rise', 'Aufsteigen'], ['tilt', 'Kippen'], ['fade', 'Überblenden'], ['off', 'Aus']],
        get: get('swap'), set: set('swap') },
      { t: 'select', label: 'Kachel-Auswahl', opts: [['pop', 'Pop'], ['bounce', 'Hüpfen'], ['tilt', 'Kippen'], ['off', 'Aus']],
        get: get('select'), set: set('select') },
      { t: 'select', label: 'Zitat-Wechsel', opts: [['type', 'Schreibmaschine'], ['fade', 'Überblenden'], ['off', 'Aus']],
        get: get('quote'), set: set('quote') },
      { t: 'head', label: 'Dauerhaft' },
      { t: 'toggle', label: 'Kacheln schweben', get: get('float'), set: set('float') },
      { t: 'toggle', label: 'Vorschau atmet', get: get('breathe'), set: set('breathe') },
      { t: 'toggle', label: 'Magic-Remote-Effekt', get: get('pointer'), set: set('pointer') },
      { t: 'toggle', label: 'Hintergrund bewegt sich', get: get('ambient'), set: set('ambient') },
      { t: 'head', label: 'Ausprobieren' },
      { t: 'action', label: 'Start-Animation ansehen', run: function () { closeSettings(); L.main.replayBoot(); } },
      { t: 'action', label: 'Vorschau-Wechsel ansehen', run: function () { closeSettings(); setTimeout(L.home.replayArt, 250); } },
      { t: 'action', label: 'Aufbau ansehen', run: function () { closeSettings(); L.anim.build(a.build === 'none' ? 'structured' : a.build); } }
    );
    return rows;
  }

  function rowsPreview() {
    var v = L.prefs.preview;
    return [
      { t: 'select', label: 'Inhalt der Karte', opts: [['shots', 'Eigenes Bild oder letzter Bildschirm'], ['icon', 'Eigenes Bild oder App-Symbol']],
        get: function () { return v.mode; }, set: function (x) { v.mode = x; L.home.updateArt(L.home.currentItem(), true, true); } },
      { t: 'note', label: 'Gilt für Apps auf „Automatisch“. Pro App einstellen: OK auf der App gedrückt halten oder im Web-Backend.' },
      { t: 'toggle', label: 'Automatisch aufnehmen', get: function () { return v.autoshot; },
        set: function (x) { v.autoshot = x; L.preview.syncAutoshot(); } },
      { t: 'toggle', label: 'Live-Bild für HDMI', get: function () { return v.live; },
        set: function (x) { v.live = x; if (!x) L.preview.stopLive(); } },
      { t: 'note', label: 'Verlässt du eine App mit der Home-Taste, merkt sich Lumen den Bildschirm. Festhalten oder löschen: OK auf der App gedrückt halten.' },
      { t: 'action', label: 'Alle Vorschaubilder löschen', danger: true, run: function () {
        L.preview.removeAll().then(function () {
          L.home.updateArt(L.home.currentItem(), true);
          L.toast('Vorschaubilder gelöscht');
        });
      } }
    ];
  }

  function rowsApps() {
    var rows = [{ t: 'head', label: 'Ausgeblendet' }];
    var hidden = S.allApps.filter(function (a) { return L.prefs.hidden.indexOf(a.id) >= 0; });
    hidden.forEach(function (a) {
      rows.push({ t: 'action', label: a.title, value: 'einblenden', run: function () {
        L.prefs.hidden = L.prefs.hidden.filter(function (x) { return x !== a.id; });
        save(); L.home.rerender(); L.toast('„' + a.title + '“ ist wieder da');
      } });
    });
    if (!hidden.length) rows.push({ t: 'note', label: 'Keine ausgeblendeten Apps. Ausblenden: OK auf einer App gedrückt halten.' });
    rows.push(
      { t: 'head', label: 'Ordnung' },
      { t: 'action', label: 'Reihenfolge zurücksetzen', run: function () {
        L.prefs.order = []; save(); L.home.rerender(); L.toast('Reihenfolge zurückgesetzt');
      } },
      { t: 'action', label: 'App-Liste neu laden', run: function () { S.iconsStale = true; L.data.refresh(true, true); } }
    );
    return rows;
  }

  function rowsInputs() {
    var rows = [{ t: 'head', label: 'Anzeigen' }];
    L.data.allInputs().forEach(function (inp) {
      rows.push({ t: 'toggle', label: inp.title === 'HDMI ' + inp.n ? inp.title : 'HDMI ' + inp.n + ' · ' + inp.title,
        get: function () { return L.inputPref(inp.id).show !== false; },
        set: function (v) { L.inputPref(inp.id).show = v; L.home.rerender(); } });
    });
    rows.push({ t: 'note', label: 'Umbenennen: OK auf dem Eingang gedrückt halten.' });
    return rows;
  }

  function rowsLight() {
    var w = L.prefs.wled;
    function set(k, also) { return function (v) { w[k] = v; if (also) also(v); L.wled.refresh(); }; }
    var rows = [
      { t: 'toggle', label: 'Lichtsync', get: function () { return w.on; },
        set: function (v) { if (!v) L.wled.leave(); w.on = v; if (v) L.wled.refresh(); } },
      { t: 'text', label: 'Adresse', get: function () { return w.ip; }, title: 'WLED-Adresse',
        sub: 'IP-Adresse oder Name des Controllers', validate: function (v) { return /^[A-Za-z0-9.-]+(:\d{1,5})?$/.test(v); },
        set: function (v) { L.wled.leave(); w.ip = v; L.wled.test(); } }
    ];
    if (!w.on) return rows;
    rows.push(
      { t: 'head', label: 'Licht' },
      { t: 'select', label: 'Aufteilung', opts: [['zones', 'Zonen wie der Bildschirm'], ['single', 'Eine Farbe']],
        get: function () { return w.layout; }, set: set('layout') },
      { t: 'select', label: 'Effekt', opts: [['spot', 'Spot atmet + funkelt'], ['static', 'Statisch'], ['breathe', 'Alles atmet'], ['sparkle', 'Alles funkelt'], ['combo', 'Atmen + Funkeln']],
        get: function () { return w.effect; }, set: set('effect') }
    );
    if (w.effect !== 'static') {
      rows.push({ t: 'select', label: 'Tempo', opts: [['slow', 'Langsam'], ['mid', 'Mittel'], ['fast', 'Schnell']],
        get: function () { return w.speed; }, set: set('speed') });
    }
    if (w.layout === 'zones') {
      rows.push({ t: 'select', label: 'Restliche Zonen', opts: [[5, 'stark gedimmt (5 %)'], [12, 'gedimmt (12 %)'], [20, 'leicht gedimmt (20 %)'], [35, 'kaum gedimmt (35 %)']],
        get: function () { return w.dim; }, set: set('dim', function (v) { w.dim = +v; }) });
      var n = L.wled.total(w.counts);
      rows.push({ t: 'nav', label: 'Zonen einrichten', value: n ? n + ' LEDs' : 'noch nicht', page: pageZones });
    }
    rows.push(
      { t: 'select', label: 'Beim Verlassen', opts: [['restore', 'Vorheriges Licht'], ['off', 'Ausschalten'], ['keep', 'Farbe halten']],
        get: function () { return w.leave; }, set: function (v) { w.leave = v; } },
      { t: 'action', label: 'Verbindung testen', run: function () { L.wled.test(); } }
    );
    return rows;
  }

  function pageZones() {
    var w = L.prefs.wled;
    function countRow(z) {
      return { t: 'text', numeric: true, label: L.wled.ZONE_NAMES[z].charAt(0).toUpperCase() + L.wled.ZONE_NAMES[z].slice(1),
        title: 'LEDs ' + L.wled.ZONE_NAMES[z], sub: 'Anzahl der LEDs in dieser Zone (0 = keine)',
        get: function () { return String((w.counts && w.counts[z]) || 0); },
        validate: function (v) { return /^\d{1,4}$/.test(v); },
        set: function (v) {
          if (!w.counts) w.counts = { bl: 0, l: 0, t: 0, r: 0, br: 0 };
          w.counts[z] = +v;
          L.wled.refresh();
        } };
    }
    function set(k) { return function (v) { w[k] = v; L.wled.refresh(); }; }
    return {
      title: 'Zonen', crumb: 'Licht (WLED)',
      rows: function () {
        return [
          { t: 'head', label: 'LED-Kette' },
          { t: 'select', label: 'Anfang', opts: [['bm', 'Unten Mitte'], ['cbl', 'Ecke unten links'], ['cbr', 'Ecke unten rechts'], ['ctl', 'Ecke oben links'], ['ctr', 'Ecke oben rechts']],
            get: function () { return w.start; }, set: set('start') },
          { t: 'select', label: 'Richtung', opts: [['cw', 'Im Uhrzeigersinn'], ['ccw', 'Gegen den Uhrzeigersinn']],
            get: function () { return w.dir; }, set: set('dir') },
          { t: 'select', label: 'Abschnitte', opts: [['5', '5 Zonen'], ['fine', 'Fein (12 Abschnitte)']],
            get: function () { return w.fine ? 'fine' : '5'; }, set: function (v) { w.fine = v === 'fine'; L.wled.refresh(); } },
          { t: 'head', label: 'LEDs je Zone' },
          countRow('bl'), countRow('l'), countRow('t'), countRow('r'), countRow('br'),
          { t: 'info', label: 'Summe', value: L.wled.total(w.counts) + ' LEDs' },
          { t: 'action', label: 'Automatisch aufteilen', run: function () { L.wled.split().then(function () { renderMain(); }); } },
          { t: 'action', label: 'Zonen testen', run: function () { L.wled.zoneTest(); } },
          { t: 'note', label: 'Von vorne gesehen. Der Test färbt jede Zone: unten links rot, links orange, oben grün, rechts blau, unten rechts lila – innerhalb einer Zone wird es in Laufrichtung heller.' }
        ];
      }
    };
  }

  function rowsWeb() {
    var b = L.prefs.backend;
    var rows = [
      { t: 'toggle', label: 'Web-Backend', get: function () { return b.on; },
        set: function (v) { b.on = v; backendState = { text: v ? 'startet …' : 'aus', url: '' }; (v ? L.backend.start() : L.backend.stop()).then(updateWeb); } },
      { t: 'info', label: 'Adresse', value: backendState.url || (b.on ? '…' : 'aus') },
      { t: 'info', label: 'Status', value: backendState.text },
      { t: 'note', label: 'Im selben Netzwerk im Browser öffnen (PC oder Handy). Erste Funktion: eigene Vorschaubilder für jede App hochladen. Weitere Funktionen folgen.' }
    ];
    return rows;
  }

  function updateWeb() {
    return L.backend.status().then(function (st) {
      backendState = st;
      if (G.open && CATS[G.cat].id === 'web' && !G.stack.length) renderMain();
    });
  }

  // ------------------------------------------------------------------
  // Einstellungs-Ansicht
  // ------------------------------------------------------------------
  var G = { open: false, cat: 0, area: 'side', focus: 0, stack: [], rows: [], nodes: [], catNodes: [], ret: 'home' };

  function openSettings(catId) {
    if (S.mode === 'sheet') closeSheet();
    G.open = true;
    G.ret = 'home';
    S.mode = 'settings';
    var i = catId ? CATS.findIndex(function (c) { return c.id === catId; }) : -1;
    if (i >= 0) G.cat = i;
    G.area = 'side';
    G.stack = [];
    G.focus = 0;
    dom.brand.innerHTML = L.logo('set');
    dom.ver.textContent = 'Lumen ' + L.VERSION;
    renderCats();
    renderMain();
    dom.set.hidden = false;
    dom.set.classList.remove('in');
    void dom.set.offsetWidth;
    dom.set.classList.add('in');
    L.home.magReset(true);
    // Infos nachladen (IP, Backend-Status)
    L.backend.tvIp().then(function (ip) { tvIp = ip || 'unbekannt'; if (G.open && CATS[G.cat].id === 'general') renderMain(); });
    updateWeb();
  }

  function closeSettings() {
    closePop();
    G.open = false;
    dom.set.hidden = true;
    S.mode = 'home';
    L.main.bumpIdle();
  }

  function renderCats() {
    dom.cats.textContent = '';
    G.catNodes = CATS.map(function (c, i) {
      var n = document.createElement('div');
      n.className = 'set-cat';
      n.innerHTML = L.svg(c.icon, 'plain') + '<span></span>';
      n.querySelector('span').textContent = c.title;
      n.addEventListener('mouseenter', function () { if (G.area === 'side' && !D.open) selectCat(i); });
      n.addEventListener('click', function () { selectCat(i); G.area = 'main'; G.focus = 0; paint(); });
      dom.cats.appendChild(n);
      return n;
    });
    paint();
  }

  function selectCat(i) {
    if (i === G.cat && !G.stack.length) return;
    G.cat = clamp(i, 0, CATS.length - 1);
    G.stack = [];
    G.focus = 0;
    renderMain();
  }

  function page() {
    if (G.stack.length) return G.stack[G.stack.length - 1].page;
    var c = CATS[G.cat];
    return { title: c.title, sub: c.sub, rows: c.rows };
  }

  function valueText(r) {
    if (r.t === 'select') return opt(r.opts, r.get());
    if (r.t === 'text') return r.get() || '–';
    return r.value != null ? String(r.value) : '';
  }

  function renderMain() {
    var pg = page();
    dom.crumb.textContent = pg.crumb ? pg.crumb + ' ›' : '';
    dom.title.textContent = pg.title;
    dom.sub.textContent = pg.sub || '';
    var rows = pg.rows();
    G.rows = [];
    G.nodes = [];
    dom.list.textContent = '';
    var group = null;
    rows.forEach(function (r) {
      if (r.t === 'head') {
        var h = document.createElement('div');
        h.className = 'set-head';
        h.textContent = r.label;
        dom.list.appendChild(h);
        group = null;
        return;
      }
      if (r.t === 'note') {
        var nt = document.createElement('div');
        nt.className = 'set-note';
        nt.textContent = r.label;
        dom.list.appendChild(nt);
        group = null;
        return;
      }
      if (!group) {
        group = document.createElement('div');
        group.className = 'set-group';
        dom.list.appendChild(group);
      }
      var n = document.createElement('div');
      n.className = 'set-row t-' + r.t + (r.danger ? ' danger' : '');
      var lab = document.createElement('span');
      lab.className = 'set-label';
      lab.textContent = r.label;
      n.appendChild(lab);
      if (r.t === 'toggle') {
        var sw = document.createElement('span');
        sw.className = 'switch' + (r.get() ? ' on' : '');
        sw.innerHTML = '<i></i>';
        n.appendChild(sw);
      } else if (r.t === 'slider') {
        var sv = document.createElement('span');
        sv.className = 'set-val';
        n.appendChild(sv);
        var sl = document.createElement('span');
        sl.className = 'slider';
        sl.innerHTML = '<i></i><b></b>';
        n.appendChild(sl);
        paintSlider(n, r);
        (function (row, node, bar) {
          bar.addEventListener('click', function (ev) {
            ev.stopPropagation();
            var rc = bar.getBoundingClientRect();
            var f = clamp((ev.clientX - rc.left) / rc.width, 0, 1);
            setSlider(row, node, row.min + Math.round(f * (row.max - row.min) / row.step) * row.step);
          });
        })(r, n, sl);
      } else {
        var v = document.createElement('span');
        v.className = 'set-val';
        v.textContent = valueText(r);
        n.appendChild(v);
        if (r.t === 'select') n.insertAdjacentHTML('beforeend', L.svg('updown', 'plain set-ico'));
        if (r.t === 'nav') n.insertAdjacentHTML('beforeend', L.svg('chevron', 'plain set-ico'));
      }
      var idx = G.rows.length;
      G.rows.push(r);
      G.nodes.push(n);
      if (r.t !== 'info') {
        n.addEventListener('mouseenter', function () { if (!D.open) { G.area = 'main'; G.focus = idx; paint(); } });
        n.addEventListener('click', function () { G.area = 'main'; G.focus = idx; paint(); activateRow(); });
      }
      group.appendChild(n);
    });
    G.focus = clamp(G.focus, 0, Math.max(0, G.rows.length - 1));
    dom.list.style.transform = '';
    paint();
  }

  // Nur Fokus/Markierung neu setzen (ohne Neuaufbau)
  function paint() {
    G.catNodes.forEach(function (n, i) {
      n.classList.toggle('is-current', i === G.cat);
      n.classList.toggle('is-focused', i === G.cat && G.area === 'side');
    });
    G.nodes.forEach(function (n, i) { n.classList.toggle('is-focused', G.area === 'main' && i === G.focus); });
    dom.set.classList.toggle('area-main', G.area === 'main');
    keepVisible();
  }

  function keepVisible() {
    var n = G.nodes[G.focus];
    if (!n || G.area !== 'main') { if (G.area === 'side') dom.list.style.transform = ''; return; }
    var box = dom.scroll.clientHeight, top = n.offsetTop, h = n.offsetHeight;
    var cur = -(parseFloat((dom.list.style.transform.match(/-?[\d.]+/) || [0])[0]) || 0);
    if (top - cur < 80) cur = Math.max(0, top - 80);
    else if (top + h - cur > box - 60) cur = top + h - box + 60;
    var max = Math.max(0, dom.list.scrollHeight - box + 24);
    cur = clamp(cur, 0, max);
    dom.list.style.transform = cur ? 'translateY(' + (-cur) + 'px)' : '';
  }

  function paintSlider(n, r) {
    var v = clamp(+r.get() || 100, r.min, r.max), f = (v - r.min) / (r.max - r.min) * 100;
    n.querySelector('.set-val').textContent = v + ' %';
    n.querySelector('.slider i').style.width = f + '%';
    n.querySelector('.slider b').style.left = f + '%';
  }
  var sliderSave = null;
  function setSlider(r, n, v) {
    r.set(clamp(v, r.min, r.max));
    paintSlider(n, r);
    clearTimeout(sliderSave);
    sliderSave = setTimeout(save, 400);
  }

  function moveRow(d) {
    G.focus = clamp(G.focus + d, 0, G.rows.length - 1);
    paint();
  }

  function activateRow() {
    var r = G.rows[G.focus], n = G.nodes[G.focus];
    if (!r) return;
    if (r.t === 'toggle') {
      r.set(!r.get());
      save();
      var sw = n.querySelector('.switch');
      if (sw) sw.classList.toggle('on', !!r.get());
      setTimeout(rerenderKeep, 200);          // Schalter erst umlegen lassen, dann ggf. Zeilen ein-/ausblenden
    } else if (r.t === 'select') {
      openPop(n.querySelector('.set-val') || n, r.opts, r.get(), function (v) {
        r.set(v);
        save();
        rerenderKeep();
      });
    } else if (r.t === 'text') {
      openPrompt({
        title: r.title || r.label, sub: r.sub || '', value: r.get(), numeric: r.numeric, validate: r.validate,
        done: function (v) { r.set(v); save(); rerenderKeep(); }
      });
    } else if (r.t === 'nav') {
      G.stack.push({ page: r.page(), focus: G.focus });
      G.focus = 0;
      renderMain();
    } else if (r.t === 'action') {
      r.run();
      if (G.open) setTimeout(rerenderKeep, 60);
    }
  }

  function rerenderKeep() {
    if (!G.open) return;
    var f = G.focus;
    renderMain();
    G.focus = clamp(f, 0, G.rows.length - 1);
    paint();
  }

  function settingsKey(k, back) {
    var KEY = L.KEY;
    if (G.area === 'side') {
      if (k === KEY.UP) { selectCat(G.cat - 1); paint(); }
      else if (k === KEY.DOWN) { selectCat(G.cat + 1); paint(); }
      else if (k === KEY.RIGHT) { G.area = 'main'; paint(); }
      else if (back || k === KEY.LEFT) closeSettings();
      return;
    }
    var cur = G.rows[G.focus];
    if (cur && cur.t === 'slider' && (k === KEY.LEFT || k === KEY.RIGHT)) {
      setSlider(cur, G.nodes[G.focus], (+cur.get() || 100) + (k === KEY.RIGHT ? cur.step : -cur.step));
      return;
    }
    if (k === KEY.UP) moveRow(-1);
    else if (k === KEY.DOWN) moveRow(1);
    else if (k === KEY.LEFT) { G.area = 'side'; paint(); }
    else if (back) {
      if (G.stack.length) {
        var top = G.stack.pop();
        G.focus = top.focus;
        renderMain();
      } else { G.area = 'side'; paint(); }
    }
  }

  // ------------------------------------------------------------------
  // Dropdown (iOS-Pull-down-Menü)
  // ------------------------------------------------------------------
  var D = { open: false, opts: [], focus: 0, pick: null, nodes: [] };

  function openPop(anchor, opts, value, pick) {
    D.open = true;
    D.opts = opts;
    D.pick = pick;
    D.focus = Math.max(0, opts.findIndex(function (o) { return String(o[0]) === String(value); }));
    dom.popList.textContent = '';
    D.nodes = opts.map(function (o, i) {
      var n = document.createElement('div');
      n.className = 'pop-item' + (String(o[0]) === String(value) ? ' is-current' : '');
      n.innerHTML = L.svg('check', 'plain pop-check') + '<span></span>';
      n.querySelector('span').textContent = o[1];
      n.addEventListener('mouseenter', function () { D.focus = i; paintPop(); });
      n.addEventListener('click', function () { D.focus = i; choosePop(); });
      dom.popList.appendChild(n);
      return n;
    });
    var r = anchor.getBoundingClientRect();
    var w = 460, h = Math.min(opts.length, 8) * 68 + 16;
    var left = clamp(r.right - w + 28, 40, 1920 - w - 40);
    var top = r.bottom + 10, up = false;
    if (top + h > 1040) { top = Math.max(40, r.top - h - 10); up = true; }
    var p = dom.pop;
    p.style.left = left + 'px';
    p.style.top = top + 'px';
    p.style.width = w + 'px';
    p.classList.toggle('up', up);
    p.hidden = false;
    p.classList.remove('in');
    void p.offsetWidth;
    p.classList.add('in');
    paintPop();
  }

  function paintPop() {
    D.nodes.forEach(function (n, i) { n.classList.toggle('is-focused', i === D.focus); });
  }

  function choosePop() {
    var o = D.opts[D.focus], pick = D.pick;
    closePop();
    if (o && pick) pick(o[0]);
  }

  function closePop() {
    if (!D.open) return;
    D.open = false;
    D.pick = null;
    dom.pop.hidden = true;
  }

  function popKey(k, back) {
    var KEY = L.KEY;
    if (k === KEY.UP) { D.focus = clamp(D.focus - 1, 0, D.opts.length - 1); paintPop(); }
    else if (k === KEY.DOWN) { D.focus = clamp(D.focus + 1, 0, D.opts.length - 1); paintPop(); }
    else if (back || k === KEY.LEFT) closePop();
  }

  // ------------------------------------------------------------------
  // Texteingabe (Bildschirmtastatur von webOS)
  // ------------------------------------------------------------------
  var PR = null;
  function openPrompt(o) {
    PR = { o: o, ret: S.mode };
    S.mode = 'prompt';
    dom.pTitle.textContent = o.title || '';
    dom.pSub.textContent = o.sub || 'Mit der Bildschirmtastatur eingeben · OK speichert';
    var inp = dom.pInput;
    inp.value = o.value || '';
    inp.setAttribute('inputmode', o.numeric ? 'numeric' : 'text');
    inp.type = o.numeric ? 'tel' : 'text';
    dom.prompt.hidden = false;
    setTimeout(function () { try { inp.focus(); inp.select(); } catch (e) { /* ignorieren */ } }, 60);
  }
  function promptSave() {
    if (!PR) return;
    var v = dom.pInput.value.trim();
    if (PR.o.validate && !PR.o.validate(v)) { L.toast('Eingabe ungültig'); return; }
    var done = PR.o.done;
    closePrompt();
    if (done) done(v);
  }
  function closePrompt(cancelled) {
    if (!PR) return;
    var ret = PR.ret, cancel = PR.o.cancel;
    PR = null;
    dom.pInput.blur();
    dom.prompt.hidden = true;
    S.mode = ret === 'prompt' ? 'home' : ret;
    if (cancelled && cancel) cancel();
  }
  dom.pBtns.children[0].addEventListener('click', promptSave);
  dom.pBtns.children[1].addEventListener('click', function () { closePrompt(true); });

  // ------------------------------------------------------------------
  // Kontextmenü (Kachel lange drücken)
  // entries: {label, value?, opts?/get?/set?, run?, keep?, danger?}
  // ------------------------------------------------------------------
  var SH = { entries: [], nodes: [], focus: 0 };

  function openSheet(title, sub, entries, focus) {
    S.mode = 'sheet';
    SH.entries = entries;
    dom.shTitle.textContent = title;
    dom.shSub.textContent = sub || '';
    dom.shList.textContent = '';
    SH.nodes = entries.map(function (e, i) {
      var n = document.createElement('div');
      n.className = 'sheet-btn' + (e.danger ? ' danger' : '');
      var l = document.createElement('span');
      l.textContent = e.label;
      n.appendChild(l);
      var val = e.opts ? opt(e.opts, e.get()) : e.value;
      if (val != null && val !== '') {
        var v = document.createElement('span');
        v.className = 'val';
        v.textContent = val;
        n.appendChild(v);
        if (e.opts) n.insertAdjacentHTML('beforeend', L.svg('updown', 'plain set-ico'));
      }
      n.addEventListener('mouseenter', function () { if (!D.open) { SH.focus = i; paintSheet(); } });
      n.addEventListener('click', function () { SH.focus = i; paintSheet(); sheetActivate(); });
      dom.shList.appendChild(n);
      return n;
    });
    dom.sheet.hidden = false;
    SH.focus = clamp(focus || 0, 0, entries.length - 1);
    paintSheet();
  }
  function paintSheet() { SH.nodes.forEach(function (n, i) { n.classList.toggle('is-focused', i === SH.focus); }); }
  function sheetActivate() {
    var e = SH.entries[SH.focus], n = SH.nodes[SH.focus];
    if (!e) return;
    if (e.opts) {
      openPop(n.querySelector('.val') || n, e.opts, e.get(), function (v) { e.set(v); });
      return;
    }
    if (!e.keep) closeSheet();
    if (e.run) e.run();
  }
  function closeSheet() {
    closePop();
    dom.sheet.hidden = true;
    if (S.mode === 'sheet') S.mode = 'home';
  }
  function sheetKey(k, back) {
    var KEY = L.KEY;
    if (k === KEY.UP) { SH.focus = Math.max(0, SH.focus - 1); paintSheet(); }
    else if (k === KEY.DOWN) { SH.focus = Math.min(SH.entries.length - 1, SH.focus + 1); paintSheet(); }
    else if (back) closeSheet();
  }

  // App-Kachel
  function openAppMenu(app, focusLabel) {
    var list = S.rows[0].items, i = list.indexOf(app);
    var pv = S.previews[app.id] || {};
    var entries = [];
    if (i > 0) entries.push({ label: 'Nach links verschieben', keep: true, run: function () { moveApp(app, -1); } });
    if (i < list.length - 1) entries.push({ label: 'Nach rechts verschieben', keep: true, run: function () { moveApp(app, 1); } });
    entries.push({ label: 'Inhalt der Karte', opts: L.preview.CONTENT_OPTS,
      get: function () { return L.preview.contentOf(app.id); },
      set: function (v) {
        L.preview.setTile(app.id, { content: v });
        L.home.updateArt(L.home.currentItem(), true, false, true);
        var miss = (v === 'custom' && !pv.custom) || (v === 'shot' && !pv.shot);
        if (miss) L.toast(v === 'custom' ? 'Noch kein eigenes Bild – hochladen im Web-Backend' : 'Noch kein Bildschirmfoto – App öffnen und mit Home verlassen');
        openAppMenu(app, 'Inhalt der Karte');
      } });
    if (pv.shot) {
      entries.push({ label: pv.pinned ? 'Bildschirmfoto freigeben' : 'Bildschirmfoto festhalten', run: function () {
        L.preview.setPinned(app.id, !pv.pinned).then(function () {
          L.toast(pv.pinned ? 'Bildschirmfoto festgehalten – wird nicht mehr überschrieben' : 'Bildschirmfoto wird wieder automatisch aktualisiert');
        });
      } });
      entries.push({ label: 'Bildschirmfoto löschen', run: function () {
        L.preview.remove(app.id, 'shot').then(function () { L.home.updateArt(L.home.currentItem(), true, false, true); L.toast('Bildschirmfoto gelöscht'); });
      } });
    }
    if (pv.custom) {
      entries.push({ label: 'Eigenes Bild löschen', run: function () {
        L.preview.remove(app.id, 'custom').then(function () { L.home.updateArt(L.home.currentItem(), true, false, true); L.toast('Eigenes Bild gelöscht'); });
      } });
    }
    entries.push({ label: 'Ausblenden', run: function () { hideApp(app); } });
    entries.push({ label: 'Fertig' });
    var f = focusLabel ? entries.findIndex(function (e) { return e.label === focusLabel; }) : 0;
    openSheet(app.title, 'Kachel anpassen', entries, Math.max(0, f));
  }

  function moveApp(app, dir) {
    var ids = S.rows[0].items.map(function (a) { return a.id; });
    var i = ids.indexOf(app.id), j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    ids.splice(i, 1);
    ids.splice(j, 0, app.id);
    L.prefs.order = ids;
    save();
    L.home.rerender(app.id);
    openAppMenu(app, dir < 0 ? 'Nach links verschieben' : 'Nach rechts verschieben');
  }

  function hideApp(app) {
    if (L.prefs.hidden.indexOf(app.id) < 0) L.prefs.hidden.push(app.id);
    save();
    L.home.rerender();
    L.toast('„' + app.title + '“ ausgeblendet – zurückholen unter Anpassen → Apps');
  }

  // Eingang
  function openInputMenu(input, focus) {
    var p = L.inputPref(input.id);
    var names = L.INPUT_NAMES.map(function (n) { return [n, n || 'HDMI ' + input.n]; });
    if (p.name && L.INPUT_NAMES.indexOf(p.name) < 0) names.push([p.name, p.name]);
    openSheet('HDMI ' + input.n, 'Eingang anpassen', [
      { label: 'Name', opts: names, get: function () { return p.name || ''; }, set: function (v) {
        if (v) p.name = v; else delete p.name;
        save(); L.home.rerender(input.id);
        openInputMenu(L.S.rows[1].items.find(function (x) { return x.id === input.id; }) || input, 0);
      } },
      { label: 'Eigener Name …', keep: true, run: function () {
        openPrompt({ title: 'Name für HDMI ' + input.n, value: p.name || '',
          validate: function (v) { return v.length <= 24; },
          done: function (v) {
            if (v) p.name = v; else delete p.name;
            save(); L.home.rerender(input.id);
            closeSheet();
            L.toast(v ? 'HDMI ' + input.n + ' heißt jetzt „' + v + '“' : 'Name zurückgesetzt');
          } });
      } },
      { label: 'Ausblenden', run: function () { p.show = false; save(); L.home.rerender(); L.toast('HDMI ' + input.n + ' ausgeblendet'); } },
      { label: 'Fertig' }
    ], focus || 0);
  }

  // ------------------------------------------------------------------
  // Tasten (von main.js weitergereicht). true = verarbeitet.
  // ------------------------------------------------------------------
  function key(e, k, back) {
    var KEY = L.KEY;
    if (S.mode === 'prompt') {
      if (k === KEY.OK) { e.preventDefault(); promptSave(); }
      else if (k === KEY.BACK || k === KEY.ESC) { e.preventDefault(); closePrompt(true); }
      return true;                                  // alles andere gehört dem Eingabefeld
    }
    if (k === KEY.OK) return false;                 // OK wertet main.js beim Loslassen aus
    if (D.open) { e.preventDefault(); popKey(k, back); return true; }
    if (S.mode === 'settings') { e.preventDefault(); settingsKey(k, back); return true; }
    if (S.mode === 'sheet') { e.preventDefault(); sheetKey(k, back); return true; }
    return false;
  }

  // OK losgelassen
  function ok() {
    if (D.open) { choosePop(); return true; }
    if (S.mode === 'settings') {
      if (G.area === 'side') { G.area = 'main'; paint(); }
      else activateRow();
      return true;
    }
    if (S.mode === 'sheet') { sheetActivate(); return true; }
    return false;
  }

  // Daten haben sich geändert (z. B. App-Liste neu) – offene Ansicht auffrischen
  function refreshOpen() { if (G.open && !D.open) rerenderKeep(); }

  L.ui = {
    openSettings: openSettings, closeSettings: closeSettings, openAppMenu: openAppMenu,
    openInputMenu: openInputMenu, openSheet: openSheet, closeSheet: closeSheet,
    openPrompt: openPrompt, closePrompt: closePrompt, closePop: closePop, key: key, ok: ok,
    refreshOpen: refreshOpen, CATS: CATS,
    state: function () { return { open: G.open, cat: CATS[G.cat].id, area: G.area, focus: G.focus, pop: D.open, depth: G.stack.length }; }
  };
})(window.Lumen);
