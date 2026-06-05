import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { users, memories, posts, comments } from '../../db/schema/index.js';
import { eq, desc, sql, like, or } from 'drizzle-orm';
import { authenticate } from '../../lib/middleware.js';
import { AppError } from '../../lib/errors.js';

async function requirePlatformAdmin(req: any) {
  const [user] = await db
    .select({ isAdmin: users.isAdmin, platformAdmin: users.platformAdmin })
    .from(users)
    .where(eq(users.id, req.user.id));
  if (!user?.isAdmin && !user?.platformAdmin) throw new AppError(403, 'FORBIDDEN', 'Platform admin access required');
}

export async function adminRoutes(app: FastifyInstance) {
  // ── Stats ──────────────────────────────────────────────────────────────────
  app.get('/admin/stats', { preHandler: [authenticate] }, async (req, reply) => {
    await requirePlatformAdmin(req);

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
    await requirePlatformAdmin(req);
    const { q = '', limit = 30, offset = 0 } = req.query as { q?: string; limit?: number; offset?: number };

    const rows = await db
      .select({
        id: users.id, username: users.username, displayName: users.displayName,
        email: users.email, emailVerified: users.emailVerified,
        banned: users.banned, isAdmin: users.isAdmin,
        platformAdmin: users.platformAdmin, communityAdmin: users.communityAdmin,
        communityMutedUntil: users.communityMutedUntil,
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
    await requirePlatformAdmin(req);
    const { id } = req.params as { id: string };
    const { banned } = req.body as { banned: boolean };

    const [user] = await db.select().from(users).where(eq(users.id, id));
    if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found');
    if (user.isAdmin || user.platformAdmin) throw new AppError(403, 'FORBIDDEN', 'Cannot ban a platform admin');

    await db.update(users).set({ banned: banned ? 1 : 0 }).where(eq(users.id, id));
    return reply.send({ banned });
  });

  app.patch('/admin/users/:id/roles', { preHandler: [authenticate] }, async (req, reply) => {
    await requirePlatformAdmin(req);
    const { id } = req.params as { id: string };
    const body = req.body as { platformAdmin?: boolean; communityAdmin?: boolean };

    const [user] = await db.select().from(users).where(eq(users.id, id));
    if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found');

    const update: Record<string, number> = {};
    if (typeof body.platformAdmin === 'boolean') {
      update.platformAdmin = body.platformAdmin ? 1 : 0;
      update.isAdmin = body.platformAdmin ? 1 : 0;
    }
    if (typeof body.communityAdmin === 'boolean') update.communityAdmin = body.communityAdmin ? 1 : 0;

    if (Object.keys(update).length === 0) throw new AppError(400, 'BAD_REQUEST', 'No role changes provided');
    await db.update(users).set(update).where(eq(users.id, id));
    return reply.send({ updated: true, ...update });
  });

  app.patch('/admin/users/:id/community-mute', { preHandler: [authenticate] }, async (req, reply) => {
    await requirePlatformAdmin(req);
    const { id } = req.params as { id: string };
    const { minutes } = req.body as { minutes?: number };
    const until = minutes && minutes > 0 ? new Date(Date.now() + Math.min(minutes, 60 * 24 * 30) * 60 * 1000) : null;
    const { id: moderatorId } = req.user as { id: string };
    await db.update(users).set({ communityMutedUntil: until, communityMutedById: moderatorId }).where(eq(users.id, id));
    return reply.send({ communityMutedUntil: until });
  });

  // ── Delete any memory ─────────────────────────────────────────────────────
  app.delete('/admin/memories/:id', { preHandler: [authenticate] }, async (req, reply) => {
    await requirePlatformAdmin(req);
    const { id } = req.params as { id: string };
    await db.delete(memories).where(eq(memories.id, id));
    return reply.send({ deleted: true });
  });

  // ── Delete any post ───────────────────────────────────────────────────────
  app.delete('/admin/posts/:id', { preHandler: [authenticate] }, async (req, reply) => {
    await requirePlatformAdmin(req);
    const { id } = req.params as { id: string };
    await db.delete(posts).where(eq(posts.id, id));
    return reply.send({ deleted: true });
  });
}
