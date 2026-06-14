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

c_ok=$'\033[32m'; c_warn=$'\033[33m'; c_err=$'\033[31m'; c_dim=$'\033[36m'; c_off=$'\033[0m'
info() { printf '%s::%s %s\n' "$c_dim" "$c_off" "$*" >&2; }
ok()   { printf '%s ✓%s %s\n' "$c_ok" "$c_off" "$*" >&2; }
warn() { printf '%s ⚠%s %s\n' "$c_warn" "$c_off" "$*" >&2; }
err()  { printf '%s ✗%s %s\n' "$c_err" "$c_off" "$*" >&2; }
would(){ printf '%s would%s %s\n' "$c_dim" "$c_off" "$*" >&2; }

DEFAULT_PROJECT_DESC="A project equipped with the opencode-harness-toolkit harness."

DRY=0
CHECK=0
YES=0
SKILLS_ARG=""
HEALTHY=1
PM=""
MANIFEST=""
MANIFEST_LABEL=""
COMMANDS_ROOT=""
RUN_CMD=""
STACK_SUMMARY=""
PROJECT_NAME="$(basename "$TARGET")"
PROJECT_DESC="$DEFAULT_PROJECT_DESC"
STACK_TAGS=()

show_help() {
  sed -n '2,12p' "${BASH_SOURCE[0]}"
}

parse_args() {
  while [ $# -gt 0 ]; do
    case "$1" in
      --dry-run) DRY=1 ;;
      --check) CHECK=1 ;;
      --yes|-y) YES=1 ;;
      --skills) SKILLS_ARG="${2:-}"; shift ;;
      --skills=*) SKILLS_ARG="${1#--skills=}" ;;
      -h|--help) show_help; exit 0 ;;
      *) err "unknown arg: $1"; exit 2 ;;
    esac
    shift
  done
}

# ---- json helper (jq preferred, node/deno fallback) ------------------------------------------
json_get() { # json_get <file> <jq-filter>
  local f="$1" filter="$2"
  if command -v jq >/dev/null 2>&1; then
    jq -r "$filter // empty" "$f" 2>/dev/null || true
  elif command -v node >/dev/null 2>&1; then
    node -e 'const fs=require("fs");try{const d=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
      const path=process.argv[2].replace(/^\./,"").split(".");let v=d;for(const k of path){v=v&&v[k];}
      if(v!=null)process.stdout.write(String(v));}catch(e){}' "$f" "$filter"
  elif command -v deno >/dev/null 2>&1; then
    deno eval 'const [file, filter] = Deno.args; try {
      const data = JSON.parse(await Deno.readTextFile(file));
      const path = filter.replace(/^\./, "").split(".");
      let value = data;
      for (const key of path) value = value?.[key];
      if (value != null) await Deno.stdout.write(new TextEncoder().encode(String(value)));
    } catch {}' "$f" "$filter"
  fi
}

detect_package_manager() {
  if [ -f pnpm-lock.yaml ]; then
    PM=pnpm
  elif [ -f yarn.lock ]; then
    PM=yarn
  elif [ -f bun.lockb ] || [ -f bun.lock ]; then
    PM=bun
  elif [ -f deno.json ] || [ -f deno.jsonc ] || [ -f deno.lock ]; then
    PM=deno
  elif [ -f package.json ]; then
    PM=npm
  elif [ -f Cargo.toml ]; then
    PM=cargo
  elif [ -f go.mod ]; then
    PM=go
  elif [ -f pyproject.toml ] || [ -f requirements.txt ] || [ -f Pipfile ]; then
    PM=python
  else
    PM=generic
  fi
}

# ---- preflight -------------------------------------------------------------------------------
preflight() {
  if command -v opencode >/dev/null 2>&1; then
    ok "opencode $(opencode --version 2>/dev/null || true)"
  else
    warn "opencode not found — install: curl -fsSL https://opencode.ai/install | bash"
    HEALTHY=0
  fi

  if command -v git >/dev/null 2>&1; then
    ok "git $(git --version | awk '{print $3}')"
  else
    err "git required"
    HEALTHY=0
  fi

  if command -v gh >/dev/null 2>&1; then
    ok "gh $(gh --version | head -1 | awk '{print $3}')"
  else
    warn "gh (GitHub CLI) not found — /pr needs it. Install from https://cli.github.com then 'gh auth login'"
    HEALTHY=0
  fi

  detect_package_manager
  ok "project tooling: $PM"
}

