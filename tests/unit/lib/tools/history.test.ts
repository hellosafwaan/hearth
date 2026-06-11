import { beforeEach, describe, expect, it } from 'vitest';
import { executeSearchHistory } from '../../../../src/lib/tools/executors/history';
import { browser, resetBrowserMock } from '../../../mocks/imports';

function text(result: Awaited<ReturnType<typeof executeSearchHistory>>): string {
  return (result.content[0] as { text: string }).text;
}

beforeEach(() => {
  resetBrowserMock();
  browser.permissions.contains.mockResolvedValue(true);
});

describe('executeSearchHistory', () => {
  it('lists recent history when the query is empty', async () => {
    browser.history.search.mockResolvedValue([
      { url: 'https://a.com', title: 'A', lastVisitTime: 1000, visitCount: 1 },
    ]);

    const result = await executeSearchHistory({});

    expect(browser.history.search.mock.calls[0][0].text).toBe('');
    expect(result.isError).toBeFalsy();
    expect(text(result)).toContain('recent history');
  });

  it('points the user to Settings when the permission is missing', async () => {
    browser.permissions.contains.mockResolvedValue(false);
    const result = await executeSearchHistory({ query: 'transformers' });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('Settings');
    expect(browser.history.search).not.toHaveBeenCalled();
  });

  it('dedupes by URL keeping the newest visit, sorted descending', async () => {
    browser.history.search.mockResolvedValue([
      { url: 'https://a.com', title: 'A old', lastVisitTime: 1000, visitCount: 2 },
      { url: 'https://a.com', title: 'A new', lastVisitTime: 3000, visitCount: 2 },
      { url: 'https://b.com', title: 'B', lastVisitTime: 2000, visitCount: 1 },
    ]);

    const result = await executeSearchHistory({ query: 'x' });
    const out = text(result);

    expect(out.indexOf('A new')).toBeLessThan(out.indexOf('"B"'));
    expect(out).not.toContain('A old');
    expect(out).toContain('2 visits');
  });

  it('clamps days and limit and reports an empty result helpfully', async () => {
    browser.history.search.mockResolvedValue([]);

    const result = await executeSearchHistory({ query: 'nope', days: 9999, limit: -5 });

    const call = browser.history.search.mock.calls[0][0];
    expect(call.startTime).toBeGreaterThan(Date.now() - 366 * 86_400_000);
    expect(result.isError).toBeFalsy();
    expect(text(result)).toContain('No history matches');
  });
});
