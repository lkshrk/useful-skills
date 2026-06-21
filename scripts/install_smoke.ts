import { access, readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

async function readJson(relativePath: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path.join(ROOT, relativePath), "utf8")) as Record<string, unknown>;
}

async function exists(relativePath: string): Promise<boolean> {
  try {
    await access(path.join(ROOT, relativePath));
    return true;
  } catch {
    return false;
  }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function frontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const out: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const field = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (field) out[field[1]] = field[2].replace(/^["']|["']$/g, "").trim();
  }
  return out;
}

async function main(): Promise<number> {
  const errors: string[] = [];
  const skillDirs = existsSync(path.join(ROOT, "skills"))
    ? (await readdir(path.join(ROOT, "skills"), { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort()
    : [];

  const codexManifest = await readJson(".codex-plugin/plugin.json");
  if (codexManifest.skills !== "./skills/") {
    errors.push(".codex-plugin/plugin.json must point skills at ./skills/");
  }

  const claudeManifest = await readJson(".claude-plugin/plugin.json");
  const expectedClaudeSkills = skillDirs.map((skill) => `./skills/${skill}`);
  const actualClaudeSkills = stringArray(claudeManifest.skills).toSorted();
  if (JSON.stringify(actualClaudeSkills) !== JSON.stringify(expectedClaudeSkills)) {
    errors.push(".claude-plugin/plugin.json skills must match skills/* directories");
  }

  for (const skill of skillDirs) {
    const skillPath = `skills/${skill}/SKILL.md`;
    if (!(await exists(skillPath))) {
      errors.push(`${skillPath} is missing`);
      continue;
    }
    const metadata = frontmatter(await readFile(path.join(ROOT, skillPath), "utf8"));
    if (metadata.name !== skill) {
      errors.push(`${skillPath} frontmatter name must match directory`);
    }
    if (typeof metadata.description !== "string" || metadata.description.length < 40) {
      errors.push(`${skillPath} frontmatter description must be descriptive`);
    }
  }

  const packageJson = await readJson("package.json");
  if (codexManifest.version !== packageJson.version) {
    errors.push(".codex-plugin/plugin.json version must match package.json version");
  }
  if (claudeManifest.version !== packageJson.version) {
    errors.push(".claude-plugin/plugin.json version must match package.json version");
  }

  const installDoc = await readFile(path.join(ROOT, "docs/install.md"), "utf8");
  for (const required of ["npx skills add . --list", "--agent claude-code", "--agent codex"]) {
    if (!installDoc.includes(required)) errors.push(`docs/install.md must mention ${required}`);
  }

  const marketplaceDoc = await readFile(path.join(ROOT, "docs/marketplace.md"), "utf8");
  for (const required of ["lkshrk/agent-marketplace", "codex plugin marketplace add", "claude plugin marketplace add", "source.url/ref"]) {
    if (!marketplaceDoc.includes(required)) errors.push(`docs/marketplace.md must mention ${required}`);
  }

  for (const workflow of [".github/workflows/ci.yml", ".github/workflows/release.yml"]) {
    if (!(await exists(workflow))) errors.push(`${workflow} is missing`);
  }

  if (await exists(".github/workflows/ci.yml")) {
    const ci = await readFile(path.join(ROOT, ".github/workflows/ci.yml"), "utf8");
    for (const required of ["startsWith(github.ref, 'refs/tags/v')", "createWorkflowDispatch", "release.yml"]) {
      if (!ci.includes(required)) errors.push(".github/workflows/ci.yml must dispatch release.yml after successful release-tag CI");
    }
  }

  if (await exists(".github/workflows/release.yml")) {
    const release = await readFile(path.join(ROOT, ".github/workflows/release.yml"), "utf8");
    for (const required of ["force_release", "gh run list --workflow \"CI\"", "--commit \"$sha\"", "gh release create"]) {
      if (!release.includes(required)) errors.push(".github/workflows/release.yml must verify CI by commit with force override support");
    }
  }

  if (errors.length > 0) {
    process.stderr.write(`${errors.join("\n")}\n`);
    return 1;
  }

  process.stdout.write(`ok install smoke (${skillDirs.length} skills)\n`);
  return 0;
}

if (import.meta.main) {
  process.exitCode = await main();
}
