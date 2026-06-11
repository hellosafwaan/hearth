import { DEFAULT_MODEL, GEMINI_MODELS, MODELS } from '../constants';
import type { ProviderKind } from '../settings/storage';

/**
 * A model id only makes sense for the provider it belongs to — carrying
 * "qwen/qwen3-4b" into the Anthropic dropdown silently 404s. Keep the current
 * model only when the target provider actually offers it.
 */
export function modelForProvider(provider: ProviderKind, current: string): string {
  switch (provider) {
    case 'anthropic':
      return MODELS.some((m) => m.id === current) ? current : DEFAULT_MODEL;
    case 'gemini':
      return GEMINI_MODELS.some((m) => m.id === current) ? current : GEMINI_MODELS[1].id;
    case 'openai-compatible':
      return current;
  }
}
