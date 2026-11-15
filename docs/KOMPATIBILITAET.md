# Kompatibilität

**Stand:** November 2026, Lumen 1.6.2 · Lumen Leiste 1.2.3 · tvclean Update 8 · Installer 1.0

| Zeichen | Bedeutung |
|---|---|
| ✅ | auf echter Hardware getestet |
| 🟡 | erwartet lauffähig (aus Web-Engine und Systemdiensten abgeleitet), aber ungetestet |
| 🔴 | nicht unterstützt |

**Getestet** ist bisher genau ein Gerät: **LG OLED55B39LA** (Serie B3, Modelljahr 2023, α7 Gen6)
mit **webOS 25** nach LGs Plattform-Update (sdkVersion 10.3.2, Firmware 33.31.75), Magic Remote,
Homebrew Channel mit Root.

Rückmeldungen zu anderen Geräten bitte als Issue: Modell, webOS-Version
(Einstellungen → Allgemein → TV-Informationen), was funktioniert und was nicht.

---

## 1. Software

### 1.1 webOS-Versionen

Ein Fernseher behält die Web-Engine seiner webOS-Version; einen separat aktualisierbaren Browser gibt es nicht.
Lumen und die Leiste sind Web-Apps und brauchen mindestens **Chromium 87**. Die Oberfläche nutzt
die CSS-Eigenschaft `inset` (ab Chromium 87) und `gap` in Flexbox-Layouts (ab Chromium 84). Ältere Engines
zeigen das Layout deshalb kaputt an. Seit Lumen 1.6.2 kommen die Animationen ohne
`translate`/`rotate`/`scale` als Einzel-Eigenschaften aus (die gibt es erst ab Chromium 104).

| webOS (Menü) | intern (`sdkVersion`) | Jahr | Web-Engine | Lumen + Leiste | Root (Stand der Quellen) |
|---|---|---|---|---|---|
| webOS 25 | 10.x | 2025 | Chromium 120 | ✅ getestet (OLED55B39LA) | faultmanager nur mit Werks-Firmware 10.0, Updates ab 10.1 gepatcht |
| webOS 24 | 9.x | 2024 | Chromium 108 | 🟡 | DejaVuln: alle Release-Versionen gepatcht; faultmanager: aktuelle Firmware fast überall gepatcht |
| webOS 23 | 8.x | 2023 | Chromium 94 | 🟡 | je nach Firmware (DejaVuln/faultmanager), RootMyTV nie |
| webOS 22 | 7.x | 2022 | Chromium 87 | 🟡 (Mindestversion) | je nach Firmware, aktuelle meist gepatcht |
| webOS 6 | 6.x | 2021 | Chromium 79 | 🔴 Layout fehlerhaft | – |
| webOS 5 | 5.x | 2020 | Chromium 68 | 🔴 | – |
| webOS 4.x | 4.x | 2018–2019 | Chromium 53 | 🔴 | – |
| webOS 3.x und älter | ≤ 3.x | ≤ 2017 | Chromium 38 / WebKit | 🔴 | – |

