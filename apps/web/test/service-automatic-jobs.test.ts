import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@bunshin/shared';
import type * as ServiceDailyIdeaFallback from '../src/services/service-daily-idea-fallback';

const m = vi.hoisted(() => ({
  scope: vi.fn(),
  week: vi.fn(),
  confirm: vi.fn(),
  knowledge: vi.fn(),
  daily: vi.fn(),
  prepare: vi.fn(),
  enqueue: vi.fn(),
  reminder: vi.fn(),
  policy: vi.fn(),
  image: vi.fn(),
  video: vi.fn(),
  fallback: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@bunshin/database', () => ({
  prisma: { serviceRegistrationPolicy: { findFirst: m.policy } },
  PrismaMissionAutomationScopeRepository: class {
    resolveScope = m.scope;
  },
  PrismaWeeklyPlanRepository: class {},
  PrismaBunshinCapabilityAssignmentRepository: class {},
  PrismaLineReturnReminderRepository: class {
    shouldUse = m.reminder;
  },
  PrismaLineMessageDeliveryRepository: class {},
  PrismaJobRepository: class {},
}));
vi.mock('@bunshin/capability-social', () => ({
  ConfirmWeeklyPlan: class {
    execute = m.confirm;
  },
}));
vi.mock('@bunshin/application', () => ({
  EnqueueJob: class {
    enqueue = m.enqueue;
  },
  PrepareLineMissionDelivery: class {
    execute = m.prepare;
  },
}));
vi.mock('../src/services/weekly-plan-generation', () => ({
  createWeeklyPlanGenerationService: () => Promise.resolve({ execute: m.week }),
}));
vi.mock('../src/services/daily-mission-generation', () => ({
  createDailyMissionGenerationService: () => ({ execute: m.daily }),
}));
vi.mock('../src/services/service-daily-idea-fallback', async (importOriginal) => {
  const actual = await importOriginal<typeof ServiceDailyIdeaFallback>();
  return { ...actual, createServiceDailyIdeaFallback: m.fallback };
});
vi.mock('../src/services/automatic-daily-image', () => ({
  queueAutomaticDailyImage: m.image,
}));
vi.mock('../src/services/automatic-daily-video', () => ({
  queueAutomaticDailyVideo: m.video,
}));
vi.mock('../src/services/service-generation-knowledge', () => ({
  loadServiceGenerationKnowledge: m.knowledge,
  resolveServiceContentAssistanceLevel: () => Promise.resolve('READY_TO_USE'),
}));
vi.mock('../src/activity-continuity-rule', () => ({
  currentActivityContinuityRule: () => Promise.resolve({ dormancyDays: 7 }),
}));
import { createDailyMissionJobHandler } from '../src/jobs/daily-mission-job-handler';
import { createWeeklyPlanJobHandler } from '../src/jobs/weekly-plan-job-handler';

