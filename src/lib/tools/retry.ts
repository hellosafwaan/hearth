import type { ToolExecResult, ToolExecutor } from './registry';

// Failures that often heal on a second attempt: the content script wasn't
// injected yet, the tab was mid-navigation, or the message channel dropped.
const TRANSIENT_PATTERNS = [
  /could not establish connection/i,
  /receiving end does not exist/i,
  /message (channel|port) closed/i,
  /no element snapshot/i,
  /no longer on the page/i,
  /timed out/i,
];

// Never retry these even if a transient pattern also matches — they need the
// user or the model to change something first.
const PERMANENT_PATTERNS = [
  /denied/i,
  /not granted/i,
  /out of range/i,
  /not a fillable/i,
  /only http/i,
];

export function isTransientError(message: string): boolean {
  if (PERMANENT_PATTERNS.some((p) => p.test(message))) return false;
  return TRANSIENT_PATTERNS.some((p) => p.test(message));
}

const RETRY_DELAY_MS = 600;

/** Re-executes once after a short delay when the failure looks transient. */
export function withRetry(executor: ToolExecutor): ToolExecutor {
  return async (input) => {
    const first = await executor(input);
    if (!first.isError || !isTransientError(resultText(first))) return first;
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    return executor(input);
  };
}

function resultText(result: ToolExecResult): string {
  return result.content
    .filter((c) => c.type === 'text')
    .map((c) => c.text)
    .join('\n');
}
