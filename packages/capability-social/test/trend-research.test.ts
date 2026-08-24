import type { BunshinCapabilityAssignmentRepository } from '@bunshin/application';
import { describe, expect, it } from 'vitest';
import {
  CreateCompletedTrendResearch,
  normalizeCompletedTrendResearchInput,
  rankTrendIdeaCandidates,
  type TrendIdeaCandidate,
  type TrendResearchRepository,
} from '../src';

const completedAt = new Date('2026-08-24T00:00:00.000Z');
const expiresAt = new Date('2026-08-31T00:00:00.000Z');
const input = {
  workspaceId: 'workspace-1',
  actorUserId: 'user-1',
  bunshinId: 'bunshin-1',
  socialProfileId: 'profile-1',
  platform: 'YOUTUBE_SHORTS' as const,
  periodStart: '2026-08-24',
  periodEnd: '2026-08-30',
  queryVersion: ' weekly-v1 ',
  providerKey: ' web-search ',
  completedAt,
  expiresAt,
  evidence: [
    {
      key: 'source-1',
      sourceType: 'PUBLIC_WEB' as const,
      sourceUrl: 'https://example.com/trend',
      sourceTitle: ' Trend source ',
      publishedAt: completedAt,
      retrievedAt: completedAt,
      summary: ' Evidence summary ',
      evidenceHash: 'a'.repeat(64),
      expiresAt,
    },
  ],
  candidates: [
    {
      platform: 'YOUTUBE_SHORTS' as const,
      topic: ' Trend idea ',
      hook: ' Hook ',
      whyNow: ' Timely ',
      fitReason: ' Fits audience ',
      suggestedFormat: 'LIVE_ACTION' as const,
      estimatedMinutes: 10,
      freshnessScore: 90,
      fitScore: 80,
      feasibilityScore: 70,
      safetyStatus: 'SAFE' as const,
      expiresAt,
      evidenceKeys: ['source-1'],
    },
  ],
};
class Assignments implements BunshinCapabilityAssignmentRepository {
  constructor(private readonly status: 'ACTIVE' | 'SUSPENDED' = 'ACTIVE') {}
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
    return Promise.resolve({
      id: 'a',
      workspaceId: input.workspaceId,
      bunshinId: input.bunshinId,
      capabilityType: 'SOCIAL' as const,
      status: this.status,
      config: {},
      assignedByUserId: input.actorUserId,
      activatedAt: completedAt,
      createdAt: completedAt,
      updatedAt: completedAt,
    });
  }
}
class Research implements TrendResearchRepository {
  received: Parameters<TrendResearchRepository['createCompleted']>[0] | null = null;
  createCompleted(value: Parameters<TrendResearchRepository['createCompleted']>[0]) {
    this.received = value;
    return Promise.resolve({
      id: 'run-1',
      workspaceId: value.workspaceId,
      bunshinId: value.bunshinId,
      socialProfileId: value.socialProfileId,
      periodStart: value.periodStart,
      periodEnd: value.periodEnd,
      queryVersion: value.queryVersion,
      providerKey: value.providerKey,
      completedAt: value.completedAt,
      expiresAt: value.expiresAt,
      evidence: [],
      candidates: [],
    });
  }
  listActive() {
    return Promise.resolve([]);
  }
}

describe('Trend Research Core', () => {
  it('normalizes a completed weekly run and preserves evidence references', () => {
    expect(normalizeCompletedTrendResearchInput(input)).toMatchObject({
      queryVersion: 'weekly-v1',
      providerKey: 'web-search',
      evidence: [{ sourceTitle: 'Trend source', summary: 'Evidence summary' }],
      candidates: [{ topic: 'Trend idea', evidenceKeys: ['source-1'] }],
    });
  });
  it('rejects unsafe URLs, missing evidence and cross-platform formats', () => {
    expect(() =>
      normalizeCompletedTrendResearchInput({
        ...input,
        evidence: [{ ...input.evidence[0]!, sourceUrl: 'http://example.com' }],
      }),
    ).toThrow();
    expect(() =>
      normalizeCompletedTrendResearchInput({
        ...input,
        candidates: [{ ...input.candidates[0]!, evidenceKeys: ['missing'] }],
      }),
    ).toThrow();
    expect(() =>
      normalizeCompletedTrendResearchInput({
        ...input,
        candidates: [{ ...input.candidates[0]!, platform: 'X' }],
      }),
    ).toThrow();
  });
  it('requires an active SOCIAL assignment before persistence', async () => {
    const repository = new Research();
    await expect(
      new CreateCompletedTrendResearch(repository, new Assignments('SUSPENDED')).execute(input),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(repository.received).toBeNull();
  });
  it('passes only normalized, scoped input to persistence', async () => {
    const repository = new Research();
    await new CreateCompletedTrendResearch(repository, new Assignments()).execute(input);
    expect(repository.received).toMatchObject({
      workspaceId: 'workspace-1',
      bunshinId: 'bunshin-1',
      socialProfileId: 'profile-1',
      queryVersion: 'weekly-v1',
    });
  });
});

describe('Trend candidate ranking', () => {
  const candidate = (overrides: Partial<TrendIdeaCandidate> = {}) => ({
    id: 'candidate-a',
    platform: 'YOUTUBE_SHORTS' as const,
    topic: '今週の話題',
    hook: '最初の一言',
    whyNow: '今週注目されているため',
    fitReason: '対象者の悩みに合うため',
    suggestedFormat: 'LIVE_ACTION' as const,
    estimatedMinutes: 10,
    freshnessScore: 80,
    fitScore: 80,
    feasibilityScore: 80,
    safetyStatus: 'SAFE' as const,
    expiresAt,
    evidenceIds: ['evidence-a'],
    ...overrides,
  });

  it('uses a deterministic weighted order with stable tie breaking', () => {
    const ranked = rankTrendIdeaCandidates({
      candidates: [
        candidate({ id: 'candidate-b', fitScore: 90 }),
        candidate({ id: 'candidate-a', fitScore: 90 }),
        candidate({ id: 'candidate-c', freshnessScore: 100, fitScore: 70 }),
      ],
      platform: 'YOUTUBE_SHORTS',
      format: 'LIVE_ACTION',
      availableMinutes: 10,
      at: completedAt,
    });
    expect(ranked.map(({ id }) => id)).toEqual(['candidate-a', 'candidate-b', 'candidate-c']);
    expect(ranked[0]?.rankingScore).toBe(8_400);
  });

  it('excludes expired, unsafe, unsupported, over-budget and evidence-free ideas', () => {
    const ranked = rankTrendIdeaCandidates({
      candidates: [
        candidate(),
        candidate({ id: 'expired', expiresAt: completedAt }),
        candidate({ id: 'unsafe', safetyStatus: 'REVIEW_REQUIRED' }),
        candidate({ id: 'wrong-platform', platform: 'INSTAGRAM' }),
        candidate({ id: 'wrong-format', suggestedFormat: 'AI_VIDEO_PROMPT' }),
        candidate({ id: 'too-long', estimatedMinutes: 20 }),
        candidate({ id: 'no-evidence', evidenceIds: [] }),
      ],
      platform: 'YOUTUBE_SHORTS',
      format: 'LIVE_ACTION',
      availableMinutes: 10,
      at: completedAt,
    });
    expect(ranked.map(({ id }) => id)).toEqual(['candidate-a']);
  });
});
