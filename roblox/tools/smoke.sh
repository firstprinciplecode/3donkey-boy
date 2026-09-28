#!/usr/bin/env bash
# Builds the world and backdrop against a fake Roblox API to catch runtime errors outside Studio.
set -euo pipefail
cd "$(dirname "$0")/../src"
args=()
for f in shared/*.luau client/*.luau; do
	args+=("${f%.luau}" "$(cat "$f")")
done
luau ../tools/smoke.luau -a "${args[@]}"
