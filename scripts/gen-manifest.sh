#!/usr/bin/env bash
set -euo pipefail

# Regenerate build/<harness>/manifest.txt: `sha256  path` for every file in the
# assembled+bundled install tree. Run after build/assemble.mjs + build/bundle.mjs.
# Usage: scripts/gen-manifest.sh <harness>   (default: opencode)

harness="${1:-opencode}"
cd "$(dirname "$0")/.."
tree="build/${harness}"

[[ -d "$tree" ]] || { echo "gen-manifest: $tree does not exist — run the assemble+bundle steps first" >&2; exit 1; }

sha() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1"
  else
    shasum -a 256 "$1"
  fi
}

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

# Hash every file in the tree except the manifest itself and the install marker,
# recording paths relative to the tree root.
( cd "$tree" && find . -type f \
    ! -name manifest.txt ! -name .harness-manifest \
    | sed 's|^\./||' | sort \
    | while IFS= read -r f; do sha "$f"; done ) > "$tmp"

mv "$tmp" "${tree}/manifest.txt"
echo "Wrote ${tree}/manifest.txt ($(wc -l < "${tree}/manifest.txt" | tr -d ' ') files)" >&2
