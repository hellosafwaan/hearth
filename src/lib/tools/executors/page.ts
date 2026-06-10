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
