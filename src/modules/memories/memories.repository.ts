import { db } from '../../db/index.js';
import { memories, memoryLikes, memorySaves, users } from '../../db/schema/index.js';
import { eq, desc, and, sql } from 'drizzle-orm';

export const memoriesRepository = {
  async findAll(limit = 20, offset = 0) {
    return db
      .select({
        memory: memories,
        author: {
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          avatar: users.avatar,
        },
      })
      .from(memories)
      .leftJoin(users, eq(memories.userId, users.id))
      .where(eq(memories.visibility, 'public'))
      .orderBy(desc(memories.createdAt))
      .limit(limit)
      .offset(offset);
  },

  async findById(id: string) {
    const [row] = await db
      .select({
        memory: memories,
        author: {
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          avatar: users.avatar,
        },
      })
      .from(memories)
      .leftJoin(users, eq(memories.userId, users.id))
      .where(eq(memories.id, id));
    return row ?? null;
  },

  async findByUser(userId: string, requesterId?: string) {
    const conditions = [eq(memories.userId, userId)];
    if (requesterId !== userId) {
      conditions.push(eq(memories.visibility, 'public'));
    }
    return db
      .select()
      .from(memories)
      .where(and(...conditions))
      .orderBy(desc(memories.createdAt));
  },

  async create(data: typeof memories.$inferInsert) {
    await db.insert(memories).values(data);
    const [created] = await db.select().from(memories).where(eq(memories.id, data.id!));
    return created;
  },

  async update(id: string, data: Partial<typeof memories.$inferInsert>) {
    await db.update(memories).set(data).where(eq(memories.id, id));
    const [updated] = await db.select().from(memories).where(eq(memories.id, id));
    return updated;
  },

  async delete(id: string) {
    await db.delete(memories).where(eq(memories.id, id));
  },

  async incrementForkCount(id: string) {
    await db.update(memories).set({ forkCount: sql`fork_count + 1` }).where(eq(memories.id, id));
  },

  async hasLiked(userId: string, memoryId: string) {
    const [row] = await db
      .select()
      .from(memoryLikes)
      .where(and(eq(memoryLikes.userId, userId), eq(memoryLikes.memoryId, memoryId)));
    return !!row;
  },

  async like(userId: string, memoryId: string) {
    await db.insert(memoryLikes).values({ userId, memoryId });
    await db.update(memories).set({ likeCount: sql`like_count + 1` }).where(eq(memories.id, memoryId));
  },

  async unlike(userId: string, memoryId: string) {
    await db.delete(memoryLikes).where(and(eq(memoryLikes.userId, userId), eq(memoryLikes.memoryId, memoryId)));
    await db.update(memories).set({ likeCount: sql`GREATEST(like_count - 1, 0)` }).where(eq(memories.id, memoryId));
  },

  async hasSaved(userId: string, memoryId: string) {
    const [row] = await db
      .select()
      .from(memorySaves)
      .where(and(eq(memorySaves.userId, userId), eq(memorySaves.memoryId, memoryId)));
    return !!row;
  },

  async save(userId: string, memoryId: string) {
    await db.insert(memorySaves).values({ userId, memoryId });
    await db.update(memories).set({ saveCount: sql`save_count + 1` }).where(eq(memories.id, memoryId));
  },

  async unsave(userId: string, memoryId: string) {
    await db.delete(memorySaves).where(and(eq(memorySaves.userId, userId), eq(memorySaves.memoryId, memoryId)));
    await db.update(memories).set({ saveCount: sql`GREATEST(save_count - 1, 0)` }).where(eq(memories.id, memoryId));
  },

  async getSaved(userId: string) {
    return db
      .select({
        memory: memories,
        author: {
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          avatar: users.avatar,
        },
      })
      .from(memorySaves)
      .leftJoin(memories, eq(memorySaves.memoryId, memories.id))
      .leftJoin(users, eq(memories.userId, users.id))
      .where(eq(memorySaves.userId, userId))
      .orderBy(desc(memorySaves.createdAt));
  },
};
