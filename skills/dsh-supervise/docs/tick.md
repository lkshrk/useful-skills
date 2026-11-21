# Supervision tick

Create it once per session with the harness's scheduler (`CronCreate` in Claude Code), recurring, about
every 10 minutes on an off minute (`4-59/10 * * * *`). The job dies with the session; the plan says so,
and a new session creates it again. Without a scheduler, run the same steps by hand after every event.

Fill the placeholders and use this as the prompt:

```text
Supervision tick for <goal> (plan: <path to the plan>). Do not stop the work; check and act:
1. Workers: for every issue delegated to dsh that is not Done, read its Linear status and its session
   thread, its branch and pull request, and the workers in <worker namespace> (read-only). A worker counts
   as stuck when it shows no new thread activity, commit or PR update for 30 minutes, asks a question, or
   reports a blocker. Answer the question in the session thread from the plan and the issue; if the
   answer is an owner decision, ask the owner in this session. Re-delegate only when the worker is gone
   and the thread is silent (say so in the thread, clear the delegate, set it again); otherwise ask in
   the thread.
2. Pull requests from delegated issues: review any that was handed back and is not yet reviewed; send
   findings back through the thread. Merge a PR only if the plan records the owner's merge authority, the
   task is not marked as an owner gate, review passed, and CI is green on the approved head; otherwise
   report it as ready and ask.
3. Merged since the last tick: verify the rollout and the deployed site with read-only checks, then
   delegate whatever the plan's waves unblock (decisions and state of main into the issue first).
4. <any long-running job being watched>: if it ended, record its numbers where the plan says.
5. Add any problem with the worker system to <notes file>.
6. Report to the owner in a few lines only what changed since the last tick; if nothing changed, one line.
Never mutate the cluster or write production data in a tick without the owner's go for that step.
```

## One command per tick

Collect the state in one shell call so a quiet tick stays cheap:

```sh
gh pr list --state open --json number,title,isDraft,statusCheckRollup,commits,mergeable,mergeStateStatus \
  --jq '.[] | "#\(.number) draft=\(.isDraft) \(.mergeable)/\(.mergeStateStatus) last=\(.commits[-1].oid[0:8]) \(.commits[-1].committedDate) checks=\([.statusCheckRollup[]?.conclusion] | group_by(.) | map("\(.[0]):\(length)") | join(","))  \(.title[0:60])"'
gh run list --branch main --limit 3 --json name,status,conclusion,headSha \
  --jq '.[] | "\(.headSha[0:8]) \(.name) \(.status) \(.conclusion)"'
kubectl -n <app namespace> get pods --no-headers
kubectl -n <worker namespace> get pods --no-headers
```

An empty `checks=` or a blank conclusion means CI is still running or never ran on that head. The PR list
does not show a hand-back: read each issue's session thread as well.

## Waiting for one PR

To merge as soon as CI is green without spending ticks on it, run a background command that waits and
merges only under stated conditions. `<approved head>` is the full sha you wrote down after comparing the
rebased head with the reviewed commit; never read it from the PR inside this command.

```sh
timeout 1500 gh pr checks <n> --watch --interval 30 >/dev/null 2>&1
ok=$(gh pr checks <n> --json bucket --jq 'length>0 and all(.[]; .bucket=="pass" or .bucket=="skipping")' 2>/dev/null)
if [ "$ok" = true ]; then
  gh pr merge <n> --squash --match-head-commit <approved head> --subject "<subject> (#<n>)" --body "<body>"
else
  echo "NOT MERGED: checks are not all passed (failed, cancelled, pending or none reported)"
fi
```

- With no checks reported, `gh pr checks` prints a message instead of JSON, `ok` is not `true`, and
  nothing merges. A cancelled or failed check has another bucket and blocks as well.
- `--match-head-commit` refuses the merge when the branch moved after your comparison, so a push after
  the review cannot be merged unseen.
- Use it only for a PR inside the recorded merge authority.

## Traps

| Symptom | Cause |
|---|---|
| Checks of the deployed site fail with a login redirect after they worked | A stored test session outlived its rights. Log in fresh before each check. |
| A worker says "ready" and the PR is conflicting with no CI run | It skipped a rebase asked for in passing. Ask for the rebase as its own message. |
| Every open PR conflicts after each merge | All PRs append to one shared file. Rebase one PR at a time, in merge order, and file an issue for the cause. |
| The refined issue no longer validates | A section was appended to it. Read the repository's issue validator before adding structure to an issue. |
| Reviewer worktrees pile up | Each review leaves one. Remove them when the PR is merged. |
