import { describe, expect, it, vi } from 'vitest';
import {
  aggregateMemberUsage,
  projectMemberUsageEvidence,
  GetMemberUsageSummary,
  type MemberUsageRequest,
  type MemberUsageSources,
} from '../src/member-usage';

const request: MemberUsageRequest = {
  actorUserId: 'user',
  scope: {
    workspaceId: 'workspace',
    serviceId: 'service',
    groupMembershipId: 'membership',
    userId: 'user',
    bunshinId: 'bunshin',
  },
  asOf: new Date('2026-11-01T03:00:00Z'),
  timezone: 'Asia/Tokyo',
};
const row = (id: string, date = '2026-10-31T15:00:00Z') => ({
  id,
  scope: { ...request.scope },
  occurredAt: new Date(date),
});
const activity = (id: string, type: string, date?: string, dailyMissionId = 'mission') => ({
  ...row(id, date),
  type,
  dailyMissionId,
});
const empty = (): MemberUsageSources => ({
  scope: { ...request.scope },
  completeness: 'COMPLETE',
  generations: [],
  activities: [],
  decisions: [],
  postRecords: [],
  aiUsage: [],
});
const summarize = (changes: Partial<MemberUsageSources> = {}, input = request) =>
  aggregateMemberUsage(input, { ...empty(), ...changes });

