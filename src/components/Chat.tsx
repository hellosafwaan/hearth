import { useLiveQuery } from 'dexie-react-hooks';
import { useRef, useState } from 'react';
import { browser } from '#imports';
import { runAgent } from '../lib/agent/loop';
import { APP_NAME } from '../lib/constants';
import { appendMessage, createConversation, getMessages } from '../lib/db/repo';
import { createProvider, supportsTools, supportsVision } from '../lib/providers';
import { describeProviderError } from '../lib/providers/errors';
import type { ChatMessage, ToolUsePart } from '../lib/providers/types';
import { addAutoApproveOrigin, getSettings, type Settings } from '../lib/settings/storage';
import {
  ACTING_TOOLS,
  DEBUGGER_TOOLS,
  SEQUENTIAL_TOOLS,
  toolDefinitions,
} from '../lib/tools/definitions';
import { toolRegistry } from '../lib/tools/registry';
import { shrinkImagesForStorage } from '../lib/image';
import { ApprovalCard, type ApprovalDecision, type PendingApproval } from './ApprovalCard';
import { Composer } from './Composer';
import { MessageList } from './MessageList';
import { PermissionBanner } from './PermissionBanner';
import { Banner } from './ui';

async function getActiveTabOrigin(): Promise<string | null> {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) return null;
    const url = new URL(tab.url);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null;
  } catch {
    return null;
  }
}

export interface LiveState {
  streamText: string;
  /** Tools currently executing — several can run in parallel. */
  toolNames: string[];
  /** Transient status, e.g. "Rate limited — retrying in 8s…". */
  notice: string | null;
}

export interface ComposerDraft {
  id: string;
  text: string;
}

