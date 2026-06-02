import 'dotenv/config';
import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyCors from '@fastify/cors';
import fastifyCookie from '@fastify/cookie';
import { authRoutes } from './modules/auth/auth.routes.js';
import { memoriesRoutes } from './modules/memories/memories.routes.js';
import { usersRoutes } from './modules/users/users.routes.js';
import { commentsRoutes } from './modules/comments/comments.routes.js';
import { projectsRoutes } from './modules/projects/projects.routes.js';
import { eventsRoutes } from './modules/events/events.routes.js';
import { graphRoutes } from './modules/graph/graph.routes.js';
import { importExportRoutes } from './modules/import-export/import-export.routes.js';
import { notificationsRoutes } from './modules/notifications/notifications.routes.js';
import { searchRoutes } from './modules/search/search.routes.js';
import { postsRoutes } from './modules/posts/posts.routes.js';
import { feedRoutes } from './modules/feed/feed.routes.js';
import { packsRoutes } from './modules/packs/packs.routes.js';
import { messagesRoutes } from './modules/messages/messages.routes.js';
import { adminRoutes } from './modules/admin/admin.routes.js';
import { AppError } from './lib/errors.js';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { createWriteStream, mkdirSync } from 'fs';
import { pipeline } from 'stream/promises';
import { randomUUID } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
mkdirSync(UPLOADS_DIR, { recursive: true });

const app = Fastify({ logger: true });

// Plugins
await app.register(fastifyCors, {
  origin: process.env.CORS_ORIGIN ?? process.env.FRONTEND_URL ?? 'http://localhost:5174',
  credentials: true,
});

await app.register(fastifyJwt, {
  secret: process.env.JWT_SECRET!,
});

await app.register(fastifyCookie);

// Rate limiting — global 200 req/min per IP
await app.register(fastifyRateLimit, {
  global: true,
  max: 200,
  timeWindow: '1 minute',
  errorResponseBuilder: () => ({
    error: 'RATE_LIMITED',
    message: 'Too many requests — slow down.',
  }),
});

// File uploads — 5MB max (enforced per-field in the upload route)
await app.register(fastifyMultipart, { limits: { fileSize: 5 * 1024 * 1024 } });

// Serve uploaded files
await app.register(fastifyStatic, { root: UPLOADS_DIR, prefix: '/uploads/' });

// Routes
const prefix = '/v1';
await app.register(async (instance) => {
  await instance.register(authRoutes);
  await instance.register(memoriesRoutes);
  await instance.register(usersRoutes);
  await instance.register(commentsRoutes);
  await instance.register(projectsRoutes);
  await instance.register(eventsRoutes);
  await instance.register(graphRoutes);
  await instance.register(importExportRoutes);
  await instance.register(notificationsRoutes);
  await instance.register(searchRoutes);
  await instance.register(postsRoutes);
  await instance.register(feedRoutes);
  await instance.register(packsRoutes);
  await instance.register(messagesRoutes);
  await instance.register(adminRoutes);
}, { prefix });

// Error handler
app.setErrorHandler((error, req, reply) => {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({ error: error.code, message: error.message });
  }
  if (error instanceof Error && error.name === 'ZodError') {
    return reply.status(400).send({ error: 'VALIDATION_ERROR', message: 'Invalid request data', details: error.message });
  }
  app.log.error(error);
  return reply.status(500).send({ error: 'INTERNAL_ERROR', message: 'Something went wrong' });
});

// Health check
app.get('/health', async () => ({ status: 'ok', app: 'ShipHub API' }));

// File upload endpoint
app.post('/v1/upload', async (req, reply) => {
  try { await req.jwtVerify(); } catch { return reply.status(401).send({ error: 'UNAUTHORIZED' }); }

  const data = await req.file();
  if (!data) return reply.status(400).send({ error: 'NO_FILE', message: 'No file provided' });

  const mime = data.mimetype;
  const isImage = mime.startsWith('image/');
  const isVideo = mime.startsWith('video/');

  if (!isImage && !isVideo) {
    return reply.status(400).send({ error: 'INVALID_TYPE', message: 'Only images and videos are supported' });
  }

  // Size limits: image 2MB, video 5MB
  const maxBytes = isImage ? 2 * 1024 * 1024 : 5 * 1024 * 1024;
  const ext = mime.split('/')[1].replace('jpeg', 'jpg').split(';')[0];
  const filename = `${randomUUID()}.${ext}`;
  const dest = path.join(UPLOADS_DIR, filename);

  let size = 0;
  const chunks: Buffer[] = [];

  for await (const chunk of data.file) {
    size += chunk.length;
    if (size > maxBytes) {
      return reply.status(413).send({
        error: 'FILE_TOO_LARGE',
        message: isImage ? 'Images must be under 2MB' : 'Videos must be under 5MB',
      });
    }
    chunks.push(chunk);
  }

  await pipeline(
    (async function* () { for (const c of chunks) yield c; })(),
    createWriteStream(dest)
  );

  const baseUrl = process.env.API_BASE_URL ?? `http://localhost:${process.env.PORT ?? 4000}`;
  return reply.send({
    url: `${baseUrl}/uploads/${filename}`,
    mediaType: isImage ? 'image' : 'video',
    filename,
  });
});

const port = Number(process.env.PORT ?? 4000);
await app.listen({ port, host: '0.0.0.0' });
console.log(`ShipHub API running on port ${port}`);
