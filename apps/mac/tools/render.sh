#!/bin/zsh
# Headless snapshots (no screen needed): every page, state, panel in light and dark, drawn with ImageRenderer.
# Usage: tools/render.sh [out-dir]      (default: /tmp/ReLife-render)
# System chrome and AppKit-backed controls are not drawn; use tools/snap.sh on a Mac with a screen for the full check.
set -u
app=~/Applications/ReLife.app/Contents/MacOS/ReLife
store=/tmp/ReLife-render.store
out=${1:-/tmp/ReLife-render}
defaults delete com.relife.mac.test 2>/dev/null
rm -f $store $store-shm $store-wal
rm -rf $out
APP_HEADLESS=1 APP_STORE=$store APP_RENDER=$out $app
