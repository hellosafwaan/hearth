import { MAX_AGENT_STEPS, SYSTEM_PROMPT } from '../constants';
import { logEvent } from '../debug-log';
import { pruneForRequest } from './prune';
import { isRetryableProviderError } from '../providers/errors';
import type {
  ChatMessage,
  ChatRequest,
  Provider,
  StreamResult,
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
  /** Transient status for the UI ("Rate limited — retrying in 8s…"); null clears it. */
  onNotice?: (text: string | null) => void;
}

export interface AgentOptions {
  provider: Provider;
  model: string;
  history: ChatMessage[];
  tools: ToolDefinition[];
  /** Overrides the default SYSTEM_PROMPT (e.g. plan-mode variant). */
  system?: string;
  registry: Record<string, ToolExecutor>;
  /** Names of tools that must pass requestApproval before executing. */
  actingTools?: ReadonlySet<string>;
  /** Order-sensitive tools that must not run concurrently (scroll, wait). */
  sequentialTools?: ReadonlySet<string>;
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

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return raceWithAbort(new Promise((resolve) => setTimeout(resolve, ms)), signal);
}

// Rate limits (429) and overloads (5xx) heal on their own — retry twice with
// the provider's suggested wait (or a short backoff) before giving up.
const STREAM_RETRIES = 2;
const RETRY_BACKOFF_MS = [2_000, 8_000];
const MAX_RETRY_WAIT_MS = 30_000;

async function streamWithRetry(
  provider: Provider,
  request: ChatRequest,
  signal: AbortSignal | undefined,
  callbacks: AgentCallbacks,
): Promise<StreamResult> {
  for (let attempt = 0; ; attempt++) {
    // Only retry attempts that failed before any text reached the UI —
    // retrying a half-streamed response would duplicate visible output.
    let streamed = false;
    try {
      return await provider.stream(request, {
        signal,
        onTextDelta: (delta) => {
          streamed = true;
          callbacks.onTextDelta(delta);
        },
      });
    } catch (error) {
      const status = (error as { status?: number }).status;
      logEvent(
        'provider',
        `stream failed${status ? ` (${status})` : ''}: ${error instanceof Error ? error.message.slice(0, 200) : error}`,
      );
      const retryable =
        !streamed && attempt < STREAM_RETRIES && isRetryableProviderError(error);
      if (!retryable) throw error;

      const wait = Math.min(
        (error as { retryAfterMs?: number }).retryAfterMs ?? RETRY_BACKOFF_MS[attempt],
        MAX_RETRY_WAIT_MS,
      );
      const label = status === 429 ? 'Rate limited' : 'Provider overloaded';
      logEvent('retry', `${label}; waiting ${wait}ms (attempt ${attempt + 1}/${STREAM_RETRIES})`);

      // Live countdown: re-publish the notice every second until the deadline.
      const deadline = Date.now() + wait;
      try {
        for (;;) {
          const remaining = deadline - Date.now();
          if (remaining <= 0) break;
          callbacks.onNotice?.(`${label} — retrying in ${Math.ceil(remaining / 1000)}s…`);
          await sleep(Math.min(1_000, remaining), signal);
        }
      } finally {
        callbacks.onNotice?.(null);
      }
    }
  }
}

export async function runAgent(options: AgentOptions): Promise<void> {
  const { provider, model, tools, registry, actingTools, sequentialTools, signal, callbacks } =
    options;
  const messages = [...options.history];

  for (let step = 0; step < MAX_AGENT_STEPS; step++) {
    const { message, stopReason } = await streamWithRetry(
      provider,
      // Pruned copy goes to the provider; local history stays full-fidelity.
      {
        model,
        system: options.system ?? SYSTEM_PROMPT,
        messages: pruneForRequest(messages),
        tools,
      },
      signal,
      callbacks,
    );

    await callbacks.onAssistantMessage(message);
    messages.push(message);

    const toolUses = message.parts.filter((p): p is ToolUsePart => p.type === 'tool_use');
    if (stopReason !== 'tool_use' || toolUses.length === 0) return;

    // Results are placed by original index — tool_result order and ids must
    // match the tool_use order (Anthropic and Gemini both require this).
    const results: ToolResultPart[] = new Array(toolUses.length);

    const execute = async (toolUse: ToolUsePart): Promise<ToolResultPart> => {
      callbacks.onToolStart(toolUse);
      const started = Date.now();
      const executor = registry[toolUse.name];
      const result = executor
        ? await executor(toolUse.input)
        : {
            content: [{ type: 'text' as const, text: `Unknown tool: ${toolUse.name}` }],
            isError: true,
          };
      logEvent(
        'tool',
        `${toolUse.name} ${result.isError ? 'failed' : 'ok'} in ${Date.now() - started}ms`,
      );
      return {
        type: 'tool_result',
        toolUseId: toolUse.id,
        toolName: toolUse.name,
        content: result.content,
        isError: result.isError,
      };
    };

    // Read-only tools run concurrently; acting and order-sensitive tools run
    // afterwards, sequentially, in their original order — so the page is
    // stable by the time the user sees an approval prompt.
    const isSequential = (name: string) =>
      (actingTools?.has(name) ?? false) || (sequentialTools?.has(name) ?? false);

    signal?.throwIfAborted();
    await Promise.all(
      toolUses.map(async (toolUse, index) => {
        if (isSequential(toolUse.name)) return;
        results[index] = await execute(toolUse);
      }),
    );

    for (const [index, toolUse] of toolUses.entries()) {
      if (!isSequential(toolUse.name)) continue;
      signal?.throwIfAborted();

      if (actingTools?.has(toolUse.name) && callbacks.requestApproval) {
        const approved = await raceWithAbort(callbacks.requestApproval(toolUse), signal);
        if (!approved) {
          results[index] = {
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
          };
          continue;
        }
      }

      results[index] = await execute(toolUse);
    }

    const toolMessage: ChatMessage = { role: 'user', parts: results };

    // Two full steps remain after this one — tell the model to land the plane
    // instead of getting chopped off by the cap.
    if (step === MAX_AGENT_STEPS - 3) {
      toolMessage.parts.push({
        type: 'text',
        text:
          '[system note] You have 2 tool steps remaining for this request. Wrap up: finish ' +
          "with what you have or tell the user what's left to do. Do not start new multi-step work.",
      });
    }

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
