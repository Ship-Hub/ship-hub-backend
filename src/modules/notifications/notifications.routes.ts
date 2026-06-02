import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { notifications, users } from '../../db/schema/index.js';
import { eq, desc, and, sql } from 'drizzle-orm';
import { authenticate } from '../../lib/middleware.js';
import { notifEmitter } from '../../lib/notify.js';

export async function notificationsRoutes(app: FastifyInstance) {
  // Get notifications for current user
  app.get('/notifications', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const { limit = 30, offset = 0 } = req.query as { limit?: number; offset?: number };

    const rows = await db
      .select({
        notification: notifications,
        actor: {
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          avatar: users.avatar,
        },
      })
      .from(notifications)
      .leftJoin(users, eq(notifications.actorId, users.id))
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(Number(limit))
      .offset(Number(offset));

    return reply.send({ notifications: rows });
  });

  // Unread count
  app.get('/notifications/unread-count', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const [row] = await db
      .select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.read, 0)));
    return reply.send({ count: Number(row?.count ?? 0) });
  });

  // Mark all read
  app.post('/notifications/read-all', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    await db.update(notifications).set({ read: 1 }).where(
      and(eq(notifications.userId, userId), eq(notifications.read, 0))
    );
    return reply.send({ ok: true });
  });

  // SSE stream — pushes new notifications in real-time
  // Accepts token as query param (EventSource doesn't support headers)
  app.get('/notifications/stream', async (req, reply) => {
    const { token } = req.query as { token?: string };
    if (token) req.headers.authorization = `Bearer ${token}`;
    try { await req.jwtVerify(); } catch { return reply.status(401).send(); }
    const { id: userId } = req.user as { id: string };

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('X-Accel-Buffering', 'no');
    reply.raw.flushHeaders();

    // Send initial unread count immediately
    const [row] = await db
      .select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.read, 0)));
    reply.raw.write(`data: ${JSON.stringify({ type: 'count', count: Number(row?.count ?? 0) })}\n\n`);

    // Listen for new notifications
    const onNotif = (data: any) => {
      reply.raw.write(`data: ${JSON.stringify({ type: 'notification', ...data })}\n\n`);
    };
    notifEmitter.on(`notify:${userId}`, onNotif);

    // Heartbeat to keep connection alive
    const heartbeat = setInterval(() => {
      reply.raw.write(': ping\n\n');
    }, 20000);

    req.raw.on('close', () => {
      clearInterval(heartbeat);
      notifEmitter.off(`notify:${userId}`, onNotif);
    });

    // Keep the handler alive (never resolve)
    await new Promise(() => {});
  });

  // Mark one read
  app.patch('/notifications/:id/read', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const { id } = req.params as { id: string };
    await db.update(notifications).set({ read: 1 }).where(
      and(eq(notifications.id, id), eq(notifications.userId, userId))
    );
    return reply.send({ ok: true });
  });
}
