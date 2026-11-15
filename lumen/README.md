# Lumen – Launcher für gerootete LG-webOS-Fernseher

Eigener Startbildschirm für gerootete LG-Fernseher mit Homebrew Channel. Er arbeitet mit dem Paket **tvclean** zusammen, das die Home- und Source-Taste auf Lumen umlegt.

- Apps als Kacheln in einem gläsernen Dock. Die Kachelfarbe wird automatisch aus dem App-Symbol gelesen.
- Große Vorschaukarte rechts oben als leicht gekippte Glasplatte. Sie zeigt den letzten Bildschirm der App, ein eigenes Bild, das App-Symbol oder bei HDMI das Live-Bild – pro App einstellbar.
- Unter dem App-Namen steht eine Eigenschaft („Video“, „Musik“, „Multimedia“ …).
- Start-Animation mit dem Lumen-Logo nach dem Einschalten. Sie verdeckt die Ladezeit: Das Logo hält an, bis Apps, Bilder und Symbole bereit sind.
- Home-Taste aus einer App: Lumen ist sofort wieder da, genau wie du es verlassen hast.
- Eingänge (HDMI 1–4) mit eigenen Namen und Symbolen.
- WLED-LEDs leuchten in Zonen passend zur Startseite. Bei YouTube leuchtet zum Beispiel rechts oben kräftig Rot und atmet und funkelt leicht, der Rest bleibt gedimmt.
- Optional (Test): Source zeigt über einer laufenden App bzw. einem HDMI-Eingang nur eine Eingangs-Leiste („Lumen Leiste“).
- Begrüßung klassisch oder mit wechselnden Meme-Zitaten.
- Optionales Web-Backend: Vorschaubilder vom PC oder Handy aus hochladen.
- Bildschirmschoner mit wandernder Uhr auf Schwarz, um das OLED-Panel vor Einbrennen zu schützen.
- Keine Werbung, keine Konten. Lumen spricht nur mit dem Fernseher selbst und, falls eingerichtet, mit dem WLED-Controller im eigenen Netz.

## Bedienung

| Taste | Funktion |
|---|---|
| Pfeiltasten | bewegen |
| OK | App öffnen bzw. Eingang umschalten |
| OK gedrückt halten | Kachel anpassen: verschieben, ausblenden, Vorschau festhalten/löschen, Eingang umbenennen |
| Zurück | Menü schließen bzw. zur ersten Kachel springen |
| Home (mit tvclean) | aus einer App: Startseite, wie du sie verlassen hast · in Lumen: erste App |
| Source (mit tvclean) | Startseite, erster Eingang (umstellbar auf „Apps“ oder „Leiste über dem Bild“) |
| Magic Remote | zeigen und klicken; Kacheln in Zeigernähe drehen sich zum Zeiger |
| beliebige Taste während der Start-Animation | überspringen |

## Einstellungen („Anpassen“)

Links stehen die Kategorien, rechts die Optionen. Bei Auswahlfeldern öffnet OK eine Liste mit Häkchen. Mit Hoch/Runter wählst du, OK übernimmt, Zurück bricht ab.

| Kategorie | Inhalt |
|---|---|
| Allgemein | Home-Taste (letzte Auswahl oder erste App), Source-Taste (Lumen · Eingänge, Lumen · Apps, Leiste über dem Bild), Bildschirmschoner, Version, IP des Fernsehers, Lumen neu laden |
| Darstellung | Hintergrund (App-Farbe, 6 Lumen-Designs, eigene Bilder), Begrüßung (Klassisch, Meme-Zitate, Aus), Name, Zitat-Wechsel |
| Animationen | Hauptschalter. Tempo-Regler in Prozent für die App-Reihe und die Vorschaukarte (Links/Rechts, Standard 80 %). Einzeln wählbar: Start-Animation, Rückkehr mit Home, Vorschau-Wechsel (Einfliegen & Drehen, Aufsteigen, Kippen, Überblenden), Kachel-Auswahl, Zitat-Wechsel, Dauer-Effekte. Mit Vorschau zum Ausprobieren |
| Vorschau | Inhalt der Karte, automatische Aufnahme, Live-Bild für HDMI, alle Bilder löschen |
| Apps | ausgeblendete Apps zurückholen, Reihenfolge zurücksetzen, App-Liste neu laden |
| Eingänge | welche HDMI-Eingänge erscheinen |
| Licht (WLED) | Lichtsync, Adresse, Aufteilung, Effekt (Standard: Spot atmet + funkelt), Tempo, Restliche Zonen, Zonen einrichten, Beim Verlassen, Verbindung testen |
| Web-Backend | Ein/Aus, Adresse für den Browser, Status |

