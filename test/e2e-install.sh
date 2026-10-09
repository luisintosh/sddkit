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
(cd "$REPO_ROOT" && pnpm run build >/dev/null)

assert_file_exists "${REPO_ROOT}/dist/claude/agents/shadow-architect.md" "transpile emits claude design agent"
assert_file_exists "${REPO_ROOT}/dist/codex/agents/shadow-architect.toml" "transpile emits codex design agent"
if grep -q 'spawn_agent' "${REPO_ROOT}/dist/agents/skills/arise/SKILL.md"; then
  ok "arise skill documents Codex spawn_agent"
else
  bad "arise skill missing Codex spawn_agent delegation"
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

assert_file_exists "${TARGET}/.opencode/agents/arise.md" "opencode arise agent installed"
assert_file_exists "${TARGET}/.opencode/agents/arise-plan.md" "opencode arise-plan agent installed"
assert_file_exists "${TARGET}/.opencode/opencode.jsonc" "opencode.jsonc installed"
assert_file_absent "${TARGET}/.opencode/plugins/sdd-guard.ts" "plugin not installed"
assert_file_exists "${TARGET}/.cursor/agents/shadow-implementer.md" "cursor implementer installed"
assert_file_exists "${TARGET}/.claude/agents/shadow-architect.md" "claude design agent installed"
assert_file_exists "${TARGET}/.claude/skills/arise/SKILL.md" "claude skills copy installed"
assert_file_exists "${TARGET}/.codex/agents/shadow-architect.toml" "codex design agent installed"
if [[ -L "${TARGET}/.claude/skills/arise/SKILL.md" ]]; then
  bad "claude skills must be a copy, not a symlink"
else
  ok "claude skills are a copy, not a symlink"
fi
assert_file_exists "${TARGET}/.agents/skills/arise/SKILL.md" "arise skill installed under .agents"
assert_file_exists "${TARGET}/.agents/skills/arise-plan/SKILL.md" "arise-plan skill installed under .agents"
assert_file_exists "${TARGET}/.agents/skills/arise-setup-docs/SKILL.md" "arise-setup-docs skill installed under .agents"
assert_file_exists "${TARGET}/.agents/skills/arise/references/reply-mapping.md" "arise reply-mapping reference installed"
assert_file_exists "${TARGET}/.agents/skills/arise/references/orca.md" "arise orca reference installed"
assert_file_exists "${TARGET}/.agents/skills/arise/references/handoff.md" "arise handoff reference installed"
for ref in escalation dispute design-delta; do
  assert_file_exists "${TARGET}/.agents/skills/arise/references/${ref}.md" "arise ${ref} reference installed"
done
for ref in orca handoff escalation dispute design-delta; do
  assert_file_exists "${TARGET}/.agents/solodev/references/${ref}.md" "opencode ${ref} reference beside quest-state"
done
if grep -q '<root>/.agents/solodev/references/orca.md' "${TARGET}/.opencode/agents/arise.md"; then
  ok "opencode conductor points at the installed orca reference"
else
  bad "opencode conductor does not point at <root>/.agents/solodev/references/orca.md"
fi
assert_file_absent "${TARGET}/.cursor/skills/sddkit/SKILL.md" "legacy .cursor/skills/sddkit not installed"
assert_file_exists "${TARGET}/.agents/bin/quest-state.mjs" "quest-state installed under .agents/bin"
for area in contract health design; do
  assert_file_exists "${TARGET}/.agents/solodev/checklists/review-${area}.md" "review-${area} checklist beside quest-state"
done
assert_file_exists "${TARGET}/.opencode/.harness-manifest" "opencode harness-manifest recorded"
assert_file_exists "${TARGET}/.cursor/agents/.harness-manifest" "cursor harness-manifest recorded under agents leaf"
assert_file_exists "${TARGET}/.claude/agents/.harness-manifest" "claude agents harness-manifest recorded"
assert_file_exists "${TARGET}/.claude/skills/.harness-manifest" "claude skills harness-manifest recorded"
assert_file_exists "${TARGET}/.codex/agents/.harness-manifest" "codex harness-manifest recorded"
assert_file_exists "${TARGET}/.agents/.harness-manifest" "agents harness-manifest recorded"

# 2. no-op reinstall
reinstall_output="$(LOCAL_SOURCE="$UPSTREAM" TARGET_DIR="$TARGET" INSTALL_TARGET=all node "$INSTALL_JS" --dry-run 2>&1)"
if grep -q "unchanged" <<<"$reinstall_output" && ! grep -q "+ create" <<<"$reinstall_output"; then
  ok "no-op reinstall reports unchanged"
