import { describe, expect, it } from 'vitest';
import {
  KEEP_RECENT_IMAGES,
  KEEP_RECENT_TOOL_RESULTS,
  PRUNE_TEXT_THRESHOLD,
} from '../../../../src/lib/constants';
import type { ChatMessage, ToolResultPart } from '../../../../src/lib/providers/types';
import { pruneForRequest } from '../../../../src/lib/agent/prune';

function toolResult(id: string, content: ToolResultPart['content']): ToolResultPart {
  return { type: 'tool_result', toolUseId: id, toolName: 'read_page', content };
}

function turn(id: string, content: ToolResultPart['content']): ChatMessage[] {
  return [
    {
      role: 'assistant',
      parts: [{ type: 'tool_use', id, name: 'read_page', input: {} }],
    },
    { role: 'user', parts: [toolResult(id, content)] },
  ];
}

const bigText = 'x'.repeat(PRUNE_TEXT_THRESHOLD + 100);
const image = { type: 'image' as const, mediaType: 'image/jpeg', data: 'abc' };

describe('pruneForRequest', () => {
  it('never drops tool_result blocks or changes their ids', () => {
    const messages: ChatMessage[] = Array.from({ length: 12 }, (_, i) =>
      turn(`t${i}`, [{ type: 'text', text: bigText }]),
    ).flat();

    const pruned = pruneForRequest(messages);
    const ids = pruned
      .flatMap((m) => m.parts)
      .filter((p): p is ToolResultPart => p.type === 'tool_result')
      .map((p) => p.toolUseId);
    expect(ids).toEqual(Array.from({ length: 12 }, (_, i) => `t${i}`));
  });

  it('keeps images only in the most recent image-bearing results', () => {
    const messages = Array.from({ length: 4 }, (_, i) => turn(`img${i}`, [image])).flat();

    const pruned = pruneForRequest(messages);
    const results = pruned
      .flatMap((m) => m.parts)
      .filter((p): p is ToolResultPart => p.type === 'tool_result');

    const withImage = results.filter((r) => r.content.some((c) => c.type === 'image'));
    expect(withImage.map((r) => r.toolUseId)).toEqual(['img2', 'img3']);
    expect(withImage).toHaveLength(KEEP_RECENT_IMAGES);

    // Replaced images become explanatory text, not silence.
    const replaced = results[0].content[0];
    expect(replaced.type).toBe('text');
    expect((replaced as { text: string }).text).toContain('screenshot omitted');
  });

  it('truncates large text only outside the recent window', () => {
    const total = KEEP_RECENT_TOOL_RESULTS + 2;
    const messages = Array.from({ length: total }, (_, i) =>
      turn(`t${i}`, [{ type: 'text', text: bigText }]),
    ).flat();

    const pruned = pruneForRequest(messages);
    const texts = pruned
      .flatMap((m) => m.parts)
      .filter((p): p is ToolResultPart => p.type === 'tool_result')
      .map((r) => (r.content[0] as { text: string }).text);

    expect(texts[0]).toContain('truncated');
    expect(texts[1]).toContain('truncated');
    for (const text of texts.slice(2)) expect(text).toBe(bigText);
  });

  it('does not mutate the input messages', () => {
    const messages = turn('t0', [image, { type: 'text', text: bigText }]).concat(
      Array.from({ length: 8 }, (_, i) => turn(`t${i + 1}`, [image])).flat(),
    );
    const snapshot = JSON.stringify(messages);
    pruneForRequest(messages);
    expect(JSON.stringify(messages)).toBe(snapshot);
  });

  it('leaves user-authored text and assistant prose alone', () => {
    const messages: ChatMessage[] = [
      { role: 'user', parts: [{ type: 'text', text: bigText }] },
      { role: 'assistant', parts: [{ type: 'text', text: bigText }] },
    ];
    const pruned = pruneForRequest(messages);
    expect((pruned[0].parts[0] as { text: string }).text).toBe(bigText);
    expect((pruned[1].parts[0] as { text: string }).text).toBe(bigText);
  });
});
