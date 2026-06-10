# Sidekick

Privacy-first, BYOK AI assistant that lives in your browser sidebar. No backend
server — your API key and chat history never leave your device.

> The product name is a placeholder. It is defined in exactly two places:
> `APP_NAME` in [src/lib/constants.ts](src/lib/constants.ts) and the manifest
> `name` in [wxt.config.ts](wxt.config.ts).

## Features

- **Bring your own key — or no key at all** — Anthropic API with your key, or
  any **OpenAI-compatible server**: LM Studio / Ollama / llama.cpp locally
  (completely free, inference never leaves your machine) and hosted services
  (OpenAI, OpenRouter, Groq) via base URL + key. Keys live in `storage.local`
  only (never `storage.sync`, which would replicate them through vendor
  servers).
- **Persistent sidebar** — Chrome side panel / Firefox sidebar
- **Page tools** — `read_page` (Mozilla Readability extraction),
  `get_selected_text`, and `screenshot`; the model picks the right one
- **Page intelligence** — `get_page_tech` (what's this site built with —
  framework/CMS/analytics fingerprinting with evidence), `get_page_metadata`,
  `find_in_page` (scroll-to + highlight), `scroll`, `wait`, `list_tabs`
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
- `src/lib/providers/` defines a provider-agnostic message/tool format with two
  adapters: Anthropic (official SDK) and OpenAI-compatible (covers local
  runtimes and most hosted services). Per-model capability toggles in Settings
  (tool calling / vision) gracefully disable tools a small local model can't
  handle. A Gemini adapter slots in behind the same interface.
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

Host access is **optional**, requested at runtime: the install prompt stays
clean, and the sidebar shows a one-time "Grant page access" button (revocable
in Settings). Without the grant the assistant is chat-only. Local/hosted server
origins for the OpenAI-compatible provider are requested when you save those
settings. Stored screenshots are downscaled to ≤768px to keep IndexedDB and
follow-up token costs small — the live turn still sees full resolution.

## Local models

Settings → Provider → "Local / OpenAI-compatible (free)".

- **LM Studio**: `lms server start` (or Developer tab → Start Server), pick the
  preset, hit Fetch to list your downloaded models.
- **Ollama**: must allow extension origins — start it with
  `OLLAMA_ORIGINS="chrome-extension://*"` (or `"*"`), then use the Ollama preset.
- Untick "tool calling" / "vision" for models that can't do them — page tools
  disable gracefully instead of erroring.

## Roadmap

- Gemini adapter behind the existing provider interface
- Pick the final name, then rename (two code locations + folder/repo) and
  prepare store listings
