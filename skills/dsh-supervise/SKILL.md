---
name: dsh-supervise
description: "Use when the user wants Claude to act as supervisor of dsh workers in their place: 'take over as supervisor', 'delegate these issues to dsh and review the PRs', 'keep the workers moving while I'm away'. Not for implementing an issue yourself (linear-implement), refining one (linear-refine) or correcting Linear state (linear-reconcile)."
---

# dsh Supervise

You take the owner's seat. dsh workers write the code; you plan, delegate, review, merge, verify and
report. You write no feature code yourself when a worker can take the issue.

A worker is a dsh session that starts when an issue's Linear delegate is set to the dsh app. It sees its
own issue and the Linear documents that issue links. It does not see your plan, this conversation or the
other issues. Shared rules: `docs/workflow.md` (a delegated issue belongs to dsh).

## Before starting

Collect these from the owner or the repository's agent instructions; ask once for what is missing:

- the Linear tools for setting an issue's delegate and for replying to a comment (a worker's session
  thread is the comment thread Linear opens on delegation; you reply to its root comment);
- where the plan lives, and the repository's verify commands and CI workflow;
- how to see the workers (cluster and namespace, or the harness's own status) and the deployed
  application (URL, namespace, a test login);
- a scheduler in this harness (`CronCreate` in Claude Code). Without one, run step 3 by hand after every
  event and tell the owner that nothing checks while you are idle.

## Yours and the owner's

| You do without asking | Needs the owner's go at that moment |
|---|---|
| Refine, delegate, answer workers, review, send findings back | A direct cluster mutation (`create job`, `exec`, `delete`) |
| Read-only cluster and CI checks, browser checks of the deployed site | Any write to production data, including through the application |
| File follow-up issues in Backlog | A merge that starts production runs or deletes data |
| Merge a reviewed PR, **only inside a recorded merge authority** | A product decision an issue marks as open; anything a permission check refused |

- Merge authority is the one standing approval: the owner says you merge, and you record its scope and
  its exceptions in the plan. Every other approval covers the single step it was given for. Record each
  with its date.
- Write "owner decision" into an issue only after the owner decided. Label a recommendation "proposed,
  waiting for the owner".
- When a permission check refuses an action, stop and tell the owner what you tried and why. Do not reach
  the same effect another way.
- In a question to the owner, name the actor in each option ("Claude merges", "you merge"), never "I/you".

## 1. Plan

Write the plan before delegating (with `writing-plans` if installed). One task per issue, one PR per task.

- Order tasks into waves by dependency and by file collision: two issues that edit the same files never
  run in the same wave.
- Mark the owner gates, and what each task unblocks.
- For every task, write down what the issue leaves open: names, signatures, values, test cases.

## 2. Delegate

Delegate an issue only when it is in Todo, its description is a valid agent-format issue
(`linear-refine`), and everything it depends on is on the main branch.

1. Before delegating, add the task's decisions and the state of main (new module locations, fixtures to
   reuse, open PRs touching the same files) as `###` sub-headings under `## Constraints`. A new `##`
   section makes the issue invalid.
2. End Constraints with the hand-back contract, word for word:
   `Open the PR and hand off; the reviewer merges. Before you hand back: rebase onto main, check that
   GitHub reports the PR mergeable and that CI ran on the head.`
3. Set the `hard` label if the task needs the worker's strongest model. Then set the delegate to the dsh
   app.
4. From then on do not change the issue's status, description or labels. Everything later (answers, new
   facts about main, review findings) goes into its session thread.

## 3. Supervision tick

Set a recurring check, about every 10 minutes (prompt and commands: `docs/tick.md`). It lives only in the
session: a new session sets it up again.

Each tick reads, for every delegated issue that is not Done:

- the issue status **and its session thread**. A hand-back and a question arrive as thread replies; the
  PR alone does not show them.
- the branch and PR: last commit time, mergeable state, CI on the head.
- the workers, read-only; and for merges since the last tick, the rollout (step 6).

A worker is stuck when it shows no thread activity, commit or PR update for 30 minutes, asks a question,
or reports a blocker. Answer in its thread from the plan and the issue; if the answer is the owner's, ask
the owner. Re-delegate only when the worker is gone **and** the thread is silent: say so in the thread,
clear the delegate, set it again. A slow worker that still exists gets a question, not a second worker.

## 4. Review

Every PR gets an independent review before merge. Briefs: `docs/reviewer-brief.md`.

- One reviewer subagent per PR, in its own worktree, given the issue and the PR, not your opinion.
- It runs the issue's Verify block and reports pass, fail and skip counts with every skip reason. A
  skipped test is not evidence: give it a runner that has what CI has (`docs/review-runner.md`).
- It attacks the part where a mistake costs most with throwaway probes: the safety rule, the state
  machine, the migration, the boundary case.
- A change that ships a migration, a scheduled job or new error handling gets a second reviewer for
  failure paths only. A change to a screen is judged from screenshots at phone and desktop width, with
  the texts read in every shipped language.
- Commands in new documentation are checked against the system they describe.
- You decide, not the reviewer. When you overrule a "ready", say so and why.

Send findings back as one message per round in the session thread: what holds, the numbered changes with
the reason for each, what must not change. At most three rounds, then ask the owner. (The workflow's five
rounds are a worker's own limit; each of yours costs a worker run and a review.) Review a later round as
a delta against the **reviewed commit**.

## 5. Merge

Only inside the recorded merge authority; an owner gate is asked for, never assumed. On a project with
`ai-merge: manual` the human merges: report "ready to merge" with the evidence.

1. Ask for a rebase only when the PR has passed review and is next to merge. After every merge the other
   open PRs may conflict again.
2. Compare the rebased head with the reviewed commit; only what you asked for may differ. That head is
   the **approved head**: write its full sha down.
3. When every CI check on the approved head passed, squash-merge pinned to it (`--match-head-commit
   <approved head>`) with your own subject and body: Conventional Commits, `Fixes ABC-123` in the body.
   The worker's PR body does not go to the main branch.
4. dsh closes its issue when the PR merges; check that it did. Then delegate what the merge unblocks.

## 6. Verify after merge

1. Wait for the rollout. Confirm the running image digest is the one CI published for the merge commit
   before you test anything that was dangerous on the old version.
2. Smoke-check the deployed site in a real browser at phone width: the main public pages, the changed
   screen, console errors and 5xx responses.
3. Check restarts and error log lines of the changed workload, and that a migration ran.
4. Exercise the changed behaviour once with read-only requests. A check that writes needs the owner's go.

## 7. Report

After every event (delegation, PR opened, review verdict, merge, rollout verified, blocker) report in a
few lines: what changed, what you verified and how, what you did not verify, what is next. One line when
nothing changed. Keep a notes file of problems with the worker system: date, evidence, suggested change.

Traps seen in practice, with their causes: `docs/tick.md`.

## Without Linear Writes

If Linear write tools are unavailable, do not claim that anything changed in Linear. Print the exact
delegate changes and thread replies the human has to apply.

## Handoff

Finish with: what is merged and verified, what is open and with whom, the approvals recorded, the owner
gates ahead, and that the tick ends with the session.
