import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { posts, postLikes, postSaves, postComments, postReactions, users, memories } from '../../db/schema/index.js';
import { eq, desc, and, sql, inArray } from 'drizzle-orm';
import { authenticate } from '../../lib/middleware.js';
import { AppError } from '../../lib/errors.js';
import { createNotification, notifyMentions } from '../../lib/notify.js';
import { randomUUID } from 'crypto';
import { z } from 'zod';

// Helper: fetch a post with its author + quoted items
async function fetchPostWithQuote(id: string) {
  const [row] = await db
    .select({
      post: posts,
      author: { id: users.id, username: users.username, displayName: users.displayName, avatar: users.avatar },
    })
    .from(posts).leftJoin(users, eq(posts.userId, users.id)).where(eq(posts.id, id));
  if (!row) return null;

  let quotedPost = null;
  let quotedMemory = null;

  if (row.post.quotePostId) {
    const [qp] = await db
      .select({ post: posts, author: { id: users.id, username: users.username, displayName: users.displayName, avatar: users.avatar } })
      .from(posts).leftJoin(users, eq(posts.userId, users.id)).where(eq(posts.id, row.post.quotePostId));
    quotedPost = qp ?? null;
  }
  if (row.post.quoteMemoryId) {
    const [qm] = await db
      .select({ memory: memories, author: { id: users.id, username: users.username, displayName: users.displayName, avatar: users.avatar } })
      .from(memories).leftJoin(users, eq(memories.userId, users.id)).where(eq(memories.id, row.post.quoteMemoryId));
    quotedMemory = qm ?? null;
  }
  return { ...row, quotedPost, quotedMemory };
}

