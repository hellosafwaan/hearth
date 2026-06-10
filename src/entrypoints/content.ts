import { Readability } from '@mozilla/readability';
import { browser, defineContentScript } from '#imports';
import { READ_PAGE_MAX_CHARS } from '../lib/constants';
import { clickElement, fillForm, getInteractiveElements } from '../lib/dom-actions';
import type { ContentRequest, ContentResponse, PageContent } from '../lib/messaging';

function cap(text: string): { text: string; truncated: boolean } {
  const cleaned = text.replace(/\n{3,}/g, '\n\n').trim();
  if (cleaned.length <= READ_PAGE_MAX_CHARS) {
    return { text: cleaned, truncated: false };
  }
  return { text: cleaned.slice(0, READ_PAGE_MAX_CHARS), truncated: true };
}

function readPage(): PageContent {
  // Readability mutates its input, so parse a clone.
  let article: ReturnType<Readability['parse']> = null;
  try {
    article = new Readability(document.cloneNode(true) as Document).parse();
  } catch {
    // Fall through to innerText.
  }

  const raw =
    article?.textContent && article.textContent.trim().length > 200
      ? article.textContent
      : document.body?.innerText ?? '';

  const { text, truncated } = cap(raw);
  return {
    title: article?.title || document.title,
    url: location.href,
    byline: article?.byline ?? undefined,
    text,
    truncated,
  };
}

function handle(request: ContentRequest): ContentResponse {
  switch (request.type) {
    case 'read_page':
      return { ok: true, data: readPage() };
    case 'get_selected_text':
      return {
        ok: true,
        data: {
          text: window.getSelection()?.toString() ?? '',
          url: location.href,
          title: document.title,
        },
      };
    case 'get_interactive_elements':
      return { ok: true, data: getInteractiveElements() };
    case 'click_element':
      return { ok: true, data: clickElement(request.index) };
    case 'fill_form':
      return { ok: true, data: fillForm(request.index, request.value) };
  }
}

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    // The bridge may inject this file into tabs that already have it
    // (static registration + executeScript fallback) — register once.
    const flag = '__sidekick_content_loaded__';
    if ((window as any)[flag]) return;
    (window as any)[flag] = true;

    // Synchronous sendResponse — works on native Chrome (no promise-return
    // support for onMessage) and Firefox alike.
    browser.runtime.onMessage.addListener(
      (request: ContentRequest, _sender, sendResponse: (r: ContentResponse) => void) => {
        let response: ContentResponse;
        try {
          response = handle(request);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          response = { ok: false, error: message };
        }
        sendResponse(response);
      },
    );
  },
});
