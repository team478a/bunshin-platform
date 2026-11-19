import 'server-only';
import { getServerEnvironment } from '@bunshin/config';
import { createLogger } from '@bunshin/observability';
import { authConfiguration } from '../auth/supabase';
import { SupabaseExternalReadCredentialVerifier } from '../auth/external-read-credential';
import { externalReadClientCatalog } from './external-read-client-catalog';
import { resolveExternalReadOAuthCredentialClient } from './external-read-oauth-client';
/** Disabled until a reviewed OAuth client is registered. Does not expose a read or bind endpoint. */
export async function createExternalReadCredentialServices(expectedAudience = 'authenticated') {
  const environment = getServerEnvironment().APP_ENV;
  const clients = externalReadClientCatalog();
  if (clients.length === 0) return null;
  const configuration = authConfiguration();
  const clientIds = clients.map((c) => c.id);
  const verifier = new SupabaseExternalReadCredentialVerifier({
    ...configuration,
    environment,
    clientIds,
    expectedAudience,
    resolveClientId: async (clientId, signal) =>
      (await resolveExternalReadOAuthCredentialClient(clientId, clients, signal))?.id ?? null,
    ...(environment === 'staging' && expectedAudience !== 'authenticated'
      ? {
          onRejected: (stage) =>
            createLogger().warn('External MCP credential verification rejected', {
              route: '/api/mcp',
              errorCode: 'MCP_CREDENTIAL_STAGE_REJECTED',
              stage,
            }),
        }
      : {}),
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
