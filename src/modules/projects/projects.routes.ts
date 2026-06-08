import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { projects, projectMemories, projectFollows, projectLikes, projectComments, memories, users } from '../../db/schema/index.js';
import { eq, desc, and, sql } from 'drizzle-orm';
import { authenticate } from '../../lib/middleware.js';
import { AppError } from '../../lib/errors.js';
import { createNotification, notifyMentions } from '../../lib/notify.js';
import { randomUUID } from 'crypto';
import { z } from 'zod';

const createSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  status: z.enum(['building', 'launched', 'archived']).optional(),
  tags: z.array(z.string()).optional(),
  websiteUrl: z.string().url().optional().or(z.literal('')),
  githubUrl: z.string().url().optional().or(z.literal('')),
});

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export async function projectsRoutes(app: FastifyInstance) {
  // List all projects
  app.get('/projects', async (req, reply) => {
    const { limit = 20, offset = 0 } = req.query as { limit?: number; offset?: number };
    const rows = await db
      .select({
        project: projects,
        owner: {
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          avatar: users.avatar,
        },
      })
      .from(projects)
      .leftJoin(users, eq(projects.userId, users.id))
      .orderBy(desc(projects.createdAt))
      .limit(Number(limit))
      .offset(Number(offset));
    return reply.send({ projects: rows });
  });

  // Get single project
  app.get('/projects/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const [row] = await db
      .select({
        project: projects,
        owner: {
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          avatar: users.avatar,
        },
      })
      .from(projects)
      .leftJoin(users, eq(projects.userId, users.id))
      .where(eq(projects.id, id));
    if (!row) throw new AppError(404, 'NOT_FOUND', 'Project not found');
    return reply.send(row);
  });

  // Create project
  app.post('/projects', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const body = createSchema.parse(req.body);
    const id = randomUUID();
    const slug = slugify(body.name);
    await db.insert(projects).values({ id, userId, slug, ...body });
    const [created] = await db.select().from(projects).where(eq(projects.id, id));
    return reply.status(201).send(created);
  });

  // Update project
  app.patch('/projects/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const { id } = req.params as { id: string };
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    if (!project) throw new AppError(404, 'NOT_FOUND', 'Project not found');
    if (project.userId !== userId) throw new AppError(403, 'FORBIDDEN', 'Not your project');
    const body = createSchema.partial().parse(req.body);
    await db.update(projects).set(body).where(eq(projects.id, id));
    const [updated] = await db.select().from(projects).where(eq(projects.id, id));
    return reply.send(updated);
  });

  // Delete project
  app.delete('/projects/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const { id } = req.params as { id: string };
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    if (!project) throw new AppError(404, 'NOT_FOUND', 'Project not found');
    if (project.userId !== userId) throw new AppError(403, 'FORBIDDEN', 'Not your project');
    await db.delete(projects).where(eq(projects.id, id));
    return reply.status(204).send();
  });

  // Get project memories
  app.get('/projects/:id/memories', async (req, reply) => {
    const { id } = req.params as { id: string };
    const rows = await db
      .select({ memory: memories, author: { id: users.id, username: users.username, displayName: users.displayName, avatar: users.avatar } })
      .from(projectMemories)
      .leftJoin(memories, eq(projectMemories.memoryId, memories.id))
      .leftJoin(users, eq(memories.userId, users.id))
      .where(eq(projectMemories.projectId, id))
      .orderBy(desc(projectMemories.addedAt));
    return reply.send({ memories: rows });
  });

  // Attach memory to project
  app.post('/projects/:id/memories', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const { id: projectId } = req.params as { id: string };
    const { memoryId } = z.object({ memoryId: z.string() }).parse(req.body);
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    if (!project) throw new AppError(404, 'NOT_FOUND', 'Project not found');
    if (project.userId !== userId) throw new AppError(403, 'FORBIDDEN', 'Not your project');
    const [existing] = await db.select().from(projectMemories).where(and(eq(projectMemories.projectId, projectId), eq(projectMemories.memoryId, memoryId)));
    if (existing) throw new AppError(409, 'ALREADY_EXISTS', 'Memory already in project');
    await db.insert(projectMemories).values({ projectId, memoryId });
    await db.update(projects).set({ memoryCount: sql`memory_count + 1` }).where(eq(projects.id, projectId));
    return reply.status(201).send({ ok: true });
  });

  // Remove memory from project
  app.delete('/projects/:id/memories/:memoryId', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const { id: projectId, memoryId } = req.params as { id: string; memoryId: string };
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    if (!project) throw new AppError(404, 'NOT_FOUND', 'Project not found');
    if (project.userId !== userId) throw new AppError(403, 'FORBIDDEN', 'Not your project');
    await db.delete(projectMemories).where(and(eq(projectMemories.projectId, projectId), eq(projectMemories.memoryId, memoryId)));
    await db.update(projects).set({ memoryCount: sql`GREATEST(memory_count - 1, 0)` }).where(eq(projects.id, projectId));
    return reply.status(204).send();
  });

  // Follow/unfollow project
  app.post('/projects/:id/follow', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const { id: projectId } = req.params as { id: string };
    const [existing] = await db.select().from(projectFollows).where(and(eq(projectFollows.userId, userId), eq(projectFollows.projectId, projectId)));
    if (existing) {
      await db.delete(projectFollows).where(and(eq(projectFollows.userId, userId), eq(projectFollows.projectId, projectId)));
      await db.update(projects).set({ followerCount: sql`GREATEST(follower_count - 1, 0)` }).where(eq(projects.id, projectId));
      return reply.send({ following: false });
    }
    await db.insert(projectFollows).values({ userId, projectId });
    await db.update(projects).set({ followerCount: sql`follower_count + 1` }).where(eq(projects.id, projectId));
    return reply.send({ following: true });
  });

  // Like/unlike project
  app.post('/projects/:id/like', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const { id: projectId } = req.params as { id: string };
    const [project] = await db.select({ userId: projects.userId }).from(projects).where(eq(projects.id, projectId));
    if (!project) throw new AppError(404, 'NOT_FOUND', 'Project not found');

    const [existing] = await db
      .select()
      .from(projectLikes)
      .where(and(eq(projectLikes.userId, userId), eq(projectLikes.projectId, projectId)));

    if (existing) {
      await db.delete(projectLikes).where(and(eq(projectLikes.userId, userId), eq(projectLikes.projectId, projectId)));
      await db.update(projects).set({ likeCount: sql`GREATEST(like_count - 1, 0)` }).where(eq(projects.id, projectId));
      return reply.send({ liked: false });
    }

    await db.insert(projectLikes).values({ userId, projectId });
    await db.update(projects).set({ likeCount: sql`like_count + 1` }).where(eq(projects.id, projectId));
    await createNotification({ userId: project.userId, actorId: userId, type: 'like', projectId });
    return reply.send({ liked: true });
  });

  // Get project comments
  app.get('/projects/:id/comments', async (req, reply) => {
    const { id: projectId } = req.params as { id: string };
    const rows = await db
      .select({
        comment: projectComments,
        author: { id: users.id, username: users.username, displayName: users.displayName, avatar: users.avatar },
      })
      .from(projectComments)
      .leftJoin(users, eq(projectComments.userId, users.id))
      .where(eq(projectComments.projectId, projectId))
      .orderBy(desc(projectComments.createdAt));
    return reply.send({ comments: rows });
  });

  // Post project comment
  app.post('/projects/:id/comments', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const { id: projectId } = req.params as { id: string };
    const { content } = z.object({ content: z.string().min(1).max(2000) }).parse(req.body);
    const [project] = await db.select({ userId: projects.userId }).from(projects).where(eq(projects.id, projectId));
    if (!project) throw new AppError(404, 'NOT_FOUND', 'Project not found');

    const id = randomUUID();
    await db.insert(projectComments).values({ id, projectId, userId, content });
    await db.update(projects).set({ commentCount: sql`comment_count + 1` }).where(eq(projects.id, projectId));
    await createNotification({ userId: project.userId, actorId: userId, type: 'comment', projectId, commentId: id });
    await notifyMentions(content, userId, { projectId, commentId: id });

    const [created] = await db
      .select({
        comment: projectComments,
        author: { id: users.id, username: users.username, displayName: users.displayName, avatar: users.avatar },
      })
      .from(projectComments)
      .leftJoin(users, eq(projectComments.userId, users.id))
      .where(eq(projectComments.id, id));

    return reply.status(201).send(created);
  });

  // Delete project comment
  app.delete('/projects/comments/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const { id } = req.params as { id: string };
    const [comment] = await db.select().from(projectComments).where(eq(projectComments.id, id));
    if (!comment) throw new AppError(404, 'NOT_FOUND', 'Comment not found');
    if (comment.userId !== userId) throw new AppError(403, 'FORBIDDEN', 'Not your comment');
    await db.delete(projectComments).where(eq(projectComments.id, id));
    await db.update(projects).set({ commentCount: sql`GREATEST(comment_count - 1, 0)` }).where(eq(projects.id, comment.projectId));
    return reply.status(204).send();
  });

  // Check follow status
  app.get('/projects/:id/follow-status', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const { id: projectId } = req.params as { id: string };
    const [row] = await db.select().from(projectFollows).where(and(eq(projectFollows.userId, userId), eq(projectFollows.projectId, projectId)));
    return reply.send({ following: !!row });
  });

  // Get user's projects
  app.get('/users/:username/projects', async (req, reply) => {
    const { username } = req.params as { username: string };
    const [user] = await db.select().from(users).where(eq(users.username, username));
    if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found');
    const userProjects = await db.select().from(projects).where(eq(projects.userId, user.id)).orderBy(desc(projects.createdAt));
    return reply.send({ projects: userProjects });
  });
}
