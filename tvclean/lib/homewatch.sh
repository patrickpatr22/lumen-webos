# shellcheck shell=sh
# tvclean – Home-Wächter
#
# Sobald webOS seinen eigenen Home-Screen in den Vordergrund holt (Home-Taste,
# Einschalten, „App beenden“), öffnet der Wächter sofort den eigenen Launcher.
#
# Der Wächter fragt die Vordergrund-App in kurzen Abständen aktiv ab
# (getForegroundAppInfo ohne Abo). Ein Abo wäre zwar eleganter, aber luna-send
# puffert seine Ausgabe, wenn sie nicht auf ein Terminal geht – Ereignisse
# kämen dann verspätet oder gar nicht an.
#
# Alle Prozesse des Wächters tragen die Umgebungsvariable TVCLEAN_HOMEWATCH=1,
# damit sie sich zuverlässig finden und beenden lassen.

TVC_HW_PID="$TVC_STATE/homewatch.pid"
TVC_HOME_APP="${TVC_HOME_APP:-com.webos.app.home}"
# Verlauf der Vordergrund-Apps ("<Sekunden> <App-ID>"), liest die Lumen Leiste: so weiß sie,
# welche Apps du wirklich geöffnet hast (webOS meldet auch nur vorgeladene Apps als laufend).
# Liegt in /tmp und beginnt nach jedem Neustart leer.
TVC_FG_LOG="${TVC_FG_LOG:-/tmp/tvclean-foreground.log}"

_hw_is_ours() { # _hw_is_ours <pid>
    tr '\0' '\n' 2>/dev/null < "/proc/$1/environ" | grep -qx 'TVCLEAN_HOMEWATCH=1'
}

homewatch_pids() {
    for _hp in /proc/[0-9]*; do
        _hp=${_hp##*/}
        [ "$_hp" = "$$" ] && continue
        _hw_is_ours "$_hp" && echo "$_hp"
    done
}

homewatch_running() {
    [ -f "$TVC_HW_PID" ] || return 1
    _hr=$(cat "$TVC_HW_PID" 2>/dev/null)
    [ -n "$_hr" ] && kill -0 "$_hr" 2>/dev/null && _hw_is_ours "$_hr"
}

# Kurze Pause zwischen zwei Abfragen (0,5 s, falls möglich – sonst 1 s)
_hw_pick_sleep() {
    if command -v usleep >/dev/null 2>&1; then
        TVC_HW_SLEEP="usleep 500000"
    elif sleep 0.5 2>/dev/null; then
        TVC_HW_SLEEP="sleep 0.5"
    else
        TVC_HW_SLEEP="sleep 1"
    fi
    # Schutz gegen hängende luna-send-Aufrufe, falls 'timeout' vorhanden ist
    TVC_HW_TMO=""
    if command -v timeout >/dev/null 2>&1 && timeout 5 true 2>/dev/null; then
        TVC_HW_TMO="timeout 5"
    fi
}

# Aktuelle Vordergrund-App (Rohantwort von luna-send)
foreground_raw() {
    # shellcheck disable=SC2086
    $TVC_HW_TMO luna-send -n 1 luna://com.webos.applicationManager/getForegroundAppInfo '{}' 2>/dev/null
}

foreground_app() {
    foreground_raw | sed -n 's/.*"appId"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1
}

homewatch_loop() {
    _hw_pick_sleep
    _hw_tries=0     # Startversuche, seit der Home-Screen sichtbar ist
    _hw_wait=0      # Abfragen, die bis zum nächsten Versuch noch abgewartet werden
    _hw_backoff=3   # wächst: 3, 6, 12, 24, 40 Abfragen
    _hw_last=""     # zuletzt protokollierte Vordergrund-App
    _hw_lines=0
    while :; do
        _hw_out=$(foreground_raw)
        case $_hw_out in
            *'"appId"'*)
                _hw_id=${_hw_out#*'"appId"'}; _hw_id=${_hw_id#*\"}; _hw_id=${_hw_id%%\"*}
                if [ -n "$_hw_id" ] && [ "$_hw_id" != "$_hw_last" ]; then
                    _hw_last=$_hw_id
                    echo "$(date +%s) $_hw_id" >> "$TVC_FG_LOG" 2>/dev/null
                    _hw_lines=$((_hw_lines + 1))
                    if [ "$_hw_lines" -ge 300 ]; then
                        tail -n 100 "$TVC_FG_LOG" > "$TVC_FG_LOG.tmp" 2>/dev/null && mv -f "$TVC_FG_LOG.tmp" "$TVC_FG_LOG"
                        _hw_lines=100
                    fi
                fi
                ;;
        esac
        case $_hw_out in
            *"\"appId\":\"$TVC_HOME_APP\""*|*"\"appId\": \"$TVC_HOME_APP\""*)
                if [ "$_hw_wait" -gt 0 ]; then
                    _hw_wait=$((_hw_wait - 1))
                else
                    _hw_tries=$((_hw_tries + 1))
                    # shellcheck disable=SC2086
                    _hw_res=$($TVC_HW_TMO luna-send -n 1 luna://com.webos.applicationManager/launch \
                        "{\"id\":\"$LAUNCHER_ID\"}" 2>&1)
                    case $_hw_res in
                        *'"returnValue":true'*|*'"returnValue": true'*)
                            if [ "$_hw_tries" = 1 ]; then
                                log "Home-Screen erkannt → $LAUNCHER_ID geöffnet"
                            else
                                log "Home-Screen noch sichtbar → $LAUNCHER_ID erneut geöffnet (Versuch $_hw_tries)"
                            fi
                            ;;
                        *)
                            log "Start von $LAUNCHER_ID fehlgeschlagen (Versuch $_hw_tries): $(echo "$_hw_res" | tr '\n' ' ')"
                            ;;
                    esac
                    _hw_wait=$_hw_backoff
                    _hw_backoff=$((_hw_backoff * 2))
                    [ "$_hw_backoff" -gt 40 ] && _hw_backoff=40
                fi
                ;;
            *'"appId"'*)
                # andere App im Vordergrund → alles zurücksetzen
                _hw_tries=0
                _hw_wait=0
                _hw_backoff=3
                ;;
            *)
                # keine verwertbare Antwort (z. B. Dienst beim Booten noch nicht bereit)
                sleep 2
                ;;
        esac
        $TVC_HW_SLEEP
    done
}

