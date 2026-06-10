import { APP_NAME } from '../constants';
import type { MessagePart } from '../providers/types';
import { db, type ConversationRow, type MessageRow } from './schema';

// Chat history export/import. The envelope is versioned so future schema
// changes can migrate old files. Settings (and the API key) are deliberately
// never part of an export.

export interface ExportedConversation extends ConversationRow {
  messages: Array<Omit<MessageRow, 'conversationId'>>;
}

export interface ExportEnvelope {
  version: 1;
  app: string;
  exportedAt: string;
  conversations: ExportedConversation[];
}

export async function exportAllData(): Promise<ExportEnvelope> {
  const conversations = await db.conversations.orderBy('updatedAt').reverse().toArray();
  const exported: ExportedConversation[] = [];

  for (const conversation of conversations) {
    const messages = await db.messages
      .where('conversationId')
      .equals(conversation.id)
      .sortBy('createdAt');
    exported.push({
      ...conversation,
      messages: messages.map(({ conversationId: _omit, ...rest }) => rest),
    });
  }

  return {
    version: 1,
    app: APP_NAME,
    exportedAt: new Date().toISOString(),
    conversations: exported,
  };
}

function isValidPart(part: unknown): part is MessagePart {
  if (typeof part !== 'object' || part === null) return false;
  const type = (part as { type?: unknown }).type;
  return type === 'text' || type === 'image' || type === 'tool_use' || type === 'tool_result';
}

function isValidMessage(message: unknown): message is Omit<MessageRow, 'conversationId'> {
  if (typeof message !== 'object' || message === null) return false;
  const m = message as Record<string, unknown>;
  return (
    typeof m.id === 'string' &&
    (m.role === 'user' || m.role === 'assistant') &&
    Array.isArray(m.parts) &&
    m.parts.every(isValidPart) &&
    typeof m.createdAt === 'number'
  );
}

function isValidConversation(conversation: unknown): conversation is ExportedConversation {
  if (typeof conversation !== 'object' || conversation === null) return false;
  const c = conversation as Record<string, unknown>;
  return (
    typeof c.id === 'string' &&
    typeof c.title === 'string' &&
    typeof c.createdAt === 'number' &&
    typeof c.updatedAt === 'number' &&
    Array.isArray(c.messages) &&
    c.messages.every(isValidMessage)
  );
}

export interface ImportResult {
  imported: number;
  /** Conversations skipped because the same id already exists locally. */
  skipped: number;
}

export async function importData(raw: unknown): Promise<ImportResult> {
  if (
    typeof raw !== 'object' ||
    raw === null ||
    (raw as { version?: unknown }).version !== 1 ||
    !Array.isArray((raw as { conversations?: unknown }).conversations)
  ) {
    throw new Error('Not a valid export file (expected {"version": 1, "conversations": […]}).');
  }

  const candidates = (raw as { conversations: unknown[] }).conversations;
  let imported = 0;
  let skipped = 0;

  await db.transaction('rw', db.conversations, db.messages, async () => {
    for (const candidate of candidates) {
      if (!isValidConversation(candidate)) {
        throw new Error('Export file contains a malformed conversation — aborting import.');
      }
      const exists = await db.conversations.get(candidate.id);
      if (exists) {
        skipped++;
        continue;
      }
      const { messages, ...conversation } = candidate;
      await db.conversations.add(conversation);
      await db.messages.bulkAdd(
        messages.map((message) => ({ ...message, conversationId: conversation.id })),
      );
      imported++;
    }
  });

  return { imported, skipped };
}
