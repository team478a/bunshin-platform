import { describe, expect, it } from 'vitest';
import { validateSavePersonalLearningRequest } from '@bunshin/application';
import {
  buildSideHustleInitialRequest,
  buildSideHustleRoadmapRevisionRequest,
  validateSideHustleRoadmapProposal,
  type SideHustleRoadmapProposal,
} from '../src/side-hustle-roadmap';
import type { SideHustleHearing } from '../src/side-hustle-hearing';

const proposal: SideHustleRoadmapProposal = {
  reason: '小さな準備から始める計画です。',
  milestones: [
    {
      period: 'MONTH_1',
      title: '準備する',
      outcome: '必要な情報を整理できている',
      checkpoints: ['公式情報を確認する'],
      weeklyHours: 2,
    },
    {
      period: 'MONTH_2',
      title: '試してみる',
      outcome: '小さな実践を行い記録している',
      checkpoints: ['自分で試す'],
      weeklyHours: 3,
    },
    {
      period: 'MONTH_3',
      title: '続け方を整える',
      outcome: '続ける方法を振り返っている',
      checkpoints: ['記録を振り返る'],
      weeklyHours: 3,
    },
  ],
};
const candidate = {
  name: '文章作成',
  category: 'SKILL_SERVICE',
  summary: '文章を作成する仕事',
  monetization: '依頼に応じて作業する',
  fitReasons: [],
  initialCost: 'NONE',
  monthlyCost: 'NONE',
  weeklyHoursMin: 3,
  difficulty: 1,
  requiredSkills: [],
  workStyle: {
    faceExposure: 'NONE',
    snsPosting: 'NONE',
    clientInteraction: 'OPTIONAL',
    salesOutreach: 'OPTIONAL',
    inventory: 'NONE',
    device: 'PC_REQUIRED',
  },
  typicalFlow: [],
  risks: [],
  requirements: [],
} as const;
const hearing: SideHustleHearing = {
  conditions: {
    initialBudget: null,
    monthlyBudget: null,
    weeklyHours: 5,
    faceExposure: null,
    snsPosting: null,
    clientInteraction: null,
    salesOutreach: null,
    inventory: null,
    device: 'PC',
  },
  freeText: { goal: '得意を活かす', experience: '文章の経験', interest: null, constraint: null },
  followUps: [],
};

