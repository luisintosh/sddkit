#!/usr/bin/env bash
set -euo pipefail

# Tier 1 e2e for the git sequences sddkit-ship drives — pure git, no model, no network.
# Each assertion pins a property the prompt in src/prompts/agents/sddkit-ship.md relies on.

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

pass=0
fail=0

ok() { pass=$((pass + 1)); printf 'ok   - %s\n' "$1"; }
bad() { fail=$((fail + 1)); printf 'FAIL - %s\n' "$1"; }

assert_eq() {
  if [[ "$1" == "$2" ]]; then ok "$3"; else bad "$3 (expected [$2], got [$1])"; fi
}

# A bare "origin" plus a working clone, mirroring a consuming repo.
setup_repo() {
  rm -rf "${WORK}/origin.git" "${WORK}/work" "${WORK}/remote-side"
  git init -q -b main --bare "${WORK}/origin.git"
  git clone -q "${WORK}/origin.git" "${WORK}/work" 2>/dev/null
  cd "${WORK}/work"
  git config user.email test@example.com
  git config user.name test
  printf 'node_modules/\n' > .gitignore
  mkdir -p docs/product/demo
  echo '# roadmap' > docs/product/demo/roadmap.md
  echo base > app.txt
  git add -A
  git commit -qm init
  git push -q -u origin main
}

# Squash-merge a branch into main from a separate clone, so the working clone's
# HEAD never observes it — this is what `gh pr merge --squash` does server-side.
squash_merge_remotely() {
  local branch="$1"
  rm -rf "${WORK}/remote-side"
  git clone -q "${WORK}/origin.git" "${WORK}/remote-side"
  (
    cd "${WORK}/remote-side"
    git config user.email test@example.com
    git config user.name test
    git merge --squash "origin/${branch}" -q >/dev/null 2>&1
    git commit -qm "squashed ${branch}"
    git push -q origin main
    git push -q origin --delete "${branch}"
  )
}

# 1. Clean-tree precondition: -uno must ignore untracked build output and ship.yaml,
#    but must still see tracked modifications.
setup_repo
mkdir -p node_modules && echo dep > node_modules/x
echo 'epic: 1' > docs/product/demo/ship.yaml
assert_eq "$(git status --porcelain -uno)" "" "untracked ship.yaml + build output leave -uno clean"
if [[ -n "$(git status --porcelain)" ]]; then
  ok "plain --porcelain would have reported them (why -uno is required)"
else
  bad "expected plain --porcelain to report untracked files"
fi

# 2. Editing a tracked file (e.g. appending to .gitignore) dirties the tree and would
#    block the branch switches — the reason ship.yaml is left untracked instead.
echo 'docs/product/*/ship.yaml' >> .gitignore
assert_eq "$(git status --porcelain -uno)" " M .gitignore" "editing .gitignore dirties -uno"
git checkout -q -- .gitignore

# 3. Branch cycle: cut a feature branch from a freshly pulled base; untracked deps survive.
git switch -q main && git pull -q --ff-only && git switch -qc feat/one
assert_eq "$(git branch --show-current)" "feat/one" "switch -c cuts the feature branch"
assert_eq "$(cat node_modules/x)" "dep" "untracked deps survive the switch"

# 4. After a server-side squash merge, the local base is stale until pulled.
echo one >> app.txt
git commit -qam "feat: one"
git push -q -u origin feat/one
squash_merge_remotely feat/one
git switch -q main
git fetch -q
if [[ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]]; then
  ok "local base is stale immediately after the merge (sync step is required)"
else
  bad "expected local base to lag origin before pulling"
fi
git pull -q --ff-only
assert_eq "$(git rev-parse HEAD)" "$(git rev-parse origin/main)" "pull --ff-only lands the squash commit"

# 5. Guarded local-branch delete: unconditional deletion errors once the branch is gone.
git branch -D feat/one -q 2>/dev/null || true
git fetch -q --prune
if git branch -D feat/one 2>/dev/null; then
  bad "expected -D to fail on an already-deleted branch"
else
  ok "unconditional -D errors when the branch is absent (guard is required)"
fi
if [[ -z "$(git branch --list feat/one)" ]]; then
  ok "git branch --list guard reports the branch absent"
else
  bad "guard should report feat/one absent"
fi

# 6. When the local branch does survive a squash merge, -d refuses and -D is required.
setup_repo
git switch -qc feat/two
echo two >> app.txt
git commit -qam "feat: two"
git push -q -u origin feat/two
squash_merge_remotely feat/two
git switch -q main && git pull -q --ff-only && git fetch -q --prune
if git branch -d feat/two 2>/dev/null; then
  bad "expected -d to refuse a squash-merged branch after prune"
else
  ok "-d refuses the squash-merged branch once its tracking ref is pruned"
fi
git branch -D feat/two -q
assert_eq "$(git branch --list feat/two)" "" "-D removes it"

# 7. pull --ff-only refuses to paper over divergence with a merge commit.
setup_repo
rm -rf "${WORK}/other"
git clone -q "${WORK}/origin.git" "${WORK}/other"
(
  cd "${WORK}/other"
  git config user.email test@example.com
  git config user.name test
  echo remote > app.txt
  git commit -qam "remote commit"
  git push -q origin main
)
cd "${WORK}/work"
echo local > app.txt
git commit -qam "local commit"
git fetch -q
if git pull --ff-only -q 2>/dev/null; then
  bad "expected --ff-only to refuse divergent history"
else
  ok "pull --ff-only fails loudly on divergence"
fi

echo ""
echo "${pass} passed, ${fail} failed"
[[ $fail -eq 0 ]]
