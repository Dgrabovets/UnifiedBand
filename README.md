# Unified Band

[![CI](https://github.com/Dgrabovets/UnifiedBand/actions/workflows/ci.yml/badge.svg)](https://github.com/Dgrabovets/UnifiedBand/actions/workflows/ci.yml) [![Licence: MIT](https://img.shields.io/badge/licence-MIT-blue.svg)](LICENSE)


Ponytail (mode, skills, task tracking and board) and the model router merged with one band above the Claude Code prompt, in a single mod.

## What it shows

- Level buttons: Off, Lite, Full, Ultra (the current level is highlighted).
- Action buttons: Review, Audit, Board, Compact.
- Two info lines: folder, branch, session age, prompt count, cost; last turn duration, model, cache hit rate, idle time, compactions.
- Cards that stretch to fill each row: Branch, Cost, Tokens, Agent Time, Reuse, Callers, Tests, Context, 5-Hour Limit, Weekly Limit, Project Completion.
- Toasts when a usage limit crosses 80% and 95%.

Project Completion is the share of checked boxes in a Markdown checklist (`- [x]` over all `- [ ]` and `- [x]` lines). The file is `PLAN.md` at the repo root; change it with the `progressFile` option. The card is hidden when the file is missing.

## Requirements

- Claude Code with mod support (hooks modules).
- Node.js 18 or later on PATH (the mode and router hooks are Node scripts; there is no Python dependency).
- Disable the original Ponytail plugin: this mod contains its code, and both together double every hook.
- The model router is built in, so the separate `auto-model-router` plugin is no longer needed. If it is still enabled, the built-in router steps back (see "Model router").

## Credits

The mode, skills, hooks, task tracking and board come from [Ponytail](https://github.com/DietrichGebert/PonyTail) by DietrichGebert (MIT, see `LICENSE-PONYTAIL`). Changes: the state key and skill namespace are `unified-band`, the band is redrawn, and the mode tracker also answers `/unified-band:ponytail`.

The model router (classifier, hooks, worker agents, the routing and planning skills, `/route` and `/route-status`) comes from [auto-model-router](https://github.com/IuriiTurok/auto-model-router) 0.9.2 by iuriiturok (MIT, see `LICENSE-ROUTER`). Changes: the Python hooks are rewritten in Node, the workers and skills are named `unified-band:...`, and the report tooling is left out (see "Model router").

## Model router

A prompt hook classifies every prompt (tier and effort) with heuristics. When the chosen tier is strictly cheaper than the session's own model, the prompt is delegated to a worker agent (`unified-band:router-haiku`, `-sonnet`, `-opus`, `-fable`). Plan-mode and multi-part prompts fan out in parallel waves that never write the same file (skills `auto-model-routing` and `plan-with-models`). Hooks on Agent calls, subagent stops and turn ends write the outcomes to `~/.claude/cache/router/audit.jsonl`, the same log and line format the original wrote; the band and the Board read it.

- Skills: `/unified-band:route <prompt>` shows how a prompt classifies, `/unified-band:route-status` lists recent decisions.
- Opt out: add `#noshift` or `#noroute` to a prompt, or set `CC_ROUTER_DISABLE=1`. `#model=haiku|sonnet|opus|fable` forces a worker. Rules and a default model go in `.claude/router.json` (project) or `~/.claude/router.json` (global): `{"default_model": "sonnet", "rules": [{"match": "typo", "model": "haiku", "reason": "cheap"}]}`. A rule with `"regex": true` is a JavaScript regular expression now.
- Settings by environment: `CC_ROUTER_CACHE_DIR`, `CC_ROUTER_GLOBAL_CONFIG`, `CC_ROUTER_ROUTE_FLOOR`, `CC_ROUTER_CTX_WARN`, `CC_ROUTER_AUDIT_MAX_BYTES`, `CC_ROUTER_AUDIT_RETAIN_DAYS`. The cache folder is under `CLAUDE_CONFIG_DIR` when that is set, else `~/.claude`.
- **Both installed:** when the original `auto-model-router` plugin is enabled (`enabledPlugins` in the user, project or local settings), every router hook here does nothing and the original keeps working, so nothing runs twice. Disable it to switch to the built-in router.
- Not ported: `/router-report`, `tools/usage-report.py`, `tools/analyze-audit.py`, `tools/replay_session_pivot.py`, `bin/cc-route` and the price table. They are reporting and launcher tools built on 1,500 lines of Python; the Board's Model Router page covers the decisions and the estimated savings.

The classifier is checked against the Python original: `tests/router-fixture.ts` holds 232 prompt cases generated from it, and `node scripts/router-differential.mjs <original plugin folder> --hooks` runs both implementations end to end.

## Board

The Board button opens a local page (no server, no network) built from three sources: the task ledger, the event journal and the model router's log. The ledger is one CSV per project and session (`<project>-<session>.csv`, and `<project>-import.csv` from `/ponytail band import`); the Board merges them.

- **Share card** is a poster: the session count as the big number, a line with projects, cost and agent time, four figures (active days, streak, reuse, plan pace) and two bar panels (cost and tokens per day of the chosen period) along the bottom. It is shown whole, scaled to fit.
- **Overview**: four cards with sparklines (Sessions, Agent time, Cost, Tokens), a stacked chart by project, the Activity honeycomb, period 7d, 30d, 90d, All, and the Share and Export buttons: Share holds Share card and Copy summary, Export opens a dialog: pick sections and options on the left, a format (PDF, Markdown, Raw data) on the right, then Download.
- **Projects** (on the Overview page, above Activity) is one table that is also the chart's legend: a swatch shows or hides a project in the chart, filters pick a category, Large projects open their own page. With a project chosen it shrinks to one line. Every project worked on, in four categories (Large, Medium, Small, Chat) scored from turns, cost, sessions, days of work and whether it has a `PLAN.md`. Click a Large project for its own page with all the sections below filtered to it.
- **Context and limits**: context fill curves, fill rate, life before compaction, 5-hour window peaks, burn rate, weekly forecast, blocks.
- **Reuse**, **Model Router** (matrix from your model to the chosen one, savings estimate, last decisions), **Plans** (burn-up, velocity, projects without a plan), **Review and Audit**, **Extras** (cache, tests, cost by model, working hours, expensive sessions, push backs, subagents).
- **Motion**, always on: pages fade in, cards rise in turn, numbers roll like a departures board, lines and charts draw in, the main chart morphs between metrics, the honeycomb pops in as a wave and the hottest cells glow, bars and columns grow, a limit close to its end breathes a red ring, a streak of a week or more throws confetti once, the share card assembles itself, cards glow under the pointer. Only transform and opacity move (plus the clip of a drawing chart and the shape of the morphing one). The system "reduce motion" setting turns all of it off.
- **Project switcher** in the header on every page: all projects, or one of the large ones.
- **Raw data**: one JSON with the ledger, the journal, the router log, the config and every section's numbers, with a schema, for sending to someone who will analyse it. It follows the sections ticked in the Export dialog (the ledger, the journal and the router log are included only when a ticked section uses them). Session titles only if you tick "Include session titles"; "Hide project names" masks the names.
- **Pages**: the sections are tabs, one page at a time. Ad hoc chats (the app's `spare-*` and `scratch-*` folders, `sandbox`, a drive root) are one group, "Chats", counted in sessions and never opened per chat.
- **Export**: every section has Export (PDF, Markdown, CSV). PDF opens the browser's print dialog: choose "Save as PDF". Export all takes any sections, with an option to hide project names. Copy summary puts a short Markdown report on the clipboard.

The event journal lives in `~/.config/ponytail/band/events-YYYY-MM-DD-<session>.jsonl` (one file per session and day): one line per turn, prompt, compaction, `/model` command, subagent turn and review or audit run. It never stores prompt text, only counts and flags. History starts the day the journal is first written.

The dashboard is called Unified Band, with a hexagon-and-bars mark of its own. Set `"title"` in `board.json` to call it something else; the name shows in the sidebar, the tab, the share card and the exports.

### board.json

Optional, next to the journal. Rename a project, force its category, merge two folders into one project (`aliases`) or add folders to the Chats group (`chats`):

```json
{
  "projects": { "SipAndTell": { "label": "Sip & Tell", "category": "Large" } },
  "aliases": { "unified-band": "UnifiedBand" },
  "chats": ["sandbox2"]
}
```

### Checking the page

`node scripts/smoke-board.mjs out.html` builds the page from your real ledger plus a synthetic journal and runs its script against a stand-in DOM. Needs Node 22.15 or later.

## Install

```
/plugin marketplace add Dgrabovets/UnifiedBand
/plugin install unified-band@dgrabovets-plugins
```

Built and tested on Claude Code 2.1.302. The band above the prompt needs a build with mod support; without it only the Ponytail hooks and skills load.

## Known limits

- The router hooks are tested outside Claude Code (scripted payloads against the original), not inside a live session, and `${CLAUDE_PLUGIN_ROOT}` in the `route` skills is not verified on every build.
- The panel covers Ponytail's own row only after it has drawn once. If you see two panels after a reload, the cover hook did not run on your build.
- Buttons are text only: the `Button` element has no icon prop.
- The Board button builds and opens `~/.config/ponytail/band/board.html` from what has been recorded so far; before the first finished turn it shows an empty page.
- Type-checking with `tsc` was not run.

## Test

CI runs the same checks on every pull request and every push to `master` (`.github/workflows/ci.yml`): validate, the tests, and the Board smoke test.

```
claude plugin validate .
claude plugin test .
```
