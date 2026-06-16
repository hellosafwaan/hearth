# Hearth — Claude Code instructions

Privacy-first BYOK AI browser sidebar (Chrome MV3 + Firefox MV2, WXT + React 19 + Tailwind v4).
Full architecture, protocols, and how-to recipes: **docs/SYSTEM.md**. Current plan and version
log: **ROADMAP.md**. The product name is Hearth; the repo folder name ("aria") appears nowhere
in code.

## Working agreements

- **Never run `git add`, `git commit`, or `git push`.** Finish the work, then output (1) a
  copy-pasteable `git add <files>` list and (2) a one-line suggested commit message. The owner
  stages and commits himself. (Enforced by deny rules in .claude/settings.json.)
- **The gate** before declaring any change done:
  `pnpm compile && pnpm test && pnpm lint && pnpm build`. There is no CI — this is the CI.
- Update **ROADMAP.md** when finishing or adding planned work.
- Changes to `wxt.config.ts` (manifest) need a full extension reload to test, not a panel refresh.

## Hard constraints (privacy posture — do not weaken)

- No network calls except the user's own provider API calls. No CDN assets (fonts are bundled).
- API keys: `storage.local` only, never `storage.sync`, never in exports or logs.
- Acting tools (anything state-changing) must stay behind the approval gate in the agent loop.
- `permissions.request()` only from a user-gesture handler (Settings buttons), never from tool
  executors — executors return an error pointing to Settings → Permissions instead.

## Conventions

- **Design system:** feature components use semantic token utilities (`bg-surface-raised`,
  `text-muted`, `text-accent`…) and the primitives in `src/components/ui/`. Raw palette classes
  (`zinc-*`, `emerald-*`, hex colors) in a feature component are drift — fix or flag.
- **Tools:** follow the recipe in docs/SYSTEM.md §16 (definitions → executor → registry →
  ToolChip label → prompt guidance → tests). Executors validate input and return
  `{ isError: true, content: [...] }` with messages written for the model — never throw.
- **Providers:** adapters throw `ProviderError` (status + retryAfterMs) from
  `src/lib/providers/errors.ts`; reuse `sse.ts` for SSE. `types.ts` stays types-only.
- **Tests:** grouped under `tests/unit/**` mirroring `src/` (never co-located in `src/`).
  Mock `#imports` via `tests/mocks/imports.ts`. DOM tests: `// @vitest-environment happy-dom`.
- **Cross-context code:** know which of the four runtime contexts a file runs in (side panel /
  content script isolated world / MAIN world / background) — see docs/SYSTEM.md §2. All
  cross-context messages go through the typed unions; extend the union, never send ad-hoc shapes.
- Comments explain constraints the code can't show; match existing density and tone.

## Commands

| Command | Purpose |
|---|---|
| `pnpm dev` / `pnpm dev:firefox` | HMR dev build |
| `pnpm compile` | tsc gate (includes tests/) |
| `pnpm test` / `pnpm test:watch` | vitest (tests/**) |
| `pnpm lint` | biome check src tests |
| `pnpm build` / `pnpm build:firefox` | production build → .output/ |
