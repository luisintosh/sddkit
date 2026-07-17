#!/usr/bin/env bash
set -euo pipefail

# Install the opencode harness toolkit into the current repository.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/luisintosh/opencode-harness-toolkit/refs/heads/master/install.sh | bash
#
# Environment variables:
#   TARGET_DIR    directory to install into (default: current working directory)
#   VERSION       git tag to install, e.g. v0.2.0 (default: latest tag, falling back to master)
#   BRANCH        install from a branch instead of a tag (overrides VERSION)
#   LOCAL_SOURCE  install from a local checkout instead of downloading (for CI/testing)
#
# Flags:
#   --dry-run     show what would change without writing anything
#   --doctor      run environment checks only (this also runs automatically after a real install)
#
# Re-running this script is safe: unchanged files are left alone, files that
# changed upstream are updated, files you edited locally are backed up under
# .opencode/.backup-<timestamp>/ before being replaced, and files removed
# upstream are pruned (backed up first if you'd modified them).

REPO_OWNER="${REPO_OWNER:-luisintosh}"
REPO_NAME="${REPO_NAME:-opencode-harness-toolkit}"
TARGET_DIR="${TARGET_DIR:-$PWD}"
VERSION="${VERSION:-}"
BRANCH="${BRANCH:-}"
LOCAL_SOURCE="${LOCAL_SOURCE:-}"

DRY_RUN=false
DOCTOR_ONLY=false
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --doctor) DOCTOR_ONLY=true ;;
    *) ;;
  esac
done

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

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

# Look up the sha256 recorded for a path in a `<sha256>  <path>` manifest file.
# Returns non-zero (empty stdout) if the manifest or the entry doesn't exist.
manifest_hash() {
  local manifest="$1"
  local rel_path="$2"
  [[ -f "$manifest" ]] || return 1
  awk -v p="$rel_path" '
    { n = split($0, a, /  /); if (n >= 2 && a[2] == p) { print a[1]; found = 1; exit } }
    END { exit !found }
  ' "$manifest"
}

manifest_paths_of() {
  local manifest="$1"
  [[ -f "$manifest" ]] || return 0
  awk '{ n = split($0, a, /  /); if (n >= 2) print a[2] }' "$manifest"
}

doctor() {
  log ""
  log "Doctor:"

  if command -v opencode >/dev/null 2>&1; then
    log "  [ok]   opencode is on PATH"
  else
    log "  [warn] opencode not found on PATH — install it from https://opencode.ai"
  fi

  if git -C "$TARGET_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    log "  [ok]   inside a git repository"
  else
    log "  [warn] ${TARGET_DIR} is not a git repository"
  fi

  if [[ -f "${TARGET_DIR}/AGENTS.md" ]]; then
    log "  [ok]   AGENTS.md present"
  else
    log "  [warn] AGENTS.md missing — run /setup-docs in opencode first"
  fi

  if command -v gh >/dev/null 2>&1; then
    if gh auth status >/dev/null 2>&1; then
      log "  [ok]   gh installed and authenticated (only needed if you enable GitHub mode)"
    else
      log "  [warn] gh installed but not logged in — run 'gh auth login' (only needed for GitHub mode)"
    fi
  else
    log "  [warn] gh not found (only needed if you enable GitHub mode)"
  fi

  log ""
}

