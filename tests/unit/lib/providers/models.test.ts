import { describe, expect, it } from 'vitest';
import { DEFAULT_MODEL, GEMINI_MODELS, MODELS } from '../../../../src/lib/constants';
import { modelForProvider } from '../../../../src/lib/providers/models';

describe('modelForProvider', () => {
  it('keeps a model the target provider offers', () => {
    expect(modelForProvider('anthropic', MODELS[0].id)).toBe(MODELS[0].id);
    expect(modelForProvider('gemini', GEMINI_MODELS[0].id)).toBe(GEMINI_MODELS[0].id);
  });

  it("falls back when the model belongs to a different provider (the qwen→Anthropic 404 bug)", () => {
    expect(modelForProvider('anthropic', 'qwen/qwen3-4b')).toBe(DEFAULT_MODEL);
    expect(modelForProvider('gemini', 'claude-sonnet-4-6')).toBe(GEMINI_MODELS[1].id);
  });

  it('passes anything through for local/OpenAI-compatible servers', () => {
    expect(modelForProvider('openai-compatible', 'qwen/qwen3-4b')).toBe('qwen/qwen3-4b');
  });
});
