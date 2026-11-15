# shellcheck shell=sh
# tvclean – Launcher als TV-Eingang registrieren
#
# webOS kann nach dem Einschalten zum "letzten Eingang" springen. Eine App,
# die als Eingang registriert ist (com.webos.service.eim/addDevice), zählt
# dafür wie ein HDMI-Eingang. So startet der TV direkt im Launcher – webOS
# läuft weiterhin im Hintergrund, aber man sieht den Home-Screen nicht mehr.
#
# Voraussetzung: "supportGIP": true (und ein largeIcon) in der appinfo.json
# der App. Fehlt das, legen wir beim Booten eine angepasste Kopie darüber.

TVC_LAUNCHER_MOUNT="$TVC_STATE/launcher.mount"   # Pfad der überlagerten appinfo.json

launcher_needs_gip() { # launcher_needs_gip <appinfo.json>
    grep -Eq '"supportGIP"[[:space:]]*:[[:space:]]*true' "$1" || return 0
    grep -q '"largeIcon"' "$1" || return 0
    return 1
}

launcher_prepare() { # launcher_prepare [luna]  → appinfo.json vorbereiten
    [ -n "$LAUNCHER_ID" ] || return 1
    if ! is_valid_id "$LAUNCHER_ID"; then
        warn "LAUNCHER_ID ist ungültig: $LAUNCHER_ID"
        return 1
    fi
    if ! _lp_dir=$(app_dir_of "$LAUNCHER_ID" "${1:-}"); then
        warn "Launcher $LAUNCHER_ID nicht gefunden – ist er installiert?"
        return 1
    fi
    [ "${1:-}" = luna ] && cache_app_path "$LAUNCHER_ID" "$_lp_dir"
    _lp_file="$_lp_dir/appinfo.json"

    # Alte Überlagerung eines anderen Launchers entfernen
    if [ -f "$TVC_LAUNCHER_MOUNT" ]; then
        _lp_old=$(cat "$TVC_LAUNCHER_MOUNT")
        if [ "$_lp_old" != "$_lp_file" ] && is_mounted "$_lp_old"; then
            $TVC_UMOUNT "$_lp_old" && log "alte Launcher-Überlagerung entfernt: $_lp_old"
        fi
    fi

    if is_mounted "$_lp_file"; then
        return 0
    fi
    if ! launcher_needs_gip "$_lp_file"; then
        rm -f "$TVC_LAUNCHER_MOUNT"
        return 0
    fi
    _lp_patched="$TVC_STATE/appinfo/launcher-$LAUNCHER_ID.json"
    if ! patch_appinfo "$_lp_file" "$_lp_patched" gip; then
        warn "konnte appinfo.json des Launchers nicht anpassen"
        return 1
    fi
    if bind_file "$_lp_patched" "$_lp_file"; then
        echo "$_lp_file" > "$TVC_LAUNCHER_MOUNT"
        log "supportGIP für $LAUNCHER_ID aktiviert"
        return 0
    fi
    warn "bind mount für den Launcher fehlgeschlagen"
    return 1
}

# Registrierung bei eim; wiederholt, bis der Dienst nach dem Booten bereit ist.
launcher_register() { # launcher_register [versuche] [pause_sekunden]
    _lr_tries=${1:-36}
    _lr_wait=${2:-5}
    _lr_payload="{\"appId\":\"$LAUNCHER_ID\",\"pigImage\":\"\",\"mvpdIcon\":\"\"}"
    _lr_i=0
    _lr_out=""
    while [ "$_lr_i" -lt "$_lr_tries" ]; do
        _lr_out=$(luna_pub luna://com.webos.service.eim/addDevice "$_lr_payload")
        case $_lr_out in
            *'"returnValue": true'*|*'"returnValue":true'*)
                log "Launcher $LAUNCHER_ID als Eingang registriert"
                return 0 ;;
            *[Aa]lready*)
                log "Launcher $LAUNCHER_ID war bereits als Eingang registriert"
                return 0 ;;
        esac
        _lr_i=$((_lr_i + 1))
        [ "$_lr_i" -lt "$_lr_tries" ] && sleep "$_lr_wait"
    done
    log "Registrierung als Eingang fehlgeschlagen: $(echo "$_lr_out" | tr '\n' ' ')"
    return 1
}

launcher_unregister() { # launcher_unregister <id>
    [ -n "$1" ] || return 0
    _lu_out=$(luna_pub luna://com.webos.service.eim/deleteDevice "{\"appId\":\"$1\"}")
    log "Eingang $1 entfernt: $(echo "$_lu_out" | tr '\n' ' ')"
    if [ -f "$TVC_LAUNCHER_MOUNT" ]; then
        _lu_file=$(cat "$TVC_LAUNCHER_MOUNT")
        is_mounted "$_lu_file" && $TVC_UMOUNT "$_lu_file"
        rm -f "$TVC_LAUNCHER_MOUNT"
    fi
}
