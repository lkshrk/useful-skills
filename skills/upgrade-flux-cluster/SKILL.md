---
name: upgrade-flux-cluster
description: Work the open Renovate PRs of a Flux GitOps cluster repository one at a time — research each release, merge clean bumps, fix relevant findings on the Renovate branch, health-gate every merge on the live cluster and report. Use when asked to upgrade a Flux cluster, run an upgrade sweep or process its Renovate PRs.
---

# Upgrade a Flux cluster

Process the open Renovate PRs on a Flux-managed cluster repository one at a
time: research each release, judge whether its changes matter for *this*
cluster, merge the clean bumps, apply needed changes for relevant findings, and
health-gate every merge. Research decides — never the size of the version jump.

## When to Use

- Asked to upgrade the cluster, run an upgrade sweep, or process Renovate PRs
  of a Flux GitOps repository.
- Don't use for: dependency work in other repositories; bumps Renovate has not
  proposed (no self-discovery — Renovate is the only bump source); node or OS
  operations beyond what a bump needs.

## Prerequisites

- `gh` and `git` authenticated with write access to the repository; a fresh
  checkout (`git fetch` before every PR).
- `kubectl` and `flux` against the live cluster: read access plus permission to
  request reconciles is enough. Check with `kubectl auth whoami` before
  merging anything; without cluster access the sweep can't gate merges.
- `helm`, `yq` and `skopeo` or `crane`. Log in to private registries first
  (for ghcr: `skopeo login ghcr.io` / `crane auth login ghcr.io` with a GitHub
  token that has `read:packages`) — anonymous calls get 403 and every private
  chart or image silently shows zero tags.
- Some operations may be out of your reach (cordon, drain, node reboots,
  deletes, restarts, `helm history`/`rollback` without Secret access). Hand the
  operator the exact command and keep such calls apart from the rest.

## Repository specifics

Before the first PR, read the repository's upgrade notes: `docs/upgrades.md`,
then the upgrade section of `AGENTS.md` (or `CLAUDE.md`). They override the
defaults below. Note for this sweep:

| Specific | Default when the repository says nothing |
| --- | --- |
| Validate command | `flux-local test` or `flate test all` over the Flux path; `kustomize build` plus `kubeconform` as the last resort |
| Health-gate helper | none: reconcile and wait by hand (step 6) |
| Coupled bumps | none known: check the rendered diff for pinned companions (chart + app image, operator + CRDs) |
| Do-not-repeat list, pitfalls, verdicts of earlier sweeps | none: say so in the report |
| Knowledge base to sync and read | none |
| Report channel | the conversation that started the sweep |

When the notes and the repository disagree (a script was renamed, a path
moved), trust the repository and report the stale note.

## Procedure

1. **Load context.** Sync and read the knowledge base the notes name: the
   upgrade runbook, the pitfalls that touch today's list and the page of every
   dependency on it. Done when you can say which pitfall applies to which PR.
2. **Build the work list.** `gh pr list --state open`, Renovate-authored PRs
   only; ignore anything under `.worktrees/`. Close stale/superseded PRs with a
   reason comment — but first check the current base, because an old PR's
   comments may describe a state the owner's commits already fixed. Done when
   open Renovate PR count = processed + closed-stale.
3. **Research each PR** (one at a time, before any merge):
   - **How the repository uses the dependency:** search it — HelmRelease,
     OCIRepository, values, kustomize replacements; read its notes and the
     do-not-repeat entries for it.
   - **Findings, all sources:** chart release notes *and the app's own release
     notes* (chart version ≠ app version — `helm show chart` gives appVersion;
     breaking changes hide in app notes, `UPGRADE.md`, or the values schema of
     the *pinned* version: `helm pull <repo>/<chart> --version <pinned>`, never
     the default branch), rendered diff via `helm template` with the real
     values, upstream open issues/bugs for the target version, and the project
     website or third-party reports when notes are thin. Note the release age
     in the findings; there is no embargo — research decides.
   - **Verdict:** `clean` (no finding relevant to this setup) / `relevant`
     (finding touches how this cluster runs the dependency) / `high-risk`
     (irreversible or on the do-not-repeat list). Never estimate change volume
     from the version-number diff — an unfound guess from semver is a rule
     violation, not a shortcut.
