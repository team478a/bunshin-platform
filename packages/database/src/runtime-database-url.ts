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
  if (!POSTGRES_PROTOCOLS.has(url.protocol) || url.port !== '6543') return source;

  url.searchParams.set('pgbouncer', 'true');
  url.searchParams.set('connection_limit', '1');
  return url.toString();
}
