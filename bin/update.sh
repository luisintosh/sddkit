#!/usr/bin/env bash
# opencode-harness-toolkit — update the pinned harness submodule in the current repo.
#
#   .opencode/bin/update.sh [ref]
#
# Bumps the `.opencode` submodule to <ref> (default: latest on its remote default
# branch), re-syncs enabled skills to their pinned refs, then asks whether to
# refresh opencode.json.permission from the current template.
set -euo pipefail

REF=""
DEST="${OPENCODE_HARNESS_TOOLKIT_PATH:-${OC_AGENTS_PATH:-.opencode}}"

die() { printf '\033[31merror:\033[0m %s\n' "$*" >&2; exit 1; }
info() { printf '\033[36m::\033[0m %s\n' "$*" >&2; }
warn() { printf '\033[33mwarning:\033[0m %s\n' "$*" >&2; }

while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help) sed -n '2,8p' "${BASH_SOURCE[0]}"; exit 0 ;;
    -* ) die "unknown option: $1" ;;
    * )
      [ -z "$REF" ] || die "multiple refs supplied: $REF and $1"
      REF="$1"
      ;;
  esac
  shift
done

render_opencode_json() {
  cat "$DEST/templates/opencode.json.tmpl"
}

refresh_opencode_permissions() {
  local content tmp out
  [ -f "$DEST/templates/opencode.json.tmpl" ] || die "$DEST/templates/opencode.json.tmpl not found"
  content="$(render_opencode_json)"

  if [ ! -f opencode.json ]; then
    printf '%s' "$content" > opencode.json
    info "created opencode.json with latest permissions"
    return
  fi

  tmp="$(mktemp)"; out="$(mktemp)"
  printf '%s' "$content" > "$tmp"
  if command -v jq >/dev/null 2>&1; then
    jq --slurp '.[0].permission = .[1].permission | .[0]' opencode.json "$tmp" > "$out"
  elif command -v node >/dev/null 2>&1; then
    node -e 'const fs=require("fs");
      const current=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
      const rendered=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));
      current.permission=rendered.permission;
      fs.writeFileSync(process.argv[3], JSON.stringify(current,null,2)+"\n");' opencode.json "$tmp" "$out"
  else
    rm -f "$tmp" "$out"
    warn "cannot refresh opencode.json permissions without jq or node"
    return
  fi
  mv "$out" opencode.json
  rm -f "$tmp"
  info "refreshed opencode.json permissions"
}

maybe_refresh_opencode_permissions() {
  local answer
  printf 'Refresh opencode.json permissions from the latest template? [y/N] ' >&2
  read -r answer || answer=""
  case "$answer" in
    y|Y|yes|YES|Yes)
      refresh_opencode_permissions
      ;;
    *)
      info "kept existing opencode.json permissions"
      ;;
  esac
}

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "not inside a git repository."
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
[ -d "$DEST" ] || die "$DEST submodule not found. Run install.sh first."

if [ -n "$REF" ]; then
  info "pinning $DEST to $REF"
  git -C "$DEST" fetch --tags origin >/dev/null 2>&1 || true
  git -C "$DEST" checkout "$REF"
else
  info "updating $DEST to latest on its remote default branch"
  git submodule update --remote "$DEST"
fi
git -C "$DEST" submodule update --init --recursive

# Re-sync enabled skills (no-op if skills.sh not yet built / no selection recorded).
if [ -x "$DEST/bin/skills.sh" ] && [ -f .opencode-skills.json ]; then
  info "re-syncing enabled skills"
  "$DEST/bin/skills.sh" --sync || true
fi

maybe_refresh_opencode_permissions

info "done. Review the submodule bump: git add $DEST && git commit"
