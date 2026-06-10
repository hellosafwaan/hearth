import { browser } from '#imports';

// Typed protocol between the sidepanel (tool executors) and the content script.

export type ContentRequest =
  | { type: 'read_page' }
  | { type: 'get_selected_text' }
  | { type: 'get_interactive_elements' }
  | { type: 'click_element'; index: number }
  | { type: 'fill_form'; index: number; value: string }
  | { type: 'get_page_tech' }
  | { type: 'get_page_metadata' }
  | { type: 'find_in_page'; query: string }
  | { type: 'scroll'; direction: 'up' | 'down' | 'top' | 'bottom' };

export interface PageContent {
  title: string;
  url: string;
  byline?: string;
  /** Extracted readable text, capped at READ_PAGE_MAX_CHARS. */
  text: string;
  truncated: boolean;
}

export type ContentResponseData = {
  read_page: PageContent;
  get_selected_text: { text: string; url: string; title: string };
  get_interactive_elements: { listing: string; count: number; url: string };
  click_element: { result: string };
  fill_form: { result: string };
  get_page_tech: { report: string; url: string };
  get_page_metadata: { report: string; url: string };
  find_in_page: { result: string };
  scroll: { result: string };
};

export type ContentResponse<T extends ContentRequest['type'] = ContentRequest['type']> =
  | { ok: true; data: ContentResponseData[T] }
  | { ok: false; error: string };

async function getActiveTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active tab found.');
  return tab;
}

const TAB_MESSAGE_TIMEOUT_MS = 15_000;

/** A wedged tab should produce a classifiable error, not hang the agent loop. */
function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Tab message timed out after ${TAB_MESSAGE_TIMEOUT_MS / 1000}s.`)),
        TAB_MESSAGE_TIMEOUT_MS,
      ),
    ),
  ]);
}

/**
 * Sends a request to the content script in the active tab. If the content
 * script isn't there (tab opened before the extension loaded), injects it
 * once and retries.
 */
export async function sendToActiveTab<T extends ContentRequest>(
  request: T,
): Promise<ContentResponse<T['type']>> {
  const tab = await getActiveTab();

  try {
    return await withTimeout(browser.tabs.sendMessage(tab.id!, request));
  } catch {
    // Content script not present — try injecting it, then retry.
  }

  try {
    const scripting = (browser as any).scripting;
    await scripting.executeScript({
      target: { tabId: tab.id! },
      files: ['content-scripts/content.js'],
    });
    return await withTimeout(browser.tabs.sendMessage(tab.id!, request));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const granted = await browser.permissions
      .contains({ origins: ['<all_urls>'] })
      .catch(() => false);
    return {
      ok: false,
      error: granted
        ? `Cannot access this page (${message}). It may be a browser-internal page, ` +
          'a store page, or a tab that needs to be reloaded.'
        : 'Page access has not been granted. Ask the user to click "Grant page access" ' +
          'in the sidebar, then try again.',
    };
  }
}
