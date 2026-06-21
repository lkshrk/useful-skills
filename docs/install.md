# Install

## Codex, Claude Code, and other skill runtimes

The direct install path is the `skills` CLI. It installs the portable `SKILL.md`
files from this repository into supported agent runtimes.

Install all skills into Codex and Claude Code:

```sh
npx skills add lkshrk/useful-skills --agent codex --agent claude-code
```

Install a single skill:

```sh
npx skills add lkshrk/useful-skills --skill <skill-name> --agent claude-code
```

List available skills:

```sh
npx skills add . --list
```

## Plugin marketplace

See [marketplace.md](marketplace.md) for installing the bundled plugin through
the Codex and Claude Code plugin marketplaces.
