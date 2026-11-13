# Sourced by build.sh and the other tools/*.sh (zsh). Sets the names every script needs, so the product name is
# typed in one place: it is read from Brand.swift, which packages/brand generates from brand.json.
#   APP_NAME   the product name (the .app, its executable, the folders it uses)
#   SWIFT_EXE  the SwiftPM executable target (an identifier in Package.swift; the build copies it to $APP_NAME)
#   APP_BIN    the installed executable
mac_dir=${${(%):-%x}:A:h:h}
APP_NAME=$(sed -n 's/.*static let name = "\(.*\)".*/\1/p' "$mac_dir/Sources/ReLifeKit/Brand.swift")
SWIFT_EXE=$(sed -n '/executableTarget/,/name:/s/.*name: "\([^"]*\)".*/\1/p' "$mac_dir/Package.swift" | head -1)
if [[ -z $APP_NAME || -z $SWIFT_EXE ]]; then
  echo "env.sh: can't read the app name from Sources/ReLifeKit/Brand.swift (run \`npm run brand:swift\`)" >&2
  return 1
fi
APP_BIN=$HOME/Applications/$APP_NAME.app/Contents/MacOS/$APP_NAME
