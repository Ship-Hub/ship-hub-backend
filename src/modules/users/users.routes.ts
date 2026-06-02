import type { FastifyInstance } from 'fastify';
import { usersRepository } from './users.repository.js';
import { memoriesService } from '../memories/memories.service.js';
import { authenticate } from '../../lib/middleware.js';
import { AppError } from '../../lib/errors.js';
import { createNotification } from '../../lib/notify.js';
import { db } from '../../db/index.js';
import { users, follows } from '../../db/schema/index.js';
import { eq, desc, sql, and } from 'drizzle-orm';
import { memories } from '../../db/schema/index.js';
import { z } from 'zod';

const updateSchema = z.object({
  displayName: z.string().max(100).optional(),
  bio: z.string().max(500).optional(),
  website: z.string().url().optional().or(z.literal('')),
  githubUsername: z.string().max(100).optional(),
  avatar: z.string().url().max(500).optional().or(z.literal('')),
});

export async function usersRoutes(app: FastifyInstance) {
  // Get profile by username
  app.get('/users/:username', async (req, reply) => {
    const { username } = req.params as { username: string };
    const user = await usersRepository.findByUsername(username);
    if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found');
    const { passwordHash, ...safe } = user;
    return reply.send({ user: safe });
  });

  // Get user's memories
  app.get('/users/:username/memories', async (req, reply) => {
    const { username } = req.params as { username: string };
    const user = await usersRepository.findByUsername(username);
    if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found');

    let requesterId: string | undefined;
    try {
      await req.jwtVerify();
      requesterId = (req.user as { id: string }).id;
    } catch {}

    const userMemories = await memoriesService.getByUser(user.id, requesterId);
    return reply.send({ memories: userMemories });
  });

  // Update own profile
  app.patch('/users/me', { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.user as { id: string };
    const body = updateSchema.parse(req.body);
    const updated = await usersRepository.update(id, body);
    const { passwordHash, ...safe } = updated!;
    return reply.send({ user: safe });
  });

  // Follow / unfollow
  app.post('/users/:username/follow', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: followerId } = req.user as { id: string };
    const { username } = req.params as { username: string };
    const target = await usersRepository.findByUsername(username);
    if (!target) throw new AppError(404, 'NOT_FOUND', 'User not found');
    if (target.id === followerId) throw new AppError(400, 'BAD_REQUEST', 'Cannot follow yourself');

    const isFollowing = await usersRepository.isFollowing(followerId, target.id);
    if (isFollowing) {
      await usersRepository.unfollow(followerId, target.id);
      return reply.send({ following: false });
    } else {
      await usersRepository.follow(followerId, target.id);
      await createNotification({ userId: target.id, actorId: followerId, type: 'follow' });
      return reply.send({ following: true });
    }
  });

  // Followers list
  app.get('/users/:username/followers', async (req, reply) => {
    const { username } = req.params as { username: string };
    const [target] = await db.select().from(users).where(eq(users.username, username));
    if (!target) throw new AppError(404, 'NOT_FOUND', 'User not found');
    const rows = await db
      .select({ id: users.id, username: users.username, displayName: users.displayName, avatar: users.avatar, bio: users.bio, followerCount: users.followerCount })
      .from(follows)
      .leftJoin(users, eq(follows.followerId, users.id))
      .where(eq(follows.followingId, target.id));
    return reply.send({ users: rows });
  });

  // Following list
  app.get('/users/:username/following', async (req, reply) => {
    const { username } = req.params as { username: string };
    const [target] = await db.select().from(users).where(eq(users.username, username));
    if (!target) throw new AppError(404, 'NOT_FOUND', 'User not found');
    const rows = await db
      .select({ id: users.id, username: users.username, displayName: users.displayName, avatar: users.avatar, bio: users.bio, followerCount: users.followerCount })
      .from(follows)
      .leftJoin(users, eq(follows.followingId, users.id))
      .where(eq(follows.followerId, target.id));
    return reply.send({ users: rows });
  });

  // Leaderboard — top builders by reputation score
  app.get('/leaderboard', async (req, reply) => {
    const { limit = 50 } = req.query as { limit?: number };
    const lim = Math.min(Number(limit), 100);

    const repExpr = sql<number>`(COALESCE(SUM(${memories.forkCount}), 0) * 3) + (${users.followerCount} * 2) + ${users.memoryCount} + COALESCE(SUM(${memories.likeCount}), 0)`;

    const rows = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        avatar: users.avatar,
        bio: users.bio,
        followerCount: users.followerCount,
        memoryCount: users.memoryCount,
        totalForks: sql<number>`COALESCE(SUM(${memories.forkCount}), 0)`,
        totalLikes: sql<number>`COALESCE(SUM(${memories.likeCount}), 0)`,
        rep: repExpr,
      })
      .from(users)
      .leftJoin(
        memories,
        and(eq(memories.userId, users.id), eq(memories.visibility, 'public'))
      )
      .groupBy(users.id)
      .orderBy(desc(repExpr))
      .limit(lim);

    return reply.send({ builders: rows });
  });

  // Check if following
  app.get('/users/:username/following-status', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: followerId } = req.user as { id: string };
    const { username } = req.params as { username: string };
    const target = await usersRepository.findByUsername(username);
    if (!target) throw new AppError(404, 'NOT_FOUND', 'User not found');
    const following = await usersRepository.isFollowing(followerId, target.id);
    return reply.send({ following });
  });
}
