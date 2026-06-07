#!/usr/bin/env bash
# opencode-harness-toolkit — project initializer.
#
# Discovers the project, renders opencode.json + a short AGENTS.md, scaffolds the docs/ tree, and runs
# the interactive skill picker. Idempotent: only fills gaps, never clobbers your edits.
#
#   .opencode/bin/init.sh [--dry-run] [--check] [--yes] [--skills a,b,c]
#
#   --dry-run   print what would change; mutate nothing
#   --check     doctor: validate install health; exit non-zero if unhealthy
#   --yes       accept stack-recommended skills (non-interactive)
#   --skills    explicit comma-separated skill selection (non-interactive)
set -euo pipefail

# ---- locate harness + target repo ------------------------------------------------------------
SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"   # the .opencode dir
TARGET="$(dirname "$SELF")"                               # consuming repo root
cd "$TARGET"

# ---- args ------------------------------------------------------------------------------------
DRY=0; CHECK=0; YES=0; SKILLS_ARG=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    --check)   CHECK=1 ;;
    --yes|-y)  YES=1 ;;
    --skills)  SKILLS_ARG="${2:-}"; shift ;;
    --skills=*) SKILLS_ARG="${1#--skills=}" ;;
    -h|--help) sed -n '2,12p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
  shift
done

c_ok=$'\033[32m'; c_warn=$'\033[33m'; c_err=$'\033[31m'; c_dim=$'\033[36m'; c_off=$'\033[0m'
info() { printf '%s::%s %s\n' "$c_dim" "$c_off" "$*" >&2; }
ok()   { printf '%s ✓%s %s\n' "$c_ok" "$c_off" "$*" >&2; }
warn() { printf '%s ⚠%s %s\n' "$c_warn" "$c_off" "$*" >&2; }
err()  { printf '%s ✗%s %s\n' "$c_err" "$c_off" "$*" >&2; }
would(){ printf '%s would%s %s\n' "$c_dim" "$c_off" "$*" >&2; }

# ---- json helper (jq preferred, node fallback) -----------------------------------------------
json_get() { # json_get <file> <jq-filter>
  local f="$1" filter="$2"
  if command -v jq >/dev/null 2>&1; then
    jq -r "$filter // empty" "$f" 2>/dev/null || true
  elif command -v node >/dev/null 2>&1; then
    node -e 'const fs=require("fs");try{const d=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
      const path=process.argv[2].replace(/^\./,"").split(".");let v=d;for(const k of path){v=v&&v[k];}
      if(v!=null)process.stdout.write(String(v));}catch(e){}' "$f" "$filter"
  fi
}

# ---- preflight -------------------------------------------------------------------------------
HEALTHY=1
preflight() {
  if command -v opencode >/dev/null 2>&1; then ok "opencode $(opencode --version 2>/dev/null || true)"
  else warn "opencode not found — install: curl -fsSL https://opencode.ai/install | bash"; HEALTHY=0; fi

  command -v git >/dev/null 2>&1 && ok "git $(git --version | awk '{print $3}')" || { err "git required"; HEALTHY=0; }

  if command -v gh >/dev/null 2>&1; then ok "gh $(gh --version | head -1 | awk '{print $3}')"
  else warn "gh (GitHub CLI) not found — /pr needs it. Install from https://cli.github.com then 'gh auth login'"; HEALTHY=0; fi

  # package manager
  if   [ -f pnpm-lock.yaml ]; then PM=pnpm
  elif [ -f yarn.lock ];      then PM=yarn
  elif [ -f bun.lockb ] || [ -f bun.lock ]; then PM=bun
  else PM=npm; fi
  ok "package manager: $PM"
}

