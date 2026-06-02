import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { directMessages, users } from '../../db/schema/index.js';
import { eq, or, and, desc, sql, ne } from 'drizzle-orm';
import { authenticate } from '../../lib/middleware.js';
import { AppError } from '../../lib/errors.js';
import { createNotification } from '../../lib/notify.js';
import { randomUUID } from 'crypto';
import { z } from 'zod';

export async function messagesRoutes(app: FastifyInstance) {
  // List conversations (latest message per partner)
  app.get('/dm', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };

    // Get distinct conversation partners with latest message + unread count
    const rows = await db.execute(sql`
      SELECT
        u.id, u.username, u.display_name AS displayName, u.avatar,
        latest.content AS lastMessage,
        latest.created_at AS lastMessageAt,
        latest.sender_id AS lastSenderId,
        SUM(CASE WHEN dm.receiver_id = ${userId} AND dm.read = 0 THEN 1 ELSE 0 END) AS unread
      FROM (
        SELECT
          IF(sender_id = ${userId}, receiver_id, sender_id) AS partner_id,
          MAX(created_at) AS max_at
        FROM direct_messages
        WHERE sender_id = ${userId} OR receiver_id = ${userId}
        GROUP BY partner_id
      ) AS convos
      JOIN direct_messages AS latest ON (
        (latest.sender_id = ${userId} AND latest.receiver_id = convos.partner_id) OR
        (latest.sender_id = convos.partner_id AND latest.receiver_id = ${userId})
      ) AND latest.created_at = convos.max_at
      JOIN users AS u ON u.id = convos.partner_id
      JOIN direct_messages AS dm ON (dm.sender_id = ${userId} AND dm.receiver_id = convos.partner_id) OR (dm.sender_id = convos.partner_id AND dm.receiver_id = ${userId})
      GROUP BY u.id, u.username, u.display_name, u.avatar, latest.content, latest.created_at, latest.sender_id
      ORDER BY latest.created_at DESC
      LIMIT 50
    `);

    return reply.send({ conversations: (rows[0] as unknown as any[]) });
  });

  // Get messages with a specific user
  app.get('/dm/:username', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const { username } = req.params as { username: string };

    const [partner] = await db.select({ id: users.id, username: users.username, displayName: users.displayName, avatar: users.avatar })
      .from(users).where(eq(users.username, username));
    if (!partner) throw new AppError(404, 'NOT_FOUND', 'User not found');

    const msgs = await db.select().from(directMessages)
      .where(or(
        and(eq(directMessages.senderId, userId), eq(directMessages.receiverId, partner.id)),
        and(eq(directMessages.senderId, partner.id), eq(directMessages.receiverId, userId)),
      ))
      .orderBy(desc(directMessages.createdAt))
      .limit(100);

    // Mark incoming messages as read
    await db.update(directMessages)
      .set({ read: 1 })
      .where(and(eq(directMessages.senderId, partner.id), eq(directMessages.receiverId, userId), eq(directMessages.read, 0)));

    return reply.send({ partner, messages: msgs.reverse() });
  });

  // Send a message
  app.post('/dm/:username', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const { username } = req.params as { username: string };
    const { content } = z.object({ content: z.string().min(1).max(2000) }).parse(req.body);

    const [partner] = await db.select({ id: users.id }).from(users).where(eq(users.username, username));
    if (!partner) throw new AppError(404, 'NOT_FOUND', 'User not found');
    if (partner.id === userId) throw new AppError(400, 'BAD_REQUEST', 'Cannot DM yourself');

    const id = randomUUID();
    await db.insert(directMessages).values({ id, senderId: userId, receiverId: partner.id, content });
    const [msg] = await db.select().from(directMessages).where(eq(directMessages.id, id));

    // Notify recipient (non-fatal)
    createNotification({ userId: partner.id, actorId: userId, type: 'mention', postId: undefined }).catch(() => {});

    return reply.status(201).send(msg);
  });

  // Unread DM count
  app.get('/dm/unread-count', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const [row] = await db.select({ count: sql<number>`count(*)` })
      .from(directMessages)
      .where(and(eq(directMessages.receiverId, userId), eq(directMessages.read, 0)));
    return reply.send({ count: Number(row?.count ?? 0) });
  });
}
