#!/usr/bin/env bash
set -euo pipefail

# Install the SDD harness into a repository (project) or $HOME (global).
# Skills + sddkit-state land under .agents/; host specialists under isolated leaves.
#
# Interactive (TTY): Clack TUI when bun + tools/install-tui.ts are available; else bash menus.
# Non-interactive / CI: defaults (scope=project, target=all); env overrides:
#   TARGET_DIR, VERSION, BRANCH, LOCAL_SOURCE, INSTALL_SCOPE, INSTALL_TARGET
#
# Flags: --dry-run, --doctor

REPO_OWNER="${REPO_OWNER:-luisintosh}"
REPO_NAME="${REPO_NAME:-sddkit}"
TARGET_DIR="${TARGET_DIR:-$PWD}"
VERSION="${VERSION:-}"
BRANCH="${BRANCH:-}"
LOCAL_SOURCE="${LOCAL_SOURCE:-}"
INSTALL_SCOPE="${INSTALL_SCOPE:-}"
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

HOSTS="cursor claude codex opencode"

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

toolkit_root() {
  local src="${BASH_SOURCE[0]:-}"
  if [[ -n "$src" && -f "$src" ]]; then
    (cd "$(dirname "$src")" && pwd)
  fi
}

normalize_targets() {
  INSTALL_TARGET="${INSTALL_TARGET// /}"
  [[ -n "$INSTALL_TARGET" ]] || die "INSTALL_TARGET is empty"
  if [[ "$INSTALL_TARGET" == "all" ]]; then
    return 0
  fi
  local part parts
  IFS=',' read -r -a parts <<< "$INSTALL_TARGET"
  for part in "${parts[@]}"; do
    case "$part" in
      cursor|claude|codex|opencode) ;;
      *) die "invalid INSTALL_TARGET host: ${part} (use all or comma list: cursor,claude,codex,opencode)" ;;
    esac
  done
}

wants_host() {
  local host="$1"
  [[ "$INSTALL_TARGET" == "all" ]] && return 0
  [[ ",${INSTALL_TARGET}," == *",${host},"* ]]
}

try_tui() {
  [[ -t 0 ]] || return 1
  [[ -z "$INSTALL_TARGET" && -z "$INSTALL_SCOPE" ]] || return 1
  command -v bun >/dev/null 2>&1 || return 1
  local root
  root="$(toolkit_root)" || return 1
  [[ -n "$root" && -f "${root}/tools/install-tui.ts" ]] || return 1
  [[ -d "${root}/node_modules/@clack/prompts" ]] || return 1

  local envf
  envf="$(mktemp)"
  if ! bun "${root}/tools/install-tui.ts" --write-env "$envf"; then
    rm -f "$envf"
    die "aborted"
  fi
  local line key
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    key="${line%%=*}"
    case "$key" in
      INSTALL_SCOPE|INSTALL_TARGET|VERSION|BRANCH|LOCAL_SOURCE)
        eval "$line"
        ;;
    esac
  done < "$envf"
  rm -f "$envf"
  return 0
}

resolve_interactive() {
  if try_tui; then
    normalize_targets
    case "$INSTALL_SCOPE" in
      project|global) ;;
      *) die "invalid INSTALL_SCOPE: ${INSTALL_SCOPE} (use project or global)" ;;
    esac
    return 0
  fi

  if [[ -z "$INSTALL_SCOPE" ]]; then
    if [[ -t 0 ]]; then
      INSTALL_SCOPE="$(prompt_default "Install scope (project / global)" "project")"
    else
      INSTALL_SCOPE="project"
    fi
  fi
  case "$INSTALL_SCOPE" in
    project|global) ;;
    *) die "invalid INSTALL_SCOPE: ${INSTALL_SCOPE} (use project or global)" ;;
  esac

  if [[ -z "$INSTALL_TARGET" ]]; then
    if [[ -t 0 ]]; then
      log "SDD harness installer"
      log ""
      INSTALL_TARGET="$(prompt_default "Hosts (all or comma list: cursor,claude,codex,opencode)" "all")"
    else
      INSTALL_TARGET="all"
    fi
  fi
  normalize_targets

  if [[ -t 0 && -z "$LOCAL_SOURCE" && -z "$BRANCH" && -z "$VERSION" ]]; then
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

  if [[ -t 0 ]]; then
    local dest_hint confirm
    if [[ "$INSTALL_SCOPE" == "global" ]]; then
      dest_hint="${HOME}"
    else
      dest_hint="${TARGET_DIR}"
    fi
    confirm="$(prompt_default "Install ${INSTALL_TARGET} into ${dest_hint}? (y/N)" "y")"
    case "$confirm" in
      y|Y|yes|YES|Yes) ;;
      *) die "aborted" ;;
    esac
  fi
}

