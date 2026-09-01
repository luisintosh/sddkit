#!/usr/bin/env bash
set -euo pipefail

# Tier 1 e2e for dist/install.js — LOCAL_SOURCE, no network.

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
INSTALL_JS="${REPO_ROOT}/dist/install.js"
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

assert_file_exists "${REPO_ROOT}/dist/claude/agents/spec.md" "transpile emits claude spec agent"
assert_file_exists "${REPO_ROOT}/dist/codex/agents/spec.toml" "transpile emits codex spec agent"
if grep -q 'spawn_agent' "${REPO_ROOT}/dist/agents/skills/sddkit/SKILL.md"; then
  ok "sddkit skill documents Codex spawn_agent"
else
  bad "sddkit skill missing Codex spawn_agent delegation"
fi

assert_file_exists "${REPO_ROOT}/dist/install.js" "build emits npx/bunx installer"

UPSTREAM="${WORK}/upstream"
mkdir -p "$UPSTREAM"
cp "${REPO_ROOT}/manifest.txt" "$UPSTREAM/"
cp -R "${REPO_ROOT}/dist" "$UPSTREAM/dist"

TARGET="${WORK}/consumer-repo"
mkdir -p "$TARGET"
(cd "$TARGET" && git init -q && git config user.email test@example.com && git config user.name test)
echo "# consumer" > "${TARGET}/AGENTS.md"

# 1. dry-run + fresh install (all)
LOCAL_SOURCE="$UPSTREAM" TARGET_DIR="$TARGET" INSTALL_TARGET=all \
  node "$INSTALL_JS" --dry-run >/dev/null
LOCAL_SOURCE="$UPSTREAM" TARGET_DIR="$TARGET" INSTALL_TARGET=all \
  node "$INSTALL_JS" >/dev/null

assert_file_exists "${TARGET}/.opencode/agents/sddkit.md" "opencode sddkit agent installed"
assert_file_exists "${TARGET}/.opencode/agents/sddkit-plan.md" "opencode sddkit-plan agent installed"
assert_file_exists "${TARGET}/.opencode/opencode.jsonc" "opencode.jsonc installed"
assert_file_absent "${TARGET}/.opencode/plugins/sdd-guard.ts" "plugin not installed"
assert_file_exists "${TARGET}/.cursor/agents/implementer.md" "cursor implementer installed"
assert_file_exists "${TARGET}/.claude/agents/spec.md" "claude spec agent installed"
assert_file_exists "${TARGET}/.claude/skills/sddkit/SKILL.md" "claude skills copy installed"
assert_file_exists "${TARGET}/.codex/agents/spec.toml" "codex spec agent installed"
if [[ -L "${TARGET}/.claude/skills/sddkit/SKILL.md" ]]; then
  bad "claude skills must be a copy, not a symlink"
else
  ok "claude skills are a copy, not a symlink"
fi
assert_file_exists "${TARGET}/.agents/skills/sddkit/SKILL.md" "sddkit skill installed under .agents"
assert_file_exists "${TARGET}/.agents/skills/sddkit-plan/SKILL.md" "sddkit-plan skill installed under .agents"
assert_file_exists "${TARGET}/.agents/skills/setup-docs/SKILL.md" "setup-docs skill installed under .agents"
assert_file_exists "${TARGET}/.agents/skills/sddkit/references/reply-mapping.md" "sddkit reply-mapping reference installed"
assert_file_absent "${TARGET}/.cursor/skills/sddkit/SKILL.md" "legacy .cursor/skills/sddkit not installed"
assert_file_exists "${TARGET}/.agents/bin/sddkit-state" "sddkit-state installed under .agents/bin"
assert_file_exists "${TARGET}/.opencode/.harness-manifest" "opencode harness-manifest recorded"
assert_file_exists "${TARGET}/.cursor/agents/.harness-manifest" "cursor harness-manifest recorded under agents leaf"
assert_file_exists "${TARGET}/.claude/agents/.harness-manifest" "claude agents harness-manifest recorded"
assert_file_exists "${TARGET}/.claude/skills/.harness-manifest" "claude skills harness-manifest recorded"
assert_file_exists "${TARGET}/.codex/agents/.harness-manifest" "codex harness-manifest recorded"
assert_file_exists "${TARGET}/.agents/.harness-manifest" "agents harness-manifest recorded"

# 2. no-op reinstall
reinstall_output="$(LOCAL_SOURCE="$UPSTREAM" TARGET_DIR="$TARGET" INSTALL_TARGET=all node "$INSTALL_JS" --dry-run 2>&1)"
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

modify_output="$(LOCAL_SOURCE="$UPSTREAM" TARGET_DIR="$TARGET" INSTALL_TARGET=all node "$INSTALL_JS" 2>&1)"
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

