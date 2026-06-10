import { useState } from 'react';

export function Composer(props: {
  running: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
}) {
  const { running, onSend, onStop } = props;
  const [text, setText] = useState('');

  function submit() {
    const value = text.trim();
    if (!value || running) return;
    setText('');
    onSend(value);
  }

  return (
    <div className="border-t border-zinc-800 p-2.5">
      <div className="flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={Math.min(5, Math.max(1, text.split('\n').length))}
          placeholder="Ask about this page…"
          className="min-h-9 flex-1 resize-none rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-zinc-600"
        />
        {running ? (
          <button
            type="button"
            onClick={onStop}
            title="Stop"
            className="h-9 rounded-md border border-red-900 bg-red-950/50 px-3 text-xs font-medium text-red-300 transition-colors hover:bg-red-950"
          >
            ■ Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={!text.trim()}
            title="Send"
            className="h-9 rounded-md border border-zinc-700 bg-zinc-800 px-3 text-xs font-medium text-zinc-200 transition-colors hover:border-emerald-600 hover:text-emerald-400 disabled:opacity-40"
          >
            ↵ Send
          </button>
        )}
      </div>
    </div>
  );
}
