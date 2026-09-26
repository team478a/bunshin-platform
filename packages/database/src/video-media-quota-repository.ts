import type { PrismaClient } from './client';
import { prisma } from './client';
import { reserveVideoMedia } from './video-media-quota';

export class PrismaVideoMediaQuotaRepository {
  constructor(private readonly client: PrismaClient = prisma) {}
  async reserve(input: Parameters<typeof reserveVideoMedia>[1]) {
    await this.client.$transaction((tx) => reserveVideoMedia(tx, input));
  }
}
