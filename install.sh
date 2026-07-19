#!/usr/bin/env bash
set -euo pipefail

# Install the SDD harness (OpenCode and/or Cursor) into the current repository.
#
# Interactive (TTY): prompts for target and version.
# Non-interactive / CI: defaults (target=all); env overrides for tests:
#   TARGET_DIR, VERSION, BRANCH, LOCAL_SOURCE, INSTALL_TARGET
#
# Flags: --dry-run, --doctor

REPO_OWNER="${REPO_OWNER:-luisintosh}"
REPO_NAME="${REPO_NAME:-opencode-harness-toolkit}"
TARGET_DIR="${TARGET_DIR:-$PWD}"
VERSION="${VERSION:-}"
BRANCH="${BRANCH:-}"
LOCAL_SOURCE="${LOCAL_SOURCE:-}"
INSTALL_TARGET="${INSTALL_TARGET:-}"

DRY_RUN=false
DOCTOR_ONLY=false
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --doctor) DOCTOR_ONLY=true ;;
    *) ;;
  esac
done

log() { printf '%s\n' "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }

download() {
  local url="$1" dest="$2"
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

manifest_hash() {
  local manifest="$1" rel_path="$2"
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

prompt_default() {
  local prompt="$1" default="$2" reply
  if [[ -t 0 ]]; then
    read -r -p "${prompt} [${default}]: " reply || true
    printf '%s' "${reply:-$default}"
  else
    printf '%s' "$default"
  fi
}

resolve_interactive() {
  if [[ -n "$INSTALL_TARGET" ]]; then
    return 0
  fi
  if [[ -t 0 ]]; then
    log "SDD harness installer"
    log ""
    local t
    t="$(prompt_default "Install target (all / opencode / cursor)" "all")"
    case "$t" in
      all|opencode|cursor) INSTALL_TARGET="$t" ;;
      *) die "invalid target: $t (use all, opencode, or cursor)" ;;
    esac

    if [[ -z "$LOCAL_SOURCE" && -z "$BRANCH" && -z "$VERSION" ]]; then
      local vchoice
      vchoice="$(prompt_default "Version source (latest / tag / branch / local)" "latest")"
      case "$vchoice" in
        latest) ;;
        tag)
          VERSION="$(prompt_default "Tag (e.g. v0.3.0)" "")"
          [[ -n "$VERSION" ]] || die "tag required"
          ;;
        branch)
          BRANCH="$(prompt_default "Branch name" "master")"
          ;;
        local)
          LOCAL_SOURCE="$(prompt_default "Local checkout path" "")"
          [[ -n "$LOCAL_SOURCE" ]] || die "local path required"
          ;;
        *) die "invalid version source: $vchoice" ;;
      esac
    fi

    local confirm
    confirm="$(prompt_default "Install into ${TARGET_DIR}? (y/N)" "y")"
    case "$confirm" in
      y|Y|yes|YES|Yes) ;;
      *) die "aborted" ;;
    esac
  else
    INSTALL_TARGET="all"
  fi
}

doctor() {
  log ""
  log "Doctor:"

  if command -v opencode >/dev/null 2>&1; then
    log "  [ok]   opencode is on PATH"
  else
    log "  [warn] opencode not found — https://opencode.ai (only needed for OpenCode target)"
  fi

  if command -v cursor >/dev/null 2>&1 || command -v cursor-agent >/dev/null 2>&1; then
    log "  [ok]   Cursor CLI detected"
  else
    log "  [warn] Cursor CLI not detected (optional; open the repo in Cursor for .cursor/ agents)"
  fi

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

  if [[ -x "${TARGET_DIR}/bin/sdd-state" ]] || [[ -f "${TARGET_DIR}/bin/sdd-state" ]]; then
    log "  [ok]   bin/sdd-state present"
  else
    log "  [warn] bin/sdd-state missing — re-run the installer"
  fi

  if command -v bun >/dev/null 2>&1; then
    log "  [ok]   bun is on PATH (needed to run the portable sdd-state script)"
  else
    log "  [warn] bun not found — install from https://bun.sh to run bin/sdd-state"
  fi

  if command -v gh >/dev/null 2>&1; then
    if gh auth status >/dev/null 2>&1; then
      log "  [ok]   gh installed and authenticated (GitHub mode)"
    else
      log "  [warn] gh installed but not logged in — run 'gh auth login'"
    fi
  else
    log "  [warn] gh not found — install for GitHub mode: brew install gh && gh auth login"
  fi

  if command -v npx >/dev/null 2>&1; then
    log "  [ok]   npx is on PATH (codesight)"
  else
    log "  [warn] npx not found — Node >= 18 for /setup-context"
  fi

  if [[ -f "${TARGET_DIR}/.codesight/wiki/index.md" ]]; then
    log "  [ok]   .codesight/wiki/ present"
  else
    log "  [warn] .codesight/wiki/ missing — run /setup-context to bootstrap"
  fi

  log ""
}

