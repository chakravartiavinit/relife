#!/bin/bash
# Run ReLife in the background on this Mac: starts at login, restarts if it crashes.
#   scripts/service.sh install    write the LaunchAgent and start it
#   scripts/service.sh restart    rebuild and restart (after pulling or changing code)
#   scripts/service.sh stop       stop it (e.g. before `npm run dev`, which uses the same port)
#   scripts/service.sh uninstall  stop it and remove the LaunchAgent
#   scripts/service.sh logs       follow the log
set -euo pipefail

LABEL=com.relife.app
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_DIR="$HOME/Library/Logs/ReLife"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
DOMAIN="gui/$(id -u)"

case "${1:-}" in
  install)
    # The real Node binary, not a per-shell version-manager link that disappears.
    NODE_BIN="$(dirname "$(node -e 'process.stdout.write(require("fs").realpathSync(process.execPath))')")"
    mkdir -p "$LOG_DIR" "$(dirname "$PLIST")"
    cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>ProgramArguments</key>
  <array><string>/bin/zsh</string><string>-c</string><string>exec npm start</string></array>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>$NODE_BIN:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>$LOG_DIR/relife.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/relife.log</string>
</dict>
</plist>
PLIST
    [ -d "$DIR/.next" ] || (cd "$DIR" && npm run build)
    launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
    # bootout returns before the old copy has stopped; wait for it so bootstrap doesn't fail.
    for _ in $(seq 1 20); do launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1 || break; sleep 0.5; done
    launchctl bootstrap "$DOMAIN" "$PLIST"
    echo "ReLife runs at http://127.0.0.1:3030 (log: $LOG_DIR/relife.log)"
    ;;
  restart)
    (cd "$DIR" && npm run build)
    launchctl kickstart -k "$DOMAIN/$LABEL"
    ;;
  stop) launchctl bootout "$DOMAIN/$LABEL" ;;
  uninstall) launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true; rm -f "$PLIST" ;;
  logs) tail -f "$LOG_DIR/relife.log" ;;
  *) sed -n '2,8p' "$0"; exit 1 ;;
esac
