# tvclean – webOS entschlacken (für gerootete LG-TVs)

Für einen gerooteten LG-TV mit Homebrew Channel (geschrieben für den OLED55B39LA, webOS 23).

**Was tvclean macht**

- **Werbung, Tracking, KI-Plattform und Firmware-Updates sperren**, über eine Sperrliste in `/etc/hosts`, die bei jedem Start eingebunden wird. Der LG Content Store und App-Updates funktionieren weiter.
- **Apps ausblenden**, auch System-Apps, die sich nicht deinstallieren lassen. Dabei wird nichts gelöscht.
- **Store-Apps deinstallieren**, die du nicht brauchst.
- **webOS-Home durch deinen Launcher ersetzen.** Ein kleiner Wächter im Hintergrund öffnet sofort deinen Launcher, sobald webOS seinen Home-Screen zeigt: beim Einschalten, bei der Home-Taste und beim Beenden einer App.
- Die **Update-Sperre** des Homebrew Channels einschalten, damit ein Update dir nicht den Root-Zugang nimmt.

**Was tvclean nicht kann:** webOS ersetzen. Das System läuft weiter im Hintergrund, du bekommst es nur kaum noch zu sehen. Beim Druck auf die Home-Taste kann der webOS-Home-Screen für einen Augenblick aufblitzen, bevor der Launcher übernimmt. Wie du auch das vermeidest, steht weiter unten bei „LG Input Hook“.

Alle Änderungen werden beim Starten über das echte System gelegt (bind mount). Das Dateisystem des TVs wird nicht verändert. Mit `uninstall` und einem Neustart ist alles wieder wie vorher, ein Werksreset entfernt ohnehin alles.

---

## 1. Vorbereitung am TV

1. Öffne den **Homebrew Channel**, dann **Einstellungen**:
   - Bei **Root status** muss **ok** stehen. Wenn nicht, ist der TV nicht wirklich gerootet. Dann bitte hier aufhören.
   - Schalte **SSH Server** ein.
2. Wenn die **LG-Developer-Mode-App** noch installiert ist, deinstalliere sie vor dem nächsten Neustart (oder später mit `tvclean.sh remove com.palmdts.devmode`). Installiere sie nie wieder, solange der TV gerootet ist.
3. Installiere **keine Firmware-Updates** mehr. Ein Update entfernt den Root-Zugang, und LG schließt die Lücke dabei.
4. Notiere dir die **IP-Adresse** des TVs (Einstellungen → Netzwerk).

## 2. Auf den TV kopieren

Entpacke das ZIP auf deinem Computer. Öffne ein Terminal in dem Ordner, **in dem** der Ordner `tvclean` liegt, nicht im Ordner selbst. Unter Windows nimmst du die PowerShell, unter macOS/Linux das Terminal.

`<TV-IP>` ist ein Platzhalter: Ersetze ihn samt den spitzen Klammern durch die IP-Adresse deines TVs, z. B. `root@192.168.178.45`.

```
scp -r tvclean root@<TV-IP>:/var/lib/webosbrew/
```

Beim ersten Verbinden fragt SSH, ob du dem Gerät vertraust. Tippe `yes`. Das Passwort ist `alpine`, solange du keinen SSH-Schlüssel eingerichtet hast. Beim Tippen siehst du keine Zeichen, das ist normal.

Wenn die Fehlermeldung „subsystem request failed“ oder „Connection closed“ kommt, nimm das alte Kopierverfahren:

```
scp -O -r tvclean root@<TV-IP>:/var/lib/webosbrew/
```

Unter Windows nutzt du **nicht** den `tar … | ssh`-Weg in der PowerShell 5.1: Sie beschädigt Binärdaten in der Pipe. Über cmd funktioniert er:

```
cmd /c "tar -cf - tvclean | ssh root@<TV-IP> tar -xf - -C /var/lib/webosbrew"
```

## 3. Verbinden und prüfen

```
ssh -t root@<TV-IP>
sh /var/lib/webosbrew/tvclean/tvclean.sh check
```

> Das `-t` ist wichtig: Ohne es geben manche webOS-Befehle keine Antwort.

## 4. App-IDs herausfinden

```
sh /var/lib/webosbrew/tvclean/tvclean.sh apps
```

Die Liste zeigt jede App mit **Typ** (Homebrew, Store, System), **ID** und Namen.
Dein Launcher steht oben bei **Homebrew**.

## 5. Konfiguration anpassen

Bearbeite direkt auf dem TV:

```
vi /var/lib/webosbrew/tvclean/tvclean.conf
```

So funktioniert `vi`: Mit `i` schreibst du, mit `Esc` und dann `:wq` + Enter speicherst du und beendest den Editor.

Alternativ bearbeitest du `tvclean.conf` auf dem Computer und kopierst nur diese Datei neu:

