#!/usr/bin/env bash
# opencode-harness-toolkit — interactive skill picker / installer.
#
#   .opencode/bin/skills.sh [--yes] [--skills a,b,c] [--sync] [--list]
#
# Merges the harness registry (skills-catalog/skills.registry.json) with the consuming repo's
# .opencode-skills.json whitelist, lets you choose which skills to enable, then fetches each selected
# skill's SKILL.md (+ files) into .agents/skills/<name>/ (committed, opencode-discovered) and records
# the selection in .opencode-skills.json.
#
#   --yes      accept stack-recommended selection (non-interactive)
#   --skills   explicit comma-separated names (non-interactive)
#   --sync     re-fetch the already-enabled skills (used by update.sh); no prompt
#   --list     print the merged catalog and exit
set -euo pipefail

SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"   # .opencode dir
TARGET="$(dirname "$SELF")"
cd "$TARGET"

REGISTRY="$SELF/skills-catalog/skills.registry.json"
WL=".opencode-skills.json"           # consuming-repo whitelist + enabled record
DEST_BASE=".agents/skills"
TAGS=" ${OC_STACK_TAGS:-} "          # space-padded for word matching

c_ok=$'\033[32m'; c_warn=$'\033[33m'; c_dim=$'\033[36m'; c_off=$'\033[0m'
info(){ printf '%s::%s %s\n' "$c_dim" "$c_off" "$*" >&2; }
ok(){ printf '%s ✓%s %s\n' "$c_ok" "$c_off" "$*" >&2; }
warn(){ printf '%s ⚠%s %s\n' "$c_warn" "$c_off" "$*" >&2; }
command -v jq >/dev/null || { warn "jq required for the skill picker — skipping"; exit 0; }

CAN_PROMPT=0
PROMPT_FD=0
if [ -t 0 ]; then
  CAN_PROMPT=1
elif { [ -r /dev/tty ] && exec 3</dev/tty; } 2>/dev/null; then
  CAN_PROMPT=1
  PROMPT_FD=3
fi

MODE_YES=0 MODE_SYNC=0 MODE_LIST=0 SKILLS_EXPLICIT=""
while [ $# -gt 0 ]; do case "$1" in
  --yes|-y) MODE_YES=1;; --sync) MODE_SYNC=1;; --list) MODE_LIST=1;;
  --skills) SKILLS_EXPLICIT="${2:-}"; shift;; --skills=*) SKILLS_EXPLICIT="${1#--skills=}";;
  *) echo "unknown arg: $1" >&2; exit 2;; esac; shift; done

