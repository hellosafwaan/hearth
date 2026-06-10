import { storage } from '#imports';
import { DEFAULT_MODEL } from '../constants';

export interface Settings {
  provider: 'anthropic';
  apiKey: string;
  model: string;
}

export const DEFAULT_SETTINGS: Settings = {
  provider: 'anthropic',
  apiKey: '',
  model: DEFAULT_MODEL,
};

// storage.local only — never storage.sync, which would replicate the API key
// through browser-vendor servers and break the "nothing leaves the device" promise.
const settingsItem = storage.defineItem<Settings>('local:settings', {
  fallback: DEFAULT_SETTINGS,
});

export function getSettings(): Promise<Settings> {
  return settingsItem.getValue();
}

export function setSettings(settings: Settings): Promise<void> {
  return settingsItem.setValue(settings);
}

export function watchSettings(callback: (settings: Settings) => void): () => void {
  return settingsItem.watch((value) => callback(value ?? DEFAULT_SETTINGS));
}
