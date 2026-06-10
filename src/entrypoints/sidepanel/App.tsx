import { useEffect, useState } from 'react';
import { Chat } from '../../components/Chat';
import { ConversationList } from '../../components/ConversationList';
import { SettingsPanel } from '../../components/SettingsPanel';
import { APP_NAME } from '../../lib/constants';
import { getSettings, watchSettings, type Settings } from '../../lib/settings/storage';

type View = 'chat' | 'settings' | 'history';

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [view, setView] = useState<View>('chat');
  const [conversationId, setConversationId] = useState<string | null>(null);

  useEffect(() => {
    getSettings().then(setSettings);
    return watchSettings(setSettings);
  }, []);

  if (!settings) return null;

  const needsKey = !settings.apiKey;
  const activeView: View = needsKey ? 'settings' : view;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
        <span className="font-mono text-xs font-semibold tracking-widest text-zinc-400 uppercase">
          {APP_NAME}
        </span>
        <nav className="flex items-center gap-1">
          <HeaderButton
            label="New chat"
            active={false}
            onClick={() => {
              setConversationId(null);
              setView('chat');
            }}
          >
            +
          </HeaderButton>
          <HeaderButton
            label="History"
            active={activeView === 'history'}
            onClick={() => setView(view === 'history' ? 'chat' : 'history')}
          >
            ≡
          </HeaderButton>
          <HeaderButton
            label="Settings"
            active={activeView === 'settings'}
            onClick={() => setView(view === 'settings' ? 'chat' : 'settings')}
          >
            ⚙
          </HeaderButton>
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
          />
        )}
      </main>
    </div>
  );
}

function HeaderButton(props: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={props.label}
      aria-label={props.label}
      onClick={props.onClick}
      className={`flex h-7 w-7 items-center justify-center rounded text-base leading-none transition-colors hover:bg-zinc-800 hover:text-zinc-100 ${
        props.active ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500'
      }`}
    >
      {props.children}
    </button>
  );
}