# ---- stack + command detection ---------------------------------------------------------------
configure_runtime() {
  local run=""

  PROJECT_NAME="$(basename "$TARGET")"
  PROJECT_DESC="$DEFAULT_PROJECT_DESC"

  case "$PM" in
    deno)
      STACK_TAGS=(deno)
      STACK_SUMMARY="Deno"
      MANIFEST_LABEL="deno.json/deno.jsonc"
      COMMANDS_ROOT=".tasks"
      INSTALL_CMD="deno install"
      BUILD_CMD="n/a"
      TEST_CMD="deno test"
      LINT_CMD="deno lint"
      TYPECHECK_CMD="deno check"
      DEV_CMD="n/a"

      if [ -f deno.json ]; then
        MANIFEST="deno.json"
      elif [ -f deno.jsonc ]; then
        MANIFEST="deno.jsonc"
      else
        MANIFEST=""
      fi
      ;;
    npm|pnpm|yarn|bun)
      STACK_TAGS=(node)
      STACK_SUMMARY="Node.js"
      MANIFEST="package.json"
      MANIFEST_LABEL="package.json"
      COMMANDS_ROOT=".scripts"

      case "$PM" in
        npm) run="npm run" ;;
        yarn) run="yarn" ;;
        bun) run="bun run" ;;
        *) run="pnpm" ;;
      esac

      RUN_CMD="$run"
      INSTALL_CMD="$PM install"
      BUILD_CMD="n/a"
      TEST_CMD="n/a"
      LINT_CMD="n/a"
      TYPECHECK_CMD="n/a"
      DEV_CMD="n/a"
      ;;
    cargo)
      STACK_TAGS=(rust cargo)
      STACK_SUMMARY="Rust"
      MANIFEST="Cargo.toml"
      MANIFEST_LABEL="Cargo.toml"
      COMMANDS_ROOT=""
      INSTALL_CMD="cargo fetch"
      BUILD_CMD="cargo build"
      TEST_CMD="cargo test"
      LINT_CMD="cargo clippy --all-targets --all-features"
      TYPECHECK_CMD="cargo check"
      if [ -f src/main.rs ]; then
        DEV_CMD="cargo run"
      else
        DEV_CMD="n/a"
      fi
      ;;
    go)
      STACK_TAGS=(go)
      STACK_SUMMARY="Go"
      MANIFEST="go.mod"
      MANIFEST_LABEL="go.mod"
      COMMANDS_ROOT=""
      INSTALL_CMD="go mod download"
      BUILD_CMD="go build ./..."
      TEST_CMD="go test ./..."
      LINT_CMD="go vet ./..."
      TYPECHECK_CMD="n/a"
      if [ -f main.go ]; then
        DEV_CMD="go run ."
      else
        DEV_CMD="n/a"
      fi
      ;;
    python)
      STACK_TAGS=(python)
      STACK_SUMMARY="Python"
      MANIFEST_LABEL="pyproject.toml/requirements.txt/Pipfile"
      COMMANDS_ROOT=""
      INSTALL_CMD="n/a"
      BUILD_CMD="n/a"
      TEST_CMD="python -m unittest discover"
      LINT_CMD="n/a"
      TYPECHECK_CMD="n/a"
      DEV_CMD="n/a"

      if [ -f pyproject.toml ]; then
        MANIFEST="pyproject.toml"
        INSTALL_CMD="python -m pip install -e ."
      elif [ -f requirements.txt ]; then
        MANIFEST="requirements.txt"
        INSTALL_CMD="python -m pip install -r requirements.txt"
      elif [ -f Pipfile ]; then
        MANIFEST="Pipfile"
        RUN_CMD="pipenv run"
        INSTALL_CMD="pipenv install"
        TEST_CMD="$RUN_CMD python -m unittest discover"
      else
        MANIFEST=""
      fi
      ;;
    *)
      STACK_TAGS=(generic)
      STACK_SUMMARY="Generic"
      MANIFEST=""
      MANIFEST_LABEL="project manifest"
      COMMANDS_ROOT=""
      INSTALL_CMD="n/a"
      BUILD_CMD="n/a"
      TEST_CMD="n/a"
      LINT_CMD="n/a"
      TYPECHECK_CMD="n/a"
      DEV_CMD="n/a"
      ;;
  esac
}

