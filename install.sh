#!/usr/bin/env bash
set -euo pipefail

# Install the opencode-harness-toolkit's SDD harness for OpenCode or Cursor
# into the current repository.
#
# Usage:
#   curl -fsSL .../install.sh | bash                       # opencode (default)
#   curl -fsSL .../install.sh | HARNESS=cursor bash         # cursor
#
# Environment variables:
#   TARGET_DIR    directory to install into (default: current working directory)
#   HARNESS       opencode | cursor (default: auto-detect existing .opencode/ or
#                 .cursor/ if exactly one is present, else "opencode")
#   VERSION       git tag to install, e.g. v0.2.0 (default: latest tag)
#   BRANCH        install from a branch instead of a tag — NOT supported over the
#                 network (the installable tree is generated and published only
#                 for tagged releases); use LOCAL_SOURCE for branch/local testing
#   LOCAL_SOURCE  install from a local built tree instead of downloading, e.g.
#                 LOCAL_SOURCE=build/opencode (for CI/testing)
#
# Flags:
#   --dry-run       show what would change without writing anything
#   --doctor        run environment checks only (this also runs automatically after a real install)
#   --harness=NAME  same as HARNESS=NAME
#
# Re-running this script is safe: unchanged files are left alone, files that
# changed upstream are updated, files you edited locally are backed up under
# .<harness>/.backup-<timestamp>/ before being replaced, and files removed
# upstream are pruned (backed up first if you'd modified them).

REPO_OWNER="${REPO_OWNER:-luisintosh}"
REPO_NAME="${REPO_NAME:-opencode-harness-toolkit}"
TARGET_DIR="${TARGET_DIR:-$PWD}"
HARNESS="${HARNESS:-}"
VERSION="${VERSION:-}"
BRANCH="${BRANCH:-}"
LOCAL_SOURCE="${LOCAL_SOURCE:-}"

DRY_RUN=false
DOCTOR_ONLY=false
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --doctor) DOCTOR_ONLY=true ;;
    --harness=*) HARNESS="${arg#--harness=}" ;;
    *) ;;
  esac
done

