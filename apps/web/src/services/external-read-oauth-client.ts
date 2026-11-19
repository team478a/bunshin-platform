import 'server-only';
import { getServerEnvironment } from '@bunshin/config';
import { createLogger } from '@bunshin/observability';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { ExternalReadClientDescriptor } from './external-read-client-catalog';

const registeredClientSchema = z.object({
  client_id: z.string(),
  client_name: z.string(),
  client_type: z.literal('public'),
  registration_type: z.literal('dynamic'),
  token_endpoint_auth_method: z.literal('none'),
  client_secret: z.undefined().optional(),
  redirect_uris: z.array(z.string()).min(1),
  grant_types: z.array(z.string()),
  response_types: z.array(z.string()),
});

function sameValues(actual: readonly string[], expected: readonly string[]) {
  const sortedActual = [...actual].sort();
  const sortedExpected = [...expected].sort();
  return (
    sortedActual.length === sortedExpected.length &&
    sortedActual.every((value, index) => value === sortedExpected[index])
  );
}

function rejectDynamicClient(errorCode: string) {
  createLogger().warn('External OAuth dynamic client rejected', {
    route: '/oauth/consent',
    errorCode,
  });
  return null;
}

/**
 * Fixed clients remain the default. In staging only, a reviewed redirect/name template may
 * admit a Supabase-registered public DCR client after its server-side metadata is re-read.
 */
export async function resolveExternalReadOAuthClient(
  clientId: string,
  redirectUri: string,
  clients: readonly ExternalReadClientDescriptor[],
): Promise<ExternalReadClientDescriptor | null> {
  const fixed = clients.find(
    (client) => client.id === clientId && client.oauthRedirectUris?.includes(redirectUri),
  );
  if (fixed) return fixed;

  const environment = getServerEnvironment();
  if (environment.APP_ENV !== 'staging') return null;
  if (
    environment.EXTERNAL_READ_OAUTH_DYNAMIC_CLIENTS_ENABLED !== 'true' ||
    !environment.SUPABASE_AUTH_ADMIN_URL ||
    !environment.SUPABASE_SERVICE_ROLE_KEY ||
    environment.SUPABASE_AUTH_ADMIN_ENV !== 'staging'
  )
    return rejectDynamicClient('EXTERNAL_OAUTH_DYNAMIC_CLIENT_NOT_CONFIGURED');

  const templates = clients.filter((client) => client.oauthRedirectUris?.includes(redirectUri));
  if (templates.length !== 1)
    return rejectDynamicClient('EXTERNAL_OAUTH_DYNAMIC_CLIENT_TEMPLATE_AMBIGUOUS');
  const template = templates[0]!;

  try {
    const admin = createClient(
      environment.SUPABASE_AUTH_ADMIN_URL,
      environment.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      },
    );
    const { data, error } = await admin.auth.admin.oauth.getClient(clientId);
    if (error) return rejectDynamicClient('EXTERNAL_OAUTH_DYNAMIC_CLIENT_LOOKUP_FAILED');
    const parsed = registeredClientSchema.safeParse(data);
    if (!parsed.success)
      return rejectDynamicClient('EXTERNAL_OAUTH_DYNAMIC_CLIENT_METADATA_INVALID');
    const registered = parsed.data;
    if (registered.client_id !== clientId)
      return rejectDynamicClient('EXTERNAL_OAUTH_DYNAMIC_CLIENT_ID_MISMATCH');
    if (registered.client_name !== template.name)
      return rejectDynamicClient('EXTERNAL_OAUTH_DYNAMIC_CLIENT_NAME_MISMATCH');
    if (!sameValues(registered.redirect_uris, template.oauthRedirectUris ?? []))
      return rejectDynamicClient('EXTERNAL_OAUTH_DYNAMIC_CLIENT_REDIRECT_MISMATCH');
    if (!sameValues(registered.grant_types, ['authorization_code', 'refresh_token']))
      return rejectDynamicClient('EXTERNAL_OAUTH_DYNAMIC_CLIENT_GRANT_MISMATCH');
    if (!sameValues(registered.response_types, ['code']))
      return rejectDynamicClient('EXTERNAL_OAUTH_DYNAMIC_CLIENT_RESPONSE_MISMATCH');
    return { ...template, id: clientId };
  } catch {
    return rejectDynamicClient('EXTERNAL_OAUTH_DYNAMIC_CLIENT_LOOKUP_FAILED');
  }
}
