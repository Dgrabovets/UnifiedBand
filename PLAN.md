# Plan: the new Board and its statistics

Status: the plan is agreed and the decisions are at the end of the file. Ticks are set as the work goes; the Project card on the band counts them for the completion percentage.

## Goal

The Board becomes one page about your work with Claude Code: no project or session pickers, a lot of statistics, and export of any section alone or all together. The Copy button leaves the band and moves into the Board.

## What stays from the first Board

- four cards with a chart inside: Sessions, Agent time, Cost, Tokens;
- the period switch 7d, 30d, 90d, All;
- the big per-day chart (stacked area) with tabs Agent time, Cost, Tokens;
- the Activity block: a hexagon map of the last 12 weeks, Active days, Streak, Busiest day, Longest session, Average per session, Average cost per session;
- the Share card button (a picture card to post).

## What goes away

- the global project and session picker in the side panel and every list that depended on it. Only the pages of large projects stay (see "Project categories");
- the Copy button on the band above the prompt (the function moves into the Board);
- extra fields of the old Board.

## Data: what exists and what must be collected

| Section | Exists now | To add |
| --- | --- | --- |
| Overview | task CSV (cost, turns, minutes, tokens, reuse, tests, level, model) | nothing |
| Context and limits | only the last value on the band | a journal: context and limit percent on every turn, compactions |
| Reuse | reuse_pct, reused, new, callers_open in the CSV | nothing, only show it |
| Model Router | the router's audit.jsonl | a link to the outcome: was the model corrected after the decision |
| Plans | the percent from PLAN.md, only now | a done/total snapshot on every turn, a list of projects without PLAN.md |
| Review and Audit | nothing | a journal of runs and the number of findings |

The event journal sits next to the CSV, one line per turn: time, session, project, context, 5-hour and weekly limits with reset times, cost, model, router decision, compaction flag, done and total from PLAN.md. The mod writes it. History before the journal is not available; the context and limit charts start on the first day of recording.

## Project categories

The Board has to tell a large project from a small one and from a one-question chat. Options were:

- **A. By size of work.** Chat: under 8 turns and under $1. Small: up to 50 turns. Medium: up to 200 turns or $25. Large: more. Simple, but a project with ten short sessions can look small.
- **B. By project traits.** Chat: no git repository. Experiment: a repository and at most two sessions. Project: three or more sessions or a PLAN.md. Big: ten or more sessions or over $100.
- **C. Points (recommended).** Turns, cost, number of sessions, number of working days and the presence of a plan add points; the sum gives four categories: Chat, Small, Medium, Large. Any project can be moved by hand in `board.json`.

Chosen: C.

Large projects get their own page with the same sections as the whole Board, for that project only. Nice names (for example "Sip & Tell" instead of the folder name) and manual moves between categories live in `board.json`.

## New sections

### Context and limits

- context fill rate, how long a context lives, compactions per session;
- 5-hour limit: burn rate, windows that reached 95%;
- weekly limit by day and a forecast to the end of the week.

### Reuse (how well Ponytail works)

- reuse share by week and by level (lite, full, ultra);
- new code created against code reused; callers left open; tasks without tests run;
- level comparison by cost and turns per task (a correlation, not proof).

### Model Router

- funnel: all prompts, skipped as too short, kept on your model (silent), routed, corrected by you afterwards;
- distribution by model, effort and tier, average confidence, most common reasons;
- estimated savings in dollars; a signal when the router routes nothing for a long time.

### Plans and pace

- done and total from PLAN.md on every turn: points per day, burn-down, completion forecast;
- projects without a PLAN.md and projects with a stalled plan.

### Review and Audit

- runs per project, findings per report (the skills end a report with `PONYTAIL_RESULT kind=review findings=N high=M`).

### Extras

Cache hit share by day, cost per closed plan item, tests (share, failures, turns to green), cost by model, a weekday-by-hour map, most expensive sessions and outliers, short corrections per 100 turns, compactions, subagents, time per Ponytail level.

## Export

- every section has Export: Markdown, CSV, JSON, PDF;
- Export all with a choice of sections; Raw data (one JSON for analysis);
- project names are shown; "Hide project names" is available and off by default;
- Copy summary in the Board header copies a short Markdown report.

## Style

Like the first Board: dark theme, large rounded cards, monospaced figures, a chart inside the card, the same period switch. Colour is never the only signal. Animations are off under `prefers-reduced-motion`.

## Stages

Sizes: S about half a day, M a day, L two days.

### 0. Agreement (S)

- [x] Agree this plan
- [x] Pick the metric options in every section
- [x] Pick the project category option
- [x] Write the plan rule into the global CLAUDE.md
- [x] Agree the section mock-ups

### 1. Data (M)

- [x] Event journal: format, a write on every turn
- [x] Journal write test
- [x] PLAN.md snapshots on every turn
- [x] Journal of Review and Audit runs and the result line in the skills
- [x] Link a router decision to a model correction

### 2. Board frame (M)

- [x] Remove the project and session pickers
- [x] Keep Overview: four cards, big chart, Activity
- [x] Projects card with categories (option C, points)
- [x] board.json: nice names and manual category moves
- [x] A page for every Large project
- [x] Section navigation and the period switch everywhere

### 3. Sections (L)

- [x] Context and limits
- [x] Reuse
- [x] Model Router
- [x] Plans
- [x] Review and Audit
- [x] Extras (cache, cost per plan item, tests, cost by model, weekday map, outliers, corrections, compactions, subagents, level time)

### 4. Export and band (M)

