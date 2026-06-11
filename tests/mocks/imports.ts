import { vi } from 'vitest';

// Stand-in for wxt's `#imports` virtual module. Tests import this same file
// (vitest.config.ts aliases '#imports' here) and program the vi.fn()s.

export const browser = {
  tabs: {
    query: vi.fn(),
    sendMessage: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    reload: vi.fn(),
  },
  scripting: {
    executeScript: vi.fn(),
    registerContentScripts: vi.fn(),
  },
  permissions: {
    contains: vi.fn(),
    request: vi.fn(),
    remove: vi.fn(),
  },
  history: {
    search: vi.fn(),
  },
  runtime: {
    sendMessage: vi.fn(),
    onMessage: { addListener: vi.fn() },
  },
  storage: {
    local: { get: vi.fn(), set: vi.fn() },
  },
};

/** Resets every mock and re-arms common defaults. Call in beforeEach. */
export function resetBrowserMock() {
  for (const api of Object.values(browser)) {
    for (const fn of Object.values(api)) {
      if (typeof fn === 'function' && 'mockReset' in fn) (fn as ReturnType<typeof vi.fn>).mockReset();
    }
  }
}

export const defineContentScript = (definition: unknown) => definition;
export const defineBackground = (definition: unknown) => definition;
export const defineUnlistedScript = (definition: unknown) => definition;
export const storage = {
  defineItem: vi.fn(() => ({
    getValue: vi.fn(),
    setValue: vi.fn(),
    watch: vi.fn(),
  })),
};
