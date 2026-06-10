import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { MessageRow } from '../lib/db/schema';
import type { MessagePart } from '../lib/providers/types';
import type { LiveState } from './Chat';
import { ToolChip } from './ToolChip';
import { Banner, Spinner } from './ui';

export function MessageList(props: {
  messages: MessageRow[];
  running: boolean;
  live: LiveState;
}) {
  const { messages, running, live } = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  // Follow the stream only while the user is at the bottom; scrolling up
  // pauses auto-scroll and shows the jump pill instead.
  const [following, setFollowing] = useState(true);

  useEffect(() => {
    if (following) bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, live.streamText, live.toolNames, running, following]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    setFollowing(nearBottom);
  }

  function jumpToLatest() {
    setFollowing(true);
    bottomRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="h-full space-y-3 overflow-y-auto px-3 py-3"
      >
        {messages.map((message) => (
          <Message key={message.id} role={message.role} parts={message.parts} />
        ))}

        {live.streamText && (
          <div className="markdown max-w-full">
            <ReactMarkdown>{live.streamText}</ReactMarkdown>
          </div>
        )}
        {running && live.toolNames.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {live.toolNames.map((name, i) => (
              <ToolChip key={`${name}-${i}`} name={name} pending />
            ))}
          </div>
        )}
        {running && !live.streamText && live.toolNames.length === 0 && (
          <div className="flex items-center gap-2 text-body-sm text-faint">
            <Spinner />
            Thinking…
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {!following && (
        <button
          type="button"
          onClick={jumpToLatest}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-border bg-surface-overlay px-3 py-1 text-label-md text-muted shadow-overlay transition-colors hover:text-text"
        >
          ↓ Latest
        </button>
      )}
    </div>
  );
}

function Message(props: { role: 'user' | 'assistant'; parts: MessagePart[] }) {
  const { role, parts } = props;

  return (
    <>
      {parts.map((part, i) => {
        switch (part.type) {
          case 'text':
            return role === 'user' ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-bubble px-4 py-2.5 text-body-md whitespace-pre-wrap text-bubble-fg shadow-paper">
                  {part.text}
                </div>
              </div>
            ) : (
              <div key={i} className="markdown max-w-full">
                <ReactMarkdown>{part.text}</ReactMarkdown>
              </div>
            );
          case 'tool_use':
            return <ToolChip key={i} name={part.name} />;
          case 'tool_result':
            return <ToolResult key={i} part={part} />;
          case 'image':
            return (
              <img
                key={i}
                src={`data:${part.mediaType};base64,${part.data}`}
                alt="attachment"
                className="max-h-40 rounded-md border border-border"
              />
            );
        }
      })}
    </>
  );
}

function ToolResult(props: { part: Extract<MessagePart, { type: 'tool_result' }> }) {
  const { part } = props;
  const image = part.content.find((c) => c.type === 'image');
  const text = part.content.find((c) => c.type === 'text');

  if (part.isError) {
    return (
      <Banner tone="caution" className="text-label-md">
        {text?.type === 'text' ? text.text : `${part.toolName} failed`}
      </Banner>
    );
  }

  if (image?.type === 'image') {
    return (
      <img
        src={`data:${image.mediaType};base64,${image.data}`}
        alt={`${part.toolName} result`}
        className="max-h-32 w-auto rounded-md border border-border opacity-90"
      />
    );
  }

  return null;
}