export async function postsRoutes(app: FastifyInstance) {
  // List public posts
  app.get('/posts', async (req, reply) => {
    const { limit = 20, offset = 0 } = req.query as { limit?: number; offset?: number };
    const rows = await db
      .select({
        post: posts,
        author: { id: users.id, username: users.username, displayName: users.displayName, avatar: users.avatar },
      })
      .from(posts)
      .leftJoin(users, eq(posts.userId, users.id))
      .where(eq(posts.visibility, 'public'))
      .orderBy(desc(posts.createdAt))
      .limit(Number(limit))
      .offset(Number(offset));
    return reply.send({ posts: rows });
  });

  // Get single post (with quoted item)
  app.get('/posts/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = await fetchPostWithQuote(id);
    if (!row) throw new AppError(404, 'NOT_FOUND', 'Post not found');
    return reply.send(row);
  });

  // Create post (with optional quote + mention notifications)
  app.post('/posts', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const { content, visibility, mediaUrl, mediaType, quotePostId, quoteMemoryId } = z.object({
      content: z.string().min(1).max(5000),
      visibility: z.enum(['public', 'private']).optional(),
      mediaUrl: z.string().url().optional(),
      mediaType: z.enum(['image', 'video']).optional(),
      quotePostId: z.string().optional(),
      quoteMemoryId: z.string().optional(),
    }).parse(req.body);

    const id = randomUUID();
    await db.insert(posts).values({ id, userId, content, visibility: visibility ?? 'public', mediaUrl, mediaType, quotePostId, quoteMemoryId });

    // Notify quoted post/memory owner
    if (quotePostId) {
      const [qp] = await db.select({ userId: posts.userId }).from(posts).where(eq(posts.id, quotePostId));
      if (qp) await createNotification({ userId: qp.userId, actorId: userId, type: 'quote', postId: id });
    }
    if (quoteMemoryId) {
      const [qm] = await db.select({ userId: memories.userId }).from(memories).where(eq(memories.id, quoteMemoryId));
      if (qm) await createNotification({ userId: qm.userId, actorId: userId, type: 'quote', postId: id, memoryId: quoteMemoryId });
    }

    // Notify @mentions
    await notifyMentions(content, userId, { postId: id });
    const [created] = await db
      .select({
        post: posts,
        author: { id: users.id, username: users.username, displayName: users.displayName, avatar: users.avatar },
      })
      .from(posts)
      .leftJoin(users, eq(posts.userId, users.id))
      .where(eq(posts.id, id));
    return reply.status(201).send(created);
  });

  // Delete post
  app.delete('/posts/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const { id } = req.params as { id: string };
    const [post] = await db.select().from(posts).where(eq(posts.id, id));
    if (!post) throw new AppError(404, 'NOT_FOUND', 'Post not found');
    if (post.userId !== userId) throw new AppError(403, 'FORBIDDEN', 'Not your post');
    await db.delete(posts).where(eq(posts.id, id));
    return reply.status(204).send();
  });

  // Saved posts for current user
  app.get('/posts/saved/me', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const rows = await db
      .select({
        post: posts,
        author: { id: users.id, username: users.username, displayName: users.displayName, avatar: users.avatar },
      })
      .from(postSaves)
      .innerJoin(posts, eq(postSaves.postId, posts.id))
      .leftJoin(users, eq(posts.userId, users.id))
      .where(eq(postSaves.userId, userId))
      .orderBy(desc(postSaves.createdAt))
      .limit(100);
    return reply.send({ posts: rows });
  });

  // Save toggle
  app.post('/posts/:id/save', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const { id: postId } = req.params as { id: string };
    const [existing] = await db.select().from(postSaves).where(and(eq(postSaves.userId, userId), eq(postSaves.postId, postId)));
    if (existing) {
      await db.delete(postSaves).where(and(eq(postSaves.userId, userId), eq(postSaves.postId, postId)));
      await db.update(posts).set({ saveCount: sql`GREATEST(save_count - 1, 0)` }).where(eq(posts.id, postId));
      return reply.send({ saved: false });
    }
    await db.insert(postSaves).values({ userId, postId });
    await db.update(posts).set({ saveCount: sql`save_count + 1` }).where(eq(posts.id, postId));
    return reply.send({ saved: true });
  });

  // Like toggle
  app.post('/posts/:id/like', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const { id: postId } = req.params as { id: string };
    const [existing] = await db.select().from(postLikes).where(and(eq(postLikes.userId, userId), eq(postLikes.postId, postId)));
    if (existing) {
      await db.delete(postLikes).where(and(eq(postLikes.userId, userId), eq(postLikes.postId, postId)));
      await db.update(posts).set({ likeCount: sql`GREATEST(like_count - 1, 0)` }).where(eq(posts.id, postId));
      return reply.send({ liked: false });
    }
    await db.insert(postLikes).values({ userId, postId });
    await db.update(posts).set({ likeCount: sql`like_count + 1` }).where(eq(posts.id, postId));
    return reply.send({ liked: true });
  });

  // Comments on a post
  app.get('/posts/:id/comments', async (req, reply) => {
    const { id: postId } = req.params as { id: string };
    const rows = await db
      .select({
        comment: postComments,
        author: { id: users.id, username: users.username, displayName: users.displayName, avatar: users.avatar },
      })
      .from(postComments)
      .leftJoin(users, eq(postComments.userId, users.id))
      .where(eq(postComments.postId, postId))
      .orderBy(desc(postComments.createdAt));
    return reply.send({ comments: rows });
  });

  app.post('/posts/:id/comments', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const { id: postId } = req.params as { id: string };
    const { content } = z.object({ content: z.string().min(1).max(2000) }).parse(req.body);
    const id = randomUUID();
    await db.insert(postComments).values({ id, postId, userId, content });
    await db.update(posts).set({ commentCount: sql`comment_count + 1` }).where(eq(posts.id, postId));
    // Notify post owner
    const [postRow] = await db.select({ userId: posts.userId }).from(posts).where(eq(posts.id, postId));
    if (postRow) await createNotification({ userId: postRow.userId, actorId: userId, type: 'comment', postId, commentId: id });
    // Notify @mentions
    await notifyMentions(content, userId, { postId, commentId: id });
    const [created] = await db
      .select({
        comment: postComments,
        author: { id: users.id, username: users.username, displayName: users.displayName, avatar: users.avatar },
      })
      .from(postComments)
      .leftJoin(users, eq(postComments.userId, users.id))
      .where(eq(postComments.id, id));
    return reply.status(201).send(created);
  });

  app.delete('/posts/comments/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const { id } = req.params as { id: string };
    const [comment] = await db.select().from(postComments).where(eq(postComments.id, id));
    if (!comment) throw new AppError(404, 'NOT_FOUND', 'Comment not found');
    if (comment.userId !== userId) throw new AppError(403, 'FORBIDDEN', 'Not your comment');
    await db.delete(postComments).where(eq(postComments.id, id));
    await db.update(posts).set({ commentCount: sql`GREATEST(comment_count - 1, 0)` }).where(eq(posts.id, comment.postId));
    return reply.status(204).send();
  });

  // ── Reactions ──────────────────────────────────────────────────────────────
  const ALLOWED_REACTIONS = ['🔥', '🧠', '👀', '🚀', '✅', '💡'];

  app.get('/posts/:id/reactions', async (req, reply) => {
    const { id: postId } = req.params as { id: string };
    let userId: string | undefined;
    try { await req.jwtVerify(); userId = (req.user as any).id; } catch {}

    const rows = await db.select().from(postReactions).where(eq(postReactions.postId, postId));
    // Group by emoji
    const grouped: Record<string, { count: number; reacted: boolean }> = {};
    for (const r of rows) {
      if (!grouped[r.emoji]) grouped[r.emoji] = { count: 0, reacted: false };
      grouped[r.emoji].count++;
      if (r.userId === userId) grouped[r.emoji].reacted = true;
    }
    return reply.send({ reactions: grouped });
  });

  app.post('/posts/:id/reactions', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const { id: postId } = req.params as { id: string };
    const { emoji } = z.object({ emoji: z.string() }).parse(req.body);
    if (!ALLOWED_REACTIONS.includes(emoji)) throw new AppError(400, 'BAD_REQUEST', 'Invalid reaction');

    const [existing] = await db.select().from(postReactions)
      .where(and(eq(postReactions.userId, userId), eq(postReactions.postId, postId), eq(postReactions.emoji, emoji)));

    if (existing) {
      await db.delete(postReactions).where(eq(postReactions.id, existing.id));
      return reply.send({ reacted: false, emoji });
    }
    await db.insert(postReactions).values({ id: randomUUID(), userId, postId, emoji });
    // Notify post owner
    const [postRow] = await db.select({ userId: posts.userId }).from(posts).where(eq(posts.id, postId));
    if (postRow) await createNotification({ userId: postRow.userId, actorId: userId, type: 'reaction', postId });
    return reply.send({ reacted: true, emoji });
  });

  // ── Trending tags ──────────────────────────────────────────────────────────
  // (also served from search.routes but available here for convenience)
}
