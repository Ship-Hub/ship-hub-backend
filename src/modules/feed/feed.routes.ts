import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { posts, memories, users, follows } from '../../db/schema/index.js';
import { eq, desc, and, gte, sql, inArray } from 'drizzle-orm';

export async function feedRoutes(app: FastifyInstance) {
  // Unified feed — mixes posts + memories, sorted by createdAt
  app.get('/feed', async (req, reply) => {
    const { limit = 30, offset = 0, type = 'all' } = req.query as {
      limit?: number;
      offset?: number;
      type?: 'all' | 'memories' | 'posts' | 'trending' | 'following';
    };

    const lim = Math.min(Number(limit), 50);
    const off = Number(offset);

    // Following feed — requires auth
    if (type === 'following') {
      let requesterId: string | undefined;
      try { await req.jwtVerify(); requesterId = (req.user as any).id; } catch {}

      if (!requesterId) return reply.send({ items: [] });

      // Get IDs of people this user follows
      const followRows = await db
        .select({ followingId: follows.followingId })
        .from(follows)
        .where(eq(follows.followerId, requesterId));

      const followingIds = followRows.map(r => r.followingId);
      if (followingIds.length === 0) return reply.send({ items: [] });

      const items: Array<{ type: 'memory' | 'post'; createdAt: Date | string | null; [k: string]: any }> = [];

      const memRows = await db
        .select({
          memory: memories,
          author: { id: users.id, username: users.username, displayName: users.displayName, avatar: users.avatar },
        })
        .from(memories)
        .leftJoin(users, eq(memories.userId, users.id))
        .where(and(eq(memories.visibility, 'public'), inArray(memories.userId, followingIds)))
        .orderBy(desc(memories.createdAt))
        .limit(lim * 2);

      items.push(...memRows.map(r => ({ type: 'memory' as const, ...r, createdAt: r.memory.createdAt })));

      const postRows = await db
        .select({
          post: posts,
          author: { id: users.id, username: users.username, displayName: users.displayName, avatar: users.avatar },
        })
        .from(posts)
        .leftJoin(users, eq(posts.userId, users.id))
        .where(and(eq(posts.visibility, 'public'), inArray(posts.userId, followingIds)))
        .orderBy(desc(posts.createdAt))
        .limit(lim * 2);

      items.push(...postRows.map(r => ({ type: 'post' as const, ...r, createdAt: r.post.createdAt })));
      items.sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
      return reply.send({ items: items.slice(off, off + lim) });
    }

    if (type === 'trending') {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const rows = await db
        .select({
          memory: memories,
          author: { id: users.id, username: users.username, displayName: users.displayName, avatar: users.avatar },
        })
        .from(memories)
        .leftJoin(users, eq(memories.userId, users.id))
        .where(and(eq(memories.visibility, 'public'), gte(memories.createdAt, since)))
        .orderBy(desc(sql`(${memories.likeCount} * 2 + ${memories.forkCount} * 3 + ${memories.saveCount})`))
        .limit(lim)
        .offset(off);

      return reply.send({
        items: rows.map(r => ({ type: 'memory' as const, ...r, createdAt: r.memory.createdAt })),
      });
    }

    const items: Array<{ type: 'memory' | 'post'; createdAt: Date | string | null; [k: string]: any }> = [];

    if (type === 'all' || type === 'memories') {
      const memRows = await db
        .select({
          memory: memories,
          author: { id: users.id, username: users.username, displayName: users.displayName, avatar: users.avatar },
        })
        .from(memories)
        .leftJoin(users, eq(memories.userId, users.id))
        .where(eq(memories.visibility, 'public'))
        .orderBy(desc(memories.createdAt))
        .limit(type === 'memories' ? lim : lim * 2);

      items.push(...memRows.map(r => ({ type: 'memory' as const, ...r, createdAt: r.memory.createdAt })));
    }

    if (type === 'all' || type === 'posts') {
      const postRows = await db
        .select({
          post: posts,
          author: { id: users.id, username: users.username, displayName: users.displayName, avatar: users.avatar },
        })
        .from(posts)
        .leftJoin(users, eq(posts.userId, users.id))
        .where(eq(posts.visibility, 'public'))
        .orderBy(desc(posts.createdAt))
        .limit(type === 'posts' ? lim : lim * 2);

      items.push(...postRows.map(r => ({ type: 'post' as const, ...r, createdAt: r.post.createdAt })));
    }

    // Sort merged items by createdAt desc, paginate
    items.sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
    const paginated = items.slice(off, off + lim);

    return reply.send({ items: paginated });
  });
}
