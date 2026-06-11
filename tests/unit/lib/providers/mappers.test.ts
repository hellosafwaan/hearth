import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '../../../../src/lib/providers/types';
import { toGeminiContents } from '../../../../src/lib/providers/gemini';
import { toOpenAIMessages } from '../../../../src/lib/providers/openai-compatible';

const history: ChatMessage[] = [
  { role: 'user', parts: [{ type: 'text', text: 'click the button' }] },
  {
    role: 'assistant',
    parts: [
      { type: 'text', text: 'Clicking now.' },
      { type: 'tool_use', id: 'call_1', name: 'click_element', input: { index: 3 } },
    ],
  },
  {
    role: 'user',
    parts: [
      {
        type: 'tool_result',
        toolUseId: 'call_1',
        toolName: 'click_element',
        content: [
          { type: 'text', text: 'Clicked.' },
          { type: 'image', mediaType: 'image/jpeg', data: 'abc' },
        ],
      },
      { type: 'text', text: '[system note] wrap up' },
    ],
  },
];

describe('toOpenAIMessages', () => {
  it('maps tool use/results to the OpenAI wire shape', () => {
    const out = toOpenAIMessages('be helpful', history);

    expect(out[0]).toEqual({ role: 'system', content: 'be helpful' });
    expect(out[1]).toEqual({ role: 'user', content: [{ type: 'text', text: 'click the button' }] });

    const assistant = out[2] as { role: string; tool_calls?: Array<{ id: string }> };
    expect(assistant.role).toBe('assistant');
    expect(assistant.tool_calls?.[0].id).toBe('call_1');

    // Tool results become role:"tool"; images move to a follow-up user message.
    const tool = out[3] as { role: string; tool_call_id: string };
    expect(tool.role).toBe('tool');
    expect(tool.tool_call_id).toBe('call_1');

    const followUp = out[4] as { role: string; content: Array<{ type: string }> };
    expect(followUp.role).toBe('user');
    expect(followUp.content.some((c) => c.type === 'image_url')).toBe(true);
  });
});

describe('toGeminiContents', () => {
  it('maps roles and tool calls to the Gemini wire shape', () => {
    const out = toGeminiContents(history);

    expect(out[0].role).toBe('user');
    expect(out[1].role).toBe('model');
    expect(out[1].parts.some((p) => 'functionCall' in p && p.functionCall.name === 'click_element')).toBe(
      true,
    );

    // Tool result turn: functionResponse + inline image + trailing text, all user-role.
    expect(out[2].role).toBe('user');
    const kinds = out[2].parts.map((p) => Object.keys(p)[0]);
    expect(kinds).toContain('functionResponse');
    expect(kinds).toContain('inlineData');
    expect(kinds).toContain('text');
  });
});
