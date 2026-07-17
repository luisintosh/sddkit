#!/usr/bin/env bash
set -euo pipefail

# Tier 1 e2e test for install.sh: exercises the full idempotent install
# lifecycle (fresh install, no-op reinstall, local-modification backup,
# upstream prune, --doctor) against a scratch git repo, using LOCAL_SOURCE
# so it needs no network access. Safe to run in CI.

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

pass=0
fail=0

ok() {
  pass=$((pass + 1))
  printf 'ok   - %s\n' "$1"
}

bad() {
  fail=$((fail + 1))
  printf 'FAIL - %s\n' "$1"
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

# ---------------------------------------------------------------------------
# Fixture: a mutable "upstream" copy of this repo (so pruning/updating tests
# don't require mutating the real source tree).
# ---------------------------------------------------------------------------

UPSTREAM="${WORK}/upstream"
mkdir -p "$UPSTREAM"
for f in opencode.jsonc package.json agents plugins scripts; do
  cp -R "${REPO_ROOT}/${f}" "${UPSTREAM}/${f}"
done
(cd "$UPSTREAM" && bash scripts/gen-manifest.sh >/dev/null)

TARGET="${WORK}/consumer-repo"
mkdir -p "$TARGET"
(cd "$TARGET" && git init -q && git config user.email test@example.com && git config user.name test)
echo "# consumer" > "${TARGET}/AGENTS.md"

# ---------------------------------------------------------------------------
# 1. dry-run then real fresh install; tree matches manifest.txt exactly
# ---------------------------------------------------------------------------

LOCAL_SOURCE="$UPSTREAM" TARGET_DIR="$TARGET" bash "${REPO_ROOT}/install.sh" --dry-run >/dev/null
LOCAL_SOURCE="$UPSTREAM" TARGET_DIR="$TARGET" bash "${REPO_ROOT}/install.sh" >/dev/null

installed_files="$(cd "$TARGET/.opencode" && find . -type f ! -name '.harness-manifest' | sed 's#^\./##' | sort)"
manifest_files="$(awk '{ n=split($0,a,/  /); if (n>=2) print a[2] }' "${UPSTREAM}/manifest.txt" | sort)"
assert_eq "$installed_files" "$manifest_files" "fresh install tree matches manifest.txt"

assert_file_exists "${TARGET}/.opencode/.harness-manifest" "records .harness-manifest after install"

# ---------------------------------------------------------------------------
# 2. re-run with no upstream changes: dry-run reports nothing to do
# ---------------------------------------------------------------------------

reinstall_output="$(LOCAL_SOURCE="$UPSTREAM" TARGET_DIR="$TARGET" bash "${REPO_ROOT}/install.sh" --dry-run 2>&1)"
if grep -q "0 to install, 0 to update, 0 locally-modified.*0 to prune" <<<"$reinstall_output"; then
  ok "no-op reinstall reports nothing to do"
else
  bad "no-op reinstall should report nothing to do: $reinstall_output"
fi

# ---------------------------------------------------------------------------
# 3. modify a file locally, reinstall: backed up, then replaced with upstream
# ---------------------------------------------------------------------------

before_hash="$(shasum -a 256 "${TARGET}/.opencode/agents/sdd.md" | awk '{print $1}')"
echo "LOCAL EDIT" >> "${TARGET}/.opencode/agents/sdd.md"

modify_output="$(LOCAL_SOURCE="$UPSTREAM" TARGET_DIR="$TARGET" bash "${REPO_ROOT}/install.sh" 2>&1)"
if grep -q "modified agents/sdd.md" <<<"$modify_output"; then
  ok "reports locally-modified file"
else
  bad "should report locally-modified file: $modify_output"
fi

backup_copy="$(find "${TARGET}/.opencode" -path '*/.backup-*/agents/sdd.md' | head -1)"
if [[ -n "$backup_copy" ]]; then ok "locally-modified file was backed up"; else bad "expected a backup copy of agents/sdd.md"; fi

after_hash="$(shasum -a 256 "${TARGET}/.opencode/agents/sdd.md" | awk '{print $1}')"
assert_eq "$after_hash" "$before_hash" "locally-modified file was restored to upstream content"

# ---------------------------------------------------------------------------
# 4. remove a file upstream, reinstall: pruned locally
# ---------------------------------------------------------------------------

rm "${UPSTREAM}/agents/qa.md"
(cd "$UPSTREAM" && bash scripts/gen-manifest.sh >/dev/null)

prune_output="$(LOCAL_SOURCE="$UPSTREAM" TARGET_DIR="$TARGET" bash "${REPO_ROOT}/install.sh" 2>&1)"
if grep -q "prune    agents/qa.md" <<<"$prune_output"; then
  ok "reports prune of agents/qa.md"
else
  bad "should report prune: $prune_output"
fi
assert_file_absent "${TARGET}/.opencode/agents/qa.md" "agents/qa.md removed after upstream deletion"

# ---------------------------------------------------------------------------
# 5. --doctor never fails, even against a non-git, incomplete target
# ---------------------------------------------------------------------------

BARE="${WORK}/no-git-no-agents"
mkdir -p "$BARE"
if TARGET_DIR="$BARE" bash "${REPO_ROOT}/install.sh" --doctor >/dev/null 2>&1; then
  ok "--doctor exits 0 even with warnings (not a git repo, no AGENTS.md)"
else
  bad "--doctor should never fail"
fi

# ---------------------------------------------------------------------------
# 6. checksum mismatch aborts atomically (nothing partially installed)
# ---------------------------------------------------------------------------

TAMPERED="${WORK}/tampered-upstream"
cp -R "$UPSTREAM" "$TAMPERED"
echo "TAMPERED" >> "${TAMPERED}/agents/spec.md"
# manifest.txt in $TAMPERED is now stale relative to agents/spec.md's content on purpose.

before_hash="$(shasum -a 256 "${TARGET}/.opencode/agents/spec.md" | awk '{print $1}')"
set +e
LOCAL_SOURCE="$TAMPERED" TARGET_DIR="$TARGET" bash "${REPO_ROOT}/install.sh" >/dev/null 2>&1
rc=$?
set -e
if [[ $rc -ne 0 ]]; then
  ok "checksum mismatch causes install.sh to exit non-zero"
else
  bad "checksum mismatch should abort with non-zero exit"
fi
after_hash="$(shasum -a 256 "${TARGET}/.opencode/agents/spec.md" | awk '{print $1}')"
assert_eq "$after_hash" "$before_hash" "no partial write occurred after checksum mismatch"

# ---------------------------------------------------------------------------
# 7. doctor runs and reports environment checks
# ---------------------------------------------------------------------------

doctor_output="$(TARGET_DIR="$TARGET" bash "${REPO_ROOT}/install.sh" --doctor 2>&1)"
if grep -q 'Doctor:' <<<"$doctor_output"; then
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

echo ""
echo "${pass} passed, ${fail} failed"
[[ $fail -eq 0 ]]