else
  # dry-run still prints per-tree summary with 0 created
  if grep -q "created 0" <<<"$reinstall_output"; then
    ok "no-op reinstall reports created 0"
  else
    bad "no-op reinstall unexpected: $reinstall_output"
  fi
fi

# 3. local modify + overwrite (no backup)
before_hash="$(shasum -a 256 "${TARGET}/.opencode/agents/arise.md" | awk '{print $1}')"
echo "LOCAL EDIT" >> "${TARGET}/.opencode/agents/arise.md"

modify_output="$(LOCAL_SOURCE="$UPSTREAM" TARGET_DIR="$TARGET" INSTALL_TARGET=all node "$INSTALL_JS" 2>&1)"
if grep -q "overwrite opencode/agents/arise.md" <<<"$modify_output"; then
  ok "reports locally-modified opencode agent"
else
  bad "should report locally-modified file: $modify_output"
fi

backup_copy="$(find "${TARGET}/.opencode" -path '*/.backup-*' | head -1)"
if [[ -z "$backup_copy" ]]; then ok "did not create a .backup-* directory"; else bad "unexpected backup: $backup_copy"; fi

after_hash="$(shasum -a 256 "${TARGET}/.opencode/agents/arise.md" | awk '{print $1}')"
assert_eq "$after_hash" "$before_hash" "locally-modified file restored to upstream"

# 4. prune upstream file
rm "${UPSTREAM}/dist/opencode/agents/shadow-qa.md"
HARNESS_ROOT="$UPSTREAM" node "${REPO_ROOT}/tools/gen-manifest.ts" >/dev/null

prune_output="$(LOCAL_SOURCE="$UPSTREAM" TARGET_DIR="$TARGET" INSTALL_TARGET=all node "$INSTALL_JS" 2>&1)"
if grep -q "delete    opencode/agents/shadow-qa.md" <<<"$prune_output"; then
  ok "reports delete of opencode/agents/shadow-qa.md"
else
  bad "should report delete: $prune_output"
fi
assert_file_absent "${TARGET}/.opencode/agents/shadow-qa.md" "shadow-qa.md removed after upstream deletion"

# 4a. update from the split reviewers removes their agent files
printf 'old\n' > "${TARGET}/.claude/agents/shadow-code-reviewer-contract.md"
split_hash="$(shasum -a 256 "${TARGET}/.claude/agents/shadow-code-reviewer-contract.md" | awk '{print $1}')"
printf '%s  shadow-code-reviewer-contract.md\n' "$split_hash" >> "${TARGET}/.claude/agents/.harness-manifest"
LOCAL_SOURCE="$UPSTREAM" TARGET_DIR="$TARGET" INSTALL_TARGET=all node "$INSTALL_JS" >/dev/null 2>&1
assert_file_absent "${TARGET}/.claude/agents/shadow-code-reviewer-contract.md" "split reviewer agent removed on update"
assert_file_exists "${TARGET}/.claude/agents/shadow-code-reviewer.md" "single code reviewer installed"

# 4b. prune a whole skill (rename) leaves no empty folder behind
rm -r "${UPSTREAM}/dist/agents/skills/arise-plan"
HARNESS_ROOT="$UPSTREAM" node "${REPO_ROOT}/tools/gen-manifest.ts" >/dev/null
LOCAL_SOURCE="$UPSTREAM" TARGET_DIR="$TARGET" INSTALL_TARGET=all node "$INSTALL_JS" >/dev/null 2>&1
if [[ ! -e "${TARGET}/.agents/skills/arise-plan" ]]; then ok "removed skill folder pruned from .agents/skills"; else bad "empty skill folder left in .agents/skills"; fi
if [[ ! -e "${TARGET}/.claude/skills/arise-plan" ]]; then ok "removed skill folder pruned from .claude/skills"; else bad "empty skill folder left in .claude/skills"; fi
assert_file_exists "${TARGET}/.agents/skills/arise/SKILL.md" "other skills kept after prune"

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
echo "TAMPERED" >> "${TAMPERED}/dist/opencode/agents/shadow-architect.md"

before_hash="$(shasum -a 256 "${TARGET}/.opencode/agents/shadow-architect.md" | awk '{print $1}')"
set +e
LOCAL_SOURCE="$TAMPERED" TARGET_DIR="$TARGET" INSTALL_TARGET=opencode node "$INSTALL_JS" >/dev/null 2>&1
rc=$?
set -e
if [[ $rc -ne 0 ]]; then ok "checksum mismatch exits non-zero"; else bad "checksum mismatch should abort"; fi
after_hash="$(shasum -a 256 "${TARGET}/.opencode/agents/shadow-architect.md" | awk '{print $1}')"
assert_eq "$after_hash" "$before_hash" "no partial write after checksum mismatch"