**Root:** Ob ein Fernseher rootbar ist, entscheidet die genaue Firmware-Version, nicht nur die webOS-Version.
Vor dem Rooten auf [CanI.RootMy.TV](https://cani.rootmy.tv/) nachsehen und **keine Firmware-Updates**
installieren. Lumen selbst rootet nichts.

**Plattform-Updates:** Ab dem Modelljahr 2022 aktualisiert LG viele Fernseher auf neuere webOS-Versionen
(„webOS Re:New“). Maßgeblich ist die webOS-Version, die gerade auf dem Fernseher läuft. Ein 2023er
Modell kann also schon webOS 25 haben, wie das Testgerät.

### 1.2 Benötigte Software

| Komponente | Wofür | Pflicht? | Hinweis |
|---|---|---|---|
| Homebrew Channel mit Root („Root status: ok“) | Lumen, Leiste und tvclean führen Befehle als root aus (`org.webosbrew.hbchannel.service/exec`) | ja | |
| SSH-Server im Homebrew Channel | Installer und manuelle Installation | für die Installation | Root-Passwort ab Werk: `alpine` |
| [LG Input Hook](https://repo.webosbrew.org/apps/org.webosbrew.inputhook/) | Home-, Source- und Einstellungen-Taste direkt auf Lumen legen | empfohlen | aus dem Homebrew Channel; welches Log die Tasten-IDs zeigt, hängt von webOS-Version und Fernbedienung ab |
| Node.js auf dem Fernseher | nur das Web-Backend (`lumen/backend/server.js`) | nein | Lumen sucht `/usr/bin/node`, `/usr/local/bin/node`, `/usr/bin/nodejs`; der Server nutzt nur ES5 und Node-Kernmodule |
| Windows 10/11 mit .NET Framework 4.5+ und OpenSSH-Client | Lumen Installer | nein | beides ist in Windows 11 vorinstalliert; ohne Windows siehe [Installation](INSTALLATION.md#manuell) |
| WLED im selben Netz | Licht passend zum Bild | nein | über die JSON-API von WLED (`/json/state`) |

### 1.3 Funktionen und Systemdienste

Diese webOS-Dienste nutzen die Apps. Geprüft sind sie nur auf dem Testgerät (webOS 25). Fehlt ein Dienst,
blendet die Leiste die Funktion aus oder fällt auf die TV-Einstellungen zurück.

| Funktion | Dienst / App | Prüfstand |
|---|---|---|
| Overlay über laufender App (Leiste, Schnelleinstellungen) | Fenstertyp `overlay` in `appinfo.json` (nicht offiziell dokumentiert) | ✅ webOS 25 |
| Apps starten, offene Apps, Apps schließen | `com.webos.applicationManager` (`launch`, `running`, `closeByAppId`) | ✅ webOS 25 |
| „Wirklich geöffnet“ statt nur vorgeladen | Vordergrund-Verlauf des tvclean-Home-Wächters (`getForegroundAppInfo`) | ✅ webOS 25 |
| Verbunden-Punkt an den Eingängen | `com.webos.service.eim/getAllInputStatus` (`hdmiPlugIn` vor `connected`) | ✅ webOS 25 |
| Helligkeit, Bild-/Klangmodus, Augenschonend | `com.webos.settingsservice` (`picture/backlight`, `pictureMode`, `eyeComfortMode`, `sound/soundMode`) – angeboten werden nur die Modi, die der Fernseher meldet | ✅ webOS 25 |
| Audioausgabe | `com.webos.service.apiadapter/audio/changeSoundOutput`, sonst `sound/soundOutput` | ✅ webOS 25 |
| Bildschirm aus | `com.webos.service.tvpower/power/turnOffScreen` | ✅ webOS 25 |
| Schlummerfunktion | App `com.webos.app.tvhotkey` (`activateType: sleep`) | ✅ webOS 25 |
| Multi View, KI-Taste | Apps `com.webos.app.multiview`, `com.webos.app.aiconcierge` – erscheinen nur, wenn vorhanden | ✅ webOS 25 |
| Lumen statt webOS-Home, Werbung/Tracking/Updates sperren | tvclean: Startskripte des Homebrew Channels, bind mounts, `/etc/hosts` | ✅ webOS 25 |

---

## 2. Hardware

### 2.1 LG-Fernseher nach Modelljahr

Die webOS-Version ab Werk ergibt sich aus dem Modelljahr (siehe 1.1). Für Lumen zählt die webOS-Version,
die **jetzt** auf dem Fernseher läuft.

| Modelljahr | webOS ab Werk | Serien (Beispiele) | Prozessor | Status |
|---|---|---|---|---|
| 2025 | webOS 25 | OLED B5, C5, G5 · QNED · UA | – | 🟡 Root nur mit Werks-Firmware |
| 2024 | webOS 24 | OLED B4, C4, G4, M4 · QNED…T · NANO…T · UT… | C4: α9 Gen7 · G4: α11 | 🟡 |
| 2023 | webOS 23 | OLED A3, **B3**, C3, G3, Z3 · QNED…R · UR… | A3/B3: α7 Gen6 · C3/G3/Z3: α9 Gen6 · QNED75, NANO77, UR: α5 Gen6 | ✅ OLED55B39LA (mit webOS 25) · übrige 🟡 |
| 2022 | webOS 22 | OLED A2, B2, C2, G2, Z2 · QNED…Q · UQ… | C2/G2/Z2: α9 Gen5 · A2/B2: α7 Gen5 · UQ: α5 Gen5 | 🟡 |
| 2021 | webOS 6 | OLED A1, B1, C1, G1 · QNED…P · NANO…P · UP… | – | 🔴 (nur nach einem Plattform-Update auf webOS 22+) |
| 2020 und älter | webOS 5 / 4.x / 3.x | OLED CX, BX, GX · C9, B9 · C8, B8 · UN, UM, UK … | – | 🔴 |

**Bildschirmtyp:** Auf OLED-Fernsehern heißt der Regler in den Schnelleinstellungen „OLED-Helligkeit“
(Pixelhelligkeit), auf LCD-Fernsehern (QNED, NanoCell, UHD) „Helligkeit“ (Hintergrundbeleuchtung).
Lumen erkennt das am Modellnamen.

**Leistung:** Lumen verzichtet bewusst auf Weichzeichner (`backdrop-filter`) und teure Effekte. Auf dem
Testgerät (α7 Gen6) läuft es flüssig. Auf schwächeren Chips (α5) ist es ungetestet. Bei Rucklern unter
Anpassen → Animationen das Tempo senken oder einzelne Effekte abschalten.

### 2.2 Fernbedienungen

| Fernbedienung | Status | Hinweis |
|---|---|---|
| Magic Remote (Zeiger) | ✅ | Zeigen wählt aus, Klicken löst aus; Helligkeit per Regler ziehen |
| Magic Remote / Standard-Fernbedienung (Pfeiltasten) | ✅ / 🟡 | alles ist auch mit Pfeilen, OK und Zurück bedienbar |
| Tastenbelegung mit LG Input Hook | ✅ | Tasten-IDs je nach Fernbedienung verschieden. Auf dem Testgerät: Source 241, Einstellungen 139 – bei anderen Modellen im Protokoll der App nachsehen |

### 2.3 Andere webOS-Geräte

| Gerät | Status | Hinweis |
|---|---|---|
| LG Smart Monitore, StanbyME mit webOS 22+ | 🟡 ungetestet | Eingänge, Bild- und Toneinstellungen können anders heißen oder fehlen |
| Fernseher anderer Marken mit webOS Hub | 🟡 ungetestet | Root-Methoden und Systemdienste unbekannt |
| LG Signage (webOS Signage) | 🔴 | andere Plattform |

### 2.4 PC für den Installer

| System | Status |
|---|---|
| Windows 11 (x64) | ✅ |
| Windows 10 mit OpenSSH-Client | 🟡 (OpenSSH unter „Optionale Features“ nachinstallieren) |
| macOS, Linux | 🔴 Installer · ✅ [manuelle Installation](INSTALLATION.md#manuell) per `scp`/`ssh` |

---

## Quellen

- LG webOS TV Developer: [Web API and Web Engine](https://webostv.developer.lge.com/develop/specifications/web-api-and-web-engine) (Chromium-Version je webOS-Version)
- webOS Homebrew Project: [Web Engine](https://www.webosbrew.org/develop/guides/web-app/web-engine), [Rooting](https://www.webosbrew.org/rooting)
- [faultmanager-autoroot](https://github.com/throwaway96/faultmanager-autoroot) und [dejavuln-autoroot](https://github.com/throwaway96/dejavuln-autoroot) (Patch-Stand)
- [RootMyTV](https://github.com/RootMyTV/RootMyTV.github.io) · [CanI.RootMy.TV](https://cani.rootmy.tv/)
- [LG Input Hook](https://repo.webosbrew.org/apps/org.webosbrew.inputhook/) im Homebrew-Repository
- Prozessoren je Serie: [Expert Reviews (CES 2023)](https://www.expertreviews.co.uk/lg/1417661/ces-2023-lg-s-tv-range-updated-with-6th-gen-chips-and-webos-upgrades), [LG α9 Gen5](https://www.lg.com/lk/tvs/2022/alpha9), [Sound & Vision (2024)](https://www.soundandvision.com/content/lg-steps-0), [tab-tv](https://en.tab-tv.com/?p=14681)
- Plattform-Updates: [TechRadar](https://www.techradar.com/televisions/lg-reveals-drawn-out-plans-for-upgrading-your-oled-or-lcd-tvs-webos)
