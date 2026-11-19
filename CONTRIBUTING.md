# Contributing

Thanks for looking at Unified Band. Small fixes and focused changes are welcome.

## Before you start

- Open an issue first for anything bigger than a fix, so we can agree on the shape of the change.
- `PLAN.md` holds the history of stages and decisions. Skim it to see why things are the way they are.

## Making a change

1. Branch from `master`: `git checkout -b feature/<short-name>`.
2. Make the change. Keep it small and keep the existing structure and naming.
3. Run the checks below.
4. Open a pull request into `master`. `master` only takes pull requests with a green **Validate and test** check.

## Checks

The same three checks run in CI (`.github/workflows/ci.yml`). Run them from the repository root:

```
claude plugin validate .
claude plugin test .
node scripts/smoke-board.mjs out.html
```

- The tests need the Claude Code CLI (the mod's tests import `claude-code/testing`). CI uses version 2.1.302.
- The smoke script needs Node 22.15 or later. It builds the Board page from your ledger, or from synthetic sessions when you have none, and runs its script against a stand-in DOM. Set `REAL=1` to use your real journal as well.
- A change to the Board page should be looked at in a browser too. Serve `out.html` over `http://localhost`, since `file://` pages do not open in some setups.

## Notes on the code

- Text the user sees in the band and in the Board is English.
- A bug fix comes with a test that fails without the fix. New logic with branches gets one small test.
- The Board page is one generated HTML file. Its script lives in strings inside the TypeScript files, so avoid backticks, `${` and backslashes inside those strings.
- Never write a file by reading it, changing the text and writing it back without checking that the read worked: a failed read must not turn into an overwrite.

## Licence

By contributing you agree that your changes are released under the MIT licence in `LICENSE`. `LICENSE-PONYTAIL` covers the code carried over from Ponytail.
