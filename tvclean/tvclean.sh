#!/bin/sh
# ---------------------------------------------------------------------------
# tvclean – gerooteten LG-webOS-TV entschlacken
#
#   sh /var/lib/webosbrew/tvclean/tvclean.sh <befehl>
#
# Befehle:
#   check       Voraussetzungen prüfen (ändert nichts)
#   apps        installierte Apps mit IDs anzeigen
#   install     einrichten und sofort anwenden
#   apply       Konfiguration nach Änderungen erneut anwenden
#   remove      Apps aus REMOVE_APPS deinstallieren (oder: remove <id> ...)
#   status      aktuellen Zustand anzeigen
#   watch       30 s lang live zeigen, welche App im Vordergrund ist
#   log         die letzten Log-Einträge anzeigen
#   uninstall   alles rückgängig machen
# ---------------------------------------------------------------------------

TVC_TAG=cli
TVC_SELF=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=lib/common.sh
. "$TVC_SELF/lib/common.sh"
# shellcheck source=lib/hosts.sh
. "$TVC_SELF/lib/hosts.sh"
# shellcheck source=lib/apps.sh
. "$TVC_SELF/lib/apps.sh"
# shellcheck source=lib/launcher.sh
. "$TVC_SELF/lib/launcher.sh"
# shellcheck source=lib/homewatch.sh
. "$TVC_SELF/lib/homewatch.sh"

TVC_BOOT_SCRIPTS="10-tvclean-hosts 20-tvclean-apps 30-tvclean-launcher 40-tvclean-homewatch"
HBC_DIR="$R/media/developer/apps/usr/palm/applications/org.webosbrew.hbchannel"

usage() {
    sed -n '2,18s/^# \{0,1\}//p' "$0"
}

devmode_installed() {
    for _dm_d in $TVC_APP_DIRS; do
        [ -d "$_dm_d/com.palmdts.devmode" ] && return 0
    done
    return 1
}

telnet_running() {
    ps 2>/dev/null | grep -v grep | grep -q telnetd
}

tv_info() {
    have_luna || return 0
    luna luna://com.webos.service.tv.systemproperty/getSystemInfo \
        '{"keys":["modelName","firmwareVersion","sdkVersion"]}' \
        | sed -n 's/.*"\(modelName\|firmwareVersion\|sdkVersion\)"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1=\2/p' \
        | tr '\n' ' '
}

# ---------------------------------------------------------------------------
cmd_check() {
    _ck_fatal=0
    echo "tvclean – Prüfung"
    _ck_info=$(tv_info)
    [ -n "$_ck_info" ] && note "TV: $_ck_info"

    if [ "$(id -u)" = 0 ]; then ok "läuft als root"
    else bad "läuft NICHT als root – ist der TV wirklich gerootet?"; _ck_fatal=1; fi

    if [ "$TVC_SELF" = "$TVC_DIR" ]; then ok "Paket liegt in $TVC_DIR"
    else bad "Paket liegt in $TVC_SELF – es muss nach $TVC_DIR kopiert werden"; _ck_fatal=1; fi

    if [ -d "$HBC_DIR" ]; then ok "Homebrew Channel installiert"
    else bad "Homebrew Channel nicht gefunden"; _ck_fatal=1; fi

    if devmode_installed; then
        bad "LG-Developer-Mode-App ist installiert – bitte VOR dem nächsten Neustart entfernen:"
        echo "         sh $TVC_DIR/tvclean.sh remove com.palmdts.devmode"
        echo "         (oder im Startmenü deinstallieren)"
    else
        ok "Developer-Mode-App nicht installiert"
    fi

    if [ -f "$TVC_PREFS/webosbrew_failsafe" ]; then
        bad "Failsafe-Markierung gesetzt – der letzte Start ist evtl. abgestürzt"
    fi

    if have_luna; then ok "luna-send vorhanden"
    else bad "luna-send fehlt – läuft das wirklich auf dem TV?"; _ck_fatal=1; fi

    if _ck_node=$(find_node); then ok "node vorhanden ($_ck_node)"
    else note "node nicht gefunden – es wird ein einfacher Ersatzweg genutzt"; fi

    if telnet_running; then
        note "Telnet läuft (ohne Passwort!) – nach Einrichten eines SSH-Schlüssels im Homebrew Channel abschalten"
    fi

    if [ "$_ck_fatal" = 0 ]; then
        echo "Alles bereit. Weiter mit:  sh $TVC_DIR/tvclean.sh install"
    else
        echo "Bitte zuerst die mit [!!] markierten Punkte beheben."
    fi
    return $_ck_fatal
}

