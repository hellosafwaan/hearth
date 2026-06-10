import Dexie, { type EntityTable } from 'dexie';
import type { MessagePart } from '../providers/types';

export interface ConversationRow {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface MessageRow {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  parts: MessagePart[];
  createdAt: number;
}

export const db = new Dexie('sidekick') as Dexie & {
  conversations: EntityTable<ConversationRow, 'id'>;
  messages: EntityTable<MessageRow, 'id'>;
};

db.version(1).stores({
  conversations: 'id, updatedAt',
  messages: 'id, conversationId, createdAt',
});
