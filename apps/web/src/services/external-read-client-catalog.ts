import 'server-only';
export interface ExternalReadClientDescriptor {
  id: string;
  name: string;
  /** Must match this client's registered callback URIs before enabling OAuth consent UI. */
  oauthRedirectUris?: readonly string[];
}
/** Reviewed, credential-capable integrations only. Muse compatibility is not yet verified. */
export function externalReadClientCatalog(): readonly ExternalReadClientDescriptor[] {
  return [];
}
