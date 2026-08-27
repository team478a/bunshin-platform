import { describe, expect, it, vi } from 'vitest';
import {
  CreateVideoProject,
  ApproveVideoPlan,
  GetVideoProject,
  QueueVideoRender,
  ReplaceVideoPlan,
  type VideoProjectRecord,
  type VideoProjectRepository,
  type VideoRenderRepository,
} from '../src';

const ids = {
  workspaceId: '11111111-1111-4111-8111-111111111111',
  groupId: '22222222-2222-4222-8222-222222222222',
  groupMembershipId: '33333333-3333-4333-8333-333333333333',
  actorUserId: '44444444-4444-4444-8444-444444444444',
  bunshinId: '55555555-5555-4555-8555-555555555555',
  videoProjectId: '66666666-6666-4666-8666-666666666666',
};

const now = new Date('2026-08-27T00:00:00.000Z');
const project = (): VideoProjectRecord => ({
  id: ids.videoProjectId,
  workspaceId: ids.workspaceId,
  groupId: ids.groupId,
  groupMembershipId: ids.groupMembershipId,
  ownerUserId: ids.actorUserId,
  bunshinId: ids.bunshinId,
  campaignId: null,
  title: '商品を30秒で紹介する動画',
  platform: 'INSTAGRAM',
  type: 'PRODUCT_INTRODUCTION',
  durationSeconds: 30,
  status: 'DRAFT',
  revision: 1,
  aiProcessingTypes: ['SCRIPT_GENERATION'],
  disclosureSnapshot: {},
  standardComposition: true,
  aiVideoSceneCount: 0,
  scenes: [],
  createdAt: now,
  updatedAt: now,
});

const repository = (overrides: Partial<VideoProjectRepository> = {}): VideoProjectRepository => ({
  create: vi.fn().mockResolvedValue(project()),
  findOwned: vi.fn().mockResolvedValue(project()),
  replacePlan: vi.fn().mockResolvedValue({ ...project(), status: 'WAITING_APPROVAL', revision: 2 }),
  approvePlan: vi.fn().mockResolvedValue({ ...project(), status: 'APPROVED', revision: 3 }),
  ...overrides,
});

const planInput = (): Parameters<VideoProjectRepository['replacePlan']>[0] => ({
  workspaceId: ids.workspaceId,
  groupId: ids.groupId,
  actorUserId: ids.actorUserId,
  videoProjectId: ids.videoProjectId,
  expectedRevision: 1,
  scenes: Array.from({ length: 5 }, (_, index) => ({
    sceneNo: index + 1,
    durationMs: 6_000,
    narration: `場面${index + 1}の説明`,
    caption: `場面${index + 1}`,
    visualType: 'TEXT_MOTION',
    visualPrompt: null,
    keywords: ['商品'],
    aiProcessingTypes: [],
    locked: false,
  })),
  projectAiProcessingTypes: ['SCRIPT_GENERATION'],
  standardComposition: true,
  aiVideoSceneCount: 0,
});

describe('Video Core', () => {
  it('creates a group-scoped project only when the repository authorizes it', async () => {
    const value = repository();
    await expect(
      new CreateVideoProject(value).execute({
        ...ids,
        campaignId: null,
        title: ' 商品を30秒で紹介する動画 ',
        platform: 'INSTAGRAM',
        type: 'PRODUCT_INTRODUCTION',
        durationSeconds: 30,
        aiProcessingTypes: ['SCRIPT_GENERATION'],
        disclosureSnapshot: {},
      }),
    ).resolves.toMatchObject({ id: ids.videoProjectId, groupId: ids.groupId });
  });

  it('does not reveal a project outside the caller scope', async () => {
    const value = repository({ findOwned: vi.fn().mockResolvedValue(null) });
    await expect(
      new GetVideoProject(value).execute({
        workspaceId: ids.workspaceId,
        groupId: ids.groupId,
        actorUserId: ids.actorUserId,
        videoProjectId: ids.videoProjectId,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('accepts a standard 30-second plan with five consecutive scenes', async () => {
    await expect(new ReplaceVideoPlan(repository()).execute(planInput())).resolves.toMatchObject({
      status: 'WAITING_APPROVAL',
      revision: 2,
    });
  });

  it('rejects AI video scenes in standard composition', async () => {
    const input = planInput();
    const firstScene = input.scenes[0]!;
    input.scenes[0] = {
      ...firstScene,
      visualType: 'AI_VIDEO',
      aiProcessingTypes: ['VIDEO_GENERATION'],
    };
    input.aiVideoSceneCount = 1;
    await expect(new ReplaceVideoPlan(repository()).execute(input)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('rejects plans with a wrong total duration or non-consecutive scene numbers', async () => {
    const wrongDuration = planInput();
    wrongDuration.scenes[0]!.durationMs = 5_000;
    await expect(new ReplaceVideoPlan(repository()).execute(wrongDuration)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });

    const missingNumber = planInput();
    missingNumber.scenes[4]!.sceneNo = 6;
    await expect(new ReplaceVideoPlan(repository()).execute(missingNumber)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('approves only the expected reviewed revision', async () => {
    const approvePlan = vi
      .fn<VideoProjectRepository['approvePlan']>()
      .mockResolvedValue({ ...project(), status: 'APPROVED', revision: 3 });
    const value = repository({ approvePlan });
    await expect(
      new ApproveVideoPlan(value).execute({
        workspaceId: ids.workspaceId,
        groupId: ids.groupId,
        actorUserId: ids.actorUserId,
        videoProjectId: ids.videoProjectId,
        expectedRevision: 2,
      }),
    ).resolves.toMatchObject({ status: 'APPROVED', revision: 3 });
    expect(approvePlan).toHaveBeenCalledWith(
      expect.objectContaining({ videoProjectId: ids.videoProjectId, expectedRevision: 2 }),
    );
  });

  it('fails closed when approval scope or revision no longer matches', async () => {
    const value = repository({ approvePlan: vi.fn().mockResolvedValue(null) });
    await expect(
      new ApproveVideoPlan(value).execute({
        workspaceId: ids.workspaceId,
        groupId: ids.groupId,
        actorUserId: ids.actorUserId,
        videoProjectId: ids.videoProjectId,
        expectedRevision: 2,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('queues an approved revision through a provider-neutral repository', async () => {
    const render: VideoRenderRepository = {
      enqueueApproved: vi.fn().mockResolvedValue({
        id: '77777777-7777-4777-8777-777777777777',
        workspaceId: ids.workspaceId,
        groupId: ids.groupId,
        groupMembershipId: ids.groupMembershipId,
        ownerUserId: ids.actorUserId,
        videoProjectId: ids.videoProjectId,
        projectRevision: 3,
        provider: 'provider-a',
        status: 'QUEUED',
        externalJobId: null,
        outputStorageKey: null,
        errorCode: null,
        createdAt: now,
        startedAt: null,
        completedAt: null,
        updatedAt: now,
      }),
      findForExecution: vi.fn(),
      markSubmitted: vi.fn(),
      markRendering: vi.fn(),
      markSucceeded: vi.fn(),
      markFailed: vi.fn(),
    };
    await expect(
      new QueueVideoRender(render).execute({
        workspaceId: ids.workspaceId,
        groupId: ids.groupId,
        actorUserId: ids.actorUserId,
        videoProjectId: ids.videoProjectId,
        expectedRevision: 3,
        provider: ' provider-a ',
      }),
    ).resolves.toMatchObject({ status: 'QUEUED', provider: 'provider-a' });
  });
});
