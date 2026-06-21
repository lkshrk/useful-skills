---
name: upgrade-deps
description: Upgrade a repository's dependencies safely, one at a time, in any ecosystem — npm/pnpm/yarn/bun, cargo, go modules, pip/poetry/uv, gradle/maven, Docker images, and Flux/GitOps Helm/OCI charts. Detects the stack, prioritizes security and patch bumps, reads each changelog before bumping, asks before major/breaking upgrades, and gates every change on validate + verify (build/test, or Flux health) before moving to the next. Use when the user wants to upgrade/update/bump dependencies, refresh lockfiles, process Renovate/Dependabot PRs, or update charts/images in any repo.
---

# Upgrade Dependencies

Upgrade dependencies safely and **one at a time**: discover → read changelog →
upgrade → validate → verify → only then the next. Never batch unrelated bumps
into one commit; never skip the verify gate. Single-upgrade commits keep a
failing bump cleanly revertable.

## 1. Detect the stack

Read repo instructions first (`README`, `CLAUDE.md`, `AGENTS.md`,
`CONTRIBUTING`) and honor project conventions — task runner (`just`/`make`),
package manager, any wrapper like RTK. Then detect ecosystems from the markers
present. A repo may have several; handle each.

## 2. Discover candidates

Run the bundled one-pass discovery (read-only — only query/list commands):

```bash
bash scripts/discover.sh [folder]
```

It lists open **Renovate/Dependabot PRs**, **security advisories** (`npm audit`,
`govulncheck`, `cargo audit`, `pip-audit`, `osv-scanner`), and **outdated deps**
for every detected ecosystem, plus current Flux image/chart refs. Skipped checks
name the missing tool. Then:

- Close abandoned/superseded Renovate PRs (`gh pr close`, note why).
- Order: security → patch → minor → major. **Major always last.**

## 3. Upgrade cycle (repeat per dependency)

1. Read the upstream **changelog/release notes**; keep the link.
2. **Ask before** any major bump, or any upgrade whose notes mention breaking
   changes, deprecations, migrations, removed config, or CRD/value changes —
   print a concise summary + the link, then ask update-or-skip. No breaking
   changes → proceed without asking.
3. **Highlight new features**: note new capabilities/config that could benefit or
   simplify this project, so the user can decide whether to adopt them.
4. Apply the **single** bump (manifest + lockfile together). Respect declared
   version ranges unless the user asks to widen them.
5. **Validate** (build/typecheck/lint per ecosystem).
6. **Verify** (tests, or Flux health, or CI green if no local tests).
7. **Commit** one logical upgrade; push / open a PR per the project's flow.
8. On failure: stop, diagnose, fix-forward or ask before skip/revert. Never
   revert unrelated user changes.

Keep output concise per item: `dependency  old -> new  changelog-decision  verify-result`.

## Per-ecosystem commands

| Ecosystem | Markers | Outdated | Apply one bump | Validate | Verify |
|---|---|---|---|---|---|
| Node | `package.json` + lock | `<pm> outdated` | `<pm> up <pkg>@<ver>` (pm = npm/pnpm/yarn/bun) + install | `<pm> run build`, `tsc --noEmit` | `<pm> test` |
| Rust | `Cargo.toml`/`Cargo.lock` | `cargo update --dry-run` / `cargo outdated` | `cargo update -p <crate> --precise <ver>` | `cargo check` | `cargo test` |
| Go | `go.mod` | `go list -u -m all` | `go get <mod>@<ver> && go mod tidy` | `go build ./... && go vet ./...` | `go test ./...` |
| Python | `pyproject.toml`/`requirements*.txt` | `uv pip list --outdated` / `poetry show -o` / `pip list --outdated` | `uv lock --upgrade-package <p>` / `poetry update <p>` / edit + `pip install -U <p>` | import/build | `pytest` |
| Java | `pom.xml`/`build.gradle*` | `mvn versions:display-dependency-updates` / `gradle dependencyUpdates` | edit version | `mvn -q compile` / `gradle assemble` | `mvn test` / `gradle test` |
| Docker | `Dockerfile`/`compose.y*ml` | `skopeo list-tags docker://<image>` | bump tag (pin digest if used) | `docker build` | smoke-run / compose up |
| GitOps/Flux | `OCIRepository`/`HelmRelease`/`Kustomization` | `skopeo list-tags` + Renovate PRs | edit tag/`chartRef` version | repo's `flux validate` (e.g. `just flux validate`) | Flux health gate (below) |

If no local validate/verify command exists, fall back to the repo's CI: push the
branch and treat a green pipeline as the verify gate.

## GitOps / Flux specifics

- List OCI/image tags with `skopeo list-tags` (prefer it over Docker/crane — no
  daemon). Discover candidates from Renovate PRs + `OCIRepository`/`HelmRelease`.
- For charts bundling **CRDs**, diff old vs new CRDs for removed/renamed fields
  before applying. After a chart bump, diff rendered values to catch renamed keys.
- **Strictly one upgrade per push** — edit one manifest, validate, commit, push,
  reconcile Flux, wait for the health gate, then the next. Never push multiple
  upgrades at once; a failing one must revert cleanly.
- **Health gate** (verify each, where present): Flux Kustomization Ready;
  HelmRelease Ready; Deployment/StatefulSet/DaemonSet rollout healthy; pods
  Running/Ready; Services have endpoints. Use the merged Kustomization/HelmRelease
  as the primary signal for non-standard workloads.
