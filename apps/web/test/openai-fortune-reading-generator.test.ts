import { describe, expect, it } from 'vitest';
import type { FortuneAiGenerationClaim } from '@bunshin/capability-fortune';
import {
  defaultFortuneGuidanceSettings,
  defaultFortuneGuide,
} from '../src/fortune/guidance-settings';
import {
  FORTUNE_AI_PROMPT_VERSION,
  fortuneReadingPromptInput,
} from '../src/providers/openai-fortune-reading-generator';

const claim: FortuneAiGenerationClaim = {
  workspaceId: 'workspace-1',
  groupId: 'group-1',
  bunshinId: 'bunshin-1',
  reading: {
    id: 'reading-today',
    localDate: '2026-09-27',
    theme: 'WORK',
    cardCode: 'THE_FOOL',
    cardNameJa: '愚者',
    orientation: 'UPRIGHT',
    status: 'GENERATING',
    title: '新しい一歩',
    body: '承認済み本文',
    actionStep: '小さく始める',
    feedbackRating: null,
    feedbackIssue: null,
    createdAt: new Date('2026-09-27T00:00:00.000Z'),
  },
  personalization: {
    bunshinProfile: {
      name: '細矢めぐみ',
      objectiveSummary: '毎日を整える',
      audienceSummary: '占いを生活のヒントにしたい人',
      personalitySummary: '穏やかで具体的',
    },
    memories: [
      {
        id: 'memory-1',
        type: 'PREFERENCE',
        summary: '朝に優先順位を整理する習慣',
        content: '仕事では朝に今日の優先順位を整理している',
      },
    ],
    recentReadings: [
      {
        id: 'reading-previous',
        localDate: '2026-09-26',
        theme: 'WORK',
        cardCode: 'THE_STAR',
        orientation: 'UPRIGHT',
        body: '少し抽象的な前回結果',
        actionStep: '考えてみましょう',
        feedbackRating: 'NOT_HELPFUL',
        feedbackIssue: 'TOO_VAGUE',
      },
    ],
  },
};

describe('fortune reading personalization', () => {
  it('uses only the guide preferences for this claim and keeps the participant style first', () => {
    const value = fortuneReadingPromptInput({
      ...claim,
      personalGuidance: true,
      personalProfileRevision: new Date('2026-09-27'),
      defaultStyle: 'DIRECT',
      guidanceSettings: {
        ...defaultFortuneGuidanceSettings,
        guide: {
          ...defaultFortuneGuide,
          introduction: '画面に表示する紹介だけ',
          imageUrl: 'https://images.example/guide.webp',
          language: '余白のある話し方',
          questionApproach: '一歩踏み出せる問い',
        },
      },
      personalization: {
        recentReadings: [],
        participantProfile: { interest: null, question: null, style: 'REFLECTIVE' },
      },
    });
    expect(value).toMatchObject({
      style: 'REFLECTIVE',
      guidePreferences: { language: '余白のある話し方', questionApproach: '一歩踏み出せる問い' },
    });
    expect(JSON.stringify(value)).not.toMatch(/画面に表示する紹介だけ|images\.example/);
    expect(fortuneReadingPromptInput({ ...claim, personalGuidance: true })).not.toHaveProperty(
      'guidePreferences',
    );
  });
  it('passes selected Bunshin information and omits history without profile consent', () => {
    expect(fortuneReadingPromptInput(claim)).toMatchObject({
      personalization: {
        bunshinProfile: { name: '細矢めぐみ', personalitySummary: '穏やかで具体的' },
        memories: [{ summary: '朝に優先順位を整理する習慣' }],
        recentReadings: [],
      },
    });
    expect(FORTUNE_AI_PROMPT_VERSION).toBe('fortune-daily-reading-v6-tarot');
  });

  it('passes the current consultation and consented preferences as data for Tarot', () => {
    const value = fortuneReadingPromptInput({
      ...claim,
      personalGuidance: true,
      personalProfileRevision: new Date('2026-09-27'),
      consultation: '配置転換について考えたい',
      personalization: {
        recentReadings: [],
        participantProfile: { interest: '働き方', question: null, style: 'DIRECT' },
      },
    });
    expect(value).toMatchObject({
      method: 'TAROT',
      consultation: '配置転換について考えたい',
      personalization: { participantProfile: { interest: '働き方', style: 'DIRECT' } },
    });
    expect(value).not.toHaveProperty('personalProfileRevision');
  });

  it('keeps generation available when no history exists', () => {
    const claimWithoutPersonalization = { ...claim };
    delete claimWithoutPersonalization.personalization;
    expect(fortuneReadingPromptInput(claimWithoutPersonalization)).toMatchObject({
      personalization: null,
      approvedBasic: { body: '承認済み本文' },
    });
  });

  it('keeps the prior action and its evaluation without sending the previous reading text or IDs', () => {
    const value = fortuneReadingPromptInput({
      ...claim,
      personalGuidance: true,
      personalProfileRevision: new Date('2026-09-27'),
      personalization: {
        ...claim.personalization,
        recentReadings: [
          { ...claim.personalization!.recentReadings[0]!, reflectionAnswer: 'TRIED_CHANGED' },
        ],
      },
    });
    expect(value.personalization?.recentReadings).toEqual([
      {
        actionStep: '考えてみましょう',
        feedbackRating: 'NOT_HELPFUL',
        feedbackIssue: 'TOO_VAGUE',
        reflectionAnswer: 'TRIED_CHANGED',
      },
    ]);
    expect(JSON.stringify(value)).not.toMatch(/reading-previous|memory-1|少し抽象的な前回結果/);
  });

  it('keeps a one-time consultation usable without loading prior readings', () => {
    const value = fortuneReadingPromptInput({
      ...claim,
      personalGuidance: true,
      consultation: '今日だけ相談したい',
    });
    expect(value).toMatchObject({
      consultation: '今日だけ相談したい',
      personalization: { recentReadings: [] },
    });
  });
});