# Resolve HARNESS: explicit value wins; else auto-detect from an existing
# install dir if exactly one of .opencode/.cursor is present; else default to
# opencode.
resolve_harness() {
  case "$HARNESS" in
    opencode | cursor) return 0 ;;
    "") ;;
    *) die "HARNESS must be 'opencode' or 'cursor', got: ${HARNESS}" ;;
  esac

  local has_opencode=false has_cursor=false
  [[ -d "${TARGET_DIR}/.opencode" ]] && has_opencode=true
  [[ -d "${TARGET_DIR}/.cursor" ]] && has_cursor=true

  if $has_opencode && ! $has_cursor; then
    HARNESS=opencode
  elif $has_cursor && ! $has_opencode; then
    HARNESS=cursor
  else
    HARNESS=opencode
  fi
}

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
  log "Doctor (harness: ${HARNESS:-unresolved}):"

  case "$HARNESS" in
    cursor)
      if command -v cursor-agent >/dev/null 2>&1; then
        log "  [ok]   cursor-agent is on PATH"
      else
        log "  [warn] cursor-agent not found on PATH — install Cursor from https://cursor.com"
      fi
      ;;
    *)
      if command -v opencode >/dev/null 2>&1; then
        log "  [ok]   opencode is on PATH"
      else
        log "  [warn] opencode not found on PATH — install it from https://opencode.ai"
      fi
      ;;
  esac

  if git -C "$TARGET_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    log "  [ok]   inside a git repository"
  else
    log "  [warn] ${TARGET_DIR} is not a git repository"
  fi

  if [[ -f "${TARGET_DIR}/AGENTS.md" ]]; then
    log "  [ok]   AGENTS.md present"
  else
    log "  [warn] AGENTS.md missing — run /setup-docs first"
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
  resolve_harness

  if $DOCTOR_ONLY; then
    doctor
    return 0
  fi

  [[ -d "$TARGET_DIR" ]] || die "target directory does not exist: $TARGET_DIR"

  # The installable tree is generated (build/<harness>/, gitignored — never
  # committed) and published as a per-harness tarball release asset, so it
  # cannot be fetched file-by-file from raw.githubusercontent.com (that only
  # serves committed content). LOCAL_SOURCE points directly at an already-built
  # tree (e.g. build/opencode/); the network path downloads and extracts
  # <harness>.tar.gz from a GitHub release, then reuses the same LOCAL_SOURCE
  # staging logic below. Release assets only exist for TAGGED releases, so
  # BRANCH installs have no network path — use LOCAL_SOURCE for those.
  local fetched_dir=""
  if [[ -z "$LOCAL_SOURCE" ]]; then
    [[ -z "$BRANCH" ]] || die "BRANCH installs aren't available over the network (no release asset exists for an arbitrary branch) — use LOCAL_SOURCE=/path/to/build/${HARNESS} instead, or install a tagged VERSION."

    local tag="$VERSION"
    if [[ -z "$tag" ]]; then
      if command -v curl >/dev/null 2>&1; then
        tag="$(curl -fsSL "https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/tags" 2>/dev/null \
          | grep -m1 '"name"' \
          | sed -E 's/.*"name":[[:space:]]*"([^"]+)".*/\1/' || true)"
      fi
      [[ -n "$tag" ]] || die "could not resolve a release tag from GitHub — pass VERSION=<tag> explicitly, or use LOCAL_SOURCE"
      log "Resolved latest release: ${tag}"
    fi

    local asset_url="https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/download/${tag}/${HARNESS}.tar.gz"
    fetched_dir="$(mktemp -d)"
    download "$asset_url" "${fetched_dir}/${HARNESS}.tar.gz" \
      || die "failed to download ${asset_url} — does a ${HARNESS}.tar.gz release asset exist for ${tag}?"
    tar -xzf "${fetched_dir}/${HARNESS}.tar.gz" -C "$fetched_dir" \
      || die "failed to extract ${HARNESS}.tar.gz"
    rm -f "${fetched_dir}/${HARNESS}.tar.gz"
    LOCAL_SOURCE="$fetched_dir"
  fi

  [[ -d "$LOCAL_SOURCE" ]] || die "LOCAL_SOURCE does not exist: $LOCAL_SOURCE"
  log "Installing opencode-harness-toolkit (${HARNESS}) from: ${LOCAL_SOURCE}"

  # -------------------------------------------------------------------------
  # Stage: fetch manifest.txt + every file it lists into a scratch dir.
  # All-or-nothing — nothing under .${HARNESS}/ is touched until every file
  # is verified against the manifest.
  # -------------------------------------------------------------------------

  local stage_dir
  stage_dir="$(mktemp -d)"
  trap '[[ -n "${stage_dir:-}" ]] && rm -rf "$stage_dir"; [[ -n "${fetched_dir:-}" ]] && rm -rf "$fetched_dir"' EXIT

  [[ -f "${LOCAL_SOURCE}/manifest.txt" ]] || die "manifest.txt not found under LOCAL_SOURCE"
  cp "${LOCAL_SOURCE}/manifest.txt" "${stage_dir}/manifest.txt"
  [[ -s "${stage_dir}/manifest.txt" ]] || die "manifest.txt is empty"

  local file_count=0
  local rel_path expected_hash actual_hash
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    expected_hash="${line%%  *}"
    rel_path="${line#*  }"

    mkdir -p "${stage_dir}/$(dirname "$rel_path")"
    [[ -f "${LOCAL_SOURCE}/${rel_path}" ]] || die "missing file in LOCAL_SOURCE: ${rel_path}"
    cp "${LOCAL_SOURCE}/${rel_path}" "${stage_dir}/${rel_path}"

    actual_hash="$(sha256_of "${stage_dir}/${rel_path}")"
    [[ "$actual_hash" == "$expected_hash" ]] \
      || die "checksum mismatch for ${rel_path} (expected ${expected_hash}, got ${actual_hash}) — aborting, nothing was installed"

    file_count=$((file_count + 1))
  done < "${stage_dir}/manifest.txt"

  log "Verified ${file_count} files against manifest.txt"

  # -------------------------------------------------------------------------
  # Install: idempotent diff against .<harness>/.harness-manifest from the
  # previous install.
  # -------------------------------------------------------------------------

  local harness_dir="${TARGET_DIR}/.${HARNESS}"
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
  case "$HARNESS" in
    cursor) log "Open this directory in Cursor and type /sdd <feature request> to use the spec-driven development harness." ;;
    *) log "Open this directory with opencode to use the spec-driven development harness." ;;
  esac

  doctor
}

main
