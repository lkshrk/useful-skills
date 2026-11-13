import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";

const SKILL = path.resolve(import.meta.dirname, "..", "skills", "upgrade-flux-cluster", "SKILL.md");

describe("upgrade-flux-cluster", () => {
  test("keeps the sweep's decisions", async () => {
    const text = await readFile(SKILL, "utf8");
    for (const rule of [
      "Research decides",
      "never closed",
      "--match-head-commit",
      "Never use a helper that merges more than the PR you validated",
      "revision\n   **and** Ready",
      "RCA, not rollback",
      "git-revert the default branch **before** `helm rollback`",
      "A merged PR with no comment is an incomplete step",
    ]) {
      expect(text).toContain(rule);
    }
  });

  test("reads repository specifics instead of naming one cluster", async () => {
    const text = await readFile(SKILL, "utf8");
    expect(text).toContain("docs/upgrades.md");
    expect(text).toContain("AGENTS.md");
    expect(text).not.toMatch(/h-cloud|hermes|\/opt\/data|signal/i);
  });
});
