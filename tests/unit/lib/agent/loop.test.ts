import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runAgent, type AgentCallbacks } from '../../../../src/lib/agent/loop';
import { MAX_AGENT_STEPS } from '../../../../src/lib/constants';
import { ProviderError } from '../../../../src/lib/providers/errors';
import type {
  ChatMessage,
  Provider,
  StreamOptions,
  StreamResult,
  ToolResultPart,
} from '../../../../src/lib/providers/types';
import type { ToolExecutor } from '../../../../src/lib/tools/registry';

// --- Test doubles -----------------------------------------------------------

function assistantText(text: string): StreamResult {
  return { message: { role: 'assistant', parts: [{ type: 'text', text }] }, stopReason: 'end_turn' };
}

function assistantToolCalls(...names: Array<[id: string, name: string]>): StreamResult {
  return {
    message: {
      role: 'assistant',
      parts: names.map(([id, name]) => ({ type: 'tool_use' as const, id, name, input: {} })),
    },
    stopReason: 'tool_use',
  };
}

/** Provider that replays scripted responses (or throws scripted errors). */
function scriptedProvider(script: Array<StreamResult | Error>): Provider & { calls: number } {
  const provider = {
    calls: 0,
    async stream(_request: unknown, _options: StreamOptions = {}): Promise<StreamResult> {
      const next = script[provider.calls++];
      if (!next) throw new Error('script exhausted');
      if (next instanceof Error) throw next;
      return next;
    },
    async validateKey() {},
  };
  return provider;
}

function collectingCallbacks() {
  const assistantMessages: ChatMessage[] = [];
  const toolMessages: ChatMessage[] = [];
  const notices: Array<string | null> = [];
  const callbacks: AgentCallbacks = {
    onTextDelta: vi.fn(),
    onAssistantMessage: (m) => void assistantMessages.push(m),
    onToolStart: vi.fn(),
    onToolMessage: (m) => void toolMessages.push(m),
    onNotice: (n) => void notices.push(n),
  };
  return { callbacks, assistantMessages, toolMessages, notices };
}

function okExecutor(text = 'ok'): ToolExecutor {
  return vi.fn(async () => ({ content: [{ type: 'text' as const, text }] }));
}

function baseOptions(provider: Provider, registry: Record<string, ToolExecutor>) {
  const collected = collectingCallbacks();
  return {
    options: {
      provider,
      model: 'test-model',
      history: [
        { role: 'user' as const, parts: [{ type: 'text' as const, text: 'hi' }] },
      ],
      tools: [],
      registry,
      actingTools: new Set(['click_element', 'propose_plan']),
      sequentialTools: new Set(['scroll']),
      callbacks: collected.callbacks,
    },
    ...collected,
  };
}

function resultsOf(message: ChatMessage): ToolResultPart[] {
  return message.parts.filter((p): p is ToolResultPart => p.type === 'tool_result');
}

// --- Tests -------------------------------------------------------------------

beforeEach(() => {
  vi.useRealTimers();
});

describe('runAgent: basic turns', () => {
  it('persists exactly one assistant message for a plain response', async () => {
    const provider = scriptedProvider([assistantText('hello')]);
    const { options, assistantMessages, toolMessages } = baseOptions(provider, {});

    await runAgent(options);

    expect(assistantMessages).toHaveLength(1);
    expect(toolMessages).toHaveLength(0);
    expect(provider.calls).toBe(1);
  });

  it('executes tools and emits one tool message with matching toolUseIds', async () => {
    const provider = scriptedProvider([
      assistantToolCalls(['a', 'read_page'], ['b', 'get_page_tech']),
      assistantText('done'),
    ]);
    const registry = { read_page: okExecutor(), get_page_tech: okExecutor() };
    const { options, toolMessages } = baseOptions(provider, registry);

    await runAgent(options);

    expect(toolMessages).toHaveLength(1);
    expect(resultsOf(toolMessages[0]).map((r) => r.toolUseId)).toEqual(['a', 'b']);
  });

  it('returns a useful error result for unknown tools', async () => {
    const provider = scriptedProvider([assistantToolCalls(['x', 'nonexistent']), assistantText('')]);
    const { options, toolMessages } = baseOptions(provider, {});

    await runAgent(options);

    const [result] = resultsOf(toolMessages[0]);
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain('Unknown tool');
  });
});

