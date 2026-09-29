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
    startsAt: new Date('2026-09-01T00:00:00Z'),
    endsAt: null,
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
    evaluationUpdatedAt: new Date('2026-09-20T00:00:00.000Z'),
    profileUpdatedAt: new Date('2026-09-19T00:00:00.000Z'),
    workResults: [],
    barrierReasons: [],
    ...overrides,
  };
}

describe('AI training admin dashboard', () => {
  it('excludes past expiry, future start, unknown start and invitation from active/support/continuation while keeping history', () => {
    const rows = [
      participant(),
      participant({
        enrollmentId: 'expired-active',
        endsAt: now,
        profile: {
          role: 'SALES',
          aiLevel: 'BEGINNER',
          currentTopic: null,
          needsReview: true,
          recentFailures: 3,
        },
      }),
      participant({ enrollmentId: 'future', startsAt: new Date(now.getTime() + 1) }),
      participant({ enrollmentId: 'unknown', startsAt: null }),
      participant({ enrollmentId: 'invited', enrollmentStatus: 'INVITED' }),
      participant({ enrollmentId: 'expired-record', enrollmentStatus: 'EXPIRED' }),
      participant({ enrollmentId: 'completed', enrollmentStatus: 'COMPLETED' }),
      participant({ enrollmentId: 'cancelled', enrollmentStatus: 'CANCELLED' }),
    ];
    const dashboard = buildAiTrainingAdminDashboard(rows, now);
    expect(dashboard.totals).toMatchObject({
      active: 1,
      expired: 2,
      pendingExpiryUpdate: 1,
      beforeStart: 1,
      startUnresolved: 1,
      continuedWithinSevenDays: 1,
      continuationPercent: 100,
      needsSupport: 0,
      completedMissions: 24,
    });
    expect(
      dashboard.participants.find((row) => row.enrollmentId === 'expired-active'),
    ).toMatchObject({ engagement: 'ENDED', displayStatus: 'PERIOD_ENDED' });
    expect(dashboard.participants.find((row) => row.enrollmentId === 'future')?.engagement).toBe(
      'BEFORE_START',
    );
    expect(dashboard.participants.find((row) => row.enrollmentId === 'unknown')?.engagement).toBe(
      'PERIOD_UNRESOLVED',
    );
    expect(rows[1]?.enrollmentStatus).toBe('ACTIVE');
  });
  it('uses zero rather than a misleading continuation rate when no enrollment is in period', () => {
    const dashboard = buildAiTrainingAdminDashboard([participant({ endsAt: now })], now);
    expect(dashboard.totals).toMatchObject({
      active: 0,
      continuedWithinSevenDays: 0,
      continuationPercent: 0,
      needsSupport: 0,
    });
  });
  it('summarizes active participation without exposing answer text', () => {
    const dashboard = buildAiTrainingAdminDashboard([participant()], now);

    expect(dashboard.totals).toEqual({
      participants: 1,
      active: 1,
      expired: 0,
      pendingExpiryUpdate: 0,
      beforeStart: 0,
      startUnresolved: 0,
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
      weakArea: 'まだ記録がありません',
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

  it('uses a fixed support label rather than AI evaluation prose', () => {
    const source = participant();
    source.profile!.needsReview = true;
    const dashboard = buildAiTrainingAdminDashboard([source], now);
    expect(dashboard.participants[0]?.weakArea).toBe('基礎の復習が必要です');
    expect(JSON.stringify(dashboard)).not.toContain('weaknesses');
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
    expect(page).toContain('db.listTrainingAdminEvaluationMetrics({');
    expect(page).toContain('actorUserId: actor.userId');
    expect(page).not.toContain('evaluation: true');
    expect(page).not.toContain('latestEvaluation:');
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
