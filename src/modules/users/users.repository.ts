import { db } from '../../db/index.js';
import { users, follows } from '../../db/schema/index.js';
import { eq, and, sql } from 'drizzle-orm';

export const usersRepository = {
  async findByUsername(username: string) {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user ?? null;
  },

  async update(id: string, data: Partial<typeof users.$inferInsert>) {
    await db.update(users).set(data).where(eq(users.id, id));
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  },

  async isFollowing(followerId: string, followingId: string) {
    const [row] = await db
      .select()
      .from(follows)
      .where(and(eq(follows.followerId, followerId), eq(follows.followingId, followingId)));
    return !!row;
  },

  async follow(followerId: string, followingId: string) {
    await db.insert(follows).values({ followerId, followingId });
    await db.update(users).set({ followingCount: sql`following_count + 1` }).where(eq(users.id, followerId));
    await db.update(users).set({ followerCount: sql`follower_count + 1` }).where(eq(users.id, followingId));
  },

  async unfollow(followerId: string, followingId: string) {
    await db.delete(follows).where(and(eq(follows.followerId, followerId), eq(follows.followingId, followingId)));
    await db.update(users).set({ followingCount: sql`GREATEST(following_count - 1, 0)` }).where(eq(users.id, followerId));
    await db.update(users).set({ followerCount: sql`GREATEST(follower_count - 1, 0)` }).where(eq(users.id, followingId));
  },
};
