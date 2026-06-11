// In-memory ring buffer of agent activity for debugging. Lives in the
// sidepanel context (where the loop and executors run); cleared when the
// panel closes. Never leaves the device unless the user exports it.

export interface DebugEvent {
  ts: number;
  kind: 'tool' | 'provider' | 'retry' | 'approval' | 'error';
  message: string;
}

const MAX_EVENTS = 200;
const events: DebugEvent[] = [];

export function logEvent(kind: DebugEvent['kind'], message: string): void {
  events.push({ ts: Date.now(), kind, message });
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
}

export function getDebugLog(): readonly DebugEvent[] {
  return events;
}

/** Plain-text export: one line per event, newest last. */
export function formatDebugLog(): string {
  if (events.length === 0) return 'No events recorded in this panel session.';
  return events
    .map((e) => `${new Date(e.ts).toISOString()} [${e.kind}] ${e.message}`)
    .join('\n');
}
