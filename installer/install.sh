#!/bin/sh
# Lumen Installer – Teil auf dem Fernseher.
# Der Installer am PC kopiert diesen Ordner nach /tmp/lumen-inst-<Zeit>/ und startet dieses Skript.
# Es installiert alle .ipk aus dem Ordner, spielt tvclean ein (falls dabei), zeigt die
# installierten Versionen, startet Lumen neu (falls gewünscht) und räumt danach auf.
D=$(cd "$(dirname "$0")" && pwd)
LOG=/tmp/lumen-install.log
APPS=/media/developer/apps/usr/palm/applications
TV=/var/lib/webosbrew/tvclean
FEHLER=0
ok()  { echo "  [OK]   $*"; }
bad() { echo "  [!!]   $*"; FEHLER=1; }

install_ipk() {
    f=$1; n=${f##*/}
    if [ ! -s "$f" ]; then bad "$n ist leer"; return 1; fi
    echo "Installiere $n ($(wc -c < "$f") Bytes) ..."
    : > "$LOG"
    luna-send -i -f luna://com.webos.appInstallService/dev/install \
        "{\"id\":\"com.ares.defaultName\",\"ipkUrl\":\"$f\",\"subscribe\":true}" > "$LOG" 2>&1 &
    pid=$!
    i=0
    while [ $i -lt 120 ]; do
        if grep -q '"state": *"installed"' "$LOG"; then
            kill $pid 2>/dev/null; ok "$n installiert"; return 0
        fi
        if grep -q 'install failed\|"returnValue": *false' "$LOG"; then
            kill $pid 2>/dev/null; bad "$n: Installation fehlgeschlagen"
            grep -E '"reason"|"errorText"' "$LOG" | sed 's/^/         /'
            return 1
        fi
        sleep 1; i=$((i + 1))
    done
    kill $pid 2>/dev/null; bad "$n: keine Rückmeldung nach 2 Minuten"; tail -n 15 "$LOG"
    return 1
}

echo
echo "=== Lumen Installer ==="
if [ "$(id -u)" != 0 ]; then bad "keine Root-Rechte – ist der Fernseher gerootet?"; exit 1; fi
info=$(luna-send -n 1 -f luna://com.webos.service.tv.systemproperty/getSystemInfo \
    '{"keys":["modelName","firmwareVersion","sdkVersion"]}' 2>/dev/null \
    | sed -n 's/.*"\(modelName\|firmwareVersion\|sdkVersion\)": *"\([^"]*\)".*/\2/p' | tr '\n' ' ')
[ -n "$info" ] && echo "  Fernseher: $info"
if [ -d "$APPS/org.webosbrew.hbchannel" ]; then ok "Homebrew Channel vorhanden"; else echo "  [??]   Homebrew Channel nicht gefunden"; fi
if [ -d "$APPS/com.palmdts.devmode" ]; then
    echo "  [??]   Die LG-Developer-Mode-App ist installiert. Bitte deinstallieren – sie kann den Root-Zugang kosten."
fi
echo
COUNT=0
for f in "$D"/*.ipk; do
    [ -f "$f" ] || continue
    install_ipk "$f"
    COUNT=$((COUNT + 1))
done

if [ -f "$D/tvclean/tvclean.sh" ]; then
    COUNT=$((COUNT + 1))
    echo
    echo "tvclean einspielen ..."
    mkdir -p "$TV"
    NEU=0; [ -f "$TV/tvclean.conf" ] || NEU=1
    for x in "$D/tvclean/"*; do
        b=${x##*/}
        # deine Einstellungen bleiben erhalten
        if [ "$b" = tvclean.conf ] && [ -f "$TV/tvclean.conf" ]; then continue; fi
        cp -r "$x" "$TV/" || bad "tvclean: $b nicht kopiert"
    done
    ok "tvclean kopiert"
    # neuer Fernseher: Einstellungen aus der Vorlage, Lumen als Launcher
    if [ $NEU = 1 ] && [ -f "$TV/tvclean.conf.beispiel" ]; then
        if [ -d "$APPS/de.lumenhome.launcher" ]; then
            sed 's/^LAUNCHER_ID=.*/LAUNCHER_ID="de.lumenhome.launcher"/' "$TV/tvclean.conf.beispiel" > "$TV/tvclean.conf"
            ok "tvclean.conf angelegt (Lumen startet statt webOS-Home)"
        else
            cp "$TV/tvclean.conf.beispiel" "$TV/tvclean.conf"
            ok "tvclean.conf aus der Vorlage angelegt"
        fi
    fi
    sh "$TV/tvclean.sh" install
fi

[ $COUNT -gt 0 ] || bad "keine Pakete gefunden"

echo
echo "=== Kontrolle ==="
if [ -f "$D/ids.txt" ]; then
    while read -r a; do
        [ -n "$a" ] || continue
        v=$(grep -o '"version": *"[^"]*"' "$APPS/$a/appinfo.json" 2>/dev/null | head -n 1 | sed 's/.*"\([^"]*\)"$/\1/')
        if [ -n "$v" ]; then ok "$a: Version $v"; else bad "$a: nicht installiert"; fi
    done < "$D/ids.txt"
fi
if [ -f "$D/tvclean/tvclean.sh" ]; then
    if [ -e /home/root/go-home ]; then ok "tvclean aktiv"; else bad "tvclean: /home/root/go-home fehlt"; fi
    sleep 2
    if [ -s /tmp/tvclean-foreground.log ]; then ok "Home-Wächter läuft (merkt sich geöffnete Apps)"
    else echo "  [??]   Home-Wächter schreibt keinen Verlauf – nach einem Neustart des Fernsehers nochmal prüfen"; fi
fi

REBOOT=0
[ -f "$D/reboot" ] && [ $FEHLER -eq 0 ] && REBOOT=1
if [ $REBOOT = 0 ] && [ -f "$D/restart" ] && [ -d "$APPS/de.lumenhome.launcher" ]; then
    echo
    echo "Lumen neu starten ..."
    luna-send -n 1 luna://com.webos.applicationManager/closeByAppId '{"id":"de.lumenhome.leiste"}' >/dev/null 2>&1
    luna-send -n 1 luna://com.webos.applicationManager/closeByAppId '{"id":"de.lumenhome.launcher"}' >/dev/null 2>&1
    sleep 1
    luna-send -n 1 luna://com.webos.applicationManager/launch '{"id":"de.lumenhome.launcher"}' >/dev/null 2>&1
fi

# aufräumen, auch Reste früherer Läufe
cd /tmp
for old in /tmp/lumen-inst-*; do
    [ -d "$old" ] && [ "$old" != "$D" ] && rm -rf "$old"
done
rm -rf "$D"

echo
if [ $FEHLER -eq 0 ]; then
    echo "Fertig."
    if [ $REBOOT = 1 ]; then
        echo "Der Fernseher startet in ein paar Sekunden neu."
        if command -v setsid >/dev/null 2>&1; then setsid sh -c 'sleep 4; reboot' >/dev/null 2>&1 < /dev/null &
        else nohup sh -c 'sleep 4; reboot' >/dev/null 2>&1 < /dev/null & fi
    fi
else
    echo "Es gab Fehler (siehe [!!] oben). Bitte diese Ausgabe an Claude schicken."
fi
exit $FEHLER
