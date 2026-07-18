#!/usr/bin/env bash
set -euo pipefail

# Tier 1 e2e test for install.sh: exercises the full idempotent install
# lifecycle (fresh install, no-op reinstall, local-modification backup,
# upstream prune, --doctor) against a scratch git repo, using LOCAL_SOURCE
# so it needs no network access. Safe to run in CI. Parametrized over both
# harnesses (opencode, cursor) — every check below runs once per harness.

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

pass=0
fail=0

ok() {
  pass=$((pass + 1))
  printf 'ok   - [%s] %s\n' "$HARNESS" "$1"
}

bad() {
  fail=$((fail + 1))
  printf 'FAIL - [%s] %s\n' "$HARNESS" "$1"
}

assert_file_exists() {
  if [[ -f "$1" ]]; then ok "$2"; else bad "$2 (missing: $1)"; fi
}

assert_file_absent() {
  if [[ ! -f "$1" ]]; then ok "$2"; else bad "$2 (still present: $1)"; fi
}

assert_eq() {
  if [[ "$1" == "$2" ]]; then ok "$3"; else bad "$3 (expected [$2], got [$1])"; fi
}

# Regenerate manifest.txt for an arbitrary install tree (used after mutating the
# fixture), via gen-manifest.sh's own --dir= mode rather than reimplementing it.
regen_manifest() {
  local tree="$1"
  bash "${REPO_ROOT}/scripts/gen-manifest.sh" "--dir=${tree}" >/dev/null
}

# Harness-specific "ships the bundled runtime, not raw TS sources, and
# registers the checkpoint MCP server" assertions.
assert_bundled_artifacts() {
  local target="$1"
  case "$HARNESS" in
    opencode)
      assert_file_exists "${target}/.opencode/plugins/sdd-guard.js" "ships bundled plugin sdd-guard.js"
      assert_file_exists "${target}/.opencode/mcp/server.js" "ships bundled checkpoint MCP server"
      assert_file_absent "${target}/.opencode/plugins/sdd-guard.ts" "does not ship raw plugin TypeScript"
      if grep -q 'sdd-checkpoint' "${target}/.opencode/opencode.jsonc"; then
        ok "opencode.jsonc registers the checkpoint MCP server"
      else
        bad "opencode.jsonc should register the sdd-checkpoint MCP server"
      fi
      ;;
    cursor)
      assert_file_exists "${target}/.cursor/hooks/pre-tool-use.js" "ships bundled pre-tool-use hook"
      assert_file_exists "${target}/.cursor/hooks/before-shell-execution.js" "ships bundled before-shell-execution hook"
      assert_file_exists "${target}/.cursor/mcp/server.js" "ships bundled checkpoint MCP server"
      assert_file_absent "${target}/.cursor/hooks/pre-tool-use.ts" "does not ship raw hook TypeScript"
      if grep -q 'sdd-checkpoint' "${target}/.cursor/mcp.json"; then
        ok "mcp.json registers the checkpoint MCP server"
      else
        bad "mcp.json should register the sdd-checkpoint MCP server"
      fi
      if grep -q 'preToolUse' "${target}/.cursor/hooks.json"; then
        ok "hooks.json registers preToolUse"
      else
        bad "hooks.json should register preToolUse"
      fi
      ;;
  esac
}

