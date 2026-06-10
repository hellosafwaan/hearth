import { useLiveQuery } from 'dexie-react-hooks';
import { deleteConversation, listConversations } from '../lib/db/repo';

export function ConversationList(props: {
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const conversations = useLiveQuery(listConversations, [], []);

  if (conversations.length === 0) {
    return <p className="p-4 text-center text-xs text-zinc-600">No conversations yet.</p>;
  }

  return (
    <ul className="divide-y divide-zinc-900 overflow-y-auto">
      {conversations.map((c) => (
        <li key={c.id} className="group flex items-center">
          <button
            type="button"
            onClick={() => props.onSelect(c.id)}
            className={`min-w-0 flex-1 px-4 py-2.5 text-left transition-colors hover:bg-zinc-900 ${
              c.id === props.activeId ? 'bg-zinc-900' : ''
            }`}
          >
            <span className="block truncate text-xs text-zinc-300">
              {c.title || 'Untitled'}
            </span>
            <span className="block font-mono text-[0.65rem] text-zinc-600">
              {new Date(c.updatedAt).toLocaleString()}
            </span>
          </button>
          <button
            type="button"
            title="Delete conversation"
            onClick={() => deleteConversation(c.id)}
            className="px-3 text-zinc-700 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-400"
          >
            ✕
          </button>
        </li>
      ))}
    </ul>
  );
}
