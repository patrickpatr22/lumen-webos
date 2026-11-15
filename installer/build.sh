#!/bin/sh
# Baut Lumen-Installer.exe mit Mono. Läuft unter Windows mit dem eingebauten .NET Framework 4.5+.
# Voraussetzungen (Debian/Ubuntu): mono-mcs, libmono-system-windows-forms4.0-cil,
# libmono-system-io-compression4.0-cil, libmono-system-io-compression-filesystem4.0-cil,
# python3 mit Pillow (für Symbol und Manifest)
set -e
cd "$(dirname "$0")"
python3 mkres.py ../lumen/icon.png installer.res
mcs -target:winexe -platform:anycpu -optimize+ -codepage:utf8 \
    -win32res:installer.res -resource:install.sh,install.sh \
    -r:System.Windows.Forms.dll -r:System.Drawing.dll -r:System.IO.Compression.dll -r:System.IO.Compression.FileSystem.dll \
    -out:Lumen-Installer.exe LumenInstaller.cs
ls -la Lumen-Installer.exe
