#!/usr/bin/env bash
set -euo pipefail

# Regenerate manifest.txt: `sha256  path` for every file install.sh installs.
# Run this after adding/removing/renaming an installable file.

cd "$(dirname "$0")/.."

sha() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1"
  else
    shasum -a 256 "$1"
  fi
}

files=(
  opencode.jsonc
  package.json
)

while IFS= read -r f; do
  files+=("$f")
done < <(find agents -maxdepth 1 -type f -name '*.md' | sort)

while IFS= read -r f; do
  files+=("$f")
done < <(find plugins -maxdepth 1 -type f -name '*.ts' ! -name '*.test.ts' | sort)

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

for f in "${files[@]}"; do
  sha "$f"
done | sort -k2 > "$tmp"

mv "$tmp" manifest.txt
echo "Wrote manifest.txt ($(wc -l < manifest.txt | tr -d ' ') files)" >&2
