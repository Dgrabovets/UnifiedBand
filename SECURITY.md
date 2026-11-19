# Security

## Reporting a vulnerability

Please do not open a public issue for a security problem. Use **Report a vulnerability** on the repository's **Security** tab, which opens a private report. Include what you found, how to reproduce it, and which version you tested.

You will get an answer as soon as the maintainer can read the report. This is a one-person project, so there is no fixed response time.

## What the mod touches

- It reads Claude Code's session transcripts and `~/.config/ponytail`, and writes the task ledger, the event journal and `board.html` there.
- The event journal stores counts and flags, never prompt text.
- Nothing leaves your machine unless you set a webhook URL in the plugin options. Then each finished turn sends the task's row (project, cost, tokens and, if enabled, the task name) to that address. The token is sent only over HTTPS, or over plain HTTP to a local address.
- The Board page is one local file. It loads no scripts and makes no network requests.

## Supported versions

Only the latest release on `master` gets fixes.
