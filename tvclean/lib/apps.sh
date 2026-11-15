# shellcheck shell=sh
# tvclean – Apps ausblenden und entfernen
#
# Ausblenden: eine Kopie der appinfo.json mit "visible": false wird beim Booten
# per bind mount über das Original gelegt. Das funktioniert auch bei System-Apps
# auf dem schreibgeschützten Dateisystem. Nichts wird gelöscht.

TVC_HIDDEN_LIST="$TVC_STATE/hidden.list"     # Zeilen: <id> <pfad zur appinfo.json>

apply_hide() { # apply_hide [luna]
    mkdir -p "$TVC_STATE/appinfo" || return 1
    touch "$TVC_HIDDEN_LIST"

    # 1. Apps wieder einblenden, die nicht mehr in HIDE_APPS stehen
    : > "$TVC_HIDDEN_LIST.new"
    while read -r _hi_id _hi_file; do
        [ -n "$_hi_id" ] || continue
        if in_list "$_hi_id" "$HIDE_APPS" && is_mounted "$_hi_file"; then
            printf '%s %s\n' "$_hi_id" "$_hi_file" >> "$TVC_HIDDEN_LIST.new"
        elif is_mounted "$_hi_file"; then
            if $TVC_UMOUNT "$_hi_file"; then
                log "wieder eingeblendet: $_hi_id"
            else
                warn "konnte $_hi_id nicht wieder einblenden"
                printf '%s %s\n' "$_hi_id" "$_hi_file" >> "$TVC_HIDDEN_LIST.new"
            fi
            rm -f "$TVC_STATE/appinfo/$_hi_id.json"
        fi
    done < "$TVC_HIDDEN_LIST"
    mv "$TVC_HIDDEN_LIST.new" "$TVC_HIDDEN_LIST"

    # 2. Apps aus HIDE_APPS ausblenden
    _hi_n=0
    for _hi_id in $HIDE_APPS; do
        if ! is_valid_id "$_hi_id"; then
            warn "ungültige App-ID ignoriert: $_hi_id"
            continue
        fi
        if is_protected "$_hi_id"; then
            warn "$_hi_id ist geschützt und wird nicht ausgeblendet"
            continue
        fi
        if ! _hi_dir=$(app_dir_of "$_hi_id" "${1:-}"); then
            log "nicht gefunden (evtl. nicht installiert): $_hi_id"
            continue
        fi
        [ "${1:-}" = luna ] && cache_app_path "$_hi_id" "$_hi_dir"
        _hi_file="$_hi_dir/appinfo.json"
        if is_mounted "$_hi_file"; then
            _hi_n=$((_hi_n + 1))
            grep -q "^$_hi_id " "$TVC_HIDDEN_LIST" \
                || printf '%s %s\n' "$_hi_id" "$_hi_file" >> "$TVC_HIDDEN_LIST"
            continue
        fi
        _hi_patched="$TVC_STATE/appinfo/$_hi_id.json"
        if ! patch_appinfo "$_hi_file" "$_hi_patched" hide; then
            warn "konnte appinfo.json von $_hi_id nicht anpassen"
            continue
        fi
        if bind_file "$_hi_patched" "$_hi_file"; then
            printf '%s %s\n' "$_hi_id" "$_hi_file" >> "$TVC_HIDDEN_LIST"
            _hi_n=$((_hi_n + 1))
            log "ausgeblendet: $_hi_id"
        else
            warn "bind mount für $_hi_id fehlgeschlagen"
        fi
    done
    log "$_hi_n App(s) ausgeblendet"
}

remove_hide_all() {
    [ -f "$TVC_HIDDEN_LIST" ] || return 0
    while read -r _rh_id _rh_file; do
        [ -n "$_rh_id" ] || continue
        if is_mounted "$_rh_file"; then
            $TVC_UMOUNT "$_rh_file" && log "wieder eingeblendet: $_rh_id"
        fi
        rm -f "$TVC_STATE/appinfo/$_rh_id.json"
    done < "$TVC_HIDDEN_LIST"
    rm -f "$TVC_HIDDEN_LIST"
}

