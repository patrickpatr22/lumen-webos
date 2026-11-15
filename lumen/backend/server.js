/*
 * Lumen Web-Backend (Ansatz)
 * Kleiner HTTP-Server für den Fernseher, ohne Abhängigkeiten (Node.js von webOS).
 * Start (macht Lumen über den Homebrew Channel):  node server.js <port> <datenordner>
 *
 *   GET    /                    Weboberfläche
 *   GET    /api/status          Version, IP, Laufzeit, Apps, Vorschaubilder
 *   GET    /media/<art>/<datei> Vorschaubild (art = shots | previews)
 *   GET    /icon/<datei>        App-Symbol aus Lumens Zwischenspeicher
 *   PUT    /api/preview/<appId> eigenes Vorschaubild hochladen (JPEG/PNG als Rohdaten)
 *   DELETE /api/preview/<appId> eigenes Vorschaubild entfernen
 *   GET    /api/tiles           Einstellungen pro App (tiles.json)
 *   PUT    /api/tiles/<appId>   {"content": auto|custom|shot|logo, "tag": "Video"} setzen
 *   GET    /api/rev             Änderungszähler (Lumen fragt ihn ab und lädt bei Änderung neu)
 *
 * Absichtlich klein gehalten und nur im Heimnetz gedacht (keine Anmeldung).
 * In ES5 geschrieben, damit es auch mit älteren Node-Versionen auf dem TV läuft.
 */
'use strict';
var http = require('http');
var fs = require('fs');
var path = require('path');
var os = require('os');

var PORT = parseInt(process.argv[2], 10) || 8484;
var DATA = process.argv[3] || '/var/lib/webosbrew/lumen';
var APP = path.resolve(__dirname, '..');
var MAX_UPLOAD = 6 * 1024 * 1024;
var started = Date.now();
// Buffer.from gibt es erst ab Node 4.5 – ältere Fernseher kennen nur new Buffer
var toBuf = Buffer.from && Buffer.from !== Uint8Array.from ? function (s) { return Buffer.from(s); } : function (s) { return new Buffer(s); };

function version() {
  try { return JSON.parse(fs.readFileSync(path.join(APP, 'appinfo.json'), 'utf8')).version || '?'; }
  catch (e) { return '?'; }
}

function ips() {
  var out = [], nets = os.networkInterfaces();
  Object.keys(nets).forEach(function (k) {
    (nets[k] || []).forEach(function (n) {
      if ((n.family === 'IPv4' || n.family === 4) && !n.internal) out.push(n.address);
    });
  });
  return out;
}

function validId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9._-]{1,128}$/.test(id) && id.indexOf('..') < 0 && id.charAt(0) !== '.';
}

function mkdirp(dir) {
  try { fs.mkdirSync(dir); } catch (e) {
    if (e.code === 'EEXIST') return;
    if (e.code === 'ENOENT') { mkdirp(path.dirname(dir)); fs.mkdirSync(dir); return; }
    throw e;
  }
}

function send(res, code, body, type) {
  var buf = Buffer.isBuffer(body) ? body : toBuf(typeof body === 'string' ? body : JSON.stringify(body));
  res.writeHead(code, {
    'Content-Type': type || 'application/json; charset=utf-8',
    'Content-Length': buf.length,
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(buf);
}

function readJSON(file, def) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return def; }
}

function listMedia() {
  var map = {};
  ['shots', 'previews'].forEach(function (kind) {
    var dir = path.join(DATA, kind), files = [];
    try { files = fs.readdirSync(dir); } catch (e) { return; }
    files.forEach(function (f) {
      var m = f.match(/^(.+)\.(jpg|png|pin)$/);
      if (!m || !validId(m[1])) return;
      var id = m[1], p = map[id] || (map[id] = { id: id });
      if (m[2] === 'pin') { p.pinned = true; return; }
      var st;
      try { st = fs.statSync(path.join(dir, f)); } catch (e) { return; }
      var entry = { file: kind + '/' + f, mtime: st.mtime.getTime(), size: st.size };
      if (kind === 'previews') p.manual = entry; else p.shot = entry;
    });
  });
  return Object.keys(map).map(function (k) { return map[k]; });
}

