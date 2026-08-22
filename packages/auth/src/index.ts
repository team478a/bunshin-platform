import type { AuthProviderType } from '@bunshin/platform-domain';
import type { AuthAdministrationPort, AuthAdministrationResult } from '@bunshin/application';

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

export type SupabaseAuthAdministrationEnvironment = 'development' | 'staging' | 'production';

export interface SupabaseAuthAdministrationConfiguration {
  url: string;
  serviceRoleKey: string;
  environment: SupabaseAuthAdministrationEnvironment;
  runtimeEnvironment: SupabaseAuthAdministrationEnvironment;
  timeoutMilliseconds?: number;
}

type FetchLike = typeof fetch;

export class SupabaseAuthAdministrationAdapter implements AuthAdministrationPort {
  constructor(
    private readonly configuration: SupabaseAuthAdministrationConfiguration,
    private readonly request: FetchLike = fetch,
  ) {}

  async deleteUser(providerUserId: string): Promise<AuthAdministrationResult> {
    const validation = this.validate(providerUserId);
    if (validation !== null) return validation;

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.configuration.timeoutMilliseconds ?? 10_000,
    );
    try {
      const endpoint = new URL(
        `/auth/v1/admin/users/${encodeURIComponent(providerUserId)}`,
        this.configuration.url,
      );
      const response = await this.request(endpoint, {
        method: 'DELETE',
        headers: {
          apikey: this.configuration.serviceRoleKey,
          Authorization: `Bearer ${this.configuration.serviceRoleKey}`,
        },
        signal: controller.signal,
      });
      if (response.ok) return { success: true, alreadyAbsent: false };
      if (response.status === 404) return { success: true, alreadyAbsent: true };
      if (response.status === 401 || response.status === 403)
        return { success: false, category: 'AUTH_CREDENTIAL_INVALID', retryable: false };
      if (response.status === 429)
        return { success: false, category: 'AUTH_RATE_LIMITED', retryable: true };
      return {
        success: false,
        category: 'AUTH_PROVIDER_UNAVAILABLE',
        retryable: response.status >= 500,
      };
    } catch {
      return { success: false, category: 'AUTH_PROVIDER_UNAVAILABLE', retryable: true };
    } finally {
      clearTimeout(timeout);
    }
  }

  private validate(providerUserId: string): AuthAdministrationResult | null {
    if (
      !providerUserId.trim() ||
      !this.configuration.url ||
      !this.configuration.serviceRoleKey ||
      !this.configuration.environment
    )
      return { success: false, category: 'AUTH_CONFIGURATION_UNAVAILABLE', retryable: false };
    if (this.configuration.environment !== this.configuration.runtimeEnvironment)
      return { success: false, category: 'AUTH_ENVIRONMENT_MISMATCH', retryable: false };
    try {
      const url = new URL(this.configuration.url);
      const localhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
      if (
        (url.protocol !== 'https:' &&
          !(this.configuration.environment === 'development' && localhost)) ||
        (localhost && this.configuration.environment !== 'development')
      )
        return { success: false, category: 'AUTH_CONFIGURATION_UNAVAILABLE', retryable: false };
    } catch {
      return { success: false, category: 'AUTH_CONFIGURATION_UNAVAILABLE', retryable: false };
    }
    return null;
  }
}
