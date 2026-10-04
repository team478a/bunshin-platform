import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReviewImprovementFeedbackCandidate } from '@bunshin/application';
import { ApplicationError } from '@bunshin/shared';
const fake = vi.hoisted(() => ({ create: vi.fn(), construct: vi.fn() }));
vi.mock('@bunshin/config', () => ({
  getServerEnvironment: () => ({
    APP_ENV: 'development',
    SESSION_SECRET: 'synthetic-only-session-secret-32-bytes',
  }),
}));
vi.mock('@bunshin/database', () => ({
  prisma: {},
  PrismaImprovementFeedbackTriageRepository: class {
    constructor(client: unknown, scope: unknown) {
      fake.construct(client, scope);
    }
    createCandidate = fake.create;
  },
}));
import { executeFeedbackReview } from '../src/services/improvement-feedback-review';
import {
  openFeedbackReviewHandle,
  sealFeedbackReviewHandle,
  type FeedbackReviewHandle,
} from '../src/services/improvement-feedback-review-handle';
const secret = 'synthetic-only-session-secret-32-bytes';
const now = new Date('2026-10-03T01:30:00Z');
const actorUserId = '00000000-0000-4000-8000-000000000001';
const workspaceId = '00000000-0000-4000-8000-000000000002';
const serviceId = '00000000-0000-4000-8000-000000000003';
const candidateId = '00000000-0000-4000-8000-000000000004';
const value: FeedbackReviewHandle = {
  version: 'feedback-review-handle-v1',
  actorUserId,
  workspaceId,
  serviceId,
  environment: 'DEVELOPMENT',
  week: '2026-09-21',
  clusterRef: 'a'.repeat(64),
  windowRevision: 'b'.repeat(64),
  bucketRevision: 'c'.repeat(64),
  issuedAt: now.getTime(),
  expiresAt: now.getTime() + 600_000,
  review: null,
};
const input = { actorUserId, workspaceId, serviceId };
const prepare = (v = value) =>
  executeFeedbackReview({
    ...input,
    command: { action: 'PREPARE', handle: sealFeedbackReviewHandle(v, secret) },
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('external communication forbidden');
    }),
  );
  fake.create.mockResolvedValue({
    id: candidateId,
    state: 'OPEN',
    candidateRevision: 1,
    windowEvidenceRevision: value.windowRevision,
    bucketEvidenceRevision: value.bucketRevision,
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe('feedback review server composition (repository safety covered by existing integration suite)', () => {
  it('creates only on explicit prepare and returns an opaque pinned operation, not raw evidence', async () => {
    const result = await prepare();
    expect(fake.create).toHaveBeenCalledWith({
      actorUserId,
      weekStart: new Date('2026-09-20T15:00:00Z'),
      clusterRef: value.clusterRef,
    });
    expect(result.state).toBe('OPEN');
    const opened = openFeedbackReviewHandle(result.handle!, secret, now);
    expect(opened.review).toMatchObject({ candidateId, revision: 1 });
    expect(opened.expiresAt).toBe(value.expiresAt);
    const serialized = JSON.stringify(result);
    for (const text of [candidateId, value.windowRevision, 'operationKey', actorUserId])
      expect(serialized).not.toContain(text);
  });
  it.each(['actorUserId', 'workspaceId', 'serviceId', 'environment'] as const)(
    'rejects a handle belonging to another %s before DB construction',
    async (field) => {
      const changed = {
        ...value,
        [field]: field === 'environment' ? 'STAGING' : '00000000-0000-4000-8000-000000000099',
      } as FeedbackReviewHandle;
      await expect(prepare(changed)).rejects.toThrow('unavailable');
      expect(fake.construct).not.toHaveBeenCalled();
    },
  );
  it('rejects expiry/ongoing week and changed evidence, without executing review', async () => {
    const execute = vi.spyOn(ReviewImprovementFeedbackCandidate.prototype, 'execute');
    await expect(prepare({ ...value, expiresAt: now.getTime() })).rejects.toThrow();
    await expect(prepare({ ...value, week: '2026-09-28' })).rejects.toThrow();
    fake.create.mockResolvedValue({
      state: 'OPEN',
      windowEvidenceRevision: 'd'.repeat(64),
      bucketEvidenceRevision: value.bucketRevision,
    });
    await expect(prepare()).rejects.toThrow('evidence changed');
    expect(execute).not.toHaveBeenCalled();
  });
  it.each(['REVIEWED', 'DISMISSED'])(
    'reports existing %s without a new action handle',
    async (state) => {
      fake.create.mockResolvedValue({
        state,
        windowEvidenceRevision: value.windowRevision,
        bucketEvidenceRevision: value.bucketRevision,
      });
      expect(await prepare()).toEqual({ state, handle: null });
    },
  );
  it('keeps the same operation and revision after response loss; forwards to the existing review use case', async () => {
    const prepared = await prepare();
    const pinned = openFeedbackReviewHandle(prepared.handle!, secret, now);
    const execute = vi
      .spyOn(ReviewImprovementFeedbackCandidate.prototype, 'execute')
      .mockResolvedValue({ candidateId, candidateRevision: 2, state: 'REVIEWED' });
    const command = {
      action: 'MARK_REVIEWED' as const,
      handle: prepared.handle!,
      reasonCode: 'REVIEW_COMPLETED' as const,
      confirmation: 'RECORD_REVIEW' as const,
    };
    await executeFeedbackReview({ ...input, command });
    await executeFeedbackReview({ ...input, command });
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls[0]).toEqual(execute.mock.calls[1]);
    expect(execute.mock.calls[0]![0]).toMatchObject({
      actorUserId,
      candidateId,
      operationKey: pinned.review!.operationKey,
      expectedCandidateRevision: 1,
      expectedWindowEvidenceRevision: value.windowRevision,
      expectedBucketEvidenceRevision: value.bucketRevision,
    });
    expect(fake.create).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
    // This checks transport mapping, not audit cardinality; real use case/DB tests cover that.
  });
  it('does not treat repository or use case failures as success', async () => {
    fake.create.mockRejectedValue(new ApplicationError('NOT_FOUND', 'revoked'));
    await expect(prepare()).rejects.toThrow('revoked');
  });
});
