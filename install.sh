#!/usr/bin/env bash
# opencode-harness-toolkit — one-liner bootstrap installer.
#
# Run from inside the git repo you want to add the harness to:
#
#   curl -fsSL https://raw.githubusercontent.com/luisintosh/opencode-harness-toolkit/refs/heads/master/install.sh | bash
#
# It mounts this harness repo directly as the project's `.opencode/` git submodule
# (pinned), then hands off to `.opencode/bin/init.sh` to configure the project.
#
# Env overrides:
#   OPENCODE_HARNESS_TOOLKIT_REPO   git URL of the harness repo (default: the canonical remote)
#   OPENCODE_HARNESS_TOOLKIT_REF    tag/branch/commit to pin (default: master)
#   OPENCODE_HARNESS_TOOLKIT_PATH   submodule path (default: .opencode)
#
# Legacy OC_AGENTS_* variables are still accepted as fallbacks.
set -euo pipefail

REPO="${OPENCODE_HARNESS_TOOLKIT_REPO:-${OC_AGENTS_REPO:-https://github.com/luisintosh/opencode-harness-toolkit}}"
REF="${OPENCODE_HARNESS_TOOLKIT_REF:-${OC_AGENTS_REF:-master}}"
DEST="${OPENCODE_HARNESS_TOOLKIT_PATH:-${OC_AGENTS_PATH:-.opencode}}"

die() { printf '\033[31merror:\033[0m %s\n' "$*" >&2; exit 1; }
info() { printf '\033[36m::\033[0m %s\n' "$*" >&2; }
checkout_ref() {
  git -C "$DEST" fetch --tags origin >/dev/null 2>&1 || true
  if git -C "$DEST" rev-parse --verify --quiet "refs/remotes/origin/$REF" >/dev/null; then
    git -C "$DEST" checkout -B "$REF" "origin/$REF"
  else
    git -C "$DEST" checkout "$REF"
  fi
}

# 1. Must be inside a git work tree (the target repo).
git rev-parse --is-inside-work-tree >/dev/null 2>&1 \
  || die "not inside a git repository. cd into your project (and 'git init' if needed) first."

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

# 2. Don't clobber an existing install.
if [ -e "$DEST" ]; then
  if git config --file .gitmodules --get-regexp "submodule\..*\.path" 2>/dev/null | grep -q " $DEST$"; then
    info "$DEST submodule already present — updating to $REF instead."
    git submodule update --init --recursive "$DEST"
    checkout_ref
  else
    die "$DEST already exists and is not the opencode-harness-toolkit submodule. Move it aside first."
  fi
else
  # 3. Add the harness as a pinned submodule at .opencode/
  info "adding $REPO as $DEST (pinned to $REF)"
  git submodule add "$REPO" "$DEST"
  checkout_ref
  git submodule update --init --recursive "$DEST"
fi

[ -x "$DEST/bin/init.sh" ] || die "$DEST/bin/init.sh not found or not executable."

# 4. Hand off to init (forward any args, e.g. --dry-run / --yes / --skills a,b).
info "running init…"
exec "$DEST/bin/init.sh" "$@"