describe('member usage read model', () => {
  it('shares canonical earliest decisions and reports with referral evidence across dates', () => {
    const source = {
      ...empty(),
      activities: [
        activity('first', 'ACCEPTED', '2026-10-30T00:00:00Z'),
        activity('view', 'VIEWED'),
        activity('copy', 'COPIED_TEXT'),
      ],
      decisions: [{ ...row('later'), dailyMissionId: 'mission', decision: 'ACCEPTED' as const }],
      postRecords: [{ ...row('post'), dailyMissionId: 'mission' }],
    };
    const result = projectMemberUsageEvidence(request, source);
    expect(result.decisions.map((item) => item.id)).toEqual(['first']);
    expect(result.postRecords.map((item) => item.id)).toEqual(['post']);
    expect(result.copies.map((item) => item.id)).toEqual(['copy']);
    expect(aggregateMemberUsage(request, source).allTime.activeDays).toBe(2);
  });
  it('retains generation origins for the capability binding without treating failures as successful', () => {
    const result = projectMemberUsageEvidence(request, {
      ...empty(),
      generations: [
        { ...row('user'), status: 'SUCCESS', trigger: 'USER' },
        { ...row('scheduled'), status: 'SUCCESS', trigger: 'SCHEDULER' },
        { ...row('legacy'), status: 'SUCCESS', trigger: 'UNKNOWN' },
        { ...row('failed'), status: 'FAILED', trigger: 'USER' },
      ],
    });
    expect(result.generations.map((entry) => entry.id)).toEqual(['user', 'scheduled', 'legacy']);
  });
  it('returns reproducible empty metrics for a new member', () => {
    const result = summarize();
    expect(result.allTime).toMatchObject({
      generated: 0,
      activeDays: 0,
      lastActiveAt: null,
      aiCost: { knownUsdMicros: '0', unknownEvents: 0 },
    });
    expect(result.last7Days.fromLocalDate).toBe('2026-10-26');
    expect(result.last30Days.fromLocalDate).toBe('2026-10-03');
  });

  it('counts successful generations but only proven user triggers make an active day', () => {
    const result = summarize({
      generations: [
        { ...row('user', '2026-10-27Z'), status: 'SUCCESS', trigger: 'USER' },
        { ...row('scheduled', '2026-10-28Z'), status: 'SUCCESS', trigger: 'SCHEDULER' },
        { ...row('system', '2026-10-29Z'), status: 'SUCCESS', trigger: 'SYSTEM' },
        { ...row('legacy', '2026-10-30Z'), status: 'SUCCESS', trigger: 'UNKNOWN' },
        { ...row('failed', '2026-10-31Z'), status: 'FAILED', trigger: 'USER' },
      ],
    });
    expect(result.allTime).toMatchObject({
      generated: 4,
      unknownTriggerGenerations: 1,
      activeDays: 1,
      lastActiveAt: '2026-10-27T00:00:00.000Z',
    });
  });

  it('deduplicates sources, decision snapshots, and PostRecord/POSTED by mission', () => {
    const accepted = activity('accepted', 'ACCEPTED');
    const result = summarize({
      activities: [
        accepted,
        { ...accepted },
        activity('accepted-retry', 'ACCEPTED'),
        activity('posted', 'POSTED'),
      ],
      decisions: [{ ...row('decision'), dailyMissionId: 'mission', decision: 'ACCEPTED' }],
      postRecords: [{ ...row('post'), dailyMissionId: 'mission' }],
    });
    expect(result.allTime).toMatchObject({ accepted: 1, selfReportedPosts: 1, activeDays: 1 });
  });

  it('preserves both historical acceptance and rejection without using the snapshot update date', () => {
    const result = summarize({
      activities: [
        activity('accepted', 'ACCEPTED', '2026-10-01Z'),
        activity('rejected', 'REJECTED', '2026-10-31Z'),
      ],
      decisions: [{ ...row('latest'), dailyMissionId: 'mission', decision: 'REJECTED' }],
    });
    expect(result.allTime).toMatchObject({ accepted: 1, rejected: 1, activeDays: 2 });
    expect(result.last7Days).toMatchObject({ accepted: 0, rejected: 1 });
  });

  it('supports legacy decision and post sources without activity rows', () => {
    const result = summarize({
      decisions: [{ ...row('decision'), dailyMissionId: 'a', decision: 'REJECTED' }],
      postRecords: [{ ...row('post'), dailyMissionId: 'b' }],
    });
    expect(result.allTime).toMatchObject({ rejected: 1, selfReportedPosts: 1, activeDays: 1 });
  });

  it('uses POSTED activity time ahead of PostRecord time across windows', () => {
    const result = summarize({
      activities: [activity('posted', 'POSTED', '2026-10-01Z')],
      postRecords: [{ ...row('post'), dailyMissionId: 'mission' }],
    });
    expect(result.allTime.selfReportedPosts).toBe(1);
    expect(result.last30Days.selfReportedPosts).toBe(0);
  });

  it('does not count views, confirmation, login, rest, notification or feedback as activity', () => {
    const result = summarize({
      activities: ['VIEWED', 'CONFIRMED', 'LOGIN', 'RESTED', 'LINE_DELIVERED', 'FEEDBACK_GOOD'].map(
        (type) => activity(type, type),
      ),
    });
    expect(result.allTime.activeDays).toBe(0);
    expect(result.allTime.lastActiveAt).toBeNull();
  });

  it('counts copies on their actual operation date, once per local day', () => {
    const result = summarize({
      activities: [
        activity('a', 'COPIED_TEXT'),
        activity('b', 'COPIED_SLIDE'),
        activity('c', 'COPIED_VIDEO_PROMPT'),
      ],
    });
    expect(result.last7Days.activeDays).toBe(1);
  });

  it('uses inclusive local calendar boundaries for 7 and 30 days, excluding future operations', () => {
    const result = summarize({
      activities: [
        activity('before30', 'COPIED_TEXT', '2026-10-02T14:59:59Z'),
        activity('start30', 'COPIED_TEXT', '2026-10-02T15:00:00Z'),
        activity('before7', 'COPIED_TEXT', '2026-10-25T14:59:59Z'),
        activity('start7', 'COPIED_TEXT', '2026-10-25T15:00:00Z'),
        activity('now', 'COPIED_TEXT', request.asOf.toISOString()),
        activity('future', 'COPIED_TEXT', '2026-11-01T03:00:01Z'),
      ],
    });
    expect(result.allTime.activeDays).toBe(5);
    expect(result.last30Days.activeDays).toBe(4);
    expect(result.last7Days.activeDays).toBe(2);
    expect(result.allTime.lastActiveAt).toBe(request.asOf.toISOString());
  });

  it('counts calendar days across DST without assuming a day is 24 hours', () => {
    const result = summarize(
      {
        activities: [
          activity('before', 'COPIED_TEXT', '2026-11-01T05:30Z'),
          activity('after', 'COPIED_TEXT', '2026-11-01T06:30Z'),
        ],
      },
      { ...request, asOf: new Date('2026-11-02T05:00Z'), timezone: 'America/New_York' },
    );
    expect(result.last7Days).toMatchObject({
      fromLocalDate: '2026-10-27',
      throughLocalDate: '2026-11-02',
      activeDays: 1,
    });
  });

  it('sums large known cost exactly, preserves unknown costs and deduplicates usage records', () => {
    const cost = { ...row('cost'), estimatedCostUsdMicros: 9007199254740993n };
    const result = summarize({
      aiUsage: [
        cost,
        { ...cost },
        { ...row('unknown'), estimatedCostUsdMicros: null },
        { ...row('other'), estimatedCostUsdMicros: 10n },
      ],
    });
    expect(result.allTime.aiCost).toEqual({ knownUsdMicros: '9007199254741003', unknownEvents: 1 });
    expect(() => JSON.stringify(result)).not.toThrow();
    expect(result.allTime.activeDays).toBe(0);
  });

  it.each(['workspaceId', 'serviceId', 'groupMembershipId', 'userId', 'bunshinId'] as const)(
    'rejects foreign %s in every source collection',
    (key) => {
      const foreign = { ...row('foreign'), scope: { ...request.scope, [key]: 'other' } };
      const fixtures: Partial<MemberUsageSources>[] = [
        { generations: [{ ...foreign, trigger: 'USER', status: 'SUCCESS' }] },
        { activities: [{ ...foreign, type: 'POSTED', dailyMissionId: 'm' }] },
        { decisions: [{ ...foreign, decision: 'ACCEPTED', dailyMissionId: 'm' }] },
        { postRecords: [{ ...foreign, dailyMissionId: 'm' }] },
        { aiUsage: [{ ...foreign, estimatedCostUsdMicros: 1n }] },
        { scope: foreign.scope },
      ];
      for (const fixture of fixtures)
        expect(() => summarize(fixture)).toThrow('invalid member usage source');
    },
  );

  it('rejects partial reads, conflicting replay, negative cost and invalid source time', () => {
    const a = activity('a', 'ACCEPTED');
    for (const fixture of [
      { completeness: 'PARTIAL' as const },
      { activities: [a, { ...a, type: 'REJECTED' }] },
      { aiUsage: [{ ...row('negative'), estimatedCostUsdMicros: -1n }] },
      { activities: [{ ...a, occurredAt: new Date('invalid') }] },
    ])
      expect(() => summarize(fixture)).toThrow();
  });
});

