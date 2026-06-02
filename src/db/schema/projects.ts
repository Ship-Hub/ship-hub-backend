import { mysqlTable, varchar, text, int, timestamp, mysqlEnum, json } from 'drizzle-orm/mysql-core';

export const projects = mysqlTable('projects', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull(),
  description: text('description'),
  status: mysqlEnum('status', ['building', 'launched', 'archived']).default('building'),
  tags: json('tags').$type<string[]>().default([]),
  websiteUrl: varchar('website_url', { length: 500 }),
  githubUrl: varchar('github_url', { length: 500 }),
  coverImage: varchar('cover_image', { length: 500 }),
  followerCount: int('follower_count').default(0),
  memoryCount: int('memory_count').default(0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

export const projectMemories = mysqlTable('project_memories', {
  projectId: varchar('project_id', { length: 36 }).notNull(),
  memoryId: varchar('memory_id', { length: 36 }).notNull(),
  addedAt: timestamp('added_at').defaultNow(),
});

export const projectFollows = mysqlTable('project_follows', {
  userId: varchar('user_id', { length: 36 }).notNull(),
  projectId: varchar('project_id', { length: 36 }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});
