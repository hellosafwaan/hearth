import { Readability } from '@mozilla/readability';
import { browser, defineContentScript } from '#imports';
import { READ_PAGE_FULL_MAX_CHARS, READ_PAGE_MAX_CHARS } from '../lib/constants';
import {
  DEVTOOLS_REQ_EVENT,
  DEVTOOLS_RES_EVENT,
  type DevtoolsBridgeRequest,
  type DevtoolsBridgeResponse,
} from '../lib/devtools/protocol';
import { clickElement, fillForm, getInteractiveElements, inspectElement } from '../lib/dom-actions';
import { findInPage, getPageMetadata, getPageTech, scrollPage } from '../lib/page-intel';
import type { ContentRequest, ContentResponse, PageContent } from '../lib/messaging';

function clean(text: string): string {
  return text.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Two extraction modes:
 * - "article" (default): Mozilla Readability — best for prose, but it strips
 *   comments, threads, and app UI by design.
 * - "full": the page's entire innerText, windowed by `offset` so the model
 *   can page through huge pages (YouTube comments, Reddit threads…).
 */
function readPage(mode: 'article' | 'full' = 'article', offset = 0): PageContent {
  const fullText = clean(document.body?.innerText ?? '');

  if (mode === 'full') {
    const start = Math.min(Math.max(0, Math.floor(offset)), fullText.length);
    const text = fullText.slice(start, start + READ_PAGE_FULL_MAX_CHARS);
    return {
      title: document.title,
      url: location.href,
      text,
      truncated: start + text.length < fullText.length,
      mode,
      totalChars: fullText.length,
      offset: start,
      pageHasMoreText: false,
    };
  }

  // Readability mutates its input, so parse a clone.
  let article: ReturnType<Readability['parse']> = null;
  try {
    article = new Readability(document.cloneNode(true) as Document).parse();
  } catch {
    // Fall through to innerText.
  }

  const usedArticle = !!article?.textContent && article.textContent.trim().length > 200;
  const cleaned = clean(usedArticle ? article!.textContent! : fullText);
  const text = cleaned.slice(0, READ_PAGE_MAX_CHARS);

  return {
    title: article?.title || document.title,
    url: location.href,
    byline: article?.byline ?? undefined,
    text,
    truncated: cleaned.length > READ_PAGE_MAX_CHARS,
    mode,
    totalChars: fullText.length,
    offset: 0,
    // The article is a small slice of a big page — comments/threads/app UI
    // probably got stripped; the model should retry with mode: "full".
    pageHasMoreText: usedArticle && fullText.length > 5000 && cleaned.length < fullText.length * 0.2,
  };
}

/**
 * Round-trips a query to the MAIN-world capture script over CustomEvents.
 * Resolves null when capture isn't armed (no listener answers in time).
 */
function queryMainWorld(
  request: Omit<DevtoolsBridgeRequest, 'id'>,
  timeoutMs = 1000,
): Promise<DevtoolsBridgeResponse['payload'] | null> {
  return new Promise((resolve) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;

    const onResponse = (event: Event) => {
      let response: DevtoolsBridgeResponse;
      try {
        response = JSON.parse((event as CustomEvent<string>).detail);
      } catch {
        return;
      }
      if (response.id !== id) return;
      document.removeEventListener(DEVTOOLS_RES_EVENT, onResponse);
      clearTimeout(timer);
      resolve(response.payload);
    };

    const timer = setTimeout(() => {
      document.removeEventListener(DEVTOOLS_RES_EVENT, onResponse);
      resolve(null);
    }, timeoutMs);

    document.addEventListener(DEVTOOLS_RES_EVENT, onResponse);
    document.dispatchEvent(
      new CustomEvent(DEVTOOLS_REQ_EVENT, { detail: JSON.stringify({ id, ...request }) }),
    );
  });
}

/** Requests that need the async MAIN-world round-trip. */
async function handleAsync(request: ContentRequest): Promise<ContentResponse> {
  if (request.type === 'read_console') {
    const payload = await queryMainWorld({
      kind: 'console',
      filter: { level: request.level, limit: request.limit },
    });
    if (payload?.kind !== 'console') return { ok: true, data: { armed: false } };
    return { ok: true, data: { armed: true, ...payload } };
  }

  // read_network
  if (request.type !== 'read_network') throw new Error(`Not an async request: ${request.type}`);
  const payload = await queryMainWorld({
    kind: 'network',
    filter: {
      statusMin: request.statusMin,
      urlContains: request.urlContains,
      limit: request.limit,
    },
  });
  if (payload?.kind !== 'network') return { ok: true, data: { armed: false } };
  return { ok: true, data: { armed: true, ...payload } };
}

function handle(request: ContentRequest): ContentResponse {
  switch (request.type) {
    case 'read_page':
      return { ok: true, data: readPage(request.mode, request.offset) };
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
    case 'get_page_tech':
      return { ok: true, data: getPageTech() };
    case 'get_page_metadata':
      return { ok: true, data: getPageMetadata() };
    case 'find_in_page':
      return { ok: true, data: findInPage(request.query) };
    case 'scroll':
      return { ok: true, data: scrollPage(request.direction) };
    case 'inspect_element':
      return { ok: true, data: inspectElement({ index: request.index, selector: request.selector }) };
    case 'read_console':
    case 'read_network':
      throw new Error('handled by handleAsync');
  }
}

const ASYNC_REQUESTS = new Set<ContentRequest['type']>(['read_console', 'read_network']);

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    // The bridge may inject this file into tabs that already have it
    // (static registration + executeScript fallback) — register once.
    const flag = '__sidekick_content_loaded__';
    if ((window as any)[flag]) return;
    (window as any)[flag] = true;

    // Synchronous sendResponse for most requests — works on native Chrome (no
    // promise-return support for onMessage) and Firefox alike. Devtools
    // requests need a MAIN-world round-trip, so they take the async path:
    // return true keeps the channel open for a late sendResponse.
    browser.runtime.onMessage.addListener(
      (request: ContentRequest, _sender, sendResponse: (r: ContentResponse) => void) => {
        const fail = (error: unknown): ContentResponse => ({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });

        if (ASYNC_REQUESTS.has(request.type)) {
          handleAsync(request)
            .then(sendResponse)
            .catch((error) => sendResponse(fail(error)));
          return true;
        }

        try {
          sendResponse(handle(request));
        } catch (error) {
          sendResponse(fail(error));
        }
      },
    );
  },
});
