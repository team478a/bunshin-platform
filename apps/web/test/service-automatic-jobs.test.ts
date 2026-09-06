import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  scope: vi.fn(),
  week: vi.fn(),
  confirm: vi.fn(),
  knowledge: vi.fn(),
  daily: vi.fn(),
  prepare: vi.fn(),
  enqueue: vi.fn(),
  reminder: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@bunshin/database', () => ({
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
  createWeeklyPlanGenerationService: async () => ({ execute: m.week }),
}));
vi.mock('../src/services/daily-mission-generation', () => ({
  createDailyMissionGenerationService: () => ({ execute: m.daily }),
}));
vi.mock('../src/services/service-generation-knowledge', () => ({
  loadServiceGenerationKnowledge: m.knowledge,
}));
vi.mock('../src/activity-continuity-rule', () => ({
  currentActivityContinuityRule: async () => ({ dormancyDays: 7 }),
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
    m.prepare.mockResolvedValue({ id: 'delivery' });
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
});