describe('side hustle roadmap contract', () => {
  it('accepts and freezes the ordered three-month roadmap, including revalidation', () => {
    const first = validateSideHustleRoadmapProposal(proposal, { weeklyHours: 5 });
    const readAgain = validateSideHustleRoadmapProposal(first, { weeklyHours: 5 });
    expect(readAgain).toEqual(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.milestones[0]?.checkpoints)).toBe(true);
  });
  it.each([
    { ...proposal, extra: true },
    { ...proposal, milestones: proposal.milestones.slice(0, 2) },
    {
      ...proposal,
      milestones: [proposal.milestones[1], proposal.milestones[0], proposal.milestones[2]],
    },
    {
      ...proposal,
      milestones: [{ ...proposal.milestones[0]!, extra: true }, ...proposal.milestones.slice(1)],
    },
    {
      ...proposal,
      milestones: [{ ...proposal.milestones[0]!, title: ' ' }, ...proposal.milestones.slice(1)],
    },
    {
      ...proposal,
      milestones: [{ ...proposal.milestones[0]!, weeklyHours: 6 }, ...proposal.milestones.slice(1)],
    },
    {
      ...proposal,
      milestones: [
        { ...proposal.milestones[0]!, weeklyHours: 2.5 },
        ...proposal.milestones.slice(1),
      ],
    },
    { ...proposal, reason: '誰でも稼げます' },
    {
      ...proposal,
      milestones: [
        { ...proposal.milestones[0]!, outcome: '暗号資産を始める' },
        ...proposal.milestones.slice(1),
      ],
    },
    { ...proposal, reason: ' ' },
    { ...proposal, reason: 'x'.repeat(301) },
    {
      ...proposal,
      milestones: [
        { ...proposal.milestones[0]!, title: 'x'.repeat(41) },
        ...proposal.milestones.slice(1),
      ],
    },
    {
      ...proposal,
      milestones: [
        { ...proposal.milestones[0]!, outcome: 'x'.repeat(161) },
        ...proposal.milestones.slice(1),
      ],
    },
    {
      ...proposal,
      milestones: [
        { ...proposal.milestones[0]!, checkpoints: ['x'.repeat(81)] },
        ...proposal.milestones.slice(1),
      ],
    },
    {
      ...proposal,
      milestones: [
        { ...proposal.milestones[0]!, checkpoints: [] },
        ...proposal.milestones.slice(1),
      ],
    },
    {
      ...proposal,
      milestones: [{ ...proposal.milestones[0]!, weeklyHours: 0 }, ...proposal.milestones.slice(1)],
    },
  ])('rejects invalid or unsafe roadmaps', (value) => {
    expect(() => validateSideHustleRoadmapProposal(value, { weeklyHours: 5 })).toThrow();
  });
  it('accepts a valid roadmap when the hearing has no weekly-hours answer', () => {
    const withinCandidateLimit = {
      ...proposal,
      milestones: proposal.milestones.map((m) => ({ ...m, weeklyHours: 3 })),
    };
    expect(validateSideHustleRoadmapProposal(withinCandidateLimit, { weeklyHours: null })).toEqual(
      withinCandidateLimit,
    );
  });
  it('builds and validates the initial learning request with device mapping', () => {
    const content = buildSideHustleInitialRequest({ candidate, hearing, roadmap: proposal });
    expect(content).toMatchObject({
      deviceType: 'PC',
      experienceDescription: '文章の経験',
      toolDescription: null,
    });
    expect(content.originalText).toContain('いまの段階：1か月目「準備する」');
    expect(content.currentPosition).toBe('1か月目の目安：公式情報を確認する');
    const actor = {
      actorUserId: '55555555-5555-4555-8555-555555555555',
      scope: {
        workspaceId: '11111111-1111-4111-8111-111111111111',
        groupId: '22222222-2222-4222-8222-222222222222',
        programEnrollmentId: '33333333-3333-4333-8333-333333333333',
        groupMembershipId: '44444444-4444-4444-8444-444444444444',
        userId: '55555555-5555-4555-8555-555555555555',
      },
    };
    expect(() =>
      validateSavePersonalLearningRequest({
        actorUserId: actor.actorUserId,
        scope: actor.scope,
        content,
        expectedRevision: 0,
        idempotencyKey: 'side-hustle-start:66666666-6666-4666-8666-666666666666',
      }),
    ).not.toThrow();
    expect(
      buildSideHustleInitialRequest({
        candidate,
        hearing: { ...hearing, conditions: { ...hearing.conditions, device: 'SMARTPHONE_ONLY' } },
        roadmap: proposal,
      }).deviceType,
    ).toBe('SMARTPHONE');
    expect(
      buildSideHustleInitialRequest({
        candidate,
        hearing: { ...hearing, conditions: { ...hearing.conditions, device: null } },
        roadmap: proposal,
      }).deviceType,
    ).toBeNull();
  });

  it('updates all roadmap lines and the current-month aim when a revised map is confirmed', () => {
    const previous = {
      originalText: [
        '希望：文章を書く',
        '90日の地図（本人が確認済み）：',
        '1か月目：旧1（旧成果1）',
        '2か月目：旧2（旧成果2）',
        '3か月目：旧3（旧成果3）',
        'いまの段階：2か月目「旧2」',
        'いまの段階の目安：古い目安',
      ].join('\n'),
      currentPosition: '古い位置',
      deviceType: 'PC' as const,
      toolDescription: null,
      experienceDescription: null,
    };
    const revised = buildSideHustleRoadmapRevisionRequest({
      previous,
      roadmap: proposal,
      currentPeriod: 'MONTH_2',
    });

    expect(revised.originalText).toContain('1か月目：準備する（必要な情報を整理できている）');
    expect(revised.originalText).toContain('2か月目：試してみる（小さな実践を行い記録している）');
    expect(revised.originalText).toContain('3か月目：続け方を整える（続ける方法を振り返っている）');
    expect(revised.originalText).toContain('いまの段階：2か月目「試してみる」');
    expect(revised.originalText).toContain('いまの段階の目安：自分で試す');
    expect(revised.currentPosition).toBe('2か月目の目安：自分で試す');
    expect(revised.deviceType).toBe('PC');
  });

  it('adds a missing current-month aim after the stage line and rejects duplicate aim lines', () => {
    const previous = {
      originalText:
        '希望\n90日の地図（本人が確認済み）：\n1か月目：A\n2か月目：B\n3か月目：C\nいまの段階：2か月目「B」',
      currentPosition: null,
      deviceType: null,
      toolDescription: null,
      experienceDescription: null,
    };
    expect(
      buildSideHustleRoadmapRevisionRequest({
        previous,
        roadmap: proposal,
        currentPeriod: 'MONTH_2',
      }).originalText,
    ).toContain('いまの段階：2か月目「試してみる」\nいまの段階の目安：自分で試す');
    expect(() =>
      buildSideHustleRoadmapRevisionRequest({
        previous: {
          ...previous,
          originalText: `${previous.originalText}\nいまの段階の目安：重複1\nいまの段階の目安：重複2`,
        },
        roadmap: proposal,
        currentPeriod: 'MONTH_2',
      }),
    ).toThrow();
  });
});
