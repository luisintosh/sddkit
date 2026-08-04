#!/usr/bin/env bash
set -euo pipefail

# Tier 1 e2e for install.sh — LOCAL_SOURCE, no network.

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

pass=0
fail=0

ok() { pass=$((pass + 1)); printf 'ok   - %s\n' "$1"; }
bad() { fail=$((fail + 1)); printf 'FAIL - %s\n' "$1"; }

assert_file_exists() {
  if [[ -f "$1" ]]; then ok "$2"; else bad "$2 (missing: $1)"; fi
}

assert_file_absent() {
  if [[ ! -f "$1" ]]; then ok "$2"; else bad "$2 (still present: $1)"; fi
}

assert_eq() {
  if [[ "$1" == "$2" ]]; then ok "$3"; else bad "$3 (expected [$2], got [$1])"; fi
}

# Ensure dist + manifest exist
(cd "$REPO_ROOT" && bun run build >/dev/null)

UPSTREAM="${WORK}/upstream"
mkdir -p "$UPSTREAM"
cp "${REPO_ROOT}/manifest.txt" "$UPSTREAM/"
cp "${REPO_ROOT}/install.sh" "$UPSTREAM/"
cp -R "${REPO_ROOT}/dist" "$UPSTREAM/dist"

TARGET="${WORK}/consumer-repo"
mkdir -p "$TARGET"
(cd "$TARGET" && git init -q && git config user.email test@example.com && git config user.name test)
echo "# consumer" > "${TARGET}/AGENTS.md"

# 1. dry-run + fresh install (all)
LOCAL_SOURCE="$UPSTREAM" TARGET_DIR="$TARGET" INSTALL_TARGET=all \
  bash "${REPO_ROOT}/install.sh" --dry-run >/dev/null
LOCAL_SOURCE="$UPSTREAM" TARGET_DIR="$TARGET" INSTALL_TARGET=all \
  bash "${REPO_ROOT}/install.sh" >/dev/null

assert_file_exists "${TARGET}/.opencode/agents/sddkit.md" "opencode sddkit agent installed"
assert_file_exists "${TARGET}/.opencode/agents/sddkit-plan.md" "opencode sddkit-plan agent installed"
assert_file_exists "${TARGET}/.opencode/opencode.jsonc" "opencode.jsonc installed"
assert_file_absent "${TARGET}/.opencode/plugins/sdd-guard.ts" "plugin not installed"
assert_file_exists "${TARGET}/.cursor/agents/implementer.md" "cursor implementer installed"
assert_file_exists "${TARGET}/.cursor/skills/sddkit/SKILL.md" "cursor sddkit skill installed"
assert_file_exists "${TARGET}/.cursor/skills/sddkit-plan/SKILL.md" "cursor sddkit-plan skill installed"
assert_file_exists "${TARGET}/.cursor/skills/setup-docs/SKILL.md" "cursor setup-docs skill installed"
assert_file_exists "${TARGET}/bin/sddkit-state" "sddkit-state binary/script installed"
assert_file_exists "${TARGET}/.opencode/.harness-manifest" "opencode harness-manifest recorded"
assert_file_exists "${TARGET}/.cursor/.harness-manifest" "cursor harness-manifest recorded"

# 2. no-op reinstall
reinstall_output="$(LOCAL_SOURCE="$UPSTREAM" TARGET_DIR="$TARGET" INSTALL_TARGET=all bash "${REPO_ROOT}/install.sh" --dry-run 2>&1)"
if grep -q "unchanged" <<<"$reinstall_output" && ! grep -q "+ install" <<<"$reinstall_output"; then
  ok "no-op reinstall reports unchanged"
else
  # dry-run still prints per-tree summary with 0 installed
  if grep -q "installed 0" <<<"$reinstall_output"; then
    ok "no-op reinstall reports installed 0"
  else
    bad "no-op reinstall unexpected: $reinstall_output"
  fi
fi

# 3. local modify + backup
before_hash="$(shasum -a 256 "${TARGET}/.opencode/agents/sddkit.md" | awk '{print $1}')"
echo "LOCAL EDIT" >> "${TARGET}/.opencode/agents/sddkit.md"

modify_output="$(LOCAL_SOURCE="$UPSTREAM" TARGET_DIR="$TARGET" INSTALL_TARGET=all bash "${REPO_ROOT}/install.sh" 2>&1)"
if grep -q "modified opencode/agents/sddkit.md" <<<"$modify_output"; then
  ok "reports locally-modified opencode agent"
else
  bad "should report locally-modified file: $modify_output"
fi

backup_copy="$(find "${TARGET}/.opencode" -path '*/.backup-*/agents/sddkit.md' | head -1)"
if [[ -n "$backup_copy" ]]; then ok "locally-modified file was backed up"; else bad "expected backup of agents/sddkit.md"; fi

after_hash="$(shasum -a 256 "${TARGET}/.opencode/agents/sddkit.md" | awk '{print $1}')"
assert_eq "$after_hash" "$before_hash" "locally-modified file restored to upstream"

