import { describe, expect, it, vi } from 'vitest';
import {
  GetMemberRoadmap,
  evaluateMemberRoadmap,
  type MemberRoadmapPolicy,
  type MemberRoadmapContext,
  type MemberRoadmapDefinition,
} from '../src/member-roadmap';
import { aggregateMemberUsage, type MemberUsageRequest } from '../src/member-usage';

function setup() {
  const request: MemberUsageRequest = {
    actorUserId: 'owner',
    scope: {
      workspaceId: 'workspace',
      serviceId: 'service',
      groupMembershipId: 'member',
      userId: 'owner',
      bunshinId: 'subject',
    },
    asOf: new Date('2026-11-01T00:00:00Z'),
    timezone: 'Asia/Tokyo',
  };
  const definition: MemberRoadmapDefinition = {
    version: 'neutral-test-v1',
    scope: { workspaceId: 'workspace', serviceId: 'service' },
    stages: [
      {
        id: 'START',
        title: 'Start',
        milestones: [{ id: 'TASK', title: 'Task', criterion: { kind: 'FACT', fact: 'READY' } }],
      },
    ],
  };
  const policy: MemberRoadmapPolicy = {
    createDefinition: () => definition,
    validateDefinition: () => {},
  };
  const context: MemberRoadmapContext = {
    scope: { ...request.scope },
    asOf: request.asOf.toISOString(),
    timezone: request.timezone,
    definition,
    facts: { READY: false },
    features: {
      TASK: {
        implemented: true,
        enabled: true,
        budgetAllowed: true,
        readyForRecommendation: true,
        access: { allowed: true, reason: 'ALLOWED', dailyLimit: null, monthlyLimit: null },
      },
    },
    validReferrals: null,
  };
  const usage = aggregateMemberUsage(request, {
    scope: { ...request.scope },
    completeness: 'COMPLETE',
    generations: [],
    activities: [],
    decisions: [],
    postRecords: [],
    aiUsage: [],
  });
  return {
    request,
    definition,
    policy,
    context,
    usage,
    evaluate: () => evaluateMemberRoadmap(request, usage, context, policy),
  };
}

describe('explicit member roadmap policy evaluation', () => {
  it('returns the same authorized usage used by the roadmap with one read', async () => {
    const s = setup();
    const execute = vi.fn().mockResolvedValue(s.usage);
    const read = vi.fn().mockResolvedValue(s.context);
    const result = await new GetMemberRoadmap({ execute }, { read }, s.policy).executeWithUsage(
      s.request,
    );
    expect(execute).toHaveBeenCalledExactlyOnceWith(s.request);
    expect(read).toHaveBeenCalledExactlyOnceWith(s.request);
    expect(result.usage).toBe(s.usage);
    expect(result.roadmap).toEqual(s.evaluate());
    expect(result.roadmap.asOf).toBe(result.usage.asOf);
    expect(result.roadmap.timezone).toBe(result.usage.timezone);
  });
  it('does not return usage when the later evidence read fails', async () => {
    const s = setup();
    const execute = vi.fn().mockResolvedValue(s.usage);
    const read = vi.fn().mockResolvedValue(null);
    await expect(
      new GetMemberRoadmap({ execute }, { read }, s.policy).executeWithUsage(s.request),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(execute).toHaveBeenCalledOnce();
    expect(read).toHaveBeenCalledOnce();
  });
  it('evaluates a one-stage policy without fixed product, stage or fact names', () => {
    const s = setup();
    const before = structuredClone(s.context);
    const value = s.evaluate();
    expect(value.definitionVersion).toBe('neutral-test-v1');
    expect(value.stages).toHaveLength(1);
    expect(value.nextRecommended).toEqual({ stageId: 'START', milestoneId: 'TASK' });
    expect(s.context).toEqual(before);
  });
  it('supports another stage shape with one prioritized candidate', () => {
    const s = setup();
    s.definition.stages = [
      ...s.definition.stages,
      {
        id: 'LATER',
        title: 'Later',
        milestones: [
          { id: 'OTHER', title: 'Other', criterion: { kind: 'FACT', fact: 'OTHER_DONE' } },
        ],
      },
    ];
    s.context.facts.OTHER_DONE = false;
    s.context.features.OTHER = { ...s.context.features.TASK! };
    expect(s.evaluate().stages).toHaveLength(2);
    expect(s.evaluate().nextRecommended?.milestoneId).toBe('TASK');
    s.context.facts.READY = true;
    expect(s.evaluate().nextRecommended?.milestoneId).toBe('OTHER');
  });
  it.each(['facts', 'features'] as const)('rejects undeclared %s keys', (key) => {
    const s = setup();
    if (key === 'facts') s.context.facts.UNREGISTERED = true;
    else s.context.features.UNREGISTERED = { ...s.context.features.TASK! };
    expect(s.evaluate).toThrow('invalid member roadmap snapshot');
  });
  it('does not substitute a default policy when none is injected', async () => {
    const s = setup();
    const execute = vi.fn();
    const read = vi.fn();
    const useCase = new GetMemberRoadmap(
      { execute },
      { read },
      undefined as unknown as MemberRoadmapPolicy,
    );
    await expect(useCase.execute(s.request)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(execute).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });
  it('keeps missing evidence unknown and completed evidence despite a stopped feature', () => {
    const s = setup();
    delete s.context.facts.READY;
    expect(s.evaluate().stages[0]!.milestones[0]!.achievement).toBe('UNKNOWN');
    expect(s.evaluate().nextRecommended).toBeNull();
    s.context.facts.READY = true;
    s.context.features.TASK!.enabled = false;
    expect(s.evaluate().stages[0]!.milestones[0]!.status).toBe('COMPLETED');
  });
  it.each(['scope', 'duplicate', 'empty', 'metric', 'target'] as const)(
    'checks common definition invariants: %s',
    (kind) => {
      const s = setup();
      if (kind === 'scope') s.definition.scope!.serviceId = 'foreign';
      if (kind === 'duplicate')
        s.definition.stages = [s.definition.stages[0]!, s.definition.stages[0]!];
      if (kind === 'empty') s.definition.stages = [];
      if (kind === 'metric')
        Reflect.set(s.definition.stages[0]!.milestones[0]!, 'criterion', {
          kind: 'USAGE',
          metric: 'unknown',
          target: 1,
        });
      if (kind === 'target')
        s.definition.stages[0]!.milestones[0]!.criterion = {
          kind: 'USAGE',
          metric: 'generated',
          target: 0,
        };
      expect(s.evaluate).toThrow('invalid member roadmap snapshot');
    },
  );
  it('calls the injected product validator and preserves its denial', () => {
    const s = setup();
    s.policy.validateDefinition = () => {
      throw new Error('policy rejected');
    };
    expect(s.evaluate).toThrow('policy rejected');
  });
  it('ignores a definition supplied by an evidence adapter and snapshots the selected policy', async () => {
    const s = setup();
    let resume!: () => void;
    const gate = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const useCase = new GetMemberRoadmap(
      { execute: () => gate.then(() => s.usage) },
      {
        read: () =>
          Promise.resolve({
            ...s.context,
            definition: { ...s.definition, version: 'foreign-injected' },
          }),
      },
      s.policy,
    );
    const pending = useCase.execute(s.request);
    s.definition.version = 'changed-after-start';
    resume();
    expect((await pending).definitionVersion).toBe('neutral-test-v1');
  });
});
