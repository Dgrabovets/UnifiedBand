---
name: route-status
description: >
  Show recent model router decisions and a rolling distribution of model routings.
  Reads ~/.claude/cache/router/audit.jsonl. Ported from auto-model-router (MIT,
  see LICENSE-ROUTER).
---

# /route-status

Print a summary of recent router activity. Read-only.

```bash
node "${CLAUDE_PLUGIN_ROOT}/hooks/router-cli.js" status
```

It prints:

1. The **last 20 decisions**, newest first, one line each:
   `<ts>  <band>  <model>/<effort>  conf=<0.xx>  <reason, truncated>`.
2. The **distribution over the last 7 days**: decisions by model and by band.
   The live log and its rotated `audit.jsonl.<stamp>` files are both read.
3. `No auto-router activity yet. Send a prompt to see decisions.` when the log
   is missing or empty.

Show the output to the user as it is. Realized cost and follow-through per
dispatch are on the Board (the Model Router page).
