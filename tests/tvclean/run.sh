#!/bin/sh
# Testlauf: $1 = Shell (z. B. "busybox sh" oder dash), $2 = "nonode" für sed-Ersatzweg
SH=${1:-busybox sh}
T="$(cd "$(dirname "$0")" && pwd)/work"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
mkdir -p "$T"
FR=$T/root
BIN=$T/bin
sh "$(dirname "$T")/mkenv.sh" >/dev/null
export TVC_ROOT=$FR TVC_PROC_MOUNTS=$T/mounts TVC_MOUNT=$BIN/mount TVC_UMOUNT=$BIN/umount
export PATH="$BIN:$PATH"
[ "${2:-}" = nonode ] && export TVC_NODE=none
TV="$SH $FR/var/lib/webosbrew/tvclean/tvclean.sh"
CONF=$FR/var/lib/webosbrew/tvclean/tvclean.conf
PASS=0; FAIL=0
t() { if eval "$2"; then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); echo "FAIL: $1"; fi; }
validjson() { node -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))' "$1" 2>/dev/null; }

echo "===== $SH ${2:-} ====="
echo "--- check"
$TV check; t "check meldet Devmode" "$TV check | grep -q 'Developer-Mode-App ist installiert'"
echo "--- apps"
$TV apps | head -12
t "apps listet Launcher" "$TV apps | grep -q com.free.launcher"

# Konfiguration setzen (mit Windows-Zeilenenden!)
sed -i \
  -e 's/^LAUNCHER_ID=""/LAUNCHER_ID="com.free.launcher"/' \
  -e 's/^HIDE_APPS="/HIDE_APPS="com.webos.app.discovery com.webos.app.lgchannels\n  com.webos.app.home bogus.app com.webos.app.hdmi1/' \
  -e 's/^REMOVE_APPS="/REMOVE_APPS="netflix com.webos.app.discovery com.palmdts.devmode/' \
  -e 's/^EXTRA_HOSTS="/EXTRA_HOSTS="ads.example.com bad_domain/' "$CONF"
sed -i 's/$/\r/' "$CONF"

# HBC hat beim Booten schon eine eigene hosts eingehängt
printf '127.0.0.1 localhost\n127.0.0.1 snu.lge.com\n' > $T/hbc_hosts
$BIN/mount --bind $T/hbc_hosts $FR/etc/hosts

