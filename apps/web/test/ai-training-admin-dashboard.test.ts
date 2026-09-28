import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildAiTrainingAdminDashboard,
  type AiTrainingAdminParticipantInput,
} from '../src/services/ai-training-admin-dashboard';

const page = ['page.tsx', 'training-admin-dashboard.tsx']
  .map((file) =>
    readFileSync(
      new URL(`../app/s/[serviceSlug]/manage/training/${file}`, import.meta.url),
      'utf8',
    ),
  )
  .join('\n');

const now = new Date('2026-09-21T00:00:00.000Z');

function participant(
  overrides: Partial<AiTrainingAdminParticipantInput> = {},
): AiTrainingAdminParticipantInput {
  return {
    enrollmentId: 'enrollment-1',
    enrollmentStatus: 'ACTIVE',
    programName: 'AI研修30日',
    participantName: '山田さん',
    participantEmail: 'yamada@example.com',
    profile: {
      role: 'SALES',
      aiLevel: 'BEGINNER',
      currentTopic: '営業メール',
      needsReview: false,
      recentFailures: 0,
    },
    progress: {
      phaseKey: 'PRACTICE',
      stateKey: 'ACTIVE',
      bottleneckKey: null,
      completedMissionCount: 3,
      lastActionAt: new Date('2026-09-20T00:00:00.000Z'),
    },
    assignment: {
      missionDefinitionKey: 'SALES_EMAIL',
      displaySnapshot: { title: '営業メールを作る' },
    },
    latestEvaluation: {
      weaknesses: ['出力条件を追加しましょう'],
    },
    evaluationUpdatedAt: new Date('2026-09-20T00:00:00.000Z'),
    profileUpdatedAt: new Date('2026-09-19T00:00:00.000Z'),
    workResults: [],
    barrierReasons: [],
    ...overrides,
  };
}

describe('AI training admin dashboard', () => {
  it('summarizes active participation without exposing answer text', () => {
    const dashboard = buildAiTrainingAdminDashboard([participant()], now);

    expect(dashboard.totals).toEqual({
      participants: 1,
      active: 1,
      continuedWithinSevenDays: 1,
      continuationPercent: 100,
      needsSupport: 0,
      completedMissions: 3,
      workResultParticipants: 0,
      workResultCount: 0,
      usedAsIs: 0,
      usedWithEdits: 0,
      notUsedYet: 0,
      notApplicable: 0,
      barrierCount: 0,
      shortMissionCount: 0,
      goalReviewBarrierCount: 0,
    });
    expect(dashboard.participants[0]).toMatchObject({
      participantName: '山田さん',
      roleLabel: '営業',
      currentMission: '営業メールを作る',
      weakArea: '出力条件を追加しましょう',
      engagement: 'ACTIVE',
    });
    expect(JSON.stringify(dashboard)).not.toContain('answer');
  });

  it('aggregates structured barriers without exposing free text', () => {
    const dashboard = buildAiTrainingAdminDashboard(
      [participant({ barrierReasons: ['BUSY', 'TOO_DIFFICULT', 'NOT_RELEVANT'] })],
      now,
    );

    expect(dashboard.totals).toMatchObject({
      barrierCount: 3,
      shortMissionCount: 2,
      goalReviewBarrierCount: 1,
    });
    expect(JSON.stringify(dashboard)).not.toContain('freeText');
  });

  it('aggregates work usage without exposing answer content', () => {
    const dashboard = buildAiTrainingAdminDashboard(
      [participant({ workResults: ['USED_AS_IS', 'USED_WITH_EDITS', 'NOT_USED_YET'] })],
      now,
    );

    expect(dashboard.totals).toMatchObject({
      workResultParticipants: 1,
      workResultCount: 3,
      usedAsIs: 1,
      usedWithEdits: 1,
      notUsedYet: 1,
      notApplicable: 0,
    });
    expect(JSON.stringify(dashboard)).not.toContain('answer');
  });

  it('puts people who need support first and calculates inactivity', () => {
    const inactive = participant({
      enrollmentId: 'inactive',
      participantName: '休止中',
      progress: {
        phaseKey: 'FOUNDATION',
        stateKey: 'ACTIVE',
        bottleneckKey: null,
        completedMissionCount: 1,
        lastActionAt: new Date('2026-09-01T00:00:00.000Z'),
      },
      assignment: null,
      evaluationUpdatedAt: null,
      profileUpdatedAt: new Date('2026-09-01T00:00:00.000Z'),
    });
    const review = participant({
      enrollmentId: 'review',
      participantName: '復習中',
      profile: {
        role: 'OFFICE',
        aiLevel: 'INTERMEDIATE',
        currentTopic: null,
        needsReview: true,
        recentFailures: 2,
      },
      latestEvaluation: null,
    });
    const dashboard = buildAiTrainingAdminDashboard([inactive, review], now);

    expect(dashboard.participants.map(({ engagement }) => engagement)).toEqual([
      'NEEDS_SUPPORT',
      'INACTIVE',
    ]);
    expect(dashboard.totals.needsSupport).toBe(2);
    expect(dashboard.totals.continuationPercent).toBe(50);
  });

  it('keeps every dashboard query inside workspace, service, and enrollment boundaries', () => {
    expect(page.match(/workspaceId: service\.workspaceId/g)?.length).toBeGreaterThanOrEqual(7);
    expect(page.match(/groupId: service\.serviceId/g)?.length).toBeGreaterThanOrEqual(7);
    expect(page).toContain('programEnrollmentId: { in: enrollmentIds }');
    expect(page).toContain("serviceRole: 'PARTICIPANT'");
    expect(page).toContain('evaluatedAt: true');
    expect(page).not.toContain('answer: true');
  });

  it('shows the pilot funnel, learning quality, skill improvement, and toolkit use', () => {
    expect(page).toContain('buildAiTrainingPilotAnalytics');
    expect(page).toContain('初期診断完了');
    expect(page).toContain('Goal選択');
    expect(page).toContain('課題開始');
    expect(page).toContain('再回答率');
    expect(page).toContain('Skill改善');
    expect(page).toContain('Toolkit保存');
  });

  it('shows scoped evaluation operations without exposing answer content', () => {
    expect(page).toContain("jobType: 'TRAINING_ANSWER_EVALUATE'");
    expect(page).toContain(
      'payloadReference: { startsWith: `training-evaluation:${service.serviceId}:` }',
    );
    expect(page).toContain("status: { in: ['PENDING', 'LEASED', 'RETRY_SCHEDULED'] }");
    expect(page).toContain('AI評価の稼働状況');
    expect(page).toContain('評価成功率');
    expect(page).toContain('再試行が発生');
    expect(page).toContain('本人が再投入');
    expect(page).toContain('再実行待ちの回答');
    expect(page).not.toContain('select: { answer: true }');
  });
});
