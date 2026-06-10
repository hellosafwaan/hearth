import { MAX_AGENT_STEPS, SYSTEM_PROMPT } from '../constants';
import type {
  ChatMessage,
  Provider,
  ToolDefinition,
  ToolResultPart,
  ToolUsePart,
} from '../providers/types';
import type { ToolExecutor } from '../tools/registry';

export interface AgentCallbacks {
  /** Streaming text from the model, append to the in-progress bubble. */
  onTextDelta: (text: string) => void;
  /** A complete assistant message — persist it. */
  onAssistantMessage: (message: ChatMessage) => void | Promise<void>;
  /** A tool is about to run. */
  onToolStart: (part: ToolUsePart) => void;
  /** A user-role message carrying tool results — persist it. */
  onToolMessage: (message: ChatMessage) => void | Promise<void>;
  /**
   * Asked before any tool in `actingTools` runs. Resolve false to deny —
   * the denial is fed back to the model as an error tool result.
   */
  requestApproval?: (part: ToolUsePart) => Promise<boolean>;
}

export interface AgentOptions {
  provider: Provider;
  model: string;
  history: ChatMessage[];
  tools: ToolDefinition[];
  registry: Record<string, ToolExecutor>;
  /** Names of tools that must pass requestApproval before executing. */
  actingTools?: ReadonlySet<string>;
  signal?: AbortSignal;
  callbacks: AgentCallbacks;
}

/** Resolves with the promise, or rejects as soon as the signal aborts. */
function raceWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    if (signal.aborted) return onAbort();
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

export async function runAgent(options: AgentOptions): Promise<void> {
  const { provider, model, tools, registry, actingTools, signal, callbacks } = options;
  const messages = [...options.history];

  for (let step = 0; step < MAX_AGENT_STEPS; step++) {
    const { message, stopReason } = await provider.stream(
      { model, system: SYSTEM_PROMPT, messages, tools },
      { signal, onTextDelta: callbacks.onTextDelta },
    );

    await callbacks.onAssistantMessage(message);
    messages.push(message);

    const toolUses = message.parts.filter((p): p is ToolUsePart => p.type === 'tool_use');
    if (stopReason !== 'tool_use' || toolUses.length === 0) return;

    const results: ToolResultPart[] = [];
    for (const toolUse of toolUses) {
      signal?.throwIfAborted();

      if (actingTools?.has(toolUse.name) && callbacks.requestApproval) {
        const approved = await raceWithAbort(callbacks.requestApproval(toolUse), signal);
        if (!approved) {
          results.push({
            type: 'tool_result',
            toolUseId: toolUse.id,
            toolName: toolUse.name,
            content: [
              {
                type: 'text',
                text: 'The user denied this action. Do not retry it — ask the user how to proceed instead.',
              },
            ],
            isError: true,
          });
          continue;
        }
      }

      callbacks.onToolStart(toolUse);

      const executor = registry[toolUse.name];
      const result = executor
        ? await executor(toolUse.input)
        : {
            content: [{ type: 'text' as const, text: `Unknown tool: ${toolUse.name}` }],
            isError: true,
          };

      results.push({
        type: 'tool_result',
        toolUseId: toolUse.id,
        toolName: toolUse.name,
        content: result.content,
        isError: result.isError,
      });
    }

    const toolMessage: ChatMessage = { role: 'user', parts: results };
    await callbacks.onToolMessage(toolMessage);
    messages.push(toolMessage);
  }

  // Step cap reached — surface it instead of looping forever.
  const capMessage: ChatMessage = {
    role: 'assistant',
    parts: [
      {
        type: 'text',
        text: `_Stopped after ${MAX_AGENT_STEPS} tool steps. Send a follow-up message to continue._`,
      },
    ],
  };
  await callbacks.onAssistantMessage(capMessage);
}