describe('runAgent: ordering and the approval gate', () => {
  it('keeps result order matching tool_use order even when read-only tools finish out of order', async () => {
    const provider = scriptedProvider([
      assistantToolCalls(['slow', 'read_page'], ['fast', 'get_page_tech']),
      assistantText(''),
    ]);
    const registry: Record<string, ToolExecutor> = {
      read_page: async () => {
        await new Promise((r) => setTimeout(r, 20));
        return { content: [{ type: 'text', text: 'slow' }] };
      },
      get_page_tech: okExecutor('fast'),
    };
    const { options, toolMessages } = baseOptions(provider, registry);

    await runAgent(options);

    expect(resultsOf(toolMessages[0]).map((r) => r.toolUseId)).toEqual(['slow', 'fast']);
  });

  it('runs acting/sequential tools after read-only tools complete', async () => {
    const order: string[] = [];
    const provider = scriptedProvider([
      assistantToolCalls(['act', 'click_element'], ['seq', 'scroll'], ['read', 'read_page']),
      assistantText(''),
    ]);
    const registry: Record<string, ToolExecutor> = {
      click_element: async () => {
        order.push('click');
        return { content: [{ type: 'text', text: '' }] };
      },
      scroll: async () => {
        order.push('scroll');
        return { content: [{ type: 'text', text: '' }] };
      },
      read_page: async () => {
        await new Promise((r) => setTimeout(r, 10));
        order.push('read');
        return { content: [{ type: 'text', text: '' }] };
      },
    };
    const { options } = baseOptions(provider, registry);
    options.callbacks.requestApproval = async () => true;

    await runAgent(options);

    // Read-only finishes first despite being listed last; gated tools keep
    // their original relative order afterwards.
    expect(order).toEqual(['read', 'click', 'scroll']);
  });

  it('denied approval synthesizes an error result and never calls the executor', async () => {
    const provider = scriptedProvider([assistantToolCalls(['a', 'click_element']), assistantText('')]);
    const executor = okExecutor();
    const { options, toolMessages } = baseOptions(provider, { click_element: executor });
    options.callbacks.requestApproval = async () => false;

    await runAgent(options);

    expect(executor).not.toHaveBeenCalled();
    const [result] = resultsOf(toolMessages[0]);
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain('denied');
  });
});

describe('runAgent: provider retry behavior', () => {
  it('retries a 429 before any text has streamed, honoring retryAfterMs', async () => {
    vi.useFakeTimers();
    const provider = scriptedProvider([
      new ProviderError('rate limited', { status: 429, retryAfterMs: 2000 }),
      assistantText('recovered'),
    ]);
    const { options, assistantMessages, notices } = baseOptions(provider, {});

    const run = runAgent(options);
    await vi.runAllTimersAsync();
    await run;

    expect(provider.calls).toBe(2);
    expect(assistantMessages).toHaveLength(1);
    expect(notices.some((n) => n?.includes('Rate limited'))).toBe(true);
    expect(notices.at(-1)).toBeNull(); // notice cleared afterwards
  });

  it('does not retry non-retryable provider errors', async () => {
    const provider = scriptedProvider([new ProviderError('bad key', { status: 401 })]);
    const { options } = baseOptions(provider, {});

    await expect(runAgent(options)).rejects.toThrow('bad key');
    expect(provider.calls).toBe(1);
  });

  it('does not retry once text has already streamed', async () => {
    let calls = 0;
    const provider: Provider = {
      async stream(_request, streamOptions: StreamOptions = {}) {
        calls++;
        streamOptions.onTextDelta?.('partial…');
        throw new ProviderError('overloaded', { status: 529 });
      },
      async validateKey() {},
    };
    const { options } = baseOptions(provider, {});

    await expect(runAgent(options)).rejects.toThrow('overloaded');
    expect(calls).toBe(1);
  });
});

describe('runAgent: step budget', () => {
  it('stops at MAX_AGENT_STEPS with the cap message', async () => {
    const provider = scriptedProvider(
      Array.from({ length: MAX_AGENT_STEPS }, (_, i) => assistantToolCalls([`t${i}`, 'read_page'])),
    );
    const { options, assistantMessages, toolMessages } = baseOptions(provider, {
      read_page: okExecutor(),
    });

    await runAgent(options);

    expect(provider.calls).toBe(MAX_AGENT_STEPS);
    expect(toolMessages).toHaveLength(MAX_AGENT_STEPS);
    const last = assistantMessages.at(-1)!;
    expect((last.parts[0] as { text: string }).text).toContain(`${MAX_AGENT_STEPS} tool steps`);
  });

  it('injects the wrap-up warning when two steps remain', async () => {
    const provider = scriptedProvider(
      Array.from({ length: MAX_AGENT_STEPS }, (_, i) => assistantToolCalls([`t${i}`, 'read_page'])),
    );
    const { options, toolMessages } = baseOptions(provider, { read_page: okExecutor() });

    await runAgent(options);

    const warned = toolMessages.filter((m) =>
      m.parts.some((p) => p.type === 'text' && p.text.includes('steps remaining')),
    );
    expect(warned).toHaveLength(1);
    expect(toolMessages.indexOf(warned[0])).toBe(MAX_AGENT_STEPS - 3);
  });
});
