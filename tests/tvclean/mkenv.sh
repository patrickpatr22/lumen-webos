#!/bin/sh
# Baut ein simuliertes webOS-Dateisystem + Mocks für luna-send/mount/umount.
set -e
T="$(cd "$(dirname "$0")" && pwd)/work"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
mkdir -p "$T"
FR=$T/root
BIN=$T/bin
# Reste früherer Läufe beenden
for p in /proc/[0-9]*; do tr '\0' '\n' 2>/dev/null < $p/environ | grep -qx TVCLEAN_HOMEWATCH=1 && kill ${p##*/} 2>/dev/null; done
pkill -f "$T/root/var/lib/webosbrew" 2>/dev/null || true
true
sleep 0.3
rm -rf "$FR" "$BIN" "$T/mounts"
mkdir -p "$FR/var/lib/webosbrew/init.d" "$FR/var/luna/preferences" "$FR/etc" "$FR/home/root" "$BIN"
: > "$T/mounts"

cp -r "$REPO/tvclean" "$FR/var/lib/webosbrew/tvclean"; rm -rf "$FR/var/lib/webosbrew/tvclean/state"

printf '127.0.0.1 localhost\n::1 localhost\n' > "$FR/etc/hosts"

A=$FR/usr/palm/applications
S=$FR/media/cryptofs/apps/usr/palm/applications
D=$FR/media/developer/apps/usr/palm/applications
mkdir -p "$A/com.webos.app.discovery" "$A/com.webos.app.lgchannels" "$A/com.webos.app.home" \
         "$S/netflix" "$S/com.palmdts.devmode" "$D/org.webosbrew.hbchannel" "$D/com.free.launcher"

cat > "$A/com.webos.app.discovery/appinfo.json" <<'EOF'
{
    "id": "com.webos.app.discovery",
    "title": "LG Content Store",
    "main": "index.html",
    "icon": "icon.png",
    "nested": { "id": "nested.should.not.matter" }
}
EOF
# einzeilig, mit vorhandenem visible:true und Windows-Zeilenende
printf '{"id":"com.webos.app.lgchannels","title":"LG Channels","visible":true,"icon":"i.png"}\r\n' \
    > "$A/com.webos.app.lgchannels/appinfo.json"
echo '{"id":"com.webos.app.home","title":"Home"}' > "$A/com.webos.app.home/appinfo.json"
echo '{"id":"netflix","title":"Netflix","removable":true}' > "$S/netflix/appinfo.json"
echo '{"id":"com.palmdts.devmode","title":"Developer Mode"}' > "$S/com.palmdts.devmode/appinfo.json"
echo '{"id":"org.webosbrew.hbchannel","title":"Homebrew Channel"}' > "$D/org.webosbrew.hbchannel/appinfo.json"
cat > "$D/com.free.launcher/appinfo.json" <<'EOF'
{
  "id": "com.free.launcher",
  "title": "Free Launcher",
  "type": "web",
  "icon": "img/icon_80.png"
}
EOF
find "$FR" -name appinfo.json -exec sh -c 'cp "$1" "$1.ORIG"' _ {} \;
cp "$FR/etc/hosts" "$FR/etc/hosts.ORIG"

# ---- mount-Mock: bind mount per Symlink nachbilden (Stapel) ----
cat > "$BIN/mount" <<EOF
#!/bin/sh
[ "\$1" = "--bind" ] || { echo "mock mount: nur --bind" >&2; exit 1; }
src=\$2; tgt=\$3
[ -e "\$src" ] && [ -e "\$tgt" ] || { echo "mock mount: fehlt" >&2; exit 1; }
n=\$(grep -c " \$tgt " "$T/mounts" || true)
mv "\$tgt" "\$tgt.__m\$n"
ln -s "\$src" "\$tgt"
echo "/dev/fake \$tgt bind rw 0 0" >> "$T/mounts"
EOF
cat > "$BIN/umount" <<EOF
#!/bin/sh
tgt=\$1
n=\$(grep -c " \$tgt " "$T/mounts" || true)
[ "\$n" -gt 0 ] || { echo "mock umount: nicht eingehängt: \$tgt" >&2; exit 1; }
n=\$((n-1))
rm -f "\$tgt"; mv "\$tgt.__m\$n" "\$tgt"
awk -v t=" \$tgt " -v k="\$((n+1))" 'index(\$0,t){c++; if(c==k) next} {print}' "$T/mounts" > "$T/mounts.tmp"
mv "$T/mounts.tmp" "$T/mounts"
EOF

# ---- luna-send-Mock ----
cat > "$BIN/luna-send" <<EOF
#!/bin/sh
FR=$FR
echo "\$*" >> "$T/luna.calls"
while [ \$# -gt 0 ]; do case \$1 in -n) shift 2;; -f|-i) shift;; *) break;; esac; done
uri=\$1; payload=\$2
appid=\$(echo "\$payload" | sed -n 's/.*"\(id\|appId\)":"\([^"]*\)".*/\2/p')
finddir() { for d in \$FR/usr/palm/applications \$FR/media/cryptofs/apps/usr/palm/applications \$FR/media/developer/apps/usr/palm/applications; do [ -f "\$d/\$1/appinfo.json" ] && { echo "\$d/\$1"; return 0; }; done; return 1; }
case \$uri in
  */getForegroundAppInfo)
    cur=\$(cat "$T/fg.current" 2>/dev/null)
    printf '{"returnValue":true,"appId":"%s","appCategory":[],"processId":"","windowId":""}\n' "\$cur" ;;
  *.applicationManager/launch)
    echo "\$appid" >> "$T/launched"
    if [ -f "$T/launch.fail" ]; then
      echo '{"returnValue":false,"errorCode":-101,"errorText":"mock: launch failed"}'
    else
      [ -f "$T/home.sticky" ] || echo "\$appid" > "$T/fg.current"
      echo '{"returnValue":true}'
    fi ;;
  */executeOneShot)
    echo "\$uri" >> "$T/capture.calls"
    path=\$(echo "\$payload" | sed -n 's/.*"path":"\([^"]*\)".*/\1/p')
    case \$uri in
      *com.webos.service.capture/*) [ -f "$T/capture.fail1" ] && { echo '{"returnValue":false,"errorText":"Unknown method"}'; exit 0; } ;;
      *) [ -f "$T/capture.fail2" ] && { echo '{"returnValue":false}'; exit 0; } ;;
    esac
    printf 'JPEGDATA' > "\$path"; echo '{"returnValue":true}' ;;
  */getSystemInfo) printf '{\n    "modelName": "OLED55B39LA",\n    "firmwareVersion": "33.21.62",\n    "sdkVersion": "8.2.0",\n    "returnValue": true\n}\n' ;;
  */listApps)
    printf '{ "returnValue": true, "apps": ['
    first=1
    for f in \$(find \$FR/usr \$FR/media -name appinfo.json); do
      d=\$(dirname "\$f"); id=\$(basename "\$d"); fp=\${d#\$FR}
      vis=true; grep -q '"visible": false\|"visible":false' "\$f" && vis=false
      rem=false; case \$fp in /media/cryptofs/*|/media/developer/*) rem=true;; esac
      t=\$(sed -n 's/.*"title"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "\$f" | head -n1)
      [ \$first = 1 ] || printf ','; first=0
      printf '{"id":"%s","title":"%s","folderPath":"%s","visible":%s,"removable":%s,"systemApp":%s}' "\$id" "\$t" "\$fp" \$vis \$rem \$( [ \$rem = true ] && echo false || echo true )
    done
    printf ']}\n' ;;
  */getAppInfo)
    if d=\$(finddir "\$appid"); then
      rem=false; case \$d in *cryptofs*|*developer*) rem=true;; esac
      printf '{\n    "appInfo": {\n        "id": "%s",\n        "folderPath": "%s",\n        "removable": %s\n    },\n    "returnValue": true\n}\n' "\$appid" "\${d#\$FR}" \$rem
    else
      printf '{\n    "returnValue": false,\n    "errorText": "not found"\n}\n'
    fi ;;
  *.appInstallService/remove|*.appInstallService/dev/remove)
    d=\$(finddir "\$appid") && rm -rf "\$d" && printf '{\n    "returnValue": true\n}\n' || printf '{\n    "returnValue": false,\n    "errorText": "No such id"\n}\n' ;;
  *.eim/addDevice)
    d=\$(finddir "\$appid")
    if [ -n "\$d" ] && grep -q '"supportGIP": true' "\$d/appinfo.json" && grep -q largeIcon "\$d/appinfo.json"; then
      [ -f "$T/eim.ready" ] || { echo '{"returnValue":false,"errorText":"Service does not exist: com.webos.service.eim."}'; exit 0; }
      echo "\$appid" >> "$T/eim.registered"; echo '{"returnValue":true}'
    else echo '{"returnValue":false,"errorText":"supportGIP missing"}'; fi ;;
  *.eim/deleteDevice) sed -i "/^\$appid\$/d" "$T/eim.registered" 2>/dev/null; echo '{"returnValue":true}' ;;
  *) echo '{"returnValue":false,"errorText":"mock: unknown"}' ;;
esac
EOF
cp "$BIN/luna-send" "$BIN/luna-send-pub"
# Platzhalter für den Testordner in den Attrappen ersetzen
for f in "$BIN"/*; do sed -i "s#@T@#$T#g" "$f"; done
chmod +x "$BIN"/*
touch "$T/eim.ready"
rm -f "$T/eim.registered" "$T/luna.calls" "$T/launched" "$T/launch.fail" "$T/home.sticky"; echo netflix > "$T/fg.current"
echo "env ready"
