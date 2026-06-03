import { mysqlTable, varchar, text, mysqlEnum, timestamp } from 'drizzle-orm/mysql-core';

export const collabApplications = mysqlTable('collab_applications', {
  id: varchar('id', { length: 36 }).primaryKey(),
  postId: varchar('post_id', { length: 36 }).notNull(),
  applicantId: varchar('applicant_id', { length: 36 }).notNull(),
  message: text('message').notNull(),
  status: mysqlEnum('status', ['pending', 'accepted', 'rejected']).default('pending').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});