suggest_next_steps() {
  log "Next steps:"
  log "  1. /setup-docs       — scaffold AGENTS.md + docs/ARCHITECTURE.md + CONSTITUTION"
  log "  2. /setup-context    — optional CodeSight wiki (needs Node >= 18 / npx)"
  if ! command -v gh >/dev/null 2>&1; then
    log "  3. Install gh for GitHub mode:"
    log "       brew install gh && gh auth login"
    log "       # or: https://cli.github.com/"
  else
    log "  3. gh is on PATH — run 'gh auth login' if you use GitHub mode and aren't logged in"
  fi
  log ""
  log "Optional: rtk (filters noisy bash output for agents)"
  log "  brew install rtk   # or see https://github.com/rtk-ai/rtk"
  log "  rtk init --opencode   # OpenCode"
  log "  # Quick start: exclude git diff/show from rewriting so the SDD reviewer"
  log "  # sees full diffs — in ~/.config/rtk/config.toml:"
  log "  #   [hooks]"
  log "  #   exclude_commands = [\"git diff\", \"git show\"]"
  log ""
}

# Build dist/ + manifest.txt in a toolkit checkout (needs bun).
build_payload() {
  local src="$1"
  command -v bun >/dev/null 2>&1 || die "bun is required to build the harness — https://bun.sh"
  log "Building install payload in ${src}..."
  (cd "$src" && bun install --frozen-lockfile 2>/dev/null || bun install) || die "bun install failed in ${src}"
  (cd "$src" && bun run build) || die "bun run build failed in ${src}"
  [[ -f "${src}/manifest.txt" && -f "${src}/dist/bin/sdd-state" ]] || die "build did not produce dist/ + manifest.txt"
}

