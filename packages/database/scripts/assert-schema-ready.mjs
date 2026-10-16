import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { runtimeDatabaseUrl } from '../src/runtime-database-url.ts';

const packageDirectory = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationDirectory = join(packageDirectory, 'prisma', 'migrations');
const migrations = (await readdir(migrationDirectory, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && /^\d+_/.test(entry.name))
  .map((entry) => entry.name)
  .sort();
const latestMigration = migrations.at(-1);
if (!latestMigration) throw new Error('No database migrations were found.');

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error('DATABASE_URL is required for the schema readiness gate.');

// The schema gate runs against the same pooled DATABASE_URL as serverless runtime.
// Supabase transaction poolers require Prisma's prepared statements to be disabled.
const client = new PrismaClient({
  datasources: { db: { url: runtimeDatabaseUrl(databaseUrl) ?? databaseUrl } },
});
try {
  const rows = await client.$queryRawUnsafe(
    `SELECT EXISTS (
       SELECT 1
       FROM "_prisma_migrations"
       WHERE "migration_name" = $1
         AND "finished_at" IS NOT NULL
         AND "rolled_back_at" IS NULL
     ) AS "applied"`,
    latestMigration,
  );
  if (rows[0]?.applied !== true) {
    throw new Error(
      'Production deployment blocked: the database is behind the application schema. Run the approved migration workflow first.',
    );
  }
  console.log('Database schema readiness gate passed.');
} finally {
  await client.$disconnect();
}
