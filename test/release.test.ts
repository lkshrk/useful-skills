import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

async function readJson(rel: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path.join(ROOT, rel), "utf8")) as Record<string, unknown>;
}

describe("manifests", () => {
  test("version is in sync across package.json and plugin manifests", async () => {
    const pkg = await readJson("package.json");
    const codex = await readJson(".codex-plugin/plugin.json");
    const claude = await readJson(".claude-plugin/plugin.json");
    expect(codex.version).toBe(pkg.version);
    expect(claude.version).toBe(pkg.version);
  });

  test("codex manifest points skills at ./skills/", async () => {
    const codex = await readJson(".codex-plugin/plugin.json");
    expect(codex.skills).toBe("./skills/");
  });

  test("claude manifest skills is an array", async () => {
    const claude = await readJson(".claude-plugin/plugin.json");
    expect(Array.isArray(claude.skills)).toBe(true);
  });
});
