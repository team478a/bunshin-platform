import 'server-only';
import { getServerEnvironment } from '@bunshin/config';
import { authConfiguration } from '../auth/supabase';
import { SupabaseExternalReadCredentialVerifier } from '../auth/external-read-credential';
import { externalReadClientCatalog } from './external-read-client-catalog';
/** Disabled until a reviewed OAuth client is registered. Does not expose a read or bind endpoint. */
export async function createExternalReadCredentialServices() {
  const environment = getServerEnvironment().APP_ENV;
  const clients = externalReadClientCatalog();
  if (environment === 'staging' || clients.length === 0) return null;
  const configuration = authConfiguration();
  const clientIds = clients.map((c) => c.id);
  const verifier = new SupabaseExternalReadCredentialVerifier({
    ...configuration,
    environment,
    clientIds,
  });
  const db = await import('@bunshin/database');
  const bindings = new db.PrismaExternalReadGrantRepository(
    db.prisma,
    environment,
    () => ({ enabled: clientIds.length > 0, clients: clientIds }),
    () => new Date(),
    `${new URL(configuration.url).origin}/auth/v1`,
  );
  return { verifier, bindings };
}
