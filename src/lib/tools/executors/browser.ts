import { browser } from '#imports';
import type { ToolExecResult } from '../registry';

function text(value: string, isError = false): ToolExecResult {
  return { content: [{ type: 'text', text: value }], isError: isError || undefined };
}

function parseHttpUrl(raw: unknown): URL | null {
  if (typeof raw !== 'string') return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

export async function executeNavigateTo(input: Record<string, unknown>): Promise<ToolExecResult> {
  const url = parseHttpUrl(input.url);
  if (!url) return text('navigate_to requires a valid http(s) "url".', true);

  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return text('No active tab found.', true);

  await browser.tabs.update(tab.id, { url: url.href });
  return text(
    `Navigating the current tab to ${url.href}. Wait for the page to load, then call read_page or get_interactive_elements to see it.`,
  );
}

export async function executeOpenTab(input: Record<string, unknown>): Promise<ToolExecResult> {
  const url = parseHttpUrl(input.url);
  if (!url) return text('open_tab requires a valid http(s) "url".', true);

  await browser.tabs.create({ url: url.href, active: true });
  return text(
    `Opened ${url.href} in a new tab (now the active tab). Call read_page or get_interactive_elements to see it once loaded.`,
  );
}
