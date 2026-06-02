import type { FastifyInstance } from 'fastify';
import { authService } from './auth.service.js';
import { authenticate } from '../../lib/middleware.js';
import { AppError } from '../../lib/errors.js';
import { db } from '../../db/index.js';
import { users } from '../../db/schema/index.js';
import { eq, or } from 'drizzle-orm';
import { randomUUID, randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { sendVerificationEmail, sendPasswordResetEmail } from '../../lib/email.js';

function genToken() { return randomBytes(32).toString('hex'); }

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_-]+$/),
  displayName: z.string().max(100).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const MB_URL = process.env.MEMOBANK_URL ?? 'http://localhost:3000';
const MB_CLIENT_ID = process.env.MEMOBANK_CLIENT_ID ?? 'shiphub';
const MB_CLIENT_SECRET = process.env.MEMOBANK_CLIENT_SECRET ?? 'shiphub-oauth-secret-change-in-production';
const MB_REDIRECT_URI = process.env.MEMOBANK_REDIRECT_URI ?? 'http://localhost:5174/auth/callback/memobank';

async function fetchMemoBankMe(apiKey: string) {
  const res = await fetch('https://api.memobank.online/v1/auth/me', {
    headers: { 'Authorization': `Bearer ${apiKey}`, 'X-Api-Key': apiKey },
  });
  if (!res.ok) throw new AppError(401, 'INVALID_MEMOBANK_KEY', 'Invalid Memo Bank API key');
  const data = await res.json() as any;
  return data.user ?? data;
}

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/register', async (req, reply) => {
    const body = registerSchema.parse(req.body);
    const user = await authService.register(body);

    // Generate & store email verify token, send email (non-blocking)
    const verifyToken = genToken();
    await db.update(users).set({ emailVerifyToken: verifyToken }).where(eq(users.id, user.id));
    sendVerificationEmail(user.email, user.username, verifyToken).catch(() => {});

    const token = app.jwt.sign({ id: user.id, username: user.username });
    return reply.status(201).send({ user: sanitizeUser(user), token });
  });

  app.post('/auth/login', async (req, reply) => {
    const body = loginSchema.parse(req.body);
    const user = await authService.login(body);
    const token = app.jwt.sign({ id: user.id, username: user.username });
    return reply.send({ user: sanitizeUser(user), token });
  });

  app.get('/auth/me', { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = req.user as { id: string };
    const user = await authService.getMe(id);
    return reply.send({ user: sanitizeUser(user) });
  });

  // ── Login / register with Memo Bank API key ───────────────────────────
  app.post('/auth/memobank', async (req, reply) => {
    const { apiKey } = z.object({ apiKey: z.string().min(1) }).parse(req.body);

    // Verify key against Memo Bank
    const mbUser = await fetchMemoBankMe(apiKey);
    const mbUserId = String(mbUser.id);
    const mbEmail = mbUser.email as string;
    const mbUsername = (mbUser.username ?? mbUser.email?.split('@')[0] ?? `mb_${mbUserId.slice(0, 8)}`) as string;
    const mbDisplayName = (mbUser.displayName ?? mbUser.display_name ?? mbUsername) as string;

    // Find existing ShipHub user linked to this Memo Bank account
    let [existing] = await db.select().from(users).where(eq(users.memoBankUserId, mbUserId));

    // Fall back: find by email
    if (!existing) {
      const byEmail = await db.select().from(users).where(eq(users.email, mbEmail));
      existing = byEmail[0];
    }

    if (existing) {
      // Update stored key + Memo Bank fields
      await db.update(users).set({
        memoBankApiKey: apiKey,
        memoBankUserId: mbUserId,
        memoBankUsername: mbUsername,
      }).where(eq(users.id, existing.id));

      const [updated] = await db.select().from(users).where(eq(users.id, existing.id));
      const token = app.jwt.sign({ id: updated.id, username: updated.username });
      return reply.send({ user: sanitizeUser(updated), token });
    }

    // New user — pick a unique username
    let username = mbUsername.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);
    const [taken] = await db.select().from(users).where(eq(users.username, username));
    if (taken) username = `${username}_${randomUUID().slice(0, 6)}`;

    const id = randomUUID();
    await db.insert(users).values({
      id,
      email: mbEmail,
      username,
      displayName: mbDisplayName,
      memoBankApiKey: apiKey,
      memoBankUserId: mbUserId,
      memoBankUsername: mbUsername,
      emailVerified: 1, // MemoBank already verified this email
    });

    const [created] = await db.select().from(users).where(eq(users.id, id));
    const token = app.jwt.sign({ id: created.id, username: created.username });
    return reply.status(201).send({ user: sanitizeUser(created), token, isNew: true });
  });

  // ── Connect Memo Bank to existing account ─────────────────────────────
  app.post('/auth/memobank/connect', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const { apiKey } = z.object({ apiKey: z.string().min(1) }).parse(req.body);

    const mbUser = await fetchMemoBankMe(apiKey);
    const mbUserId = String(mbUser.id);
    const mbUsername = (mbUser.username ?? mbUser.email?.split('@')[0]) as string;

    // Check this Memo Bank account isn't already linked to a different ShipHub user
    const [alreadyLinked] = await db.select().from(users).where(eq(users.memoBankUserId, mbUserId));
    if (alreadyLinked && alreadyLinked.id !== userId) {
      throw new AppError(409, 'ALREADY_LINKED', 'This Memo Bank account is linked to a different ShipHub account');
    }

    await db.update(users).set({
      memoBankApiKey: apiKey,
      memoBankUserId: mbUserId,
      memoBankUsername: mbUsername,
    }).where(eq(users.id, userId));

    return reply.send({ connected: true, memoBankUsername: mbUsername });
  });

  // ── Disconnect Memo Bank ───────────────────────────────────────────────
  app.delete('/auth/memobank/connect', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    await db.update(users).set({
      memoBankApiKey: null,
      memoBankUserId: null,
      memoBankUsername: null,
    }).where(eq(users.id, userId));
    return reply.send({ connected: false });
  });

  // ── OAuth initiation: returns the Memo Bank authorize URL ─────────────────
  app.get('/auth/memobank/url', async (req, reply) => {
    const { state } = req.query as { state?: string };
    const url = new URL(`${MB_URL}/oauth/authorize`);
    url.searchParams.set('client_id', MB_CLIENT_ID);
    url.searchParams.set('redirect_uri', MB_REDIRECT_URI);
    url.searchParams.set('response_type', 'code');
    if (state) url.searchParams.set('state', state);
    return reply.send({ url: url.toString() });
  });

  // ── OAuth callback: exchange code → ShipHub JWT ────────────────────────────
  app.get('/auth/memobank/callback', async (req, reply) => {
    const { code } = req.query as { code?: string };
    if (!code) throw new AppError(400, 'OAUTH_ERROR', 'No authorization code received');

    const tokenRes = await fetch(`${MB_URL}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: MB_REDIRECT_URI,
        client_id: MB_CLIENT_ID,
        client_secret: MB_CLIENT_SECRET,
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.json() as any;
      throw new AppError(400, 'OAUTH_ERROR', err.message ?? 'Memo Bank OAuth failed');
    }

    const { user: mbUser } = await tokenRes.json() as any;
    const mbUserId = String(mbUser.id);
    const mbEmail = mbUser.email as string;
    const mbDisplayName = (mbUser.displayName ?? mbEmail.split('@')[0]) as string;

    let [existing] = await db.select().from(users).where(eq(users.memoBankUserId, mbUserId));
    if (!existing) {
      const [byEmail] = await db.select().from(users).where(eq(users.email, mbEmail));
      existing = byEmail;
    }

    if (existing) {
      await db.update(users).set({ memoBankUserId: mbUserId }).where(eq(users.id, existing.id));
      const [updated] = await db.select().from(users).where(eq(users.id, existing.id));
      const token = app.jwt.sign({ id: updated.id, username: updated.username });
      return reply.send({ user: sanitizeUser(updated), token });
    }

    let username = mbEmail.split('@')[0].replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);
    const [taken] = await db.select().from(users).where(eq(users.username, username));
    if (taken) username = `${username}_${randomUUID().slice(0, 6)}`;

    const id = randomUUID();
    await db.insert(users).values({ id, email: mbEmail, username, displayName: mbDisplayName, memoBankUserId: mbUserId, emailVerified: 1 });
    const [created] = await db.select().from(users).where(eq(users.id, id));
    const token = app.jwt.sign({ id: created.id, username: created.username });
    return reply.send({ user: sanitizeUser(created), token, isNew: true });
  });

  // ── Verify email ─────────────────────────────────────────────────────────
  app.get('/auth/verify-email', async (req, reply) => {
    const { token } = req.query as { token?: string };
    if (!token) throw new AppError(400, 'BAD_REQUEST', 'Token required');

    const [user] = await db.select().from(users).where(eq(users.emailVerifyToken, token));
    if (!user) throw new AppError(400, 'INVALID_TOKEN', 'Invalid or expired verification link');

    await db.update(users)
      .set({ emailVerified: 1, emailVerifyToken: null })
      .where(eq(users.id, user.id));

    return reply.send({ verified: true, username: user.username });
  });

  // ── Resend verification email ─────────────────────────────────────────────
  app.post('/auth/resend-verification', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found');
    if (user.emailVerified) return reply.send({ sent: false, message: 'Already verified' });

    const verifyToken = genToken();
    await db.update(users).set({ emailVerifyToken: verifyToken }).where(eq(users.id, userId));
    sendVerificationEmail(user.email, user.username, verifyToken).catch(() => {});
    return reply.send({ sent: true });
  });

  // ── Forgot password ───────────────────────────────────────────────────────
  app.post('/auth/forgot-password', async (req, reply) => {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    const [user] = await db.select().from(users).where(eq(users.email, email));

    // Always return 200 to avoid user enumeration
    if (user && user.passwordHash) {
      const resetToken = genToken();
      const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await db.update(users)
        .set({ resetToken, resetTokenExpires: expires })
        .where(eq(users.id, user.id));
      sendPasswordResetEmail(user.email, user.username, resetToken).catch(() => {});
    }

    return reply.send({ sent: true });
  });

  // ── Reset password ────────────────────────────────────────────────────────
  app.post('/auth/reset-password', async (req, reply) => {
    const { token, password } = z.object({
      token: z.string(),
      password: z.string().min(8),
    }).parse(req.body);

    const [user] = await db.select().from(users).where(eq(users.resetToken, token));
    if (!user || !user.resetTokenExpires) throw new AppError(400, 'INVALID_TOKEN', 'Invalid or expired reset link');
    if (new Date() > new Date(user.resetTokenExpires)) throw new AppError(400, 'TOKEN_EXPIRED', 'Reset link has expired — request a new one');

    const passwordHash = await bcrypt.hash(password, 10);
    await db.update(users)
      .set({ passwordHash, resetToken: null, resetTokenExpires: null })
      .where(eq(users.id, user.id));

    return reply.send({ reset: true });
  });
}

function sanitizeUser(user: any) {
  const { passwordHash, memoBankApiKey, emailVerifyToken, resetToken, resetTokenExpires, ...safe } = user;
  return safe;
}
