import { useLiveQuery } from 'dexie-react-hooks';
import { useRef, useState } from 'react';
import { runAgent } from '../lib/agent/loop';
import { appendMessage, createConversation, getMessages } from '../lib/db/repo';
import { createAnthropicProvider } from '../lib/providers/anthropic';
import type { ChatMessage } from '../lib/providers/types';
import type { Settings } from '../lib/settings/storage';
import { toolDefinitions } from '../lib/tools/definitions';
import { toolRegistry } from '../lib/tools/registry';
import { Composer } from './Composer';
import { MessageList } from './MessageList';

export interface LiveState {
  streamText: string;
  toolName: string | null;
}

export function Chat(props: {
  settings: Settings;
  conversationId: string | null;
  onConversationCreated: (id: string) => void;
}) {
  const { settings, conversationId, onConversationCreated } = props;

  const messages = useLiveQuery(
    () => (conversationId ? getMessages(conversationId) : Promise.resolve([])),
    [conversationId],
    [],
  );

  const [running, setRunning] = useState(false);
  const [live, setLive] = useState<LiveState>({ streamText: '', toolName: null });
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function send(text: string) {
    if (running || !text.trim()) return;
    setError(null);
    setRunning(true);
    setLive({ streamText: '', toolName: null });

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

      const provider = createAnthropicProvider(settings.apiKey);

      await runAgent({
        provider,
        model: settings.model,
        history,
        tools: toolDefinitions,
        registry: toolRegistry,
        signal: controller.signal,
        callbacks: {
          onTextDelta: (delta) =>
            setLive((s) => ({ ...s, streamText: s.streamText + delta })),
          onAssistantMessage: async (message) => {
            await appendMessage(convId, message);
            setLive({ streamText: '', toolName: null });
          },
          onToolStart: (part) => setLive((s) => ({ ...s, toolName: part.name })),
          onToolMessage: async (message) => {
            await appendMessage(convId, message);
            setLive((s) => ({ ...s, toolName: null }));
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
      setLive({ streamText: '', toolName: null });
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  const isEmpty = messages.length === 0 && !running;

  return (
    <div className="flex h-full flex-col">
      {isEmpty ? (
        <EmptyState onSummarize={() => send('Take a screenshot of the current page and summarize it.')} />
      ) : (
        <MessageList messages={messages} running={running} live={live} />
      )}
      {error && (
        <div className="mx-3 mb-2 rounded border border-red-900 bg-red-950/60 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}
      <Composer running={running} onSend={send} onStop={stop} />
    </div>
  );
}

function EmptyState(props: { onSummarize: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-xs text-zinc-500">
        Ask anything about the page you're on — or anything else.
        <br />
        Your key, your browser, your data.
      </p>
      <button
        type="button"
        onClick={props.onSummarize}
        className="rounded-md border border-zinc-700 bg-zinc-900 px-4 py-2 text-xs font-medium text-zinc-200 transition-colors hover:border-emerald-600 hover:text-emerald-400"
      >
        📸 Summarize this page
      </button>
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
