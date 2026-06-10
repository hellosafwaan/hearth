import { browser } from '#imports';
import type { ConsoleEntry, ConsoleLevel, NetworkEntry } from '../../devtools/protocol';
import { sendToActiveTab } from '../../messaging';
import type { ToolExecResult } from '../registry';

function errorResult(error: string): ToolExecResult {
  return { content: [{ type: 'text', text: error }], isError: true };
}

function textResult(text: string): ToolExecResult {
  return { content: [{ type: 'text', text }] };
}

async function getActiveTabId(): Promise<number> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active tab found.');
  return tab.id;
}

/** Injects the MAIN-world capture script into the active tab (idempotent). */
async function armCapture(): Promise<void> {
  const tabId = await getActiveTabId();
  await (browser as any).scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    injectImmediately: true,
    files: ['devtools-capture.js'],
  });
}

function coverageNote(startedAt: number, pageTimeOrigin: number): string {
  const afterLoadSec = Math.max(0, Math.round((startedAt - pageTimeOrigin) / 1000));
  return afterLoadSec <= 1
    ? 'Capture has been active since page load.'
    : `Capture started ~${afterLoadSec}s after page load — earlier activity was not seen ` +
        '(network requests may still appear via resource timing, without status codes). ' +
        'Use reload_and_capture for full coverage.';
}

const JUST_ARMED_NOTE =
  'Capture just started — only activity from this moment on is visible. Earlier output ' +
  '(including page-load errors) was not captured. Use reload_and_capture for full coverage, ' +
  'or ask the user to reproduce the issue and then call this tool again.';

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toTimeString().slice(0, 8) + '.' + String(d.getMilliseconds()).padStart(3, '0').slice(0, 1);
}

function formatConsole(entries: ConsoleEntry[]): string {
  if (entries.length === 0) return 'No console messages captured.';
  return entries
    .map(
      (e) =>
        `${formatTime(e.ts)} [${e.level}] ${e.text}${e.stack ? `\n    at ${e.stack}` : ''}`,
    )
    .join('\n');
}

function formatNetwork(entries: NetworkEntry[]): string {
  if (entries.length === 0) return 'No network requests captured (matching the filter).';
  return entries
    .map((e) => {
      const status =
        e.status != null
          ? String(e.status)
          : e.error
            ? `ERR ${e.error}`
            : '(resource timing — no status)';
      const size = e.sizeBytes != null ? ` ${(e.sizeBytes / 1024).toFixed(1)}kB` : '';
      const duration = e.durationMs != null ? ` ${e.durationMs}ms` : '';
      return `${formatTime(e.ts)} ${e.method} ${status} ${e.url}${duration}${size} [${e.initiator}]`;
    })
    .join('\n');
}

const CONSOLE_LEVELS = new Set(['log', 'info', 'warn', 'error', 'debug', 'all']);

export async function executeReadConsole(input: Record<string, unknown>): Promise<ToolExecResult> {
  const level = String(input.level ?? 'all');
  if (!CONSOLE_LEVELS.has(level)) {
    return errorResult('read_console "level" must be one of: error, warn, info, log, debug, all.');
  }
  const limit = typeof input.limit === 'number' ? input.limit : undefined;

  const request = { type: 'read_console' as const, level: level as ConsoleLevel | 'all', limit };
  let response = await sendToActiveTab(request);
  if (!response.ok) return errorResult(response.error);

  if (!response.data.armed) {
    try {
      await armCapture();
    } catch (error) {
      return errorResult(
        `Console capture is not available on this page (${error instanceof Error ? error.message : error}).`,
      );
    }
    response = await sendToActiveTab(request);
    if (!response.ok) return errorResult(response.error);
    if (!response.data.armed) {
      return errorResult('Capture script did not respond after injection. Try reload_and_capture.');
    }
    return textResult(`${JUST_ARMED_NOTE}\n\n${formatConsole(response.data.entries)}`);
  }

  const { startedAt, pageTimeOrigin, entries } = response.data;
  return textResult(`${coverageNote(startedAt, pageTimeOrigin)}\n\n${formatConsole(entries)}`);
}

export async function executeReadNetwork(input: Record<string, unknown>): Promise<ToolExecResult> {
  const statusMin = typeof input.status_min === 'number' ? input.status_min : undefined;
  const urlContains = typeof input.url_contains === 'string' ? input.url_contains : undefined;
  const limit = typeof input.limit === 'number' ? input.limit : undefined;

  const request = { type: 'read_network' as const, statusMin, urlContains, limit };
  let response = await sendToActiveTab(request);
  if (!response.ok) return errorResult(response.error);

  if (!response.data.armed) {
    try {
      await armCapture();
    } catch (error) {
      return errorResult(
        `Network capture is not available on this page (${error instanceof Error ? error.message : error}).`,
      );
    }
    response = await sendToActiveTab(request);
    if (!response.ok) return errorResult(response.error);
    if (!response.data.armed) {
      return errorResult('Capture script did not respond after injection. Try reload_and_capture.');
    }
    // Resource timing is retroactive, so even a just-armed capture sees
    // earlier page-load requests (without status codes).
    return textResult(`${JUST_ARMED_NOTE}\n\n${formatNetwork(response.data.entries)}`);
  }

  const { startedAt, pageTimeOrigin, entries } = response.data;
  return textResult(`${coverageNote(startedAt, pageTimeOrigin)}\n\n${formatNetwork(entries)}`);
}

export async function executeInspectElement(input: Record<string, unknown>): Promise<ToolExecResult> {
  const index = typeof input.index === 'number' ? input.index : undefined;
  const selector = typeof input.selector === 'string' && input.selector.trim() ? input.selector : undefined;
  if (index == null && !selector) {
    return errorResult('inspect_element requires "index" (from get_interactive_elements) or "selector".');
  }
  const response = await sendToActiveTab({ type: 'inspect_element', index, selector });
  if (!response.ok) return errorResult(response.error);
  return textResult(response.data.report);
}

const CAPTURE_SCRIPT_ID = 'sidekick-capture';

export async function executeReloadAndCapture(): Promise<ToolExecResult> {
  const tabId = await getActiveTabId();
  const scripting = (browser as any).scripting;

  try {
    await scripting.registerContentScripts([
      {
        id: CAPTURE_SCRIPT_ID,
        js: ['devtools-capture.js'],
        world: 'MAIN',
        runAt: 'document_start',
        matches: ['<all_urls>'],
        persistAcrossSessions: false,
      },
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/duplicate|already registered/i.test(message)) {
      // Firefox <128 lacks MAIN-world registration — tell the model plainly.
      return errorResult(
        `Cannot register the capture script in this browser (${message}). ` +
          'Full-coverage capture is unavailable; read_console/read_network still work from when they are first called.',
      );
    }
  }

  await browser.tabs.reload(tabId);
  await new Promise((resolve) => setTimeout(resolve, 2000));
  return textResult(
    'Reloaded the page with capture armed from document_start. read_console and read_network ' +
      'now have full coverage for this page, including load-time activity.',
  );
}
