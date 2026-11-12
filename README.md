# Useful Skills

A collection of useful agent skills, packaged as a Codex / Claude Code plugin.

## Install

| Where | How |
| --- | --- |
| Claude Code, Codex | `npx skills add lkshrk/useful-skills` ([options](docs/install.md)) |
| ChatGPT, Claude app | Upload a skill ZIP from the [latest release](https://github.com/lkshrk/useful-skills/releases/latest); WoW skills come as one `wow-skills.zip` ([walkthrough](docs/wow.md#install)) |
| Plugin marketplace | [docs/marketplace.md](docs/marketplace.md) |

## Skills

| Skill | Purpose |
| --- | --- |
| `ai-context-generator` | Generate a tiered `.ai-context` knowledge base for coding agents. |
| `linear-*` | Linear issue workflow: `linear-intake`, `linear-refine`, `linear-implement`, `linear-status`, `linear-reconcile`. See [docs/workflow.md](docs/workflow.md). |
| `litho-document-skill` | Generate C4 architecture docs for a codebase. |
| `loc-change-table` | Line-change stats per repo and file category since a date. |
| `mac-disk-reclaim` | Find and safely delete disk bloat on macOS. |
| `project-tool-allowlist` | Generate a permission allowlist for a repo's dev tools. |
| `upgrade-deps` | Upgrade dependencies one at a time, any ecosystem incl. Flux/GitOps. |
| `yabai-skhd-doctor` | Health-check and fix yabai/skhd on macOS. |
| `wow-*` | World of Warcraft helpers: quick answers, spec builds, achievement plans, dashboards, duo tours. See [docs/wow.md](docs/wow.md). |

## Layout

- `skills/` — one directory per skill, each with a `SKILL.md`.
- `.codex-plugin/plugin.json` — Codex plugin manifest (`skills: "./skills/"`).
- `.claude-plugin/plugin.json` — Claude Code plugin manifest (explicit skill list).
- `scripts/` — release, packaging, Linear issue validators and WoW season-refresh tooling.
- `docs/`, `templates/`, `examples/` — sources that `make skills-sync` copies into the skills that reference them.
- `test/` — test suite (`bun test`).

## Development

```sh
bun install
bun run hooks:install
bun test
```

`make install-smoke` validates manifests, version sync, docs, and workflows.
`make skills-sync-check` keeps each skill's bundled reference files in sync.
`make skill-zips` builds the chat-app upload ZIPs into `dist/skills/` (WoW skills bundled as `wow-skills.zip`).

## Release

```sh
make release-create VERSION=patch   # or minor / major / vX.Y.Z
git push origin HEAD --tags
```

Pushing a `vX.Y.Z` tag runs CI; on success CI dispatches `release.yml`, which
creates the GitHub release and bumps the `useful-skills` entry in
`lkshrk/agent-marketplace` (requires the `MARKETPLACE_PUSH_TOKEN` secret).
Each release also attaches upload ZIPs for chat apps (`make skill-zips`).

The weekly WoW season refresh (`.github/workflows/wow-season-updates.yml`) opens
a pull request with updated `wow-spec` data; cut a patch release after merging it.
It needs secret `WOW_REFRESH_API_KEY` and variables `WOW_REFRESH_BASE_URL` and
`WOW_REFRESH_MODEL` (an Anthropic-compatible gateway), and the octo-sts identity
`useful-skills-wow-refresh` in `lkshrk/.github`.
