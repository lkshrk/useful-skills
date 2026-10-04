# Useful Skills

A collection of useful agent skills, packaged as a Codex / Claude Code plugin.

## Install

The direct install path is the `skills` CLI. It installs the portable `SKILL.md`
files from this repository into supported agent runtimes.

```sh
npx skills add lkshrk/useful-skills --agent codex --agent claude-code
```

List available skills:

```sh
npx skills add lkshrk/useful-skills --list
```

Chat apps (ChatGPT, Claude): each release attaches one ZIP per skill to upload
under Skills; see [docs/wow.md](docs/wow.md#install-in-chatgpt) for a walkthrough.

See [docs/install.md](docs/install.md) for single-skill installs and
[docs/marketplace.md](docs/marketplace.md) for the plugin marketplace path.

## Skills

| Skill | Purpose |
| --- | --- |
| `ai-context-generator` | Generate a tiered `.ai-context` knowledge base for coding agents. |
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
- `scripts/` — release, packaging and WoW season-refresh tooling.
- `test/` — test suite (`bun test`).

## Development

```sh
bun install
bun run hooks:install
bun test
```

`make install-smoke` validates manifests, version sync, docs, and workflows.
`make skills-sync-check` keeps each skill's bundled reference files in sync.
`make skill-zips` builds the per-skill upload ZIPs into `dist/skills/`.

## Release

```sh
make release-create VERSION=patch   # or minor / major / vX.Y.Z
git push origin HEAD --tags
```

Pushing a `vX.Y.Z` tag runs CI; on success CI dispatches `release.yml`, which
creates the GitHub release and bumps the `useful-skills` entry in
`lkshrk/agent-marketplace` (requires the `MARKETPLACE_PUSH_TOKEN` secret).

## WoW season refresh

A weekly workflow refreshes the bundled WoW spec data. Setup and details:
[docs/wow-season-updates.md](docs/wow-season-updates.md).
