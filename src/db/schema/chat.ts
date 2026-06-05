import { mysqlTable, varchar, text, int, tinyint, timestamp } from 'drizzle-orm/mysql-core';

export const chatChannels = mysqlTable('chat_channels', {
  id: varchar('id', { length: 36 }).primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  description: varchar('description', { length: 500 }),
  isDefault: tinyint('is_default').default(0),
  messageCount: int('message_count').default(0),
  createdAt: timestamp('created_at').defaultNow(),
});

export const chatMessages = mysqlTable('chat_messages', {
  id: varchar('id', { length: 36 }).primaryKey(),
  channelId: varchar('channel_id', { length: 36 }).notNull(),
  userId: varchar('user_id', { length: 36 }).notNull(),
  content: text('content').notNull(),
  pinnedAt: timestamp('pinned_at'),
  pinnedById: varchar('pinned_by_id', { length: 36 }),
  createdAt: timestamp('created_at').defaultNow(),
});
