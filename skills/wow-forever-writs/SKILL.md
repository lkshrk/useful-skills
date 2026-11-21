---
name: wow-forever-writs
description: Rank WoW Forever Craftsman's Writs by auction house cost from the user's Auctionator scan - the cheapest writs of a tier (writ price plus the requested item), or the best Merchant's Favor reputation per gold across all tiers. Use for "check the writs", "cheapest artisan writs", "top 10 writs", "best writs for reputation" or writ prices. WoW Forever only.
---

# WoW Forever Writs

Answer from the user's own auction data: what a Craftsman's Writ costs to buy and complete. A writ's cost is its auction price plus the price of the item its quest asks for. Default to a chat table, not a file.

## Pick the ranking

| Request | Run |
| --- | --- |
| "check the writs", no details | `--tier artisan --top 10` (the default) |
| cheapest X of a tier ("5 cheapest expert writs") | `--tier <artisan\|expert\|journeyman> --top X` |
| best reputation per gold, cheapest reputation | `--sort rep` (all tiers unless one is named) |

Tiers come from the writ quest's reputation reward: journeyman 75, expert 125, artisan 200 (Sealed Journeyman's/Expert's/Artisan's Writ).

## Run

From this skill's directory:

```sh
python3 scripts/writs.py --file <Auctionator.lua> [--tier artisan|expert|journeyman|all] [--top N] [--sort price|rep] [--realm NAME] [--json]
```

- The file is the account-wide `<WoW folder>/_forever_/WTF/Account/<account>/SavedVariables/Auctionator.lua`. Instead of `--file`, pass `--wow-dir <WoW folder>` or set `WOW_DIR`; without either, the script tries common install locations. If nothing is found, ask the user for the WoW folder once and reuse it. In an app without file access, ask for that file as an upload.
- `--realm` defaults to the most recently scanned realm. Each account file is reported separately.
- Only items seen on the latest scan day count: anything Auctionator last saw earlier is no longer listed, and its writ goes to "Not in the latest scan".
- Only the standard library is used; the saved file is parsed as data, never executed.

## Report

- Show the table as printed, with the latest scan date. Auctionator writes its file only on `/reload` or logout: if the latest scan is not from today, say so and suggest scanning the Forever auction house, then `/reload`.
- Flag single outliers worth checking in game, such as a writ or item priced at a few copper or silver while its neighbours cost gold.
- List the writs not in the latest scan as the script prints them; do not guess their cost.
- The Turn-in column is the zone and map coordinates of the NPC that takes the writ.
- Prices are the latest minimum buyout (copper converted to g/s/c). For crafted gear the cheapest listing at any item level counts.

## Data

`assets/writs-forever.tsv` holds the 150 Forever writs: tier, profession, required skill, writ and quest IDs, requested item ID and name, `qty`, reputation, and the turn-in NPC, zone and map coordinates. The turn-in is not recorded yet for 19 writs (all artisan) and shows as `unknown`; when the user names the place, fill in that row. The client does not include how many items a writ asks for, so `qty` is 1 everywhere. When the user reports a different count, or a new writ appears in game, edit or add that row by hand.
