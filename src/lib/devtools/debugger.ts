import type {
  ConsoleEntry,
  ConsoleLevel,
  DebuggerMessage,
  DebuggerNetworkEntry,
  DebuggerResponse,
} from './protocol';

// Tier 2 deep inspection: a chrome.debugger (CDP) session per tab, owned by
// the background script. Chrome-only. Buffers live in memory — if the MV3
// service worker is killed mid-session the buffers reset, but the attach
// survives and new events repopulate them; response bodies are never buffered
// here, they're fetched lazily from the browser via Network.getResponseBody.

const CONSOLE_BUFFER = 1000;
const NETWORK_BUFFER = 500;
const BODY_MAX_CHARS = 20000;

// Minimal chrome.debugger surface — the project deliberately has no
// @types/chrome (everything else goes through wxt's `browser`).
interface Debuggee {
  tabId?: number;
}
interface ChromeDebugger {
  attach(target: Debuggee, version: string, callback: () => void): void;
  detach(target: Debuggee, callback: () => void): void;
  sendCommand(
    target: Debuggee,
    method: string,
    params: object | undefined,
    callback: (result?: unknown) => void,
  ): void;
  onEvent: {
    addListener(cb: (source: Debuggee, method: string, params?: object) => void): void;
  };
  onDetach: { addListener(cb: (source: Debuggee) => void): void };
}
interface ChromeGlobal {
  debugger?: ChromeDebugger;
  runtime: { lastError?: { message?: string } };
  tabs: { onRemoved: { addListener(cb: (tabId: number) => void): void } };
}

function chromeApi(): ChromeGlobal | undefined {
  return (globalThis as { chrome?: ChromeGlobal }).chrome;
}

interface Session {
  attachedAt: number;
  console: ConsoleEntry[];
  network: DebuggerNetworkEntry[];
  /** requestId → index into network, for response/finished/failed updates. */
  byRequestId: Map<string, DebuggerNetworkEntry>;
}

const sessions = new Map<number, Session>();

function cdp(): ChromeDebugger {
  const api = chromeApi()?.debugger;
  if (!api) throw new Error('Deep inspection requires Chrome (chrome.debugger is unavailable).');
  return api;
}

function push<T>(buffer: T[], max: number, entry: T) {
  buffer.push(entry);
  if (buffer.length > max) buffer.splice(0, buffer.length - max);
}

function sendCommand<T = unknown>(tabId: number, method: string, params?: object): Promise<T> {
  return new Promise((resolve, reject) => {
    cdp().sendCommand({ tabId }, method, params, (result) => {
      const error = chromeApi()?.runtime.lastError;
      if (error) reject(new Error(error.message ?? 'debugger command failed'));
      else resolve(result as T);
    });
  });
}

function getOrCreateSession(tabId: number): Session {
  let session = sessions.get(tabId);
  if (!session) {
    // SW restart while attached — recreate and resume from now.
    session = { attachedAt: Date.now(), console: [], network: [], byRequestId: new Map() };
    sessions.set(tabId, session);
  }
  return session;
}

function serializeRemoteObject(obj: any): string {
  if (obj == null) return 'undefined';
  if (obj.value !== undefined) {
    return typeof obj.value === 'string' ? obj.value : JSON.stringify(obj.value);
  }
  return obj.description ?? obj.unserializableValue ?? `[${obj.type}]`;
}

function onDebuggerEvent(source: Debuggee, method: string, params?: object) {
  if (source.tabId == null) return;
  const session = getOrCreateSession(source.tabId);
  const p = params as any;

  switch (method) {
    case 'Runtime.consoleAPICalled': {
      const level: ConsoleLevel = (['log', 'info', 'warn', 'error', 'debug'] as const).includes(
        p.type,
      )
        ? p.type
        : 'log';
      push(session.console, CONSOLE_BUFFER, {
        ts: Math.round(p.timestamp),
        level,
        text: (p.args ?? []).map(serializeRemoteObject).join(' ').slice(0, 2000),
      });
      break;
    }
    case 'Runtime.exceptionThrown': {
      const detail = p.exceptionDetails;
      push(session.console, CONSOLE_BUFFER, {
        ts: Math.round(p.timestamp),
        level: 'error',
        text: `Uncaught ${detail?.exception?.description ?? detail?.text ?? 'exception'}`.slice(0, 2000),
        stack: detail?.url ? `${detail.url}:${detail.lineNumber}:${detail.columnNumber}` : undefined,
      });
      break;
    }
    case 'Log.entryAdded': {
      const entry = p.entry;
      push(session.console, CONSOLE_BUFFER, {
        ts: Math.round(entry.timestamp),
        level: entry.level === 'verbose' ? 'debug' : (entry.level as ConsoleLevel),
        text: `[${entry.source}] ${entry.text}`.slice(0, 2000),
      });
      break;
    }
    case 'Network.requestWillBeSent': {
      const record: DebuggerNetworkEntry = {
        ts: Math.round(p.wallTime * 1000),
        method: p.request.method,
        url: p.request.url,
        initiator: 'fetch',
        requestId: p.requestId,
      };
      session.byRequestId.set(p.requestId, record);
      push(session.network, NETWORK_BUFFER, record);
      if (session.byRequestId.size > NETWORK_BUFFER * 2) {
        // Keep the lookup map bounded alongside the ring buffer.
        const stale = [...session.byRequestId.keys()].slice(0, NETWORK_BUFFER);
        for (const id of stale) session.byRequestId.delete(id);
      }
      break;
    }
    case 'Network.responseReceived': {
      const record = session.byRequestId.get(p.requestId);
      if (record) {
        record.status = p.response.status;
        record.mimeType = p.response.mimeType;
      }
      break;
    }
    case 'Network.loadingFinished': {
      const record = session.byRequestId.get(p.requestId);
      if (record) record.sizeBytes = Math.round(p.encodedDataLength);
      break;
    }
    case 'Network.loadingFailed': {
      const record = session.byRequestId.get(p.requestId);
      if (record) record.error = p.errorText;
      break;
    }
  }
}

