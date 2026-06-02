import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { memories, users } from '../../db/schema/index.js';
import { eq, and, inArray } from 'drizzle-orm';
import { authenticate } from '../../lib/middleware.js';
import { AppError } from '../../lib/errors.js';
import { randomUUID } from 'crypto';
import { z } from 'zod';

async function resolveMemoBankKey(req: any): Promise<string | null> {
  try {
    await req.jwtVerify();
    const { id: userId } = req.user as { id: string };
    const [user] = await db.select({ memoBankApiKey: users.memoBankApiKey }).from(users).where(eq(users.id, userId));
    return user?.memoBankApiKey ?? null;
  } catch {
    return null;
  }
}

// ── Memo Bank type → ShipHub category mapping ────────────────────────────
const MB_TYPE_MAP: Record<string, string> = {
  fact: 'template',
  decision: 'architecture',
  bug: 'workflow',
  task: 'workflow',
  pattern: 'prompt',
};

const VALID_CATEGORIES = ['prompt','workflow','architecture','template','tutorial','agent_setup','mcp','deployment','productivity'];

function deriveTitleFromContent(content: string): string {
  const firstLine = content.split('\n')[0].trim();
  if (firstLine.length > 10) return firstLine.slice(0, 80);
  return content.slice(0, 80).replace(/\n/g, ' ');
}

function memoryToMarkdown(memory: any): string {
  const tags = Array.isArray(memory.tags) ? memory.tags.join(', ') : '';
  return [
    `# ${memory.title}`,
    '',
    `**Category:** ${memory.category}`,
    tags ? `**Tags:** ${tags}` : '',
    `**Created:** ${memory.createdAt}`,
    '',
    '---',
    '',
    memory.content,
  ].filter(l => l !== null).join('\n');
}

function memoriesToCSV(mems: any[]): string {
  const header = 'id,title,category,tags,visibility,forks,likes,created_at';
  const rows = mems.map(m => [
    m.id,
    `"${(m.title ?? '').replace(/"/g, '""')}"`,
    m.category,
    `"${(Array.isArray(m.tags) ? m.tags.join(';') : '')}"`,
    m.visibility,
    m.forkCount,
    m.likeCount,
    m.createdAt,
  ].join(','));
  return [header, ...rows].join('\n');
}

