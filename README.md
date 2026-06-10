# Sidekick

Privacy-first, BYOK AI assistant that lives in your browser sidebar. No backend
server — your API key and chat history never leave your device.

> The product name is a placeholder. It is defined in exactly two places:
> `APP_NAME` in [src/lib/constants.ts](src/lib/constants.ts) and the manifest
> `name` in [wxt.config.ts](wxt.config.ts).

## v1 features

- **Bring your own key** — Anthropic API, key stored in `storage.local` only
  (never `storage.sync`, which would replicate it through vendor servers)
- **Persistent sidebar** — Chrome side panel / Firefox sidebar
- **Screenshot tool** — the model can capture the current tab and answer
  questions about it ("Summarize this page")
- **Minimal agent loop** — streaming, tool calls, 5-step cap, Stop button
- **Local history** — conversations stored in IndexedDB (Dexie)

## Architecture

- The agent loop runs **inside the sidepanel page**, not the MV3 service
  worker — the panel lives exactly as long as a conversation, so there are no
  worker-lifetime hacks.
- `src/lib/providers/` defines a provider-agnostic message/tool format; the
  Anthropic adapter (official SDK) is the only implementation in v1. OpenAI and
  Gemini adapters slot in behind the same interface.
- `src/lib/tools/` separates tool *definitions* (schemas the model sees) from
  *executors*. v2 tools that need DOM access (read_page, click) will route to a
  content script via the registry.

## Development

```sh
pnpm install
pnpm dev            # Chrome with hot reload
pnpm dev:firefox    # Firefox
pnpm build          # production build → .output/chrome-mv3
pnpm build:firefox  # → .output/firefox-mv2
```

Load unpacked: `chrome://extensions` → Developer mode → "Load unpacked" →
`.output/chrome-mv3`. In Firefox: `about:debugging` → "Load Temporary Add-on" →
`.output/firefox-mv2/manifest.json`. Brave loads the Chrome build as-is.

Then click the toolbar icon to open the sidebar, paste an Anthropic API key in
Settings, open any page, and hit **Summarize this page**.

## Permissions note

v1 uses `<all_urls>` host permission so the screenshot tool works without a
per-capture user gesture. TODO(v2): switch to optional host permissions
requested on first use.

## Roadmap (v2+)

- OpenAI + Gemini adapters
- read_page (Readability), get_selected_text, highlight-and-ask
- Acting tools (click, fill, navigate) gated behind a human-approval UI —
  page content is untrusted input and the approval gate is the core defense
  against prompt injection
- JSON export/import of chat history
