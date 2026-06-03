import { mysqlTable, varchar, text, int, tinyint, timestamp, mysqlEnum, json } from 'drizzle-orm/mysql-core';

export const users = mysqlTable('users', {
  id: varchar('id', { length: 36 }).primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }),
  username: varchar('username', { length: 50 }).notNull().unique(),
  displayName: varchar('display_name', { length: 100 }),
  bio: text('bio'),
  avatar: varchar('avatar', { length: 500 }),
  website: varchar('website', { length: 255 }),
  githubUsername: varchar('github_username', { length: 100 }),
  oauthProvider: varchar('oauth_provider', { length: 50 }),
  oauthId: varchar('oauth_id', { length: 255 }),
  memoBankApiKey: varchar('memo_bank_api_key', { length: 255 }),
  memoBankUserId: varchar('memo_bank_user_id', { length: 255 }),
  memoBankUsername: varchar('memo_bank_username', { length: 100 }),
  emailVerified: tinyint('email_verified').default(0),
  emailVerifyToken: varchar('email_verify_token', { length: 64 }),
  resetToken: varchar('reset_token', { length: 64 }),
  resetTokenExpires: timestamp('reset_token_expires'),
  banned: tinyint('banned').default(0),
  pinnedMemoryIds: json('pinned_memory_ids').$type<string[]>().default([]),
  isAdmin: tinyint('is_admin').default(0),
  followerCount: int('follower_count').default(0),
  followingCount: int('following_count').default(0),
  memoryCount: int('memory_count').default(0),
  lastSeen: timestamp('last_seen'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

export const follows = mysqlTable('follows', {
  followerId: varchar('follower_id', { length: 36 }).notNull(),
  followingId: varchar('following_id', { length: 36 }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});
