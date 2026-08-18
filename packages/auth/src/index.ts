import type { AuthProviderType } from '@bunshin/platform-domain';

export interface AuthVerificationInput {
  provider: AuthProviderType;
  credential: string;
}

export interface VerifiedIdentity {
  provider: AuthProviderType;
  providerUserId: string;
  displayName: string | null;
  email: string | null;
}

export interface CurrentUser {
  userId: string;
  authIdentityId: string;
}

export interface AuthProvider {
  verify(input: AuthVerificationInput): Promise<VerifiedIdentity>;
}

export interface CurrentUserProvider {
  getCurrentUser(): Promise<CurrentUser | null>;
}
