import { useLiveQuery } from 'dexie-react-hooks';
import { APP_NAME } from '../lib/constants';
import { getMessages } from '../lib/db/repo';
import { supportsTools } from '../lib/providers';
import type { Settings } from '../lib/settings/storage';
import { ApprovalCard } from './ApprovalCard';
import { Composer } from './Composer';
import { MessageList } from './MessageList';
import { PermissionBanner } from './PermissionBanner';
import { Banner } from './ui';
import { useAgent } from './useAgent';

export type { LiveState } from './useAgent';

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

  const { running, live, error, pendingApproval, send, stop } = useAgent({
    settings,
    conversationId,
    onConversationCreated,
  });

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
