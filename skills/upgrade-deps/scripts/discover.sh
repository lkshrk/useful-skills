#!/usr/bin/env bash
# Discover upgrade candidates across every ecosystem present in a repo, in one
# pass: open Renovate/Dependabot PRs, security advisories, then outdated deps per
# detected stack. Read-only — runs only query/list commands, changes nothing.
set -u

DIR="${1:-.}"
cd "$DIR" 2>/dev/null || { echo "not a directory: $DIR" >&2; exit 1; }

have() { command -v "$1" >/dev/null 2>&1; }
section() { printf '\n=== %s ===\n' "$1"; }
# Run a check only if its tool exists; otherwise note what's missing.
run() { if have "$1"; then shift; "$@" 2>&1; else printf '(skipped: %s not installed)\n' "$1"; fi; }

pm() {
  [ -f bun.lock ] || [ -f bun.lockb ] && { echo bun; return; }
  [ -f pnpm-lock.yaml ] && { echo pnpm; return; }
  [ -f yarn.lock ] && { echo yarn; return; }
  echo npm
}

section "Renovate / Dependabot PRs"
if have gh; then
  gh pr list --state open --search 'author:app/renovate OR author:app/dependabot' \
    --json number,title,labels --template '{{range .}}#{{.number}}  {{.title}}{{"\n"}}{{end}}' 2>/dev/null \
    || echo "(no gh auth or not a GitHub repo)"
else
  echo "(skipped: gh not installed)"
fi

section "Security advisories (prioritize these)"
if [ -f package.json ]; then
  case "$(pm)" in
    npm)  echo "# npm audit";  run npm npm audit 2>&1 | tail -5 ;;
    pnpm) echo "# pnpm audit"; run pnpm pnpm audit 2>&1 | tail -5 ;;
    yarn) echo "# yarn npm audit"; run yarn yarn npm audit 2>&1 | tail -5 ;;
    bun)  echo "# (bun has no audit — use osv-scanner or 'npm audit' against a generated lockfile)" ;;
  esac
fi
[ -f go.mod ] && { echo "# govulncheck"; run govulncheck ./... 2>&1 | tail -5; }
[ -f Cargo.toml ] && { echo "# cargo audit"; run cargo-audit cargo audit 2>&1 | tail -5; }
{ [ -f pyproject.toml ] || ls requirements*.txt >/dev/null 2>&1; } && { echo "# pip-audit"; run pip-audit 2>&1 | tail -5; }
have osv-scanner && { echo "# osv-scanner"; osv-scanner --recursive . 2>&1 | tail -5; }

if [ -f package.json ]; then
  P="$(pm)"; section "Node ($P) outdated"; run "$P" "$P" outdated
fi
if [ -f Cargo.toml ]; then
  section "Rust outdated"
  if have cargo-outdated; then cargo outdated 2>&1; else run cargo cargo update --dry-run 2>&1; fi
fi
if [ -f go.mod ]; then
  section "Go module updates"; run go go list -u -m all 2>&1 | grep '\[' || echo "(all current)"
fi
if [ -f pyproject.toml ] || ls requirements*.txt >/dev/null 2>&1; then
  section "Python outdated"
  if have uv; then uv pip list --outdated 2>&1
  elif have poetry; then poetry show -o 2>&1
  else run pip pip list --outdated 2>&1; fi
fi
if [ -f pom.xml ]; then
  section "Maven updates"; run mvn mvn -q versions:display-dependency-updates 2>&1 | tail -40
fi
if [ -f build.gradle ] || [ -f build.gradle.kts ]; then
  section "Gradle updates"; echo "run: gradle dependencyUpdates (needs the ben-manes versions plugin)"
fi

# GitOps/Flux: image/chart tags aren't in a lockfile. For each OCIRepository,
# extract its url + current ref.tag and (if skopeo present) list the newest
# upstream tags so candidates are concrete, not a grep dump.
if grep -rlqE 'kind:\s*(HelmRelease|OCIRepository)' . --include='*.yaml' --include='*.yml' 2>/dev/null; then
  section "GitOps/Flux OCIRepository charts (current tag vs newest upstream)"
  while IFS= read -r f; do
    grep -qE 'kind:\s*OCIRepository' "$f" || continue
    url=$(grep -oE 'oci://[^ "'"'"']+' "$f" | head -1)
    tag=$(awk '/^[[:space:]]*ref:/{r=1;next} r&&/[[:space:]]tag:/{gsub(/["'"'"']/,"",$2);print $2;exit}' "$f")
    [ -n "$url" ] || continue
    printf '%s\n  file: %s  current: %s\n' "$url" "${f#./}" "${tag:-?}"
    if have skopeo; then
      skopeo list-tags "docker://${url#oci://}" 2>/dev/null \
        | grep -oE '"[^"]+"' | tr -d '"' | grep -vE '^(Tags|Repository)$' \
        | grep -E '^v?[0-9]' | sort -V | tail -8 | sed 's/^/  tag: /' \
        || echo "  (skopeo could not list tags)"
    fi
  done < <(grep -rlE 'kind:\s*OCIRepository' . --include='*.yaml' --include='*.yml' 2>/dev/null)
  [ "$(grep -rlE 'kind:\s*OCIRepository' . --include='*.yaml' --include='*.yml' 2>/dev/null | wc -l)" -gt 0 ] || echo "(no OCIRepository found)"

  section "GitOps/Flux container image refs (check newer tags with skopeo list-tags)"
  grep -rhnE '^\s*image:\s*\S' . --include='*.yaml' --include='*.yml' 2>/dev/null \
    | grep -vE '^\s*#' | sed -E 's/.*image:\s*//' | tr -d '"'"'"'' | sort -u | head -40
fi

printf '\n(Review changelogs before bumping. Order: security -> patch -> minor -> major.)\n'