4. **Act on the verdict:**
   - `clean` → merge the PR.
   - `relevant` → research the needed change/workaround and apply it — prefer
     pushing to the Renovate branch so bump and fix land atomically — then
     merge. Prefer fixing runtime config over deferring (e.g. an image that
     newly requires env vars gets the env vars, not a deferral).
   - `high-risk` (datapath flips, irreversible migrations, anything on the
     do-not-repeat list) → do not merge and **do not close**: skipped PRs are
     never closed. Comment the skip reason, queue them for the end-of-sweep
     discussion; an open skipped PR heads the next sweep's work list.
   - **Coupled bumps move together** as the repository's notes list them.
5. **Validate and merge.** The repository's validate command must pass on the
   PR head. Strictly one bump per push — a failing bump must revert cleanly.
   Merge pinned to the head you validated, so a push after validation can't
   slip in: `gh pr merge <n> --squash --match-head-commit <validated sha>`
   (or the repository's merge helper when it pins the head itself). Merging
   closes the PR; that is the "close PR" step.
6. **Health gate (mandatory, per merge).** Reconcile the source and the
   affected Kustomization (`flux reconcile kustomization <name> -n <ns>
   --with-source`), then wait only for the objects that PR touched — a
   cluster-wide wait hangs on unrelated degraded resources. Gate on revision
   **and** Ready (Ready alone matches the old revision): the Kustomization's
   `lastAppliedRevision` contains the merge commit, and each touched
   HelmRelease is Ready at the new chart version
   (`.status.history[0].chartVersion`); for image-only bumps the chart version
   never changes, so verify the pod image tag and digest actually moved.
   Hardcode namespace and release per PR — deriving them by grepping
   `metadata.namespace` fails silently. Use the repository's health-gate
   helper when it has one; run long waits in the background.
7. **Verify the app, not just Helm.** Read the app's logs right after the gate,
   plus any post-bump checks the repository's notes list.
8. **On failure: RCA, not rollback.** Keep calm. Read logs, events, the
   HelmRelease status and history (or `helm history`), re-check the notes,
   search upstream issues for the exact symptom; try fixes forward (values,
   config, re-reconcile). Roll back only when genuinely out of ideas — and then
   git-revert the default branch **before** `helm rollback` (Flux re-applies
   whatever the branch says seconds after a helm rollback), knowing rollbacks
   leave fields behind via 3-way merge.
9. **Bookkeeping on every PR, success or failure:** comment the result —
   findings summary, relevance verdict, changes applied, health-gate outcome.
   A merged PR with no comment is an incomplete step.
10. **Next.** Success (or failure recovered forward) → immediately the next PR
    on the list. Only stop early if the cluster is unstable.
11. **Close the sweep.** Report to the report channel: merged bumps, changes
    applied, failures with their RCA, then the skipped high-risk items as
    discussion points. Update the knowledge base when there is one: new
    pitfalls, and per-dependency verdicts ("no relevant finding @ vX") so the
    next sweep starts from them.

## Monitoring model

No active post-merge watches. Gate + app logs immediately after merge, then the
cluster's existing alerting owns the dependency. A merged dependency "comes up
again" as a new Renovate PR: at the next sweep, read the recorded verdict
first, then do fresh research for the new version — an old `clean` verdict is
context, not a free pass.

## Pitfalls

- A harmless-looking chart note is not evidence of a harmless upgrade; the
  break usually lives in the app notes, `UPGRADE.md`, or the pinned values.
- Renovate digest pinning breaks app-template `image.digest` HelmReleases and
  kustomize `:`-delimiter replacements; tag-bumped/digest-stale OCIRepositories
  roll out nothing — check `HelmRelease .status.history[0].chartVersion`.
- `flux reconcile` is a trigger, never the gate. CI-green or PR-merged is not a
  substitute for the live health gate.
- Private registries need auth; anonymous 403s look like "no tags available".
- Renovate presets are usually fetched from the default branch per run — push
  config changes before dispatching a targeted run.

## Verification

- [ ] Every PR on the work list ended merged-with-comment, skipped-for-discussion,
      or closed-stale with a reason — counts add up.
- [ ] Every merged bump passed the validate command, was merged pinned to its
      validated head, passed the revision+Ready gate on the touched objects and
      had its app logs read.
- [ ] No upgrade was judged by its version-number diff; every verdict cites
      sources (notes, issues, rendered diff).
- [ ] Failures have an RCA and their PRs carry the result.
- [ ] Knowledge base verdicts updated; the sweep report was sent.
