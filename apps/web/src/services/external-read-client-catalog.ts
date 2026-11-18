import 'server-only';
import { getServerEnvironment } from '@bunshin/config';
export interface ExternalReadClientDescriptor {
  id: string;
  name: string;
  /** Must match this client's registered callback URIs before enabling OAuth consent UI. */
  oauthRedirectUris?: readonly string[];
}
/** Reviewed, credential-capable integrations only. Muse compatibility is not yet verified. */
export function externalReadClientCatalog(): readonly ExternalReadClientDescriptor[] {
  if (
    process.env['EXTERNAL_READ_OAUTH_CLIENT_ID'] === undefined &&
    process.env['EXTERNAL_READ_OAUTH_CLIENT_NAME'] === undefined &&
    process.env['EXTERNAL_READ_OAUTH_REDIRECT_URIS'] === undefined
  )
    return [];
  const environment = getServerEnvironment();
  const id = environment.EXTERNAL_READ_OAUTH_CLIENT_ID;
  const name = environment.EXTERNAL_READ_OAUTH_CLIENT_NAME;
  const rawRedirects = environment.EXTERNAL_READ_OAUTH_REDIRECT_URIS;
  if (!id || !name || !rawRedirects) return [];
  const redirects = JSON.parse(rawRedirects) as string[];
  return [{ id, name, oauthRedirectUris: redirects }];
}
