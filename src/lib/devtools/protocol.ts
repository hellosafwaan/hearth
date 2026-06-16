// Shared types for the devtools capture pipeline. Three contexts speak this
// protocol: the MAIN-world capture script (entrypoints/devtools-capture.ts),
// the isolated-world content script bridge, and the sidepanel executors.

export type ConsoleLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

export interface ConsoleEntry {
  /** ms since epoch */
  ts: number;
  level: ConsoleLevel;
  text: string;
  /** First line of the stack for uncaught errors / rejections. */
  stack?: string;
}

export interface NetworkEntry {
  ts: number;
  method: string;
  url: string;
  status?: number;
  durationMs?: number;
  sizeBytes?: number;
  /** 'perf' entries come from resource timing — observed but not intercepted. */
  initiator: 'fetch' | 'xhr' | 'perf';
  error?: string;
}

export interface CaptureStatus {
  /** ms since epoch when the capture script started buffering. */
  startedAt: number;
  /** performance.timeOrigin of the page, to compute "Ns after page load". */
  pageTimeOrigin: number;
  consoleCount: number;
  networkCount: number;
}

// MAIN world ↔ isolated world bridge. CustomEvent detail is a JSON string —
// structured detail objects hit Firefox X-ray cloning restrictions.
export const DEVTOOLS_REQ_EVENT = '__hearth_devtools_req__';
export const DEVTOOLS_RES_EVENT = '__hearth_devtools_res__';

export type DevtoolsQueryKind = 'console' | 'network' | 'status';

export interface DevtoolsBridgeRequest {
  id: string;
  kind: DevtoolsQueryKind;
  filter?: {
    level?: ConsoleLevel | 'all';
    statusMin?: number;
    urlContains?: string;
    limit?: number;
  };
}

export interface DevtoolsBridgeResponse {
  id: string;
  payload:
    | { kind: 'console'; startedAt: number; pageTimeOrigin: number; entries: ConsoleEntry[] }
    | { kind: 'network'; startedAt: number; pageTimeOrigin: number; entries: NetworkEntry[] }
    | { kind: 'status'; status: CaptureStatus };
}

// --- Tier 2: sidepanel ↔ background protocol for chrome.debugger sessions ---

/** Network entry from CDP — has a requestId usable with get_response_body. */
export interface DebuggerNetworkEntry extends NetworkEntry {
  requestId: string;
  mimeType?: string;
}

export type DebuggerMessage =
  | { type: 'debugger:enable'; tabId: number }
  | { type: 'debugger:disable'; tabId: number }
  | { type: 'debugger:status'; tabId: number }
  | { type: 'debugger:read_console'; tabId: number; level?: ConsoleLevel | 'all'; limit?: number }
  | {
      type: 'debugger:read_network';
      tabId: number;
      statusMin?: number;
      urlContains?: string;
      limit?: number;
    }
  | { type: 'debugger:get_body'; tabId: number; requestId: string };

export type DebuggerResponseData = {
  'debugger:enable': { attached: true };
  'debugger:disable': { detached: true };
  'debugger:status': { active: boolean; attachedAt?: number };
  'debugger:read_console': { attachedAt: number; entries: ConsoleEntry[] };
  'debugger:read_network': { attachedAt: number; entries: DebuggerNetworkEntry[] };
  'debugger:get_body': { body: string; base64Encoded: boolean; truncated: boolean };
};

export type DebuggerResponse<T extends DebuggerMessage['type'] = DebuggerMessage['type']> =
  | { ok: true; data: DebuggerResponseData[T] }
  | { ok: false; error: string };

export function isDebuggerMessage(message: unknown): message is DebuggerMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    typeof (message as { type?: unknown }).type === 'string' &&
    (message as { type: string }).type.startsWith('debugger:')
  );
}
