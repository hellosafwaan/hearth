import { describe, expect, it } from 'vitest';
import { describeProviderError, isRetryableProviderError, ProviderError } from '../../../../src/lib/providers/errors';

describe('isRetryableProviderError', () => {
  it.each([429, 500, 503, 529])('retries status %d', (status) => {
    expect(isRetryableProviderError(new ProviderError('x', { status }))).toBe(true);
  });

  it.each([400, 401, 402, 403, 404])('does not retry status %d', (status) => {
    expect(isRetryableProviderError(new ProviderError('x', { status }))).toBe(false);
  });

  it('does not retry errors without a status, or plain errors', () => {
    expect(isRetryableProviderError(new ProviderError('x'))).toBe(false);
    expect(isRetryableProviderError(new Error('x'))).toBe(false);
  });
});

describe('describeProviderError', () => {
  it('maps auth failures to actionable copy and keeps the raw message', () => {
    const text = describeProviderError(new ProviderError('invalid x-api-key', { status: 401 }));
    expect(text).toContain('API key was rejected');
    expect(text).toContain('invalid x-api-key');
  });

  it('maps billing, model-not-found, and exhausted rate limits', () => {
    expect(describeProviderError(new ProviderError('x', { status: 402 }))).toContain('credit');
    expect(describeProviderError(new ProviderError('x', { status: 404 }))).toContain('model');
    expect(describeProviderError(new ProviderError('x', { status: 429 }))).toContain('Rate limit');
  });

  it('passes through unknown statuses and non-provider errors', () => {
    expect(describeProviderError(new ProviderError('boom', { status: 418 }))).toBe('boom');
    expect(describeProviderError(new Error('plain'))).toBe('plain');
    expect(describeProviderError('string')).toBe('string');
  });
});