main() {
  if $DOCTOR_ONLY; then
    doctor
    return 0
  fi

  [[ -d "$TARGET_DIR" ]] || die "target directory does not exist: $TARGET_DIR"

  # NOTE (harness-agnostic refactor, §7 pending): the installable tree is now
  # generated (build/<harness>/) and published as a per-harness release asset,
  # not served from the raw repo. The LOCAL_SOURCE path below already works
  # against a built tree (point it at build/opencode/); the network path still
  # targets raw repo files and will be repointed at release artifacts + gain a
  # HARNESS selector in §7. Until then, network install is expected to be used
  # only via LOCAL_SOURCE in CI/e2e.
  local ref base_url
  if [[ -n "$LOCAL_SOURCE" ]]; then
    [[ -d "$LOCAL_SOURCE" ]] || die "LOCAL_SOURCE does not exist: $LOCAL_SOURCE"
    log "Installing opencode-harness-toolkit from local source: ${LOCAL_SOURCE}"
  else
    if [[ -n "$BRANCH" ]]; then
      ref="refs/heads/${BRANCH}"
    elif [[ -n "$VERSION" ]]; then
      ref="refs/tags/${VERSION}"
    else
      local latest_tag=""
      if command -v curl >/dev/null 2>&1; then
        latest_tag="$(curl -fsSL "https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/tags" 2>/dev/null \
          | grep -m1 '"name"' \
          | sed -E 's/.*"name":[[:space:]]*"([^"]+)".*/\1/' || true)"
      fi
      if [[ -n "$latest_tag" ]]; then
        ref="refs/tags/${latest_tag}"
        log "Resolved latest release: ${latest_tag}"
      else
        ref="refs/heads/master"
        log "Could not resolve a release tag from GitHub; falling back to master"
      fi
    fi
    base_url="https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${ref}"
    log "Installing opencode-harness-toolkit (${ref}) into ${TARGET_DIR}..."
  fi

  # -------------------------------------------------------------------------
  # Stage: fetch manifest.txt + every file it lists into a scratch dir.
  # All-or-nothing — nothing under .opencode/ is touched until every file
  # downloads and its checksum matches the manifest.
  # -------------------------------------------------------------------------

  local stage_dir
  stage_dir="$(mktemp -d)"
  trap '[[ -n "${stage_dir:-}" ]] && rm -rf "$stage_dir"' EXIT

  if [[ -n "$LOCAL_SOURCE" ]]; then
    [[ -f "${LOCAL_SOURCE}/manifest.txt" ]] || die "manifest.txt not found under LOCAL_SOURCE"
    cp "${LOCAL_SOURCE}/manifest.txt" "${stage_dir}/manifest.txt"
  else
    download "${base_url}/manifest.txt" "${stage_dir}/manifest.txt" || die "failed to download manifest.txt"
  fi
  [[ -s "${stage_dir}/manifest.txt" ]] || die "manifest.txt is empty"

  local file_count=0
  local rel_path expected_hash actual_hash
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    expected_hash="${line%%  *}"
    rel_path="${line#*  }"

    mkdir -p "${stage_dir}/$(dirname "$rel_path")"
    if [[ -n "$LOCAL_SOURCE" ]]; then
      [[ -f "${LOCAL_SOURCE}/${rel_path}" ]] || die "missing file in LOCAL_SOURCE: ${rel_path}"
      cp "${LOCAL_SOURCE}/${rel_path}" "${stage_dir}/${rel_path}"
    else
      download "${base_url}/${rel_path}" "${stage_dir}/${rel_path}" || die "failed to download ${rel_path}"
    fi

    actual_hash="$(sha256_of "${stage_dir}/${rel_path}")"
    [[ "$actual_hash" == "$expected_hash" ]] \
      || die "checksum mismatch for ${rel_path} (expected ${expected_hash}, got ${actual_hash}) — aborting, nothing was installed"

    file_count=$((file_count + 1))
  done < "${stage_dir}/manifest.txt"

  log "Verified ${file_count} files against manifest.txt"

  # -------------------------------------------------------------------------
  # Install: idempotent diff against .opencode/.harness-manifest from the
  # previous install.
  # -------------------------------------------------------------------------

  local harness_dir="${TARGET_DIR}/.opencode"
  local old_manifest="${harness_dir}/.harness-manifest"
  local new_manifest="${stage_dir}/manifest.txt"
  local backup_stamp
  backup_stamp="$(date +%Y%m%d%H%M%S)"
  local backup_dir="${harness_dir}/.backup-${backup_stamp}"
  local backup_used=false

  local installed=0 updated=0 backed_up=0 pruned=0 skipped=0
  local dest have_hash prev_hash want_hash

  while IFS= read -r rel_path; do
    [[ -z "$rel_path" ]] && continue
    dest="${harness_dir}/${rel_path}"
    want_hash="$(manifest_hash "$new_manifest" "$rel_path")"

    if [[ ! -f "$dest" ]]; then
      $DRY_RUN || { mkdir -p "$(dirname "$dest")"; cp "${stage_dir}/${rel_path}" "$dest"; }
      log "  + install  ${rel_path}"
      installed=$((installed + 1))
      continue
    fi

    have_hash="$(sha256_of "$dest")"
    if [[ "$have_hash" == "$want_hash" ]]; then
      skipped=$((skipped + 1))
      continue
    fi

    prev_hash="$(manifest_hash "$old_manifest" "$rel_path" || true)"
    if [[ -n "$prev_hash" && "$have_hash" != "$prev_hash" ]]; then
      $DRY_RUN || { mkdir -p "$(dirname "${backup_dir}/${rel_path}")"; cp "$dest" "${backup_dir}/${rel_path}"; }
      backup_used=true
      backed_up=$((backed_up + 1))
      log "  ~ modified ${rel_path} (locally changed — backed up, then updated)"
    else
      log "  ~ update   ${rel_path}"
      updated=$((updated + 1))
    fi

    $DRY_RUN || { mkdir -p "$(dirname "$dest")"; cp "${stage_dir}/${rel_path}" "$dest"; }
  done < <(manifest_paths_of "$new_manifest")

  # Prune files that were installed before but are no longer in the manifest.
  while IFS= read -r rel_path; do
    [[ -z "$rel_path" ]] && continue
    manifest_hash "$new_manifest" "$rel_path" >/dev/null 2>&1 && continue

    dest="${harness_dir}/${rel_path}"
    [[ -f "$dest" ]] || continue

    have_hash="$(sha256_of "$dest")"
    prev_hash="$(manifest_hash "$old_manifest" "$rel_path" || true)"
    if [[ "$have_hash" != "$prev_hash" ]]; then
      $DRY_RUN || { mkdir -p "$(dirname "${backup_dir}/${rel_path}")"; cp "$dest" "${backup_dir}/${rel_path}"; }
      backup_used=true
      log "  ~ prune    ${rel_path} (locally changed — backed up, then removed)"
    else
      log "  - prune    ${rel_path}"
    fi
    $DRY_RUN || rm -f "$dest"
    pruned=$((pruned + 1))
  done < <(manifest_paths_of "$old_manifest")

  if $DRY_RUN; then
    log ""
    log "Dry run: ${installed} to install, ${updated} to update, ${backed_up} locally-modified (would back up), ${pruned} to prune, ${skipped} unchanged."
    return 0
  fi

  mkdir -p "$harness_dir"
  cp "$new_manifest" "$old_manifest"

  log ""
  log "Installed ${installed}, updated ${updated}, backed up ${backed_up}, pruned ${pruned}, unchanged ${skipped}."
  $backup_used && log "Locally modified files were preserved under ${harness_dir#"$TARGET_DIR"/}/.backup-*/"
  log ""
  log "Open this directory with opencode to use the spec-driven development harness."

  doctor
}

main
