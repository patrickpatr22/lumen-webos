# shellcheck shell=sh
# tvclean – gemeinsame Funktionen. Wird von allen Skripten per "." geladen.
# Nur POSIX-sh/BusyBox-Funktionen, keine Bash-Erweiterungen.

# TVC_ROOT ist nur für Tests gedacht (simuliertes Dateisystem). Auf dem TV leer.
R="${TVC_ROOT:-}"

TVC_DIR="$R/var/lib/webosbrew/tvclean"
TVC_CONF="$TVC_DIR/tvclean.conf"
TVC_STATE="$TVC_DIR/state"
TVC_LOG="$TVC_STATE/tvclean.log"
TVC_INITD="$R/var/lib/webosbrew/init.d"
TVC_PREFS="$R/var/luna/preferences"
TVC_HOSTS="$R/etc/hosts"
TVC_PROC_MOUNTS="${TVC_PROC_MOUNTS:-/proc/mounts}"
TVC_MOUNT="${TVC_MOUNT:-mount}"
TVC_UMOUNT="${TVC_UMOUNT:-umount}"

TVC_MARK_BEGIN="# >>> tvclean >>>"
TVC_MARK_END="# <<< tvclean <<<"

# Hier liegen Apps auf webOS-Fernsehern (System, vorinstalliert, Store, Homebrew).
TVC_APP_DIRS="$R/usr/palm/applications
$R/mnt/otncabi/usr/palm/applications
$R/mnt/otycabi/usr/palm/applications
$R/media/system/apps/usr/palm/applications
$R/media/cryptofs/apps/usr/palm/applications
$R/media/developer/apps/usr/palm/applications"

# Diese Apps werden nie ausgeblendet oder entfernt – sonst kommt man ggf.
# nicht mehr an Einstellungen, Eingänge oder den Homebrew Channel.
TVC_PROTECTED="com.webos.app.home com.webos.app.settings com.palm.app.settings
com.webos.app.inputhub com.webos.app.inputcommon com.webos.app.factorywin
org.webosbrew.hbchannel"

# ---------------------------------------------------------------------------
# Ausgabe / Log
# ---------------------------------------------------------------------------
log() {
    mkdir -p "$TVC_STATE" 2>/dev/null
    printf '%s [%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S' 2>/dev/null)" \
        "${TVC_TAG:-tvclean}" "$*" >> "$TVC_LOG" 2>/dev/null
    # Log klein halten (max. ~500 Zeilen)
    if [ -f "$TVC_LOG" ] && [ "$(wc -l < "$TVC_LOG" 2>/dev/null)" -gt 1000 ] 2>/dev/null; then
        tail -n 500 "$TVC_LOG" > "$TVC_LOG.tmp" 2>/dev/null && mv "$TVC_LOG.tmp" "$TVC_LOG"
    fi
}
info() { printf '%s\n' "$*"; log "$*"; }
ok()   { printf '  [OK]   %s\n' "$*"; }
bad()  { printf '  [!!]   %s\n' "$*"; }
note() { printf '  [--]   %s\n' "$*"; }
warn() { printf 'WARNUNG: %s\n' "$*" >&2; log "WARNUNG: $*"; }

# ---------------------------------------------------------------------------
# Konfiguration
# ---------------------------------------------------------------------------
load_conf() {
    LAUNCHER_ID=""
    HIDE_APPS=""
    REMOVE_APPS=""
    BLOCK_LG=1
    BLOCK_THINQ=1
    EXTRA_HOSTS=""
    HOME_REDIRECT=1
    LAUNCHER_AS_INPUT=0
    [ -f "$TVC_CONF" ] || return 0
    mkdir -p "$TVC_STATE" 2>/dev/null
    # Windows-Zeilenenden entfernen, falls die Datei mit Notepad bearbeitet wurde
    _lc_tmp="$TVC_STATE/.conf.$$"
    if tr -d '\r' < "$TVC_CONF" > "$_lc_tmp"; then
        # shellcheck disable=SC1090
        . "$_lc_tmp"
    fi
    rm -f "$_lc_tmp"
    # Leerzeilen/Zeilenumbrüche in Listen glätten (ohne Glob-Expansion)
    set -f
    # shellcheck disable=SC2086,SC2116
    {
        HIDE_APPS=$(echo $HIDE_APPS)
        REMOVE_APPS=$(echo $REMOVE_APPS)
        EXTRA_HOSTS=$(echo $EXTRA_HOSTS)
        LAUNCHER_ID=$(echo $LAUNCHER_ID)
    }
    set +f
}

