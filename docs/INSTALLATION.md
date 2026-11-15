# Installation

## Voraussetzungen

1. **Fernseher gerootet**, Homebrew Channel installiert. Im Homebrew Channel → Einstellungen muss
   „Root status: ok“ stehen. Wie du rootest, steht auf [webosbrew.org](https://www.webosbrew.org/rooting);
   ob deine Firmware geht, zeigt [CanI.RootMy.TV](https://cani.rootmy.tv/).
2. Im Homebrew Channel → Einstellungen den **SSH Server** einschalten.
3. Die **LG-Developer-Mode-App** nicht installieren, solange der Fernseher gerootet ist, und **keine
   Firmware-Updates** einspielen. Beides kann den Root-Zugang kosten.
4. webOS 22 oder neuer (siehe [Kompatibilität](KOMPATIBILITAET.md)).

## Mit dem Lumen Installer (Windows)

Unter [Releases](https://github.com/patrickpatr22/lumen-webos/releases/latest) gibt es:

| Datei | Inhalt |
|---|---|
| `Lumen-Komplett.zip` | alles für einen neuen Fernseher: Installer, Lumen, Lumen Leiste, tvclean, Anleitung |
| `Lumen-Installer.exe` | nur der Installer |
| `lumen.ipk`, `lumen-leiste.ipk`, `tvclean-update8.zip` | einzelne Pakete für Updates |

### Neuer Fernseher

1. `Lumen-Komplett.zip` entpacken und `Lumen-Installer.exe` starten.
2. „Neuer Fernseher – Komplettinstallation“ ist beim ersten Start gewählt, die Pakete aus dem Ordner stehen schon in der Liste.
3. **Fernseher suchen.** Der Installer findet LG-Fernseher im Netz und prüft, ob SSH an ist. Alternativ die IP-Adresse eintippen (am Fernseher: Einstellungen → Netzwerk).
4. **Auf den Fernseher installieren.** Es öffnet sich ein Konsolenfenster. Dort fragt der Fernseher zweimal nach dem Root-Passwort (Standard `alpine`). Beim Tippen erscheinen keine Zeichen.
5. Der Installer prüft Root und Homebrew Channel und installiert Lumen, die Leiste und tvclean. Er legt eine tvclean-Einstellung mit Lumen als Startbildschirm an und startet den Fernseher neu.

### Update

1. Installer starten, „Update“ wählen.
2. Die neuen Pakete hinzufügen (Hinzufügen… oder ins Fenster ziehen) und installieren.
3. Deine Einstellungen bleiben erhalten, auch die eigene `tvclean.conf`. Lumen startet danach neu.

Der Installer speichert nur die IP-Adresse und den zuletzt benutzten Ordner
(`%APPDATA%\LumenInstaller\einstellungen.txt`). Das Passwort tippst du jedes Mal im Konsolenfenster ein.

## Manuell

Für macOS, Linux oder wenn du lieber selbst tippst. `<TV-IP>` ist die IP-Adresse des Fernsehers.

```sh
# Pakete auf den Fernseher kopieren (-O: altes Kopierverfahren, der Fernseher kann kein SFTP)
scp -O lumen.ipk lumen-leiste.ipk root@<TV-IP>:/tmp/
unzip tvclean-update8.zip
scp -O -r tvclean root@<TV-IP>:/tmp/

ssh -t root@<TV-IP>
```

Auf dem Fernseher:

```sh
# Apps installieren
luna-send -i -f luna://com.webos.appInstallService/dev/install \
  '{"id":"com.ares.defaultName","ipkUrl":"/tmp/lumen.ipk","subscribe":true}'
luna-send -i -f luna://com.webos.appInstallService/dev/install \
  '{"id":"com.ares.defaultName","ipkUrl":"/tmp/lumen-leiste.ipk","subscribe":true}'
# jeweils mit Strg+C beenden, sobald "state": "installed" erscheint

# tvclean einspielen; beim ersten Mal die Vorlage als Einstellung nehmen
mkdir -p /var/lib/webosbrew/tvclean
cp -r /tmp/tvclean/* /var/lib/webosbrew/tvclean/
cd /var/lib/webosbrew/tvclean
[ -f tvclean.conf ] || sed 's/^LAUNCHER_ID=.*/LAUNCHER_ID="de.lumenhome.launcher"/' tvclean.conf.beispiel > tvclean.conf
sh tvclean.sh install
reboot
```

Mit dem webOS-SDK geht die App-Installation auch über `ares-install lumen.ipk`. Dafür muss der
Fernseher als Gerät eingerichtet sein.

## Nach der Installation

1. **Einschaltbildschirm:** Einstellungen → Allgemein → System → Zusätzliche Einstellungen →
   Home-Einstellungen → Einschaltbildschirm: „Home“. Der Home-Wächter von tvclean öffnet dann Lumen.
   Die Menünamen weichen je nach Firmware leicht ab.
2. **Tasten belegen** mit [LG Input Hook](https://repo.webosbrew.org/apps/org.webosbrew.inputhook/)
   (aus dem Homebrew Channel, einmal öffnen):

   | Taste | Aktion „Execute“ |
   |---|---|
   | Home | `sh /home/root/go-home` |
   | Eingänge (Source) | `sh /home/root/go-inputs` |
   | Einstellungen (Zahnrad) | `sh /home/root/go-settings` |

   Die Tasten-ID zeigt das Protokoll der App, wenn du die Taste drückst (Eintrag `id => …`).
3. **In Lumen unter Anpassen:** Name für die Begrüßung, Source-Taste → „Leiste über dem Bild“,
   Hintergrund, Licht (WLED), Web-Backend.

## Entfernen

1. Lumen und Lumen Leiste im Homebrew Channel deinstallieren.
2. tvclean entfernen und neu starten:
   ```sh
   ssh -t root@<TV-IP>
   sh /var/lib/webosbrew/tvclean/tvclean.sh uninstall
   reboot
   ```
3. Tastenbelegungen in LG Input Hook löschen.

Ein Werksreset entfernt ebenfalls alles, auch den Root-Zugang.

## Wenn etwas nicht klappt

| Problem | Lösung |
|---|---|
| Installer: „Fernseher antwortet nicht“ | Fernseher an? Im Homebrew Channel SSH eingeschaltet? PC im selben Netz? |
| Installer: „Keine Verbindung oder falsches Passwort“ | Passwort ist ab Werk `alpine`, außer du hast es geändert oder einen SSH-Schlüssel eingerichtet. |
| Leiste zeigt Apps als geöffnet, die du geschlossen hast | tvclean Update 8 oder neuer einspielen (der Home-Wächter muss laufen). Im Installer erscheint dann „Home-Wächter läuft“. |
| Fehler beim Schließen von Apps | Protokoll auf dem Fernseher: `cat /tmp/leiste-close.log` |
| tvclean-Probleme | `sh /var/lib/webosbrew/tvclean/tvclean.sh status` und `… log`, siehe [tvclean](../tvclean/README.md) |

Bei Fehlern gern ein Issue mit Modell, webOS-Version und der Ausgabe aus dem Konsolenfenster öffnen.
