import { db } from '../../db/index.js';
import { users } from '../../db/schema/index.js';
import { eq } from 'drizzle-orm';

export const authRepository = {
  async findByEmail(email: string) {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user ?? null;
  },

  async findByUsername(username: string) {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user ?? null;
  },

  async findById(id: string) {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user ?? null;
  },

  async create(data: typeof users.$inferInsert) {
    await db.insert(users).values(data);
    return this.findById(data.id!);
  },
};
