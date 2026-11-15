#!/bin/sh
# tvclean – Hauptprozess des Home-Wächters (wird von homewatch_start gestartet).
TVC_TAG=homewatch
trap '' HUP   # überlebt das Ende der SSH-Sitzung, aus der er gestartet wurde
TVC_LIB="${TVC_ROOT:-}/var/lib/webosbrew/tvclean/lib"
. "$TVC_LIB/common.sh"
. "$TVC_LIB/homewatch.sh"
load_conf
[ -n "$LAUNCHER_ID" ] || exit 0
homewatch_loop