# 4. prune upstream file
rm "${UPSTREAM}/dist/opencode/agents/qa.md"
HARNESS_ROOT="$UPSTREAM" bun "${REPO_ROOT}/tools/gen-manifest.ts" >/dev/null

prune_output="$(LOCAL_SOURCE="$UPSTREAM" TARGET_DIR="$TARGET" INSTALL_TARGET=all bash "${REPO_ROOT}/install.sh" 2>&1)"
if grep -q "prune    opencode/agents/qa.md" <<<"$prune_output"; then
  ok "reports prune of opencode/agents/qa.md"
else
  bad "should report prune: $prune_output"
fi
assert_file_absent "${TARGET}/.opencode/agents/qa.md" "qa.md removed after upstream deletion"

# 5. doctor
BARE="${WORK}/no-git-no-agents"
mkdir -p "$BARE"
if TARGET_DIR="$BARE" bash "${REPO_ROOT}/install.sh" --doctor >/dev/null 2>&1; then
  ok "--doctor exits 0 even with warnings"
else
  bad "--doctor should never fail"
fi

# 6. checksum mismatch aborts
TAMPERED="${WORK}/tampered-upstream"
cp -R "$UPSTREAM" "$TAMPERED"
echo "TAMPERED" >> "${TAMPERED}/dist/opencode/agents/spec.md"

before_hash="$(shasum -a 256 "${TARGET}/.opencode/agents/spec.md" | awk '{print $1}')"
set +e
LOCAL_SOURCE="$TAMPERED" TARGET_DIR="$TARGET" INSTALL_TARGET=opencode bash "${REPO_ROOT}/install.sh" >/dev/null 2>&1
rc=$?
set -e
if [[ $rc -ne 0 ]]; then ok "checksum mismatch exits non-zero"; else bad "checksum mismatch should abort"; fi
after_hash="$(shasum -a 256 "${TARGET}/.opencode/agents/spec.md" | awk '{print $1}')"
assert_eq "$after_hash" "$before_hash" "no partial write after checksum mismatch"

# 7. doctor mentions bun / sddkit-state
doctor_output="$(TARGET_DIR="$TARGET" bash "${REPO_ROOT}/install.sh" --doctor 2>&1)"
if grep -q 'sddkit-state' <<<"$doctor_output"; then ok "doctor reports sddkit-state"; else bad "doctor sddkit-state: $doctor_output"; fi
if grep -q 'rtk' <<<"$doctor_output"; then
  bad "doctor should not mention rtk install (suggestion is post-install only)"
else
  ok "doctor does not mention rtk"
fi

# 8. cursor-only target
TARGET2="${WORK}/cursor-only"
mkdir -p "$TARGET2"
(cd "$TARGET2" && git init -q)
# restore full dist for a clean cursor-only install
rm -rf "${UPSTREAM}/dist"
cp -R "${REPO_ROOT}/dist" "${UPSTREAM}/dist"
cp "${REPO_ROOT}/manifest.txt" "$UPSTREAM/"
LOCAL_SOURCE="$UPSTREAM" TARGET_DIR="$TARGET2" INSTALL_TARGET=cursor bash "${REPO_ROOT}/install.sh" >/dev/null
assert_file_exists "${TARGET2}/.cursor/agents/tester.md" "cursor-only installs .cursor"
assert_file_absent "${TARGET2}/.opencode/agents/sddkit.md" "cursor-only skips .opencode"
assert_file_exists "${TARGET2}/bin/sddkit-state" "cursor-only still installs sddkit-state"

# 9. sddkit-state CLI smoke
chmod +x "${TARGET}/bin/sddkit-state"
if command -v bun >/dev/null 2>&1; then
  (cd "$TARGET" && ./bin/sddkit-state init smoke-feat >/dev/null)
  assert_file_exists "${TARGET}/docs/feats/smoke-feat/state.yaml" "sddkit-state init writes state.yaml"
  (cd "$TARGET" && ./bin/sddkit-state patch smoke-feat --yaml 'stage: specify' >/dev/null)
  if grep -q 'stage: specify' "${TARGET}/docs/feats/smoke-feat/state.yaml"; then
    ok "sddkit-state patch updates stage"
  else
    bad "sddkit-state patch did not update stage"
  fi
else
  bad "bun required for sddkit-state smoke test"
fi

# 10. post-install next-step hints
hints="$(LOCAL_SOURCE="$UPSTREAM" TARGET_DIR="$TARGET" INSTALL_TARGET=opencode bash "${REPO_ROOT}/install.sh" 2>&1)"
if grep -q '/setup-docs' <<<"$hints"; then ok "suggests /setup-docs"; else bad "missing /setup-docs hint"; fi
if grep -qE 'brew install gh|gh is on PATH|cli.github.com' <<<"$hints"; then
  ok "suggests gh CLI"
else
  bad "missing gh CLI hint"
fi

echo ""
echo "${pass} passed, ${fail} failed"
[[ $fail -eq 0 ]]