echo "--- install"
$TV install
t "Links angelegt" "[ -L $FR/var/lib/webosbrew/init.d/10-tvclean-hosts ] && [ -L $FR/var/lib/webosbrew/init.d/30-tvclean-launcher ]"
t "block_updates gesetzt" "[ -f $FR/var/luna/preferences/webosbrew_block_updates ]"
t "hosts enthält Marker" "grep -q '>>> tvclean >>>' $FR/etc/hosts"
t "hosts behält HBC-Eintrag" "grep -q '127.0.0.1 snu.lge.com' $FR/etc/hosts"
t "hosts sperrt lgsmartad" "grep -q '^0.0.0.0 info.lgsmartad.com' $FR/etc/hosts"
t "hosts sperrt ThinQ" "grep -q '^0.0.0.0 api.lgtviot.com' $FR/etc/hosts"
t "hosts EXTRA ok" "grep -q '^0.0.0.0 ads.example.com' $FR/etc/hosts"
t "hosts ungültige Domain verworfen" "! grep -q 'bad_domain' $FR/etc/hosts"
t "hosts keine \\r" "! grep -q \"\$(printf '\\r')\" $FR/etc/hosts"
t "discovery ausgeblendet+gültig" "grep -q '\"visible\": false' $FR/usr/palm/applications/com.webos.app.discovery/appinfo.json && validjson $FR/usr/palm/applications/com.webos.app.discovery/appinfo.json"
t "lgchannels ausgeblendet+gültig" "grep -Eq '\"visible\": ?false' $FR/usr/palm/applications/com.webos.app.lgchannels/appinfo.json && ! grep -q '\"visible\": *true' $FR/usr/palm/applications/com.webos.app.lgchannels/appinfo.json && validjson $FR/usr/palm/applications/com.webos.app.lgchannels/appinfo.json"
t "home geschützt" "! grep -q visible $FR/usr/palm/applications/com.webos.app.home/appinfo.json"
t "Launcher-Datei unverändert (Wächter-Modus)" "cmp -s $FR/media/developer/apps/usr/palm/applications/com.free.launcher/appinfo.json $FR/media/developer/apps/usr/palm/applications/com.free.launcher/appinfo.json.ORIG"
t "Launcher NICHT als Eingang (Standard)" "! grep -q com.free.launcher $T/eim.registered 2>/dev/null"
t "deleteDevice aufgerufen" "grep -q 'eim/deleteDevice' $T/luna.calls"
t "Home-Wächter läuft" "[ -f $FR/var/lib/webosbrew/tvclean/state/homewatch.pid ] && kill -0 \$(cat $FR/var/lib/webosbrew/tvclean/state/homewatch.pid)"
sleep 1.5
t "keine Aktion, solange eine App läuft" "[ ! -s $T/launched ]"
echo com.webos.app.home > $T/fg.current
sleep 2
t "Home → Launcher gestartet" "[ \$(grep -c com.free.launcher $T/launched 2>/dev/null) = 1 ]"
t "Launcher jetzt im Vordergrund" "[ \$(cat $T/fg.current) = com.free.launcher ]"
sleep 1.5
t "kein unnötiger zweiter Start" "[ \$(grep -c com.free.launcher $T/launched) = 1 ]"
echo youtube.leanback.v4 > $T/fg.current; sleep 1
echo com.webos.app.home > $T/fg.current; sleep 2
t "erneutes Home → wieder Launcher" "[ \$(grep -c com.free.launcher $T/launched) = 2 ]"
echo "--- Home holt sich den Fokus zurück (Wiederholung mit wachsender Pause)"
touch $T/home.sticky
echo com.webos.app.home > $T/fg.current
sleep 6
N=$(grep -c com.free.launcher $T/launched)
t "Wiederholungen ohne Dauerfeuer (2 < $N <= 5)" "[ $N -gt 2 ] && [ $N -le 5 ]"
t "Wiederholung protokolliert" "grep -q 'erneut geöffnet' $FR/var/lib/webosbrew/tvclean/state/tvclean.log"
rm -f $T/home.sticky
echo "--- Start schlägt fehl"
echo netflix > $T/fg.current; sleep 1; : > $T/launched
touch $T/launch.fail
echo com.webos.app.home > $T/fg.current
sleep 2
t "Fehler protokolliert" "grep -q 'fehlgeschlagen' $FR/var/lib/webosbrew/tvclean/state/tvclean.log"
rm -f $T/launch.fail
sleep 6
t "nach Fehler doch noch geöffnet" "[ \$(cat $T/fg.current) = com.free.launcher ]"
echo "--- Kurzbefehle"
t "Kurzbefehle verlinkt" "[ -L $FR/home/root/go-home ] && [ -L $FR/home/root/go-inputs ] && [ -L $FR/home/root/go-settings ]"
echo netflix > $T/fg.current; : > $T/luna.calls; : > $T/capture.calls
$SH $FR/home/root/go-inputs
t "go-inputs: sofort Launcher mit focus=inputs,key=source" "grep -q '\"params\":{\"focus\":\"inputs\",\"key\":\"source\"}' $T/luna.calls && [ \$(cat $T/fg.current) = com.free.launcher ]"
t "go-inputs: keine Umwege (nur ein luna-Aufruf, kein Bild)" "[ \$(wc -l < $T/luna.calls) = 1 ] && [ ! -s $T/capture.calls ]"
echo "--- Source-Taste mit Lumen-Leiste"
mkdir -p $FR/var/lib/webosbrew/lumen; touch $FR/var/lib/webosbrew/lumen/leiste.on
echo netflix > $T/fg.current; : > $T/luna.calls
$SH $FR/home/root/go-inputs
t "Leiste nicht installiert: Lumen wie gehabt" "grep -q '\"focus\":\"inputs\"' $T/luna.calls && ! grep -q 'launch {\"id\":\"de.lumenhome.leiste' $T/luna.calls"
BARDIR=$FR/media/developer/apps/usr/palm/applications/de.lumenhome.leiste
mkdir -p $BARDIR && echo '{"id":"de.lumenhome.leiste"}' > $BARDIR/appinfo.json
echo com.webos.app.hdmi2 > $T/fg.current; : > $T/luna.calls
$SH $FR/home/root/go-inputs
t "Leiste installiert, HDMI läuft: Leiste mit from=hdmi2" "grep -q 'launch {\"id\":\"de.lumenhome.leiste\",\"params\":{\"from\":\"com.webos.app.hdmi2\"}}' $T/luna.calls && ! grep -q '\"focus\":\"inputs\"' $T/luna.calls"
t "Leiste: params sind gültiges JSON" "grep 'applicationManager/launch' $T/luna.calls | tail -n1 | sed 's/.*launch //' | node -e 'JSON.parse(require(\"fs\").readFileSync(0,\"utf8\"))'"
echo com.free.launcher > $T/fg.current; : > $T/luna.calls
$SH $FR/home/root/go-inputs
t "Leiste: in Lumen selbst springt Source in die Eingänge" "grep -q '\"focus\":\"inputs\"' $T/luna.calls && ! grep -q 'launch {\"id\":\"de.lumenhome.leiste' $T/luna.calls"
rm -f $FR/var/lib/webosbrew/lumen/leiste.on
echo netflix > $T/fg.current; : > $T/luna.calls
$SH $FR/home/root/go-inputs
t "Leiste ausgeschaltet: wieder Lumen" "grep -q '\"focus\":\"inputs\"' $T/luna.calls && ! grep -q 'launch {\"id\":\"de.lumenhome.leiste' $T/luna.calls"
rm -rf $BARDIR
echo "--- Einstellungen-Taste (go-settings)"
echo netflix > $T/fg.current; : > $T/luna.calls
$SH $FR/home/root/go-settings
t "go-settings ohne Leiste: normale TV-Einstellungen" "grep -q 'launch {\"id\":\"com.palm.app.settings\"}' $T/luna.calls"
mkdir -p $BARDIR && echo '{"id":"de.lumenhome.leiste"}' > $BARDIR/appinfo.json
echo com.webos.app.hdmi4 > $T/fg.current; : > $T/luna.calls
$SH $FR/home/root/go-settings
t "go-settings mit Leiste: Schnelleinstellungen über dem Bild" "grep -q 'launch {\"id\":\"de.lumenhome.leiste\",\"params\":{\"mode\":\"settings\",\"from\":\"com.webos.app.hdmi4\"}}' $T/luna.calls"
t "go-settings: params sind gültiges JSON" "grep 'applicationManager/launch' $T/luna.calls | tail -n1 | sed 's/.*launch //' | node -e 'JSON.parse(require(\"fs\").readFileSync(0,\"utf8\"))'"
rm -rf $BARDIR
echo "--- Home-Taste mit Vorschaubild"
export TVC_TMP=$T
echo netflix > $T/fg.current; : > $T/luna.calls; : > $T/capture.calls; rm -rf $FR/var/lib/webosbrew/lumen
$SH $FR/home/root/go-home
t "go-home ohne Schalter: kein Bild, focus=apps" "grep -q '\"params\":{\"focus\":\"apps\"}' $T/luna.calls && [ ! -s $T/capture.calls ] && [ \$(cat $T/fg.current) = com.free.launcher ]"
mkdir -p $FR/var/lib/webosbrew/lumen; touch $FR/var/lib/webosbrew/lumen/autoshot.on
echo netflix > $T/fg.current; : > $T/luna.calls; : > $T/capture.calls
SHOT_MIN_BYTES=4 $SH $FR/home/root/go-home
t "go-home: Bild dauerhaft gespeichert und gespiegelt" "[ -s $FR/var/lib/webosbrew/lumen/shots/netflix.jpg ] && [ -s $FR/media/developer/apps/usr/palm/applications/com.free.launcher/cache/shots/netflix.jpg ] && [ ! -e $T/lumen-shot.jpg ]"
t "go-home: Lumen erfährt vom frischen Bild" "grep -q '\"focus\":\"apps\",\"shot\":\"netflix\",\"t\":\"[0-9]*\"' $T/luna.calls"
t "go-home: params sind gültiges JSON" "grep 'applicationManager/launch' $T/luna.calls | tail -n1 | sed 's/.*launch //' | node -e 'JSON.parse(require(\"fs\").readFileSync(0,\"utf8\"))'"
echo youtube.leanback.v4 > $T/fg.current; : > $T/luna.calls; : > $T/capture.calls
$SH $FR/home/root/go-home
t "go-home: fast leeres Bild (Kopierschutz) wird verworfen" "[ ! -e $FR/var/lib/webosbrew/lumen/shots/youtube.leanback.v4.jpg ] && grep -q '\"params\":{\"focus\":\"apps\"}' $T/luna.calls"
echo netflix > $T/fg.current; : > $T/luna.calls; : > $T/capture.calls; touch $T/capture.fail1
SHOT_MIN_BYTES=4 $SH $FR/home/root/go-home
t "go-home: Ersatzdienst tv.capture" "[ \$(wc -l < $T/capture.calls) = 2 ] && grep -q 'tv.capture' $T/capture.calls && grep -q '\"shot\":\"netflix\"' $T/luna.calls"
rm -f $T/capture.fail1
touch $FR/var/lib/webosbrew/lumen/shots/netflix.pin
echo netflix > $T/fg.current; : > $T/luna.calls; : > $T/capture.calls
SHOT_MIN_BYTES=4 $SH $FR/home/root/go-home
t "go-home: festgehaltenes Bild bleibt" "[ ! -s $T/capture.calls ] && ! grep -q shot $T/luna.calls"
echo com.free.launcher > $T/fg.current; : > $T/luna.calls; : > $T/capture.calls
SHOT_MIN_BYTES=4 $SH $FR/home/root/go-home
t "go-home aus Lumen heraus: kein Bild" "[ ! -s $T/capture.calls ] && grep -q 'focus.*apps' $T/luna.calls"
echo 'evil;id' > $T/fg.current; : > $T/luna.calls; : > $T/capture.calls
SHOT_MIN_BYTES=4 $SH $FR/home/root/go-home
t "go-home: ungültige App-ID wird ignoriert" "[ ! -s $T/capture.calls ] && ! ls $FR/var/lib/webosbrew/lumen/shots | grep -q evil"
rm -rf $FR/var/lib/webosbrew/lumen
echo "--- watch-Befehl (gekürzt)"
WATCH_OUT=$(timeout 3 $TV watch 2>&1)
echo "$WATCH_OUT" | head -4
t "watch zeigt Vordergrund-App" "echo \"$WATCH_OUT\" | grep -q com.free.launcher"
t "Originale unverändert" "cmp -s $FR/usr/palm/applications/com.webos.app.discovery/appinfo.json.__m0 $FR/usr/palm/applications/com.webos.app.discovery/appinfo.json.ORIG"

