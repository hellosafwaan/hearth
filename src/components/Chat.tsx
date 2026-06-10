import { useLiveQuery } from 'dexie-react-hooks';
import { useRef, useState } from 'react';
import { browser } from '#imports';
import { runAgent } from '../lib/agent/loop';
import { appendMessage, createConversation, getMessages } from '../lib/db/repo';
import { createProvider, supportsTools, supportsVision } from '../lib/providers';
import type { ChatMessage, ToolUsePart } from '../lib/providers/types';
import { addAutoApproveOrigin, getSettings, type Settings } from '../lib/settings/storage';
import { ACTING_TOOLS, SEQUENTIAL_TOOLS, toolDefinitions } from '../lib/tools/definitions';
import { toolRegistry } from '../lib/tools/registry';
import { shrinkImagesForStorage } from '../lib/image';
import { ApprovalCard, type ApprovalDecision, type PendingApproval } from './ApprovalCard';
import { Composer } from './Composer';
import { MessageList } from './MessageList';
import { PermissionBanner } from './PermissionBanner';

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
  const [live, setLive] = useState<LiveState>({ streamText: '', toolNames: [] });
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
    setLive({ streamText: '', toolNames: [] });

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
      const tools = !supportsTools(settings)
        ? []
        : supportsVision(settings)
          ? toolDefinitions
          : toolDefinitions.filter((t) => t.name !== 'screenshot');

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
            setLive({ streamText: '', toolNames: [] });
          },
          onToolStart: (part) =>
            setLive((s) => ({ ...s, toolNames: [...s.toolNames, part.name] })),
          onToolMessage: async (message) => {
            await appendMessage(convId, await shrinkImagesForStorage(message));
            setLive((s) => ({ ...s, toolNames: [] }));
          },
        },
      });
    } catch (err) {
      if (!isAbortError(err)) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      abortRef.current = null;
      setRunning(false);
      setLive({ streamText: '', toolNames: [] });
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
        <EmptyState
          canUseTools={supportsTools(settings)}
          onSummarize={() => send('Summarize the current page.')}
        />
      ) : (
        <MessageList messages={messages} running={running} live={live} />
      )}
      <PermissionBanner />
      {pendingApproval && <ApprovalCard approval={pendingApproval} />}
      {error && (
        <div className="mx-3 mb-2 rounded border border-red-900 bg-red-950/60 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}
      <Composer running={running} onSend={send} onStop={stop} draft={draft} />
    </div>
  );
}

function EmptyState(props: { canUseTools: boolean; onSummarize: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-xs text-zinc-500">
        Ask anything about the page you're on — or anything else.
        <br />
        Your key, your browser, your data.
      </p>
      {props.canUseTools ? (
        <button
          type="button"
          onClick={props.onSummarize}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-4 py-2 text-xs font-medium text-zinc-200 transition-colors hover:border-emerald-600 hover:text-emerald-400"
        >
          📄 Summarize this page
        </button>
      ) : (
        <p className="text-[0.65rem] text-zinc-600">
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
