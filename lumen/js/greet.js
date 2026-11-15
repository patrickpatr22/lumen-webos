/*
 * Lumen – Begrüßung oben links: klassisch (mit Namen, je nach Tageszeit) oder
 * Meme-Zitate, die sich abwechseln (Schreibmaschine oder Überblenden).
 */
(function (L) {
  'use strict';

  // {n} wird durch den Namen ersetzt. Bei jedem Öffnen eine andere.
  var GREET = {
    any: ['Hallo, {n}', 'Willkommen zurück, {n}', 'Schön, dich zu sehen, {n}', 'Na, {n}?',
      'Was läuft heute, {n}?', 'Zurück am Start, {n}', 'Die Couch hat dich vermisst, {n}',
      'Bereit, wenn du es bist, {n}', 'Der Bildschirm gehört dir, {n}', 'Popcorn bereit, {n}?',
      'Controller oder Fernbedienung, {n}?', 'Schön, dass du da bist, {n}', 'Alles bereit, {n}',
      'Worauf hast du Lust, {n}?', 'Da bist du ja, {n}', 'Mach es dir bequem, {n}'],
    morning: ['Guten Morgen, {n}', 'Kaffee und Fernbedienung, {n}?', 'Früh auf den Beinen, {n}', 'Morgen, {n}'],
    noon: ['Mahlzeit, {n}', 'Mittagspause, {n}?', 'Guten Tag, {n}'],
    afternoon: ['Guten Tag, {n}', 'Zeit für eine Pause, {n}', 'Schönen Nachmittag, {n}'],
    evening: ['Guten Abend, {n}', 'Feierabend, {n}', 'Der Abend gehört dir, {n}', 'Abendprogramm, {n}?'],
    late: ['Eine Folge geht noch, {n}', 'Noch ein Stündchen, {n}?', 'Guten Abend, {n}'],
    night: ['Noch wach, {n}?', 'Nachteule {n}', 'Schlaflos, {n}?', 'Psst, {n} – alle anderen schlafen'],
    day: {
      0: ['Sonntagsmodus, {n}', 'Gemütlicher Sonntag, {n}'],
      1: ['Neue Woche, {n}'],
      5: ['Endlich Freitag, {n}'],
      6: ['Schönes Wochenende, {n}', 'Samstag, {n} – keine Termine']
    }
  };

  function greetPool() {
    var d = new Date(), h = d.getHours(), part;
    if (h < 5) part = GREET.night;
    else if (h < 11) part = GREET.morning;
    else if (h < 14) part = GREET.noon;
    else if (h < 18) part = GREET.afternoon;
    else if (h < 22) part = GREET.evening;
    else part = GREET.late;
    return GREET.any.concat(part, part, GREET.day[d.getDay()] || []);
  }

  // Zufällig, aber die letzten keep Einträge nicht wiederholen
  function pick(pool, key, keep) {
    var recent = L.prefs[key] || [];
    var fresh = pool.filter(function (g) { return recent.indexOf(g) < 0; });
    if (!fresh.length) fresh = pool;
    var g = fresh[Math.floor(Math.random() * fresh.length)];
    recent.push(g);
    while (recent.length > keep) recent.shift();
    L.prefs[key] = recent;
    L.savePrefs();
    return g;
  }

  function classicText() {
    var g = pick(greetPool(), 'recentGreets', 8);
    var name = (L.prefs.name || '').trim();
    return name ? g.replace('{n}', name) : g.replace(/,\s*\{n\}/, '').replace(/\s*\{n\}/, '');
  }

  function quoteText() {
    var pool = window.LUMEN_QUOTES || [];
    if (!pool.length) return classicText();
    var keep = Math.min(40, Math.max(1, Math.floor(pool.length * 0.6)));
    return '„' + pick(pool, 'recentQuotes', keep) + '“';
  }

  // ------------------------------------------------------------------
  // Anzeigen
  // ------------------------------------------------------------------
  var R = { typer: null, timer: null, swap: null, last: 0 };

  function show(text, quote) {
    var g = L.el.greet;
    clearInterval(R.typer);
    clearTimeout(R.swap);
    g.classList.toggle('quote', !!quote);
    var style = quote && document.body.classList.contains('anim') ? L.prefs.anim.quote : 'off';
    if (style === 'type') return type(g, text);
    if (style === 'fade' && g.textContent) {
      g.classList.add('out');
      R.swap = setTimeout(function () {
        g.textContent = text;
        g.classList.remove('out');
      }, 380);
      return;
    }
    g.textContent = text;
  }

  // Schreibmaschine: Buchstabe für Buchstabe, mit blinkendem Strich
  function type(g, text) {
    g.textContent = '';
    var span = document.createElement('span');
    var caret = document.createElement('i');
    caret.className = 'caret';
    g.appendChild(span);
    g.appendChild(caret);
    var i = 0, step = Math.max(16, Math.min(38, Math.round(1500 / Math.max(1, text.length))));
    R.typer = setInterval(function () {
      i++;
      span.textContent = text.slice(0, i);
      if (i >= text.length) {
        clearInterval(R.typer);
        R.swap = setTimeout(function () { if (caret.parentNode) caret.parentNode.removeChild(caret); }, 2200);
      }
    }, step);
  }

  function next() {
    var mode = L.prefs.greet;
    L.el.greet.hidden = mode === 'off';
    if (mode === 'off') return;
    R.last = Date.now();
    show(mode === 'quotes' ? quoteText() : classicText(), mode === 'quotes');
  }

  // Zitate wechseln im Takt (nur solange Lumen sichtbar ist)
  function start() {
    clearInterval(R.timer);
    R.timer = setInterval(function () {
      var every = +L.prefs.quoteEvery || 0;
      if (L.prefs.greet !== 'quotes' || !every || document.hidden) return;
      if (L.S.mode === 'saver' || L.S.mode === 'boot') return;
      if (Date.now() - R.last >= every * 1000) next();
    }, 1000);
  }

  L.greet = { next: next, start: start, quoteText: quoteText, classicText: classicText };
})(window.Lumen);