host_on_path() {
  local host="$1"
  case "$host" in
    cursor) command -v cursor >/dev/null 2>&1 || command -v cursor-agent >/dev/null 2>&1 ;;
    claude) command -v claude >/dev/null 2>&1 ;;
    codex) command -v codex >/dev/null 2>&1 ;;
    opencode) command -v opencode >/dev/null 2>&1 ;;
    *) return 1 ;;
  esac
}

state_bin_in_use() {
  if [[ -x "${TARGET_DIR}/.agents/bin/sddkit-state" || -f "${TARGET_DIR}/.agents/bin/sddkit-state" ]]; then
    printf '%s' "${TARGET_DIR}/.agents/bin/sddkit-state"
  elif [[ -x "${HOME}/.agents/bin/sddkit-state" || -f "${HOME}/.agents/bin/sddkit-state" ]]; then
    printf '%s' "${HOME}/.agents/bin/sddkit-state"
  fi
}

doctor() {
  log ""
  log "Doctor:"

  local host
  for host in $HOSTS; do
    if host_on_path "$host"; then
      log "  [ok]   ${host} CLI is on PATH"
    else
      log "  [warn] ${host} CLI not detected (install still allowed)"
    fi
  done

  if git -C "$TARGET_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    log "  [ok]   ${TARGET_DIR} is a git repository"
  else
    log "  [warn] ${TARGET_DIR} is not a git repository"
  fi

  if [[ -f "${TARGET_DIR}/AGENTS.md" ]]; then
    log "  [ok]   AGENTS.md present"
  else
    log "  [warn] AGENTS.md missing — run /setup-docs first"
  fi

  log "  paths:"
  log "    skills          ${TARGET_DIR}/.agents/skills/  or  ${HOME}/.agents/skills/"
  log "    sddkit-state    ${TARGET_DIR}/.agents/bin/  or  ${HOME}/.agents/bin/"
  log "    cursor agents   ${TARGET_DIR}/.cursor/agents/  or  ${HOME}/.cursor/agents/"
  log "    claude agents   ${TARGET_DIR}/.claude/agents/  or  ${HOME}/.claude/agents/"
  log "    claude skills   ${TARGET_DIR}/.claude/skills/  or  ${HOME}/.claude/skills/"
  log "    codex agents    ${TARGET_DIR}/.codex/agents/  or  \${CODEX_HOME:-$HOME/.codex}/agents/"
  log "    opencode        ${TARGET_DIR}/.opencode/  or  ${HOME}/.config/opencode/agents/ (no jsonc)"

  local state_bin
  state_bin="$(state_bin_in_use)"
  if [[ -n "$state_bin" ]]; then
    log "  [ok]   sddkit-state: ${state_bin}"
  else
    log "  [warn] sddkit-state missing — re-run the installer"
  fi

  if command -v bun >/dev/null 2>&1; then
    log "  [ok]   bun is on PATH (needed to run the portable sddkit-state script)"
  else
    log "  [warn] bun not found — install from https://bun.sh to run sddkit-state"
  fi

  if command -v gh >/dev/null 2>&1; then
    if gh auth status >/dev/null 2>&1; then
      log "  [ok]   gh installed and authenticated"
    else
      log "  [warn] gh installed but not logged in — run 'gh auth login'"
    fi
  else
    log "  [warn] gh not found — required by the pipeline: brew install gh && gh auth login"
  fi

  log ""
}

