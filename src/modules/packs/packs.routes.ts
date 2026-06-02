import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { packs, packMemories, memories, users } from '../../db/schema/index.js';
import { eq, desc, and, sql } from 'drizzle-orm';
import { authenticate } from '../../lib/middleware.js';
import { AppError } from '../../lib/errors.js';
import { randomUUID } from 'crypto';
import { z } from 'zod';

export async function packsRoutes(app: FastifyInstance) {
  // List public packs
  app.get('/packs', async (req, reply) => {
    const { limit = 20, offset = 0 } = req.query as { limit?: number; offset?: number };
    const rows = await db
      .select({
        pack: packs,
        owner: { id: users.id, username: users.username, displayName: users.displayName, avatar: users.avatar },
      })
      .from(packs)
      .leftJoin(users, eq(packs.userId, users.id))
      .where(eq(packs.visibility, 'public'))
      .orderBy(desc(packs.createdAt))
      .limit(Number(limit))
      .offset(Number(offset));
    return reply.send({ packs: rows });
  });

  // Get single pack with its memories
  app.get('/packs/:id', async (req, reply) => {
    const { id } = req.params as { id: string };

    // Optionally authenticate to allow owner to see private pack
    let requesterId: string | undefined;
    try { await req.jwtVerify(); requesterId = (req.user as any).id; } catch {}

    const [row] = await db
      .select({
        pack: packs,
        owner: { id: users.id, username: users.username, displayName: users.displayName, avatar: users.avatar },
      })
      .from(packs)
      .leftJoin(users, eq(packs.userId, users.id))
      .where(eq(packs.id, id));

    if (!row) throw new AppError(404, 'NOT_FOUND', 'Pack not found');
    if (row.pack.visibility === 'private' && row.pack.userId !== requesterId) {
      throw new AppError(403, 'FORBIDDEN', 'This pack is private');
    }

    // Load memories in the pack
    const packMemoryRows = await db
      .select({
        memory: memories,
        author: { id: users.id, username: users.username, displayName: users.displayName, avatar: users.avatar },
      })
      .from(packMemories)
      .innerJoin(memories, eq(packMemories.memoryId, memories.id))
      .leftJoin(users, eq(memories.userId, users.id))
      .where(eq(packMemories.packId, id))
      .orderBy(desc(packMemories.createdAt));

    return reply.send({ pack: row.pack, owner: row.owner, memories: packMemoryRows });
  });

  // Create pack
  app.post('/packs', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const { title, description, visibility } = z.object({
      title: z.string().min(1).max(255),
      description: z.string().max(2000).optional(),
      visibility: z.enum(['public', 'private']).optional(),
    }).parse(req.body);

    const id = randomUUID();
    await db.insert(packs).values({ id, userId, title, description, visibility: visibility ?? 'public' });
    const [created] = await db
      .select({ pack: packs, owner: { id: users.id, username: users.username, displayName: users.displayName, avatar: users.avatar } })
      .from(packs).leftJoin(users, eq(packs.userId, users.id)).where(eq(packs.id, id));
    return reply.status(201).send(created);
  });

  // Update pack
  app.patch('/packs/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const { id } = req.params as { id: string };
    const [pack] = await db.select().from(packs).where(eq(packs.id, id));
    if (!pack) throw new AppError(404, 'NOT_FOUND', 'Pack not found');
    if (pack.userId !== userId) throw new AppError(403, 'FORBIDDEN', 'Not your pack');

    const body = z.object({
      title: z.string().min(1).max(255).optional(),
      description: z.string().max(2000).optional(),
      visibility: z.enum(['public', 'private']).optional(),
    }).parse(req.body);

    await db.update(packs).set(body).where(eq(packs.id, id));
    const [updated] = await db.select().from(packs).where(eq(packs.id, id));
    return reply.send({ pack: updated });
  });

  // Delete pack
  app.delete('/packs/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const { id } = req.params as { id: string };
    const [pack] = await db.select().from(packs).where(eq(packs.id, id));
    if (!pack) throw new AppError(404, 'NOT_FOUND', 'Pack not found');
    if (pack.userId !== userId) throw new AppError(403, 'FORBIDDEN', 'Not your pack');

    await db.delete(packMemories).where(eq(packMemories.packId, id));
    await db.delete(packs).where(eq(packs.id, id));
    return reply.send({ deleted: true });
  });

  // Add memory to pack
  app.post('/packs/:id/memories', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const { id: packId } = req.params as { id: string };
    const { memoryId } = z.object({ memoryId: z.string() }).parse(req.body);

    const [pack] = await db.select().from(packs).where(eq(packs.id, packId));
    if (!pack) throw new AppError(404, 'NOT_FOUND', 'Pack not found');
    if (pack.userId !== userId) throw new AppError(403, 'FORBIDDEN', 'Not your pack');

    const [existing] = await db.select().from(packMemories)
      .where(and(eq(packMemories.packId, packId), eq(packMemories.memoryId, memoryId)));
    if (existing) return reply.send({ added: false, message: 'Already in pack' });

    await db.insert(packMemories).values({ packId, memoryId });
    await db.update(packs).set({ memoryCount: sql`memory_count + 1` }).where(eq(packs.id, packId));
    return reply.send({ added: true });
  });

  // Remove memory from pack
  app.delete('/packs/:id/memories/:memoryId', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const { id: packId, memoryId } = req.params as { id: string; memoryId: string };

    const [pack] = await db.select().from(packs).where(eq(packs.id, packId));
    if (!pack) throw new AppError(404, 'NOT_FOUND', 'Pack not found');
    if (pack.userId !== userId) throw new AppError(403, 'FORBIDDEN', 'Not your pack');

    await db.delete(packMemories)
      .where(and(eq(packMemories.packId, packId), eq(packMemories.memoryId, memoryId)));
    await db.update(packs).set({ memoryCount: sql`GREATEST(memory_count - 1, 0)` }).where(eq(packs.id, packId));
    return reply.send({ removed: true });
  });

  // Get packs by user
  app.get('/users/:username/packs', async (req, reply) => {
    const { username } = req.params as { username: string };
    const [user] = await db.select().from(users).where(eq(users.username, username));
    if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found');

    let requesterId: string | undefined;
    try { await req.jwtVerify(); requesterId = (req.user as any).id; } catch {}

    const isOwner = requesterId === user.id;

    const rows = await db
      .select()
      .from(packs)
      .where(
        isOwner
          ? eq(packs.userId, user.id)
          : and(eq(packs.userId, user.id), eq(packs.visibility, 'public'))
      )
      .orderBy(desc(packs.createdAt));

    return reply.send({ packs: rows });
  });
}
