import { storage } from '#imports';
import { DEFAULT_MODEL } from '../constants';

export interface Settings {
  provider: 'anthropic';
  apiKey: string;
  model: string;
  /** Origins where acting tools run without per-action approval. */
  autoApproveOrigins: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  provider: 'anthropic',
  apiKey: '',
  model: DEFAULT_MODEL,
  autoApproveOrigins: [],
};

// storage.local only — never storage.sync, which would replicate the API key
// through browser-vendor servers and break the "nothing leaves the device" promise.
const settingsItem = storage.defineItem<Settings>('local:settings', {
  fallback: DEFAULT_SETTINGS,
});

/** Merge with defaults so settings saved by older versions stay valid. */
function normalize(value: Settings | null): Settings {
  return { ...DEFAULT_SETTINGS, ...value };
}

export async function getSettings(): Promise<Settings> {
  return normalize(await settingsItem.getValue());
}

export function setSettings(settings: Settings): Promise<void> {
  return settingsItem.setValue(settings);
}

export function watchSettings(callback: (settings: Settings) => void): () => void {
  return settingsItem.watch((value) => callback(normalize(value)));
}

export async function addAutoApproveOrigin(origin: string): Promise<void> {
  const settings = await getSettings();
  if (settings.autoApproveOrigins.includes(origin)) return;
  await setSettings({
    ...settings,
    autoApproveOrigins: [...settings.autoApproveOrigins, origin],
  });
}

export async function removeAutoApproveOrigin(origin: string): Promise<void> {
  const settings = await getSettings();
  await setSettings({
    ...settings,
    autoApproveOrigins: settings.autoApproveOrigins.filter((o) => o !== origin),
  });
}
