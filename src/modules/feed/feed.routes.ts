import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { posts, memories, users, follows, projects } from '../../db/schema/index.js';
import { eq, desc, and, gte, sql, inArray } from 'drizzle-orm';

type FeedType =
  | 'all'
  | 'memories'
  | 'posts'
  | 'trending'
  | 'following'
  | 'build_updates'
  | 'code'
  | 'collaborations'
  | 'polls'
  | 'questions'
  | 'projects';

export async function feedRoutes(app: FastifyInstance) {
  app.get('/feed', async (req, reply) => {
    const { limit = 30, offset = 0, type = 'all' } = req.query as {
      limit?: number;
      offset?: number;
      type?: FeedType;
    };

    const lim = Math.min(Number(limit), 50);
    const off = Number(offset);

    // ── Post-type filtered tabs ──────────────────────────────────────────────
    const POST_TYPE_MAP: Record<string, string> = {
      build_updates: 'build_update',
      code: 'code_snippet',
      collaborations: 'collab_request',
      polls: 'poll',
      questions: 'question',
    };

    if (type in POST_TYPE_MAP) {
      const postType = POST_TYPE_MAP[type];
      const rows = await db
        .select({
          post: posts,
          author: { id: users.id, username: users.username, displayName: users.displayName, avatar: users.avatar },
        })
        .from(posts)
        .leftJoin(users, eq(posts.userId, users.id))
        .where(and(eq(posts.visibility, 'public'), eq(posts.type, postType as any)))
        .orderBy(desc(posts.createdAt))
        .limit(lim)
        .offset(off);

      return reply.send({ items: rows.map(r => ({ type: 'post' as const, ...r, createdAt: r.post.createdAt })) });
    }

    // ── Projects tab ─────────────────────────────────────────────────────────
    if (type === 'projects') {
      const rows = await db
        .select({
          project: projects,
          author: { id: users.id, username: users.username, displayName: users.displayName, avatar: users.avatar },
        })
        .from(projects)
        .leftJoin(users, eq(projects.userId, users.id))
        .orderBy(desc(projects.createdAt))
        .limit(lim)
        .offset(off);

      return reply.send({ items: rows.map(r => ({ type: 'project' as const, ...r, createdAt: r.project.createdAt })) });
    }

    // ── Following feed ────────────────────────────────────────────────────────
    if (type === 'following') {
      let requesterId: string | undefined;
      try { await req.jwtVerify(); requesterId = (req.user as any).id; } catch {}
      if (!requesterId) return reply.send({ items: [] });

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

    // ── Trending (memories by engagement score) ───────────────────────────────
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

      return reply.send({ items: rows.map(r => ({ type: 'memory' as const, ...r, createdAt: r.memory.createdAt })) });
    }

    // ── All / Memories / Posts ────────────────────────────────────────────────
    const items: Array<{ type: 'memory' | 'post' | 'project'; createdAt: Date | string | null; [k: string]: any }> = [];

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
      try {
        const postRows = await db
          .select({
            post: posts,
            author: { id: users.id, username: users.username, displayName: users.displayName, avatar: users.avatar },
          })
          .from(posts)
          .leftJoin(users, eq(posts.userId, users.id))
          .where(eq(posts.visibility, 'public'))
          .orderBy(desc(posts.pinnedAt), desc(posts.createdAt))
          .limit(type === 'posts' ? lim : lim * 2);

        items.push(...postRows.map(r => ({ type: 'post' as const, ...r, createdAt: r.post.pinnedAt ?? r.post.createdAt })));
      } catch (error) {
        if (type === 'posts') throw error;
        req.log.warn({ error }, 'Skipping posts in all feed because post query failed');
      }
    }

    if (type === 'all') {
      try {
        const projectRows = await db
          .select({
            project: projects,
            author: { id: users.id, username: users.username, displayName: users.displayName, avatar: users.avatar },
          })
          .from(projects)
          .leftJoin(users, eq(projects.userId, users.id))
          .orderBy(desc(projects.createdAt))
          .limit(lim);

        items.push(...projectRows.map(r => ({ type: 'project' as const, ...r, createdAt: r.project.createdAt })));
      } catch (error) {
        req.log.warn({ error }, 'Skipping projects in all feed because project query failed');
      }
    }

    items.sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
    return reply.send({ items: items.slice(off, off + lim) });
  });
}