# ---------------------------------------------------------------------------
apply_all() { # apply_all → wendet alles an, solange das System läuft
    if apply_hosts; then ok "Hosts-Sperre aktiv: $(hosts_active_count) Domains"
    else bad "Hosts-Sperre fehlgeschlagen (siehe: tvclean.sh log)"; fi

    apply_hide luna
    _aa_n=0
    for _aa_id in $HIDE_APPS; do
        if grep -q "^$_aa_id " "$TVC_HIDDEN_LIST" 2>/dev/null; then
            _aa_n=$((_aa_n + 1))
        elif ! is_protected "$_aa_id"; then
            note "nicht ausgeblendet: $_aa_id (nicht installiert?)"
        fi
    done
    [ -n "$HIDE_APPS" ] && ok "$_aa_n App(s) ausgeblendet – sichtbar nach dem Neustart"

    if [ -z "$LAUNCHER_ID" ]; then
        homewatch_stop
        note "kein LAUNCHER_ID gesetzt – Launcher-Funktion aus"
        return 0
    fi
    if ! app_dir_of "$LAUNCHER_ID" luna >/dev/null; then
        bad "Launcher $LAUNCHER_ID ist nicht installiert"
    fi

    if [ "$LAUNCHER_AS_INPUT" = 1 ]; then
        if launcher_prepare luna; then
            ok "Launcher $LAUNCHER_ID vorbereitet"
            if launcher_register 3 2; then
                ok "Launcher als Eingang registriert"
            else
                note "Registrierung klappt evtl. erst nach dem Neustart (passiert automatisch)"
            fi
        else
            bad "Launcher $LAUNCHER_ID konnte nicht vorbereitet werden (siehe: tvclean.sh log)"
        fi
    else
        launcher_unregister "$LAUNCHER_ID"
        ok "Launcher ist kein TV-Eingang mehr (erscheint nicht mehr unter „Quellen“)"
    fi

    homewatch_stop
    if [ "$HOME_REDIRECT" = 1 ]; then
        if homewatch_start && sleep 1 && homewatch_running; then
            ok "Home-Wächter aktiv: Home-Screen → $LAUNCHER_ID"
        else
            bad "Home-Wächter konnte nicht gestartet werden (siehe: tvclean.sh log)"
        fi
    else
        note "Home-Wächter aus (HOME_REDIRECT=0)"
    fi
}