# ---------------------------------------------------------------------------
# Apps auflisten
# ---------------------------------------------------------------------------
list_apps() {
    mkdir -p "$TVC_STATE"
    _la_json="$TVC_STATE/listapps.json"
    if have_luna && _la_node=$(find_node) \
        && luna luna://com.webos.applicationManager/listApps '{}' > "$_la_json" \
        && "$_la_node" -e '
var fs = require("fs"), a = process.argv;
var j = JSON.parse(fs.readFileSync(a[1], "utf8"));
var prot = a[2].split(/\s+/), hide = a[3].split(/\s+/), launcher = a[4];
var rows = (j.apps || []).map(function (x) {
  var p = x.folderPath || "", typ = "System";
  if (p.indexOf("/media/developer/") === 0) typ = "Homebrew";
  else if (p.indexOf("/media/cryptofs/") === 0) typ = "Store";
  else if (x.removable) typ = "Store";
  var f = [];
  if (x.id === launcher) f.push("LAUNCHER");
  if (x.visible === false) f.push("ausgeblendet");
  if (prot.indexOf(x.id) >= 0 || /^com\.webos\.app\.(hdmi|externalinput)/.test(x.id)) f.push("geschuetzt");
  if (x.removable) f.push("entfernbar");
  return { id: x.id, typ: typ, title: (x.title || "").replace(/\s+/g, " "), f: f.join(",") };
});
var order = { Homebrew: 0, Store: 1, System: 2 };
rows.sort(function (p, q) { return (order[p.typ] - order[q.typ]) || (p.id < q.id ? -1 : 1); });
function pad(s, n) { s = String(s); while (s.length < n) s += " "; return s; }
console.log(pad("TYP", 9) + pad("APP-ID", 46) + pad("NAME", 28) + "INFO");
rows.forEach(function (r) {
  console.log(pad(r.typ, 9) + pad(r.id, 46) + pad(r.title.slice(0, 26), 28) + r.f);
});
' "$_la_json" "$TVC_PROTECTED" "$HIDE_APPS" "$LAUNCHER_ID" 2>>"$TVC_LOG"; then
        return 0
    fi

    # Ersatzweg: Verzeichnisse durchsuchen
    printf '%-9s%-46s%s\n' TYP APP-ID NAME
    for _la_d in $TVC_APP_DIRS; do
        case $_la_d in
            */media/developer/*) _la_typ=Homebrew ;;
            */media/cryptofs/*)  _la_typ=Store ;;
            *)                   _la_typ=System ;;
        esac
        for _la_f in "$_la_d"/*/appinfo.json; do
            [ -f "$_la_f" ] || continue
            _la_id=$(json_str "$_la_f" id)
            _la_title=$(json_str "$_la_f" title)
            printf '%-9s%-46s%s\n' "$_la_typ" "$_la_id" "$_la_title"
        done
    done
}

# ---------------------------------------------------------------------------
# Apps deinstallieren
# ---------------------------------------------------------------------------
remove_apps() { # remove_apps <ja:0|1> <ids...>
    _ra_yes=$1
    shift
    if ! have_luna; then
        warn "luna-send nicht gefunden – läuft das Skript wirklich auf dem TV?"
        return 1
    fi
    _ra_todo=""
    for _ra_id in "$@"; do
        if ! is_valid_id "$_ra_id"; then
            warn "ungültige App-ID ignoriert: $_ra_id"
            continue
        fi
        if is_protected "$_ra_id"; then
            warn "$_ra_id ist geschützt – wird nicht entfernt"
            continue
        fi
        if ! _ra_dir=$(app_dir_of "$_ra_id" luna); then
            note "$_ra_id ist nicht installiert"
            continue
        fi
        case $_ra_dir in
            "$R"/media/developer/*|"$R"/media/cryptofs/*) ;;
            *)
                if ! luna luna://com.webos.applicationManager/getAppInfo "{\"id\":\"$_ra_id\"}" \
                    | grep -q '"removable"[[:space:]]*:[[:space:]]*true'; then
                    bad "$_ra_id ist eine System-App und lässt sich nicht entfernen – trage sie in HIDE_APPS ein"
                    continue
                fi
                ;;
        esac
        _ra_todo="$_ra_todo $_ra_id"
    done

    if [ -z "$_ra_todo" ]; then
        info "Nichts zu deinstallieren."
        return 0
    fi

    echo "Folgende Apps werden deinstalliert:"
    for _ra_id in $_ra_todo; do echo "  - $_ra_id"; done
    if [ "$_ra_yes" != 1 ]; then
        printf 'Fortfahren? [j/N] '
        read -r _ra_answer
        case $_ra_answer in
            j|J|ja|Ja|y|Y|yes) ;;
            *) echo "Abgebrochen."; return 1 ;;
        esac
    fi

    _ra_fail=0
    for _ra_id in $_ra_todo; do
        _ra_dir=$(app_dir_of "$_ra_id" luna)
        case $_ra_dir in
            "$R"/media/developer/*) _ra_method=dev/remove ;;
            *)                       _ra_method=remove ;;
        esac
        _ra_out=$(luna "luna://com.webos.appInstallService/$_ra_method" "{\"id\":\"$_ra_id\"}")
        log "remove $_ra_id ($_ra_method): $(echo "$_ra_out" | tr '\n' ' ')"
        case $_ra_out in
            *'"returnValue": false'*|*'"returnValue":false'*)
                bad "$_ra_id: Fehler – $(echo "$_ra_out" | sed -n 's/.*"errorText"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)"
                _ra_fail=1
                continue
                ;;
        esac
        # Auf das Verschwinden des Ordners warten (max. ~60 s)
        _ra_i=0
        while [ -d "$_ra_dir" ] && [ "$_ra_i" -lt 30 ]; do
            sleep 2
            _ra_i=$((_ra_i + 1))
        done
        if [ -d "$_ra_dir" ]; then
            bad "$_ra_id: Deinstallation angestoßen, Ordner ist aber noch da – später mit 'apps' prüfen"
        else
            ok "$_ra_id deinstalliert"
        fi
    done
    return $_ra_fail
}
