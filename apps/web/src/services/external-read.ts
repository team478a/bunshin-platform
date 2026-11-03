import 'server-only';
import {
  BindExternalReadCredential,
  ReadAuthenticatedExternalMemberUsage,
} from '@bunshin/application';
import { createExternalReadCredentialServices } from './external-read-credential';

/** PoC resource boundary. The reviewed client catalog remains empty by default. */
export async function createExternalReadServices() {
  const credentials = await createExternalReadCredentialServices();
  if (!credentials) return null;
  const db = await import('@bunshin/database');
  const usage = new db.PrismaMemberUsageRepository(db.prisma);
  return {
    binding: new BindExternalReadCredential(credentials.verifier, credentials.bindings),
    usage: new ReadAuthenticatedExternalMemberUsage(
      credentials.verifier,
      credentials.bindings,
      { authorization: credentials.bindings },
      usage,
      usage,
    ),
  };
}
