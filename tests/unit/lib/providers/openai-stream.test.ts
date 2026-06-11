import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOpenAICompatibleProvider } from '../../../../src/lib/providers/openai-compatible';
import type { ToolUsePart } from '../../../../src/lib/providers/types';

function sseResponse(lines: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(`data: ${line}\n`));
      controller.enqueue(encoder.encode('data: [DONE]\n'));
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

function chunk(delta: object, finish: string | null = null): string {
  return JSON.stringify({ choices: [{ delta, finish_reason: finish }] });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('openai-compatible streaming', () => {
  it('reassembles tool-call arguments split across chunks', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([
          chunk({ tool_calls: [{ index: 0, id: 'call_1', function: { name: 'click_', arguments: '{"in' } }] }),
          chunk({ tool_calls: [{ index: 0, function: { name: 'element', arguments: 'dex":3}' } }] }),
          chunk({}, 'tool_calls'),
        ]),
      ),
    );

    const provider = createOpenAICompatibleProvider({ baseUrl: 'http://localhost:1234/v1' });
    const { message, stopReason } = await provider.stream({
      model: 'm',
      messages: [{ role: 'user', parts: [{ type: 'text', text: 'hi' }] }],
    });

    const tool = message.parts.find((p): p is ToolUsePart => p.type === 'tool_use');
    expect(stopReason).toBe('tool_use');
    expect(tool?.name).toBe('click_element');
    expect(tool?.input).toEqual({ index: 3 });
  });

  it('passes malformed tool-call JSON through as _raw for the executor to reject', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([
          chunk({ tool_calls: [{ index: 0, id: 'c', function: { name: 'wait', arguments: '{oops' } }] }),
          chunk({}, 'tool_calls'),
        ]),
      ),
    );

    const provider = createOpenAICompatibleProvider({ baseUrl: 'http://localhost:1234/v1' });
    const { message } = await provider.stream({
      model: 'm',
      messages: [{ role: 'user', parts: [{ type: 'text', text: 'hi' }] }],
    });

    const tool = message.parts.find((p): p is ToolUsePart => p.type === 'tool_use');
    expect(tool?.input).toEqual({ _raw: '{oops' });
  });

  it('streams text deltas and finishes with end_turn', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(sseResponse([chunk({ content: 'Hel' }), chunk({ content: 'lo' }, 'stop')])),
    );

    const deltas: string[] = [];
    const provider = createOpenAICompatibleProvider({ baseUrl: 'http://localhost:1234/v1' });
    const { message, stopReason } = await provider.stream(
      { model: 'm', messages: [{ role: 'user', parts: [{ type: 'text', text: 'hi' }] }] },
      { onTextDelta: (d) => deltas.push(d) },
    );

    expect(deltas).toEqual(['Hel', 'lo']);
    expect(stopReason).toBe('end_turn');
    expect((message.parts[0] as { text: string }).text).toBe('Hello');
  });
});
