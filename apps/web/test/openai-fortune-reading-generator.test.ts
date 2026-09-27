import { describe, expect, it } from 'vitest';
import type { FortuneAiGenerationClaim } from '@bunshin/capability-fortune';
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
  it('passes only the scoped Bunshin profile and participant history to the prompt input', () => {
    expect(fortuneReadingPromptInput(claim)).toMatchObject({
      personalization: {
        bunshinProfile: { name: '細矢めぐみ', personalitySummary: '穏やかで具体的' },
        recentReadings: [
          {
            id: 'reading-previous',
            feedbackRating: 'NOT_HELPFUL',
            feedbackIssue: 'TOO_VAGUE',
          },
        ],
      },
    });
    expect(FORTUNE_AI_PROMPT_VERSION).toBe('fortune-daily-reading-v2-personalized');
  });

  it('keeps generation available when no history exists', () => {
    const claimWithoutPersonalization = { ...claim };
    delete claimWithoutPersonalization.personalization;
    expect(fortuneReadingPromptInput(claimWithoutPersonalization)).toMatchObject({
      personalization: null,
      approvedBasic: { body: '承認済み本文' },
    });
  });
});