# 7. doctor mentions quest-state
doctor_output="$(TARGET_DIR="$TARGET" node "$INSTALL_JS" --doctor 2>&1)"
if grep -q 'quest-state' <<<"$doctor_output"; then ok "doctor reports quest-state"; else bad "doctor quest-state: $doctor_output"; fi
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
assert_file_exists "${TARGET2}/.cursor/agents/shadow-architect.md" "cursor-only installs .cursor"
assert_file_absent "${TARGET2}/.opencode/agents/arise.md" "cursor-only skips .opencode"
assert_file_absent "${TARGET2}/.claude/agents/shadow-architect.md" "cursor-only skips .claude"
assert_file_absent "${TARGET2}/.codex/agents/shadow-architect.toml" "cursor-only skips .codex"
assert_file_exists "${TARGET2}/.agents/bin/quest-state.mjs" "cursor-only still installs quest-state"
assert_file_exists "${TARGET2}/.agents/skills/arise/SKILL.md" "cursor-only installs shared skills"
assert_file_exists "${TARGET2}/.agents/solodev/checklists/review-design.md" "cursor-only installs review checklists"

# 8b. prune leftover ./bin and .cursor/skills
mkdir -p "${TARGET2}/bin" "${TARGET2}/.cursor/skills/sddkit" "${TARGET2}/.cursor/skills/sddkit-epic" "${TARGET2}/.agents/bin"
echo leftover > "${TARGET2}/bin/quest-state"
echo leftover > "${TARGET2}/.agents/bin/quest-state"
echo leftover > "${TARGET2}/.agents/bin/quest-state.js"
echo leftover > "${TARGET2}/.agents/bin/sddkit-state.mjs"
echo leftover > "${TARGET2}/.cursor/skills/sddkit-epic/SKILL.md"
echo leftover > "${TARGET2}/.cursor/skills/sddkit/SKILL.md"
LOCAL_SOURCE="$UPSTREAM" TARGET_DIR="$TARGET2" INSTALL_TARGET=cursor node "$INSTALL_JS" >/dev/null
assert_file_absent "${TARGET2}/bin/quest-state" "reinstall prunes leftover ./bin/quest-state"
assert_file_absent "${TARGET2}/.agents/bin/quest-state" "reinstall prunes extensionless quest-state"
assert_file_absent "${TARGET2}/.agents/bin/quest-state.js" "reinstall prunes leftover quest-state.js"
assert_file_absent "${TARGET2}/.agents/bin/sddkit-state.mjs" "reinstall prunes pre-rename sddkit-state.mjs"
assert_file_absent "${TARGET2}/.cursor/skills/sddkit-epic/SKILL.md" "reinstall prunes pre-rename .cursor/skills/sddkit-epic"
assert_file_exists "${TARGET2}/.agents/bin/quest-state.mjs" "mjs CLI remains after leftover prune"
assert_file_absent "${TARGET2}/.cursor/skills/sddkit/SKILL.md" "reinstall prunes leftover .cursor/skills/sddkit"

# 9. quest-state CLI smoke (CJS nearest package.json must not break ESM .mjs)
chmod +x "${TARGET}/.agents/bin/quest-state.mjs"
if command -v node >/dev/null 2>&1; then
  printf '%s\n' '{"name":"consumer","type":"commonjs"}' > "${TARGET}/package.json"
  (cd "$TARGET" && .agents/bin/quest-state.mjs init smoke-feat >/dev/null)
  assert_file_exists "${TARGET}/docs/feats/smoke-feat/state.yaml" "quest-state init writes state.yaml"
  (cd "$TARGET" && .agents/bin/quest-state.mjs patch smoke-feat --yaml 'stage: design' >/dev/null)
  if grep -q 'stage: design' "${TARGET}/docs/feats/smoke-feat/state.yaml"; then
    ok "quest-state patch updates stage"
  else
    bad "quest-state patch did not update stage"
  fi
  decide_out="$(cd "$TARGET" && .agents/bin/quest-state.mjs decide smoke-feat --event qa-route --yaml 'findings: [{category: bug}]')"
  if grep -q 'route: impl' <<<"$decide_out"; then
    ok "quest-state decide qa-route"
  else
    bad "quest-state decide qa-route: $decide_out"
  fi
  skip_design="$(cd "$TARGET" && .agents/bin/quest-state.mjs decide smoke-feat --event skip-design-critique --yaml $'onlyViableApproach: true\nplaywrightFallback: false\nconstitutionBlocker: false\nhumanDecisions: []\nopenQuestions: []\noracles: [boundary]')"
  if grep -q 'skip: true' <<<"$skip_design"; then
    ok "quest-state decide skip-design-critique"
  else
    bad "quest-state decide skip-design-critique: $skip_design"
  fi
  batch="$(cd "$TARGET" && .agents/bin/quest-state.mjs decide smoke-feat --event batch-journeys --yaml $'oracles: [boundary, golden]\nplaywrightAdd: false')"
  if grep -q 'batch: true' <<<"$batch"; then
    ok "quest-state decide batch-journeys"
  else
    bad "quest-state decide batch-journeys: $batch"
  fi