- [x] Export per section and Export all
- [x] Remove the Copy button from the band
- [x] Copy summary in the Board

### 5. Checks (M)

- [x] Board generation tests on fixtures
- [x] Check on real data
- [x] Screenshots for approval
- [x] Translate PLAN.md into English before publishing the repository
- [x] Update README and the repository

### 6. Board, second pass (S)

- [x] Ad hoc chats in one Chats group
- [x] Sections as tabs
- [x] Layout without overlapping blocks
- [x] PDF export (print to PDF)
- [x] Share card with the main figures

### 7. Board, third pass (S)

- [x] A more compact Activity honeycomb
- [x] A project picker in the header of every page
- [x] Raw data export

### 8. Board, animations (S)

Always on, one rich level; the system "reduce motion" setting turns everything off.

- [x] Page and card entrance, rolling figures, charts drawn left to right
- [x] Honeycomb wave and pulse, router matrix, bars growing
- [x] Menus and dialogs with a soft zoom; pressed and hover states
- [x] Chart morph between metrics, confetti on a 7-day streak, a breathing red limit card, glow under the pointer

### 9. Board, polish (S)

- [x] Honeycomb glow is not clipped by its box
- [x] Projects on the Overview page, before Activity
- [x] Final check of all current functions

### 10. Board, projects table (S)

- [x] The legend chips and the Projects card are one table: a swatch shows or hides a project in the chart, category filters
- [x] A chosen project shrinks the block to one line

### 11. Board, name, logo, table (S)

- [x] No Projects caption or hint line, no Open button, Select all and Select none
- [x] The dashboard is called Unified Band (the `title` key in board.json renames it), with a logo of its own

### 12. Audit fixes (M)

- [x] The event journal is one file per session and day, and a failed read no longer overwrites a file
- [x] The task ledger is one file per project and session, the import writes its own file, the Board is built only on the button press
- [x] A broken board.json costs only the config; hiding project names changes values only (tested)
- [x] An empty category in the projects table says so; dead CSS and JS removed
- [x] Author and licence in place, PLAN.md in English

### 13. Board, review notes (M)

- [x] Category pills with a separator, a header checkbox for multi-select, a clearer session subtitle
- [x] Large numbers as K, M, B
- [x] Last decisions can be sorted (with a Move column); plans of Chats are not counted
- [x] The model and the cache share are read from the end of the transcript with node (grep is missing on Windows)
- [x] Header: Share menu (Share card, Copy summary) and an Export button; Export dialog with PDF, Markdown and Raw data rows (JSON removed)
- [x] Share card as a poster: sessions as the big number, four figures and the period stream; shown whole in the dialog

### 14. Board, export dialog polish (S)

- [x] A custom checkbox in the Board's own style, with a mixed state
- [x] Raw data follows the ticked sections; "All" checkbox; Options set apart from Sections
- [x] The Share card no longer goes empty when every project is hidden in the table
- [x] A click anywhere on a project row shows or hides it
- [x] The Share card strip is two panels, cost and tokens per day, one rounded bar per day, each with its maximum and the date ends
- [x] Export dialog is split: sections and options on the left, format cards and one Download button on the right

### 15. Built-in model router (L)

Port auto-model-router 0.9.2 into this mod, in Node, so it needs no separate install and no Python.

- [x] Read the original (hooks, agents, skills, commands, tests) and decide what is ported
- [x] Check what the test loader accepts: CommonJS cannot be imported, so the logic is ESM modules with no imports and the hook script is a thin CommonJS wrapper
- [x] Classifier, decision, audit rows and waves as pure modules (`router-core.mjs`, `router-audit.mjs`, `router-waves.mjs`)
- [x] Hook wrapper and disk helpers (`router-hook.js`, `router-io.js`), registered in `hooks.json`
- [x] Differential test: 232 cases from the Python original in `tests/router-fixture.ts`, plus `scripts/router-differential.mjs` for end-to-end runs
- [x] Ported unit tests: waves, audit rows, session usage, reconcile
- [x] Agents `unified-band:router-*`, skills `auto-model-routing`, `plan-with-models`, `route`, `route-status`
- [x] Guard: the hooks do nothing while the original plugin is enabled
- [x] `LICENSE-ROUTER`, README Requirements, Credits and a Model router section
- [ ] Run the hooks inside a real Claude Code session (not done in this stage)
- [ ] `/router-report` and the Python report tools (left out on purpose)
- [x] Full check of the router: the differential run again, edge cases (bad input, UTF-8, rotation, concurrency, opt-outs, latency) in `scripts/router-edge.mjs`, and a live run in a real Claude Code session (a forced `#model=haiku` delegation reached the `unified-band:router-haiku` worker and left its audit rows)
- [x] Fixed what the check found: the conflict guard let "any settings file says enabled" win instead of the narrowest one, and the band and the Board counted outcome rows as decisions


## Decisions

1. Project categories: option C (points), plus a page for every large project.
2. Metrics: all my suggestions are in; other sections use the recommended options.
3. Context and limit history starts when the journal is switched on: accepted.
4. Project names are shown in exports, hiding is optional.
5. This plan is translated into English before the repository is published.
6. Mock-ups are agreed. Copy summary, Export all and Share card form one group. Charts are smooth, bars fully rounded. Router shows a matrix "your model to chosen model" plus a table of the last decisions.

Category thresholds stay tunable: look at your real data first, then fix them.
7. Built-in router: the original plugin is detected through `enabledPlugins` and the built-in hooks step back; the audit log path and line format stay the original's.
