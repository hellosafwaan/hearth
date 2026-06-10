import { useEffect, useRef, useState } from 'react';
import type { ComposerDraft } from './Chat';

export function Composer(props: {
  running: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  draft?: ComposerDraft | null;
  /** Shown as a quiet footer, e.g. "claude-sonnet-4-6". */
  modelLabel?: string;
}) {
  const { running, onSend, onStop, draft } = props;
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // A new draft (e.g. from highlight-and-ask) replaces the composer content.
  useEffect(() => {
    if (!draft) return;
    setText(draft.text);
    textareaRef.current?.focus();
  }, [draft?.id]);

  // Auto-grow up to ~6 lines, then scroll inside the textarea.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 144)}px`;
  }, [text]);

  function submit() {
    const value = text.trim();
    if (!value || running) return;
    setText('');
    onSend(value);
  }

  return (
    <div className="px-2.5 pt-1.5 pb-2">
      <div className="flex items-end gap-2 rounded-2xl border border-border bg-surface-overlay p-1.5 shadow-paper transition-colors focus-within:border-accent">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          placeholder="Ask Sidekick…"
          className="max-h-32 flex-1 resize-none border-none bg-transparent px-2.5 py-2 text-body-md text-text placeholder-faint outline-none"
        />
        {running ? (
          <button
            type="button"
            onClick={onStop}
            title="Stop"
            aria-label="Stop"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-danger-soft text-danger transition-transform active:scale-90"
          >
            ■
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={!text.trim()}
            title="Send (Enter)"
            aria-label="Send"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-fg shadow-paper transition-transform hover:bg-accent-strong active:scale-90 disabled:opacity-40"
          >
            ↑
          </button>
        )}
      </div>
      <div className="mt-1.5 flex items-center justify-center gap-2">
        <span className="text-label-sm text-faint">Enter to send</span>
        {props.modelLabel && (
          <>
            <span className="text-label-sm text-faint">·</span>
            <span className="max-w-40 truncate font-mono text-label-sm text-faint">
              {props.modelLabel}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
