import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

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
    const end = source.indexOf('export class PrismaContentPillarRepository', start);
    const repository = source.slice(start, end);
    expect(repository).toContain('groupId: input.groupId ?? null');
    expect(repository).toContain('input.groupId ? { ownerUserId: input.actorUserId } : {}');
  });

  it('keeps content pillars inside the requested service and owner boundary', () => {
    const start = source.indexOf('export class PrismaContentPillarRepository');
    const end = source.indexOf('export class PrismaWeeklyPlanRepository', start);
    const repository = source.slice(start, end);
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
    const start = source.indexOf('export class PrismaWeeklyPlanRepository');
    const end = source.indexOf('const missionDate', start);
    const repository = source.slice(start, end);
    expect(repository).toContain('groupId: input.groupId ?? null');
    expect(repository).toContain('input.groupId ? { ownerUserId: input.actorUserId } : {}');
  });

  it('keeps daily missions inside the requested service and owner boundary', () => {
    const start = source.indexOf('export class PrismaDailyMissionRepository');
    const end = source.indexOf('export class PrismaMissionDecisionRepository', start);
    const repository = source.slice(start, end);
    expect(repository).toContain('groupId: input.groupId ?? null');
    expect(repository).toContain('input.groupId ? { ownerUserId: input.actorUserId } : {}');
  });

  it('keeps mission decisions and activities inside the service owner boundary', () => {
    const start = source.indexOf('export class PrismaMissionEngagementRepository');
    const end = source.indexOf('function achievementBadge', start);
    const repository = source.slice(start, end);
    expect(repository).toContain('groupId: input.groupId ?? null');
    expect(repository).toContain('input.groupId ? { ownerUserId: input.actorUserId } : {}');
  });

  it('keeps posting and feedback inside the service owner boundary', () => {
    const start = source.indexOf('export class PrismaMissionOutcomeRepository');
    const end = source.indexOf('function workspace(', start);
    const repository = source.slice(start, end);
    expect(repository).toContain('groupId: input.groupId ?? null');
    expect(repository).toContain('input.groupId ? { ownerUserId: input.actorUserId } : {}');
  });
});
