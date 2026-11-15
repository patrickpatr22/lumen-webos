# shellcheck shell=sh
# tvclean – Sperre über /etc/hosts
#
# Ablauf: aktuelle /etc/hosts lesen (evtl. schon vom Homebrew Channel ersetzt),
# unseren Block anhängen und die Datei per bind mount über /etc/hosts legen.
# Das Dateisystem selbst bleibt unverändert; nach "uninstall" + Neustart ist
# alles wie vorher.

hosts_domains() {
    {
        [ "${BLOCK_LG:-1}" = 1 ] && cat "$TVC_DIR/lists/standard.txt"
        [ "${BLOCK_THINQ:-1}" = 1 ] && cat "$TVC_DIR/lists/thinq.txt"
        for _hd in $EXTRA_HOSTS; do echo "$_hd"; done
    } 2>/dev/null \
        | tr -d '\r' \
        | sed -e 's/#.*//' -e 's/[[:space:]]//g' \
        | grep -E '^[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,}$' \
        | awk '!seen[tolower($0)]++'
}

hosts_active_count() { # Anzahl unserer Einträge in der aktiven /etc/hosts
    awk -v b="$TVC_MARK_BEGIN" -v e="$TVC_MARK_END" '
        $0 == b { on = 1; next }
        $0 == e { on = 0; next }
        on && $1 == "0.0.0.0" { n++ }
        END { print n + 0 }' "$TVC_HOSTS" 2>/dev/null
}

apply_hosts() {
    mkdir -p "$TVC_STATE" || return 1
    _ah_gen="$TVC_STATE/hosts"
    _ah_base="$TVC_STATE/hosts.base.$$"

    if [ ! -f "$TVC_HOSTS" ]; then
        warn "$TVC_HOSTS nicht gefunden – Hosts-Sperre übersprungen"
        return 1
    fi

    # Ist unsere Datei schon eingehängt? (erkennbar an der Markierung)
    _ah_active=0
    grep -qF "$TVC_MARK_BEGIN" "$TVC_HOSTS" && _ah_active=1

    # Basis = aktuelle hosts ohne unseren alten Block
    tr -d '\r' < "$TVC_HOSTS" | awk -v b="$TVC_MARK_BEGIN" -v e="$TVC_MARK_END" '
        $0 == b { skip = 1; next }
        $0 == e { skip = 0; next }
        !skip { print }' > "$_ah_base" || { rm -f "$_ah_base"; return 1; }

    {
        cat "$_ah_base"
        echo "$TVC_MARK_BEGIN"
        hosts_domains | while read -r _ah_d; do
            printf '0.0.0.0 %s\n::1 %s\n' "$_ah_d" "$_ah_d"
        done
        echo "$TVC_MARK_END"
    } > "$_ah_gen.new"
    rm -f "$_ah_base"

    if [ "$_ah_active" = 1 ]; then
        # Bereits eingehängt: Inhalt an Ort und Stelle ersetzen (gleiche Datei,
        # damit der bind mount gültig bleibt)
        cat "$_ah_gen.new" > "$_ah_gen" && rm -f "$_ah_gen.new"
        log "Hosts-Sperre aktualisiert ($(hosts_active_count) Domains)"
        return 0
    fi

    mv "$_ah_gen.new" "$_ah_gen" || return 1
    chmod 644 "$_ah_gen"
    if bind_file "$_ah_gen" "$TVC_HOSTS"; then
        log "Hosts-Sperre aktiv ($(hosts_active_count) Domains)"
        return 0
    fi
    warn "bind mount auf $TVC_HOSTS fehlgeschlagen"
    return 1
}

remove_hosts() {
    if grep -qF "$TVC_MARK_BEGIN" "$TVC_HOSTS" 2>/dev/null; then
        if $TVC_UMOUNT "$TVC_HOSTS"; then
            log "Hosts-Sperre ausgehängt"
        else
            warn "Konnte $TVC_HOSTS nicht aushängen – wirkt bis zum nächsten Neustart"
        fi
    fi
    rm -f "$TVC_STATE/hosts"
}
