import 'server-only';
import type { SessionUserVerifier } from '@bunshin/auth';
import { SessionCurrentUserProvider } from '@bunshin/auth';
import { createSupabaseServerClient } from './supabase';

const verifier: SessionUserVerifier = {
  async getVerifiedUser() {
    const supabase = await createSupabaseServerClient();
    // OAuth clients use the explicit external grant boundary, never ordinary member APIs.
    const verified = await supabase.auth.getClaims();
    const claims = verified.data?.claims;
    if (
      verified.error ||
      !claims ||
      claims['client_id'] != null ||
      claims.aud !== 'authenticated' ||
      claims.role !== 'authenticated'
    )
      return null;
    const { data, error } = await supabase.auth.getUser();
    if (error !== null || data.user === null || data.user.id !== claims.sub) return null;
    const metadata = data.user.user_metadata as Record<string, unknown>;
    const displayName = metadata['display_name'];
    return {
      providerUserId: data.user.id,
      email: data.user.email ?? null,
      displayName: typeof displayName === 'string' ? displayName : null,
    };
  },
};

export async function currentUserProvider() {
  const { PrismaCurrentUserAccountRepository } = await import('@bunshin/database');
  return new SessionCurrentUserProvider(verifier, new PrismaCurrentUserAccountRepository());
}
