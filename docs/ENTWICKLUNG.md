# Entwicklung

## Aufbau

```
lumen/       Web-App „Lumen“ (de.lumenhome.launcher) – Hauptmenü, Einstellungen, Web-Backend
leiste/      Web-App „Lumen Leiste“ (de.lumenhome.leiste) – Overlay: Source-Leiste und Schnelleinstellungen
tvclean/     Shell-Skripte für den gerooteten Fernseher (busybox sh / dash)
installer/   Windows-Installer (C#, WinForms, .NET Framework 4.5) und install.sh für den Fernseher
tests/       UI-Tests (Playwright) und tvclean-Tests (simuliertes webOS-Dateisystem)
scripts/     build.sh – baut alle Pakete nach dist/
docs/        Dokumentation, Bilder, LIESMICH.txt für das Komplettpaket
```

### Zusammenspiel auf dem Fernseher

```
Fernbedienung ──► LG Input Hook ──► /home/root/go-home | go-inputs | go-settings  (tvclean/bin)
                                           │                │              │
                                           ▼                ▼              ▼
                                         Lumen        Lumen Leiste    Lumen Leiste
                                                     (Source-Leiste) (Schnelleinstellungen)

tvclean-Home-Wächter: webOS-Home sichtbar → Lumen öffnen; Vordergrund-App → /tmp/tvclean-foreground.log
```

Gemeinsame Daten liegen in `/var/lib/webosbrew/lumen/` und überstehen App-Updates:

| Datei | Schreibt | Liest |
|---|---|---|
| `inputs.json`, `apps.json` | Lumen | Leiste (Namen, Symbole, App-Liste) |
| `tiles.json`, `ui.json`, `backgrounds/` | Lumen, Web-Backend | Lumen |
| `shots/`, `previews/` | go-home, Web-Backend | Lumen (Vorschaukarte) |
| `leiste.on`, `autoshot.on` | Lumen | go-inputs, go-home |

Systemaufrufe laufen über den Luna-Bus. Was eine normale App nicht darf (Apps schließen, Einstellungen
setzen, Dateien schreiben), geht als root über den Homebrew Channel
(`luna://org.webosbrew.hbchannel.service/exec`).

### Regeln für den Code

- **Ziel-Engine Chromium 87** (webOS 22). JavaScript im ES5-Stil (`var`, `function`), keine
  Einzel-Eigenschaften `translate`/`rotate`/`scale` in CSS (erst ab Chromium 104) – Animationen mit `transform`.
- Kein `backdrop-filter` und keine Masken in Animationen: kostet auf TV-Chips zu viel.
- tvclean muss in busybox `sh` und `dash` laufen; Hintergrundprozesse mit `setsid` starten (sonst beendet
  das Ende einer SSH-Sitzung sie).
- Der Installer darf nur APIs aus .NET Framework 4.5 nutzen. Mono bindet sonst still an neuere Überladungen
  (z. B. `string.Trim(char)`), die es unter Windows nicht gibt. Prüfen mit `monodis --memberref`.

## Bauen

Voraussetzungen: Node.js mit `@webos-tools/cli` (für `ares-package`), `zip`, Mono (`mono-mcs` und die
WinForms- und Compression-Bibliotheken), Python 3 mit Pillow.

```sh
npm install -g @webos-tools/cli
sudo apt install mono-mcs libmono-system-windows-forms4.0-cil \
  libmono-system-io-compression4.0-cil libmono-system-io-compression-filesystem4.0-cil zip
pip install pillow

sh scripts/build.sh          # → dist/lumen.ipk, lumen-leiste.ipk, tvclean-update8.zip,
                             #   Lumen-Installer.exe, Lumen-Komplett.zip
```

Einzeln: `ares-package lumen`, `ares-package leiste`, `sh installer/build.sh`.

Der Installer hat einen Selbsttest ohne Oberfläche:

```sh
mono installer/Lumen-Installer.exe --info dist/lumen.ipk dist/tvclean-update8.zip
mono installer/Lumen-Installer.exe --stage /tmp/lumen-inst-test dist/*.ipk dist/tvclean-update8.zip
```

## Tests

```sh
# tvclean: simuliertes webOS-Dateisystem mit Attrappen für luna-send und mount
sh tests/tvclean/run.sh "busybox sh"
sh tests/tvclean/run.sh dash

# Lumen und Leiste im Browser (Playwright, Chrome), mit nachgebautem Luna-Bus
pip install playwright && playwright install chrome
python3 tests/ui/lumen_test.py
```

Die UI-Tests prüfen unter anderem Start-Animation, Vorschaukarte, Einstellungen, WLED, Web-Backend
(echter Node-Server), Hintergründe, Source-Leiste (offene Apps, Schließen, vorgeladene Apps) und die
Schnelleinstellungen mit Tastatur und Maus. Mit `LUMEN_DIR` und `LEISTE_DIR` lassen sie sich auf
entpackte IPKs richten.

## Im Browser ansehen

`lumen/index.html` und `leiste/index.html` laufen auch im Desktop-Browser. Ohne Luna-Bus nutzen sie
Beispieldaten (`LUMEN_DEMO_*`, `LEISTE_DEMO_*`). Chrome mit `--allow-file-access-from-files` starten.
