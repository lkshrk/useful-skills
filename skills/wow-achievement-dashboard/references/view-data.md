# View data schema (version 1)

This is the Obsidian renderer contract, not a format a website is expected to supply. Plain Markdown output does not require the renderer, its vault/block-link syntax or this schema. Normalize website/addon observations and research into it. The bundled model exposes `validate(data)` to reject malformed values; runtime code also checks that canonical tasks are indexed.

When available, `wow-account-setup`'s importer supplies scoped Collector/ATT observations and coverage. Its `wow-account-observations` JSON is a separate source contract: enrich it with verified account state and researched task decisions before creating this view data. Do not rename/copy the observation file over the dashboard dataset.

## Root fields

| Field | Meaning |
| --- | --- |
| `schema_version` | `1` |
| `is_demo` | `true` for synthetic examples; renders a prominent demo notice |
| `account` | Account alias, or null before import |
| `snapshot_date` | Observation date string, or null; download time alone is not observation time |
| `account_ap` | Confirmed nonnegative AP total, or null; never update it from checkboxes |
| `validation` | `reconciled` boolean; if true, `completed_records` and `calculated_completed_ap` must support the displayed total |
| `task_sources` | Unique vault-relative source note paths, including `.md`; exclude view/session notes and backups |
| `research_source` | One of those source paths, used to partition Backlog versus Todo |
| `characters` | Character display identities for filters; preserve realm and account scope |
| `tasks` | Canonical achievement records described below |
| `shopping` | Purchase rows described below; use an empty array if unresearched |
| `shopping_note` | Optional dated inventory/currency coverage explanation |

Paths use forward slashes, may contain spaces, and must not be absolute or traverse outside the vault. Do not put credentials in data or notes.

Display strings (achievement/item names, instructions, currency labels, availability notes and waypoint labels) may use the user's requested language and Unicode. Preserve observed character/realm identities verbatim, including accents and non-Latin scripts; reuse the same identity in root, task and shopping records. Join imported state by stable IDs/GUIDs, never by translating names. Schema keys, enum tokens, category tags, numeric IDs, block IDs and command/API syntax stay unchanged: `game_state: incomplete` remains `incomplete`, not a translated value. Built-in renderer controls currently remain English.

Wowhead links must use HTTPS on exactly `www.wowhead.com`, the matching entity type and numeric ID. An optional two-lowercase-letter locale segment is accepted, for example `https://www.wowhead.com/de/achievement=7` or `https://www.wowhead.com/fr/item=159`. Slugs, queries and fragments are accepted after the ID. Use a verified localized page when available; otherwise retain the canonical English link and explain the fallback. URL syntax validation does not establish that a locale or page exists.

## Achievement record

Required: `id` (unique positive achievement ID), `name`, `points`, `game_state` (`completed/incomplete/unknown/unobtainable`), `source` (in `task_sources`), `link` (vault path plus block anchor), exact matching `wowhead_url`, `categories`, `characters`, `players`, `readiness`, `planning_min`, `planning_max`.

- `categories`: one or more of `quick-wins`, `buyable`, `grindable`, `long-term`, `needs-help`, `unclassified`. Unresearched category membership stays unclassified.
- `players`: `solo/group/unknown`; `readiness`: `ready/conditional/verify/blocked`.
- `planning_max`: conservative full completion-session minutes, positive or null. Unknown helper/rotation/throughput conditions must remain visible in readiness and instructions.
- `planning_min`: nonnegative lower bound not exceeding max, or null. For unknown max, min is null. Recurring session targets are not full completion duration.
- `characters`: verified eligible identities, or an empty array. Names mentioned only as conditional alternatives belong in detailed instructions, not the eligible filter.
- Optional `pilot: true` marks a curated next-action subset (the field retains the original model name). With none marked, the dashboard defaults to all tracked work.
- Optional `next_step` gives the immediate actionable check or instruction.
- Optional `limits_summary` records the method's one-time/repeatable/capped/availability/resource rules and any uncertainty. Include this concise summary in `next_step` and the canonical task text for visibility in the existing views; the extra field does not itself render a new column or enforce resets. Separate repeatability of rep/loot/currency/criteria when they differ.
- Optional `availability` is an array of condensed check rows: `expansion_order` (nonnegative integer), `expansion`, `continent`, `area`, `what`, `check_note` (strings), `tomtom` and `checks` (string arrays). Use verified complete commands; `tomtom` entries require explicit numeric UI map selectors (`/way #MapID ...`), never zone-name selectors. Empty arrays explicitly mean unverified/unavailable, never fabricated coordinates or APIs. Rows render by expansion order then location; several locations can reference one achievement without duplicating its reward. Flagged tasks leave ordinary selection and enter `partition().availability`; manual/source completion still takes precedence. `select(..., {includeScheduled:true})` is an explicit opt-in, not evidence the activity is up.
- Optional `queue: execute/research` assigns the current view without relocating the canonical source. Without it, source-path partitioning remains the default.
- Optional `record_kind: achievement/meta` marks automatic meta rewards. Meta records remain in research/history but are excluded from executable recommendations and purchase allocations; link their verified prerequisites in project notes.

Corresponding source task:

```markdown
- [ ] #wow/category/quick-wins **[Achievement name](https://www.wowhead.com/achievement=ID)** — planning details ^ach-ID
  - Researched instructions, requirements, Wowhead links and verified TomTom copy blocks.
```

Replace ID/name/details with real researched values; this is syntax, not an achievement recommendation. Imported completion has priority over a local uncheck. Other checked tasks are manually reported completion. Nonblank custom statuses other than `x/X` are excluded by the default model; adapt explicit status mapping if the vault uses another convention.

Action/session tasks should live outside `task_sources`. If included as nested actions, mark their task metadata `kind: action` or use an `action-` block ID so an incidental achievement link cannot be mistaken for a completion checkbox. Multiple achievements awarded by one action remain distinct per-achievement records; the action is not an extra AP reward.

## Shopping row

Required: unique `purchase_id`, positive `item_id`, `name`, matching `https://www.wowhead.com/item=ID` URL (or localized form described above), `unit_cost` (nonnegative or null), `currency_label`, `owned_usable` (nonnegative or null), `character` and `allocations`.

Each allocation is `{achievement_id, quantity}`, pointing to an existing achievement. Allocations are authoritative researched consumption requirements; sum separate consumptions and share stock only when reuse/transfer is established. Avoid allocating the same stock to several purchase rows. A checked/game-complete/cancelled/unknown task contributes no remaining purchase allocation.

The model sums active allocations, subtracts known usable stock, and multiplies the remaining quantity by the known unit cost. Unknown inventory yields a range up to the required quantity; unknown price displays as unknown, not free. Currency labels are data-driven: gold, a named currency or another explicit unit. Document price/stock observation dates, source, vendor access and coverage limits in `shopping_note` and the canonical instructions.

## Migration and scope limits

Earlier local pilot JSON is not automatically compliant: add purchase IDs/currency labels, replace concrete file paths, and validate sources, identities and unknown values. Do not bring old totals, instructions or personal records into the portable fixture.

The renderer shows direct base AP. It does not automatically infer meta cascades or assume combined task/route rewards are additive. Keep researched bonus scenarios in explicit route/project details until a tested per-account reward allocator is supplied. Full import history, feedback and duo routing remain planning-layer records linked from these views.
