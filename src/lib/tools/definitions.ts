import type { ToolDefinition } from '../providers/types';

export const toolDefinitions: ToolDefinition[] = [
  {
    name: 'read_page',
    description:
      "Extract the readable text content of the user's current browser tab (title, URL, article text). " +
      'Call this when the user asks about the page they are on — summarizing, explaining, or answering ' +
      'questions about its content. Prefer this over screenshot for text-heavy pages: it is more accurate ' +
      'for prose and much cheaper.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_selected_text',
    description:
      'Get the text the user currently has highlighted/selected on the page. Call this when the user ' +
      'refers to "this", "the selected text", "what I highlighted", or asks about a specific passage.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'screenshot',
    description:
      "Capture a screenshot of the user's currently visible browser tab and return it as an image. " +
      'Call this when visual appearance matters (layout, charts, images, video frames, UI) or when ' +
      'read_page fails or returns too little. For plain articles and text, prefer read_page.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];
