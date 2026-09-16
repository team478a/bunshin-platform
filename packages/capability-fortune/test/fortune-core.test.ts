import { describe, expect, it, vi } from 'vitest';
import {
  buildStandardFortuneKnowledgePack,
  drawTarotCard,
  FortuneDailyReadingService,
  FortunePolicyError,
  FORTUNE_ORIENTATIONS,
  FORTUNE_THEMES,
  parseFortuneKnowledgePack,
  parseFortuneTheme,
  TAROT_DECK,
  toJapanLocalDate,
  validateFortuneReadingOutput,
} from '../src';
import type { FortuneRepository } from '../src';

describe('fortune core', () => {
  it('defines one stable and complete 78-card deck', () => {
    expect(TAROT_DECK).toHaveLength(78);
    expect(new Set(TAROT_DECK.map((card) => card.code)).size).toBe(78);
  });

  it('draws the card and orientation from the supplied secure random source', () => {
    const values = [77, 1];
    const draw = drawTarotCard({ nextInt: () => values.shift()! });
    expect(draw).toMatchObject({
      card: { code: 'PENTACLES_KING' },
      orientation: 'REVERSED',
    });
  });

  it('rejects an invalid random implementation instead of biasing a draw', () => {
    expect(() => drawTarotCard({ nextInt: () => 78 })).toThrow(FortunePolicyError);
  });

  it('uses the date at request receipt in Japan', () => {
    expect(toJapanLocalDate(new Date('2026-09-16T14:59:59.000Z'))).toBe('2026-09-16');
    expect(toJapanLocalDate(new Date('2026-09-16T15:00:00.000Z'))).toBe('2026-09-17');
  });

  it('accepts only the three approved themes', () => {
    expect(parseFortuneTheme('LOVE')).toBe('LOVE');
    expect(() => parseFortuneTheme('MONEY')).toThrow(FortunePolicyError);
  });

  it('blocks deterministic claims and sales language', () => {
    expect(() =>
      validateFortuneReadingOutput({
        body: '絶対に成功します。',
        actionStep: '今すぐ契約してください。',
      }),
    ).toThrowError(/公開できません/);
  });

  it('accepts only a complete and unique 468-meaning knowledge pack', () => {
    const meanings = TAROT_DECK.flatMap((card) =>
      FORTUNE_ORIENTATIONS.flatMap((orientation) =>
        FORTUNE_THEMES.map((theme) => ({
          cardCode: card.code,
          orientation,
          theme,
          title: `${card.nameJa}のヒント`,
          body: '今日は自分の気持ちを落ち着いて見つめる日にしましょう。',
          actionStep: '今できる小さな行動を一つ書き出しましょう。',
        })),
      ),
    );
    expect(
      parseFortuneKnowledgePack({ promptVersion: 'basic-v1', meanings }).meanings,
    ).toHaveLength(468);
    expect(() =>
      parseFortuneKnowledgePack({ promptVersion: 'basic-v1', meanings: meanings.slice(1) }),
    ).toThrowError(/468件/);
    expect(() =>
      parseFortuneKnowledgePack({
        promptVersion: 'basic-v1',
        meanings: [...meanings.slice(0, -1), meanings[0]],
      }),
    ).toThrowError(/重複/);
    expect(() =>
      parseFortuneKnowledgePack({
        promptVersion: 'basic-v1',
        meanings: [{ ...meanings[0], title: '絶対に成功する日' }, ...meanings.slice(1)],
      }),
    ).toThrowError(/公開できません/);
  });

  it('provides a complete safe standard pack for an operator to review', () => {
    const pack = buildStandardFortuneKnowledgePack();
    expect(pack.promptVersion).toBe('fortune-standard-ja-v1');
    expect(pack.meanings).toHaveLength(468);
    expect(
      new Set(pack.meanings.map((item) => `${item.cardCode}:${item.orientation}:${item.theme}`))
        .size,
    ).toBe(468);
    expect(pack.meanings.every((item) => item.title.length > 0 && item.body.length > 0)).toBe(true);
  });
});

