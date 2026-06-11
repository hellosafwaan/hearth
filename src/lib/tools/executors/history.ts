import { browser } from '#imports';
import { hasHistoryPermission } from '../../permissions';
import type { ToolExecResult } from '../registry';

// History search runs entirely on-device: the query goes to the browser's
// history API, and only the matching titles/URLs enter the conversation.

interface HistoryItem {
  url?: string;
  title?: string;
  lastVisitTime?: number;
  visitCount?: number;
}

function errorResult(error: string): ToolExecResult {
  return { content: [{ type: 'text', text: error }], isError: true };
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? Math.floor(value) : Number.NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function formatVisit(item: HistoryItem): string {
  const when = item.lastVisitTime
    ? new Date(item.lastVisitTime).toISOString().slice(0, 16).replace('T', ' ')
    : 'unknown time';
  const visits = item.visitCount && item.visitCount > 1 ? `, ${item.visitCount} visits` : '';
  return `- "${item.title || item.url}" — ${item.url}\n  last visited ${when}${visits}`;
}

export async function executeSearchHistory(input: Record<string, unknown>): Promise<ToolExecResult> {
  // Empty query is valid: it lists recent history instead of searching.
  const query = typeof input.query === 'string' ? input.query.trim() : '';

  if (!(await hasHistoryPermission())) {
    return errorResult(
      'History access has not been granted. Ask the user to enable "History" under ' +
        'Settings → Permissions, then try again.',
    );
  }

  const api = (browser as any).history;
  if (!api?.search) {
    return errorResult('The history API is not available in this browser.');
  }

  const days = clamp(input.days, 1, 365, 30);
  const limit = clamp(input.limit, 1, 50, 20);

  const items: HistoryItem[] = await api.search({
    text: query,
    startTime: Date.now() - days * 86_400_000,
    maxResults: 200,
  });

  // The API can return one entry per visit — keep the newest per URL.
  const byUrl = new Map<string, HistoryItem>();
  for (const item of items) {
    if (!item.url) continue;
    const existing = byUrl.get(item.url);
    if (!existing || (item.lastVisitTime ?? 0) > (existing.lastVisitTime ?? 0)) {
      byUrl.set(item.url, item);
    }
  }
  const unique = [...byUrl.values()]
    .sort((a, b) => (b.lastVisitTime ?? 0) - (a.lastVisitTime ?? 0))
    .slice(0, limit);

  const scope = query ? `matches for "${query}"` : 'recent history';
  if (unique.length === 0) {
    return {
      content: [
        {
          type: 'text',
          text:
            `No history ${scope} in the last ${days} days. ` +
            'Try different keywords or a longer time range (days parameter).',
        },
      ],
    };
  }

  return {
    content: [
      {
        type: 'text',
        text:
          `History ${scope} (last ${days} days, ${unique.length} of ${byUrl.size}):\n` +
          unique.map(formatVisit).join('\n'),
      },
    ],
  };
}