run_harness_tests() {
  HARNESS="$1"
  local WORK
  WORK="$(mktemp -d)"
  trap 'rm -rf "$WORK"' RETURN

  # -------------------------------------------------------------------------
  # Fixture: build the harness's install tree, then use a mutable copy of it
  # as the LOCAL_SOURCE upstream (so pruning/updating tests can mutate it
  # freely without touching the real build/<harness>/ output).
  # -------------------------------------------------------------------------

  (cd "$REPO_ROOT" && bun run "build:${HARNESS}" >/dev/null 2>&1) || { echo "build:${HARNESS} failed" >&2; exit 1; }

  local UPSTREAM="${WORK}/upstream"
  cp -R "${REPO_ROOT}/build/${HARNESS}" "$UPSTREAM"

  local TARGET="${WORK}/consumer-repo"
  mkdir -p "$TARGET"
  (cd "$TARGET" && git init -q && git config user.email test@example.com && git config user.name test)
  echo "# consumer" > "${TARGET}/AGENTS.md"

  local harness_dir="${TARGET}/.${HARNESS}"

  # ---------------------------------------------------------------------------
  # 1. dry-run then real fresh install; tree matches manifest.txt exactly
  # ---------------------------------------------------------------------------

  LOCAL_SOURCE="$UPSTREAM" TARGET_DIR="$TARGET" HARNESS="$HARNESS" bash "${REPO_ROOT}/install.sh" --dry-run >/dev/null
  LOCAL_SOURCE="$UPSTREAM" TARGET_DIR="$TARGET" HARNESS="$HARNESS" bash "${REPO_ROOT}/install.sh" >/dev/null

  local installed_files manifest_files
  installed_files="$(cd "$harness_dir" && find . -type f ! -name '.harness-manifest' | sed 's#^\./##' | sort)"
  manifest_files="$(awk '{ n=split($0,a,/  /); if (n>=2) print a[2] }' "${UPSTREAM}/manifest.txt" | sort)"
  assert_eq "$installed_files" "$manifest_files" "fresh install tree matches manifest.txt"

  assert_file_exists "${harness_dir}/.harness-manifest" "records .harness-manifest after install"
  assert_bundled_artifacts "$TARGET"

  # ---------------------------------------------------------------------------
  # 2. re-run with no upstream changes: dry-run reports nothing to do
  # ---------------------------------------------------------------------------

  local reinstall_output
  reinstall_output="$(LOCAL_SOURCE="$UPSTREAM" TARGET_DIR="$TARGET" HARNESS="$HARNESS" bash "${REPO_ROOT}/install.sh" --dry-run 2>&1)"
  if grep -q "0 to install, 0 to update, 0 locally-modified.*0 to prune" <<<"$reinstall_output"; then
    ok "no-op reinstall reports nothing to do"
  else
    bad "no-op reinstall should report nothing to do: $reinstall_output"
  fi

  # ---------------------------------------------------------------------------
  # 3. modify a file locally, reinstall: backed up, then replaced with upstream
  # ---------------------------------------------------------------------------

  local before_hash after_hash
  before_hash="$(shasum -a 256 "${harness_dir}/agents/sdd.md" | awk '{print $1}')"
  echo "LOCAL EDIT" >> "${harness_dir}/agents/sdd.md"

  local modify_output
  modify_output="$(LOCAL_SOURCE="$UPSTREAM" TARGET_DIR="$TARGET" HARNESS="$HARNESS" bash "${REPO_ROOT}/install.sh" 2>&1)"
  if grep -q "modified agents/sdd.md" <<<"$modify_output"; then
    ok "reports locally-modified file"
  else
    bad "should report locally-modified file: $modify_output"
  fi

  local backup_copy
  backup_copy="$(find "$harness_dir" -path '*/.backup-*/agents/sdd.md' | head -1)"
  if [[ -n "$backup_copy" ]]; then ok "locally-modified file was backed up"; else bad "expected a backup copy of agents/sdd.md"; fi

  after_hash="$(shasum -a 256 "${harness_dir}/agents/sdd.md" | awk '{print $1}')"
  assert_eq "$after_hash" "$before_hash" "locally-modified file was restored to upstream content"

  # ---------------------------------------------------------------------------
  # 4. remove a file upstream, reinstall: pruned locally
  # ---------------------------------------------------------------------------

  rm "${UPSTREAM}/agents/qa.md"
  regen_manifest "$UPSTREAM"

  local prune_output
  prune_output="$(LOCAL_SOURCE="$UPSTREAM" TARGET_DIR="$TARGET" HARNESS="$HARNESS" bash "${REPO_ROOT}/install.sh" 2>&1)"
  if grep -q "prune    agents/qa.md" <<<"$prune_output"; then
    ok "reports prune of agents/qa.md"
  else
    bad "should report prune: $prune_output"
  fi
  assert_file_absent "${harness_dir}/agents/qa.md" "agents/qa.md removed after upstream deletion"

  # ---------------------------------------------------------------------------
  # 5. --doctor never fails, even against a non-git, incomplete target
  # ---------------------------------------------------------------------------

  local BARE="${WORK}/no-git-no-agents"
  mkdir -p "$BARE"
  if TARGET_DIR="$BARE" HARNESS="$HARNESS" bash "${REPO_ROOT}/install.sh" --doctor >/dev/null 2>&1; then
    ok "--doctor exits 0 even with warnings (not a git repo, no AGENTS.md)"
  else
    bad "--doctor should never fail"
  fi

  # ---------------------------------------------------------------------------
  # 6. checksum mismatch aborts atomically (nothing partially installed)
  # ---------------------------------------------------------------------------

  local TAMPERED="${WORK}/tampered-upstream"
  cp -R "$UPSTREAM" "$TAMPERED"
  echo "TAMPERED" >> "${TAMPERED}/agents/spec.md"
  # manifest.txt in $TAMPERED is now stale relative to agents/spec.md's content on purpose.

  before_hash="$(shasum -a 256 "${harness_dir}/agents/spec.md" | awk '{print $1}')"
  local rc=0
  set +e
  LOCAL_SOURCE="$TAMPERED" TARGET_DIR="$TARGET" HARNESS="$HARNESS" bash "${REPO_ROOT}/install.sh" >/dev/null 2>&1
  rc=$?
  set -e
  if [[ $rc -ne 0 ]]; then
    ok "checksum mismatch causes install.sh to exit non-zero"
  else
    bad "checksum mismatch should abort with non-zero exit"
  fi
  after_hash="$(shasum -a 256 "${harness_dir}/agents/spec.md" | awk '{print $1}')"
  assert_eq "$after_hash" "$before_hash" "no partial write occurred after checksum mismatch"

  # ---------------------------------------------------------------------------
  # 7. doctor runs and reports environment checks
  # ---------------------------------------------------------------------------

  local doctor_output
  doctor_output="$(TARGET_DIR="$TARGET" HARNESS="$HARNESS" bash "${REPO_ROOT}/install.sh" --doctor 2>&1)"
  if grep -q "Doctor (harness: ${HARNESS})" <<<"$doctor_output"; then
    ok "doctor runs and prints its report"
  else
    bad "doctor should print a report: $doctor_output"
  fi
  if grep -q 'git repository' <<<"$doctor_output"; then
    ok "doctor reports git repository status"
  else
    bad "doctor should report git repository status: $doctor_output"
  fi

  # ---------------------------------------------------------------------------
  # 8. HARNESS auto-detect: an existing .<harness>/ picks itself without HARNESS set
  # ---------------------------------------------------------------------------

  local detect_output
  detect_output="$(TARGET_DIR="$TARGET" bash "${REPO_ROOT}/install.sh" --doctor 2>&1)"
  if grep -q "harness: ${HARNESS}" <<<"$detect_output"; then
    ok "auto-detects harness from the existing .${HARNESS}/ without HARNESS set"
  else
    bad "should auto-detect harness ${HARNESS}: $detect_output"
  fi
}

for h in opencode cursor; do
  run_harness_tests "$h"
done

echo ""
echo "${pass} passed, ${fail} failed"
[[ $fail -eq 0 ]]
