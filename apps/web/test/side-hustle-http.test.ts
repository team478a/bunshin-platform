import { describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@bunshin/shared';
import { projectSideHustleProposalForLearner, sideHustleFailure } from '../src/http/side-hustle';

const auth = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  resolveActor: vi.fn(),
  proposal: vi.fn(),
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: auth.getCurrentUser }),
}));
vi.mock('../src/services/personal-learning-request-access', () => ({
  resolvePersonalLearningRequestActor: auth.resolveActor,
}));
vi.mock('../src/services/side-hustle-proposal', () => ({
  prepareSideHustleProposal: auth.proposal,
}));
vi.mock('../src/auth/request-security', () => ({ requireSameOrigin: vi.fn() }));
import { sideHustleResponse } from '../src/http/side-hustle';

describe('side hustle learner API projection', () => {
  it('shows an operator-contact message for both start restrictions', async () => {
    const historic = await sideHustleFailure(
      new ApplicationError('CONFLICT', 'unscoped learning requests exist'),
      'start',
    ).json();
    const multiTopicOff = await sideHustleFailure(
      new ApplicationError('CONFIGURATION_ERROR', 'multi-topic learning is required'),
      'start',
    ).json();
    expect(historic.error.message).toBe(
      '以前の学習記録があるため、副業版を開始できません。運営にお問い合わせください',
    );
    expect(multiTopicOff.error.message).toContain('運営にお問い合わせください');
    expect(historic.error.message).not.toContain('時間をおいて');
    expect(multiTopicOff.error.message).not.toContain('時間をおいて');
  });

  it('uses the dedicated roadmap daily-limit message', async () => {
    const response = await sideHustleFailure(
      new ApplicationError('CONFLICT', 'daily side hustle proposal limit reached'),
      'roadmap',
    ).json();
    expect(response.error.message).toBe('今日の地図づくりの上限に達しました');
  });

  it('rejects an enrollment without AI usage consent before any proposal Provider call', async () => {
    auth.getCurrentUser.mockResolvedValue({ userId: 'user' });
    auth.resolveActor.mockRejectedValue(new ApplicationError('FORBIDDEN', 'usage consent missing'));
    const response = await sideHustleResponse(
      new Request('https://example.test/side-hustle'),
      'service',
      'enrollment',
    );
    expect(response.status).toBe(403);
    expect(auth.proposal).not.toHaveBeenCalled();
  });

  it('omits excluded candidates and removed candidate names while retaining only their count', () => {
    const saved = {
      id: 'proposal',
      hearingEventId: 'hearing',
      hearingRevision: 1,
      contractVersion: 'SIDE_HUSTLE_CANDIDATE_V1',
      screeningRuleVersion: 'SIDE_HUSTLE_SCREENING_V2',
      promptVersion: 'side-hustle-candidates-v1',
      usageKey: 'personal-learning-operation:' + 'a'.repeat(64),
      createdAt: '2026-10-22T00:00:00.000Z',
      proposal: {
        status: 'READY',
        reason: '条件に合う候補を整理しました。',
        questions: [],
        candidates: [{ name: '表示する候補' }, { name: '隠す候補' }],
        removedCandidates: [{ name: '除外した候補名', excludedAreaKey: 'INVESTMENT_SPECULATION' }],
        removedQuestionCount: 0,
      },
      screening: {
        ruleVersion: 'SIDE_HUSTLE_SCREENING_V2',
        candidateContractVersion: 'SIDE_HUSTLE_CANDIDATE_V1',
        missingConditions: [],
        entries: [
          { candidateIndex: 0, name: '表示する候補', verdict: 'FIT', reasons: [] },
          {
            candidateIndex: 1,
            name: '隠す候補',
            verdict: 'EXCLUDED',
            reasons: ['NOT_ENOUGH_TIME'],
          },
        ],
      },
    } as never;
    const projected = projectSideHustleProposalForLearner(saved);
    const serialized = JSON.stringify(projected);
    expect(projected.proposal.candidates).toEqual([{ name: '表示する候補' }]);
    expect(projected.screening.entries).toHaveLength(1);
    expect(projected.removedCandidateCount).toBe(1);
    expect(serialized).not.toContain('隠す候補');
    expect(serialized).not.toContain('除外した候補名');
  });
});
