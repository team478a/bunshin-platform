import { describe, expect, it, vi } from 'vitest';
import {
  createDefaultMemberRoadmapDefinition,
  evaluateMemberRoadmap,
  GetMemberRoadmap,
  MEMBER_ROADMAP_MILESTONES,
  type MemberRoadmap,
  type MemberRoadmapContext,
  type MemberRoadmapFeatureState,
  type MemberRoadmapMilestoneId,
} from '../src/member-roadmap';
import {
  aggregateMemberUsage,
  GetMemberUsageSummary,
  type MemberUsageRequest,
  type MemberUsageSources,
} from '../src/member-usage';

const allowed = (): MemberRoadmapFeatureState => ({
  readyForRecommendation: true,
  implemented: true,
  enabled: true,
  budgetAllowed: true,
  access: { allowed: true, reason: 'ALLOWED', dailyLimit: null, monthlyLimit: null },
});
function setup() {
  const request: MemberUsageRequest = {
    actorUserId: 'owner',
    scope: {
      workspaceId: 'workspace',
      serviceId: 'service',
      groupMembershipId: 'membership',
      userId: 'owner',
      bunshinId: 'bunshin',
    },
    asOf: new Date('2026-11-01T03:00:00Z'),
    timezone: 'Asia/Tokyo',
  };
  const source: MemberUsageSources = {
    scope: { ...request.scope },
    completeness: 'COMPLETE',
    generations: [],
    activities: [],
    decisions: [],
    postRecords: [],
    aiUsage: [],
  };
  const context: MemberRoadmapContext = {
    scope: { ...request.scope },
    asOf: request.asOf.toISOString(),
    timezone: request.timezone,
    definition: createDefaultMemberRoadmapDefinition(),
    facts: {},
    features: {},
    validReferrals: 0,
  };
  for (const stage of context.definition.stages)
    for (const item of stage.milestones)
      if (item.criterion.kind === 'FACT') context.facts[item.criterion.fact] = false;
  for (const id of MEMBER_ROADMAP_MILESTONES) context.features[id] = allowed();
  const usage = () => aggregateMemberUsage(request, source);
  const row = (id: string, date = '2026-10-31T15:00:00Z') => ({
    id,
    scope: { ...request.scope },
    occurredAt: new Date(date),
  });
  const customDefinition = () => {
    context.definition.version = 'service-roadmap-v2';
    context.definition.scope = {
      workspaceId: request.scope.workspaceId,
      serviceId: request.scope.serviceId,
    };
  };
  const addReferral = () => {
    customDefinition();
    context.definition.stages[4]!.milestones = [
      ...context.definition.stages[4]!.milestones,
      {
        id: 'REFERRAL_MILESTONE',
        title: '紹介の実績',
        criterion: { kind: 'VALID_REFERRALS', target: 3 },
      },
    ];
  };
  return {
    request,
    source,
    context,
    row,
    usage,
    customDefinition,
    addReferral,
    evaluate: () => evaluateMemberRoadmap(request, usage(), context),
  };
}
function milestone(value: MemberRoadmap, id: MemberRoadmapMilestoneId) {
  const found = value.stages.flatMap((stage) => stage.milestones).find((item) => item.id === id);
  if (!found) throw new Error('milestone not found');
  return found;
}