manifest_has() {
  local blob="$1" needle="$2"
  [[ "$blob" == *"\"$needle\""* ]]
}

text_has() {
  local blob="$1" needle="$2"
  [[ "$blob" == *"$needle"* ]]
}

stack_hint() {
  local summary="$1"
  shift
  STACK_TAGS+=("$@")
  STACK_SUMMARY+=", $summary"
}

command_from_manifest() { # command_from_manifest <key> <present-cmd> <fallback-cmd>
  local key="$1" present="$2" fallback="$3" value=""
  [ -n "$MANIFEST" ] && value="$(json_get "$MANIFEST" "$COMMANDS_ROOT.$key")"
  if [ -n "$value" ]; then
    printf '%s\n' "$present"
  else
    printf '%s\n' "$fallback"
  fi
}

load_manifest_metadata() {
  local blob name desc

  if [ -z "$MANIFEST" ] || [ ! -f "$MANIFEST" ]; then
    warn "no $MANIFEST_LABEL — using generic $STACK_SUMMARY defaults"
    return
  fi

  blob="$(<"$MANIFEST")"

  case "$PM" in
    deno)
      BUILD_CMD="$(command_from_manifest build "deno task build" "n/a")"
      TEST_CMD="$(command_from_manifest test "deno task test" "deno test")"
      LINT_CMD="$(command_from_manifest lint "deno task lint" "deno lint")"
      TYPECHECK_CMD="$(command_from_manifest typecheck "deno task typecheck" "deno check")"
      DEV_CMD="$(command_from_manifest dev "deno task dev" "n/a")"

      name="$(json_get "$MANIFEST" '.name')"
      desc="$(json_get "$MANIFEST" '.description')"
      ;;
    npm|pnpm|yarn|bun)
      manifest_has "$blob" react && stack_hint "React" react frontend
      manifest_has "$blob" next && stack_hint "Next.js" next
      manifest_has "$blob" express && stack_hint "Express" express backend
      if manifest_has "$blob" "@nestjs/core" || manifest_has "$blob" nestjs; then
        stack_hint "Nest" nest backend
      fi
      manifest_has "$blob" fastify && stack_hint "Fastify" fastify backend
      manifest_has "$blob" vitest && STACK_TAGS+=(vitest)
      manifest_has "$blob" jest && STACK_TAGS+=(jest)
      manifest_has "$blob" playwright && STACK_TAGS+=(playwright e2e)
      if manifest_has "$blob" "@supabase/supabase-js" || manifest_has "$blob" supabase; then
        stack_hint "Supabase" supabase
      fi

      BUILD_CMD="$(command_from_manifest build "$RUN_CMD build" "n/a")"
      TEST_CMD="$(command_from_manifest test "$RUN_CMD test" "n/a")"
      LINT_CMD="$(command_from_manifest lint "$RUN_CMD lint" "n/a")"
      TYPECHECK_CMD="$(command_from_manifest typecheck "$RUN_CMD typecheck" "n/a")"
      DEV_CMD="$(command_from_manifest dev "$RUN_CMD dev" "n/a")"

      name="$(json_get "$MANIFEST" '.name')"
      desc="$(json_get "$MANIFEST" '.description')"
      ;;
    python)
      local py_prefix="${RUN_CMD:+$RUN_CMD }"
      text_has "$blob" pytest && { STACK_TAGS+=(pytest); TEST_CMD="${py_prefix}python -m pytest"; }
      text_has "$blob" ruff && { STACK_TAGS+=(ruff); LINT_CMD="${py_prefix}ruff check ."; }
      text_has "$blob" mypy && { STACK_TAGS+=(mypy); TYPECHECK_CMD="${py_prefix}mypy ."; }
      text_has "$blob" pyright && { STACK_TAGS+=(pyright); TYPECHECK_CMD="${py_prefix}pyright"; }
      ;;
  esac

  PROJECT_NAME="${name:-$(basename "$TARGET")}"
  PROJECT_DESC="${desc:-$DEFAULT_PROJECT_DESC}"
}