homewatch_start() {
    [ "${HOME_REDIRECT:-1}" = 1 ] || return 0
    [ -n "$LAUNCHER_ID" ] || return 0
    is_valid_id "$LAUNCHER_ID" || return 1
    homewatch_running && return 0
    mkdir -p "$TVC_STATE" || return 1
    # Als eigener Prozess starten: nur so steht die Markierung in /proc/<pid>/environ.
    # Mit setsid in eine eigene Sitzung – sonst beendet das Schließen einer SSH-Sitzung
    # (z. B. nach einem Update über den Installer) den Wächter gleich wieder.
    if command -v setsid >/dev/null 2>&1; then
        TVCLEAN_HOMEWATCH=1 setsid sh "$TVC_DIR/lib/homewatch-run.sh" </dev/null >/dev/null 2>&1 &
    else
        TVCLEAN_HOMEWATCH=1 nohup sh "$TVC_DIR/lib/homewatch-run.sh" </dev/null >/dev/null 2>&1 &
    fi
    echo $! > "$TVC_HW_PID"
    log "Home-Wächter gestartet (PID $!) für $LAUNCHER_ID"
    return 0
}

homewatch_stop() {
    _hs_any=0
    # zuerst die Hauptschleife, damit sie nichts Neues mehr startet …
    _hs_main=$(cat "$TVC_HW_PID" 2>/dev/null)
    if [ -n "$_hs_main" ] && _hw_is_ours "$_hs_main"; then
        kill "$_hs_main" 2>/dev/null && _hs_any=1
    fi
    # … dann alles Übrige (auch Reste älterer Versionen), in mehreren Durchgängen
    _hs_i=0
    while [ "$_hs_i" -lt 5 ]; do
        _hs_list=$(homewatch_pids)
        [ -n "$_hs_list" ] || break
        for _hs in $_hs_list; do
            kill "$_hs" 2>/dev/null && _hs_any=1
        done
        sleep 1
        _hs_i=$((_hs_i + 1))
    done
    rm -f "$TVC_HW_PID" "$TVC_STATE"/homewatch.*.fifo
    [ "$_hs_any" = 1 ] && log "Home-Wächter beendet"
    return 0
}
