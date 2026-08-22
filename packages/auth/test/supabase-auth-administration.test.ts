import { describe, expect, it, vi } from 'vitest';
import { SupabaseAuthAdministrationAdapter } from '../src/index';

const configuration = {
  url: 'https://project.supabase.co',
  serviceRoleKey: 's'.repeat(40),
  environment: 'production' as const,
  runtimeEnvironment: 'production' as const,
  timeoutMilliseconds: 50,
};

describe('SupabaseAuthAdministrationAdapter', () => {
  it('deletes by encoded provider id without exposing the credential in the result', async () => {
    const request = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const adapter = new SupabaseAuthAdministrationAdapter(configuration, request);

    await expect(adapter.deleteUser('auth/user')).resolves.toEqual({
      success: true,
      alreadyAbsent: false,
    });
    const [url, init] = request.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe('https://project.supabase.co/auth/v1/admin/users/auth%2Fuser');
    expect(init.method).toBe('DELETE');
    expect(JSON.stringify(await adapter.deleteUser('missing'))).not.toContain('s'.repeat(40));
  });

  it('treats an absent provider user as an idempotent success', async () => {
    const adapter = new SupabaseAuthAdministrationAdapter(
      configuration,
      vi.fn().mockResolvedValue(new Response(null, { status: 404 })),
    );
    await expect(adapter.deleteUser('missing')).resolves.toEqual({
      success: true,
      alreadyAbsent: true,
    });
  });

  it.each([
    [401, 'AUTH_CREDENTIAL_INVALID', false],
    [403, 'AUTH_CREDENTIAL_INVALID', false],
    [429, 'AUTH_RATE_LIMITED', true],
    [503, 'AUTH_PROVIDER_UNAVAILABLE', true],
    [400, 'AUTH_PROVIDER_UNAVAILABLE', false],
  ] as const)('classifies provider status %s', async (status, category, retryable) => {
    const adapter = new SupabaseAuthAdministrationAdapter(
      configuration,
      vi.fn().mockResolvedValue(new Response(null, { status })),
    );
    await expect(adapter.deleteUser('user-id')).resolves.toEqual({
      success: false,
      category,
      retryable,
    });
  });

  it('rejects cross-environment and unsafe URL configuration before a request', async () => {
    const request = vi.fn();
    const mismatched = new SupabaseAuthAdministrationAdapter(
      { ...configuration, runtimeEnvironment: 'staging' },
      request,
    );
    const unsafe = new SupabaseAuthAdministrationAdapter(
      { ...configuration, url: 'http://localhost:54321' },
      request,
    );
    await expect(mismatched.deleteUser('user-id')).resolves.toMatchObject({
      category: 'AUTH_ENVIRONMENT_MISMATCH',
      retryable: false,
    });
    await expect(unsafe.deleteUser('user-id')).resolves.toMatchObject({
      category: 'AUTH_CONFIGURATION_UNAVAILABLE',
      retryable: false,
    });
    expect(request).not.toHaveBeenCalled();
  });

  it('classifies network and timeout failures as retryable without returning provider details', async () => {
    const adapter = new SupabaseAuthAdministrationAdapter(
      configuration,
      vi.fn().mockRejectedValue(new Error('provider response with secret material')),
    );
    await expect(adapter.deleteUser('user-id')).resolves.toEqual({
      success: false,
      category: 'AUTH_PROVIDER_UNAVAILABLE',
      retryable: true,
    });
  });
});