describe('member roadmap projection', () => {
  it('does not prioritize an available action whose operational prerequisites are not ready', () => {
    const s = setup();
    for (const id of MEMBER_ROADMAP_MILESTONES)
      s.context.features[id]!.readyForRecommendation = false;
    s.context.features.SNS_CONNECTION_GUIDE!.readyForRecommendation = true;
    const value = s.evaluate();
    expect(milestone(value, 'INITIAL_SETUP')).toMatchObject({
      status: 'AVAILABLE',
      availability: { state: 'AVAILABLE' },
      recommendable: false,
    });
    expect(value.nextRecommended).toEqual({
      stageId: 'STEP_3',
      milestoneId: 'SNS_CONNECTION_GUIDE',
    });
  });

  it('rejects missing readiness instead of assuming an action is usable now', () => {
    const s = setup();
    Reflect.deleteProperty(s.context.features.INITIAL_SETUP!, 'readyForRecommendation');
    expect(() => s.evaluate()).toThrow('invalid member roadmap snapshot');
  });
  it('does not accept a malformed metric condition as setup evidence', () => {
    const s = setup();
    s.customDefinition();
    Reflect.set(s.context.definition.stages[0]!.milestones[0]!, 'criterion', {
      kind: 'USAGE',
      target: 1,
    });
    expect(() => s.evaluate()).toThrow('invalid member roadmap snapshot');
  });

  it('does not use inherited facts or permission grants', () => {
    const s = setup();
    delete s.context.facts.INITIAL_SETUP;
    Object.setPrototypeOf(s.context.facts, { INITIAL_SETUP: true });
    s.context.features = {};
    Object.setPrototypeOf(s.context.features, { INITIAL_SETUP: allowed() });
    expect(milestone(s.evaluate(), 'INITIAL_SETUP')).toMatchObject({
      achievement: 'UNKNOWN',
      availability: { state: 'PREPARING', reason: 'NOT_RESOLVED' },
    });
  });

  it('accepts the same default definition independently of object property order', () => {
    const s = setup();
    s.context.definition.stages[0]!.milestones[1]!.criterion = {
      target: 1,
      metric: 'generated',
      kind: 'USAGE',
    };
    expect(s.evaluate().definitionVersion).toBe('hassy-roadmap-v1');
  });

  it('rejects moving a mandatory milestone to an unrelated stage', () => {
    const s = setup();
    s.customDefinition();
    const first = s.context.definition.stages[0]!;
    const second = s.context.definition.stages[1]!;
    const firstItem = first.milestones[0]!;
    first.milestones = [second.milestones[0]!, ...first.milestones.slice(1)];
    second.milestones = [firstItem, ...second.milestones.slice(1)];
    expect(() => s.evaluate()).toThrow('invalid member roadmap snapshot');
  });

  it('rejects an incompatible usage version', () => {
    const s = setup();
    const usage = s.usage();
    Reflect.set(usage, 'version', 'incompatible');
    expect(() => evaluateMemberRoadmap(s.request, usage, s.context)).toThrow(
      'invalid member roadmap snapshot',
    );
  });

  it('returns five versioned stages and one deterministic next action without referral requirements', () => {
    const s = setup();
    const value = s.evaluate();
    expect(value.definitionVersion).toBe('hassy-roadmap-v1');
    expect(value.stages).toHaveLength(5);
    expect(value.currentStageId).toBe('STEP_1');
    expect(value.nextRecommended).toEqual({ stageId: 'STEP_1', milestoneId: 'INITIAL_SETUP' });
    expect(value.stages[0]?.progress).toEqual({ completed: 0, total: 3, unknown: 0 });
    expect(s.evaluate()).toEqual(value);
  });

  it('uses actual usage for generation and decisions and explicit setup evidence', () => {
    const s = setup();
    s.context.facts.INITIAL_SETUP = true;
    s.source.generations = [{ ...s.row('generation'), status: 'SUCCESS', trigger: 'USER' }];
    s.source.decisions = [
      { ...s.row('decision'), dailyMissionId: 'mission', decision: 'REJECTED' },
    ];
    const value = s.evaluate();
    expect(value.stages[0]?.status).toBe('COMPLETED');
    expect(value.currentStageId).toBe('STEP_2');
    expect(value.nextRecommended?.milestoneId).toBe('POST_HISTORY');
  });

  it('keeps missing/null evidence distinct from explicit noncompletion', () => {
    const s = setup();
    delete s.context.facts.INITIAL_SETUP;
    s.context.facts.POST_HISTORY = null;
    const value = s.evaluate();
    expect(milestone(value, 'INITIAL_SETUP')).toMatchObject({
      status: 'PREPARING',
      reason: 'EVIDENCE_MISSING',
      achievement: 'UNKNOWN',
      progress: { current: null, target: 1 },
      availability: { state: 'AVAILABLE' },
    });
    expect(value.stages[0]?.progress.unknown).toBe(1);
    expect(value.nextRecommended?.milestoneId).toBe('FIRST_GENERATION');
    expect(milestone(value, 'POST_HISTORY').achievement).toBe('UNKNOWN');
  });

  it('does not infer setup, history, guide use or improvement from successful generation', () => {
    const s = setup();
    s.context.facts = {};
    s.source.generations = [{ ...s.row('generation'), status: 'SUCCESS', trigger: 'USER' }];
    const value = s.evaluate();
    for (const id of ['INITIAL_SETUP', 'POST_HISTORY', 'MUSE_GUIDE', 'APPLY_IMPROVEMENT'] as const)
      expect(milestone(value, id).achievement).toBe('UNKNOWN');
    expect(milestone(value, 'FIRST_GENERATION').achievement).toBe('COMPLETED');
  });

  it.each(['UNKNOWN', 'SCHEDULER', 'SYSTEM'] as const)(
    'counts %s generation without inventing an active day',
    (trigger) => {
      const s = setup();
      s.source.generations = [{ ...s.row('generation'), status: 'SUCCESS', trigger }];
      const value = s.evaluate();
      expect(milestone(value, 'FIRST_GENERATION').achievement).toBe('COMPLETED');
      expect(milestone(value, 'CONTINUED_ACTIVITY').progress.current).toBe(0);
    },
  );

  it('keeps cumulative achievements after the 7/30-day windows move', () => {
    const s = setup();
    s.source.activities = [1, 2, 3].map((day) => ({
      ...s.row(`copy-${day}`, `2026-10-0${day}T12:00:00Z`),
      dailyMissionId: `mission-${day}`,
      type: 'COPIED_TEXT',
    }));
    expect(milestone(s.evaluate(), 'CONTINUED_ACTIVITY').achievement).toBe('COMPLETED');
    s.request.asOf = new Date('2026-12-01T03:00:00Z');
    s.context.asOf = s.request.asOf.toISOString();
    expect(s.usage().last30Days.activeDays).toBe(0);
    expect(milestone(s.evaluate(), 'CONTINUED_ACTIVITY').achievement).toBe('COMPLETED');
  });

  it.each([
    ['NOT_RESOLVED', undefined],
    ['NOT_IMPLEMENTED', { ...allowed(), implemented: false }],
    ['STOPPED', { ...allowed(), enabled: false }],
    [
      'ACCESS_DENIED',
      {
        ...allowed(),
        access: {
          allowed: false,
          reason: 'MONTHLY_LIMIT_REACHED',
          dailyLimit: null,
          monthlyLimit: 1,
        },
      },
    ],
    ['BUDGET_DENIED', { ...allowed(), budgetAllowed: false }],
  ] as const)(
    'excludes unavailable actions with reason %s from the next recommendation',
    (reason, state) => {
      const s = setup();
      if (state) s.context.features.INITIAL_SETUP = state;
      else delete s.context.features.INITIAL_SETUP;
      const value = s.evaluate();
      expect(milestone(value, 'INITIAL_SETUP')).toMatchObject({
        status: 'PREPARING',
        availability: { reason },
      });
      expect(value.nextRecommended?.milestoneId).toBe('FIRST_GENERATION');
    },
  );

  it('preserves completed history after a feature is stopped but does not recommend it', () => {
    const s = setup();
    s.context.facts.INITIAL_SETUP = true;
    s.context.features.INITIAL_SETUP!.enabled = false;
    expect(milestone(s.evaluate(), 'INITIAL_SETUP')).toMatchObject({
      status: 'COMPLETED',
      achievement: 'COMPLETED',
      availability: { state: 'UNAVAILABLE', reason: 'STOPPED' },
    });
    expect(s.evaluate().nextRecommended?.milestoneId).toBe('FIRST_GENERATION');
  });

  it('permits a later-stage action when earlier stages are incomplete', () => {
    const s = setup();
    for (const id of MEMBER_ROADMAP_MILESTONES) delete s.context.features[id];
    s.context.features.SNS_CONNECTION_GUIDE = allowed();
    const value = s.evaluate();
    expect(value.currentStageId).toBe('STEP_1');
    expect(value.nextRecommended).toEqual({
      stageId: 'STEP_3',
      milestoneId: 'SNS_CONNECTION_GUIDE',
    });
    expect(milestone(value, 'SNS_CONNECTION_GUIDE').availability.state).toBe('AVAILABLE');
  });

  it('returns no candidate when none can safely be suggested', () => {
    const s = setup();
    s.context.features = {};
    expect(s.evaluate().nextRecommended).toBeNull();
  });

  it('supports all-completed progress without inventing a sixth stage', () => {
    const s = setup();
    for (const key of Object.keys(s.context.facts) as (keyof typeof s.context.facts)[])
      s.context.facts[key] = true;
    s.source.generations = [{ ...s.row('generation'), status: 'SUCCESS', trigger: 'USER' }];
    s.source.decisions = [
      { ...s.row('decision'), dailyMissionId: 'mission', decision: 'ACCEPTED' },
    ];
    s.source.activities = [1, 2, 3].map((day) => ({
      ...s.row(`copy-${day}`, `2026-10-2${day}T12:00:00Z`),
      dailyMissionId: `mission-${day}`,
      type: 'COPIED_TEXT',
    }));
    const value = s.evaluate();
    expect(value.stages.every((stage) => stage.status === 'COMPLETED')).toBe(true);
    expect(value.currentStageId).toBeNull();
    expect(value.nextRecommended).toBeNull();
  });

  it('uses qualified referrals only for an optional milestone and grants no feature access', () => {
    const s = setup();
    s.addReferral();
    s.context.validReferrals = 3;
    s.context.features.REFERRAL_MILESTONE!.access = {
      allowed: false,
      reason: 'MEMBER_NOT_ALLOWED',
      dailyLimit: null,
      monthlyLimit: null,
    };
    const value = s.evaluate();
    expect(milestone(value, 'REFERRAL_MILESTONE')).toMatchObject({
      achievement: 'COMPLETED',
      availability: { state: 'UNAVAILABLE' },
    });
    expect(milestone(value, 'FIRST_GENERATION').availability.state).toBe('AVAILABLE');
  });

  it('does not convert unknown referral evidence to zero', () => {
    const s = setup();
    s.addReferral();
    s.context.validReferrals = null;
    expect(milestone(s.evaluate(), 'REFERRAL_MILESTONE')).toMatchObject({
      achievement: 'UNKNOWN',
      progress: { current: null },
    });
  });

  it.each(['INITIAL_SETUP', 'FIRST_GENERATION', 'MUSE_GUIDE'] as const)(
    'rejects referral gating on %s',
    (id) => {
      const s = setup();
      s.customDefinition();
      const item = s.context.definition.stages
        .flatMap((stage) => stage.milestones)
        .find((value) => value.id === id)!;
      item.criterion = { kind: 'VALID_REFERRALS', target: 3 };
      expect(() => s.evaluate()).toThrow('invalid member roadmap snapshot');
    },
  );

  it('requires a different version for modified default criteria and allows a bound Service version', () => {
    const s = setup();
    s.context.definition.stages[1]!.milestones[2]!.criterion = {
      kind: 'USAGE',
      metric: 'activeDays',
      target: 5,
    };
    expect(() => s.evaluate()).toThrow('invalid member roadmap snapshot');
    s.customDefinition();
    expect(milestone(s.evaluate(), 'CONTINUED_ACTIVITY').progress.target).toBe(5);
  });

  it.each(['workspaceId', 'serviceId'] as const)(
    'rejects a definition bound to another %s',
    (key) => {
      const s = setup();
      s.customDefinition();
      s.context.definition.scope![key] = 'foreign';
      expect(() => s.evaluate()).toThrow('invalid member roadmap snapshot');
    },
  );

  it.each(['workspaceId', 'serviceId', 'groupMembershipId', 'userId', 'bunshinId'] as const)(
    'rejects cross-%s context and usage snapshots',
    (key) => {
      const s = setup();
      s.context.scope[key] = 'foreign';
      expect(() => s.evaluate()).toThrow('invalid member roadmap snapshot');
      s.context.scope = { ...s.request.scope };
      const usage = s.usage();
      usage.scope[key] = 'foreign';
      expect(() => evaluateMemberRoadmap(s.request, usage, s.context)).toThrow(
        'invalid member roadmap snapshot',
      );
    },
  );

  it.each(['asOf', 'timezone'] as const)('rejects inconsistent snapshot %s', (key) => {
    const s = setup();
    s.context[key] = key === 'asOf' ? '2026-10-01T03:00:00Z' : 'UTC';
    expect(() => s.evaluate()).toThrow('invalid member roadmap snapshot');
  });

  it.each([-1, 0.5, Number.NaN])('rejects invalid usage and referral count %s', (count) => {
    const s = setup();
    const usage = s.usage();
    usage.allTime.accepted = count;
    expect(() => evaluateMemberRoadmap(s.request, usage, s.context)).toThrow(
      'invalid member roadmap snapshot',
    );
    s.context.validReferrals = count;
    expect(() => s.evaluate()).toThrow('invalid member roadmap snapshot');
  });

  it('rejects omitted basic milestones, duplicates and unsupported criteria', () => {
    const s = setup();
    s.customDefinition();
    s.context.definition.stages[0]!.milestones =
      s.context.definition.stages[0]!.milestones.slice(1);
    expect(() => s.evaluate()).toThrow('invalid member roadmap snapshot');
    s.context.definition = createDefaultMemberRoadmapDefinition();
    s.customDefinition();
    s.context.definition.stages[1]!.milestones = [...s.context.definition.stages[0]!.milestones];
    expect(() => s.evaluate()).toThrow('invalid member roadmap snapshot');
    s.context.definition = createDefaultMemberRoadmapDefinition();
    s.customDefinition();
    s.context.definition.stages[0]!.milestones[0]!.criterion = {
      kind: 'USAGE',
      metric: 'generated',
      target: 1,
    };
    expect(() => s.evaluate()).toThrow('invalid member roadmap snapshot');
  });

  it('rejects unresolved permission fields rather than treating them as allowed', () => {
    const s = setup();
    Reflect.deleteProperty(s.context.features.INITIAL_SETUP!, 'budgetAllowed');
    expect(() => s.evaluate()).toThrow('invalid member roadmap snapshot');
  });

  it('returns independent definitions/output and does not expose AI cost or raw access records', () => {
    const s = setup();
    const first = createDefaultMemberRoadmapDefinition();
    first.stages[0]!.title = 'changed';
    expect(createDefaultMemberRoadmapDefinition().stages[0]?.title).not.toBe('changed');
    const before = structuredClone(s.context);
    const value = s.evaluate();
    expect(s.context).toEqual(before);
    value.stages[0]!.milestones[0]!.title = 'changed result';
    expect(s.context).toEqual(before);
    expect(JSON.stringify(value)).not.toContain('aiCost');
    expect(JSON.stringify(value)).not.toContain('dailyLimit');
  });
});

