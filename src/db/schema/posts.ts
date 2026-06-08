import { mysqlTable, varchar, text, int, tinyint, timestamp, mysqlEnum, json } from 'drizzle-orm/mysql-core';

export const posts = mysqlTable('posts', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 }).notNull(),
  type: mysqlEnum('type', ['general', 'build_update', 'code_snippet', 'collab_request', 'poll', 'question']).default('general').notNull(),
  content: text('content').notNull(),
  visibility: mysqlEnum('visibility', ['public', 'private']).default('public'),
  // media
  mediaUrl: varchar('media_url', { length: 500 }),
  mediaType: mysqlEnum('media_type', ['image', 'video']),
  // quote
  quotePostId: varchar('quote_post_id', { length: 36 }),
  quoteMemoryId: varchar('quote_memory_id', { length: 36 }),
  quoteProjectId: varchar('quote_project_id', { length: 36 }),
  // code snippet
  language: varchar('language', { length: 50 }),
  // build update
  projectId: varchar('project_id', { length: 36 }),
  milestone: varchar('milestone', { length: 255 }),
  // collab request
  roleNeeded: varchar('role_needed', { length: 255 }),
  skills: json('skills').$type<string[]>(),
  compensation: mysqlEnum('compensation', ['paid', 'equity', 'volunteer', 'revenue_share']),
  applyUrl: varchar('apply_url', { length: 500 }),
  // question
  acceptedAnswerId: varchar('accepted_answer_id', { length: 36 }),
  // poll
  pollIsAnonymous: tinyint('poll_is_anonymous').default(0),
  pollAllowMultiple: tinyint('poll_allow_multiple').default(0),
  // stats
  likeCount: int('like_count').default(0),
  saveCount: int('save_count').default(0),
  commentCount: int('comment_count').default(0),
  pinnedAt: timestamp('pinned_at'),
  pinnedById: varchar('pinned_by_id', { length: 36 }),
  editedAt: timestamp('edited_at'),
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
