import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { chatChannels, chatMessages, users } from '../../db/schema/index.js';
import { eq, desc, lt, sql } from 'drizzle-orm';
import { authenticate } from '../../lib/middleware.js';
import { AppError } from '../../lib/errors.js';
import { chatEmitter } from '../../lib/chat.js';
import { notifyMentions } from '../../lib/notify.js';
import { randomUUID } from 'crypto';
import { z } from 'zod';

export async function chatRoutes(app: FastifyInstance) {
  // List all channels
  app.get('/chat/channels', async (_req, reply) => {
    const channels = await db
      .select()
      .from(chatChannels)
      .orderBy(chatChannels.isDefault, chatChannels.name);
    return reply.send({ channels });
  });

  // Paginated message history — cursor-based (before=messageId)
  app.get('/chat/channels/:slug/messages', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const { before, limit = 50 } = req.query as { before?: string; limit?: number };

    const [channel] = await db.select().from(chatChannels).where(eq(chatChannels.slug, slug));
    if (!channel) throw new AppError(404, 'NOT_FOUND', 'Channel not found');

    const lim = Math.min(Number(limit), 100);

    let whereClause = eq(chatMessages.channelId, channel.id);
    if (before) {
      const [cursor] = await db
        .select({ createdAt: chatMessages.createdAt })
        .from(chatMessages)
        .where(eq(chatMessages.id, before));
      if (cursor) {
        whereClause = sql`${chatMessages.channelId} = ${channel.id} AND ${chatMessages.createdAt} < ${cursor.createdAt}` as any;
      }
    }

    const rows = await db
      .select({
        message: chatMessages,
        author: {
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          avatar: users.avatar,
        },
      })
      .from(chatMessages)
      .leftJoin(users, eq(chatMessages.userId, users.id))
      .where(whereClause)
      .orderBy(desc(chatMessages.createdAt))
      .limit(lim);

    // Return oldest-first so the frontend can append naturally
    return reply.send({ messages: rows.reverse(), channelId: channel.id });
  });

  // Send a message
  app.post('/chat/channels/:slug/messages', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const { slug } = req.params as { slug: string };
    const { content } = z.object({ content: z.string().min(1).max(4000) }).parse(req.body);

    const [channel] = await db.select().from(chatChannels).where(eq(chatChannels.slug, slug));
    if (!channel) throw new AppError(404, 'NOT_FOUND', 'Channel not found');

    const id = randomUUID();
    await db.insert(chatMessages).values({ id, channelId: channel.id, userId, content });
    await db.update(chatChannels).set({ messageCount: sql`message_count + 1` }).where(eq(chatChannels.id, channel.id));

    const [author] = await db
      .select({ id: users.id, username: users.username, displayName: users.displayName, avatar: users.avatar })
      .from(users)
      .where(eq(users.id, userId));

    const message = { id, channelId: channel.id, userId, content, createdAt: new Date().toISOString() };
    const payload = { message, author };

    // Broadcast to SSE listeners on this channel
    chatEmitter.emit(`chat:${slug}`, payload);

    // Notify @mentions as chat_mention
    await notifyMentions(content, userId, {});

    return reply.status(201).send(payload);
  });

  // SSE stream for a channel
  app.get('/chat/channels/:slug/stream', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const { token } = req.query as { token?: string };

    // Auth optional — guests can read chat via SSE, but we identify if logged in
    if (token) req.headers.authorization = `Bearer ${token}`;
    try { await req.jwtVerify(); } catch {}

    const [channel] = await db.select({ id: chatChannels.id }).from(chatChannels).where(eq(chatChannels.slug, slug));
    if (!channel) return reply.status(404).send();

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('X-Accel-Buffering', 'no');
    reply.raw.flushHeaders();

    const onMessage = (data: any) => {
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    chatEmitter.on(`chat:${slug}`, onMessage);

    const heartbeat = setInterval(() => {
      reply.raw.write(': ping\n\n');
    }, 20000);

    req.raw.on('close', () => {
      clearInterval(heartbeat);
      chatEmitter.off(`chat:${slug}`, onMessage);
    });

    await new Promise(() => {});
  });
}