```
scp tvclean/tvclean.conf root@<TV-IP>:/var/lib/webosbrew/tvclean/
```

Die wichtigsten Einträge:

| Eintrag | Bedeutung |
|---|---|
| `LAUNCHER_ID` | ID deines Launchers, mit dem der TV starten soll |
| `HIDE_APPS` | Apps, die aus dem Startmenü verschwinden sollen (auch System-Apps) |
| `REMOVE_APPS` | Store-Apps, die mit `remove` deinstalliert werden |
| `BLOCK_LG` | Werbung, Tracking und Updates sperren (1/0) |
| `BLOCK_THINQ` | LG-ThinQ-Cloud sperren (1/0) |
| `EXTRA_HOSTS` | eigene zusätzliche Domains |
| `HOME_REDIRECT` | Home-Wächter: webOS-Home → Launcher (1/0, Standard 1) |
| `LAUNCHER_AS_INPUT` | Launcher zusätzlich als TV-Eingang anmelden (1/0, Standard 0) |

Diese Apps sind **geschützt** und werden nie ausgeblendet oder entfernt: Home, Einstellungen, HDMI-Eingänge, Input-Hub, Homebrew Channel und dein Launcher. So kannst du dich nicht aussperren.

## 6. Einrichten

```
sh /var/lib/webosbrew/tvclean/tvclean.sh install
sh /var/lib/webosbrew/tvclean/tvclean.sh remove      # optional: REMOVE_APPS deinstallieren
```

## 7. Neu starten und Startbildschirm umstellen

1. **Neustart:** Homebrew Channel → Einstellungen → **System reboot** (oder im SSH-Fenster `reboot`).
   Normales Ausschalten mit der Fernbedienung ist bei aktivem *Quick Start+* nur Standby und kein Neustart.
2. **Einschaltbildschirm:** Alle Einstellungen → Allgemein → System → Zusätzliche Einstellungen → Home-Einstellungen → **Einschaltbildschirm → Home**. Die Namen können je nach Firmware leicht abweichen. Der Home-Wächter leitet den Home-Screen sofort zu deinem Launcher um.
3. Schalte den TV aus und wieder ein und drück einmal die Home-Taste. Beide Male sollte dein Launcher erscheinen.

Zum Kontrollieren:

```
sh /var/lib/webosbrew/tvclean/tvclean.sh status
```

---

## Empfohlen: SSH-Schlüssel statt Passwort, Telnet aus

Der Homebrew Channel lässt Telnet ohne Passwort offen. Jeder im WLAN kommt damit als root auf den TV. So schließt du das:

**Auf dem Computer** einen Schlüssel erzeugen (einfach mit Enter bestätigen):

```
ssh-keygen -t ed25519
```

Den Schlüssel auf den TV kopieren. Unter macOS und Linux:

```
cat ~/.ssh/id_ed25519.pub | ssh root@<TV-IP> "mkdir -p /home/root/.ssh && cat >> /home/root/.ssh/authorized_keys"
```

Unter Windows in der PowerShell:

```
type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh root@<TV-IP> "mkdir -p /home/root/.ssh && cat >> /home/root/.ssh/authorized_keys"
```

Prüfe, ob `ssh root@<TV-IP>` jetzt ohne Passwort funktioniert. Erst danach schaltest du im Homebrew Channel **Telnet** aus.

## Empfohlen: Einstellungen im TV-Menü

Schalte in den TV-Einstellungen (meist unter Allgemein → System bzw. Support/Datenschutz) **Live Plus** aus. Das ist die Erkennung dessen, was du schaust. Widerrufe außerdem bei den **Benutzervereinbarungen** die Zustimmungen für Werbung und Sehverhalten.

## Empfohlen: Home- und Source-Taste direkt umbelegen (LG Input Hook)

Der Home-Wächter reagiert erst, wenn webOS seinen Home-Screen schon geöffnet hat. Deshalb kann der kurz aufblitzen. Mit der Homebrew-App **LG Input Hook** belegst du die Tasten direkt um: Taste gedrückt → Launcher, ohne Umweg über webOS. Ob die App auf deiner Firmware läuft, musst du ausprobieren.

`install` legt dafür zwei Kurzbefehle an, damit du mit der Fernbedienung wenig tippen musst:

