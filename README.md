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

See [docs/install.md](docs/install.md) for single-skill installs and
[docs/marketplace.md](docs/marketplace.md) for the plugin marketplace path.

## Layout

- `skills/` — one directory per skill, each with a `SKILL.md`.
- `.codex-plugin/plugin.json` — Codex plugin manifest (`skills: "./skills/"`).
- `.claude-plugin/plugin.json` — Claude Code plugin manifest (explicit skill list).
- `scripts/` — release and packaging tooling.
- `test/` — test suite (`bun test`).

## Development

```sh
bun install
bun run hooks:install
bun test
```

`make install-smoke` validates manifests, version sync, docs, and workflows.
`make skills-sync-check` keeps each skill's bundled reference files in sync.

## Release

```sh
make release-create VERSION=patch   # or minor / major / vX.Y.Z
git push origin HEAD --tags
```

Pushing a `vX.Y.Z` tag runs CI; on success CI dispatches `release.yml`, which
creates the GitHub release and bumps the `useful-skills` entry in
`lkshrk/agent-marketplace` (requires the `MARKETPLACE_PUSH_TOKEN` secret).
