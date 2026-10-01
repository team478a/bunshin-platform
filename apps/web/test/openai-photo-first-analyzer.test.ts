import { describe, expect, it, vi } from 'vitest';
import { weeklySocialGoalPlanningProfile } from '@bunshin/capability-social';
import { OpenAiPhotoFirstAnalyzer } from '../src/providers/openai-photo-first-analyzer';

const output = {
  analysis: {
    imageType: 'スタッフ写真',
    subjects: ['人物1名'],
    objects: ['鏡', '椅子'],
    scene: '明るい店内',
    visibleText: [],
    possibleContentAngles: ['働く人の視点'],
    qualityNotes: ['顔が明るい'],
    uncertainElements: ['人物名は不明'],
    safetyFlags: ['人物写真の掲載許可を確認'],
  },
  planning: {
    theme: 'スタッフの1日',
    angle: '仕事の流れ',
    recommendationReason: '採用目的に必要な働く姿が伝わるため',
    photoUsage: '冒頭の1枚として使う',
    imageEditPrompt: '明るさとホワイトバランスだけを自然に整える',
    confirmationQuestion: '写っている方の掲載許可はありますか？',
  },
};

const response = () =>
  new Response(
    JSON.stringify({
      model: 'gpt-5.2',
      usage: { input_tokens: 100, output_tokens: 80 },
      output: [{ content: [{ type: 'output_text', text: JSON.stringify(output) }] }],
    }),
    { status: 200 },
  );

function input(goal: 'BRAND_AWARENESS' | 'RECRUIT') {
  return {
    bytes: new Uint8Array([1, 2, 3]),
    mimeType: 'image/jpeg' as const,
    sourceNote: '開店前のスタッフ写真',
    company: {
      name: 'テスト美容室',
      objectiveSummary: '地域のお客様へ丁寧な施術を提供',
      audienceSummary: '初めての美容室に不安がある方',
      personalitySummary: '落ち着いた口調',
      businessProfile: { industry: '美容室', strength: 'カウンセリング' },
    },
    strategy: {
      goal,
      goalPlanning: weeklySocialGoalPlanningProfile(goal),
      concept: '不安を解消する',
      positioning: '地域密着',
      targetSummary: '初回客',
      ctaStrategy: goal === 'RECRUIT' ? '見学相談' : 'フォロー',
    },
    platform: 'INSTAGRAM',
    mission: { topic: '店内紹介', angle: 'はじめての方へ', reason: '不安解消' },
    recentPosts: [{ topic: 'スタッフ紹介', angle: '自己紹介' }],
  };
}

describe('OpenAiPhotoFirstAnalyzer', () => {
  it('sends a private stateless image with company, Goal and history context', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response());
    const result = await new OpenAiPhotoFirstAnalyzer({
      apiKey: 'test',
      model: 'gpt-5.2',
      fetch: fetcher,
    }).analyze(input('RECRUIT'));

    expect(result.analysis.uncertainElements).toContain('人物名は不明');
    expect(result.planning.recommendationReason).toContain('採用目的');
    const init = fetcher.mock.calls[0]?.[1] as RequestInit;
    if (typeof init.body !== 'string') throw new Error('expected JSON body');
    const sent = JSON.parse(init.body) as {
      store: boolean;
      input: Array<{
        content: string | Array<{ type: string; text?: string; image_url?: string }>;
      }>;
      text: { format: { type: string; strict: boolean } };
    };
    expect(sent.store).toBe(false);
    expect(sent.text.format).toMatchObject({ type: 'json_schema', strict: true });
    const userContent = sent.input[2]?.content;
    if (!Array.isArray(userContent)) throw new Error('expected multimodal user content');
    expect(userContent[1]?.image_url).toMatch(/^data:image\/jpeg;base64,/);
    expect(userContent[0]?.text).toContain('RECRUIT');
    expect(userContent[0]?.text).toContain('スタッフ紹介');
  });

  it('changes the planning context when only the SNS Goal changes', async () => {
    const requests: string[] = [];
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, init) => {
      requests.push(typeof init?.body === 'string' ? init.body : '');
      return Promise.resolve(response());
    });
    const analyzer = new OpenAiPhotoFirstAnalyzer({
      apiKey: 'test',
      model: 'gpt-5.2',
      fetch: fetcher,
    });
    await analyzer.analyze(input('BRAND_AWARENESS'));
    await analyzer.analyze(input('RECRUIT'));
    expect(requests[0]).toContain('会社・店舗を知る理由');
    expect(requests[1]).toContain('働く人と仕事の実像');
    expect(requests[0]).not.toBe(requests[1]);
  });

  it('instructs the model not to invent popularity, identity or sales facts', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response());
    await new OpenAiPhotoFirstAnalyzer({
      apiKey: 'test',
      model: 'gpt-5.2',
      fetch: fetcher,
    }).analyze(input('BRAND_AWARENESS'));
    const requestBody = fetcher.mock.calls[0]?.[1]?.body;
    const body = typeof requestBody === 'string' ? requestBody : '';
    expect(body).toContain('人気');
    expect(body).toContain('売上');
    expect(body).toContain('人物名');
    expect(body).toContain('断定をしません');
  });
});
