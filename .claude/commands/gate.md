---
description: Run the full merge gate (compile, test, lint, build) and report results
---

Run the project's full merge gate and report concisely:

1. `pnpm compile` — TypeScript across src/ and tests/
2. `pnpm test` — the vitest suite
3. `pnpm lint` — biome over src/ and tests/
4. `pnpm build` — production Chrome build

Run them in that order, stopping at the first failure. On failure: show the relevant error
output, diagnose the cause, and fix it if the fix is unambiguous (then re-run the gate from the
top). On success: report one line per step (e.g. test count, files checked) and nothing else.
