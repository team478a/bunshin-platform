import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  user: null as { userId: string } | null,
  resolve: vi.fn(),
  preview: vi.fn(),
  remove: vi.fn(),
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: () => Promise.resolve(state.user) }),
}));
vi.mock('../src/services/public-service', () => ({ resolveMemberServiceContext: state.resolve }));
vi.mock('@bunshin/database', () => ({
  PrismaTrainingPersonalDataDeletionRepository: class {
    preview = state.preview;
    delete = state.remove;
  },
  prisma: {},
}));
import { trainingPersonalDataDeletionResponse } from '../src/http/ai-training-personal-data-deletion';
const enrollmentId = '00000000-0000-4000-8000-000000000104';
const request = (body: unknown, origin = 'http://localhost:3000') =>
  new Request('http://localhost:3000/api/delete', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const deletion = {
  target: { kind: 'ALL' },
  revision: 'a'.repeat(64),
  confirmation: 'DELETE_TRAINING_DATA',
};
describe('training deletion HTTP', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const [key, value] of Object.entries({
      APP_ENV: 'development',
      APP_URL: 'http://localhost:3000',
      DATABASE_URL: 'postgresql://local',
      DIRECT_URL: 'postgresql://local',
      SESSION_SECRET: '12345678901234567890123456789012',
    }))
      vi.stubEnv(key, value);
    state.user = { userId: 'user-a' };
    state.resolve.mockResolvedValue({ workspaceId: 'workspace-a', serviceId: 'group-a' });
    state.preview.mockResolvedValue({
      outcome: 'PREVIEW',
      preview: { revision: 'a'.repeat(64), counts: { answers: 1 }, answers: [] },
    });
    state.remove.mockResolvedValue({ outcome: 'DELETED', counts: { answers: 1 } });
  });
  it('returns only a no-store preview and never calls delete on preview', async () => {
    const result = await trainingPersonalDataDeletionResponse(
      request({ target: { kind: 'ALL' } }),
      'training',
      enrollmentId,
      'preview',
    );
    expect(result.status).toBe(200);
    expect(result.headers.get('cache-control')).toBe('private, no-store');
    expect(state.preview).toHaveBeenCalledWith({
      workspaceId: 'workspace-a',
      groupId: 'group-a',
      actorUserId: 'user-a',
      programEnrollmentId: enrollmentId,
      target: { kind: 'ALL' },
    });
    expect(state.remove).not.toHaveBeenCalled();
  });
  it('requires a checked confirmation/revision and scopes deletion to the current actor', async () => {
    expect(
      (
        await trainingPersonalDataDeletionResponse(
          request(deletion),
          'training',
          enrollmentId,
          'delete',
        )
      ).status,
    ).toBe(200);
    expect(state.remove).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'user-a',
        workspaceId: 'workspace-a',
        groupId: 'group-a',
        revision: 'a'.repeat(64),
        now: expect.any(Date),
      }),
    );
    state.remove.mockClear();
    for (const body of [
      { target: { kind: 'ALL' } },
      { ...deletion, confirmation: false },
      { ...deletion, revision: 'bad' },
      { ...deletion, userId: 'other' },
      { ...deletion, target: { kind: 'ANSWER', answerId: 'bad' } },
    ])
      expect(
        (
          await trainingPersonalDataDeletionResponse(
            request(body),
            'training',
            enrollmentId,
            'delete',
          )
        ).status,
      ).toBe(400);
    expect(state.remove).not.toHaveBeenCalled();
  });
  it('denies unauthenticated/cross-origin/invalid paths before the repository', async () => {
    state.user = null;
    expect(
      (
        await trainingPersonalDataDeletionResponse(
          request(deletion),
          'training',
          enrollmentId,
          'delete',
        )
      ).status,
    ).toBe(401);
    state.user = { userId: 'user-a' };
    expect(
      (
        await trainingPersonalDataDeletionResponse(
          request(deletion, 'https://evil.example'),
          'training',
          enrollmentId,
          'delete',
        )
      ).status,
    ).toBe(403);
    expect(
      (await trainingPersonalDataDeletionResponse(request(deletion), 'training', 'bad', 'delete'))
        .status,
    ).toBe(400);
    expect(state.remove).not.toHaveBeenCalled();
  });
  it('maps stale/missing/oversize/errors without exposing database messages', async () => {
    for (const [outcome, status] of [
      ['CONFLICT', 409],
      ['NOT_FOUND', 404],
      ['TOO_LARGE', 413],
    ] as const) {
      state.remove.mockResolvedValue({ outcome });
      expect(
        (
          await trainingPersonalDataDeletionResponse(
            request(deletion),
            'training',
            enrollmentId,
            'delete',
          )
        ).status,
      ).toBe(status);
    }
    state.remove.mockRejectedValue(new Error('PRIVATE DATABASE DETAIL'));
    const result = await trainingPersonalDataDeletionResponse(
      request(deletion),
      'training',
      enrollmentId,
      'delete',
    );
    expect(result.status).toBe(500);
    expect(await result.text()).not.toContain('PRIVATE DATABASE DETAIL');
  });
});
