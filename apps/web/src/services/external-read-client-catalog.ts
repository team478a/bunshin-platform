import 'server-only';
export interface ExternalReadClientDescriptor {
  id: string;
  name: string;
}
/** Reviewed, credential-capable integrations only. Muse compatibility is not yet verified. */
export function externalReadClientCatalog(): readonly ExternalReadClientDescriptor[] {
  return [];
}
