import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { events, eventRsvps, users } from '../../db/schema/index.js';
import { eq, desc, and, gte, sql } from 'drizzle-orm';
import { authenticate } from '../../lib/middleware.js';
import { AppError } from '../../lib/errors.js';
import { randomUUID } from 'crypto';
import { z } from 'zod';

const createSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  type: z.enum(['demo_day', 'build_session', 'hackathon']),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().optional(),
  location: z.string().max(255).optional(),
});

export async function eventsRoutes(app: FastifyInstance) {
  // List upcoming events
  app.get('/events', async (req, reply) => {
    const { limit = 20, offset = 0 } = req.query as { limit?: number; offset?: number };
    const rows = await db
      .select({
        event: events,
        organizer: {
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          avatar: users.avatar,
        },
      })
      .from(events)
      .leftJoin(users, eq(events.userId, users.id))
      .orderBy(desc(events.startsAt))
      .limit(Number(limit))
      .offset(Number(offset));
    return reply.send({ events: rows });
  });

  // Get single event
  app.get('/events/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const [row] = await db
      .select({
        event: events,
        organizer: {
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          avatar: users.avatar,
        },
      })
      .from(events)
      .leftJoin(users, eq(events.userId, users.id))
      .where(eq(events.id, id));
    if (!row) throw new AppError(404, 'NOT_FOUND', 'Event not found');
    return reply.send(row);
  });

  // Create event
  app.post('/events', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const body = createSchema.parse(req.body);
    const id = randomUUID();
    await db.insert(events).values({
      id, userId,
      ...body,
      startsAt: new Date(body.startsAt),
      endsAt: body.endsAt ? new Date(body.endsAt) : undefined,
    });
    const [created] = await db.select().from(events).where(eq(events.id, id));
    return reply.status(201).send(created);
  });

  // Update event
  app.patch('/events/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const { id } = req.params as { id: string };
    const [event] = await db.select().from(events).where(eq(events.id, id));
    if (!event) throw new AppError(404, 'NOT_FOUND', 'Event not found');
    if (event.userId !== userId) throw new AppError(403, 'FORBIDDEN', 'Not your event');
    const body = createSchema.partial().parse(req.body);
    await db.update(events).set({
      ...body,
      startsAt: body.startsAt ? new Date(body.startsAt) : undefined,
      endsAt: body.endsAt ? new Date(body.endsAt) : undefined,
    }).where(eq(events.id, id));
    const [updated] = await db.select().from(events).where(eq(events.id, id));
    return reply.send(updated);
  });

  // Delete event
  app.delete('/events/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const { id } = req.params as { id: string };
    const [event] = await db.select().from(events).where(eq(events.id, id));
    if (!event) throw new AppError(404, 'NOT_FOUND', 'Event not found');
    if (event.userId !== userId) throw new AppError(403, 'FORBIDDEN', 'Not your event');
    await db.delete(events).where(eq(events.id, id));
    return reply.status(204).send();
  });

  // RSVP toggle
  app.post('/events/:id/rsvp', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const { id: eventId } = req.params as { id: string };
    const [existing] = await db.select().from(eventRsvps).where(and(eq(eventRsvps.userId, userId), eq(eventRsvps.eventId, eventId)));
    if (existing) {
      await db.delete(eventRsvps).where(and(eq(eventRsvps.userId, userId), eq(eventRsvps.eventId, eventId)));
      await db.update(events).set({ rsvpCount: sql`GREATEST(rsvp_count - 1, 0)` }).where(eq(events.id, eventId));
      return reply.send({ rsvped: false });
    }
    await db.insert(eventRsvps).values({ userId, eventId });
    await db.update(events).set({ rsvpCount: sql`rsvp_count + 1` }).where(eq(events.id, eventId));
    return reply.send({ rsvped: true });
  });

  // Get RSVP status
  app.get('/events/:id/rsvp-status', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const { id: eventId } = req.params as { id: string };
    const [row] = await db.select().from(eventRsvps).where(and(eq(eventRsvps.userId, userId), eq(eventRsvps.eventId, eventId)));
    return reply.send({ rsvped: !!row });
  });
}
