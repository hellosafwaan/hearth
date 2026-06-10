import type { Settings } from '../settings/storage';
import { createAnthropicProvider } from './anthropic';
import { createGeminiProvider } from './gemini';
import { createOpenAICompatibleProvider } from './openai-compatible';
import type { Provider } from './types';

export function createProvider(settings: Settings): Provider {
  switch (settings.provider) {
    case 'anthropic':
      return createAnthropicProvider(settings.apiKey);
    case 'gemini':
      return createGeminiProvider(settings.apiKey);
    case 'openai-compatible':
      return createOpenAICompatibleProvider({
        baseUrl: settings.baseUrl,
        apiKey: settings.apiKey || undefined,
      });
  }
}

/** True when the current provider/model can accept image blocks. */
export function supportsVision(settings: Settings): boolean {
  return settings.provider === 'anthropic' || settings.provider === 'gemini' || settings.supportsVision;
}

/** True when the current provider/model can do tool calling. */
export function supportsTools(settings: Settings): boolean {
  return settings.provider === 'anthropic' || settings.provider === 'gemini' || settings.supportsTools;
}

/** True when the provider cannot work without an API key. */
export function requiresApiKey(settings: Settings): boolean {
  return settings.provider === 'anthropic' || settings.provider === 'gemini';
}
