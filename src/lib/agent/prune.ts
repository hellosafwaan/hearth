import {
  KEEP_RECENT_IMAGES,
  KEEP_RECENT_TOOL_RESULTS,
  PRUNE_TEXT_KEEP,
  PRUNE_TEXT_THRESHOLD,
} from '../constants';
import type { ChatMessage, ToolResultPart } from '../providers/types';

// Send-time context pruning. Old screenshots and giant read_page dumps
// describe page states that no longer exist — paying for them on every
// request buys nothing. This trims what goes to the provider; the local
// history and the DB keep everything (never mutate the inputs: the message
// objects are the same ones Dexie persisted).
//
// Invariant: tool_result blocks are never dropped and their ids never change —
// providers require every tool_use to have a matching tool_result.

export function pruneForRequest(messages: ChatMessage[]): ChatMessage[] {
  // Rank tool results newest-first to decide what stays at full fidelity.
  let resultRank = 0;
  let imageRank = 0;
  const keep = new Map<ToolResultPart, { text: boolean; images: boolean }>();

  for (let i = messages.length - 1; i >= 0; i--) {
    for (let j = messages[i].parts.length - 1; j >= 0; j--) {
      const part = messages[i].parts[j];
      if (part.type !== 'tool_result') continue;
      const hasImage = part.content.some((c) => c.type === 'image');
      keep.set(part, {
        text: resultRank < KEEP_RECENT_TOOL_RESULTS,
        images: hasImage && imageRank < KEEP_RECENT_IMAGES,
      });
      resultRank++;
      if (hasImage) imageRank++;
    }
  }

  return messages.map((message) => ({
    ...message,
    parts: message.parts.map((part) => {
      if (part.type !== 'tool_result') return part;
      const flags = keep.get(part)!;
      if (flags.text && flags.images) return part;

      return {
        ...part,
        content: part.content.map((c) => {
          if (c.type === 'image' && !flags.images) {
            return {
              type: 'text' as const,
              text: '[screenshot omitted — page has since changed; take a new one if needed]',
            };
          }
          if (c.type === 'text' && !flags.text && c.text.length > PRUNE_TEXT_THRESHOLD) {
            return {
              type: 'text' as const,
              text:
                c.text.slice(0, PRUNE_TEXT_KEEP) +
                `… [${part.toolName} output truncated — stale; re-run the tool if needed]`,
            };
          }
          return c;
        }),
      };
    }),
  }));
}
