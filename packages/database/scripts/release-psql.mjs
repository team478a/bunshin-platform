import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const literal = (value) => "'" + value.replaceAll("'", "''") + "'";
const identifier = (value) => '"' + value.replaceAll('"', '""') + '"';
const shellWord = (value) => "'" + value.replaceAll("'", "'\\''") + "'";

export const psqlArguments = [
  '-X',
  '-w',
  '-q',
  '-t',
  '-A',
  '-v',
  'ON_ERROR_STOP=1',
  '-v',
  'VERBOSITY=terse',
  '-f',
  '-',
];

export function loadReleaseMigrations(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d{14}_[a-z0-9_]+$/.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ name }) => {
      const bytes = readFileSync(new URL(`${name}/migration.sql`, directory));
      const sql = bytes.toString('utf8');
      const checksumOf = (text) => createHash('sha256').update(text).digest('hex');
      return {
        name,
        sql,
        checksum: checksumOf(sql),
        compatibleChecksums: [
          ...new Set(
            [sql, sql.replaceAll('\r\n', '\n'), sql.replaceAll('\n', '\r\n')].map(checksumOf),
          ),
        ],
      };
    });
}

/** libpq credentials live only in the child environment, never process arguments. */
export function psqlEnvironment(connection, environment) {
  const url = new URL(connection);
  const result = { ...environment };
  for (const key of Object.keys(result)) if (key.startsWith('PG')) delete result[key];
  return {
    ...result,
    PGHOST: url.hostname,
    PGPORT: url.port,
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGSSLMODE: url.searchParams.get('sslmode') ?? 'require',
    ...(url.searchParams.has('sslrootcert')
      ? { PGSSLROOTCERT: url.searchParams.get('sslrootcert') }
      : {}),
    PGCONNECT_TIMEOUT: '10',
    PGAPPNAME: 'bunshin_release_psql',
  };
}

