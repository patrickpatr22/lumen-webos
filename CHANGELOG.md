# Änderungen

## 2026-11-15 – erste Veröffentlichung

| Teil | Version |
|---|---|
| Lumen | 1.6.2 |
| Lumen Leiste | 1.2.3 |
| tvclean | Update 8 |
| Lumen Installer | 1.0 |

### Lumen 1.6.2
- Läuft auf webOS 22/23 vollständig. „Vorschau atmet“, Start- und Aufbau-Animationen und das Kippen
  zum Magic-Remote-Zeiger nutzen `transform` statt der erst ab Chromium 104 verfügbaren Einzel-Eigenschaften.
- Keine Vorgaben für Name und WLED-Adresse: Neue Fernseher starten neutral.

### Lumen 1.6
- Hintergrund wählbar: App-Farbe, sechs Lumen-Designs (Polarlicht, Tiefsee, Abendrot, Nebel, Graphit,
  Mitternacht) oder eigene Bilder, die du im Web-Backend hochlädst und verwaltest.
- Nur noch das Glas-Design; ausgewählte App größer, übrige kleiner; Vorschaukarte größer.

### Lumen Leiste 1.2.x
- Offen ist nur, was seit dem Einschalten wirklich vorne lief. Von webOS vorgeladene Apps (YouTube,
  Netflix, LG Channels …) erscheinen nicht mehr; geschlossene Apps bleiben weg, bis du sie wieder öffnest.
- Schnelleinstellungen im Design der Leiste, voll mit der Magic Remote bedienbar, Helligkeitsregler mit
  Knöpfen für 0 % und 100 %; auf LCD-Fernsehern heißt er „Helligkeit“.
- Lumen-Eintrag und Hinweiszeile aus der Source-Leiste entfernt.

### tvclean Update 8
- Der Home-Wächter schreibt mit, welche App vorne läuft (`/tmp/tvclean-foreground.log`).
- Der Home-Wächter überlebt das Ende der SSH-Sitzung, aus der er gestartet wurde (`setsid`).
- Kurzbefehl `go-settings` für die Einstellungen-Taste.

### Lumen Installer 1.0
- Pakete wählen oder ins Fenster ziehen, Name und Version werden angezeigt.
- Fernseher im Netz suchen (SSDP), SSH-Erreichbarkeit prüfen.
- Update oder Komplettinstallation auf einem neuen Fernseher (legt die tvclean-Einstellung an, startet neu).

Ältere Versionen: siehe [lumen/README.md](lumen/README.md#versionen) und [leiste/README.md](leiste/README.md#versionen).
