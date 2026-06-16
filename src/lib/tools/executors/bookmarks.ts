import { browser } from '#imports';
import { getActiveTab } from '../../messaging';
import { hasBookmarksPermission } from '../../permissions';
import type { ToolExecResult } from '../registry';

// Bookmark search runs entirely on-device; only matching titles/URLs enter
// the conversation. Saving a bookmark is an acting tool behind the approval
// gate (the user sees the target folder before it happens).

interface BookmarkItem {
  id: string;
  url?: string; // folders have no url
  title: string;
  dateAdded?: number;
}

function errorResult(error: string): ToolExecResult {
  return { content: [{ type: 'text', text: error }], isError: true };
}

function textResult(text: string): ToolExecResult {
  return { content: [{ type: 'text', text }] };
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? Math.floor(value) : Number.NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

const PERMISSION_MISSING =
  'Bookmarks access has not been granted. Ask the user to enable "Bookmarks" under ' +
  'Settings → Permissions, then try again.';

interface BookmarksApi {
  search(query: string | { title?: string }): Promise<BookmarkItem[]>;
  getRecent(count: number): Promise<BookmarkItem[]>;
  create(details: { parentId?: string; title: string; url: string }): Promise<unknown>;
}

function bookmarksApi(): BookmarksApi | null {
  const api = (browser as any).bookmarks;
  return api?.search && api?.create ? (api as BookmarksApi) : null;
}

function formatBookmark(item: BookmarkItem): string {
  const added = item.dateAdded ? new Date(item.dateAdded).toISOString().slice(0, 10) : 'unknown';
  return `- "${item.title || item.url}" — ${item.url}\n  added ${added}`;
}

export async function executeSearchBookmarks(
  input: Record<string, unknown>,
): Promise<ToolExecResult> {
  // Empty query is valid: it lists the most recently added bookmarks.
  const query = typeof input.query === 'string' ? input.query.trim() : '';
  const limit = clamp(input.limit, 1, 50, 20);

  if (!(await hasBookmarksPermission())) return errorResult(PERMISSION_MISSING);
  const api = bookmarksApi();
  if (!api) return errorResult('The bookmarks API is not available in this browser.');

  let items: BookmarkItem[];
  if (query) {
    const found: BookmarkItem[] = await api.search(query);
    items = found
      .filter((item) => !!item.url) // drop folders
      .sort((a, b) => (b.dateAdded ?? 0) - (a.dateAdded ?? 0));
  } else {
    items = (await api.getRecent(limit)) as BookmarkItem[];
  }

  const total = items.length;
  items = items.slice(0, limit);
  const scope = query ? `matches for "${query}"` : 'recent bookmarks';

  if (items.length === 0) {
    return textResult(`No bookmark ${scope}. Try different keywords.`);
  }
  return textResult(
    `Bookmark ${scope} (${items.length} of ${total}):\n${items.map(formatBookmark).join('\n')}`,
  );
}

export async function executeBookmarkPage(input: Record<string, unknown>): Promise<ToolExecResult> {
  const folder = typeof input.folder === 'string' ? input.folder.trim() : '';

  if (!(await hasBookmarksPermission())) return errorResult(PERMISSION_MISSING);
  const api = bookmarksApi();
  if (!api) return errorResult('The bookmarks API is not available in this browser.');

  const tab = await getActiveTab();
  if (!tab.url || !/^https?:/.test(tab.url)) {
    return errorResult('The current tab has no bookmarkable http(s) URL.');
  }

  // Resolve a folder by title; fall back to the browser's default location
  // (and say so) rather than failing the save.
  let parentId: string | undefined;
  let folderNote = 'the default bookmarks folder';
  if (folder) {
    const matches: BookmarkItem[] = await api.search({ title: folder });
    const match = matches.find((item) => !item.url);
    if (match) {
      parentId = match.id;
      folderNote = `the "${folder}" folder`;
    } else {
      folderNote = `the default bookmarks folder (no folder named "${folder}" was found)`;
    }
  }

  await api.create({
    ...(parentId ? { parentId } : {}),
    title: tab.title ?? tab.url,
    url: tab.url,
  });

  return textResult(`Bookmarked "${tab.title ?? tab.url}" into ${folderNote}.`);
}