export function Chat(props: {
  settings: Settings;
  conversationId: string | null;
  onConversationCreated: (id: string) => void;
  draft?: ComposerDraft | null;
}) {
  const { settings, conversationId, onConversationCreated, draft } = props;

  const messages = useLiveQuery(
    () => (conversationId ? getMessages(conversationId) : Promise.resolve([])),
    [conversationId],
    [],
  );

  const [running, setRunning] = useState(false);
  const [live, setLive] = useState<LiveState>({ streamText: '', toolNames: [], notice: null });
  const [error, setError] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function requestApproval(part: ToolUsePart): Promise<boolean> {
    const origin = await getActiveTabOrigin();

    // Read settings fresh — the prop can be stale mid-run.
    const current = await getSettings();
    if (origin && current.autoApproveOrigins.includes(origin)) return true;

    const decision = await new Promise<ApprovalDecision>((resolve) => {
      setPendingApproval({
        toolUseId: part.id,
        name: part.name,
        input: part.input,
        host: origin ? new URL(origin).host : null,
        resolve,
      });
    });
    setPendingApproval(null);

    if (decision.approved && decision.rememberOrigin && origin) {
      await addAutoApproveOrigin(origin);
    }
    return decision.approved;
  }

  async function send(text: string) {
    if (running || !text.trim()) return;
    setError(null);
    setRunning(true);
    setLive({ streamText: '', toolNames: [], notice: null });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const convId = conversationId ?? (await createConversation());
      if (!conversationId) onConversationCreated(convId);

      const rows = await getMessages(convId);
      const history: ChatMessage[] = rows.map((r) => ({ role: r.role, parts: r.parts }));

      const userMessage: ChatMessage = { role: 'user', parts: [{ type: 'text', text }] };
      await appendMessage(convId, userMessage);
      history.push(userMessage);

      const provider = createProvider(settings);
      // Deep inspection rides on chrome.debugger — not offered on Firefox.
      const available = toolDefinitions.filter(
        (t) =>
          (!import.meta.env.FIREFOX || !DEBUGGER_TOOLS.has(t.name)) &&
          (supportsVision(settings) || t.name !== 'screenshot'),
      );
      const tools = supportsTools(settings) ? available : [];

      await runAgent({
        provider,
        model: settings.model,
        history,
        tools,
        registry: toolRegistry,
        actingTools: ACTING_TOOLS,
        sequentialTools: SEQUENTIAL_TOOLS,
        signal: controller.signal,
        callbacks: {
          requestApproval,
          onTextDelta: (delta) =>
            setLive((s) => ({ ...s, streamText: s.streamText + delta })),
          onAssistantMessage: async (message) => {
            await appendMessage(convId, message);
            setLive((s) => ({ ...s, streamText: '', toolNames: [] }));
          },
          onToolStart: (part) =>
            setLive((s) => ({ ...s, toolNames: [...s.toolNames, part.name] })),
          onToolMessage: async (message) => {
            await appendMessage(convId, await shrinkImagesForStorage(message));
            setLive((s) => ({ ...s, toolNames: [] }));
          },
          onNotice: (notice) => setLive((s) => ({ ...s, notice })),
        },
      });
    } catch (err) {
      if (!isAbortError(err)) {
        setError(describeProviderError(err));
      }
    } finally {
      abortRef.current = null;
      setRunning(false);
      setLive({ streamText: '', toolNames: [], notice: null });
      setPendingApproval(null);
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  const isEmpty = messages.length === 0 && !running;

  return (
    <div className="flex h-full flex-col">
      {isEmpty ? (
        <EmptyState canUseTools={supportsTools(settings)} onAsk={send} />
      ) : (
        <MessageList messages={messages} running={running} live={live} />
      )}
      <PermissionBanner />
      {pendingApproval && <ApprovalCard approval={pendingApproval} />}
      {error && (
        <Banner tone="danger" className="mx-3 mb-2">
          {error}
        </Banner>
      )}
      <Composer
        running={running}
        onSend={send}
        onStop={stop}
        draft={draft}
        modelLabel={settings.model}
      />
    </div>
  );
}

const QUICK_ACTIONS = [
  { kind: 'Quick Action', label: 'Summarize this page', prompt: 'Summarize the current page.' },
  {
    kind: 'Developer',
    label: 'Any console errors?',
    prompt: 'Check the console for errors on this page.',
  },
  {
    kind: 'Inquiry',
    label: "What's this site built with?",
    prompt: 'What is this site built with?',
  },
] as const;

function EmptyState(props: { canUseTools: boolean; onAsk: (prompt: string) => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-5 text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-soft">
        <svg viewBox="0 0 24 24" className="h-8 w-8 fill-accent" aria-hidden="true">
          <path d="M11 21v-7H6.5L13 3v7h4.5L11 21z" />
        </svg>
      </div>
      <h2 className="mb-1.5 text-headline-lg font-bold">{APP_NAME}</h2>
      <p className="mb-6 max-w-[280px] text-body-md text-muted">
        Your key. Your browser. Nothing leaves your device.
      </p>
      <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-border bg-surface-raised px-3 py-1.5">
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-accent" aria-hidden="true">
          <path d="M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3z" />
        </svg>
        <span className="font-mono text-label-md text-accent">Privacy Promise Active</span>
      </div>
      {props.canUseTools ? (
        <div className="flex w-full max-w-80 flex-col gap-3">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={() => props.onAsk(action.prompt)}
              className="group flex items-center justify-between rounded-xl border border-border bg-surface-raised p-4 text-left transition-colors hover:bg-surface-hover"
            >
              <span className="flex flex-col">
                <span className="mb-1 font-mono text-label-md text-accent">{action.kind}</span>
                <span className="text-body-md font-medium text-text">{action.label}</span>
              </span>
              <span className="text-faint transition-transform group-hover:translate-x-1">›</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-label-sm text-faint">
          Page tools are off for this model (enable "tool calling" in Settings if it supports them).
        </p>
      )}
    </div>
  );
}

function isAbortError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    err.name === 'AbortError' ||
    err.name === 'APIUserAbortError' ||
    err.message.toLowerCase().includes('abort')
  );
}
