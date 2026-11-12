#!/bin/zsh
# Snapshots of every page in light and dark, with seed data, on a fresh test store.
# Usage: tools/snap.sh            every page, state, panel and Settings tab
#        APP_SNAPSHOT_ONLY=today,menubar tools/snap.sh
#        tools/snap.sh -AppleShowScrollBars Always     see the scroll bars as people with a mouse see them
set -u
app=~/Applications/ReLife.app/Contents/MacOS/ReLife
store=/tmp/ReLife-test.store
shots=/tmp/ReLife-shots
# A crashed run leaves saved window state, and the next launch would wait on a "reopen windows?" alert.
rm -rf ~/Library/Saved\ Application\ State/com.relife.mac.savedState
# Per-run settings live in their own suite; clear it so every run starts the same.
defaults delete com.relife.mac.test 2>/dev/null
# Seed data only fills an empty store, so start from nothing.
rm -f $store $store-shm $store-wal
rm -rf $shots
APP_STORE=$store APP_SEED=1 APP_SNAPSHOT=$shots $app "$@"
