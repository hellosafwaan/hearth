import { browser } from '#imports';

// Typed protocol between the sidepanel (tool executors) and the content script.

export type ContentRequest = { type: 'read_page' } | { type: 'get_selected_text' };

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
};

export type ContentResponse<T extends ContentRequest['type'] = ContentRequest['type']> =
  | { ok: true; data: ContentResponseData[T] }
  | { ok: false; error: string };

async function getActiveTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active tab found.');
  return tab;
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
    return await browser.tabs.sendMessage(tab.id!, request);
  } catch {
    // Content script not present — try injecting it, then retry.
  }

  try {
    const scripting = (browser as any).scripting;
    await scripting.executeScript({
      target: { tabId: tab.id! },
      files: ['content-scripts/content.js'],
    });
    return await browser.tabs.sendMessage(tab.id!, request);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error:
        `Cannot access this page (${message}). It may be a browser-internal page, ` +
        'a store page, or a tab that needs to be reloaded.',
    };
  }
}
