import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const release = Bun.YAML.parse(readFileSync(new URL("../.github/workflows/wow-release.yml", import.meta.url), "utf8")) as any;
const decide = release.jobs.release.steps.find((step: any) => step.id === "decide").run as string;

const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
const gitEnv = {
  ...cleanEnv,
  GIT_AUTHOR_NAME: "test", GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "test", GIT_COMMITTER_EMAIL: "test@example.com",
  GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1",
};

function git(cwd: string, ...args: string[]): string {
  const run = spawnSync("git", args, { cwd, env: gitEnv, encoding: "utf8" });
  if (run.status !== 0) throw new Error(`git ${args.join(" ")}: ${run.stderr}`);
  return run.stdout.trim();
}

function commit(cwd: string, files: Record<string, string>, message: string): string {
  for (const [name, content] of Object.entries(files)) writeFileSync(path.join(cwd, name), content);
  git(cwd, "add", "-A");
  git(cwd, "commit", "-q", "-m", message);
  return git(cwd, "rev-parse", "HEAD");
}

const pkg = (version: string) => JSON.stringify({ version }) + "\n";

type Scenario = { bump: boolean; manualRelease?: boolean; tagMerge?: boolean };

function decideFor({ bump, manualRelease, tagMerge }: Scenario) {
  const dir = mkdtempSync(path.join(tmpdir(), "wow-release-"));
  try {
    const origin = path.join(dir, "origin.git");
    const work = path.join(dir, "work");
    git(dir, "init", "-q", "--bare", "-b", "main", origin);
    git(dir, "clone", "-q", origin, work);
    commit(work, { "package.json": pkg("0.5.1"), "data.json": "1\n" }, "base");
    git(work, "push", "-q", "origin", "HEAD:refs/heads/main");

    git(work, "switch", "-q", "-c", "refresh");
    commit(work, { "data.json": "2\n" }, "fix(wow): refresh seasonal setup bundle");
    if (bump) commit(work, { "package.json": pkg("0.5.2") }, "chore: release v0.5.2");
    git(work, "push", "-q", "origin", "HEAD:refs/pull/7/head");

    git(work, "switch", "-q", "main");
    if (manualRelease) {
      commit(work, { "package.json": pkg("0.5.2") }, "chore: release v0.5.2");
      git(work, "tag", "v0.5.2");
      git(work, "push", "-q", "origin", "HEAD:refs/heads/main", "refs/tags/v0.5.2");
    }
    git(work, "checkout", "-q", "refresh", "--", ".");
    const sha = commit(work, {}, "squash merge #7");
    git(work, "push", "-q", "origin", "HEAD:refs/heads/main");
    if (tagMerge) {
      git(work, "tag", "v0.5.2", sha);
      git(work, "push", "-q", "origin", "refs/tags/v0.5.2");
    }

    const checkout = path.join(dir, "checkout");
    git(dir, "clone", "-q", origin, checkout);
    git(checkout, "checkout", "-q", sha);
    const output = path.join(dir, "output");
    const summary = path.join(dir, "summary");
    writeFileSync(output, "");
    const run = spawnSync("bash", ["-e", "-o", "pipefail", "-c", decide], {
      cwd: checkout, encoding: "utf8",
      env: { ...gitEnv, SHA: sha, PR: "7", GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary },
    });
    const outputs = Object.fromEntries(readFileSync(output, "utf8").trim().split("\n").filter(Boolean).map((line) => line.split("=")));
    return { status: run.status, log: run.stdout + run.stderr, outputs };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("a refresh that bumped the version releases that version", () => {
  const result = decideFor({ bump: true });
  expect(result.status).toBe(0);
  expect(result.outputs).toEqual({ tag: "v0.5.2", action: "release" });
});

test("a refresh without a version bump releases nothing, whatever tags exist", () => {
  expect(decideFor({ bump: false }).outputs).toEqual({ action: "skip" });
  expect(decideFor({ bump: false, manualRelease: true }).outputs).toEqual({ action: "skip" });
});

test("a manual release of the same version fails loudly instead of skipping the refresh", () => {
  const result = decideFor({ bump: true, manualRelease: true });
  expect(result.status).not.toBe(0);
  expect(result.log).toContain("Version collision");
  expect(result.outputs.action).toBeUndefined();
});

test("a tag already on the merge commit dispatches the release again", () => {
  const result = decideFor({ bump: true, tagMerge: true });
  expect(result.status).toBe(0);
  expect(result.outputs).toEqual({ tag: "v0.5.2", action: "redispatch" });
});

test("only a new tag is pushed, and both release and redispatch dispatch release.yml after CI", () => {
  const steps = release.jobs.release.steps;
  const step = (id: string) => steps.find((s: any) => s.id === id);
  expect(step("tag").if).toBe("steps.decide.outputs.action == 'release'");
  expect(step("ci").if).toBe("steps.decide.outputs.action != 'skip'");
  expect(step("dispatch").if).toBe("steps.decide.outputs.action != 'skip'");
  const ids = steps.map((s: any) => s.id);
  expect(ids.indexOf("ci")).toBeLessThan(ids.indexOf("tag"));
  expect(ids.indexOf("tag")).toBeLessThan(ids.indexOf("dispatch"));
});
