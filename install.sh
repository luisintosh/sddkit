#!/usr/bin/env bash
set -euo pipefail

# Install the opencode harness toolkit into the current repository.
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/luisintosh/opencode-harness-toolkit/refs/heads/master/install.sh | bash
# Environment variables:
#   TARGET_DIR  directory to install into (default: current working directory)
#   BRANCH      git branch/ref to install from (default: master)

REPO_OWNER="${REPO_OWNER:-luisintosh}"
REPO_NAME="${REPO_NAME:-opencode-harness-toolkit}"
BRANCH="${BRANCH:-master}"
TARGET_DIR="${TARGET_DIR:-$PWD}"

BASE_URL="${BASE_URL:-https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/refs/heads/${BRANCH}}"

AGENTS=(
  architect.md
  implementer.md
  reviewer.md
  sdd.md
  spec.md
  tester.md
)

log() {
  printf '%s\n' "$*" >&2
}

die() {
  log "ERROR: $*"
  exit 1
}

download() {
  local url="$1"
  local dest="$2"

  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$dest"
  elif command -v wget >/dev/null 2>&1; then
    wget -q "$url" -O "$dest"
  else
    die "curl or wget is required to download files"
  fi
}

main() {
  if [[ ! -d "$TARGET_DIR" ]]; then
    die "target directory does not exist: $TARGET_DIR"
  fi

  log "Installing opencode-harness-toolkit into ${TARGET_DIR}..."

  local opencode_dir="${TARGET_DIR}/.opencode"
  mkdir -p "$opencode_dir"

  # Install config file.
  log "  -> ${opencode_dir}/opencode.jsonc"
  download "${BASE_URL}/opencode.jsonc" "${opencode_dir}/opencode.jsonc"

  # Install agent instructions.
  local agents_dir="${opencode_dir}/agents"
  mkdir -p "$agents_dir"

  for agent in "${AGENTS[@]}"; do
    log "  -> ${agents_dir}/${agent}"
    download "${BASE_URL}/agents/${agent}" "${agents_dir}/${agent}"
  done

  log ""
  log "Installation complete."
  log "Open this directory with opencode to use the spec-driven development harness."
}

main "$@"
