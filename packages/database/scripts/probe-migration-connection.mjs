import { runMigrationConnectionProbe } from './deploy-migrations-for-vercel.mjs';

// Separate entrypoint: never calls migrate deploy, even when the probe succeeds.
process.exitCode = await runMigrationConnectionProbe();
