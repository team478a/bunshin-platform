import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ upsert: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('../src/auth/request-security', () => ({ requireSameOrigin: vi.fn() }));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () =>
    Promise.resolve({ getCurrentUser: () => Promise.resolve({ userId: 'user-1' }) }),
}));
vi.mock('@bunshin/database', () => ({
  prisma: { registrationFunnelEvent: { upsert: state.upsert } },
}));

import { registrationFunnelEventResponse } from '../src/http/registration-funnel';
import { visitorKeyHash } from '../src/registration/funnel';

describe('registration funnel event collection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.upsert.mockResolvedValue({ id: 'event-1' });
  });

  it('stores only a stable hash for an anonymous LP visitor', async () => {
    const visitorId = '11111111-1111-4111-8111-111111111111';
    const response = await registrationFunnelEventResponse(
      new Request('https://bunshin.example/api/registration-funnel', {
        method: 'POST',
        headers: { origin: 'https://bunshin.example', 'content-type': 'application/json' },
        body: JSON.stringify({ eventType: 'LANDING_VIEWED', visitorId }),
      }),
    );

    expect(response.status).toBe(201);
    const hash = visitorKeyHash(visitorId);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(state.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          eventType: 'LANDING_VIEWED',
          visitorKeyHash: hash,
          source: 'COMMON_LP',
        }),
      }),
    );
    expect(JSON.stringify(state.upsert.mock.calls)).not.toContain(
      `"visitorKeyHash":"${visitorId}"`,
    );
  });

  it('records a first-post copy once per authenticated user', async () => {
    const response = await registrationFunnelEventResponse(
      new Request('https://bunshin.example/api/registration-funnel', {
        method: 'POST',
        headers: { origin: 'https://bunshin.example', 'content-type': 'application/json' },
        body: JSON.stringify({ eventType: 'FIRST_POST_COPIED' }),
      }),
    );

    expect(response.status).toBe(201);
    expect(state.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { idempotencyKey: 'FIRST_POST_COPIED:user-1:once' },
        create: expect.objectContaining({ userId: 'user-1', eventType: 'FIRST_POST_COPIED' }),
      }),
    );
  });

  it('rejects client attempts to submit privileged funnel stages', async () => {
    const response = await registrationFunnelEventResponse(
      new Request('https://bunshin.example/api/registration-funnel', {
        method: 'POST',
        headers: { origin: 'https://bunshin.example', 'content-type': 'application/json' },
        body: JSON.stringify({ eventType: 'ONBOARDING_COMPLETED' }),
      }),
    );

    expect(response.status).toBe(400);
    expect(state.upsert).not.toHaveBeenCalled();
  });
});