echo "--- apply (Idempotenz)"
M1=$(wc -l < $T/mounts)
$TV apply >/dev/null
M2=$(wc -l < $T/mounts)
t "apply hängt nichts doppelt ein ($M1/$M2)" "[ $M1 = $M2 ]"
WATCH=$(for p in /proc/[0-9]*; do tr '\0' '\n' 2>/dev/null < $p/environ | grep -qx TVCLEAN_HOMEWATCH=1 && cat $p/cmdline 2>/dev/null | tr '\0' ' ' && echo; done | grep -c "homewatch-run")
t "genau ein Wächter nach apply ($WATCH)" "[ $WATCH = 1 ]"
t "hosts kein doppelter Block" "[ \$(grep -c '>>> tvclean >>>' $FR/etc/hosts) = 1 ]"

echo "--- lgchannels wieder einblenden"
sed -i 's/ com.webos.app.lgchannels//' "$CONF"
sed -i 's/^EXTRA_HOSTS="ads.example.com/EXTRA_HOSTS="ads2.example.com/' "$CONF"
$TV apply >/dev/null
t "lgchannels wieder original" "cmp -s $FR/usr/palm/applications/com.webos.app.lgchannels/appinfo.json $FR/usr/palm/applications/com.webos.app.lgchannels/appinfo.json.ORIG"
t "discovery weiter ausgeblendet" "grep -q '\"visible\": false' $FR/usr/palm/applications/com.webos.app.discovery/appinfo.json"
t "hosts in place aktualisiert" "grep -q 'ads2.example.com' $FR/etc/hosts && ! grep -q ' ads.example.com' $FR/etc/hosts"

