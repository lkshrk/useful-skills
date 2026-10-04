# World of Warcraft skills

A set of skills that turn your AI assistant (ChatGPT, Claude or Codex) into a World of
Warcraft helper. Ask in plain language — no commands or coding needed.

## What you can ask

| Skill | What it does | Try asking |
| --- | --- | --- |
| `wow-help` | Quick answers about items, quests, vendors, reputation and game mechanics, with map waypoints. | "Where do I get this mount?" |
| `wow-spec` | Talent builds (with copyable import strings), stats, gems, enchants and consumables. | "Best Frost Mage build for Mythic+?" |
| `wow-account-setup` | One-time setup: connects your existing character data so plans fit *your* account. | "Set up my WoW account for achievement planning." |
| `wow-achievement-plan` | A personal, ordered achievement checklist: quick wins first, realistic times, which character to use. | "Plan the easy BfA achievements I'm still missing." |
| `wow-achievement-dashboard` | An at-a-glance overview of your plan: what's next, progress and routes for tonight's session. | "Make a dashboard for my achievement plan." |
| `wow-duo-world-tour` | A shared achievement route for you and a friend, showing who gets credit for what. | "Plan a 2-hour achievement tour for me and my partner." |

## Install

Download [wow-skills.zip](https://github.com/lkshrk/useful-skills/releases/latest/download/wow-skills.zip)
and double-click it. You get a folder with one file per skill. Don't unzip those.

### ChatGPT

1. Open **Plugins** in the sidebar, then the **Skills** tab.
2. Click **Create** → **Upload from your computer** and pick a file from the folder.
   Repeat for each skill you want.
3. Start a new chat and ask away. ChatGPT picks the right skill by itself.

Web and desktop app keep separate skill lists, so upload in each one you use.
To update, download and upload again.

### Claude app

1. Open **Customize → Skills**.
2. Click **+** → **Create skill** → **Upload a skill** and pick a file from the folder.
   Repeat for each skill you want.

### Claude Code, Codex

```sh
npx skills add lkshrk/useful-skills --skill wow-help wow-spec wow-account-setup wow-achievement-plan wow-achievement-dashboard wow-duo-world-tour
```

## Getting started

1. For quick questions and builds (`wow-help`, `wow-spec`), just ask — no setup.
2. For personal achievement plans, start with *"set up my WoW account"*. The
   assistant uses data you already have — e.g. a WoWthing or Simple Armory
   profile (sites that track your characters), or addon data saved in your
   WoW folder — and only asks for the missing pieces.

## Good to know

- **Output:** plans are saved as simple checklist files you can open anywhere.
  If you use [Obsidian](https://obsidian.md) (a notes app), they can go there instead.
- **Waypoints:** routes come as commands for the [TomTom](https://www.curseforge.com/wow/addons/tomtom)
  map-arrow addon — copy, paste into game chat, follow the arrow.
- **In ChatGPT or the Claude app:** the assistant can't look into your computer,
  so drag any file it asks for (e.g. from your WoW folder) into the chat, and
  download the plans it creates.
- **Sources:** answers link to Wowhead and similar sites so you can double-check.
- **Privacy:** your passwords and login details are never stored, and no addons
  are installed without you.
