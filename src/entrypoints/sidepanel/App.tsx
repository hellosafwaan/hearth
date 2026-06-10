import { useEffect, useState } from 'react';
import { Chat, type ComposerDraft } from '../../components/Chat';
import { ConversationList } from '../../components/ConversationList';
import { SettingsPanel } from '../../components/SettingsPanel';
import { APP_NAME } from '../../lib/constants';
import { requiresApiKey } from '../../lib/providers';
import {
  formatSelectionDraft,
  takePendingSelection,
  watchPendingSelection,
  type PendingSelection,
} from '../../lib/selection';
import { getSettings, watchSettings, type Settings } from '../../lib/settings/storage';
import { IconButton } from '../../components/ui';

type View = 'chat' | 'settings' | 'history';

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [view, setView] = useState<View>('chat');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ComposerDraft | null>(null);

  useEffect(() => {
    getSettings().then(setSettings);
    return watchSettings(setSettings);
  }, []);

  // Highlight-and-ask: a selection handed off by the context menu starts a
  // fresh chat with the quote pre-filled.
  useEffect(() => {
    const apply = (selection: PendingSelection) => {
      setConversationId(null);
      setView('chat');
      setDraft({ id: selection.id, text: formatSelectionDraft(selection) });
    };
    takePendingSelection().then((selection) => {
      if (selection) apply(selection);
    });
    return watchPendingSelection((selection) => {
      takePendingSelection();
      apply(selection);
    });
  }, []);

  if (!settings) return null;

  const needsKey = requiresApiKey(settings) && !settings.apiKey;
  const activeView: View = needsKey ? 'settings' : view;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="font-mono text-label-md font-semibold tracking-widest text-muted uppercase">
          {APP_NAME}
        </span>
        <nav className="flex items-center gap-1">
          <IconButton
            label="New chat"
            onClick={() => {
              setConversationId(null);
              setView('chat');
            }}
          >
            +
          </IconButton>
          <IconButton
            label="History"
            active={activeView === 'history'}
            onClick={() => setView(view === 'history' ? 'chat' : 'history')}
          >
            ≡
          </IconButton>
          <IconButton
            label="Settings"
            active={activeView === 'settings'}
            onClick={() => setView(view === 'settings' ? 'chat' : 'settings')}
          >
            ⚙
          </IconButton>
        </nav>
      </header>

      <main className="min-h-0 flex-1">
        {activeView === 'settings' && (
          <SettingsPanel settings={settings} onDone={needsKey ? undefined : () => setView('chat')} />
        )}
        {activeView === 'history' && (
          <ConversationList
            activeId={conversationId}
            onSelect={(id) => {
              setConversationId(id);
              setView('chat');
            }}
          />
        )}
        {activeView === 'chat' && (
          <Chat
            settings={settings}
            conversationId={conversationId}
            onConversationCreated={setConversationId}
            draft={draft}
          />
        )}
      </main>
    </div>
  );
}

