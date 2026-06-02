import { randomUUID } from 'crypto';
import { memoriesRepository } from './memories.repository.js';
import { AppError } from '../../lib/errors.js';
import { createNotification } from '../../lib/notify.js';
import type { memories } from '../../db/schema/index.js';

type MemoryCategory = typeof memories.$inferInsert['category'];

export const memoriesService = {
  async getFeed(limit = 20, offset = 0) {
    return memoriesRepository.findAll(limit, offset);
  },

  async getById(id: string) {
    const row = await memoriesRepository.findById(id);
    if (!row) throw new AppError(404, 'NOT_FOUND', 'Memory not found');
    return row;
  },

  async getByUser(userId: string, requesterId?: string) {
    return memoriesRepository.findByUser(userId, requesterId);
  },

  async create(userId: string, data: {
    title: string;
    content: string;
    category: string;
    tags?: string[];
    visibility?: 'public' | 'private';
  }) {
    const id = randomUUID();
    return memoriesRepository.create({
      id,
      userId,
      title: data.title,
      content: data.content,
      category: data.category as any,
      tags: data.tags ?? [],
      visibility: data.visibility ?? 'public',
    });
  },

  async fork(userId: string, memoryId: string) {
    const { memory } = await this.getById(memoryId);
    if (memory.visibility !== 'public') throw new AppError(403, 'FORBIDDEN', 'Cannot fork a private memory');
    if (memory.userId === userId) throw new AppError(400, 'BAD_REQUEST', 'Cannot fork your own memory');

    // Always attribute back to the root original
    const originalMemoryId = memory.originalMemoryId ?? memory.id;
    const originalUserId = memory.originalUserId ?? memory.userId;

    const id = randomUUID();
    const forked = await memoriesRepository.create({
      id,
      userId,
      title: `${memory.title} (fork)`,
      content: memory.content,
      category: memory.category,
      tags: memory.tags ?? [],
      visibility: 'public',
      forkedFromId: memory.id,
      forkedFromUserId: memory.userId,
      originalMemoryId,
      originalUserId,
    });

    await memoriesRepository.incrementForkCount(memoryId);
    if (originalMemoryId !== memoryId) {
      await memoriesRepository.incrementForkCount(originalMemoryId);
    }
    // Notify original memory owner
    await createNotification({ userId: memory.userId, actorId: userId, type: 'fork', memoryId: memory.id });
    return forked;
  },

  async update(userId: string, memoryId: string, data: {
    title?: string;
    content?: string;
    category?: MemoryCategory;
    tags?: string[];
    visibility?: 'public' | 'private';
  }) {
    const { memory } = await this.getById(memoryId);
    if (memory.userId !== userId) throw new AppError(403, 'FORBIDDEN', 'Not your memory');
    return memoriesRepository.update(memoryId, data);
  },

  async delete(userId: string, memoryId: string) {
    const { memory } = await this.getById(memoryId);
    if (memory.userId !== userId) throw new AppError(403, 'FORBIDDEN', 'Not your memory');
    await memoriesRepository.delete(memoryId);
  },

  async toggleLike(userId: string, memoryId: string) {
    const { memory } = await this.getById(memoryId);
    const hasLiked = await memoriesRepository.hasLiked(userId, memoryId);
    if (hasLiked) {
      await memoriesRepository.unlike(userId, memoryId);
      return { liked: false };
    } else {
      await memoriesRepository.like(userId, memoryId);
      await createNotification({ userId: memory.userId, actorId: userId, type: 'like', memoryId });
      return { liked: true };
    }
  },

  async toggleSave(userId: string, memoryId: string) {
    await this.getById(memoryId);
    const hasSaved = await memoriesRepository.hasSaved(userId, memoryId);
    if (hasSaved) {
      await memoriesRepository.unsave(userId, memoryId);
      return { saved: false };
    } else {
      await memoriesRepository.save(userId, memoryId);
      return { saved: true };
    }
  },

  async getSaved(userId: string) {
    return memoriesRepository.getSaved(userId);
  },
};
