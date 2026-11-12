#!/bin/zsh
# Runs the in-app self-test against a fresh store in /tmp. Exit code 0 when every check passed.
set -u
source "${0:A:h}/env.sh"
rm -rf ~/Library/Saved\ Application\ State/com.relife.mac.savedState
store=/tmp/$APP_NAME-self.store
defaults delete com.relife.mac.test 2>/dev/null
rm -f $store $store-shm $store-wal
APP_STORE=$store $APP_BIN --selftest
