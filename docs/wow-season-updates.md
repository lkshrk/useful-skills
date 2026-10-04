# Weekly AI refresh of the WoW setup bundle

The **WoW seasonal bundle refresh** workflow runs every **Monday at 06:17 UTC**. It checks the public sources, uses AI to research relevant changes, and, once CI passes, **merges verified updates into the bundled JSON data and publishes a patch release**.

Run it manually from **Actions → WoW seasonal bundle refresh → Run workflow**. Select **force_refresh** to recheck recommendations even when monitored source fingerprints have not changed.

## One-time setup

1. Choose direct OpenAI or a custom gateway using the settings below. Keys go under **Repository Settings → Secrets and variables → Actions → Secrets**; non-secret settings go under **Variables**. Do not paste keys into chat or repository files. The AI step uses your selected provider's API quota/billing.
2. Configure the model: optional for direct OpenAI, required as an explicit gateway model alias for custom gateways.
3. Put the workflow on the GitHub default branch and enable Actions. Repository/branch rules must allow the GitHub Actions bot to push to the default branch and create tags. The workflow uses its built-in GitHub token; the release step additionally needs the existing `MARKETPLACE_PUSH_TOKEN` secret to bump the marketplace.

| Mode | Repository variables | Repository secret |
| --- | --- | --- |
| Direct OpenAI | Leave `WOW_REFRESH_BASE_URL` unset; `WOW_REFRESH_MODEL` is optional | `OPENAI_API_KEY` |
| Custom gateway | `WOW_REFRESH_BASE_URL` and `WOW_REFRESH_MODEL` | `WOW_REFRESH_API_KEY` |

Gateway example: base URL `https://gateway.example.com/v1`, model `your-model-alias`. Provide the complete API **base URL**, including the gateway's required path prefix; do not append `/responses` or `/chat/completions`. The workflow validates the URL and supplies the gateway key as a bearer credential through an environment reference, not in command arguments or files.

The gateway must be reachable from the GitHub-hosted runner and support **OpenAI Responses API streaming, Codex tool calls and structured output**. Chat Completions compatibility alone is insufficient. A private LAN-only gateway needs runner/network connectivity configured separately. WebSockets are disabled for this custom provider; HTTP streaming is used. This does not promise compatibility with every gateway/model combination. [Codex custom providers](https://learn.chatgpt.com/docs/config-file/config-advanced), [provider protocol configuration](https://learn.chatgpt.com/docs/config-file/config-reference).

The agent step uses the documented [Codex GitHub Action](https://learn.chatgpt.com/docs/github-action). In gateway mode its built-in OpenAI API-key/proxy path is left unused and Codex selects the custom provider explicitly. Missing gateway settings fail rather than falling back to OpenAI or a different model. Unchanged source checks do not invoke AI.

GitHub can delay scheduled runs and can disable schedules in public repositories after 60 days without repository activity. Re-enable the workflow in Actions if necessary. This is a GitHub schedule, not a cron job on your computer. [Schedule documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)

## What happens each week

1. **Detect:** compare guide content, linked item/spell tooltips, Retail spec roster and season metadata with the saved fingerprints.
2. **Research and update:** the agent reads changed sources and edits affected stat guidance, gems, enchants, consumables, conditions and provenance. It must write actual data updates, not merely refresh hashes.
3. **Validate in a separate job:** trusted code accepts only bundle JSON, checks game/season/spec coverage and references, and independently fetches changed catalogue identities and accepted replacement guides. A guide newly cited for a spec is checked with that spec's ownership, even if another spec already used the URL. Changed advice must have its own successfully checked guide; an unrelated successful lookup cannot justify it.
4. **Drop negligible changes:** edits confined to dates, patch labels, source lists, gap notes or cosmetic wording are reverted. Only changes to what a player should use or do count as an update.
5. **Stage and test:** the commit goes to `automation/wow-season-refresh` and CI is dispatched on it (pushes made with the workflow token do not trigger CI on their own).
6. **Merge and release:** once CI passes, the default branch is fast-forwarded to the staged commit. A real update also gets a patch version bump, a tag and a GitHub release (with the AI summary as release notes), which updates the marketplace. A fingerprint-only change is merged without a release. Only source changes the agent successfully handled have their fingerprints advanced.

The agent job has read-only repository permissions and no stored Git push credentials. The separate publishing job has write permission and executes trusted repository code rather than code from the agent's candidate. Workflow files, scripts, tests and credentials are outside the candidate's allowed scope.

If another commit reaches the default branch during the refresh, publishing stops and leaves the candidate on the staging branch. It does not force-push over newer work. Branch protection is respected; a rejected push leaves a failed run and the candidate available for inspection.

**Off switch:** set the repository variable `WOW_AUTO_RELEASE` to `false` to review updates first. The workflow then opens a pull request from the staging branch instead of merging, and does not release; run `make release-create VERSION=patch` after merging. This mode needs **Settings → Actions → General → Allow GitHub Actions to create and approve pull requests**.

## Missing or ambiguous sources

Keep the last verified values and dates for unresolved advice. The agent can record a new limitation and publish unrelated verified updates; it cannot approve an inaccessible source as fresh. The publisher rejects blocked candidates, broken references, deleted records, wrong-season data and unverified replacement identities.

The initial check can read **133 of 138 sources**. Four Icy Veins pages and one Kalamazi page have known automated-access gaps. They stay visible and are not counted as unchanged. New failures trigger an attempted refresh; known gaps alone do not spend API credits every week.

A partial result lists unresolved URLs. A blocked result publishes no data. AI/source checks reduce mistakes but do not prove a personalized optimum or replace in-game validation.

## Results and scope

Read the run's **Summary**. Artifacts are retained for 30 days:

- **wow-source-observation** — pre-agent source observations.
- **wow-refresh-candidate** — candidate JSON bundle.
- **wow-refresh-result** — structured changes and unresolved-source summary.

Recommendation updates appear as **fix(wow): refresh seasonal setup bundle** followed by **chore: release vX.Y.Z**; fingerprint-only runs as **chore(wow): advance seasonal source fingerprints**. If nothing changed, no commit is created. Notifications follow your GitHub Actions notification settings.

The initial write scope is Retail **season-mn-2**. A new season is detected but is not silently substituted into this season's records; migration of the bundle and workflow target is a separate change. Talent-ranking snapshots, personal accounts, private logs and auction-house prices are not part of this seasonal refresh.

Maintainer checks:

```sh
python3 scripts/check_wow_season_updates.py
python3 scripts/check_wow_season_updates.py --json
python3 scripts/test_apply_wow_season_refresh.py
bun test
```

The standalone checker remains read-only. The workflow's publishing job is what validates, writes, merges and releases updates.