## Vorschaukarte

Was die Karte zeigt, stellst du pro App ein: OK auf der App gedrückt halten → „Inhalt der Karte“, oder im Web-Backend.

| Inhalt | Wirkung |
|---|---|
| Automatisch | eigenes Bild, sonst letzter Bildschirm, sonst App-Symbol (Standard) |
| Eigenes Bild | das hochgeladene Bild (fehlt es: App-Symbol) |
| Letzter Bildschirm | das Bildschirmfoto beim Verlassen (fehlt es: App-Symbol) |
| App-Symbol | immer das Symbol |

- **Letzter Bildschirm:** Drückst du in einer App die Home-Taste, nimmt `go-home` (tvclean) vorher ein Bild auf (`executeOneShot` des Capture-Dienstes, 640×360). Kommt ein neues Bild der gerade gewählten App, blendet die Karte weich über.
- **Festhalten:** OK auf der App gedrückt halten → „Bildschirmfoto festhalten“. Danach wird es nicht mehr überschrieben.
- **Eigenes Bild:** über das Web-Backend hochladen.
- **HDMI live:** Bleibt die Auswahl kurz auf einem eingesteckten Eingang, versucht Lumen ihn live zu zeigen (`<video>` mit `ext://hdmi:N`). Die Karte wird dafür flach.
- Die Karte zeigt keine Zusatztexte. Rahmen, Kante und Schatten liegen auf derselben Grafikebene wie das Bild, damit beim Einfliegen alles zusammen bleibt.
- Ablage: `/var/lib/webosbrew/lumen/` (`shots/`, `previews/`, `tiles.json`). Übersteht App-Updates.
- Bei kopiergeschützten Inhalten (Netflix, Prime Video …) bleibt die Aufnahme oft schwarz. Fast leere Aufnahmen (unter 7 KB) verwirft go-home.

## Source-Taste: Leiste über dem Bild (Test)

Lumen ist eine normale App: Öffnet sie sich, tritt die laufende App bzw. der HDMI-Eingang in den Hintergrund. Ein echtes Overlay geht nur mit einem anderen Fenstertyp. Dafür gibt es die kleine Zusatz-App **Lumen Leiste** (`de.lumenhome.leiste`, eigenes Paket `lumen-leiste.ipk`). Sie nutzt den Fenstertyp `overlay` (`defaultWindowType` in `appinfo.json`), den webOS über die laufende App legt.

- Einschalten: **Anpassen → Allgemein → Source-Taste → Leiste über dem Bild (Test)**. Lumen legt dann `leiste.on` im gemeinsamen Ordner an.
- `go-inputs` (tvclean) öffnet die Leiste nur, wenn gerade eine App oder ein HDMI-Eingang läuft und die Leiste installiert ist. Sonst öffnet sich wie gewohnt Lumen.
- In der Leiste: Links/Rechts wählt, OK schaltet um, Zurück schließt, nochmal Source springt zum nächsten Eingang. Nach 8 s ohne Taste schließt sie sich.
- Die Namen der Eingänge kommen aus Lumen (`inputs.json`).
- Seit Leiste 1.1 zeigt sie auch die im Hintergrund offenen Apps: OK wechselt hin, Hoch → „Schließen“ beendet eine App, „Andere schließen“ räumt auf.
- Die Einstellungen-Taste öffnet links die Schnelleinstellungen der Leiste (`go-settings`), bedienbar auch mit der Magic Remote.
- Die Leiste enthält auch die **Schnelleinstellungen** für die Einstellungen-Taste (siehe README der Leiste und `go-settings` in tvclean).

