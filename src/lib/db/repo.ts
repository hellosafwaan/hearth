import type { ChatMessage } from '../providers/types';
import { db, type ConversationRow, type MessageRow } from './schema';

const TITLE_MAX_LENGTH = 60;

export async function createConversation(): Promise<string> {
  const id = crypto.randomUUID();
  const now = Date.now();
  await db.conversations.add({ id, title: '', createdAt: now, updatedAt: now });
  return id;
}

export function listConversations(): Promise<ConversationRow[]> {
  return db.conversations.orderBy('updatedAt').reverse().toArray();
}

export function getMessages(conversationId: string): Promise<MessageRow[]> {
  return db.messages.where('conversationId').equals(conversationId).sortBy('createdAt');
}

export async function appendMessage(
  conversationId: string,
  message: ChatMessage,
): Promise<void> {
  const now = Date.now();
  await db.transaction('rw', db.conversations, db.messages, async () => {
    await db.messages.add({
      id: crypto.randomUUID(),
      conversationId,
      role: message.role,
      parts: message.parts,
      createdAt: now,
    });

    const conversation = await db.conversations.get(conversationId);
    const updates: Partial<ConversationRow> = { updatedAt: now };
    if (conversation && !conversation.title && message.role === 'user') {
      const firstText = message.parts.find((p) => p.type === 'text');
      if (firstText && firstText.type === 'text') {
        updates.title = firstText.text.slice(0, TITLE_MAX_LENGTH);
      }
    }
    await db.conversations.update(conversationId, updates);
  });
}

export async function deleteConversation(conversationId: string): Promise<void> {
  await db.transaction('rw', db.conversations, db.messages, async () => {
    await db.messages.where('conversationId').equals(conversationId).delete();
    await db.conversations.delete(conversationId);
  });
}