| Befehl | Wirkung |
|---|---|
| `sh /home/root/go-home` | öffnet den Launcher (Lumen: so, wie du ihn verlassen hast). Ist in Lumen „Vorschau → Automatisch aufnehmen“ an, wird vorher ein Bild der laufenden App gespeichert (unter `/var/lib/webosbrew/lumen/shots`). |
| `sh /home/root/go-inputs` | öffnet sofort das Lumen-Hauptmenü (Eingänge oder Apps, einstellbar in Lumen unter Allgemein → Source-Taste). Ist dort „Leiste über dem Bild“ gewählt (Datei `leiste.on`), läuft gerade eine App oder ein HDMI-Eingang und ist die Zusatz-App „Lumen Leiste“ installiert, öffnet sich stattdessen die Leiste über dem laufenden Bild. |
| `sh /home/root/go-settings` | öffnet die Lumen-Schnelleinstellungen links über dem Bild (Zusatz-App „Lumen Leiste“). Fehlt sie, öffnen sich die normalen TV-Einstellungen. |

1. Installiere **LG Input Hook** im Homebrew Channel und öffne die App einmal.
2. Ermittle die Tasten-ID: Öffne in der App die Logs, drück die Home-Taste und notiere die Zahl bei `id => …`. Welches Log das richtige ist, hängt von webOS-Version und Fernbedienung ab. Probier die Einträge im Auswahlmenü durch.
3. Wähle „Add keybind“, trag die ID ein, wähle die Aktion **Execute** und als Befehl `sh /home/root/go-home`.
4. Wiederhole das für die Source-Taste mit `sh /home/root/go-inputs`.
5. Optional: Einstellungen-Taste (Zahnrad) mit `sh /home/root/go-settings`. Ihre ID zeigt das Input-Hook-Protokoll, wenn du die Taste einmal drückst.
6. Drück „Save changes“.

Lass den Home-Wächter trotzdem an. Er fängt weiterhin das Einschalten und das Beenden von Apps ab. Außerdem schreibt er mit, welche App gerade vorne läuft (`/tmp/tvclean-foreground.log`, beginnt nach jedem Neustart leer). Daran erkennt die Lumen Leiste, welche Apps du wirklich geöffnet hast – webOS meldet auch vorgeladene Apps wie YouTube oder Netflix als laufend.

## Optional: Sperre im Router

`/etc/hosts` kennt keine Platzhalter und gilt nur bis zu einem Werksreset. Wenn du AdGuard Home oder Pi-hole nutzt, trage zusätzlich `router/adguard-home.txt` ein. Dann sind auch alle Subdomains gesperrt, unabhängig vom TV.

---

## Alle Befehle

```
sh /var/lib/webosbrew/tvclean/tvclean.sh <befehl>
```

| Befehl | Was er tut |
|---|---|
| `check` | Voraussetzungen prüfen (ändert nichts) |
| `apps` | installierte Apps mit IDs anzeigen |
| `install` | einrichten und sofort anwenden |
| `apply` | nach Änderungen an `tvclean.conf` erneut anwenden (danach neu starten) |
| `remove` | Apps aus `REMOVE_APPS` deinstallieren, oder `remove <id> ...` |
| `remove -y` | dasselbe ohne Rückfrage |
| `status` | aktuellen Zustand anzeigen |
| `log` | letzte Log-Einträge anzeigen (`log 100` für mehr) |
| `uninstall` | alles rückgängig machen |

## Wenn etwas schiefgeht

- **Der TV hängt beim Starten:** Der Homebrew Channel erkennt das und startet beim nächsten Mal im **Failsafe-Modus**. Er zeigt dann einen Hinweis auf dem Bildschirm, und es laufen keine Startskripte. SSH gibt es in diesem Modus nicht, nur eine **Telnet-Notfall-Shell ohne Passwort**: `telnet <TV-IP>`. Unter Windows geht das z. B. mit PuTTY (Verbindungstyp „Telnet“). Führe dort `sh /var/lib/webosbrew/tvclean/tvclean.sh uninstall -y` aus und starte neu. Wichtig: Der Start danach ist wieder normal, du hast also nur diesen einen Versuch.
- **Eine App fehlt, die du brauchst:** Entferne ihre ID aus `HIDE_APPS`, führe `apply` aus und starte neu.
- **Der Launcher startet nicht automatisch:** Prüfe mit `status`, ob der Home-Wächter läuft, und schau mit `log` nach Einträgen „Home-Screen erkannt“. Der Einschaltbildschirm muss auf „Home“ stehen. Mit `apply` startest du den Wächter neu.
- **Eine App funktioniert nicht mehr:** Setz testweise `BLOCK_LG=0`, führe `apply` aus und starte neu. Wenn die App dann wieder geht, liegt es an einer Domain in `lists/standard.txt`.
- **Alles zurück:** `uninstall` und Neustart. Die Update-Sperre bleibt dabei absichtlich an.

> **Ehrlicher Hinweis:** tvclean wurde in einer simulierten webOS-Umgebung getestet (BusyBox-Shell, nachgebildete Systemdienste), nicht auf einem echten B3. App-IDs und Details können je nach Firmware abweichen. Wenn etwas nicht klappt, helfen die Ausgaben von `status` und `log` bei der Fehlersuche.
