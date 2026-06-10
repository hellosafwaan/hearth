import Anthropic from '@anthropic-ai/sdk';
import type {
  ChatMessage,
  ChatRequest,
  MessagePart,
  Provider,
  StopReason,
  StreamOptions,
  StreamResult,
} from './types';

function toAnthropicContent(parts: MessagePart[]): Anthropic.ContentBlockParam[] {
  return parts.map((part): Anthropic.ContentBlockParam => {
    switch (part.type) {
      case 'text':
        return { type: 'text', text: part.text };
      case 'image':
        return {
          type: 'image',
          source: {
            type: 'base64',
            media_type: part.mediaType as Anthropic.Base64ImageSource['media_type'],
            data: part.data,
          },
        };
      case 'tool_use':
        return { type: 'tool_use', id: part.id, name: part.name, input: part.input };
      case 'tool_result':
        return {
          type: 'tool_result',
          tool_use_id: part.toolUseId,
          is_error: part.isError ?? false,
          content: part.content.map((c) =>
            c.type === 'text'
              ? { type: 'text' as const, text: c.text }
              : {
                  type: 'image' as const,
                  source: {
                    type: 'base64' as const,
                    media_type: c.mediaType as Anthropic.Base64ImageSource['media_type'],
                    data: c.data,
                  },
                },
          ),
        };
    }
  });
}

function fromAnthropicMessage(message: Anthropic.Message): ChatMessage {
  const parts: MessagePart[] = [];
  for (const block of message.content) {
    if (block.type === 'text') {
      parts.push({ type: 'text', text: block.text });
    } else if (block.type === 'tool_use') {
      parts.push({
        type: 'tool_use',
        id: block.id,
        name: block.name,
        input: (block.input ?? {}) as Record<string, unknown>,
      });
    }
  }
  return { role: 'assistant', parts };
}

function mapStopReason(reason: Anthropic.Message['stop_reason']): StopReason {
  switch (reason) {
    case 'end_turn':
    case 'stop_sequence':
      return 'end_turn';
    case 'tool_use':
      return 'tool_use';
    case 'max_tokens':
      return 'max_tokens';
    case 'refusal':
      return 'refusal';
    default:
      return 'other';
  }
}

export function createAnthropicProvider(apiKey: string): Provider {
  const client = new Anthropic({
    apiKey,
    // BYOK extension: the key is the user's own and never leaves their machine
    // except to call Anthropic directly.
    dangerouslyAllowBrowser: true,
  });

  return {
    async stream(request: ChatRequest, options: StreamOptions = {}): Promise<StreamResult> {
      const stream = client.messages.stream(
        {
          model: request.model,
          max_tokens: request.maxTokens ?? 8192,
          system: request.system,
          messages: request.messages.map((m) => ({
            role: m.role,
            content: toAnthropicContent(m.parts),
          })),
          tools: request.tools?.map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: t.inputSchema as Anthropic.Tool['input_schema'],
          })),
        },
        { signal: options.signal },
      );

      if (options.onTextDelta) stream.on('text', options.onTextDelta);

      const final = await stream.finalMessage();
      return {
        message: fromAnthropicMessage(final),
        stopReason: mapStopReason(final.stop_reason),
      };
    },

    async validateKey(model: string): Promise<void> {
      await client.messages.create({
        model,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      });
    },
  };
}
