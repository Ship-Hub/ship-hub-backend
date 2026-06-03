import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import {
  posts, postLikes, postSaves, postComments, postReactions,
  users, memories, pollOptions, pollVotes, collabApplications,
} from '../../db/schema/index.js';
import { eq, desc, and, sql, inArray, lt } from 'drizzle-orm';
import { authenticate } from '../../lib/middleware.js';
import { AppError } from '../../lib/errors.js';
import { createNotification, notifyMentions } from '../../lib/notify.js';
import { randomUUID } from 'crypto';
import { z } from 'zod';

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

  // Attach poll options if this is a poll
  let poll = null;
  if (row.post.type === 'poll') {
    const options = await db
      .select()
      .from(pollOptions)
      .where(eq(pollOptions.postId, id))
      .orderBy(pollOptions.position);
    poll = { options };
  }

  return { ...row, quotedPost, quotedMemory, poll };
}

const createPostSchema = z.object({
  type: z.enum(['general', 'build_update', 'code_snippet', 'collab_request', 'poll', 'question']).default('general'),
  content: z.string().min(1).max(5000),
  visibility: z.enum(['public', 'private']).optional(),
  mediaUrl: z.string().url().optional(),
  mediaType: z.enum(['image', 'video']).optional(),
  quotePostId: z.string().optional(),
  quoteMemoryId: z.string().optional(),
  // code snippet
  language: z.string().max(50).optional(),
  // build update
  projectId: z.string().optional(),
  milestone: z.string().max(255).optional(),
  // collab request
  roleNeeded: z.string().max(255).optional(),
  skills: z.array(z.string()).optional(),
  compensation: z.enum(['paid', 'equity', 'volunteer', 'revenue_share']).optional(),
  applyUrl: z.string().url().optional(),
  // poll
  pollOptions: z.array(z.string().min(1).max(500)).min(2).max(10).optional(),
  pollIsAnonymous: z.boolean().optional(),
  pollAllowMultiple: z.boolean().optional(),
});

