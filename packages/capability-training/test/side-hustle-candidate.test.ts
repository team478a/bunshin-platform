import { ApplicationError } from '@bunshin/shared';
import { describe, expect, it } from 'vitest';

import {
  validateSideHustleCandidateProposal,
  type SideHustleCandidate,
  type SideHustleCandidateProposal,
} from '../src/index';

const candidate = (name = '文章作成サポート'): SideHustleCandidate => ({
  name,
  category: 'SKILL_SERVICE',
  summary: '依頼を受けて読みやすい文章を作る仕事です。',
  monetization: '納品した文章の件数や契約期間に応じて報酬を受け取ります。',
  fitReasons: [{ text: '文章経験を生かせます。', basedOn: ['experience'] }],
  initialCost: 'NONE',
  monthlyCost: 'NONE',
  weeklyHoursMin: 3,
  difficulty: 1,
  requiredSkills: ['文章作成'],
  workStyle: {
    faceExposure: 'NONE',
    snsPosting: 'NONE',
    clientInteraction: 'REQUIRED',
    salesOutreach: 'OPTIONAL',
    inventory: 'NONE',
    device: 'PC_REQUIRED',
  },
  typicalFlow: ['見本を作る', '小さな依頼を探す', '文章を納品する'],
  risks: ['依頼内容と納期の確認が必要です。'],
  requirements: [{ kind: 'PLATFORM_TERMS', text: '利用サービスの規約を確認してください。' }],
});

const ready = (
  candidates: readonly SideHustleCandidate[] = [candidate()],
): SideHustleCandidateProposal => ({
  status: 'READY',
  reason: '回答内容に合う候補です。',
  questions: [],
  candidates,
});

const expectInvalid = (value: unknown) => {
  expect(() => validateSideHustleCandidateProposal(value)).toThrowError(ApplicationError);
  try {
    validateSideHustleCandidateProposal(value);
  } catch (error) {
    expect((error as ApplicationError).code).toBe('VALIDATION_ERROR');
  }
};

const without = (value: Record<string, unknown>, key: string) => {
  const clone = { ...value };
  delete clone[key];
  return clone;
};

