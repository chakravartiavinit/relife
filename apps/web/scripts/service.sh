#!/bin/bash
# Run ReLife in the background on this Mac: starts at login, restarts if it crashes.
#   npm run service -- install    write the LaunchAgent and start it
#   npm run service -- restart    rebuild and restart (after pulling or changing code)
#   npm run service -- stop       stop it (e.g. before `npm run dev`, which uses the same port)
#   npm run service -- uninstall  stop it and remove the LaunchAgent
#   npm run service -- logs       follow the log
set -euo pipefail

# A LaunchAgent is a Mac feature. Everywhere else, Docker Compose keeps it running (`restart: unless-stopped`).
if [ "$(uname)" != "Darwin" ]; then
  echo "On Linux or Windows, run it with Docker Compose: docs/SELF_HOSTING.md" >&2
  exit 1
fi

LABEL=com.relife.app
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_DIR="$HOME/Library/Logs/ReLife"
DIR="$(cd "$(dirname "$0")/../../.." && pwd)"   # repo root
WEB="$DIR/apps/web"
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
  <key>WorkingDirectory</key><string>$WEB</string>
  <key>ProgramArguments</key>
  <array><string>/bin/zsh</string><string>-c</string><string>exec npm start</string></array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$NODE_BIN:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>RELIFE_BIND</key><string>${RELIFE_BIND:-127.0.0.1}</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>$LOG_DIR/relife.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/relife.log</string>
</dict>
</plist>
PLIST
    [ -f "$WEB/.next/BUILD_ID" ] || (cd "$WEB" && npm run build)
    launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
    # bootout returns before the old copy has stopped; wait for it so bootstrap doesn't fail.
    for _ in $(seq 1 20); do launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1 || break; sleep 0.5; done
    launchctl bootstrap "$DOMAIN" "$PLIST"
    echo "ReLife runs at http://127.0.0.1:3030 (log: $LOG_DIR/relife.log)"
    ;;
  restart)
    (cd "$WEB" && npm run build)
    # After `stop` the service is unloaded, so load it again instead of failing.
    launchctl kickstart -k "$DOMAIN/$LABEL" 2>/dev/null || launchctl bootstrap "$DOMAIN" "$PLIST"
    ;;
  stop) launchctl bootout "$DOMAIN/$LABEL" ;;
  uninstall) launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true; rm -f "$PLIST" ;;
  logs) tail -f "$LOG_DIR/relife.log" ;;
  *) sed -n '2,8p' "$0"; exit 1 ;;
esac
