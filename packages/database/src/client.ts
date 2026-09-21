import { Prisma, PrismaClient } from '@prisma/client';
import { runtimeDatabaseUrl } from './runtime-database-url';

export { Prisma };
export type { PrismaClient };

const globalPrisma = globalThis as unknown as { bunshinPrisma?: PrismaClient };
const databaseUrl = runtimeDatabaseUrl(process.env['DATABASE_URL']);

export const prisma =
  globalPrisma.bunshinPrisma ??
  new PrismaClient({
    log: ['warn', 'error'],
    ...(databaseUrl ? { datasources: { db: { url: databaseUrl } } } : {}),
  });

if (process.env['NODE_ENV'] !== 'production') globalPrisma.bunshinPrisma = prisma;