export async function importExportRoutes(app: FastifyInstance) {

  // ── Memo Bank connection status ────────────────────────────────────────
  app.get('/import/memobank/status', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const [user] = await db.select({
      memoBankUserId: users.memoBankUserId,
      memoBankUsername: users.memoBankUsername,
    }).from(users).where(eq(users.id, userId));
    return reply.send({
      connected: !!user?.memoBankUserId,
      memoBankUsername: user?.memoBankUsername ?? null,
    });
  });

  // ── EXPORT: single memory as markdown ──────────────────────────────────
  app.get('/memories/:id/export', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { format = 'json' } = req.query as { format?: string };

    const [row] = await db.select().from(memories).where(eq(memories.id, id));
    if (!row) throw new AppError(404, 'NOT_FOUND', 'Memory not found');
    if (row.visibility !== 'public') {
      // allow owner to export private
      try {
        await req.jwtVerify();
        const { id: userId } = req.user as { id: string };
        if (row.userId !== userId) throw new AppError(403, 'FORBIDDEN', 'Cannot export private memory');
      } catch {
        throw new AppError(403, 'FORBIDDEN', 'Cannot export private memory');
      }
    }

    const slug = row.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);

    if (format === 'markdown' || format === 'md') {
      reply.header('Content-Type', 'text/markdown; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="${slug}.md"`);
      return reply.send(memoryToMarkdown(row));
    }

    // default JSON
    reply.header('Content-Type', 'application/json');
    reply.header('Content-Disposition', `attachment; filename="${slug}.json"`);
    return reply.send(JSON.stringify({ version: '1.0', source: 'shiphub', memory: row }, null, 2));
  });

  // ── EXPORT: bulk export for current user ───────────────────────────────
  app.get('/memories/export/bulk', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const { format = 'json', ids } = req.query as { format?: string; ids?: string };

    let query = db.select().from(memories).where(eq(memories.userId, userId));
    const userMemories = await query;

    const filtered = ids
      ? userMemories.filter(m => ids.split(',').includes(m.id))
      : userMemories;

    if (format === 'csv') {
      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', 'attachment; filename="shiphub-memories.csv"');
      return reply.send(memoriesToCSV(filtered));
    }

    if (format === 'markdown' || format === 'md') {
      reply.header('Content-Type', 'text/markdown; charset=utf-8');
      reply.header('Content-Disposition', 'attachment; filename="shiphub-memories.md"');
      return reply.send(filtered.map(memoryToMarkdown).join('\n\n---\n\n'));
    }

    // JSON (default)
    reply.header('Content-Type', 'application/json');
    reply.header('Content-Disposition', 'attachment; filename="shiphub-memories.json"');
    return reply.send(JSON.stringify({
      version: '1.0',
      source: 'shiphub',
      exportedAt: new Date().toISOString(),
      count: filtered.length,
      memories: filtered,
    }, null, 2));
  });

  // ── IMPORT: fetch projects from Memo Bank ──────────────────────────────
  app.post('/import/memobank/projects', { preHandler: [authenticate] }, async (req, reply) => {
    const body = z.object({ apiKey: z.string().optional() }).parse(req.body);
    const storedKey = await resolveMemoBankKey(req);
    const apiKey = body.apiKey ?? storedKey;
    if (!apiKey) throw new AppError(400, 'NO_MEMOBANK_KEY', 'Memo Bank API key required');

    const res = await fetch('https://api.memobank.online/v1/projects', {
      headers: { 'X-Api-Key': apiKey },
    });
    if (!res.ok) throw new AppError(res.status === 401 ? 401 : 400, 'MEMOBANK_ERROR', `Memo Bank error: ${res.statusText}`);

    const data = await res.json() as any;
    return reply.send({ projects: data.projects ?? data, usingStoredKey: !body.apiKey && !!storedKey });
  });

  // ── IMPORT: fetch memories from a Memo Bank project ────────────────────
  app.post('/import/memobank/memories', { preHandler: [authenticate] }, async (req, reply) => {
    const body = z.object({
      apiKey: z.string().optional(),
      projectId: z.string().min(1),
    }).parse(req.body);

    const storedKey = await resolveMemoBankKey(req);
    const apiKey = body.apiKey ?? storedKey;
    if (!apiKey) throw new AppError(400, 'NO_MEMOBANK_KEY', 'Memo Bank API key required');

    const res = await fetch(`https://api.memobank.online/v1/memories?projectId=${body.projectId}&limit=200`, {
      headers: { 'X-Api-Key': apiKey },
    });
    if (!res.ok) throw new AppError(400, 'MEMOBANK_ERROR', `Memo Bank error: ${res.statusText}`);

    const data = await res.json() as any;
    const mbMemories = (data.memories ?? data).filter((m: any) => m.status === 'approved' || !m.status);

    const preview = mbMemories.map((m: any) => ({
      mbId: m.id,
      mbType: m.type,
      title: deriveTitleFromContent(m.content),
      content: m.content,
      category: MB_TYPE_MAP[m.type] ?? 'template',
      tags: m.tags ?? [],
      confidence: m.confidence,
      source: m.source,
    }));

    return reply.send({ memories: preview });
  });

  // ── IMPORT: actually import selected memories into ShipHub ──────────────
  const importSchema = z.object({
    memories: z.array(z.object({
      title: z.string().min(1).max(255),
      content: z.string().min(1),
      category: z.string(),
      tags: z.array(z.string()).optional(),
      visibility: z.enum(['public', 'private']).optional(),
    })).min(1).max(200),
  });

  app.post('/import/memories', { preHandler: [authenticate] }, async (req, reply) => {
    const { id: userId } = req.user as { id: string };
    const { memories: toImport } = importSchema.parse(req.body);

    const created = [];
    for (const m of toImport) {
      const id = randomUUID();
      const category = VALID_CATEGORIES.includes(m.category) ? m.category : 'template';
      await db.insert(memories).values({
        id,
        userId,
        title: m.title,
        content: m.content,
        category: category as any,
        tags: m.tags ?? [],
        visibility: m.visibility ?? 'public',
      });
      created.push(id);
    }

    return reply.status(201).send({
      imported: created.length,
      ids: created,
    });
  });
}