cmd_install() {
    cmd_check || return 1
    echo
    echo "Einrichtung …"
    chmod 755 "$TVC_DIR/tvclean.sh" "$TVC_DIR"/init.d/* "$TVC_DIR"/bin/* 2>/dev/null
    mkdir -p "$TVC_STATE" "$TVC_INITD" "$TVC_PREFS"

    # Update-Sperre des Homebrew Channels (entspricht "Block system updates")
    touch "$TVC_PREFS/webosbrew_block_updates" && ok "Update-Sperre des Homebrew Channels aktiv"

    for _in_s in $TVC_BOOT_SCRIPTS; do
        ln -sf "$TVC_DIR/init.d/$_in_s" "$TVC_INITD/$_in_s"
    done
    ok "Startskripte in $TVC_INITD verlinkt"

    # Kurzbefehle für die Tastenbelegung (LG Input Hook)
    mkdir -p "$R/home/root"
    for _in_b in go-home go-inputs go-settings; do
        ln -sf "$TVC_DIR/bin/$_in_b" "$R/home/root/$_in_b"
    done
    ok "Kurzbefehle angelegt: sh /home/root/go-home, sh /home/root/go-inputs, sh /home/root/go-settings"

    load_conf
    apply_all
    log "install abgeschlossen"
    echo
    echo "Fertig. Jetzt:"
    if devmode_installed; then
        echo "  0. ZUERST die Developer-Mode-App entfernen:"
        echo "       sh $TVC_DIR/tvclean.sh remove com.palmdts.devmode"
    fi
    echo "  1. Neu starten:  Homebrew Channel → Einstellungen → System reboot"
    echo "     (oder hier: reboot)"
    if [ -n "$LAUNCHER_ID" ]; then
        if [ "$LAUNCHER_AS_INPUT" = 1 ]; then
            _in_screen="Letzter Eingang"
        else
            _in_screen="Home"
        fi
        echo "  2. Alle Einstellungen → Allgemein → System → Zusätzliche Einstellungen →"
        echo "     Home-Einstellungen → Einschaltbildschirm → \"$_in_screen\""
        echo "     (die Menünamen können je nach Firmware leicht abweichen)"
        echo "  3. TV aus- und wieder einschalten – er sollte direkt im Launcher landen."
    fi
}

cmd_apply() {
    load_conf
    _ap_missing=0
    for _ap_s in $TVC_BOOT_SCRIPTS; do
        [ -e "$TVC_INITD/$_ap_s" ] || _ap_missing=1
    done
    [ "$_ap_missing" = 1 ] && warn "Startskripte fehlen – erst 'install' ausführen"
    apply_all
    log "apply abgeschlossen"
    echo "Ausgeblendete Apps und Launcher-Änderungen wirken nach einem Neustart."
}

cmd_remove() {
    _rm_yes=0
    if [ "${1:-}" = "-y" ]; then _rm_yes=1; shift; fi
    load_conf
    if [ $# -eq 0 ]; then
        # shellcheck disable=SC2086
        set -- $REMOVE_APPS
    fi
    if [ $# -eq 0 ]; then
        echo "REMOVE_APPS ist leer. Trage IDs in $TVC_CONF ein oder: tvclean.sh remove <id> ..."
        return 0
    fi
    remove_apps "$_rm_yes" "$@"
}

cmd_status() {
    load_conf
    echo "tvclean – Status"
    _st_info=$(tv_info)
    [ -n "$_st_info" ] && note "TV: $_st_info"

    _st_links=0
    _st_total=0
    for _st_s in $TVC_BOOT_SCRIPTS; do
        _st_total=$((_st_total + 1))
        [ -e "$TVC_INITD/$_st_s" ] && _st_links=$((_st_links + 1))
    done
    if [ "$_st_links" = "$_st_total" ]; then ok "Startskripte installiert"
    else bad "Startskripte: $_st_links von $_st_total vorhanden – 'install' erneut ausführen"; fi

    if [ -f "$TVC_PREFS/webosbrew_block_updates" ]; then ok "Firmware-Updates gesperrt"
    else bad "Firmware-Update-Sperre AUS – ein Update entfernt den Root-Zugang"; fi

    if devmode_installed; then bad "Developer-Mode-App installiert – entfernen!"
    else ok "Developer-Mode-App nicht installiert"; fi

    if telnet_running; then note "Telnet läuft (unsicher) – im Homebrew Channel abschalten"
    else ok "Telnet aus"; fi

    if [ -s "$R/home/root/.ssh/authorized_keys" ]; then ok "SSH-Schlüssel hinterlegt"
    else note "kein SSH-Schlüssel hinterlegt (Standardpasswort 'alpine' aktiv)"; fi

    if grep -qF "$TVC_MARK_BEGIN" "$TVC_HOSTS" 2>/dev/null; then
        ok "Hosts-Sperre aktiv: $(hosts_active_count) Domains"
    else
        bad "Hosts-Sperre nicht aktiv"
    fi

    for _st_id in $HIDE_APPS; do
        _st_file=$(awk -v id="$_st_id" '$1==id {print $2; exit}' "$TVC_HIDDEN_LIST" 2>/dev/null)
        if [ -n "$_st_file" ] && is_mounted "$_st_file"; then ok "ausgeblendet: $_st_id"
        elif is_protected "$_st_id"; then note "geschützt, wird nie ausgeblendet: $_st_id"
        elif ! app_dir_of "$_st_id" >/dev/null; then note "nicht installiert: $_st_id"
        else bad "nicht ausgeblendet: $_st_id (Neustart nötig?)"; fi
    done

    if [ -n "$LAUNCHER_ID" ]; then
        if _st_dir=$(app_dir_of "$LAUNCHER_ID"); then
            ok "Launcher: $LAUNCHER_ID"
        else
            bad "Launcher $LAUNCHER_ID nicht gefunden"
        fi
        if [ "$HOME_REDIRECT" = 1 ]; then
            if homewatch_running; then ok "Home-Wächter läuft (prüft laufend, ob webOS-Home sichtbar ist)"
            else bad "Home-Wächter läuft nicht – 'apply' ausführen"; fi
            _st_last=$(grep 'Home-Screen erkannt' "$TVC_LOG" 2>/dev/null | tail -n 1)
            [ -n "$_st_last" ] && note "zuletzt: $_st_last"
        else
            note "Home-Wächter aus (HOME_REDIRECT=0)"
        fi
        if [ "$LAUNCHER_AS_INPUT" = 1 ]; then
            note "Launcher ist zusätzlich als TV-Eingang angemeldet (LAUNCHER_AS_INPUT=1)"
        fi
    else
        note "kein LAUNCHER_ID gesetzt"
    fi

    [ -f "$TVC_PREFS/webosbrew_failsafe" ] && bad "Failsafe-Markierung gesetzt – letzter Start abgestürzt?"
    return 0
}

cmd_watch() {
    _hw_pick_sleep
    echo "Zeigt 30 Sekunden lang, welche App im Vordergrund ist (Strg+C beendet)."
    echo "Drück währenddessen z. B. die Home-Taste."
    _cw_end=$(( $(date +%s) + 30 ))
    _cw_last="-"
    while [ "$(date +%s)" -lt "$_cw_end" ]; do
        _cw_app=$(foreground_app)
        if [ "$_cw_app" != "$_cw_last" ]; then
            echo "$(date +%H:%M:%S)  ${_cw_app:-<keine Antwort>}"
            _cw_last=$_cw_app
        fi
        $TVC_HW_SLEEP
    done
    echo "--- letzte Aktionen des Wächters:"
    grep -E 'Home-Screen|Start von|Home-Wächter' "$TVC_LOG" 2>/dev/null | tail -n 5
}

cmd_uninstall() {
    _un_yes=0
    [ "${1:-}" = "-y" ] && _un_yes=1
    if [ "$_un_yes" != 1 ]; then
        printf 'tvclean komplett zurücknehmen? [j/N] '
        read -r _un_answer
        case $_un_answer in
            j|J|ja|Ja|y|Y|yes) ;;
            *) echo "Abgebrochen."; return 1 ;;
        esac
    fi
    load_conf
    for _un_s in $TVC_BOOT_SCRIPTS; do rm -f "$TVC_INITD/$_un_s"; done
    ok "Startskripte entfernt"
    homewatch_stop && ok "Home-Wächter beendet"
    rm -f "$R/home/root/go-home" "$R/home/root/go-inputs" "$R/home/root/go-settings"
    remove_hosts && ok "Hosts-Sperre entfernt"
    remove_hide_all && ok "alle Apps wieder eingeblendet"
    if [ -n "$LAUNCHER_ID" ]; then
        launcher_unregister "$LAUNCHER_ID"
        ok "Launcher-Eingang entfernt"
    fi
    log "uninstall abgeschlossen"
    echo
    echo "Erledigt. Hinweise:"
    echo "  - Die Firmware-Update-Sperre bleibt absichtlich aktiv (schützt den Root-Zugang)."
    echo "    Abschalten im Homebrew Channel → \"Block system updates\"."
    echo "  - Deinstallierte Apps kannst du im LG Content Store neu installieren."
    echo "  - Bitte einmal neu starten. Danach kann der Ordner weg:"
    echo "      rm -rf $TVC_DIR"
}

# ---------------------------------------------------------------------------
_cmd=${1:-help}
[ $# -gt 0 ] && shift
case $_cmd in
    check)     cmd_check ;;
    apps)      load_conf; list_apps ;;
    install)   cmd_install ;;
    apply)     cmd_apply ;;
    remove)    cmd_remove "$@" ;;
    status)    cmd_status ;;
    watch)     load_conf; cmd_watch ;;
    log)       tail -n "${1:-40}" "$TVC_LOG" 2>/dev/null || echo "Noch kein Log vorhanden." ;;
    uninstall) cmd_uninstall "$@" ;;
    help|-h|--help) usage ;;
    *) echo "Unbekannter Befehl: $_cmd"; usage; exit 1 ;;
esac
