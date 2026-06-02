import { mysqlTable, varchar, text, tinyint, timestamp } from 'drizzle-orm/mysql-core';

export const directMessages = mysqlTable('direct_messages', {
  id: varchar('id', { length: 36 }).primaryKey(),
  senderId: varchar('sender_id', { length: 36 }).notNull(),
  receiverId: varchar('receiver_id', { length: 36 }).notNull(),
  content: text('content').notNull(),
  read: tinyint('read').default(0),
  createdAt: timestamp('created_at').defaultNow(),
});
