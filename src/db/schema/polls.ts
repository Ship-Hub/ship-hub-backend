import { mysqlTable, varchar, int, timestamp } from 'drizzle-orm/mysql-core';

export const pollOptions = mysqlTable('poll_options', {
  id: varchar('id', { length: 36 }).primaryKey(),
  postId: varchar('post_id', { length: 36 }).notNull(),
  text: varchar('text', { length: 500 }).notNull(),
  position: int('position').default(0),
  voteCount: int('vote_count').default(0),
});

export const pollVotes = mysqlTable('poll_votes', {
  id: varchar('id', { length: 36 }).primaryKey(),
  postId: varchar('post_id', { length: 36 }).notNull(),
  pollOptionId: varchar('poll_option_id', { length: 36 }).notNull(),
  userId: varchar('user_id', { length: 36 }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});
