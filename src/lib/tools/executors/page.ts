import { sendToActiveTab, sendToTab, type ContentRequest } from '../../messaging';
import type { ToolExecResult } from '../registry';

function errorResult(error: string): ToolExecResult {
  return { content: [{ type: 'text', text: error }], isError: true };
}

export async function executeReadPage(input: Record<string, unknown>): Promise<ToolExecResult> {
  const mode = input.mode === 'full' ? 'full' : 'article';
  const offset = typeof input.offset === 'number' && input.offset > 0 ? input.offset : 0;
  const tabId = typeof input.tab_id === 'number' ? input.tab_id : null;

  const request: Extract<ContentRequest, { type: 'read_page' }> = {
    type: 'read_page',
    mode,
    offset,
  };
  const response = tabId != null ? await sendToTab(tabId, request) : await sendToActiveTab(request);
  if (!response.ok) return errorResult(response.error);

  const data = response.data;
  if (!data.text) {
    return errorResult(
      offset > 0
        ? `Nothing at offset ${data.offset} — the page text is ${data.totalChars} characters long.`
        : 'The page has no readable text content. Try the screenshot tool instead.',
    );
  }

  const header = [`Page: ${data.title}`, `URL: ${data.url}`, data.byline ? `By: ${data.byline}` : null]
    .filter(Boolean)
    .join('\n');

  const notes: string[] = [];
  if (data.mode === 'full') {
    const end = data.offset + data.text.length;
    notes.push(`[Full-page text, characters ${data.offset}–${end} of ${data.totalChars}.]`);
    if (data.truncated) {
      notes.push(`[More content remains — call read_page with mode "full" and offset ${end}.]`);
    }
  } else {
    if (data.truncated) notes.push('[Article truncated — longer than the extraction limit.]');
    if (data.pageHasMoreText) {
      notes.push(
        `[Note: this is the extracted article only. The page contains ~${Math.round(
          data.totalChars / Math.max(data.text.length, 1),
        )}x more text (likely comments, threads, or app UI) — call read_page with mode "full" to read it.]`,
      );
    }
  }

  const footer = notes.length > 0 ? `\n\n${notes.join('\n')}` : '';
  return {
    content: [
      {
        type: 'text',
        text: `${header}\n\n<page_content>\n${data.text}\n</page_content>${footer}`,
      },
    ],
  };
}

export async function executeGetPageTech(): Promise<ToolExecResult> {
  const response = await sendToActiveTab({ type: 'get_page_tech' });
  if (!response.ok) return errorResult(response.error);
  return { content: [{ type: 'text', text: `${response.data.url}\n\n${response.data.report}` }] };
}

export async function executeGetPageMetadata(): Promise<ToolExecResult> {
  const response = await sendToActiveTab({ type: 'get_page_metadata' });
  if (!response.ok) return errorResult(response.error);
  return { content: [{ type: 'text', text: `${response.data.url}\n\n${response.data.report}` }] };
}

export async function executeFindInPage(input: Record<string, unknown>): Promise<ToolExecResult> {
  if (typeof input.query !== 'string' || !input.query.trim()) {
    return errorResult('find_in_page requires a non-empty string "query".');
  }
  const response = await sendToActiveTab({ type: 'find_in_page', query: input.query });
  if (!response.ok) return errorResult(response.error);
  return { content: [{ type: 'text', text: response.data.result }] };
}

const SCROLL_DIRECTIONS = new Set(['up', 'down', 'top', 'bottom']);

export async function executeScroll(input: Record<string, unknown>): Promise<ToolExecResult> {
  const direction = String(input.direction ?? 'down');
  if (!SCROLL_DIRECTIONS.has(direction)) {
    return errorResult('scroll requires "direction": one of up, down, top, bottom.');
  }
  const response = await sendToActiveTab({
    type: 'scroll',
    direction: direction as 'up' | 'down' | 'top' | 'bottom',
  });
  if (!response.ok) return errorResult(response.error);
  return { content: [{ type: 'text', text: response.data.result }] };
}

export async function executeGetSelectedText(): Promise<ToolExecResult> {
  const response = await sendToActiveTab({ type: 'get_selected_text' });
  if (!response.ok) return errorResult(response.error);

  const { text, url, title } = response.data;
  if (!text.trim()) {
    return errorResult('Nothing is selected on the current page.');
  }

  return {
    content: [
      {
        type: 'text',
        text: `Selection from "${title}" (${url}):\n\n<selection>\n${text}\n</selection>`,
      },
    ],
  };
}
