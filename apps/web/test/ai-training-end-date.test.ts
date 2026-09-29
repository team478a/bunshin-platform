import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@bunshin/shared';
const fake = vi.hoisted(() => ({
  actor: vi.fn(),
  origin: vi.fn(),
  service: vi.fn(),
  preview: vi.fn(),
  confirm: vi.fn(),
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: fake.actor }),
}));
vi.mock('../src/auth/request-security', () => ({ requireSameOrigin: fake.origin }));
vi.mock('../src/services/public-service', () => ({ resolveManagedServiceContext: fake.service }));
vi.mock('@bunshin/database', () => ({
  PrismaTrainingEndDateRepository: class {
    preview = fake.preview;
    confirm = fake.confirm;
  },
}));
import { trainingEndDateResponse } from '../src/http/ai-training-end-date';
const id = '11111111-1111-4111-8111-111111111111';
const preview = {
  mode: 'PREVIEW',
  endedAt: '2025-08-01T00:00:00.000Z',
  reason: 'Verified end notice',
};
const confirm = {
  ...preview,
  mode: 'CONFIRM',
  revision: 'a'.repeat(64),
  operationId: id,
  confirmation: 'CONFIRM_TRAINING_END_DATE',
};
const request = (body: unknown) =>
  new Request('https://app.example.com', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
describe('training end date HTTP isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fake.actor.mockResolvedValue({ userId: 'manager' });
    fake.origin.mockImplementation(() => {});
    fake.service.mockResolvedValue({ workspaceId: 'w', serviceId: 'g' });
    fake.preview.mockResolvedValue({ outcome: 'PREVIEW', preview: { revision: 'a'.repeat(64) } });
    fake.confirm.mockResolvedValue({ outcome: 'APPLIED' });
  });
  it('derives scope and actor server-side and separates preview from mutation', async () => {
    const response = await trainingEndDateResponse(request(preview), 'training', id);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(fake.preview).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'w',
        groupId: 'g',
        actorUserId: 'manager',
        programEnrollmentId: id,
        endedAt: new Date(preview.endedAt),
      }),
    );
    expect(fake.confirm).not.toHaveBeenCalled();
    expect((await trainingEndDateResponse(request(confirm), 'training', id)).status).toBe(200);
    expect(fake.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ revision: confirm.revision, operationId: id }),
    );
  });
  it('rejects foreign service, session loss and origin before repository access', async () => {
    fake.service.mockRejectedValue(new Error('SERVICE_NOT_FOUND'));
    expect((await trainingEndDateResponse(request(preview), 'foreign', id)).status).toBe(404);
    fake.actor.mockResolvedValue(null);
    expect((await trainingEndDateResponse(request(preview), 'training', id)).status).toBe(401);
    fake.origin.mockImplementation(() => {
      throw new ApplicationError('FORBIDDEN', 'origin rejected');
    });
    expect((await trainingEndDateResponse(request(preview), 'training', id)).status).toBe(403);
    expect(fake.preview).not.toHaveBeenCalled();
    expect(fake.confirm).not.toHaveBeenCalled();
  });
  it.each([
    { ...preview, workspaceId: 'spoof' },
    { ...preview, actorUserId: 'spoof' },
    { ...preview, reason: ' ' },
    { ...preview, endedAt: '2025-02-30T00:00:00Z' },
    { ...preview, endedAt: '2025-08-01T09:00' },
    { ...confirm, revision: 'bad' },
    { ...confirm, confirmation: 'wrong' },
    { ...confirm, operationId: 'bad' },
    { ...preview, mode: 'BULK' },
  ])('rejects invalid/extra inputs', async (body) => {
    expect((await trainingEndDateResponse(request(body), 'training', id)).status).toBe(400);
    expect(fake.preview).not.toHaveBeenCalled();
    expect(fake.confirm).not.toHaveBeenCalled();
  });
  it.each([
    ['FORBIDDEN', 403],
    ['NOT_FOUND', 404],
    ['CONFLICT', 409],
    ['INVALID_DATE', 400],
    ['ALREADY_APPLIED', 200],
  ] as const)('maps %s', async (outcome, status) => {
    fake.confirm.mockResolvedValue({ outcome });
    expect((await trainingEndDateResponse(request(confirm), 'training', id)).status).toBe(status);
  });
  it('rejects oversize, broken JSON and invalid enrollment ID', async () => {
    expect(
      (
        await trainingEndDateResponse(
          request({ ...preview, reason: 'x'.repeat(5000) }),
          'training',
          id,
        )
      ).status,
    ).toBe(413);
    expect((await trainingEndDateResponse(request(preview), 'training', 'wrong')).status).toBe(400);
    const broken = new Request('https://app.example.com', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });
    expect((await trainingEndDateResponse(broken, 'training', id)).status).toBe(400);
    expect(fake.preview).not.toHaveBeenCalled();
    expect(fake.confirm).not.toHaveBeenCalled();
  });
  it('does not disclose DB exception messages', async () => {
    fake.preview.mockRejectedValue(new Error('PRIVATE_DB_SECRET'));
    const response = await trainingEndDateResponse(request(preview), 'training', id);
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('PRIVATE_DB_SECRET');
  });
});
