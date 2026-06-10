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
export const DEVTOOLS_REQ_EVENT = '__sidekick_devtools_req__';
export const DEVTOOLS_RES_EVENT = '__sidekick_devtools_res__';

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
