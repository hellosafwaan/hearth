/**
 * Normalized provider failure. Adapters attach the HTTP status and, when the
 * provider supplies one (Retry-After header, "retry in Ns" detail), a
 * suggested wait — so the agent loop can retry rate limits instead of dying.
 */
export class ProviderError extends Error {
  status?: number;
  retryAfterMs?: number;

  constructor(message: string, options: { status?: number; retryAfterMs?: number } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.status = options.status;
    this.retryAfterMs = options.retryAfterMs;
  }
}

/** 429 = rate limit; 5xx/529 = transient overload. Worth retrying briefly. */
export function isRetryableProviderError(error: unknown): error is ProviderError {
  if (!(error instanceof ProviderError) || error.status == null) return false;
  return error.status === 429 || error.status >= 500;
}

/**
 * Turns provider failures into actionable copy for the error banner. The raw
 * provider message rides along on a second line for debugging.
 */
export function describeProviderError(error: unknown): string {
  if (!(error instanceof ProviderError)) {
    return error instanceof Error ? error.message : String(error);
  }
  switch (error.status) {
    case 401:
    case 403:
      return `Your API key was rejected by the provider. Check the key in Settings.\n\n${error.message}`;
    case 402:
      return `Your provider account appears to be out of credit. Check your plan and billing.\n\n${error.message}`;
    case 404:
      return `The selected model was not found — it may be unavailable on this key. Pick another model in Settings.\n\n${error.message}`;
    case 429:
      return `Rate limit exceeded — automatic retries didn't get through. Wait a minute and try again, or check your plan's quota.\n\n${error.message}`;
    default:
      return error.message;
  }
}
