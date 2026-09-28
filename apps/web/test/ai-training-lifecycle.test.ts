import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@bunshin/shared';
const fake = vi.hoisted(() => ({
  actor: vi.fn(),
  origin: vi.fn(),
  service: vi.fn(),
  change: vi.fn(),
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: fake.actor }),
}));
vi.mock('../src/auth/request-security', () => ({ requireSameOrigin: fake.origin }));
vi.mock('../src/services/public-service', () => ({ resolveManagedServiceContext: fake.service }));
vi.mock('@bunshin/database', () => ({
  PrismaTrainingLifecycleRepository: class {
    change = fake.change;
  },
}));
import { trainingLifecycleResponse } from '../src/http/ai-training-lifecycle';
const id = '11111111-1111-4111-8111-111111111111';
const body = {
  action: 'COMPLETE',
  expectedStatus: 'ACTIVE',
  expectedUpdatedAt: '2026-09-29T00:00:00.000Z',
  reason: 'Training ended',
  operationId: id,
  confirmation: 'CHANGE_TRAINING_STATUS',
};
const request = (value: unknown) =>
  new Request('https://app.example.com', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(value),
  });
describe('training lifecycle HTTP', () => {
  it('does not mutate another or unmanaged service', async () => {
    fake.actor.mockResolvedValue({ userId: 'manager' });
    fake.origin.mockImplementation(() => {});
    fake.service.mockRejectedValue(new Error('SERVICE_NOT_FOUND'));
    expect((await trainingLifecycleResponse(request(body), 'foreign-service', id)).status).toBe(
      404,
    );
    expect(fake.change).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    fake.actor.mockResolvedValue({ userId: 'manager' });
    fake.origin.mockImplementation(() => {});
    fake.service.mockResolvedValue({ workspaceId: 'w', serviceId: 'g' });
    fake.change.mockResolvedValue({ outcome: 'APPLIED', status: 'COMPLETED' });
  });
  it('derives scope/actor only from managed service and authenticated session', async () => {
    const result = await trainingLifecycleResponse(request(body), 'training', id);
    expect(result.status).toBe(200);
    expect(result.headers.get('cache-control')).toBe('private, no-store');
    expect(fake.change).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'w',
        groupId: 'g',
        actorUserId: 'manager',
        programEnrollmentId: id,
        expectedUpdatedAt: new Date(body.expectedUpdatedAt),
      }),
    );
  });
  it('rejects no session or different origin before mutation', async () => {
    fake.actor.mockResolvedValue(null);
    expect((await trainingLifecycleResponse(request(body), 'training', id)).status).toBe(401);
    fake.actor.mockResolvedValue({ userId: 'manager' });
    fake.origin.mockImplementation(() => {
      throw new ApplicationError('FORBIDDEN', 'origin rejected');
    });
    expect((await trainingLifecycleResponse(request(body), 'training', id)).status).toBe(403);
    expect(fake.change).not.toHaveBeenCalled();
  });
  it.each([
    { ...body, confirmation: 'wrong' },
    { ...body, reason: ' ' },
    { ...body, actorUserId: 'spoofed' },
    { ...body, expectedUpdatedAt: 'invalid' },
    { ...body, action: 'EXPIRE' },
  ])('rejects invalid/extra inputs', async (value) => {
    expect((await trainingLifecycleResponse(request(value), 'training', id)).status).toBe(400);
    expect(fake.change).not.toHaveBeenCalled();
  });
  it.each([
    ['FORBIDDEN', 403],
    ['NOT_FOUND', 404],
    ['CONFLICT', 409],
    ['REOPEN_UNAVAILABLE', 409],
    ['ALREADY_APPLIED', 200],
  ] as const)('maps %s', async (outcome, status) => {
    fake.change.mockResolvedValue({ outcome });
    expect((await trainingLifecycleResponse(request(body), 'training', id)).status).toBe(status);
  });
  it('rejects oversized JSON', async () => {
    expect(
      (
        await trainingLifecycleResponse(
          request({ ...body, reason: 'x'.repeat(5000) }),
          'training',
          id,
        )
      ).status,
    ).toBe(413);
    expect(fake.change).not.toHaveBeenCalled();
  });
});