# ---- load merged catalog (registry + whitelist) into parallel arrays --------------------------
merged_json() {
  local wl='{"skills":[]}'; [ -f "$WL" ] && wl="$(cat "$WL")"
  jq -n --slurpfile r "$REGISTRY" --argjson w "$wl" '
    ($r[0].skills // []) as $rs |
    ($w.whitelist // []) as $ws |
    # whitelist entries override registry entries of the same name; extras append
    ($rs + $ws) | group_by(.name) | map(.[-1])'
}
CATALOG="$(merged_json)"
NAMES=()
DESC=()
SRC=()
STACKS=()
REC=()
while IFS=$'\t' read -r n d s st rc; do
  NAMES+=("$n")
  DESC+=("$d")
  SRC+=("$s")
  STACKS+=("$st")
  REC+=("$rc")
done < <(printf '%s' "$CATALOG" | jq -r '.[] | [.name, (.description//""), (.source//""), ((.stacks//[])|join(",")), ((.recommended//false)|tostring)] | @tsv')

idx_of() {
  local needle="$1" i
  for ((i=0; i<${#NAMES[@]}; i++)); do
    [ "${NAMES[$i]}" = "$needle" ] && { printf '%s\n' "$i"; return 0; }
  done
  return 1
}

is_recommended() { # by stack match, "*" stack, or recommended:true
  local n="$1" i s
  i="$(idx_of "$n")" || return 1
  [ "${REC[$i]}" = "true" ] && return 0
  local IFS=','
  for s in ${STACKS[$i]}; do
    [ "$s" = "*" ] && return 0
    [[ "$TAGS" == *" $s "* ]] && return 0
  done; return 1
}

if [ "$MODE_LIST" = 1 ]; then
  for ((i=0; i<${#NAMES[@]}; i++)); do
    n="${NAMES[$i]}"
    is_recommended "$n" && r="recommended" || r=""
    printf '%-30s %-12s %s\n' "$n" "$r" "${DESC[$i]}"
  done; exit 0
fi

# ---- determine selection ---------------------------------------------------------------------
SEL=()
preselect() {
  local i n
  SEL=()
  for ((i=0; i<${#NAMES[@]}; i++)); do
    n="${NAMES[$i]}"
    is_recommended "$n" && SEL[$i]=1 || SEL[$i]=0
  done
}

if [ "$MODE_SYNC" = 1 ]; then
  # re-enable exactly what's recorded
  preselect
  for ((i=0; i<${#NAMES[@]}; i++)); do SEL[$i]=0; done
  if [ -f "$WL" ]; then
    while read -r n; do
      [ -n "$n" ] || continue
      i="$(idx_of "$n")" && SEL[$i]=1
    done < <(jq -r '.enabled[]? // empty' "$WL")
  fi
elif [ -n "$SKILLS_EXPLICIT" ]; then
  for ((i=0; i<${#NAMES[@]}; i++)); do SEL[$i]=0; done
  IFS=',' read -ra picks <<< "$SKILLS_EXPLICIT"
  for p in "${picks[@]}"; do
    p="$(echo "$p" | xargs)"
    i="$(idx_of "$p")" && SEL[$i]=1 || warn "unknown skill: $p"
  done
elif [ "$MODE_YES" = 1 ] || [ "$CAN_PROMPT" = 0 ]; then
  [ "$MODE_YES" = 1 ] || warn "non-interactive stdin and no controlling terminal — accepting recommended skills"
  preselect
else
  preselect
  render() { echo >&2; info "Select skills to enable (stack: ${OC_STACK_TAGS:-generic})"; local i n box
    for ((i=0; i<${#NAMES[@]}; i++)); do
      n="${NAMES[$i]}"
      [ "${SEL[$i]}" = 1 ] && box="[x]" || box="[ ]"
      printf '  %2d %s %-30s %s\n' "$((i+1))" "$box" "$n" "${DESC[$i]}" >&2
    done
    printf '%sToggle numbers (e.g. 1 3), a=all, n=none, Enter=confirm:%s ' "$c_dim" "$c_off" >&2
  }
  while :; do
    render; read -r -u "$PROMPT_FD" line || line=""
    [ -z "$line" ] && break
    case "$line" in
      a|A) for ((i=0; i<${#NAMES[@]}; i++)); do SEL[$i]=1; done; continue;;
      n|N) for ((i=0; i<${#NAMES[@]}; i++)); do SEL[$i]=0; done; continue;;
    esac
    for tok in $line; do
      if [[ "$tok" =~ ^[0-9]+$ ]] && [ "$tok" -ge 1 ] && [ "$tok" -le "${#NAMES[@]}" ]; then
        i=$((tok-1))
        [ "${SEL[$i]}" = 1 ] && SEL[$i]=0 || SEL[$i]=1
      fi
    done
  done
fi

# ---- fetch a skill source into .agents/skills/<name>/ ----------------------------------------
fetch_skill() { # fetch_skill <name> <source>
  local name="$1" src="$2"
  local dest="$DEST_BASE/$name"
  local tmp; tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' RETURN
  local url ref skill
  if [[ "$src" == skills.sh:* ]]; then
    local body="${src#skills.sh:}"; ref="main"
    [[ "$body" == *@* ]] && { ref="${body##*@}"; body="${body%@*}"; }
    local owner repo; owner="${body%%/*}"; body="${body#*/}"; repo="${body%%/*}"; skill="${body#*/}"
    url="https://github.com/$owner/$repo.git"
    [ "$ref" = "CHANGEME" ] && { warn "$name: source not pinned (CHANGEME) — using default branch"; ref=""; }
  elif [[ "$src" == http*://* || "$src" == git@* ]]; then
    url="${src%%#*}"; ref=""; [[ "$src" == *#* ]] && ref="${src#*#}"; skill=""
  elif [ -d "$src" ]; then
    rm -rf "$dest"; mkdir -p "$(dirname "$dest")"; cp -R "$src" "$dest"; ok "installed $name (local)"; return 0
  else
    warn "$name: unsupported source '$src'"; return 1
  fi

  if ! git clone --depth 1 ${ref:+--branch "$ref"} -q "$url" "$tmp/repo" 2>/dev/null; then
    # branch-specific shallow clone can fail for commit pins; fall back to full clone + checkout
    git clone -q "$url" "$tmp/repo" 2>/dev/null || { warn "$name: clone failed ($url)"; return 1; }
    [ -n "$ref" ] && git -C "$tmp/repo" checkout -q "$ref" 2>/dev/null || true
  fi
  # locate the skill dir. For mono-repos we must pick the RIGHT skill, never a random one:
  #   1) a directory literally named <skill> that has a SKILL.md, else
  #   2) a SKILL.md whose frontmatter `name:` equals <skill>, else
  #   3) (only when no skill name was given, e.g. a single-skill repo) the repo's sole SKILL.md.
  local sdir=""
  if [ -n "$skill" ]; then
    sdir="$(find "$tmp/repo" -type d -name "$skill" -exec test -f '{}/SKILL.md' \; -print 2>/dev/null | head -1)"
    if [ -z "$sdir" ]; then
      while IFS= read -r s; do
        local nm; nm="$(sed -n 's/^name:[[:space:]]*//p' "$s" 2>/dev/null | head -1 | tr -d '"'"'"' \r')"
        [ "$nm" = "$skill" ] && { sdir="$(dirname "$s")"; break; }
      done < <(find "$tmp/repo" -name SKILL.md 2>/dev/null)
    fi
    [ -z "$sdir" ] && { warn "$name: skill '$skill' not found in $url (mono-repo? pin the exact path)"; return 1; }
  else
    local count; count="$(find "$tmp/repo" -name SKILL.md 2>/dev/null | wc -l | tr -d ' ')"
    [ "$count" = "1" ] && sdir="$(dirname "$(find "$tmp/repo" -name SKILL.md 2>/dev/null | head -1)")" \
      || { warn "$name: $count SKILL.md found and no skill name given — be specific"; return 1; }
  fi
  [ -n "$sdir" ] && [ -f "$sdir/SKILL.md" ] || { warn "$name: no SKILL.md found in $url"; return 1; }
  rm -rf "$dest"; mkdir -p "$(dirname "$dest")"; cp -R "$sdir" "$dest"; rm -rf "$dest/.git"
  ok "installed $name -> $dest"
}

# ---- apply selection -------------------------------------------------------------------------
ENABLED=()
for ((i=0; i<${#NAMES[@]}; i++)); do
  [ "${SEL[$i]}" = 1 ] && ENABLED+=("${NAMES[$i]}")
done

if [ "${#ENABLED[@]}" -eq 0 ]; then info "no skills selected"; else
  info "installing: ${ENABLED[*]}"
  for n in "${ENABLED[@]}"; do
    i="$(idx_of "$n")" || { warn "unknown skill: $n"; continue; }
    fetch_skill "$n" "${SRC[$i]}" || true
  done
fi

# ---- record selection in .opencode-skills.json (preserve any whitelist entries) --------------
existing_wl='[]'; [ -f "$WL" ] && existing_wl="$(jq -c '.whitelist // []' "$WL" 2>/dev/null || echo '[]')"
printf '%s\n' "$(jq -n --argjson en "$(printf '%s\n' "${ENABLED[@]:-}" | jq -R . | jq -s 'map(select(length>0))')" \
  --argjson wl "$existing_wl" \
  '{ "$schema":"opencode-harness-toolkit/skills", "enabled": $en, "whitelist": $wl }')" > "$WL"
ok "recorded selection in $WL"
