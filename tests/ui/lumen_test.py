# Lumen 1.5 – Funktionstests mit nachgebildetem webOS-Bus (Luna, Homebrew-Exec) und WLED.
import asyncio, json, re, subprocess, os, time, sys
from playwright.async_api import async_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
APPDIR = os.environ.get("LUMEN_DIR", os.path.join(REPO, "lumen"))
OUT = os.environ.get("TEST_OUT", "/tmp/lumen-test")
os.makedirs(OUT, exist_ok=True)
URL = "file://" + APPDIR + "/index.html"

FAKE = r"""
window.__calls = []; window.__execs = []; window.__activated = 0;
window.__bootId = %BOOTID%;
window.__listing = %LISTING%;
window.PalmSystem = { launchParams: %PARAMS%, activate: function(){ window.__activated++; } };
window.PalmServiceBridge = function(){ this.onservicecallback = null; };
window.PalmServiceBridge.prototype.call = function(uri, payload) {
  var self = this, res; window.__calls.push(uri + ' ' + payload);
  if (uri.indexOf('listApps') >= 0) res = { returnValue: true, apps: window.__apps };
  else if (uri.indexOf('getAllInputStatus') >= 0) res = { returnValue: true, devices: [
    { appId: 'com.webos.app.hdmi1', hdmiPlugIn: true }, { appId: 'com.webos.app.hdmi2', hdmiPlugIn: true },
    { appId: 'com.webos.app.hdmi3', hdmiPlugIn: false }, { appId: 'com.webos.app.hdmi4', hdmiPlugIn: false } ] };
  else if (uri.indexOf('connectionmanager/getStatus') >= 0) res = { returnValue: true, wired: { state: 'connected', ipAddress: '192.168.178.45' } };
  else if (uri.indexOf('hbchannel.service/exec') >= 0) {
    var cmd = JSON.parse(payload).command; window.__execs.push(cmd);
    var out = 'ok';
    if (cmd.indexOf('boot_id') >= 0) out = window.__bootId;
    else if (cmd.indexOf('stat -c %Y') >= 0) out = window.__listing;
    else if (cmd.indexOf('server.js') >= 0) out = 'started';
    else if (cmd.indexOf('getAppInfo') >= 0) out = window.__barInstalled ? '{"appInfo":{"folderPath":"/x"},"returnValue":true}' : '{"returnValue":false}';
    res = { returnValue: true, stdoutString: out };
  }
  else res = { returnValue: true };
  setTimeout(function(){ self.onservicecallback(JSON.stringify(res)); }, 12);
};
window.__apps = ['youtube.leanback.v4','netflix','amazon','com.webos.app.mediadiscovery','spotify-beehive','com.apple.appletv','com.disney.disneyplus-prod'].map(function(id, i){
  return { id: id, title: ['YouTube','Netflix','Prime Video','Media Player','Spotify','Apple TV','Disney+'][i],
           folderPath: '/usr/palm/applications/' + id, icon: 'icon.png', visible: true,
           iconColor: ['#ff0000','#e50914','#00a8e1','#3b82f6','#1db954','#222222','#113ccf'][i] };
});
window.__hidden = false;
Object.defineProperty(document, 'hidden', { configurable: true, get: function(){ return window.__hidden; } });
window.__setHidden = function(h){ window.__hidden = h; document.dispatchEvent(new Event('visibilitychange')); };
window.__relaunch = function(params){ PalmSystem.launchParams = JSON.stringify(params); document.dispatchEvent(new Event('webOSRelaunch')); };
// monotone Uhr steuerbar (Standby simulieren)
(function(){ var orig = performance.now.bind(performance); window.__sleepMs = 0; performance.now = function(){ return orig() - window.__sleepMs; }; })();
"""
STATE = {"on": True, "bri": 140, "transition": 7, "ps": -1, "pl": -1,
         "seg": [{"id": 0, "start": 0, "stop": 120, "len": 120, "on": True, "bri": 255, "grp": 1, "spc": 0, "of": 0,
                  "col": [[255, 160, 0], [0, 0, 0], [0, 0, 0]], "fx": 9, "sx": 128, "ix": 128, "pal": 11, "sel": True, "n": "TV"}]}
EFFECTS = ["Solid", "Blink", "Breathe", "Wipe"] + ["FX%d" % i for i in range(4, 17)] + ["Twinkle", "Dissolve", "Dissolve Rnd", "Sparkle"]
INFO = {"name": "TV-LEDs", "leds": {"count": 120, "maxseg": 16}, "ver": "0.15.0"}
CORS = {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "*", "Access-Control-Allow-Headers": "*"}

fails = []
def check(n, c, extra=''):
    print(("OK   " if c else "FAIL ") + n + (('  → ' + str(extra)[:700]) if (extra != '' and not c) else ''))
    if not c: fails.append(n)

