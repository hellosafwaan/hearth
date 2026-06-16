import { beforeEach, describe, expect, it } from 'vitest';
import {
  executeBookmarkPage,
  executeSearchBookmarks,
} from '../../../../src/lib/tools/executors/bookmarks';
import { browser, resetBrowserMock } from '../../../mocks/imports';

function text(result: Awaited<ReturnType<typeof executeSearchBookmarks>>): string {
  return (result.content[0] as { text: string }).text;
}

beforeEach(() => {
  resetBrowserMock();
  browser.permissions.contains.mockResolvedValue(true);
  browser.tabs.query.mockResolvedValue([
    { id: 1, url: 'https://example.com/post', title: 'A Post' },
  ]);
});

describe('executeSearchBookmarks', () => {
  it('points the user to Settings when the permission is missing', async () => {
    browser.permissions.contains.mockResolvedValue(false);
    const result = await executeSearchBookmarks({ query: 'x' });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('Settings');
    expect(browser.bookmarks.search).not.toHaveBeenCalled();
  });

  it('lists recent bookmarks when the query is omitted', async () => {
    browser.bookmarks.getRecent.mockResolvedValue([
      { id: '1', url: 'https://a.com', title: 'A', dateAdded: 1000 },
    ]);

    const result = await executeSearchBookmarks({});

    expect(browser.bookmarks.getRecent).toHaveBeenCalledWith(20);
    expect(text(result)).toContain('recent bookmarks');
    expect(text(result)).toContain('"A"');
  });

  it('searches by query, drops folders, sorts newest first, clamps limit', async () => {
    browser.bookmarks.search.mockResolvedValue([
      { id: 'f', title: 'Reading' }, // folder: no url
      { id: '1', url: 'https://old.com', title: 'Old', dateAdded: 1000 },
      { id: '2', url: 'https://new.com', title: 'New', dateAdded: 2000 },
    ]);

    const result = await executeSearchBookmarks({ query: 'post', limit: 999 });
    const out = text(result);

    expect(out).not.toContain('Reading');
    expect(out.indexOf('"New"')).toBeLessThan(out.indexOf('"Old"'));
  });
});

describe('executeBookmarkPage', () => {
  it('saves into a matching folder by title', async () => {
    browser.bookmarks.search.mockResolvedValue([
      { id: 'folder-9', title: 'Reading' }, // folder
      { id: 'b', url: 'https://x.com', title: 'Reading list intro' },
    ]);
    browser.bookmarks.create.mockResolvedValue({});

    const result = await executeBookmarkPage({ folder: 'Reading' });

    expect(browser.bookmarks.create).toHaveBeenCalledWith({
      parentId: 'folder-9',
      title: 'A Post',
      url: 'https://example.com/post',
    });
    expect(text(result)).toContain('"Reading" folder');
  });

  it('falls back to the default location when the folder is unknown, and says so', async () => {
    browser.bookmarks.search.mockResolvedValue([]);
    browser.bookmarks.create.mockResolvedValue({});

    const result = await executeBookmarkPage({ folder: 'Nope' });

    expect(browser.bookmarks.create).toHaveBeenCalledWith({
      title: 'A Post',
      url: 'https://example.com/post',
    });
    expect(text(result)).toContain('no folder named "Nope"');
  });

  it('refuses tabs without an http(s) URL', async () => {
    browser.tabs.query.mockResolvedValue([{ id: 1, url: 'chrome://settings', title: 'Settings' }]);
    const result = await executeBookmarkPage({});
    expect(result.isError).toBe(true);
    expect(browser.bookmarks.create).not.toHaveBeenCalled();
  });
});
