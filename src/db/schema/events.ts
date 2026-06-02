import { mysqlTable, varchar, text, int, timestamp, mysqlEnum } from 'drizzle-orm/mysql-core';

export const events = mysqlTable('events', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  type: mysqlEnum('type', ['demo_day', 'build_session', 'hackathon']).notNull(),
  startsAt: timestamp('starts_at').notNull(),
  endsAt: timestamp('ends_at'),
  location: varchar('location', { length: 255 }),
  coverImage: varchar('cover_image', { length: 500 }),
  rsvpCount: int('rsvp_count').default(0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

export const eventRsvps = mysqlTable('event_rsvps', {
  userId: varchar('user_id', { length: 36 }).notNull(),
  eventId: varchar('event_id', { length: 36 }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});
