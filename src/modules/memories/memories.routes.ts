import type { FastifyInstance } from 'fastify';
import { memoriesService } from './memories.service.js';
import { authenticate } from '../../lib/middleware.js';
import { db } from '../../db/index.js';
import { memories, users } from '../../db/schema/index.js';
import { eq, desc, and, gte, sql } from 'drizzle-orm';
import { z } from 'zod';

const createSchema = z.object({
  title: z.string().min(1).max(255),
  content: z.string().min(1),
  category: z.enum(['prompt', 'workflow', 'architecture', 'template', 'tutorial', 'agent_setup', 'mcp', 'deployment', 'productivity']),
  tags: z.array(z.string()).optional(),
  visibility: z.enum(['public', 'private']).optional(),
});

export async function memoriesRoutes(app: FastifyInstance) {
  // Trending — must come before /memories/:id
  app.get('/memories/trending', async (req, reply) => {
    const { limit = 20 } = req.query as { limit?: number };
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
      .limit(Number(limit));
    return reply.send({ memories: rows });
  });

  // Feed
  app.get('/memories', async (req, reply) => {
    const { limit = 20, offset = 0 } = req.query as { limit?: number; offset?: number };
    const feed = await memoriesService.getFeed(Number(limit), Number(offset));
    return reply.send({ memories: feed });
  });

  // Get one
  app.get('/memories/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const memory = await memoriesService.getById(id);
    return reply.send(memory);
  });

  // Create
  app.post('/memories', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const body = createSchema.parse(req.body);
    const memory = await memoriesService.create(userId, body);
    return reply.status(201).send(memory);
  });

  // Update
  app.patch('/memories/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const { id: memoryId } = req.params as { id: string };
    const body = createSchema.partial().parse(req.body);
    const updated = await memoriesService.update(userId, memoryId, body);
    return reply.send(updated);
  });

  // Fork
  app.post('/memories/:id/fork', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const { id: memoryId } = req.params as { id: string };
    const forked = await memoriesService.fork(userId, memoryId);
    return reply.status(201).send(forked);
  });

  // Delete
  app.delete('/memories/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const { id: memoryId } = req.params as { id: string };
    await memoriesService.delete(userId, memoryId);
    return reply.status(204).send();
  });

  // Like toggle
  app.post('/memories/:id/like', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const { id: memoryId } = req.params as { id: string };
    const result = await memoriesService.toggleLike(userId, memoryId);
    return reply.send(result);
  });

  // Save toggle
  app.post('/memories/:id/save', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const { id: memoryId } = req.params as { id: string };
    const result = await memoriesService.toggleSave(userId, memoryId);
    return reply.send(result);
  });

  // Saved memories for current user
  app.get('/memories/saved/me', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const saved = await memoriesService.getSaved(userId);
    return reply.send({ memories: saved });
  });
}
