import 'server-only';
import { getServerEnvironment } from '@bunshin/config';
import { createLogger } from '@bunshin/observability';
import { ApplicationError } from '@bunshin/shared';
import { z } from 'zod';
import { createSupabaseServerClient } from '../auth/supabase';
import { verifiedFirstPartyIdentity } from '../auth/current-user';
import { oauthConsentPath } from '../auth/oauth-consent-path';
import {
  externalReadClientCatalog,
  type ExternalReadClientDescriptor,
} from './external-read-client-catalog';
import { resolveExternalReadOAuthClient } from './external-read-oauth-client';

export const oauthScopeLabels: Record<string, string> = {
  openid: '本人を識別する情報',
  email: 'メールアドレス',
  profile: 'プロフィール情報',
};
const detailsSchema = z.object({
  authorization_id: z.string(),
  redirect_uri: z.string(),
  client: z.object({ id: z.string() }),
  user: z.object({ id: z.string() }),
  scope: z.string(),
});
export interface OAuthConsentView {
  authorizationId: string;
  clientName: string;
  account: string;
  scopes: string[];
  callbackOrigin: string;
}
const unavailable = () => new ApplicationError('FORBIDDEN', 'OAuth consent unavailable');
function rejectAuthorization(errorCode: string): never {
  createLogger().warn('External OAuth authorization rejected', {
    route: '/oauth/consent',
    errorCode,
  });
  throw unavailable();
}
function callback(raw: string, environment: string) {
  try {
    const url = new URL(raw);
    if (
      url.username ||
      url.password ||
      url.hash ||
      (url.protocol !== 'https:' &&
        !(
          environment === 'development' &&
          url.protocol === 'http:' &&
          ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
        ))
    )
      return null;
    return url;
  } catch {
    return null;
  }
}
/** Callback metadata is server-reviewed, not submitted by the browser. */
function redirectTo(
  raw: string,
  clients: readonly ExternalReadClientDescriptor[],
  environment: string,
): `https://${string}` | `http://${string}` {
  const target = callback(raw, environment);
  if (!target) throw unavailable();
  const valid = clients.some((client) =>
    client.oauthRedirectUris?.some((uri) => {
      const base = callback(uri, environment);
      if (!base || base.origin !== target.origin || base.pathname !== target.pathname) return false;
      for (const key of new Set(base.searchParams.keys()))
        if (
          JSON.stringify(base.searchParams.getAll(key)) !==
          JSON.stringify(target.searchParams.getAll(key))
        )
          return false;
      return [...target.searchParams.keys()].every(
        (key) =>
          base.searchParams.has(key) ||
          ['code', 'state', 'error', 'error_description', 'error_uri', 'iss'].includes(key),
      );
    }),
  );
  if (!valid) throw unavailable();
  return target.protocol === 'https:'
    ? `https://${target.host}${target.pathname}${target.search}`
    : `http://${target.host}${target.pathname}${target.search}`;
}
async function context(id: string) {
  if (!oauthConsentPath(id))
    throw new ApplicationError('VALIDATION_ERROR', 'invalid authorization');
  const environment = getServerEnvironment().APP_ENV;
  const clients = externalReadClientCatalog().filter((client) => client.oauthRedirectUris?.length);
  if (!clients.length) return { kind: 'unavailable' as const };
  const sdk = await createSupabaseServerClient();
  const identity = await verifiedFirstPartyIdentity(sdk);
  if (!identity) return { kind: 'login' as const, returnTo: oauthConsentPath(id)! };
  const { data, error } = await sdk.auth.oauth.getAuthorizationDetails(id);
  if (error || !data) rejectAuthorization('EXTERNAL_OAUTH_AUTHORIZATION_DETAILS_UNAVAILABLE');
  if ('redirect_url' in data)
    return { kind: 'redirect' as const, url: redirectTo(data.redirect_url, clients, environment) };
  const parsed = detailsSchema.safeParse(data);
  if (!parsed.success) rejectAuthorization('EXTERNAL_OAUTH_AUTHORIZATION_DETAILS_INVALID');
  const details = parsed.data;
  const client = await resolveExternalReadOAuthClient(
    details.client.id,
    details.redirect_uri,
    clients,
  );
  const scopes = [...new Set(details.scope.split(/\s+/).filter(Boolean))];
  if (!client) rejectAuthorization('EXTERNAL_OAUTH_CLIENT_REJECTED');
  if (details.authorization_id !== id)
    rejectAuthorization('EXTERNAL_OAUTH_AUTHORIZATION_ID_MISMATCH');
  if (details.user.id !== identity.providerUserId)
    rejectAuthorization('EXTERNAL_OAUTH_AUTHORIZATION_USER_MISMATCH');
  if (scopes.some((scope) => !Object.hasOwn(oauthScopeLabels, scope)))
    rejectAuthorization('EXTERNAL_OAUTH_AUTHORIZATION_SCOPE_REJECTED');
  if (!client.oauthRedirectUris?.includes(details.redirect_uri))
    rejectAuthorization('EXTERNAL_OAUTH_AUTHORIZATION_REDIRECT_REJECTED');
  const uri = callback(details.redirect_uri, environment);
  if (!uri) rejectAuthorization('EXTERNAL_OAUTH_AUTHORIZATION_CALLBACK_INVALID');
  return {
    kind: 'consent' as const,
    sdk,
    client,
    environment,
    view: {
      authorizationId: id,
      clientName: client.name,
      account: identity.email ?? 'ログイン中のアカウント',
      scopes,
      callbackOrigin: uri.origin,
    } satisfies OAuthConsentView,
  };
}
/** Never export provider credentials, raw authorization objects or authorization codes to the view. */
export async function loadOAuthConsent(id: string) {
  const value = await context(id);
  return value.kind === 'consent' ? { kind: 'consent' as const, view: value.view } : value;
}
export async function decideOAuthConsent(id: string, decision: 'approve' | 'deny') {
  const value = await context(id);
  if (value.kind === 'login') return value;
  if (value.kind !== 'consent') throw unavailable();
  const result =
    decision === 'approve'
      ? await value.sdk.auth.oauth.approveAuthorization(id, { skipBrowserRedirect: true })
      : await value.sdk.auth.oauth.denyAuthorization(id, { skipBrowserRedirect: true });
  if (result.error || !result.data) throw unavailable();
  return {
    kind: 'redirect' as const,
    url: redirectTo(result.data.redirect_url, [value.client], value.environment),
  };
}
