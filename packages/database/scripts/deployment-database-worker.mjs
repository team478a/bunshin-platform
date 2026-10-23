import { PrismaClient } from '@prisma/client';
import {
  deploymentDatabaseUrl,
  gateFailureLabel,
  readMigrationManifest,
  verifyDeploymentDatabase,
} from './deployment-database-gate.mjs';

let client;
try {
  const connection = deploymentDatabaseUrl(process.env.DATABASE_URL);
  const manifest = await readMigrationManifest();
  client = new PrismaClient({ datasources: { db: { url: connection } } });
  const result = await verifyDeploymentDatabase(client, manifest);
  await client.$disconnect();
  client = undefined;
  console.log(
    `[database] Read-only deployment verification passed: migrations=${result.migrations}; tables=${result.tables}; enumValues=${result.enums}.`,
  );
  console.log('Database schema readiness gate passed.');
} catch (error) {
  console.error(`[database] DEPLOYMENT_GATE_FAILED (${gateFailureLabel(error)}).`);
  process.exitCode = 1;
} finally {
  if (client) {
    try {
      await client.$disconnect();
    } catch {
      process.exitCode = 1;
    }
  }
}