const job = {
  id: 'job',
  workspaceId: 'workspace',
  bunshinId: 'bunshin',
  requestedBy: 'member',
  environment: 'PRODUCTION',
  idempotencyKey: 'key',
  correlationId: 'request',
} as never;
const scope = {
  workspaceId: 'workspace',
  bunshinId: 'bunshin',
  actorUserId: 'member',
  groupId: 'service',
};
describe('service automatic preparation and delivery', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    m.scope.mockResolvedValue(scope);
    m.knowledge.mockResolvedValue({
      officialKnowledge: [{ title: 'Official', type: 'SERVICE', content: 'Facts' }],
    });
    m.week.mockResolvedValue({
      plan: { id: 'plan', status: 'DRAFT', items: [{ scheduledDate: '2026-09-07' }] },
    });
    m.confirm.mockResolvedValue({
      id: 'plan',
      status: 'CONFIRMED',
      items: [{ scheduledDate: '2026-09-07' }],
    });
    m.daily.mockResolvedValue({ id: 'mission' });
    m.fallback.mockResolvedValue({ id: 'fallback-mission' });
    m.prepare.mockResolvedValue({ id: 'delivery' });
    m.policy.mockResolvedValue(null);
    m.image.mockResolvedValue({ status: 'SKIPPED', reason: 'NOT_ELIGIBLE' });
  });
  it('queues an opted-in commercial image before preparing the LINE delivery', async () => {
    m.policy.mockResolvedValue({
      onboardingConfig: {
        dailyIdeaDelivery: {
          enabled: true,
          cadence: 'DAILY',
          defaultNotificationTime: '08:00',
          lockCadence: true,
          contentMode: 'READY_TO_USE',
          mediaMode: 'IMAGE',
        },
      },
      surveyConfig: null,
    });
    const mission = {
      id: 'mission',
      format: 'IMAGE',
      assistanceLevel: 'READY_TO_USE',
      topic: 'topic',
      angle: 'angle',
    };
    m.daily.mockResolvedValue(mission);
    await createDailyMissionJobHandler().execute({ job, localDate: '2026-09-07' });
    expect(m.image).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: 'service', mission, mediaMode: 'IMAGE' }),
    );
    expect(m.image.mock.invocationCallOrder[0]).toBeLessThan(
      m.prepare.mock.invocationCallOrder[0]!,
    );
  });
  it('waits for new carousel images before preparing the matching video', async () => {
    m.policy.mockResolvedValue({
      onboardingConfig: {
        dailyIdeaDelivery: {
          enabled: true,
          cadence: 'DAILY',
          defaultNotificationTime: '08:00',
          lockCadence: true,
          contentMode: 'READY_TO_USE',
          mediaMode: 'IMAGE_AND_VIDEO',
        },
      },
      surveyConfig: null,
    });
    m.image.mockResolvedValue({ status: 'QUEUED', requestId: 'image-request' });
    await createDailyMissionJobHandler().execute({ job, localDate: '2026-09-07' });
    expect(m.video).not.toHaveBeenCalled();
  });
  it('passes the service voice choice into a video backed by completed carousel images', async () => {
    const videoNarration = { enabled: true, voice: 'coral', speed: 'SLOW' } as const;
    const videoBgm = {
      enabled: true,
      assetId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      volumePercent: 20,
    } as const;
    m.policy.mockResolvedValue({
      onboardingConfig: {
        dailyIdeaDelivery: {
          enabled: true,
          cadence: 'DAILY',
          defaultNotificationTime: '08:00',
          lockCadence: true,
          contentMode: 'READY_TO_USE',
          mediaMode: 'IMAGE_AND_VIDEO',
          videoStyle: 'MINIMAL',
          videoNarration,
          videoBgm,
        },
      },
      surveyConfig: null,
    });
    m.image.mockResolvedValue({ status: 'ALREADY_AVAILABLE', requestId: 'image-request' });
    await createDailyMissionJobHandler().execute({ job, localDate: '2026-09-07' });
    expect(m.video).toHaveBeenCalledWith(
      expect.objectContaining({
        socialImageGenerationRequestId: 'image-request',
        videoStyle: 'MINIMAL',
        videoNarration,
        videoBgm,
      }),
    );
  });
  it('does not create a caption-only replacement when carousel preparation temporarily fails', async () => {
    m.policy.mockResolvedValue({
      onboardingConfig: {
        dailyIdeaDelivery: {
          enabled: true,
          cadence: 'DAILY',
          defaultNotificationTime: '08:00',
          lockCadence: true,
          contentMode: 'READY_TO_USE',
          mediaMode: 'IMAGE_AND_VIDEO',
        },
      },
      surveyConfig: null,
    });
    m.image.mockResolvedValue({ status: 'SKIPPED', reason: 'temporary provider error' });
    await createDailyMissionJobHandler().execute({ job, localDate: '2026-09-07' });
    expect(m.video).not.toHaveBeenCalled();
  });
  it('prepares and confirms a missing week, then generates safely and queues LINE without user actions', async () => {
    await createDailyMissionJobHandler().execute({ job, localDate: '2026-09-07' });
    expect(m.week).toHaveBeenCalledWith(
      expect.objectContaining({
        ...scope,
        weekStartDate: '2026-09-07',
        includeGrantedKnowledge: false,
        includeCampaigns: true,
        existingPolicy: 'RETURN',
      }),
    );
    expect(m.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ ...scope, weeklyPlanId: 'plan' }),
    );
    expect(m.daily).toHaveBeenCalledWith(
      expect.objectContaining({
        ...scope,
        missionDate: '2026-09-07',
        serviceSafeMode: true,
        existingPolicy: 'RETURN',
      }),
    );
    expect(m.confirm.mock.invocationCallOrder[0]).toBeLessThan(
      m.daily.mock.invocationCallOrder[0]!,
    );
    expect(m.prepare).toHaveBeenCalledWith(
      expect.objectContaining({ dailyMissionId: 'mission', actorUserId: 'member' }),
    );
    expect(m.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        jobType: 'LINE_MISSION_DELIVER',
        payloadReference: 'line-delivery:delivery',
      }),
    );
  });
  it('treats an unscheduled Sunday as a day off, without generation or delivery', async () => {
    await createDailyMissionJobHandler().execute({ job, localDate: '2026-09-06' });
    expect(m.week).toHaveBeenCalledWith(expect.objectContaining({ weekStartDate: '2026-08-31' }));
    expect(m.daily).not.toHaveBeenCalled();
    expect(m.prepare).not.toHaveBeenCalled();
  });
  it('automatically confirms next week and reuses confirmed plans on retries', async () => {
    m.week.mockResolvedValue({ plan: { id: 'next', status: 'CONFIRMED', items: [] } });
    await createWeeklyPlanJobHandler().execute({ job, localDate: '2026-09-14' });
    expect(m.week).toHaveBeenCalledWith(
      expect.objectContaining({
        weekStartDate: '2026-09-14',
        existingPolicy: 'RETURN',
        groupId: 'service',
      }),
    );
    expect(m.confirm).not.toHaveBeenCalled();
  });
  it('does not generate or deliver after notification consent or membership is revoked', async () => {
    m.scope.mockRejectedValue(new Error('disabled'));
    await expect(
      createDailyMissionJobHandler().execute({ job, localDate: '2026-09-07' }),
    ).rejects.toThrow('disabled');
    expect(m.week).not.toHaveBeenCalled();
    expect(m.daily).not.toHaveBeenCalled();
    expect(m.enqueue).not.toHaveBeenCalled();
  });
  it('keeps failures retryable without queuing an incomplete mission', async () => {
    m.daily.mockRejectedValue(new Error('provider unavailable'));
    await expect(
      createDailyMissionJobHandler().execute({ job, localDate: '2026-09-07' }),
    ).rejects.toThrow('provider unavailable');
    expect(m.prepare).not.toHaveBeenCalled();
    expect(m.enqueue).not.toHaveBeenCalled();
  });
  it('does not bypass a content rejection through the fallback path', async () => {
    m.daily.mockRejectedValue(
      new ApplicationError('CONTENT_REJECTED', 'candidate duplicates presented content'),
    );
    await expect(
      createDailyMissionJobHandler().execute({ job, localDate: '2026-09-07' }),
    ).rejects.toThrow('candidate duplicates presented content');
    expect(m.fallback).not.toHaveBeenCalled();
    expect(m.prepare).not.toHaveBeenCalled();
  });
  it('uses a quality-checked fallback only for an unavailable AI provider', async () => {
    m.policy.mockResolvedValue({
      onboardingConfig: { dailyIdeaDelivery: { enabled: true } },
      surveyConfig: null,
    });
    m.daily.mockRejectedValue(
      new ApplicationError('AI_PROVIDER_UNAVAILABLE', 'provider timed out'),
    );
    await createDailyMissionJobHandler().execute({ job, localDate: '2026-09-07' });
    expect(m.fallback).toHaveBeenCalled();
    expect(m.prepare).toHaveBeenCalledWith(
      expect.objectContaining({ dailyMissionId: 'fallback-mission' }),
    );
  });
  it('does not deliver when the provider and its fallback both fail quality', async () => {
    m.policy.mockResolvedValue({
      onboardingConfig: { dailyIdeaDelivery: { enabled: true } },
      surveyConfig: null,
    });
    m.daily.mockRejectedValue(new ApplicationError('AI_PROVIDER_UNAVAILABLE', 'quota reached'));
    m.fallback.mockRejectedValue(
      new ApplicationError('CONTENT_REJECTED', 'fallback duplicates presented content'),
    );
    await expect(
      createDailyMissionJobHandler().execute({ job, localDate: '2026-09-07' }),
    ).rejects.toThrow('fallback duplicates presented content');
    expect(m.prepare).not.toHaveBeenCalled();
    expect(m.enqueue).not.toHaveBeenCalled();
  });
});
