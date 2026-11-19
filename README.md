# Unified Band

Ponytail (mode, skills, task tracking and board) merged with one band above the Claude Code prompt, in a single mod.

## What it shows

- Level buttons: Off, Lite, Full, Ultra (the current level is highlighted).
- Action buttons: Copy, Review, Audit, Board, Compact.
- Two info lines: folder, branch, session age, prompt count, cost; last turn duration, model, cache hit rate, idle time, compactions.
- Cards that stretch to fill each row: Branch, Cost, Tokens, Agent Time, Reuse, Callers, Tests, Context, 5-Hour Limit, Weekly Limit, Project Completion.
- Toasts when a usage limit crosses 80% and 95%.

Project Completion is the share of checked boxes in a Markdown checklist (`- [x]` over all `- [ ]` and `- [x]` lines). The file is `PLAN.md` at the repo root; change it with the `progressFile` option. The card is hidden when the file is missing.

## Requirements

- Claude Code with mod support (hooks modules).
- Node.js on PATH (the mode hooks are Node scripts).
- Disable the original Ponytail plugin: this mod contains its code, and both together double every hook.

## Credits

The mode, skills, hooks, task tracking and board come from [Ponytail](https://github.com/DietrichGebert/PonyTail) by DietrichGebert (MIT, see `LICENSE-PONYTAIL`). Changes: the state key and skill namespace are `unified-band`, the band is redrawn, and the mode tracker also answers `/unified-band:ponytail`.

## Install

```
/plugin marketplace add OWNER/REPO
/plugin install unified-band@unified-band
```

Replace `OWNER/REPO` with this repository's GitHub path.

## Known limits

- The panel covers Ponytail's own row only after it has drawn once. If you see two panels after a reload, the cover hook did not run on your build.
- Buttons are text only: the `Button` element has no icon prop.
- Board opens `~/.config/ponytail/band/board.html`, which Ponytail builds after each turn. It does nothing before the first finished turn.
- Type-checking with `tsc` was not run.

## Test

```
claude plugin validate .
claude plugin test .
```