/** Generated only from trusted repository files; the source migration bytes stay unchanged. */
export function buildPsqlReleaseScript({
  migrations,
  approvedNames,
  bounds,
  mode,
  resolveExecutable,
  prismaCli,
  schemaPath,
  database = 'postgres',
  user = 'postgres',
  schema = 'public',
  preconditionSql = '',
}) {
  if (!['preview', 'apply'].includes(mode) || approvedNames.length === 0)
    throw new Error('INVALID_RELEASE_MODE');
  for (const migration of migrations) {
    if (!/^\d{14}_[a-z0-9_]+$/.test(migration.name) || !/^[a-f0-9]{64}$/.test(migration.checksum))
      throw new Error('INVALID_RELEASE_SOURCE');
  }
  const approved = approvedNames.map((name) => {
    const migration = migrations.find((item) => item.name === name);
    if (
      !migration ||
      /^\s*\\/m.test(migration.sql) ||
      /^\s*(BEGIN|COMMIT|ROLLBACK|END|START\s+TRANSACTION)\b/im.test(migration.sql)
    )
      throw new Error('UNSUPPORTED_RELEASE_SQL');
    return migration;
  });
  const history = `${identifier(schema)}."_prisma_migrations"`;
  const expected = literal(
    JSON.stringify(
      migrations.map(({ name, checksum, compatibleChecksums }) => ({
        name,
        checksum,
        compatible_checksums: compatibleChecksums ?? [checksum],
      })),
    ),
  );
  const expectedRows = `jsonb_to_recordset(current_setting('bunshin.release_manifest')::jsonb)
    AS expected(name text, checksum text, compatible_checksums text[])`;
  const names = `ARRAY[${approvedNames.map(literal).join(',')}]::text[]`;
  const boundsCheck = `
    IF current_setting('lock_timeout')::interval <> interval '${bounds.lockTimeoutMs} milliseconds'
      OR current_setting('statement_timeout')::interval <> interval '${bounds.statementTimeoutMs} milliseconds'
      OR current_setting('idle_in_transaction_session_timeout')::interval <> interval '${bounds.statementTimeoutMs} milliseconds'
    THEN RAISE EXCEPTION 'MIGRATION_BOUNDS_NOT_ACTIVE'; END IF;`;
  const historyCheck = `
    IF EXISTS (SELECT 1 FROM ${history} WHERE rolled_back_at IS NULL AND finished_at IS NULL)
    THEN RAISE EXCEPTION 'RELEASE_FAILED_HISTORY'; END IF;
    IF EXISTS (SELECT migration_name FROM ${history} WHERE rolled_back_at IS NULL AND finished_at IS NOT NULL
      GROUP BY migration_name HAVING count(*) > 1)
    THEN RAISE EXCEPTION 'RELEASE_FAILED_HISTORY'; END IF;
    IF EXISTS (
      SELECT 1 FROM ${history} AS actual LEFT JOIN ${expectedRows} ON expected.name = actual.migration_name
      WHERE actual.rolled_back_at IS NULL AND actual.finished_at IS NOT NULL
        AND (expected.name IS NULL OR NOT (actual.checksum = ANY(expected.compatible_checksums)))
    ) THEN RAISE EXCEPTION 'RELEASE_CHECKSUM_MISMATCH'; END IF;`;
  const missing = `SELECT expected.name FROM ${expectedRows}
    WHERE NOT EXISTS (SELECT 1 FROM ${history} AS actual WHERE actual.migration_name = expected.name
      AND actual.finished_at IS NOT NULL AND actual.rolled_back_at IS NULL)`;
  const transaction = ({ name, sql, checksum }) => {
    const command = [
      process.execPath,
      fileURLToPath(new URL('./release-prisma-command.mjs', import.meta.url)),
      'resolve',
      resolveExecutable,
      prismaCli,
      schemaPath,
      name,
    ]
      .map(shellWord)
      .join(' ');
    return `
BEGIN;
DO $bounds$ BEGIN ${boundsCheck} END $bounds$;
${sql}
COMMIT;
\\echo RELEASE_SQL_COMMITTED:${name}
\\! ${command}
\\if :SHELL_ERROR
DO $failed$ BEGIN RAISE EXCEPTION 'RELEASE_HISTORY_RECORDING_FAILED'; END $failed$;
\\endif
DO $recorded$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM ${history} WHERE migration_name = ${literal(name)}
    AND checksum = ${literal(checksum)} AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
  THEN RAISE EXCEPTION 'RELEASE_HISTORY_RECORDING_FAILED'; END IF;
END $recorded$;
\\echo RELEASE_HISTORY_VERIFIED:${name}
`;
  };
  const metadataProbe = [
    process.execPath,
    fileURLToPath(new URL('./release-prisma-command.mjs', import.meta.url)),
    'probe',
    resolveExecutable,
    prismaCli,
    schemaPath,
  ]
    .map(shellWord)
    .join(' ');
  return `
SELECT :VERSION_NUM::integer >= 160000 AS native_client_supported \\gset
\\if :native_client_supported
\\else
DO $client$ BEGIN RAISE EXCEPTION 'RELEASE_PSQL_VERSION_UNSUPPORTED'; END $client$;
\\endif
SET search_path TO ${identifier(schema)}, public;
SET lock_timeout = '${bounds.lockTimeoutMs}ms';
SET statement_timeout = '${bounds.statementTimeoutMs}ms';
SET idle_in_transaction_session_timeout = '${bounds.statementTimeoutMs}ms';
SET bunshin.release_manifest = ${expected};
SELECT pg_try_advisory_lock(72707369) AS release_lock \\gset
\\if :release_lock
\\else
DO $busy$ BEGIN RAISE EXCEPTION 'RELEASE_LOCK_BUSY'; END $busy$;
\\endif
BEGIN READ ONLY;
DO $preflight$
DECLARE pending text[];
BEGIN
  IF current_database() <> ${literal(database)} OR current_user <> ${literal(user)}
  THEN RAISE EXCEPTION 'MIGRATION_PROBE_IDENTITY_MISMATCH'; END IF;
  ${boundsCheck}
  ${historyCheck}
  SELECT array_agg(name ORDER BY name) INTO pending FROM (${missing}) AS missing;
  IF pending IS NOT NULL AND pending <> ${names}
  THEN RAISE EXCEPTION 'RELEASE_PENDING_SET_MISMATCH'; END IF;
END $preflight$;
SELECT EXISTS (${missing}) AS release_needed \\gset
\\if :release_needed
${preconditionSql}
\\endif
COMMIT;
\\! ${metadataProbe}
\\if :SHELL_ERROR
DO $metadata$ BEGIN RAISE EXCEPTION 'RELEASE_METADATA_CONNECTION_FAILED'; END $metadata$;
\\endif
\\echo RELEASE_PSQL_PREFLIGHT_VERIFIED
${
  mode === 'apply'
    ? `
\\if :release_needed
${approved.map(transaction).join('\n')}
\\endif
BEGIN READ ONLY;
DO $postflight$ BEGIN
  ${historyCheck}
  IF EXISTS (${missing}) THEN RAISE EXCEPTION 'RELEASE_POSTCHECK_FAILED'; END IF;
END $postflight$;
COMMIT;
\\echo RELEASE_MIGRATIONS_APPLIED_AND_VERIFIED
`
    : '\\echo RELEASE_PSQL_PREVIEW_VERIFIED'
}
SELECT pg_advisory_unlock(72707369);
`;
}
