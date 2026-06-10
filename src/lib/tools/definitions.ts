import type { ToolDefinition } from '../providers/types';

/**
 * Tools that change page or browser state. The agent loop pauses on these and
 * asks the user to approve — this gate is the core defense against prompt
 * injection from page content.
 */
export const ACTING_TOOLS: ReadonlySet<string> = new Set([
  'click_element',
  'fill_form',
  'navigate_to',
  'open_tab',
]);

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
  {
    name: 'get_interactive_elements',
    description:
      'List the interactive elements (links, buttons, inputs, selects) visible on the current page as a ' +
      'numbered index. Call this before click_element or fill_form to get valid indices, and call it again ' +
      'after the page changes. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'click_element',
    description:
      'Click an element on the current page, identified by its index from the most recent ' +
      'get_interactive_elements call. Requires user approval.',
    inputSchema: {
      type: 'object',
      properties: {
        index: {
          type: 'integer',
          description: 'Element index from the latest get_interactive_elements listing.',
        },
      },
      required: ['index'],
    },
  },
  {
    name: 'fill_form',
    description:
      'Type a value into an input, textarea, select, or editable field on the current page, identified by ' +
      'its index from the most recent get_interactive_elements call. Requires user approval.',
    inputSchema: {
      type: 'object',
      properties: {
        index: {
          type: 'integer',
          description: 'Element index from the latest get_interactive_elements listing.',
        },
        value: {
          type: 'string',
          description: 'The text to enter (for selects, the option value).',
        },
      },
      required: ['index', 'value'],
    },
  },
  {
    name: 'navigate_to',
    description:
      'Navigate the current tab to a URL (http/https only). Requires user approval. After navigating, wait ' +
      'for the result of this tool, then use read_page or get_interactive_elements to see the new page.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Absolute http(s) URL to open.' },
      },
      required: ['url'],
    },
  },
  {
    name: 'open_tab',
    description:
      'Open a URL in a new browser tab (http/https only) and make it the active tab. Requires user approval.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Absolute http(s) URL to open.' },
      },
      required: ['url'],
    },
  },
];