prune_output="$(LOCAL_SOURCE="$UPSTREAM" TARGET_DIR="$TARGET" INSTALL_TARGET=all node "$INSTALL_JS" 2>&1)"
if grep -q "prune    opencode/agents/qa.md" <<<"$prune_output"; then
  ok "reports prune of opencode/agents/qa.md"
else
  bad "should report prune: $prune_output"
fi
assert_file_absent "${TARGET}/.opencode/agents/qa.md" "qa.md removed after upstream deletion"

# 5. doctor
BARE="${WORK}/no-git-no-agents"
mkdir -p "$BARE"
if TARGET_DIR="$BARE" node "$INSTALL_JS" --doctor >/dev/null 2>&1; then
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
LOCAL_SOURCE="$TAMPERED" TARGET_DIR="$TARGET" INSTALL_TARGET=opencode node "$INSTALL_JS" >/dev/null 2>&1
rc=$?
set -e
if [[ $rc -ne 0 ]]; then ok "checksum mismatch exits non-zero"; else bad "checksum mismatch should abort"; fi
after_hash="$(shasum -a 256 "${TARGET}/.opencode/agents/spec.md" | awk '{print $1}')"
assert_eq "$after_hash" "$before_hash" "no partial write after checksum mismatch"

# 7. doctor mentions bun / sddkit-state
doctor_output="$(TARGET_DIR="$TARGET" node "$INSTALL_JS" --doctor 2>&1)"
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
LOCAL_SOURCE="$UPSTREAM" TARGET_DIR="$TARGET2" INSTALL_TARGET=cursor node "$INSTALL_JS" >/dev/null
assert_file_exists "${TARGET2}/.cursor/agents/tester.md" "cursor-only installs .cursor"
assert_file_absent "${TARGET2}/.opencode/agents/sddkit.md" "cursor-only skips .opencode"
assert_file_absent "${TARGET2}/.claude/agents/spec.md" "cursor-only skips .claude"
assert_file_absent "${TARGET2}/.codex/agents/spec.toml" "cursor-only skips .codex"
assert_file_exists "${TARGET2}/.agents/bin/sddkit-state" "cursor-only still installs sddkit-state"
assert_file_exists "${TARGET2}/.agents/skills/sddkit/SKILL.md" "cursor-only installs shared skills"

# 8b. prune leftover ./bin and .cursor/skills
mkdir -p "${TARGET2}/bin" "${TARGET2}/.cursor/skills/sddkit"
echo leftover > "${TARGET2}/bin/sddkit-state"
echo leftover > "${TARGET2}/.cursor/skills/sddkit/SKILL.md"
LOCAL_SOURCE="$UPSTREAM" TARGET_DIR="$TARGET2" INSTALL_TARGET=cursor node "$INSTALL_JS" >/dev/null
assert_file_absent "${TARGET2}/bin/sddkit-state" "reinstall prunes leftover ./bin/sddkit-state"
assert_file_absent "${TARGET2}/.cursor/skills/sddkit/SKILL.md" "reinstall prunes leftover .cursor/skills/sddkit"

# 9. sddkit-state CLI smoke
chmod +x "${TARGET}/.agents/bin/sddkit-state"
if command -v bun >/dev/null 2>&1; then
  (cd "$TARGET" && .agents/bin/sddkit-state init smoke-feat >/dev/null)
  assert_file_exists "${TARGET}/docs/feats/smoke-feat/state.yaml" "sddkit-state init writes state.yaml"
  (cd "$TARGET" && .agents/bin/sddkit-state patch smoke-feat --yaml 'stage: specify' >/dev/null)
  if grep -q 'stage: specify' "${TARGET}/docs/feats/smoke-feat/state.yaml"; then
    ok "sddkit-state patch updates stage"
  else
    bad "sddkit-state patch did not update stage"
  fi
else
  bad "bun required for sddkit-state smoke test"
fi

# 10. post-install next-step hints
hints="$(LOCAL_SOURCE="$UPSTREAM" TARGET_DIR="$TARGET" INSTALL_TARGET=opencode node "$INSTALL_JS" 2>&1)"
if grep -q '/setup-docs' <<<"$hints"; then ok "suggests /setup-docs"; else bad "missing /setup-docs hint"; fi
if grep -qE 'brew install gh|gh is on PATH|cli.github.com' <<<"$hints"; then
  ok "suggests gh CLI"
else
  bad "missing gh CLI hint"
fi

# 11. missing dist fails (no client-side build)
EMPTY_SOURCE="${WORK}/empty-source"
mkdir -p "$EMPTY_SOURCE"
set +e
LOCAL_SOURCE="$EMPTY_SOURCE" TARGET_DIR="$TARGET" INSTALL_TARGET=all \
  node "$INSTALL_JS" >/dev/null 2>&1