suggest_next_steps() {
  log "Next steps:"
  log "  1. /setup-docs       — scaffold AGENTS.md + docs/ARCHITECTURE.md + CONSTITUTION"
  if ! command -v gh >/dev/null 2>&1; then
    log "  2. Install gh (required by the pipeline):"
    log "       brew install gh && gh auth login"
    log "       # or: https://cli.github.com/"
  else
    log "  2. gh is on PATH — run 'gh auth login' if you aren't logged in"
  fi
  log ""
  log "Optional: sddkit-plan — Product Owner planner (/sddkit-plan skill, or the"
  log "  OpenCode sddkit-plan agent) turns a raw idea into a feature roadmap at"
  log "  docs/product/<slug>/roadmap.md. Run each feature through sddkit one at a"
  log "  time — it hands you the next feature's invocation when one is done."
  log ""
  log "Optional: rtk (filters noisy bash output for agents)"
  log "  brew install rtk   # or see https://github.com/rtk-ai/rtk"
  log "  rtk init --opencode   # OpenCode"
  log "  # Quick start: exclude git diff/show from rewriting so code-reviewer"
  log "  # and docs-writer see full diffs — in ~/.config/rtk/config.toml:"
  log "  #   [hooks]"
  log "  #   exclude_commands = [\"git diff\", \"git show\"]"
  log ""
}

require_payload() {
  local src="$1"
  [[ -f "${src}/manifest.txt" && -d "${src}/dist" && -f "${src}/dist/bin/sddkit-state" ]] \
    || die "${src} is missing dist/ + manifest.txt — clients copy a committed payload (run bun run build in the toolkit checkout)"
}

# Ensure LOCAL_SOURCE has dist/; for remote, download release tarball or a source tree that already contains dist/.
prepare_payload_dir() {
  # Sets global PAYLOAD_DIR to a directory containing manifest.txt and dist/
  if [[ -n "$LOCAL_SOURCE" ]]; then
    require_payload "$LOCAL_SOURCE"
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
      log "Could not resolve a release tag; falling back to master"
    else
      log "Resolved latest release: ${tag}"
    fi
  fi

  local scratch
  scratch="$(mktemp -d)"
  PAYLOAD_SCRATCH="$scratch"

  if [[ -n "$tag" ]]; then
    local asset_url="https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/download/${tag}/sddkit-dist.tar.gz"
    log "Trying release asset ${asset_url}..."
    if download "$asset_url" "${scratch}/sddkit-dist.tar.gz" 2>/dev/null; then
      mkdir -p "${scratch}/payload"
      tar -xzf "${scratch}/sddkit-dist.tar.gz" -C "${scratch}/payload" || die "failed to extract sddkit-dist.tar.gz"
      if [[ -f "${scratch}/payload/manifest.txt" && -d "${scratch}/payload/dist" ]]; then
        PAYLOAD_DIR="${scratch}/payload"
      else
        local found
        found="$(find "${scratch}/payload" -name manifest.txt -print -quit)"
        [[ -n "$found" ]] || die "sddkit-dist.tar.gz missing manifest.txt"
        PAYLOAD_DIR="$(dirname "$found")"
      fi
      [[ -d "${PAYLOAD_DIR}/dist" ]] || die "sddkit-dist.tar.gz missing dist/"
      log "Using prebuilt release payload"
      return 0
    fi
    log "No release asset (or download failed); using source tag ${tag}"
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
  require_payload "${scratch}/src"
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

  while IFS= read -r dest_rel; do
    [[ -z "$dest_rel" ]] && continue
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
    log "  Locally modified files preserved under ${dest_root}/.backup-*/"
  fi
}

install_bin() {
  local stage_dir="$1" new_manifest="$2"
  local src="${stage_dir}/bin/sddkit-state"
  local dest
  if [[ "$INSTALL_SCOPE" == "global" ]]; then
    dest="${HOME}/.agents/bin/sddkit-state"
  else
    dest="${TARGET_DIR}/.agents/bin/sddkit-state"
  fi
  local want_hash
  want_hash="$(manifest_hash "$new_manifest" "bin/sddkit-state")" || die "manifest missing bin/sddkit-state"

  if [[ -f "$dest" ]] && [[ "$(sha256_of "$dest")" == "$want_hash" ]]; then
    log "  .agents/bin/sddkit-state unchanged"
  else
    if [[ -f "$dest" ]]; then
      log "  ~ update   .agents/bin/sddkit-state"
    else
      log "  + install  .agents/bin/sddkit-state"
    fi
    if ! $DRY_RUN; then
      mkdir -p "$(dirname "$dest")"
      cp "$src" "$dest"
      chmod +x "$dest"
    fi
  fi

  if [[ "$INSTALL_SCOPE" == "project" ]]; then
    prune_legacy_bin
  fi
}

