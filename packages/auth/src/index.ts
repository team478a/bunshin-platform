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

export interface VerifiedSessionUser {
  providerUserId: string;
  email: string | null;
  displayName: string | null;
}

export interface SessionUserVerifier {
  getVerifiedUser(): Promise<VerifiedSessionUser | null>;
}

export interface CurrentUserAccountRepository {
  findActiveByEmailIdentity(providerUserId: string): Promise<CurrentUser | null>;
  provisionEmailIdentity(input: VerifiedSessionUser): Promise<CurrentUser>;
}

export class SessionCurrentUserProvider implements CurrentUserProvider {
  constructor(
    private readonly verifier: SessionUserVerifier,
    private readonly accounts: CurrentUserAccountRepository,
  ) {}

  async getCurrentUser(): Promise<CurrentUser | null> {
    const verified = await this.verifier.getVerifiedUser();
    if (verified === null) return null;
    return (
      (await this.accounts.findActiveByEmailIdentity(verified.providerUserId)) ??
      this.accounts.provisionEmailIdentity(verified)
    );
  }
}