// Bild in den dauerhaften Ordner und gespiegelt in den App-Ordner (dort liest Lumen)
function storePreview(id, buf, ext) {
  var targets = [path.join(DATA, 'previews'), path.join(APP, 'cache', 'previews')];
  targets.forEach(function (dir) {
    mkdirp(dir);
    ['jpg', 'png'].forEach(function (e) {
      if (e !== ext) { try { fs.unlinkSync(path.join(dir, id + '.' + e)); } catch (x) { /* fehlte */ } }
    });
    fs.writeFileSync(path.join(dir, id + '.' + ext), buf);
  });
}

function removePreview(id) {
  [path.join(DATA, 'previews'), path.join(APP, 'cache', 'previews')].forEach(function (dir) {
    ['jpg', 'png'].forEach(function (e) {
      try { fs.unlinkSync(path.join(dir, id + '.' + e)); } catch (x) { /* fehlte */ }
    });
  });
}

// ------------------------------------------------------------------
// Einstellungen pro App: tiles.json im dauerhaften Ordner (Lumen schreibt dieselbe Datei)
// ------------------------------------------------------------------
var CONTENT = ['auto', 'custom', 'shot', 'logo'];
var rev = Date.now();
function tilesFile() { return path.join(DATA, 'tiles.json'); }
function readTiles() {
  var t = readJSON(tilesFile(), {});
  return t && typeof t === 'object' && !Array.isArray(t) ? t : {};
}
function writeTiles(t) {
  mkdirp(DATA);
  var tmp = tilesFile() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(t));
  fs.renameSync(tmp, tilesFile());
  rev = Date.now();
}
function updateTile(id, patch) {
  var t = readTiles(), cur = t[id] || {};
  if (patch.content !== undefined) {
    if (CONTENT.indexOf(patch.content) < 0) throw new Error('Inhalt unbekannt');
    if (patch.content === 'auto') delete cur.content; else cur.content = patch.content;
  }
  if (patch.tag !== undefined) {
    var tag = String(patch.tag || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 32);
    if (tag) cur.tag = tag; else delete cur.tag;
  }
  if (Object.keys(cur).length) t[id] = cur; else delete t[id];
  writeTiles(t);
  return cur;
}
function readBody(req, max, cb) {
  var chunks = [], size = 0, tooBig = false;
  req.on('data', function (c) {
    size += c.length;
    if (size > max) { tooBig = true; return; }
    chunks.push(c);
  });
  req.on('end', function () { cb(tooBig ? null : Buffer.concat(chunks), tooBig); });
}

// ------------------------------------------------------------------
// Hintergründe: DATA/backgrounds (Lumen spiegelt sie in seinen Zwischenspeicher),
// Auswahl in DATA/ui.json {bg, stamp}
// ------------------------------------------------------------------
var MAX_BG = 12 * 1024 * 1024;
function bgDirs() { return [path.join(DATA, 'backgrounds'), path.join(APP, 'cache', 'backgrounds')]; }
function validBgFile(f) { return /^[A-Za-z0-9._ -]{1,80}\.(jpg|png)$/.test(f) && f.indexOf('..') < 0 && f.charAt(0) !== '.'; }
function listBackgrounds() {
  var dir = bgDirs()[0], out = [];
  var files = [];
  try { files = fs.readdirSync(dir); } catch (e) { return out; }
  files.forEach(function (f) {
    if (!validBgFile(f)) return;
    try { var st = fs.statSync(path.join(dir, f)); out.push({ file: f, size: st.size, mtime: Math.floor(st.mtime.getTime() / 1000) }); } catch (e) { /* weg */ }
  });
  return out.sort(function (a, b) { return b.mtime - a.mtime; });
}
function safeBgName(name) {
  var base = String(name || 'Hintergrund').replace(/\.[A-Za-z0-9]+$/, '').replace(/[^A-Za-z0-9._ -]+/g, '-')
    .replace(/^[.\s-]+/, '').replace(/\s+/g, ' ').trim().slice(0, 60);
  return base || 'Hintergrund';
}
function readUi() { var u = readJSON(path.join(DATA, 'ui.json'), {}); return u && typeof u === 'object' ? u : {}; }
function writeUi(u) {
  mkdirp(DATA);
  var f = path.join(DATA, 'ui.json');
  fs.writeFileSync(f + '.tmp', JSON.stringify(u));
  fs.renameSync(f + '.tmp', f);
  rev = Date.now();
}

