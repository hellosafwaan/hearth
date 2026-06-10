# Sidekick

Privacy-first, BYOK AI assistant that lives in your browser sidebar. No backend
server — your API key and chat history never leave your device.

> The product name is a placeholder. It is defined in exactly two places:
> `APP_NAME` in [src/lib/constants.ts](src/lib/constants.ts) and the manifest
> `name` in [wxt.config.ts](wxt.config.ts).

## Features

- **Bring your own key** — Anthropic API, key stored in `storage.local` only
  (never `storage.sync`, which would replicate it through vendor servers)
- **Persistent sidebar** — Chrome side panel / Firefox sidebar
- **Page tools** — `read_page` (Mozilla Readability extraction),
  `get_selected_text`, and `screenshot`; the model picks the right one
- **Highlight and ask** — select text on any page → right-click →
  "Ask Sidekick about…" → sidebar opens with the quote pre-filled
- **Acting tools with human approval** — `get_interactive_elements` (numbered
  element snapshot), `click_element` / `fill_form` by index, `navigate_to`,
  `open_tab`. Every state-changing action pauses for Approve/Deny in the
  sidebar; per-site "always allow" is managed in Settings. This gate is the
  core defense against prompt injection from page content.
- **Minimal agent loop** — streaming, tool calls, 10-step cap, Stop button
- **Local history** — conversations stored in IndexedDB (Dexie), with
  versioned **JSON export/import** in Settings (never includes the API key)
- **Alt+S** toggles the sidebar

## Architecture

- The agent loop runs **inside the sidepanel page**, not the MV3 service
  worker — the panel lives exactly as long as a conversation, so there are no
  worker-lifetime hacks.
- `src/lib/providers/` defines a provider-agnostic message/tool format; the
  Anthropic adapter (official SDK) is the only implementation in v1. OpenAI and
  Gemini adapters slot in behind the same interface.
- `src/lib/tools/` separates tool *definitions* (schemas the model sees) from
  *executors*. DOM tools (`read_page`, `get_selected_text`) run in the content
  script via a typed message bridge (`src/lib/messaging.ts`) with an
  inject-and-retry fallback for tabs opened before the extension loaded.

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

## Roadmap

- OpenAI + Gemini adapters behind the existing provider interface
- Optional host permissions (replace `<all_urls>`) before store submission