describe('daily fortune flow', () => {
  const basicReading = {
    id: 'reading-1',
    localDate: '2026-09-17',
    theme: 'LOVE' as const,
    cardCode: 'MAJOR_17',
    cardNameJa: '星',
    orientation: 'UPRIGHT' as const,
    status: 'READY_BASIC' as const,
    title: '希望を育てる日',
    body: '今日は小さな希望を大切にしましょう。',
    actionStep: '気持ちを一つ言葉にしましょう。',
    feedbackRating: null,
    feedbackIssue: null,
    createdAt: new Date('2026-09-17T00:00:00.000Z'),
  };

  it('returns the existing result without drawing again', async () => {
    const reading = {
      id: 'reading-1',
      localDate: '2026-09-17',
      theme: 'LOVE' as const,
      cardCode: 'MAJOR_17',
      cardNameJa: '星',
      orientation: 'UPRIGHT' as const,
      status: 'READY_BASIC' as const,
      title: '希望を育てる日',
      body: '今日は小さな希望を大切にしましょう。',
      actionStep: '気持ちを一つ言葉にしましょう。',
      feedbackRating: null,
      feedbackIssue: null,
      createdAt: new Date('2026-09-17T00:00:00.000Z'),
    };
    let randomCalls = 0;
    const repository = {
      findReadingForDate: () => Promise.resolve(reading),
    } as unknown as FortuneRepository;
    const service = new FortuneDailyReadingService(repository, {
      nextInt: () => {
        randomCalls += 1;
        return 0;
      },
    });

    await expect(
      service.draw({
        serviceSlug: 'fortune',
        actorUserId: 'user-1',
        theme: 'WORK',
        now: new Date('2026-09-16T15:30:00.000Z'),
      }),
    ).resolves.toEqual(reading);
    expect(randomCalls).toBe(0);
  });

  it('stores a safe AI result after the approved basic result is reserved', async () => {
    const aiReading = {
      ...basicReading,
      status: 'READY_AI' as const,
      body: '星の象徴を手がかりに、仕事で続けたいことを静かに見直してみましょう。',
      actionStep: '続けたいことを一つ書きましょう。',
    };
    let completed = false;
    const repository = {
      findReadingForDate: () => Promise.resolve(null),
      createBasicReading: () => Promise.resolve({ kind: 'READY', reading: basicReading }),
      claimAiGeneration: () =>
        Promise.resolve({
          workspaceId: 'workspace-1',
          groupId: 'group-1',
          bunshinId: 'bunshin-1',
          reading: basicReading,
        }),
      completeAiGeneration: () => {
        completed = true;
        return Promise.resolve(aiReading);
      },
      fallbackAiGeneration: () => Promise.resolve(basicReading),
    } as unknown as FortuneRepository;
    const service = new FortuneDailyReadingService(
      repository,
      { nextInt: () => 0 },
      {
        generate: () =>
          Promise.resolve({
            body: aiReading.body,
            actionStep: aiReading.actionStep,
            model: 'test-model',
            promptVersion: 'test-v1',
            inputTokens: 10,
            outputTokens: 20,
            latencyMs: 30,
          }),
      },
    );

    await expect(
      service.draw({ serviceSlug: 'fortune', actorUserId: 'user-1', theme: 'LOVE' }),
    ).resolves.toEqual(aiReading);
    expect(completed).toBe(true);
  });

  it('returns the approved basic result when AI output fails the safety check', async () => {
    let failureCode = '';
    const repository = {
      findReadingForDate: () => Promise.resolve(null),
      createBasicReading: () => Promise.resolve({ kind: 'READY', reading: basicReading }),
      claimAiGeneration: () =>
        Promise.resolve({
          workspaceId: 'workspace-1',
          groupId: 'group-1',
          bunshinId: 'bunshin-1',
          reading: basicReading,
        }),
      completeAiGeneration: () => Promise.resolve(null),
      fallbackAiGeneration: (input: { failureCode: string }) => {
        failureCode = input.failureCode;
        return Promise.resolve(basicReading);
      },
    } as unknown as FortuneRepository;
    const service = new FortuneDailyReadingService(
      repository,
      { nextInt: () => 0 },
      {
        generate: () =>
          Promise.resolve({
            body: '絶対に成功します。',
            actionStep: '今すぐ契約してください。',
            model: 'test-model',
            promptVersion: 'test-v1',
            inputTokens: 10,
            outputTokens: 20,
            latencyMs: 30,
          }),
      },
    );

    await expect(
      service.draw({ serviceSlug: 'fortune', actorUserId: 'user-1', theme: 'LOVE' }),
    ).resolves.toEqual(basicReading);
    expect(failureCode).toBe('AI_OUTPUT_REJECTED');
  });

  it('records the first visible result and saves only selected feedback', async () => {
    const viewed = { ...basicReading, feedbackRating: null };
    const rated = { ...viewed, feedbackRating: 'HELPFUL' as const };
    const markReadingViewed = vi.fn().mockResolvedValue(viewed);
    const submitFeedback = vi.fn().mockResolvedValue(rated);
    const repository = {
      findParticipant: () =>
        Promise.resolve({ id: 'participant-1', ageConfirmedAt: new Date('2026-09-01') }),
      findReadingForDate: () => Promise.resolve(basicReading),
      markReadingViewed,
      submitFeedback,
    } as unknown as FortuneRepository;
    const service = new FortuneDailyReadingService(repository, { nextInt: () => 0 });

    await expect(
      service.today({
        serviceSlug: 'fortune',
        actorUserId: 'user-1',
        now: new Date('2026-09-17T01:00:00.000Z'),
        recordView: true,
      }),
    ).resolves.toEqual({
      participant: { id: 'participant-1', ageConfirmedAt: new Date('2026-09-01') },
      reading: viewed,
    });
    expect(markReadingViewed).toHaveBeenCalledWith(
      expect.objectContaining({ readingId: 'reading-1', actorUserId: 'user-1' }),
    );

    await expect(
      service.feedback({
        serviceSlug: 'fortune',
        actorUserId: 'user-1',
        readingId: 'reading-1',
        rating: 'HELPFUL',
        issue: null,
      }),
    ).resolves.toEqual(rated);
    expect(submitFeedback).toHaveBeenCalledWith(
      expect.objectContaining({ rating: 'HELPFUL', issue: null }),
    );

    await expect(
      service.feedback({
        serviceSlug: 'fortune',
        actorUserId: 'user-1',
        readingId: 'reading-1',
        rating: 'HELPFUL',
        issue: 'TOO_VAGUE',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_FEEDBACK' });
    expect(submitFeedback).toHaveBeenCalledTimes(1);
  });
});