describe('side hustle candidate proposal contract', () => {
  it('accepts READY with one or three candidates', () => {
    expect(validateSideHustleCandidateProposal(ready()).status).toBe('READY');
    expect(
      validateSideHustleCandidateProposal(
        ready([candidate('候補一'), candidate('候補二'), candidate('候補三')]),
      ).candidates,
    ).toHaveLength(3);
  });

  it('accepts NEEDS_CONTEXT and NO_FIT', () => {
    expect(
      validateSideHustleCandidateProposal({
        status: 'NEEDS_CONTEXT',
        reason: '追加の回答が必要です。',
        questions: ['使える時間を教えてください。'],
        candidates: [],
      }).status,
    ).toBe('NEEDS_CONTEXT');
    expect(
      validateSideHustleCandidateProposal({
        status: 'NO_FIT',
        reason: '安全に提案できる候補がありません。',
        questions: [],
        candidates: [],
      }).status,
    ).toBe('NO_FIT');
  });

  it.each([
    { ...ready(), questions: ['不要な質問'] },
    { status: 'NEEDS_CONTEXT', reason: '追加確認', questions: ['質問'], candidates: [candidate()] },
    { status: 'NO_FIT', reason: '候補なし', questions: [], candidates: [candidate()] },
    ready([]),
    ready([candidate('一'), candidate('二'), candidate('三'), candidate('四')]),
  ])('rejects state-specific population violations', (value) => expectInvalid(value));

  it('rejects extra and missing keys at every object level', () => {
    const top = ready() as unknown as Record<string, unknown>;
    expectInvalid({ ...top, extra: true });
    expectInvalid(without(top, 'reason'));

    const base = candidate() as unknown as Record<string, unknown>;
    expectInvalid(ready([{ ...candidate(), extra: true } as unknown as SideHustleCandidate]));
    expectInvalid(ready([without(base, 'summary') as unknown as SideHustleCandidate]));
    expectInvalid(
      ready([
        {
          ...candidate(),
          workStyle: { ...candidate().workStyle, extra: true },
        } as unknown as SideHustleCandidate,
      ]),
    );
    expectInvalid(
      ready([
        {
          ...candidate(),
          workStyle: without(candidate().workStyle, 'device'),
        } as unknown as SideHustleCandidate,
      ]),
    );
    expectInvalid(
      ready([
        {
          ...candidate(),
          fitReasons: [{ ...candidate().fitReasons[0]!, extra: true }],
        } as unknown as SideHustleCandidate,
      ]),
    );
    expectInvalid(
      ready([
        {
          ...candidate(),
          fitReasons: [
            without(candidate().fitReasons[0] as unknown as Record<string, unknown>, 'text'),
          ],
        } as unknown as SideHustleCandidate,
      ]),
    );
    expectInvalid(
      ready([
        {
          ...candidate(),
          requirements: [{ ...candidate().requirements[0]!, extra: true }],
        } as unknown as SideHustleCandidate,
      ]),
    );
    expectInvalid(
      ready([
        {
          ...candidate(),
          requirements: [
            without(candidate().requirements[0] as unknown as Record<string, unknown>, 'kind'),
          ],
        } as unknown as SideHustleCandidate,
      ]),
    );
  });

  it('rejects duplicate names, bad strings, bounds and enums', () => {
    expectInvalid(ready([candidate(), candidate()]));
    expectInvalid(ready([{ ...candidate(), name: ' 前後空白' }]));
    expectInvalid(ready([{ ...candidate(), summary: '' }]));
    expectInvalid(ready([{ ...candidate(), name: '長'.repeat(41) }]));
    expectInvalid(ready([{ ...candidate(), requiredSkills: Array(6).fill('技能') }]));
    expectInvalid(
      ready([{ ...candidate(), category: 'UNKNOWN' as SideHustleCandidate['category'] }]),
    );
    expectInvalid(ready([{ ...candidate(), weeklyHoursMin: 0 }]));
    expectInvalid(ready([{ ...candidate(), weeklyHoursMin: 41 }]));
    expectInvalid(ready([{ ...candidate(), weeklyHoursMin: 1.5 }]));
  });

  it('rejects empty, duplicate and unknown fit reason bases', () => {
    expectInvalid(ready([{ ...candidate(), fitReasons: [{ text: '理由', basedOn: [] }] }]));
    expectInvalid(
      ready([{ ...candidate(), fitReasons: [{ text: '理由', basedOn: ['goal', 'goal'] }] }]),
    );
    expectInvalid(
      ready([
        {
          ...candidate(),
          fitReasons: [{ text: '理由', basedOn: ['unknown' as 'goal'] }],
        },
      ]),
    );
  });

  it.each([
    (value: string) => ({ ...candidate(), name: value }),
    (value: string) => ({ ...candidate(), summary: value }),
    (value: string) => ({ ...candidate(), monetization: value }),
    (value: string) => ({
      ...candidate(),
      fitReasons: [{ text: value, basedOn: ['goal'] as const }],
    }),
    (value: string) => ({ ...candidate(), requiredSkills: [value] }),
    (value: string) => ({ ...candidate(), typicalFlow: [value, '二番目', '三番目'] }),
    (value: string) => ({ ...candidate(), risks: [value] }),
    (value: string) => ({
      ...candidate(),
      requirements: [{ kind: 'LEGAL' as const, text: value }],
    }),
  ])('rejects a guarantee expression in every candidate text field', (change) => {
    expectInvalid(ready([change('絶対に稼げます')]));
  });

  it('rejects guarantee expressions in reason and questions', () => {
    expectInvalid({ ...ready(), reason: '成果を保証します' });
    expectInvalid({
      status: 'NEEDS_CONTEXT',
      reason: '追加確認です',
      questions: ['月収の希望はありますか'],
      candidates: [],
    });
  });

  it('removes only the excluded candidate and records the reason', () => {
    const result = validateSideHustleCandidateProposal(
      ready([
        candidate('安全な候補一'),
        { ...candidate('除外候補'), summary: 'FXを扱う仕事です。' },
        candidate('安全な候補二'),
      ]),
    );
    expect(result.candidates.map(({ name }) => name)).toEqual(['安全な候補一', '安全な候補二']);
    expect(result.removedCandidates).toEqual([
      { name: '除外候補', excludedAreaKey: 'INVESTMENT_SPECULATION' },
    ]);
  });

  it('changes an all-removed READY proposal to NO_FIT with the fixed reason', () => {
    const result = validateSideHustleCandidateProposal(
      ready([{ ...candidate('除外候補'), risks: ['アカウント売買を扱います。'] }]),
    );
    expect(result).toMatchObject({
      status: 'NO_FIT',
      reason: '条件に合う候補を安全に提案できませんでした。',
      candidates: [],
      removedCandidates: [
        { name: '除外候補', excludedAreaKey: 'PERSONAL_DATA_OR_ACCOUNT_TRADING' },
      ],
    });
  });

  it('replaces a reason that mentions an excluded candidate name', () => {
    const result = validateSideHustleCandidateProposal({
      ...ready([
        candidate('安全な候補'),
        { ...candidate('動画編集サポート'), summary: 'FX関連の動画を編集します。' },
      ]),
      reason: '動画編集サポートが条件に合います。',
    });
    expect(result.reason).toBe('条件に合う候補を整理しました。');
    expect(result.status).toBe('READY');
  });

  it('replaces a reason containing an excluded keyword', () => {
    const result = validateSideHustleCandidateProposal({
      ...ready(),
      reason: 'FXに関する候補を含みます。',
    });
    expect(result.reason).toBe('条件に合う候補を整理しました。');
  });

  it('removes excluded questions and reports their count', () => {
    const result = validateSideHustleCandidateProposal({
      status: 'NEEDS_CONTEXT',
      reason: '追加の回答が必要です。',
      questions: ['週に使える時間を教えてください。', 'FXへの投資経験を教えてください。'],
      candidates: [],
    });
    expect(result.status).toBe('NEEDS_CONTEXT');
    expect(result.questions).toEqual(['週に使える時間を教えてください。']);
    expect(result.removedQuestionCount).toBe(1);
  });

  it('changes NEEDS_CONTEXT to NO_FIT when every question is excluded', () => {
    const result = validateSideHustleCandidateProposal({
      status: 'NEEDS_CONTEXT',
      reason: '追加の回答が必要です。',
      questions: ['FXへの投資経験を教えてください。'],
      candidates: [],
    });
    expect(result).toMatchObject({
      status: 'NO_FIT',
      reason: '条件に合う候補を安全に提案できませんでした。',
      questions: [],
      removedQuestionCount: 1,
    });
  });

  it.each(['リスクを絶対に避けたい場合は', '保証書を同梱します', 'タイムスロット'])(
    'does not let safe wording %s trigger exclusion or guarantee checks',
    (phrase) => {
      expect(
        validateSideHustleCandidateProposal({
          ...ready(),
          reason: phrase,
        }).reason,
      ).toBe(phrase);
    },
  );

  it.each(['basis', 'checkedAt', 'verified'])('rejects unsupported verification key %s', (key) => {
    expectInvalid(ready([{ ...candidate(), [key]: key === 'verified' ? true : 'value' }]));
  });

  it('deep-freezes the returned value', () => {
    const result = validateSideHustleCandidateProposal(ready());
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.candidates)).toBe(true);
    expect(Object.isFrozen(result.candidates[0])).toBe(true);
    expect(Object.isFrozen(result.candidates[0]?.workStyle)).toBe(true);
    expect(Object.isFrozen(result.candidates[0]?.fitReasons[0]?.basedOn)).toBe(true);
    expect(Object.isFrozen(result.removedCandidates)).toBe(true);
  });
});
