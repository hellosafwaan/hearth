import { defineUnlistedScript } from '#imports';
import {
  DEVTOOLS_REQ_EVENT,
  DEVTOOLS_RES_EVENT,
  type ConsoleEntry,
  type ConsoleLevel,
  type DevtoolsBridgeRequest,
  type DevtoolsBridgeResponse,
  type NetworkEntry,
} from '../lib/devtools/protocol';

// MAIN-world capture script. Injected on demand by the read_console /
// read_network executors (scripting.executeScript with world: 'MAIN'), or at
// document_start by reload_and_capture. It wraps console.* and fetch/XHR,
// buffers entries in ring buffers it owns (so they survive isolated-world
// re-injection), and answers queries from the content script over
// CustomEvents. Everything calls through — page behavior is unchanged.

const CONSOLE_BUFFER = 500;
const NETWORK_BUFFER = 300;
const ARG_MAX_CHARS = 500;

interface CaptureState {
  startedAt: number;
  console: ConsoleEntry[];
  network: NetworkEntry[];
}

export default defineUnlistedScript(() => {
  const FLAG = '__sidekick_capture__';
  const w = window as unknown as Record<string, unknown>;
  if (w[FLAG]) return; // already armed
  const state: CaptureState = { startedAt: Date.now(), console: [], network: [] };
  w[FLAG] = state;

  function push<T>(buffer: T[], max: number, entry: T) {
    buffer.push(entry);
    if (buffer.length > max) buffer.splice(0, buffer.length - max);
  }

  function serializeArg(arg: unknown): string {
    try {
      if (typeof arg === 'string') return arg.slice(0, ARG_MAX_CHARS);
      if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
      if (typeof arg === 'object' && arg !== null) {
        return JSON.stringify(arg).slice(0, ARG_MAX_CHARS);
      }
      return String(arg).slice(0, ARG_MAX_CHARS);
    } catch {
      return '[unserializable]';
    }
  }

  // --- Console ---

  const LEVELS: ConsoleLevel[] = ['log', 'info', 'warn', 'error', 'debug'];
  for (const level of LEVELS) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      push(state.console, CONSOLE_BUFFER, {
        ts: Date.now(),
        level,
        text: args.map(serializeArg).join(' '),
      });
      original(...args);
    };
  }

  window.addEventListener('error', (event) => {
    push(state.console, CONSOLE_BUFFER, {
      ts: Date.now(),
      level: 'error',
      text: `Uncaught ${event.message}`,
      stack: event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : undefined,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    push(state.console, CONSOLE_BUFFER, {
      ts: Date.now(),
      level: 'error',
      text: `Unhandled promise rejection: ${serializeArg(event.reason)}`,
    });
  });

  // --- Network: fetch ---

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const started = performance.now();
    const request = args[0];
    const url =
      typeof request === 'string'
        ? request
        : request instanceof URL
          ? request.href
          : request.url;
    const method = (args[1]?.method ?? (request instanceof Request ? request.method : 'GET'))
      .toUpperCase();
    try {
      const response = await originalFetch(...args);
      push(state.network, NETWORK_BUFFER, {
        ts: Date.now(),
        method,
        url,
        status: response.status,
        durationMs: Math.round(performance.now() - started),
        sizeBytes: Number(response.headers.get('content-length')) || undefined,
        initiator: 'fetch',
      });
      return response;
    } catch (error) {
      push(state.network, NETWORK_BUFFER, {
        ts: Date.now(),
        method,
        url,
        durationMs: Math.round(performance.now() - started),
        initiator: 'fetch',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };

  // --- Network: XHR ---

  const XHR = XMLHttpRequest.prototype;
  const originalOpen = XHR.open;
  const originalSend = XHR.send;
  const xhrMeta = new WeakMap<XMLHttpRequest, { method: string; url: string; started: number }>();

  XHR.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: any[]) {
    xhrMeta.set(this, { method: method.toUpperCase(), url: String(url), started: 0 });
    return (originalOpen as any).call(this, method, url, ...rest);
  };

  XHR.send = function (this: XMLHttpRequest, ...args: any[]) {
    const meta = xhrMeta.get(this);
    if (meta) {
      meta.started = performance.now();
      this.addEventListener('loadend', () => {
        push(state.network, NETWORK_BUFFER, {
          ts: Date.now(),
          method: meta.method,
          url: meta.url,
          status: this.status || undefined,
          durationMs: Math.round(performance.now() - meta.started),
          initiator: 'xhr',
          error: this.status === 0 ? 'network error or aborted' : undefined,
        });
      });
    }
    return (originalSend as any).call(this, ...args);
  };

  // --- Network: resource timing (retroactive — covers requests made before
  // injection and ones we can't wrap, like <img> and <script> loads) ---

  const seenPerfUrls = new Set<string>();
  // fetch/XHR made after arming are recorded by the wrappers with richer
  // data — only take resource-timing entries from before that point.
  const armedAtPageTime = performance.now();
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as PerformanceResourceTiming[]) {
        const wrapped =
          entry.initiatorType === 'fetch' || entry.initiatorType === 'xmlhttprequest';
        if (wrapped && entry.startTime >= armedAtPageTime) continue;
        if (seenPerfUrls.has(entry.name)) continue;
        seenPerfUrls.add(entry.name);
        push(state.network, NETWORK_BUFFER, {
          ts: Math.round(performance.timeOrigin + entry.startTime),
          method: 'GET',
          url: entry.name,
          durationMs: Math.round(entry.duration),
          sizeBytes: entry.transferSize || undefined,
          initiator: 'perf',
        });
      }
    });
    observer.observe({ type: 'resource', buffered: true });
  } catch {
    // PerformanceObserver unavailable — fetch/XHR wrapping still works.
  }

  // --- Bridge: answer queries from the isolated-world content script ---

  document.addEventListener(DEVTOOLS_REQ_EVENT, (event) => {
    let request: DevtoolsBridgeRequest;
    try {
      request = JSON.parse((event as CustomEvent<string>).detail);
    } catch {
      return;
    }

    const { filter = {} } = request;
    const limit = Math.min(filter.limit ?? 50, 200);
    let payload: DevtoolsBridgeResponse['payload'];

    if (request.kind === 'console') {
      let entries = state.console;
      if (filter.level && filter.level !== 'all') {
        const wanted: ConsoleLevel[] =
          filter.level === 'warn' ? ['warn', 'error'] : [filter.level];
        entries = entries.filter((e) => wanted.includes(e.level));
      }
      payload = {
        kind: 'console',
        startedAt: state.startedAt,
        pageTimeOrigin: performance.timeOrigin,
        entries: entries.slice(-limit),
      };
    } else if (request.kind === 'network') {
      let entries = state.network;
      if (filter.statusMin != null) {
        entries = entries.filter((e) => e.status != null && e.status >= filter.statusMin!);
      }
      if (filter.urlContains) {
        const needle = filter.urlContains.toLowerCase();
        entries = entries.filter((e) => e.url.toLowerCase().includes(needle));
      }
      payload = {
        kind: 'network',
        startedAt: state.startedAt,
        pageTimeOrigin: performance.timeOrigin,
        entries: entries.slice(-limit),
      };
    } else {
      payload = {
        kind: 'status',
        status: {
          startedAt: state.startedAt,
          pageTimeOrigin: performance.timeOrigin,
          consoleCount: state.console.length,
          networkCount: state.network.length,
        },
      };
    }

    document.dispatchEvent(
      new CustomEvent(DEVTOOLS_RES_EVENT, {
        detail: JSON.stringify({ id: request.id, payload } satisfies DevtoolsBridgeResponse),
      }),
    );
  });
});