BOOT_TOTAL = 5200   # Intro 3,5 s + Flug 1 s + Reserve

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome", args=["--allow-file-access-from-files"])

        async def new_page(params=None, prefs=None, boot_id='"boot-1"', listing='""', local=None, wled=None, extra=''):
            ctx = await b.new_context(viewport={"width": 1920, "height": 1080})
            init = "localStorage.clear();"
            if prefs is not None: init += "localStorage.setItem('lumen.prefs.v1', %s);" % json.dumps(json.dumps(prefs))
            for k, v in (local or {}).items(): init += "localStorage.setItem(%s, %s);" % (json.dumps(k), json.dumps(v))
            await ctx.add_init_script(init)
            await ctx.add_init_script(FAKE.replace('%PARAMS%', json.dumps(json.dumps(params or {})))
                                      .replace('%BOOTID%', boot_id).replace('%LISTING%', listing) + extra)
            reqs = []
            if wled is not None:
                async def handler(route):
                    rq = route.request
                    reqs.append((rq.method, rq.url, rq.post_data, time.time()))
                    if wled == 'down': await route.abort(); return
                    if rq.method == 'OPTIONS': await route.fulfill(status=200, headers=CORS, body=''); return
                    if rq.url.endswith('/json'):
                        await route.fulfill(status=200, headers={**CORS, 'Content-Type': 'application/json'},
                                            body=json.dumps({"state": STATE, "info": INFO, "effects": EFFECTS})); return
                    if rq.url.endswith('/json/info'):
                        await route.fulfill(status=200, headers={**CORS, 'Content-Type': 'application/json'}, body=json.dumps(INFO)); return
                    await route.fulfill(status=200, headers={**CORS, 'Content-Type': 'application/json'}, body='{"success":true}')
                await ctx.route(re.compile(r"^http://(192\.168\.178\.60|10\.0\.0\.9)/"), handler)
            pg = await ctx.new_page()
            errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
            await pg.goto(URL)
            return ctx, pg, reqs, errs

        st = lambda pg: pg.evaluate("""({mode: Lumen.S.mode, boot: !document.getElementById('boot').hidden, bootPlay: document.getElementById('boot').classList.contains('play'),
            exit: document.getElementById('boot').classList.contains('exit'), cls: document.body.className, row: Lumen.S.focus.row, col: Lumen.S.focus.col,
            title: document.getElementById('hero-title').textContent, tag: document.querySelector('#hero-tag span').textContent})""")

        # ---------- 1. Start-Animation ----------
        ctx, pg, reqs, errs = await new_page({}, None, boot_id='"boot-A"')
        await pg.wait_for_timeout(600)
        s1 = await st(pg)
        check("Kaltstart nach Neustart: Start-Animation läuft", s1['boot'] and s1['bootPlay'] and s1['mode'] == 'boot', s1)
        await pg.wait_for_timeout(3200)
        s2 = await st(pg)
        check("nach dem Intro: Flug in die Startseite", s2['boot'] and s2['exit'], s2)
        await pg.wait_for_timeout(1300)
        s3 = await st(pg)
        check("danach Startseite, Overlay weg", (not s3['boot']) and s3['mode'] == 'home', s3)
        bid = await pg.evaluate("localStorage.getItem('lumen.bootid')")
        check("boot_id gemerkt", bid == 'boot-A', bid)
        check("keine Seitenfehler (1a)", not errs, errs)
        await ctx.close()

        # Laden dauert länger: Logo hält an, bis alles bereit ist
        ctx, pg, reqs, errs = await new_page({}, None, boot_id='"boot-H"', extra="""
          (function(){ var orig = window.PalmServiceBridge.prototype.call;
            window.PalmServiceBridge.prototype.call = function(uri, payload) {
              var self = this;
              if (uri.indexOf('getAllInputStatus') >= 0) { var a = arguments; setTimeout(function(){ orig.apply(self, a); }, 3900); return; }
              return orig.apply(this, arguments); }; })();""")
        await pg.wait_for_timeout(3800)
        s1 = await st(pg)
        check("Laden noch nicht fertig: Logo hält an (kein Flug)", s1['boot'] and not s1['exit'], s1)
        await pg.wait_for_timeout(1500)
        s2 = await st(pg)
        check("sobald geladen: Flug beginnt", s2['exit'] or not s2['boot'], s2)
        await ctx.close()

        ctx, pg, reqs, errs = await new_page({}, None, boot_id='"boot-A"', local={'lumen.bootid': 'boot-A'})
        await pg.wait_for_timeout(500)
        s1 = await st(pg)
        check("Kaltstart ohne Neustart: kein Logo, Startseite taucht auf", (not s1['boot']) and 'build-reveal' in s1['cls'], s1)
        await ctx.close()

        ctx, pg, reqs, errs = await new_page({}, None, boot_id='"boot-B"')
        await pg.wait_for_timeout(700)
        await pg.keyboard.press("ArrowRight"); await pg.wait_for_timeout(450)
        s1 = await st(pg)
        check("Taste überspringt die Start-Animation", (not s1['boot']) and s1['mode'] == 'home' and s1['col'] == 0, s1)
        check("keine Seitenfehler (1b)", not errs, errs)
        await ctx.close()

        # ---------- 2. Home / Source / Standby: nichts wird ausgeblendet oder neu aufgebaut ----------
        ctx, pg, reqs, errs = await new_page({}, {"anim": {"boot": "power"}}, boot_id='"boot-C"', local={'lumen.bootid': 'boot-C'})
        await pg.wait_for_timeout(1800)
        await pg.keyboard.press("ArrowRight"); await pg.wait_for_timeout(250); await pg.keyboard.press("ArrowRight"); await pg.wait_for_timeout(500)
        await pg.evaluate("window.__relaunch({focus:'inputs', key:'source'})"); await pg.wait_for_timeout(150)
        s1 = await st(pg)
        check("Source (Lumen sichtbar): direkt in die Eingänge, ohne Aufbau", s1['row'] == 1 and s1['col'] == 0 and 'building' not in s1['cls'] and s1['mode'] == 'home', s1)
        await pg.keyboard.press("ArrowUp"); await pg.wait_for_timeout(200)
        for _ in range(2): await pg.keyboard.press("ArrowRight"); await pg.wait_for_timeout(250)
        await pg.wait_for_timeout(400)
        await pg.evaluate("window.__setHidden(true)"); await pg.wait_for_timeout(120)
        vis = await pg.evaluate("""(() => { const v = s => getComputedStyle(document.querySelector(s)); return [v('#hero').visibility, v('#art').visibility, v('#rows').visibility, v('#bg').opacity]; })()""")
        check("im Hintergrund bleibt alles stehen (kein Ausblenden)", vis == ['visible', 'visible', 'visible', '1'], vis)
        await pg.evaluate("window.__hidden = false; window.__relaunch({focus:'apps'})"); await pg.wait_for_timeout(200)
        s1 = await st(pg)
        check("Home aus einer App: Auswahl bleibt, kein Aufbau, kein Logo", s1['row'] == 0 and s1['col'] == 2 and 'building' not in s1['cls'] and not s1['boot'], s1)
        act = await pg.evaluate("window.__activated")
        check("in den Vordergrund geholt (activate)", act >= 1, act)
        await pg.evaluate("window.__relaunch({focus:'apps'})"); await pg.wait_for_timeout(150)
        s1 = await st(pg)
        check("Home in Lumen selbst: zur ersten App", s1['row'] == 0 and s1['col'] == 0, s1)
        await pg.evaluate("Lumen.prefs.homeFocus = 'first'; window.__setHidden(true)"); await pg.wait_for_timeout(60)
        await pg.keyboard.press("ArrowRight")
        await pg.evaluate("window.__hidden = false; window.__relaunch({focus:'apps'})"); await pg.wait_for_timeout(150)
        s1 = await st(pg)
        check("Einstellung „Erste App“: Home springt nach vorn", s1['col'] == 0 and s1['row'] == 0, s1)
        await pg.evaluate("Lumen.prefs.homeFocus = 'last'; Lumen.prefs.anim.build = 'soft'; window.__setHidden(true)"); await pg.wait_for_timeout(60)
        await pg.evaluate("window.__hidden = false; window.__relaunch({focus:'apps'})"); await pg.wait_for_timeout(120)
        s1 = await st(pg)
        check("Rückkehr „Sanft“ wählbar", 'build-soft' in s1['cls'], s1)
        await pg.evaluate("Lumen.prefs.anim.build = 'none'"); await pg.wait_for_timeout(1600)
        await pg.evaluate("window.__setHidden(true)"); await pg.wait_for_timeout(50)
        await pg.evaluate("window.__hidden = false; window.__relaunch({focus:'inputs', key:'source'})"); await pg.wait_for_timeout(150)
        s1 = await st(pg)
        check("Source aus einer App: Hauptmenü mit Eingängen", s1['row'] == 1 and not s1['boot'], s1)
        await pg.evaluate("Lumen.prefs.sourceFocus = 'apps'; window.__setHidden(true)"); await pg.wait_for_timeout(50)
        await pg.evaluate("window.__hidden = false; window.__relaunch({focus:'inputs', key:'source'})"); await pg.wait_for_timeout(150)
        s1 = await st(pg)
        check("Source-Taste = Apps auswählen", s1['row'] == 0 and s1['col'] == 0, s1)
        await pg.evaluate("window.__setHidden(true)"); await pg.wait_for_timeout(50)
        await pg.evaluate("window.__sleepMs = 300000; window.__hidden = false; window.__relaunch({focus:'apps'})"); await pg.wait_for_timeout(250)
        s1 = await st(pg)
        check("nach dem Einschalten aus dem Standby: Start-Animation", s1['boot'] and s1['bootPlay'], s1)
        await pg.wait_for_timeout(BOOT_TOTAL)
        # frisches Bildschirmfoto der gerade gewählten App → weich überblenden
        os.makedirs(APPDIR + '/cache/shots', exist_ok=True)
        subprocess.run(['cp', os.path.join(HERE, 'fixtures', 'demo-a.jpg'), APPDIR + '/cache/shots/youtube.leanback.v4.jpg'])
        subprocess.run(['cp', os.path.join(HERE, 'fixtures', 'demo-b.jpg'), APPDIR + '/cache/shots/youtube2.jpg'])
        await pg.evaluate("Lumen.home.goFirst(0)"); await pg.wait_for_timeout(300)
        await pg.evaluate("window.__setHidden(true)"); await pg.wait_for_timeout(50)
        await pg.evaluate("window.__hidden = false; window.__relaunch({focus:'apps', shot:'youtube.leanback.v4', t:'1731600000'})"); await pg.wait_for_timeout(700)
        src = await pg.evaluate("[...document.querySelectorAll('#art .art-shot')].map(i => i.getAttribute('src'))")
        check("go-home-Bild sofort in der Karte", any('t=1731600000' in x for x in src), src)
        await pg.evaluate("window.__setHidden(true)"); await pg.wait_for_timeout(50)
        await pg.evaluate("window.__hidden = false; window.__relaunch({focus:'apps', shot:'youtube.leanback.v4', t:'1731600999'})"); await pg.wait_for_timeout(250)
        xf = await pg.evaluate("({imgs: [...document.querySelectorAll('#art .art-shot')].map(i => i.className + '|' + i.getAttribute('src')), swap: document.getElementById('art').className})")
        check("neues Bild derselben App blendet über (kein Einfliegen)", any('xf' in x and '1731600999' in x for x in xf['imgs']), xf)
        await pg.wait_for_timeout(900)
        n = await pg.evaluate("document.querySelectorAll('#art .art-shot').length")
        check("nach dem Überblenden nur noch ein Bild", n == 1, n)
        vis = await pg.evaluate("({paused: document.body.classList.contains('paused'), op: getComputedStyle(document.querySelector('.art-card')).opacity})")
        check("nach der Rückkehr laufen Animationen wieder, Karte sichtbar", not vis['paused'] and vis['op'] == '1', vis)
        badge = await pg.evaluate("document.querySelector('#art .art-badge')")
        check("keine Zusatztexte mehr in der Karte", badge is None, badge)
        await pg.screenshot(path=os.path.join(OUT, 't-shot-card.png'), clip={'x': 1150, 'y': 120, 'width': 740, 'height': 470})
        subprocess.run(['rm', '-rf', APPDIR + '/cache'])
        check("keine Seitenfehler (2)", not errs, errs)
        await ctx.close()

        # ---------- 3. Vorschaubilder und Inhalt pro App ----------
        listing = json.dumps("shots/netflix.jpg 1731500000\nshots/netflix.pin 1731500001\nshots/amazon.jpg 1731400000\npreviews/amazon.png 1731600000\n"
                             "@@tiles\n{\"amazon\":{\"content\":\"shot\"},\"netflix\":{\"tag\":\"Serienabend\"}}\nend")
        ctx, pg, reqs, errs = await new_page({}, {"anim": {"boot": "off"}}, listing=listing)
        await pg.wait_for_timeout(1600)
        pv = await pg.evaluate("Lumen.S.previews")
        check("Bestand gelesen: Bildschirmfoto, festgehalten, eigenes Bild", pv['netflix'].get('pinned') and pv['netflix']['shot'] and pv['amazon']['custom']['src'].startswith('cache/previews/amazon.png'), pv)
        tl = await pg.evaluate("Lumen.S.tiles")
        check("Einstellungen pro App gelesen (tiles.json)", tl == {"amazon": {"content": "shot"}, "netflix": {"tag": "Serienabend"}}, tl)
        k = await pg.evaluate("Lumen.preview.keyFor(Lumen.S.rows[0].items.find(a => a.id === 'amazon'))")
        check("„Letzter Bildschirm“ zeigt das Foto, obwohl ein eigenes Bild da ist", 'cache/shots/amazon.jpg' in k, k)
        await pg.keyboard.press("ArrowRight"); await pg.wait_for_timeout(600)
        s1 = await st(pg)
        check("eigene Eigenschaft unter dem Titel", s1['title'] == 'Netflix' and s1['tag'] == 'Serienabend', s1)
        mk = [c for c in await pg.evaluate("window.__execs") if 'stat -c %Y' in c]
        check("Spiegeln aus dem dauerhaften Ordner, tiles.json mitgelesen", mk and 'cp -f' in mk[0] and 'tiles.json' in mk[0], mk[:1])
        # Kontextmenü: Netflix lange drücken
        await pg.keyboard.down("Enter"); await pg.wait_for_timeout(750); await pg.keyboard.up("Enter"); await pg.wait_for_timeout(300)
        labels = await pg.evaluate("[...document.querySelectorAll('#sheet .sheet-btn')].map(n => n.firstChild.textContent)")
        check("Kontextmenü: Inhalt der Karte, Foto freigeben/löschen", 'Inhalt der Karte' in labels and 'Bildschirmfoto freigeben' in labels and 'Bildschirmfoto löschen' in labels, labels)
        idx = labels.index('Inhalt der Karte')
        for _ in range(idx): await pg.keyboard.press("ArrowDown"); await pg.wait_for_timeout(40)
        await pg.keyboard.press("Enter"); await pg.wait_for_timeout(300)
        items = await pg.evaluate("[...document.querySelectorAll('.pop-item span')].map(n=>n.textContent)")
        check("Auswahl: Automatisch / Eigenes Bild / Letzter Bildschirm / App-Symbol", items == ['Automatisch', 'Eigenes Bild', 'Letzter Bildschirm', 'App-Symbol'], items)
        for _ in range(3): await pg.keyboard.press("ArrowDown"); await pg.wait_for_timeout(40)
        await pg.keyboard.press("Enter"); await pg.wait_for_timeout(500)
        w = [c for c in await pg.evaluate("window.__execs") if 'tiles.json.tmp' in c]
        check("App-Symbol gewählt → tiles.json geschrieben", w and '"content":"logo"' in w[-1] and '"tag":"Serienabend"' in w[-1], w[-1:] if w else w)
        await pg.keyboard.press("Escape"); await pg.wait_for_timeout(700)
        face = await pg.evaluate("({shot: !!document.querySelector('#art .art-shot'), icon: !!document.querySelector('#art .art-icon, #art .art-letter')})")
        check("Karte zeigt jetzt das App-Symbol", not face['shot'] and face['icon'], face)
        auto = [c for c in await pg.evaluate("window.__execs") if 'autoshot.on' in c]
        check("Schalter für go-home gesetzt (autoshot.on)", auto and 'touch' in auto[0], auto)
        check("Eingänge für die Leiste geteilt (inputs.json)", any('inputs.json' in c for c in await pg.evaluate("window.__execs")))
        check("keine Seitenfehler (3)", not errs, errs)
        await ctx.close()

        # ---------- 4. Einstellungen: Kategorien, Dropdown, Regler, Leiste ----------
        ctx, pg, reqs, errs = await new_page({}, {"anim": {"boot": "off"}}, extra="window.__barInstalled = true;")
        await pg.wait_for_timeout(1500)
        await pg.keyboard.press("ArrowDown"); await pg.wait_for_timeout(150)
        for _ in range(8): await pg.keyboard.press("ArrowRight"); await pg.wait_for_timeout(50)
        await pg.keyboard.press("Enter"); await pg.wait_for_timeout(500)
        u = await pg.evaluate("Lumen.ui.state()")
        check("Anpassen öffnet die Einstellungen (Allgemein, links)", u['open'] and u['cat'] == 'general' and u['area'] == 'side', u)
        cats = await pg.evaluate("[...document.querySelectorAll('.set-cat span')].map(n => n.textContent)")
        check("8 Kategorien", cats == ['Allgemein', 'Darstellung', 'Animationen', 'Vorschau', 'Apps', 'Eingänge', 'Licht (WLED)', 'Web-Backend'], cats)
        # Source-Taste → Leiste
        await pg.keyboard.press("ArrowRight"); await pg.keyboard.press("ArrowDown"); await pg.wait_for_timeout(100)
        await pg.keyboard.press("Enter"); await pg.wait_for_timeout(300)
        items = await pg.evaluate("[...document.querySelectorAll('.pop-item span')].map(n=>n.textContent)")
        check("Source-Taste: Lumen · Eingänge / Lumen · Apps / Leiste", items == ['Lumen · Eingänge', 'Lumen · Apps', 'Leiste über dem Bild (Test)'], items)
        await pg.keyboard.press("ArrowDown"); await pg.keyboard.press("ArrowDown"); await pg.keyboard.press("Enter"); await pg.wait_for_timeout(700)
        ex = await pg.evaluate("window.__execs")
        t = await pg.evaluate("document.getElementById('toast').textContent")
        check("Leiste eingeschaltet: leiste.on gesetzt, Installation geprüft", any('touch' in c and 'leiste.on' in c for c in ex) and any('getAppInfo' in c for c in ex) and 'Leiste' in t, [t])
        await pg.keyboard.press("ArrowLeft"); await pg.keyboard.press("ArrowDown"); await pg.keyboard.press("ArrowDown"); await pg.wait_for_timeout(150)
        await pg.keyboard.press("ArrowRight"); await pg.wait_for_timeout(100)
        await pg.keyboard.press("ArrowDown"); await pg.wait_for_timeout(150)
        lab = await pg.evaluate("document.querySelector('.set-row.is-focused .set-label').textContent")
        check("Animationen: Regler „App-Reihe“ erreichbar", lab == 'App-Reihe', lab)
        tk0 = await pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--tk').trim()")
        await pg.keyboard.press("ArrowLeft"); await pg.wait_for_timeout(80); await pg.keyboard.press("ArrowLeft"); await pg.wait_for_timeout(500)
        r = await pg.evaluate("({v: Lumen.prefs.anim.tileSpeed, tk: getComputedStyle(document.documentElement).getPropertyValue('--tk').trim(), area: Lumen.ui.state().area, txt: document.querySelector('.set-row.is-focused .set-val').textContent, saved: JSON.parse(localStorage.getItem('lumen.prefs.v1')).anim.tileSpeed})")
        check("Links verlangsamt (80 → 60 %), Zeitfaktor steigt, bleibt in der Liste", tk0 == '1.25' and r['v'] == 60 and r['tk'] == '1.667' and r['area'] == 'main' and r['txt'] == '60 %' and r['saved'] == 60, [tk0, r])
        dur = await pg.evaluate("getComputedStyle(document.querySelector('.track')).transitionDuration")
        check("App-Reihe läuft jetzt langsamer (Übergang ≈ 633 ms)", abs(float(dur.replace('s', '')) - 0.633) < 0.01, dur)
        await pg.keyboard.press("ArrowDown"); await pg.wait_for_timeout(80)
        for _ in range(6): await pg.keyboard.press("ArrowRight"); await pg.wait_for_timeout(40)
        await pg.wait_for_timeout(450)
        r = await pg.evaluate("({v: Lumen.prefs.anim.cardSpeed, ck: getComputedStyle(document.documentElement).getPropertyValue('--ck').trim()})")
        check("Regler „Vorschaukarte“ bis 140 %", r == {'v': 140, 'ck': '0.714'}, r)
        # Hauptschalter aus
        await pg.keyboard.press("ArrowUp"); await pg.keyboard.press("ArrowUp"); await pg.wait_for_timeout(100)
        await pg.keyboard.press("Enter"); await pg.wait_for_timeout(450)
        a = await pg.evaluate("({on: Lumen.prefs.anim.on, cls: document.body.className, swap: document.body.dataset.swap, rows: document.querySelectorAll('.set-row').length})")
        check("Hauptschalter aus: alles aus, Unteroptionen versteckt", (not a['on']) and 'anim' not in a['cls'].split() and a['swap'] == 'off' and a['rows'] == 1, a)
        await pg.keyboard.press("Enter"); await pg.wait_for_timeout(450)
        labels = await pg.evaluate("[...document.querySelectorAll('.set-row .set-label')].map(n=>n.textContent)")
        for _ in range(labels.index('Vorschau-Wechsel')): await pg.keyboard.press("ArrowDown"); await pg.wait_for_timeout(30)
        await pg.keyboard.press("Enter"); await pg.wait_for_timeout(250)
        items = await pg.evaluate("[...document.querySelectorAll('.pop-item span')].map(n=>n.textContent)")
        check("Vorschau-Wechsel mit „Aufsteigen“", 'Aufsteigen' in items and items[0] == 'Einfliegen & Drehen', items)
        await pg.keyboard.press("ArrowDown"); await pg.keyboard.press("Enter"); await pg.wait_for_timeout(250)
        check("Aufsteigen gewählt", await pg.evaluate("Lumen.prefs.anim.swap === 'rise' && document.body.dataset.swap === 'rise'"))
        await pg.keyboard.press("Escape"); await pg.keyboard.press("Escape"); await pg.wait_for_timeout(200)
        u = await pg.evaluate("({ui: Lumen.ui.state(), mode: Lumen.S.mode})")
        check("Zurück, Zurück → geschlossen", (not u['ui']['open']) and u['mode'] == 'home', u)
        check("keine Seitenfehler (4)", not errs, errs)
        await ctx.close()

        # Leiste-Erkennung: nur in der App-Liste (unsichtbar), nur im Ordner, gar nicht
        async def bar_case(extra):
            c, pg2, _, e2 = await new_page({}, {"anim": {"boot": "off"}}, extra=extra)
            await pg2.wait_for_timeout(1400)
            await pg2.evaluate("Lumen.prefs.sourceFocus = 'bar'; Lumen.bar.sync(true)"); await pg2.wait_for_timeout(700)
            r = await pg2.evaluate("({t: document.getElementById('toast').textContent, on: window.__execs.some(c => c.indexOf('touch') >= 0 && c.indexOf('leiste.on') >= 0), tiles: Lumen.S.rows[0].items.map(a => a.id)})")
            await c.close()
            return r, e2
        r, e2 = await bar_case("window.__apps.push({id:'de.lumenhome.leiste', title:'Lumen Leiste', visible:false, folderPath:'/x', icon:'icon.png'});")
        check("Leiste erkannt über die App-Liste (unsichtbare App), keine Kachel", 'Leiste über dem laufenden Bild' in r['t'] and 'de.lumenhome.leiste' not in r['tiles'] and not e2, r)
        r, e2 = await bar_case("""(function(){ var o = window.PalmServiceBridge.prototype.call;
            window.PalmServiceBridge.prototype.call = function(uri, payload) {
              if (uri.indexOf('hbchannel.service/exec') >= 0 && payload.indexOf('dir:$d') >= 0) { var self = this; window.__execs.push(JSON.parse(payload).command);
                setTimeout(function(){ self.onservicecallback(JSON.stringify({returnValue: true, stdoutString: 'dir:/media/developer/apps/usr/palm/applications'})); }, 10); return; }
              return o.apply(this, arguments); }; })();""")
        check("Leiste erkannt über den Installationsordner", 'Leiste über dem laufenden Bild' in r['t'] and not e2, r)
        r, e2 = await bar_case("")
        check("Leiste fehlt: klarer Hinweis, Einstellung trotzdem aktiv (leiste.on)", 'nicht gefunden' in r['t'] and 'gespeichert' in r['t'] and r['on'] and not e2, r)

        # Darstellung: Hintergrund-Design + Zitate (Mono gibt es nicht mehr)
        ctx, pg, reqs, errs = await new_page({}, {"anim": {"boot": "off"}})
        await pg.wait_for_timeout(1400)
        await pg.evaluate("Lumen.ui.openSettings('look')"); await pg.wait_for_timeout(300)
        await pg.keyboard.press("ArrowRight"); await pg.keyboard.press("Enter"); await pg.wait_for_timeout(300)
        await pg.keyboard.press("ArrowDown"); await pg.keyboard.press("Enter"); await pg.wait_for_timeout(400)
        await pg.keyboard.press("ArrowDown"); await pg.keyboard.press("Enter"); await pg.wait_for_timeout(300)
        await pg.keyboard.press("ArrowDown"); await pg.keyboard.press("Enter"); await pg.wait_for_timeout(2200)
        g = await pg.evaluate("({theme: document.body.dataset.theme, bg: document.body.dataset.bg, layer: document.getElementById('bg-image').className, pref: Lumen.prefs.bg, mode: Lumen.prefs.greet, text: document.getElementById('greet').textContent, quote: document.getElementById('greet').classList.contains('quote'), ui: window.__execs.filter(c => c.indexOf('ui.json') >= 0 && c.indexOf('printf') >= 0).pop() || ''})")
        check("Hintergrund „Polarlicht“ + Meme-Zitate", g['theme'] == 'glas' and g['bg'] == 'design' and g['layer'] == 'bgd-aurora' and g['pref'] == 'design:aurora' and g['mode'] == 'quotes' and g['quote'] and g['text'].startswith('„'), g)
        check("Auswahl landet in ui.json fürs Web-Backend", '"bg":"design:aurora"' in g['ui'], g['ui'])
        sel = await pg.evaluate("Lumen.bg.options().map(o => o[1])")
        check("Hintergrund-Auswahl: App-Farbe + 6 Designs", sel == ['App-Farbe', 'Polarlicht', 'Tiefsee', 'Abendrot', 'Nebel', 'Graphit', 'Mitternacht'], sel)
        img = await pg.evaluate("getComputedStyle(document.getElementById('bg-image')).backgroundImage")
        amb = await pg.evaluate("[...document.querySelectorAll('.amb')].map(n => getComputedStyle(n).visibility).join()")
        check("Design ist sichtbar gezeichnet (Verlauf), App-Licht aus", 'gradient' in img and amb and set(amb.split(',')) == {'hidden'}, [img[:80], amb])
        check("keine Mono-Datei mehr geladen", not await pg.evaluate("[...document.styleSheets].some(s => /mono\\.css/.test(s.href || ''))"))
        await ctx.close()

        # eigenes Bild aus dem Web-Backend (über ui.json gewählt) + alte Mono-Einstellung → Glas
        LIST = "backgrounds/Urlaub.jpg 1700000000\nbackgrounds/Berge.png 1700000500\n@@tiles\n{}\n@@ui\n" + json.dumps({"bg": "image:Urlaub.jpg", "stamp": 9999999999999}) + "\nend"
        ctx, pg, reqs, errs = await new_page({}, {"anim": {"boot": "off"}, "theme": "mono", "pv": 15}, listing=json.dumps(LIST))
        await pg.wait_for_timeout(1800)
        g = await pg.evaluate("({theme: document.body.dataset.theme, saved: Lumen.prefs.theme, bg: document.body.dataset.bg, img: document.getElementById('bg-image').style.backgroundImage, opts: Lumen.bg.options().map(o => o[1]), cur: Lumen.bg.current()})")
        check("alte Mono-Einstellung wird zu Glas", g['theme'] == 'glas' and g['saved'] == 'glas', g)
        check("Bild aus dem Web-Backend als Hintergrund", g['bg'] == 'image' and 'cache/backgrounds/Urlaub.jpg' in g['img'] and g['cur'] == 'image:Urlaub.jpg', g)
        check("eigene Bilder in der Auswahl (neueste zuerst)", g['opts'][-2:] == ['Bild: Berge', 'Bild: Urlaub'], g['opts'])
        check("keine Seitenfehler (4b)", not errs, errs)
        await ctx.close()

        # ---------- 5. WLED: Spot atmet + funkelt, Zonen, Wiederherstellen ----------
        ctx, pg, reqs, errs = await new_page({}, {"anim": {"boot": "off"}, "wled": {"speed": "fast", "ip": "192.168.178.60"}}, wled='ok')
        await pg.wait_for_timeout(2200)
        posts = [r for r in reqs if r[0] == 'POST']
        gets = [r for r in reqs if r[0] == 'GET']
        check("vor der ersten Änderung: Zustand gelesen (/json)", gets and gets[0][1].endswith('/json'), gets[:2])
        body = json.loads(posts[0][2]) if posts else {}
        segs = [s for s in body.get('seg', []) if 'start' in s]
        check("Zonen als Segmente angelegt (fein: 12)", len(segs) == 12 and segs[0]['start'] == 0 and segs[-1]['stop'] == 120, [len(segs)])
        plan = await pg.evaluate("Lumen.wled.plan(Lumen.prefs.wled).map(s => s.zone)")
        spot = [i for i, s in enumerate(segs) if s['fx'] == 20]
        rest = [i for i, s in enumerate(segs) if s['fx'] == 0]
        check("Standard „Spot“: rechts oben funkelt (Sparkle), Rest ruhig", spot and all(plan[i] in ('t', 'r') for i in spot) and len(spot) + len(rest) == 12, [(plan[i], segs[i]['fx']) for i in range(12)])
        sp = max((segs[i] for i in spot), key=lambda x: sum(x['col'][1]))
        check("Funkeln heller als die Grundfarbe, hellste Spot-Zone kräftig", all(sum(segs[i]['col'][0]) > sum(segs[i]['col'][1]) for i in spot) and max(sp['col'][1]) >= 240, [segs[i]['col'] for i in spot])
        await pg.wait_for_timeout(4300)
        br = [json.loads(r[2]) for r in reqs if r[0] == 'POST' and '"bri"' in (r[2] or '') and '"tt":16' in (r[2] or '')]
        bris = [tuple((s['id'], s['bri']) for s in x['seg']) for x in br]
        ids = sorted(set(s[0] for x in bris for s in x))
        check("Atmen: Helligkeit der Spot-Zonen gleitet auf und ab (tt = Halbperiode)", len(br) >= 2 and ids == spot and {s[1] for x in bris for s in x} == {150, 255}, bris[:3])
        n0 = len([r for r in reqs if r[0] == 'POST'])
        await pg.evaluate("window.__setHidden(true)"); await pg.wait_for_timeout(600)
        last = json.loads([r for r in reqs if r[0] == 'POST'][-1][2])
        orig = [s for s in last['seg'] if s.get('id') == 0 and 'start' in s]
        check("beim Verlassen: Original-Segment zurück", orig and orig[0]['stop'] == 120 and orig[0]['fx'] == 9 and last.get('bri') == 140, last)
        await pg.wait_for_timeout(2500)
        later = [r for r in reqs if r[0] == 'POST'][n0 + 1:]
        check("im Hintergrund atmet nichts weiter", not later, later[:2])
        await pg.evaluate("window.__hidden = false; Lumen.prefs.wled.effect = 'combo'; window.__relaunch({focus:'apps'})"); await pg.wait_for_timeout(1600)
        b3 = json.loads([r for r in reqs if r[0] == 'POST' and '"start"' in (r[2] or '')][-1][2])
        fxs = sorted(set(s['fx'] for s in b3['seg'] if 'fx' in s))
        check("Atmen + Funkeln: Breathe (2) vorn, Twinkle (17) dahinter", fxs == [2, 17], fxs)
        check("bei „Atmen + Funkeln“ kein zusätzliches Helligkeits-Atmen", await pg.evaluate("Lumen.wled.breathing() === null"))
        await pg.evaluate("Lumen.prefs.wled.layout = 'single'; Lumen.prefs.wled.effect = 'spot'; Lumen.wled.refresh()"); await pg.wait_for_timeout(1500)
        b4 = json.loads([r for r in reqs if r[0] == 'POST' and '"fx"' in (r[2] or '')][-1][2])
        check("„Eine Farbe“ + Spot: ganzer Streifen funkelt und atmet", isinstance(b4.get('seg'), dict) and b4['seg']['fx'] == 20 and await pg.evaluate("Lumen.wled.breathing() === 'all'"), b4)
        await pg.evaluate("Lumen.prefs.wled.layout = 'zones'; Lumen.prefs.wled.fine = false; Lumen.wled.zoneTest()"); await pg.wait_for_timeout(500)
        b5 = json.loads([r for r in reqs if r[0] == 'POST'][-1][2])
        cols = [tuple(s['col'][0]) for s in b5['seg'] if 'start' in s]
        check("Zonentest: 5 Zonen in 5 Farben, Atmen pausiert", len(cols) == 5 and len(set(cols)) == 5 and await pg.evaluate("Lumen.wled.breathing() === null"), cols)
        check("keine Seitenfehler (5)", not errs, errs)
        await ctx.close()

        ctx, pg, reqs, errs = await new_page({}, {"anim": {"boot": "off"}, "wled": {"ip": "192.168.178.60"}}, wled='down')
        await pg.wait_for_timeout(1500)
        await pg.evaluate("Lumen.wled.test()"); await pg.wait_for_timeout(600)
        t = await pg.evaluate("document.getElementById('toast').textContent")
        check("WLED nicht erreichbar wird gemeldet", 'nicht erreichbar' in t, t)
        check("keine Seitenfehler (6)", not errs, errs)
        await ctx.close()

        # ---------- 6. Magic Remote ----------
        ctx, pg, reqs, errs = await new_page({}, {"anim": {"boot": "off"}})
        await pg.wait_for_timeout(1500)
        g0 = await pg.evaluate("(() => { const r = document.querySelectorAll('#row-apps .tile')[2].getBoundingClientRect(); return [r.left + r.width/2, r.top + 40]; })()")
        await pg.mouse.move(g0[0] + 100, g0[1] - 20); await pg.wait_for_timeout(120)
        await pg.mouse.move(g0[0] + 110, g0[1] - 25); await pg.wait_for_timeout(200)
        rot = await pg.evaluate("[...document.querySelectorAll('#row-apps .tile-mag')].map(m => m.style.transform)")
        check("Kacheln nahe am Zeiger drehen sich zu ihm, ferne nicht", rot[2] != '' and rot[0] == '', rot)
        await pg.keyboard.press("ArrowLeft"); await pg.wait_for_timeout(2700)
        rot = await pg.evaluate("[...document.querySelectorAll('#row-apps .tile-mag')].map(m => m.style.transform)")
        check("nach kurzer Ruhe wieder gerade", all(r == '' for r in rot), rot)
        await ctx.close()

        # ---------- 7. Web-Backend (echter Server) ----------
        tmp = '/tmp/lb15'
        subprocess.run(['rm', '-rf', tmp]); os.makedirs(tmp + '/app'); os.makedirs(tmp + '/data')
        subprocess.run(['cp', '-r', APPDIR + '/backend', APPDIR + '/appinfo.json', tmp + '/app/'])
        srv = subprocess.Popen(['node', 'server.js', '8484', tmp + '/data'], cwd=tmp + '/app/backend', stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(0.8)
        try:
            ctx, pg, reqs, errs = await new_page({}, {"anim": {"boot": "off"}, "backend": {"on": True}}, extra="window.LUMEN_FORCE_BACKEND = true;")
            await pg.wait_for_timeout(1300)
            started = [c for c in await pg.evaluate("window.__execs") if 'server.js' in c]
            check("Backend wird gestartet (Node, eigener Prozess)", started and 'setsid' in started[0] and '8484' in started[0], started[:1])
            await pg.evaluate("Lumen.ui.openSettings('web')"); await pg.wait_for_timeout(1500)
            vals = await pg.evaluate("[...document.querySelectorAll('.set-row')].map(n => n.textContent)")
            check("Einstellungen zeigen Adresse und Status", any('http://' in v and ':8484' in v for v in vals) and any('läuft' in v for v in vals), vals)
            await pg.evaluate("Lumen.ui.closeSettings()")
            # Backend-Seite: Inhalt und Eigenschaft setzen
            r = await pg.evaluate("""fetch('http://127.0.0.1:8484/api/tiles/youtube.leanback.v4', {method: 'PUT', body: JSON.stringify({content: 'logo', tag: 'Clips & Musik'})}).then(r => r.json())""")
            check("Backend speichert Inhalt und Eigenschaft", r.get('ok') and r['tile'] == {'content': 'logo', 'tag': 'Clips & Musik'}, r)
            on_disk = json.load(open(tmp + '/data/tiles.json'))
            check("tiles.json im dauerhaften Ordner", on_disk == {'youtube.leanback.v4': {'content': 'logo', 'tag': 'Clips & Musik'}}, on_disk)
            bad = await pg.evaluate("""fetch('http://127.0.0.1:8484/api/tiles/x', {method: 'PUT', body: JSON.stringify({content: 'blau'})}).then(r => r.status)""")
            bad2 = await pg.evaluate("""fetch('http://127.0.0.1:8484/api/tiles/..%2Fetc', {method: 'PUT', body: '{}'}).then(r => r.status)""")
            check("ungültiger Inhalt / ungültige ID abgelehnt", bad == 400 and bad2 == 400, [bad, bad2])
            # Lumen merkt die Änderung (Änderungszähler) und lädt neu – hier liefert der Bus die neue Datei
            await pg.evaluate("window.__listing = 'end\\n@@tiles\\n' + JSON.stringify({'youtube.leanback.v4': {content: 'logo', tag: 'Clips & Musik'}}) + '\\nend'")
            await pg.evaluate("fetch('http://127.0.0.1:8484/api/tiles/netflix', {method: 'PUT', body: JSON.stringify({content: 'auto'})})")
            await pg.wait_for_timeout(9000)
            s1 = await st(pg)
            check("Lumen übernimmt Änderungen aus dem Backend von selbst", s1['tag'] == 'Clips & Musik', s1)
            B = 'http://127.0.0.1:8484'
            up = await pg.evaluate("""fetch('%s/api/background/Mein%%20Urlaub.jpeg', {method: 'PUT', body: new Uint8Array([0xFF,0xD8,0xFF,0xE0,1,2,3,4,5,6])}).then(r => r.json())""" % B)
            up2 = await pg.evaluate("""fetch('%s/api/background/Mein%%20Urlaub.jpg', {method: 'PUT', body: new Uint8Array([0xFF,0xD8,0xFF,0xE0,9,9,9,9])}).then(r => r.json())""" % B)
            check("Bild hochgeladen (Name bereinigt, Doppel bekommt „2“)", up.get('file') == 'Mein Urlaub.jpg' and up2.get('file') == 'Mein Urlaub 2.jpg', [up, up2])
            check("Bild im dauerhaften Ordner und in Lumens Zwischenspeicher", os.path.exists(tmp + '/data/backgrounds/Mein Urlaub.jpg') and os.path.exists(tmp + '/app/cache/backgrounds/Mein Urlaub.jpg'))
            nope = await pg.evaluate("""fetch('%s/api/background/x.jpg', {method: 'PUT', body: 'kein Bild'}).then(r => r.status)""" % B)
            evil = await pg.evaluate("""fetch('%s/api/background/..%%2F..%%2Fetc.jpg', {method: 'DELETE'}).then(r => r.status)""" % B)
            check("kein Bild / böser Name abgelehnt", nope == 415 and evil == 400, [nope, evil])
            ls_ = await pg.evaluate("fetch('%s/api/backgrounds').then(r => r.json())" % B)
            check("Liste der eigenen Hintergründe", sorted(x['file'] for x in ls_['backgrounds']) == ['Mein Urlaub 2.jpg', 'Mein Urlaub.jpg'], ls_)
            r1 = await pg.evaluate("""fetch('%s/api/ui', {method: 'PUT', body: JSON.stringify({bg: 'image:Mein Urlaub.jpg'})}).then(r => r.json())""" % B)
            r2 = await pg.evaluate("""fetch('%s/api/ui', {method: 'PUT', body: JSON.stringify({bg: 'image:../x.jpg'})}).then(r => r.status)""" % B)
            ui = json.load(open(tmp + '/data/ui.json'))
            check("Auswahl im Backend → ui.json mit Zeitstempel", r1.get('ok') and ui['bg'] == 'image:Mein Urlaub.jpg' and ui['stamp'] > 0 and r2 == 400, [r1, ui, r2])
            med = await pg.evaluate("fetch('%s/media/backgrounds/Mein%%20Urlaub.jpg').then(r => r.status + ' ' + r.headers.get('content-type'))" % B)
            check("Bild lässt sich in der Backend-Seite anzeigen", med == '200 image/jpeg', med)
            await pg.evaluate("fetch('%s/api/background/Mein%%20Urlaub.jpg', {method: 'DELETE'})" % B)
            ui = json.load(open(tmp + '/data/ui.json'))
            check("aktives Bild gelöscht → zurück auf App-Farbe", ui['bg'] == 'accent' and not os.path.exists(tmp + '/data/backgrounds/Mein Urlaub.jpg'), ui)
            page_html = await pg.evaluate("fetch('http://127.0.0.1:8484/').then(r => r.text())")
            check("Backend-Seite hat den Bereich Hintergrund mit Upload und Designs", 'id="bgs"' in page_html and 'id="bgup"' in page_html and page_html.count('bgd-') >= 6)
            check("Backend-Seite hat Inhalt der Kachel und Eigenschaft", 'Inhalt der Kachel' in page_html and 'Eigenschaft' in page_html)
            check("keine Seitenfehler (7)", not errs, errs)
            await ctx.close()
        finally:
            srv.terminate()

        # ---------- 8. Layout ----------
        ctx, pg, reqs, errs = await new_page({}, {"anim": {"boot": "off"}})
        await pg.wait_for_timeout(1500)
        s1 = await st(pg)
        check("Titel ohne „App“, mit Eigenschaft „Video“", s1['title'] == 'YouTube' and s1['tag'] == 'Video' and not await pg.evaluate("!!document.getElementById('hero-kicker')"), s1)
        cut = []
        for i in range(8):
            await pg.keyboard.press("ArrowRight"); await pg.wait_for_timeout(560)
            cut.append(await pg.evaluate("""(() => { const vp = document.querySelector('#row-apps .viewport').getBoundingClientRect();
              const vis = [...document.querySelectorAll('#row-apps .tile-face')].map(f => f.getBoundingClientRect()).filter(r => r.right > vp.left + 2 && r.left < vp.right - 2);
              return {n: vis.length, cut: vis.filter(r => r.left < vp.left - 1 || r.right > vp.right + 1).length}; })()"""))
        check("immer 5 ganze Kacheln, nie angeschnitten", all(c['cut'] == 0 for c in cut) and all(c['n'] == 5 for c in cut), cut)
        await pg.wait_for_timeout(700)
        sz = await pg.evaluate("""(() => { const dock = document.querySelector('#row-apps').getBoundingClientRect();
          const f = document.querySelector('#row-apps .tile.is-focused .tile-face').getBoundingClientRect();
          const o = document.querySelector('#row-apps .tile:not(.is-focused) .tile-face').getBoundingClientRect();
          const art = document.getElementById('art').getBoundingClientRect();
          return {fw: Math.round(f.width), ow: Math.round(o.width), top: Math.round(f.top - dock.top), bottom: Math.round(dock.bottom - f.bottom), art: Math.round(art.width) + 'x' + Math.round(art.height)}; })()""")
        check("ausgewählte App größer als die anderen (≥ 14 %)", sz['fw'] >= sz['ow'] * 1.14, sz)
        check("ausgewählte App bleibt im Reiter-Hintergrund (oben/unten Luft)", sz['top'] >= 6 and sz['bottom'] >= 6, sz)
        check("Vorschaukarte etwas größer (640×384)", sz['art'] == '640x384', sz)
        tags = await pg.evaluate("Lumen.S.rows[0].items.map(a => a.title + ':' + Lumen.data.tagFor(a))")
        check("Eigenschaften passen", 'Netflix:Filme & Serien' in tags and 'Spotify:Musik' in tags and 'Media Player:Multimedia' in tags and 'Disney+:Filme & Serien' in tags, tags)
        await pg.evaluate("Lumen.S.rows[0].items[0].title='Ein wirklich sehr langer App-Name'; Lumen.home.goFirst(0)")
        await pg.keyboard.press("ArrowRight"); await pg.wait_for_timeout(300); await pg.keyboard.press("ArrowLeft"); await pg.wait_for_timeout(700)
        fit = await pg.evaluate("(() => { const t = document.getElementById('hero-title'); return {sw: t.scrollWidth, cw: t.clientWidth, fs: getComputedStyle(t).fontSize}; })()")
        check("langer Titel wird verkleinert statt abgeschnitten", fit['sw'] <= fit['cw'] + 2 and float(fit['fs'][:-2]) < 152, fit)
        check("keine Seitenfehler (8)", not errs, errs)
        await ctx.close()

        # neuer Fernseher: keine fremden Vorgaben; auch ältere Einstellungen ohne Name/WLED bekommen keine
        ctx, pg, reqs, errs = await new_page({}, None)
        await pg.wait_for_timeout(600)
        m = await pg.evaluate("({n: Lumen.prefs.name, ip: Lumen.prefs.wled.ip})")
        check("neuer Fernseher: kein Name, keine WLED-Adresse vorbelegt", m == {'n': '', 'ip': ''}, m)
        await ctx.close()
        ctx, pg, reqs, errs = await new_page({}, {"anim": {"boot": "off"}, "pv": 15})
        await pg.wait_for_timeout(600)
        m = await pg.evaluate("({n: Lumen.prefs.name, ip: Lumen.prefs.wled.ip})")
        check("bestehende Einstellungen ohne Name/WLED: keine fremden Vorgaben", m == {'n': '', 'ip': ''}, m)
        await ctx.close()

        # ---------- 9. Einstellungen von 1.4 werden übernommen ----------
        ctx, pg, reqs, errs = await new_page({}, {"anim": {"on": True, "build": "structured", "ambient": True, "float": True, "boot": "off"}, "wled": {"effect": "static", "ip": "10.0.0.9"}, "theme": "glas"})
        await pg.wait_for_timeout(800)
        m = await pg.evaluate("({b: Lumen.prefs.anim.build, a: Lumen.prefs.anim.ambient, f: Lumen.prefs.anim.float, e: Lumen.prefs.wled.effect, ip: Lumen.prefs.wled.ip, pv: Lumen.prefs.pv, ts: Lumen.prefs.anim.tileSpeed})")
        check("1.4-Einstellungen: kein Neuaufbau, Spot-Effekt, Rest bleibt", m == {'b': 'none', 'a': False, 'f': False, 'e': 'spot', 'ip': '10.0.0.9', 'pv': 16, 'ts': 80}, m)
        await ctx.close()

        # ---------- 10. Lumen Leiste: Eingänge, laufende Apps, Schließen ----------
        LEISTE = "file://" + os.environ.get("LEISTE_DIR", os.path.join(REPO, "leiste")) + "/index.html"
        INPUTS_J = json.dumps([{"id": "com.webos.app.hdmi1", "n": 1, "title": "PC", "show": True, "glyph": "monitor"},
                               {"id": "com.webos.app.hdmi2", "n": 2, "title": "PlayStation", "show": True, "glyph": "gamepad"},
                               {"id": "com.webos.app.hdmi3", "n": 3, "title": "HDMI 3", "show": False, "glyph": "hdmi"},
                               {"id": "com.webos.app.hdmi4", "n": 4, "title": "HDMI 4", "show": True, "glyph": "hdmi"}])
        APPS_J = json.dumps([{"id": "youtube.leanback.v4", "title": "YouTube", "color": "#e00", "icon": None},
                             {"id": "netflix", "title": "Netflix", "color": "#b00", "icon": None},
                             {"id": "spotify-beehive", "title": "Spotify", "color": "#1db954", "icon": None}])
        def leiste_fake(params, running=None, devices=None, panel=None, fg=None):
            return FAKE.replace('%PARAMS%', json.dumps(json.dumps(params))).replace('%BOOTID%', '""').replace('%LISTING%', '""') + """
          window.__closed = 0; window.close = function(){ window.__closed++; };
          window.FG_LOG = %FG%;
          (function(){ var orig = window.PalmServiceBridge.prototype.call;
            window.__RUN = %RUN%; var DEVICES = %DEV%, PANEL = %PANEL%;
            window.PalmServiceBridge.prototype.call = function(uri, payload) {
              var self = this, res = null;
              function reply(r){ setTimeout(function(){ self.onservicecallback(JSON.stringify(r)); }, 10); }
              if (uri.indexOf('hbchannel.service/exec') >= 0) {
                var cmd = JSON.parse(payload).command;
                if (cmd.indexOf('inputs.json') >= 0 && cmd.indexOf('apps.json') >= 0) {
                  window.__execs.push(cmd); reply({returnValue: true, stdoutString: %INPUTS% + '\\n@@\\n' + %APPS% + '\\n@@\\n' + (window.FG_LOG != null ? window.FG_LOG + '\\n@@\\n' : '') + 'ok'}); return; }
                if (cmd.indexOf('closeByAppId') >= 0) { window.__execs.push(cmd); reply({returnValue: true, stdoutString: window.CLOSE_OUT || 'closed'}); return; }
                if (PANEL && cmd.indexOf('getSystemSettings') >= 0) { window.__execs.push(cmd); reply({returnValue: true, stdoutString: PANEL}); return; }
              }
              if (window.__RUN && uri.indexOf('applicationManager/running') >= 0) { window.__calls.push(uri); reply({returnValue: true, running: window.__RUN}); return; }
              if (DEVICES && uri.indexOf('getAllInputStatus') >= 0) { window.__calls.push(uri); reply({returnValue: true, devices: DEVICES}); return; }
              return orig.apply(this, arguments); }; })();""".replace('%RUN%', json.dumps(running)).replace('%DEV%', json.dumps(devices)) \
                .replace('%PANEL%', json.dumps(panel)).replace('%FG%', json.dumps(fg)).replace('%INPUTS%', json.dumps(INPUTS_J)).replace('%APPS%', json.dumps(APPS_J))

        async def leiste_page(params, **kw):
            c = await b.new_context(viewport={"width": 1920, "height": 1080})
            await c.add_init_script(leiste_fake(params, **kw))
            lp = await c.new_page()
            le = []; lp.on("pageerror", lambda e: le.append(str(e)))
            await lp.goto(LEISTE); await lp.wait_for_timeout(700)
            return c, lp, le
        titles = lambda lp: lp.evaluate("[...document.querySelectorAll('#bar .chip-title')].map(n=>n.textContent)")
        focused = lambda lp: lp.evaluate("(document.querySelector('#bar .chip.is-focused .chip-title')||{}).textContent")

        ctx, lp, lerrs = await leiste_page({"from": "com.webos.app.hdmi2"})
        ls = await lp.evaluate("({cur: document.querySelector('.chip.current .chip-sub').textContent, bg: getComputedStyle(document.body).backgroundColor, in: document.body.classList.contains('bar-in')})")
        check("Leiste: Namen aus Lumen, ausgeblendete fehlen, kein Lumen-Eintrag mehr", await titles(lp) == ['PC', 'PlayStation', 'HDMI 4'], await titles(lp))
        check("Leiste: kein Hinweistext mehr", await lp.evaluate("!document.getElementById('bar-hint') && !/OK wechselt/.test(document.body.textContent)"))
        check("Leiste: laufender Eingang ausgewählt und markiert", await focused(lp) == 'PlayStation' and ls['cur'] == 'läuft gerade', ls)
        check("Leiste: Hintergrund durchsichtig, Leiste fährt ein", ls['bg'] in ('rgba(0, 0, 0, 0)', 'transparent') and ls['in'], ls)
        await lp.evaluate("window.__relaunch({from: 'com.webos.app.hdmi2'})"); await lp.wait_for_timeout(200)
        check("Leiste: Source nochmal → nächster Eintrag", await focused(lp) == 'HDMI 4', await focused(lp))
        await lp.keyboard.press("ArrowLeft"); await lp.keyboard.press("ArrowLeft"); await lp.wait_for_timeout(100)
        await lp.keyboard.press("Enter"); await lp.wait_for_timeout(600)
        calls = await lp.evaluate("window.__calls.filter(c => c.indexOf('applicationManager/launch') >= 0)")
        check("Leiste: OK schaltet auf PC und schließt sich", any('com.webos.app.hdmi1' in c for c in calls) and await lp.evaluate("window.__closed") == 1, calls)
        check("keine Seitenfehler (Leiste)", not lerrs, lerrs)
        await ctx.close()

        # Verbunden-Anzeige: hdmiPlugIn entscheidet, nicht „connected“
        ctx, lp, lerrs = await leiste_page({"from": "netflix"}, devices=[
            {"appId": "com.webos.app.hdmi1", "hdmiPlugIn": True, "connected": True},
            {"appId": "com.webos.app.hdmi2", "hdmiPlugIn": False, "connected": True},
            {"appId": "com.webos.app.hdmi4", "hdmiPlugIn": "false", "connected": True}])
        dots = await lp.evaluate("[...document.querySelectorAll('#bar .chip')].filter(c => c.querySelector('.chip-dot')).map(c => c.querySelector('.chip-title').textContent + ':' + c.querySelector('.chip-dot').classList.contains('on'))")
        check("Verbunden-Punkt nur bei eingestecktem Gerät (PlayStation aus)", dots == ['PC:true', 'PlayStation:false', 'HDMI 4:false'], dots)
        check("über einer App ohne laufende App-Liste: erster verbundener Eingang", await focused(lp) == 'PC', await focused(lp))
        await lp.keyboard.press("Escape"); await lp.wait_for_timeout(500)
        check("Leiste: Zurück schließt ohne Umschalten", await lp.evaluate("window.__closed === 1 && !window.__calls.some(c => c.indexOf('applicationManager/launch') >= 0)"))
        await ctx.close()

        # Laufende Apps: nur echte Apps, die aktuelle zuerst; schließen einzeln und alle anderen
        ctx, lp, lerrs = await leiste_page({"from": "netflix"}, running=[
            {"id": "youtube.leanback.v4"}, {"id": "com.webos.app.hdmi2"}, {"id": "com.webos.surfacemanager"},
            {"id": "de.lumenhome.launcher"}, {"id": "netflix"}, {"id": "spotify-beehive"}])
        await lp.wait_for_timeout(300)
        t = await titles(lp)
        check("Leiste zeigt offene Apps (ohne Systemdienste, Lumen, Eingänge), aktuelle zuerst",
              t == ['PC', 'PlayStation', 'HDMI 4', 'Netflix', 'YouTube', 'Spotify', 'Andere schließen'], t)
        check("über einer App ist diese App ausgewählt", await focused(lp) == 'Netflix', await focused(lp))
        await lp.keyboard.press("ArrowRight"); await lp.wait_for_timeout(100)
        await lp.keyboard.press("ArrowUp"); await lp.wait_for_timeout(150)
        xs = await lp.evaluate("({sel: !!document.querySelector('#bar .chip.is-focused.x-sel')})")
        check("Hoch auf einer App wählt „Schließen“", xs['sel'], xs)
        await lp.keyboard.press("Enter"); await lp.wait_for_timeout(450)
        ex = await lp.evaluate("window.__execs.filter(c => c.indexOf('closeByAppId') >= 0)")
        t = await titles(lp)
        check("YouTube geschlossen (closeByAppId als root), Kachel weg", any('youtube.leanback.v4' in c for c in ex) and 'YouTube' not in t and await lp.evaluate("window.__closed") == 0, [ex, t])
        await lp.keyboard.press("ArrowRight"); await lp.wait_for_timeout(100)
        f = await focused(lp)
        if f == 'Spotify':
            await lp.keyboard.press("ArrowRight"); await lp.wait_for_timeout(100)
        f2 = await focused(lp)
        await ctx.close()
        ctx, lp, lerrs = await leiste_page({"from": "netflix"}, running=[{"id": "youtube.leanback.v4"}, {"id": "netflix"}, {"id": "spotify-beehive"}])
        await lp.wait_for_timeout(300)
        for _ in range(3): await lp.keyboard.press("ArrowRight"); await lp.wait_for_timeout(60)
        check("„Andere schließen“ erreichbar", await focused(lp) == 'Andere schließen', await focused(lp))
        await lp.keyboard.press("Enter"); await lp.wait_for_timeout(600)
        ex = await lp.evaluate("window.__execs.filter(c => c.indexOf('closeByAppId') >= 0).join(' ')")
        t = await titles(lp)
        check("„Andere schließen“: YouTube und Spotify zu, Netflix bleibt", 'youtube.leanback.v4' in ex and 'spotify-beehive' in ex and '"netflix"' not in ex and t == ['PC', 'PlayStation', 'HDMI 4', 'Netflix'], [ex, t])
        check("keine Seitenfehler (Apps)", not lerrs, lerrs)
        await ctx.close()

        # webOS hält die App nach dem Schließen vorgeladen → die Leiste merkt sie sich als geschlossen
        ctx, lp, lerrs = await leiste_page({"from": "netflix"}, running=[{"id": "youtube.leanback.v4"}, {"id": "netflix"}, {"id": "spotify-beehive", "preloadMode": "full"}])
        await lp.wait_for_timeout(300)
        t = await titles(lp)
        check("vorgeladene Apps (preloadMode) stehen nicht als offen da", 'Spotify' not in t and 'YouTube' in t, t)
        await lp.evaluate("window.CLOSE_OUT = 'still'")
        await lp.keyboard.press("ArrowRight"); await lp.wait_for_timeout(80)
        await lp.keyboard.press("ArrowUp"); await lp.keyboard.press("Enter"); await lp.wait_for_timeout(500)
        ex = await lp.evaluate("window.__execs.filter(c => c.indexOf('closeByAppId') >= 0)")
        check("Schließen prüft nach und versucht es ein zweites Mal", ex and 'applicationManager/running' in ex[0] and 'service.applicationmanager/closeByAppId' in ex[0] and 'leiste-close.log' in ex[0], ex[:1])
        closed = await lp.evaluate("Object.keys(JSON.parse(localStorage.getItem('leiste.closed') || '{}'))")
        check("App läuft im Hintergrund weiter → als geschlossen gemerkt", closed == ['youtube.leanback.v4'], closed)
        await lp.evaluate("LeisteBar.start({from: 'netflix'})"); await lp.wait_for_timeout(500)
        t = await titles(lp)
        check("Leiste neu geöffnet: geschlossene App taucht nicht wieder auf", 'YouTube' not in t, t)
        await lp.evaluate("LeisteBar.start({from: 'youtube.leanback.v4'})"); await lp.wait_for_timeout(500)
        t = await titles(lp)
        closed = await lp.evaluate("Object.keys(JSON.parse(localStorage.getItem('leiste.closed') || '{}'))")
        check("wieder geöffnet (läuft vorne) → wieder in der Leiste", 'YouTube' in t and closed == [], [t, closed])
        # ohne Verlauf: App wirklich beendet, Sekunden später von webOS wieder vorgeladen → bleibt weg
        await lp.evaluate("window.CLOSE_OUT = 'closed'; window.__RUN = [{id: 'netflix'}, {id: 'youtube.leanback.v4'}]; LeisteBar.start({from: 'netflix'})"); await lp.wait_for_timeout(500)
        await lp.keyboard.press("ArrowRight"); await lp.wait_for_timeout(80)
        f0 = await focused(lp)
        await lp.keyboard.press("ArrowUp"); await lp.keyboard.press("Enter"); await lp.wait_for_timeout(500)
        await lp.evaluate("window.__RUN = [{id: 'netflix'}]; LeisteBar.start({from: 'netflix'})"); await lp.wait_for_timeout(500)
        await lp.evaluate("window.__RUN = [{id: 'netflix'}, {id: 'youtube.leanback.v4'}]; LeisteBar.start({from: 'netflix'})"); await lp.wait_for_timeout(500)
        t = await titles(lp)
        check("ohne Verlauf: beendet und von webOS neu vorgeladen → bleibt geschlossen", f0 == 'YouTube' and 'YouTube' not in t, [f0, t])
        fgn = await lp.evaluate("window.__execs.filter(c => c.indexOf('tvclean-foreground.log') >= 0 && c.indexOf('echo \"$(date +%s) netflix\"') >= 0).length")
        check("Leiste trägt die App hinter sich in den Verlauf ein", fgn >= 1, fgn)
        check("keine Seitenfehler (Schließen)", not lerrs, lerrs)
        await ctx.close()

        # mit Vordergrund-Verlauf (tvclean): nur vorgeladene Apps erscheinen nicht, geschlossene bleiben weg
        import time as _t
        now = int(_t.time())
        RUN = [{"id": "youtube.leanback.v4"}, {"id": "netflix"}, {"id": "spotify-beehive"}, {"id": "com.webos.app.hdmi2"}]
        FG = "%d com.webos.app.home\n%d de.lumenhome.launcher\n%d spotify-beehive\n%d com.webos.app.hdmi2" % (now - 300, now - 290, now - 200, now - 10)
        ctx, lp, lerrs = await leiste_page({"from": "com.webos.app.hdmi2"}, running=RUN, fg=FG)
        await lp.wait_for_timeout(300)
        t = await titles(lp)
        check("Verlauf: nur wirklich geöffnete Apps (Spotify), vorgeladene YouTube/Netflix fehlen", t == ['PC', 'PlayStation', 'HDMI 4', 'Spotify'], t)
        for _ in range(2): await lp.keyboard.press("ArrowRight"); await lp.wait_for_timeout(60)
        await lp.keyboard.press("ArrowUp"); await lp.keyboard.press("Enter"); await lp.wait_for_timeout(500)
        closed = await lp.evaluate("Object.keys(JSON.parse(localStorage.getItem('leiste.closed') || '{}'))")
        check("Spotify geschlossen und gemerkt (auch wenn webOS sie behält)", closed == ['spotify-beehive'], closed)
        await lp.evaluate("LeisteBar.start({from: 'com.webos.app.hdmi2'})"); await lp.wait_for_timeout(500)
        t = await titles(lp)
        check("Leiste neu: geschlossene App bleibt weg, obwohl „running“ sie meldet", 'Spotify' not in t, t)
        await lp.evaluate("window.FG_LOG += '\\n' + (Math.floor(Date.now()/1000) + 2) + ' spotify-beehive'")
        await lp.evaluate("LeisteBar.start({from: 'com.webos.app.hdmi2'})"); await lp.wait_for_timeout(500)
        t = await titles(lp)
        closed = await lp.evaluate("Object.keys(JSON.parse(localStorage.getItem('leiste.closed') || '{}'))")
        check("Spotify wieder geöffnet (neu im Verlauf) → wieder in der Leiste", 'Spotify' in t and closed == [], [t, closed])
        check("keine Seitenfehler (Verlauf)", not lerrs, lerrs)
        await ctx.close()

        ctx, lp, lerrs = await leiste_page({})
        await lp.wait_for_timeout(10300)
        check("Leiste: schließt sich nach 10 s ohne Taste", await lp.evaluate("window.__closed === 1"))
        await ctx.close()

        # ---------- 11. Schnelleinstellungen (Einstellungen-Taste) ----------
        PANEL = "\n@@\n".join([
            json.dumps({"returnValue": True, "settings": {"backlight": "13", "pictureMode": "expert1", "eyeComfortMode": "on"}}),
            json.dumps({"returnValue": True, "settings": {"soundMode": "game", "soundOutput": "external_optical"}}),
            json.dumps({"returnValue": True, "results": [{"key": "pictureMode", "values": {"arrayExt": [
                {"value": "vivid", "visible": True, "active": True}, {"value": "expert1", "visible": True, "active": True},
                {"value": "hdrGame", "visible": False, "active": True}]}}]}),
            json.dumps({"returnValue": False}),
            json.dumps({"returnValue": True, "settings": {}}),
            "app:com.webos.app.multiview\nend"])
        ctx, lp, lerrs = await leiste_page({"mode": "settings", "from": "netflix"}, panel=PANEL)
        await lp.wait_for_timeout(300)
        pst = lambda: lp.evaluate("""({in: document.body.classList.contains('panel-in'), bar: document.body.classList.contains('bar-in'),
            tiles: [...document.querySelectorAll('.p-tile')].map(t => t.querySelector('.p-label').textContent + '=' + t.querySelector('.p-value').textContent),
            icons: [...document.querySelectorAll('.p-ico .p-tip')].map(n => n.textContent),
            focus: (document.querySelector('#panel .is-focused .p-label, #panel .is-focused .p-tip, #panel .is-focused .p-rec-v')||{}).textContent,
            editing: !!document.querySelector('.p-tile.is-editing')})""")
        s1 = await pst()
        check("Schnelleinstellungen fahren links ein, Leiste unten nicht", s1['in'] and not s1['bar'], s1)
        check("Kacheln mit echten Werten", s1['tiles'] == ['OLED-Helligkeit=13', 'Bildmodus=Experte (heller Raum)', 'Augenschonend=Ein', 'Klangmodus=Spiele-Optimierer',
              'Audioausgabe=Optischer Ausgang', 'Schlummerfunktion=Einstellen', 'Bildschirm aus=', 'Multi View='], s1['tiles'])
        check("Symbolleiste: ohne KI-App nur Einstellungen, Barrierefreiheit, Netzwerk, Anpassen", s1['icons'] == ['Alle Einstellungen', 'Barrierefreiheit', 'Netzwerk', 'Anpassen'], s1['icons'])
        check("Start auf der OLED-Helligkeit", s1['focus'] == 'OLED-Helligkeit', s1)
        await lp.keyboard.press("Enter"); await lp.wait_for_timeout(80)
        for _ in range(3): await lp.keyboard.press("ArrowRight"); await lp.wait_for_timeout(40)
        await lp.wait_for_timeout(300)
        cmds = await lp.evaluate("window.__execs.filter(c => c.indexOf('setSystemSettings') >= 0)")
        s1 = await pst()
        check("OK + Rechts: Helligkeit 16, an den Fernseher gesendet", s1['editing'] and s1['tiles'][0] == 'OLED-Helligkeit=16' and any('"backlight":"16"' in c for c in cmds) and len(cmds) <= 3, [s1['tiles'][0], cmds])
        await lp.keyboard.press("Enter"); await lp.keyboard.press("ArrowDown"); await lp.keyboard.press("Enter"); await lp.wait_for_timeout(250)
        items = await lp.evaluate("[...document.querySelectorAll('.pp-item span')].map(n=>n.textContent)")
        check("Bildmodus-Auswahl nur mit den Modi, die der Fernseher gerade anbietet", items == ['Lebhaft', 'Experte (heller Raum)'], items)
        await lp.keyboard.press("ArrowUp"); await lp.keyboard.press("Enter"); await lp.wait_for_timeout(300)
        cmds = await lp.evaluate("window.__execs.filter(c => c.indexOf('setSystemSettings') >= 0)")
        s1 = await pst()
        check("Bildmodus „Lebhaft“ gesetzt", any('"pictureMode":"vivid"' in c for c in cmds) and s1['tiles'][1] == 'Bildmodus=Lebhaft', s1['tiles'][1])
        await lp.keyboard.press("ArrowRight"); await lp.keyboard.press("Enter"); await lp.wait_for_timeout(250)
        cmds = await lp.evaluate("window.__execs.filter(c => c.indexOf('setSystemSettings') >= 0)")
        check("Augenschonend ausgeschaltet", any('"eyeComfortMode":"off"' in c for c in cmds) and (await pst())['tiles'][2] == 'Augenschonend=Aus')
        await lp.keyboard.press("ArrowDown"); await lp.keyboard.press("Enter"); await lp.wait_for_timeout(250)
        await lp.keyboard.press("ArrowUp"); await lp.wait_for_timeout(50)
        items = await lp.evaluate("[...document.querySelectorAll('.pp-item')].map(n=>n.textContent + (n.classList.contains('is-focused') ? '*' : ''))")
        await lp.keyboard.press("Enter"); await lp.wait_for_timeout(300)
        cmds = await lp.evaluate("window.__execs.filter(c => c.indexOf('changeSoundOutput') >= 0)")
        check("Audioausgabe umgestellt (Fernbedienungs-API, sonst Einstellungen)", cmds and 'setSystemSettings' in cmds[-1] and '"soundOutput"' in cmds[-1], [items, cmds[-1:]])
        st_ = await lp.evaluate("localStorage.getItem('leiste.recent')")
        check("„Zuletzt geändert“ gemerkt", st_ == 'output', st_)
        await lp.keyboard.press("ArrowDown"); await lp.keyboard.press("Enter"); await lp.wait_for_timeout(500)
        ex = await lp.evaluate("window.__execs.filter(c => c.indexOf('turnOffScreen') >= 0)")
        check("Bildschirm aus: turnOffScreen, Seitenleiste schließt", ex and await lp.evaluate("window.__closed") == 1, ex)
        check("keine Seitenfehler (Schnelleinstellungen)", not lerrs, lerrs)
        await ctx.close()

        PANEL_LCD = PANEL.replace("\n@@\napp:", "\n@@\n" + json.dumps({"returnValue": True, "modelName": "55QNED826RE"}) + "\n@@\napp:")
        ctx, lp, lerrs = await leiste_page({"mode": "settings"}, panel=PANEL_LCD)
        await lp.wait_for_timeout(400)
        lab = await lp.evaluate("document.querySelector('.p-tile.k-slider .p-label').textContent")
        check("LCD-Fernseher: Regler heißt „Helligkeit“ statt „OLED-Helligkeit“", lab == 'Helligkeit', lab)
        await ctx.close()

        ctx, lp, lerrs = await leiste_page({"mode": "settings"}, panel=PANEL)
        await lp.wait_for_timeout(300)
        s1 = await pst()
        # Anpassen: Kachel ausblenden
        for _ in range(3): await lp.keyboard.press("ArrowUp"); await lp.wait_for_timeout(40)
        for _ in range(4): await lp.keyboard.press("ArrowRight"); await lp.wait_for_timeout(40)
        await lp.keyboard.press("Enter"); await lp.wait_for_timeout(200)
        check("Stift: Anpassen-Modus", await lp.evaluate("document.getElementById('panel').classList.contains('custom')"))
        await lp.keyboard.press("ArrowDown"); await lp.keyboard.press("ArrowDown"); await lp.keyboard.press("ArrowDown"); await lp.wait_for_timeout(100)
        lab = await lp.evaluate("document.querySelector('.p-tile.is-focused .p-label').textContent")
        await lp.keyboard.press("Enter"); await lp.wait_for_timeout(150)
        await lp.keyboard.press("Escape"); await lp.wait_for_timeout(200)
        s1 = await pst()
        hid = await lp.evaluate("JSON.parse(localStorage.getItem('leiste.hidden'))")
        check("Kachel ausgeblendet und gemerkt", hid and not any(x.startswith(lab + '=') for x in s1['tiles']) and len(s1['tiles']) == 7, [lab, hid, s1['tiles']])
        await lp.evaluate("window.__relaunch({mode: 'settings'})"); await lp.wait_for_timeout(500)
        check("Einstellungen-Taste nochmal: schließt", await lp.evaluate("window.__closed === 1"))
        await ctx.close()

        # Magic Remote: Zeigen wählt, Klicken löst aus, Regler ziehen, 0/100-Knöpfe
        ctx, lp, lerrs = await leiste_page({"mode": "settings"}, panel=PANEL)
        await lp.wait_for_timeout(300)
        sets = lambda: lp.evaluate("window.__execs.filter(c => c.indexOf('setSystemSettings') >= 0)")
        foc = lambda: lp.evaluate("(document.querySelector('#panel .is-focused .p-label, #panel .is-focused .p-tip')||{}).textContent")
        tile = lambda name: lp.locator('.p-tile', has_text=name).first
        await tile('Klangmodus').hover(); await lp.wait_for_timeout(120)
        check("Maus: Zeigen auf eine Kachel wählt sie aus", await foc() == 'Klangmodus', await foc())
        await lp.locator('.p-ico').nth(1).hover(); await lp.wait_for_timeout(120)
        check("Maus: Zeigen auf ein Symbol zeigt dessen Namen", await foc() == 'Barrierefreiheit', await foc())
        await tile('Bildmodus').click(); await lp.wait_for_timeout(250)
        items = await lp.evaluate("[...document.querySelectorAll('.pp-item span')].map(n=>n.textContent)")
        check("Maus: Klick auf Bildmodus öffnet die Auswahl", items == ['Lebhaft', 'Experte (heller Raum)'], items)
        await lp.locator('.pp-item', has_text='Lebhaft').hover(); await lp.wait_for_timeout(80)
        hf = await lp.evaluate("(document.querySelector('.pp-item.is-focused span')||{}).textContent")
        await lp.locator('.pp-item', has_text='Lebhaft').click(); await lp.wait_for_timeout(300)
        check("Maus: Eintrag zeigen und klicken setzt den Bildmodus", hf == 'Lebhaft' and any('"pictureMode":"vivid"' in c for c in await sets()) and await lp.evaluate("document.getElementById('p-pop').hidden"), hf)
        await tile('Augenschonend').click(); await lp.wait_for_timeout(250)
        check("Maus: Klick schaltet Augenschonend um", any('"eyeComfortMode":"off"' in c for c in await sets()))
        bar = await lp.locator('.p-bar').bounding_box()
        y = bar['y'] + bar['height'] / 2
        n0 = len(await sets())
        await lp.mouse.move(bar['x'] + bar['width'] * 0.2, y); await lp.mouse.down()
        for k in range(1, 21):
            await lp.mouse.move(bar['x'] + bar['width'] * (0.2 + k * 0.03), y); await lp.wait_for_timeout(16)
        await lp.mouse.up(); await lp.wait_for_timeout(300)
        new = [c for c in (await sets())[n0:] if 'backlight' in c]
        val = await lp.evaluate("document.querySelector('.p-tile.k-slider .p-value').textContent")
        check("Maus: Helligkeit am Regler ziehen (80), gedrosselt gesendet, Endwert kommt an", val in ('79', '80', '81') and new and ('"backlight":"%s"' % val) in new[-1] and len(new) <= 6, [val, len(new), new[-1:]])
        knob = await lp.evaluate("document.querySelector('.p-bar b').style.left")
        check("Regler-Knopf folgt", knob == val + '%', knob)
        await lp.locator('.p-max').click(); await lp.wait_for_timeout(250)
        v1 = await lp.evaluate("document.querySelector('.p-tile.k-slider .p-value').textContent")
        ok1 = '"backlight":"100"' in (await sets())[-1]
        await lp.locator('.p-min').click(); await lp.wait_for_timeout(250)
        v2 = await lp.evaluate("document.querySelector('.p-tile.k-slider .p-value').textContent")
        check("Knöpfe an den Enden: 100 % und 0 %", v1 == '100' and ok1 and v2 == '0' and '"backlight":"0"' in (await sets())[-1], [v1, v2])
        await lp.mouse.click(bar['x'] + bar['width'] * 0.5, y); await lp.wait_for_timeout(250)
        v3 = await lp.evaluate("document.querySelector('.p-tile.k-slider .p-value').textContent")
        check("Tippen auf den Regler springt dorthin (50)", v3 in ('49', '50', '51') and ('"backlight":"%s"' % v3) in (await sets())[-1], v3)
        check("Panel bleibt nach Mausbedienung offen", await lp.evaluate("window.__closed === 0 && document.body.classList.contains('panel-in')"))
        check("keine Seitenfehler (Maus)", not lerrs, lerrs)
        await ctx.close()

        ctx, lp, lerrs = await leiste_page({"mode": "settings"}, panel=PANEL)
        await lp.evaluate("window.__relaunch({from: 'netflix'})"); await lp.wait_for_timeout(400)
        s1 = await pst()
        check("Source während der Schnelleinstellungen: wechselt zur Leiste", s1['bar'] and not s1['in'], s1)
        check("keine Seitenfehler (Umschalten)", not lerrs, lerrs)
        await ctx.close()
        await b.close()
    print("\n%d Fehler" % len(fails))
    sys.exit(1 if fails else 0)

asyncio.run(main())