## Licht (WLED)

Lumen teilt den LED-Streifen in fünf Zonen: unten links, links, oben, rechts, unten rechts. Mit „Fein“ werden daraus 12 Abschnitte. Jede Zone bekommt die Farbe des Hintergrunds an ihrer Stelle, so wandert das Licht mit der Vorschaukarte. „Restliche Zonen“ legt fest, wie stark die übrigen Bereiche gedimmt werden.

Einrichten unter **Licht → Zonen einrichten**:

1. **Anfang** und **Richtung** des Streifens einstellen, von vorne gesehen.
2. **Automatisch aufteilen** verteilt die LED-Anzahl des Controllers nach Bildschirmmaßen. Einzelne Zonen lassen sich danach korrigieren.
3. **Zonen testen** färbt jede Zone 8 s lang: unten links rot, links orange, oben grün, rechts blau, unten rechts lila.

Effekte:

- **Spot atmet + funkelt** (Standard): Die kräftige Zone funkelt (WLED „Sparkle“: einzelne LEDs blitzen heller über der App-Farbe). Lumen lässt ihre Helligkeit zusätzlich langsam zwischen 100 % und etwa 60 % gleiten (Atem über `tt`). Die übrigen Zonen bleiben ruhig.
- Statisch, Alles atmet (WLED „Breathe“), Alles funkelt („Twinkle“), Atmen + Funkeln (die kräftige Zone atmet, die anderen funkeln).
- Das Tempo gilt für Funkeln und Atem. Lumen legt dafür Segmente über die JSON-API an (`/json/state`). Vor der ersten Änderung sichert es den bisherigen Zustand. Beim Verlassen stellt es ihn wieder her oder schaltet je nach Einstellung aus bzw. hält die Farbe. Antwortet der Controller dem Browser nicht direkt, sendet Lumen über den Homebrew Channel (`curl`/`wget`).

## Web-Backend

Ist es unter **Web-Backend** eingeschaltet, startet Lumen einen kleinen Node-Server auf Port 8484 (`backend/server.js`). Die Einstellungen zeigen die Adresse, z. B. `http://192.168.178.45:8484`.

- Startseite im Browser: Status und alle Apps. Pro App: **Inhalt der Kachel** (Automatisch, Eigenes Bild, Letzter Bildschirm, App-Symbol), **Eigenschaft** (Text unter dem Namen, leer = automatisch), eigenes Bild hochladen oder entfernen (JPG/PNG, max. 6 MB).
- Lumen fragt alle 4 s den Änderungszähler ab und übernimmt Änderungen von selbst.
- API: `GET /api/status`, `GET /api/rev`, `GET /api/tiles`, `PUT /api/tiles/<app-id>` (`{"content":…, "tag":…}`), `PUT|POST /api/preview/<app-id>`, `DELETE /api/preview/<app-id>`, `GET /media/shots|previews/<app-id>.jpg|png`, `GET /icon/<datei>`.
- Keine Anmeldung. Es ist nur für das eigene Heimnetz gedacht, deshalb ist es ab Werk aus.

## Startparameter

| Parameter | Wirkung |
|---|---|
| `{"focus":"apps"}` | Home-Taste: aus einer App zurück → Auswahl bleibt; in Lumen → erste App |
| `{"focus":"inputs","key":"source"}` | ersten Eingang auswählen (Source-Taste, umstellbar) |
| `{"focus":"apps","shot":"<app-id>","t":"<epoch>"}` | frische Aufnahme sofort in der Karte zeigen |

Beispiel:

    luna-send -n 1 luna://com.webos.applicationManager/launch '{"id":"de.lumenhome.launcher","params":{"focus":"inputs"}}'

Ist Lumen schon sichtbar, springt nur die Auswahl. Kommt Lumen aus dem Hintergrund, bleibt alles stehen, wie es war: webOS zeigt beim Wechsel zuerst das letzte Bild von Lumen, deshalb blendet Lumen beim Verlassen nichts aus. Kommt der Fernseher aus dem Standby oder wurde er neu gestartet, läuft die Start-Animation. Den Neustart erkennt Lumen an `/proc/sys/kernel/random/boot_id`, den Standby an einem Sprung der monotonen Uhr.

