#!/usr/bin/env bash
set -euo pipefail

# Tier 2 e2e test (manual, pennies — NOT wired into ci.yml): drives one real,
# unattended opencode run through the harness against test/fixture-repo/ and
# asserts the pipeline's early behavior. This spends real opencode-go budget
# and needs `opencode` installed and authenticated locally, so it is meant to
# be run by a human occasionally, not on every push.
#
# It overlays a config that pins every agent to deepseek-v4-flash (the
# cheapest routed model) so a run costs a handful of requests, not a
# production-routed run — see the "occasional full-fat run" note at the
# bottom for when to skip the override.
#
# Usage:
#   bash test/e2e-pipeline.sh
#
# Environment variables:
#   KEEP_WORKDIR=1   don't delete the scratch repo on exit (for debugging)

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FIXTURE="${REPO_ROOT}/test/fixture-repo"

command -v opencode >/dev/null 2>&1 || {
  echo "SKIP: opencode is not on PATH. This is a manual/paid tier — install and" >&2
  echo "authenticate opencode (https://opencode.ai), then re-run this script." >&2
  exit 1
}

WORK="$(mktemp -d)"
cleanup() {
  if [[ "${KEEP_WORKDIR:-0}" == "1" ]]; then
    echo "Leaving scratch repo at: $WORK" >&2
  else
    rm -rf "$WORK"
  fi
}
trap cleanup EXIT

pass=0
fail=0
ok() { pass=$((pass + 1)); printf 'ok   - %s\n' "$1"; }
bad() { fail=$((fail + 1)); printf 'FAIL - %s\n' "$1"; }

# ---------------------------------------------------------------------------
# Set up a throwaway copy of the fixture repo with the harness installed.
# ---------------------------------------------------------------------------

TARGET="${WORK}/fixture-repo"
cp -R "$FIXTURE" "$TARGET"
(cd "$TARGET" && git init -q && git config user.email test@example.com && git config user.name test \
  && git add -A && git commit -q -m "fixture: initial state")

# Fake origin so the initialize preflight's remote check resolves.
git init --bare -q "${WORK}/origin.git"
(cd "$TARGET" && git remote add origin "${WORK}/origin.git")

# Stub `gh` on PATH: answers auth/repo checks read-only, refuses anything else
# (push/PR-create should never happen before the spec gate).
GH_STUB_DIR="${WORK}/bin"
mkdir -p "$GH_STUB_DIR"
cat > "${GH_STUB_DIR}/gh" <<'STUB'
#!/usr/bin/env bash
case "$1 $2" in
  "auth status") exit 0 ;;
  "repo view") echo '{"nameWithOwner":"test/fixture","defaultBranchRef":{"name":"master"}}' ;;
  *) echo "gh stub: unexpected invocation: $*" >&2; exit 1 ;;
esac
STUB
chmod +x "${GH_STUB_DIR}/gh"
export PATH="${GH_STUB_DIR}:${PATH}"

LOCAL_SOURCE="$REPO_ROOT" TARGET_DIR="$TARGET" INSTALL_TARGET=opencode \
  bash "${REPO_ROOT}/install.sh" >&2

# Pin every agent to the cheapest routed model so this costs pennies.
for f in "${TARGET}"/.opencode/agents/*.md; do
  sed -i.bak -E 's#^model: opencode-go/.+$#model: opencode-go/deepseek-v4-flash#' "$f"
  rm -f "${f}.bak"
done

# ---------------------------------------------------------------------------
# Drive one unattended run. It's expected to stop at the spec gate — the
# workflow always pauses there for a human, which is exactly what step 3 checks.
# ---------------------------------------------------------------------------

cd "$TARGET"
opencode run "Add a slugify(title) util" --agent sddkit > "${WORK}/run.log" 2>&1 || true

feature_dir="$(find docs/feats -mindepth 1 -maxdepth 1 -type d 2>/dev/null | head -1 || true)"
if [[ -z "$feature_dir" ]]; then
  bad "expected docs/feats/<slug>/ to have been created — see ${WORK}/run.log"
  echo "" && echo "${pass} passed, ${fail} failed" && exit 1
fi
slug="$(basename "$feature_dir")"
state_file="${feature_dir}/state.yaml"
journal_file="${feature_dir}/journal.ndjson"

# ---------------------------------------------------------------------------
# Assertions
# ---------------------------------------------------------------------------

if [[ -f "$state_file" ]]; then
  ok "state.yaml exists for feature '${slug}'"
else
  bad "state.yaml missing at ${state_file}"
fi

if [[ -f "$state_file" ]]; then
  # Validate against the shared Zod schema.
  set +e
  bun run -e "
    import { readFileSync } from 'node:fs';
    import { parse } from 'yaml';
    import { validateState } from '${REPO_ROOT}/src/state/schema.ts';
    const doc = parse(readFileSync('${state_file}', 'utf8'));
    const result = validateState(doc);
    if (!result.success) { console.error(result.error); process.exit(1); }
    console.log(JSON.stringify({ stage: doc.stage, pending_gate: doc.pending_gate, branch: doc.branch }));
  " > "${WORK}/state-check.json" 2> "${WORK}/state-check.err"
  validate_rc=$?
  set -e

  if [[ $validate_rc -eq 0 ]]; then
    ok "state.yaml validates against the sddkit-state Zod schema"
  else
    bad "state.yaml failed schema validation: $(cat "${WORK}/state-check.err")"
  fi

  parsed="$(cat "${WORK}/state-check.json" 2>/dev/null || echo '{}')"
  if grep -q '"branch":"feat/' <<<"$parsed"; then
    ok "state recorded a feat/ branch"
  else
    bad "expected branch starting feat/, got: $parsed"
  fi

  if (cd "$TARGET" && git branch --list 'feat/*' | grep -q .); then
    ok "feat/ branch exists in the scratch repo"
  else
    bad "expected a feat/* branch to have been created"
  fi

  if grep -q '"pending_gate":"spec"' <<<"$parsed"; then
    ok "run halted at pending_gate: spec"
  else
    bad "expected pending_gate:spec, got: $parsed"
  fi
fi

if [[ -f "$journal_file" && -s "$journal_file" ]]; then
  ok "journal.ndjson was populated"
else
  bad "journal.ndjson missing or empty at ${journal_file}"
fi

if grep -qE 'git push|gh pr create' "${WORK}/run.log"; then
  bad "run.log mentions git push/gh pr create — should not happen before the spec gate"
else
  ok "no push/PR-create command was attempted before the spec gate"
fi

if grep -q 'sddkit-state' "${WORK}/run.log" || [[ -f "$journal_file" ]]; then
  ok "conductor used sddkit-state / journal path (or journal exists)"
else
  echo "note - no sddkit-state mention in run.log (check journal / state manually)" >&2
fi

echo ""
echo "${pass} passed, ${fail} failed"
echo ""
echo "Note: this run used deepseek-v4-flash for every agent to keep cost minimal."
echo "Occasionally re-run with the override loop above removed to exercise real"
echo "production routing from src/catalog.yaml."
[[ $fail -eq 0 ]]
