import { browser } from '#imports';

// Host permissions are optional (requested at runtime) so installing the
// extension doesn't demand blanket "read all websites" access up front.

const PAGE_ORIGINS = ['<all_urls>'];
const LOCAL_ORIGINS = ['http://localhost/*', 'http://127.0.0.1/*'];

/** Access to page content (read_page, screenshots, DOM actions on Chrome). */
export function hasPageAccess(): Promise<boolean> {
  return browser.permissions.contains({ origins: PAGE_ORIGINS });
}

/** Must be called from a user gesture (button click). */
export function requestPageAccess(): Promise<boolean> {
  return browser.permissions.request({ origins: PAGE_ORIGINS });
}

export function revokePageAccess(): Promise<boolean> {
  return browser.permissions.remove({ origins: PAGE_ORIGINS });
}

/** Access to localhost servers (LM Studio / Ollama) without CORS headaches. */
export function hasLocalServerAccess(): Promise<boolean> {
  return browser.permissions.contains({ origins: LOCAL_ORIGINS });
}

/** Must be called from a user gesture. Resolves true immediately if granted. */
export function requestLocalServerAccess(): Promise<boolean> {
  return browser.permissions.request({ origins: LOCAL_ORIGINS });
}

/**
 * Requests host access for a custom server base URL (local or hosted) so
 * fetches from the extension page aren't blocked by CORS. Must be called from
 * a user gesture; resolves true without a prompt when already granted.
 */
export async function requestServerAccess(baseUrl: string): Promise<boolean> {
  let pattern: string;
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    pattern = `${url.protocol}//${url.hostname}/*`;
  } catch {
    return false;
  }
  const origins =
    pattern === 'http://localhost/*' || pattern === 'http://127.0.0.1/*'
      ? LOCAL_ORIGINS
      : [pattern];
  return browser.permissions.request({ origins });
}

export function watchPermissions(callback: () => void): () => void {
  const api = browser.permissions as any;
  api.onAdded?.addListener(callback);
  api.onRemoved?.addListener(callback);
  return () => {
    api.onAdded?.removeListener(callback);
    api.onRemoved?.removeListener(callback);
  };
}