## Aufbau des Codes

| Datei | Aufgabe |
|---|---|
| `js/luna.js` | Zugriff auf den webOS-Bus und den Homebrew-Channel-Dienst |
| `js/core.js` | Einstellungen, Zustand, Farben, Symbole, Logo |
| `js/data.js` | App-Liste, Symbole, Eingänge, Zwischenspeicher |
| `js/home.js` | Startseite: Reihen, Fokus, Karte, Magic-Remote-Effekt |
| `js/preview.js` | Vorschaubilder und HDMI-Live-Bild |
| `js/greet.js`, `js/quotes.js` | Begrüßung und Zitat-Sammlung (eigene Zitate einfach ergänzen) |
| `js/anim.js` | Start-Animation, Aufbau, Neustart-/Standby-Erkennung |
| `js/wled.js` | Zonen, Effekte, Sichern und Wiederherstellen |
| `js/settings.js` | Einstellungen, Auswahllisten, Regler, Kontextmenüs, Texteingabe |
| `js/bar.js` | Schalter für die Lumen Leiste (Source über dem Bild) |
| `js/backend.js`, `backend/` | Web-Backend |
| `js/main.js` | Start, Tasten, Sichtbarkeit, Bildschirmschoner |
| `css/*.css` | `base`, `home`, `motion`, `settings`, `boot` |

Alle Animationen nutzen nur `transform`/`opacity` bzw. `translate`/`rotate`/`scale`. Beim Durchklicken verteilt Lumen die Arbeit auf mehrere Bilder:

1. Sofort: Kachel und Reihe.
2. Ein Bild später: Titel.
3. Nach kurzer Ruhe: Karte, Hintergrund, LEDs.

Bilder werden vorab dekodiert und für die Nachbar-Apps vorgeladen. Außerhalb von webOS (`index.html` im Browser) läuft ein Demo-Modus mit Beispiel-Kacheln.

## Zusammenspiel mit tvclean

- Den Ersatz für den webOS-Home-Screen übernimmt der Home-Wächter von tvclean (`HOME_REDIRECT=1`).
- LG Input Hook ruft für die Tasten `sh /home/root/go-home` und `sh /home/root/go-inputs` auf.
- go-home nimmt nur dann Vorschaubilder auf, wenn in Lumen „Automatisch aufnehmen“ an ist (Datei `autoshot.on`).
- go-inputs öffnet die Lumen Leiste nur, wenn `leiste.on` existiert und eine App bzw. ein HDMI-Eingang läuft.

## Hintergrund

Anpassen → Darstellung → Hintergrund, oder im Web-Backend unter „Hintergrund“:

- **App-Farbe** – das Licht wechselt mit der ausgewählten App (wie bisher).
- **Lumen-Designs** – Polarlicht, Tiefsee, Abendrot, Nebel, Graphit, Mitternacht. Reines CSS, kostet keine Leistung.
- **Eigene Bilder** – im Web-Backend hochladen (JPEG/PNG, max. 12 MB, am besten 1920×1080), dort auswählen oder löschen. Sie liegen in `/var/lib/webosbrew/lumen/backgrounds` und überstehen Updates. Lumen dunkelt sie leicht ab, damit Titel und Kacheln lesbar bleiben.

Die Auswahl im Web-Backend landet in `ui.json`, Lumen übernimmt sie beim nächsten Abgleich. Die jeweils neuere Wahl (TV oder Web-Backend) gilt.

## Versionen

- **1.6.2** – Läuft jetzt auch auf webOS 22/23 vollständig: „Vorschau atmet“, Start- und Aufbau-Animationen sowie das Kippen zum Zeiger nutzen `transform` statt der Einzel-Eigenschaften `translate`/`rotate`/`scale` (die gibt es erst ab Chromium 104). Keine persönlichen Vorgaben mehr im Code.
- **1.6.1** – Für neue Fernseher ohne fest eingetragenen Namen und ohne WLED-Adresse. Bestehende Einstellungen bleiben.
- **1.6**
  - Hintergrund wählbar: App-Farbe, sechs Lumen-Designs, eigene Bilder aus dem Web-Backend (Hochladen, Auswählen, Löschen).
  - Design „Mono“ entfernt, Lumen ist nur noch Glas (alte Einstellung wird übernommen).
  - App-Reihe: nicht ausgewählte Kacheln kleiner (92 %), ausgewählte größer (107 %), mit Abstand zum Dock-Rand.
  - Vorschaukarte etwas größer (640 × 384).