describe('GetMemberUsageSummary authorization', () => {
  const setup = () => {
    const authorize = vi.fn().mockResolvedValue(true);
    const read = vi.fn().mockResolvedValue(empty());
    return { authorize, read, useCase: new GetMemberUsageSummary({ authorize }, { read }) };
  };
  it('authorizes before any source read', async () => {
    const s = setup();
    s.authorize.mockResolvedValue(false);
    await expect(s.useCase.execute(request)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(s.read).not.toHaveBeenCalled();
  });
  it.each([
    { ...request, actorUserId: 'other' },
    { ...request, timezone: 'invalid' },
    { ...request, asOf: new Date('invalid') },
  ])('validates before authorization', async (input) => {
    const s = setup();
    await expect(s.useCase.execute(input)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(s.authorize).not.toHaveBeenCalled();
    expect(s.read).not.toHaveBeenCalled();
  });
  it('preserves request scope across asynchronous ports', async () => {
    const s = setup();
    s.authorize.mockImplementation((value: MemberUsageRequest) => {
      value.scope.userId = 'other';
      value.asOf.setFullYear(2030);
      return Promise.resolve(true);
    });
    const result = await s.useCase.execute(request);
    expect(s.read).toHaveBeenCalledWith(request);
    expect(result.scope.userId).toBe('user');
    expect(result.asOf).toBe(request.asOf.toISOString());
  });
  it('propagates failures instead of returning empty metrics', async () => {
    const s = setup();
    s.read.mockRejectedValue(new Error('storage unavailable'));
    await expect(s.useCase.execute(request)).rejects.toThrow('storage unavailable');
    s.read.mockResolvedValue(null);
    await expect(s.useCase.execute(request)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