# ---------------------------------------------------------------------------
# Hilfsfunktionen
# ---------------------------------------------------------------------------

# Steht Wort $1 in der Liste $2?
in_list() {
    for _il in $2; do
        [ "$_il" = "$1" ] && return 0
    done
    return 1
}

is_valid_id() {
    case $1 in
        ''|*[!A-Za-z0-9._-]*) return 1 ;;
    esac
    return 0
}

is_protected() {
    in_list "$1" "$TVC_PROTECTED" && return 0
    case $1 in
        com.webos.app.hdmi*|com.webos.app.externalinput*) return 0 ;;
    esac
    [ -n "${LAUNCHER_ID:-}" ] && [ "$1" = "$LAUNCHER_ID" ] && return 0
    return 1
}

find_node() {
    [ "${TVC_NODE:-}" = none ] && return 1
    if [ -n "${TVC_NODE:-}" ]; then echo "$TVC_NODE"; return 0; fi
    for _fn in node /usr/bin/node /usr/local/bin/node; do
        if command -v "$_fn" >/dev/null 2>&1; then
            command -v "$_fn"
            return 0
        fi
    done
    return 1
}

have_luna() { command -v luna-send >/dev/null 2>&1; }

luna() { # luna <uri> <json>
    luna-send -n 1 -f "$1" "$2" 2>&1
}

luna_pub() { # wie luna, aber über den öffentlichen Bus (so dokumentiert für eim)
    if command -v luna-send-pub >/dev/null 2>&1; then
        luna-send-pub -n 1 "$1" "$2" 2>&1
    else
        luna-send -n 1 "$1" "$2" 2>&1
    fi
}

# Ersten String-Wert eines Schlüssels aus einer JSON-Datei holen
json_str() { # json_str <datei> <schlüssel>
    tr -d '\r' < "$1" 2>/dev/null \
        | sed -n "s/.*\"$2\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" \
        | head -n 1
}

