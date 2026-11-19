---
name: route
description: >
  Run the model router's classifier on a prompt and show its decision. Useful when
  router.json rules were tweaked and you want to see how a prompt classifies now.
  Usage `/route <prompt>` or `/route --show-last` to print the most recent decisions.
  Ported from auto-model-router (MIT, see LICENSE-ROUTER).
---

# /route

Show how the model router would classify a prompt. Read-only: nothing is written
to the audit log and nothing is dispatched.

## Usage

```
/route <prompt>
```

1. Take the user's `<prompt>` argument.
2. Run the classifier (pure heuristics, no model call). It reads `router.json`
   rules the same way the hook does:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/hooks/router-cli.js" classify "<prompt>"
   ```

   The session model is assumed to be Opus. Add `--parent haiku|sonnet|opus|fable`
   to try another one, and `--plan` to see the plan-mode answer.
3. Show the user the lines it prints: `tier`, `model`, `effort`, `confidence`,
   `band`, `source`, the `reason`, and the action (auto-delegate or silent).
4. If the user wants to apply the decision, dispatch with
   `Agent(subagent_type="unified-band:router-<model>", prompt="<prompt>")`.

## Flags

- `--show-last` prints the last 5 decisions from the audit log
  (`~/.claude/cache/router/audit.jsonl`):

  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/hooks/router-cli.js" last 5
  ```

- `--force-opus`, `--force-sonnet`, `--force-haiku` skip the classifier and route
  straight to that tier: dispatch `Agent(subagent_type="unified-band:router-<model>")`.
