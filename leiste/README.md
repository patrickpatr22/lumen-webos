# Lumen Leiste

Zusatz-App zu Lumen mit zwei Ansichten, die als `overlay`-Fenster über der laufenden App bzw.
dem HDMI-Bild liegen (`"defaultWindowType": "overlay"`, `"transparent": true`, unsichtbar im
App-Menü). App-ID `de.lumenhome.leiste`.

## Source-Taste: Leiste unten (`go-inputs`)

- Inhalt: Eingänge (Namen aus Lumen) · im Hintergrund offene Apps · „Andere schließen“.
- Bedienung: Links/Rechts wählt, OK wechselt, **Hoch auf einer App → „Schließen“**, Zurück schließt,
  nochmal Source → nächster Eintrag. Magic Remote: zeigen und klicken. Nach 10 s ohne Taste schließt sie sich.
- Verbunden-Punkt: `com.webos.service.eim/getAllInputStatus`, das erste vorhandene Feld entscheidet
  (`hdmiPlugIn` vor `connected` – wie in Lumen).
- Offene Apps: `applicationManager/running`, gefiltert auf echte Apps aus Lumens `apps.json`.
  Vorgeladene Apps (Feld `preload…`) zählen nicht.
- Schließen per `closeByAppId` (als root über den Homebrew Channel). Danach prüft die Leiste, ob die App
  noch läuft, und versucht es sonst ein zweites Mal. Hält webOS die App trotzdem vorgeladen (YouTube,
  Netflix …), merkt sich die Leiste sie als geschlossen (`localStorage leiste.closed`) und zeigt sie erst
  wieder, wenn die App das nächste Mal vorne läuft. Protokoll: `/tmp/leiste-close.log`.

## Einstellungen-Taste: Schnelleinstellungen links (`go-settings`)

Ersetzt LGs Seitenleiste mit denselben Funktionen:

| Element | Funktion |
|---|---|
| ⚙ / KI / Barrierefreiheit / Netzwerk | öffnet die jeweilige Seite der TV-Einstellungen (KI nur, wenn die App vorhanden ist) |
| ✎ Anpassen | Kacheln ein- oder ausblenden |
| Zuletzt geändert | springt zur zuletzt geänderten Einstellung |
| OLED-Helligkeit | Regler mit der Magic Remote ziehen oder antippen, Knöpfe ☀0 / ☀100 springen ans Ende; mit Tasten OK, dann ◀ ▶ (`picture/backlight`) |
| Bildmodus, Klangmodus | Auswahlliste mit den Modi, die der Fernseher gerade anbietet (`getSystemSettingDesc`) |
| Augenschonend | OK schaltet um (`picture/eyeComfortMode`) |
| Audioausgabe | Auswahlliste (`apiadapter/audio/changeSoundOutput`, sonst `sound/soundOutput`) |
| Schlummerfunktion | öffnet LGs Schlummer-Menü (`com.webos.app.tvhotkey`, `activateType: sleep`) |
| Bildschirm aus | `tvpower/power/turnOffScreen` – jede Taste schaltet ihn wieder ein |
| Multi View | startet `com.webos.app.multiview` (nur wenn vorhanden) |

Magic Remote: Zeigen wählt aus, Klicken löst aus – wie in der Source-Leiste. Gleiche Glasfläche und
Auswahl (weiß, leicht vergrößert) wie die Source-Leiste und Lumen.

Zurück oder die Einstellungen-Taste nochmal schließt sie. Nach 20 s ohne Taste schließt sie sich.

Ob webOS den Fenstertyp „overlay“ für selbst installierte Apps zulässt, ist nicht offiziell
dokumentiert (Hinweis im webOS-Homebrew-Wiki).

Schrift: Inter (SIL Open Font License, siehe `fonts/Inter-LICENSE.txt`).

## Versionen

- **1.2.3** – Der Helligkeitsregler heißt auf LCD-Fernsehern „Helligkeit“ (Hintergrundbeleuchtung), auf OLED-Fernsehern weiter „OLED-Helligkeit“.
- **1.2.2** – Geschlossene Apps bleiben weg, auch wenn webOS sie Sekunden später wieder vorlädt. Die Leiste trägt die App hinter sich selbst in den Verlauf ein.
- **1.2.1** – Offen ist nur, was seit dem Einschalten wirklich vorne lief (Verlauf vom tvclean-Home-Wächter in `/tmp/tvclean-foreground.log`). Von webOS vorgeladene Apps wie YouTube, Netflix oder LG Channels erscheinen nicht mehr. Geschlossene Apps bleiben weg, bis du sie wieder öffnest.
- **1.2** – Lumen-Eintrag und Hinweiszeile entfernt. Schließen wird nachgeprüft, geschlossene Apps tauchen
  nicht wieder auf. Schnelleinstellungen im Design der Leiste, Magic-Remote-Bedienung, Helligkeitsregler
  zum Ziehen mit 0-%- und 100-%-Knopf.
- **1.1** – Offene Apps in der Leiste, Schnelleinstellungen für die Einstellungen-Taste.
- **1.0** – Source-Leiste über dem laufenden Bild.
