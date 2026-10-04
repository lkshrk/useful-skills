import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const workflow = (name: string) => Bun.YAML.parse(readFileSync(new URL(`../.github/workflows/${name}.yml`, import.meta.url), "utf8")) as any;
const wow = workflow("wow-season-updates");
const summaryStep = (job: string) => wow.jobs[job].steps.at(-1);

function summary(job: string, env: Record<string, string>, result?: object) {
  const dir = mkdtempSync(path.join(tmpdir(), "wow-log-check-"));
  try {
    const file = path.join(dir, "summary.md");
    if (result) {
      mkdirSync(path.join(dir, "wow-result"));
      writeFileSync(path.join(dir, "wow-result/wow-refresh-result.json"), JSON.stringify(result));
    }
    const run = spawnSync("bash", ["-e", "-o", "pipefail", "-c", summaryStep(job).run], {
      env: { ...process.env, ...env, GITHUB_STEP_SUMMARY: file, RUNNER_TEMP: dir }, encoding: "utf8",
    });
    expect(run.status, run.stderr).toBe(0);
    const saved = readFileSync(file, "utf8");
    expect(run.stdout.trim()).toBe(saved.trim());
    return saved;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test("pipeline outcome explains no-op, branch skip, failures and separate release completion", () => {
  for (const [refresh, publish, needed, reason] of [
    ["success", "skipped", "false", "Source detection ran successfully"],
    ["skipped", "skipped", "", "only on the default branch"],
    ["failure", "skipped", "", "did not receive a successful candidate"],
    ["cancelled", "skipped", "true", "cancelled"],
    ["success", "failure", "true", "no end-to-end success"],
    ["success", "success", "true", "dispatched release runs separately"],
  ]) {
    expect(summary("summary", { REFRESH_RESULT: refresh, PUBLISH_RESULT: publish, NEEDED: needed, RELEASE_TAG: "v1.2.3" })).toContain(reason);
  }
  for (const [pushed, auto, tag, reason] of [
    ["false", "true", "", "Nothing was pushed"],
    ["true", "false", "", "pull request is ready"],
    ["true", "true", "", "no patch release"],
  ]) expect(summary("summary", { REFRESH_RESULT: "success", PUBLISH_RESULT: "success", NEEDED: "true", PUSHED: pushed, AUTO_RELEASE: auto, RELEASE_TAG: tag })).toContain(reason);
});

test("refresh summary exposes only outcomes and distinguishes skipped AI from failed AI", () => {
  const stages = { inspect: { outcome: "success" }, provider: { outcome: "skipped", outputs: { secret: "NEVER-LOG-THIS" } }, refresh: { outcome: "skipped" } };
  const skipped = summary("refresh", { JOB_STATUS: "success", NEEDED: "false", STAGES: JSON.stringify(stages) });
  expect(skipped).toContain("force_refresh enabled");
  expect(skipped).toContain("Codex refresh | skipped");
  expect(skipped).not.toContain("NEVER-LOG-THIS");
  stages.refresh.outcome = "failure";
  const failed = summary("refresh", { JOB_STATUS: "failure", NEEDED: "true", STAGES: JSON.stringify(stages) });
  expect(failed).toContain("not evidence of unchanged sources");
  expect(failed).not.toContain("AI candidate generated");
});

test("publication summaries distinguish no-op, PR, fingerprint update, release dispatch and partial failure", () => {
  for (const [status, pushed, auto, tag, reason] of [
    ["success", "false", "true", "", "No accepted data changes"],
    ["success", "true", "false", "", "pull request awaits merge"],
    ["success", "true", "true", "", "Fingerprint-only update"],
    ["success", "true", "true", "v1.2.3", "not confirmed complete"],
    ["failure", "true", "true", "v1.2.3", "Do not assume rollback"],
  ]) {
    const stages = { apply: { outcome: "success" }, stage: { outcome: "success", outputs: { pushed, tag } } };
    const text = summary("publish", { JOB_STATUS: status, AUTO_RELEASE: auto, PUSHED: pushed, RELEASE_TAG: tag, STAGES: JSON.stringify(stages) }, {
      status: "updated", summary: "Validated fixture only", unresolved_sources: ["https://example.org/unavailable"],
    });
    expect(text).toContain(reason);
    expect(text).toContain("Validated fixture only");
    expect(text).toContain("previous values retained");
  }
  expect(summary("publish", { JOB_STATUS: "failure", AUTO_RELEASE: "true", STAGES: "{}" })).toContain("Publication incomplete");
});

test("summary environments allow only stage outcomes, and required successful refresh artifacts cannot be skipped", () => {
  for (const job of ["refresh", "publish"]) {
    for (const match of summaryStep(job).env.STAGES.matchAll(/\$\{\{\s*(.*?)\s*\}\}/g)) {
      expect(match[1]).toMatch(/^steps\.\w+\.outcome$/);
    }
    const text = summary(job, { JOB_STATUS: "failure", NEEDED: "", AUTO_RELEASE: "true", STAGES: JSON.stringify({ bun: { outcome: "failure" } }) });
    expect(text).toContain("Bun setup | failure");
  }
  const condition = wow.jobs.refresh.steps.find((step: any) => step.id === "result").if;
  for (const outcome of ["success", "failure", "skipped"]) {
    for (const exists of [true, false]) {
      const evaluated = condition.replaceAll("always()", "true").replaceAll("steps.refresh.outcome", JSON.stringify(outcome)).replaceAll("hashFiles('wow-refresh-result.json')", JSON.stringify(exists ? "hash" : ""));
      expect(new Function(`return (${evaluated})`)()).toBe(outcome === "success" || (outcome === "failure" && exists));
    }
  }
});

test("CI and release summaries expose failed stages, forced gate and partial publication", async () => {
  for (const [name, failed, forced, reason] of [
    ["ci", "Tests", false, "Release dispatch is blocked"],
    ["ci", "", false, "not a push"],
    ["release", "Upload ZIPs", false, "pipeline is incomplete"],
    ["release", "CI gate", true, "Release pipeline completed"],
  ] as const) {
    const job = workflow(name).jobs[name === "ci" ? "verify" : "release"];
    const step = job.steps.at(-1);
    const stages = JSON.parse(step.env.STAGES);
    for (const key of Object.keys(stages)) stages[key] = key === failed ? (forced ? "skipped" : "failure") : "success";
    const lines: string[] = [];
    const builder: any = {};
    for (const method of ["addHeading", "addTable", "addRaw", "addLink"]) builder[method] = (value: any) => { lines.push(JSON.stringify(value)); return builder; };
    builder.write = async () => {};
    const core = { info: (s: string) => lines.push(s), notice: (s: string) => lines.push(s), summary: builder };
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    await new AsyncFunction("core", "context", "process", step.with.script)(core, {
      eventName: "workflow_dispatch", ref: "refs/heads/main", serverUrl: "https://github.com", repo: { owner: "example", repo: "skills" },
    }, { env: { STAGES: JSON.stringify(stages), FORCE_RELEASE: String(forced), TAG: "v1.2.3", RELEASE_SHA: "fixture" } });
    expect(lines.join("\n")).toContain(reason);
    if (forced) expect(lines.join("\n")).toContain("skipped: force_release=true");
  }
});

test("pipeline workflow shell blocks remain syntactically valid", () => {
  for (const name of ["wow-season-updates", "ci", "release"]) {
    for (const job of Object.values(workflow(name).jobs) as any[]) {
      for (const step of job.steps) {
        if (!step.run) continue;
        const checked = spawnSync("bash", ["-n"], { input: step.run, encoding: "utf8" });
        expect(checked.status, `${name}: ${step.name}: ${checked.stderr}`).toBe(0);
      }
    }
  }
});
