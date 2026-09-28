import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  user: null as { userId: string } | null,
  resolve: vi.fn(),
  read: vi.fn(),
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: () => Promise.resolve(state.user) }),
}));
vi.mock('../src/services/public-service', () => ({ resolveMemberServiceContext: state.resolve }));
vi.mock('@bunshin/database', () => ({
  PrismaTrainingPersonalDataExportRepository: class {
    read = state.read;
  },
  prisma: {},
}));
import { exportAiTrainingPersonalDataResponse } from '../src/http/ai-training-personal-data';

const enrollmentId = '00000000-0000-4000-8000-000000000104';
const request = (body = '{}', origin = 'http://localhost:3000', type = 'application/json') =>
  new Request('http://localhost:3000/api/export', {
    method: 'POST',
    headers: { origin, 'content-type': type },
    body,
  });
describe('personal training export HTTP', () => {
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
    state.read.mockResolvedValue({
      outcome: 'FOUND',
      data: {
        enrollment: { id: enrollmentId },
        profile: null,
        progress: null,
        answers: [{ answer: '本人の回答' }],
        assignments: [],
        activities: [],
        toolkit: [],
        goals: [],
      },
    });
  });
  it('returns a no-store JSON attachment scoped to the logged-in participant', async () => {
    const response = await exportAiTrainingPersonalDataResponse(
      request(),
      'training',
      enrollmentId,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('content-disposition')).toMatch(
      /^attachment; filename="ai-training-data-\d{4}-\d{2}-\d{2}\.json"$/,
    );
    expect(state.resolve).toHaveBeenCalledWith('training', 'user-a');
    expect(state.read).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-a',
        groupId: 'group-a',
        actorUserId: 'user-a',
        programEnrollmentId: enrollmentId,
      }),
    );
    expect(await response.json()).toMatchObject({
      schemaVersion: 1,
      answers: [{ answer: '本人の回答' }],
    });
  });
  it('rejects unauthenticated and cross-origin downloads before resolving data', async () => {
    state.user = null;
    expect(
      (await exportAiTrainingPersonalDataResponse(request(), 'training', enrollmentId)).status,
    ).toBe(401);
    state.user = { userId: 'user-a' };
    expect(
      (
        await exportAiTrainingPersonalDataResponse(
          request('{}', 'https://evil.example'),
          'training',
          enrollmentId,
        )
      ).status,
    ).toBe(403);
    expect(state.read).not.toHaveBeenCalled();
  });
  it('rejects invalid paths, malformed JSON, ownership injection and wrong content types', async () => {
    expect((await exportAiTrainingPersonalDataResponse(request(), 'training', 'bad')).status).toBe(
      400,
    );
    for (const body of ['{', 'null', '[]', '{"userId":"user-b"}'])
      expect(
        (await exportAiTrainingPersonalDataResponse(request(body), 'training', enrollmentId))
          .status,
      ).toBe(400);
    expect(
      (
        await exportAiTrainingPersonalDataResponse(
          request('{}', 'http://localhost:3000', 'text/plain'),
          'training',
          enrollmentId,
        )
      ).status,
    ).toBe(400);
    expect(state.read).not.toHaveBeenCalled();
  });
  it('does not attach a successful download for another owner or an oversized export', async () => {
    state.read.mockResolvedValue({ outcome: 'NOT_FOUND' });
    expect(
      (await exportAiTrainingPersonalDataResponse(request(), 'training', enrollmentId)).status,
    ).toBe(404);
    state.read.mockResolvedValue({ outcome: 'TOO_LARGE' });
    const response = await exportAiTrainingPersonalDataResponse(
      request(),
      'training',
      enrollmentId,
    );
    expect(response.status).toBe(413);
    expect(response.headers.get('content-disposition')).toBeNull();
  });
  it('does not leak database details or produce an empty file on failure', async () => {
    state.read.mockRejectedValue(new Error('private detail'));
    const response = await exportAiTrainingPersonalDataResponse(
      request(),
      'training',
      enrollmentId,
    );
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('private detail');
  });
});
