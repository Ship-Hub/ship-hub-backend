import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { users, memories, posts, comments } from '../../db/schema/index.js';
import { eq, desc, sql, like, or } from 'drizzle-orm';
import { authenticate } from '../../lib/middleware.js';
import { AppError } from '../../lib/errors.js';

async function requireAdmin(req: any) {
  const [user] = await db.select({ isAdmin: users.isAdmin }).from(users).where(eq(users.id, req.user.id));
  if (!user?.isAdmin) throw new AppError(403, 'FORBIDDEN', 'Admin access required');
}

export async function adminRoutes(app: FastifyInstance) {
  // ── Stats ──────────────────────────────────────────────────────────────────
  app.get('/admin/stats', { preHandler: [authenticate] }, async (req, reply) => {
    await requireAdmin(req);

    const [[uCount], [mCount], [pCount], [newToday]] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(users),
      db.select({ count: sql<number>`count(*)` }).from(memories),
      db.select({ count: sql<number>`count(*)` }).from(posts),
      db.select({ count: sql<number>`count(*)` }).from(users).where(
        sql`DATE(created_at) = CURDATE()`
      ),
    ]);

    return reply.send({
      users: Number(uCount.count),
      memories: Number(mCount.count),
      posts: Number(pCount.count),
      newUsersToday: Number(newToday.count),
    });
  });

  // ── Recent users ───────────────────────────────────────────────────────────
  app.get('/admin/users', { preHandler: [authenticate] }, async (req, reply) => {
    await requireAdmin(req);
    const { q = '', limit = 30, offset = 0 } = req.query as { q?: string; limit?: number; offset?: number };

    const rows = await db
      .select({
        id: users.id, username: users.username, displayName: users.displayName,
        email: users.email, emailVerified: users.emailVerified,
        banned: users.banned, isAdmin: users.isAdmin,
        memoryCount: users.memoryCount, followerCount: users.followerCount,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(q ? or(like(users.username, `%${q}%`), like(users.email, `%${q}%`)) : undefined)
      .orderBy(desc(users.createdAt))
      .limit(Number(limit))
      .offset(Number(offset));

    return reply.send({ users: rows });
  });

  // ── Ban / unban user ───────────────────────────────────────────────────────
  app.patch('/admin/users/:id/ban', { preHandler: [authenticate] }, async (req, reply) => {
    await requireAdmin(req);
    const { id } = req.params as { id: string };
    const { banned } = req.body as { banned: boolean };

    const [user] = await db.select().from(users).where(eq(users.id, id));
    if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found');
    if (user.isAdmin) throw new AppError(403, 'FORBIDDEN', 'Cannot ban an admin');

    await db.update(users).set({ banned: banned ? 1 : 0 }).where(eq(users.id, id));
    return reply.send({ banned });
  });

  // ── Delete any memory ─────────────────────────────────────────────────────
  app.delete('/admin/memories/:id', { preHandler: [authenticate] }, async (req, reply) => {
    await requireAdmin(req);
    const { id } = req.params as { id: string };
    await db.delete(memories).where(eq(memories.id, id));
    return reply.send({ deleted: true });
  });

  // ── Delete any post ───────────────────────────────────────────────────────
  app.delete('/admin/posts/:id', { preHandler: [authenticate] }, async (req, reply) => {
    await requireAdmin(req);
    const { id } = req.params as { id: string };
    await db.delete(posts).where(eq(posts.id, id));
    return reply.send({ deleted: true });
  });
}
