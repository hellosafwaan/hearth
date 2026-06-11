import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { MessageRow } from '../lib/db/schema';
import type { ToolResultPart } from '../lib/providers/types';
import { ActivityTimeline, type TimelineStep } from './ActivityTimeline';
import type { LiveState } from './Chat';
import { Spinner } from './ui';

// The transcript renders as: user bubbles, assistant prose, and — for every
// stretch of tool work between a user message and the final answer — one
// collapsible ActivityTimeline instead of loose chips.

type Item =
  | { kind: 'user'; key: string; text: string }
  | { kind: 'assistant'; key: string; text: string }
  | { kind: 'image'; key: string; mediaType: string; data: string }
  | { kind: 'activity'; key: string; steps: TimelineStep[] };

function buildItems(messages: MessageRow[], running: boolean): Item[] {
  // Results first, so actions know their status no matter the message order.
  const results = new Map<string, ToolResultPart>();
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type === 'tool_result') results.set(part.toolUseId, part);
    }
  }

  const items: Item[] = [];
  let activity: { steps: TimelineStep[] } | null = null;

  for (const message of messages) {
    message.parts.forEach((part, index) => {
      const key = `${message.id}-${index}`;
      switch (part.type) {
        case 'text':
          // Loop-injected notes ride on tool messages — not user prose.
          if (message.role === 'user' && part.text.startsWith('[system note]')) return;
          if (message.role === 'user') {
            activity = null; // a new user message starts a new turn
            items.push({ kind: 'user', key, text: part.text });
          } else {
            items.push({ kind: 'assistant', key, text: part.text });
          }
          break;
        case 'image':
          items.push({ kind: 'image', key, mediaType: part.mediaType, data: part.data });
          break;
        case 'tool_result':
          break; // surfaced through the matching action's status
        case 'tool_use': {
          if (!activity) {
            activity = { steps: [] };
            items.push({ kind: 'activity', key: `activity-${key}`, steps: activity.steps });
          }
          // All tool_use parts of one assistant message form one step (batch).
          if (index === message.parts.findIndex((p) => p.type === 'tool_use')) {
            activity.steps.push({ actions: [] });
          }
          const result = results.get(part.id);
          const image = result?.content.find((c) => c.type === 'image');
          activity.steps[activity.steps.length - 1].actions.push({
            id: part.id,
            name: part.name,
            input: part.input,
            status: result ? (result.isError ? 'error' : 'ok') : running ? 'running' : 'skipped',
            errorText: result?.isError
              ? result.content
                  .filter((c) => c.type === 'text')
                  .map((c) => c.text)
                  .join('\n')
              : undefined,
            image: image?.type === 'image' ? { mediaType: image.mediaType, data: image.data } : undefined,
          });
          break;
        }
      }
    });
  }
  return items;
}

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

  const items = buildItems(messages, running);
  const lastActivityKey = [...items].reverse().find((i) => i.kind === 'activity')?.key;

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="h-full space-y-3 overflow-y-auto px-3 py-3"
      >
        {items.map((item) => {
          switch (item.kind) {
            case 'user':
              return (
                <div key={item.key} className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-bubble px-4 py-2.5 text-body-md whitespace-pre-wrap text-bubble-fg shadow-paper">
                    {item.text}
                  </div>
                </div>
              );
            case 'assistant':
              return (
                <div key={item.key} className="markdown max-w-full">
                  <ReactMarkdown>{item.text}</ReactMarkdown>
                </div>
              );
            case 'image':
              return (
                <img
                  key={item.key}
                  src={`data:${item.mediaType};base64,${item.data}`}
                  alt="attachment"
                  className="max-h-40 rounded-md border border-border"
                />
              );
            case 'activity':
              return (
                <ActivityTimeline
                  key={item.key}
                  steps={item.steps}
                  live={running && item.key === lastActivityKey}
                />
              );
          }
        })}

        {live.streamText && (
          <div className="markdown max-w-full">
            <ReactMarkdown>{live.streamText}</ReactMarkdown>
          </div>
        )}
        {running && live.notice && (
          <div className="flex items-center gap-2 text-body-sm text-caution">
            <Spinner />
            {live.notice}
          </div>
        )}
        {running && !live.notice && !live.streamText && live.toolNames.length === 0 && (
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
