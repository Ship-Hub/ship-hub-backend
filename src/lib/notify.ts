import { EventEmitter } from 'events';
import { db } from '../db/index.js';
import { notifications, users } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export type NotifType = 'fork' | 'follow' | 'comment' | 'like' | 'mention' | 'reaction' | 'quote';

interface NotifPayload {
  userId: string;
  actorId: string;
  type: NotifType;
  memoryId?: string;
  projectId?: string;
  commentId?: string;
  postId?: string;
}

// Global emitter — SSE clients subscribe per userId
export const notifEmitter = new EventEmitter();
notifEmitter.setMaxListeners(500);

export async function createNotification(payload: NotifPayload) {
  if (payload.userId === payload.actorId) return;
  try {
    const id = randomUUID();
    await db.insert(notifications).values({ id, ...payload });

    // Fetch actor snippet for SSE push
    const [actor] = await db
      .select({ id: users.id, username: users.username, displayName: users.displayName, avatar: users.avatar })
      .from(users)
      .where(eq(users.id, payload.actorId));

    notifEmitter.emit(`notify:${payload.userId}`, {
      notification: { id, ...payload, read: 0, createdAt: new Date().toISOString() },
      actor,
    });
  } catch {
    // Non-fatal
  }
}

// Parse @mentions from content, create notifications for each mentioned user
export async function notifyMentions(content: string, actorId: string, context: { postId?: string; memoryId?: string; commentId?: string }) {
  try {
    const matches = [...new Set(content.match(/@([a-zA-Z0-9_-]+)/g) ?? [])];
    for (const match of matches) {
      const username = match.slice(1);
      const [mentioned] = await db.select({ id: users.id }).from(users).where(eq(users.username, username));
      if (mentioned) {
        await createNotification({ userId: mentioned.id, actorId, type: 'mention', ...context });
      }
    }
  } catch {
    // Non-fatal
  }
}