- **1.5.1** – Ausgewählte Kachel stößt nicht mehr oben an den Dock-Rand. Die Erkennung der Lumen Leiste prüft jetzt App-Liste, Installationsordner und Application Manager. Lumen teilt die App-Liste mit Symbolen (`apps.json`), damit die Leiste offene Apps zeigen kann.
- **1.5**
  - Vorschaukarte: leicht gekippte Glasplatte, Spotlicht, Rahmen und Zusatztexte entfernt, Inhalt pro App wählbar (TV und Web-Backend).
  - App-Reihe wieder 5 Kacheln (Mono 6). Größerer Titel ohne „App“, darunter eine Eigenschaft.
  - Tempo-Regler für App-Reihe und Vorschaukarte (Standard 80 %). Neuer Vorschau-Wechsel „Aufsteigen“.
  - Flüssiger beim Durchklicken: gestaffelte Arbeit, vorab dekodierte Bilder, keine Masken- oder Neuzeichen-Effekte mehr. Bei gedrosselter CPU: Median 16,7 statt 33 ms pro Bild, lange Bilder von 9 auf 1.
  - Start-Animation ausgebaut: Lichtspalt, Lichtstreifen, Zündung mit Druckwellen und Strahlen, Flug durch den Lichtpunkt. Sie verdeckt die Ladezeit.
  - Home: kein Schwarzbild und kein Neuaufbau mehr, die Auswahl bleibt erhalten.
  - WLED-Effekt „Spot atmet + funkelt“.
  - Test: Lumen Leiste für Source über dem laufenden Bild.

- **1.4** – In Module aufgeteilt.
  - Source-Taste führt direkt ins Hauptmenü, ohne Overlay.
  - Start-Animation mit neuem Logo; strukturierter Aufbau bei Home.
  - Größere 3D-Vorschaukarte mit Spotlicht und Tiefe. Sie zeigt den letzten Bildschirm, eigene Bilder oder HDMI live. Beim Wechsel fliegt sie von unten ein und dreht sich.
  - Kacheln 15–17 % kleiner (Glas 6, Mono 7 im Dock). Kacheln mit Auswahl-Animation; sie drehen sich zum Magic-Remote-Zeiger.
  - Einstellungen in Kategorien mit Auswahllisten. Jede Animation lässt sich einzeln abschalten oder austauschen.
  - WLED-Zonen mit Spotlicht und Effekten Atmen/Funkeln.
  - Meme-Zitate in der Begrüßung, kleiner und dezenter.
  - Web-Backend für eigene Vorschaubilder.
- **1.3** – Source-Overlay, WLED-Lichtsync, stärker atmende Vorschaukarte, App-Reihe mit ganzen Kacheln, Eingänge umbenennen.
- **1.2** – Glas-Design überarbeitet, Design „Mono“, Schalter „Bewegung“, wechselnde Begrüßungen, HDMI-Status, schneller Start durch Zwischenspeicher.
- **1.1.1** – behoben: Lumen kam nach dem ersten Start nicht mehr in den Vordergrund.
- **1.1** – deutlich flüssiger, Startparameter.
- **1.0** – erste Version.

## Lizenzen und Dank

- Schrift: Inter (SIL Open Font License, siehe `fonts/Inter-LICENSE.txt`).
- Angeregt von zwei Uiverse-Elementen (MIT-Lizenz), nachgebaut statt kopiert:
  - „witty-deer-12“ von kennyotsu: das Kippen zum Zeiger.
  - „bright-lizard-8“ von dexter-st: Kugel mit kreisenden Lichtern und pulsierenden Buchstaben in der Start-Animation.
- Die Zitate sind kurze, bekannte Sprüche aus Fernsehen, Fußball und Internet.