function onDetach(source: Debuggee) {
  if (source.tabId != null) sessions.delete(source.tabId);
}

let listenersRegistered = false;

/** Call once from the background entrypoint (top level, so events wake the SW). */
export function registerDebuggerLifecycle() {
  if (listenersRegistered) return;
  listenersRegistered = true;
  const api = chromeApi();
  if (!api?.debugger) return; // Firefox
  api.debugger.onEvent.addListener(onDebuggerEvent);
  api.debugger.onDetach.addListener(onDetach);
  api.tabs.onRemoved.addListener((tabId) => {
    if (!sessions.has(tabId)) return;
    sessions.delete(tabId);
    api.debugger!.detach({ tabId }, () => void api.runtime.lastError);
  });
}

async function attach(tabId: number): Promise<void> {
  if (sessions.has(tabId)) return;
  await new Promise<void>((resolve, reject) => {
    cdp().attach({ tabId }, '1.3', () => {
      const error = chromeApi()?.runtime.lastError;
      if (error) {
        reject(
          new Error(
            /another.*(client|debugger)|already attached/i.test(error.message ?? '')
              ? 'Another debugger is attached to this tab — close DevTools on it first.'
              : (error.message ?? 'debugger attach failed'),
          ),
        );
      } else resolve();
    });
  });
  sessions.set(tabId, { attachedAt: Date.now(), console: [], network: [], byRequestId: new Map() });
  await sendCommand(tabId, 'Network.enable');
  await sendCommand(tabId, 'Runtime.enable');
  await sendCommand(tabId, 'Log.enable');
}

async function detach(tabId: number): Promise<void> {
  sessions.delete(tabId);
  await new Promise<void>((resolve) => {
    cdp().detach({ tabId }, () => {
      void chromeApi()?.runtime.lastError;
      resolve();
    });
  });
}

export async function handleDebuggerMessage(message: DebuggerMessage): Promise<DebuggerResponse> {
  try {
    switch (message.type) {
      case 'debugger:enable':
        await attach(message.tabId);
        return { ok: true, data: { attached: true } };

      case 'debugger:disable':
        await detach(message.tabId);
        return { ok: true, data: { detached: true } };

      case 'debugger:status': {
        const session = sessions.get(message.tabId);
        return {
          ok: true,
          data: session ? { active: true, attachedAt: session.attachedAt } : { active: false },
        };
      }

      case 'debugger:read_console': {
        const session = sessions.get(message.tabId);
        if (!session) return { ok: false, error: 'Deep inspection is not active on this tab.' };
        let entries = session.console;
        if (message.level && message.level !== 'all') {
          const wanted: ConsoleLevel[] =
            message.level === 'warn' ? ['warn', 'error'] : [message.level];
          entries = entries.filter((e) => wanted.includes(e.level));
        }
        return {
          ok: true,
          data: {
            attachedAt: session.attachedAt,
            entries: entries.slice(-Math.min(message.limit ?? 50, 200)),
          },
        };
      }

      case 'debugger:read_network': {
        const session = sessions.get(message.tabId);
        if (!session) return { ok: false, error: 'Deep inspection is not active on this tab.' };
        let entries = session.network;
        if (message.statusMin != null) {
          entries = entries.filter((e) => e.status != null && e.status >= message.statusMin!);
        }
        if (message.urlContains) {
          const needle = message.urlContains.toLowerCase();
          entries = entries.filter((e) => e.url.toLowerCase().includes(needle));
        }
        return {
          ok: true,
          data: {
            attachedAt: session.attachedAt,
            entries: entries.slice(-Math.min(message.limit ?? 50, 200)),
          },
        };
      }

      case 'debugger:get_body': {
        if (!sessions.has(message.tabId)) {
          return { ok: false, error: 'Deep inspection is not active on this tab.' };
        }
        const result = await sendCommand<{ body: string; base64Encoded: boolean }>(
          message.tabId,
          'Network.getResponseBody',
          { requestId: message.requestId },
        );
        const truncated = result.body.length > BODY_MAX_CHARS;
        return {
          ok: true,
          data: {
            body: truncated ? result.body.slice(0, BODY_MAX_CHARS) : result.body,
            base64Encoded: result.base64Encoded,
            truncated,
          },
        };
      }
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
