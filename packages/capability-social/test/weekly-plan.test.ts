import type { BunshinCapabilityAssignmentRepository } from '@bunshin/application';
import { describe, expect, it } from 'vitest';
import {
  CreateWeeklyPlan,
  CreateWeeklyPlanItem,
  type WeeklyPlan,
  type WeeklyPlanRepository,
} from '../src';

const now = new Date('2026-08-19T00:00:00Z');
const scope = { workspaceId: 'workspace-1', actorUserId: 'user-1', bunshinId: 'bunshin-1' };
class Assignments implements BunshinCapabilityAssignmentRepository {
  constructor(private readonly status: 'ACTIVE' | 'SUSPENDED' | 'LOCKED' | 'MISSING' = 'ACTIVE') {}
  assign() {
    return Promise.resolve(null);
  }
  list() {
    return Promise.resolve([]);
  }
  setStatus() {
    return Promise.resolve(null);
  }
  find() {
    return Promise.resolve(
      this.status === 'MISSING'
        ? null
        : {
            id: 'assignment-1',
            workspaceId: scope.workspaceId,
            bunshinId: scope.bunshinId,
            capabilityType: 'SOCIAL' as const,
            status: this.status,
            config: {},
            assignedByUserId: scope.actorUserId,
            activatedAt: now,
            createdAt: now,
            updatedAt: now,
          },
    );
  }
}
const plan: WeeklyPlan = {
  id: 'plan-1',
  workspaceId: scope.workspaceId,
  bunshinId: scope.bunshinId,
  weekStartDate: '2026-08-17',
  timezone: 'Asia/Tokyo',
  strategySummary: null,
  status: 'DRAFT',
  confirmedAt: null,
  expiredAt: null,
  createdAt: now,
  updatedAt: now,
  items: [],
};
class Plans implements WeeklyPlanRepository {
  createPlan(input: Parameters<WeeklyPlanRepository['createPlan']>[0]) {
    return Promise.resolve({ ...plan, ...input, items: [] });
  }
  listPlans() {
    return Promise.resolve([plan]);
  }
  findPlan() {
    return Promise.resolve(plan);
  }
  updatePlan() {
    return Promise.resolve(plan);
  }
  createItem() {
    return Promise.resolve(plan);
  }
  updateItem() {
    return Promise.resolve(plan);
  }
  removeItem() {
    return Promise.resolve(plan);
  }
  confirmPlan() {
    return Promise.resolve(plan);
  }
  expirePlan() {
    return Promise.resolve(plan);
  }
}

describe('Weekly Plan', () => {
  it('accepts Monday local DATE and IANA timezone without converting the date', async () => {
    await expect(
      new CreateWeeklyPlan(new Plans(), new Assignments()).execute({
        ...scope,
        weekStartDate: '2026-08-17',
        timezone: ' Asia/Tokyo ',
        strategySummary: ' 方針 ',
      }),
    ).resolves.toMatchObject({ weekStartDate: '2026-08-17', timezone: 'Asia/Tokyo' });
  });
  it.each(['2026-08-18', '2026-02-30', '2026-08-17T00:00:00Z'])(
    'rejects invalid week start %s',
    async (weekStartDate) => {
      await expect(
        new CreateWeeklyPlan(new Plans(), new Assignments()).execute({
          ...scope,
          weekStartDate,
          timezone: 'Asia/Tokyo',
        }),
      ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    },
  );
  it('rejects invalid timezone and inactive assignment', async () => {
    await expect(
      new CreateWeeklyPlan(new Plans(), new Assignments()).execute({
        ...scope,
        weekStartDate: '2026-08-17',
        timezone: 'Invalid/Zone',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      new CreateWeeklyPlan(new Plans(), new Assignments('SUSPENDED')).execute({
        ...scope,
        weekStartDate: '2026-08-17',
        timezone: 'Asia/Tokyo',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('normalizes item text and validates date/format', async () => {
    await expect(
      new CreateWeeklyPlanItem(new Plans(), new Assignments()).execute({
        ...scope,
        weeklyPlanId: 'plan-1',
        scheduledDate: '2026-08-18',
        contentPillarId: 'pillar-1',
        goal: ' 教育 ',
        angle: ' 初心者向け ',
        recommendedFormat: 'SLIDE',
        notes: ' ',
      }),
    ).resolves.toBeDefined();
    await expect(
      new CreateWeeklyPlanItem(new Plans(), new Assignments()).execute({
        ...scope,
        weeklyPlanId: 'plan-1',
        scheduledDate: 'bad',
        contentPillarId: 'pillar-1',
        goal: '教育',
        angle: '初心者向け',
        recommendedFormat: 'SLIDE',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
