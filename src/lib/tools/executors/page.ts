import { sendToActiveTab } from '../../messaging';
import type { ToolExecResult } from '../registry';

function errorResult(error: string): ToolExecResult {
  return { content: [{ type: 'text', text: error }], isError: true };
}

export async function executeReadPage(): Promise<ToolExecResult> {
  const response = await sendToActiveTab({ type: 'read_page' });
  if (!response.ok) return errorResult(response.error);

  const { title, url, byline, text, truncated } = response.data;
  if (!text) {
    return errorResult('The page has no readable text content. Try the screenshot tool instead.');
  }

  const header = [`Page: ${title}`, `URL: ${url}`, byline ? `By: ${byline}` : null]
    .filter(Boolean)
    .join('\n');
  const footer = truncated ? '\n\n[Content truncated — page is longer than the extraction limit.]' : '';

  return {
    content: [
      {
        type: 'text',
        text: `${header}\n\n<page_content>\n${text}\n</page_content>${footer}`,
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
