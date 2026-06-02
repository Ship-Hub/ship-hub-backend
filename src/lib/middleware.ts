import type { FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from './errors.js';

export async function authenticate(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify();
  } catch {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  }
}
