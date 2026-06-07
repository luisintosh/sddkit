#!/usr/bin/env bash
# opencode-harness-toolkit — update the pinned harness submodule in the current repo.
#
#   .opencode/bin/update.sh [ref]
#
# Bumps the `.opencode` submodule to <ref> (default: latest on its remote default
# branch), then re-syncs enabled skills to their pinned refs. Never touches the
# target repo's state files (opencode.json, AGENTS.md, docs/).
set -euo pipefail

REF="${1:-}"
DEST="${OPENCODE_HARNESS_TOOLKIT_PATH:-${OC_AGENTS_PATH:-.opencode}}"

die() { printf '\033[31merror:\033[0m %s\n' "$*" >&2; exit 1; }
info() { printf '\033[36m::\033[0m %s\n' "$*" >&2; }

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
git submodule update --init --recursive "$DEST"

# Re-sync enabled skills (no-op if skills.sh not yet built / no selection recorded).
if [ -x "$DEST/bin/skills.sh" ] && [ -f .opencode-skills.json ]; then
  info "re-syncing enabled skills"
  "$DEST/bin/skills.sh" --sync || true
fi

info "done. Review the submodule bump: git add $DEST && git commit"