# Ensure LOCAL_SOURCE has a fresh dist/; for remote, download release tarball or build from source.
prepare_payload_dir() {
  # Sets global PAYLOAD_DIR to a directory containing manifest.txt and dist/
  if [[ -n "$LOCAL_SOURCE" ]]; then
    if [[ ! -f "${LOCAL_SOURCE}/manifest.txt" || ! -d "${LOCAL_SOURCE}/dist/opencode" ]]; then
      build_payload "$LOCAL_SOURCE"
    fi
    PAYLOAD_DIR="$LOCAL_SOURCE"
    return 0
  fi

  local tag="" branch=""
  if [[ -n "$BRANCH" ]]; then
    branch="$BRANCH"
  elif [[ -n "$VERSION" ]]; then
    tag="$VERSION"
  else
    if command -v curl >/dev/null 2>&1; then
      tag="$(curl -fsSL "https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/tags" 2>/dev/null \
        | grep -m1 '"name"' \
        | sed -E 's/.*"name":[[:space:]]*"([^"]+)".*/\1/' || true)"
    fi
    if [[ -z "$tag" ]]; then
      branch="master"
      log "Could not resolve a release tag; falling back to master (build from source)"
    else
      log "Resolved latest release: ${tag}"
    fi
  fi

  local scratch
  scratch="$(mktemp -d)"
  # Caller owns cleanup via stage_dir trap; stash scratch under stage parent.
  PAYLOAD_SCRATCH="$scratch"

  if [[ -n "$tag" ]]; then
    local asset_url="https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/download/${tag}/harness-dist.tar.gz"
    log "Trying release asset ${asset_url}..."
    if download "$asset_url" "${scratch}/harness-dist.tar.gz" 2>/dev/null; then
      mkdir -p "${scratch}/payload"
      tar -xzf "${scratch}/harness-dist.tar.gz" -C "${scratch}/payload" || die "failed to extract harness-dist.tar.gz"
      # tarball may contain dist/ + manifest.txt at root or nested
      if [[ -f "${scratch}/payload/manifest.txt" && -d "${scratch}/payload/dist" ]]; then
        PAYLOAD_DIR="${scratch}/payload"
      else
        local found
        found="$(find "${scratch}/payload" -name manifest.txt -print -quit)"
        [[ -n "$found" ]] || die "harness-dist.tar.gz missing manifest.txt"
        PAYLOAD_DIR="$(dirname "$found")"
      fi
      [[ -d "${PAYLOAD_DIR}/dist" ]] || die "harness-dist.tar.gz missing dist/"
      log "Using prebuilt release payload"
      return 0
    fi
    log "No release asset (or download failed); building from source tag ${tag}"
  fi

  local ref_path tarball_url
  if [[ -n "$tag" ]]; then
    ref_path="$tag"
  else
    ref_path="$branch"
  fi
  tarball_url="https://codeload.github.com/${REPO_OWNER}/${REPO_NAME}/tar.gz/${ref_path}"
  log "Downloading source ${tarball_url}..."
  download "$tarball_url" "${scratch}/src.tar.gz" || die "failed to download source tarball"
  mkdir -p "${scratch}/src"
  tar -xzf "${scratch}/src.tar.gz" -C "${scratch}/src" --strip-components=1 || die "failed to extract source tarball"
  build_payload "${scratch}/src"
  PAYLOAD_DIR="${scratch}/src"
}

# Install files whose manifest paths start with $prefix/ into $dest_root,
# rewriting path to strip the prefix. Tracks .harness-manifest under dest_root.
install_tree() {
  local prefix="$1" dest_root="$2" stage_dir="$3" new_manifest="$4"
  local old_manifest="${dest_root}/.harness-manifest"
  local backup_stamp backup_dir backup_used=false
  backup_stamp="$(date +%Y%m%d%H%M%S)"
  backup_dir="${dest_root}/.backup-${backup_stamp}"

  local installed=0 updated=0 backed_up=0 pruned=0 skipped=0
  local rel_path dest have_hash prev_hash want_hash dest_rel

  while IFS= read -r rel_path; do
    [[ -z "$rel_path" ]] && continue
    case "$rel_path" in
      "${prefix}"/*) ;;
      *) continue ;;
    esac
    dest_rel="${rel_path#"${prefix}"/}"
    dest="${dest_root}/${dest_rel}"
    want_hash="$(manifest_hash "$new_manifest" "$rel_path")"

    if [[ ! -f "$dest" ]]; then
      $DRY_RUN || { mkdir -p "$(dirname "$dest")"; cp "${stage_dir}/${rel_path}" "$dest"; }
      log "  + install  ${prefix}/${dest_rel}"
      installed=$((installed + 1))
      continue
    fi

    have_hash="$(sha256_of "$dest")"
    if [[ "$have_hash" == "$want_hash" ]]; then
      skipped=$((skipped + 1))
      continue
    fi

    prev_hash="$(manifest_hash "$old_manifest" "$dest_rel" || true)"
    if [[ -n "$prev_hash" && "$have_hash" != "$prev_hash" ]]; then
      $DRY_RUN || { mkdir -p "$(dirname "${backup_dir}/${dest_rel}")"; cp "$dest" "${backup_dir}/${dest_rel}"; }
      backup_used=true
      backed_up=$((backed_up + 1))
      log "  ~ modified ${prefix}/${dest_rel} (locally changed — backed up, then updated)"
    else
      log "  ~ update   ${prefix}/${dest_rel}"
      updated=$((updated + 1))
    fi
    $DRY_RUN || { mkdir -p "$(dirname "$dest")"; cp "${stage_dir}/${rel_path}" "$dest"; }
  done < <(manifest_paths_of "$new_manifest")

  # Prune using old manifest (paths relative to dest_root)
  while IFS= read -r dest_rel; do
    [[ -z "$dest_rel" ]] && continue
    # Skip if still present under new prefix
    if manifest_hash "$new_manifest" "${prefix}/${dest_rel}" >/dev/null 2>&1; then
      continue
    fi
    dest="${dest_root}/${dest_rel}"
    [[ -f "$dest" ]] || continue
    [[ "$dest_rel" == ".harness-manifest" ]] && continue

    have_hash="$(sha256_of "$dest")"
    prev_hash="$(manifest_hash "$old_manifest" "$dest_rel" || true)"
    if [[ -n "$prev_hash" && "$have_hash" != "$prev_hash" ]]; then
      $DRY_RUN || { mkdir -p "$(dirname "${backup_dir}/${dest_rel}")"; cp "$dest" "${backup_dir}/${dest_rel}"; }
      backup_used=true
      log "  ~ prune    ${prefix}/${dest_rel} (locally changed — backed up, then removed)"
    else
      log "  - prune    ${prefix}/${dest_rel}"
    fi
    $DRY_RUN || rm -f "$dest"
    pruned=$((pruned + 1))
  done < <(manifest_paths_of "$old_manifest")

  if ! $DRY_RUN; then
    mkdir -p "$dest_root"
    # Write dest-relative manifest for next run (avoid piping `while read` —
    # EOF status 1 trips `set -o pipefail`).
    local filtered unsorted
    filtered="$(mktemp)"
    unsorted="$(mktemp)"
    while IFS= read -r rel_path; do
      case "$rel_path" in
        "${prefix}"/*)
          dest_rel="${rel_path#"${prefix}"/}"
          want_hash="$(manifest_hash "$new_manifest" "$rel_path")"
          printf '%s  %s\n' "$want_hash" "$dest_rel"
          ;;
      esac
    done < <(manifest_paths_of "$new_manifest") > "$unsorted"
    sort -k2 "$unsorted" > "$filtered"
    rm -f "$unsorted"
    mv "$filtered" "$old_manifest"
  fi

  log "  ${prefix}: installed ${installed}, updated ${updated}, backed up ${backed_up}, pruned ${pruned}, unchanged ${skipped}."
  if $backup_used; then
    log "  Locally modified files preserved under ${dest_root#"$TARGET_DIR"/}/.backup-*/"
  fi
}

install_bin() {
  local stage_dir="$1" new_manifest="$2"
  local src="${stage_dir}/bin/sdd-state"
  local dest="${TARGET_DIR}/bin/sdd-state"
  local want_hash
  want_hash="$(manifest_hash "$new_manifest" "bin/sdd-state")" || die "manifest missing bin/sdd-state"

  if [[ -f "$dest" ]] && [[ "$(sha256_of "$dest")" == "$want_hash" ]]; then
    log "  bin/sdd-state unchanged"
    return 0
  fi

  if [[ -f "$dest" ]]; then
    log "  ~ update   bin/sdd-state"
  else
    log "  + install  bin/sdd-state"
  fi
  if ! $DRY_RUN; then
    mkdir -p "${TARGET_DIR}/bin"
    cp "$src" "$dest"
    chmod +x "$dest"
  fi
}

main() {
  if $DOCTOR_ONLY; then
    doctor
    return 0
  fi

  [[ -d "$TARGET_DIR" ]] || die "target directory does not exist: $TARGET_DIR"
  resolve_interactive

  if [[ -n "$LOCAL_SOURCE" ]]; then
    [[ -d "$LOCAL_SOURCE" ]] || die "LOCAL_SOURCE does not exist: $LOCAL_SOURCE"
    log "Installing from local source: ${LOCAL_SOURCE}"
  else
    log "Installing ${REPO_NAME} into ${TARGET_DIR} (target=${INSTALL_TARGET})..."
  fi

  local PAYLOAD_DIR="" PAYLOAD_SCRATCH=""
  local stage_dir
  stage_dir="$(mktemp -d)"
  trap '[[ -n "${stage_dir:-}" ]] && rm -rf "$stage_dir"; [[ -n "${PAYLOAD_SCRATCH:-}" ]] && rm -rf "$PAYLOAD_SCRATCH"' EXIT

  prepare_payload_dir
  [[ -n "$PAYLOAD_DIR" && -f "${PAYLOAD_DIR}/manifest.txt" ]] || die "payload prepare failed"

  # Stage: copy manifest + every listed dist file; verify checksums.
  cp "${PAYLOAD_DIR}/manifest.txt" "${stage_dir}/manifest.txt"
  [[ -s "${stage_dir}/manifest.txt" ]] || die "manifest.txt is empty"

  local file_count=0 rel_path expected_hash actual_hash
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    expected_hash="${line%%  *}"
    rel_path="${line#*  }"

    mkdir -p "${stage_dir}/$(dirname "$rel_path")"
    [[ -f "${PAYLOAD_DIR}/dist/${rel_path}" ]] || die "missing ${PAYLOAD_DIR}/dist/${rel_path}"
    cp "${PAYLOAD_DIR}/dist/${rel_path}" "${stage_dir}/${rel_path}"

    actual_hash="$(sha256_of "${stage_dir}/${rel_path}")"
    [[ "$actual_hash" == "$expected_hash" ]] \
      || die "checksum mismatch for ${rel_path} — aborting, nothing installed"

    file_count=$((file_count + 1))
  done < "${stage_dir}/manifest.txt"

  log "Verified ${file_count} files against manifest.txt"

  local new_manifest="${stage_dir}/manifest.txt"

  case "$INSTALL_TARGET" in
    all)
      install_tree "opencode" "${TARGET_DIR}/.opencode" "$stage_dir" "$new_manifest"
      install_tree "cursor" "${TARGET_DIR}/.cursor" "$stage_dir" "$new_manifest"
      ;;
    opencode)
      install_tree "opencode" "${TARGET_DIR}/.opencode" "$stage_dir" "$new_manifest"
      ;;
    cursor)
      install_tree "cursor" "${TARGET_DIR}/.cursor" "$stage_dir" "$new_manifest"
      ;;
    *) die "invalid INSTALL_TARGET: $INSTALL_TARGET" ;;
  esac

  install_bin "$stage_dir" "$new_manifest"

  if $DRY_RUN; then
    log ""
    log "Dry run complete (target=${INSTALL_TARGET})."
    return 0
  fi

  log ""
  log "Done. Add ./bin to PATH (or invoke ./bin/sdd-state) so the conductor can checkpoint state."
  log ""
  suggest_next_steps
  doctor
}

main