describe('authorized roadmap use case', () => {
  it('authorizes usage first, then reads owner-scoped context', async () => {
    const s = setup();
    const authorize = vi.fn().mockResolvedValue(true);
    const sources = vi.fn().mockResolvedValue(s.source);
    const read = vi.fn().mockResolvedValue(s.context);
    const service = new GetMemberRoadmap(
      new GetMemberUsageSummary({ authorize }, { read: sources }),
      { read },
    );
    expect((await service.execute(s.request)).scope).toEqual(s.request.scope);
    expect(read).toHaveBeenCalledWith(s.request);
    expect(authorize.mock.invocationCallOrder[0]).toBeLessThan(
      sources.mock.invocationCallOrder[0]!,
    );
    expect(sources.mock.invocationCallOrder[0]).toBeLessThan(read.mock.invocationCallOrder[0]!);
  });

  it('never reads context when usage authorization fails', async () => {
    const s = setup();
    const read = vi.fn();
    const service = new GetMemberRoadmap(
      new GetMemberUsageSummary({ authorize: () => Promise.resolve(false) }, { read: vi.fn() }),
      { read },
    );
    await expect(service.execute(s.request)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(read).not.toHaveBeenCalled();
  });

  it('rejects a spoofed actor before either port is called', async () => {
    const s = setup();
    const execute = vi.fn();
    const read = vi.fn();
    const service = new GetMemberRoadmap({ execute }, { read });
    await expect(service.execute({ ...s.request, actorUserId: 'attacker' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(execute).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });

  it('preserves context revocation and errors without producing an empty roadmap', async () => {
    const s = setup();
    const read = vi.fn().mockResolvedValue(null);
    const service = new GetMemberRoadmap({ execute: () => Promise.resolve(s.usage()) }, { read });
    await expect(service.execute(s.request)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    read.mockRejectedValue(new Error('synthetic context failure'));
    await expect(service.execute(s.request)).rejects.toThrow('synthetic context failure');
  });

  it('isolates input mutation across asynchronous boundaries', async () => {
    const s = setup();
    let resume!: () => void;
    const gate = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const usage = s.usage();
    const read = vi.fn((input: MemberUsageRequest) => {
      input.scope.bunshinId = 'port mutation';
      input.asOf.setUTCFullYear(2000);
      return Promise.resolve(s.context);
    });
    const service = new GetMemberRoadmap({ execute: () => gate.then(() => usage) }, { read });
    const result = service.execute(s.request);
    s.request.scope.bunshinId = 'caller mutation';
    s.request.asOf.setUTCFullYear(2001);
    resume();
    expect((await result).scope.bunshinId).toBe('bunshin');
  });
});