detect_stack() {
  configure_runtime
  load_manifest_metadata
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
  local content k i
  content="$(<"$1")"
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

render_template_file() { # render_template_file <dest> <template> [key value...]
  local dest="$1" template="$2"
  shift 2
  subst_clear
  while [ $# -gt 0 ]; do
    subst_set "$1" "$2"
    shift 2
  done
  write_file "$dest" "$(render "$template")"
}

ensure_dir_with_gitkeep() { # ensure_dir_with_gitkeep <dir>
  local dir="$1"
  if [ -d "$dir" ]; then
    info "keep $dir/ (exists)"
    return
  fi
  if [ "$DRY" = 1 ]; then
    would "create $dir/"
    return
  fi
  mkdir -p "$dir"
  : > "$dir/.gitkeep"
  ok "created $dir/"
}

# ---- doctor ----------------------------------------------------------------------------------
run_doctor() {
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
}

render_core_files() {
  render_template_file "opencode.json" "$SELF/templates/opencode.json.tmpl" \
    PM "$PM"

  render_template_file "AGENTS.md" "$SELF/templates/AGENTS.md.tmpl" \
    PROJECT_NAME "$PROJECT_NAME" \
    PROJECT_DESC "$PROJECT_DESC" \
    INSTALL_CMD "$INSTALL_CMD" \
    DEV_CMD "$DEV_CMD" \
    BUILD_CMD "$BUILD_CMD" \
    TEST_CMD "$TEST_CMD" \
    LINT_CMD "$LINT_CMD" \
    TYPECHECK_CMD "$TYPECHECK_CMD"
}

scaffold_docs() {
  render_template_file "docs/ARCHITECTURE.md" "$SELF/templates/ARCHITECTURE.md.tmpl" \
    PROJECT_NAME "$PROJECT_NAME" \
    STACK_SUMMARY "$STACK_SUMMARY"

  render_template_file "docs/memory/MEMORY.md" "$SELF/templates/MEMORY.md.tmpl"
  write_file "docs/memory/log.md" "# Memory log

Append-only. One entry per durable fact/decision (newest at bottom). Promote to AGENTS.md via /distill.
"

  ensure_dir_with_gitkeep "docs/feats"
  ensure_gitignore_entry ".worktrees/"

  render_template_file "docs/CONSTITUTION.md" "$SELF/templates/specify/constitution.md" \
    PROJECT_NAME "$PROJECT_NAME"
}

run_skill_picker() {
  local -a args=()

  if [ "$DRY" = 1 ]; then
    would "run skill picker (skills.sh)"
    return
  fi

  [ "$YES" = 1 ] && args+=(--yes)
  [ -n "$SKILLS_ARG" ] && args+=(--skills "$SKILLS_ARG")

  if [ "${#args[@]}" -gt 0 ]; then
    OC_STACK_TAGS="${STACK_TAGS[*]}" "$SELF/bin/skills.sh" "${args[@]}" || warn "skill picker skipped/failed"
  else
    OC_STACK_TAGS="${STACK_TAGS[*]}" "$SELF/bin/skills.sh" || warn "skill picker skipped/failed"
  fi
}

main() {
  parse_args "$@"

  if [ "$CHECK" = 1 ]; then
    run_doctor
  fi

  info "initializing opencode-harness-toolkit in $TARGET$([ "$DRY" = 1 ] && printf '  (dry-run)')"
  preflight
  detect_stack

  render_core_files
  scaffold_docs
  run_skill_picker

  ok "init complete. Next: open 'opencode' and run /doit \"<feature>\""
  [ "$HEALTHY" = 1 ] || warn "some preflight checks failed — see warnings above"
}

main "$@"
