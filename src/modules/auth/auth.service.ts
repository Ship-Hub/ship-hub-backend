import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { authRepository } from './auth.repository.js';
import { AppError } from '../../lib/errors.js';

export const authService = {
  async register(data: { email: string; password: string; username: string; displayName?: string }) {
    const existingEmail = await authRepository.findByEmail(data.email);
    if (existingEmail) throw new AppError(409, 'EMAIL_TAKEN', 'Email already in use');

    const existingUsername = await authRepository.findByUsername(data.username);
    if (existingUsername) throw new AppError(409, 'USERNAME_TAKEN', 'Username already taken');

    const passwordHash = await bcrypt.hash(data.password, 10);
    const id = randomUUID();

    const user = await authRepository.create({
      id,
      email: data.email,
      passwordHash,
      username: data.username,
      displayName: data.displayName ?? data.username,
    });

    return user!;
  },

  async login(data: { email: string; password: string }) {
    const user = await authRepository.findByEmail(data.email);
    if (!user || !user.passwordHash) throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');

    const valid = await bcrypt.compare(data.password, user.passwordHash);
    if (!valid) throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');

    if (user.banned) throw new AppError(403, 'BANNED', 'Your account has been suspended.');

    return user;
  },

  async getMe(id: string) {
    const user = await authRepository.findById(id);
    if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found');
    if (user.banned) throw new AppError(403, 'BANNED', 'Your account has been suspended.');
    return user;
  },

};
