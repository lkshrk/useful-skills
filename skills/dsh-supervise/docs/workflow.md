# Workflow

Linear AI uses Linear's own fields as the workflow state. There are no workflow state labels, no claim
labels and no plan or dashboard comment formats. Manual sessions share the workspace with the dsh harness,
which works issues delegated to its Linear app.

## Ticket Reference Rule

Whenever an agent switches focus to an issue it names the issue ID, the exact title and a one-line
description.

## Scope

An agent acts on an issue only when one of these holds:

- the human names it (ID or link) in the session;
- it is delegated or assigned to the AI app user.

Batch skills discover work only through the second. Without a team and project already clear from the
session, a skill asks which team and project to handle before discovering issues.

**dsh coexistence:** an issue delegated to the dsh app belongs to dsh, which claims it, opens and answers
its PR and closes it. Do not change its status, description or labels; to take over, ask the human to
undelegate it first.

## State

The status is the state. One mapping for every team:

| Status | Meaning | Who moves it here |
|---|---|---|
| Backlog | needs refinement (description not yet a valid issue) | intake |
| Todo | ready: the description passes `scripts/validate_issue.ts` | refine |
| In Progress | someone is working on it; the assignee or delegate owns it | implement |
| In Review | change handed off for review (PR open or branch ready) | implement |
| Blocked | needs a human decision or an external change; a comment says why | any skill |
| Done | the change is on the main branch, proven by `scripts/verify_closeout.ts` | implement |
| Canceled | dropped | human |

- A team without a Blocked status gets one (type started); `linear-status` in doctor mode reports it.
- There is no separate Triage status; new work starts in Backlog.
- A closing magic word (`Fixes ABC-123`) may move an issue to Done automatically; the implement skill
  still verifies the evidence and posts the closeout comment.

## Claiming

- Before working, the agent sets the assignee (human session) or delegate (AI app) and moves the issue to
  In Progress. That is the claim.
- An issue already In Progress and updated by someone else within the stale threshold (default 60
  minutes) is skipped and reported.
- An issue In Progress with no update beyond the threshold may be reclaimed; the agent posts one comment
  saying it took over.
- Releasing a claim means moving the issue to its next status (In Review, Blocked, Backlog).

## The Issue Is The Plan

Two shapes, two audiences:

- **Forms for people** (`templates/forms.md`): the Linear templates Feature, Bug and Improvements. Short
  fields; an issue in this shape stays in Backlog.
- **The agent format** (`templates/issue.md`, the Linear template "Agent task"): eleven `##` sections from
  Goal to Verify, each heading optionally followed by a hint in parentheses. Refinement translates a form
  into it (mapping in `templates/forms.md`) or fills it directly; there is no separate plan comment.

`scripts/validate_issue.ts FILE` checks an agent-format description and prints every problem. An issue
moves to Todo only when it passes.

Questions during refinement are comments that mention the human; answers are folded back into the
description.

## Labels

- Type labels (`bug`, `feature`, or the workspace's Type group) classify the issue; they do not drive the
  workflow.
- `hard` (dsh): the dsh worker plans the issue on its strongest model. Set it before delegating.
- `Repo` group (`repo:<name>`): which repository an issue changes, required when its project maps to
  several repositories.
- `ai-merge` (project label group): the project's merge mode, `manual`, `auto` or `feature-branch`.
- `epic` (dsh): marks an epic; see Splitting And Parents for when to set it.
- No other workflow labels.

## Comments

One comment per milestone, each ending with a hidden marker so a rerun does not post it twice:

| Milestone | Marker | Content |
|---|---|---|
| refined | `<!-- linear-ai:refined -->` | what was clarified; issue now in Todo |
| blocked | `<!-- linear-ai:blocked -->` | the question or missing authority, mentioning the human |
| handoff | `<!-- linear-ai:handoff -->` | PR or branch, verification commands and results |
| closed | `<!-- linear-ai:closed -->` | the closeout evidence (merge commit on main, CI) |
| takeover | `<!-- linear-ai:takeover -->` | a stale claim was taken over |
| reconciled | `<!-- linear-ai:reconciled -->` | repository evidence and the change `linear-reconcile` made |
| intake (plain language) | `<!-- linear-ai:intake-nontech -->` | marks a non-technical report for technical translation |

## Implementation Rules

- Work happens in `<repo>/.worktrees/<issue-id>[-suffix]`, never in a branch's own checkout, `main` or
  `master`.
- At most five review rounds by default, each followed by a short round summary in the session.
- Integration follows the project's `ai-merge` label: `manual` opens a PR for the human to merge, `auto`
  merges once checks pass, `feature-branch` integrates into `feature/<project>`, which reaches main through
  one PR at acceptance. Without a label: rebase onto the local main branch, squash to the minimal reviewable
  commits and integrate into main, or open a PR when the repository requires one.
- Done only when the change is on main. An open PR is handoff evidence, not completion.

## Splitting And Parents

- An issue too large for one worktree session is split into sub-issues; each sub-issue gets its own valid
  description. The parent stays as the container and is Done when all sub-issues are.
- Three shapes, never more than three levels: a single issue; an **epic** (one shippable piece, 2 to 8
  sub-issues); an **umbrella** issue above several epics. Only leaf issues are implemented; epics and
  umbrellas stay in Backlog and are not in the agent format.
- `blocked by` between sub-issues stays inside one epic: dsh stalls a chain on a blocker outside it. Order
  between pieces is carried by `blocked by` between the epics. Work that waits on something no agent in the
  repository does (an owner-run step, another repository, deployed configuration) is its own issue outside
  the epics, related to the umbrella.
- A larger feature stays in the product's project as an umbrella issue, so it keeps the project's
  milestones and its repository mapping. Give it a Linear project of its own only when it needs its own
  merge mode (`ai-merge: feature-branch`).
- `epic` label: put it on an epic once its sub-issues exist. On an issue without sub-issues it tells dsh
  to do the split itself when the issue is delegated, so add it there only on purpose. An umbrella never
  carries it.

## Repository Boundaries

An issue names its repository: the project's only repository, or the `repo:<name>` label when the project
spans several. A change that needs a
second repository gets its own issue there, linked with `blocks` or `related`.
