import { X509Certificate } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let stagingCertificatePath: string | undefined;

function installStagingCertificate(url: URL) {
  const encoded = process.env['BUNSHIN_STAGING_DB_CA_B64'];
  if (process.env['APP_ENV'] !== 'staging' || !encoded) return;
  if (
    !url.hostname.endsWith('.pooler.supabase.com') ||
    url.searchParams.get('sslmode') !== 'require'
  )
    throw new Error('Invalid staging database certificate configuration');
  if (!stagingCertificatePath) {
    const certificate = new X509Certificate(Buffer.from(encoded, 'base64'));
    const path = join(mkdtempSync(join(tmpdir(), 'bunshin-stage-db-')), 'supabase-ca.pem');
    writeFileSync(path, certificate.toString(), { mode: 0o600 });
    stagingCertificatePath = path;
  }
  url.searchParams.set('sslcert', stagingCertificatePath);
  url.searchParams.set('sslaccept', 'strict');
}

const POSTGRES_PROTOCOLS = new Set(['postgres:', 'postgresql:']);

/**
 * Supabase transaction poolers use port 6543. Prisma must not use prepared
 * statements through a transaction pooler, and a single connection per
 * serverless instance avoids exhausting the shared pool.
 */
export function runtimeDatabaseUrl(source: string | undefined): string | undefined {
  if (!source) return source;

  let url: URL;
  try {
    url = new URL(source);
  } catch {
    return source;
  }
  if (!POSTGRES_PROTOCOLS.has(url.protocol)) return source;
  // Runtime serverless clients must not reserve the small session-mode pool.
  // Prisma migrations read DIRECT_URL separately and do not call this helper.
  if (url.hostname.endsWith('.pooler.supabase.com') && url.port === '5432') {
    url.port = '6543';
  }
  if (url.port !== '6543') return source;

  url.searchParams.set('pgbouncer', 'true');
  url.searchParams.set('connection_limit', '1');
  installStagingCertificate(url);
  return url.toString();
}
