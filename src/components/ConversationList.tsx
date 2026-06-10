import { useLiveQuery } from 'dexie-react-hooks';
import { deleteConversation, listConversations } from '../lib/db/repo';

export function ConversationList(props: {
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const conversations = useLiveQuery(listConversations, [], []);

  if (conversations.length === 0) {
    return <p className="p-4 text-center text-body-sm text-faint">No conversations yet.</p>;
  }

  return (
    <ul className="h-full space-y-1 overflow-y-auto p-2">
      {conversations.map((c) => (
        <li key={c.id} className="group flex items-center">
          <button
            type="button"
            onClick={() => props.onSelect(c.id)}
            className={`min-w-0 flex-1 rounded-lg px-3 py-2 text-left transition-colors hover:bg-surface-raised ${
              c.id === props.activeId ? 'bg-surface-raised' : ''
            }`}
          >
            <span className="block truncate text-body-sm font-medium text-text">
              {c.title || 'Untitled'}
            </span>
            <span className="block font-mono text-label-sm text-faint">
              {new Date(c.updatedAt).toLocaleString()}
            </span>
          </button>
          <button
            type="button"
            title="Delete conversation"
            onClick={() => deleteConversation(c.id)}
            className="px-2.5 text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-danger"
          >
            ✕
          </button>
        </li>
      ))}
    </ul>
  );
}