# Ordner einer App finden. Mit $2=luna wird zusätzlich der
# applicationManager gefragt (nur sinnvoll, wenn das System läuft).
app_dir_of() { # app_dir_of <id> [luna]
    _ad_id=$1
    if [ -f "$TVC_STATE/apps.paths" ]; then
        _ad_p=$(awk -v id="$_ad_id" '$1==id {print $2; exit}' "$TVC_STATE/apps.paths")
        if [ -n "$_ad_p" ] && [ -f "$_ad_p/appinfo.json" ]; then
            echo "$_ad_p"
            return 0
        fi
    fi
    for _ad_d in $TVC_APP_DIRS; do
        if [ -f "$_ad_d/$_ad_id/appinfo.json" ]; then
            echo "$_ad_d/$_ad_id"
            return 0
        fi
    done
    if [ "${2:-}" = luna ] && have_luna; then
        _ad_p=$(luna luna://com.webos.applicationManager/getAppInfo "{\"id\":\"$_ad_id\"}" \
            | sed -n 's/.*"folderPath"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)
        if [ -n "$_ad_p" ] && [ -f "$R$_ad_p/appinfo.json" ]; then
            echo "$R$_ad_p"
            return 0
        fi
    fi
    return 1
}

# Pfad-Cache aktualisieren (wird von "install"/"apply" aufgerufen, solange das
# System läuft – beim Booten ist der applicationManager evtl. noch nicht da).
cache_app_path() { # cache_app_path <id> <ordner>
    mkdir -p "$TVC_STATE"
    touch "$TVC_STATE/apps.paths"
    awk -v id="$1" '$1!=id' "$TVC_STATE/apps.paths" > "$TVC_STATE/apps.paths.tmp"
    printf '%s %s\n' "$1" "$2" >> "$TVC_STATE/apps.paths.tmp"
    mv "$TVC_STATE/apps.paths.tmp" "$TVC_STATE/apps.paths"
}

is_mounted() { # Ist auf Pfad $1 etwas eingehängt?
    grep -q " $1 " "$TVC_PROC_MOUNTS" 2>/dev/null
}

bind_file() { # bind_file <quelle> <ziel>
    $TVC_MOUNT --bind "$1" "$2"
}

# Fügt Text $2 direkt hinter der ersten "{" in Datei $1 ein (Ausgabe auf stdout)
insert_after_brace() {
    if [ -z "$2" ]; then
        cat "$1"
        return
    fi
    awk -v ins="$2" '
        !done && (i = index($0, "{")) {
            $0 = substr($0, 1, i) ins substr($0, i + 1)
            done = 1
        }
        { print }' "$1"
}

# appinfo.json verändert kopieren.
#   hide → "visible": false   (App verschwindet aus dem Startmenü)
#   gip  → "supportGIP": true (+ largeIcon) – nötig, um eine App als Eingang
#          zu registrieren
patch_appinfo() { # patch_appinfo <quelle> <ziel> <hide|gip>
    _pa_src=$1
    _pa_dst=$2
    _pa_mode=$3
    mkdir -p "$(dirname "$_pa_dst")" || return 1
    if _pa_node=$(find_node); then
        if "$_pa_node" -e '
var fs = require("fs"), a = process.argv;
var j = JSON.parse(fs.readFileSync(a[1], "utf8").replace(/^﻿/, ""));
if (a[3] === "hide") { j.visible = false; }
if (a[3] === "gip") {
  j.supportGIP = true;
  if (!j.largeIcon && j.icon) { j.largeIcon = j.icon; }
}
fs.writeFileSync(a[2], JSON.stringify(j, null, 2) + "\n");
' "$_pa_src" "$_pa_dst" "$_pa_mode" 2>>"$TVC_LOG"; then
            return 0
        fi
        log "node konnte $_pa_src nicht verarbeiten – nutze sed-Ersatzweg"
    fi

    # Ersatzweg ohne node
    tr -d '\r' < "$_pa_src" > "$_pa_dst.tmp" || return 1
    _pa_ins=""
    case $_pa_mode in
        hide)
            if grep -q '"visible"' "$_pa_dst.tmp"; then
                sed 's/"visible"[[:space:]]*:[[:space:]]*true/"visible": false/' \
                    "$_pa_dst.tmp" > "$_pa_dst.tmp2" && mv "$_pa_dst.tmp2" "$_pa_dst.tmp"
            else
                _pa_ins='"visible": false,'
            fi
            ;;
        gip)
            if grep -q '"supportGIP"' "$_pa_dst.tmp"; then
                sed 's/"supportGIP"[[:space:]]*:[[:space:]]*false/"supportGIP": true/' \
                    "$_pa_dst.tmp" > "$_pa_dst.tmp2" && mv "$_pa_dst.tmp2" "$_pa_dst.tmp"
            else
                _pa_ins='"supportGIP": true,'
            fi
            if ! grep -q '"largeIcon"' "$_pa_dst.tmp"; then
                _pa_icon=$(json_str "$_pa_dst.tmp" icon)
                [ -n "$_pa_icon" ] && _pa_ins="$_pa_ins \"largeIcon\": \"$_pa_icon\","
            fi
            ;;
        *)
            rm -f "$_pa_dst.tmp"
            return 1
            ;;
    esac
    insert_after_brace "$_pa_dst.tmp" "$_pa_ins" > "$_pa_dst"
    rm -f "$_pa_dst.tmp"
    # Minimal-Plausibilitätsprüfung
    if ! grep -q '{' "$_pa_dst" || ! grep -q '"id"' "$_pa_dst"; then
        rm -f "$_pa_dst"
        return 1
    fi
    return 0
}