empty_rc=$?
set -e
if [[ $empty_rc -ne 0 ]]; then
  ok "installer fails when LOCAL_SOURCE has no dist/"
else
  bad "installer should fail when dist/ is missing"
fi

# 12. global install uses isolated leaves and does not clobber host config
rm -rf "${UPSTREAM}/dist"
cp -R "${REPO_ROOT}/dist" "${UPSTREAM}/dist"
cp "${REPO_ROOT}/manifest.txt" "$UPSTREAM/"

FAKE_HOME="${WORK}/fake-home"
mkdir -p "${FAKE_HOME}/.cursor/agents" "${FAKE_HOME}/.config/opencode" "${FAKE_HOME}/.claude" "${FAKE_HOME}/.codex"
printf '%s' "user-agent" > "${FAKE_HOME}/.cursor/agents/user-agent.md"
printf '%s' '{"keep":"opencode"}' > "${FAKE_HOME}/.config/opencode/opencode.jsonc"
printf '%s' '{"keep":true}' > "${FAKE_HOME}/.claude/settings.json"
printf '%s' "# user config" > "${FAKE_HOME}/.codex/config.toml"

GLOBAL_TARGET="${WORK}/global-consumer"
mkdir -p "$GLOBAL_TARGET"
HOME="$FAKE_HOME" INSTALL_SCOPE=global INSTALL_TARGET=all \
  LOCAL_SOURCE="$UPSTREAM" TARGET_DIR="$GLOBAL_TARGET" node "$INSTALL_JS" >/dev/null

assert_file_exists "${FAKE_HOME}/.agents/skills/sddkit/SKILL.md" "global skills land in ~/.agents"
assert_file_exists "${FAKE_HOME}/.agents/bin/sddkit-state" "global sddkit-state lands in ~/.agents/bin"
assert_file_exists "${FAKE_HOME}/.cursor/agents/implementer.md" "global cursor agents leaf"
assert_file_exists "${FAKE_HOME}/.cursor/agents/user-agent.md" "global install keeps planted cursor agent"
assert_file_exists "${FAKE_HOME}/.claude/agents/spec.md" "global claude agents leaf"
assert_file_exists "${FAKE_HOME}/.claude/skills/sddkit/SKILL.md" "global claude skills copy"
assert_file_exists "${FAKE_HOME}/.codex/agents/spec.toml" "global codex agents leaf"
assert_file_exists "${FAKE_HOME}/.config/opencode/agents/sddkit.md" "global opencode agents only"
assert_file_absent "${GLOBAL_TARGET}/.claude/agents/spec.md" "global install does not write claude into TARGET_DIR"
assert_file_absent "${GLOBAL_TARGET}/.agents/skills/sddkit/SKILL.md" "global install does not write skills into TARGET_DIR"
assert_eq "$(cat "${FAKE_HOME}/.config/opencode/opencode.jsonc")" '{"keep":"opencode"}' \
  "global install does not clobber opencode.jsonc"
assert_eq "$(cat "${FAKE_HOME}/.claude/settings.json")" '{"keep":true}' \
  "global install does not clobber claude settings.json"
assert_eq "$(cat "${FAKE_HOME}/.codex/config.toml")" "# user config" \
  "global install does not clobber codex config.toml"
if [[ -L "${FAKE_HOME}/.claude/skills/sddkit/SKILL.md" ]]; then
  bad "global claude skills must be a copy"
else
  ok "global claude skills are a copy"
fi

rm "${UPSTREAM}/dist/cursor/agents/qa.md"
HARNESS_ROOT="$UPSTREAM" bun "${REPO_ROOT}/tools/gen-manifest.ts" >/dev/null
HOME="$FAKE_HOME" INSTALL_SCOPE=global INSTALL_TARGET=cursor \
  LOCAL_SOURCE="$UPSTREAM" TARGET_DIR="$GLOBAL_TARGET" node "$INSTALL_JS" >/dev/null
assert_file_absent "${FAKE_HOME}/.cursor/agents/qa.md" "global prune removes upstream-deleted cursor agent"
assert_file_exists "${FAKE_HOME}/.cursor/agents/user-agent.md" "global prune keeps planted non-sddkit agent"

# bunx-equivalent: same dist/install.js under bun
if TARGET_DIR="$TARGET" bun "$INSTALL_JS" --doctor >/dev/null 2>&1; then
  ok "bun dist/install.js --doctor exits 0"
else
  bad "bun dist/install.js --doctor should exit 0"
fi

echo ""
echo "${pass} passed, ${fail} failed"
[[ $fail -eq 0 ]]
