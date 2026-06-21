# Marketplace

`useful-skills` is published to the shared index-only marketplace at
`lkshrk/agent-marketplace`. The marketplace manifests point at this repository
by git `source.url/ref`; plugin source is not vendored into the marketplace.

## Codex

```sh
codex plugin marketplace add lkshrk/agent-marketplace --ref main
codex plugin add useful-skills --marketplace useful-skills
```

## Claude Code

```sh
claude plugin marketplace add lkshrk/agent-marketplace
claude plugin install useful-skills@useful-skills
```

## Release flow

`make marketplace-generate` renders the Codex and Claude marketplace manifests
into `dist/marketplace/`. On a release tag, CI dispatches `release.yml`, which
verifies version sync, creates the GitHub release, and bumps the
`useful-skills` entry in `lkshrk/agent-marketplace` via
`scripts/publish_marketplace.ts`.
