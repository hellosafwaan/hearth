import { ProviderError } from './errors';
import type {
  ChatMessage,
  ChatRequest,
  ImagePart,
  MessagePart,
  Provider,
  StopReason,
  StreamOptions,
  StreamResult,
  TextPart,
  ToolUsePart,
} from './types';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

// --- Wire types ---

type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

// --- Message mapping ---

function toGeminiContents(messages: ChatMessage[]): GeminiContent[] {
  const out: GeminiContent[] = [];

  for (const message of messages) {
    const role = message.role === 'assistant' ? 'model' : 'user';
    const parts: GeminiPart[] = [];

    for (const part of message.parts) {
      switch (part.type) {
        case 'text':
          parts.push({ text: part.text });
          break;
        case 'image':
          parts.push({ inlineData: { mimeType: part.mediaType, data: part.data } });
          break;
        case 'tool_use':
          parts.push({ functionCall: { name: part.name, args: part.input } });
          break;
        case 'tool_result': {
          const textParts = part.content.filter((c): c is TextPart => c.type === 'text');
          const imageParts = part.content.filter((c): c is ImagePart => c.type === 'image');
          parts.push({
            functionResponse: {
              name: part.toolName,
              response: {
                content: textParts.map((c) => c.text).join('\n') || '(no output)',
                ...(part.isError ? { isError: true } : {}),
              },
            },
          });
          // Screenshots from tool results go as inlineData alongside the functionResponse.
          for (const img of imageParts) {
            parts.push({ inlineData: { mimeType: img.mediaType, data: img.data } });
          }
          break;
        }
      }
    }

    if (parts.length > 0) out.push({ role, parts });
  }

  return out;
}

function fromGeminiParts(parts: GeminiPart[]): MessagePart[] {
  return parts.map((p): MessagePart => {
    if ('text' in p) return { type: 'text', text: p.text };
    if ('functionCall' in p) {
      return {
        type: 'tool_use',
        id: `gemini_${Date.now()}_${p.functionCall.name}`,
        name: p.functionCall.name,
        input: p.functionCall.args,
      };
    }
    // inlineData / functionResponse shouldn't appear in model turns
    return { type: 'text', text: '' };
  }).filter((p) => p.type !== 'text' || (p as TextPart).text !== '');
}

function mapFinishReason(reason: string | undefined): StopReason {
  switch (reason) {
    case 'STOP':
      return 'end_turn';
    case 'MAX_TOKENS':
      return 'max_tokens';
    default:
      return 'other';
  }
}

// --- SSE streaming (same pattern as openai-compatible) ---

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
          if (data) yield data;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// --- Provider factory ---

export function createGeminiProvider(apiKey: string): Provider {
  async function post(
    path: string,
    body: unknown,
    query: Record<string, string> = {},
    signal?: AbortSignal,
  ): Promise<Response> {
    const params = new URLSearchParams({ key: apiKey, ...query });
    let response: Response;
    try {
      response = await fetch(`${GEMINI_BASE}${path}?${params}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      throw new Error('Could not reach Gemini API. Check your network connection.');
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      let message = `Gemini API error ${response.status}`;
      try {
        const parsed = JSON.parse(detail);
        if (parsed.error?.message) message = parsed.error.message;
      } catch {
        if (detail) message += `: ${detail.slice(0, 300)}`;
      }
      // Gemini puts the suggested wait in the error text ("retry in 7.8s").
      const retryMatch = message.match(/retry in ([\d.]+)\s*s/i);
      const headerAfter = Number(response.headers.get('retry-after'));
      throw new ProviderError(message, {
        status: response.status,
        retryAfterMs: retryMatch
          ? Math.ceil(parseFloat(retryMatch[1]) * 1000)
          : headerAfter > 0
            ? headerAfter * 1000
            : undefined,
      });
    }
    return response;
  }

  return {
    async stream(request: ChatRequest, options: StreamOptions = {}): Promise<StreamResult> {
      const body: Record<string, unknown> = {
        contents: toGeminiContents(request.messages),
        generationConfig: { maxOutputTokens: request.maxTokens ?? 8192 },
      };

      if (request.system) {
        body.systemInstruction = { parts: [{ text: request.system }] };
      }

      if (request.tools && request.tools.length > 0) {
        body.tools = [
          {
            functionDeclarations: request.tools.map(
              (t): GeminiFunctionDeclaration => ({
                name: t.name,
                description: t.description,
                parameters: t.inputSchema,
              }),
            ),
          },
        ];
      }

      const response = await post(
        `/models/${request.model}:streamGenerateContent`,
        body,
        { alt: 'sse' },
        options.signal,
      );

      let finishReason: string | undefined;
      const allParts: GeminiPart[] = [];

      for await (const data of sseData(response.body!)) {
        let chunk: any;
        try {
          chunk = JSON.parse(data);
        } catch {
          continue;
        }
        const candidate = chunk.candidates?.[0];
        if (!candidate) continue;
        if (candidate.finishReason) finishReason = candidate.finishReason;

        const parts: GeminiPart[] = candidate.content?.parts ?? [];
        for (const part of parts) {
          allParts.push(part);
          if ('text' in part && options.onTextDelta) {
            options.onTextDelta(part.text);
          }
        }
      }

      const messageParts = fromGeminiParts(allParts);
      const hasToolUse = messageParts.some((p) => p.type === 'tool_use');

      return {
        message: { role: 'assistant', parts: messageParts },
        stopReason: hasToolUse ? 'tool_use' : mapFinishReason(finishReason),
      };
    },

    async validateKey(model: string): Promise<void> {
      await post(`/models/${model}:generateContent`, {
        contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
        generationConfig: { maxOutputTokens: 1 },
      });
    },
  };
}
