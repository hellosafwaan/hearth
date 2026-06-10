import type {
  ChatMessage,
  ChatRequest,
  MessagePart,
  Provider,
  StopReason,
  StreamOptions,
  StreamResult,
  TextPart,
  ToolUsePart,
} from './types';

// One adapter for every OpenAI-compatible server: LM Studio, Ollama,
// llama.cpp, Jan, vLLM — and hosted services (OpenAI, OpenRouter, Groq).
// Local servers make the extension fully free: no key, no cloud, no data
// leaving the machine at all.

export interface OpenAICompatibleConfig {
  /** e.g. "http://localhost:1234/v1" (LM Studio) or "http://localhost:11434/v1" (Ollama) */
  baseUrl: string;
  /** Optional — local servers ignore it; hosted ones require it. */
  apiKey?: string;
}

type OpenAIMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | unknown[] }
  | { role: 'assistant'; content: string | null; tool_calls?: OpenAIToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

function toDataUrl(part: { mediaType: string; data: string }): string {
  return `data:${part.mediaType};base64,${part.data}`;
}

/**
 * Maps our internal messages to the OpenAI wire format. Notable difference
 * from Anthropic: tool results are their own `role: "tool"` messages and may
 * only contain text — images from tool results (screenshots) are re-attached
 * as a follow-up user message.
 */
function toOpenAIMessages(system: string | undefined, messages: ChatMessage[]): OpenAIMessage[] {
  const out: OpenAIMessage[] = [];
  if (system) out.push({ role: 'system', content: system });

  for (const message of messages) {
    if (message.role === 'assistant') {
      const text = message.parts
        .filter((p): p is TextPart => p.type === 'text')
        .map((p) => p.text)
        .join('');
      const toolCalls = message.parts
        .filter((p): p is ToolUsePart => p.type === 'tool_use')
        .map(
          (p): OpenAIToolCall => ({
            id: p.id,
            type: 'function',
            function: { name: p.name, arguments: JSON.stringify(p.input) },
          }),
        );
      out.push({
        role: 'assistant',
        content: text || null,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      });
      continue;
    }

    // User message: tool results become role:"tool" messages; everything else
    // becomes a single user message with text/image content blocks.
    const toolResults = message.parts.filter((p) => p.type === 'tool_result');
    const imageFollowUps: MessagePart[] = [];

    for (const part of toolResults) {
      const texts = part.content.filter((c): c is TextPart => c.type === 'text').map((c) => c.text);
      const images = part.content.filter((c) => c.type === 'image');
      imageFollowUps.push(...images);
      out.push({
        role: 'tool',
        tool_call_id: part.toolUseId,
        content:
          texts.join('\n') ||
          (images.length > 0 ? 'Captured image attached in the next message.' : '(no output)'),
      });
    }

    const directParts = message.parts.filter((p) => p.type === 'text' || p.type === 'image');
    const userParts = [...directParts, ...imageFollowUps];
    if (userParts.length > 0) {
      out.push({
        role: 'user',
        content: userParts.map((p) =>
          p.type === 'text'
            ? { type: 'text', text: p.text }
            : { type: 'image_url', image_url: { url: toDataUrl(p as { mediaType: string; data: string }) } },
        ),
      });
    }
  }
  return out;
}

function mapFinishReason(reason: string | null | undefined): StopReason {
  switch (reason) {
    case 'stop':
      return 'end_turn';
    case 'tool_calls':
    case 'function_call':
      return 'tool_use';
    case 'length':
      return 'max_tokens';
    default:
      return 'other';
  }
}

async function* sseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let index: number;
      while ((index = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (line.startsWith('data:')) {
          const data = line.slice(5).trim();
          if (data && data !== '[DONE]') yield data;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function connectionHelp(baseUrl: string): string {
  return (
    `Could not reach ${baseUrl}. Is the local server running?\n` +
    '• LM Studio: run "lms server start" or use the Developer tab → Start Server.\n' +
    '• Ollama: it must allow extension origins — restart it with OLLAMA_ORIGINS="*" (or "chrome-extension://*").'
  );
}

export function createOpenAICompatibleProvider(config: OpenAICompatibleConfig): Provider {
  const baseUrl = config.baseUrl.replace(/\/+$/, '');
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (config.apiKey) headers.authorization = `Bearer ${config.apiKey}`;

  async function post(body: unknown, signal?: AbortSignal): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      throw new Error(connectionHelp(baseUrl));
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Server error ${response.status}: ${detail.slice(0, 500)}`);
    }
    return response;
  }

  return {
    async stream(request: ChatRequest, options: StreamOptions = {}): Promise<StreamResult> {
      const response = await post(
        {
          model: request.model,
          stream: true,
          max_tokens: request.maxTokens ?? 4096,
          messages: toOpenAIMessages(request.system, request.messages),
          ...(request.tools && request.tools.length > 0
            ? {
                tools: request.tools.map((t) => ({
                  type: 'function',
                  function: { name: t.name, description: t.description, parameters: t.inputSchema },
                })),
              }
            : {}),
        },
        options.signal,
      );

      let text = '';
      let finishReason: string | null = null;
      const toolCalls = new Map<number, { id: string; name: string; args: string }>();

      for await (const data of sseData(response.body!)) {
        let chunk: any;
        try {
          chunk = JSON.parse(data);
        } catch {
          continue;
        }
        const choice = chunk.choices?.[0];
        if (!choice) continue;
        if (choice.finish_reason) finishReason = choice.finish_reason;

        const delta = choice.delta ?? {};
        if (typeof delta.content === 'string' && delta.content) {
          text += delta.content;
          options.onTextDelta?.(delta.content);
        }
        for (const tc of delta.tool_calls ?? []) {
          const slot = toolCalls.get(tc.index) ?? { id: '', name: '', args: '' };
          if (tc.id) slot.id = tc.id;
          if (tc.function?.name) slot.name += tc.function.name;
          if (tc.function?.arguments) slot.args += tc.function.arguments;
          toolCalls.set(tc.index, slot);
        }
      }

      const parts: MessagePart[] = [];
      if (text) parts.push({ type: 'text', text });
      for (const [index, call] of [...toolCalls.entries()].sort(([a], [b]) => a - b)) {
        let input: Record<string, unknown> = {};
        try {
          input = call.args ? JSON.parse(call.args) : {};
        } catch {
          // Malformed JSON from a weak model — pass it through raw so the
          // executor's validation produces a useful error for the model.
          input = { _raw: call.args };
        }
        parts.push({
          type: 'tool_use',
          id: call.id || `call_${index}`,
          name: call.name,
          input,
        });
      }

      const message: ChatMessage = { role: 'assistant', parts };
      const stopReason =
        toolCalls.size > 0 ? 'tool_use' : mapFinishReason(finishReason);
      return { message, stopReason };
    },

    async validateKey(model: string): Promise<void> {
      await post({
        model,
        stream: false,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      });
    },
  };
}

/** Lists model ids from GET {baseUrl}/models — handy for local servers. */
export async function listOpenAICompatibleModels(config: OpenAICompatibleConfig): Promise<string[]> {
  const baseUrl = config.baseUrl.replace(/\/+$/, '');
  const headers: Record<string, string> = {};
  if (config.apiKey) headers.authorization = `Bearer ${config.apiKey}`;
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/models`, { headers });
  } catch {
    throw new Error(connectionHelp(baseUrl));
  }
  if (!response.ok) throw new Error(`Server error ${response.status}.`);
  const json = (await response.json()) as { data?: Array<{ id?: string }> };
  return (json.data ?? []).map((m) => m.id).filter((id): id is string => typeof id === 'string');
}
