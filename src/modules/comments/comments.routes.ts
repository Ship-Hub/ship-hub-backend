import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { comments, users, memories } from '../../db/schema/index.js';
import { eq, desc, and } from 'drizzle-orm';
import { authenticate } from '../../lib/middleware.js';
import { AppError } from '../../lib/errors.js';
import { createNotification, notifyMentions } from '../../lib/notify.js';
import { randomUUID } from 'crypto';
import { z } from 'zod';

export async function commentsRoutes(app: FastifyInstance) {
  // Get comments for a memory
  app.get('/memories/:id/comments', async (req, reply) => {
    const { id: memoryId } = req.params as { id: string };
    const rows = await db
      .select({
        comment: comments,
        author: {
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          avatar: users.avatar,
        },
      })
      .from(comments)
      .leftJoin(users, eq(comments.userId, users.id))
      .where(eq(comments.memoryId, memoryId))
      .orderBy(desc(comments.createdAt));
    return reply.send({ comments: rows });
  });

  // Post a comment
  app.post('/memories/:id/comments', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const { id: memoryId } = req.params as { id: string };
    const { content } = z.object({ content: z.string().min(1).max(2000) }).parse(req.body);

    const id = randomUUID();
    await db.insert(comments).values({ id, memoryId, userId, content });
    // Notify memory owner
    const [mem] = await db.select({ userId: memories.userId }).from(memories).where(eq(memories.id, memoryId));
    if (mem) await createNotification({ userId: mem.userId, actorId: userId, type: 'comment', memoryId, commentId: id });
    await notifyMentions(content, userId, { memoryId, commentId: id });
    const [created] = await db
      .select({
        comment: comments,
        author: {
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          avatar: users.avatar,
        },
      })
      .from(comments)
      .leftJoin(users, eq(comments.userId, users.id))
      .where(eq(comments.id, id));

    return reply.status(201).send(created);
  });

  // Delete a comment
  app.delete('/comments/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const { id: commentId } = req.params as { id: string };
    const [comment] = await db.select().from(comments).where(eq(comments.id, commentId));
    if (!comment) throw new AppError(404, 'NOT_FOUND', 'Comment not found');
    if (comment.userId !== userId) throw new AppError(403, 'FORBIDDEN', 'Not your comment');
    await db.delete(comments).where(eq(comments.id, commentId));
    return reply.status(204).send();
  });
}