else
  bad "node required for quest-state smoke test"
fi

# 10. post-install next-step hints
hints="$(LOCAL_SOURCE="$UPSTREAM" TARGET_DIR="$TARGET" INSTALL_TARGET=opencode node "$INSTALL_JS" 2>&1)"
if grep -q '/arise-setup-docs' <<<"$hints"; then ok "suggests /arise-setup-docs"; else bad "missing /arise-setup-docs hint"; fi
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

assert_file_exists "${FAKE_HOME}/.agents/skills/arise/SKILL.md" "global skills land in ~/.agents"
assert_file_exists "${FAKE_HOME}/.agents/bin/quest-state.mjs" "global quest-state lands in ~/.agents/bin"
assert_file_exists "${FAKE_HOME}/.agents/solodev/checklists/review-contract.md" "global checklists land beside ~/.agents/bin"
assert_file_exists "${FAKE_HOME}/.agents/solodev/references/escalation.md" "global references land beside ~/.agents/bin"
assert_file_absent "${GLOBAL_TARGET}/.agents/solodev/checklists/review-contract.md" "global install does not write checklists into TARGET_DIR"
assert_file_exists "${FAKE_HOME}/.cursor/agents/shadow-implementer.md" "global cursor agents leaf"
assert_file_exists "${FAKE_HOME}/.cursor/agents/user-agent.md" "global install keeps planted cursor agent"
assert_file_exists "${FAKE_HOME}/.claude/agents/shadow-architect.md" "global claude agents leaf"
assert_file_exists "${FAKE_HOME}/.claude/skills/arise/SKILL.md" "global claude skills copy"
assert_file_exists "${FAKE_HOME}/.codex/agents/shadow-architect.toml" "global codex agents leaf"
assert_file_exists "${FAKE_HOME}/.config/opencode/agents/arise.md" "global opencode agents only"
assert_file_absent "${GLOBAL_TARGET}/.claude/agents/shadow-architect.md" "global install does not write claude into TARGET_DIR"
assert_file_absent "${GLOBAL_TARGET}/.agents/skills/arise/SKILL.md" "global install does not write skills into TARGET_DIR"
assert_eq "$(cat "${FAKE_HOME}/.config/opencode/opencode.jsonc")" '{"keep":"opencode"}' \
  "global install does not clobber opencode.jsonc"
assert_eq "$(cat "${FAKE_HOME}/.claude/settings.json")" '{"keep":true}' \
  "global install does not clobber claude settings.json"
assert_eq "$(cat "${FAKE_HOME}/.codex/config.toml")" "# user config" \
  "global install does not clobber codex config.toml"
if [[ -L "${FAKE_HOME}/.claude/skills/arise/SKILL.md" ]]; then
  bad "global claude skills must be a copy"
else
  ok "global claude skills are a copy"
fi

rm "${UPSTREAM}/dist/cursor/agents/shadow-qa.md"
HARNESS_ROOT="$UPSTREAM" node "${REPO_ROOT}/tools/gen-manifest.ts" >/dev/null
HOME="$FAKE_HOME" INSTALL_SCOPE=global INSTALL_TARGET=cursor \
  LOCAL_SOURCE="$UPSTREAM" TARGET_DIR="$GLOBAL_TARGET" node "$INSTALL_JS" >/dev/null
assert_file_absent "${FAKE_HOME}/.cursor/agents/shadow-qa.md" "global prune removes upstream-deleted cursor agent"
assert_file_exists "${FAKE_HOME}/.cursor/agents/user-agent.md" "global prune keeps planted non-solodev agent"

# bunx-equivalent: same dist/install.js under bun (consumers may still use bunx)
if ! command -v bun >/dev/null 2>&1; then
  ok "bun dist/install.js --doctor (skipped: bun not installed)"
elif TARGET_DIR="$TARGET" bun "$INSTALL_JS" --doctor >/dev/null 2>&1; then
  ok "bun dist/install.js --doctor exits 0"
else
  bad "bun dist/install.js --doctor should exit 0"
fi

echo ""
echo "${pass} passed, ${fail} failed"
[[ $fail -eq 0 ]]
