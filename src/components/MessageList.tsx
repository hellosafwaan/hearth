import { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import type { MessageRow } from '../lib/db/schema';
import type { MessagePart } from '../lib/providers/types';
import type { LiveState } from './Chat';
import { ToolChip } from './ToolChip';

export function MessageList(props: {
  messages: MessageRow[];
  running: boolean;
  live: LiveState;
}) {
  const { messages, running, live } = props;
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, live.streamText, live.toolName, running]);

  return (
    <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
      {messages.map((message) => (
        <Message key={message.id} role={message.role} parts={message.parts} />
      ))}

      {live.streamText && (
        <div className="markdown max-w-full text-zinc-200">
          <ReactMarkdown>{live.streamText}</ReactMarkdown>
        </div>
      )}
      {running && live.toolName && <ToolChip name={live.toolName} pending />}
      {running && !live.streamText && !live.toolName && (
        <div className="animate-pulse text-xs text-zinc-500">thinking…</div>
      )}

      <div ref={bottomRef} />
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
              <div
                key={i}
                className="ml-8 rounded-lg rounded-br-sm border border-zinc-800 bg-zinc-900 px-3 py-2 whitespace-pre-wrap text-zinc-200"
              >
                {part.text}
              </div>
            ) : (
              <div key={i} className="markdown max-w-full text-zinc-200">
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
                className="max-h-40 rounded-md border border-zinc-800"
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
      <div className="rounded border border-amber-900/60 bg-amber-950/30 px-2.5 py-1.5 text-xs text-amber-300">
        {text?.type === 'text' ? text.text : `${part.toolName} failed`}
      </div>
    );
  }

  if (image?.type === 'image') {
    return (
      <img
        src={`data:${image.mediaType};base64,${image.data}`}
        alt={`${part.toolName} result`}
        className="max-h-32 w-auto rounded-md border border-zinc-800 opacity-90"
      />
    );
  }

  return null;
}
