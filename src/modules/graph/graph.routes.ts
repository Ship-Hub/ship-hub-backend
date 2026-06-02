import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { memories, users, projects, projectMemories, memoryLikes } from '../../db/schema/index.js';
import { eq, desc, isNotNull } from 'drizzle-orm';

export async function graphRoutes(app: FastifyInstance) {
  // Returns nodes and edges for the knowledge graph
  app.get('/graph', async (req, reply) => {
    const { limit = 50 } = req.query as { limit?: number };
    const lim = Math.min(Number(limit), 100);

    // Nodes: top public memories
    const memoryNodes = await db
      .select()
      .from(memories)
      .where(eq(memories.visibility, 'public'))
      .orderBy(desc(memories.forkCount))
      .limit(lim);

    // Nodes: users who authored these memories
    const userIds = [...new Set(memoryNodes.map(m => m.userId))];
    const userNodes = userIds.length
      ? await db.select({ id: users.id, username: users.username, displayName: users.displayName, avatar: users.avatar, memoryCount: users.memoryCount })
          .from(users)
          .where(eq(users.id, userIds[0])) // simplified - get all below
      : [];

    // Get all relevant users
    const allUsers = await Promise.all(
      userIds.map(id =>
        db.select({ id: users.id, username: users.username, displayName: users.displayName, avatar: users.avatar })
          .from(users).where(eq(users.id, id)).then(r => r[0])
      )
    );

    // Nodes: projects linked to these memories
    const projectLinks = await db
      .select({ projectId: projectMemories.projectId, memoryId: projectMemories.memoryId })
      .from(projectMemories)
      .limit(200);

    const projectIdsInGraph = [...new Set(projectLinks.map(p => p.projectId))];
    const projectNodes = projectIdsInGraph.length
      ? await Promise.all(
          projectIdsInGraph.map(id =>
            db.select().from(projects).where(eq(projects.id, id)).then(r => r[0]).catch(() => null)
          )
        ).then(res => res.filter(Boolean))
      : [];

    // Edges
    const edges: Array<{ source: string; target: string; type: string }> = [];

    // memory → author
    for (const m of memoryNodes) {
      edges.push({ source: m.id, target: m.userId, type: 'authored_by' });
    }

    // fork edges
    for (const m of memoryNodes) {
      if (m.forkedFromId) {
        edges.push({ source: m.id, target: m.forkedFromId, type: 'forked_from' });
      }
      if (m.originalMemoryId && m.originalMemoryId !== m.forkedFromId) {
        edges.push({ source: m.id, target: m.originalMemoryId, type: 'original' });
      }
    }

    // memory → project
    for (const link of projectLinks) {
      const memInGraph = memoryNodes.find(m => m.id === link.memoryId);
      if (memInGraph) {
        edges.push({ source: link.memoryId, target: link.projectId, type: 'in_project' });
      }
    }

    return reply.send({
      nodes: {
        memories: memoryNodes,
        users: allUsers.filter(Boolean),
        projects: projectNodes,
      },
      edges,
    });
  });
}
