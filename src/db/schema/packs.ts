import { mysqlTable, varchar, text, int, timestamp, mysqlEnum } from 'drizzle-orm/mysql-core';

export const packs = mysqlTable('packs', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  visibility: mysqlEnum('visibility', ['public', 'private']).default('public'),
  memoryCount: int('memory_count').default(0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

export const packMemories = mysqlTable('pack_memories', {
  packId: varchar('pack_id', { length: 36 }).notNull(),
  memoryId: varchar('memory_id', { length: 36 }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});