echo "--- remove -y"
$TV remove -y
t "netflix entfernt" "[ ! -d $FR/media/cryptofs/apps/usr/palm/applications/netflix ]"
t "devmode entfernt" "[ ! -d $FR/media/cryptofs/apps/usr/palm/applications/com.palmdts.devmode ]"
t "discovery (System) nicht entfernt" "[ -d $FR/usr/palm/applications/com.webos.app.discovery ]"

echo "--- status"
$TV status

echo "--- Neustart simulieren"
# alle Mounts lösen (umgekehrte Reihenfolge)
tac $T/mounts | while read -r _ tgt _; do $BIN/umount "$tgt"; done
t "nach 'Neustart' alles original" "cmp -s $FR/etc/hosts $FR/etc/hosts.ORIG && cmp -s $FR/usr/palm/applications/com.webos.app.discovery/appinfo.json $FR/usr/palm/applications/com.webos.app.discovery/appinfo.json.ORIG"
for p in /proc/[0-9]*; do tr '\0' '\n' 2>/dev/null < $p/environ | grep -qx TVCLEAN_HOMEWATCH=1 && kill ${p##*/} 2>/dev/null; done
sleep 0.5
rm -f $T/eim.ready $T/eim.registered $T/launched
$BIN/mount --bind $T/hbc_hosts $FR/etc/hosts            # HBC zuerst
( sleep 3; touch $T/eim.ready ) &                          # eim kommt erst später hoch
TVC_REG_TRIES=10 TVC_REG_WAIT=1 busybox run-parts $FR/var/lib/webosbrew/init.d
echo "run-parts exit: $?"
t "Boot: hosts aktiv" "grep -q '^0.0.0.0 info.lgsmartad.com' $FR/etc/hosts"
t "Boot: discovery ausgeblendet" "grep -q '\"visible\": false' $FR/usr/palm/applications/com.webos.app.discovery/appinfo.json"
t "Boot: Launcher-Datei unverändert" "! grep -q supportGIP $FR/media/developer/apps/usr/palm/applications/com.free.launcher/appinfo.json"
sleep 6
t "Boot: kein Eingang registriert (Standard)" "! grep -q com.free.launcher $T/eim.registered 2>/dev/null"
t "Boot: Wächter läuft" "kill -0 \$(cat $FR/var/lib/webosbrew/tvclean/state/homewatch.pid)"
echo com.webos.app.home > $T/fg.current
sleep 2
t "Boot: Home beim Einschalten → Launcher" "grep -q com.free.launcher $T/launched 2>/dev/null"
echo "--- Eingangs-Modus (LAUNCHER_AS_INPUT=1)"
echo 'LAUNCHER_AS_INPUT=1' >> "$CONF"
touch $T/eim.ready
$TV apply >/dev/null
t "Eingangs-Modus: registriert" "grep -q com.free.launcher $T/eim.registered"
t "Eingangs-Modus: supportGIP ergänzt + gültig" "grep -q '\"supportGIP\": true' $FR/media/developer/apps/usr/palm/applications/com.free.launcher/appinfo.json && validjson $FR/media/developer/apps/usr/palm/applications/com.free.launcher/appinfo.json"
sed -i '/^LAUNCHER_AS_INPUT=1/d' "$CONF"
$TV apply >/dev/null
t "zurück im Wächter-Modus: abgemeldet" "! grep -q com.free.launcher $T/eim.registered"

echo "--- uninstall -y"
$TV uninstall -y
t "uninstall: Links weg" "[ ! -e $FR/var/lib/webosbrew/init.d/10-tvclean-hosts ] && [ ! -e $FR/home/root/go-home ]"
t "uninstall: hosts = HBC" "cmp -s $FR/etc/hosts $T/hbc_hosts"
t "uninstall: Apps original" "cmp -s $FR/usr/palm/applications/com.webos.app.discovery/appinfo.json $FR/usr/palm/applications/com.webos.app.discovery/appinfo.json.ORIG && cmp -s $FR/media/developer/apps/usr/palm/applications/com.free.launcher/appinfo.json $FR/media/developer/apps/usr/palm/applications/com.free.launcher/appinfo.json.ORIG"
t "uninstall: Eingang abgemeldet" "! grep -q com.free.launcher $T/eim.registered 2>/dev/null"
t "uninstall: nur HBC-Mount übrig" "[ \$(wc -l < $T/mounts) = 1 ]"
sleep 0.5
LEFT=$(for p in /proc/[0-9]*; do tr '\0' '\n' 2>/dev/null < $p/environ | grep -qx TVCLEAN_HOMEWATCH=1 && echo x; done | wc -l)
t "uninstall: kein Wächter-Prozess übrig ($LEFT)" "[ $LEFT = 0 ]"

echo "--- log (Auszug)"
$TV log 8
echo "===== Ergebnis: $PASS ok, $FAIL Fehler ====="
[ $FAIL = 0 ]
