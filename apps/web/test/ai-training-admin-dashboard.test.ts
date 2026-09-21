import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  buildAiTrainingAdminDashboard,
  type AiTrainingAdminParticipantInput,
} from '../src/services/ai-training-admin-dashboard';

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
    const page = readFileSync(
      new URL('../app/s/[serviceSlug]/manage/training/page.tsx', import.meta.url),
      'utf8',
    );

    expect(page.match(/workspaceId: service\.workspaceId/g)?.length).toBeGreaterThanOrEqual(6);
    expect(page.match(/groupId: service\.serviceId/g)?.length).toBeGreaterThanOrEqual(6);
    expect(page).toContain('programEnrollmentId: { in: enrollmentIds }');
    expect(page).toContain("serviceRole: 'PARTICIPANT'");
    expect(page).toContain(
      'select: { programEnrollmentId: true, evaluation: true, updatedAt: true }',
    );
    expect(page).not.toContain('answer: true');
  });
});
