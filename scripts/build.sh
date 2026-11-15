#!/bin/sh
# Baut alle Pakete nach dist/:
#   lumen.ipk, lumen-leiste.ipk   (ares-package aus @webos-tools/cli)
#   tvclean-update<N>.zip         (tvclean ohne deine tvclean.conf, mit Vorlage)
#   Lumen-Installer.exe           (Mono, siehe installer/build.sh)
#   Lumen-Komplett.zip            (alles zusammen + LIESMICH.txt für einen neuen Fernseher)
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist"
TVCLEAN_N="${TVCLEAN_N:-8}"
rm -rf "$DIST"; mkdir -p "$DIST"
TMP=$(mktemp -d)

command -v ares-package >/dev/null || { echo "ares-package fehlt: npm install -g @webos-tools/cli"; exit 1; }
ares-package "$ROOT/lumen" -o "$TMP" >/dev/null
ares-package "$ROOT/leiste" -o "$TMP" >/dev/null
cp "$TMP"/de.lumenhome.launcher_*_all.ipk "$DIST/lumen.ipk"
cp "$TMP"/de.lumenhome.leiste_*_all.ipk "$DIST/lumen-leiste.ipk"

# tvclean: tvclean.conf wird zur Vorlage, damit ein Update deine Einstellungen nicht überschreibt
mkdir -p "$TMP/tv"
cp -r "$ROOT/tvclean" "$TMP/tv/"
rm -rf "$TMP/tv/tvclean/state"
mv "$TMP/tv/tvclean/tvclean.conf" "$TMP/tv/tvclean/tvclean.conf.beispiel"
(cd "$TMP/tv" && zip -qr "$DIST/tvclean-update$TVCLEAN_N.zip" tvclean)

sh "$ROOT/installer/build.sh" >/dev/null
cp "$ROOT/installer/Lumen-Installer.exe" "$DIST/"

mkdir -p "$TMP/k/Lumen"
cp "$DIST/lumen.ipk" "$DIST/lumen-leiste.ipk" "$DIST/tvclean-update$TVCLEAN_N.zip" "$DIST/Lumen-Installer.exe" "$TMP/k/Lumen/"
# LIESMICH.txt mit Windows-Zeilenenden, damit der Editor sie ordentlich zeigt
sed 's/$/\r/' "$ROOT/docs/LIESMICH.txt" > "$TMP/k/Lumen/LIESMICH.txt"
(cd "$TMP/k" && zip -qr "$DIST/Lumen-Komplett.zip" Lumen)

rm -rf "$TMP"
ls -la "$DIST"
