import { describe, expect, it, vi } from 'vitest';

const generate = vi.hoisted(() => vi.fn());
vi.mock('../src/providers/openai-learning-lesson', () => ({
  generateLearningStructured: generate,
}));

import {
  SIDE_HUSTLE_ROADMAP_SCHEMA,
  generateSideHustleRoadmap,
  sideHustleRoadmapBody,
  sideHustleRoadmapRevisionBody,
} from '../src/providers/openai-side-hustle-roadmap';

const valid = {
  reason: '無理のない順番にしました。',
  milestones: [
    {
      period: 'MONTH_1',
      title: '準備',
      outcome: '必要な情報を整理している',
      checkpoints: ['公式情報を確認する'],
      weeklyHours: 2,
    },
    {
      period: 'MONTH_2',
      title: '実践',
      outcome: '小さく試して記録している',
      checkpoints: ['自分で試す'],
      weeklyHours: 3,
    },
    {
      period: 'MONTH_3',
      title: '継続',
      outcome: '続け方を振り返っている',
      checkpoints: ['記録を見る'],
      weeklyHours: 3,
    },
  ],
};

describe('side-hustle roadmap provider', () => {
  it('sends the strict roadmap schema and the selected side hustle context', () => {
    const body = JSON.parse(
      sideHustleRoadmapBody({
        model: 'model',
        safetyPolicy: 'safety',
        instructions: 'instructions',
        selectedSideHustle: { name: '文章作成' },
        hearing: { freeText: { goal: '得意を活かす' } },
        excludedAreas: [{ label: '投資', reason: '対象外' }],
      }),
    ) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: 'model',
      store: false,
      text: {
        format: { name: 'side_hustle_roadmap', strict: true, schema: SIDE_HUSTLE_ROADMAP_SCHEMA },
      },
    });
    expect(JSON.stringify(body)).toContain('文章作成');
    expect(JSON.stringify(body)).toContain('得意を活かす');
    expect(JSON.stringify(body)).toContain('投資');
    expect(SIDE_HUSTLE_ROADMAP_SCHEMA.additionalProperties).toBe(false);
  });

  it('validates structured provider output with the answered weekly-hours limit', async () => {
    generate.mockResolvedValue(valid);
    const result = await generateSideHustleRoadmap({
      apiKey: 'key',
      model: 'model',
      provider: 'openai',
      modelCapabilities: [],
      body: '{}',
      weeklyHours: 3,
    });
    expect(result).toEqual(valid);
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ body: '{}', validate: expect.any(Function) }),
    );
    const options = generate.mock.calls.at(-1)?.[0] as { validate: (value: unknown) => unknown };
    expect(() =>
      options.validate({
        ...valid,
        milestones: valid.milestones.map((item) => ({ ...item, weeklyHours: 4 })),
      }),
    ).toThrow();
  });

  it('sends revision check-in facts but never practice answers, conversation, or exclusion keywords', () => {
    const body = sideHustleRoadmapRevisionBody({
      model: 'model',
      safetyPolicy: 'safety',
      instructions: 'instructions',
      selectedSideHustle: { name: '文章作成' },
      hearing: { freeText: { goal: '練習する' } },
      baseRoadmap: valid,
      fromPeriod: 'MONTH_2',
      checkin: { checkpointResults: ['PARTLY'], feeling: 'HARD', note: '負担を軽くしたい' },
      verifiedPracticeCount: 2,
      excludedAreas: [{ label: '投資', reason: '対象外' }],
    });
    expect(body).toContain('負担を軽くしたい');
    expect(body).toContain('PARTLY');
    expect(body).toContain('HARD');
    expect(body).not.toContain('practiceAnswerText');
    expect(body).not.toContain('conversationTranscript');
    expect(body).not.toContain('excludedKeywords');
  });
});
