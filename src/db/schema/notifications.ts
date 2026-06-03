import { mysqlTable, varchar, tinyint, timestamp, mysqlEnum } from 'drizzle-orm/mysql-core';

export const notifications = mysqlTable('notifications', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 }).notNull(),      // recipient
  actorId: varchar('actor_id', { length: 36 }).notNull(),    // who triggered it
  type: mysqlEnum('type', ['fork', 'follow', 'comment', 'like', 'mention', 'reaction', 'quote', 'collab_apply', 'answer_accepted', 'chat_mention']).notNull(),
  memoryId: varchar('memory_id', { length: 36 }),
  projectId: varchar('project_id', { length: 36 }),
  commentId: varchar('comment_id', { length: 36 }),
  postId: varchar('post_id', { length: 36 }),
  read: tinyint('read').default(0),
  createdAt: timestamp('created_at').defaultNow(),
});
