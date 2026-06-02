import { mysqlTable, varchar, text, int, timestamp, mysqlEnum } from 'drizzle-orm/mysql-core';

export const posts = mysqlTable('posts', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 }).notNull(),
  content: text('content').notNull(),
  visibility: mysqlEnum('visibility', ['public', 'private']).default('public'),
  mediaUrl: varchar('media_url', { length: 500 }),
  mediaType: mysqlEnum('media_type', ['image', 'video']),
  likeCount: int('like_count').default(0),
  saveCount: int('save_count').default(0),
  commentCount: int('comment_count').default(0),
  quotePostId: varchar('quote_post_id', { length: 36 }),
  quoteMemoryId: varchar('quote_memory_id', { length: 36 }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

export const postSaves = mysqlTable('post_saves', {
  userId: varchar('user_id', { length: 36 }).notNull(),
  postId: varchar('post_id', { length: 36 }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const postLikes = mysqlTable('post_likes', {
  userId: varchar('user_id', { length: 36 }).notNull(),
  postId: varchar('post_id', { length: 36 }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const postReactions = mysqlTable('post_reactions', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 }).notNull(),
  postId: varchar('post_id', { length: 36 }).notNull(),
  emoji: varchar('emoji', { length: 10 }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const postComments = mysqlTable('post_comments', {
  id: varchar('id', { length: 36 }).primaryKey(),
  postId: varchar('post_id', { length: 36 }).notNull(),
  userId: varchar('user_id', { length: 36 }).notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});
