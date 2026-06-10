// Provider-agnostic message and tool formats. The agent loop and storage layer
// only ever see these shapes; each provider adapter (Anthropic now, OpenAI and
// Gemini later) maps them to its own wire format.

export interface TextPart {
  type: 'text';
  text: string;
}

export interface ImagePart {
  type: 'image';
  /** e.g. "image/jpeg" */
  mediaType: string;
  /** base64-encoded image data, no data-URL prefix */
  data: string;
}

export interface ToolUsePart {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultPart {
  type: 'tool_result';
  toolUseId: string;
  toolName: string;
  content: (TextPart | ImagePart)[];
  isError?: boolean;
}

export type MessagePart = TextPart | ImagePart | ToolUsePart | ToolResultPart;

export interface ChatMessage {
  role: 'user' | 'assistant';
  parts: MessagePart[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON schema for the tool input */
  inputSchema: Record<string, unknown>;
}

export type StopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'refusal' | 'other';

export interface ChatRequest {
  model: string;
  system?: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  maxTokens?: number;
}

export interface StreamOptions {
  signal?: AbortSignal;
  onTextDelta?: (text: string) => void;
}

export interface StreamResult {
  message: ChatMessage;
  stopReason: StopReason;
}

export interface Provider {
  /** Streams a response; resolves with the complete assistant message. */
  stream(request: ChatRequest, options?: StreamOptions): Promise<StreamResult>;
  /** Throws a descriptive error if the key/model combination doesn't work. */
  validateKey(model: string): Promise<void>;
}
