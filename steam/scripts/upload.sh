#!/bin/sh
# Uploads release/win-unpacked and release/linux-unpacked to Steam with SteamPipe.
#
# Needs steamcmd on PATH and:
#   STEAM_APP_ID          the game's app id
#   STEAM_DEPOT_WINDOWS   depot id for the Windows build
#   STEAM_DEPOT_LINUX     depot id for the Linux / Steam Deck build
#   STEAM_BUILD_USER      a Steam account with build-upload rights (steamcmd asks for the password)
# Optional:
#   STEAM_BRANCH          a beta branch to set the build live on (Steam won't set "default" from here)
#   STEAM_BUILD_DESC      build description shown on the partner site
set -eu
cd "$(dirname "$0")/.."

: "${STEAM_APP_ID:?set STEAM_APP_ID}"
: "${STEAM_DEPOT_WINDOWS:?set STEAM_DEPOT_WINDOWS}"
: "${STEAM_DEPOT_LINUX:?set STEAM_DEPOT_LINUX}"
: "${STEAM_BUILD_USER:?set STEAM_BUILD_USER}"

for dir in release/win-unpacked release/linux-unpacked; do
  [ -d "$dir" ] || { echo "Missing $dir: run npm run steam:dist first." >&2; exit 1; }
done

root="$(pwd)"
out="$root/release/steampipe"
mkdir -p "$out"
desc="${STEAM_BUILD_DESC:-Popscotch $(node -p "require('./package.json').version") ($(git rev-parse --short HEAD 2>/dev/null || echo local))}"
live=""
[ -n "${STEAM_BRANCH:-}" ] && live="\"SetLive\" \"$STEAM_BRANCH\""

depot() {
  cat <<EOF
    "$1"
    {
      "FileMapping" { "LocalPath" "$2/*" "DepotPath" "." "Recursive" "1" }
    }
EOF
}

cat > "$out/app_build.vdf" <<EOF
"AppBuild"
{
  "AppID" "$STEAM_APP_ID"
  "Desc" "$desc"
  $live
  "ContentRoot" "$root/release"
  "BuildOutput" "$out/output"
  "Depots"
  {
$(depot "$STEAM_DEPOT_WINDOWS" win-unpacked)
$(depot "$STEAM_DEPOT_LINUX" linux-unpacked)
  }
}
EOF

echo "SteamPipe script: $out/app_build.vdf"
steamcmd +login "$STEAM_BUILD_USER" +run_app_build "$out/app_build.vdf" +quit
