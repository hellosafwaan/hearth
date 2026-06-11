import { beforeEach, describe, expect, it, vi } from 'vitest';
import { browser, resetBrowserMock } from '../../mocks/imports';
import { sendToActiveTab } from '../../../src/lib/messaging';
import { isTransientError } from '../../../src/lib/tools/retry';

const TAB = { id: 7, url: 'https://example.com' };

beforeEach(() => {
  vi.useRealTimers();
  resetBrowserMock();
  browser.tabs.query.mockResolvedValue([TAB]);
});

describe('sendToActiveTab', () => {
  it('delivers to the content script in the active tab', async () => {
    browser.tabs.sendMessage.mockResolvedValue({ ok: true, data: { result: 'done' } });

    const response = await sendToActiveTab({ type: 'scroll', direction: 'down' });

    expect(browser.tabs.sendMessage).toHaveBeenCalledWith(7, { type: 'scroll', direction: 'down' });
    expect(response).toEqual({ ok: true, data: { result: 'done' } });
  });

  it('injects the content script and retries once when it is missing', async () => {
    browser.tabs.sendMessage
      .mockRejectedValueOnce(new Error('Receiving end does not exist'))
      .mockResolvedValueOnce({ ok: true, data: { result: 'after-inject' } });
    browser.scripting.executeScript.mockResolvedValue(undefined);

    const response = await sendToActiveTab({ type: 'read_page' });

    expect(browser.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 7 },
      files: ['content-scripts/content.js'],
    });
    expect(response.ok).toBe(true);
  });

  it('explains the missing host permission when access was never granted', async () => {
    browser.tabs.sendMessage.mockRejectedValue(new Error('Cannot access contents of url'));
    browser.scripting.executeScript.mockRejectedValue(new Error('Cannot access contents of url'));
    browser.permissions.contains.mockResolvedValue(false);

    const response = await sendToActiveTab({ type: 'read_page' });

    expect(response.ok).toBe(false);
    if (!response.ok) expect(response.error).toContain('Grant page access');
  });

  it('explains browser-internal pages when access exists but injection fails', async () => {
    browser.tabs.sendMessage.mockRejectedValue(new Error('Cannot access a chrome:// URL'));
    browser.scripting.executeScript.mockRejectedValue(new Error('Cannot access a chrome:// URL'));
    browser.permissions.contains.mockResolvedValue(true);

    const response = await sendToActiveTab({ type: 'read_page' });

    expect(response.ok).toBe(false);
    if (!response.ok) expect(response.error).toContain('browser-internal');
  });

  it('times out a wedged tab with a transient-classifiable error', async () => {
    vi.useFakeTimers();
    browser.tabs.sendMessage.mockReturnValue(new Promise(() => {})); // never settles
    browser.scripting.executeScript.mockResolvedValue(undefined);
    browser.permissions.contains.mockResolvedValue(true);

    const pending = sendToActiveTab({ type: 'read_page' });
    await vi.runAllTimersAsync();
    const response = await pending;

    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error).toContain('timed out');
      // The retry layer must recognize this and try again automatically.
      expect(isTransientError(response.error)).toBe(true);
    }
  });
});