function sniff(buf) {
  if (buf.length > 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'jpg';
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'png';
  return null;
}

function serveFile(res, file, type) {
  fs.readFile(file, function (err, buf) {
    if (err) return send(res, 404, { error: 'nicht gefunden' });
    send(res, 200, buf, type);
  });
}

var server = http.createServer(function (req, res) {
  var url = req.url.split('?')[0];
  var m;
  if (req.method === 'OPTIONS') return send(res, 204, '');

  if (req.method === 'GET' && (url === '/' || url === '/index.html')) {
    return serveFile(res, path.join(__dirname, 'index.html'), 'text/html; charset=utf-8');
  }
  if (req.method === 'GET' && url === '/api/status') {
    return send(res, 200, {
      app: 'Lumen', version: version(), node: process.version, ips: ips(), port: PORT,
      uptime: Math.round((Date.now() - started) / 1000), tvUptime: Math.round(os.uptime()),
      apps: readJSON(path.join(DATA, 'apps.json'), []), media: listMedia(), tiles: readTiles(), rev: rev,
      backgrounds: listBackgrounds(), ui: readUi()
    });
  }
  if (req.method === 'GET' && url === '/api/rev') return send(res, 200, { rev: rev });
  if (req.method === 'GET' && url === '/api/backgrounds') return send(res, 200, { backgrounds: listBackgrounds(), ui: readUi() });
  if (url === '/api/ui' && (req.method === 'PUT' || req.method === 'POST')) {
    readBody(req, 4096, function (buf, tooBig) {
      if (tooBig) return send(res, 413, { error: 'zu groß' });
      var j;
      try { j = JSON.parse(buf.toString('utf8') || '{}'); } catch (e) { return send(res, 400, { error: 'kein JSON' }); }
      var bg = String(j.bg || '');
      var okBg = bg === 'accent' || /^design:[a-z]{2,20}$/.test(bg) || (/^image:/.test(bg) && validBgFile(bg.slice(6)));
      if (!okBg) return send(res, 400, { error: 'unbekannter Hintergrund' });
      var u = readUi(); u.bg = bg; u.stamp = Date.now();
      try { writeUi(u); } catch (e) { return send(res, 500, { error: String(e.message || e) }); }
      send(res, 200, { ok: true, ui: u });
    });
    return null;
  }
  if ((m = url.match(/^\/api\/background\/([^/]+)$/))) {
    var bname = decodeURIComponent(m[1]);
    if (req.method === 'DELETE') {
      if (!validBgFile(bname)) return send(res, 400, { error: 'ungültiger Name' });
      bgDirs().forEach(function (d) { try { fs.unlinkSync(path.join(d, bname)); } catch (e) { /* schon weg */ } });
      var u0 = readUi();
      if (u0.bg === 'image:' + bname) { u0.bg = 'accent'; u0.stamp = Date.now(); writeUi(u0); } else rev = Date.now();
      return send(res, 200, { ok: true });
    }
    if (req.method === 'PUT' || req.method === 'POST') {
      readBody(req, MAX_BG, function (buf, tooBig) {
        if (tooBig) return send(res, 413, { error: 'Bild zu groß (max. 12 MB)' });
        var ext = sniff(buf);
        if (!ext) return send(res, 415, { error: 'nur JPEG oder PNG' });
        var base = safeBgName(bname), file = base + '.' + ext, k = 2;
        while (fs.existsSync(path.join(bgDirs()[0], file))) { file = base + ' ' + (k++) + '.' + ext; }
        try {
          bgDirs().forEach(function (d) { mkdirp(d); fs.writeFileSync(path.join(d, file), buf); });
        } catch (e) { return send(res, 500, { error: String(e.message || e) }); }
        rev = Date.now();
        send(res, 200, { ok: true, file: file });
      });
      return null;
    }
  }
  if (req.method === 'GET' && (m = url.match(/^\/media\/backgrounds\/([^/]+)$/))) {
    var bf = decodeURIComponent(m[1]);
    if (!validBgFile(bf)) return send(res, 404, { error: 'nicht gefunden' });
    return serveFile(res, path.join(bgDirs()[0], bf), /\.png$/.test(bf) ? 'image/png' : 'image/jpeg');
  }
  if (req.method === 'GET' && url === '/api/tiles') return send(res, 200, readTiles());
  if ((m = url.match(/^\/api\/tiles\/([^/]+)$/)) && (req.method === 'PUT' || req.method === 'POST')) {
    var tid = decodeURIComponent(m[1]);
    if (!validId(tid)) return send(res, 400, { error: 'ungültige App-ID' });
    readBody(req, 4096, function (buf, tooBig) {
      if (tooBig) return send(res, 413, { error: 'zu groß' });
      var patch;
      try { patch = JSON.parse(buf.toString('utf8') || '{}'); } catch (e) { return send(res, 400, { error: 'kein JSON' }); }
      try { send(res, 200, { ok: true, tile: updateTile(tid, patch || {}) }); }
      catch (e) { send(res, 400, { error: String(e.message || e) }); }
    });
    return null;
  }
  if (req.method === 'GET' && (m = url.match(/^\/icon\/([A-Za-z0-9._-]+\.(png|jpg|jpeg))$/)) && m[1].indexOf('..') < 0) {
    return serveFile(res, path.join(APP, 'cache', m[1]), m[2] === 'png' ? 'image/png' : 'image/jpeg');
  }
  if (req.method === 'GET' && (m = url.match(/^\/media\/(shots|previews)\/([^/]+)\.(jpg|png)$/))) {
    if (!validId(decodeURIComponent(m[2]))) return send(res, 400, { error: 'ungültig' });
    return serveFile(res, path.join(DATA, m[1], decodeURIComponent(m[2]) + '.' + m[3]), m[3] === 'png' ? 'image/png' : 'image/jpeg');
  }
  if ((m = url.match(/^\/api\/preview\/([^/]+)$/))) {
    var id = decodeURIComponent(m[1]);
    if (!validId(id)) return send(res, 400, { error: 'ungültige App-ID' });
    if (req.method === 'DELETE') {
      removePreview(id);
      rev = Date.now();
      return send(res, 200, { ok: true });
    }
    if (req.method === 'PUT' || req.method === 'POST') {
      var chunks = [], size = 0, tooBig = false;
      req.on('data', function (c) {
        size += c.length;
        if (size > MAX_UPLOAD) { tooBig = true; return; }
        chunks.push(c);
      });
      req.on('end', function () {
        if (tooBig) return send(res, 413, { error: 'Bild zu groß (max. 6 MB)' });
        var buf = Buffer.concat(chunks), ext = sniff(buf);
        if (!ext) return send(res, 415, { error: 'nur JPEG oder PNG' });
        try { storePreview(id, buf, ext); } catch (e) { return send(res, 500, { error: String(e.message || e) }); }
        rev = Date.now();
        send(res, 200, { ok: true, file: 'previews/' + id + '.' + ext });
      });
      return null;
    }
  }
  send(res, 404, { error: 'nicht gefunden' });
  return null;
});

server.on('error', function (e) {
  console.error('Lumen-Backend: ' + (e && e.message));
  process.exit(1);
});
server.listen(PORT, function () {
  console.log('Lumen-Backend läuft auf Port ' + PORT + ' (' + ips().join(', ') + ')');
});
