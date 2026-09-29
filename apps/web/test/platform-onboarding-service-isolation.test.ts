import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  actor: vi.fn(),
  profile: vi.fn(),
  industries: vi.fn(),
  transaction: vi.fn(),
  service: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));
vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ redirect: state.redirect }));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: state.actor }),
}));
vi.mock('../src/auth/request-security', () => ({ requireSameOrigin: vi.fn() }));
vi.mock('../app/onboarding/registration-wizard', () => ({ RegistrationWizard: () => null }));
vi.mock('@bunshin/database', () => ({
  prisma: {
    userRegistrationProfile: { findUnique: state.profile },
    industry: { findMany: state.industries },
    serviceConfiguration: { findFirst: state.service },
    $transaction: state.transaction,
  },
}));

import RegistrationPage from '../app/onboarding/page';
import { userRegistrationResponse } from '../src/http/user-registration';

describe('platform onboarding does not capture service profiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.actor.mockResolvedValue({ userId: 'user-a' });
    state.profile.mockResolvedValue(null);
    state.industries.mockResolvedValue([]);
  });

  it.each(['media', 'sns-support', 'fortune', 'ai-training', 'oem'])(
    'returns old %s onboarding links before reading shared data',
    async (slug) => {
      const path = `/s/${slug}/line`;
      await expect(
        RegistrationPage({ searchParams: Promise.resolve({ returnTo: path }) }),
      ).rejects.toThrow(`REDIRECT:${path}`);
      expect(state.profile).not.toHaveBeenCalled();
      expect(state.industries).not.toHaveBeenCalled();
      expect(state.service).not.toHaveBeenCalled();
    },
  );

  it('keeps service account context even without an authenticated session', async () => {
    state.actor.mockResolvedValue(null);
    const path = '/account?service=media';
    await expect(
      RegistrationPage({ searchParams: Promise.resolve({ returnTo: path }) }),
    ).rejects.toThrow(`REDIRECT:/login?returnTo=${encodeURIComponent(path)}`);
  });

  it.each(['/s/media', '/s/sns-support/onboarding', '/account?service=fortune'])(
    'rejects a service-scoped save to the common User profile: %s',
    async (returnTo) => {
      const response = await userRegistrationResponse(
        new Request('https://bunshin.example/api/registration', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ currentStep: 1, returnTo }),
        }),
      );
      expect(response.status).toBe(400);
      expect(state.transaction).not.toHaveBeenCalled();
      expect(state.service).not.toHaveBeenCalled();
    },
  );

  it('retains the platform-only registration screen', async () => {
    await RegistrationPage({ searchParams: Promise.resolve({}) });
    expect(state.profile).toHaveBeenCalledWith({ where: { userId: 'user-a' } });
    expect(state.industries).toHaveBeenCalledOnce();
    expect(state.service).not.toHaveBeenCalled();
  });
});
