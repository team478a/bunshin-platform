import { describe, expect, it } from 'vitest';
import {
  CreateDailyMission,
  ListDailyMissions,
  TransitionDailyMission,
  normalizeMissionContent,
  type DailyMission,
  type DailyMissionRepository,
} from '../src';
import type { BunshinCapabilityAssignmentRepository } from '@bunshin/application';

const now = new Date('2026-08-19T00:00:00Z');
const slide = {
  topic: '基礎',
  angle: '3手',
  reason: '初心者向け',
  estimatedMinutes: 5,
  slides: [
    { index: 1, role: 'HOOK', headline: '最初に', body: '本文' },
    { index: 2, role: 'CTA', headline: '試す', body: '本文' },
  ],
  caption: 'caption',
  hashtags: ['#基礎'],
};
const mission: DailyMission = {
  id: 'mission-1',
  workspaceId: 'workspace-1',
  bunshinId: 'bunshin-1',
  socialProfileId: null,
  weeklyPlanItemId: null,
  missionDate: '2026-08-19',
  status: 'GENERATED',
  format: 'SLIDE',
  estimatedMinutes: 5,
  topic: '基礎',
  angle: '3手',
  reason: '初心者向け',
  qualityScore: null,
  viewedAt: null,
  startedAt: null,
  completedAt: null,
  skippedAt: null,
  expiredAt: null,
  createdAt: now,
  updatedAt: now,
  content: slide,
};
class Missions implements DailyMissionRepository {
  create(input: Parameters<DailyMissionRepository['create']>[0]) {
    return Promise.resolve({ ...mission, ...input });
  }
  list() {
    return Promise.resolve([mission]);
  }
  find() {
    return Promise.resolve(mission);
  }
  transition(input: Parameters<DailyMissionRepository['transition']>[0]) {
    return Promise.resolve({ ...mission, status: input.status });
  }
}
class Assignments implements BunshinCapabilityAssignmentRepository {
  constructor(private readonly status: 'MISSING' | 'ACTIVE' | 'SUSPENDED' | 'LOCKED' = 'ACTIVE') {}
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
    return Promise.resolve(
      this.status === 'MISSING'
        ? null
        : {
            id: 'assignment-1',
            workspaceId: 'workspace-1',
            bunshinId: 'bunshin-1',
            capabilityType: 'SOCIAL' as const,
            status: this.status,
            config: {},
            assignedByUserId: 'user-1',
            activatedAt: now,
            createdAt: now,
            updatedAt: now,
          },
    );
  }
}
const input = {
  workspaceId: 'workspace-1',
  actorUserId: 'user-1',
  bunshinId: 'bunshin-1',
  missionDate: '2026-08-19',
  format: 'SLIDE' as const,
  estimatedMinutes: 5,
  topic: ' 基礎 ',
  angle: ' 3手 ',
  reason: ' 初心者向け ',
  content: slide,
};

describe('Daily Mission core', () => {
  it('normalizes a mission and requires ACTIVE SOCIAL', async () => {
    const value = await new CreateDailyMission(new Missions(), new Assignments()).execute(input);
    expect(value).toMatchObject({ topic: '基礎', missionDate: '2026-08-19' });
    for (const status of ['MISSING', 'SUSPENDED', 'LOCKED'] as const)
      await expect(
        new CreateDailyMission(new Missions(), new Assignments(status)).execute(input),
      ).rejects.toThrow();
  });

  it('rejects bad date, numbers, format mismatch, and unknown fields', async () => {
    for (const value of [
      { ...input, missionDate: '2026-02-30' },
      { ...input, estimatedMinutes: 0 },
      { ...input, qualityScore: 101 },
      { ...input, content: { ...slide, secret: true } },
      { ...input, content: { ...slide, slides: [{ ...slide.slides[0], index: 2 }] } },
      { ...input, content: { ...slide, slides: [{ ...slide.slides[0], role: 'BODY' }] } },
    ])
      await expect(
        new CreateDailyMission(new Missions(), new Assignments()).execute(value),
      ).rejects.toThrow();
  });

  it('validates all content formats', () => {
    expect(() =>
      normalizeMissionContent('TEXT', {
        body: '今日から始める3つの方法',
        threadParts: ['1つ目', '2つ目'],
        cta: '保存してください',
        caption: null,
        hashtags: ['#初心者'],
      }),
    ).not.toThrow();
    expect(() =>
      normalizeMissionContent('LIVE_ACTION', {
        topic: '基礎',
        estimatedMinutes: 10,
        shootingInstruction: '正面',
        script: [
          { seconds: '0-3', role: 'HOOK', text: '開始' },
          { seconds: '3-30', role: 'CTA', text: '行動' },
        ],
        caption: 'caption',
      }),
    ).not.toThrow();
    expect(() =>
      normalizeMissionContent('AI_VIDEO_PROMPT', {
        topic: '基礎',
        estimatedMinutes: 10,
        toolSuggestion: null,
        videoSettings: { aspectRatio: '9:16', durationSeconds: 8, style: 'clean' },
        prompt: 'prompt',
        overlayText: [],
        caption: 'caption',
      }),
    ).not.toThrow();
    expect(() =>
      normalizeMissionContent('IMAGE', {
        topic: '基礎',
        angle: '3手',
        reason: '初心者向け',
        estimatedMinutes: 3,
        imageInstruction: '図解',
        overlayText: null,
        caption: 'caption',
        hashtags: [],
      }),
    ).not.toThrow();
    expect(() =>
      normalizeMissionContent('TEXT', {
        body: '本文',
        threadParts: [],
        cta: null,
        caption: null,
        hashtags: [],
        providerPayload: {},
      }),
    ).toThrow();
  });

  it('validates inclusive date ranges up to 90 days', async () => {
    await expect(
      new ListDailyMissions(new Missions()).execute({
        workspaceId: 'workspace-1',
        actorUserId: 'user-1',
        bunshinId: 'bunshin-1',
        from: '2026-01-01',
        to: '2026-04-01',
      }),
    ).rejects.toThrow();
  });

  it('passes explicit transitions through the ACTIVE guard', async () => {
    const value = await new TransitionDailyMission(new Missions(), new Assignments()).execute({
      workspaceId: 'workspace-1',
      actorUserId: 'user-1',
      bunshinId: 'bunshin-1',
      dailyMissionId: 'mission-1',
      status: 'COMPLETED',
    });
    expect(value.status).toBe('COMPLETED');
  });
});