# ---- stack + command detection ---------------------------------------------------------------
detect_stack() {
  STACK_TAGS=("node"); STACK_SUMMARY="Node.js"
  local run; case "$PM" in npm) run="npm run";; yarn) run="yarn";; bun) run="bun run";; *) run="pnpm";; esac
  INSTALL_CMD="$PM install"
  BUILD_CMD="$run build"
  TEST_CMD="$run test"
  LINT_CMD="$run lint"
  TYPECHECK_CMD="tsc --noEmit"
  DEV_CMD="$run dev"
  PROJECT_NAME="$(basename "$TARGET")"
  PROJECT_DESC="A project equipped with the opencode-harness-toolkit harness."
  local pj="package.json"
  [ -f "$pj" ] || { warn "no package.json — using generic Node defaults"; return; }
  local deps; deps="$(json_get "$pj" '.dependencies' ) $(json_get "$pj" '.devDependencies')"
  # cheap presence checks against the raw scripts+deps text
  local blob; blob="$(cat "$pj")"
  has() { printf '%s' "$blob" | grep -q "\"$1\""; }
  has react   && { STACK_TAGS+=("react" "frontend"); STACK_SUMMARY+=", React"; }
  has next    && { STACK_TAGS+=("next");             STACK_SUMMARY+=", Next.js"; }
  has express && { STACK_TAGS+=("express" "backend"); STACK_SUMMARY+=", Express"; }
  { has "@nestjs/core" || has nestjs; } && { STACK_TAGS+=("nest" "backend"); STACK_SUMMARY+=", Nest"; }
  has fastify && { STACK_TAGS+=("fastify" "backend"); STACK_SUMMARY+=", Fastify"; }
  has vitest  && STACK_TAGS+=("vitest")
  has '"jest"' && STACK_TAGS+=("jest")
  has playwright && STACK_TAGS+=("playwright" "e2e")
  { has "@supabase/supabase-js" || has supabase; } && { STACK_TAGS+=("supabase"); STACK_SUMMARY+=", Supabase"; }

  # commands from scripts (fallback to PM defaults)
  local s_build s_test s_lint s_tc s_dev
  s_build="$(json_get "$pj" '.scripts.build')"; s_test="$(json_get "$pj" '.scripts.test')"
  s_lint="$(json_get "$pj" '.scripts.lint')";   s_tc="$(json_get "$pj" '.scripts.typecheck')"
  s_dev="$(json_get "$pj" '.scripts.dev')"
  BUILD_CMD="${s_build:+$run build}"; BUILD_CMD="${BUILD_CMD:-$run build}"
  TEST_CMD="${s_test:+$run test}";    TEST_CMD="${TEST_CMD:-$run test}"
  LINT_CMD="${s_lint:+$run lint}";    LINT_CMD="${LINT_CMD:-$run lint}"
  TYPECHECK_CMD="${s_tc:+$run typecheck}"; TYPECHECK_CMD="${TYPECHECK_CMD:-tsc --noEmit}"
  DEV_CMD="${s_dev:+$run dev}";       DEV_CMD="${DEV_CMD:-$run dev}"
  PROJECT_NAME="$(json_get "$pj" '.name')"; PROJECT_NAME="${PROJECT_NAME:-$(basename "$TARGET")}"
  PROJECT_DESC="$(json_get "$pj" '.description')"; PROJECT_DESC="${PROJECT_DESC:-A project equipped with the opencode-harness-toolkit harness.}"
  ok "stack: ${STACK_TAGS[*]}"
}

