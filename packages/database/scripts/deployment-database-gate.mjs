import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { Prisma } from '@prisma/client';
import { runtimeDatabaseUrl } from '../src/runtime-database-url.ts';
import { releaseCaPath } from './release-ca.mjs';

const failures = new Set([
  'configuration-invalid',
  'manifest-invalid',
  'history-missing',
  'history-unexpected',
  'history-checksum-mismatch',
  'history-incomplete',
  'history-duplicate',
  'table-missing',
  'column-missing',
  'enum-missing',
]);
function reject(label) {
  throw new Error(label);
}

/** No exception text or provider output is a public diagnostic. */
export function gateFailureLabel(error) {
  if (error instanceof Error && failures.has(error.message)) return error.message;
  return 'database-check-failed';
}

export async function readMigrationManifest(
  directory = new URL('../prisma/migrations/', import.meta.url),
) {
  const entries = await readdir(directory, { withFileTypes: true });
  const manifest = [];
  for (const entry of entries
    .filter((item) => item.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))) {
    if (!/^\d{14}_[a-z0-9_]+$/.test(entry.name)) reject('manifest-invalid');
    const sql = await readFile(new URL(`${entry.name}/migration.sql`, directory));
    if (!sql.length) reject('manifest-invalid');
    const text = sql.toString('utf8');
    const digest = (value) => createHash('sha256').update(value).digest('hex');
    // Same LF/CRLF-only compatibility as Prisma and the approved release runner.
    manifest.push({
      name: entry.name,
      checksum: digest(sql),
      compatibleChecksums: [
        ...new Set([
          digest(text),
          digest(text.replaceAll('\r\n', '\n')),
          digest(text.replaceAll('\r\n', '\n').replaceAll('\n', '\r\n')),
        ]),
      ],
    });
  }
  if (!manifest.length) reject('manifest-invalid');
  return manifest;
}

/** Generated application's mapped table/column/enum contract, not SQL parsing. */
export function requiredDatabaseShape(datamodel = Prisma.dmmf.datamodel) {
  return {
    tables: datamodel.models.map((model) => ({
      name: model.dbName ?? model.name,
      columns: model.fields
        .filter((field) => field.kind !== 'object')
        .map((field) => field.dbName ?? field.name),
    })),
    enums: datamodel.enums.flatMap((item) =>
      item.values.map((value) => ({
        name: item.dbName ?? item.name,
        value: value.dbName ?? value.name,
      })),
    ),
  };
}

export function deploymentDatabaseUrl(source) {
  let url;
  try {
    url = new URL(source);
  } catch {
    reject('configuration-invalid');
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !url.hostname ||
    !url.username ||
    url.pathname === '/' ||
    !url.pathname ||
    url.hash ||
    [...url.searchParams.keys()].some((key) =>
      ['host', 'port', 'user', 'password', 'dbname', 'options'].includes(key),
    ) ||
    ![null, 'public'].includes(url.searchParams.get('schema'))
  )
    reject('configuration-invalid');
  if (url.hostname.endsWith('.pooler.supabase.com')) {
    if (
      !['5432', '6543'].includes(url.port) ||
      ![null, 'prefer', 'require', 'verify-ca', 'verify-full'].includes(
        url.searchParams.get('sslmode'),
      ) ||
      ![null, 'strict'].includes(url.searchParams.get('sslaccept'))
    )
      reject('configuration-invalid');
    url.searchParams.set('sslmode', 'require');
    url.searchParams.set('sslaccept', 'strict');
    url.searchParams.set('sslcert', releaseCaPath());
  }
  url.searchParams.set('schema', 'public');
  url.searchParams.set('connect_timeout', '10');
  url.searchParams.set('socket_timeout', '15');
  url.searchParams.set('pool_timeout', '10');
  url.searchParams.set('connection_limit', '1');
  url.searchParams.set('application_name', 'bunshin_deployment_readonly_gate');
  return runtimeDatabaseUrl(url.toString());
}

/** SELECT-only inspection, also usable with an isolated integration fixture transaction. */
export async function inspectDeploymentSnapshot(tx, manifest, required) {
  if (
    !manifest.length ||
    new Set(manifest.map((item) => item.name)).size !== manifest.length ||
    manifest.some(
      (item) => !/^\d{14}_[a-z0-9_]+$/.test(item.name) || !/^[a-f0-9]{64}$/.test(item.checksum),
    )
  )
    reject('manifest-invalid');
  const rows = await tx.$queryRawUnsafe(`SELECT migration_name AS name, checksum,
    finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS rolled_back
    FROM "_prisma_migrations" ORDER BY migration_name`);
  const expected = new Map(
    manifest.map((item) => [item.name, item.compatibleChecksums ?? [item.checksum]]),
  );
  const completed = new Set();
  for (const row of rows) {
    if (!expected.has(row.name)) reject('history-unexpected');
    if (!expected.get(row.name).includes(row.checksum)) reject('history-checksum-mismatch');
    if (row.rolled_back) continue;
    if (!row.finished) reject('history-incomplete');
    if (completed.has(row.name)) reject('history-duplicate');
    completed.add(row.name);
  }
  if (completed.size !== expected.size) reject('history-missing');
  const tables = await tx.$queryRawUnsafe(`SELECT c.relname AS name FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = current_schema() AND c.relkind IN ('r', 'p')`);
  const columns = await tx.$queryRawUnsafe(`SELECT table_name AS name, column_name AS column
    FROM information_schema.columns WHERE table_schema = current_schema()`);
  const enumValues = await tx.$queryRawUnsafe(`SELECT t.typname AS name, e.enumlabel AS value
    FROM pg_catalog.pg_type t JOIN pg_catalog.pg_enum e ON e.enumtypid = t.oid
    JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = current_schema()`);
  const tableNames = new Set(tables.map((item) => item.name));
  const columnNames = new Set(columns.map((item) => JSON.stringify([item.name, item.column])));
  const enums = new Set(enumValues.map((item) => JSON.stringify([item.name, item.value])));
  for (const table of required.tables) {
    if (!tableNames.has(table.name)) reject('table-missing');
    for (const column of table.columns)
      if (!columnNames.has(JSON.stringify([table.name, column]))) reject('column-missing');
  }
  for (const item of required.enums)
    if (!enums.has(JSON.stringify([item.name, item.value]))) reject('enum-missing');
  return {
    migrations: completed.size,
    tables: required.tables.length,
    enums: required.enums.length,
  };
}

export async function verifyDeploymentDatabase(
  client,
  manifest,
  required = requiredDatabaseShape(),
) {
  return client.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '1s'");
      await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '10s'");
      await tx.$executeRawUnsafe("SET LOCAL idle_in_transaction_session_timeout = '15s'");
      return inspectDeploymentSnapshot(tx, manifest, required);
    },
    { isolationLevel: 'RepeatableRead', maxWait: 10000, timeout: 30000 },
  );
}
