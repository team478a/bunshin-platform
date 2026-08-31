/* eslint-disable @typescript-eslint/unbound-method */
import { describe, expect, it, vi } from 'vitest';
import {
  CompleteJob,
  ExecuteVideoRenderJob,
  ExecuteVideoRenderStep,
  FailJob,
  type Job,
  type JobRepository,
  type VideoProjectRecord,
  type VideoRenderRecord,
  type VideoRenderRepository,
} from '../src';

const now = new Date('2026-08-27T12:00:00Z');
const workspaceId = '11111111-1111-4111-8111-111111111111';
const renderId = '22222222-2222-4222-8222-222222222222';
const render = (status: VideoRenderRecord['status'] = 'QUEUED'): VideoRenderRecord => ({
  id: renderId,
  workspaceId,
  groupId: '33333333-3333-4333-8333-333333333333',
  groupMembershipId: '44444444-4444-4444-8444-444444444444',
  ownerUserId: '55555555-5555-4555-8555-555555555555',
  videoProjectId: '66666666-6666-4666-8666-666666666666',
  projectRevision: 2,
  provider: 'CREATOMATE',
  status,
  externalJobId: status === 'QUEUED' ? null : 'external-1',
  outputStorageKey: null,
  errorCode: null,
  startedAt: null,
  completedAt: null,
  createdAt: now,
  updatedAt: now,
});
const project = (): VideoProjectRecord => ({
  id: render().videoProjectId,
  workspaceId,
  groupId: render().groupId,
  groupMembershipId: render().groupMembershipId,
  ownerUserId: render().ownerUserId,
  bunshinId: '77777777-7777-4777-8777-777777777777',
  campaignId: null,
  characterProfileVersionId: null,
  characterProfileSnapshot: {},
  characterReferenceSnapshot: [],
  title: '動画',
  platform: 'INSTAGRAM',
  type: 'EXPLAINER',
  durationSeconds: 30,
  status: 'QUEUED',
  revision: 2,
  aiProcessingTypes: [],
  disclosureSnapshot: {},
  standardComposition: true,
  aiVideoSceneCount: 0,
  scenes: [],
  createdAt: now,
  updatedAt: now,
});
const repository = (value: VideoRenderRecord): VideoRenderRepository => ({
  enqueueApproved: vi.fn(),
  findForExecution: vi.fn().mockResolvedValue({ render: value, project: project() }),
  markSubmitted: vi.fn().mockResolvedValue({ ...value, status: 'SUBMITTED', externalJobId: 'job' }),
  markRendering: vi.fn().mockResolvedValue({ ...value, status: 'RENDERING' }),
  markSucceeded: vi
    .fn()
    .mockResolvedValue({ ...value, status: 'SUCCEEDED', outputStorageKey: 'safe/output.mp4' }),
  markFailed: vi.fn().mockResolvedValue({ ...value, status: 'FAILED' }),
});

describe('video render execution', () => {
  it('submits a queued render without downloading an output prematurely', async () => {
    const values = repository(render());
    const provider = {
      submit: vi.fn().mockResolvedValue({ externalJobId: 'job' }),
      inspect: vi.fn(),
    };
    const storage = { store: vi.fn() };
    const webhook = { createUrl: vi.fn().mockResolvedValue('https://app.example/webhook') };
    await expect(
      new ExecuteVideoRenderStep(values, provider, storage, webhook).execute({
        workspaceId,
        renderId,
      }),
    ).resolves.toMatchObject({ status: 'PENDING' });
    expect(provider.submit).toHaveBeenCalledWith({
      renderId,
      project: expect.objectContaining({ id: render().videoProjectId }),
      webhookUrl: 'https://app.example/webhook',
    });
    expect(values.markSubmitted).toHaveBeenCalledWith({
      workspaceId,
      renderId,
      externalJobId: 'job',
    });
    expect(storage.store).not.toHaveBeenCalled();
  });

  it('snapshots a succeeded provider output into private storage before completion', async () => {
    const values = repository(render('RENDERING'));
    const provider = {
      submit: vi.fn(),
      inspect: vi
        .fn()
        .mockResolvedValue({ status: 'SUCCEEDED', outputUrl: 'https://cdn.creatomate.com/a.mp4' }),
    };
    const storage = { store: vi.fn().mockResolvedValue({ storageKey: 'safe/output.mp4' }) };
    await expect(
      new ExecuteVideoRenderStep(values, provider, storage, { createUrl: vi.fn() }).execute({
        workspaceId,
        renderId,
      }),
    ).resolves.toMatchObject({ status: 'SUCCEEDED' });
    expect(storage.store).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId,
        renderId,
        sourceUrl: expect.stringContaining('https://'),
      }),
    );
    expect(values.markSucceeded).toHaveBeenCalledWith({
      workspaceId,
      renderId,
      outputStorageKey: 'safe/output.mp4',
    });
  });
});

const job: Job = {
  id: 'job-1',
  workspaceId,
  bunshinId: null,
  capabilityType: null,
  environment: 'PRODUCTION',
  correlationId: 'correlation',
  requestedBy: render().ownerUserId,
  jobType: 'VIDEO_RENDER_PROCESS',
  payloadReference: `video-render:${renderId}`,
  idempotencyKey: `video-render:${renderId}`,
  status: 'LEASED',
  priority: 40,
  scheduledAt: now,
  attemptCount: 1,
  maxAttempts: 12,
  leaseOwner: 'worker',
  leaseExpiresAt: now,
  nextRetryAt: null,
  lastErrorCategory: null,
  completedAt: null,
  cancelledAt: null,
  createdAt: now,
  updatedAt: now,
};

it('schedules another job attempt while the provider is still rendering', async () => {
  const jobs: JobRepository = {
    enqueue: vi.fn(),
    claim: vi.fn(),
    complete: vi.fn(),
    fail: vi.fn((input) =>
      Promise.resolve({
        ...job,
        status: 'RETRY_SCHEDULED' as const,
        lastErrorCategory: input.failure.errorCategory,
      }),
    ),
    cancel: vi.fn(),
  };
  const handler = {
    execute: vi.fn().mockResolvedValue({ status: 'PENDING' }),
    markFailed: vi.fn(),
  };
  await expect(
    new ExecuteVideoRenderJob(handler, new CompleteJob(jobs), new FailJob(jobs, () => now)).execute(
      job,
      'worker',
    ),
  ).resolves.toMatchObject({ status: 'RETRY_SCHEDULED' });
  expect(handler.markFailed).not.toHaveBeenCalled();
});