# ---- template render (bash param-expansion; safe for / and & in values) ----------------------
SUBST_KEYS=()
SUBST_VALS=()
subst_clear() { SUBST_KEYS=(); SUBST_VALS=(); }
subst_set() {
  SUBST_KEYS+=("$1")
  SUBST_VALS+=("$2")
}
render() { # render <template-file> -> stdout
  local content; content="$(cat "$1")"; local k i
  for ((i=0; i<${#SUBST_KEYS[@]}; i++)); do
    k="${SUBST_KEYS[$i]}"
    content="${content//\{\{$k\}\}/${SUBST_VALS[$i]}}"
  done
  printf '%s\n' "$content"
}
write_file() { # write_file <dest> <content>
  local dest="$1" content="$2"
  if [ -e "$dest" ]; then info "keep $dest (exists)"; return; fi
  if [ "$DRY" = 1 ]; then would "create $dest"; return; fi
  mkdir -p "$(dirname "$dest")"; printf '%s' "$content" > "$dest"; ok "created $dest"
}
ensure_gitignore_entry() { # ensure_gitignore_entry <entry>
  local entry="$1" file=".gitignore"
  if [ -f "$file" ] && grep -qxF "$entry" "$file"; then
    info "keep $file ($entry already ignored)"
    return
  fi
  if [ "$DRY" = 1 ]; then
    would "add $entry to $file"
    return
  fi
  [ -f "$file" ] || : > "$file"
  if [ -s "$file" ]; then printf '\n%s\n' "$entry" >> "$file"; else printf '%s\n' "$entry" >> "$file"; fi
  ok "ignored $entry in $file"
}

# ---- doctor ----------------------------------------------------------------------------------
if [ "$CHECK" = 1 ]; then
  info "opencode-harness-toolkit doctor"
  preflight
  [ -f opencode.json ] && ok "opencode.json present" || { warn "opencode.json missing — run init"; HEALTHY=0; }
  [ -f AGENTS.md ] && ok "AGENTS.md present" || { warn "AGENTS.md missing"; HEALTHY=0; }
  for d in docs/ARCHITECTURE.md docs/memory/MEMORY.md docs/feats; do
    [ -e "$d" ] && ok "$d present" || { warn "$d missing"; HEALTHY=0; }
  done
  if git config --file .gitmodules --get-regexp 'submodule\..*\.path' 2>/dev/null | grep -q ' .opencode$'; then
    ok ".opencode submodule registered"; else warn ".opencode not a registered submodule"; HEALTHY=0; fi
  [ "$HEALTHY" = 1 ] && { ok "healthy"; exit 0; } || { err "issues found"; exit 1; }
fi

# ---- run ------------------------------------------------------------------------------------
info "initializing opencode-harness-toolkit in $TARGET$([ "$DRY" = 1 ] && printf '  (dry-run)')"
preflight
detect_stack

# opencode.json (rendered; never clobbered)
subst_clear
subst_set PM "$PM"
write_file "opencode.json" "$(render "$SELF/templates/opencode.json.tmpl")"

# AGENTS.md (short, best-practice)
subst_clear
subst_set PROJECT_NAME "$PROJECT_NAME"
subst_set PROJECT_DESC "$PROJECT_DESC"
subst_set INSTALL_CMD "$INSTALL_CMD"
subst_set DEV_CMD "$DEV_CMD"
subst_set BUILD_CMD "$BUILD_CMD"
subst_set TEST_CMD "$TEST_CMD"
subst_set LINT_CMD "$LINT_CMD"
subst_set TYPECHECK_CMD "$TYPECHECK_CMD"
write_file "AGENTS.md" "$(render "$SELF/templates/AGENTS.md.tmpl")"

# docs/ tree
subst_clear
subst_set PROJECT_NAME "$PROJECT_NAME"
subst_set STACK_SUMMARY "$STACK_SUMMARY"
write_file "docs/ARCHITECTURE.md" "$(render "$SELF/templates/ARCHITECTURE.md.tmpl")"
subst_clear
write_file "docs/memory/MEMORY.md" "$(render "$SELF/templates/MEMORY.md.tmpl")"
write_file "docs/memory/log.md" "# Memory log

Append-only. One entry per durable fact/decision (newest at bottom). Promote to AGENTS.md via /distill.
"
[ -d docs/feats ] || { [ "$DRY" = 1 ] && would "create docs/feats/" || { mkdir -p docs/feats && : > docs/feats/.gitkeep && ok "created docs/feats/"; }; }
ensure_gitignore_entry ".worktrees/"

# constitution (SDD)
subst_clear
subst_set PROJECT_NAME "$PROJECT_NAME"
write_file "docs/CONSTITUTION.md" "$(render "$SELF/templates/specify/constitution.md")"

# skills picker
if [ "$DRY" = 1 ]; then
  would "run skill picker (skills.sh)"
else
  if [ "$YES" = 1 ] && [ -n "$SKILLS_ARG" ]; then
    OC_STACK_TAGS="${STACK_TAGS[*]}" "$SELF/bin/skills.sh" --yes --skills "$SKILLS_ARG" || warn "skill picker skipped/failed"
  elif [ "$YES" = 1 ]; then
    OC_STACK_TAGS="${STACK_TAGS[*]}" "$SELF/bin/skills.sh" --yes || warn "skill picker skipped/failed"
  elif [ -n "$SKILLS_ARG" ]; then
    OC_STACK_TAGS="${STACK_TAGS[*]}" "$SELF/bin/skills.sh" --skills "$SKILLS_ARG" || warn "skill picker skipped/failed"
  else
    OC_STACK_TAGS="${STACK_TAGS[*]}" "$SELF/bin/skills.sh" || warn "skill picker skipped/failed"
  fi
fi

ok "init complete. Next: open 'opencode' and run /doit \"<feature>\""
[ "$HEALTHY" = 1 ] || warn "some preflight checks failed — see warnings above"
