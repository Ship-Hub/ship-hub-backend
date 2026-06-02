import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { memories, users, projects, packs } from '../../db/schema/index.js';
import { eq, like, or, desc, and, sql, gte } from 'drizzle-orm';

export async function searchRoutes(app: FastifyInstance) {
  app.get('/search', async (req, reply) => {
    const { q = '', type = 'all', limit = 20 } = req.query as { q?: string; type?: string; limit?: number };

    if (!q.trim()) return reply.send({ memories: [], users: [], projects: [], packs: [] });

    const pattern = `%${q.trim()}%`;
    const lim = Math.min(Number(limit), 50);
    const results: { memories: any[]; users: any[]; projects: any[]; packs: any[] } = { memories: [], users: [], projects: [], packs: [] };

    if (type === 'all' || type === 'memories' || type === 'tags') {
      results.memories = await db
        .select({
          memory: memories,
          author: { id: users.id, username: users.username, displayName: users.displayName, avatar: users.avatar },
        })
        .from(memories)
        .leftJoin(users, eq(memories.userId, users.id))
        .where(and(
          eq(memories.visibility, 'public'),
          type === 'tags'
            ? sql`JSON_CONTAINS(${memories.tags}, JSON_QUOTE(${q.trim()}))`
            : or(
                like(memories.title, pattern),
                like(memories.content, pattern),
                sql`JSON_SEARCH(${memories.tags}, 'one', ${`%${q.trim()}%`}) IS NOT NULL`
              )
        ))
        .orderBy(desc(memories.likeCount))
        .limit(lim);
    }

    if (type === 'all' || type === 'users') {
      results.users = await db
        .select({ id: users.id, username: users.username, displayName: users.displayName, avatar: users.avatar, bio: users.bio, followerCount: users.followerCount, memoryCount: users.memoryCount })
        .from(users)
        .where(or(like(users.username, pattern), like(users.displayName, pattern)))
        .limit(lim);
    }

    if (type === 'all' || type === 'projects') {
      results.projects = await db
        .select({
          project: projects,
          owner: { id: users.id, username: users.username, displayName: users.displayName, avatar: users.avatar },
        })
        .from(projects)
        .leftJoin(users, eq(projects.userId, users.id))
        .where(or(like(projects.name, pattern), like(projects.description, pattern)))
        .orderBy(desc(projects.followerCount))
        .limit(lim);
    }

    if (type === 'all' || type === 'packs') {
      results.packs = await db
        .select({
          pack: packs,
          owner: { id: users.id, username: users.username, displayName: users.displayName, avatar: users.avatar },
        })
        .from(packs)
        .leftJoin(users, eq(packs.userId, users.id))
        .where(and(eq(packs.visibility, 'public'), or(like(packs.title, pattern), like(packs.description, pattern))))
        .orderBy(desc(packs.memoryCount))
        .limit(lim);
    }

    return reply.send(results);
  });

  // ── Browse by tag or category ──────────────────────────────────────────────
  app.get('/browse', async (req, reply) => {
    const { tag = '', category = '', limit = 30 } = req.query as { tag?: string; category?: string; limit?: number };
    const lim = Math.min(Number(limit), 100);
    const conditions: any[] = [eq(memories.visibility, 'public')];
    if (tag.trim()) conditions.push(sql`JSON_CONTAINS(${memories.tags}, JSON_QUOTE(${tag.trim()}))`);
    if (category.trim()) conditions.push(eq(memories.category, category.trim() as any));
    if (conditions.length === 1) return reply.send({ memories: [] });

    const rows = await db
      .select({ memory: memories, author: { id: users.id, username: users.username, displayName: users.displayName, avatar: users.avatar } })
      .from(memories).leftJoin(users, eq(memories.userId, users.id))
      .where(and(...conditions)).orderBy(desc(memories.likeCount)).limit(lim);
    return reply.send({ memories: rows });
  });

  // ── Trending tags ──────────────────────────────────────────────────────────
  app.get('/tags/trending', async (req, reply) => {
    const { limit = 20 } = req.query as { limit?: number };
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Use JSON_TABLE to explode the tags JSON array and count occurrences
    const rows = await db.execute(sql`
      SELECT tag, COUNT(*) as count
      FROM memories,
        JSON_TABLE(tags, '$[*]' COLUMNS (tag VARCHAR(100) PATH '$')) AS jt
      WHERE visibility = 'public'
        AND created_at >= ${since}
        AND tags IS NOT NULL
        AND JSON_LENGTH(tags) > 0
      GROUP BY tag
      ORDER BY count DESC
      LIMIT ${Number(limit)}
    `);
    return reply.send({ tags: (rows[0] as unknown as any[]).map((r: any) => ({ tag: r.tag, count: Number(r.count) })) });
  });
}
