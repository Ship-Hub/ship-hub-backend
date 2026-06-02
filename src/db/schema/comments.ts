import { mysqlTable, varchar, text, timestamp } from 'drizzle-orm/mysql-core';

export const comments = mysqlTable('comments', {
  id: varchar('id', { length: 36 }).primaryKey(),
  memoryId: varchar('memory_id', { length: 36 }).notNull(),
  userId: varchar('user_id', { length: 36 }).notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});
