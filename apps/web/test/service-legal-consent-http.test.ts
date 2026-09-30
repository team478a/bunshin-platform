import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const state = vi.hoisted(() => ({
  user: null as { userId: string } | null,
  accept: vi.fn(),
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: () => Promise.resolve(state.user) }),
}));
vi.mock('@bunshin/database', () => ({
  PrismaServiceParticipationRepository: class {
    acceptLegalDocuments = state.accept;
  },
}));

import { acceptServiceLegalDocumentsResponse } from '../src/http/service-participation';

const termsId = '11111111-1111-4111-8111-111111111111';
const privacyId = '22222222-2222-4222-8222-222222222222';
const commerceId = '33333333-3333-4333-8333-333333333333';
const request = (body: unknown, origin = 'http://localhost:3000') =>
  new Request('http://localhost:3000/api/services/sample-service/legal-consent', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('service legal reconsent HTTP', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('APP_ENV', 'development');
    vi.stubEnv('APP_URL', 'http://localhost:3000');
    vi.stubEnv('DATABASE_URL', 'postgresql://local');
    vi.stubEnv('DIRECT_URL', 'postgresql://local');
    vi.stubEnv('SESSION_SECRET', '12345678901234567890123456789012');
    vi.stubEnv('LOG_LEVEL', 'info');
    state.user = { userId: 'user-a' };
    state.accept.mockResolvedValue(true);
  });

  it('accepts three current document IDs using only the session actor and service slug', async () => {
    const response = await acceptServiceLegalDocumentsResponse(
      request({ legalDocumentIds: [termsId, privacyId, commerceId] }),
      'sample-service',
    );
    expect(response.status).toBe(200);
    expect(state.accept).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: 'sample-service',
        actorUserId: 'user-a',
        legalDocumentIds: [termsId, privacyId, commerceId],
      }),
    );
  });

  it('rejects unauthenticated, cross-origin and client-supplied authority', async () => {
    state.user = null;
    expect(
      (
        await acceptServiceLegalDocumentsResponse(
          request({ legalDocumentIds: [] }),
          'sample-service',
        )
      ).status,
    ).toBe(401);
    state.user = { userId: 'user-a' };
    expect(
      (
        await acceptServiceLegalDocumentsResponse(
          request({ legalDocumentIds: [] }, 'https://attacker.example'),
          'sample-service',
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await acceptServiceLegalDocumentsResponse(
          request({ legalDocumentIds: [termsId], actorUserId: 'attacker' }),
          'sample-service',
        )
      ).status,
    ).toBe(400);
    expect(state.accept).not.toHaveBeenCalled();
  });

  it('rejects stale or otherwise unavailable membership consent', async () => {
    state.accept.mockResolvedValue(false);
    const response = await acceptServiceLegalDocumentsResponse(
      request({ legalDocumentIds: [termsId] }),
      'sample-service',
    );
    expect(response.status).toBe(403);
  });
});