export async function postsRoutes(app: FastifyInstance) {
  // List public posts
  app.get('/posts', async (req, reply) => {
    const { limit = 20, offset = 0, type } = req.query as { limit?: number; offset?: number; type?: string };
    const lim = Math.min(Number(limit), 50);

    let query = db
      .select({
        post: posts,
        author: { id: users.id, username: users.username, displayName: users.displayName, avatar: users.avatar },
      })
      .from(posts)
      .leftJoin(users, eq(posts.userId, users.id))
      .where(
        type
          ? and(eq(posts.visibility, 'public'), eq(posts.type, type as any))
          : eq(posts.visibility, 'public')
      )
      .orderBy(desc(posts.createdAt))
      .limit(lim)
      .offset(Number(offset));

    const rows = await query;
    return reply.send({ posts: rows });
  });

  // Get single post (with quoted item + poll)
  app.get('/posts/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = await fetchPostWithQuote(id);
    if (!row) throw new AppError(404, 'NOT_FOUND', 'Post not found');
    return reply.send(row);
  });

  // Create post
  app.post('/posts', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const body = createPostSchema.parse(req.body);

    // Validate: poll type must have pollOptions
    if (body.type === 'poll' && (!body.pollOptions || body.pollOptions.length < 2)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Polls require at least 2 options');
    }

    const id = randomUUID();
    await db.insert(posts).values({
      id,
      userId,
      type: body.type,
      content: body.content,
      visibility: body.visibility ?? 'public',
      mediaUrl: body.mediaUrl,
      mediaType: body.mediaType,
      quotePostId: body.quotePostId,
      quoteMemoryId: body.quoteMemoryId,
      language: body.language,
      projectId: body.projectId,
      milestone: body.milestone,
      roleNeeded: body.roleNeeded,
      skills: body.skills ?? null,
      compensation: body.compensation,
      applyUrl: body.applyUrl,
      pollIsAnonymous: body.pollIsAnonymous ? 1 : 0,
      pollAllowMultiple: body.pollAllowMultiple ? 1 : 0,
    });

    // Insert poll options
    if (body.type === 'poll' && body.pollOptions) {
      for (let i = 0; i < body.pollOptions.length; i++) {
        await db.insert(pollOptions).values({
          id: randomUUID(),
          postId: id,
          text: body.pollOptions[i],
          position: i,
        });
      }
    }

    // Notifications for quotes
    if (body.quotePostId) {
      const [qp] = await db.select({ userId: posts.userId }).from(posts).where(eq(posts.id, body.quotePostId));
      if (qp) await createNotification({ userId: qp.userId, actorId: userId, type: 'quote', postId: id });
    }
    if (body.quoteMemoryId) {
      const [qm] = await db.select({ userId: memories.userId }).from(memories).where(eq(memories.id, body.quoteMemoryId));
      if (qm) await createNotification({ userId: qm.userId, actorId: userId, type: 'quote', postId: id, memoryId: body.quoteMemoryId });
    }

    await notifyMentions(body.content, userId, { postId: id });

    const created = await fetchPostWithQuote(id);
    return reply.status(201).send(created);
  });

  // Edit post (15-minute window)
  app.patch('/posts/:id', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const { id } = req.params as { id: string };
    const { content } = z.object({ content: z.string().min(1).max(5000) }).parse(req.body);

    const [post] = await db.select().from(posts).where(eq(posts.id, id));
    if (!post) throw new AppError(404, 'NOT_FOUND', 'Post not found');
    if (post.userId !== userId) throw new AppError(403, 'FORBIDDEN', 'Not your post');

    const ageMs = Date.now() - new Date(post.createdAt!).getTime();
    if (ageMs > 15 * 60 * 1000) throw new AppError(403, 'EDIT_WINDOW_EXPIRED', 'Posts can only be edited within 15 minutes');

    await db.update(posts).set({ content, editedAt: new Date() }).where(eq(posts.id, id));
    return reply.send(await fetchPostWithQuote(id));
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
    const [postRow] = await db.select({ userId: posts.userId }).from(posts).where(eq(posts.id, postId));
    if (postRow) await createNotification({ userId: postRow.userId, actorId: userId, type: 'like', postId });
    return reply.send({ liked: true });
  });

  // ── Poll ──────────────────────────────────────────────────────────────────

  // Get poll results
  app.get('/posts/:id/poll', async (req, reply) => {
    const { id: postId } = req.params as { id: string };

    let callerId: string | undefined;
    try { await req.jwtVerify(); callerId = (req.user as any).id; } catch {}

    const [post] = await db.select().from(posts).where(eq(posts.id, postId));
    if (!post) throw new AppError(404, 'NOT_FOUND', 'Post not found');
    if (post.type !== 'poll') throw new AppError(400, 'NOT_A_POLL', 'This post is not a poll');

    const options = await db
      .select()
      .from(pollOptions)
      .where(eq(pollOptions.postId, postId))
      .orderBy(pollOptions.position);

    const totalVotes = options.reduce((sum, o) => sum + (o.voteCount ?? 0), 0);

    // Get caller's own votes (always, regardless of anonymous mode)
    let myVotedOptionIds: string[] = [];
    if (callerId) {
      const myVotes = await db
        .select({ pollOptionId: pollVotes.pollOptionId })
        .from(pollVotes)
        .where(and(eq(pollVotes.postId, postId), eq(pollVotes.userId, callerId)));
      myVotedOptionIds = myVotes.map(v => v.pollOptionId);
    }

    // For public polls, fetch voters per option
    let votersByOption: Record<string, Array<{ id: string; username: string; avatar: string | null }>> = {};
    if (!post.pollIsAnonymous) {
      for (const opt of options) {
        const voters = await db
          .select({ id: users.id, username: users.username, avatar: users.avatar })
          .from(pollVotes)
          .innerJoin(users, eq(pollVotes.userId, users.id))
          .where(eq(pollVotes.pollOptionId, opt.id))
          .limit(20);
        votersByOption[opt.id] = voters;
      }
    }

    return reply.send({
      postId,
      isAnonymous: !!post.pollIsAnonymous,
      allowMultiple: !!post.pollAllowMultiple,
      totalVotes,
      options: options.map(o => ({
        ...o,
        myVote: myVotedOptionIds.includes(o.id),
        voters: post.pollIsAnonymous ? undefined : votersByOption[o.id],
      })),
    });
  });

  // Vote on a poll
  app.post('/posts/:id/vote', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const { id: postId } = req.params as { id: string };
    const { optionId } = z.object({ optionId: z.string() }).parse(req.body);

    const [post] = await db.select().from(posts).where(eq(posts.id, postId));
    if (!post) throw new AppError(404, 'NOT_FOUND', 'Post not found');
    if (post.type !== 'poll') throw new AppError(400, 'NOT_A_POLL', 'This post is not a poll');

    const [option] = await db
      .select()
      .from(pollOptions)
      .where(and(eq(pollOptions.id, optionId), eq(pollOptions.postId, postId)));
    if (!option) throw new AppError(404, 'NOT_FOUND', 'Poll option not found');

    if (!post.pollAllowMultiple) {
      // Single choice — reject if user has already voted on any option for this post
      const [existingVote] = await db
        .select()
        .from(pollVotes)
        .where(and(eq(pollVotes.postId, postId), eq(pollVotes.userId, userId)));
      if (existingVote) throw new AppError(409, 'ALREADY_VOTED', 'You have already voted on this poll');
    } else {
      // Multiple choice — reject if user already voted for this specific option
      const [existingVote] = await db
        .select()
        .from(pollVotes)
        .where(and(eq(pollVotes.pollOptionId, optionId), eq(pollVotes.userId, userId)));
      if (existingVote) throw new AppError(409, 'ALREADY_VOTED', 'You have already voted for this option');
    }

    await db.insert(pollVotes).values({ id: randomUUID(), postId, pollOptionId: optionId, userId });
    await db.update(pollOptions).set({ voteCount: sql`vote_count + 1` }).where(eq(pollOptions.id, optionId));

    return reply.status(201).send({ ok: true, optionId });
  });

  // ── Collab Applications ────────────────────────────────────────────────────

  // Apply to a collab post
  app.post('/posts/:id/apply', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const { id: postId } = req.params as { id: string };
    const { message } = z.object({ message: z.string().min(1).max(2000) }).parse(req.body);

    const [post] = await db.select().from(posts).where(eq(posts.id, postId));
    if (!post) throw new AppError(404, 'NOT_FOUND', 'Post not found');
    if (post.type !== 'collab_request') throw new AppError(400, 'NOT_COLLAB', 'This post is not a collab request');
    if (post.userId === userId) throw new AppError(400, 'OWN_POST', 'You cannot apply to your own post');

    const [existing] = await db
      .select()
      .from(collabApplications)
      .where(and(eq(collabApplications.postId, postId), eq(collabApplications.applicantId, userId)));
    if (existing) throw new AppError(409, 'ALREADY_APPLIED', 'You have already applied to this post');

    const id = randomUUID();
    await db.insert(collabApplications).values({ id, postId, applicantId: userId, message });

    await createNotification({ userId: post.userId, actorId: userId, type: 'collab_apply', postId });

    return reply.status(201).send({ id, postId, message, status: 'pending' });
  });

  // Get applications for a post (post owner only)
  app.get('/posts/:id/applications', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const { id: postId } = req.params as { id: string };

    const [post] = await db.select().from(posts).where(eq(posts.id, postId));
    if (!post) throw new AppError(404, 'NOT_FOUND', 'Post not found');
    if (post.userId !== userId) throw new AppError(403, 'FORBIDDEN', 'Not your post');

    const applications = await db
      .select({
        application: collabApplications,
        applicant: { id: users.id, username: users.username, displayName: users.displayName, avatar: users.avatar },
      })
      .from(collabApplications)
      .leftJoin(users, eq(collabApplications.applicantId, users.id))
      .where(eq(collabApplications.postId, postId))
      .orderBy(desc(collabApplications.createdAt));

    return reply.send({ applications });
  });

  // Accept or reject an application
  app.patch('/posts/:id/applications/:appId', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const { id: postId, appId } = req.params as { id: string; appId: string };
    const { status } = z.object({ status: z.enum(['accepted', 'rejected']) }).parse(req.body);

    const [post] = await db.select().from(posts).where(eq(posts.id, postId));
    if (!post) throw new AppError(404, 'NOT_FOUND', 'Post not found');
    if (post.userId !== userId) throw new AppError(403, 'FORBIDDEN', 'Not your post');

    const [app_] = await db.select().from(collabApplications).where(eq(collabApplications.id, appId));
    if (!app_) throw new AppError(404, 'NOT_FOUND', 'Application not found');

    await db.update(collabApplications).set({ status }).where(eq(collabApplications.id, appId));

    if (status === 'accepted') {
      await createNotification({ userId: app_.applicantId, actorId: userId, type: 'collab_apply', postId });
    }

    return reply.send({ ok: true, status });
  });

  // ── Questions — Accept Answer ──────────────────────────────────────────────

  app.post('/posts/:id/comments/:commentId/accept', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const { id: postId, commentId } = req.params as { id: string; commentId: string };

    const [post] = await db.select().from(posts).where(eq(posts.id, postId));
    if (!post) throw new AppError(404, 'NOT_FOUND', 'Post not found');
    if (post.type !== 'question') throw new AppError(400, 'NOT_QUESTION', 'This post is not a question');
    if (post.userId !== userId) throw new AppError(403, 'FORBIDDEN', 'Only the question author can accept an answer');

    const [comment] = await db.select().from(postComments).where(eq(postComments.id, commentId));
    if (!comment) throw new AppError(404, 'NOT_FOUND', 'Comment not found');

    await db.update(posts).set({ acceptedAnswerId: commentId }).where(eq(posts.id, postId));

    await createNotification({ userId: comment.userId, actorId: userId, type: 'answer_accepted', postId, commentId });

    return reply.send({ ok: true, acceptedAnswerId: commentId });
  });

  app.delete('/posts/:id/accept', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const { id: postId } = req.params as { id: string };

    const [post] = await db.select().from(posts).where(eq(posts.id, postId));
    if (!post) throw new AppError(404, 'NOT_FOUND', 'Post not found');
    if (post.userId !== userId) throw new AppError(403, 'FORBIDDEN', 'Not your post');

    await db.update(posts).set({ acceptedAnswerId: null }).where(eq(posts.id, postId));
    return reply.send({ ok: true });
  });

  // ── Comments ──────────────────────────────────────────────────────────────

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
    const [postRow] = await db.select({ userId: posts.userId }).from(posts).where(eq(posts.id, postId));
    if (postRow) await createNotification({ userId: postRow.userId, actorId: userId, type: 'comment', postId, commentId: id });
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
    const [postRow] = await db.select({ userId: posts.userId }).from(posts).where(eq(posts.id, postId));
    if (postRow) await createNotification({ userId: postRow.userId, actorId: userId, type: 'reaction', postId });
    return reply.send({ reacted: true, emoji });
  });
}
