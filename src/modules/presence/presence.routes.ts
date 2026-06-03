import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { users } from '../../db/schema/index.js';
import { gte, sql } from 'drizzle-orm';
import { authenticate } from '../../lib/middleware.js';
import { eq } from 'drizzle-orm';

const ONLINE_WINDOW_MS = 2 * 60 * 1000; // 2 minutes

export async function presenceRoutes(app: FastifyInstance) {
  // Heartbeat — frontend calls every 60s while app is open
  app.post('/presence/heartbeat', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    await db.update(users).set({ lastSeen: new Date() }).where(eq(users.id, userId));
    return reply.send({ ok: true });
  });

  // Who's online right now
  app.get('/presence/online', async (_req, reply) => {
    const since = new Date(Date.now() - ONLINE_WINDOW_MS);
    const online = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        avatar: users.avatar,
        lastSeen: users.lastSeen,
      })
      .from(users)
      .where(gte(users.lastSeen, since))
      .limit(100);
    return reply.send({ online, count: online.length });
  });
}
