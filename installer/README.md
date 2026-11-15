# Lumen Installer

Kleines Windows-Programm: Pakete auswählen, IP des Fernsehers eingeben, installieren.

- Versteht `.ipk` (Lumen, Lumen Leiste, andere Homebrew-Apps), tvclean-Updates als `.zip`
  und `.zip`-Dateien mit mehreren `.ipk`. Dateien lassen sich auch ins Fenster ziehen.
- Liest Name und Version aus den Paketen. Ein Paket, das schon in der Liste steht, wird ersetzt.
- „Verbindung prüfen“ testet, ob der Fernseher per SSH (Port 22) erreichbar ist.
- „Auf den Fernseher installieren“ öffnet ein Konsolenfenster. Darin kopiert `scp` die Pakete
  nach `/tmp/lumen-inst-<Zeit>/` und `ssh` startet dort `install.sh`. Dafür fragt der Fernseher
  zweimal nach dem Root-Passwort. Der Installer speichert kein Passwort.
- `install.sh` installiert alle `.ipk` (`appInstallService/dev/install`), spielt tvclean ein
  (deine `tvclean.conf` bleibt), zeigt die installierten Versionen, startet Lumen neu (abschaltbar)
  und räumt `/tmp` auf.
- IP-Adresse und zuletzt benutzter Ordner: `%APPDATA%\LumenInstaller\einstellungen.txt`.

Voraussetzungen: Windows 10/11 mit .NET Framework 4.5 oder neuer (in Windows 11 eingebaut) und
dem OpenSSH-Client (in Windows 11 standardmäßig installiert). Bei OpenSSH ab Version 9 nutzt
`scp` die Option `-O`, weil der Fernseher kein SFTP kann.

Bauen unter Linux mit Mono: `./build.sh` (braucht `mono-mcs`, die WinForms- und
Compression-Bibliotheken und Python mit Pillow für Symbol und Manifest).
