import { mysqlTable, varchar, text, int, timestamp, mysqlEnum, json } from 'drizzle-orm/mysql-core';

export const memories = mysqlTable('memories', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  content: text('content').notNull(),
  category: mysqlEnum('category', [
    'prompt',
    'workflow',
    'architecture',
    'template',
    'tutorial',
    'agent_setup',
    'mcp',
    'deployment',
    'productivity',
  ]).notNull(),
  tags: json('tags').$type<string[]>().default([]),
  visibility: mysqlEnum('visibility', ['public', 'private']).default('public'),
  forkedFromId: varchar('forked_from_id', { length: 36 }),
  forkedFromUserId: varchar('forked_from_user_id', { length: 36 }),
  originalMemoryId: varchar('original_memory_id', { length: 36 }),
  originalUserId: varchar('original_user_id', { length: 36 }),
  forkCount: int('fork_count').default(0),
  likeCount: int('like_count').default(0),
  saveCount: int('save_count').default(0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

export const memoryLikes = mysqlTable('memory_likes', {
  userId: varchar('user_id', { length: 36 }).notNull(),
  memoryId: varchar('memory_id', { length: 36 }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const memorySaves = mysqlTable('memory_saves', {
  userId: varchar('user_id', { length: 36 }).notNull(),
  memoryId: varchar('memory_id', { length: 36 }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});
