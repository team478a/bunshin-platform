import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = [
  '../src/bunshin-core.ts',
  '../src/bunshin-capability.ts',
  '../src/social-profile-strategy.ts',
  '../src/trend-research.ts',
]
  .map((path) => readFileSync(new URL(path, import.meta.url), 'utf8'))
  .join('\n');
const planningSource = readFileSync(new URL('../src/mission-planning.ts', import.meta.url), 'utf8');
const dailyMissionSource = readFileSync(
  new URL('../src/daily-missions.ts', import.meta.url),
  'utf8',
);
const progressSource = readFileSync(new URL('../src/mission-progress.ts', import.meta.url), 'utf8');

describe('service Bunshin owner boundary', () => {
  it('limits normal service lists to the actor-owned Bunshins', () => {
    const start = source.indexOf('async listForService');
    const end = source.indexOf('async find(', start);
    const method = source.slice(start, end);
    expect(method).toContain('groupId: input.groupId');
    expect(method).toContain('ownerUserId: input.actorUserId');
  });

  it('limits a service-scoped detail lookup to its owner', () => {
    const start = source.indexOf('async find(input: ScopedBunshinReference)');
    const end = source.indexOf('async update(', start);
    const method = source.slice(start, end);
    expect(method).toContain('groupId: input.groupId ?? null');
    expect(method).toContain('input.groupId ? { ownerUserId: input.actorUserId } : {}');
  });

  it('keeps capability assignments inside the requested service and owner boundary', () => {
    const start = source.indexOf('export class PrismaBunshinCapabilityAssignmentRepository');
    const end = source.indexOf('export class PrismaSocialProfileRepository', start);
    const repository = source.slice(start, end);
    expect(repository).toContain('groupId: input.groupId ?? null');
    expect(repository).toContain('input.groupId ? { ownerUserId: input.actorUserId } : {}');
  });

  it('keeps social profiles inside the requested service and owner boundary', () => {
    const start = source.indexOf('export class PrismaSocialProfileRepository');
    const end = source.indexOf('export class PrismaSocialAccountStrategyRepository', start);
    const repository = source.slice(start, end);
    expect(repository).toContain('groupId: input.groupId ?? null');
    expect(repository).toContain('input.groupId ? { ownerUserId: input.actorUserId } : {}');
  });

  it('keeps content pillars inside the requested service and owner boundary', () => {
    const start = planningSource.indexOf('export class PrismaContentPillarRepository');
    const end = planningSource.indexOf('export class PrismaWeeklyPlanRepository', start);
    const repository = planningSource.slice(start, end);
    expect(repository).toContain('groupId: input.groupId ?? null');
    expect(repository).toContain('input.groupId ? { ownerUserId: input.actorUserId } : {}');
  });

  it('keeps account strategies inside the requested service and owner boundary', () => {
    const start = source.indexOf('export class PrismaSocialAccountStrategyRepository');
    const end = source.indexOf('export class PrismaTrendResearchRepository', start);
    const repository = source.slice(start, end);
    expect(repository).toContain('groupId: input.groupId ?? null');
    expect(repository).toContain('input.groupId ? { ownerUserId: input.actorUserId } : {}');
  });

  it('keeps weekly plans inside the requested service and owner boundary', () => {
    const start = planningSource.indexOf('export class PrismaWeeklyPlanRepository');
    const repository = planningSource.slice(start);
    expect(repository).toContain('groupId: input.groupId ?? null');
    expect(repository).toContain('input.groupId ? { ownerUserId: input.actorUserId } : {}');
  });

  it('keeps daily missions inside the requested service and owner boundary', () => {
    const start = dailyMissionSource.indexOf('export class PrismaDailyMissionRepository');
    const repository = dailyMissionSource.slice(start);
    expect(repository).toContain('groupId: input.groupId ?? null');
    expect(repository).toContain('input.groupId ? { ownerUserId: input.actorUserId } : {}');
  });

  it('keeps mission decisions and activities inside the service owner boundary', () => {
    const start = progressSource.indexOf('export class PrismaMissionEngagementRepository');
    const end = progressSource.indexOf('function achievementBadge', start);
    const repository = progressSource.slice(start, end);
    expect(repository).toContain('groupId: input.groupId ?? null');
    expect(repository).toContain('input.groupId ? { ownerUserId: input.actorUserId } : {}');
  });

  it('keeps posting and feedback inside the service owner boundary', () => {
    const start = progressSource.indexOf('export class PrismaMissionOutcomeRepository');
    const repository = progressSource.slice(start);
    expect(repository).toContain('groupId: input.groupId ?? null');
    expect(repository).toContain('input.groupId ? { ownerUserId: input.actorUserId } : {}');
  });
});