prune_legacy_bin() {
  local leftover
  for leftover in "${TARGET_DIR}/bin/sddkit-state" "${TARGET_DIR}/bin/sdd-state"; do
    if [[ -e "$leftover" ]]; then
      $DRY_RUN || rm -f "$leftover"
      log "  - prune    ${leftover#"$TARGET_DIR"/} (moved to .agents/bin/sddkit-state)"
    fi
  done
}

prune_legacy_cursor_skills() {
  local dest
  if [[ "$INSTALL_SCOPE" == "global" ]]; then
    dest="${HOME}/.cursor/skills"
  else
    dest="${TARGET_DIR}/.cursor/skills"
  fi
  [[ -d "$dest" ]] || return 0
  local name
  for name in sddkit sddkit-plan setup-docs; do
    if [[ -e "${dest}/${name}" ]]; then
      $DRY_RUN || rm -rf "${dest:?}/${name}"
      log "  - prune    .cursor/skills/${name} (moved to .agents/skills/)"
    fi
  done
}

resolve_dests() {
  if [[ "$INSTALL_SCOPE" == "global" ]]; then
    AGENTS_ROOT="${HOME}/.agents"
    CURSOR_AGENTS="${HOME}/.cursor/agents"
    CLAUDE_AGENTS="${HOME}/.claude/agents"
    CLAUDE_SKILLS="${HOME}/.claude/skills"
    CODEX_AGENTS="${CODEX_HOME:-$HOME/.codex}/agents"
    OPENCODE_DEST="${HOME}/.config/opencode/agents"
    OPENCODE_PREFIX="opencode/agents"
  else
    AGENTS_ROOT="${TARGET_DIR}/.agents"
    CURSOR_AGENTS="${TARGET_DIR}/.cursor/agents"
    CLAUDE_AGENTS="${TARGET_DIR}/.claude/agents"
    CLAUDE_SKILLS="${TARGET_DIR}/.claude/skills"
    CODEX_AGENTS="${TARGET_DIR}/.codex/agents"
    OPENCODE_DEST="${TARGET_DIR}/.opencode"
    OPENCODE_PREFIX="opencode"
  fi
}

install_selected() {
  local stage_dir="$1" new_manifest="$2"
  resolve_dests

  install_tree "agents" "$AGENTS_ROOT" "$stage_dir" "$new_manifest"

  if wants_host cursor; then
    install_tree "cursor/agents" "$CURSOR_AGENTS" "$stage_dir" "$new_manifest"
  fi
  if wants_host claude; then
    install_tree "claude/agents" "$CLAUDE_AGENTS" "$stage_dir" "$new_manifest"
    install_tree "agents/skills" "$CLAUDE_SKILLS" "$stage_dir" "$new_manifest"
  fi
  if wants_host codex; then
    install_tree "codex/agents" "$CODEX_AGENTS" "$stage_dir" "$new_manifest"
  fi
  if wants_host opencode; then
    install_tree "$OPENCODE_PREFIX" "$OPENCODE_DEST" "$stage_dir" "$new_manifest"
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
    log "Installing from local source: ${LOCAL_SOURCE} (scope=${INSTALL_SCOPE} target=${INSTALL_TARGET})"
  else
    log "Installing ${REPO_NAME} (scope=${INSTALL_SCOPE} target=${INSTALL_TARGET})..."
  fi

  local PAYLOAD_DIR="" PAYLOAD_SCRATCH=""
  local stage_dir
  stage_dir="$(mktemp -d)"
  trap '[[ -n "${stage_dir:-}" ]] && rm -rf "$stage_dir"; [[ -n "${PAYLOAD_SCRATCH:-}" ]] && rm -rf "$PAYLOAD_SCRATCH"' EXIT

  prepare_payload_dir
  [[ -n "$PAYLOAD_DIR" && -f "${PAYLOAD_DIR}/manifest.txt" ]] || die "payload prepare failed"

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
  install_selected "$stage_dir" "$new_manifest"
  install_bin "$stage_dir" "$new_manifest"
  prune_legacy_cursor_skills

  if $DRY_RUN; then
    log ""
    log "Dry run complete (scope=${INSTALL_SCOPE} target=${INSTALL_TARGET})."
    return 0
  fi

  log ""
  log "Done. Invoke .agents/bin/sddkit-state (or \$HOME/.agents/bin/sddkit-state) so the conductor can checkpoint state."
  log ""
  suggest_next_steps
  doctor
}

main
