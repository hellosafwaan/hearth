import type { ToolDefinition } from '../providers/types';

export const toolDefinitions: ToolDefinition[] = [
  {
    name: 'screenshot',
    description:
      "Capture a screenshot of the user's currently visible browser tab and return it as an image. " +
      'Call this whenever the user asks about the page they are looking at, wants something on screen ' +
      'summarized or explained, or references visible content.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];
