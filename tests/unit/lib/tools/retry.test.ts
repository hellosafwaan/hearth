import { describe, expect, it, vi } from 'vitest';
import type { ToolExecResult } from '../../../../src/lib/tools/registry';
import { isTransientError, withRetry } from '../../../../src/lib/tools/retry';

function errorResult(text: string): ToolExecResult {
  return { content: [{ type: 'text', text }], isError: true };
}

describe('isTransientError', () => {
  it.each([
    'Could not establish connection. Receiving end does not exist.',
    'The message channel closed before a response was received',
    'No element snapshot for this page. Call get_interactive_elements first.',
    'That element is no longer on the page.',
    'Tab message timed out after 15s.',
  ])('classifies "%s" as transient', (message) => {
    expect(isTransientError(message)).toBe(true);
  });

  it.each([
    'The user denied this action.',
    'Page access has not been granted.',
    'Index 7 is out of range (snapshot has 3 elements).',
    'Element [2] is not a fillable input.',
    'Only http(s) URLs can be opened.',
  ])('classifies "%s" as permanent', (message) => {
    expect(isTransientError(message)).toBe(false);
  });
});

describe('withRetry', () => {
  it('retries a transient failure once and returns the second result', async () => {
    vi.useFakeTimers();
    const executor = vi
      .fn()
      .mockResolvedValueOnce(errorResult('Could not establish connection'))
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'ok' }] });

    const promise = withRetry(executor)({});
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(executor).toHaveBeenCalledTimes(2);
    expect(result.isError).toBeFalsy();
    vi.useRealTimers();
  });

  it('does not retry permanent failures', async () => {
    const executor = vi.fn().mockResolvedValue(errorResult('The user denied this action.'));
    const result = await withRetry(executor)({});
    expect(executor).toHaveBeenCalledTimes(1);
    expect(result.isError).toBe(true);
  });

  it('does not retry successes', async () => {
    const executor = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
    await withRetry(executor)({});
    expect(executor).toHaveBeenCalledTimes(1);
  });
});
