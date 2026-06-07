#!/usr/bin/env bash
# opencode-harness-toolkit — feature worktree manager. Used by /doit stage 0 and runnable directly.
#
#   .opencode/bin/worktree.sh new <feature> [base]   # create feat/<slug> worktree + init .opencode
#   .opencode/bin/worktree.sh list                    # list feature worktrees + their stage
#   .opencode/bin/worktree.sh clean <feature>         # merge-check, remove worktree + branch
#   .opencode/bin/worktree.sh path <feature>          # print the worktree path (for scripting)
#
# Worktree location is always <repo>/.worktrees/<slug>.
set -euo pipefail

SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"   # .opencode dir, or this repo when run directly
if [ "$(basename "$SELF")" = ".opencode" ]; then
  REPO_CANDIDATE="$(dirname "$SELF")"
else
  REPO_CANDIDATE="$SELF"
fi
cd "$(git -C "$REPO_CANDIDATE" rev-parse --show-toplevel 2>/dev/null || printf '%s' "$REPO_CANDIDATE")"
ROOT="$(git rev-parse --show-toplevel)"

c_ok=$'\033[32m'; c_warn=$'\033[33m'; c_err=$'\033[31m'; c_dim=$'\033[36m'; c_off=$'\033[0m'
info(){ printf '%s::%s %s\n' "$c_dim" "$c_off" "$*" >&2; }
ok(){ printf '%s ✓%s %s\n' "$c_ok" "$c_off" "$*" >&2; }
warn(){ printf '%s ⚠%s %s\n' "$c_warn" "$c_off" "$*" >&2; }
die(){ printf '%s ✗%s %s\n' "$c_err" "$c_off" "$*" >&2; exit 1; }

slugify(){ printf '%s' "$1" | tr '[:upper:] ' '[:lower:]-' | tr -cd 'a-z0-9-' | sed 's/-\{2,\}/-/g;s/^-//;s/-$//'; }
wt_root(){ printf '%s/.worktrees' "$ROOT"; }
wt_dir(){ printf '%s/%s' "$(wt_root)" "$1"; }
ensure_worktree_ignore(){
  local file="$ROOT/.gitignore" entry=".worktrees/"
  [ -f "$file" ] && grep -qxF "$entry" "$file" && return
  [ -f "$file" ] || : > "$file"
  if [ -s "$file" ]; then printf '\n%s\n' "$entry" >> "$file"; else printf '%s\n' "$entry" >> "$file"; fi
  info "ignored $entry in .gitignore"
}

cmd="${1:-}"; shift || true
case "$cmd" in
  new)
    [ $# -ge 1 ] || die "usage: worktree.sh new <feature> [base]"
    slug="$(slugify "$1")"; base="${2:-HEAD}"; branch="feat/$slug"
    ensure_worktree_ignore
    mkdir -p "$(wt_root)"
    dir="$(cd "$(dirname "$(wt_dir "$slug")")" && pwd)/$(basename "$(wt_dir "$slug")")"
    # NB: all git stdout below is redirected to stderr so this command's ONLY stdout is the final path.
    if git show-ref --verify --quiet "refs/heads/$branch"; then
      warn "branch $branch already exists — reusing"
      git worktree list --porcelain | grep -q "branch refs/heads/$branch" || git worktree add "$dir" "$branch" 1>&2
    else
      git worktree add -b "$branch" "$dir" "$base" 1>&2
    fi
    ok "worktree: $dir  (branch $branch)"
    # bring the harness submodule into the new worktree
    if [ -f "$ROOT/.gitmodules" ]; then
      info "initializing .opencode submodule in worktree"
      git -C "$dir" submodule update --init --recursive .opencode 1>&2 \
        || warn "could not init .opencode submodule in worktree (init it manually if needed)"
    fi
    # scaffold the feature's state dir + doit.yaml inside the worktree
    fdir="$dir/docs/feats/$slug"; mkdir -p "$fdir/contracts"
    if [ ! -f "$fdir/doit.yaml" ]; then
      cat > "$fdir/doit.yaml" <<YAML
feature: $slug
branch: $branch
worktree: $dir
stage: worktree
completed: [worktree]
pending_gate: ""
created: $(date +%Y-%m-%dT%H:%M:%S)
YAML
      ok "state: $fdir/doit.yaml"
    fi
    printf '%s\n' "$dir"   # stdout = path, for callers
    ;;

  list)
    git worktree list --porcelain | awk '
      /^worktree /{w=$2}
      /^branch /{b=$2; if (b ~ /refs\/heads\/feat\//){gsub("refs/heads/","",b); print w"\t"b}}' \
    | while IFS=$'\t' read -r w b; do
        slug="${b#feat/}"; stage="$(grep -E '^stage:' "$w/docs/feats/$slug/doit.yaml" 2>/dev/null | awk '{print $2}')"
        printf '  %-50s %-22s %s\n' "$w" "$b" "stage=${stage:-?}"
      done
    ;;

  clean)
    [ $# -ge 1 ] || die "usage: worktree.sh clean <feature>"
    slug="$(slugify "$1")"; branch="feat/$slug"
    dir="$(git worktree list --porcelain | awk -v b="refs/heads/$branch" '
      /^worktree /{w=$2} /^branch /{if($2==b) print w}')"
    [ -n "$dir" ] || die "no worktree for $branch"
    # merge-check: warn if the branch isn't merged into the default branch
    defbr="$(git symbolic-ref --quiet --short HEAD 2>/dev/null || echo main)"
    main="$(git for-each-ref --format='%(refname:short)' refs/heads/main refs/heads/master 2>/dev/null | head -1)"
    main="${main:-$defbr}"
    if git merge-base --is-ancestor "$branch" "$main" 2>/dev/null; then
      info "$branch is merged into $main"
    else
      warn "$branch is NOT merged into $main — removing anyway will keep the branch"
    fi
    # a worktree containing a submodule can't be removed until the submodule is deinited
    git -C "$dir" submodule deinit -f .opencode 1>&2 2>/dev/null || true
    git worktree remove --force "$dir" && ok "removed worktree $dir"
    if git merge-base --is-ancestor "$branch" "$main" 2>/dev/null; then
      git branch -d "$branch" && ok "deleted branch $branch"
    else
      warn "kept branch $branch (unmerged) — delete with: git branch -D $branch"
    fi
    ;;

  path)
    [ $# -ge 1 ] || die "usage: worktree.sh path <feature>"
    slug="$(slugify "$1")"
    git worktree list --porcelain | awk -v b="refs/heads/feat/$slug" '
      /^worktree /{w=$2} /^branch /{if($2==b) print w}'
    ;;

  *) die "usage: worktree.sh {new|list|clean|path} ..." ;;
esac
